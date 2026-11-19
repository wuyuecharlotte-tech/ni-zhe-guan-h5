---
name: shaper-timeflow
description: 当用户要做玩家离线后仍持续演进的成长玩法时使用，例如放置养成、体力恢复、作物成熟、资源生产或定时阶段变化，并希望在玩家回归时按离开时长结算收益和进度。也适用于补算、重复领取、断线续算和结算结果不一致这类问题；不用于只保存进度的云存档、实时多人同步或现金收益结算。
metadata:
  short-description: "为放置养成、体力恢复、作物成熟和长离线补算结算收益"
---

# Shaper Timeflow 使用指南

本技能默认作为独立安装能力运行，只依赖自身目录和 Python 标准库。它覆盖：

1. **工作区接入**：定义资源、流模式、容量上限和合法的解释器定义。
2. **规则变更**：新增或修改相位、衰减，并通过规则 SDK 与平台回放验证行为。
3. **结算排障**：检查协议响应、报告、`change_event`/`change_delivery` 和回执状态。
4. **认证与 BFF 接入**：区分终端用户、游客、工作区服务和作用域所有权；
   生产统一走“应用 BFF/受信服务 -> X-Shaper-Token -> 公网 Timeflow 协议端点”，
   见 [references/bff-upstream-auth.md](references/bff-upstream-auth.md)。
5. **直接 SDK 引入**：技能内已带 TypeScript/JavaScript、Java 协议、规则
   SDK 和 testkit 的 `0.0.1` 产物，安装说明见 [sdk/README.md](sdk/README.md)。
6. **任务、回执与生命周期**：任务控制、运行记录、订阅回执、scope
   生命周期和只读 projection 的权限边界见
   [references/management.md](references/management.md)。
7. **工作区与 scope type 注册**：使用服务端配置的标准 `X-Shaper-Token` 调用
   `POST /shaper/timeflow/v1/workspaces` 和 `POST /shaper/timeflow/v1/scope-types`，再以工作区
   服务端的 `SHAPER_TOKEN` 注册 scope。组合命令是
   `python3 scripts/register-platform.py`。

> **状态边界**：Skill 可指导生产 BFF 设计，但不是可直接部署的 BFF 模板。
> 公网只承载 Skill 需要的 Timeflow 协议接口；生产调用统一使用 X-Shaper-Token；当前 verifier 的验证强度以部署配置为准。
> `trusted-passthrough` 是显式过渡 verifier，不能描述成真实 Token 验签。
> scope register/
> freeze/close 已有公开接口；identity resolve 仍是目标态，生产游客会话和游客 claim 也仍属
> 目标态，不能按已上线能力接入。

所有操作必须经过平台协议。技能不得连接 MySQL、绕过 HTTP 或引用 server 内部类。

## 先选接入形态

在生成定义或写调用代码前，先按需求选定一行；没有明确证据时不要自行补一条通路上线。

| 决策 | 需求 | 采用 | 不要这样做 |
|---|---|---|---|
| `D1` | 同源部署的登录 H5 | 应用级 BFF，使用 X-Shaper-Token 调用公网 Timeflow 端点 | 浏览器直连、浏览器持有 `SHAPER_TOKEN` 或自报 `workspaceId` |
| `D2` | 已有可信 HTTP 后端 | 该后端承载隔离 BFF，再使用 X-Shaper-Token 调用公网端点 | 把 BFF 做成任意上游代理 |
| `D3` | 匿名试玩或游客升级 | 仅按目标态设计，生产 guest session/claim 先阻断 | 把本地 demo 会话当作生产能力 |
| `D4` | 设置资源初值或当前状态 | `stream`，带稳定 `requestId` | 用点事件替代完整流初始化语义 |
| `D5` | 修正一段时间内的速率或容量 | `windows`，时间使用 UTC 毫秒 | 在业务规则里重复实现时间窗 |
| `D6` | 单点值变化或前向 phase transition | `points`，带稳定 `eventId` | 用 `business-events` 改写结算状态 |
| `D7` | 不可变业务事实、审计或时间轴证据 | 先在 `events[]` 声明 kind，再调用 `business-events` | 把所有业务动作塞进 `points` |
| `D8` | 同步可完成的结算 | `settlements`，核对完整报告后再 ACK | 仅凭提交成功认定业务效果 |
| `D9` | 长离线或异步结算 | 提交后轮询；`data:null` 继续等待 | 把空结果当完成或零收益 |
| `D10` | 声明式 phase/decay 已能表达规则 | 解释器定义 | 为简单规则引入自定义 SDK |
| `D11` | 声明式规则无法表达计算 | SPI Rule SDK | 绕过定义、回放和平台 validate |
| `D12` | 资源变体有稳定、不同的基础速率 | 分别声明 `streamPattern`、`ruleKey`、`phases`，以 `baseRate` 表达；临时修正仍用 `windows` | 用初始 `rate` 分流基础速率，或用长期窗口伪装另一资源类型 |

`D12` 是默认建模策略；平台仍只按 `streamKey` 匹配定义。共享基础速率并使用临时
窗口的方案仍然合法；资源 value、rate、capacity 必须采用明确且一致的业务刻度。
术语、公式、示例和迁移顺序见
[references/definition-schema.md](references/definition-schema.md)。

状态效果与业务事实分开记录。完成 `windows` 或 `points` 后，开发者应判断是否还需
以 `business-events` 记录事实；无明确消费需求时可不报。候选判断、项目事件契约、
时间/标识语义和可靠性见 [references/event-modeling.md](references/event-modeling.md)。

完成实现前，至少保留平台 validate 结果、首次结算或轮询结果，以及身份、scope
和幂等证据。不要只报告“接口已写”或“代码已完成”。

生产接入只有一条链路：

```text
Browser -> application BFF -> X-Shaper-Token public Timeflow endpoint
```

应用 BFF 仍负责用户/游客身份、应用/环境到工作区绑定、actor 到 scope 绑定和
动作授权；服务 Token/HMAC 只在可信服务端。

## SDK 产物

安装模式直接使用技能内的 `sdk/`：

- TS/JS：`sdk/typescript`，包名为
  `@hupu/shaper-timeflow-protocol-sdk`；
- Java：`sdk/java/`、`sdk/rule-sdk/`、`sdk/testkit/` 下的三个 JAR；
- 坐标、版本与完整性见 `sdk/MANIFEST.json` 和 `sdk/SHA256SUMS`。

不要从外部源码或构建目录取文件。技能内产物是当前 `0.0.1` 可分发版本；
完整性清单见 `sdk/MANIFEST.json` 与 `sdk/SHA256SUMS`。

## 接入命令

生成定义、结构预检和报告检查可独立运行。所有命令以本 `SKILL.md` 所在目录为工作目录：

```bash
python3 scripts/generate-definition.py --workspace workspace-a --metric coin \
  --pattern 'crop:{id}' --rule growth --out definition.json
python3 scripts/check-definition.py definition.json
python3 scripts/inspect-settle.py --report report.json
```

`check-definition.py` 的默认结果只是零依赖 **schema preflight**。它会执行技能快照
的 JSON Schema 结构约束和少量本地跨字段检查，但不替代平台业务校验与回放。
输出 `schema preflight passed` 不代表定义可以激活。

平台 `POST /shaper/timeflow/v1/definitions/{version}/validate` 是完整回放与激活前
唯一的权威门禁。

## 平台地址

生产平台的默认地址是 `https://relay.hupu.com`。需要调用平台 HTTP API 或运行
SDK 接入示例时，使用 `TIMEFLOW_BASE_URL` 覆盖该默认值；测试时不应修改技能
文档或示例源码，只需显式设置环境变量：

```bash
export TIMEFLOW_BASE_URL=https://relay.hupu.com
```

`TIMEFLOW_BASE_URL` 只包含协议、域名和可选端口，不包含
`/shaper/timeflow/v1` 路径。浏览器仍只能访问应用 BFF，不得使用该地址直连平台。
注册脚本采用同一约束；脚本会拒绝带路径的
base URL，避免把控制面地址拼接成错误路径。

## 工作流 1：工作区接入

1. 先阅读 [references/workspace-onboarding.md](references/workspace-onboarding.md)，
   使用 `python3 scripts/resolve-workspace.py` 解析稳定的 `workspaceId`：
   `activity.json.activityId` 优先；Shaper 托管 Qoder 会话的 `projectId` 次之，并跳过
   MCP；随后使用 MCP `project_context.appId`；全部不可用时生成候选并等待用户确认。
2. 确认工作区已注册；若尚未注册，使用 `scripts/register-platform.py`，并先阅读
   [references/management.md](references/management.md) 的注册顺序和凭据边界。
   注册 workspace 和 scope 时必须分别提供业务可读的 `--display-name` 与
   `--scope-display-name`。
3. 阅读 [references/authentication.md](references/authentication.md) 和
   [references/bff-routes.md](references/bff-routes.md)，确定正式浏览器
   通过哪个 BFF 接入；不要把 `SHAPER_TOKEN` 放进浏览器。
4. 阅读 [references/definition-schema.md](references/definition-schema.md)。
5. 根据工作区的资源、流模式和规则生成定义 JSON。
   按 D12 判断基础速率分流，临时加减速使用 `windows`。
6. 金额、速率和容量全部使用字符串十进制；运行 `python3 scripts/check-definition.py`。
7. 提交 `POST /shaper/timeflow/v1/definitions`。
8. 调用 `POST /shaper/timeflow/v1/definitions/{version}/validate`，只有平台返回六组场景全部通过后才可激活。
9. 调用 `POST /shaper/timeflow/v1/definitions/{version}/activate`。

可用 `python3 scripts/generate-definition.py` 生成保守骨架，但必须替换所有工作区/玩法
相关值，并人工复核容量上限。完整业务门禁以平台 validate 为准。

## 工作流 2：新增流或规则

1. 阅读 [references/rule-development.md](references/rule-development.md)。
2. 新增 `ruleVersion`；不得修改已有版本背后的语义。
3. 规则必须保持纯函数：不读取系统时钟，不做 IO、网络、数据库访问，不使用未固定随机源。
4. 运行 Java 规则 SDK 测试与平台回放。
5. 在评审中说明规则版本升级和相位迁移对存量作用域、历史窗口与重放结果的影响。

## 工作流 3：回放验收

平台 validate 是安装后的权威入口，必须报告六组固定场景：`1h`、`1d`、`30d`、
`window`、`segment-equivalence`、`receipt-replay`。非零退出或 `passed:false` 都是阻断项。

开发者提供黄金报告时，用 testkit 比较，不要手工重算。

规则 SDK 的 SPI 和签名见 [references/rule-development.md](references/rule-development.md)；
接入方自行编译并以平台 validate 的结果作为权威回放证据。

## 工作流 4：结算排障

1. 阅读 [references/troubleshooting.md](references/troubleshooting.md)。
2. 判断响应是 `ok:false`、可重试错误，还是成功报告。
3. 遇到 `NEED_RESUME` 时报告返回的 cursor，不得声称本次已写入状态。
4. 报告已投递但未回执时，先核对报告内容与 ACK/NACK 状态，再决定是否重投。
5. 下游未收到变化时，先查 `change_event` 是否生成，再按 subscriber 查看
   `change_delivery` 的 `READY/CLAIMED/ACCEPTED/APPLIED/RETRY/DEAD/SHADOWED`。
6. 使用 `python3 scripts/inspect-settle.py --report report.json` 或文档化 HTTP API；
   不得直接查询平台数据库。

需要核对字段、请求头、路由或错误处理时，阅读
[references/protocol.md](references/protocol.md)。SDK 与 HTTP 示例见
[references/usage-examples.md](references/usage-examples.md)。

## 工作流 5：工作区任务与生命周期

1. 先判断操作属于工作区服务还是订阅者；玩家 BFF 不提供任意上游代理能力。
2. 工作区任务只使用 `/shaper/timeflow/v1/tasks/**`。
3. 订阅者只使用 `/shaper/timeflow/v1/change-deliveries/**` 的 ACK/NACK。
4. scope 生命周期使用公开 `/shaper/timeflow/v1/scopes/**` 并保留幂等 `requestId`；
   所有权仍只能由应用 BFF 证明。
5. 只读 projection 和时间线不得推进结算、消费点事件或伪造缺失历史。
6. finite 流终止后以服务端 `lifecycle.state=terminated` 和
   `lifecycle.terminalAt` 作为流级截止点；不要仅凭 `baseRate=0` 推断终止，
   也不要用同一 `streamKey` 复活终态。`legacy_unknown` 不得推测终态时间；
   `SET 0`、容量封顶、时间封顶和作用域关闭本身都不等于资源终态。

完整路由、权限和状态规则见 [references/management.md](references/management.md)。

## 安全与边界

- 不得自行推断可重试性；优先保留服务端 `error.retryable`，字段缺失或不可信时才默认不可重试。
- 不得生成或决定结算的 `from`/`to`；权威区间归平台所有。
- 正式浏览器不得持有或计算 `SHAPER_TOKEN`/HMAC；可信服务从安全配置读取，不能分享或记录。
- 用户身份、游客身份、作用域所有权和工作区服务 scope 是四层独立判断，任何一层都不能省略。
- `applicationId` 与 `workspaceId` 可以同值但不能混义；应用/环境到工作区必须持久映射。
- 只有验签后的网关身份或 Game Token 才能作为用户输入；客户端传来的 scope 和 workspace 不具权威性。
- 不得通过 SQL 修改服务端状态。
- 不得声称移动原生客户端使用 TS SDK；应按其技术栈实现协议，或使用适用的 Java SDK。
