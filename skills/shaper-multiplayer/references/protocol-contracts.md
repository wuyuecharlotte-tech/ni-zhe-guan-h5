# 协议契约

共享协议包把隐式约定变成可复用类型。

## Scope 绑定

每个连接配置都携带 `gameId`、`releaseId` 和 `protocolVersion`。客户端校验 resolver 返回的 scope 与它请求的一致。游戏服务端应拒绝指向另一个 scope 的 token 或 join option。

## 命令 envelope

```ts
type Command = {
  id: string;
  name: string;
  payload: unknown;
};
```

`id` 在重试之间保持稳定。`name` 选择 domain 操作。`payload` 在变更之前由游戏服务端校验。共享包会限制 ID 长度、为指纹规范化 JSON、拒绝不支持的值并限制 payload 大小。

## 结果 envelope

```ts
type CommandResult =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: { code: string; message: string } };
```

客户端把超时或断线视作未知结果。服务端错误码对 UI 和遥测足够稳定；其 message 用于解释，可以在客户端边界本地化。

## 通道

- `shaper:command`：由共享服务端 executor 处理的离散命令 envelope。
- `shaper:result`：路由回发起客户端的命令结果。
- `shaper:draining`：可选的房间或运行时排空信号。

游戏特有的高频消息应使用显式名称和有界 payload schema，不应伪装成命令结果。

## 持久幂等

共享 executor 是房间本地且有界的。只要 Room 进程和缓存条目还在，它就能保护重试。奖励、库存、结算和其他持久副作用还需要数据库幂等键。不要声称进程本地的去重能跨重启存活。

幂等键的落地形态是数据库的唯一约束（例如 `(game_id, actor_id, command_id)`），写入用 `insert ... on conflict` 而不是「先查再插」。连接、连接池、表与索引规范以及选型依据见 [持久化](persistence.md)；只有服务端直连数据库。
