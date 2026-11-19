# 架构与归属

Colyseus 给房间提供了有用的生命周期和同步状态投影。一个可维护的游戏会在它周围再加两条边界：承载规则的纯 domain 层，以及承载外部副作用的 infrastructure 层。

```text
client
  -> command payload
Room adapter
  -> validated command
domain systems
  -> state projection + domain events
Room adapter
  -> synchronized state / targeted response
infrastructure adapters
  -> database, queue, metrics, external service
```

## Room 的职责

Room 适配器负责连接准入、认证交接、容量、消息解码、命令路由、生命周期回调和清理。它可以调用 domain 服务，但不应该包含完整的战斗、经济或卡牌结算规则集。

保持 Room 方法足够短，仅凭方法名和它附近的代码就能回答四个问题：

1. 哪个客户端命令或生命周期事件进来了？
2. 变更之前做了哪些校验？
3. 调用了哪个 domain 操作？
4. 哪个状态或响应变得可观察了？

## 状态归属

添加字段前先对每个字段分类：

| 分类 | 示例 | 归属 | 同步规则 |
| --- | --- | --- | --- |
| 公开可观察 | 得分、阶段、位置、准备标记 | Room 状态投影 | 只同步客户端渲染或决策所需的内容 |
| 私有可观察 | 手牌、隐藏目标、战争迷雾视图 | 服务端 + 定向视图 | 绝不把其他玩家的秘密放进共享状态 |
| 临时 | 输入队列、计时器、寻路缓存、限流桶 | domain/Room 内存 | 重启/重连时能安全重建或丢弃 |
| 持久 | 账号库存、对局结果、奖励发放 | 持久化服务 | 通过显式幂等边界写入 |

Schema 状态是投影，不是数据库，也不是调试日志。大段历史应放进事件或存储；密钥留在服务端内存或定向响应路径中。

## 命令契约

把每一条入站消息都当作不可信命令处理：

```ts
type CommandEnvelope<T> = {
  commandId: string;
  clientTick?: number;
  payload: T;
};
```

对每条命令记录：发送者、payload 上限、权限检查、合法阶段、变更操作、幂等策略和失败响应。在接触共享状态之前拒绝格式错误或过期的命令。在当前阶段不合法的命令应产生显式的 domain 错误，供客户端渲染或记录日志。

## Domain 事件与副作用

用 domain 事件表达事实，例如 `MatchStarted`、`PlayerEliminated` 或 `RewardGranted`。Room 可以把事实转换为同步状态。infrastructure 适配器可以消费事实用于持久化或指标。这样数据库故障就不会悄悄改变游戏规则，测试也能在不打开 socket 的情况下断言规则。

## 时间与随机性

给时间指定唯一归属。服务端 tick、回合计时或房间计时器必须由服务端时间推导；客户端可以显示估算值，但不能决定结果。把 clock 和随机源注入纯系统，测试就能用固定输入和已知 seed 重放对局。

## 失败边界

- 非法输入在变更之前失败。
- domain 拒绝时状态保持不变，并返回稳定的错误码。
- infrastructure 失败要报告重试或补偿策略；它不能重复发放奖励。
- 断线把玩家移入明确的重连、认输、观战或移除状态。
- 房间关停只冲刷有显式有界截止时间的副作用。
