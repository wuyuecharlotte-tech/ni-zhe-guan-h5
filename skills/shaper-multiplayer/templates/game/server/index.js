import { hostname } from "node:os";
import { createServer } from "node:http";
import express from "express";
import { defineRoom, defineServer, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { AFFINITY_HEADER, AFFINITY_QUERY } from "./runtime/protocol.js";
import { admitClient } from "./runtime/admission.js";
import { createClusterServerOptions } from "./runtime/cluster.js";
import { verifyTokenOrThrow } from "./runtime/auth.js";
import { CountRoom } from "./rooms/CountRoom.js";

const ROOM_TYPE = "count";
// 可观测版本号：改这一行并重新源码部署，即可通过 /health 验证更新是否生效。
const DEPLOY_VERSION = "v1";
const GAME_BUILD = `${DEPLOY_VERSION}-${ROOM_TYPE}`;


if (!process.env.GAME_APP_ID || !process.env.GAME_TOKEN_PUBLIC_KEY_B64) throw new Error("GAME_APP_ID and GAME_TOKEN_PUBLIC_KEY_B64 are required");
if (process.env.NODE_ENV === "production" && !process.env.REDIS_URL) throw new Error("REDIS_URL is required in production");
// The platform uses CLIENT_ORIGIN=* for both HTTP and WebSocket origins.
// Preserve the wildcard; an empty setting also defaults to *.
const allowedOrigins = (process.env.CLIENT_ORIGIN?.trim() || '*').split(',').map(value => value.trim()).filter(Boolean);
const originAllowed = origin => !origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin);
const httpServer = createServer();

const clusterOptions = process.env.REDIS_URL
  ? createClusterServerOptions({
      publicAddress: process.env.SHAPER_PUBLIC_ADDRESS,
      selectProcessIdToCreateRoom: () => matchMaker.processId,
      gracefullyShutdown: true,
    })
  : {};

export const server = defineServer({
  ...clusterOptions,
  transport: new WebSocketTransport({ server: httpServer, maxPayload: 65_536, verifyClient: info => originAllowed(info.origin) }),
  greet: false,
  rooms: { [ROOM_TYPE]: defineRoom(CountRoom) },
  express: (app) => {
    app.use(express.json({ limit: "16kb" }));
    app.use((req, res, next) => {
      if (!originAllowed(req.headers.origin)) return res.status(403).json({ error: "ORIGIN_NOT_ALLOWED" });
      res.setHeader("Access-Control-Allow-Origin", allowedOrigins.includes('*') ? '*' : (req.headers.origin || allowedOrigins[0]));
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Hupu-Token");
      res.setHeader("Access-Control-Expose-Headers", AFFINITY_HEADER);
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      next();
    });

    app.get("/health", async (_req, res) => {
      let redis = clusterOptions.presence ? 'unavailable' : 'disabled';
      let timer;
      try {
        if (clusterOptions.presence) {
          await Promise.race([
            clusterOptions.presence.exists('health-probe'),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Redis timeout')), 2000); }),
          ]);
          redis = 'connected';
        }
        res.json({ ok: true, instanceId: hostname(), version: GAME_BUILD, redis,
          appId: process.env.GAME_APP_ID, publicAddress: process.env.SHAPER_PUBLIC_ADDRESS || '' });
      } catch {
        res.status(503).json({ ok: false, redis: 'unavailable' });
      } finally { clearTimeout(timer); }
    });

    app.get("/rooms", async (_req, res) => {
      const rooms = await matchMaker.query({ name: ROOM_TYPE });
      res.json({
        rooms: rooms.map((room) => ({ roomId: room.roomId, clients: room.clients, maxClients: room.maxClients })),
      });
    });

    // 服务端准入：先验签 Game Token，再交给 matchmaker；Room 的 onAuth 会再验一次。
    app.post("/admit", async (req, res) => {
      const gameToken = typeof req.body?.gameToken === "string" ? req.body.gameToken : undefined;
      try {
        verifyTokenOrThrow(gameToken);
      } catch {
        res.status(401).json({ error: "INVALID_GAME_TOKEN", message: "游戏身份令牌无效或已过期" });
        return;
      }
      const affinity = typeof req.query[AFFINITY_QUERY] === "string" ? req.query[AFFINITY_QUERY] : undefined;
      const result = await admitClient({ roomType: ROOM_TYPE, affinity, token: gameToken, options: {} });
      if (result.ok) res.json({ reservation: result.reservation, affinity: result.affinity });
      else res.status(result.status).json({ error: result.code, message: result.message });
    });
  },
});

const port = Number(process.env.PORT ?? 3000);
await server.listen(port, "0.0.0.0");
console.log(`[mp-count-room] listening on ${port} version=${GAME_BUILD} instance=${hostname()}`);
