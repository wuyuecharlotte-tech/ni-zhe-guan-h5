# 多进程集群部署

源码模板 server/runtime/cluster.js 支持带 Redis 匹配和 IPC 的 Colyseus 集群。为每个进程设置同一个 Redis endpoint，并给每个进程一个可达的 `SHAPER_PUBLIC_ADDRESS`。

```text
REDIS_URL=redis://172.17.65.21:6379
REDIS_PASSWORD=<secret-if-required>
REDIS_DB=0
REDIS_NAMESPACE=prod:
SHAPER_PUBLIC_ADDRESS=game-1.example.com
PORT=2601
```

`REDIS_NAMESPACE` 是本环境的隔离前缀。源码模板要求非空；多个环境共用 Redis 时每个环境必须互不相同。 详见 `references/redis-namespace-isolation.md`。

用共享工厂创建服务端：

```ts
import { createServer } from "node:http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createClusterServerOptions } from "./runtime/cluster.js";

const httpServer = createServer();
const gameServer = new Server(createClusterServerOptions({
  publicAddress: process.env.SHAPER_PUBLIC_ADDRESS,
  transport: new WebSocketTransport({ server: httpServer, maxPayload: 65_536 }),
  gracefullyShutdown: true,
}));
gameServer.define("arena", ArenaRoom);
await gameServer.listen(Number(process.env.PORT ?? 2601), "0.0.0.0");
```

每个公网服务端地址运行一个进程。Redis Presence 承载 Colyseus 进程间消息，Redis Driver 存储共享房间目录。一个 Room 及其权威状态仍然只存在于一个进程中。客户端先到达任意健康的匹配进程；Colyseus 之后用记录的公网地址把房间 join 路由到拥有该房间的进程。

## 多环境共用同一个 Redis

同一个 Redis 被两个以上互相独立的环境共享时（dev/staging/prod、多活动环境、压测环境与线上环境），各环境会互相看见对方的进程与房间，产生误调度、同名串台与误删房间三类故障。隔离办法是给每个环境一个互不相同的 `REDIS_NAMESPACE`，并且只走 `createClusterServerOptions()`；不要绕过工厂自建 Redis 连接。三类故障的实测现象（含 `523 MATCHMAKE_NO_HANDLER`）见 `references/redis-namespace-isolation.md` §1.3，键与频道两半的隔离机制、完整条款（R1–R10）、反例与验证命令见同一文档。

## 负载均衡要求

- 转发 HTTP 匹配路由和 WebSocket `Upgrade`/`Connection` 头。
- 保持房间 metadata 中返回的地址对客户端可达。使用每进程 hostname，或使用能保留所选进程的负载均衡路由。一个不带路由亲和性的共享地址会把 socket 送到错误的进程。
- CloudBase 云托管给每个副本同一个公网 hostname。在该 hostname 上的多进程部署必须打开会话亲和性，并把网关 token 放进 query 参数 `cloudbase_session_id`（**实例**亲和 token，全房间共用，不是 Colyseus 的每玩家 `sessionId`）；在该文档的验收通过之前，不要发布多个副本。发布顺序、准入流程与「发现可以全局，创建必须本地」的约束见 `references/cloudbase-run.md`。
- 健康检查必须在终止前把进程移出。设置 `gracefullyShutdown: true`，停止新准入，等待房间销毁，然后终止。
- 在整个发布过程中保持 `REDIS_URL`、Redis 凭证、协议版本和服务端构建兼容。

## 状态与重试边界

SDK 的 `CommandExecutor` 缓存是进程本地的。持久奖励、库存、结算和幂等记录属于带唯一键（例如 `(game_id, actor_id, command_id)`）的共享数据库。Redis Presence/Driver 不会让 Room 的模拟状态持久化，也不会恢复崩溃的 Room。

不要把密钥存进 `SHAPER_PUBLIC_ADDRESS` 或客户端配置。只在服务端运行时环境中使用 `REDIS_PASSWORD` 或带密钥的 `REDIS_URL`。

## 进程标识与端口

`PORT` 是本地监听端口；`SHAPER_PUBLIC_ADDRESS` 是为该进程拥有的房间公布的对外可达地址。在容器中绑定 `0.0.0.0`，并公布服务地址，而不是容器 loopback 地址。在你控制负载均衡时，为每个进程使用不同的端口和公网地址。CloudBase 云托管上多个副本共用一个公网地址，所以遵循 `references/cloudbase-run.md`，不要为每个副本臆造一个 hostname。
