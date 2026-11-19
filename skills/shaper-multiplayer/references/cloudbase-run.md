# 开通 CloudBase 云托管

多人 Room 是长连接，进程里保存着房间状态。把它部署成 CloudBase Run 容器服务，不要部署成 HTTP 云函数，也不要走 `deploy_function_zip`。客户端仍是独立的静态产物，走平台现有的静态发布，不和 Room 进程打在一起。

下载版使用随包的 `act-cloudbase` 绑定 Colorbox 应用与 CloudBase 环境，并通过 CloudBase 官方 MCP 登录、源码部署和查询。部署步骤与配置来源以 `skills/act-cloudbase/references/game-room-deploy.md` 为准；本页专门说明 Room 的亲和性、准入与验收。

## 术语：五个 id，两个名字很像

亲和性文档里同时出现五个标识，其中两个名字接近、方向相反。任何一句涉及 session id 的话，都必须先指明是哪一个。

| 术语 | 谁生成 | 标识什么 | 作用域 | 一个房间里几个 | 出现在哪 | 可否跨客户端复用 |
| --- | --- | --- | --- | --- | --- | --- |
| `cloudbase_session_id` | CloudBase 网关 | 请求该被路由到哪台实例 | 一条客户端连接到一台实例 | 1 个（全房间共用） | 响应头 `X-Cloudbase-Session-Id`，后续请求的 query | 必须复用（同房间共用） |
| `processId` | Colyseus 实例 | 一个进程 | 进程生命周期 | 1 个 | WS URL 的 path | 否 |
| `roomId` | Colyseus | 一个房间 | 房间生命周期 | 1 个 | WS URL 的 path | 是（同一房间） |
| `sessionId`（Colyseus） | Colyseus | 一个玩家座位 | 该玩家的连接 | 每玩家一个 | 座位预约、`client.sessionId` | 绝不能复用 |
| `reconnectionToken` | Colyseus | 一次重连授权 | 重连窗口 | 每玩家一个 | 座位预约、resume handle | 否 |

关键对照：`cloudbase_session_id` 全房间共用，Colyseus `sessionId` 每玩家必须不同。**这两个不是一回事，绝不能互相赋值。**

WS URL 里同时出现前两个，容易误读：

```text
wss://<域名>/<processId>/<roomId>?cloudbase_session_id=<网关的>
              └─ 不参与路由 ─┘
```

`processId` 在路径里，但 `WebSocketTransport` 解析时只取最后一段作为 `roomId`，`processId` 被忽略——它是 Colyseus 为自建代理（`@colyseus/proxy`）预留的路由位，在 CloudBase 网关照 `cloudbase_session_id` 路由时不生效。真正决定落到哪台实例的，是 query 参数 `cloudbase_session_id`。

## 发布顺序

平台开通及后续部署默认使用 0.5 核 CPU、1GB 内存，固定 1 个副本（`MinNum=MaxNum=1`），保留 Redis、VPC 与 `SessionAffinity=open` 配置。

开通和发布是真实变更。先只读核对应用绑定及服务详情，再用官方 `manageCloudRun(action="deploy", targetPath=...)` 从本地源码目录构建并发布；已有容器服务用相同名称更新。`queryCloudRun(action="getDeployLog"/"getDeployRecords"/"detail")` 验证构建、当前流量版本与服务配置。首次开通由平台初始化流程注入 CloudBase SDK 凭据、Game Token 公钥、Redis 与 VPC；官方 MCP 更新同一服务时完整保留远端配置。缺失时调用平台 reconcile 修复，Agent 不读取或手填密码。完整操作见 `act-cloudbase/references/game-room-deploy.md`。

`GAME_APP_ID` 与 `GAME_TOKEN_PUBLIC_KEY_B64` 供 `onAuth` 验签；`REDIS_URL`、`REDIS_PASSWORD`、`REDIS_NAMESPACE` 和 `VpcConf` 供多副本隔离与内网连通。密码只放服务版本的环境变量；不要写进游戏仓库、技能或回复。`REDIS_NAMESPACE` 使用该 CloudBase envId 派生的稳定前缀（如 `<envId>:`），机制见 `references/redis-namespace-isolation.md`。公网地址从服务详情读取，不从静态托管域名推断。

## 数据库访问（CloudBase SDK）

新 Room 统一使用 `@cloudbase/js-sdk` v3 的 `app.rdb()` 访问所属环境 PG。平台在初始化、源码发布及 reconcile 时注入 `CLOUDBASE_ENV_ID`、`CLOUDBASE_REGION`、`CLOUDBASE_APIKEY`；Agent 不读取、复制或回显凭据。官方 MCP 更新同一服务时保留远端环境变量，缺配置调用平台 reconcile。

SDK 通过 HTTPS 网关鉴权，不使用 PG 密码或数据库私网地址。Redis 仍依赖原 VPC，发布必须保留 VPC、Redis、SessionAffinity 与其它环境变量。配置缺失、Key 失效由平台处理，不重置 PG 账号密码。

SDK 初始化、CRUD、RPC 事务与旧 TCP 项目迁移以 [持久化](persistence.md) 为准。凭据已注入只表示配置就绪；需要用目标版本验证实际表/RPC、权限和业务事务，才能声明持久化可用。

## 多进程必须打开亲和性

多进程部署必须设置亲和性。官方源码部署时显式传入副本数、规格、VPC 和 `SessionAffinity=open`，并用 `queryCloudRun(action="detail")` 核对服务详情及承接流量的版本。构建或运行状态未就绪时不要发布给玩家。

`cloudbase_session_id` 放在 query 中，参数名是 `cloudbase_session_id`。

浏览器 WebSocket 不能设置请求头 `X-Cloudbase-Session-Id`。网关认查询参数 `cloudbase_session_id`。只保存响应头、却不放进 query，等于没有亲和性。

容器监听 `0.0.0.0` 和 `PORT`（云托管上可配置 `3000`）。部署配置要为网页玩家打开公网访问，并为 Redis 连接绑定正确的 `VpcConf`；`OpenAccessTypes` 与 `VpcConf` 分别控制入口和容器所在网络。

## 浏览器跨域配置

游戏服务统一使用 `CLIENT_ORIGIN=*`，HTTP 和 WebSocket 允许任意页面来源。服务端保留 `*` 的语义，空值回退到 `*`，不生成域名白名单，也不把 `*` 过滤掉。Game Token 验签仍然执行。

游戏服务 HTTP 请求使用 `credentials: "omit"` 与 `platformHeaders: false`，Game Token 放在 JSON body。`omit` 关闭浏览器凭据，`platformHeaders: false` 关闭 SDK 自动添加的平台请求头；页面实际加载的 SDK 必须支持该参数。

`application/json` 的跨域 POST 仍会触发预检。保留模板的 `OPTIONS` 处理，正式响应（包括鉴权失败）返回 `Access-Control-Allow-Origin: *`，允许 `GET,POST,OPTIONS` 和 `Content-Type`，保留 affinity 响应头暴露配置。该流程无需 `Access-Control-Allow-Credentials`；客户端使用 `/admit` body 返回的 affinity。

云托管自动公网域名经过托管网关，网关的预检规则和容器的来源规则独立生效。验收时核对承接流量版本的 `CLIENT_ORIGIN=*`，在真实页面 origin 使用实际 SDK 请求 `/admit`：无效 token 返回可读取的 401，有效 token 成功预留席位，再验证 WebSocket 入房及双端同步。`ORIGIN_NOT_ALLOWED` 表示容器拒绝来源，需修复生效版本的变量或来源解析；不带 `Origin` 的脚本成功不能代替浏览器验收。

## 客户端：admit → connect

1. **admit**：客户端先生成一个随机的 `cloudbase_session_id`（使用客户端模板的 `createAffinityId()`，兼容 HTTP DEV 页面），带 `?cloudbase_session_id=<随机值>` 调服务端准入端点（本技能约定 `POST /admit`）。服务端用 `matchMaker.joinOrCreate` 选房或建房并预约座位，返回 `{ reservation, affinity }`。
2. **connect**：用返回的 `affinity` 与 `reservation` 连接。SDK 把 `affinity` 注入 `settings.searchParams`，`settings.searchParams` 会同时加到匹配请求和 WebSocket 地址。

`GET /health` 只用于运维和发布验收，不是玩家入房的前置步骤，也不需要从响应头读取 `X-Cloudbase-Session-Id`。这样直连云托管公网域名时不会依赖网关注入响应头。

**不要对 `wss://` 地址发 `fetch` 做探测。** `fetch` 不支持 `ws://` / `wss://`，探测必然失败。要探测就先转成 `https://` 等价地址，或者直接走 SDK 的 HTTP 通道。

### 原生客户端接线

前端直接复制 [纯 HTML 连接示例](plain-html-client.md)，使用平台注入的 `window.Colyseus.Client`。先通过统一请求完成 `/admit`，再用返回的房间 affinity 和预约连接。Game Token 放在 `/admit` JSON body，请求按示例设置凭据与平台请求头。不要绕过服务端准入自行匹配。

## 同一房间

同一房间的玩家必须共用创建该房间时的 `cloudbase_session_id`（网关 token，**不是** Colyseus 的 `sessionId`）。

- 创建房间时把该 `cloudbase_session_id` 写进房间 metadata。
- 后加入的玩家经 `/admit` 从房间 metadata 读到这个标识，再用它做 WebSocket 连接。不要经公开房间列表广播它。
- 房间创建在收到这次请求的本进程上：`selectProcessIdToCreateRoom` 返回当前 `matchMaker.processId`。

这条「创建必须本地」不是绕路，而是必要条件：实例不知道别的实例的 `cloudbase_session_id`，所以服务端无法把客户端改签到另一台实例。发现房间可以全局（metadata 在 Redis 里，任何实例都读得到），创建必须本地。

每个玩家各用自己的 `cloudbase_session_id`，只会把自己钉在各自的实例上。座位在房间所在进程的内存里，另一台实例上会报 `seat reservation expired`。

`cloudbase_session_id` 可以跨客户端转让：B 复用 A 拿到的值，会被路由到 A 所在的实例。这是「加入他人房间」成立的实测前提，验证命令见下面的验收第 3 条。

## 房间列表

`GET /rooms` 只做展示（大厅 UI 之类），**不得返回 `cloudbase_session_id`**：那是实例路由键，只应回给已被准入的客户端。准入决策由服务端 `/admit` 完成，客户端不拉列表、不排序、不选房。

服务端提供：

- `GET /health`：返回 `{ ok: true, instanceId }`，`instanceId` 用主机名，用来核对请求落在哪台实例。
- `POST /admit`：服务端匹配 + 座位预约 + 返回房间的 `cloudbase_session_id`。缺少 `cloudbase_session_id` 时回 400 `AFFINITY_REQUIRED`；房间 metadata 无 token 时回 409 `ROOM_AFFINITY_MISSING`。
- `GET /rooms`（可选）：只含 `roomId` / `clients` / `maxClients` 的展示列表。

## 开通后验收

用 HTTP 请求验收，不要只看源码上传接口返回成功。

1. `queryCloudRun(action="detail")` 与部署记录显示新版本承接流量：版本 VPC 与平台预期一致（容器网络能到达 Redis 与所需 PG），`SessionAffinity` 为 `open`，公网地址可转换为 `wss://` 云托管域名。
2. 不带 query 的多次 `GET /health` 会落到不同实例，响应头里有 `X-Cloudbase-Session-Id`。
3. 带上同一个 `?cloudbase_session_id=` 的多次 `GET /health` 都回到同一台 `instanceId`。
4. **跨客户端转让**：用两个独立进程（例如 `curl` 与 `python3 urllib`）分别复用 A 拿到的 `cloudbase_session_id`，两次都必须回到 A 的 `instanceId`。只有这一条成立，「加入他人房间」才成立。
5. 两名玩家加入同一房间：第二名玩家经 `/admit` 拿到房间的 `cloudbase_session_id` 后进入同一房间，且没有 `seat reservation expired`。
6. `GET /rooms` 的响应里不含 `cloudbase_session_id`。

> **⚠️ 代码包（源码）部署要额外确认「哪个版本在承接流量」。** 云端可能先创建占位版本，真正的构建版本稍后才出现并接管流量。代码包部署后必须确认**承接流量的那个版本**（`FlowRatio > 0`）就是本次构建，不能只看上传接口返回成功。

客户端静态目录单独发布。静态托管未就绪时，不要把 Room 服务当成页面宿主。

## 已知失败分支

若将来平台变化导致 B 无法复用 A 的 `cloudbase_session_id`（验收第 4 条失败），则「加入他人房间」不成立，必须退回实例本地准入：客户端只能看到自己实例上的房间（服务端用 `matchMaker.query({ name, processId: matchMaker.processId })` 过滤），派对类玩法需重新评估可行性。注意 `processId` 在 Colyseus 的 `INVALID_OPTION_KEYS` 里，不能经客户端 options 传，只能在服务端查询时使用。
