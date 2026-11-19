# Room 适配器模板

在游戏的 `server/src` 包内使用这些片段。Room 拥有生命周期、认证交接、传输注册和命令路由；规则应调用纯 domain 函数。

```text
server/src/
├── index.ts       # server entrypoint and room registration
├── room.ts        # lifecycle and transport adapter
├── state.ts       # synchronized public projection
├── domain/        # pure rules and systems
└── infra/         # external effect adapters
```

Room 应把一条命令翻译成 domain 调用，并把结果翻译成状态更新或稳定响应。它绝不能信任客户端提供的位置、伤害、得分、卡牌效果或奖励数值。
