# 结算排障

从实际协议响应或报告 JSON 开始排查。不得直接查询平台数据库。
字段和路由以 [protocol.md](protocol.md) 及平台响应为准。

认证/鉴权失败先读 [authentication.md](authentication.md)。浏览器直接出现工作区
Token、自行计算 HMAC、或在 body 中自带 `workspaceId`/`scopeId` 不是可按正常
接入排障的形态，应改为 BFF 接入。

## `SETTLE_IN_PROGRESS`

同一作用域已有结算持有租约。使用响应中的在飞 `settlementId` 轮询；不要为同一作用域另起第二个结算循环。

## `SETTLE_STALE_RANGE`

调用方的 `from` 已过期。使用响应返回的权威 `from`/`to`，最多重试一次。不得根据本地时间推导区间。

`WORKSPACE_UNKNOWN`：先检查 `X-Shaper-Token` 是否存在、BFF 是否使用部署绑定的
`X-Workspace-Id`，以及 Token scope；不要尝试浏览器直连。生产缺失
workspace 仅允许 `/workspaces` 初始化，不允许普通结算。

`SIGNATURE_INVALID` / `TIMESTAMP_EXPIRED`：用提交的原始 UTF-8 body 和发送时的
`X-Timestamp` 重算；确认时间戳为毫秒且在 ±5 分钟内，路径包含完整
`/shaper/timeflow/v1`。重试保持幂等键与 body 不变，只更新追踪 ID、时间戳和签名。

`RATE_LIMITED`：遵循 `Retry-After`；不得通过关闭认证或换成无认证路径绕过。

## `NEED_RESUME`

内核触发了事件/分段安全上限。本次结算未完成，不应写入任何结算状态。检查返回 cursor，并通过受支持的续跑路径继续。

## `DATA_INCOMPLETE`

所需流或事件数据缺失。先修复源数据，再重试一次；重复失败应告警，不能无限循环。

## `STREAM_VERSION_CONFLICT`

读取当前流版本，合并预期修改后重试幂等更新。不要盲目覆盖。

## `POINT_IN_PAST`

事件时间早于已接受的进度点。修正事件时间戳，或使用文档化修正路径；不要直接修改已存点事件。

## 报告已投递但没有 ACK

1. 按 `settlementId` 拉取已完成报告。
2. 校验工作区和报告内容。
3. 使用 `settlementId` 幂等落地。
4. 发送 ACK，并附带可选的 applied digest。
5. 落地失败时发送 NACK，如实提供 code、message 和可重试性。

## 变化事件长期未确认

1. 确认结算已经完成且 `change_event` 已提交；事件缺失说明结算事务未成功。
2. 查找对应 `change_delivery`，检查 `state`、`attempt`、`next_retry_at` 和 `last_error`。
3. `RETRY` 按退避等待；持续 4xx 或重试耗尽进入 `DEAD`，不得解释为已应用。
4. 下游必须按稳定 `deliveryId` 幂等；同一 delivery 再次处理不得重新生成或改写 event payload。
5. ACK 摘要不符时拒绝写 APPLIED，不能把下游账本余额混入平台变化事实。

`SHADOWED` 是预期状态，表示平台只记录事实和 delivery，不调用外部目标。

## 鉴权与权限范围

`WORKSPACE_UNKNOWN` 可能表示 Token 错误、过期、工作区不匹配或权限不足。读取响应 `details.reason`。定义路由要求 `definition:write`。
