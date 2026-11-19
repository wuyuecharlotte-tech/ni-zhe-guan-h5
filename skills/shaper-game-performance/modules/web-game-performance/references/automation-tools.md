# 可选采集、驱动与统计工具

这三个工具用于可运行的浏览器游戏。先读 [执行流程](execution-workflow.md)；没有 Playwright 时使用现有浏览器工具注入探针或平台工具，不要求安装新依赖。所有路径按实际工作区填写，不假定 skill 已安装。

## 1. browser_probe.js：页面内有界采样

用浏览器已有的脚本执行能力加载 [browser_probe.js](../scripts/browser_probe.js) 全文。若工具不支持文件注入，可在开发构建中临时引入文件；不要无理由降低 CSP 或修改发布安全策略。探针不会启动游戏、不hook渲染器、不发网络请求。

在页面上下文中执行：

```js
__webGamePerf.start({
  metadata: { scenarioId: "battle", buildId: "实际构建标识" },
  maxSamples: 120000,
  sampleJsHeap: false
});
// 等待 __webGamePerf.isReady() 为true，再通过浏览器操作或场景接口实际游玩。
// 完成后调用并把返回对象通过浏览器/文件工具保存为JSON。
const raw = __webGamePerf.stop();
```

手工示例 metadata 只够临时探索；交给离线分析器时须补齐下面的完整环境字段、status和validate证据。不要仅 console.log 大对象；开发工具可能保留对象且日志不等于持久文件。

接口：

| 方法 | 行为/限制 |
|---|---|
| start(options) | 重复start会报错；maxSamples为每个帧/事件数组容量与全部自定义数值样本的总容量，默认120000，可设1–1000000。不同类别容量分别控制；溢出计数而非无限增长 |
| gameFrame() | 在引擎一整帧渲染提交结束处调用一次；不是每个camera/pass一次。可传同一 performance 时间轴的递增毫秒值，不可用 Date.now。未接入则没有游戏帧样本 |
| record(name,value,unit,kind) | 有限数值，名称为短ASCII标识；kind为measured或estimated，默认measured。同名单位/口径固定，例如 `record("render.drawCalls", 120, "count")`；不得把估算显存标measured |
| stop() | 停止自己的rAF/observer/监听器并返回原始对象；不停止游戏。没有采样时stop报错 |
| isRunning() | 查询是否正在采样；只读全局API，不影响游戏循环 |
| isReady() | 正在采样且已取得至少一个完整rAF间隔。首次动作前等待此条件，避免阻塞发生在首回调前而帧间隔漏记；这只是采样就绪，不代表游戏可玩 |

接入渲染hook时用项目真实整帧回调，例如在已有render结束处调用 `globalThis.__webGamePerf?.gameFrame()`；计数器重置与采样要在正确帧序。所有hook仅诊断构建生效，不生成第二套循环。退出后解除本次新增hook；需要移除全局时，先stop再 `delete globalThis.__webGamePerf`。重复注入同版本直接复用，不重置已有采样。

探针输出 `schemaVersion:1`，包含：

- metadata、startedAt、durationMs；rafIntervalsMs、gameFrameIntervalsMs分别为完整相邻间隔。
- longTasks为 `{startMs,durationMs}` 数组；capabilities.longTasks为false时没有数据，不能解释为0次长任务。
- metrics为 `{名称:{unit,kind,samples:[{tMs,value}]}}`；JS heap仅在请求且浏览器提供非标准API时以约1Hz采样，capabilities.jsHeap说明是否实际读到。
- visibilityChanges、resizeEvents、dropped、warnings；默认稳态分析会标记后台/resize/溢出轮为无效，原始文件仍保留。

rAF统计是浏览器回调节奏，gameFrame统计是已接入的游戏提交节奏；均不能保证屏幕实际呈现，也不等于CPU/GPU耗时。Probe不会自动统计INP、响应链路、线上错误率、白屏率或总内存；这些须按 [体验指标](experience-metrics.md) 另接事件与会话聚合。

## 2. run_browser_scenario.mjs：可选 Playwright 驱动

驱动语法需要 Node.js 18+，实际运行还须满足项目 Playwright 的 Node 版本要求（较新版本可能要求20+），并有可用浏览器。驱动优先从配置文件所在项目目录解析依赖；不自动安装包/浏览器、不启动项目服务器。先按执行流程启动并保存服务日志。

在项目内创建配置（URL、构建和设备标识须替换为实测值）：

```json
{
  "url": "http://127.0.0.1:5173/",
  "scenarioModule": "./perf-scenario.mjs",
  "scenarioId": "battle-steady",
  "scenarioVersion": "1",
  "seed": 42,
  "buildId": "实际构建及补丁哈希",
  "deviceId": "实际设备标识",
  "engine": "项目实际引擎及版本",
  "backend": "webgl2",
  "quality": {"preset":"high", "renderScale":1},
  "workload": {"enemies":100, "effect":"explosion"},
  "targetFPS": 60,
  "toleranceMs": 1,
  "durationSeconds": 30,
  "warmupSeconds": 5,
  "repeats": 3,
  "browserName": "chromium",
  "headless": false,
  "viewport": {"width":1280,"height":720},
  "deviceScaleFactor": 1,
  "cacheProtocol": "fresh-context",
  "profile": "steady",
  "sampleJsHeap": false
}
```

支持chromium/firefox/webkit，但不是都已安装。headless仅适合工具集成验证或明确声明的测试环境，不能等同目标真机。`profile:first-use` 时必须显式 `warmupSeconds:0`，setup也不能触发待测技能。此驱动仅实现fresh-context，热启动/真实进程冷启动用专门驱动并记录协议。

### 场景适配合同

`perf-scenario.mjs` 必须导出 setup、exercise、validate，可选teardown。下面是**与项目开发hook约定的适配样例**，不是任意引擎都存在的API：需要依据当前项目实现 `window.__perfScenario` 或改成真实UI动作与状态断言；缺失时应明确失败，不能用空函数/固定passed代替。

```js
export async function setup(page, ctx) {
  await page.waitForFunction(() => !!window.__perfScenario);
  await page.evaluate(async ({seed, workload}) => {
    await window.__perfScenario.reset({seed, workload});
  }, {seed:ctx.seed, workload:ctx.config.workload});
  await page.waitForFunction(() => window.__perfScenario.isPlayable());
}

export async function exercise(page, ctx) {
  // 依照合同重放输入/镜头和真实技能，覆盖durationMs。
  // hook应验证实际状态变化；不能仅等计时器而不驱动负载。
  await page.evaluate(async ({durationMs, mode}) => {
    await window.__perfScenario.replay({durationMs, mode});
  }, {durationMs:ctx.durationMs, mode:ctx.mode});
}

export async function validate(page) {
  const evidence = await page.evaluate(() => window.__perfScenario.check());
  if (!evidence.playable || !evidence.workloadReached || !evidence.actionsApplied) {
    throw new Error("场景、负载或实际输入结果未通过");
  }
  return {passed:true, details:JSON.stringify(evidence)};
}
```

同一输入脚本可能产生不同帧数，优先按模拟时间/固定事件顺序驱动，不把「渲染了N帧」当同一玩法负载。重置必须清除事件/计分并设同一种子；warmup后同页重置，避免重新冷却资源。validate应检查预期实体量、动作结果和核心不变量，而非只检查无异常。

驱动命令示例，技能路径与项目路径均用实际绝对路径：

```sh
node /技能目录/scripts/run_browser_scenario.mjs --config /项目/perf-config.json --phase baseline --out /项目/perf/baseline
node /技能目录/scripts/run_browser_scenario.mjs --config /项目/perf-candidate.json --phase candidate --out /项目/perf/candidate
python3 /技能目录/scripts/analyze_runs.py --baseline /项目/perf/baseline --candidate /项目/perf/candidate --out /项目/perf/comparison
```

若依赖由工具环境提供，用 `--playwright-module /实际/node_modules/playwright` 指定，不能把示例路径当存在。测候选前先构建并确认服务实际提供候选版本；candidate配置更新buildId，其他同质量验收字段保持一致。

驱动每轮独立context，导航后setup→预热→重置→启动采样→等待isReady（不触发技能）→真实exercise与固定窗口→stop→validate→截图→teardown→关闭context。完整durationMs包含采样就绪等待及命令开销。exercise应覆盖所要求的时长并及时返回；较早返回只会等窗口，不保证负载持续，validate必须给负载证据。较迟返回可能延长窗口，原始时长会保留，需检查原因。

输出 `run-baseline-001.json` 等与对应PNG，不覆盖已有JSON；失败保留status、stage/message、页面未捕获异常、可取得的部分采样和功能结果，exit2。浏览器启动失败保存session-failure文件；依赖/配置错误在启动前可能只有stderr，运行时也须保存终端日志。崩溃或验证失败不要作为有效基线；修复后重跑并保留失败证据。异常页截图可能无法取得，不能假称每次失败都有截图。

`startup.readyFromNavigationMs` 为导航起到setup完成的辅助值，包括自动化操作/等待，并未在导航阶段采集完整长任务或可靠首帧。严谨的打开速度需由游戏真实ready mark、资源与有效输入定义额外接入；不能将此值标成LCP或平台打开速度。

## 3. analyze_runs.py：可追溯的离线统计

Python3标准库，无额外依赖。支持单个raw JSON或目录；目录只读 `run-*.json`，不读取自己的summary。只分析基线也可：

```sh
python3 /技能目录/scripts/analyze_runs.py --baseline /项目/perf/baseline --out /项目/perf/baseline-report
```

完整raw除probe字段外须有：

- metadata：scenarioId、scenarioVersion、seed、buildId、deviceId、engine、backend、quality、workload、targetFPS、toleranceMs、environment、protocol。environment记录浏览器/版本、headless、UA、viewport、DPR和所有canvas buffer尺寸；实际温度、供电、网络/缓存、刷新率由外部清单补充，自动字段不能覆盖全部硬件条件。
- status为ok/failed；validation为 `{passed:true,details:"实际断言证据"}`；failure、pageErrors、droppedPageErrors。手工采集也需真实填充，不为通过分析伪造状态。

输出summary.json与report.md，默认拒绝覆盖。异常/后台/resize/溢出轮保留但不计稳态汇总；长帧、GC、离群点不删除。报告中列出失败与所有样本数。对于主动测试故障/后台的场景，用专项故障统计，不以此稳态分析器的valid作为功能结论。

- Nearest-rank百分位：排序后取 `ceil(p*n)-1` 索引；P99样本少时不稳定，样本量与窗口必须同时报告。
- 回调/提交FPS=`完整间隔数×1000/间隔总和`，同时列intervalSpanMs，与总durationMs不同；不可补首尾未知间隔。分别统计rAF/gameFrames，不混池。
- 每轮先算P50/P95/P99/max、超预算比例、>2B次数和最长连续超预算长度；跨轮报中位数及最小/最大，不把几轮堆起来掩盖差轮。JSON含每轮长任务数量/裁剪总时长、自定义metrics的单位、kind、first/last/min/max/mean。
- 核对场景、负载、质量、环境、协议；同组构建必须一致，基线与候选构建可不同。不一致时不输出改善差值，列差异并exit2；有无效轮也exit2，但报告仍生成。
- 可比时输出差值；基线0值不算百分比。指标方向不同，FPS越高和耗时越低的含义需分别解释；不自动「通过」、不宣称统计显著性。小于3有效轮提示探索性，窗口偏长保留并提示人工复核。
- 缺少GPU/进程内存/游戏帧hook为不可用。数据有效不等于功能/画质验收通过，环境字段相等也不能自动保证真实设备热状态一致。
