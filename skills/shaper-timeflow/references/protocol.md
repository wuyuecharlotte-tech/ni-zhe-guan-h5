# 协议参考

本文是安装即可使用的协议参考。
技能内置完整 BFF 所需协议快照位于 [schema/](schema/SHA256SUMS)，部署模式和路由
边界见 [bff-routes.md](bff-routes.md)。

## 通讯层

本节只描述可信服务到 Shaper Timeflow 的协议。正式浏览器必须先接应用隔离 BFF；
浏览器不得自行持有 Shaper Token 或计算 HMAC。身份与 BFF 接入见
[authentication.md](authentication.md)。

公网 Skill 协议面强制 X-Shaper-Token。下列所有请求头、时间窗、HMAC 和幂等规则都适用；
BFF 的身份、workspace/scope 绑定和动作授权仍必须保留。

- HTTPS 传输 JSON，编码为 UTF-8。
- 金额、速率和容量使用字符串十进制；时间戳是 UTC 毫秒。
- 每个请求必须发送 `X-Shaper-Token: <SHAPER_TOKEN>`、`X-Workspace-Id`、
  `X-Protocol-Version: 1`、`X-Request-Id`、`X-Timestamp` 和 `X-Signature`。
- `X-Request-Id` 每次尝试都变化；`X-Idempotency-Key` 在重试期间必须保持不变。
- 签名原文为 `METHOD\nPATH\nX-Timestamp\nX-Idempotency-Key\nBODY`；使用
  `SHAPER_TOKEN` 的 UTF-8 bytes 作为 HMAC-SHA256 密钥，输出小写十六进制。
  该协议只面向可信服务，不是浏览器接入方式。
- 单条 stream/window 上报的幂等头必须与请求体 `requestId` 相同；单条 point 上报必须与 `eventId` 相同。

当前 canonical 不包含 query；可信服务只调用固定、无 query 的协议路由。
新工作区不能把 `trusted-passthrough` 描述成真实 Token 验签。

## 当前 HTTP 路由

| 路由 | 用途 |
|---|---|
| `POST /shaper/timeflow/v1/definitions` | 提交不可变定义版本；需要 `definition:write` |
| `POST /shaper/timeflow/v1/definitions/{version}/validate` | 执行并持久化六组回放 |
| `POST /shaper/timeflow/v1/definitions/{version}/activate` | 激活已通过验证的定义 |
| `GET /shaper/timeflow/v1/definitions/{version}` | 查询定义状态与回放证据 |
| `POST /shaper/timeflow/v1/scopes/register` | 注册或幂等复用 scope；需要 `scope:lifecycle` |
| `POST /shaper/timeflow/v1/scopes/{scopeType}/{scopeId}/freeze` | 冻结 scope，停止新权益；需要 `scope:lifecycle` |
| `POST /shaper/timeflow/v1/scopes/{scopeType}/{scopeId}/close` | 关闭 scope 并保留历史证据；需要 `scope:lifecycle` |
| `POST /shaper/timeflow/v1/{type}/{id}/stream` | 上报单条流状态 |
| `POST /shaper/timeflow/v1/{type}/{id}/windows` | 上报单条时间窗修正 |
| `POST /shaper/timeflow/v1/{type}/{id}/points` | 上报单条点事件 |
| `POST /shaper/timeflow/v1/{type}/{id}/business-events` | 登记激活定义 `events[]` 声明的不可变业务事实；不直接改变结算输入 |
| `POST /shaper/timeflow/v1/{type}/{id}/stream/batch`、`windows/batch`、`points/batch` | 同作用域逐条批量上报 |
| `POST /shaper/timeflow/v1/events/batch` | 跨作用域批量事件 |
| `POST /shaper/timeflow/v1/{type}/{id}/settlements` | 触发同步结算 |
| `POST /shaper/timeflow/v1/{type}/{id}/settlements/async` | 触发长离线异步结算 |
| `GET /shaper/timeflow/v1/settlements/{settlementId}` | 拉取已完成报告 |
| `GET /shaper/timeflow/v1/settlements/async/{settlementId}` | 查询异步结算状态 |
| `POST /shaper/timeflow/v1/settlements/{settlementId}/ack` | 确认报告已落地 |
| `POST /shaper/timeflow/v1/settlements/{settlementId}/nack` | 报告落地失败并给出重试决定 |
| `POST /shaper/timeflow/v1/change-deliveries/{deliveryId}/ack` | 下游确认变化集合已应用 |
| `POST /shaper/timeflow/v1/change-deliveries/{deliveryId}/nack` | 下游拒绝变化或请求重试 |
| `POST /shaper/timeflow/v1/tasks/{taskKey}/enable`、`disable`、`trigger` | 启停或触发工作区自定义任务 |
| `GET /shaper/timeflow/v1/tasks/runs`、`GET /shaper/timeflow/v1/tasks/runs/{runId}` | 查询任务执行记录 |
| `GET /shaper/timeflow/v1/{scopeType}/{scopeId}/projections` | 读取 scope 的只读投影；每个 stream 含可解释 trace |
| `GET /shaper/timeflow/v1/{scopeType}/{scopeId}/stream/{streamKey}` | 读取单条流的只读投影与 trace |

工作区和 scope type 是受控接入资源，使用产品公开前缀：

```text
POST /shaper/timeflow/v1/workspaces
  X-Workspace-Id: <workspaceId>
  X-Protocol-Version: 1
  X-Request-Id: <request trace>
  X-Timestamp: <epoch ms>
  X-Shaper-Token: <SHAPER_TOKEN>
  X-Idempotency-Key: <body requestId>
  X-Signature: <lowercase hex HMAC-SHA256>

POST /shaper/timeflow/v1/scope-types
  X-Workspace-Id: <workspaceId>
  X-Protocol-Version: 1
  X-Request-Id: <request trace>
  X-Timestamp: <epoch ms>
  X-Shaper-Token: <SHAPER_TOKEN>
  X-Idempotency-Key: <body requestId>
  X-Signature: <lowercase hex HMAC-SHA256>
```

两条路由与普通协议使用完全相同的 Token、时间戳、HMAC 和幂等链。首次 workspace
初始化允许目标 workspace 尚未存在；`/scope-types` 则在业务服务中要求父
workspace 已激活。
`X-Request-Id` 每次请求都必须存在并原样出现在响应中，方便跨日志追踪；每次网络
尝试应生成新的追踪 ID，请求体的 `requestId` 才在重试期间保持不变并承担幂等重放
语义。

完整 Header/Body 参数、canonical 示例、各项长度/默认值和错误语义见
[bff-upstream-auth.md](bff-upstream-auth.md) 与
[workspace-onboarding.md](workspace-onboarding.md)。

异步提交返回 `async=true`、`settlementId` 和一个可为 `null` 的报告占位。查询异步状态时，
`data:null` 表示尚未完成，继续有界轮询；只有完整报告返回后，才进入本地落地和报告 ACK。

任务运行记录、订阅回执、scope 生命周期和 projection 的边界见
[management.md](management.md)。`/shaper/timeflow/v1/tasks/**` 属于工作区控制，
不得暴露给玩家 BFF。

接入说明、schema 和公开路由必须全部进入安装快照并通过平台验证，
再核对路径与请求体；普通接入方以平台返回结果为准。

projection 的 `stream[].lifecycle / trace / traceEvents / traceSummary` 属于只读解释字段：

- `lifecycle` 是资源实例事实，包含 `kind / state / terminalAt / terminalReason /
  terminalPhaseIndex / terminalValue / terminalEventId`。首次终态由定义相位或合法
  transition 决定，由平台持久化；后续结算、回放和恢复不能改写。
- `state=terminated` 时以 `terminalAt` 为资源级截止；历史结算段与当前投影必须使用
  同一截止。`legacy_unknown` 表示旧数据无法确认终态时间，不得推测或补画。
- 容量封顶、时间封顶、作用域关闭和 `SET 0` 都不是资源终态。
- `trace[]` 是同一投影内核输出的连续积分段，含 phase、有效速率、window 修正、
  `produced / capped / netChange` 和内核直接给出的 `valueStart / valueEnd`；
- `traceEvents[]` 标注窗口、检查点、点事件、phase 与时间封顶切点；
- `traceSummary` 汇总该 stream 的起止、投影终值和 approximated/truncated 状态；
  点事件的变化单独计入 `traceEvents[].netChange`。
- `traceEvents[].eventTime` 必须位于该 stream 的
  `[traceSummary.from, traceSummary.to]` 内；trace 和切点不得超出流级范围。
- 对 `finite` 流，进入终止 phase 后 `traceSummary.to` 截止到权威 `terminalAt`，
  可以早于整个 projection 的 `effectiveAt`。客户端应以该流级截止点标注生命周期
  结束，不能只凭 `baseRate=0` 推断终止。
- `SET 0` 只改变当前值，不会让同一 `streamKey` 的有限实例复活；如果该实例仍是
  非终止 phase，它可以继续投影，新周期则应使用新的 `streamKey`。
- `continuous` 流以及尚未进入终态的 finite 流继续投影到正常有效终点。

它们不构成新的 timeline 服务或持久化时序表，也不推进 `scope.last_settle_time`。
客户端不得在 trace 缺失时用 BFF 业务值或历史报告值伪造平台曲线。

结算报告与通用变化事件是两条交付链：

- `/shaper/timeflow/v1/settlements/{settlementId}` + ACK/NACK 确认**报告**已落地；
- `change_event` → `change_delivery` 将每个订阅者需要的指标变化投递到
  in-process 函数、本地 JAR 或云函数；
- delivery ACK 的 `appliedDigest` 必须覆盖事件中的全部 changes，但不表示平台
  保存下游余额。

定义里的 subscriber 只引用 `key/version`、`metrics` 和 `eventKinds`。具体的
in-process handler、HTTPS endpoint、JAR artifact/class、secret 引用、超时、重试与
并发上限由部署侧配置，不能写进定义 body；接入方只需按公开回执协议处理
`change-delivery`。

## 错误处理

原样使用响应中的 `error.code`、`error.retryable`、`error.retryAfterMs` 和 `requestId`。
优先遵循服务端 `retryable`；该字段缺失或不可信时才默认不可重试。传输超时只有在操作幂等时才可以重试。

## 客户端入口

- TS/JS：包根 `@hupu/shaper-timeflow-protocol-sdk`；testkit 使用 `/testkit`
  子路径。技能安装包已带可直接引入的 `sdk/typescript`。
- Java：`com.hupu.shaper.timeflow.sdk.client.ProtocolClient`，配合
  `ClientOptions` 与调用方实现的 `HttpTransport`。
- 规则：`com.hupu.shaper.timeflow.rulesdk.Rule` 与 `LocalReplayRunner`。
- Java 协议、规则 SDK 和 testkit 的可分发 JAR 位于技能 `sdk/`，坐标见
  `sdk/MANIFEST.json`。
- 黄金报告检查：Java `ReportComparator` 与 TS `/testkit` 子路径。

不要手改生成的 DTO。
