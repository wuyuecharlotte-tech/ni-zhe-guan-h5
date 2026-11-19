/* 生涯结局海报：在本地画布上绘制，导出 PNG。只画游戏内文字，不含用户输入。 */
window.POSTER = (() => {
  const W = 1080, H = 2200, PAD = 84;
  const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif';
  const C = {bg:'#171714', panel:'#20201b', line:'#454337', ivory:'#f5efdf', muted:'#bdb4a1', orange:'#ff9a53', lime:'#d9ea71', paper:'#f6eddf', ink:'#432515', brown:'#84381f'};

  // 按宽度逐字折行（中文无空格）
  function wrap(ctx, text, maxW, maxLines) {
    const lines = []; let line = '';
    for (const ch of String(text)) {
      if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; if (lines.length === maxLines) break; }
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
  function text(ctx, s, x, y, size, color, weight = 400, maxW = W - PAD * 2, maxLines = 1, lh = 1.45) {
    ctx.font = weight + ' ' + size + 'px ' + FONT; ctx.fillStyle = color; ctx.textBaseline = 'top';
    const lines = wrap(ctx, s, maxW, maxLines);
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * lh));
    return y + lines.length * size * lh;
  }
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }

  // data: {heading, opener, players:[{name,title}], badges:[{title,count,line}], hot}
  function draw(data) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(W * 0.8, H * 0.12, 40, W * 0.8, H * 0.12, W);
    g.addColorStop(0, '#3d2b20'); g.addColorStop(0.5, '#24211a'); g.addColorStop(1, C.bg);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    let y = PAD;
    ctx.fillStyle = C.orange; ctx.beginPath(); ctx.arc(PAD + 14, y + 20, 14, 0, Math.PI * 2); ctx.fill();
    text(ctx, '你这冠算不算？', PAD + 42, y + 2, 34, C.ivory, 800);
    text(ctx, '终场哨 / 生涯结算', W - PAD - 300, y + 6, 28, C.orange, 700, 300);
    y += 80;
    ctx.fillStyle = C.line; ctx.fillRect(PAD, y, W - PAD * 2, 2); y += 52;

    y = text(ctx, data.heading, PAD, y, 92, C.ivory, 800, W - PAD * 2, 2, 1.18) + 22;
    y = text(ctx, data.opener, PAD, y, 34, C.muted, 400, W - PAD * 2, 3) + 40;

    if (data.players?.length) {
      y = text(ctx, '球场上更像谁', PAD, y, 30, C.orange, 700) + 14;
      for (const p of data.players.slice(0, 3)) {
        roundRect(ctx, PAD, y, W - PAD * 2, 96, 6, C.panel, C.line);
        text(ctx, p.name, PAD + 28, y + 16, 34, C.lime, 700, 360);
        text(ctx, p.title, PAD + 28, y + 58, 26, C.muted, 400, W - PAD * 2 - 56);
        y += 112;
      }
      y += 18;
    }

    if (data.badges?.length) {
      y = text(ctx, '论坛翻出来的旧账', PAD, y, 30, C.orange, 700) + 14;
      const colW = (W - PAD * 2 - 20) / 2;
      data.badges.slice(0, 4).forEach((b, i) => {
        const x = PAD + (i % 2) * (colW + 20), yy = y + Math.floor(i / 2) * 150;
        roundRect(ctx, x, yy, colW, 134, 6, C.panel, C.line);
        text(ctx, b.title, x + 24, yy + 18, 32, C.lime, 700, colW - 140);
        text(ctx, '×' + b.count, x + colW - 96, yy + 18, 32, C.orange, 800, 80);
        text(ctx, b.line, x + 24, yy + 64, 24, C.muted, 400, colW - 48, 2, 1.35);
      });
      y += Math.ceil(Math.min(data.badges.length, 4) / 2) * 150 + 22;
    }

    // 论坛热评：米色论坛卡片
    const cardH = 190, cardY = y;
    roundRect(ctx, PAD, cardY, W - PAD * 2, cardH, 10, C.paper, '#9e805c');
    roundRect(ctx, PAD + 26, cardY + 24, 130, 40, 4, C.brown);
    text(ctx, '论坛热评', PAD + 39, cardY + 29, 26, '#fff8e9', 700, 120);
    text(ctx, '「' + data.hot + '」', PAD + 26, cardY + 82, 32, C.ink, 700, W - PAD * 2 - 52, 3, 1.4);

    y = cardY + cardH + 56;
    text(ctx, '15 站生涯，你决定怎么打球，论坛决定怎么记住你。', PAD, y, 28, C.muted, 400);
    text(ctx, '来虎扑打一遍你自己的生涯 →《你这冠算不算？》', PAD, y + 42, 28, C.orange, 700);
    // 按内容高度裁切，最矮为正方形
    const outH = Math.max(Math.ceil(y + 42 + 28 + PAD), W);
    const out = document.createElement('canvas'); out.width = W; out.height = outH;
    const o = out.getContext('2d'); o.fillStyle = C.bg; o.fillRect(0, 0, W, outH); o.drawImage(cv, 0, 0);
    return out;
  }

  const toBlob = (cv) => new Promise((ok, fail) => cv.toBlob(b => b ? ok(b) : fail(new Error('海报生成失败')), 'image/png'));
  return {draw, toBlob};
})();
