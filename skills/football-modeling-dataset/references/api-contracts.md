# 接口契约

Host 固定 `https://football-api.hupu.com`。各接口 path 版本不同，按下面表格原样拼，不要改成 `/3/undefined/`，也不要统一成篮球那套 `/3/8.2.62/`。

联赛只靠 `competitionId`（积分榜参数名是 `hupuCompetitionId`）区分：

| 联赛 | `competitionId` | `--league` |
| --- | --- | --- |
| 西甲 | `119` | `laliga` |
| 德甲 | `127` | `bundesliga` |
| 意甲 | `107` | `seriea` |
| 英超 | `81` | `premier` |
| 法甲 | `140` | `ligue1` |

成功判定要看信封，两种并存：

| 接口 | 成功 | 业务数据 |
| --- | --- | --- |
| 积分榜 `competition/ranking` | HTTP 200 且 `code === 200` | `data` |
| 其余接口 | HTTP 200 且 `success === true`（或 `status === 200`） | `result` |

失败时不要把空 `result` / 空 `data` 当空联赛。URL 里不要保留 `//3/` 这种双斜杠。

参考路径：西甲 `119` → `seasonId=58617`（2026-2027）→ 巴萨 `newId=7002` → 克里斯滕森 `playerId=2151`。

## 1. 联赛赛季列表

`GET /3/8.2.57/football/category/v2/subDataCategory`

| 参数 | 值 |
| --- | --- |
| `competitionId` | `119` / `127` / `107` / `81` / `140` |

`result[]`：

| 字段 | 含义 |
| --- | --- |
| `seasonId` | 赛季主键，数值，后续积分榜和阵容原样传入 |
| `seasonName` | 展示名，如 `2026-2027` |
| `categorys` | **丢掉**。里面是积分榜/球员榜/球队榜的 H5 地址，建模不用 |

列表按新到旧。取当前赛季：

```js
const seasons = (body.result || []).map(({ seasonId, seasonName }) => ({ seasonId, seasonName }))
const current = seasons[0] // 最新一项
```

指定历史赛季时按 `seasonName` 或 `seasonId` 精确匹配，不要用「列表第一项 + 年份字符串包含」去猜。

## 2. 该赛季全部球队

`GET /2/8.2.57/football/competition/ranking`

| 参数 | 值 |
| --- | --- |
| `seasonId` | 上一步的 `seasonId` |
| `hupuCompetitionId` | 与赛季列表的 `competitionId` 相同 |

信封是 `code` / `data`，不是 `success` / `result`。

`data.rankData[]` 可能按组拆开（`groupNum`、`title`、`data[]`）。五大联赛通常只有一组「联赛排名」，仍必须扁平化：

```js
const teams = (data.rankData || []).flatMap((group) => group.data || [])
const unique = [...new Map(teams.map((t) => [String(t.newTeamId), t])).values()]
```

球队字段（建模常用）：

| 字段 | 含义 |
| --- | --- |
| `newTeamId` | **后续主键**，请求参数名改为 `newId` |
| `teamId` | 旧 ID，只作对照。巴萨示例：`teamId=252`，`newTeamId=7002` |
| `teamName` / `teamLogo` | 名称、队徽 |
| `ranking` / `played` / `wins` / `ties` / `losses` | 排名与战绩 |
| `goalsFor` / `goalsAgainst` / `points` | 进球、失球、积分 |
| `promotionStatus` / `color` / `labelBg` | 欧战/降级区标记，配合 `data.rankColor` |

`data.rankColor` 是区段说明（欧冠区、降级区等），`data.rankDesc` 是积分与欧战规则 HTML。`link` 是 App 跳转，不要写进 H5。

单联赛完整名单约 18–20 支。按 `newTeamId` 去重，不要按旧 `teamId`。

## 3. 球队基础资料

`GET /3/7.5.59/football/team/v2/info`

| 参数 | 值 |
| --- | --- |
| `newId` | 上一步的 `newTeamId` |
| `type` | 固定 `team` |

`result` 常用：`newId`、`oldId`、`teamId`（此处已是新 ID）、`name`、`enName`、`logo`、`worth`、`currency`、`address`、`officialWeb`、`arena`、`capacity`、`year`、`isNational`、`headerDayBg`。`prefecture*` 是社区专区，建模可不存。

巴萨示例：`worth=1262600000`，`currency=欧元`，`arena=Spotify诺坎普球场`，`year=1899`。

## 4. 球队各年份参赛列表

`GET /3/7.5.59/team/seasonYear`

| 参数 | 值 |
| --- | --- |
| `newId` | 球队 `newTeamId` |
| `type` | 固定 `team` |

`result[]` 按年：

| 字段 | 含义 |
| --- | --- |
| `name` / `fullName` | `26/27`、`2026-2027` |
| `year.start` / `year.end` | 起止年 |
| `competitions[]` | 该年参加的赛事 |

`competitions[]`：

| 字段 | 含义 |
| --- | --- |
| `competitionId` | 赛事 ID。五大联赛入口 ID 见上表；欧冠 `46`、国王杯 `124` 等不要写进默认全联赛循环 |
| `competitionName` | `西甲` / `欧冠` / `国王杯` |
| `seasonId` | **拉该赛事阵容时必须用这个**，与联赛入口的 `seasonId` 不是同一个数 |
| `competitionType` | `LEAGUE` / `INTERCONTINENTAL_CUP` / `DOMESTIC_CUP` / `UNKNOWN` |

同一年里西甲和欧冠的 `seasonId` 不同。默认建模只取 `competitionId` 等于当前五大联赛、且 `seasonId` 等于第 1 步选中赛季的那一项。要历史年或杯赛阵容时，按 `competitions[]` 逐条再打第 5 步。

巴萨 2026-2027 示例：西甲 `seasonId=58617`，欧冠 `seasonId=58587`。

## 5. 球队某赛事赛季阵容统计

`GET /3/7.5.59/team/player/season/stats`

| 参数 | 值 |
| --- | --- |
| `newId` | 球队 `newTeamId` |
| `seasonId` | 第 1 步的联赛 `seasonId`，或第 4 步某条 `competitions[].seasonId` |

`result[]` 就是该赛事赛季名单。`playerId` 是后续球员档案主键。常用：`name`、`avatar`、`position`、`isGoalkeeper`、`age`、`number`、`country`。

`stats[]` 按组：进攻 `40`、防守 `41`、组织 `42`、纪律 `43`、守门员 `44`。`value` 是字符串，可能带 `%` 或 `'`（出场时间）。没上场的球员 `stats` 可能是空数组，人仍在名单里，不要当成已离队。

建模常用指标：`进球` / `助攻` / `射门` / `射正` / `关键传球` / `传球成功率` / `抢断` / `拦截` / `解围` / `出场` / `首发` / `出场时间` / `黄牌` / `红牌`；门将再看 `扑救` / `出击成功率`。

## 6. 教练（当前，不分赛季）

`GET /3/7.5.59/football/coach/info`

| 参数 | 值 |
| --- | --- |
| `newId` | 球队 `newTeamId` |
| `type` | 固定 `team` |

只有当前主帅，没有年份或赛事参数。`result` 常用：`id`、`name`、`enName`、`avatar`、`age`、`nation`、`formation`、`describe`、`teamId`、`teamName`。巴萨示例：汉斯·弗里克，`formation=4-2-3-1`。

历史赛季画像不要把这一条当成当年主帅。

## 7. 球员基础资料

`GET /1/8.0.0/football/player/info`

| 参数 | 值 |
| --- | --- |
| `newId` | 阵容里的 `playerId` |

`result` 常用：`newId` / `playerId`、`name`、`enName`、`newsTag`、`avatar`、`worth`、`currency`、`foot`、`position`、`age`、`height`、`weight`、`birthday`、`nationality`、`shirtNumber`、`isGoalKeeper`、`teamId`、`teamName`。克里斯滕森示例：`newId=2151`，`worth=8000000`，`currency=欧元`，`position=后卫`。

`teamId` 这里已是新 ID。没有「按 playerId 查薪资」的独立 URL。

## 建议快照形状

```json
{
  "league": "laliga",
  "competitionId": 119,
  "seasonId": 58617,
  "seasonName": "2026-2027",
  "fetchedAt": "2026-09-24T05:00:00.000Z",
  "rankColor": [],
  "teams": [
    {
      "newId": "7002",
      "standing": {},
      "info": {},
      "years": [],
      "coach": {},
      "rosters": [
        {
          "seasonId": 58617,
          "competitionId": 119,
          "competitionName": "西甲",
          "competitionType": "LEAGUE",
          "players": [
            { "playerId": "2151", "roster": {}, "profile": {} }
          ]
        }
      ]
    }
  ]
}
```

`rosters` 按 `seasonId` 分桶。默认只有当前五大联赛一条；打开 `--competitions=all` 或指定历史赛季时再追加欧战/杯赛/往年。
