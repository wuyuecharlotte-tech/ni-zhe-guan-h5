<!-- COLORBOX:START -->
# Colorbox 活动交付工作区

H5 交付由阶段状态机驱动。交付任务每轮先查状态再工作，阶段细节按需读 `state.py current` 输出的「读」列出的文档；机制/配置详见 README.md。

## 独立素材库管理
- 用户要求在应用中使用或替换素材库资源时，同样读取 `skills/material-library/SKILL.md` 及 `references/use.md`：普通素材默认使用原始资源 URL，不内联 base64 或使用素材库 UI 图标代替原文件；Spine 下载到项目保留相对路径加载。应用交付仍遵循状态机。
- 用户仅要求查询、上传、下载、删除或恢复素材库内容，且存在 `skills/material-library/SKILL.md` 时，先读该技能并按其中的执行环境入口操作。无需启动 H5 交付流程、创建页面或改变交付阶段。
- 此类独立操作不适用下方的交付状态查询与探索边界；只读取该技能及当前操作所需的引用和脚本。若同时要求制作 H5，页面交付部分仍遵循状态机。

## 页面验证与排障
- 性能采集必须由业务初始化成功触发：在首屏必要资源、数据、画面和核心交互均可用后调用
  `window.ShaperPerformance.markReady()`。平台会暂存信号并等待 WebGuard 初始化完成，禁止用
  `load`、固定延时或 iframe 通信握手代替业务就绪；失败分支不得发送。监听
  `shaper:performance:reset`，在 BFCache 恢复后重新检查业务是否可用再调用。
- 验收已上传页面，或用户要求调试页面、模拟登录、查看报错／请求／埋点、抓取真机日志时，先读 `skills/shaper-debug/SKILL.md`，使用统一授权入口与诊断记录。独立排障不需要重新走交付确认或改变阶段；交付验收仍遵循 runbook 的 test 阶段。
- 已有可用浏览器，且需要登录的页面可取得平台模拟登录授权时，AI 自行完成关键操作验证；无需登录的页面直接验证。浏览器或授权不可用时，记录缺少的条件，查询可获取的诊断日志；需要真机复现时请开发者操作，未取得页面证据的步骤标为待验证。

## 交付任务每轮必做
- H5 交付任务每轮先跑 `python3 skills/runbook/state.py current` 拉取当前阶段、门禁与下一步命令，再开始本步工作。

## 事实源与状态
- 流程定义唯一事实源：`skills/runbook/PROCESS.md`（改流程只改它）。
- 状态只经 `state.py` 翻转（init/current/configure/confirm/advance/reject/goto/decide/tree/clean），决策只经 `state.py decide` 记录；禁止手改 state/*.json。`goto` 用于显式恢复阶段，不能代替补齐门禁。
- 实时 Room 游戏先读 `skills/runbook/references/implementation-route.md`：用 configure 区分运行方式与持久化，不保存战绩仍需要 Room 云运行。既有同范围授权复用原话，不重复询问部署或存储；不要调用决策树中不存在的 ID。
- 发布前运行 `python3 skills/runbook/scripts/review-h5.py`，调用正式上传同一后台 ZIP 自动校验；按 API 原始结果推进，不自行判定 Colyseus/WebSocket 或用本地扫描替代。接口失败与代码拒绝分别报告。
- 无 `activity.json` 也能运行（默认身份 workspace）；云凭据 `credentials.json` 缺失只在部署阶段向用户确认。

## 交付任务探索边界
- 每轮只读 `state.py current` 输出的「读」里列的文件；禁读 `skills/runbook/` 源码、`skills/act-cloudbase/` 实现与 `examples/`、`state/*.json`。
- 探索 ≤5 次工具调用，之后必须产出草案/确认单或向开发者提问，不把准备当产出。

<!-- COLORBOX:END -->
