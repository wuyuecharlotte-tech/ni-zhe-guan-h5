# 接口契约

Host 固定 `https://games.mobileapi.hupu.com`，path 前缀固定 `/3/8.2.62/basketballapi/`。不要使用 `/3/undefined/`。`crt` / `night` / `vertical` 均可省略。

联赛只靠这四组参数区分，全部小写 `nba` / `cba`（`rankType` 除外）：

| 参数 | NBA | CBA |
| --- | --- | --- |
| `rankType` | `NBA_PLAYER_RANK` | `CBA_TEAM_RANK` |
| `competitionLeagueType` | `nba` | `cba` |
| `competitionType` | `nba` | `cba` |
| `leagueType` | `nba` | `cba` |

成功判定：HTTP 200 且 body `success === true`（或 `status === 200`）。业务数据在 `result`。失败时不要把空 `result` 当空联盟。

## 1. 联赛赛季列表

`GET /3/8.2.62/basketballapi/switchableRankSeasonList`

| 参数 | 值 |
| --- | --- |
| `rankType` | `NBA_PLAYER_RANK` 或 `CBA_TEAM_RANK` |
| `clientId` | 固定 `0`。省略时 `seasonData` 为空数组 |
| `offline` | 可选，`json` |

`result.seasonData[]`：

| 字段 | 含义 |
| --- | --- |
| `season` | 赛季主键，如 `2025-2026`，后续接口原样传入 |
| `shortSeason` | 短展示，如 `2025-26` |
| `seasonType` | `REGULAR` / `PLAYOFF` |
| `seasonTypeName` | `常规赛` / `季后赛` |
| `select` | 产品默认选中项，**建模不要用**；实测常为当前季后赛 |

取全联盟球队时：

```js
const regular = (result.seasonData || []).filter((row) => row.seasonType === 'REGULAR')
const season = regular[0]?.season // 列表按新到旧
```

## 2. 该赛季全部球队

`GET /3/8.2.62/basketballapi/teamStandingList`

| 参数 | 值 |
| --- | --- |
| `competitionLeagueType` | `nba` 或 `cba`（小写） |
| `competitionType` | 与上一项相同 |
| `season` | 上一步的 `season` |
| `competitionStageType` | 建模用 `REGULAR` |

`result.rankTypeListMap` 是对象不是数组：

| 联赛 | 实测结构 |
| --- | --- |
| CBA | `{ REGULAR: Team[] }`，常规赛约 20 支 |
| NBA | `{ E: Team[], W: Team[] }`，东西部各 15，合计 30 |

必须扁平化：

```js
const teams = Object.values(result.rankTypeListMap || {}).flat()
const unique = [...new Map(teams.map((t) => [t.teamId, t])).values()]
```

球队字段（建模常用）：`teamId`、`teamName`、`teamShortName`、`logoLink`、`rank`、`won`、`lost`、`winRate`、`homeWins`、`homeLosses`、`strk`。`schema` 是 App 跳转，不要写进 H5。

NBA 另有 `divRankTypeListMap`（Atlantic 等分区），全联盟名单仍以 `rankTypeListMap` 合并为准。

## 3. 球队基础资料

`GET /3/8.2.62/basketballapi/teamPageHeadInfo`

| 参数 | 值 |
| --- | --- |
| `teamId` | 上一步的 `teamId` |
| `leagueType` | `nba` 或 `cba`（小写） |

`result.info`：`teamId`、`tid`、`name`、`full_name`、`en_name`、`arena`、`logoLink`、`dayColor`、`nightColor`。`result.thread` 是社区专区，建模可不存。

## 4. 球队阵容

`GET /3/8.2.62/basketballapi/teamPlayerList`

| 参数 | 值 |
| --- | --- |
| `teamId` | 球队 ID |
| `leagueType` | `nba` 或 `cba` |
| `competitionType` | 默认同 `leagueType` |
| `competitionLeagueType` | 默认同 `leagueType` |

`result.list[]` 是球员（`playerId` 为后续主键），常用场均：`pts` / `reb` / `asts` / `min` / `fgp` / `tpp` / `ftp` / `stl` / `blk` / `to` / `game_played_start`。`salary` / `salary_str` 是阵容接口自带的薪资展示字符串，精确多年合同以第 6 步为准。

`result.offical[]` 是教练/管理层（字段名就是 `offical`），建模需要教练时从这里取，`id` 不是球员 `playerId`。

## 5. 球员基础资料

`GET /3/8.2.62/basketballapi/playerPageHeadInfo`

| 参数 | 值 |
| --- | --- |
| `playerId` | 阵容里的 `playerId` |
| `leagueType` | `nba` 或 `cba`（与球队接口相同，小写） |

`result.player` 常用：`name`、`alias`、`eng_name`、`position`、`number`、`age`、`height`、`weight`、`country`、`draft_year` / `draftRound` / `draftPick`、`contractDetails`、`teamName`、`photo`。`leaveTeam` 为 true 时不要再当现役建模。

## 6. 球队薪资表（按球员对齐）

`GET /3/8.2.62/basketballapi/salary/v1/query-team-salary-info`

| 参数 | 值 |
| --- | --- |
| `teamId` | 球队 ID |
| `leagueType` | `nba` 或 `cba`（小写） |

没有「按 playerId 查薪资」的独立 URL。`result.salaryPlayerTable.items[]` 里每行有 `playerId`，与阵容对齐；`seasonSalaryInfos` 与 `seasonSalaryHeads` 按下标对应。`result.salaryGeneralViewPlate` 是球队总薪资/空间/奢侈税概览。CBA 可能没有 NBA 同款奢侈税板块，按空数组处理。

## 建议快照形状

```json
{
  "league": "nba",
  "season": "2025-2026",
  "seasonType": "REGULAR",
  "fetchedAt": "2026-09-21T12:00:00.000Z",
  "teams": [
    {
      "teamId": "1901000000501290",
      "standing": {},
      "info": {},
      "salaryPlate": [],
      "players": [
        { "playerId": "1901000000473221", "roster": {}, "profile": {}, "salaryRow": {} }
      ]
    }
  ]
}
```
