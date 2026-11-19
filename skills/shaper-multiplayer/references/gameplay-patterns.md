# 玩法模式

## 固定 tick 的实时模拟

移动和战斗使用服务端拥有的固定节奏。客户端发送带序号（sequence number）的输入，并渲染插值后的投影。服务端对每条输入最多消费一次，应用有界的加速度和移动规则，然后发布紧凑的状态投影。

```text
receive input -> validate -> queue by player
tick start    -> drain bounded inputs
simulate      -> resolve collisions and effects
publish       -> update observable state
```

不要把客户端时间戳当作事实来源。如果服务端落后，测量延迟并应用明确的过载策略：限制每 tick 的工作量、丢弃被取代的输入，或暂停准入。

客户端侧的预测、和解与插值（以及输入缓冲的形状）见 [客户端实时体验（预测、和解与插值）](client-realtime.md)，本节不重复。

## 回合与阶段状态机

用有限状态机表示阶段。每条命令声明它在哪些阶段合法。状态转换记录原因和服务端截止时间。

```ts
type Phase = "lobby" | "planning" | "resolving" | "finished";

type TurnContext = {
  phase: Phase;
  activePlayerId?: string;
  deadlineAt?: number;
  turnNumber: number;
};
```

截止时间由服务端结算。重连的客户端会收到当前阶段和截止时间；它不会获得重放一条已被接受命令的权限。

## 幂等命令

对网络失败后可能重试的命令，携带以玩家和对局为作用域的 `commandId`。在有界窗口内保存最近接受的 ID，或根据当前回合推导出确定性结果。重复命令返回原始结果或稳定的重复错误，而不重复应用变更。

## 确定性随机

随机结果的生成留在服务端。对需要重放或争议处理的规则，向 domain 注入带 seed 的随机源，并记录 seed 或结果事件。不要向客户端发送未来的牌序或隐藏随机源。

## 重连

四类策略（恢复 / 认输 / 观战 / 移除）的判定规则、宽限期取值、关闭码语义与服务端 `allowReconnection` 范式都在 [断线与刷新重连](reconnection.md)，本节不重复。

与回合/阶段状态机相关的两条结论留在本文：

1. 重连回来的客户端收到的是**当前**阶段、`turnNumber` 和 `deadlineAt`，不获得重放已被接受命令的权限。
2. 除非 recipe 明确在 domain 里停表，玩家断线期间截止时间仍按服务端时间走。需要「暂停」效果就在 domain 里显式停表，不要靠重连逻辑补偿时间差。

## 持久化边界

持久化必须跨进程重启存活的事实，例如账号归属、对局结果或已发放奖励。不要每帧都持久化。为奖励或结果写入使用幂等键，并让房间关停路径有界。

## 频率与 payload 限制

在 domain 变更之前应用限制：最大 payload 字节数、命令频率、队列深度和每玩家工作量。即使命令本身合法，玩家超出策略上限时仍可被拒绝。用关联 ID 记录原因，但不记录密钥。
