# 工作区身份与展示名接入

在注册 Shaper Timeflow workspace、scope type 或首个 scope 前执行本流程。目标是得到
稳定、可复用的 `workspaceId`，并让 workspace 和 scope 在排障时都有业务人员能读懂的
名称。

## 1. 选择身份来源

按以下顺序解析，命中一项就停止：

```text
activity.json.activityId
  > Shaper 托管 Qoder 会话 projectId（作为 appId）
  > Shaper MCP project_context.appId
  > 经用户确认后生成的 ws_<32 位小写十六进制>
```

### 工作区 activity.json

先读取工作区根目录的 `activity.json`；脚本从当前目录、技能包上一级工作区和
`skills/shaper-timeflow` 安装布局的父级工作区依次查找。文件可读、根对象含非空字符串
`activityId`，且值是 1..64 个可见 ASCII 字符时，trim 后原样作为
`workspaceId`。不要改写前缀，也不要再查询 MCP。

文件不存在、JSON 坏、字段非字符串或值非法时，继续下一来源。

### Shaper 托管 Qoder 会话

在 Shaper 托管 Qoder 会话中，若会话上下文提供了 `projectId`，将它精确记为
`trusted projectId`，并将同一个值作为 `appId` 和 `workspaceId`。命中后不要调用
MCP `project_context`。

`projectId` 的兼容必须同时具备：

- 当前明确处于 Shaper 托管 Qoder 会话；
- 会话提供非空 `projectId`；
- 不依赖客户端 URL、body、localStorage 或普通项目目录中的同名字段。

### Shaper MCP

没有 activity 身份，且 Qoder 会话没有可用 `projectId` 时，调用：

```text
project_context({})
```

读取返回的 `appId`。若 MCP 响应同时包含 `projectId` 和 `appId`，以 `appId` 为准。
取得的 `appId` 直接作为 `workspaceId`，不增加或改写 `app_` 前缀。

### 非 Shaper 应用或全部来源不可用

生成候选 ID：

```text
ws_<32 lowercase hex characters>
```

生成后先展示候选 ID、身份文件和 workspace 展示名，不写文件。只有用户明确确认这个
精确候选后，才允许同时提供 `--confirm-generated`、`--display-name` 和 `--save`。
未确认的生成结果必须返回 `requiresConfirmation: true` 且 `saved: false`；
缺少任一确认参数时脚本失败，不会创建 `timeflow.json`。
后续必须复用已保存的 ID；不同配置不得被覆盖。

## 2. 持久化

非 Shaper 身份保存在工作区根目录 `timeflow.json`：

```json
{
  "workspaceId": "ws_0123456789abcdef0123456789abcdef",
  "displayName": "开心农场"
}
```

该文件只保存非敏感业务身份，不属于 `credentials.json`，不得写入浏览器 bundle。
解析脚本使用同目录临时文件、`fsync` 和原子替换；已有不同值时报冲突，不覆盖。

Shaper 应用不创建 `timeflow.json`，以 `activity.json.activityId` 或已核实的 MCP/Qoder
应用身份为准。

## 3. 展示名

workspace 和 scope 注册都必须提供展示名：

- workspace 示例：`开心农场`
- scope 示例：`农场玩家 1001`

workspace 和 scope 展示名都必须是业务可读名称（business-readable）。展示名 trim
后必须为 1..128 个字符，不含控制字符，至少包含一个 Unicode 字母，
不得等于对应 `workspaceId`、`scopeType` 或 `scopeId`，也不得是 UUID、ULID、哈希、
`app_*`、`ws_*` 或 `project-*` 形式的机器标识。

错误示例：

| 输入 | 原因 |
|---|---|
| `1001` | 只有数字，无法识别业务对象 |
| `player` | 重复 scopeType，未说明玩家或业务主体 |
| `app_f5f7c7dde7` | 机器标识，不适合人工排障 |
| `ws_0123456789abcdef0123456789abcdef` | 机器标识，管理台无法快速识别 |
| `   ` | trim 后为空 |

展示名只用于管理、排障和对外呈现，不参与身份、认证、授权或幂等比较。

## 4. 解析与注册命令

解析已确认身份：

```bash
python3 scripts/resolve-workspace.py
python3 scripts/resolve-workspace.py --qoder-session "$QODER_SESSION_ID" \
  --project-id "$PROJECT_ID"
python3 scripts/resolve-workspace.py --app-id "$APP_ID"
```

生成但未确认时只输出候选：

```bash
python3 scripts/resolve-workspace.py --generate
```

用户确认后持久化：

```bash
python3 scripts/resolve-workspace.py \
  --confirm-generated ws_0123456789abcdef0123456789abcdef \
  --display-name '开心农场' --save timeflow.json
```

注册 workspace、scope type 和 scope：

```bash
SHAPER_TOKEN=... python3 scripts/register-platform.py \
  --workspace app_f5f7c7dde7 --display-name '开心农场' \
  --scope-type player --scope-id 1001 \
  --scope-display-name '农场玩家 1001' \
  --request-id provision-farm-v1
```

脚本发出的 workspace 与 scope-type 请求都使用标准 `X-Shaper-Token`，并附带
`X-Workspace-Id`、`X-Protocol-Version`、独立 `X-Request-Id`、毫秒时间戳、
`X-Idempotency-Key` 和 HMAC。详细 canonical 和字段约束见
[bff-upstream-auth.md](bff-upstream-auth.md)；首次 workspace 初始化允许目标
尚未 active。

`--scope-display-name` 与 `--scope-id` 必须同时出现。缺少任一参数或展示名不可读时，
脚本在访问平台前以退出码 2 失败。
