# Redis 命名空间隔离

> **适用**：所有会连 Redis 的部署形态 —— 单环境、多环境共用 Redis、多实例集群。
> **实现**：`packages/server/src/cluster.ts`（技能自有 SDK 是唯一接线点）。
> **上游规范**：本文件是本技能内的权威落点，条款编号（R1–R10）与仓库根目录的 `redis-namespace-isolation.md` 对齐。

---

## 0. 一条规则

**一个环境 = 一个 `REDIS_NAMESPACE` 前缀。**

| 对象 | 处理方式 | 谁来改 |
| --- | --- | --- |
| 键（`roomcaches` / `roomcount` / `ch:` / …） | ioredis `keyPrefix` 自动加前缀 | 不用改代码 |
| Pub/Sub 频道（`p:` / `$` / `ipc:` / …） | **必须自己改写** | `NamespacedPresence` 覆盖 4 个方法 |

两件事都由 `@shaper/multiplayer-server` 的 `createClusterServerOptions()` 处理。你用这个工厂，隔离就成立；你自建 Redis 连接，隔离就不成立。

**不设前缀会真实故障**，不是理论风险：误调度（建房失败）、同名串台（两个环境进同一房间）、误删（删掉别的环境的房间）。三类均已实测复现。

## 1. 为什么必须隔离

### 1.1 触发场景

Colyseus 的集群模式把「哪个进程上有哪些房间」这类**协调信息**全部放在 Redis 里。当下列任一情况出现时，多个**互相独立**的环境会共享同一份协调信息：

- dev / staging / prod 共用一个内网 Redis；
- 每个游戏一个 CloudBase 环境，但这些环境共用同一个 Redis；
- 常驻压测环境与线上环境共用 Redis。

此时各环境会互相看见对方的进程与房间。

### 1.2 根因：协调信息是「全局扁平」的

Colyseus 用到的全部键与频道，**没有任何一个名字里带环境标识**：

| 对象 | 类型 | 真实名称 | 谁写 |
| --- | --- | --- | --- |
| 房间目录 | Hash（字段 = `roomId`） | `roomcaches` | `RedisDriver` |
| 进程负载 | Hash（字段 = `processId`） | `roomcount` | `Stats`（经 presence） |
| 并发建房锁 | Hash + TTL≈1s | `ch:<roomName>` | `MatchMaker`（presence） |
| 房间 IPC | Pub/Sub | `$<roomId>` | `MatchMaker`（presence） |
| 进程 IPC | Pub/Sub | `p:<processId>` | `MatchMaker`（presence） |
| IPC 应答 | Pub/Sub | `ipc:<requestId>` | `IPC`（presence） |
| 建房并发广播 | Pub/Sub | `concurrent:<room>:<key>` | `MatchMaker`（presence） |
| 大厅广播 | Pub/Sub | `$lobby` | `Lobby`（presence） |
| 房间恢复表 | Hash | `roomhistory` | `DevMode`（生产不启用） |
| 用户会话索引 | Hash | `colyseus:user-rooms:<userId>` | `UserSessionIndex`（presence） |

两个后果：

1. **不同环境的条目混在同一个键里** —— `roomcaches` / `roomcount` 是 Hash，各环境是同一 Hash 的不同字段。所以严格说不是「键名冲突」，而是**共享命名空间带来的语义耦合**。
2. **频道名虽然全局唯一（ID 随机），但「谁能看见谁」不设限** —— 同一 Redis 上任何进程都能订阅别人的 `p:` / `$` 频道。

> 易错点：`RedisDriver.getRooms()` 是 `hgetall(roomcaches)` **全量拉取**，再在 JS 里按 `"name":"<房间名>"` 子串过滤。共享时每次匹配都要解析**所有环境**的房间，且 metadata 里出现该字面量会误匹配。隔离后这两点一并消失。

### 1.3 三类失败模式（均已实测复现）

| # | 名称 | 现象 | 严重度 |
| --- | --- | --- | --- |
| **F1** | 误调度 | 建房请求被派给**别的环境**的进程 → `523 MATCHMAKE_NO_HANDLER`。实测连试 5 次，5/5 失败 | 功能性故障，立刻可见 |
| **F2** | 同名串台 | 两个环境跑**同名**游戏时进**同一个房间**；座位预约里的 `publicAddress` 指向**建房进程所在环境** → 玩家被导向别的环境 | **静默**，最危险 |
| **F3** | 误删 | 健康检查把**别的环境**的进程从 `roomcount` 剔除，并删掉它登记的全部房间。对方进程毫不知情 → 房间变孤儿：新玩家匹配不到、重连失败 | 破坏性、不可逆 |

F1 的机制链：默认调度器从共享 `roomcount` 里挑**全局**最空闲进程 → 房间被派到别的环境 → 该进程 `getHandler` 查不到房间类型 → 抛 523。因为 Pub/Sub 也是全局的，这条请求**真的**发到了对方进程上。

F3 的机制链：`healthCheckAllProcesses()` 拿 `stats.fetchAll()`（含别的环境）与 `presence.channels("p:*")`（含别的环境）比对，认为「在 `roomcount` 里但频道不在」的进程已死 → `excludeProcess()` + `removeRoomsByProcessId()`。对方进程只是**恰好那一刻**没订阅上（重启中、Redis 抖动），就会被误判。

> 关键洞察：**F1 只是「功能坏了」，F2/F3 是「数据被别人动了」。** 只加自定义调度器能治 F1，治不了 F2/F3 —— 因为它们由 `stats` / `pubsub` 的机制决定，与调度器无关。

## 2. 规范条款

### 必须（MUST）

**R1 · 多环境共用 Redis 时，每个环境必须设置互不相同的 `REDIS_NAMESPACE`。**
未设置的默认值是空串，即全局键空间 —— 在共用场景下等于没有隔离。

**R2 · 前缀必须唯一、稳定，并建议以分隔符结尾（如 `dev:` / `prod:`）。**
同一环境的所有实例必须用**同一**前缀，否则实例之间互相看不见，集群能力失效。前缀用环境标识（dev/staging/prod 或 CloudBase 环境 ID），不要用随机值 —— 重启后必须还是同一个。

**R3 · 频道必须由 `NamespacedPresence` 改写，不得依赖 `keyPrefix`。**
`keyPrefix` **不作用于 Pub/Sub 频道**（含 `PUBSUB CHANNELS` 的 pattern 参数）。

**R4 · `channels()` 必须「加前缀查询 + 去前缀返回」。**
core 的健康检查会拿返回值 `substring(2)` 剥掉 `p:`。返回带前缀的名字会让**每个存活进程都被误判为掉线**，从而反复触发健康检查、放大 F3 的误判窗口。

**R5 · 构造 `RedisPresence` 必须传 options 对象，不能传连接串。**
传字符串时 `RedisPresence` 走 `new Redis(options)` 分支，**丢弃第二个参数**，`keyPrefix` 静默失效。这是本规范里最隐蔽的坑：不报错、不告警，只是隔离悄悄失效。

**R6 · 新增任何 Redis 访问必须走统一入口，不得自建裸连接。**
技能内唯一入口是 `@shaper/multiplayer-server` 的 `createClusterServerOptions()`；包内唯一接线点是 `packages/server/src/cluster.ts`。自建 `new Redis(url)` 会绕过命名空间，产生「一半隔离」的假象。

**R7 · 不得修改 `node_modules` 或 fork Colyseus core。**
全部通过 `defineServer({ driver, presence })` 官方注入点完成。

**R8 · 实例必须优雅退出（`SIGTERM`），不要 `SIGKILL`。**
硬杀会留下需要回收的残留房间。用 `gracefullyShutdown: true`。

### 建议（SHOULD）

**R9 · 单环境部署留空即可，不必强行设置前缀。**
空前缀时行为与改造前**完全一致**（键与频道都不加前缀），是官方支持的退化路径。

**R10 · 灰度时按环境维度整体切换，不要在同一环境内混用。**
前缀只影响「没设前缀」与「设了前缀」两端，中间态不存在 —— 所以**同一环境的所有实例必须同时切换**，否则新旧实例互相看不见。

## 3. 怎么用

### 3.1 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `REDIS_URL` | 未设置 | **设置后进入集群模式**；留空 = 单机（内存 driver / presence） |
| `REDIS_NAMESPACE` | `""`（空） | **本环境命名空间前缀**。多环境共用 Redis 时必填且互不相同 |
| `REDIS_KEY_PREFIX` | `""`（空） | 兼容别名，等价于 `REDIS_NAMESPACE`。新配置一律用 `REDIS_NAMESPACE` |
| `REDIS_PASSWORD` / `REDIS_DB` | — | 凭证与分库。分库**不隔离频道**，不要用它代替命名空间 |
| `SHAPER_PUBLIC_ADDRESS` | — | 实例自己的对外可达地址，写入座位预约 |

命名建议：用**环境标识 + 分隔符**，例如 `dev:` / `staging:` / `prod:`，或直接用 CloudBase 环境 ID。

### 3.2 唯一接线方式

```ts
import { createClusterServerOptions } from "@shaper/multiplayer-server";

// REDIS_URL=redis://内网地址:6379
// REDIS_NAMESPACE=prod:
const gameServer = new Server(createClusterServerOptions({
  publicAddress: process.env.SHAPER_PUBLIC_ADDRESS,
  transport,
  gracefullyShutdown: true,
}));
```

工厂内部做两件事：给 `RedisDriver` 一个带 `keyPrefix` 的连接（隔离键），给 `NamespacedPresence` 一个前缀（隔离频道）。**调用方不需要额外代码。**

需要显式传值时（例如一个进程内模拟两个环境，或测试夹具）用 `redis: { namespace }` 覆盖环境变量：

```ts
createClusterServerOptions({ publicAddress, transport, redis: { namespace: "envA:" } });
```

### 3.3 多环境共用 Redis 的部署形态

```bash
# 环境 A
REDIS_URL=redis://172.17.65.21:6379 REDIS_NAMESPACE=envA: SHAPER_PUBLIC_ADDRESS=wss://game-a.example.com PORT=2601 npm start

# 环境 B（同一 Redis，不同前缀）
REDIS_URL=redis://172.17.65.21:6379 REDIS_NAMESPACE=envB: SHAPER_PUBLIC_ADDRESS=wss://game-b.example.com PORT=2602 npm start
```

同一环境内的多个实例用**同一个** `REDIS_NAMESPACE`，各自的 `SHAPER_PUBLIC_ADDRESS` 与 `PORT` 不同。

> ⚠️ 命令行环境变量**优先于** `.env`。若本地 `.env` 里已经写了某个前缀，直接起两个环境时会**两个都用它** —— 等于没有隔离。多环境场景必须显式覆盖。

### 3.4 反例（都会静默失效）

```ts
// ❌ 只设 keyPrefix：键隔离了，频道没隔离 —— 一半隔离的假象
new RedisPresence({ host, port, keyPrefix: "envA:" });

// ❌ 传连接串：第二个参数被丢弃，keyPrefix 为空串，键其实没隔离
new RedisPresence("redis://172.17.65.21:6379", { keyPrefix: "envA:" } as any);

// ❌ 自建裸连接：绕过命名空间
new RedisDriver(new Redis("redis://172.17.65.21:6379"));

// ❌ 用分库代替命名空间：Pub/Sub 不按 DB 隔离，频道仍然全局可见
new RedisPresence({ host, port, db: 1 });
```

### 3.5 常见错误

| 错误 | 后果 | 正确做法 |
| --- | --- | --- |
| 两个环境用同一个前缀（或都用默认值） | 等于没隔离，F1/F2/F3 照旧 | 显式设成不同的前缀（R1） |
| 只设 `keyPrefix`、没改频道 | 键隔离了、频道没隔离 | 用 `createClusterServerOptions()`（R3） |
| 用 `db: 1` 分库 | Pub/Sub 仍全局 | 同上 |
| `channels()` 返回带前缀的名字 | 每个存活进程都被误判掉线 | 加前缀查、去前缀返回（R4） |
| 给 `RedisPresence` 传连接串 + 前缀 | `keyPrefix` 静默失效 | 传 options 对象（R5） |
| 自建 `new Redis(url)` 直连 | 绕过命名空间 | 走统一入口（R6） |
| 同一环境一半实例设前缀、一半没设 | 实例互相看不见，集群能力失效 | 环境内同时切换（R10） |
| 用 `SIGKILL` 停实例 | 留下残留房间 | 用 `SIGTERM`（R8） |
| 命名空间用随机值 | 重启后前缀变化 → 看不到自己的房间 | 用稳定的环境标识（R2） |

## 4. 实现要点（维护 SDK 时读）

`packages/server/src/cluster.ts` 导出四样东西：

| 导出 | 作用 |
| --- | --- |
| `namespacePrefix(config)` | 解析命名空间：`config.namespace` → `config.keyPrefix` → `REDIS_NAMESPACE` → `REDIS_KEY_PREFIX` → `""` |
| `namespaceChannel` / `stripNamespace` | 纯函数，加前缀 / 去前缀；空前缀时是恒等函数 |
| `NamespacedPresence` | `extends RedisPresence`，只覆盖 `subscribe` / `unsubscribe` / `publish` / `channels` |
| `createClusterServices` / `createClusterServerOptions` | 把隔离后的 driver 与 presence 注入 `Server` |

设计取舍：

- **继承而不是全量代理。** presence 有 20+ 个键方法；逐个转发意味着上游每加一个方法就**静默**漏一个。继承后键全部由构造参数里的 `keyPrefix` 处理，我们只维护 4 个频道方法。
- **`subscribe` 走 `super`。** 基类按（带前缀的）名字登记订阅，`resubscribeAll()` 在重连后自动用同样的名字恢复，不需要额外代码。
- **房间级 presence 自动继承前缀。** `MatchMaker` 用 `createScopedPresence(room, presence)` 派生房间级 presence，走 `Object.create(presence)` → 原型链上就是 `NamespacedPresence` 实例。所以房间内部经 `room.presence` 的写入同样带前缀。

周边包不构成缺口：`@colyseus/auth` 走 `matchMaker.presence?.get/setex`（注入对象）；`@colyseus/monitor` / `playground` 走 `matchMaker.query()`；`@colyseus/database` 用 PostgreSQL，与 Redis 无关。

> ⚠️ 唯一条件项：`@colyseus/tools` 的 `getColyseusCloudConfig()` 会在 **`COLYSEUS_CLOUD` 已设置**时**覆盖**注入的 driver/presence。本项目未设置该变量 → 不触发。**若将来启用 Colyseus Cloud，必须重新评估这一条。**

维护边界：依赖的只是 `defineServer` 的 `driver` / `presence` 注入点（公开 API）、`Presence` 接口的公开方法签名、以及键与频道的**命名**。第三项在 `0.18.x` 内稳定，**升级 Colyseus 时需要回归**本文件 §5 的检查。

## 5. 验证

### 5.1 本地检查

```bash
# 在技能根目录
npm run check:namespace
python3 scripts/validate_skill.py .
```

`check:namespace` 分三层：纯函数断言（加前缀 / 去前缀 / 空前缀恒等）、源码结构断言（继承关系、四个方法、无裸连接）、真实 Redis 断言（两命名空间互不可见、`channels()` 返回去前缀结果）。第三层在 `127.0.0.1:6379` 不可达时明确跳过，不阻塞 CI。

### 5.2 观测隔离效果

```bash
redis-cli -p 6379 --scan | sort            # 键：应按前缀分组
redis-cli -p 6379 pubsub channels '*'      # 频道：不应出现别人的前缀
redis-cli -p 6379 hgetall envA:roomcaches  # 只应看到 envA 自己的房间
```

**隔离后**（`envA:` / `envB:`）应看到两套前缀并存、互不交叉：键是 `envA:roomcaches` / `envB:roomcaches`，频道是 `envA:p:<pid>` / `envB:p:<pid>`。除前缀外，键的类型、值结构、生命周期完全一致 —— 这是同一套数据模型的两个命名空间。

### 5.3 端到端验收（两环境共用 Redis）

1. 起两个进程，同名游戏，`REDIS_NAMESPACE` 分别为 `envA:` / `envB:`。
2. 各自建房 → 两个 `roomId` 不同、`publicAddress` 各自指向自己的进程（不是 F2 同名串台）。
3. 用环境 A 的入口去 join 环境 B 的 `roomId` → 应失败（`522 room not found`），因为目录已隔离。
4. `envA:*` / `envB:*` 的键与频道各自成组；环境 A 建房全部落在 A 的进程上（不是 F1 误调度）。

## 6. 运维

**① 用 `SIGTERM` 退出，不要 `SIGKILL`。** 硬杀会让房间目录留下残留（进程已死、房间还在）。好在**能被自愈**：同命名空间的新实例启动时会执行 `healthCheckAllProcesses()`，把「在 `roomcount` 里但 `p:` 频道不在」的进程连同其房间一起清理。

**② 但「无主房间」永远不会被自动回收。** 健康检查只遍历 `roomcount` 里的 `processId`。若某个房间的 `processId` **不在** `roomcount` 里（例如清理方在 `excludeProcess()` 与 `removeRoomsByProcessId()` 之间被杀），它就永远进不了回收路径，需要人工处理。

**排查手法**：某个房间「新玩家匹配不到、重连失败」，多半就是这种残留。

```bash
redis-cli -p 6379 hgetall <前缀>roomcaches            # 看每个房间的 processId
redis-cli -p 6379 hgetall <前缀>roomcount             # 看进程是否还在册
redis-cli -p 6379 hdel <前缀>roomcaches <roomId>      # 清掉无主房间
```

**③ 隔离只作用于「环境之间」。** 同一命名空间内的多实例仍然共享 `roomcount`，房间跨实例可见、按负载分散 —— 这是有意保留的集群能力，不是缺陷。

## 7. 命名空间由谁提供

技能只负责让隔离**可被启用且默认正确**；前缀本身由部署侧提供。

- **CloudBase 云托管**：部署者在官方 MCP 源码部署配置中写入 `REDIS_NAMESPACE`，值由该应用绑定的 envId 派生（形如 `<envId>:`）；后续更新必须沿用同一命名空间。
- **本地、pm2、自建主机**：没有平台注入，必须按 §3.3 显式设置，或用 `redis: { namespace }` 传入。
- 多个环境共用同一 Redis 时，每个环境必须各自带上自己的前缀；单环境部署留空即可（R9）。

> ⚠️ 前缀按 **Project** 派生，不是按 stage。因此不同 Project 之间天然隔离；**同一个 Project 内不会因为 stage 不同而自动拿到不同前缀**。若同一个 Redis 上还需要再区分 stage（典型是常驻压测环境与线上共用一个 CloudBase 环境），要额外叠加 stage 维度，例如 `<envId>:<stage>:`。

相关文档：[集群部署](cluster-deployment.md)、[CloudBase 云托管](cloudbase-run.md)、[生产检查清单](production-checklist.md)。
