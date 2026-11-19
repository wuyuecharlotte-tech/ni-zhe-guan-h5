---
name: seer-chat
description: 通过 seer.chat 发送流式对话，通过 seer.getHistory 恢复已有 sessionId 的会话；恢复时查询服务端详情和消息、按审核状态展示内容。App 与 Web 的 Relay 请求相同，都带 cookie，不传 puid、不写 identity，用户由 Relay 按 cookie 识别。区别只在调用前：App 须先确认已登录，Web 不在本地判断登录。activityId 由页面 __COLORBOX_AI_CONFIG__.projectId 自动解析。
---

# Usage

- JS Path: `window.ColorboxAI.seer.chat(content, templateId, puid, sessionId, params, onEvent)`

# Constraints

- 发送使用 window.ColorboxAI.seer.chat(content, templateId, "", sessionId, params, onEvent)，查询已有会话使用 window.ColorboxAI.seer.getHistory(sessionId)；两者均由本 skill 说明，历史查询不提供独立 skill。第三参必须传空字符串，禁止省略。禁止手写 fetch/EventSource 直连 Relay
- 【重新显示已有会话必做】页面刷新恢复、从历史列表打开或切换回某个 sessionId 时，必须在会话显示入口调用一次 window.ColorboxAI.seer.getHistory(sessionId)，等待查询成功后展示内容。只传已有会话 ID。此方法只查询详情和消息，不创建会话、不发送聊天；只恢复 sessionId、本地缓存或发送续聊不能代替这次查询
- getHistory 成功返回 Promise<{ code: 200, message, session, messages }>，失败返回非 200、session: null、messages: []；sessionId 必须使用 Relay 对外会话 ID，不是 data.id 或 seerSessionId。会话归属由 Relay 按 cookie 校验，不要传 puid，也不要在本地比对 identity。SDK 先获取 token，再 GET /relay/openapi/v1/chat/session/{sessionId}，再 GET /relay/openapi/v1/chat/session/{sessionId}/messages 查询内容与审核状态；会话详情接口本身不包含消息，不能只查详情就渲染历史
- 【历史展示以服务端审核结果为准】code===200 后用顶层 res.messages 按 messageId 重建当前会话列表，保留 requestId/role 对应用户和助手消息，正文使用 displayText。auditStatus=REJECTED 或 ERROR 的对应消息显示“消息内容异常”，PENDING 显示“审核中，请稍候”，PASS 展示正常内容；displayBlocked=true 时不得渲染 content、reasoningContent 或旧缓存中的真实内容。审核结果可能晚于 message.completed 到达，流已完成不代表最终审核通过
- 【调用时机与失败处理】每次重新显示已有会话查询一次即可；正常流式对话、每帧增量、每次渲染和定时器都不触发恢复查询，不为更新审核状态轮询。查询前清空或隐藏尚未确认审核状态的缓存内容；查询失败显示错误和手动重试入口，不回退展示缓存正文。切换会话时丢弃过期查询结果，仅展示当前 sessionId 的消息
- App 内必须已登录：调用前先用 window.ColorboxAI.auth.getUserInfo() 校验 data.islogin===1；未登录时引导登录，勿调用本能力。不要读取 puid。SDK 在 App 内也会校验，未登录返回 code=401
- Web 不在本地判断登录态，直接调用。接口返回 401 时引导登录。App 与 Web 的 Relay 请求相同，都使用 credentials=include，都不写 identity
- activityId 直接取自 window.__COLORBOX_AI_CONFIG__.projectId（仅 trim，不去非数字），禁止由调用方传入或手写
- 不要传 puid，也不要把它写入 session 或 SSE body。第三参固定传空字符串以占位。用户身份只由 cookie 交给 Relay
- chat 的 content/templateId 必须非空：sessionId 为空则新建会话，有 sessionId 则续聊（token → SSE）。恢复已有会话使用 getHistory(sessionId)。目前没有停止/取消会话的 API
- 第五参 params 仅为 extraMap：不需要时传 {}；需要时运营须在提示词列出全部 key 及每个 value 的获取方式；声明的 key 必须全传，无值则传空字符串 ""；禁止增减 key 或臆造值；不要用它传 identity/puid/title/requestId/onEvent 等
- 第六参 onEvent 可选但优先接入：用增量回调驱动流式对话 UI；未传时只能等流结束后在 Promise 的 data.text 取全文。收到 message.audit_failed 时 event.audit 存在、event.text 为空，必须隐藏已渲染内容并显示“消息内容异常”
- 流式 UI 体验（聊天页必做）：onEvent 只更新 targetText（最新 event.text），用 rAF/定时器把 shownText 逐字追赶后写到气泡；禁止在 onEvent 里把 event.text 一次性直接赋给气泡就当作打字机。建议约 25–40ms/字、每次 1–2 字；短回复整段展示动画不少于约 600–800ms。生成中显示光标与 streaming 状态，结束后移除；列表随 shownText 滚到底。await 后可用 res.data.text 兜底最终全文，但禁止只在 await 后才第一次写入助手内容。限速只做在 UI 层，不要拖延网络请求
- chat 返回 mode=sse 或 http；getHistory 返回顶层 session/messages，以 res.messages 展示，不读取 res.data.text
- 根据 code 判断成功与否：发送 code===200 时读 res.data.text 展示回复，并用 res.session.sessionId 续聊；code===422 表示审核失败，按 evt.audit 或 res.data.audit 的 failType 替换本轮对应消息：USER_INPUT_AUDIT 替换用户气泡并清空未生成的助手气泡；MODEL_OUTPUT_AUDIT 替换助手气泡。停止打字机并清空本轮推理，显示“消息内容异常”；code===401 引导登录；其它失败用 message 对用户友好提示

# Parameters

| 参数名 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| content | string | 是 | 本轮用户话术，trim 后不能为空，写入 SSE body.content；chat 只负责发送，查询已有会话使用 seer.getHistory(sessionId) |
| templateId | string | 是 | Seer 模板 ID（运营/后台配置），同一会话应保持一致，按运营提示词中的「指定 templateId=...」取值；getHistory 无需此参数 |
| puid | string | 否 | 保留的第三参位置。App 与 Web 都传空字符串，不要省略，否则 sessionId 及后续参数会前移。SDK 忽略该值，不写入 identity，也不要为此调用 auth.getUserInfo 取 puid。禁止手写假值、禁止塞进第五参 params |
| sessionId | string | 否 | 续聊的 Relay 会话 ID。不传则新建会话，res.session.sessionId 用于续聊；重新显示已有会话时先调用 seer.getHistory(sessionId) 恢复消息。chat 不会查询历史或更新历史审核状态。目前没有停止/取消会话的 API |
| params | object | 否 | 可选。即 Seer extraMap（object<string,string>），有则写入 SSE body.extraMap；不需要业务字段时传 {}。禁止塞 identity/puid/title/requestId/activityId/onEvent。若需要 params：运营须在提示词中列出全部 key 名称，并说明每个 key 的 value 获取方式；声明的 key 必须全部传入，即便暂无值也要传该 key 且 value 设为空字符串 ""；禁止增减 key、禁止臆造值。value 来源：（1）提示词写死；（2）页面配置或接口填充 |
| onEvent | object | 否 | 可选但优先接入。SSE 增量回调函数 (event) => void，位置第六参。每帧（message.delta / message.completed / message.audit_failed / relay.error）调用一次；event.text 为截至当前聚合全文，event.audit 表示审核失败，必须停止打字机并替换异常消息。短回复网络侧可能 <1s 结束，若 onEvent 里直接把 event.text 赋给 DOM，观感会像一次出全——聊天 UI 必须在展示层做平滑打字机（见 constraints/examples），不要只靠裸刷 DOM。成败仍以 Promise code 为准；未传时只能等结束后读 data.text |

# Returns

- Type: `Promise<Response>`

### Response Properties

| 属性名 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| code | number | 是 | 业务状态码。200 表示成功；401 表示未登录（App 本地校验，或 Web 由接口 cookie 校验失败）；403 表示无权访问该会话；422 表示审核失败，显示“消息内容异常”；其它非 200 表示失败（含 mode=http 前置失败与 SSE 内 relay.error） |
| message | string | 是 | 提示文案；失败时可用于 Toast/页面提示；401 时应引导用户登录 |
| mode | string | 是 | chat 结果通道。sse=流式发送（含流内错误）；http=前置失败。getHistory 不返回 mode |
| session | object | 是 | 会话信息；无论成败都会返回，便于续聊或排障 |
| session.sessionId | string | 是 | 当前会话 ID；成功后下一轮必须作为第四参传入 |
| session.activityId | string | 是 | SDK 从 __COLORBOX_AI_CONFIG__.projectId 读取的活动 ID（只读，勿回传为入参） |
| step | string | 否 | 仅 mode=http 时出现。失败步骤为 getToken、createSession 或 chatStream，便于定位前置哪一步挂了 |
| statusCode | number | 否 | 底层 HTTP 状态码（若有）；业务成败仍以 code 为准 |
| data | object | 否 | chat 发送成功时为 SSE 聚合结果；mode=http 失败时可能含 relay 原始错误字段；getHistory 的消息在顶层 messages 中 |
| data.text | string | 否 | 助手回复全文（由 SSE delta/completed 聚合）；成功展示用这个字段 |
| data.reasoningText | string | 否 | 可选。模型推理过程文本（若流里有） |
| data.audit | object | 否 | 审核失败时读取 res.data.audit；status 为 REJECTED 或 ERROR，failType 区分 USER_INPUT_AUDIT 与 MODEL_OUTPUT_AUDIT；此时 code 为 422 |
| data.completed | boolean | 否 | 流是否收到 completed 事件 |
| data.events | array | 否 | 原始 SSE 事件列表，调试用；业务页一般只用 text |

# Examples

```text
【使用说明】
调用 ColorboxAI.seer.chat（colorbox-seer-chat）时须遵守：
1. 发送必须设置 templateId：按运营提示词中的「指定 templateId=...」取值；恢复已有会话使用 seer.getHistory(sessionId)，无需 content/templateId
2. 若需要 params（extraMap）：运营提示词必须说明 params 的全部 key 名称，并说明每个 key 对应 value 的获取方式；声明的 key 必须全部传入，即便暂无值也要传该 key，value 设为空字符串 ""；禁止增减 key、禁止臆造值
3. 若不需要 params，传 {}
4. App 须先用 auth.getUserInfo 确认 data.islogin===1，未登录引导登录，不要取 puid。Web 不在本地判断登录。两端第三参都传空字符串
5. 优先接入第六参 onEvent；聊天 UI 须做展示层平滑打字机（targetText/shownText 追赶），勿在 onEvent 里一次性裸刷全文
6. 禁止在 params 中传入 identity、puid、title、requestId、activityId、onEvent
7. 重新显示已有 sessionId 的会话时，必须在显示入口实际调用 seer.getHistory(sessionId) 并以 res.messages 渲染；仅声明恢复函数未接入入口不算完成。显示一次查询一次，不轮询审核状态
```

```javascript
// 【API + 平滑打字机示例】templateId / params 按运营提示词填写；短回复也要有可见逐字过程
const user = await window.ColorboxAI.auth.getUserInfo();
if (user.code !== 200 || Number(user.data?.islogin) !== 1) {
  // App 引导登录。Web 不要写这段判断，直接调用 seer.chat
} else {
  const templateId = '按运营提示词指定的 templateId';
  const params = {};
  let targetText = '';
  let shownText = '';
  let timer = 0;
  let auditFailed = false;
  // 本轮消息容器在发送前已创建；引用保留在本次调用内，不选择其他轮的气泡。
  const turn = document.querySelector('.chat-turn[data-current="true"]');
  const userBubble = turn.querySelector('.user-bubble');
  const bubble = turn.querySelector('.assistant-bubble');
  const reasoning = turn.querySelector('.assistant-reasoning');
  let failedAudit;
  const showAuditFailure = (audit) => {
    failedAudit = audit || failedAudit;
    auditFailed = true;
    clearTimeout(timer);
    timer = 0;
    targetText = shownText = '';
    reasoning?.replaceChildren();
    if (failedAudit?.failType === 'USER_INPUT_AUDIT') {
      userBubble.textContent = '消息内容异常';
      bubble.replaceChildren();
    } else {
      bubble.textContent = '消息内容异常';
    }
  };
  const tick = () => {
    if (auditFailed) return;
    if (shownText.length < targetText.length) {
      shownText = targetText.slice(0, shownText.length + 1);
      bubble.textContent = shownText;
      timer = setTimeout(tick, 30);
      return;
    }
    timer = 0;
  };
  const res = await window.ColorboxAI.seer.chat(
    '你好',
    templateId,
    '',
    '',
    params,
    (evt) => {
      if (evt.audit) {
        showAuditFailure(evt.audit);
        return;
      }
      if (auditFailed) return;
      if (evt.text !== undefined) {
        targetText = evt.text;
        if (!timer) tick();
      }
    }
  );
  if (res.code === 422) {
    showAuditFailure(res.data?.audit);
  } else if (res.code === 200 && !auditFailed) {
    targetText = res.data?.text || targetText;
    if (!timer) tick();
    // 续聊用 res.session.sessionId
  }
}
```

```javascript
// 【会话显示入口】页面恢复/打开历史/切换会话时调用 showSession(sessionId)，每次显示只查询一次。
// 将这个函数接入页面初始化和历史列表点击入口，而不是只声明不调用。
const historyContainer = document.querySelector('.chat-history');
let historyLoadVersion = 0;
async function showSession(sessionId) {
  const version = ++historyLoadVersion;
  historyContainer.replaceChildren(); // 查询前隐藏旧缓存，避免审核失败内容闪现。
  historyContainer.textContent = '加载中';
  // App 才做这段登录判断。Web 跳过，直接 getHistory。
  const user = await window.ColorboxAI.auth.getUserInfo();
  if (version !== historyLoadVersion) return;
  if (user.code !== 200 || Number(user.data?.islogin) !== 1) {
    historyContainer.textContent = '请先登录';
    return;
  }
  const res = await window.ColorboxAI.seer.getHistory(sessionId);
  if (version !== historyLoadVersion) return; // 丢弃切换前的查询结果。
  if (res.code !== 200) {
    historyContainer.textContent = res.message || '会话加载失败，请手动重试';
    return; // 查询失败不回填本地缓存正文。
  }
  historyContainer.replaceChildren();
  for (const message of res.messages) {
    const bubble = document.createElement('div');
    bubble.dataset.messageId = message.messageId;
    bubble.dataset.requestId = message.requestId;
    bubble.dataset.role = message.role;
    bubble.textContent = message.displayText;
    historyContainer.appendChild(bubble);
    // displayBlocked=true 时不渲染正文或推理；REJECTED/ERROR 的 displayText 已是“消息内容异常”。
  }
}
// 恢复入口：sessionId 从当前页面保存的 Relay 会话标识读取，不读取缓存正文。
const savedSessionId = sessionStorage.getItem('seer-sessionId');
if (savedSessionId) await showSession(savedSessionId);
// 历史列表点击/切换回会话时同样 await showSession(selectedSessionId)，不设置轮询定时器。
```