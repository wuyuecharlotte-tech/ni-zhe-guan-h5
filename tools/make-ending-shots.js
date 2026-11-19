// 生成非詹姆斯结局的上架截图：node tools/make-ending-shots.js [球星名片段]
const path = require('path');
const {chromium} = require('playwright');
const want = process.argv[2] || '邓肯';
// 第二个参数：文件名后缀；第三个参数：偏离目标路线的站（如 0:0,8:1 表示第 1 站选 A、第 9 站选 B）
const suffix = process.argv[3] || '';
const dev = new Map((process.argv[4] || '').split(',').filter(Boolean).map(x => x.split(':').map(Number)));
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({viewport: {width: 360, height: 640}, deviceScaleFactor: 3})).newPage();
  await pg.goto('file://' + path.resolve(__dirname, '../h5/index.html'));
  // 目标球星的锚点照选，其余站选没有旧账标签、对队友友好的选项
  const picks = await pg.evaluate((want) => {
    const {nodes, routes} = window.GAME; const r = routes.find(x => x.name.includes(want)); const fixed = new Map(r.anchors);
    return nodes.map((n, i) => {
      if (fixed.has(i)) return fixed.get(i);
      let best = 0, score = -99;
      n.options.forEach((o, j) => { const s = (o.trust || 0) - (o.satire || []).length * 3 - (j === n.james ? 1 : 0); if (s > score) { score = s; best = j; } });
      return best;
    });
  }, want);
  dev.forEach((v, k) => { picks[k] = v; });
  await pg.click('[data-act=start]');
  for (const p of picks) { await pg.click(`[data-pick="${p}"]`); await pg.click('[data-act=next]'); }
  console.log(want, picks.join(''), '→', await pg.textContent('h1'));
  const out = path.resolve(__dirname, '../listing/screenshots');
  await pg.screenshot({path: path.join(out, '4-结局' + suffix + '.png')});
  await pg.click('[data-act=poster]'); await pg.waitForSelector('.posterModal img');
  await pg.waitForFunction(() => document.querySelector('.posterModal img').complete);
  await pg.screenshot({path: path.join(out, '5-晒战绩' + suffix + '.png')});
  await b.close();
})();
