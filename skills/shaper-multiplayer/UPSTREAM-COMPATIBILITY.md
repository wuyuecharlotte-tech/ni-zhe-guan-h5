# Shaper Multiplayer 兼容契约

本包是基于 `https://github.com/colyseus/skill/tree/v0.18.0` 构建的 Shaper Multiplayer 开发 skill。

## 复用的内容

- 环境搭建、包安装、精确的 Colyseus v0.18.0 API、框架适配器和官方 API 示例仍由上游 skill 负责。
- 本包假定上游 skill 已经说明了如何创建 Room、定义 Schema 状态、注册 handler、连接客户端以及运行选定的服务端。
- recipe 中出现的 TypeScript 形态只是边界草图。编译前请对照上游 skill 核实确切的装饰器、import、方法名和客户端 SDK 调用。

## 新增的内容

- 常见游戏类型的选型矩阵；
- 把传输、domain 规则、共享契约和基础设施隔离开的项目组织方式；
- recipe 级别关于时序、隐私、重连和测试的决策；
- 跨 recipe 通用的生产与可观测性检查；
- 可复制的 Room、状态、消息和集成测试骨架。
- Redis 命名空间隔离（`REDIS_NAMESPACE`）：键走 ioredis `keyPrefix`，频道由 `NamespacedPresence` 改写，供多环境共用同一个 Redis 时使用。

## 行为修正记录

**`REDIS_KEY_PREFIX` 的作用域扩展。** 该变量此前只影响键（`RedisDriver` / presence 的键命令），Pub/Sub 频道不受影响，等于半隔离。现在它与 `REDIS_NAMESPACE` 等价，会同时改写键与频道。这是修正而非契约破坏：空前缀时两者都不加前缀，行为与改造前逐字一致。新配置请统一使用 `REDIS_NAMESPACE`。


**`processId` 的路由语义澄清。** WS URL path 里的 `processId` 不参与 CloudBase 网关照 `cloudbase_session_id` 的路由（`WebSocketTransport` 只取最后一段作 `roomId`）；真正决定落到哪台实例的是 query 参数。此前文档未点明，易被误读为 path 里的进程号有路由作用。

## 有意不改动的部分

本包不修改、不分叉、不复制上游 skill。它不声明竞争性的 API，不指定客户端框架，也不声称某个草稿就是完整可运行的游戏。

## 版本更新规则

上游 skill 变更版本时，逐个 recipe 复查对 API 敏感的片段，并更新本文件与 `SKILL.md` 中的兼容基线。架构类参考文档尽量保持版本中立。对上游 API 不确定时，链接到上游 skill 并描述不变量，而不是猜测签名。
