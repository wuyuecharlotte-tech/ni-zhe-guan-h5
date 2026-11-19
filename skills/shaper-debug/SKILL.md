---
name: shaper-debug
description: 排查 Shaper 已上传页面的登录、报错、请求和埋点。生成带授权的 Debug 链接，用浏览器复现，或查询真机操作产生的 CLS 日志；适用于下载版技能工作区。
---

# Shaper AI Debug

以工作区的 `activity.json` 和 `credentials.json` 为身份来源。凭据缺失或过期时让开发者在 Shaper 重新授权／下载；不要求其提供虎扑登录 Token，不修改业务代码伪造正式登录。

先检查现有浏览器自动化／computer use 是否可用。有浏览器且模拟登录授权可用时，AI 自行验证页面关键操作；无需登录的页面可直接验证。缺少浏览器或授权时说明具体条件，查询已有日志，必要时交给开发者操作真机。接口脚本成功只记为接口通过，未操作的页面步骤标为待验证。模拟登录只替换用户身份，业务请求、云服务和游戏房间继续访问真实服务。

1. 上传版本后，在技能工作区运行（自动获取当前项目最新可预览版本）：

   ```bash
   node skills/shaper-debug/scripts/debug.js start --mock-login true --actors 1
   ```

   也可传 `--preview-url "完整预览地址"` 排查指定上传结果。脚本会向 Shaper 解析该预览实际所属项目，后续链接与日志查询使用这个项目；它可以与当前技能包绑定的游戏项目不同。输出授权链接和排查编号，完整结果保存在 `debug-context.json`。默认开启模拟登录；检查真实登录时传 `--mock-login false`。多人对战传 `--actors 3`，每个用户使用独立浏览器上下文。

2. 用浏览器打开返回的完整 `actors[].qrUrl`，确认是本轮内容，不自行拼接链接。默认按移动端 H5 验证：优先使用浏览器的手机模拟能力，竖屏 390×844，支持时启用 mobile UA 和 touch。不支持时标为桌面验证或窄屏检查，不修改页面代码来冒充设备模拟。平台会自动处理授权；新浏览器需要新入口时执行：

   ```bash
   node skills/shaper-debug/scripts/debug.js link --actor 1
   ```

   始终在平台返回的链接中测试，本地页面或原始文件仅供辅助排障。平台链接无法访问时报告网络阻塞。

3. 在页面或开发助手中确认当前测试用户已登录，用真实指针或触摸操作核心流程，核对可见结果、报错和请求情况。登录成功不等于业务成功；工具无法完成的操作记录为待验证，不用脚本调用业务函数代替点击验收。多人游戏用两个独立测试用户验证入房、双方操作及状态同步。修复后重新上传，通过新平台链接重复失败操作及相邻流程。

4. `console.log/info/warn/error`、已完成请求的状态和 SDK 埋点记录在 Debug 页面自动通过 WebGuard 上报。网络记录只保存脱敏地址、方法、状态与耗时；不上传完整请求头和响应体。仅在排障需要精确关联某个操作时，可在业务代码中记录：

   ```js
   const traceId = window.__SHAPER_DEBUG_LOG__({
     type: 'customError', level: 'error', message: '创建房间失败',
     traceId: '本次操作唯一编号', detail: { roomId: '示例房间' }
   });
   ```

   调试关联字段由平台补充。凭证不写入日志。不用第二套采集服务，不把分析指标上报成功当作 CLS 已查询到。

5. 查询远程日志：

   ```bash
   node skills/shaper-debug/scripts/debug.js logs
   node skills/shaper-debug/scripts/debug.js logs --trace "本次操作唯一编号"
   node skills/shaper-debug/scripts/debug.js logs --project-id "预览所属项目 ID" --trace "本次操作唯一编号"
   node skills/shaper-debug/scripts/debug.js logs --follow
   ```

   默认按当前排查编号查最近 15 分钟，结果写入 `debug-logs.json`。浏览器打不开时将新授权链接交给开发者操作真机，然后执行相同查询。没有结果时检查时间、项目和上报记录；CLS 有索引延迟，不把空结果当作没有错误。单次最多 200 条、时间窗最多两小时，当前不支持游标翻页；达到上限时缩小时间窗查询。`sources[].status` 非 `ok` 或 `partial:true` 时明确报告查询限制。

浏览器云请求被 CORS 拒绝时，核对项目网关的 `EnableSafeDomain:true` 和安全域名白名单（包含页面的实际域名）。项目环境不匹配时先修正绑定或询问开发者，不冒用其他项目凭据。测试用户会进入项目真实 CloudBase 环境。

完成标准：目标操作在实际页面中成功，相关 SDK 身份与业务请求有真实结果，修复后重复验证原失败路径。远程日志排障或验证 CLS 链路时，至少一条带唯一 traceId 的日志在 CLS 查询结果中出现。报告分别列出接口、页面、多用户及日志查询的已通过／失败／待验证项；只打开浮窗、只出现昵称或只收到采集接口 200，都不等于整条链路通过。

`debug-context.json` 含一次性入口信息，`credentials.json` 含授权凭据，不提交、不公开。不要将二维码截图作为唯一证据；保留脱敏日志、时间、排查编号和真实接口结果。

## 已接入 Shaper MCP 的 Agent

优先使用 `shaper` MCP：`project_context` → `upload_prepare` → Bash curl 直传 HTML/ZIP → `upload_complete` → `preview_create` → `debug_create` → 浏览器 → `logs_query`。这些工具复用本文的调试授权和 CLS 链路。

`upload_prepare` 必填 filename、sha256、requestKey；重试同一文件沿用 requestKey，改代码换 key。上传地址只有十分钟有效。`debug_create` 默认不模拟登录，需要时显式 mockLogin=true；多个测试用户用 actors[{key,displayName}]。浏览器打开返回的完整 qrUrl，不提前兑换入口码。日志查询传返回的 debugRunId；没有数据或 partial=true 不能当作验收成功。MCP 不可用时才使用本文 HTTP/scripts 入口，并如实报告阻塞。
