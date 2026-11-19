# 最小游戏源码模板

复制本目录到游戏工作目录，执行 `npm ci`。无需构建私有 SDK。

- `server/rooms/CountRoom.js`：共享计数、玩家状态、20 秒重连；主要修改这里实现玩法。
- `server/runtime/`：可读的 Game Token 验签、准入、Redis 隔离源码；通常无需修改。
- `server/runtime/cloudbase-pg.js`：需要 PG 时调用 `getRdb()`，复用官方 SDK 客户端；不需要持久化的 Demo 无需调用。
- `server/index.js`：启动、健康检查和 `/admit`。
- `package-lock.json`：第三方依赖锁定；修改依赖后用 npm 更新。
- `Dockerfile`：交给 CloudBase 远程构建，本地无需 Docker。

前端复制旁边 `../client/client.html`，与服务器独立发布。平台在 iframe 内注入 ColorboxAI 和 Colyseus，配置真实 appId 与 endpoint 即可。

启动需要 `GAME_APP_ID`、`GAME_TOKEN_PUBLIC_KEY_B64`。生产还需要 `REDIS_URL`、`REDIS_PASSWORD`（Redis 开启认证时）、非空且每环境唯一的 `REDIS_NAMESPACE`、`SHAPER_PUBLIC_ADDRESS`（服务公网 hostname）。私钥只放在签发云函数，不打进源码包。VPC 与 SessionAffinity 属于云托管服务配置。

本地单进程可不设置 Redis；生产必须使用 Redis，不能静默退回单进程。Qoder 通过平台注入配置并调用 build_game；下载技能通过官方 CloudBase MCP 部署，详见技能的 references/cloudbase-run.md。

源码 ZIP 根目录直接包含 Dockerfile、package.json、package-lock.json 和 server/。不上传 node_modules、密钥、.env 或 SDK 压缩包。首次创建与后续更新都使用同一套源码部署流程。

验收：健康检查成功；无效/错误应用/过期 token 被拒绝；平台有效 token 入房；两客户端共享计数同步；断线恢复。token 到期不会自动踢掉已连接玩家，业务权限仍在服务端判断。

持久化标准：平台注入 `CLOUDBASE_ENV_ID`、`CLOUDBASE_REGION`、`CLOUDBASE_APIKEY`，代码用 `getRdb().from(...)` / `.rpc(...)`，检查每次返回的 `error`。缺配置显式失败；单独填环境 ID 不代表有身份。迁移与事务要求见技能 `references/persistence.md`。
