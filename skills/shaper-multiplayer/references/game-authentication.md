# 游戏入房身份

## 接线契约

页面通过 `ColorboxAI.game.auth({ appId? })` 获取 `{ token, expiresAt }`。`appId` 是目标游戏所属应用；省略时取当前页面注入的应用 ID。游戏 endpoint 由游戏自身配置。页面无需知道签发路由、CloudBase 环境或验签公钥。

前端直接使用平台注入的原生 `window.Colyseus`。完整 `game.auth → /admit → consumeSeatReservation` 实现见 [纯 HTML 连接示例](plain-html-client.md)。`/admit` 的 Game Token 放在 JSON body；游戏服务请求使用该示例的凭据与平台请求头设置，普通业务请求保留默认策略。

## Room 验证

下载版由部署者通过官方 MCP 在容器环境变量中配置 `GAME_APP_ID=app_xxxxx` 和 `GAME_TOKEN_PUBLIC_KEY_B64`；配置值来自已绑定应用与平台公钥，不读客户端选项。配置来源和发布步骤见 `skills/act-cloudbase/references/game-room-deploy.md`。**一期 Game Token 的最小字段是 `sub`、`appId`、`exp`**；`iss`、`aud`、`iat` 是可选兼容字段。每个受保护 Room 在静态 `onAuth` 中验签、检查过期时间和 `appId === GAME_APP_ID`：

```ts
import { Room, ServerError } from "@colyseus/core";
import { verifyGameToken } from "../runtime/game-auth.js";

const appId = process.env.GAME_APP_ID ?? "";
const publicKey = Buffer.from(process.env.GAME_TOKEN_PUBLIC_KEY_B64 ?? "", "base64").toString("utf8");

class GameRoom extends Room {
  static async onAuth(token: string | undefined) {
    try {
      return verifyGameToken(token, { appId, publicKey });
    } catch {
      throw new ServerError(401, "Invalid game token");
    }
  }

  onJoin(client: { auth: { sub: string } }) {
    const playerId = client.auth.sub;
    void playerId;
  }
}
```

实际 Room 使用 Colyseus 对应的 `Client` 类型。`onJoin` 和消息处理都使用验出的 `client.auth.sub`，不使用 join options 或消息中的玩家 ID。房间准入、队伍归属、奖励结算等业务权限仍由游戏规则判断。

服务端准入端点也必须先验证 Game Token，再把同一个 token 传给 `matchMaker.joinOrCreate`；Room 的 `onAuth` 再验证一次，不能只信任 `/admit` 的客户端字段。Colyseus 的入房请求通过 HTTP matchmaking 携带令牌，`onAuth` 在 `onJoin` 前执行。网关处理路由与 WebSocket 连接；重连使用 Colyseus 自身的 reconnection token。Game Token 到期不会自动终止已经建立的连接；即时封禁需要主动断开连接或在敏感操作时复核。

正式部署应使用平台签发的 Game Token，并使每个可加入的 Room 执行上述验证。没有签发服务或有效 token 时，验收只能证明“无效 token 被拒绝”，不能把健康检查或房间列表当作鉴权通过。
