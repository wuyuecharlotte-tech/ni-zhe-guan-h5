# 纯 HTML 最小 Demo

复制 [`templates/client/client.html`](../templates/client/client.html)，替换 `APP_ID` 和 `ENDPOINT`，即可在平台页面中连接共享计数 Room。无需 npm、Vite 或额外客户端包；ColorboxAI 和 Colyseus 0.18.2 由平台注入当前 iframe。独立静态托管不自动具备登录及请求通道。

## 服务端契约

| 接口 / 协议 | 要求 |
| --- | --- |
| `GET /health` | 仅用于运维验收，不是入房前置步骤 |
| `POST /admit?cloudbase_session_id=...` | 验证 body 中的 `gameToken`，返回 `{ reservation, affinity }` |
| Room `onAuth` | 验证 Game Token；玩家身份从验签结果读取 |
| Room Schema | 包含 `count:number` |
| `increment` 消息 | 服务端增加 count，通过状态同步广播 |

## 前端流程

`game.auth → random cloudbase_session_id → /admit → consumeSeatReservation → onStateChange`

客户端生成随机 `cloudbase_session_id`（使用客户端模板的 `createAffinityId()`，兼容 HTTP DEV 页面）并放入 `/admit` 查询参数。准入返回的 affinity 属于实际房间。Game Token 只用于鉴权，不放进 URL 或日志。所有游戏服务 HTTP 请求（包括 `/rooms` 和 `/admit`）使用 `ColorboxAI.request`，设置 `credentials: "omit"` 和 `platformHeaders: false`：前者不发送浏览器 Cookie，后者关闭 SDK 自动附加的 `X-Hupu-Token` 与 `activityId`。`/admit` 的 Game Token 放在 JSON body，仍通过服务端验签。显式 `headers` 只传接口需要的内容，例如 `Content-Type`。普通业务请求保留默认策略。WebSocket 和 Schema 解码由原生 Colyseus 处理。

示例只演示入房、权威计数同步与退出。点击 +1 只发送输入，本地计数由服务器状态更新。两端测试时先核对房间 ID；有多个可用房间时自动匹配不保证进入同一个房间。

## 扩展为正式游戏

主要修改状态渲染和输入消息。按业务需要增加连接取消、完整超时清理、玩法校验、发送频控和可观测性，避免把最小 Demo 当作通用客户端 SDK。

页面包含基本断线提示；自动重连依赖服务端保留座位，不支持重连的 Room 会关闭连接。刷新恢复、凭证保存和页面生命周期清理不在 Demo 范围，见 [重连规范](reconnection.md)。

真实验收需要平台登录态与已部署服务。静态页面检查或模拟响应不等同于鉴权、WebSocket 和双端同步通过。
