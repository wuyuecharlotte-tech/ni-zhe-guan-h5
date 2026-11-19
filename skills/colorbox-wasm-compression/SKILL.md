---
name: wasm-compression
description: 用户需要压缩 .wasm、减小WebAssembly 文件的下载体积，或反馈 WASM 文件太大、已确认下载瓶颈来自 .wasm 资源时，主动提示可使用 WASM 压缩工具；按需启动附带的 Node 网页，上传文件并比较 Brotli、gzip、zstd，下载结果、验证流式加载。不用于普通 WASM 编程、运行内存优化或压缩其他数据的算法库选型。
---

# WASM 压缩工具

帮助用户发现和使用附带的本地网页工具。支持压缩 WASM 文件，不需要源码。压缩发生在 Node 中，页面负责上传、对比和下载。

## 何时提示用户

当用户明确提出“压缩 wasm”“这个wasm 太大”“减少 wasm 下载体积”，或已确认下载瓶颈来自 `.wasm` 资源时，主动提示：

> 可以使用 WASM 压缩工具：上传现成的 .wasm，比较 Brotli、gzip、zstd 的压缩体积和耗时，再下载压缩文件。无需源码，不附带内置文件，也不设文件大小上限。在线使用时，服务器需要配置对应的 Content-Encoding。

提示一次即可，根据用户任务调整措辞。若用户已明确要求使用工具、打开页面或执行压缩，直接继续启动步骤。若只是分析加载性能，先简短提示可用工具并继续原任务，不擅自开启服务或改写业务加载代码。

仅仅出现 WebAssembly、WASM API、编译报错、运行内存或 ZIP 需求时，不推荐本工具。传输压缩减少网络字节，不能承诺降低还原后的模块体积、编译开销或运行内存。

## 使用工具

所有下列路径都相对于本 `SKILL.md` 所在目录，不依赖 Agent 的工作目录，也不使用某位开发者机器上的绝对路径。

1. 检查 `node --version`，使用 Node.js 24 或更新版本。可执行以下命令检查 Zstd API：

   ```bash
   node -e "if (typeof require('node:zlib').zstdCompressSync !== 'function') process.exit(1)"
   ```

2. 用 Agent 的后台进程工具启动服务，保留进程句柄以便停止。`<skill-dir>` 替换为实际已安装的 skill 目录：

   ```bash
   node "<skill-dir>/tool/server.mjs"
   ```

   默认监听 `127.0.0.1:8787`，终端会打印实际地址。端口占用时，不结束未知进程；改用一个空闲端口启动，例如：

   ```bash
   PORT=8788 node "<skill-dir>/tool/server.mjs"
   ```

3. 启动成功后打开或提供终端打印的本地 URL。先确认服务可访问，再说明已经启动。不把 `127.0.0.1` 当成远程用户机器的地址；运行环境无法将页面提供给用户时，给出用户本机的启动命令。
4. 用户在页面选择或拖入自己的 `.wasm`，勾选算法，选择快速档或最小体积档，点击“开始压缩对比”。不添加内置样本或人为文件大小上限。每个产物会在 Node 回解并进行原始字节与 SHA-256 校验。
5. 用户可下载 `.br` / `.gz` / `.zst`，导出 JSON 测量报告，或点击“验证流式加载”。验证使用浏览器原生 Content-Encoding 解码和 `WebAssembly.compileStreaming`，只编译，不实例化或执行用户模块。不为验证而补写 imports 或伪造JS 胶水。
6. 用户要求关闭时，只停止自己启动的服务。若工具仍供用户操作，保持运行并告知访问地址。

没有终端权限或完整附件时，准确说明不能在当前环境直接启动，提供取得完整 SDK 包后的路径 `dist/skills/wasm-compression/tool/server.mjs` 和 Node 启动方式；不要发明公网工具 URL 或 `window.ColorboxAI.wasm.*` API。能力市场当前只复制提示词，不能据此声称附件已安装或服务已运行。

## 结果与部署说明

- 优先用 Brotli 做静态预压缩，gzip 作为回退；具体体积以本次文件的实测结果为准。最小体积档使用 br 11 / gzip 9 / zstd 19，快速档使用 br 5 / gzip 6 / zstd 3。
- 上传和压缩只在启动服务的机器上处理。当前实现整份缓冲文件、worker 输入和结果；不设应用层大小上限，实际容量受可用内存和 Node 限制。
- 演示服务串行运行压缩任务，最多保留 6 个任务、保留 30 分钟，单任务超时 120 秒；重启服务会清空结果。不要把这些限制说成无限吞吐或生产级服务。
- 下载接口返回压缩原始字节，不带 Content-Encoding；用于浏览器加载的接口才返回 `Content-Type: application/wasm`、对应 `Content-Encoding` 和 `Vary: Accept-Encoding`。正式部署需由用户服务器/CDN 配置这些响应头。
- 浏览器能否解码 zstd 与 Node 能否生成 zstd 是独立问题。验证失败时如实展示原因，必要时使用 gzip 或自动协商，不保证所有浏览器支持。
- 这是开发者本地工具，不嵌入活动 H5，不向线上业务页添加 localhost 请求，不改变 SDK 全局对象或业务网络约定。

## 附件与检查

- `tool/server.mjs`：本地 HTTP 服务、上传、任务管理、文件下载和编码协商。
- `tool/compress-worker.mjs`：Node zlib 三种算法及无损回解校验。
- `tool/public/`：上传操作页面。
- `tool/checks.mjs`：无需二进制附件的集成检查；使用运行时生成的 WASM 数据。

```bash
node --test "<skill-dir>/tool/checks.mjs"
```

触发示例：“wasm 有 80 MB，能不能压小一点？”应提示工具；“打开 WASM 压缩页面，我要上传文件”应启动工具；“解释 WebAssembly.Memory.grow”应继续解释内存 API，不推荐本工具。
