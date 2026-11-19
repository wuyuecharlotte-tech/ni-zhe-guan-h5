---
name: request-activity-getVoteTaskList
description: 根据活动 ID 调用 /bbsactivityapi/activity/vote/task/progress 获取投票活动任务。服务端成功响应的 data 包含 puid、date 和 taskProgressList；taskProgressList 返回每个任务的 taskId、taskCategory、status、taskName、taskCode、schema、cycle、taskAward、maxCompleteNum 和 currCompleteNum。SDK 外层统一返回 code=200/message，并保留 activityId/tasks 兼容字段。
---

# Usage

- JS Path: `window.ColorboxAI.request.activity.getVoteTaskList(params)`

# Constraints

- 必须使用活动 ID 查询任务，不能传 sessionId 或客户端用户身份字段
- 返回任务字段来自服务端，taskId、taskCode、status 和 schema 只能展示或传给后续能力使用，不能自行臆造
- 只在页面初始化、用户完成任务返回页面或用户主动刷新时调用，禁止无限轮询和自动重试
- 请求接口数据必须使用 window.ColorboxAI.request 能力及其子能力发起，禁止使用 fetch、axios、XMLHttpRequest、第三方请求库或其它自定义请求方式。
- 数据能力调用必须避免无条件循环、无限轮询和重复渲染触发；同一参数的返回结果应优先保存在组件状态中复用。
- 列表/分页类接口连续自动翻页最多 5 页，必须在无下一页、返回空列表或达到页数上限时停止。
- SDK 前端已启用请求保护：默认不限制单能力并发和分钟调用量，不启用相同请求在途合并或 GET 短缓存；同 URL 在 10000ms 内最多 20 次；同一页面同接口（去掉 query/hash 参数后相同即为同一接口）在 5000ms 内最多 20 次，首次超过限制返回 429，后续同窗口请求静默丢弃，且同一窗口内只上报一次异常日志。不要自行循环重试或重复触发请求，若接口真实返回 408、429 或 503 等错误码，必须停止继续请求并给用户友好提示。
- 必须根据返回的 code 判断是否成功，若 code 不等于 200，必须使用返回的 message 对用户进行友好提示（如 Toast 或弹窗）。

# Parameters

| 参数名 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| activityId | number | 是 | 投票活动唯一 ID，例如 123 |

# Returns

- Type: `Promise<Response>`

### Response Properties

| 属性名 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| code | number | 是 | 状态码。200 表示成功，401 表示未登录，404 表示内容不存在，500 表示服务器错误 |
| message | string | 是 | 错误提示信息。当 code 不等于 200 时必须用于向用户友好提示 |
| data | object | 否 | 成功时返回的数据载荷 |
| data.activityId | number | 否 | 投票活动 ID |
| data.puid | number / string / null | 否 | 服务端返回的用户 PUID，未绑定用户时为 null |
| data.date | string | 否 | 任务进度日期，如 20260921 |
| data.taskProgressList | array | 否 | 服务端 data.taskProgressList 活动任务列表 |
| data.taskProgressList[].id | string | 否 | SDK 兼容字段，值与 taskId 对应 |
| data.taskProgressList[].taskId | string | 否 | 任务 ID |
| data.taskProgressList[].taskCode | string | 否 | 任务行为编码，如 BROWSE_PAGE、SHARE_PAGE |
| data.taskProgressList[].taskCategory | string | 否 | 任务分类 |
| data.taskProgressList[].status | number | 否 | 任务状态，服务端原值；通常 0 表示未完成 |
| data.taskProgressList[].taskName | string | 否 | 任务名称 |
| data.taskProgressList[].schema | string | 否 | 任务目标 schema，没有跳转目标时为空字符串；服务端可能返回 URL 编码值 |
| data.taskProgressList[].cycle | number | 否 | 任务周期 |
| data.taskProgressList[].taskAward | number | 否 | 任务奖励分值 |
| data.taskProgressList[].score | number | 否 | SDK 兼容字段，值取 taskAward |
| data.taskProgressList[].maxCompleteNum | number | 否 | 新版任务目标次数 |
| data.taskProgressList[].currCompleteNum | number | 否 | 当前已完成次数 |
| data.tasks | array | 否 | taskProgressList 的兼容别名 |
| data.tasks[].id | string | 否 | SDK 兼容字段，值与 taskId 对应 |
| data.tasks[].taskId | string | 否 | 任务 ID |
| data.tasks[].taskCode | string | 否 | 任务行为编码，如 BROWSE_PAGE、SHARE_PAGE |
| data.tasks[].taskCategory | string | 否 | 任务分类 |
| data.tasks[].status | number | 否 | 任务状态，服务端原值；通常 0 表示未完成 |
| data.tasks[].taskName | string | 否 | 任务名称 |
| data.tasks[].schema | string | 否 | 任务目标 schema，没有跳转目标时为空字符串；服务端可能返回 URL 编码值 |
| data.tasks[].cycle | number | 否 | 任务周期 |
| data.tasks[].taskAward | number | 否 | 任务奖励分值 |
| data.tasks[].score | number | 否 | SDK 兼容字段，值取 taskAward |
| data.tasks[].maxCompleteNum | number | 否 | 新版任务目标次数 |
| data.tasks[].currCompleteNum | number | 否 | 当前已完成次数 |

# Examples

```javascript
window.ColorboxAI.request.activity.getVoteTaskList({ activityId: 123 }).then(res => { if (res.code === 200) console.log(res.data.taskProgressList); })
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