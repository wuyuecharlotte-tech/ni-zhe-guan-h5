---
name: basketball-modeling-dataset
description: 为 NBA/CBA 球队与球员能力建模拉取离线资料快照。Use when 开发者要按身价、场均、阵容、合同给球队/球员建模、打分、雷达图或离线特征库；对话里需要真实联赛资料而不是演示数据；上线后要用 CloudBase 定时刷新建模底表。Do NOT use for 活动页展示某支已知球队/球员的即时资料（改用 colorbox-request-basketball-*）；不要在 H5 里请求 games.mobileapi.hupu.com 或 ColorboxAI.request 批量拉全联盟。
---

# NBA/CBA 球队球员建模资料

这是**离线资料管道**，不是页面展示接口。接口返回的是建模原料（赛季、全部球队、阵容场均、球员档案、球队薪资表），由 Agent 在对话中拉取，或由 CloudBase 定时函数写入云端快照。页面只读已经算好的建模结果。

## 铁律：两种合法触发，禁止第三种

| 场景 | ❌ 禁止 | ✅ 正确 |
| --- | --- | --- |
| 对话期建模 | 让 H5 `fetch` / `ColorboxAI.request` 去拉全联盟 | Agent 在本机或云函数里按下方链路请求接口，把 JSON 快照交给建模代码 |
| 上线后刷新 | 前端轮询、`setInterval`、每次打开页面重拉 | CloudBase **定时触发器**，间隔 **≥ 1 天**；函数内再挡一次「距上次成功不足 24h 则跳过」 |
| 页面展示 | 把本技能的 URL 写进 H5 | 展示单场/单队用已有 `colorbox-request-basketball-*`；展示建模分数用 `ColorboxAI.cloud.request` 读已落库快照 |

现有篮球展示技能（`teamInfo` / `teamPlayerList` / `playerInfo` / `teamSalaryInfo` / `singleMatch`）只适合「已知 teamId/playerId 的页面卡片」。全联盟建模、定时更新、禁止前端拉取，走本技能。

## NBA / CBA 怎么区分

整条链路只用下面这组值，不要混用大小写、不要发明第三套联赛码。

| 参数 | NBA | CBA | 用在 |
| --- | --- | --- | --- |
| `rankType` | `NBA_PLAYER_RANK` | `CBA_TEAM_RANK` | 赛季列表 |
| `competitionLeagueType` | `nba` | `cba` | 积分榜、阵容 |
| `competitionType` | `nba` | `cba` | 积分榜、阵容 |
| `leagueType` | `nba` | `cba` | 球队资料、阵容、球员档案、薪资表 |

路径版本固定 `/3/8.2.62/`。赛季列表的 `clientId` 固定传 `0`，不要用真实 App clientId，也不要省略（省略时 `seasonData` 为空）。

## 调用链（必须按这个顺序）

`select: true` 当前经常落在**季后赛**，季后赛名单不含未晋级球队。建模要全联盟时，**忽略 select，取 `seasonType === "REGULAR"` 的最新 `season`**。没有单独的 seasonId，赛季主键就是 `season` 字符串（如 `2025-2026`）。

```text
1. 赛季列表  rankType = NBA_PLAYER_RANK | CBA_TEAM_RANK，clientId=0
2. 取常规赛 season
3. 该赛季全部球队  competitionLeagueType/competitionType = nba|cba，competitionStageType=REGULAR
     NBA 的 rankTypeListMap 是 E/W（东西部），必须把所有 value 数组拼起来
     CBA 的 rankTypeListMap.REGULAR 才是完整 20 支
4. 用 teamId + leagueType=nba|cba → 球队资料 / 阵容 / 球队薪资表
5. 用阵容里的 playerId + leagueType=nba|cba → 球员档案
   薪资不是「按球员 ID 的独立接口」，而是球队薪资表里按 playerId 对齐
```

接口路径、参数、字段级契约见 [references/api-contracts.md](references/api-contracts.md)。可运行的拉取脚本见 [example/sync-dataset.js](example/sync-dataset.js)；定时触发配置见 [example/README.md](example/README.md)。

## 对话期（场景 1）

1. 先问清联赛（NBA / CBA / 两个都要）和建模范围（全联盟 / 某几支球队）。
2. 只拉当前建模需要的层：全联盟才走完整 1→5；单队建模从已知 `teamId` 从第 4 步开始。
3. 用本技能脚本或等价 Node `fetch` 拉取，写入工作区 JSON 快照后再建模。禁止生成「页面 onLoad 里请求 mobileapi」的代码。
4. 单次对话不要无节流打全量球员接口：全联盟约几十支球队、数百名球员。脚本默认串行、间隔 200ms；需要全量时告诉开发者会较慢。

## 定时刷新（场景 2）

1. 必须已选 `act-cloudbase`。用**独立事件函数**（如 `basketball_dataset_sync`）挂定时触发器，**不要**把全量拉取挂到 `activity_api` 的公开 HTTP 路由上，否则活动页可以触发打爆接口。
2. Cron 最短一天，例如每天 04:00：`0 0 4 * * * *`（CloudBase 七段 cron）。更短的周期视为错误实现。
3. 函数启动时读上次成功时间，`< 24h` 直接返回 `skipped`。
4. 成功后把快照写入 PostgreSQL / 对象存储；H5 只通过 `ColorboxAI.cloud.request` 读建模结果，不读原始 mobileapi。

## 不要做

- 不要把 `https://games.mobileapi.hupu.com/...` 写进 `h5/index.html`。
- 不要用 `window.ColorboxAI.request` / `ColorboxAI.request.basketball.*` 做本技能的批量同步。
- 不要使用 `/3/undefined/`，版本固定 `8.2.62`。赛季列表 `clientId` 固定 `0`，不要省略、不要填真实设备号。
- 不要把 `select: true` 当成「当前完整赛季」。
- 不要假设 NBA 积分榜是单一数组；东西部必须合并去重（按 `teamId`）。
- 不要按球员 ID 去拼一个不存在的薪资 URL；用球队薪资表。

## 完成自检

- 页面源码搜不到 `games.mobileapi.hupu.com`、也没有对 `ColorboxAI.request.basketball` 的全联盟循环。
- 对话期快照或云端表里能看到常规赛 `season` + 全量 `teamId`（NBA 30 / CBA 20 量级）。
- 若做了定时刷新：触发器 ≥ 1 天，且代码里有 24h 成功间隔守卫；拉数函数无公开网关。
