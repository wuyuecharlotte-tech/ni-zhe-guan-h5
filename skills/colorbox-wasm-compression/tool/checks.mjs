import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import * as z from 'node:zlib';
import { createApp, negotiate } from './server.mjs';

const decoders = { br: z.brotliDecompressSync, gzip: z.gunzipSync, zstd: z.zstdDecompressSync };

test('Accept-Encoding honors quality, exclusions, wildcard and identity', () => {
  const all = ['br', 'gzip', 'zstd', 'identity'];
  assert.equal(negotiate('br;q=0, gzip;q=1, zstd;q=.5', all), 'gzip');
  assert.equal(negotiate('br, gzip', all), 'br');
  assert.equal(negotiate('*;q=0', all), undefined);
  assert.equal(negotiate('', all), 'identity');
  assert.equal(negotiate('gzip;q=.5', all), 'identity');
  assert.equal(negotiate('zstd', ['gzip']), undefined);
});

test('uploaded wasm, round trip, encoded delivery and errors', async t => {
  const server = createApp(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = path => fetch(base + path);
  const original = Buffer.from('0061736d010000000105016000017f030201000707010361646400000a06010400412a0b', 'hex');
  assert.equal(WebAssembly.validate(original), true);
  const service = await (await get('/api/status')).json();
  assert.equal(service.maxBytes, null);
  assert.equal((await get('/api/samples')).status, 404);
  const bad = await fetch(base + '/api/jobs', { method: 'POST', body: 'not wasm' });
  assert.equal(bad.status, 400);
  const crossSite = await fetch(base + '/api/jobs', { method: 'POST', headers: { Origin: 'https://example.org' }, body: original });
  assert.equal(crossSite.status, 403);
  const created = await fetch(base + '/api/jobs?name=test.wasm&preset=fast', { method: 'POST', headers: { 'Content-Type': 'application/wasm' }, body: original });
  assert.equal(created.status, 202);
  let job = await created.json();
  for (let tries = 0; tries < 100 && job.status === 'running'; tries++) {
    await new Promise(resolve => setTimeout(resolve, 50));
    job = await (await get(`/api/jobs/${job.id}`)).json();
  }
  assert.equal(job.status, 'done', job.error); assert.equal(job.results.length, 3);
  for (const result of job.results) {
    assert.equal(result.verified, true);
    const download = await get(result.download);
    assert.equal(download.headers.get('content-encoding'), null);
    assert.match(download.headers.get('content-disposition'), /attachment/);
    const compressed = Buffer.from(await download.arrayBuffer());
    assert.equal(compressed.length, result.size);
    assert.deepEqual(decoders[result.encoding](compressed), original);
  }
  const delivered = await fetch(`${base}/api/jobs/${job.id}/module/auto`, { headers: { 'Accept-Encoding': 'br;q=0,gzip;q=1' } });
  assert.equal(delivered.headers.get('content-type'), 'application/wasm');
  assert.equal(delivered.headers.get('content-encoding'), 'gzip');
  assert.equal(delivered.headers.get('vary'), 'Accept-Encoding');
  assert.deepEqual(Buffer.from(await delivered.arrayBuffer()), original);
  const stream = await fetch(`${base}/api/jobs/${job.id}/module/br`, { headers: { 'Accept-Encoding': 'br' } });
  const module = await WebAssembly.compileStreaming(stream);
  assert.ok(WebAssembly.Module.exports(module).length > 0);
  assert.equal((await fetch(`${base}/api/jobs/${job.id}/module/zstd`, { headers: { 'Accept-Encoding': 'gzip' } })).status, 406);
  const upload = await fetch(base + '/api/jobs?name=uploaded.wasm&algorithms=gzip', { method: 'POST', headers: { 'Content-Type': 'application/wasm' }, body: original });
  assert.equal(upload.status, 202); let uploaded = await upload.json();
  for (let tries = 0; tries < 100 && uploaded.status === 'running'; tries++) {
    await new Promise(resolve => setTimeout(resolve, 50));
    uploaded = await (await get(`/api/jobs/${uploaded.id}`)).json();
  }
  assert.equal(uploaded.status, 'done'); assert.equal(uploaded.name, 'uploaded.wasm');
  assert.equal(uploaded.results.length, 1);
  assert.equal((await get('/server.mjs')).status, 404);

  // A custom section keeps the large fixture valid without a large executable body.
  const payloadLength = 33 * 1024 * 1024;
  const leb = [];
  for (let remaining = payloadLength; ; remaining = Math.floor(remaining / 128)) {
    const next = remaining % 128;
    leb.push(next | (remaining >= 128 ? 128 : 0));
    if (remaining < 128) break;
  }
  const large = Buffer.concat([Buffer.from('0061736d01000000', 'hex'), Buffer.from([0, ...leb]), Buffer.alloc(payloadLength)]);
  assert.equal(WebAssembly.validate(large), true);
  const largeResponse = await fetch(base + '/api/jobs?name=large.wasm&algorithms=gzip', { method: 'POST', body: large });
  assert.equal(largeResponse.status, 202);
  let largeJob = await largeResponse.json();
  for (let tries = 0; tries < 200 && largeJob.status === 'running'; tries++) {
    await new Promise(resolve => setTimeout(resolve, 50));
    largeJob = await (await get(`/api/jobs/${largeJob.id}`)).json();
  }
  assert.equal(largeJob.status, 'done', largeJob.error);
  assert.equal(largeJob.size, large.length);
  const largeDownload = await get(largeJob.results[0].download);
  assert.deepEqual(z.gunzipSync(Buffer.from(await largeDownload.arrayBuffer())), large);
});
