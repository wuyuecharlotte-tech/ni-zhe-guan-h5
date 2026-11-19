# 匹配与大厅

## 把准入与玩法分开

大厅房间收集意图和准备状态。游戏房间拥有对局。交接只应携带由服务端创建或签名的预约（reservation），其中包含 match ID、玩家 ID、角色和过期时间。客户端可以显示一个加入令牌，但不能靠它把任意玩家塞进正在进行的对局。

```text
queue -> candidate group -> reservation -> game room admission -> ready check -> start
```

## 服务端主导准入

**准入决策必须落在服务端。** 让客户端拉房间列表、排序、再 `joinById` 会丢掉 Colyseus 原生匹配的三样能力，并引入若干静默故障：

| 能力 | 原生实现 | 客户端选房时 |
| --- | --- | --- |
| 跨进程建房互斥 | `concurrentJoinOrCreateRoomLock`（Redis 锁 + `presence.publish`） | 无。两个玩家同时进空大厅会各自建房 |
| 座位竞争重试 | `retry(cb, 5, [SeatReservationError])` | 无。`joinById` 恰是不重试的那条，房间刚好坐满时抛硬错误 |
| 准入权威 | `joinOrCreate` 在服务端 | 客户端经 `options` 影响自己被分到哪个房间 |

正确形状是服务端准入端点（本技能约定 `POST /admit`）：

```text
client --POST /admit?cloudbase_session_id=<token>--> room process
   server: matchMaker.joinOrCreate(roomType, options)   // 全局找房，找不到则本地建房
           matchMaker.getRoomById(roomId)               // 回读 metadata 里的实例 token
   <-- { reservation, affinity }
client --consumeSeatReservation(reservation) + affinity--> WS upgrade
```

座位在 `joinOrCreate` 里就已经在房间所在进程预留，因此客户端随后连接不会出现 `seat reservation expired`。客户端不需要、也不应该自己建房：实测 CloudBase 网关对客户端 `joinOrCreate` 返回 HTTP 4011。

CloudBase 多副本下的实例亲和细节（`cloudbase_session_id` 与 Colyseus `sessionId` 的区别、创建必须本地、跨客户端转让）见 `references/cloudbase-run.md`。

## 匹配过滤器

让过滤器显式且有界：模式、地区、队伍人数、技术分档和版本。优先使用一组小型确定性过滤器，而不是让客户端 payload 携带查询语言。队列变化时重新评估候选；不要假定过期的预约仍然有效。

## 房间容量与准备状态

容量由服务端强制。准备标记是一条只对已准入玩家合法的命令。按 recipe 的规则开始对局，例如全员准备或到达服务端截止时间。如果玩家在开始前离开，取消预约，或按已记录的策略补位。

## 清理

每个队列条目、预约和大厅成员关系都有过期时间或断线清理。房间销毁时移除该房间持有的引用。后台清扫是安全网，不是主要清理路径。

## 版本与兼容

在匹配条件中包含客户端协议版本和服务端模式。房间应在改变状态之前拒绝不兼容的客户端。通过把兼容客户端放进不同模式，或在一段有界迁移窗口内同时支持两个协议版本来发布新版本。

## 抗滥用

对队列加入、离开、准备切换和预约领取做限流。在服务端校验队伍成员关系。不要在公开房间状态中暴露其他玩家的账号标识、隐藏技术分或匹配原因。
