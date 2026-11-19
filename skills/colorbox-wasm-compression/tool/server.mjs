import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, basename } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';

const root = fileURLToPath(new URL('.', import.meta.url));
const TTL = 30 * 60 * 1000;
const jobs = new Map();

export function negotiate(header, available) {
  const entries = String(header ?? '').toLowerCase().split(',').map(item => {
    const [name, ...params] = item.trim().split(';');
    const q = params.find(p => p.trim().startsWith('q='));
    const value = q ? Number(q.trim().slice(2)) : 1;
    return [name, Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0];
  });
  const weights = new Map(entries);
  const quality = name => weights.has(name) ? weights.get(name)
    : name === 'identity' ? (weights.get('*') === 0 ? 0 : 1) : (weights.get('*') ?? 0);
  return ['br', 'zstd', 'gzip', 'identity'].filter(x => available.includes(x))
    .map((encoding, i) => ({ encoding, q: quality(encoding), i }))
    .filter(x => x.q > 0).sort((a, b) => b.q - a.q || a.i - b.i)[0]?.encoding;
}

function fail(status, message) { return Object.assign(new Error(message), { status }); }
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}
function summary(job) {
  return { id: job.id, name: job.name, size: job.original.length, status: job.status,
    current: job.current, error: job.error, preset: job.preset, sha256: job.sha256,
    results: job.results.map(({ bytes, ...r }) => ({ ...r, size: bytes.length,
      saving: 1 - bytes.length / job.original.length,
      download: `/api/jobs/${job.id}/download/${r.encoding}` })) };
}
function startJob(bytes, name, preset, algorithms) {
  const job = { id: randomUUID(), name, original: bytes, preset, created: Date.now(),
    status: 'running', results: [], sha256: createHash('sha256').update(bytes).digest('hex') };
  jobs.set(job.id, job);
  const worker = new Worker(new URL('./compress-worker.mjs', import.meta.url), {
    workerData: { bytes, preset, algorithms },
  });
  const timer = setTimeout(() => {
    job.status = 'failed'; job.error = '压缩超过 120 秒，请改用快速档。'; worker.terminate();
  }, 120_000);
  worker.on('message', m => {
    if (m.type === 'progress') job.current = m.encoding;
    if (m.type === 'result') { const { type, ...result } = m; job.results.push({ ...result, bytes: Buffer.from(m.bytes) }); }
    if (m.type === 'done') { job.status = 'done'; job.current = null; }
    if (m.type === 'failure') { job.status = 'failed'; job.error = m.error; }
  });
  worker.on('error', error => { job.status = 'failed'; job.error = error.message; });
  worker.on('exit', () => {
    clearTimeout(timer);
    if (job.status === 'running') { job.status = 'failed'; job.error = '压缩进程意外退出，请重试。'; }
  });
  return job;
}

export function createApp() {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'POST') {
        const origin = req.headers.origin;
        if (origin && origin !== `http://${req.headers.host}`) throw fail(403, '不接受跨站请求。');
        if (url.pathname !== '/api/jobs') throw fail(404, '接口不存在');
        for (const [id, job] of jobs) if (job.status !== 'running' && Date.now() - job.created > TTL) jobs.delete(id);
        if ([...jobs.values()].some(j => j.status === 'running')) throw fail(429, '已有压缩任务进行中，请稍后重试。');
        if (jobs.size >= 6) throw fail(429, '已达到 6 个任务上限。结果保留 30 分钟，也可重启服务清空。');
        const preset = url.searchParams.get('preset') ?? 'fast';
        if (!['fast', 'archive'].includes(preset)) throw fail(400, '无效的压缩档位');
        const algorithms = [...new Set((url.searchParams.get('algorithms') ?? 'br,gzip,zstd').split(','))];
        if (!algorithms.length || algorithms.some(a => !['br', 'gzip', 'zstd'].includes(a))) throw fail(400, '请选择有效的压缩算法');
        const bytes = await body(req);
        let name = basename(url.searchParams.get('name') ?? 'module.wasm').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 160);
        if (!name.endsWith('.wasm')) name += '.wasm';
        if (bytes.length < 8 || bytes.subarray(0, 8).toString('hex') !== '0061736d01000000') throw fail(400, '不是有效的 WebAssembly core 二进制（需要 .wasm v1 文件）。');
        json(res, 202, summary(startJob(bytes, name, preset, algorithms))); return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw fail(405, '不支持此方法');
      if (url.pathname === '/api/status') {
        json(res, 200, { node: process.version, maxBytes: null }); return;
      }
      const match = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)(?:\/(download|module)\/([a-z]+))?$/);
      if (match) {
        const job = jobs.get(match[1]);
        if (!job || Date.now() - job.created > TTL) throw fail(404, '任务已过期，请重新压缩。');
        if (!match[2]) { json(res, 200, summary(job)); return; }
        const kind = match[2], requested = match[3];
        const available = ['identity', ...job.results.map(r => r.encoding)];
        const encoding = kind === 'module' && requested === 'auto'
          ? negotiate(req.headers['accept-encoding'], available) : requested;
        if (!encoding) throw fail(406, '没有可接受的编码');
        if (kind === 'module' && requested !== 'auto' && negotiate(req.headers['accept-encoding'], [encoding]) !== encoding) throw fail(406, '当前浏览器未声明支持该编码，请换用 gzip 或自动协商。');
        const bytes = encoding === 'identity' ? job.original : job.results.find(r => r.encoding === encoding)?.bytes;
        if (!bytes) throw fail(404, '此压缩结果尚未生成');
        const ext = { br: '.br', gzip: '.gz', zstd: '.zst', identity: '' }[encoding];
        const headers = { 'Content-Type': kind === 'module' ? 'application/wasm' : 'application/octet-stream',
          'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'Vary': 'Accept-Encoding' };
        if (kind === 'download') headers['Content-Disposition'] = `attachment; filename="${job.name}${ext}"`;
        else if (encoding !== 'identity') headers['Content-Encoding'] = encoding;
        res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : bytes); return;
      }
      const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
      if (!files[url.pathname]) throw fail(404, '页面不存在');
      const [file, type] = files[url.pathname];
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      res.end(req.method === 'HEAD' ? undefined : await readFile(join(root, 'public', file)));
    } catch (error) { if (!res.headersSent) json(res, error.status ?? 500, { error: error.status ? error.message : '服务端处理失败，请查看终端日志。' }); else res.end(); if (!error.status) console.error(error); }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT ?? 8787);
  createApp().listen(port, '127.0.0.1', () => console.log(`WASM Compression Lab: http://127.0.0.1:${port}`));
}
