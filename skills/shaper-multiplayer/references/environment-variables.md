# 环境变量总表

本文件是「环境变量」的唯一权威总表，只回答三件事：变量属于哪个进程、默认值是什么、什么时候必填。变量背后的机制、约束与发布流程不在这里论证，各自指向权威页：

- Redis 集群与命名空间：[多进程集群部署](cluster-deployment.md)、[Redis 命名空间隔离](redis-namespace-isolation.md)
- 持久化连接：[持久化](persistence.md)
- CloudBase 云托管部署配置：[CloudBase 云托管](cloudbase-run.md)
- 客户端与服务端分离：[分离部署](split-deployment.md)

表里的「归属」有五个取值：**客户端构建期**、**Room 服务端**、**平台注入**、**部署配置**、**仅本地检查脚本**。同一个变量只登记一次；跨归属的语义在「说明」列注明。

## 客户端构建期

构建期变量被烧进静态产物，服务端侧不读取它们。

| 变量 | 默认值 | 归属 | 必填条件 | 可留空 | 说明与权威页 |
| --- | --- | --- | --- | --- | --- |
| `VITE_MULTIPLAYER_ENDPOINT` | 无 | 客户端构建期 | 非 localhost 部署必填 | 本地开发可留空 | 可选构建变量；纯 HTML 直接用实际部署的 ENDPOINT 常量；非 localhost 时必须是 `https:` 或 `wss:`。见 [分离部署](split-deployment.md) |

## Room 服务端

这些变量由 Room 进程通过 `process.env` 读取。平台托管的 Room 在初始化时由平台注入 Redis 连接参数，更新时保留既有配置；技能只描述变量名与使用方式，Agent 无需获取密码值。

| 变量 | 默认值 | 归属 | 必填条件 | 可留空 | 说明与权威页 |
| --- | --- | --- | --- | --- | --- |
| `PORT` | 无（示例内回落 2601） | Room 服务端 | 否 | 可留空 | 本地监听端口；容器内绑 `0.0.0.0`。见 [多进程集群部署](cluster-deployment.md) |
| `SHAPER_PUBLIC_ADDRESS` | 无 | Room 服务端（部署时配置） | 集群部署必填 | 否 | 该进程对外可达地址，写入座位预约；缺失时 `createClusterServerOptions()` 显式抛错。见 [多进程集群部署](cluster-deployment.md) |
| `REDIS_URL` | `redis://172.17.65.21:6379`（`DEFAULT_REDIS_URL`） | Room 服务端（部署时配置） | 集群模式必填 | 单机模式可留空 | 设置即指向集群 Redis；只接受 `redis://` / `rediss://`。见 [Redis 命名空间隔离](redis-namespace-isolation.md) |
| `REDIS_PASSWORD` | 无 | Room 服务端（部署时配置） | Redis 需要认证时必填 | 无认证的本地 Redis 可留空 | 平台从服务端配置注入；Room 通过 `process.env.REDIS_PASSWORD` 读取。见 [多进程集群部署](cluster-deployment.md) |
| `REDIS_DB` | 无（未设置时 ioredis 默认 `0`） | Room 服务端 | 否 | 可留空 | 取值 0–15；**分库不隔离 Pub/Sub 频道**，不要用它代替命名空间。见 [Redis 命名空间隔离](redis-namespace-isolation.md) |
| `REDIS_NAMESPACE` | `""` | Room 服务端（部署时配置） | 多环境共用同一 Redis 时必填 | 单环境可留空 | 本环境的隔离前缀，建议以分隔符结尾（`prod:`）；见 [Redis 命名空间隔离](redis-namespace-isolation.md) |
| `REDIS_KEY_PREFIX` | `""` | Room 服务端 | 否 | 可留空 | **兼容别名**，等价于 `REDIS_NAMESPACE`；新配置一律用 `REDIS_NAMESPACE` |
| `SHAPER_CLUSTER` | 无 | Room 服务端（示例） | 否 | 可留空 | 仅示例用来在单机与集群两套接线间切换，不是 SDK 契约。见 [多进程集群部署](cluster-deployment.md) |

## 平台注入与部署配置

这些变量由平台从项目绑定配置写入 CloudBase 云托管服务版本，Room 进程只读取，不自己拼地址，也不要把它们写进仓库、客户端、公共 Schema 或日志。

| 变量 | 默认值 | 归属 | 必填条件 | 可留空 | 说明与权威页 |
| --- | --- | --- | --- | --- | --- |
| `CLOUDBASE_ENV_ID` | 无 | 平台注入 | Room 使用 PG 时必填 | 否 | 当前项目绑定环境，供 SDK 初始化 |
| `CLOUDBASE_REGION` | 平台当前地域 | 平台注入 | Room 使用 PG 时必填 | 否 | 必须与环境地域一致 |
| `CLOUDBASE_APIKEY` | 无 | 平台注入 | Room 使用 PG 时必填 | 否 | 服务端凭据，仅供 SDK 使用，不是玩家身份 |
| `GAME_APP_ID` / `GAME_TOKEN_PUBLIC_KEY_B64` | 无 | 部署配置 | 受保护 Room 必填 | 否 | 应用 ID 和验签公钥来自服务端可信配置。见 [游戏入房身份](game-authentication.md) |
| `CLOUDRUN_REDIS_PASSWORD` | 无 | 部署配置 | 平台开通 Room 时必填 | 否 | 仅平台进程读取，并注入 Room 的 `REDIS_PASSWORD`；游戏代码和 Agent 不读取这个平台变量。 |

平台开通 Room 时还会注入 `SHAPER_PUBLIC_ADDRESS`、`REDIS_URL`、`REDIS_PASSWORD`、`REDIS_NAMESPACE`，并通过 `serverConfig.VpcConf` 绑定内网。源码更新保留远端配置；缺失时调用平台 reconcile 修复，Agent 不手填凭据。它们与「Room 服务端」一节同名同义，语义以那一节与 [CloudBase 云托管](cloudbase-run.md) 为准。

## 仅本地检查脚本

这两个变量只服务于本地校验脚本，**不要用到生产**。

| 变量 | 默认值 | 归属 | 必填条件 | 可留空 | 说明与权威页 |
| --- | --- | --- | --- | --- | --- |
| `REDIS_HOST` | `127.0.0.1` | 仅本地检查脚本 | 否 | 可留空 | 只被 `scripts/check_namespace.mjs` 的本地 Redis 断言使用。见 [Redis 命名空间隔离](redis-namespace-isolation.md) |
| `REDIS_PORT` | `6379` | 仅本地检查脚本 | 否 | 可留空 | 同上；本地 Redis 不可达时该层断言显式跳过，不阻塞 CI |

## 两条硬约束

1. **`REDIS_KEY_PREFIX` 是兼容别名。** 它等价于 `REDIS_NAMESPACE`，优先级更低；新配置一律使用 `REDIS_NAMESPACE`，不要再新增 `REDIS_KEY_PREFIX` 用法。见 [Redis 命名空间隔离](redis-namespace-isolation.md)。
2. **持久化配置缺失或出现空串必须显式失败。** 新 Room 从上述三个 CloudBase 变量初始化 SDK；环境 ID 本身不提供鉴权。历史 `PGHOST` / `DATABASE_URL` 等 TCP 变量仅为已有应用保留，平台不再默认生成或补齐。见 [持久化](persistence.md)。

## 一个需要留意的开关

`COLYSEUS_CLOUD` 本项目**不设置**。一旦设置，`@colyseus/tools` 的 `getColyseusCloudConfig()` 会覆盖注入的 driver / presence；将来启用 Colyseus Cloud 前必须重新评估这条。见 [Redis 命名空间隔离](redis-namespace-isolation.md)。
