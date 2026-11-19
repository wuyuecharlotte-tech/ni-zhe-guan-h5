'use strict'

const fs = require('node:fs')
const path = require('node:path')

const API_HOST = 'https://football-api.hupu.com'
const MIN_INTERVAL_MS = 24 * 60 * 60 * 1000
const REQUEST_GAP_MS = 200

const LEAGUES = {
  laliga: { competitionId: 119, name: '西甲' },
  bundesliga: { competitionId: 127, name: '德甲' },
  seriea: { competitionId: 107, name: '意甲' },
  premier: { competitionId: 81, name: '英超' },
  ligue1: { competitionId: 140, name: '法甲' }
}

const LEAGUE_ALIASES = {
  西甲: 'laliga',
  德甲: 'bundesliga',
  意甲: 'seriea',
  英超: 'premier',
  法甲: 'ligue1',
  119: 'laliga',
  127: 'bundesliga',
  107: 'seriea',
  81: 'premier',
  140: 'ligue1'
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function resolveLeagueKey (raw) {
  const key = String(raw || '').trim()
  if (LEAGUES[key]) return key
  return LEAGUE_ALIASES[key] || ''
}

async function getJson (url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'colorbox-football-modeling-dataset/1.0' }
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${url}`)
  }
  const body = await response.json()
  if (Object.prototype.hasOwnProperty.call(body, 'code')) {
    if (body.code !== 200) {
      throw new Error(`API ${url} failed: ${body.msg || body.errorMsg || 'unknown'}`)
    }
    return body.data
  }
  if (body.success !== true && body.status !== 200) {
    throw new Error(`API ${url} failed: ${body.errorMsg || body.msg || 'unknown'}`)
  }
  return body.result
}

function pickSeason (seasons, seasonQuery) {
  const rows = (seasons || [])
    .map((row) => ({ seasonId: row.seasonId, seasonName: row.seasonName }))
    .filter((row) => row.seasonId != null && row.seasonName)
  if (!rows.length) throw new Error('No seasonId/seasonName in subDataCategory')
  if (!seasonQuery || seasonQuery === 'latest') return rows[0]
  const matched = rows.find((row) => (
    String(row.seasonId) === String(seasonQuery) ||
    row.seasonName === seasonQuery
  ))
  if (!matched) throw new Error(`Season not found: ${seasonQuery}`)
  return matched
}

function flattenRanking (rankData) {
  const teams = (rankData || []).flatMap((group) => group.data || []).filter(Boolean)
  return [...new Map(teams.map((team) => [String(team.newTeamId), team])).values()]
}

function competitionsForSnapshot (years, spec, seasonRow, competitionsMode) {
  const wanted = []
  for (const year of years || []) {
    const yearName = year.fullName || year.year?.realFullYearName || year.name
    const inSelectedYear = yearName === seasonRow.seasonName
    for (const item of year.competitions || []) {
      const isLeagueSeason = Number(item.competitionId) === spec.competitionId &&
        Number(item.seasonId) === Number(seasonRow.seasonId)
      if (competitionsMode === 'league') {
        if (isLeagueSeason) wanted.push({ ...item, yearName })
        continue
      }
      if (inSelectedYear) wanted.push({ ...item, yearName })
    }
  }
  if (competitionsMode === 'league' && !wanted.length) {
    wanted.push({
      competitionId: spec.competitionId,
      competitionName: spec.name,
      seasonId: seasonRow.seasonId,
      competitionType: 'LEAGUE',
      yearName: seasonRow.seasonName
    })
  }
  return [...new Map(wanted.map((item) => [String(item.seasonId), item])).values()]
}

async function fetchLeagueSnapshot (leagueKey, options) {
  const spec = LEAGUES[leagueKey]
  if (!spec) throw new Error(`Unsupported league: ${leagueKey}`)

  const seasons = await getJson(
    `${API_HOST}/3/8.2.57/football/category/v2/subDataCategory?competitionId=${spec.competitionId}`
  )
  const seasonRow = pickSeason(seasons, options.season)
  await sleep(REQUEST_GAP_MS)

  const standing = await getJson(
    `${API_HOST}/2/8.2.57/football/competition/ranking?seasonId=${encodeURIComponent(seasonRow.seasonId)}&hupuCompetitionId=${spec.competitionId}`
  )
  const teams = flattenRanking(standing.rankData)

  const snapshot = {
    league: leagueKey,
    competitionId: spec.competitionId,
    seasonId: seasonRow.seasonId,
    seasonName: seasonRow.seasonName,
    fetchedAt: new Date().toISOString(),
    rankColor: standing.rankColor || [],
    teams: teams.map((standingRow) => ({
      newId: String(standingRow.newTeamId),
      standing: standingRow,
      info: null,
      years: [],
      coach: null,
      rosters: []
    }))
  }

  if (options.depth === 'standing') return snapshot

  for (const team of snapshot.teams) {
    await sleep(REQUEST_GAP_MS)
    team.info = await getJson(
      `${API_HOST}/3/7.5.59/football/team/v2/info?newId=${encodeURIComponent(team.newId)}&type=team`
    )

    await sleep(REQUEST_GAP_MS)
    team.years = await getJson(
      `${API_HOST}/3/7.5.59/team/seasonYear?newId=${encodeURIComponent(team.newId)}&type=team`
    ) || []

    await sleep(REQUEST_GAP_MS)
    team.coach = await getJson(
      `${API_HOST}/3/7.5.59/football/coach/info?newId=${encodeURIComponent(team.newId)}&type=team`
    )

    const targets = competitionsForSnapshot(team.years, spec, seasonRow, options.competitions)
    for (const competition of targets) {
      await sleep(REQUEST_GAP_MS)
      const roster = await getJson(
        `${API_HOST}/3/7.5.59/team/player/season/stats?newId=${encodeURIComponent(team.newId)}&seasonId=${encodeURIComponent(competition.seasonId)}`
      )
      const players = (roster || []).map((player) => ({
        playerId: String(player.playerId),
        roster: player,
        profile: null
      }))

      if (options.depth === 'full') {
        for (const player of players) {
          await sleep(REQUEST_GAP_MS)
          const profile = await getJson(
            `${API_HOST}/1/8.0.0/football/player/info?newId=${encodeURIComponent(player.playerId)}`
          )
          player.profile = profile
        }
      }

      team.rosters.push({
        seasonId: competition.seasonId,
        competitionId: competition.competitionId,
        competitionName: competition.competitionName,
        competitionType: competition.competitionType,
        yearName: competition.yearName,
        players
      })
    }
  }

  return snapshot
}

function parseArgs (argv) {
  const args = {
    league: 'laliga',
    depth: 'roster',
    season: 'latest',
    competitions: 'league',
    out: '',
    force: false
  }
  for (const token of argv) {
    if (token.startsWith('--league=')) args.league = token.slice('--league='.length)
    else if (token.startsWith('--depth=')) args.depth = token.slice('--depth='.length)
    else if (token.startsWith('--season=')) args.season = token.slice('--season='.length)
    else if (token.startsWith('--competitions=')) args.competitions = token.slice('--competitions='.length)
    else if (token.startsWith('--out=')) args.out = token.slice('--out='.length)
    else if (token === '--force') args.force = true
  }
  const leagueKey = resolveLeagueKey(args.league)
  if (args.league !== 'all' && !leagueKey) {
    throw new Error('--league must be laliga|bundesliga|seriea|premier|ligue1|all, or 西甲/德甲/意甲/英超/法甲, or competitionId')
  }
  if (!['standing', 'roster', 'full'].includes(args.depth)) throw new Error('--depth must be standing|roster|full')
  if (!['league', 'all'].includes(args.competitions)) throw new Error('--competitions must be league|all')
  return { ...args, league: args.league === 'all' ? 'all' : leagueKey }
}

function readLastSuccess (file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

async function fetchRequestedSnapshots (options) {
  const keys = options.league === 'all' ? Object.keys(LEAGUES) : [options.league]
  const snapshots = []
  for (const key of keys) {
    snapshots.push(await fetchLeagueSnapshot(key, options))
  }
  return snapshots
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

  const snapshots = await fetchRequestedSnapshots(options)
  const payload = snapshots.length === 1 ? snapshots[0] : { fetchedAt: new Date().toISOString(), leagues: snapshots }
  if (options.out) {
    const outPath = path.resolve(options.out)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`)
  }
  if (options.enforceInterval) {
    fs.writeFileSync(stampFile, `${JSON.stringify({
      fetchedAt: payload.fetchedAt,
      league: options.league,
      seasonId: snapshots[0]?.seasonId,
      seasonName: snapshots[0]?.seasonName
    }, null, 2)}\n`)
  }
  return { skipped: false, snapshot: payload, snapshots }
}

async function main (event = {}) {
  const fromCli = require.main === module
  const options = fromCli
    ? { ...parseArgs(process.argv.slice(2)), enforceInterval: false }
    : {
        league: resolveLeagueKey(event.league) || event.league || 'laliga',
        depth: event.depth || 'roster',
        season: event.season || 'latest',
        competitions: event.competitions || 'league',
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
      const rows = result.snapshots.map((snapshot) => ({
        league: snapshot.league,
        competitionId: snapshot.competitionId,
        seasonId: snapshot.seasonId,
        seasonName: snapshot.seasonName,
        teams: snapshot.teams.length
      }))
      console.log(JSON.stringify({ fetchedAt: result.snapshot.fetchedAt, leagues: rows }))
    })
    .catch((error) => {
      console.error(error.stack || error.message)
      process.exitCode = 1
    })
}
