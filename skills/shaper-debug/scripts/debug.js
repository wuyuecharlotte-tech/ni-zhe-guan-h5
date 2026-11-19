#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

function options(argv) {
  const result = {};
  const allowed = new Set(['preview-url', 'project-id', 'mock-login', 'actors', 'actor', 'trace', 'run', 'from', 'to', 'level', 'limit', 'follow', 'help']);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--') || !allowed.has(key)) throw new Error(`不支持的参数：${argv[i]}`);
    if (key === 'follow' || key === 'help') result[key] = true;
    else { if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`参数 --${key} 缺少值`); result[key] = argv[++i]; }
  }
  return result;
}
function integer(value, fallback, max) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`数量必须是 1 到 ${max} 的整数`);
  return n;
}
function save(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); fs.chmodSync(file, 0o600); }
async function main() {
  const command = process.argv[2], flags = options(process.argv.slice(3));
  if (!command || command === '--help' || flags.help) { console.log('用法：debug.js start [--preview-url URL] [--mock-login true|false] [--actors 1..64]\n      debug.js link [--actor 1]\n      debug.js logs [--project-id ID] [--trace ID] [--run ID] [--from ISO] [--to ISO] [--level error] [--limit 100] [--follow]'); return; }
  const root = path.resolve(__dirname, '../../..');
  const credentials = JSON.parse(fs.readFileSync(path.join(root, 'credentials.json'), 'utf8'));
  const activity = JSON.parse(fs.readFileSync(path.join(root, 'activity.json'), 'utf8'));
  const boundProjectId = activity.activityId;
  const base = credentials.aiGameServerUrl || credentials.shaperServerUrl;
  const token = process.env.SHAPER_AUTH_TOKEN || credentials.authorizationToken || credentials.shaperToken;
  if (!boundProjectId || !base || !token) throw new Error('工作区未绑定项目或授权，请回 Shaper 重新授权／下载技能包');
  async function request(suffix, body) {
    const response = await fetch(new URL(suffix, base), { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-shaper-token': token }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    let payload; try { payload = await response.json(); } catch { throw new Error(`HTTP ${response.status}：Shaper 暂不可用，请稍后重试`); }
    if (!response.ok || payload.code !== 0) throw new Error(`${payload.code || response.status}：${payload.message || '请求失败'}`);
    return payload.data;
  }
  const prefixFor = projectId => `/api/v1/projects/${encodeURIComponent(projectId)}/debug`;
  const contextFile = path.join(root, 'debug-context.json');
  if (command === 'start') {
    const previewUrl = flags['preview-url'] || (await request(prefixFor(boundProjectId) + '/preview', {})).previewUrl;
    const url = new URL(previewUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('预览地址必须是 HTTP(S)');
    if (flags['mock-login'] !== undefined && !['true', 'false'].includes(flags['mock-login'])) throw new Error('--mock-login 只接受 true 或 false');
    const mockLogin = flags['mock-login'] !== 'false';
    const count = integer(flags.actors, 1, 64);
    const endpoint = flags['preview-url'] ? '/api/v1/debug/grants' : prefixFor(boundProjectId) + '/grants';
    const result = await request(endpoint, { previewUrl: url.href, mockLogin, scopes: ['runtime.login', 'cloud.request', 'logs.read', 'game.login'], actors: Array.from({ length: count }, (_, i) => ({ key: `player-${i + 1}`, displayName: `虎扑用户${String.fromCharCode(65 + i)}` })) });
    if (!/^app_[a-zA-Z0-9]+$/.test(result.projectId)) throw new Error('Shaper 未返回有效的预览项目');
    save(contextFile, { ...result, previewUrl: url.href, mockLogin });
    console.log(JSON.stringify({ projectId: result.projectId, debugRunId: result.debugRunId, expiresAt: result.expiresAt, mockLogin, actors: result.actors }, null, 2));
  } else if (command === 'link') {
    const context = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
    if (!/^app_[a-zA-Z0-9]+$/.test(context.projectId)) throw new Error('排查记录缺少预览项目，请重新 start');
    const actor = context.actors[integer(flags.actor, 1, context.actors.length) - 1];
    const data = await request(`${prefixFor(context.projectId)}/grants/${encodeURIComponent(context.grantId)}/actors/${encodeURIComponent(actor.actorId)}/bootstrap`, { previewUrl: context.previewUrl, mockLogin: context.mockLogin });
    actor.qrUrl = data.qrUrl; save(contextFile, context); console.log(data.qrUrl);
  } else if (command === 'logs') {
    const context = fs.existsSync(contextFile) ? JSON.parse(fs.readFileSync(contextFile, 'utf8')) : {};
    const projectId = flags['project-id'] || context.projectId || boundProjectId;
    if (!/^app_[a-zA-Z0-9]+$/.test(projectId)) throw new Error('项目 ID 无效');
    for (;;) {
      const now = Date.now(), query = new URLSearchParams({ from: flags.from || new Date(now - 15 * 60000).toISOString(), to: flags.to || new Date(now).toISOString(), limit: String(integer(flags.limit, 100, 200)) });
      // A trace can originate on an ordinary Debug page without a grant; don't accidentally restrict it to another run.
      const run = flags.run || (!flags.trace && projectId === context.projectId ? context.debugRunId : undefined);
      if (run) query.set('debugRunId', run);
      if (flags.trace) query.set('traceId', flags.trace);
      if (flags.level) query.set('level', flags.level);
      const result = await request(prefixFor(projectId) + '/logs?' + query);
      save(path.join(root, 'debug-logs.json'), result);
      console.log(JSON.stringify(result, null, 2));
      if (!flags.follow) break;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } else throw new Error('仅支持 start、link、logs');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
