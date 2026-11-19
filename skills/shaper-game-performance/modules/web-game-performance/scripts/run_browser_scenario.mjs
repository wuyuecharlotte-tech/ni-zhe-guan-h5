#!/usr/bin/env node
// 可选 Playwright 驱动；依赖从被测项目解析，不自动安装包或浏览器。
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

function options(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith("--") || !argv[i + 1] || argv[i + 1].startsWith("--")) {
      throw new Error("参数格式：--config 文件 --phase baseline|candidate --out 目录 [--playwright-module 模块路径]");
    }
    const key = argv[i].slice(2);
    if (!["config", "phase", "out", "playwright-module"].includes(key)) throw new Error(`未知参数 ${key}`);
    args[key] = argv[i + 1];
  }
  if (!args.config || !args.out || !["baseline", "candidate"].includes(args.phase)) {
    throw new Error("必须指定 --config、--phase baseline|candidate、--out");
  }
  return args;
}
async function timed(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} 超时 (${ms}ms)`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}
async function save(file, value) {
  // 不覆盖已有轮次。对比数据必须可追溯。
  await fs.writeFile(file, JSON.stringify(value, null, 2), { flag: "wx" });
}
function validate(c) {
  for (const key of ["url", "scenarioModule", "scenarioId", "scenarioVersion", "buildId", "deviceId", "engine", "backend"]) {
    if (typeof c[key] !== "string" || !c[key].trim()) throw new Error(`配置缺少 ${key}`);
  }
  if (!["http:", "https:"].includes(new URL(c.url).protocol)) throw new Error("url 须为实际 HTTP(S) 地址");
  for (const key of ["seed", "quality", "workload"]) {
    if (c[key] === undefined) throw new Error(`配置缺少 ${key}`);
  }
  for (const [key, fallback, min, max] of [
    ["durationSeconds", 30, 0.1, 86400], ["warmupSeconds", 5, 0, 3600],
    ["repeats", 3, 1, 100], ["targetFPS", 60, 1, 1000],
    ["toleranceMs", 1, 0, 1000], ["stepTimeoutSeconds", 30, 1, 3600],
    ["deviceScaleFactor", 1, 0.1, 8],
  ]) {
    c[key] ??= fallback;
    if (!Number.isFinite(c[key]) || c[key] < min || c[key] > max) throw new Error(`${key} 不在允许范围内`);
  }
  if (!Number.isInteger(c.repeats)) throw new Error("repeats 须为整数");
  c.browserName ??= "chromium";
  if (!["chromium", "firefox", "webkit"].includes(c.browserName)) throw new Error("不支持的 browserName");
  c.headless ??= false;
  if (typeof c.headless !== "boolean") throw new Error("headless 须为布尔值");
  c.viewport ??= { width: 1280, height: 720 };
  if (![c.viewport.width, c.viewport.height].every(v => Number.isInteger(v) && v > 0)) throw new Error("viewport 无效");
  c.cacheProtocol ??= "fresh-context";
  if (c.cacheProtocol !== "fresh-context") throw new Error("本驱动只实现 fresh-context；热启动请编写专用驱动并记录策略");
  c.profile ??= "steady";
  if (!["steady", "first-use"].includes(c.profile)) throw new Error("profile 须为 steady 或 first-use");
  if (c.profile === "first-use" && c.warmupSeconds !== 0) throw new Error("first-use 必须显式设 warmupSeconds: 0");
  return c;
}
async function main() {
  const args = options(process.argv.slice(2));
  const configFile = path.resolve(args.config);
  const projectDir = path.dirname(configFile);
  const c = validate(JSON.parse(await fs.readFile(configFile, "utf8")));
  const scenario = await import(pathToFileURL(path.resolve(projectDir, c.scenarioModule)).href);
  for (const hook of ["setup", "exercise", "validate"]) {
    if (typeof scenario[hook] !== "function") throw new Error(`场景模块缺少 ${hook}(page, context)`);
  }
  const requireProject = createRequire(path.join(projectDir, "package.json"));
  let pw;
  try { pw = requireProject(args["playwright-module"] || "playwright"); }
  catch (error) { throw new Error(`无法加载 Playwright：${error}；请检查项目已安装包及其 Node 版本要求，或 --playwright-module 指定可用模块。未自动安装任何依赖。`); }
  const out = path.resolve(args.out);
  await fs.mkdir(out, { recursive: true });
  const probePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "browser_probe.js");
  let browser;
  try { browser = await pw[c.browserName].launch({ headless: c.headless }); }
  catch (error) {
    await save(path.join(out, `session-failure-${Date.now()}.json`),
      { status: "failed", stage: "browser-launch", message: String(error), buildId: c.buildId });
    throw error;
  }
  let failures = 0;
  try {
    for (let index = 1; index <= c.repeats; index++) {
      const stem = `run-${args.phase}-${String(index).padStart(3, "0")}`;
      const file = path.join(out, `${stem}.json`);
      try { await fs.access(file); throw new Error(`拒绝覆盖 ${file}；请更换输出目录`); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      const context = await browser.newContext({ viewport: c.viewport, deviceScaleFactor: c.deviceScaleFactor });
      const page = await context.newPage();
      page.setDefaultTimeout(c.stepTimeoutSeconds * 1000);
      page.setDefaultNavigationTimeout(c.stepTimeoutSeconds * 1000);
      const errors = [];
      let droppedErrors = 0;
      page.on("pageerror", error => {
        if (errors.length < 100) errors.push(String(error)); else droppedErrors++;
      });
      const ctx = { config: c, phase: args.phase, index, seed: c.seed, mode: "setup", durationMs: 0 };
      let raw, stage = "navigation", failure = null, validation = null, metadata;
      try {
        await page.addInitScript({ path: probePath });
        const response = await page.goto(c.url, { waitUntil: "domcontentloaded" });
        if (response && !response.ok()) throw new Error(`入口 HTTP ${response.status()}`);
        stage = "setup";
        await timed(scenario.setup(page, ctx), c.stepTimeoutSeconds * 1000, stage);
        // setup 必须等待真实可玩条件；此值包含导航和 setup 操作，不自动等同 LCP。
        const readyFromNavigationMs = await page.evaluate(() => performance.now());
        if (c.warmupSeconds > 0) {
          stage = "warmup";
          await timed(scenario.exercise(page, { ...ctx, mode: "warmup", durationMs: c.warmupSeconds * 1000 }),
            (c.warmupSeconds + c.stepTimeoutSeconds) * 1000, stage);
          // 重新进入相同状态，但保留本页已预热资源；不得重新创建浏览器上下文。
          await timed(scenario.setup(page, { ...ctx, mode: "reset-after-warmup" }), c.stepTimeoutSeconds * 1000, "reset");
        }
        const environment = await page.evaluate(() => ({
          userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight },
          dpr: devicePixelRatio,
          canvases: [...document.querySelectorAll("canvas")].map(x => ({ width: x.width, height: x.height })),
        }));
        metadata = {
          scenarioId: c.scenarioId, scenarioVersion: c.scenarioVersion, seed: c.seed,
          buildId: c.buildId, deviceId: c.deviceId, engine: c.engine, backend: c.backend,
          quality: c.quality, workload: c.workload, targetFPS: c.targetFPS, toleranceMs: c.toleranceMs,
          environment: { ...environment, browserName: c.browserName, browserVersion: browser.version(), headless: c.headless },
          protocol: { profile: c.profile, cacheProtocol: c.cacheProtocol, warmupSeconds: c.warmupSeconds,
            durationSeconds: c.durationSeconds, sampleJsHeap: c.sampleJsHeap === true },
          run: { phase: args.phase, index },
        };
        stage = "sampling";
        await page.evaluate(({ metadata, maxSamples, sampleJsHeap, ready }) => {
          globalThis.__webGamePerf.start({ metadata, maxSamples, sampleJsHeap });
          globalThis.__webGamePerf.record("startup.readyFromNavigationMs", ready, "ms");
        }, { metadata, maxSamples: c.maxSamples ?? 120000, sampleJsHeap: c.sampleJsHeap === true,
          ready: readyFromNavigationMs });
        // 先获得完整间隔，再触发首次动作，避免卡顿落入 start→首回调的未知区间。
        stage = "probe-ready";
        await page.waitForFunction(() => globalThis.__webGamePerf.isReady());
        stage = "sampling";
        // exercise 必须实际驱动场景并在 durationMs 附近返回；过短返回也保留固定观察窗口。
        await timed(Promise.all([
          scenario.exercise(page, { ...ctx, mode: "measure", durationMs: c.durationSeconds * 1000 }),
          new Promise(resolve => setTimeout(resolve, c.durationSeconds * 1000)),
        ]), (c.durationSeconds + c.stepTimeoutSeconds) * 1000, stage);
        raw = await page.evaluate(() => globalThis.__webGamePerf.stop());
        stage = "validation";
        validation = await timed(scenario.validate(page, { ...ctx, mode: "validate" }), c.stepTimeoutSeconds * 1000, stage);
        if (!validation || validation.passed !== true || typeof validation.details !== "string" || !validation.details.trim()) {
          throw new Error("validate 必须返回 {passed: true, details: 实际工作负载/功能断言证据}；截图本身不是断言");
        }
        stage = "screenshot";
        await page.screenshot({ path: path.join(out, `${stem}.png`) });
      } catch (error) {
        failure = { stage, message: String(error) };
        if (!raw) {
          try { raw = await page.evaluate(() => globalThis.__webGamePerf?.isRunning() ? globalThis.__webGamePerf.stop() : null); }
          catch { /* 导航/崩溃导致采集器消失时仍保存失败文件。 */ }
        }
      } finally {
        if (typeof scenario.teardown === "function") {
          try { await timed(scenario.teardown(page, ctx), c.stepTimeoutSeconds * 1000, "teardown"); }
          catch (error) { failure ??= { stage: "teardown", message: String(error) }; }
        }
        try { await context.close(); }
        catch (error) { failure ??= { stage: "context-close", message: String(error) }; }
      }
      const result = { ...(raw || { schemaVersion: 1, metadata: metadata || { ...c, run: { phase: args.phase, index } } }),
        status: failure || errors.length || droppedErrors ? "failed" : "ok", validation,
        failure, pageErrors: errors, droppedPageErrors: droppedErrors };
      await save(file, result);
      if (result.status !== "ok") failures++;
      console.log(`${stem}: ${result.status} -> ${file}`);
    }
  } finally { await browser.close(); }
  if (failures) process.exitCode = 2;
}
main().catch(error => { console.error(String(error)); process.exitCode = 2; });
