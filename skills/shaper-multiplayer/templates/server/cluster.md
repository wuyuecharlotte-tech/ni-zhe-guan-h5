# 集群接线模板（`createClusterServerOptions()`）

> **边界草稿。** 这是把单个 Room 进程接进 Redis 集群的接线形状，不是可独立编译的产物。三件套环境变量、负载均衡要求与状态边界以 [多进程集群部署](../../references/cluster-deployment.md) 为唯一权威，键与频道的隔离条款（R1–R10）以 [Redis 命名空间隔离](../../references/redis-namespace-isolation.md) 为唯一权威。编译前先对照上游 v0.18.0 skill 核实 `Server` / `WebSocketTransport` 的确切签名。

## 最小接线

集群模式只有一条正确入口：`@shaper/multiplayer-server` 的 `createClusterServerOptions()`。它把命名空间化的 driver 与 presence 注入 `Server`；**不要**绕过工厂自建 `new Redis(...)`，否则隔离只是假象。

```ts
// server/src/index.ts —— 复制后把 "arena" / ArenaRoom 换成游戏自己的房间。
import { createServer } from "node:http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createClusterServerOptions } from "@shaper/multiplayer-server";

const httpServer = createServer();

const gameServer = new Server(createClusterServerOptions({
  publicAddress: process.env.SHAPER_PUBLIC_ADDRESS,
  transport: new WebSocketTransport({ server: httpServer, maxPayload: 65_536 }),
  // 优雅退出：终止前把本进程移出负载，停准入、等房间销毁，再结束。
  gracefullyShutdown: true,
  // 用 CloudBase 会话亲和性时建房必须落在本进程（见 cloudbase-run.md）；
  // 自建带路由亲和性的负载均衡时不需要这一条。
  selectProcessIdToCreateRoom: () => matchMaker.processId,
}));

gameServer.define("arena", ArenaRoom);
await gameServer.listen(Number(process.env.PORT ?? 2601), "0.0.0.0");
```

## 三件套环境变量

```text
REDIS_URL=redis://<内网地址>:6379        # 设置即进入集群模式；留空 = 单机（内存 driver/presence）
REDIS_NAMESPACE=<envId>:                 # 本环境的隔离前缀；多环境共用同一 Redis 时必填且互不相同
SHAPER_PUBLIC_ADDRESS=wss://game-1.example.com   # 本进程对外可达地址；缺失时工厂显式抛错
```

要点：同一环境的多个实例必须用**同一个** `REDIS_NAMESPACE`，各自的 `SHAPER_PUBLIC_ADDRESS` 与 `PORT` 不同；前缀用稳定的环境标识，不要用随机值。默认值与必填条件见 [环境变量总表](../../references/environment-variables.md)，完整条款见 [Redis 命名空间隔离](../../references/redis-namespace-isolation.md)。下载版通过官方 MCP 部署时按真实服务域名配置，不要猜域名。

## 已知现象（不是模板问题）

示例 `realtime-arena` 以 `SHAPER_CLUSTER=1` 启动集群模式时，服务端会正常注册进程与房间（Redis 上的键与频道按命名空间落位），但客户端在这条路径上 join 会失败。该失败与命名空间无关（不设 `REDIS_NAMESPACE` 时同样失败），原因与修复不在本模板范围。照抄本模板后若遇到该现象，先用 `redis-cli` 观测键与频道确认隔离成立，不要据此判断接线写错；单进程模式（不设 Redis）应能正常 `npm run smoke`。

## 关联

- 权威页：[多进程集群部署](../../references/cluster-deployment.md)、[Redis 命名空间隔离](../../references/redis-namespace-isolation.md)
- 变量归属：[环境变量总表](../../references/environment-variables.md)
- 亲和性与准入：[CloudBase 云托管](../../references/cloudbase-run.md)、[准入端点模板](./admission.md)
- 同一 server 包的其它骨架：[server 模板说明](./README.md)、[持久化适配器](./persistence.md)
