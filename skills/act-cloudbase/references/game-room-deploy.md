# 游戏服务：初始化 Demo，再修改源码

与 runbook 配合时先读 `skills/runbook/references/implementation-route.md`，记录 room 路线与是否持久化。无持久化 Room 不生成迁移或 activity_api。用户已授权同范围云游戏开发/部署时复用原话，不重复询问。

只有持续 WebSocket、实时房间状态或权威模拟才开通 Room。普通业务保持云函数与 PostgreSQL。既有活动后加多人功能时，复用 activity.json 对应的云环境，不另建环境，不改已有业务资源。

## 1. 初始化或补充开通

用户已授权开发云游戏时运行：

```bash
node skills/act-cloudbase/scripts/ensure-game-service.js
```

平台负责创建或复用环境，开通 CloudRun，从标准源码远程构建计数 Demo，并配置 GAME_APP_ID、配对公钥、Redis、VPC、命名空间、会话亲和性，以及 CLOUDBASE_ENV_ID、CLOUDBASE_REGION、CLOUDBASE_APIKEY。私钥仅在签发云函数；Agent 不读取或复制 Redis 密码、公钥等环境变量。平台未配置这些值时接口失败，由平台修复，不向游戏使用者索要共享密码。

脚本轮询到 ready，输出 game-service.json（appId、envId、serverName、真实 endpoint、公开部署规格），写回官方 MCP 所需环境凭据。首次在 game/ 下载 Demo 源码，并为 client.html 填好 appId、endpoint。已有 game/ 不覆盖；已有云端 Room 不重发 Demo。重复运行是恢复/查询，不是重置游戏。若已有自定义游戏，下载模板只作参考，不能将默认 Demo 覆盖线上玩法。

没有 ready 和真实 endpoint 时，不交付可测试页面，不编造域名或保留 REPLACE_ME 后声称部署成功。

轮询发生 fetch failed / 连接重置时，后台构建可能仍在继续。先重试 `status` 查询同一服务与官方部署记录；后台恢复后再运行原 ensure 命令恢复本地配置/模板。构建终态失败才进入修复源码，不因轮询中断新建环境或重发 Demo。`ready=true` 仅表示基础服务就绪，初始化不会把随后修改的 game/ 自动上传。

## 2. 修改与官方 MCP 源码更新

修改 game/server/rooms/CountRoom.js 实现玩法，server/runtime/ 保留平台接线。客户端独立发布。服务端部署根目录为 game/，包含 Dockerfile、package.json、package-lock.json、server/；不上传 credentials.json、.env、node_modules 或密钥。

首次与官方 MCP 交互，用 credentials.json 的 apiKey 和 envId 执行 auth(action="login_by_api_key")。查询 game-service.json 对应的既有服务；不得猜环境或服务名。

调用官方 manageCloudRun(action="deploy", serverType="container", serverName=<同一服务>, targetPath=<game 绝对路径>, serverConfig=<game-service.json.deployment>)。deployment 只有公开规格（0.5 核 CPU、1GB 内存、`MinNum=MaxNum=1`）和亲和性；VPC 与环境变量由官方 MCP 从既有服务完整保留。不要手填 VpcConf 或 EnvParams：当前 MCP 的 VPC 输入只接收 ID，可能丢弃云托管需要的网段，导致 Redis 无法连通。部署返回的 configMerge 必须确认 VpcConf、EnvParams 已从远端保留；缺失时先由平台 reconcile 修复，再部署。

CloudBase 远程构建，不需要本地 Docker/TCR。通过官方 queryCloudRun(getDeployLog/getDeployRecords/detail) 确认本次源码构建成功、对应版本承接流量；构建失败先修复源码，不用默认 Demo 覆盖。

部署前发现平台配置缺失，或每次更新成功后，运行：

```bash
node skills/act-cloudbase/scripts/ensure-game-service.js reconcile
```

平台从服务端配置源复核/恢复环境变量、VPC 和亲和性，保留游戏自定义变量，不修改业务源码。游戏服务统一使用 `CLIENT_ORIGIN=*`；reconcile 保留已有来源配置，旧白名单需由平台改为 `*`，并在新部署的流量版本上核对生效。服务端保留模板的通配符解析，HTTP 与 WebSocket 都允许任意来源。脚本等待配置及健康检查就绪；源码更新是否成功仍需对照构建记录与流量版本，不能仅凭 health 200 判断。

## PG 持久化标准

Room 使用 `@cloudbase/js-sdk` v3 + `app.rdb()`，从平台注入的 CloudBase 环境变量鉴权，不默认配置 `PG*` / `DATABASE_URL`。首次开通、源码更新和 reconcile 由平台维护凭据；不要从本地 credentials.json 复制 Key 到源码、提示词或部署参数中。

需要持久化时读取 `shaper-multiplayer/references/persistence.md`，完成版本化表/RPC 迁移和服务端授权，并从新版本验证真实业务读写、幂等与回滚。`sdkCredentialsConfigured` 仅表示配置匹配，不等于 PG 表和业务已经就绪。基础 ready 或演示版 health 200 均不能代替持久化验收。

旧项目使用 `pg` 的多语句事务时，先迁移为数据库函数 RPC 或保持已授权的旧连接，不能仅更换环境变量就宣称完成迁移。当前标准不再重置数据库共享账号密码。

## 3. 本次玩法发布证据

发布前为本次源码设置新的 `/health.version` 标识，并用 `state.py configure --runtime room --persistence none --expected-version <本次版本> --note <需求依据>` 记录；需要持久化时用 postgresql。版本标识必须随发布变更，避免旧服务返回 200 被误判为本次发布成功。

从官方 getDeployLog/getDeployRecords/detail 提取本次构建和实际承接流量版本，只保存公开字段到 `activity/room-build.json`，不复制完整环境变量或凭据：

```json
{"buildId":"<本次构建 ID>","versionName":"<本次云托管版本>","status":"success","flowRatio":100}
```

此交付链验收完成切换到本次版本的 100% 流量；灰度未结束时报告发布进行中。先运行 `ensure-game-service.js status` 刷新 game-service.json，再采集线上版本：

```bash
python3 skills/runbook/scripts/record-room-deployment.py
```

脚本读取已绑定 endpoint 的 `/health`，核对 appId、Redis、预期玩法版本、构建记录与目标配置，写 `activity/room-deployment.json`。deploy 门禁还核对当前源码指纹；源码变更后重新发布、采集证据。该证据只覆盖版本和健康状态，多人关键操作仍由下一阶段验收。构建记录与流量字段必须来自官方查询，不能按期望值填写。

## 4. 多人验收

检查 VPC/子网、SessionAffinity=open、Redis 连通，以及真实 Game Token 入房、两名独立用户同房玩法状态同步与断线重连。卡牌类还需确认各玩家看不到他人私有手牌、非法出牌被服务端拒绝、回合及胜负由服务端判定。平台登录态由 ColorboxAI.game.auth 提供；临时测试签名不能冒充平台登录成功。标准前端使用 ColorboxAI.request 和平台注入的 Colyseus，参考 shaper-multiplayer/templates/client/client.html。

查询当前游戏服务：`node skills/act-cloudbase/scripts/ensure-game-service.js status`。云环境 activated 只表示基础环境可用；游戏服务 ready 才表示 Room 部署与健康检查通过。

交付分别说明基础服务就绪、本次玩法版本上线、多人关键路径验收结果；未验证的项目标为待验证。
