/* 开发诊断采集器：不启动游戏循环，不改渲染器，不发送网络请求。 */
(() => {
  "use strict";
  if (Object.prototype.hasOwnProperty.call(globalThis, "__webGamePerf")) {
    if (globalThis.__webGamePerf?.probeVersion === 1) return;
    throw new Error("__webGamePerf 已被其他代码占用");
  }
  let active = null;
  const clock = () => performance.now();
  const append = (list, value, key) => {
    if (list.length < active.maxSamples) list.push(value);
    else active.result.dropped[key]++;
  };
  function collectLongTasks(entries) {
    if (!active) return;
    for (const entry of entries) {
      // 不把测量开始前的长任务整体计入当前窗口。
      const start = Math.max(entry.startTime, active.start);
      const end = Math.min(entry.startTime + entry.duration, clock());
      if (end > start) append(active.result.longTasks,
        { startMs: start - active.start, durationMs: end - start }, "longTasks");
    }
  }
  function record(name, value, unit, kind = "measured") {
    if (!active) return false;
    if (!/^[A-Za-z][\w.:-]{0,95}$/.test(name) || !Number.isFinite(value) ||
        typeof unit !== "string" || !unit || unit.length > 24 ||
        !["measured", "estimated"].includes(kind)) {
      throw new Error("record 需要合法名称、有限数值、单位和 measured/estimated 口径");
    }
    const metrics = active.result.metrics;
    if (metrics[name] && (metrics[name].unit !== unit || metrics[name].kind !== kind)) {
      throw new Error("同名指标不能更换单位或测量口径");
    }
    if (active.metricCount >= active.maxSamples) {
      active.result.dropped.metricSamples++;
      return false;
    }
    metrics[name] ??= { unit, kind, samples: [] };
    metrics[name].samples.push({ tMs: clock() - active.start, value });
    active.metricCount++;
    return true;
  }
  function start({ metadata = {}, maxSamples = 120000, sampleJsHeap = false } = {}) {
    if (active) throw new Error("采集已启动，请先 stop");
    if (!Number.isInteger(maxSamples) || maxSamples < 1 || maxSamples > 1000000) {
      throw new Error("maxSamples 须为 1–1000000 的整数");
    }
    const result = {
      schemaVersion: 1, metadata: JSON.parse(JSON.stringify(metadata)),
      startedAt: new Date().toISOString(), durationMs: null,
      rafIntervalsMs: [], gameFrameIntervalsMs: [], longTasks: [],
      metrics: Object.create(null), visibilityChanges: [], resizeEvents: 0,
      dropped: { raf: 0, gameFrames: 0, longTasks: 0, metricSamples: 0, events: 0 },
      capabilities: { longTasks: false, jsHeap: false }, warnings: [],
    };
    active = { start: clock(), result, maxSamples, metricCount: 0,
      lastRaf: null, lastGameFrame: null, observer: null, lastHeap: -Infinity };
    if (document.visibilityState !== "visible") result.warnings.push("started-hidden");
    active.visibility = () => append(result.visibilityChanges, {
      tMs: clock() - active.start, state: document.visibilityState,
    }, "events");
    active.resize = () => { result.resizeEvents++; };
    document.addEventListener("visibilitychange", active.visibility);
    globalThis.addEventListener("resize", active.resize);
    if (typeof PerformanceObserver !== "undefined" &&
        PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      try {
        active.observer = new PerformanceObserver(list => collectLongTasks(list.getEntries()));
        active.observer.observe({ type: "longtask", buffered: false });
        result.capabilities.longTasks = true;
      } catch { result.warnings.push("longtask-observer-unavailable"); }
    }
    function tick(t) {
      if (!active) return;
      if (active.lastRaf !== null && t > active.lastRaf) {
        append(result.rafIntervalsMs, t - active.lastRaf, "raf");
      }
      active.lastRaf = t;
      if (sampleJsHeap && t - active.lastHeap >= 1000) {
        active.lastHeap = t;
        const bytes = performance.memory?.usedJSHeapSize;
        if (Number.isFinite(bytes)) {
          result.capabilities.jsHeap = true;
          record("memory.jsHeap", bytes, "bytes");
        }
      }
      active.rafId = requestAnimationFrame(tick);
    }
    active.rafId = requestAnimationFrame(tick);
    return { startedAt: result.startedAt };
  }
  function gameFrame(t = clock()) {
    if (!active) return false;
    if (!Number.isFinite(t) || t < active.start ||
        (active.lastGameFrame !== null && t <= active.lastGameFrame)) {
      throw new Error("gameFrame 需要 performance 时间轴上递增的毫秒时间");
    }
    if (active.lastGameFrame !== null) {
      append(active.result.gameFrameIntervalsMs, t - active.lastGameFrame, "gameFrames");
    }
    active.lastGameFrame = t;
    return true;
  }
  function stop() {
    if (!active) throw new Error("没有运行中的采集");
    const session = active;
    cancelAnimationFrame(session.rafId);
    if (session.observer) {
      collectLongTasks(session.observer.takeRecords());
      session.observer.disconnect();
    }
    document.removeEventListener("visibilitychange", session.visibility);
    globalThis.removeEventListener("resize", session.resize);
    session.result.durationMs = clock() - session.start;
    active = null;
    return session.result;
  }
  Object.defineProperty(globalThis, "__webGamePerf", {
    configurable: true,
    value: Object.freeze({ probeVersion: 1, start, stop, record, gameFrame,
      isRunning: () => active !== null,
      isReady: () => active !== null && active.result.rafIntervalsMs.length > 0 }),
  });
})();
