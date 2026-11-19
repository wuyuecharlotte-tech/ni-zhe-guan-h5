---
name: shaper-multiplayer
description: 为需要持续 WebSocket、同房共享状态、权威回合或实时重连的 Shaper 网页游戏实现和部署 Colyseus Room。用于实时竞技、同步回合制、卡牌、合作和派对游戏；配合 act-cloudbase 发布独立 Node 服务与静态前端。普通登录、榜单、投票及不要求同房持续同步的异步业务使用活动 API；混合需求分别实现。
---

# Shaper 多人联机开发

以 Colyseus 权威 Room 执行游戏规则。新游戏从 [完整源码模板](templates/game/README.md) 起步，前端使用平台注入的原生 Colyseus。鉴权、准入和集群代码都在模板内。

## 使用边界：先判断是否真的需要实时 Room

本技能只用于需要持续 WebSocket 连接的多人实时服务。满足以下任一条件才使用它：

- 多名玩家同时处于同一房间，并持续看到彼此动作或共享状态；
- 高频输入、低延迟同步、权威碰撞、实时回合推进或实时断线重连；
- 房间生命周期、座位、匹配和在线状态本身就是玩法的一部分。

以下需求不要使用本技能，也不要创建 Colyseus 云托管：登录、榜单、投票、报名、抽奖、任务、存档、战绩结算、后台管理，以及不要求同一房间持续同步的异步回合。它们走 CloudBase 云函数 + 网关 + PostgreSQL。若一个游戏同时包含两类需求，实时房间及其权威结算使用本技能，Room 可通过官方 CloudBase SDK 访问 PG；独立活动与运营接口继续使用云函数。

本 skill 的上游 API 参考来自 `colyseus/skill@v0.18.0`。运行时包基线与 Shaper Multiplayer Kit 对齐：`@colyseus/sdk@0.18.2`、`@colyseus/core@0.18.14`、`@colyseus/schema@5.0.33`，Node.js 22.13+。上游 API 参考和运行时 package 版本是两个独立的兼容边界。

## 首次开通与后加多人能力

在随包 runbook 内执行时，先读 `skills/runbook/references/implementation-route.md`，用 state.py configure 记录 room 运行方式与独立的持久化需求。单局实时游戏可选 persistence=none；云运行授权不等于保存战绩。通用活动的 SQL/activity_api 要求只适用于相应路线。

先按 references/cloudbase-run.md 初始化游戏 Demo。已有云环境直接补充 Room，已有 Room 复用，不能重置已有玩法。平台负责公钥、Redis、VPC、亲和性及 CloudBase SDK 运行凭据配置，Agent 只拿 appId、endpoint 和标准源码。初始化完成后修改源码并更新同一服务。交付前必须替换客户端占位符并完成真实入房验证。

需要持久化、奖励、存档、结算或从旧 `pg` 代码迁移时，先读 `references/persistence.md`。新 Room 统一使用 `@cloudbase/js-sdk` v3 的 `app.rdb()`，凭据由平台注入；PG 表、RPC、权限和业务验收仍需完成。

## 源码模板使用指引

复制 `templates/game/` 到工作目录，保留 package-lock.json，执行 npm ci。直接修改 server/rooms/CountRoom.js 实现玩法；server/runtime/ 已包含鉴权、准入和 Redis 命名空间隔离。新游戏不安装 @shaper 包、不找 SDK 压缩包、不在技能目录构建 SDK。

前端复制 `templates/client/client.html`，配置 appId 和部署返回的 endpoint。复杂玩法文档中的共享包接口是旧项目参考，不是新模板的依赖或必做步骤。

## 适用场景

当 Colyseus 项目需要以下任意一项时使用本 skill：

- 推荐的 client/protocol/server 目录结构；
- 在玩法增长时仍保持小巧的 Room 边界；
- 实时竞技、回合制、合作、卡牌或派对游戏的起手模板；
- 状态归属、命令、重连、匹配、测试和运维方面的指引；
- 在实现或发布前对 Colyseus 设计做一次评审。

当问题依赖具体的 Colyseus v0.18.0 API 时，先加载上游 skill。之后只加载当前游戏需要的 reference 和 recipe 文档。

前端参考 [client.html](templates/client/client.html)，服务端入口是 [templates/game/server/index.js](templates/game/server/index.js)。首次创建和更新均上传同一源码目录，由 CloudBase 远程构建发布。

## 选择 recipe（Choose a recipe）

| 用户意图 | 加载该 recipe | 核心设计问题 |
| --- | --- | --- |
| 移动、瞄准、战斗，或每秒大量输入 | `examples/realtime-arena/README.md` | 服务端如何以固定节奏模拟权威状态？ |
| 类棋规则、战术、棋盘游戏或异步回合 | `examples/turn-based-board/README.md` | 合法命令和回合计时如何表示？ |
| 一队玩家共同对抗世界或遭遇战 | `examples/co-op-pve/README.md` | 哪些系统按什么顺序更新，哪些需要持久化？ |
| 隐藏手牌、牌库、轮抽或私有选择 | `examples/card-game/README.md` | 哪些状态是公开、私有、以及重连后可重建的？ |
| 短局、准备检查、投票或休闲房间 | `examples/social-party/README.md` | 大厅如何安全地变成一个用完即弃的游戏房？ |

如果游戏混合了多个类型，选择拥有最难不变量的那个 recipe，再借用其他 recipe 的边界模式。例如：实时合作射击采用 arena 的 tick 模型和 PvE 的遭遇战归属模型。

## 推荐工作流（Recommended workflow）

1. 阅读目标平台和 API 对应的上游 v0.18.0 skill。
2. 从上面的表格中选一个 recipe。
3. 复制 `templates/game/` 完整源码模板。
4. 定义客户端可观察的状态，以及客户端可请求的命令。
5. Room 只做传输和生命周期适配器。规则放在 `examples/<game>/server/src/domain`，外部 I/O 放在 `examples/<game>/server/src/infra`。
6. 先写纯 domain 测试，再写 Room 集成测试。为公开/私有状态和非法命令补充协议测试。
7. 在第一次试玩前就确定重连、超时、容量和关停行为。
8. 在写客户端入口或服务端 listen 路径前，先读 `references/split-deployment.md` 和 `references/cluster-deployment.md`。客户端与服务端必须能独立部署。
9. 实时类游戏（移动、瞄准、射击等高频输入）在写客户端入口前，先读 `references/client-realtime.md`，按其形状落地本地预测、输入缓冲与插值；回合制等低频场景跳过此步。
10. 受保护 Room 必须先读 `references/game-authentication.md`，把 `ColorboxAI.game.auth`、服务端 `/admit` 和 Room `onAuth` 接起来。服务端读取 `GAME_APP_ID` 和 `GAME_TOKEN_PUBLIC_KEY_B64`，不能信任客户端传来的 `sub`、`appId` 或玩家 ID。
11. 服务端运行在 CloudBase 云托管或多个进程承接房间时，发布前先读 `references/cloudbase-run.md` 和随包的 `skills/act-cloudbase/references/game-room-deploy.md`。通过 CloudBase 官方 MCP 从本地源码目录创建或更新 Room 服务，并验收本次版本承接流量。多进程必须开启亲和性并在 query 中传 `cloudbase_session_id`。若多个环境共用 Redis，还要读 `references/redis-namespace-isolation.md`，为每个环境设置不同的 `REDIS_NAMESPACE`。
12. 把 Room 暴露给真实用户前，执行 `references/production-checklist.md`。
13. 游戏需要跨重启保存结算、库存、奖励或检查点时，读 `references/persistence.md`。新 Room 使用官方 `@cloudbase/js-sdk` v3 + `app.rdb()`，凭据由平台注入，缺配置显式失败；原子结算用单次 RPC，DB 操作不得阻塞主线程与模拟 tick。

## 最短可运行链路

验证平台能力或创建第一个实时游戏时，按下面顺序执行，完成一个最小 Room 后再扩展玩法：

1. 先确认需求确实需要同一房间的持续同步；只有这种需求才创建 Colyseus 服务。
2. 运行 act-cloudbase 的 ensure-game-service.js 初始化或复用 Demo，取得 game/ 源码和真实连接配置，再修改玩法。
3. 客户端每次入房调用 `window.ColorboxAI.game.auth({ appId })`，按照 `references/plain-html-client.md` 把返回 token 交给原生 Colyseus Client；游戏服务 HTTP 请求设置 `credentials: "omit"` 与 `platformHeaders: false`。endpoint、roomType 和 scope 来自游戏配置。
4. 服务端 `/admit` 先验证 token，再调用 `admitClient`；Room 的 `onAuth` 再验签，`onJoin` 只使用验签得到的 `client.auth.sub`。
5. 使用 `act-cloudbase` 绑定环境并取得已授权的 Room 配置，调用官方 `manageCloudRun(action="deploy", targetPath=...)` 让 CloudBase 从源码构建；首次创建服务，后续更新同一服务。公开部署配置来自 game-service.json；平台秘密由初始化与 reconcile 注入，按 game-room-deploy.md 操作。
6. 轮询本次构建与流量切换；按 game-room-deploy.md 记录发布证据，确认线上 /health.version 等于本次 expectedVersion。初始化计数 Demo ready 不等于当前玩法上线。确认 VPC/Redis 与 WebSocket 亲和性，再验证无 token 拒绝、有效 token 入房、状态同步和断线重连。
7. 验收健康检查、无 token 被拒绝、有效 token 入房、房间状态同步和断线重连。没有有效签发 token 时只能报告鉴权正向路径未完成。

这条链路的完成标准是：服务状态就绪、Redis/VPC 配置正确、无效 token 返回 401、有效 token 能通过 `/admit` 和 `onAuth` 进入 Room。单独返回健康检查 200 或能列出房间不算完成。

## 不可协商的边界（Non-negotiable boundaries）

- 服务端对规则、时间、随机结果、库存和权限具有权威。
- 客户端发送带校验、有界 payload 的意图命令，不提交权威状态补丁。
- Schema 状态是客户端需要的可观察投影。临时工作队列、密钥和大量日志不要放进去。
- Room 生命周期相关的事情留在 Room 适配器里。domain 系统应能在没有活跃 socket 的情况下被调用。
- 断线是一次显式的状态转换，有明确的超时策略，不是异常路径。宽限期、关闭码语义与刷新恢复流程以 `references/reconnection.md` 为准：drop 路径上 `onDrop` 与 `onLeave` 都会被调用，`onLeave` 必须幂等；刷新后沿用持久化的 resume handle，不得重新 bootstrap。
- 每条命令都有发送者、校验规则、幂等决策和可观察的失败响应。
- 客户端与服务端是两个可独立部署的产物。客户端是静态构建产物。服务端是只提供 Room 的 Node 进程。见 `references/split-deployment.md` 和 `references/cluster-deployment.md`。不要把两者放进同一个进程，也不要由页面 host 加固定端口推断服务端 URL。
- 多进程部署必须设置亲和性（`MinNum` 或 `MaxNum` 大于 1 时 `SessionAffinity` 必须为 `open`），网关 token 放在 query 参数 `cloudbase_session_id`（它是**实例**亲和 token，全房间共用，不是 Colyseus 的每玩家 `sessionId`，两者绝不能互相赋值），准入决策必须在服务端，房间创建必须本地。完整发布顺序、准入流程、失败分支与实测证据见 `references/cloudbase-run.md`。
- 多环境共用同一个 Redis 时必须做命名空间隔离：每个环境设置互不相同、稳定且以分隔符结尾的 `REDIS_NAMESPACE`。键由 ioredis `keyPrefix` 隔离，**频道必须由 `NamespacedPresence` 改写** —— 只设 `keyPrefix` 是半隔离，会留下同名串台与误删房间这两类静默故障。服务端只能通过 `createClusterServerOptions()` 接线，不要自建裸 Redis 连接。见 `references/redis-namespace-isolation.md`。
- 需要跨重启存活的结算、库存、奖励与检查点必须落库，且只有服务端直连数据库，客户端一律不直连。连接只来自环境变量，空连接串必须显式失败；连接池进程内复用，DB 操作不得阻塞主线程与模拟 tick；表与索引走版本化迁移，禁止控制台手写 DDL、禁止 schema 漂移、禁止每 tick 写库。新 Room 统一使用 CloudBase SDK；旧 TCP 项目按事务语义显式迁移。见 `references/persistence.md`。

## 参考文档索引

每个主题只有一个权威落点；其余文件只保留该主题视角下的一句话不变量 + 指向这里的指针。

| 主题 | 权威文件 |
| --- | --- |
| 架构与边界 | `references/architecture.md` |
| 项目结构与依赖方向 | `references/project-structure.md` |
| 模拟、回合与命令（固定 tick、阶段状态机、幂等、随机） | `references/gameplay-patterns.md` |
| 断线、宽限期与刷新重连（权威来源） | `references/reconnection.md` |
| 大厅与匹配 | `references/matchmaking-and-lobby.md` |
| 测试、日志、指标与链路 | `references/testing-and-observability.md` |
| 发布与生产就绪清单 | `references/production-checklist.md` |
| SDK 边界与复用 | `references/sdk-layering.md` |
| 协议 envelope、scope 与稳定错误码 | `references/protocol-contracts.md` |
| 客户端会话生命周期与 resume handle | `references/client-session.md` |
| 服务端命令运行时 | `references/server-runtime.md` |
| 客户端与服务端分离部署 | `references/split-deployment.md` |
| 多进程集群部署 | `references/cluster-deployment.md` |
| CloudBase 云托管开通、VPC、术语消歧与服务端准入（`/admit`） | `references/cloudbase-run.md` |
| Redis 命名空间隔离（多环境共用 Redis、键与频道两半） | `references/redis-namespace-isolation.md` |
| 持久化、连接池与表/索引规范（权威来源） | `references/persistence.md` |
| 客户端实时体验（预测、回滚与和解、插值） | `references/client-realtime.md` |
| 稳定错误码总表 | `references/stable-error-codes.md` |
| 环境变量总表 | `references/environment-variables.md` |
| 游戏入房身份与 Game Token | `references/game-authentication.md` |

映射表里有两条权威登记是机器逐字断言项，措辞不得改写：

- 断线、宽限期与刷新重连（权威来源）：`references/reconnection.md`
- 持久化、连接池与表/索引规范（权威来源）：`references/persistence.md`

## 代码边界

server/runtime 负责平台接线；server/rooms 负责游戏规则和状态。复杂玩法再抽取 domain 与持久化模块，不给最小 Demo 添加无用层级。

## 产出期望

用本 skill 设计或实现游戏时，要说明：

1. 选了哪个 recipe，以及为什么；
2. 哪些状态是公开、私有、临时和持久化的；
3. 有哪些命令，非法命令如何失败；
4. 时间、重连和房间清理如何工作；
5. 哪些测试证明了关键不变量；
6. 静态客户端和 Node 服务端如何分别部署，包括公网 endpoint 和 origin 白名单。多进程或 CloudBase 云托管部署按 `references/cloudbase-run.md` 说明亲和性与服务端准入；多个环境共用同一个 Redis 时按 `references/redis-namespace-isolation.md` 说明命名空间隔离。
7. 需要持久化时，说明 SDK 如何使用平台注入的环境 ID、地域与 API Key，表/RPC/权限在哪个迁移中定义，以及幂等、回滚和持久化失败如何验证。规范见 `references/persistence.md`。

具体的 Colyseus 声明、装饰器、传输细节和框架集成，以上游 skill 为准，不要凭记忆臆造 API。

## 服务端依赖与前端运行时

服务端只安装模板 package.json 中锁定的公开第三方依赖；上传源码时包含 package-lock.json 和 server/，排除 node_modules、.env、密钥及压缩依赖包。前端使用平台在当前 iframe 内注入的 window.ColorboxAI 与 window.Colyseus，不自行加载 CDN。
