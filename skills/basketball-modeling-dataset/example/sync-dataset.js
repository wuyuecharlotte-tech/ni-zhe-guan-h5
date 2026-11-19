'use strict'

const fs = require('node:fs')
const path = require('node:path')

const API_VERSION = '8.2.62'
const API_HOST = `https://games.mobileapi.hupu.com/3/${API_VERSION}/basketballapi`
const CLIENT_ID = '0'
const MIN_INTERVAL_MS = 24 * 60 * 60 * 1000
const REQUEST_GAP_MS = 200

const LEAGUES = {
  nba: {
    rankType: 'NBA_PLAYER_RANK',
    competitionLeagueType: 'nba',
    competitionType: 'nba',
    leagueType: 'nba'
  },
  cba: {
    rankType: 'CBA_TEAM_RANK',
    competitionLeagueType: 'cba',
    competitionType: 'cba',
    leagueType: 'cba'
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function getJson (url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'colorbox-basketball-modeling-dataset/1.0' }
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${url}`)
  }
  const body = await response.json()
  if (body.success !== true && body.status !== 200) {
    throw new Error(`API ${url} failed: ${body.errorMsg || body.msg || 'unknown'}`)
  }
  return body.result
}

function regularSeason (seasonData) {
  const regular = (seasonData || []).filter((row) => row.seasonType === 'REGULAR')
  if (!regular.length) throw new Error('No REGULAR season in seasonData')
  return regular[0]
}

function flattenTeams (rankTypeListMap) {
  const teams = Object.values(rankTypeListMap || {}).flat().filter(Boolean)
  return [...new Map(teams.map((team) => [String(team.teamId), team])).values()]
}

async function fetchLeagueSnapshot (leagueKey, depth) {
  const spec = LEAGUES[leagueKey]
  if (!spec) throw new Error(`Unsupported league: ${leagueKey}`)

  const seasonResult = await getJson(
    `${API_HOST}/switchableRankSeasonList?offline=json&clientId=${CLIENT_ID}&rankType=${spec.rankType}`
  )
  const seasonRow = regularSeason(seasonResult.seasonData)
  await sleep(REQUEST_GAP_MS)

  const standing = await getJson(
    `${API_HOST}/teamStandingList?competitionLeagueType=${spec.competitionLeagueType}&competitionType=${spec.competitionType}&season=${encodeURIComponent(seasonRow.season)}&competitionStageType=REGULAR`
  )
  const teams = flattenTeams(standing.rankTypeListMap)

  const snapshot = {
    league: leagueKey,
    season: seasonRow.season,
    seasonType: 'REGULAR',
    fetchedAt: new Date().toISOString(),
    teams: teams.map((standingRow) => ({
      teamId: String(standingRow.teamId),
      standing: standingRow,
      info: null,
      salaryPlate: null,
      salaryPlayerTable: null,
      players: []
    }))
  }

  if (depth === 'standing') return snapshot

  for (const team of snapshot.teams) {
    await sleep(REQUEST_GAP_MS)
    const info = await getJson(
      `${API_HOST}/teamPageHeadInfo?teamId=${encodeURIComponent(team.teamId)}&leagueType=${spec.leagueType}`
    )
    team.info = info

    await sleep(REQUEST_GAP_MS)
    const roster = await getJson(
      `${API_HOST}/teamPlayerList?teamId=${encodeURIComponent(team.teamId)}&leagueType=${spec.leagueType}&competitionType=${spec.competitionType}&competitionLeagueType=${spec.competitionLeagueType}`
    )

    await sleep(REQUEST_GAP_MS)
    const salary = await getJson(
      `${API_HOST}/salary/v1/query-team-salary-info?teamId=${encodeURIComponent(team.teamId)}&leagueType=${spec.leagueType}`
    )
    team.salaryPlate = salary.salaryGeneralViewPlate || []
    team.salaryPlayerTable = salary.salaryPlayerTable || null
    const salaryByPlayer = new Map(
      (salary.salaryPlayerTable?.items || []).map((row) => [String(row.playerId), row])
    )

    team.players = (roster.list || []).map((player) => ({
      playerId: String(player.playerId),
      roster: player,
      profile: null,
      salaryRow: salaryByPlayer.get(String(player.playerId)) || null
    }))

    if (depth !== 'full') continue

    for (const player of team.players) {
      await sleep(REQUEST_GAP_MS)
      const profile = await getJson(
        `${API_HOST}/playerPageHeadInfo?playerId=${encodeURIComponent(player.playerId)}&leagueType=${spec.leagueType}`
      )
      player.profile = profile.player || profile
    }
  }

  return snapshot
}

function parseArgs (argv) {
  const args = { league: 'nba', depth: 'roster', out: '', force: false }
  for (const token of argv) {
    if (token.startsWith('--league=')) args.league = token.slice('--league='.length)
    else if (token.startsWith('--depth=')) args.depth = token.slice('--depth='.length)
    else if (token.startsWith('--out=')) args.out = token.slice('--out='.length)
    else if (token === '--force') args.force = true
  }
  if (!['nba', 'cba'].includes(args.league)) throw new Error('--league must be nba or cba')
  if (!['standing', 'roster', 'full'].includes(args.depth)) throw new Error('--depth must be standing|roster|full')
  return args
}

function readLastSuccess (file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

async function run (options) {
  const stampFile = options.stampFile || path.resolve(process.cwd(), 'last-success.json')
  const enforceInterval = options.enforceInterval === true && options.force !== true
  if (enforceInterval) {
    const previous = readLastSuccess(stampFile)
    if (previous?.fetchedAt && Date.now() - Date.parse(previous.fetchedAt) < MIN_INTERVAL_MS) {
      return { skipped: true, reason: 'last success is within 24h', previous }
    }
  }

  const snapshot = await fetchLeagueSnapshot(options.league, options.depth)
  if (options.out) {
    const outPath = path.resolve(options.out)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`)
  }
  if (options.enforceInterval) {
    fs.writeFileSync(stampFile, `${JSON.stringify({ fetchedAt: snapshot.fetchedAt, league: snapshot.league, season: snapshot.season }, null, 2)}\n`)
  }
  return { skipped: false, snapshot }
}

async function main (event = {}) {
  const fromCli = require.main === module
  const options = fromCli
    ? { ...parseArgs(process.argv.slice(2)), enforceInterval: false }
    : {
        league: event.league || 'nba',
        depth: event.depth || 'roster',
        out: event.out || '',
        force: Boolean(event.force),
        enforceInterval: true
      }
  return run(options)
}

exports.main = main
exports.fetchLeagueSnapshot = fetchLeagueSnapshot

if (require.main === module) {
  main()
    .then((result) => {
      if (result.skipped) {
        console.log(JSON.stringify({ skipped: true, reason: result.reason }))
        return
      }
      console.log(JSON.stringify({
        league: result.snapshot.league,
        season: result.snapshot.season,
        teams: result.snapshot.teams.length,
        fetchedAt: result.snapshot.fetchedAt
      }))
    })
    .catch((error) => {
      console.error(error.stack || error.message)
      process.exitCode = 1
    })
}
