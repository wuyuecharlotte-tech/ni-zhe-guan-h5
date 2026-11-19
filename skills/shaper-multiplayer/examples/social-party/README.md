# 社交派对

真实的短局 Party Room。玩家发送 ready 和 vote，服务端控制阶段、投票和结果。

```bash
npm install --legacy-peer-deps --install-links=false
npm test
npm run dev    # terminal 1
npm run smoke  # terminal 2
```

额外断言（同样先 `npm run dev`，再在第二个终端执行）：

```bash
npm run smoke:two   # 两个客户端并发 admit 只产生一个房间
npm run smoke:full  # 第 9 个客户端不报硬错误，而是被放进第二个房间
```

## 包边界

```text
client/     # game-specific client scenario; imports the shared client SDK
protocol/   # game-specific messages; imports the shared protocol package
server/     # Room, Schema, and domain rules; imports the shared server SDK
tests/       # domain and integration tests
```

旧示例通过 file 路径引用维护仓库的 `packages/` 源码，不再附带 SDK 压缩包。运行前先在仓库根目录执行 `npm install` 和 `npm run build:sdk`，然后在本示例目录安装依赖。新游戏使用平台源码模板；这些旧示例只用于玩法参考。

# Recipe: social party

## State ownership

服务端拥有准备状态、阶段转换、投票合法性和胜者选择。客户端发送准备或投票意图，并渲染公开阶段和结果。

## 准入：bootstrap → admit → connect

客户端不做任何选房，只走三步：

1. `GET /health` → 从响应头 `X-Cloudbase-Session-Id` 读出亲和 token（`client/src/affinity.ts` 的 `bootstrapAffinity`）。
2. `POST /admit?cloudbase_session_id=<token>` → 服务端用 `matchMaker.joinOrCreate` 选房或建房并预约座位，回 `{ reservation, affinity }`（`requestAdmission`）。
3. 用返回的 `affinity` + `reservation` 调 `MultiplayerClient.admit()` → SDK 内部把亲和 token 注入 `searchParams`，并用 `consumeSeatReservation` 消费服务端预约。

房间创建时把亲和 token 写进 metadata（`server/src/room.ts`），`/admit` 读回它再返回给客户端，因此加入他人房间时客户端会切到房间所在实例的 token。`/rooms` 只做展示，**不返回**亲和 token。

### 本示例的诚实边界

本示例是 headless Node client，本地没有 CloudBase 网关，因此它验证的是**契约形状与服务端准入**：`/admit` 走 `matchMaker.joinOrCreate`、返回座位预约、客户端消费预约，以及并发准入只建一个房间（`smoke:two`）。它**没有**验证网关按 `cloudbase_session_id` 把请求钉到实例这件事——那只能在已部署的多副本环境上验证，命令与结果见 [CloudBase 云托管](../../references/cloudbase-run.md)。

## Suggested file map

- `client/src/index.ts`：headless 准备/投票流程。
- `client/src/join.ts`、`client/src/affinity.ts`：bootstrap → admit → connect 三步。
- `protocol/src/index.ts`：阶段、准备和投票类型。
- `server/src/index.ts`：`/health`、`/rooms`、`/admit` 三个 HTTP 端点。
- `server/src/room.ts`：Room、公开 Schema、阶段时钟和命令适配器。
- `server/src/room-listing.ts`：只含展示字段的房间列表（不含亲和 token）。
- `server/src/domain.ts`：准备检查、投票和确定性胜者规则。
- `tests/domain.test.ts`、`tests/admission.test.ts`：阶段/投票不变量与准入契约。

## Tests

先运行 `npm test` 验证阶段、投票与准入契约，再运行 `npm run dev` 与 `npm run smoke` / `smoke:two` / `smoke:full` 跑完整短局和两条准入断言。
