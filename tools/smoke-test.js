// 冒烟测试：node tools/smoke-test.js
// 检查 15 站×4 选项都有论坛楼层；詹姆斯路线能打出「真正的詹姆斯」；两个 ★ 隐藏选项可用；全程无报错。
const path = require('path');
const {chromium} = require('playwright');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.ColorboxAI = {getFullscreenSafeTop: () => 44}; });
  await pg.goto('file://' + path.resolve(__dirname, '../h5/index.html'));
  const info = await pg.evaluate(() => {
    const {nodes} = window.GAME, miss = [];
    nodes.forEach((n, i) => n.options.forEach((o, j) => { if (!window.FORUM.threads[i]?.[j]) miss.push(i + ':' + j); }));
    return {james: nodes.map(n => n.james), miss, top: getComputedStyle(document.body).paddingTop};
  });
  const ok = []; const check = (name, cond) => { ok.push([name, !!cond]); };
  check('每个选项都有论坛楼层', info.miss.length === 0);
  check('顶部安全距离生效', info.top === '44px');
  await pg.click('[data-act=start]');
  for (const p of info.james) { await pg.click(`[data-pick="${p}"]`); await pg.click('[data-act=next]'); }
  check('詹姆斯路线结局', (await pg.textContent('h1')) === '真正的詹姆斯');
  await pg.click('[data-act=reset]');
  for (const p of [1,2,0,3,1,2,'r',1,1,3,1,'r']) {
    if (p === 'r') { await pg.click('[data-act=recall]'); check('★ 隐藏选项带论坛', await pg.$('.forumThread')); }
    else await pg.click(`[data-pick="${p}"]`);
    await pg.click('[data-act=next]');
  }
  check('无页面报错', errs.length === 0);
  await b.close();
  for (const [n, v] of ok) console.log((v ? '通过 ' : '失败 ') + n);
  process.exit(ok.every(([, v]) => v) ? 0 : 1);
})();
