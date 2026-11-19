// 冒烟测试：node tools/smoke-test.js
// 用模拟的 window.ColorboxAI 检查：论坛楼层齐全、顶部安全距离、詹姆斯路线、★ 隐藏选项、
// 本机存档续玩、晒战绩 6 种情况（成功 / 平台没配专区 / 没登录 / 上传失败 / 编辑器报错 / 不在 App 内）、就绪上报。
const path = require('path');
const {chromium} = require('playwright');
const URL_ = 'file://' + path.resolve(__dirname, '../h5/index.html');

// mode 决定模拟 SDK 的行为；调用记录写到 window.__calls
function mockSdk(mode) {
  window.__calls = []; window.__ready = 0;
  window.ShaperPerformance = {markReady: () => { window.__ready++; }};
  if (mode === 'outside') return;
  const log = (name, arg) => window.__calls.push([name, arg]);
  window.ColorboxAI = {
    getFullscreenSafeTop: () => 44,
    auth: {getUserInfo: async () => { log('getUserInfo'); return mode === 'nologin' ? {code: 200, message: 'ok', data: {islogin: 0}} : {code: 200, message: 'ok', data: {islogin: 1}}; }},
    oss: {uploadFile: async (p) => { log('uploadFile', {isBlob: p.file instanceof Blob, size: p.file.size, type: p.file.type}); if (mode === 'uploadfail') throw new Error('网络开小差了'); return {downloadUrl: 'https://i1.hoopchina.com.cn/poster.png', name: 'poster.png'}; }},
    bbsConfig: {get: async () => { log('bbsConfig'); return mode === 'notag' ? {bbsTagId: ''} : {bbsTopicId: '85', bbsTagId: '152660', bbsTopicName: '湿乎乎的话题', bbsTagName: '你这冠算不算'}; }},
    request: {bbs: {openPostEditor: async (p) => { log('openPostEditor', p); return mode === 'editorfail' ? {code: 500, message: '编辑器暂时打不开'} : {code: 200, message: 'ok', schema: 'x'}; }}}
  };
}

(async () => {
  const b = await chromium.launch();
  const ok = []; const check = (name, cond) => ok.push([name, !!cond]);
  const errs = [];
  const open = async (mode) => {
    const ctx = await b.newContext({viewport: {width: 390, height: 844}});
    const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(mockSdk, mode); await pg.goto(URL_);
    return pg;
  };
  const playAll = async (pg, picks) => { for (const p of picks) { await pg.click(`[data-pick="${p}"]`); await pg.click('[data-act=next]'); } };

  // 基础
  let pg = await open('ok');
  const info = await pg.evaluate(() => {
    const {nodes} = window.GAME, miss = [];
    nodes.forEach((n, i) => n.options.forEach((o, j) => { if (!window.FORUM.threads[i]?.[j]) miss.push(i + ':' + j); }));
    return {james: nodes.map(n => n.james), miss, top: getComputedStyle(document.body).paddingTop};
  });
  check('每个选项都有论坛楼层', info.miss.length === 0);
  check('顶部安全距离生效', info.top === '44px');
  await pg.waitForFunction(() => window.__ready >= 1, null, {timeout: 5000}).then(() => check('首屏就绪上报', true), () => check('首屏就绪上报', false));
  await pg.click('[data-act=start]');
  await playAll(pg, info.james.slice(0, 5));
  await pg.reload();
  check('刷新后可继续生涯', await pg.$('[data-act=continue]'));
  await pg.click('[data-act=continue]');
  check('续玩回到第 6 站', (await pg.textContent('.side h2')).includes('第 6 /'));
  await playAll(pg, info.james.slice(5));
  check('詹姆斯路线结局', (await pg.textContent('h1')) === '詹姆斯 100%');
  await pg.reload(); await pg.click('[data-act=continue]');
  check('刷新后结局还在', (await pg.textContent('h1')) === '詹姆斯 100%');
  await pg.click('[data-act=reset]');
  // 一路选 A，遇到 ★ 隐藏选项就点它
  for (let k = 0; k < info.james.length; k++) {
    const star = await pg.$('[data-act=recall]');
    if (star) { await star.click(); check('★ 隐藏选项带论坛', await pg.$('.forumThread')); break; }
    await pg.click('[data-pick="0"]'); await pg.click('[data-act=next]');
  }
  await pg.context().close();

  // 晒战绩 6 种情况
  const cases = {
    ok: ['发帖编辑器已打开', c => c.some(x => x[0] === 'openPostEditor' && x[1].tagId === '152660' && x[1].imageUrl.startsWith('https://') && x[1].title.includes('詹姆斯 100%') && x[1].content.includes('成分鉴定：詹姆斯 100%')) && c.some(x => x[0] === 'uploadFile' && x[1].isBlob && x[1].type === 'image/png' && x[1].size > 10000)],
    notag: ['发帖编辑器已打开', c => c.some(x => x[0] === 'openPostEditor' && !('tagId' in x[1]) && !('topicId' in x[1]))],
    nologin: ['登录虎扑后才能晒战绩', c => !c.some(x => x[0] === 'uploadFile' || x[0] === 'openPostEditor')],
    uploadfail: ['海报上传失败', c => !c.some(x => x[0] === 'openPostEditor')],
    editorfail: ['编辑器暂时打不开', c => c.filter(x => x[0] === 'openPostEditor').length === 1 && c.filter(x => x[0] === 'uploadFile').length === 1],
    outside: ['请在虎扑 App 内打开', c => c.length === 0]
  };
  for (const [mode, [want, verify]] of Object.entries(cases)) {
    pg = await open(mode);
    await pg.click('[data-act=start]'); await playAll(pg, info.james);
    await pg.click('[data-act=poster]'); await pg.waitForSelector('.posterModal img');
    await pg.click('.posterActions .primary');
    await pg.waitForFunction(() => !document.querySelector('.posterActions .primary').disabled);
    const tip = await pg.textContent('.posterTip'); const calls = await pg.evaluate(() => window.__calls);
    check('晒战绩·' + mode + '（提示：' + tip + '）', tip.includes(want) && verify(calls));
    check('晒战绩·' + mode + '·海报仍在', await pg.$('.posterModal img'));
    await pg.context().close();
  }

  check('无页面报错', errs.length === 0);
  await b.close();
  for (const [n, v] of ok) console.log((v ? '通过 ' : '失败 ') + n);
  if (errs.length) console.log(errs);
  process.exit(ok.every(([, v]) => v) ? 0 : 1);
})();
