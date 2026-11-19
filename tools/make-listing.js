// 生成上架素材：node tools/make-listing.js → listing/logo.png、listing/screenshots/*.png（1080×1920）
const path = require('path'); const fs = require('fs');
const {chromium} = require('playwright');
const out = path.resolve(__dirname, '../listing');
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({viewport: {width: 360, height: 640}, deviceScaleFactor: 3})).newPage();
  await pg.goto('file://' + path.resolve(__dirname, '../h5/index.html'));
  const shot = (n) => pg.screenshot({path: path.join(out, 'screenshots', n + '.png')});
  const james = await pg.evaluate(() => window.GAME.nodes.map(n => n.james));
  await pg.click('[data-act=start]');
  // 1 实机：第 1 站选项 + 即时结果
  await pg.click(`[data-pick="${james[0]}"]`); await pg.evaluate(() => document.querySelector('.choices').scrollIntoView()); await shot('1-选择');
  // 2 论坛楼层
  await pg.click('.forumThread summary'); await pg.evaluate(() => document.querySelector('.forumThread').scrollIntoView()); await shot('2-论坛');
  for (let i = 0; i < james.length; i++) {
    await pg.click(`[data-pick="${james[i]}"]`);
    if (i === 6) { await pg.click('.forumThread summary'); await pg.evaluate(() => document.querySelector('.feedback').scrollIntoView()); await shot('3-总决赛'); }
    await pg.click('[data-act=next]');
  }
  // 4 结局
  await shot('4-结局');
  // 5 海报
  await pg.click('[data-act=poster]'); await pg.waitForSelector('.posterModal img');
  await pg.waitForFunction(() => document.querySelector('.posterModal img').complete); await shot('5-晒战绩');
  // Logo 1024×1024
  const logo = await pg.evaluate(() => {
    const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, S, S); g.addColorStop(0, '#1b1f45'); g.addColorStop(1, '#0b1226'); c.fillStyle = g; c.fillRect(0, 0, S, S);
    const glow = c.createRadialGradient(S * .82, S * .16, 10, S * .82, S * .16, S * .75); glow.addColorStop(0, 'rgba(255,106,61,.55)'); glow.addColorStop(1, 'rgba(255,106,61,0)'); c.fillStyle = glow; c.fillRect(0, 0, S, S);
    // 篮球
    const bx = S * .76, by = S * .25, r = 150;
    c.fillStyle = '#ff6a3d'; c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill();
    c.save(); c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.clip(); c.strokeStyle = '#0b1226'; c.lineWidth = 12;
    c.beginPath(); c.moveTo(bx - r, by); c.lineTo(bx + r, by); c.moveTo(bx, by - r); c.lineTo(bx, by + r); c.stroke();
    c.beginPath(); c.arc(bx - r * 1.25, by, r, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(bx + r * 1.25, by, r, 0, Math.PI * 2); c.stroke(); c.restore();
    const F = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif';
    c.fillStyle = '#fff'; c.textBaseline = 'top'; c.font = '800 250px ' + F; c.fillText('你这冠', 84, 420); c.fillText('算不算', 84, 700);
    c.fillStyle = '#ffc94d'; c.fillText('?', 84 + c.measureText('算不算').width + 6, 700);
    const bar = c.createLinearGradient(84, 0, 400, 0); bar.addColorStop(0, '#ffc94d'); bar.addColorStop(1, '#ff6a3d'); c.fillStyle = bar; c.fillRect(84, 372, 300, 18);
    return cv.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(out, 'logo.png'), Buffer.from(logo.split(',')[1], 'base64'));
  await b.close();
})();
