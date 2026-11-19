# 分离部署

每个生成的游戏都以两个可独立部署的产物交付。客户端是静态站点。服务端是只暴露 Colyseus Room 及其 HTTP 匹配路由的 Node.js 进程。它们可以放在一个仓库里，但不共用进程、监听端口或部署命令。

protocol 包是两者共用的库。它不是第三个运行中的服务。

## 必需形态

```text
<game>/
├── client/     # static build; no Room, no server listen
├── protocol/   # shared contracts only
└── server/     # Node process; no HTML, no Vite middleware, no client bundle
```

不要生成那种 `start` 脚本同时提供页面和 Room 的单一包。不要把构建后的客户端挂载到 Colyseus Express 应用上。不要用 `location.hostname` 加固定端口推断服务端地址。

## 客户端产物

- `client` 可以直接是 HTML/CSS/JS，无需构建；使用框架时才输出静态构建目录。
- 公网服务端 origin 来自实际部署结果，作为页面常量或项目配置。
- 按 [纯 HTML 接线示例](plain-html-client.md) 使用原生 Client，endpoint 不由玩家输入。
- 非 localhost 时，endpoint 必须是 `https:` 或 `wss:`。HTTP/WS 仅用于明确的 localhost 开发。
- 构建产物不得包含服务端密钥、房间管理 token，或本不应公开的私有服务 hostname。

## 服务端进程

- `server` 用 `node` 启动（仅当该运行时是显式生产依赖时才用 `tsx`），监听 `process.env.PORT`。
- 暴露 `GET /health` 供进程检查。
- 在 HTTP 匹配和 WebSocket upgrade 上都允许配置的客户端 origin。反向代理必须转发 `Upgrade` 和 `Connection`。
- 从配置中读取允许的客户端 origin。通配符只对本地开发服务端可接受。
- 服务端镜像或宿主不需要客户端构建产物。

## 需要记录什么

实现游戏时，写明：

1. 客户端构建命令，以及上传哪个目录；
2. 服务端启动命令，以及绑定的端口；
3. 烧进客户端的公网 endpoint，以及两侧的 origin 白名单。
