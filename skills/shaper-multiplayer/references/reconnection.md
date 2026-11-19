# 原生 Colyseus 重连

首次接线见 [纯 HTML 示例](plain-html-client.md)。当前页面断线使用原生 room.onDrop / room.onReconnect / room.onLeave；只有服务端允许重连才会恢复。断线时停止发送高频输入，避免恢复时重放过期移动。

## 3. 服务端生命周期与四类策略

### 3.1 `onDrop` / `onReconnect` / `onLeave` 的调用关系

这是最容易误判的一节，必须按 `@colyseus/core` 的真实实现理解。

`Room#_onLeave` 先按关闭码选路（`Room.mjs:1442-1443`）：

- `code === CONSENTED(4000)`，或客户端处于 `RECONNECTING` → 调用 **`onLeave`**；
- 其余（真实断线）→ 调用 **`onDrop`**（若未定义则退化为 `onLeave`）。

随后 `Room#_onAfterLeave` 里，**当该次是 drop 且 `onLeave` 存在时，会再次调用 `onLeave`**（`Room.mjs:1472-1475`）。

因此两条结论必须写进任何 `onLeave` 实现：

1. **drop 路径上 `onDrop` 与 `onLeave` 都会被调用。** 宽限期结束（或重连握手失败）后 `onLeave` 被第二次调用。所以 `onLeave` 必须**幂等**，并且同时适配主动离开与宽限期结束两种语义。
2. **不要在 `onDrop` 里顺手删玩家。** 删座位的事留给 `onLeave`，否则宽限期内重连回来的玩家没有座位可恢复。

### 3.2 宽限期与关闭码

`allowReconnection(previousClient, seconds)` 返回一个 `Deferred<Client>`（`Room.d.ts:815`）。语义要点：

- 只能在 `onDrop`（非自愿离开）路径内调用才有效。源码注释写的是 `onLeave()`，指的就是这条非自愿路径。
- `seconds` 省略会退化为已废弃的 `"manual"`（`Infinity`）并打印 deprecation 警告，不要依赖省略参数（`Room.mjs:1182-1188`）。
- 同一个玩家重复调用会被去重，返回同一个 `Deferred`（`Room.mjs:1194-1197`）。
- 宽限期用一个 `setTimeout` 实现，到期执行 `reconnection.reject(false)`（`Room.mjs:1201-1203`）；`Deferred` 的失败分支随后触发第二次 `onLeave`。

**关键修正（实测）**：宽限期结束时交给 `onLeave` 的关闭码是**本次断线的原始码**（静默断网时是 `1005`），而不是 `4010`。`MAY_TRY_RECONNECT(4010)` 在服务端只在 dev mode / 强制关闭路径出现（`Room.mjs:425`、`Room.mjs:1338`），客户端把它当作「可自动重连」的信号。把它写成「宽限期到期码」是错的，会让测试与告警匹配到永远不会出现的分支。

| code | 名称 | 谁发出 | 语义 |
| --- | --- | --- | --- |
| `4000` | `CONSENTED` | 客户端 `room.leave(true)` | 主动离开。只走 `onLeave`，不触发 `onDrop`，宽限期不存在 |
| `1005` | `NO_STATUS_RECEIVED` | 传输层 | 无状态关闭，真实断网最常见的码 |
| `1006` | `ABNORMAL_CLOSURE` | 传输层 | 连接异常中断 |
| `1001` | `GOING_AWAY` | 浏览器/进程 | 页面卸载或关窗 |
| `4001` | `SERVER_SHUTDOWN` | Colyseus 服务端 | 服务端停服（dev mode 下替换为 `4010`） |
| `4003` | `FAILED_TO_RECONNECT` | Colyseus 服务端 | 重连握手本身失败（`Room.mjs:1089`） |
| `4010` | `MAY_TRY_RECONNECT` | Colyseus 服务端 | dev mode / 强制关闭时发出；客户端据此判断可自动重连 |

客户端只在 `1005 / 1006 / 1001 / 4010` 四种码上自动重连，其余码直接走 `onLeave`（`@colyseus/sdk/build/Room.mjs` 的 `onclose` 分支）。

### 3.3 四类策略的判定规则

先按「缺席时其他玩家在做什么」选策略，再按玩法长度定宽限期。

| 条件 | 策略 | 宽限期 | 宽限期内 | 宽限期结束的结算 | 适用 recipe |
| --- | --- | --- | --- | --- | --- |
| 缺席可容忍，回合/阶段仍在推进 | 恢复 Resume | 15–60s；回合制可放到一个完整回合 | 座位保留，状态继续投影但标记 `connected=false` | 超时才按缺席处理 | 回合制、合作 PvE |
| 对抗性强，缺席直接影响对手 | 认输 Forfeit | 5–15s | 座位保留，对手看到「已掉线」 | 按缺席结算（判负、扣分、提前结束本局） | 实时竞技 |
| 玩家可被观战或由队友接管 | 观战 Spectate | 与恢复同长 | 座位保留，权限降为只读 | 保留只读席位，由他人接管控制 | 卡牌（可选） |
| 短局、用完即弃的派对房 | 移除 Remove | 0–5s；也可以是 0 | 座位保留但已标记断线 | 立即释放座位 | 社交派对 |

判定规则落到代码上只有一处差别：`onDrop` 里调不调 `allowReconnection`（以及传几秒），以及宽限期结束时 domain 怎么结算。

- **恢复 / 观战**：`onDrop` 调 `allowReconnection(client, graceSeconds)`；宽限期结束才走 `forfeit` 或 `release`。
- **认输**：同样调 `allowReconnection`，但超时后的结算按认输处理，而不是单纯释放。
- **移除**：`onDrop` 只标记断线并立即释放座位，**不**调 `allowReconnection`。此时服务端不会保留 `_reconnections` 条目，`onLeave` 在 drop 路径上仍会被调用一次，幂等释放即可。

四类策略都必须在房间状态或稳定错误码里可见，不能只体现在日志里。

## 4. 服务端标准范式

完整可复制版本在 `templates/server/src/room.ts`。形状如下：

```ts
const RECONNECT_GRACE_SECONDS = 10; // 集中定义，不散落魔数

onDrop(client, code) {
  this.domain.markDisconnected(client.sessionId); // projection: connected = false
  void code;
  void this.allowReconnection(client, RECONNECT_GRACE_SECONDS).then(
    () => {},                                    // 恢复交给 onReconnect
    () => this.domain.forfeit(client.sessionId), // 宽限期用尽 → 按策略结算
  );
}

onReconnect(client) {
  this.domain.markReconnected(client.sessionId);
}

onLeave(client, code) {
  // 幂等：自愿离开(4000)、宽限期用尽、重连握手失败(4003) 都会到这里
  this.domain.release(client.sessionId, code);
}
```

三条边界：

1. **宽限期是常量，不是内联魔数。** 取值依据见 3.3 的表格；只允许在 Room 适配器里出现一次。
2. **domain 不依赖活跃 socket。** `markDisconnected` / `markReconnected` / `forfeit` / `release` 都是纯 domain 调用，Room 只做生命周期到 domain 的翻译。这是 [SKILL.md 的不可协商边界](../SKILL.md)。
3. **释放座位只在 `onLeave` 里做，且必须幂等。** drop 路径会二次调用它，移除策略下也可能连调两次。

## 5. 计时器与截止时间

断线**不会**暂停服务端时间。除非所选 recipe 明确暂停对局，tick、回合截止时间、冷却和随机推进都照常按服务端时钟走。

客户端重连回来后：

- 收到的是**当前**阶段、tick 和截止时间，不是断线时的快照；
- 不获得重放任何「已被接受的命令」的权限；
- 在途命令的结果仍然是未知的，只能靠 `commandId` 幂等重试。

这条与 [玩法模式](gameplay-patterns.md) 的回合状态机一致。需要「暂停」效果时，正确做法是在 domain 里显式停表，而不是让重连逻辑去补偿时间差。

## 刷新恢复

保存原生 room.reconnectionToken、appId、endpoint 与房间 affinity。恢复前核对应用和 endpoint，使用保留 affinity 的 Client 调用 client.reconnect(token)，重新绑定状态回调；失败后清除记录并让玩家重新入房。不要重新 bootstrap 替换原 affinity，不记录凭证到日志。

## 7. 身份约束

术语沿用 [CloudBase 云托管](cloudbase-run.md) 的五 id 表，本文件不另立一套说法。重连语境下只有四句话：

- `cloudbase_session_id` 是**实例**亲和 token，全房间共用；刷新恢复时必须由 handle 带回。
- Colyseus `sessionId` 是**每玩家**的座位 id，重连前后**保持不变**；它从来不是重连凭据。
- `reconnectionToken` 是**一次**重连授权，每玩家一个。
- **绝不能出现「用 Colyseus `sessionId` 重连」这种写法。** Colyseus 的重连接口只接受 `roomId:token` 形状的 `reconnectionToken`；拿 `sessionId` 去重连会把玩家钉到错误的实例或直接失败。

## 8. 测试断言点

四条路径必须各有可执行断言，落在具体数值上而不是「不抛错」。

| 用例 | 触发方式 | 断言 |
| --- | --- | --- |
| Drop → Reconnect | 客户端 `reconnection.enabled` 保持开启，且房间存活时间已超过 `minUptime`，然后用无 code 的 `transport.close()` 断开 | 服务端事件序列为 `join → drop(1005) → reconnect`；重连前后 `sessionId` 相同；投影里该玩家 `connected === true`；客户端 `onReconnect` 触发且 `onLeave` 未触发 |
| 宽限期超时 | 客户端 `reconnection.enabled = false` 后断开，服务端宽限期设为 1s | 服务端事件序列为 `join → drop(1005) → leave(1005)`；宽限期内没有 `reconnect`；座位按策略释放 |
| 主动离开 | 客户端 `session.leave()`（内部 `room.leave(true)`） | 服务端只有 `leave(4000)`，没有 `drop`；座位被释放 |
| handle 过期 / 坏 handle | 对损坏、scope 不匹配、token 前缀不匹配的 handle 调 `resumeFrom` | 抛稳定错误（`INVALID_RESUME` / `SCOPE_MISMATCH`），且 store 被清空，不静默回落 |

两个必须写进测试注释的陷阱：

1. **`reconnection.minUptime` 默认 5000ms。** 房间存活不足 5s 就断线，客户端**不会**重连，直接在 `onDrop` 之后走 `onLeave(1006)`（`@colyseus/sdk/build/Room.mjs:593-595`）。断线演练与测试都必须显式调低它，否则用例会「假失败」。
2. **制造断线要用无 code 的 `transport.close()`（→ `1005`）。** 浏览器 `WebSocket.close(code)` 对非法码会抛 `InvalidAccessError: invalid code`；不要为了「凑一个码」去传非法值。

第三条实践建议：重连是异步的，断言前要 `await` 到 `onReconnect` 或轮询状态，不要用固定 `sleep` 猜时长。

## 9. 可观测性

重连相关的结构化事件与指标至少覆盖下面几项，字段口径与 [测试与可观测性](testing-and-observability.md) 对齐。

| 指标 | 含义 | 告警建议 |
| --- | --- | --- |
| 重连成功数 | 宽限期内成功回到原座位的次数 | 与断线数对比看恢复率 |
| 重连失败数 | 握手失败（`4003`）或超出重试上限的次数 | 失败率上升要告警 |
| 宽限期超时数 | `onLeave` 在 drop 路径上二次触发、且座位被结算的次数 | 持续偏高说明宽限期或网络有问题 |
| 房间销毁数 | 因座位全部释放而 dispose 的房间数 | 与活跃房间数对照 |

事件里带上 `roomId`、`matchId`、`sessionId`、关闭码和策略名。不要记录 `reconnectionToken` 或 `cloudbase_session_id`——它们是 bearer 数据。
