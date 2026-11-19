# BFF 接入契约

**状态：生产契约基线。** 公网只承载 Skill 需要的 Timeflow 协议接口，生产 BFF
统一使用 X-Shaper-Token 访问公网端点。完整上游认证链见
[bff-upstream-auth.md](bff-upstream-auth.md)。

唯一生产链：
`Browser -> application BFF -> X-Shaper-Token public Timeflow endpoint`。

## 1. 信任边界

```text
Browser
  -> application BFF
       authenticate actor
       derive application/environment/workspace
       authorize action and scope ownership
  -> X-Shaper-Token public Timeflow endpoint
  -> /shaper/timeflow/v1/**
```

BFF 必须独立执行用户/游客、应用与环境、工作区、scope 归属和动作授权判断。
服务调用方身份由 X-Shaper-Token verifier 判断，不能证明用户拥有某个 scope，不证明用户拥有某个 scope。浏览器不得获得
`workspaceId`、内部 scope ID、`SHAPER_TOKEN`、HMAC 密钥或完整上游响应 body。

## 2. 唯一生产接入模型

| 场景 | 生产接入 | 必须保留的授权 |
|---|---|---|
| 同源 H5 | 应用级 BFF -> X-Shaper-Token 公网端点 | 用户身份、应用/工作区绑定、actor/scope 绑定、动作、限流 |
| 已有可信 HTTP 后端 | 隔离 BFF 模块 -> X-Shaper-Token 公网端点 | 与同源 H5 相同 |
| 匿名试玩 | 目标态 guest session/claim -> BFF -> X-Shaper-Token 公网端点 | 游客会话、临时 scope 绑定、动作和上限；当前未上线 |

网络位置不是生产默认信任依据；所有上游 Skill 调用都
使用显式 `X-Shaper-Token`、时间戳和 HMAC。

## 3. BFF 显式路由

路由同时决定用户动作、允许的上游方法/路径、幂等键来源和是否可向浏览器暴露。
未列路由、未知 action、未绑定 scope 和禁止字段一律失败关闭。

| 浏览器路由（`/api/timeflow/apps/{appId}` 后） | 用户动作 | 上游方法与路由 | 幂等键来源 |
|---|---|---|---|
| `POST /stream` | `stream:write` | `POST /shaper/timeflow/v1/{scopeType}/{scopeId}/stream` | body `requestId`，重试保持不变 |
| `POST /windows` | `stream:write` | `POST /shaper/timeflow/v1/{scopeType}/{scopeId}/windows` | body `requestId`，重试保持不变 |
| `POST /points` | `point:write` | `POST /shaper/timeflow/v1/{scopeType}/{scopeId}/points` | body `eventId`，重试保持不变 |
| `POST /business-events` | `event:write` | `POST /shaper/timeflow/v1/{scopeType}/{scopeId}/business-events` | body `eventId`，重试保持不变 |
| `POST /settlements` | `settle:trigger` | `POST /shaper/timeflow/v1/{type}/{id}/settlements` | 服务端生成/绑定的稳定逻辑键 |
| `POST /settlements/async` | `settle:trigger` | `POST /shaper/timeflow/v1/{type}/{id}/settlements/async` | 服务端生成/绑定的稳定逻辑键 |
| `POST /settlements/{settlementId}/ack` | `settle:ack` | `POST /shaper/timeflow/v1/settlements/{settlementId}/ack` | `settlementId` |
| `POST /snapshot` | `stream:read` | `GET /shaper/timeflow/v1/{scopeType}/{scopeId}/projections` | 只读，无需写幂等键 |
| `POST /snapshot/save` | `stream:write` | BFF 应用状态持久化；平台读取走 projection | body `expectedRevision` + 服务端 epoch |

表中的用户动作是应用 BFF 的授权策略名，不是 Timeflow 服务 Token scope。
平台 scope 由服务 Token verifier 给出，不能由 BFF 用户动作推导。

定义、任务和订阅回执属于可信服务能力，不是玩家 BFF 路由。任意通配代理、
浏览器选择上游路径、直接转发定义或任务控制都必须拒绝。

## 4. 转发与重试

```text
browser route
  -> authenticated actor
  -> active application/environment/workspace binding
  -> active actor/scope binding
  -> allowed action
  -> bounded request fields
  -> explicit upstream route
```

- `workspaceId`、`scopeType` 和 `scopeId` 只由 BFF 持久映射与部署配置派生。
- 浏览器不得通过 query、body 或 header 选择上游；不得追加任意 query。
- 相同逻辑重试复用相同幂等键和字节相同的 UTF-8 JSON payload；
  `X-Request-Id` 每次网络尝试独立生成。
- 上游超时或结果未知时，不自动报告成功；只有已知幂等操作才可重试。
- 用户/游客和应用限流必须在共享存储中执行，不能只保存在函数实例内存。
- 上游错误保留 `error.code`、`error.retryable` 和 `error.retryAfterMs`；
  缺失或不可信时才默认不可重试。

## 5. 身份、游客和持久绑定

| 记录 | 权威来源 | 不得作为归属证明 |
|---|---|---|
| 应用/环境到工作区 | BFF 持久绑定 | `appId` 前缀、浏览器 body、域名推断 |
| actor 到 scope | BFF 持久绑定 | Game Token 验签成功、scope 在平台存在、设备/IP/昵称 |
| 游客会话 | BFF 持久 token hash 与状态 | 浏览器匿名 UUID、可修改的“已登录”标志 |
| 平台用户身份 | 可信网关身份或经平台验签解析的 Game Token | `sub`、`puid`、`customUserId` 直接等同 `users.id` |

游客会话应只保存 token hash，具有过期、撤销和显式 claim；claim 重复请求必须幂等。
已有正式 scope 时返回 `SCOPE_ALREADY_BOUND`，不得自动合并业务数据。
生产 guest session/claim 当前仍是目标态。

## 6. Scope 生命周期与身份解析

工作区和 scope type 的 provisioning 使用公网协议路径，并进入与普通协议相同的
`X-Shaper-Token`、时间戳、HMAC 和幂等链。首次 workspace 初始化允许目标
workspace 尚未存在，但不允许省略认证。

| 动作 | 请求 | 响应 | 状态/副作用与实现状态 |
|---|---|---|---|
| register | `POST /shaper/timeflow/v1/scopes/register`；body `{scopeType, scopeId, displayName, requestId}` | `{scopeType, scopeId, state: "active", replayed}` | 新建或复用一致 scope；记录创建/复用审计 |
| freeze | `POST /shaper/timeflow/v1/scopes/{scopeType}/{scopeId}/freeze`；body `{reasonCode, requestId}` | `{scopeType, scopeId, state: "frozen", replayed}` | `active → frozen`；停止新增权益，允许已生成证据投递 |
| close | `POST /shaper/timeflow/v1/scopes/{scopeType}/{scopeId}/close`；body `{requestId}` | `{scopeType, scopeId, state: "closed", replayed}` | `active/frozen → closed`；保留历史证据；重复关闭幂等 |
| guest claim | `POST /api/timeflow/apps/{appId}/guest/claim`；body `{guestToken, requestId}` | `{claimed: true, replayed}` | 目标态；不返回内部 scope 或 workspace |
| identity resolve | 目标态 `POST /internal/identity/resolve`；body `{identitySource, credential, applicationId, environmentId}` | `{platformUserId, userStatus, applicationId, environmentId}` | 目标态；解析结果不授予 scope 所有权 |

预期状态迁移：

```text
scope: active -> frozen -> closed
scope: active -> closed
guest: active -> claimed | revoked | expired
```

冻结或关闭后，同步结算、异步消费者和恢复扫描都不能产生新权益。作用域所有权
只由应用 BFF 的持久绑定证明。

## 7. 生命周期与身份错误

| 错误 | HTTP | 含义/重试性 |
|---|---:|---|
| `AUTH_REQUIRED` | 401 | 身份缺失或无效；不可重试 |
| `ACCOUNT_SUSPENDED` | 403 | 平台用户不可用；不可重试 |
| `APP_NOT_AUTHORIZED` | 403 | 应用/环境/工作区绑定无效；不可重试 |
| `SCOPE_NOT_BOUND` | 403 | actor 未绑定目标 scope；不可重试 |
| `SCOPE_ALREADY_BOUND` | 409 | 正式归属冲突；不可重试 |
| `GUEST_SESSION_INVALID` | 401 | 游客会话过期/撤销/已用；不可重试 |
| `FORBIDDEN` | 403 | 动作不被允许；不可重试 |
| `RATE_LIMITED` | 429 | 共享限流；按 `Retry-After` |
| `UPSTREAM_UNAVAILABLE` | 503 | 结果未知或上游不可用；仅幂等调用可重试 |
| `SCOPE_LIFECYCLE_INVALID` | 409 | 非法迁移；不可重试 |
| `SCOPE_LIFECYCLE_FROZEN` | 409 | 作用域已冻结/关闭，拒绝新权益；不可重试 |
| `IDEMPOTENCY_KEY_MISMATCH` | 409 | 同 key 不同 payload；不可重试 |
| `SCOPE_UNKNOWN` | 404 | scope 注册前不可处理请求；不可重试 |

响应不得包含工作区凭据、内部 scope 所有权细节、原始 Token、Cookie、签名或完整上游 body。

## 8. Schema 覆盖

| 契约 | 安装快照 | 用途 |
|---|---|---|
| `definition.schema.json` | 必须有 | 定义提交、校验与激活 |
| `stream-update.schema.json` | 必须有 | 流状态上报 |
| `window-report.schema.json` | 必须有 | 时间窗修正 |
| `point-report.schema.json` | 必须有 | 点操作 |
| `business-event.schema.json` | 必须有 | 业务显式登记定义声明的通用事件 |
| `batch-report.schema.json` | 必须有 | 同/跨作用域批量 |
| `settle-request.schema.json` | 必须有 | 同步/异步结算请求 |
| `receipt-request.schema.json` | 必须有 | 结算 ACK/NACK |
| `report.schema.json` | 必须有 | 结算报告读取与交付 |
| `protocol-response.schema.json` | 必须有 | 统一响应和错误形状 |
| `change-event.schema.json` | 必须有 | 不可变变化事实 |
| `change-delivery-result.schema.json` | 必须有 | 下游应用/拒绝结果 |

安装模式只读取技能目录中的 schema 快照。

## 9. 完成判定

- **生产 BFF 接入**：唯一链路是应用 BFF -> X-Shaper-Token 公网端点；用户身份、
  工作区和 scope 绑定、显式动作、幂等和安全负向测试同时完成。
- **scope lifecycle**：公开 API、状态迁移、审计和结算传播均有实现与 MySQL 测试。
- **identity resolve / guest session / guest claim**：目标态接口、验签、持久绑定、
  游客会话和 claim 幂等均有实现与测试；当前未满足。
