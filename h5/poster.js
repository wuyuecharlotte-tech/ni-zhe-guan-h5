/* 生涯结局海报：在本地画布上绘制，导出 PNG。只画游戏内文字，不含用户输入、不加载外部图片。 */
window.POSTER = (() => {
  const W = 1080, H = 2400, PAD = 80;
  const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif';
  const C = {bg1:'#0b1226', bg2:'#161a3a', white:'#ffffff', muted:'#a9b3c9', gold:'#ffc94d', hot:'#ff6a3d', card:'rgba(255,255,255,.07)', cardLine:'rgba(255,255,255,.14)', ink:'#1b2033', red:'#d8322f'};

  // 球星小头像：不用真人照片，画成「球衣号码牌」——[号码, 球衣底色, 号码/镶边色]
  const JERSEY = {
    '勒布朗·詹姆斯':['23','#6f263d','#ffb81c'], '迈克尔·乔丹':['23','#ce1141','#ffffff'], '科比·布莱恩特':['24','#552583','#fdb927'],
    '蒂姆·邓肯':['21','#1d1d1d','#c4ced4'], '斯蒂芬·库里':['30','#1d428a','#ffc72c'], '德克·诺维茨基':['41','#00538c','#dfe5ea'],
    '哈基姆·奥拉朱旺':['34','#ce1141','#ffc72c'], '魔术师约翰逊':['32','#fdb927','#552583'], '拉里·伯德':['33','#007a33','#ffffff'],
    '比尔·拉塞尔':['6','#007a33','#ffffff'], '威尔特·张伯伦':['13','#fdb927','#552583'], '沙奎尔·奥尼尔':['34','#fdb927','#552583'],
    '凯文·加内特':['5','#007a33','#ffffff'], '阿伦·艾弗森':['3','#1d1d1d','#ed174c'], '史蒂夫·纳什':['13','#1d1160','#e56020'],
    '凯文·杜兰特':['35','#1d428a','#ffc72c'], '科怀·伦纳德':['2','#ce1141','#ffffff'], '扬尼斯·阿德托昆博':['34','#00471b','#eee1c6'],
    '尼古拉·约基奇':['15','#0e2240','#fec524'], '马努·吉诺比利':['20','#1d1d1d','#c4ced4']
  };

  function wrap(ctx, text, maxW, maxLines) {
    const lines = []; let line = '';
    for (const ch of String(text)) {
      if (ctx.measureText(line + ch).width > maxW && line && !'，。！？、；：」》）…'.includes(ch)) { lines.push(line); line = ch; if (lines.length === maxLines) break; }
      else line += ch;
    }
    if (lines.length < maxLines && line) lines.push(line);
    else if (lines.length === maxLines && line) {
      let last = lines[maxLines - 1];
      while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
    return lines;
  }
  function text(ctx, s, x, y, size, color, weight = 400, maxW = W - PAD * 2, maxLines = 1, lh = 1.45, align = 'left') {
    ctx.font = weight + ' ' + size + 'px ' + FONT; ctx.fillStyle = color; ctx.textBaseline = 'top'; ctx.textAlign = align;
    const lines = wrap(ctx, s, maxW, maxLines);
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * lh));
    ctx.textAlign = 'left';
    return y + lines.length * size * lh;
  }
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }
  function label(ctx, s, y) {
    ctx.fillStyle = C.gold; ctx.fillRect(PAD, y + 4, 8, 30);
    return text(ctx, s, PAD + 22, y, 30, C.gold, 700) + 16;
  }
  function avatar(ctx, name, cx, cy, r) {
    const [num, base, trim] = JERSEY[name] || [name.slice(-1), '#33415c', '#ffffff'];
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = base; ctx.fill();
    ctx.clip();
    // 球衣领口和肩线
    ctx.strokeStyle = trim; ctx.lineWidth = r * 0.12; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(cx, cy - r * 1.15, r * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - r * 1.35, cy - r * 0.1, r * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + r * 1.35, cy - r * 0.1, r * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 4; ctx.stroke();
    text(ctx, num, cx, cy - r * 0.34, r * (num.length > 1 ? 0.86 : 1), trim, 800, r * 2, 1, 1, 'center');
  }

  // data: {heading, opener, players:[{name,title}], badges:[{title,count,line}], hot}
  function draw(data) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, W, 1500);
    g.addColorStop(0, C.bg2); g.addColorStop(1, C.bg1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 右上暖光 + 球场线
    const glow = ctx.createRadialGradient(W - 60, 80, 20, W - 60, 80, 760);
    glow.addColorStop(0, 'rgba(255,106,61,.42)'); glow.addColorStop(1, 'rgba(255,106,61,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 900);
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(W + 40, 250, 430, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W + 40, 250, 170, 0, Math.PI * 2); ctx.stroke();

    let y = PAD;
    ctx.fillStyle = C.hot; ctx.beginPath(); ctx.arc(PAD + 16, y + 22, 16, 0, Math.PI * 2); ctx.fill();
    text(ctx, '你这冠算不算？', PAD + 46, y + 2, 36, C.white, 800);
    roundRect(ctx, W - PAD - 190, y - 4, 190, 54, 27, 'rgba(255,255,255,.12)');
    text(ctx, '成分鉴定', W - PAD - 95, y + 9, 28, C.white, 700, 180, 1, 1, 'center');
    y += 130;

    text(ctx, '我的生涯成分', PAD, y, 30, C.muted, 500); y += 52;
    y = text(ctx, data.heading, PAD, y, data.heading.length > 12 ? 76 : 100, C.white, 800, W - PAD * 2, 2, 1.16) + 14;
    const bar = ctx.createLinearGradient(PAD, 0, PAD + 220, 0); bar.addColorStop(0, C.gold); bar.addColorStop(1, C.hot);
    ctx.fillStyle = bar; ctx.fillRect(PAD, y, 220, 10); y += 44;
    y = text(ctx, data.opener, PAD, y, 34, C.muted, 400, W - PAD * 2, 3) + 46;

    if (data.players?.length) {
      y = label(ctx, '生涯成分', y);
      const rowW = W - PAD * 2;
      const row = (name, title, pct, drawAvatar) => {
        roundRect(ctx, PAD, y, rowW, 128, 20, C.card, C.cardLine);
        drawAvatar(PAD + 76, y + 58);
        text(ctx, name, PAD + 144, y + 18, 38, C.white, 700, rowW - 360);
        text(ctx, title, PAD + 144, y + 68, 26, C.muted, 400, rowW - 360);
        text(ctx, pct + '%', PAD + rowW - 30, y + 26, 60, C.gold, 800, 220, 1, 1, 'right');
        roundRect(ctx, PAD + 144, y + 108, rowW - 174, 8, 4, 'rgba(255,255,255,.12)');
        const bw = Math.max(8, (rowW - 174) * pct / 100), bar = ctx.createLinearGradient(PAD + 144, 0, PAD + 144 + bw, 0);
        bar.addColorStop(0, C.gold); bar.addColorStop(1, C.hot);
        roundRect(ctx, PAD + 144, y + 108, bw, 8, 4, bar);
        y += 146;
      };
      for (const p of data.players.slice(0, 4)) row(p.name, p.title, p.pct, (cx, cy) => avatar(ctx, p.name, cx, cy, 44));
      if (data.other) row('其他球星', '零零碎碎，各沾一点', data.other, (cx, cy) => { ctx.beginPath(); ctx.arc(cx, cy, 44, 0, Math.PI * 2); ctx.fillStyle = '#33415c'; ctx.fill(); text(ctx, '…', cx, cy - 30, 44, C.white, 800, 88, 1, 1, 'center'); });
      y += 26;
    }

    if (data.badges?.length) {
      y = label(ctx, '论坛翻出来的旧账', y);
      const colW = (W - PAD * 2 - 24) / 2;
      data.badges.slice(0, 4).forEach((b, i) => {
        const x = PAD + (i % 2) * (colW + 24), yy = y + Math.floor(i / 2) * 176;
        roundRect(ctx, x, yy, colW, 156, 20, C.card, C.cardLine);
        text(ctx, b.title, x + 26, yy + 22, 33, C.white, 700, colW - 150);
        roundRect(ctx, x + colW - 108, yy + 20, 84, 44, 22, C.hot);
        text(ctx, '×' + b.count, x + colW - 66, yy + 28, 28, C.white, 800, 80, 1, 1, 'center');
        text(ctx, b.line, x + 26, yy + 78, 25, C.muted, 400, colW - 52, 2, 1.36);
      });
      y += Math.ceil(Math.min(data.badges.length, 4) / 2) * 176 + 30;
    }

    // 论坛热评：白色卡片
    ctx.font = '700 34px ' + FONT;
    const hotLines = wrap(ctx, data.hot, W - PAD * 2 - 64, 3);
    const cardH = 104 + hotLines.length * 49 + 24;
    roundRect(ctx, PAD, y, W - PAD * 2, cardH, 22, '#fff8ee');
    roundRect(ctx, PAD + 32, y + 28, 150, 46, 8, C.red);
    text(ctx, '论坛热评', PAD + 107, y + 36, 27, '#ffffff', 700, 140, 1, 1, 'center');
    text(ctx, data.hot, PAD + 32, y + 98, 34, C.ink, 700, W - PAD * 2 - 64, 3, 1.44);
    y += cardH + 54;

    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(PAD, y, W - PAD * 2, 2); y += 34;
    text(ctx, (data.count || 14) + ' 站生涯，你决定怎么打球，论坛决定怎么记住你。', PAD, y, 28, C.muted, 400);
    text(ctx, '来虎扑打一遍你自己的生涯 →《你这冠算不算？》', PAD, y + 44, 30, C.gold, 700);
    // 按内容高度裁切，最矮为正方形
    const outH = Math.max(Math.ceil(y + 44 + 30 + PAD), W);
    const out = document.createElement('canvas'); out.width = W; out.height = outH;
    out.getContext('2d').drawImage(cv, 0, 0);
    return out;
  }

  const toBlob = (cv) => new Promise((ok, fail) => cv.toBlob(b => b ? ok(b) : fail(new Error('海报生成失败')), 'image/png'));
  return {draw, toBlob, JERSEY};
})();
