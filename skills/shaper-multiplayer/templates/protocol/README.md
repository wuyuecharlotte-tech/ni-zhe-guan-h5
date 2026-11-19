# Protocol 包模板

把这条边界复制到 `examples/<game>/protocol`。它拥有游戏特有的 command 和 result 类型，同时从仓库内的 `packages/protocol` 源码 导入通用 envelope、scope、channel 和稳定错误定义。

```text
protocol/
├── package.json       # file:../../../packages/protocol
└── src/
    ├── index.ts       # game scope and public exports
    └── messages.ts    # bounded game-specific command payloads
```

让命令保持为玩家意图。不要把权威状态补丁、服务端密钥、持久化记录或计算出的奖励放进面向客户端的契约。
