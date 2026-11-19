# 推荐的项目结构

使用这种四包游戏布局。名字只是约定，重要的是依赖方向。通用 SDK 包位于 skill 内，以依赖方式安装，而不是复制进每个游戏。

```text
game/
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── features/
│       └── views/
├── protocol/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts       # game-specific contracts + shared protocol re-exports
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts       # defineServer and Room registration
│       ├── room.ts        # transport and lifecycle adapter
│       ├── state.ts       # public Schema projection
│       ├── domain/
│       │   ├── <bounded-context>/
│       │   │   ├── model.ts
│       │   │   ├── commands.ts
│       │   │   ├── systems.ts
│       │   │   └── rules.test.ts
│       └── infra/
│           ├── persistence/
│           ├── matchmaking/
│           └── telemetry/
└── tests/
    ├── domain.test.ts
    ├── protocol.test.ts
    └── room.integration.test.ts
```

## 依赖方向

```text
client -> shared client SDK + game protocol
protocol -> shared protocol SDK
server/src/index.ts -> shared server SDK + game protocol
server/src/room.ts -> server/src/domain + game protocol
server/src/domain -> no sockets, browser APIs, or database clients
server/src/infra -> narrow domain/application ports
tests -> client/protocol/server boundaries as needed
```

domain 不得 import socket、Room、浏览器 API、数据库客户端或渲染器。客户端不得 import 服务端 domain 代码。可复用 SDK 包提供连接/会话、envelope 和命令运行时行为；游戏包只提供游戏特有的规则和契约。

## 部署边界

即使共用一个仓库，`client` 与 `server` 也要分开部署。遵循 [分离部署](split-deployment.md)。

- `client` 产出静态构建产物。它的 Colyseus endpoint 是构建期的公网 URL，不是 `location.hostname` 加端口。
- `server` 是唯一调用 `listen` 的进程。它不提供客户端 bundle。
- `protocol` 是两者共用的库依赖。它不作为独立服务部署。

## 各包职责

- `client`：把用户操作翻译成意图命令，并渲染由服务端拥有的投影。
- `protocol`：定义有界的游戏特有 command/result 类型，并 re-export 共享的 channel 和 error。
- `server`：拥有 Room/Schema 适配器、权威 domain 规则和外部副作用端口。
- `tests`：证明 domain 不变量、协议兼容性、Room 集成、重连和清理。

按「会一起变化的规则」切分 domain 目录，例如 `combat`、`turns`、`cards` 或 `party`。避免巨大的 `utils` 目录，也避免一个 `game.ts` 同时拥有传输、规则、持久化和展示。
