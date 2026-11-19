const $ = id => document.getElementById(id);
const names = { br: 'Brotli', gzip: 'gzip', zstd: 'Zstd', identity: '原始' };
let file, job, busy = false;
const size = n => n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1024 / 1024).toFixed(3)} MiB`;
const ms = n => `${n.toFixed(1)} ms`;
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function lock(locked) {
  busy = locked;
  for (const el of document.querySelectorAll('aside button, aside select, aside input')) el.disabled = locked;
  $('compress').disabled = locked || !file;
  $('compress').querySelector('span').textContent = locked ? '正在压缩…' : '开始压缩对比';
}
function chooseFile(selected) {
  if (!selected) return;
  if (!selected.name.toLowerCase().endsWith('.wasm')) { status('请选择 .wasm 文件。', true); return; }
  file = selected; $('file-info').textContent = `${file.name} · ${size(file.size)}`; lock(false); status('文件已就绪。');
}
$('file-input').onchange = e => chooseFile(e.target.files[0]);
for (const event of ['dragenter', 'dragover']) $('dropzone').addEventListener(event, e => { e.preventDefault(); if (!busy) $('dropzone').classList.add('drag'); });
for (const event of ['dragleave', 'drop']) $('dropzone').addEventListener(event, e => { e.preventDefault(); $('dropzone').classList.remove('drag'); });
$('dropzone').addEventListener('drop', e => { if (!busy) chooseFile(e.dataTransfer.files[0]); });
async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}
function cell(row, value, className) { const td = document.createElement('td'); td.textContent = value; if (className) td.className = className; row.append(td); return td; }
function render(data) {
  $('empty').hidden = true; $('results').hidden = false;
  $('result-name').textContent = data.name; $('original-size').textContent = `原始体积 ${size(data.size)} · ${data.size.toLocaleString()} bytes`;
  $('result-state').textContent = data.status === 'done' ? '校验通过' : data.status === 'failed' ? '任务失败' : '压缩中';
  $('result-state').classList.toggle('done', data.status === 'done');
  $('chart').replaceChildren(); $('result-rows').replaceChildren();
  for (const item of [{ encoding: 'identity', size: data.size }, ...data.results]) {
    const row = document.createElement('div'); row.className = 'bar-row';
    const label = document.createElement('span'); label.textContent = names[item.encoding];
    const track = document.createElement('div'); track.className = 'bar-track';
    const bar = document.createElement('div'); bar.className = `bar ${item.encoding}`; bar.style.transform = `scaleX(${Math.min(1, item.size / data.size)})`; track.append(bar);
    const value = document.createElement('span'); value.className = 'bar-value'; value.textContent = size(item.size);
    row.append(label, track, value); $('chart').append(row);
  }
  const best = Math.min(...data.results.map(r => r.size));
  for (const r of data.results) {
    const row = document.createElement('tr');
    const first = cell(row, `${names[r.encoding]} · ${r.level}`);
    if (r.size === best && data.status === 'done') { const tag = document.createElement('small'); tag.textContent = '最小'; first.append(tag); }
    cell(row, size(r.size)); cell(row, `${(r.saving * 100).toFixed(1)}%`, 'saving'); cell(row, ms(r.compressionMs)); cell(row, ms(r.decompressionMs));
    const last = cell(row, ''); const a = document.createElement('a'); a.href = r.download; a.textContent = `下载 .${{ br: 'br', gzip: 'gz', zstd: 'zst' }[r.encoding]}`; a.setAttribute('download', ''); last.append(a);
    $('result-rows').append(row);
  }
  $('sha').textContent = data.sha256;
  $('verification').textContent = data.results.length ? `${data.results.length} 个结果已回解，原始字节与 SHA-256 一致。` : '正在生成并校验压缩结果…';
  $('export').disabled = data.status !== 'done';
}
$('compress').onclick = async () => {
  const algorithms = [...document.querySelectorAll('input[name=codec]:checked')].map(el => el.value);
  if (!algorithms.length) { status('至少选择一种压缩算法。', true); return; }
  lock(true); $('export').disabled = true;
  status('正在将文件发送到本机…');
  const params = new URLSearchParams({ preset: $('preset').value, algorithms: algorithms.join(','), name: file.name });
  const options = { method: 'POST', body: file, headers: { 'Content-Type': 'application/wasm' } };
  try {
    job = await request(`/api/jobs?${params}`, options); render(job);
    while (job.status === 'running') {
      status(`正在压缩 ${names[job.current] || '模块'}，请稍候…`);
      await new Promise(resolve => setTimeout(resolve, 500));
      job = await request(`/api/jobs/${job.id}`); render(job);
    }
    if (job.status === 'failed') throw new Error(job.error);
    status('压缩完成，可以下载结果或导出 JSON。');
  } catch (error) { status(error.message, true); }
  finally { lock(false); }
};
$('export').onclick = () => {
  if (!job) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify({ ...job, measuredAt: new Date().toISOString(), timing: 'Single-run Node wall-clock measurements; excludes upload and verification.' }, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `${job.name}.compression.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
try {
  const data = await request('/api/status');
  $('runtime').textContent = `${data.node} · 服务已连接`;
  lock(false); status('选择或拖入 .wasm 文件后即可开始。');
} catch (error) { $('runtime').textContent = '服务连接失败'; status(error.message, true); }
