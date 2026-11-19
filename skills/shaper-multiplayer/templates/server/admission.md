# 准入端点模板（`/health` + `/admit` + `/rooms`）

> **边界草稿。** 这是把服务端准入接进游戏 `server/src/index.ts` 的接线形状，不是可独立编译的产物。端点契约、五个 id 的区别、发布顺序与开通后验收以 [CloudBase 云托管](../../references/cloudbase-run.md) 为唯一权威；错误码含义与客户端处置见 [稳定错误码总表](../../references/stable-error-codes.md)。编译前先对照上游 v0.18.0 skill 核实 `defineServer`、`express` 与 `matchMaker` 的确切签名。

客户端只做两步：**admit → connect**。游戏代码不自己建房、不自己选房、不探测 `wss://`（`fetch` 不支持 `ws(s)://`，要探测先转成 `https://`）。

1. **admit**：客户端生成随机 `cloudbase_session_id`，带 `?cloudbase_session_id=<随机值>` 调 `POST /admit`，服务端选房/建房并预约座位，返回 `{ reservation, affinity }`。
2. **connect**：使用返回的 `affinity` 和 `reservation` 连接 WebSocket。

## 端点契约

只列「输入 / 输出形状」；失败分支的触发条件与处置不在这里复述。

| 端点 | 输入 | 成功响应 |
| --- | --- | --- |
| `GET /health` | 无 | `200 { ok: true, instanceId }`（仅用于运维验收） |
| `POST /admit` | query `cloudbase_session_id`（必填）+ JSON body；受保护 Room 必须包含 `gameToken`，其余字段才透传进 `matchMaker.joinOrCreate` | `200 { reservation, affinity }`；`affinity` 是房间 metadata 里记录的网关 token |
| `GET /rooms` | 无 | `200 { rooms: [{ roomId, clients, maxClients }] }` |

失败时返回稳定错误码（`AFFINITY_REQUIRED` / `ROOM_AFFINITY_MISSING` / `ADMISSION_FAILED`）与对应 HTTP 状态；准入助手的判据见 [CloudBase 云托管](../../references/cloudbase-run.md)，码的处置见 [稳定错误码总表](../../references/stable-error-codes.md)。

## 接线骨架

```ts
// server/src/index.ts —— 复制后把 ROOM_TYPE / GameRoom / CLIENT_ORIGIN 换成游戏自己的。
import { hostname } from "node:os";
import { createServer } from "node:http";
import express from "express";
import { defineRoom, defineServer, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { AFFINITY_HEADER, AFFINITY_QUERY } from "@shaper/multiplayer-protocol";
import { admitClient } from "@shaper/multiplayer-server";

const httpServer = createServer();

export const server = defineServer({
  transport: new WebSocketTransport({ server: httpServer, maxPayload: 65_536 }),
  rooms: { [ROOM_TYPE]: defineRoom(GameRoom) },
  express: (app) => {
    // Colyseus 只给自己的 /matchmake/* 路由做 body 解析，自定义 POST 必须显式加 JSON parser。
    app.use(express.json({ limit: "64kb" }));
    app.use((req, res, next) => {
      // 直连云托管公网域名时由容器负责 CORS；网关路由则由网关按安全域名补充。
      res.setHeader("Access-Control-Allow-Origin", CLIENT_ORIGIN || "*");
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Hupu-Token"
      );
      // 如经网关使用响应头传递额外信息，可在此暴露；随机 affinity 本身不依赖 /health 响应头。
      res.setHeader("Access-Control-Expose-Headers", AFFINITY_HEADER);
      if (req.method === "OPTIONS") { res.sendStatus(204); return; }
      next();
    });

    // 1) bootstrap：instanceId 用于核对请求落在哪台实例；token 由网关写在响应头。
    app.get("/health", (_req, res) => { res.json({ ok: true, instanceId: hostname() }); });

    // 2) admit：服务端选房/建房 + 预约座位 + 回读房间记录的 affinity。
    app.post("/admit", async (req, res) => {
      const affinity = typeof req.query[AFFINITY_QUERY] === "string"
        ? (req.query[AFFINITY_QUERY] as string)
        : undefined;
      const result = await admitClient({ roomType: ROOM_TYPE, affinity, token: req.body?.gameToken, options: req.body ?? {} });
      if (result.ok) res.json({ reservation: result.reservation, affinity: result.affinity });
      else res.status(result.status).json({ error: result.code, message: result.message });
    });

    // 3) 展示用房间列表：只回公开字段。
    app.get("/rooms", async (_req, res) => {
      const rooms = await matchMaker.query({ name: ROOM_TYPE });
      res.json({ rooms: publicRooms(rooms) });
    });
  },
});

process.env.PORT ??= "3000";
await server.listen(Number(process.env.PORT), "0.0.0.0");
```

## 两条红线

1. **`GET /rooms` 不得返回 `cloudbase_session_id`。** 它是实例路由键，只应回给已被准入的客户端；列表只含 `roomId` / `clients` / `maxClients`（见示例 `publicRooms()`）。准入决策由服务端 `/admit` 完成，客户端不拉列表、不排序、不选房。
2. **创建必须本地。** 用 CloudBase 会话亲和性时，新房间必须建在收到请求的本进程（`selectProcessIdToCreateRoom: () => matchMaker.processId`）：实例不知道别的实例的 `cloudbase_session_id`，无法把客户端改签到别处。发现房间可以全局，创建必须本地。

## 关联

- 权威页：[CloudBase 云托管](../../references/cloudbase-run.md)
- 错误码：[稳定错误码总表](../../references/stable-error-codes.md)
- 变量归属：[环境变量总表](../../references/environment-variables.md)
- 同一 server 包的其它骨架：[server 模板说明](./README.md)、[集群接线](./cluster.md)、[持久化适配器](./persistence.md)
