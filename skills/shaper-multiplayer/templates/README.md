# 游戏结构

新游戏入口是完整的 [源码模板](game/README.md)。下文共享包与旧示例用于既有项目维护，不是新游戏部署的前置依赖。

```text
client/index.html   # 纯 HTML，平台注入 ColorboxAI 和 Colyseus
server/             # Node Room 与 Schema，独立源码部署
```

前端照 [纯 HTML 示例](../references/plain-html-client.md) 接线。服务端按 server 模板与 references/cloudbase-run.md 配置，客户端不安装共享 SDK 包。
