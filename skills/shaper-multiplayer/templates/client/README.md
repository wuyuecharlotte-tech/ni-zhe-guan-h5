# 纯 HTML 最小 Demo

复制 [client.html](client.html)，替换 `APP_ID` 和 `ENDPOINT`。平台注入 SDK，不需要构建。

示例演示真实身份获取、服务端准入、原生 Colyseus 入房、共享计数同步及退出。对应 Room 需要 `count:number` 状态字段和 `increment` 消息处理器。

接口契约和正式游戏的扩展点见 [纯 HTML 客户端](../../references/plain-html-client.md)。
