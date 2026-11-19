---
name: football-modeling-dataset
description: 为足球五大联赛球队与球员能力建模拉取离线资料快照。Use when 开发者要按积分、阵容赛季统计、身价、教练给西甲/德甲/意甲/英超/法甲球队或球员建模、打分、雷达图或离线特征库；对话里需要真实联赛资料而不是演示数据；上线后要用 CloudBase 定时刷新建模底表。Do NOT use for 活动页展示某支已知球队/球员的即时资料（改用 colorbox-request-football-*）；不要在 H5 里请求 football-api.hupu.com 或 ColorboxAI.request 批量拉全联赛。
---

# 足球五大联赛球队球员建模资料

这是**离线资料管道**，不是页面展示接口。接口返回的是建模原料（赛季、全部球队、球队档案、分赛季分赛事阵容统计、教练、球员档案），由 Agent 在对话中拉取，或由 CloudBase 定时函数写入云端快照。页面只读已经算好的建模结果。

## 铁律：两种合法触发，禁止第三种

| 场景 | ❌ 禁止 | ✅ 正确 |
| --- | --- | --- |
| 对话期建模 | 让 H5 `fetch` / `ColorboxAI.request` 去拉全联赛 | Agent 在本机或云函数里按下方链路请求接口，把 JSON 快照交给建模代码 |
| 上线后刷新 | 前端轮询、`setInterval`、每次打开页面重拉 | CloudBase **定时触发器**，间隔 **≥ 1 天**；函数内再挡一次「距上次成功不足 24h 则跳过」 |
| 页面展示 | 把本技能的 URL 写进 H5 | 展示单队/单人用已有 `colorbox-request-football-*`；展示建模分数用 `ColorboxAI.cloud.request` 读已落库快照 |

现有足球展示技能（`teamInfo` / `teamSeasonYear` / `teamPlayerSeasonStats` / `coachInfo` / `playerInfo` / `matchInfo`）只适合「已知 newId / playerId 的页面卡片」。全联赛建模、定时更新、禁止前端拉取，走本技能。

## 五大联赛怎么区分

整条链路只用下面这组 `competitionId`，不要发明第六个联赛码，不要把欧冠/国内杯赛当成五大联赛入口。

| 参数 | 西甲 | 德甲 | 意甲 | 英超 | 法甲 | 用在 |
| --- | --- | --- | --- | --- | --- | --- |
| `competitionId` / `hupuCompetitionId` | `119` | `127` | `107` | `81` | `140` | 赛季列表、积分榜 |
| 脚本 `--league` | `laliga` | `bundesliga` | `seriea` | `premier` | `ligue1` | 本地/定时拉取 |

球队后续接口的主键是积分榜里的 **`newTeamId`**，请求参数名是 **`newId`**。不要把积分榜里的旧 `teamId`（如巴萨 `252`）传给 `team/v2/info`。

各接口路径版本不一样，按契约原样使用，不要统一成同一个 `/3/x.x.x/`。

## 调用链（必须按这个顺序）

赛季列表按新到旧。建模要「当前赛季全联赛」时，**忽略 `categorys`，取 `result[0]` 的 `seasonId` / `seasonName`**。足球有独立的数值 `seasonId`，后续积分榜和阵容都靠它，不要只用年份字符串去猜。

同一支球队在同一年份会参加联赛、欧战、国内杯，**每个赛事有自己的 `seasonId`，阵容统计也不一样**。默认只拉五大联赛那个 `seasonId`；要杯赛/欧战阵容时，先用 `team/seasonYear` 取出对应 `competitions[].seasonId` 再拉。

```text
1. 赛季列表  competitionId = 119|127|107|81|140
   只要 seasonId / seasonName；丢掉 categorys
2. 该赛季全部球队  seasonId + hupuCompetitionId
   球队主键 = newTeamId（后面全部当 newId 用）
   旧 teamId 只作对照，不参与后续请求
3. newId + type=team → 球队基础资料
4. newId + type=team → 该队各年份参赛列表（seasonYear）
5. newId + seasonId → 该队在该赛事赛季的阵容统计
   默认 seasonId 用第 1 步的联赛赛季；历史年/杯赛用第 4 步的 competitions
6. newId + type=team → 教练（不区分年份或赛事，只有当前教练）
7. 阵容里的 playerId 当 newId → 球员档案
```

接口路径、参数、字段级契约见 [references/api-contracts.md](references/api-contracts.md)。可运行的拉取脚本见 [example/sync-dataset.js](example/sync-dataset.js)；定时触发配置见 [example/README.md](example/README.md)。参考路径：西甲 `119` → 2026-2027 `seasonId=58617` → 巴萨 `newId=7002` → 克里斯滕森 `newId=2151`。

## 对话期（场景 1）

1. 先问清联赛（西甲 / 德甲 / 意甲 / 英超 / 法甲 / 五个都要）和建模范围（全联赛 / 某几支球队；只要当前联赛赛季 / 要历史年或欧战杯赛阵容）。
2. 只拉当前建模需要的层：全联赛才走完整 1→7；单队建模若已有 `newId`，从第 3 步开始，但仍要用第 4 步确认该队在目标年份是否参加了该联赛。
3. 用本技能脚本或等价 Node `fetch` 拉取，写入工作区 JSON 快照后再建模。禁止生成「页面 onLoad 里请求 football-api」的代码。
4. 单次对话不要无节流打全量球员接口：一个联赛约 20 支球队、每队约 20–30 名球员。五个联赛全量 `full` 会打数千次。脚本默认串行、间隔 200ms；需要全量时告诉开发者会较慢。
5. 新赛季刚开打时积分和阵容统计样本很小（例如 2026-2027 西甲当时只有 6–7 轮）。若要完整赛季画像，明确改拉上一完整赛季，不要默认把「列表第一项」当成可建模的完整赛季。

## 定时刷新（场景 2）

1. 必须已选 `act-cloudbase`。用**独立事件函数**（如 `football_dataset_sync`）挂定时触发器，**不要**把全量拉取挂到 `activity_api` 的公开 HTTP 路由上，否则活动页可以触发打爆接口。
2. Cron 最短一天，例如每天 04:00：`0 0 4 * * * *`（CloudBase 七段 cron）。更短的周期视为错误实现。
3. 函数启动时读上次成功时间，`< 24h` 直接返回 `skipped`。
4. 成功后把快照写入 PostgreSQL / 对象存储；H5 只通过 `ColorboxAI.cloud.request` 读建模结果，不读原始 football-api。

## 不要做

- 不要把 `https://football-api.hupu.com/...` 写进 `h5/index.html`。
- 不要用 `window.ColorboxAI.request` / `ColorboxAI.request.football.*` 做本技能的批量同步。
- 不要把五个接口的 path 版本改成同一个数字；赛季列表是 `/3/8.2.57/`，积分榜是 `/2/8.2.57/`，球队/教练是 `/3/7.5.59/`，球员档案是 `/1/8.0.0/`。
- 不要使用赛季列表返回的 `categorys`（积分榜/球员榜/球队榜 H5 地址与建模无关）。
- 不要把积分榜的旧 `teamId` 当成后续 `newId`。
- 不要假设一支球队全年只有一份阵容；必须按 `seasonId`（联赛/欧战/杯赛各自一份）拉取。
- 不要把当前教练接口的结果套到历史赛季上去当当时主帅。
- 不要按球员 ID 去拼一个不存在的身价 URL；身价在球队资料 `worth` 和球员档案 `worth` 里，单位看 `currency`。

## 完成自检

- 页面源码搜不到 `football-api.hupu.com`、也没有对 `ColorboxAI.request.football` 的全联赛循环。
- 对话期快照或云端表里能看到数值 `seasonId` + 全量 `newId`（单联赛约 20 支；五个联赛约 98 支量级）。
- 阵容记录带 `seasonId`，且能区分同一年份的联赛阵容与欧战/杯赛阵容。
- 若做了定时刷新：触发器 ≥ 1 天，且代码里有 24h 成功间隔守卫；拉数函数无公开网关。
