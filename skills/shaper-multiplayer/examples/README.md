# 可运行示例

这些示例使用真实的 Colyseus v0.18 API，采用 headless Node client，方便在终端和 CI 中运行。每个目录都可以单独安装依赖。共享 SDK 以 `sdk/` 里的 `@shaper/multiplayer-*@0.1.0` 安装包随示例一起带走，不指向 skill 的 `packages/` 目录。

```bash
cd realtime-arena
npm install --legacy-peer-deps --install-links
npm test
```

单个示例：

```bash
cd realtime-arena
npm install --legacy-peer-deps --install-links
npm test
npm run dev       # terminal 1
npm run smoke     # terminal 2
```

每个示例按 `client/`、`protocol/`、`server/` 和 `tests/` 分层：`server/src/domain.ts` 不依赖 Room，`server/src/index.ts` 负责真实房间和状态同步，`client/src/index.ts` 是可运行的 headless client，`protocol/src/index.ts` 只放游戏特有协议类型。

如果 npm 报告 Colyseus 与 Vite 的 peer 依赖冲突，使用：

```bash
npm install --legacy-peer-deps --install-links
```

检查五个示例的目录和脚本：

```bash
npm run check
```

每个游戏都使用 `sdk/`、`client/`、`protocol/`、`server/` 和 `tests/`。`client`、`protocol`、`server` 只放游戏特有代码，并依赖该游戏 `sdk/` 目录里的安装包。

`realtime-arena` 是唯一演示集群接线的示例：它以 `SHAPER_CLUSTER=1` 走 `createClusterServerOptions()`，并在同目录 README 里给出「两环境共用同一个 Redis、各用不同 `REDIS_NAMESPACE`」的隔离验证命令。要求见 [Redis 命名空间隔离](../references/redis-namespace-isolation.md)。

`social-party` 是唯一演示服务端准入的示例：客户端走 bootstrap → admit → connect 三步，服务端 `/admit` 用 `matchMaker.joinOrCreate` 选房/建房并预约座位，客户端不再选房。其余 4 个示例仍是旧路径，需要准入能力时以它为准。要求见 [CloudBase 云托管](../references/cloudbase-run.md)。
