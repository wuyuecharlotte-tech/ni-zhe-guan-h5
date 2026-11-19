# 认证、工作区与应用边界

本文件面向接入 Shaper Timeflow 的客户端开发者、BFF 开发者和工作区后端开发者。它解决三个
不同问题：

1. **用户是谁**；
2. **该用户是否拥有本次操作的 `scopeId`**；
3. **该用户是否被允许执行这个动作**。

调用方身份、作用域归属和动作权限不能混为一谈。

> 当前状态：正式浏览器接入必须经过应用 BFF。`/shaper/timeflow/v1/**` 是公网 Skill
> 协议面，所有调用必须携带 `X-Shaper-Token` 并完成时间戳、HMAC 和幂等校验；
> `trusted-passthrough` 是显式过渡 verifier，不是真实 Token 验签。
> 用户到作用域绑定和应用 BFF 路由仍需按改造任务实现并通过验收。
> Shaper Timeflow 的 scope register/freeze/close 已经由公开接口提供；
> identity resolve、生产游客会话和游客 claim 仍为目标态，不得按当前能力接入。
>
> 唯一生产调用链、显式路由、schema 清单和目标态错误见
> [bff-routes.md](bff-routes.md) 和 [bff-upstream-auth.md](bff-upstream-auth.md)。
> X-Shaper-Token 身份不能替代 BFF 的用户/scope 授权。

## 1. 可以复用 Shaper 平台认证吗

**可以复用于确认终端用户和所属应用，但不能直接替代 Shaper Timeflow 的 X-Shaper-Token。**

| 平台能力 | 用法 | 不能做什么 |
|---|---|---|
| 虎扑登录与 `hupu_ai_session` | 同源 BFF 确认平台用户 | 不把 Cookie 转发给 Shaper Timeflow |
| colorbox-shaper-api 用户 `users.id` | 作为绑定键 | 不与虎扑 `uid`、`puid` 混用 |
| Game Token | 证明用户与目标应用 | 不证明用户拥有某个 `scopeId` |
| 用户 Token `shaper_tk_` | 仅可信服务端调用 | 不下发给第三方 H5 |
| 受信接入网关注入身份 | 同源部署 BFF 的用户身份来源 | 不从 body/query 接收身份 |
| 部署平台 API Key / EnvId | 环境配置与运行时参数 | 不是用户身份或业务授权 |
| 标准 `X-Shaper-Token` + HMAC | 证明调用方是受信服务并完成请求证明 | 不能替代 BFF 的用户/作用域授权 |

结论：

```text
colorbox-shaper-api 认证负责“人 + 应用”
应用 BFF 授权负责“人/游客 + 游戏作用域 + 工作区 + 动作”
X-Shaper-Token 身份负责“只允许受信调用方进入公网协议面”
Shaper Timeflow 负责“业务校验 + 结算”
```

## 2. 推荐调用链路

### 2.1 同源部署：H5 + 应用级 BFF

普通 H5 游戏优先采用此方式：

```text
H5
  -> ColorboxAI.cloud.request({ auth: true, envId })
  -> 受信接入网关验证用户凭据
  -> 网关注入规范化身份上下文
  -> 应用级 BFF
  -> 验证应用/环境/工作区绑定
  -> colorbox-shaper-api 将用户解析为 users.id
  -> 查询 active scope binding
  -> BFF 使用 `X-Shaper-Token` + HMAC 调用公网 Shaper Timeflow
  -> Shaper Timeflow
  -> Shaper Timeflow
```

BFF 只能从网关上下文读取用户身份。禁止自行解析浏览器 `Authorization`，
禁止从 body/query 读取 `puid`、`workspaceId` 或 `scopeId` 作为授权依据。
完整上游认证链和失败行为见
[bff-upstream-auth.md](bff-upstream-auth.md)。

### 2.2 C2：游戏已有独立可信 HTTP 后端

```text
H5
  -> ColorboxAI.game.auth({ appId })
  -> 短期 RS256 Game Token
  -> BFF JSON body
  -> 验签、exp、appId 与 token 结构
  -> colorbox-shaper-api 将 token sub 规范化为 users.id
  -> 查询 active scope binding
  -> BFF 使用 `X-Shaper-Token` + HMAC 调用公网 Shaper Timeflow
```

Game Token 不要放进给受信接入网关使用的 `Authorization` 头，也不要传给
Colyseus Room 之外的任意代理。BFF 应复用平台验签实现并固定公钥；不得自行写
宽松的 JWT 解码器。
X-Shaper-Token 是生产强制项；BFF 必须满足
[bff-upstream-auth.md](bff-upstream-auth.md) 的签名与时间窗契约。

### 2.3 匿名试玩

匿名入口由 colorbox-shaper-api（经应用 BFF）签发不透明游客会话：

```text
POST /api/timeflow/apps/{appId}/guest/session
  -> BFF 固定 appId / environmentId / workspaceId
  -> 生成随机 guest token，只保存 hash
  -> 创建 provisional scope
  -> 设置 HttpOnly、Secure、SameSite Cookie
guest action
  -> BFF 按 Cookie hash 找回 active guest session
  -> 使用服务端保存的 provisional scope
  -> BFF 检查游客动作策略
  -> 调用 Shaper Timeflow
```

游客响应不得返回工作区 Token、`workspaceId`、内部 scope ID、服务签名或可修改的
“已登录”标志。游客奖励必须有上限，且不得参与排行榜、提现、转账或不可逆资产。

游客升级必须显式调用 claim：

```text
active guest + authenticated user + same application
  -> claim
  -> 按已批准策略创建永久绑定或原地提升 provisional scope
  -> 作废游客凭据
```

如果该用户已经绑定其他永久作用域，返回 `SCOPE_ALREADY_BOUND`。一期不得自动合并
经济数据，也不得悄悄把游客挂到已有作用域。重复 claim 使用同一幂等键必须返回同一结果。

生产游客会话和游客 claim 尚未实现。scope 的
register/freeze/close 已是公开接口，见 [bff-routes.md](bff-routes.md)。

## 3. `workspaceId` 与 `applicationId`

工作区本身通过 `POST /shaper/timeflow/v1/workspaces` 注册，scope type 通过
`POST /shaper/timeflow/v1/scope-types` 显式开放。两者统一使用标准
`X-Shaper-Token`、时间戳、HMAC 和幂等键；不另设 Bearer。当前
`trusted-passthrough` 对非空标准 Token 放行身份和 scope，但请求协议校验仍然生效。
应用 BFF 不得调用这两个接口。

注册前按 [workspace-onboarding.md](workspace-onboarding.md) 解析身份：
`activity.json.activityId` 优先于 Shaper 托管 Qoder 会话 `projectId`，Qoder
命中后不再查询 MCP；其后才使用 `project_context.appId`。非 Shaper 应用仅在用户
确认候选 ID 后写入业务 `timeflow.json`。workspace 与 scope 注册都必须携带业务可读
展示名。

两者业务含义不同：

| 标识 | 业务含义 | 权威来源 |
|---|---|---|
| `applicationId` / `appId` | Shaper 应用、部署和 Game Token audience | 平台应用记录与验证后的 token/context |
| `workspaceId` | Shaper Timeflow 的数据、定义、作用域、配额与凭据隔离范围 | colorbox-shaper-api 持久化的应用/环境映射 |

一期可以让两者使用相同的字符串值，但必须保留显式绑定；技能接入复用 Shaper
`activityId`/`appId`/Qoder `projectId` 作为 workspace 值时，仍不能省略这门绑定：

```text
applicationId + environmentId -> workspaceId
```

不要把 `workspaceId` 的字符串前缀当作应用所有权证明，也不要在 Shaper Timeflow 代码里解析
`app_` 前缀。应用停用、环境隔离、数据保留和凭据轮换都依赖这张映射。

如果同一个 `applicationId` 会同时出现在 dev/test/prod：

- 绑定键必须包含 `environmentId`；或
- 每个环境使用不同的 `workspaceId`。

否则测试数据、生产数据和配额会被错误混用。

## 4. 为什么 BFF 需要 `workspaceId + scopeId + action`

### `workspaceId`

确定调用作用于哪个隔离域。它同时约束：

- 定义、流和作用域查找；
- Token 候选与 QPS；
- 消息路由与变化事件 delivery 读取；
- 数据保留和工作区下线。

### `scopeId`

确定本次操作作用于哪个游戏作用域。只有 `workspaceId` 会让持有工作区凭据的调用方
接触工作区内任意作用域，无法安全支持个人进度、资产、榜单或防作弊。

### 用户动作

限定当前玩家能够执行哪类操作。读写流、写点、触发结算、读取报告、确认报告、
提交定义和执行任务不能共享一个宽泛权限。

推荐的 BFF 用户动作：

| 路由族 | 用户动作 |
|---|---|
| stream、windows | `stream:write` |
| points、events | `point:write` |
| sync/async settlement trigger | `settle:trigger` |
| report read | `settle:read` |
| settlement ACK/NACK | `settle:ack` |
| definitions | 玩家不可访问；仅受信接入服务 |
| tasks | 玩家不可访问；仅受信工作区服务 |
| scope register/freeze/close | 受信 BFF 或工作区服务动作 |

用户动作与平台 Game Token 的 appId 校验同时通过才允许请求。资源只读的应用不能
借用 `definition:write` 去提交定义。

## 5. 如何判断用户与作用域已绑定

用户与作用域绑定由 BFF 的持久表决定，不能靠以下信息推断：

- 作用域存在于平台 `scope` 表；
- Game Token 验签成功；
- 浏览器传了相同 `scopeId`；
- 同一设备、IP、昵称或 `appId`。

最小绑定记录：

```text
application_id
environment_id
workspace_id
actor_type = user | guest
actor_id = users.id | guest_session id
scope_type
scope_id
status = active | suspended | revoked
version
```

每次调用 Shaper Timeflow 前检查：

```text
用户/游客有效
应用与环境绑定 active
scope 绑定 active
绑定 workspaceId 等于部署 workspace
请求目标等于绑定 scope
```

批量请求必须先验证所有目标都属于同一调用者；任一项越权则整批拒绝。

## 6. BFF 与游戏服务怎么拆分

### 推荐：应用级 BFF + X-Shaper-Token 公网端点

- 普通 H5 优先与 BFF 部署在同一应用与环境中；
- 一个 BFF 部署可以服务多个 Shaper 应用，但账号、绑定与缓存必须包含 `appId`；
- BFF 只暴露 `/api/timeflow/apps/{appId}/*` 下的显式白名单路由；
- 每次请求无状态，绑定、游客会话和限流使用数据库或共享存储；
- Shaper Timeflow 公网只暴露 Skill 协议面，且所有请求要求 X-Shaper-Token；
- BFF 共享实现采用固定版本包，生成的云函数只保存应用配置和路由接线。

### 不建议：把通用 BFF 放进游戏服务端

只有游戏已有可信 HTTP 后端且无法提供独立 BFF 时，才可在该后端承载隔离模块。
必须仍满足显式路由、服务端身份、持久绑定和最小权限。不能让 BFF 与实时 Room
共享通用代理、长期工作区密钥或任意消息转发能力。

### 可以使用云函数

普通请求/响应型 Shaper Timeflow BFF 适合云函数：

- 按应用和环境隔离；
- 自动扩缩容；
- 网关负责用户 Bearer 验证与身份注入；
- 通过数据库共享状态。

但云函数多实例意味着以下内容不得只存在模块内存：

- 用户/作用域绑定；
- 游客会话；
- 幂等占位；
- 用户级/应用级限流；
- 撤销状态。

实时 Room 不适合作为该 BFF 的替代品。Room 可在验签后调用窄接口，但不应成为
浏览器通用代理或持有工作区密钥。

## 7. 上游协议与重试

当前部署的 BFF 到公网 Shaper Timeflow 必须使用 X-Shaper-Token。
BFF 必须使用显式路由、限制 body 并保留幂等语义。

详细请求头、canonical 格式、时间窗、各路由 scope 和失败语义以
[bff-upstream-auth.md](bff-upstream-auth.md)、[protocol.md](protocol.md) 和
[bff-routes.md](bff-routes.md) 为准。X-Shaper-Token 身份不替代 BFF 的用户身份、
应用/workspace 映射或 scope 归属检查。

规则：

- 逻辑重试复用同一个幂等键和相同 payload；
- 未知结果不要自动当作成功；
- 非幂等操作超时后先查询状态，不要重复执行；
- 不打印 Token、Cookie、Signature、完整身份或完整业务 body。

## 8. 撤销与异步结算

账号停用、主动解绑或应用停用的顺序：

```text
BFF 持久化绑定/会话失效
  -> 新请求立即拒绝
  -> 应用 BFF 冻结 Shaper Timeflow scope
  -> 记录幂等结果与审计
  -> 才向调用者报告撤销成功
```

Shaper Timeflow 必须让同步结算、异步消费者和 in-flight lease 都观察作用域冻结：

- 冻结后不能分配新收益；
- 在飞任务最多处理到冻结时刻；
- 已生成的报告可以投递；
- 重试不能为冻结作用域产生新的权益；
- 仅清 BFF 缓存不算撤销完成。

## 9. 稳定错误与安全检查

| 场景 | 错误码 |
|---|---|
| 无有效用户身份 | `AUTH_REQUIRED` |
| 账号停用 | `ACCOUNT_SUSPENDED` |
| 应用/环境/工作区无授权 | `APP_NOT_AUTHORIZED` |
| 用户与作用域未绑定 | `SCOPE_NOT_BOUND` |
| 作用域已属于他人 | `SCOPE_ALREADY_BOUND` |
| 游客会话无效 | `GUEST_SESSION_INVALID` |
| 用户动作不足 | `FORBIDDEN` |
| 请求限流 | `RATE_LIMITED` |
| 上游超时或结果不确定 | `UPSTREAM_UNAVAILABLE` |

错误响应不得暴露 `workspaceId`、作用域所有权、Token、Cookie 或内部异常。

发布前逐项检查：

- [ ] 生产 bundle 中没有工作区 Token/HMAC 密钥；
- [ ] 身份来自网关注入上下文或已验证 Game Token；
- [ ] `applicationId/environmentId/workspaceId` 来自部署与持久绑定；
- [ ] 用户与 `scopeId` 的绑定由服务端确认；
- [ ] 路由显式、默认拒绝，没有通用代理；
- [ ] 用户级和应用级限流在共享存储；
- [ ] 游客 claim、重复 claim、过期和撤销有幂等语义；
- [ ] 跨用户、跨应用、跨工作区和重放请求已有负向测试；
- [ ] 撤销能传播到异步结算；
- [ ] 日志、指标和响应不包含敏感凭据。

## 10. 当前禁止项

以下方式不得作为正式方案：

- 在 `VITE_*`、HTML、脚本或 source map 中放 `SHAPER_TOKEN`；
- 让浏览器用 `SHAPER_TOKEN` 作为 HMAC 密钥；
- 用匿名浏览器 UUID 直接充当永久业务作用域；
- 仅凭登录成功创建或复用任意 `scopeId`；
- 用部署平台 API Key 识别玩家；
- 用模块内存保存绑定、幂等或全局限流；
- 撤销时只清缓存；
- 为兼容而回退到浏览器工作区凭据。

