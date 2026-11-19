import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import * as z from 'node:zlib';

const input = Buffer.from(workerData.bytes);
const hash = data => createHash('sha256').update(data).digest('hex');
const digest = hash(input);
const level = workerData.preset === 'archive'
  ? { br: 11, gzip: 9, zstd: 19 }
  : { br: 5, gzip: 6, zstd: 3 };
const codecs = {
  br: [data => z.brotliCompressSync(data, { params: {
    [z.constants.BROTLI_PARAM_QUALITY]: level.br,
    [z.constants.BROTLI_PARAM_SIZE_HINT]: input.length,
  } }), z.brotliDecompressSync],
  gzip: [data => z.gzipSync(data, { level: level.gzip }), z.gunzipSync],
  zstd: [data => z.zstdCompressSync(data, { params: {
    [z.constants.ZSTD_c_compressionLevel]: level.zstd,
    [z.constants.ZSTD_c_windowLog]: 23,
  } }), z.zstdDecompressSync],
};

try {
  for (const encoding of workerData.algorithms) {
    parentPort.postMessage({ type: 'progress', encoding });
    const [compress, decompress] = codecs[encoding];
    const started = performance.now();
    const bytes = compress(input);
    const compressionMs = performance.now() - started;
    const decodeStart = performance.now();
    const decoded = decompress(bytes);
    const decompressionMs = performance.now() - decodeStart;
    if (!decoded.equals(input) || hash(decoded) !== digest) throw new Error('压缩回解校验失败');
    parentPort.postMessage({ type: 'result', encoding, bytes, level: level[encoding],
      compressionMs, decompressionMs, verified: true });
  }
  parentPort.postMessage({ type: 'done', sha256: digest });
} catch (error) {
  parentPort.postMessage({ type: 'failure', error: error.message });
}
