# 实时竞技场

真实的 Room + Schema + server tick 示例。客户端发送输入意图，服务端推进位置和得分。

```bash
npm install --legacy-peer-deps --install-links=false
npm test
npm run dev    # terminal 1
npm run smoke  # terminal 2
```

关键文件：`server/src/domain.ts` 是纯模拟规则，`server/src/room.ts` 是 authoritative Room，`server/src/index.ts` 是入口，`client/src/index.ts` 是 headless client。

## 包边界

```text
client/     # game-specific client scenario; imports the shared client SDK
protocol/   # game-specific messages; imports the shared protocol package
server/     # Room, Schema, and domain rules; imports the shared server SDK
tests/       # domain and integration tests
```

旧示例通过 file 路径引用维护仓库的 `packages/` 源码，不再附带 SDK 压缩包。运行前先在仓库根目录执行 `npm install` 和 `npm run build:sdk`，然后在本示例目录安装依赖。新游戏使用平台源码模板；这些旧示例只用于玩法参考。

# Recipe: realtime arena

## State ownership

服务端拥有玩家位置、得分、tick 时间和移动边界。客户端发送有界的输入意图；同步 Schema 只包含紧凑的公开投影。

## Suggested file map

- `client/src/index.ts`：headless 加入、输入发送和状态观察。
- `client/src/realtime/`（建议）：本地预测、输入缓冲、回滚与重放、插值渲染的落地位置；做法见 [客户端实时体验（预测、和解与插值）](../../references/client-realtime.md)。本示例只保留 headless client，尚未落地该目录。
- `protocol/src/index.ts`：房间名、scope，以及 input/result 类型。
- `server/src/index.ts`：进程入口（transport、cluster 接线、监听端口）。
- `server/src/room.ts`：Colyseus Room、Schema 投影、固定 tick 和重连范式。
- `server/src/domain.ts`：纯移动和计分规则。
- `tests/domain.test.ts`：确定性移动和计分不变量。
- `tests/reconnect.test.ts`：断线、宽限期、主动离开与刷新恢复的集成断言。

## Tests

`npm test` 同时跑 domain 测试和重连集成测试（进程内真实 `Server` + 真实客户端），再在两个终端分别运行 `npm run dev` 和 `npm run smoke` 验证 WebSocket 路径。

### 重连集成测试

`tests/reconnect.test.ts` 覆盖 [断线与刷新重连](../../references/reconnection.md) 规定的四类路径：

| 用例 | 断言 |
| --- | --- |
| Drop → Reconnect | 服务端事件序列 `join → drop(1005) → reconnect`；`sessionId` 不变；`connected` 回到 `true`；客户端 `onLeave` 未触发 |
| 宽限期超时 | 事件序列 `join → drop(1005) → leave(1005)`；座位被释放。宽限期到期**复用原始断线码**，不是 `4010` |
| 主动离开 | 只有 `leave(4000)`，没有 `drop`；座位被释放 |
| 刷新恢复 | `resumeFrom(store)` 恢复掉线会话并清空 store；store 为空返回 `undefined`；坏 handle / scope 不匹配 / 座位已释放一律稳定失败并清空 store |

两个测试陷阱都在同一份文档里：`reconnection.minUptime` 默认 5000ms（房间存活不足 5s 时客户端不会自动重连），以及制造断线要用无 code 的 `transport.close()`（→ `1005`，浏览器对非法 code 会抛错）。Room 的宽限期在本示例里可通过 join 参数 `{ reconnectGraceSeconds }` 缩短，默认值仍是 `RECONNECT_GRACE_SECONDS = 10`。

## 集群冒烟模式

启动服务端前设置 `SHAPER_CLUSTER=1`、`REDIS_URL`（默认 `redis://172.17.65.21:6379`）和每进程唯一的 `SHAPER_PUBLIC_ADDRESS`。在两个端口上启动同一 recipe，验证跨进程匹配。同一环境的两个进程共用**同一个** `REDIS_NAMESPACE`，否则它们互相看不见。

### 两环境共用同一个 Redis（隔离验证）

用同一个 `REDIS_URL`、不同的 `REDIS_NAMESPACE` 各起一个进程，可以验证命名空间隔离。房间目录与频道会分别落在 `<前缀>roomcaches` / `<前缀>p:<pid>`，所以两个环境的同名房间不会串台、跨环境 join 会失败：

```bash
# 终端 1：环境 A
SHAPER_CLUSTER=1 REDIS_URL=redis://127.0.0.1:6379 REDIS_NAMESPACE=envA: \
  SHAPER_PUBLIC_ADDRESS=ws://127.0.0.1:2601 PORT=2601 npm run dev

# 终端 2：环境 B
SHAPER_CLUSTER=1 REDIS_URL=redis://127.0.0.1:6379 REDIS_NAMESPACE=envB: \
  SHAPER_PUBLIC_ADDRESS=ws://127.0.0.1:2602 PORT=2602 npm run dev

# 终端 3：观测
redis-cli -p 6379 --scan | sort            # 键应按 envA: / envB: 分组
redis-cli -p 6379 pubsub channels '*'      # 频道应带各自前缀
redis-cli -p 6379 hgetall envA:roomcaches  # 只应看到环境 A 的房间
```

不设 `REDIS_NAMESPACE` 时键与频道都不加前缀，行为与不设隔离前一致。完整条款见 [Redis 命名空间隔离](../../references/redis-namespace-isolation.md)。

### 本示例集群模式的已知问题

以 `SHAPER_CLUSTER=1` 启动后，服务端会正常注册进程与房间（键与频道按命名空间落在 Redis 上），但客户端在这条路径上的连接会失败。该失败**与命名空间无关**：不设 `REDIS_NAMESPACE` 时以完全相同的方式失败，无前缀的 `ch:arena` / `roomcaches` / `roomcount` 也一样。单进程模式（不设 `SHAPER_CLUSTER`）的 `npm run smoke` 正常，输出 `{"tick":4,"players":1}`。因此上面的隔离验证以 `redis-cli` 观测为准，不要依赖集群模式下的客户端 join。

`@colyseus/ws-transport` 会无条件 `import "express"`（它是该包的 *optional* peer dependency），本示例此前没有声明 `express`，干净安装后服务端起不来。`server/package.json` 现已显式声明 `"express": "^4.21.2"`（与 `social-party` 的做法一致），该阻塞点已消除。
