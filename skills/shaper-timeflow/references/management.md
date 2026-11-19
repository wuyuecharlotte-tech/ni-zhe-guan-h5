# 任务、回执与生命周期

本文件只说明已发布的接入能力、权限边界和状态语义。未列出的内部接口不属于本 Skill
可调用范围。

## 1. 公开能力边界

| 能力 | 公开入口 | 权威权限 | 暴露边界 |
|---|---|---|---|
| 工作区任务启停/手动触发 | `/shaper/timeflow/v1/tasks/**` | 工作区服务 + `task:write` | 仅供受信后端；不暴露给玩家 BFF |
| 任务执行记录 | `/shaper/timeflow/v1/tasks/runs/**` | 工作区服务 + `task:read` | 受信工作区服务 |
| 工作区注册 | `POST /shaper/timeflow/v1/workspaces` | 受信接入身份 | 仅受信接入工具；不向玩家 BFF 暴露 |
| scope type 注册 | `POST /shaper/timeflow/v1/scope-types` | 受信接入身份 | 仅受信接入工具；注册后才开放对应 scope |
| scope 生命周期 | `/shaper/timeflow/v1/scopes/**` | 工作区服务 + `scope:lifecycle` | BFF/受信服务；浏览器不直连 |
| 变化事件回执 | `/shaper/timeflow/v1/change-deliveries/**` | subscriber 身份 | 只允许订阅者确认或拒绝已投递事件 |
| 时序投影 | `/shaper/timeflow/v1/{scopeType}/{scopeId}/projections` | `stream:read` | BFF 可只读暴露 |

## 2. 工作区与 scope type 注册

当平台尚未创建工作区或尚未开放 scope type 时，由受信接入方按以下顺序注册：

```text
POST /shaper/timeflow/v1/workspaces
  X-Workspace-Id: <workspaceId>
  X-Protocol-Version: 1
  X-Request-Id: <request trace>
  X-Timestamp: <epoch ms>
  X-Shaper-Token: <SHAPER_TOKEN>
  X-Idempotency-Key: <body requestId>
  X-Signature: <lowercase hex HMAC-SHA256>
  {workspaceId, displayName, kind, requestId}

POST /shaper/timeflow/v1/scope-types
  X-Workspace-Id: <workspaceId>
  X-Protocol-Version: 1
  X-Request-Id: <request trace>
  X-Timestamp: <epoch ms>
  X-Shaper-Token: <SHAPER_TOKEN>
  X-Idempotency-Key: <body requestId>
  X-Signature: <lowercase hex HMAC-SHA256>
  {workspaceId, scopeType, lockStrategy, settlePriority, enabled, requestId}

POST /shaper/timeflow/v1/scopes/register
  X-Shaper-Token: <SHAPER_TOKEN>
  X-Workspace-Id: <workspaceId>
  {scopeType, scopeId, displayName, requestId}
```

三个请求都必须提供 `SHAPER_TOKEN`，通过 `X-Shaper-Token` 发送，并用该 Token
计算 HMAC 签名。`trusted-passthrough` 只要求 Token 非空；未来真实 verifier
会校验合法性、workspace 与 scope，而请求格式不变。接入侧不得把 Token 用于
未授权身份或跨工作区访问。`requestId` 是稳定幂等键：同一键和同一规范化载荷返回原结果并标记
`replayed=true`；同一键搭配不同载荷返回 `IDEMPOTENCY_KEY_MISMATCH`。已有
workspace 或 scope type 的不同配置不会被静默覆盖，分别返回
`WORKSPACE_ALREADY_REGISTERED` 或 `SCOPE_TYPE_ALREADY_REGISTERED`。
`X-Request-Id` 是请求追踪 ID，会原样回传到 `ProtocolResponse.requestId`；它不是
幂等键。每次网络尝试应使用新的追踪 ID，重试时只保持 body 的 `requestId` 不变。

可执行的组合注册使用：

```bash
SHAPER_TOKEN=... python3 scripts/register-platform.py \
  --workspace workspace-a --display-name 'Workspace A' \
  --scope-type player --request-id provision-workspace-a-v1
```

注册脚本在发送任何控制面请求前执行本地校验；错误返回退出码 2，并输出结构化
`code`。约束与服务端注册领域对象一致：

| 字段 | 约束 |
|---|---|
| `workspaceId` | 1..64 个可见 ASCII 字符 |
| workspace `displayName` | 业务可读；去除首尾空白后 1..128 个字符，不含控制字符 |
| `kind` | 去除首尾空白后 1..32 个可见 ASCII 字符 |
| `scopeType` | `^[a-z][a-z0-9_]{0,31}$` |
| `lockStrategy` | `row`、`two-level` 或 `single-writer` |
| `settlePriority` | 0..255 的整数 |
| `requestId` | 1..64 个可见 ASCII 字符；重试保持稳定 |
| `scopeId` | 可选；1..20 位十进制，且不超过 `BIGINT UNSIGNED` |
| `scopeDisplayName` | 有 `scopeId` 时必填；业务可读，去首尾空白后 1..128 字符 |

租约持有者、认领持有者和结算日志节点列不是注册命令字段，也不接受技能传入。
它们由平台部署时的节点标识派生；该标识最多 32 个可见 ASCII
字符，与 `settlement_log.server_id` 的列宽一致。部署显式配置超限时服务启动失败，
不会静默截断或自动改写。

增加 `--scope-id` 时还会使用同一个 `SHAPER_TOKEN` 注册 scope。
脚本从环境变量读取；未设置时回退到技能工作区根目录（兼容技能目录）
的 `credentials.json.shaperToken`。请求头为 `X-Shaper-Token`：

```bash
SHAPER_TOKEN=... \
  python3 scripts/register-platform.py \
  --workspace workspace-a --display-name 'Workspace A' \
  --scope-type player --scope-id 1001 --scope-display-name '玩家 1001' \
  --request-id provision-workspace-a-v1
```

增加 `--scope-id` 时必须同时提供 `--scope-display-name`，例如
`--scope-display-name '玩家 1001'`。只传其中一个会在任何网络请求前失败。名称规则与
身份解析见 [workspace-onboarding.md](workspace-onboarding.md)。

`enabled=false` 可用于预先登记禁用策略；此时 scope 注册会继续返回
`SCOPE_TYPE_DISABLED`。定义中的 `scopeTypes` 只声明使用，不会自动创建或启用
scope type。注册通过业务唯一键和行锁串行化同一资源；不同资源的首注册不应被
全局锁互相阻塞。

## 3. 工作区任务控制

定义中的 `tasks[]` 是任务声明来源；当前没有独立的 `task_definition` 表。
激活定义后，运行态启停由平台保存，不能通过浏览器直接改写。

```text
POST /shaper/timeflow/v1/tasks/{taskKey}/enable
POST /shaper/timeflow/v1/tasks/{taskKey}/disable
POST /shaper/timeflow/v1/tasks/{taskKey}/trigger
GET  /shaper/timeflow/v1/tasks/runs?limit=50
GET  /shaper/timeflow/v1/tasks/runs/{runId}
```

- 所有调用携带 `X-Workspace-Id`；工作区只由 BFF 的部署映射派生。
- 所有调用使用标准 `X-Shaper-Token`、时间戳、HMAC、`X-Request-Id` 和适用的幂等头。
- 手动触发使用 `X-Idempotency-Key`，重试复用同一个 `runId`。
- 不要按客户端传入的 `workspaceId`、`scopeId` 或 `actorId` 赋权。
- 不允许玩家 BFF 转发任意任务、任意用户或任意工作区的控制请求。

## 4. 变化事件与订阅回执

结算提交后，平台写 `change_event` 和每个匹配订阅者的 `change_delivery`；
外部回调在事务提交之后执行。定义只能声明订阅身份和过滤条件：

```json
{
  "delivery": {
    "enabled": true,
    "mode": "shadow",
    "includeSourceStreams": true,
    "subscribers": [
      {
        "key": "ledger",
        "version": 1,
        "metrics": ["coin"],
        "eventKinds": ["settlement.completed"]
      }
    ]
  }
}
```

订阅者只使用公开回执协议：

```text
POST /shaper/timeflow/v1/change-deliveries/{deliveryId}/ack
POST /shaper/timeflow/v1/change-deliveries/{deliveryId}/nack
```

`deliveryId` 是下游幂等键。`eventDigest` 验证线上事件，`appliedDigest` 必须覆盖
下游实际应用的完整 change 集合，不能直接复用 `eventDigest`。`APPLIED` 必须有
应用摘要；`ACCEPTED` 表示最终 ACK。回调失败不能回滚已经完成的结算。

`SHADOWED` 表示平台只记录事件和 delivery，不调用外部目标。持续失败可能进入
`DEAD`，此时事实尚未确认应用，不能报告成功；不要自行创建同一变化事实的替代投递。

## 5. Scope 生命周期

当前公开、幂等的生命周期入口：

```text
POST /shaper/timeflow/v1/scopes/register
POST /shaper/timeflow/v1/scopes/{scopeType}/{scopeId}/freeze
POST /shaper/timeflow/v1/scopes/{scopeType}/{scopeId}/close
```

由受信 BFF 或工作区服务调用，要求 `scope:lifecycle`；每次状态迁移带稳定
`requestId`。合法状态为 `active`、`frozen`、`closed`；游客认领
`/api/timeflow/apps/{appId}/guest/claim` 仍是目标态，不能描述成当前可用路由。

- `freeze` 阻止新的权益分配，保留在飞结算和证据；用于解绑/撤销传播。
- `close` 为重试幂等：首次未成功可以在新的请求中安全重试，成功后再次请求返回
  可重放的关闭结果，重复关闭不得重新打开或恢复权益。
- `close` 保留历史证据，不能隐式物理删除结算或变化事件。
- 作用域所有权只由应用 BFF 的持久绑定证明；Timeflow scope 存在不等于某个用户拥有它。
- 用户换账号、重新绑定、作用域转移和删除映射必须显式审计，不能自动推断。

## 6. 只读 projection

```text
GET /shaper/timeflow/v1/{scopeType}/{scopeId}/projections
GET /shaper/timeflow/v1/{scopeType}/{scopeId}/stream/{streamKey}
```

读取使用 `stream:read`，不推进 `scope.last_settle_time`、不消费点事件，也不触发
结算。缺少 projection 时显示 `PROJECTION_UNAVAILABLE`；缺少历史时显示
`HISTORY_UNAVAILABLE`；不得静默补零。

有限实例已经终止时，`lifecycle.state=terminated` 且 `lifecycle.terminalAt`
可能早于整体 `effectiveAt`；时间轴以该终态时间截止，历史结算段和当前投影使用
同一截止，并保留当前值、历史结算和事件证据，不能向当前时间补零。
`drawEndReason` 用于区分 `RESOURCE_TERMINAL`、`TIME_CAP`、
`SCOPE_CLOSED` 和 `REQUESTED_END`；`lifecycleIssues` 明确报告无法安全裁剪的
旧历史段。`legacy_unknown` 不得被当作已确认终态。

## 7. 错误与边界

| 场景 | 处理 |
|---|---|
| 玩家 BFF 转发任意上游控制请求 | 拒绝；技能不提供该转发能力 |
| 浏览器携带工作区服务凭据 | 拒绝；服务凭据只存在可信后端 |
| 下游摘要不符 | 不写 `APPLIED`，返回可诊断错误 |
| scope 先解绑后冻结失败 | 不能报告撤销成功；保留可见的重试/告警状态 |

不要把工作区服务凭据、Cookie、HMAC 密钥或数据库凭据写进指导示例、
浏览器代码或日志。
