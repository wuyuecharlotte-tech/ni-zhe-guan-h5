# 公网 Timeflow 上游认证

生产接入只有一条链路：

```text
Browser
  -> application BFF
       verify user/guest identity
       derive application/environment -> workspace
       derive actor -> scope
       check explicit browser action
  -> X-Shaper-Token public Timeflow endpoint
       X-Shaper-Token
       X-Workspace-Id
       X-Protocol-Version: 1
       X-Request-Id
       X-Timestamp
       X-Signature
       X-Idempotency-Key when required
  -> /shaper/timeflow/v1/**
```

公网接口使用 X-Shaper-Token；该身份不证明浏览器用户拥有某个 scope。BFF 的用户授权、
应用/环境到工作区绑定和 actor 到 scope 绑定都必须保留。

## 凭据边界

- `TIMEFLOW_BASE_URL` 只表示上游 origin；BFF 必须使用显式白名单路由。
- `SHAPER_TOKEN` 和 HMAC 密钥只在可信服务端安全配置中存在，浏览器和 Skill
  示例不得接收。
- 同一逻辑请求重试必须复用相同幂等键和字节相同的 UTF-8 JSON body；
  `X-Request-Id` 每次网络尝试变化，`X-Timestamp` 与签名可随之变化。
- 上游超时或结果不确定时，只有已声明幂等的操作才能重试；不得报告成功、
  更换凭据或降级为无认证请求。
- 不提供通配代理、路径透传或浏览器自报上游地址。

BFF 仍必须执行：

```text
authenticated user/guest
active application/environment -> workspace binding
active actor -> scope binding
explicit browser action
bounded request body
explicit upstream route
```

任一绑定缺失、停用或歧义，或上游返回认证/scope 错误，都必须失败关闭。

## 认证参数

```http
POST /shaper/timeflow/v1/player/1001/stream HTTP/1.1
Host: <public-timeflow-origin>
Content-Type: application/json; charset=utf-8
X-Workspace-Id: farm
X-Protocol-Version: 1
X-Request-Id: trace-stream-001
X-Timestamp: 1793260800000
X-Shaper-Token: <SHAPER_TOKEN>
X-Idempotency-Key: req-stream-1001-1
X-Signature: <lowercase hex HMAC-SHA256>

{"streamKey":"crop:1","value":"10","expectedVersion":0,"requestId":"req-stream-1001-1"}
```

| 参数 | 必填 | 约束 |
|---|---:|---|
| `X-Workspace-Id` | 是 | BFF 从持久绑定派生；`/workspaces` 时等于 body `workspaceId` |
| `X-Protocol-Version` | 是 | 固定 `1` |
| `X-Request-Id` | 是 | 每次网络尝试独立生成，只用于追踪 |
| `X-Timestamp` | 是 | Unix 毫秒，与服务端时钟相差不超过 5 分钟 |
| `X-Shaper-Token` | 是 | 服务端安全配置中的 Shaper 标准 Token；不得下发浏览器 |
| `X-Idempotency-Key` | 按路由 | stream/window 等于 body `requestId`；point/business event 等于 body `eventId`；provisioning 等于 body `requestId` |
| `X-Signature` | 是 | HMAC-SHA256(Token, canonical) 的小写十六进制 |

canonical 五段按换行连接，末尾不自动追加换行：

```text
METHOD
PATH
X-Timestamp
X-Idempotency-Key-or-empty
BODY
```

- `METHOD` 大写；`PATH` 是从 `/shaper/timeflow/v1` 开始的真实 request URI；
- `BODY` 是实际提交的 UTF-8 JSON 原文，不重新序列化；
- 重试复用相同幂等键和字节相同的 body；只允许 `X-Request-Id`、时间戳和对应签名变化；
- 首次 workspace 初始化允许 workspace 尚未 active，但不得跳过 Token、HMAC 和幂等。

计算示例：

```text
canonical =
POST
/shaper/timeflow/v1/player/1001/stream
1793260800000
req-stream-1001-1
{"streamKey":"crop:1","value":"10","expectedVersion":0,"requestId":"req-stream-1001-1"}

X-Signature =
lower_hex(HMAC-SHA256(utf8(SHAPER_TOKEN), utf8(canonical)))
```

服务端校验顺序：

1. 协议版本；
2. 时间戳格式与 ±5 分钟窗口；
3. Token 存在且 verifier 返回身份与 workspace；
4. Token scope；
5. Header/body 幂等键一致；
6. HMAC 签名；
7. 工作区 active（`/workspaces` 初始化除外）；
8. 工作区 QPS（`/workspaces` 初始化除外）。

### Token scope

| 动作 | scope |
|---|---|
| 初始化 workspace | `workspace:provision` |
| 初始化 scope type | `scope-type:provision` |
| 提交、校验、激活 definition | `definition:write` |
| 读取 definition | `definition:read` |
| 启停、触发 task | `task:write` |
| 读取 task 运行记录 | `task:read` |
| scope 注册、冻结、关闭 | `scope:lifecycle` |
| stream/window 写 | `stream:write` |
| projection/单流读取 | `stream:read` |
| point/business event 写 | `point:write` |
| 同步/异步结算触发 | `settle:trigger` |
| 报告读取 | `settle:read` |
| 结算 ACK/NACK | `settle:ack` |
| change delivery ACK/NACK | `delivery:ack` |

未知 method/path 必须失败关闭，不能继承 `stream:write`。服务调用方身份不等于用户
scope 所有权，BFF 仍需完成 actor/scope 绑定。

## Token verifier 的过渡状态

`trusted-passthrough` 是显式配置的过渡 verifier：任何非空
`X-Shaper-Token` 都视为可信身份并通过全部 Skill scope，但不校验 workspace
绑定。它不是已完成真实 Token 验签，也不能替代 BFF 的用户/scope 授权。

后续真实 verifier 只改变部署配置和认证判断，不改变请求头、HMAC canonical
格式、Controller、SDK 或 Skill 参数。真实 verifier 不可用时必须启动失败，
不得回退到 passthrough。

## 失败语义

| 条件 | 结果 |
|---|---|
| 缺少标准 Token | `WORKSPACE_UNKNOWN`，不进入 Controller |
| 协议版本不是 `1` | `PROTOCOL_UNSUPPORTED` |
| 时间戳缺失或超过 ±5 分钟 | `TIMESTAMP_EXPIRED` |
| 请求头与 body 幂等键不一致 | `IDEMPOTENCY_KEY_MISMATCH` |
| HMAC 不一致 | `SIGNATURE_INVALID` |
| 工作区未激活 | `WORKSPACE_UNKNOWN`，`reason=workspace_inactive` |
| QPS 超限 | `RATE_LIMITED`，带 `Retry-After` |
| BFF 身份、绑定或动作失败 | BFF 层失败关闭，不调用上游 |

首次 workspace 初始化允许目标 workspace 尚不存在；这不表示可以省略 Token、
时间戳、HMAC 或幂等校验。
