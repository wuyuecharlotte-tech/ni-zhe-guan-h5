# 稳定错误码总表

本文件是「稳定错误码」的唯一权威总表：**`code` 是稳定契约，`message` 可本地化**。这句话的完整约定在 [协议契约](protocol-contracts.md)，本表不重复论证，只做**索引与处置建议**：每行给出码的来源、触发条件和客户端应执行的动作。

两类码必须分开读：

- **SDK 稳定契约码**：由 `packages/protocol`、`packages/server` 抛出或返回。游戏代码按下面的分节表处理。
- **非 SDK 契约码**：示例与模板里的游戏自定义码，见文末。它们不是 SDK 契约，本表只登记以免被误当成契约。

两条语义必须记牢，它们的权威来源是 [断线与刷新重连](reconnection.md) 与 [玩法模式](gameplay-patterns.md)：

- `CONNECTION_LOST` 与 `COMMAND_TIMEOUT` 表示**结果未知**，不是「失败」。调用方只在确实要重试时重试，且必须沿用同一个 `commandId`。
- 准入类失败（`AFFINITY_REQUIRES_ADMISSION`、`ROOM_AFFINITY_MISSING`）不是可重试的瞬时故障，而是「走错了入口」或「房间没按规范接线」。成因与验收见 [CloudBase 云托管](cloudbase-run.md)。

## 协议与校验（packages/protocol）

| 错误码 | 来源 | 触发条件 | 客户端应如何处理 |
| --- | --- | --- | --- |
| `INVALID_ENDPOINT` | `packages/protocol` | `httpOriginOf()` 收到非 `ws(s)://`、非 `http(s)://` 的地址 | 修正 resolver 返回的入口地址；这是配置错误，不重试 |
| `SCOPE_MISMATCH` | `packages/protocol` | `assertScope()` 发现 `gameId` / `releaseId` / `protocolVersion` 任一不一致 | 立即停止连接，重新拉取与本次请求匹配的 scope 配置；不要带着旧 ticket 重试 |
| `INVALID_JSON` | `packages/protocol` | `canonicalJson()` 收到不支持的值，或嵌套超过 48 层 | 修正 payload 形状（编程错误）；不重试 |

## 原生客户端错误

页面捕获连接 Promise 异常及 room.onError/onLeave，按纯 HTML 示例展示错误。不存在自定义客户端包的命令错误契约。

## 服务端命令执行（packages/server）

| 错误码 | 来源 | 触发条件 | 客户端应如何处理 |
| --- | --- | --- | --- |
| `OVERLOADED` | `packages/server` | 房间在途命令达到上限，或幂等缓存已满 | 退避后重试；不要把失败当成业务结果 |
| `PAYLOAD_TOO_LARGE` | `packages/server` | 命令 payload 规范化 JSON 后超过 16 KiB | 缩小 payload；不要原样重发 |
| `ID_CONFLICT` | `packages/server` | 同一 `(actorId, commandId)` 的重试换了不同内容（指纹不一致） | 不要用同一个 `commandId` 发送不同命令；为新内容生成新 ID |
| `RESULT_TOO_LARGE` | `packages/server` | 命令结果规范化 JSON 后超过 16 KiB | 缩小返回结果，把大对象拆成有界读取 |
| `INTERNAL_ERROR` | `packages/server` | 命令实现抛出非 `MultiplayerError` 异常 | 视为服务端缺陷：让失败可观察，不要静默当成功 |

## 准入（packages/server admission）

| 错误码 | 来源 | 触发条件 | 客户端应如何处理 |
| --- | --- | --- | --- |
| `AFFINITY_REQUIRED` | `packages/server` | 准入请求缺少房间类型，或缺少 / 不合法 `cloudbase_session_id`（HTTP 400） | 修正准入请求；这是调用约定错误，不重试 |
| `ROOM_AFFINITY_MISSING` | `packages/server` | 房间 metadata 未记录亲和标识（HTTP 409） | 拒绝该次准入；不要回落到客户端自建房间 |
| `ADMISSION_FAILED` | `packages/server` | 座位预约形状不合法（HTTP 500）、匹配异常（HTTP 503）或读取房间失败（HTTP 503） | 503 可退避重试；500 需要排查服务端实现 |

## 非 SDK 契约码（示例 / 模板自定义）

这些码出现在示例与模板里，但**不是** SDK 契约：SDK 既不产生也不解释它们。把它们登记在此，是为了避免被误当成稳定契约。

| 错误码 | 来源 | 触发条件 | 说明 |
| --- | --- | --- | --- |
| `BOOTSTRAP_FAILED` | `examples/social-party` | 示例客户端的 bootstrap 健康检查 HTTP 失败 | 示例自定义码；示例内按失败处理 |
| `INVALID_PAYLOAD` | `templates/protocol` | 模板预留的游戏自定义 `RoomErrorCode` | 复制模板后由游戏自己定义语义 |
| `NOT_ADMITTED` | `templates/protocol` | 模板预留的游戏自定义 `RoomErrorCode` | 复制模板后由游戏自己定义语义 |
| `WRONG_PHASE` | `templates/protocol` | 模板预留的游戏自定义 `RoomErrorCode` | 复制模板后由游戏自己定义语义 |
| `DUPLICATE_COMMAND` | `templates/protocol` | 模板预留的游戏自定义 `RoomErrorCode` | 复制模板后由游戏自己定义语义 |
| `RATE_LIMITED` | `templates/protocol` | 模板预留的游戏自定义 `RoomErrorCode` | 复制模板后由游戏自己定义语义 |

## 与权威页的关系

```text
protocol-contracts.md  -> code 稳定 / message 可本地化（本表指向它）
reconnection.md        -> CONNECTION_LOST / COMMAND_TIMEOUT 的「结果未知」结论
gameplay-patterns.md   -> commandId 幂等与重试规则
cloudbase-run.md       -> 准入失败码的成因与验收
```

本表是索引与处置建议，不是第二份规范；机制与流程正文只在上述权威页。
