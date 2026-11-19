# 持久化（PostgreSQL）

本文是 Room 持久化的权威来源。新 Room 默认通过官方 `@cloudbase/js-sdk` v3 的 `app.rdb()` 访问所属环境 PG；平台初始化和发布时注入身份。无需 PG 密码、原生连接串或数据库私网地址。

客户端一律不直连数据库。客户端发送命令，Room 验证 Game Token、玩家权限和参数后调用持久化适配器。CloudBase 服务端凭据是资源身份，不是玩家身份。

## 何时必须持久化

胜负结算、存档、库存、货币和奖励必须持久化，并使用跨重启有效的幂等键。临时输入、寻路和每 tick 中间态放内存。是否启用持久化由需求声明决定，不能根据凭据是否缺失自动关闭。

普通榜单、运营和活动接口仍可使用云函数；已有实时 Room 的权威结算可以直接调用 PG SDK，无需仅为数据库访问再转发一次云函数。

## 选型矩阵

| 场景 | 路径 | 完成条件 |
| --- | --- | --- |
| 新 Room 的表查询和简单写入 | SDK `app.rdb().from(...)` | 迁移、授权、实际读写成功 |
| 原子结算、扣款记账、行锁、幂等发奖 | SDK `app.rdb().rpc(...)` 调用 PG 函数 | 整个事务位于一次 RPC，验证并发、重复调用与异常回滚 |
| 已有 `pg` + 手写 SQL、`@colyseus/database` 或 drizzle 项目 | 显式迁移为 SDK；迁移前保留已授权 TCP 配置 | 不改变原事务语义；旧配置维护责任明确 |

新项目不从旧 TCP 示例复制连接池。切换 SDK 需要改造数据访问代码，不能仅替换环境变量。历史 `PGHOST` / `PGPASSWORD` / `DATABASE_URL` 不再由平台默认生成；已有值在配置合并时保留。旧 TCP 项目的空连接串必须显式失败，不能退回 SQLite 或本地文件。

## 平台配置与 SDK 初始化

平台从当前 Project 的环境绑定注入：

- `CLOUDBASE_ENV_ID`：该项目的真实 CloudBase 环境。
- `CLOUDBASE_REGION`：环境地域。
- `CLOUDBASE_APIKEY`：平台托管的服务端资源凭据。

代码复用 [源码模板](../templates/game/server/runtime/cloudbase-pg.js) 的 `getRdb()`，一个进程复用一个 SDK 客户端。缺少任一配置时明确报 `PERSISTENCE_CONFIG_MISSING`，由平台 reconcile 修复；不请求玩家提供密码。凭据轮换后更新服务版本，等待新版本承接流量再验证。

```js
import { getRdb } from './runtime/cloudbase-pg.js';

const { data, error } = await getRdb()
  .from('player_inventory')
  .select('item_id,quantity')
  .eq('player_id', verifiedPlayerId)
  .limit(100);
if (error) throw new Error('PERSISTENCE_READ_FAILED');
```

`verifiedPlayerId` 必须来自服务端身份，表名和字段必须对应已执行迁移。读取限制字段和行数；每次检查 `error`。SDK 依赖写入生产 dependencies 并锁版本，凭据只在运行时读取，不进入源码、客户端、日志、公共 Schema 或响应。

单独配置环境 ID 不构成身份。普通容器的默认环境鉴权不能靠猜测；本项目采用显式注入并实测通过的 API Key 路径。服务端 Key 具有管理员权限，玩家隔离由可信 Room 的身份和命令授权承担；不要把它下发客户端或描述为自动获得每玩家 RLS 隔离。

## RPC 与事务

`@cloudbase/js-sdk` v3 支持 `app.rdb().rpc()`；旧 `@cloudbase/node-sdk` 的方法限制不适用于它。

将扣款、账本写入、奖励和行锁放在同一个数据库函数内，一次 RPC 调用完成。多个独立 `from().update()` 请求不组成一个事务。函数用版本化迁移发布，明确执行权限、表权限和 RLS；优先 SECURITY INVOKER，确需提权时单独设计受限授权。

```js
const { data, error } = await getRdb().rpc('settle_game', {
  p_game_id: gameId,
  p_actor_id: verifiedPlayerId,
  p_command_id: commandId,
});
if (error) throw new Error('SETTLEMENT_FAILED');
// 只有事务成功后才确认结算，失败时保留同一幂等键重试。
```

`settle_game` 是游戏迁移需实现的业务函数，不是平台内置接口。可参考 [奖励适配器骨架](../templates/server/persistence.md)。

## 表与索引规范

- 表、索引、RPC、GRANT 和 RLS 随版本化迁移提交，业务进程启动时不执行 DDL。
- 用唯一约束表示 `(game_id, actor_id, command_id)` 等幂等键，数据库内处理重复；不要先 SELECT 再 INSERT。
- 对 `jsonb` 大小、结果集和查询耗时设置边界。
- 平台不自动猜测业务表，也不通过管理员查询成功就宣称玩家权限正确。

## 不要阻塞主线程与模拟 tick

禁止每 tick 写库。数据库 I/O 在异步命令或有持久保障的 outbox 中执行，设置超时和有界重试。内存队列不是持久 outbox，进程重启会丢失；奖励不能在写库失败时仍返回成功。单条远程查询慢不等于事件循环被同步阻塞，但在 tick 中等待它仍会打乱模拟节奏。

## 发布与验收

1. 用平台 ensure / reconcile 配置同一服务；保留 Redis、VPC、SessionAffinity 和已有业务变量。SDK 走 HTTPS，Redis 仍需原 VPC。
2. 执行当前游戏的迁移，确认目标表、RPC 与权限存在。
3. 发布当前源码，核对承接流量版本及预期 `health.version`。
4. 从实际新实例验证业务读写、重复结算、并发与异常回滚，并检查非法玩家命令被拒绝。
5. 分别记录 SDK 配置就绪、数据库操作成功和业务就绪。平台基础 ready 与 `sdkCredentialsConfigured` 不代替这些证据。

存活检查只表示进程可服务；依赖 PG 的业务就绪检查要反映数据库与迁移状态，不把短暂数据库故障变成无限重启。

## 反例表

| 反例 | 后果 |
| --- | --- |
| 只传 envId，假定普通容器自动有身份 | INVALID_CREDENTIALS |
| 缺配置时关闭持久化或回退本地文件 | 表面正常，数据丢失 |
| 将 SDK Key 填入 DATABASE_URL | 混淆网关凭据与数据库认证 |
| 多个 HTTP 请求当作一个事务 | 部分成功造成账目不一致 |
| 服务端 Key 代替玩家授权 | 任意玩家可越权访问数据 |
| 忽略 SDK 返回的 error | 写入失败却返回成功 |
| 只看 Demo health 200 | 业务版本、迁移和权限未验收 |

官方依据：[SDK 初始化](https://docs.cloudbase.net/api-reference/webv3/initialization)、[PG RPC](https://docs.cloudbase.net/api-reference/webv3/postgresql/rpc)、[API Key 权限](https://docs.cloudbase.net/api-reference/webv3/api-key)。
