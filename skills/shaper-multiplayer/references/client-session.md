# 原生客户端会话

连接实现见 [纯 HTML 示例](plain-html-client.md)。直接使用原生 Client 和 Room，无自定义会话层。

- 输入使用 room.send，状态使用 room.onStateChange。
- 离开使用 room.leave，关闭后清理 UI。
- 重连依赖服务端允许；刷新恢复必须保留原房间 affinity 和原生 reconnectionToken。
- 高频输入在连接断开时停止发送；不要缓存过期移动。
