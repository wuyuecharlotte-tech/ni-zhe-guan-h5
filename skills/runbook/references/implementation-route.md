# 实现路线：活动 API、实时 Room、静态页面

运行方式与持久化分别记录。多人同房的实时回合需要云运行；不保存战绩只表示无需数据库，不能把它归为纯静态页面。技术选路由 Agent 根据已确认业务决定，不向用户提问框架或服务类型。

| 业务需求 | runtime | persistence | 必需后端产物 |
| --- | --- | --- | --- |
| 展示、个人本地交互 | static | none | 无 |
| 投票、报名、榜单等活动业务 | activity-api | postgresql | activity/migrations/、activity/cloudfunctions/activity_api/ |
| 实时同房游戏，局内状态随房间销毁 | room | none | game/ 源码；无 SQL/云函数要求 |
| Room 保存战绩、奖励或跨重启状态 | room | postgresql | game/ + activity/migrations/；Room 使用官方 SDK + 平台注入的环境凭据访问 PG |
| Room 另有独立活动 HTTP API | room + --activity-api | postgresql | game/ + 迁移 + activity_api |

在 plan 确认后或 implement 中记录。无战绩存储的斗地主示例：

```bash
python3 skills/runbook/state.py configure --runtime room --persistence none --expected-version v1-landlord --note "用户已授权多人斗地主；单局实时，不保存战绩"
```

产出 `activity/implementation.json`，由命令维护；修改路线或版本会使后续自检确认失效，重新审查、部署与验收。`expectedVersion` 与本次源码 `/health.version` 一致，每次源码发布使用新的版本标识。旧活动工作区未配置路线时保持原活动 API/静态门禁；发现 game/ 或 game-service.json 会要求明确选路。

业务部署决策仍为 A=需要云运行 / B=纯静态。`configure` 不替代该决策或扩大授权。用户已明确要求并授权开发/部署联机游戏时，记录原话为部署依据，复用授权；只缺是否保存战绩时询问该业务需求，不再问“云端还是本地”。不保存战绩也选 A；不要调用不存在的 HISTORY/D4 节点，先用 `state.py tree` 取得真实决策 ID。

## Room 阶段路径

1. implement：读取 `skills/shaper-multiplayer/SKILL.md` 和 `skills/act-cloudbase/references/game-room-deploy.md`。实现 game/ 服务与 h5/ 客户端；只在 persistence=postgresql 时要求表/RPC/权限迁移，按持久化权威页使用 SDK，H5 仍遵循技能使用与业务默认规则门禁。
2. security-review：调用 review-h5.py，将 h5/ ZIP 交给后台同一自动审核 API；原样保存结果并按 submissionAllowed 继续，技能不另判 Colyseus/WebSocket。后端鉴权、私有手牌、非法操作与重连由 Room 验收覆盖。
3. deploy：基础服务初始化成功后，还必须通过官方 MCP 上传当前 game/ 到同一服务；按 game-room-deploy.md 采集构建、流量版本与 health 证据。静态客户端单独发布。
4. test：真实页面使用有效平台 Game Token，让两名独立用户进入同一房间、操作同步并验证重连；按玩法验证非法操作、私有状态隔离及胜负。持久化路线还需从实际版本验证业务读写、幂等、权限与事务回滚；凭据配置成功不等于业务就绪。未取得证据的关键路径标待验证，不能宣称全部交付。

每次报告分别说明“基础服务就绪”“本次玩法版本上线”“多人验收完成”。任何一个成立都不能代替其他两个。
