# 建模资料拉取示例

`sync-dataset.js` 可在两种合法场景使用：

1. **对话期**：在工作区执行，把 JSON 快照交给建模代码。
2. **CloudBase 定时**：作为独立事件函数入口（`exports.main`），不要挂到 `activity_api` HTTP 网关。

## 对话期

```bash
node skills/basketball-modeling-dataset/example/sync-dataset.js --league=nba --out=./nba-regular.json
node skills/basketball-modeling-dataset/example/sync-dataset.js --league=cba --depth=standing --out=./cba-teams.json
```

`--depth`：

- `standing`：只拉赛季 + 全部球队（最快，确认名单）
- `roster`：再拉每队资料、阵容、薪资表
- `full`：再按 playerId 拉球员档案（最慢）

默认 `--depth=roster`。全联盟 `full` 会打数百次接口，脚本已串行并间隔 200ms。

## CloudBase 定时（最短一天）

新建事件函数 `basketball_dataset_sync`（Node 18），入口 `exports.main`，定时触发器 cron：

```text
0 0 4 * * * *
```

含义：每天 04:00:00。更短的 cron 视为错误。函数内还有 24h 成功间隔守卫，防止手动重试或重复触发打爆接口。

把上次成功时间写进 PostgreSQL 或 Cos；示例用环境变量目录下的 `last-success.json` 仅便于本地试跑，线上不要依赖函数实例本地盘。

拉数函数**不要**配置 HTTP 网关。活动页若要展示建模分数，另在 `activity_api` 提供只读接口，读已经写好的快照。
