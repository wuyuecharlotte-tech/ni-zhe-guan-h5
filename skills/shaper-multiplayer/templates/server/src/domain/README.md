# Domain 模板

让游戏规则独立于 socket、Room 对象、浏览器 API 和数据库客户端。

```text
domain/<bounded-context>/
├── model.ts       # value objects and invariants
├── commands.ts    # accepted intent shapes
├── systems.ts     # state transitions and update ordering
└── rules.test.ts  # fake clock, seeded random, pure assertions
```

暴露窄函数或服务，例如 `acceptMove`、`advanceTick`、`resolveTurn` 或 `grantReward`。返回带稳定错误码的 domain 结果。由 Room 决定该结果如何传输。
