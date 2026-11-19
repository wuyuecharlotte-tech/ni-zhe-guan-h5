---
name: request-activity-executeVoteTask
description: 执行投票活动任务，支持分享页面、发帖、回帖、浏览页面、创建评分及通用 schema 跳转；任务奖励由服务端确认。
---

# Usage

- JS Path: `window.ColorboxAI.request.activity.executeVoteTask(params)`

# Constraints

- 必须由用户点击等明确交互触发，执行期间禁用按钮，禁止自动重试或轮询
- 只允许在已登录的虎扑 App 内执行；任务 ID、任务编码和 schema 必须来自活动配置或业务数据
- SHARE_PAGE/share_activity 只有原生分享返回 data.platform === "app-bridge" 后才上报完成；Web fallback、取消分享和仅打开面板不能领取奖励
- PUBLISH_THREAD 在发帖编辑器成功唤起后上报；编辑器不返回用户最终发布回执。REPLY 在回帖接口成功后上报
- BROWSE_PAGE 先上报任务再跳转；CREATE_SCORE_ITEM 需要 App 版本 >= 8.0.79，CREATE_MOMENT 需要 App 版本 >= 8.0.78
- 任务执行成功不等于投票候选项得票数增加；如需确认结果，应由业务页面刷新活动数据，不得本地伪造票数或次数
- 请求接口数据必须使用 window.ColorboxAI.request 能力及其子能力发起，禁止使用 fetch、axios、XMLHttpRequest、第三方请求库或其它自定义请求方式。
- 数据能力调用必须避免无条件循环、无限轮询和重复渲染触发；同一参数的返回结果应优先保存在组件状态中复用。
- 列表/分页类接口连续自动翻页最多 5 页，必须在无下一页、返回空列表或达到页数上限时停止。
- SDK 前端已启用请求保护：默认不限制单能力并发和分钟调用量，不启用相同请求在途合并或 GET 短缓存；同 URL 在 10000ms 内最多 20 次；同一页面同接口（去掉 query/hash 参数后相同即为同一接口）在 5000ms 内最多 20 次，首次超过限制返回 429，后续同窗口请求静默丢弃，且同一窗口内只上报一次异常日志。不要自行循环重试或重复触发请求，若接口真实返回 408、429 或 503 等错误码，必须停止继续请求并给用户友好提示。

# Parameters

| 参数名 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| activityId | number | 是 | 投票活动唯一 ID，例如 123 |
| taskId | string | 是 | 活动配置提供的任务 ID |
| taskCode | string | 是 | 活动配置提供的任务行为编码，如 SHARE_PAGE、PUBLISH_THREAD、REPLY、BROWSE_PAGE |
| status | number | 否 | 任务状态；1 表示已完成，已完成任务不可重复执行 |
| schema | string | 否 | 任务目标 schema，来自任务数据；通用跳转任务必填 |
| title | string | 否 | 分享标题，分享任务可选 |
| text | string | 否 | 分享描述，分享任务可选 |
| imageUrl | string | 否 | 分享图片 HTTPS 地址，分享任务可选 |
| link | string | 否 | 分享链接，分享任务可选；默认当前活动页面 URL |
| topicId | string | 否 | PUBLISH_THREAD 发帖目标专区 ID，可选 |
| tagId | string | 否 | PUBLISH_THREAD 发帖目标话题 ID，可选 |
| topicName | string | 否 | PUBLISH_THREAD 发帖目标专区名称，可选 |
| tagName | string | 否 | PUBLISH_THREAD 发帖目标话题名称，可选 |
| content | string / array | 否 | PUBLISH_THREAD 的帖子正文，或 REPLY 的回帖内容 |
| tid | string | 否 | REPLY 目标帖子 ID |

# Returns

- Type: `Promise<Response>`

### Response Properties

| 属性名 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| code | number | 是 | 状态码。200 表示成功，401 表示未登录，404 表示内容不存在，500 表示服务器错误 |
| message | string | 是 | 错误提示信息。当 code 不等于 200 时必须用于向用户友好提示 |
| data | object | 否 | 成功时返回的数据载荷 |
| data.completed | boolean | 否 | 任务是否完成或已被服务端确认 |
| data.behavior | string | 否 | 实际执行的任务行为编码 |
| data.reported | boolean | 否 | 是否已向活动服务端上报任务完成 |
| data.reason | string | 否 | 失败原因编码，可能为 APP_REQUIRED、UPGRADE_REQUIRED 或 SHARE_NOT_CONFIRMED |

# Examples

```javascript
window.ColorboxAI.request.activity.executeVoteTask({ activityId: 123, taskId, taskCode, schema, title: "活动开始啦", link: window.location.href }).then(res => { if (res.code !== 200) console.warn(res.message); })
```

# Frontend Request Guard

| 策略 | 默认值 |
| --- | --- |
| 同请求在途合并窗口 | 不启用（0ms） |
| GET 缓存 TTL | 不启用（0ms） |
| 请求超时 | 8000ms |
| 单能力最大并发 | 不限制 |
| 单能力分钟调用上限 | 不限制 |
| 同 URL 窗口调用上限 | 20 次 / 10000ms（超过限制排队等待） |
| 同页面同接口窗口调用上限（去掉 query/hash 参数） | 20 次 / 5000ms（首次超过限制返回 429，后续同窗口请求静默丢弃，异常日志只上报一次） |
| 连续失败熔断 | 3 次失败后熔断 30000ms |
| 自动分页建议上限 | 5 页 |