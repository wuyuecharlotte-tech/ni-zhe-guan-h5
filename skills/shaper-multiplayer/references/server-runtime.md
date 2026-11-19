# 服务端运行时抽象

新游戏入口是完整的 [源码模板](../templates/game/README.md)。下文共享包与旧示例用于既有项目维护，不是新游戏部署的前置依赖。

`packages/server` 提供房间本地的 `CommandExecutor` 和错误映射。真正的 Room 仍位于 `examples/<game>/server`；共享包永不拥有游戏 Schema 或生命周期。

## 命令执行

executor 串行化已注册的离散操作，为 `{ name, payload }` 生成指纹，并按认证后的 actor 加 command ID 作为去重键。同一个 ID 携带不同内容会返回 `ID_CONFLICT`。待处理工作和已完成条目都有界。

```ts
const result = await executor.execute(client.sessionId, command, () => rules.accept(command.payload));
client.send(RESULT_CHANNEL, result);
```

操作回调是该命令唯一变更 domain 的地方。把外部 I/O 放在窄端口之后，并判断该操作是否可以安全重试。

## 输入与命令

- 离散命令：需要校验、排序、结果和重试身份。
- 高频输入：同步校验，更新输入缓冲区，由服务端 tick 消费。

不要假定 executor 是全局锁，而把 tick 模拟、生命周期回调或任意的 `onMessage` 变更塞进去。如果多条路径变更同一个不变量，让它们走同一个 domain 更新点。

## 认证边界

共享运行时包不签发 Game Token。受保护 Room 使用 `verifyGameToken` 在静态 `onAuth` 中验证平台签名、有效期和自身 `GAME_APP_ID`，再将 `client.auth.sub` 交给 `CommandExecutor`。接线示例见 `game-authentication.md`。

## 持久化边界

executor 的缓存不是持久化的。结算、库存、奖励和检查点需要数据库或 outbox 幂等键。房间销毁应只在有界关停窗口内等待 `executor.idle()`。

落库选型、连接来源、连接池约束、表与索引规范以及「DB 操作不得阻塞主线程」这类注意事项见 [持久化](persistence.md)。该文档给出判断依据而不指定唯一驱动；硬约束是连接只来自环境变量、空连接串必须显式失败。

## 集群适配器

多进程或多主机场景下，用 `@shaper/multiplayer-server` 的 `createClusterServerOptions()` 构造 Colyseus 服务端。它会接入 `@colyseus/redis-presence@0.18.4` 和 `@colyseus/redis-driver@0.18.2`。用 `REDIS_URL` 配置共享 Redis endpoint（默认 `redis://172.17.65.21:6379`），并公布进程特有的 `SHAPER_PUBLIC_ADDRESS`。命令 executor 仍是房间本地的；持久幂等属于共享数据库。

该工厂同时负责 Redis 命名空间隔离：多个环境共用同一个 Redis 时，每个环境用自己的 `REDIS_NAMESPACE`，键走 `keyPrefix`、频道走 `NamespacedPresence`。不要绕过它自建 Redis 连接 —— 只设 `keyPrefix` 会让键隔离而频道互通。条款与反例见 `references/redis-namespace-isolation.md`。
