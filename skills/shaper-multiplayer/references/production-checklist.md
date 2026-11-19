# 生产清单

在把 Room 暴露给真实用户之前，使用这份清单。

## 正确性

- 服务端时间拥有 tick、截止时间、冷却和随机结果。
- 每条命令都校验发送者、payload 边界、权限和当前阶段。
- 重复或重试的命令有记录在案的幂等结果。
- 公开状态不包含私有手牌、token、密钥或仅服务端的调试字段。
- 重连、认输、观战和房间销毁行为都是显式的；宽限期与策略结论以 [断线与刷新重连](reconnection.md) 为准。

## 容量与安全

- 房间容量、消息大小、命令频率和每 tick 工作量都有界。
- 队列和预约条目会过期，并在断线时移除。
- 认证和授权发生在准入之前、敏感命令之前。
- 外部调用有超时、带上限的重试和失败策略。
- 密钥来自运行时密钥机制，不出现在日志和客户端 bundle 中。

## 分离部署

- 客户端发布物是静态目录。服务端发布物是 Node 进程。两者部署命令不同。
- 客户端用显式的公网服务端 endpoint 构建。非本地 endpoint 使用 `https` 或 `wss`，并列在 `allowedOrigins` 中。
- 服务端绑定 `PORT`，响应 `GET /health`，并在匹配 HTTP 和 WebSocket upgrade 上都允许客户端 origin。
- 服务端包不包含也不提供客户端构建产物。

## 运维

- 日志中可获得房间、对局、命令和协议版本标识。
- 指标覆盖活跃房间、tick 迟到、命令拒绝、重连和持久化失败。
- 优雅关停会停止准入，给房间有界的冲刷窗口，并报告未完成的副作用。
- 为发现、匹配和持久化记录横向扩展假设。
- 服务端和协议变更都有回滚方案。

## 多进程集群

- 每个进程使用同一个 Redis Presence 和 Driver endpoint（`REDIS_URL`）；本地 Presence/Driver 只允许用于单进程开发。见 [多进程集群部署](cluster-deployment.md)。
- 多个环境共用同一个 Redis 时，每个环境设置互不相同、稳定且以分隔符结尾的 `REDIS_NAMESPACE`；单环境可以留空并明确记录这一选择。条款、反例与验证命令见 [Redis 命名空间隔离](redis-namespace-isolation.md)。
- 每个进程公布一个可达的 `SHAPER_PUBLIC_ADDRESS`；CloudBase 云托管上多个副本共用一个 hostname，因此会话亲和性为必需。
- 多进程部署必须打开亲和性（`SessionAffinity` 为 `open`），网关 token 放在 query 参数 `cloudbase_session_id`；准入决策在服务端，房间创建必须本地。发布顺序、`/rooms` 不返回 token、`wss://` 探测方式与官方 `queryCloudRun(action="detail")` 的 VPC/版本核对（容器网络必须能到达 Redis 与所需 PG）见 [CloudBase 云托管](cloudbase-run.md)。
- 刷新页面的手动重连必须沿用同一 `cloudbase_session_id`（放进 resume handle）；不要重新 bootstrap。流程、`resumeFrom` 失败语义与关闭码口径见 [断线与刷新重连](reconnection.md)。
- `PORT` 是进程监听端口，不作为公网房间地址的替代。
- 启用优雅关停，并在销毁其房间之前把该进程移出准入。
- 持久副作用使用共享数据库幂等键；进程本地命令缓存不是集群级锁。
- 发布前跑一个双进程冒烟测试：在一个进程上创建房间，并通过另一个进程加入它。

## 持久化

需要跨重启保存结算、库存、奖励或检查点时，逐条核对（规范与选型见 [持久化](persistence.md)）：

- 结算、库存、奖励、检查点有明确的持久化落点，且能跨 Room 重启存活；进程本地缓存没有被当作持久化。
- 连接信息只来自环境变量。某个 PG 变量存在但为空时必须**显式失败**，不得静默退回 SQLite 或本地文件；一个变量都没有才表示未开通 PG。
- 连接池在进程内复用，不按房间/按命令新建；`单实例 max × 副本数 ≤ PG max_connections`，设了 `statement_timeout` 与连接超时，手动取出的 client 都 `release()`。
- DB 操作不在模拟 tick 路径上；持久副作用走异步命令处理或 outbox，并带超时与幂等键。
- 驱动路径（裸 `pg` / `@colyseus/database` / `pg` + drizzle）按场景选，并在项目 README 记录选择与理由。
- 表与索引走版本化迁移；幂等键用唯一约束落地，不是「先查再插」；没有控制台手写 DDL 造成的 schema 漂移。
- 凭据不出现在仓库、日志、返回值、房间公共 Schema 或 URL 中。
- 只有服务端直连数据库；客户端一律不直连。
- 持久化失败可观察（指标/日志/错误码），且 DB 故障不会悄悄改变游戏规则。

## 测试与发布

- Domain 不变量在固定时钟和带 seed 的随机性下通过。
- Room 集成测试覆盖正常路径、非法命令、断线、重连、超时和销毁；重连四类路径的断言点见 [断线与刷新重连](reconnection.md)。
- 协议 fixture 保护公开/私有状态边界。
- 一段简短的负载或浸泡运行测量内存、tick 迟到和重连行为；指标口径见 [断线与刷新重连](reconnection.md)。
- 所选 recipe 及其偏离记录在项目 README 中。
