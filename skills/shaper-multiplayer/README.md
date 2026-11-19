# Shaper 多人游戏技能

新游戏复制 [templates/game/](templates/game/README.md)，前端复制 [client.html](templates/client/client.html)。

服务端是完整可读的 JavaScript：Room、Schema、Game Token 验签、准入、Redis 集群均随源码提供。依赖只有锁定版本的公开 npm 包。CloudBase 从源码远程构建，首次创建和后续更新走同一条流程。

Qoder 使用平台 build_game；下载技能使用官方 CloudBase MCP。分别以各自包内 references/cloudbase-run.md 为准。

examples 中的 Markdown 是复杂玩法设计参考，其中旧共享包与目录名不代表新游戏必须安装的依赖。旧 SDK 工程保留在维护仓库，不随技能分发；新游戏无需运行 pack:sdk 或寻找 tgz。

## 专题来源

- [PG 持久化与 SDK 身份](references/persistence.md)
- [环境变量归属](references/environment-variables.md)
- [稳定错误码](references/stable-error-codes.md)
- [游戏身份与授权](references/game-authentication.md)
- [客户端实时同步](references/client-realtime.md)
