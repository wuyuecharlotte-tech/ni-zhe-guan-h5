#!/usr/bin/env node
// Platform provisions infrastructure; official CloudBase MCP updates user source.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const API_BASE = 'https://shaper.hupu.com';
const APP_ID = 'app_368013920e';
const TOKEN = 'shaper_tk_7958197548475cff611880f7c87361a9f81a9caf3891da3cfc4b7ad5c4a0bd0b';
const mode = process.argv[2] || 'ensure';
const pause = () => new Promise(resolve => setTimeout(resolve, 12000));

async function request(route, method = 'GET') {
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(API_BASE.replace(/\/$/, '') + route, {
    method, headers: { 'X-Shaper-Token': TOKEN, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(120000)
      });
      if (response.status < 500 || attempt === 2) break;
    } catch (error) { if (attempt === 2) throw error; }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  const result = await response.json();
  if (!response.ok || result.success === false) throw new Error(result.code || `HTTP_${response.status}`);
  return result.data;
}
async function main() {
  if (!['ensure', 'status', 'reconcile'].includes(mode)) throw new Error('用法：ensure-game-service.js [ensure|status|reconcile]');
  if (!/^app_[a-zA-Z0-9]+$/.test(APP_ID) || !TOKEN.startsWith('shaper_tk_')) throw new Error('请使用平台下载的已绑定应用技能包');
  const route = '/api/v1/cloudbase/projects/' + encodeURIComponent(APP_ID);
  let result;
  let reconcileAccepted = false;
  const deadline = Date.now() + 20 * 60000;
  do {
    if (mode === 'ensure') {
      result = await request(route + '/game/ensure', 'POST');
      if (result.ready) result = await request(route + '/game/status');
    } else if (mode === 'reconcile' && !reconcileAccepted) {
      result = await request(route + '/game/reconcile', 'POST');
      reconcileAccepted = result.accepted === true;
    } else result = await request(route + '/game/status');
    console.log(JSON.stringify({ appId: APP_ID, envId: result.envId, status: result.status, ready: result.ready, endpoint: result.endpoint || null }));
    if (mode === 'status' || result.ready) break;
    if (result.error || /failed|abnormal/i.test(result.status)) throw new Error('游戏服务未就绪，请查询构建/运行日志后修复，勿重新初始化覆盖代码');
    await pause();
  } while (Date.now() < deadline);
  if (!result?.ready) {
    if (mode === 'status') return;
    throw new Error('游戏服务仍未就绪；可再次运行同一命令继续，不会重复创建或覆盖已有源码');
  }
  if (!result.endpoint || !result.appId) throw new Error('GAME_CONNECTION_CONFIG_MISSING');
  fs.writeFileSync('game-service.json', JSON.stringify(result, null, 2) + '\n');
  // Obtain environment-scoped MCP credentials through the existing platform API.
  // Values are written programmatically, never printed or placed in game source.
  const binding = await request(route);
  const previous = fs.existsSync('credentials.json') ? JSON.parse(fs.readFileSync('credentials.json', 'utf8')) : {};
  fs.writeFileSync('credentials.json', JSON.stringify({ ...previous, envId: binding.envId, ...(binding.apiKey ? { apiKey: binding.apiKey } : {}) }, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync('credentials.json', 0o600);
  if (mode === 'ensure' && !fs.existsSync('game')) {
    const response = await fetch(API_BASE.replace(/\/$/, '') + result.templatePath, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('模板下载失败，请重新运行初始化命令');
    const archive = path.resolve('game-source.zip');
    fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    const staging = fs.mkdtempSync(path.resolve('.game-init-'));
    try {
      execFileSync('unzip', ['-q', archive, '-d', staging]);
      const clientTemplate = path.resolve(__dirname, '../../shaper-multiplayer/templates/client/client.html');
      const html = fs.readFileSync(clientTemplate, 'utf8')
        .replace("'app_REPLACE_ME'", JSON.stringify(result.appId))
        .replace("'https://REPLACE_ME.sh.run.tcloudbase.com'", JSON.stringify(result.endpoint));
      fs.writeFileSync(path.join(staging, 'client.html'), html);
      fs.renameSync(staging, path.resolve('game'));
    } finally { fs.rmSync(staging, { recursive: true, force: true }); }
    console.log('Demo 源码：game/；前端 appId 与 endpoint 已填入 game/client.html');
  } else if (mode === 'ensure') console.log('已有 game/，保留本地代码；连接配置见 game-service.json');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
