# 活动交付流程（通用核心 runbook）

本文件是**流程结构的唯一事实源**：机器解析 `[phase:名称]` 块（阶段顺序 = 文件顺序），
`state.py current` 每轮从这里读取当前阶段的指引。**阶段顺序、目标、产出、读范围、禁止、参考在此；硬门禁由 `domain/gates/` 机器检查。**

本层与云无关：阶段定义与沟通纪律在此；**具体实现（数据库/云函数/网关/部署步骤）
在活动技能里**（如 `act-cloudbase`，其 SKILL.md 与 references 承接）。文中「活动技能」=
当前工作区里实现本流程的交付技能（如 `skills/act-cloudbase/`）。

实现路线见 `references/implementation-route.md`：运行方式（static / activity-api / room）与持久化（none / postgresql）分别建模。Room 云运行不等于保存战绩；Room 分支优先于下文普通活动的 SQL/云函数步骤。用户已明确授权的同范围开发或部署复用既有授权证据，不重复询问；安全审查属于技术自检。

阶段顺序：`requirements → plan → implement → security-review → deploy → test → deliver → done`

每个阶段包含：

- **目标**：本阶段要达成的结果
- **产出**：必须落盘到 `activity/` 的产物（给人看）
- **产出文件**：本阶段产物清单（给人看；机器硬检查由对应手写 Gate 决定，见 domain/gates/）
- **禁止**：本阶段绝对不能做的事
- **参考**：需要读取的 `references/` 文档
- **输入**：本阶段允许读什么、禁止读什么（探索边界，避免读源码/无关文件）
- **为什么**（可选）：本阶段防什么失败，供 Agent 理解规则背后的意图
- **可选: 是** → 不在 advance 链上，仅 `state.py goto` 进入

---

[phase:requirements]
确认: 开发者确认
目标: 澄清开发者真实需求（先锚定目的地；先写草案再问，一轮问完整前沿 + 带推荐；新建场景必须先问雏形、禁止跳过直接生成预览（机器强制 kind=prototype 节点，已有 HTML 改造场景不问）；部署决策按技能包能力触发且时序靠后——技能包含云服务能力 → 需求轮只问雏形，存储方式确认（引导式：云端保存/本地保存，讲清区别 + 按业务推荐）留到静态预览获得开发者确认后的技术方案设计阶段；不含 → 预填本地存储、不提问但必须主动告知（需求单写「本地存储告知」，门禁强制）），产出 activity/requirements.md 并获得开发者确认
执行步骤: 静默探索（activity.json/credentials.json + query-cloudbase.js 只读查环境 + 检查技能包是否含云服务技能 skills/act-cloudbase + 检查工作区根目录是否已有 h5/index.html 判断新建/改造）→ 写草案 activity/requirements.md + decisions.json（模板见 requirements.md §需求单模板；新建 → 加 kind=prototype 节点待问；已有 HTML 改造 → 不加；无云服务技能 → 部署节点预填 choice=B + note 依据，并在需求单「部署决策」节写「本地存储告知」主动告知；含云服务技能 → 部署节点标 deferred、不进入前沿、本轮不问） | 第 1 轮只问业务拍板点（≤3 题；先 present --frontier，再按开发者回答 decide 逐项记录；prototype 节点自动排在其后） | 第 2 轮雏形引导（新建必做，机器强制）：发功能清单 + 只问「要不要先看个雏形模板」，present 后等开发者回复再 decide（A=要看/B=不用），开发者要看 → 直接收敛进 plan 出静态预览，不重复示意/追问，禁止夹带部署/存储问题 | 收敛：tree 前沿为空 → 写 confirmations/requirements.md（开发者原话）→ confirm requirements → advance | 存储方式确认在 plan 静态预览确认后执行（见 plan 阶段步骤） | 实时 Room 例外：先读 implementation-route.md；用户已明确授权联机云游戏时记录真实部署节点为 A 并引用原话，不再用“云端保存/本地保存”询问运行方式；是否保存战绩单独按业务需求确认
产出: activity/requirements.md（业务目标/用户能做什么/规则/数据需求/素材/部署决策/不做范围/静默假设清单）+ activity/decisions.json（决策树，state.py decide 维护）
产出文件: activity/requirements.md
禁止: 未确认不得 advance；未确认前不得执行物理建表/部署云函数；不得跳过需求直接开发；禁止甩空白表单向开发者填空；新建场景（工作区根目录无 h5/index.html）禁止跳过雏形引导直接收敛生成预览（kind=prototype 节点必须 present + decide 落定）；需求轮一次只问一类问题：技能包含云服务能力时，第 2 轮雏形引导禁止同时问数据存储/后台（部署节点必须标 deferred，确认留到 plan 预览确认后）；技能包不含云服务能力时禁止提问云服务，**但必须主动告知本地存储并写入需求单（门禁强制）**；禁止无依据代答（技能包不含云服务能力时的本地存储预填除外，必须写 note 依据）；禁止未确认（或无技能包事实依据）就按云服务实现；不得向开发者问技术方案或「用哪个能力」；部署目标属于静默发现（读 activity.json/credentials.json + 跑 query-cloudbase.js 只读查询），禁止作为提问项让开发者提供环境链接/ID，仅静默发现完全失败时才回退索取；部署=云端保存时禁止拖到 deploy 阶段才第一次确认部署目标；最终确认单/提问必须以业务话术直接开头，禁止自报内部进度（文件路径/决策树状态/机制命令/阶段名）
参考: references/requirements.md（操作速查/轮次制提问/预填分级/部署决策/决策树维护）、references/thinking.md（整体思考）；部署目标与环境的细节见活动技能（act-cloudbase）的 references/deploy.md §A；命令：state.py tree / state.py decide；实时 Room 读 references/implementation-route.md（覆盖普通活动的存储提问与实现路线）
输入: 只读: references/requirements.md（含操作速查）、references/thinking.md、activity.json 与 credentials.json（身份/部署凭据现状）、活动技能能力总览（如 skills/colorbox-skill/SKILL.md）；禁止读: 活动技能源码、examples/、state/*.json；禁止批量浏览 skills/ 下子技能文档（选型在 plan/implement 做，最多按需读 1-2 个）；机制不会用先看 requirements.md 操作速查，不要读实现
为什么: 真实意图不在第一句话里；未问即默认的假设必须显式呈现，否则交付的是「我们以为的」。存储方式决定要不要建后台、涉及资源与成本，必须由开发者知情确认；但确认要给到用户能判断的时候——先看雏形、确认页面没问题，再引导式问「云端保存还是本地保存」（讲清区别 + 按业务给推荐，禁止甩「要不要存」这种抽象问题）；没有云服务能力时必须主动告知只能本地存储，禁止静默
[/phase:requirements]

[phase:plan]
确认: 开发者确认
目标: 生成静态 H5 预览 + 业务确认（新建走完整预览；已有 HTML 走基线改造 + 改动对照），锁定 UI 与业务事实并获得开发者确认；（技能包含云服务能力时）预览确认后、进入技术方案设计前，引导式确认存储方式（云端保存/本地保存）
执行步骤: 读 plan-confirm.md 判定新建 vs 已有改造 | 新建→生成 h5/index.html（单一原生 HTML、数据写死、无网络依赖）；已有改造→改现有 index.html + 写 activity/plan/changes.md（位置/原样/新样） | 有可用浏览器时自行检查展示与基础交互；确认单放可点击文件链接供开发者预览（技术自检不替代业务确认） | 发业务确认单（非技术化；新建=功能清单+预览，已有=三问对照） | 收到开发者确认→写 confirmations/plan.md（原话）→ confirm plan | 技能包含云服务能力 → 单独引导式确认存储方式（讲清云端保存/本地保存的区别 + 按业务给推荐，先 present 部署节点，等开发者明确回复再 decide，A=云端保存/B=本地保存）→ advance 进 implement | 实时 Room 例外：先读 implementation-route.md；用户已明确授权联机云游戏时记录真实部署节点为 A 并引用原话，不再用“云端保存/本地保存”询问运行方式；是否保存战绩单独按业务需求确认
产出: 新建→h5/index.html（单一原生 HTML，数据写死，无网络依赖）；已有改造→改动版 index.html + activity/plan/changes.md（改动点清单：位置/原样/新样）；+ 开发者确认单（非技术化表达）
产出文件: h5/index.html（含内嵌技能使用数据块）
禁止: 未确认不得 advance；确认单禁止出现技术细节（表名/路由/puid/PostgreSQL 等）；禁止问技术方案或「用哪个能力」；已有改造不得从零重写（「重做」类须开发者确认后才行）；技能包含云服务能力时，禁止在业务确认单里夹带数据存储问题（先让开发者看预览，确认页面没问题后再单独问存储）；确认单规则段禁止把依赖存储/登录的规则写成既定事实（须标「待定：取决于存储方式」）；确认单/提问禁止预告后续流程（如「我会再单独确认一次」「不会在…一并问」）；禁止将浏览器自检当作开发者已确认业务计划
参考: references/business-rules.md（场景默认业务规则：输入接风控、分享提醒）、references/plan-confirm.md（确认单模板、已有改造三问对照、改动幅度与确认强度、用词指导）；实时 Room 读 references/implementation-route.md（覆盖普通活动的存储提问与实现路线）
输入: 只读: references/business-rules.md、references/plan-confirm.md、activity/requirements.md（可内部读活动技能的实现参考推导方案，不写进确认单）；禁止读: examples/、活动技能源码、state/*.json
为什么: 静态预览让开发者「看到」之后再做业务确认，避免确认了看不见的方案；已有改造要靠「改动对照」确认，只看新版会漏掉「动了我什么」；存储方式问题要等用户看完预览、确认页面没问题后再问（引导式，讲清云端/本地区别 + 给推荐，禁止问「要不要存」这种抽象问题），需求轮只问雏形
[/phase:plan]

[phase:implement]
目标: 按已授权部署模式和 implementation.json 路线实现真实能力；Room 实现实时服务，持久化按业务需要单独决定；静态页面无假后端
执行步骤: 先读 references/implementation-route.md，根据已确认需求用 state.py configure 记录 runtime/persistence（Room 同时设置本次 expectedVersion） | 部署未决先通过 tree 取得真实节点 ID 并记录授权；同范围已有授权直接引用原话，不重复提问 | activity-api → 原地改造迁移、云函数、网关；room → 读 shaper-multiplayer/SKILL.md 与 act-cloudbase/references/game-room-deploy.md，初始化或复用基础服务，实现 game/ 与 h5/；只有 persistence=postgresql 才要求迁移，只有附加活动 API 才要求 activity_api；static → 完成纯静态 H5 | 落地命中的业务默认规则 | node skills/runbook/scripts/scan-skill-usage.mjs 写入技能使用数据块 | 自检源码、协议、权限与前后端字段 → confirm implement → advance；不能用 goto 跳过失败门禁
产出: activity/implementation.json（路线与需求依据；Room 含本次 expectedVersion）+ h5/index.html；activity-api → 迁移与 activity_api；room → game/ 服务源码，持久化需要时加迁移、附加 API 需要时加 activity_api；static → 无假后端
产出文件: h5/index.html（含内嵌技能使用数据块）
禁止: 不向开发者问技术方案或「用哪个能力」；禁止另建第二套后端资源（demo 基线原地改造或显式清理）；禁止未确认先部署；需要模式严禁前端 localStorage/Mock 替代真实后端；不需要模式严禁写假接口/部署空壳；禁止伪造/漏报技能使用（h5/index.html 内嵌技能使用数据块必须与实际调用的 window.ColorboxAI API 一致，门禁按 JS Path 双向核对）；禁止重复写入技能使用数据块（多次扫描只原地更新同一 id 数据块）；静态结构自检与门禁是实现阶段的基础检查；已有浏览器且模拟登录授权可用时，自行复现已上传页面的登录、跨域或实时多人流程；无需登录的页面可直接验证，验收标准见 test 阶段；页面含用户文本输入必须接 R-01 内容安全检测（门禁强制拦截，见 references/business-rules.md）
参考: references/implementation-route.md（路线与命令）；Room 按需读 skills/shaper-multiplayer/SKILL.md、skills/act-cloudbase/references/game-room-deploy.md；活动 API 读 act-cloudbase 的 database.md/backend.md/frontend.md/deploy.md；references/skill-usage.md、references/business-rules.md
输入: 只读: 已确认需求、implementation-route.md、命中路线的技能及模板、技能使用与业务规则；禁止读: state/*.json（只经 state.py）
为什么: 云服务用不用是开发者的决策；一旦确认，真实打通或纯静态都要做到「没有假的东西」；用户输入的内容安全是安全红线（R-01），防止违规内容经 H5 上线/入库
[/phase:implement]

[phase:security-review]
确认: 自检确认
目标: 调用后台 ZIP 自动审核 API，提前执行正式上传时同一校验；API 结果是本阶段唯一放行依据
执行步骤: 运行 python3 skills/runbook/scripts/review-h5.py 打包当前 h5/ 并匿名调用 /api/v1/code-packages/validate（无需登录或 Token） | 原样保存 security-review.json、security-review-api.json 与本次 ZIP；核对源码指纹和后台 SHA-256 | blocked → 按 API findings reject --to implement 整改后重调；needs_review → 原样保留人工复核项，按后台 submissionAllowed 继续，不改成 passed；passed → 继续 | 接口不可达/超时 → 记录调用失败，修复后重试，不生成本地审查结论替代 API | 放行且证据有效 → confirm security-review → advance，继续已授权交付
产出: activity/security-review-source.zip + activity/security-review.json（后台 security_review_json_v1 原样结果）+ activity/security-review-api.json（API 版本、请求 ID、ZIP SHA-256 与源码指纹）；调用失败时 activity/security-review-api-error.json
产出文件: activity/security-review.json、activity/security-review-api.json
禁止: 禁止自行判定 WebSocket/Colyseus 不获准或改写后台 decision；禁止用本地 scanner/模型审查代替后台结果；接口失败不能写成 blocked/passed；禁止运行被审查代码；源码修改后必须重新调用；自动预检不替代正式上传校验与人工发布审核
参考: references/security-review/SKILL.md（后台 API 调用与结果处理）；scripts/review-h5.py（固定调用入口）
输入: 只读: 已确认需求、当前 h5/ 静态产物与后台 API 结果；不读取云端密钥，不运行页面代码
为什么: 预检与正式上传复用后台同一个 validateSourcePackage，避免技能副本与后台规则漂移；请求失败、自动阻断与人工复核分别处理
[/phase:security-review]

[phase:deploy]
确认: 开发者确认
目标: 按实现路线部署当前源码并验证本次版本生效；Room 基础服务 ready 与玩法上线分别验证
执行步骤: 核对既有部署授权与绑定目标；已有同范围授权写入 confirmations/deploy.md，不重复索要 | activity-api → act-cloudbase/references/deploy.md；room → game-room-deploy.md：官方 MCP 上传当前 game/ 更新同一服务，等待本次构建成功与流量切换，运行 status/reconcile 核对配置，再记录 room-build.json 并执行 record-room-deployment.py，核对线上 health.version 等于 expectedVersion；h5 单独发布 | static → 写 deploy-note.md | 部署自检与目标版本证据通过 → confirm deploy → advance
产出: activity-api → 真实后端与前端配置；room → activity/room-build.json、activity/room-deployment.json（绑定目标、构建/流量版本、源码指纹、线上 health），静态客户端单独发布；static → activity/deploy-note.md
产出文件: 
禁止: 部署目标未明确时禁止执行任何部署动作；先静默确认（credentials.json / query-cloudbase.js 只读 + create-cloudbase.js 开通），仅静默发现失败时才用业务语言索取「环境链接/环境 ID」，禁止猜测/批量选环境；禁止用默认身份（workspace）或未替换占位符开通云环境（脚本会直接报错，门禁同步拦截）；后台不可达（fetch failed）先自愈重试，禁止把后台未启动当作需要开发者提供环境的问题抛给开发者；部署 API 的具体约束见活动技能（act-cloudbase）的 references/deploy.md；不需要模式禁止部署空壳
参考: references/implementation-route.md；Room 读 act-cloudbase/references/game-room-deploy.md；活动 API 读 act-cloudbase/references/deploy.md §B
输入: 只读: 当前实现路线对应部署文档、绑定配置、当前源码和脱敏构建记录；禁止读: 与本阶段无关文档
为什么: 部署是真实变更，目标环境是开发者资产、必须由开发者明确，Agent 禁止自选环境；必须先验收兜底再交付；无需部署时也别留空壳
[/phase:deploy]

[phase:test]
目标: 接口与规则验收；涉及登录、跨域或实时多人时补充真实页面关键操作证据，产出与实际验证范围一致的测试报告
执行步骤: 按部署模式选测试路径：需要→接口冒烟（curl 校验 health/读写/限次，示例见 deploy.md §C）；不需要→静态页面自检清单 | 涉及登录、跨域或实时多人→先检查浏览器与平台模拟登录授权；条件就绪时 AI 在真实页面 origin、实际注入 SDK 与有效调试授权下自行点击关键操作；多人场景验证两名独立用户入房、准备与状态同步，记录页面错误及请求结果；浏览器或授权不可用时记录缺少条件、查询已有日志，必要时由开发者操作并提供诊断记录，无法取得证据则标为待验证 | 规则对齐：需求单每条规则逐项核对（功能/权限/性能），并纳入 references/business-rules.md 默认规则自检 | 写 activity/test-report.md 区分已通过、失败、待验证；有失败 → reject 回 implement 整改；关键路径均有通过证据后 confirm test → advance
产出: activity/test-report.md（功能/规则/权限/性能逐项核对，注明接口、静态与真实页面各自的验证范围；相关场景包含页面关键操作证据）
产出文件: activity/test-report.md
禁止: 将 curl、脚本或静态检查成功当作真实页面全链路通过；将未验证项标为已通过；关键路径仍失败或待验证时 confirm test / advance。不涉及登录、跨域或实时多人时保留原有接口或静态检查范围
参考: references/implementation-route.md；活动 API 读 act-cloudbase/references/deploy.md §C；Room 读 act-cloudbase/references/game-room-deploy.md 与 shaper-multiplayer/references/cloudbase-run.md；工作区含 shaper-debug 时用其授权入口与诊断日志
输入: 只读: 部署冒烟文档、命中场景的多人／调试技能、待验收 H5 与脱敏诊断记录；禁止读: 与本阶段无关的文档
为什么: 全绿才交付，失败回 implement，防止把未验证的东西交给开发者
[/phase:test]

[phase:deliver]
确认: 开发者确认
目标: 写 manifest、发审计通知（走 ai-game 服务推送钉钉）、发交付确认单（部署完成 + 真实线上地址 + 本地文件位置 + 询问预览二维码/打开本地文件夹）并获开发者确认
执行步骤: 写 activity/activity.manifest.json（metaActivityId/alias/envId/resources/publicBaseUrl/verification.ok） | 发审计通知（钉钉，脚本走 ai-game 服务推送，见 runbook/scripts/notify-dingtalk.mjs） | 发开发者交付确认单（模板见 references/deliver-confirm.md，含「可选下一步」先询问是否需要生成预览二维码）→ 收到开发者回复（确认 + 是否要二维码）→ 确认要二维码才按 preview-qr.md 跑 update-activity-html.js 生成 preview-qr.png + previewUrl → 写 confirmations/deliver.md（开发者原话）→ confirm deliver → advance
产出: activity/activity.manifest.json（status=verified）、钉钉通知已发、交付确认单已发；开发者确认要二维码后才有 preview-qr.png + previewUrl
产出文件: activity/activity.manifest.json
禁止: 交付单禁止把 localhost/本地端口/未发布地址当「在线预览（真实数据）」；未确认不得执行上线/二维码脚本（见活动技能 references/preview-qr.md）；通知失败不回滚已部署资源
参考: references/deliver-confirm.md（交付确认单模板）、活动技能（act-cloudbase）的 references/deploy.md §C（manifest 规范）、references/preview-qr.md（二维码）
输入: 只读: references/deliver-confirm.md、活动技能（act-cloudbase）的 references/deploy.md §C、references/preview-qr.md
[/phase:deliver]

[phase:done]
目标: 交付完成，通知开发者并结束
执行步骤: 向开发者发结果告知（一句话业务结果）；可选留档 activity/ 记录 | 流程结束，不再 advance
产出: 无（可选留档记录）
产出文件: 
禁止: 无
参考: 无
输入: 无
[/phase:done]
