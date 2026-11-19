# 合作 PvE

真实的合作 PvE Room。房间 tick 推进敌人，玩家发送攻击命令，奖励通过幂等领域函数发放。

```bash
npm install --legacy-peer-deps --install-links=false
npm test
npm run dev    # terminal 1
npm run smoke  # terminal 2
```

## 包边界

```text
client/     # game-specific client scenario; imports the shared client SDK
protocol/   # game-specific messages; imports the shared protocol package
server/     # Room, Schema, and domain rules; imports the shared server SDK
tests/       # domain and integration tests
```

旧示例通过 file 路径引用维护仓库的 `packages/` 源码，不再附带 SDK 压缩包。运行前先在仓库根目录执行 `npm install` 和 `npm run build:sdk`，然后在本示例目录安装依赖。新游戏使用平台源码模板；这些旧示例只用于玩法参考。

# Recipe: co-op PvE

## State ownership

服务端拥有遭遇战血量、玩家攻击权限、tick 顺序和奖励幂等。客户端发送攻击意图，并观察公开的遭遇战投影。

## Suggested file map

- `client/src/index.ts`：headless 加入和攻击命令。
- `protocol/src/index.ts`：攻击和遭遇战结果类型。
- `server/src/index.ts`：Room、Schema、tick 和命令适配器。
- `server/src/domain.ts`：敌人伤害、击败和目标规则。
- `server/src/infra/persistence.ts`：持久化适配器（裸 `pg` + 进程内复用连接池 + 幂等写入）。
- `server/migrations/00000000000001_pve_rewards.sql`：奖励账本的建表与索引（幂等键的唯一约束）。
- `server/Dockerfile`：代码包（源码）部署所需的容器型产物。
- `tests/domain.test.ts`：伤害边界和一次性目标完成。
- `tests/persistence.test.ts`：在本地 Docker PG 上验证幂等写入；未配置 PG 时显式跳过。

## Tests

先运行 `npm test` 验证确定性遭遇战规则，再运行 `npm run dev` 和 `npm run smoke` 跑 WebSocket 场景。

## Persistence

发奖是对局结果边界，不是每帧状态：Room 通过异步 sink 把奖励写进 PostgreSQL，用唯一约束 `(game_id, actor_id, command_id)` + `ON CONFLICT` 保证同一命令只落一次，不阻塞 tick。

本目录是保留的旧 TCP 可执行示例，用于理解遭遇战与幂等账本，不是新 Room 的发布模板。新项目复制 `templates/game/`，使用其中的 `server/runtime/cloudbase-pg.js` 和 [SDK 持久化适配器](../../templates/server/persistence.md)，通过 RPC 完成奖励原子写入。

旧示例的 pg 连接池、PG* 变量及本地数据库测试只适用于明确维护旧 TCP 项目的场景；平台初始化不再提供这些连接信息，也不因缺少变量静默关闭需要的持久化。迁移时保留唯一约束和事务语义，完成实际业务验收后再切换。访问标准见 [持久化](../../references/persistence.md)。
