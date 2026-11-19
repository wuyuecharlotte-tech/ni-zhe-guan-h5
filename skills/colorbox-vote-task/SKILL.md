---
name: vote-task
description: 通过任务 ID 直接参与投票活动任务；支持发帖、回帖、分享页面、浏览页面和评分，不用于独立抽奖活动任务。
metadata:
  required-skills:
    - request-activity-executeVoteTask
    - request-activity-reportVoteTask
    - request-activity-getVoteDetail
    - request-activity-submitVote
    - request-bbs-openPostEditor
    - request-bbs-replyPost
    - score-addScore
    - social-share
    - navigate-to
---

# 投票活动任务

投票活动直接使用活动侧配置的 `activityId`、`taskId` 和 `taskCode` 执行任务，不再调用任务查询能力。`taskId`、`taskCode` 及任务目标 `schema` 必须来自活动配置或业务数据，不能臆造或写死。发帖、回帖和评分所需的帖子 ID、正文、评分对象及分值也必须来自活动配置或用户明确输入。

## 直接执行

```js
const result = await window.ColorboxAI.request.activity.executeVoteTask({
  activityId,
  taskId,
  taskCode,
  schema,
  link: window.location.href
});
if (result.code !== 200) {
  console.warn(result.message);
}
```

直接执行时必须使用服务端或活动配置提供的任务字段；不要在前端自行增加票数、任务进度或奖励次数。

## 行为

- `SHARE_PAGE` / `share_activity`：必须由用户点击触发 `window.ColorboxAI.social.share`；只有返回 `data.platform === "app-bridge"` 才能调用活动任务上报并领取奖励。Web fallback、仅打开分享面板或取消分享都不能上报。
- `BROWSE_PAGE`：先完成任务上报，再使用 `window.ColorboxAI.navigate.to` 跳转 `schema`。
- `PUBLISH_THREAD`：使用 `window.ColorboxAI.request.bbs.openPostEditor` 唤起发帖编辑器并预填活动提供的标题、正文、专区或话题信息；编辑器成功唤起后调用 `window.ColorboxAI.request.activity.reportVoteTask({ taskId, taskCode })`。该能力不返回用户最终发布回执，不能把“编辑器已打开”表述为服务端已确认帖子发布。
- `REPLY`：使用 `window.ColorboxAI.request.bbs.replyPost({ tid, content })` 回帖；接口返回成功后调用 `window.ColorboxAI.request.activity.reportVoteTask({ taskId, taskCode })`，再提示任务完成。
- `CREATE_SCORE_ITEM` / `SCORE`：使用 `window.ColorboxAI.score.addScore({ outBizType, outBizNo, score })` 完成评分，分值必须在 1 到 10 之间；接口返回成功后调用 `window.ColorboxAI.request.activity.reportVoteTask({ taskId, taskCode })`，再提示任务完成。
- 未知 `taskCode`：只有在任务提供合法 `schema` 时，才能使用 `window.ColorboxAI.navigate.to` 跳转；不要臆造任务行为、任务奖励或完成状态。

任务执行只支持已登录的虎扑 App。所有行为必须由用户明确点击触发并在执行期间禁用重复提交。任务上报成功后调用 `window.ColorboxAI.request.activity.getVoteDetail({ activityId })` 刷新活动详情，从服务端读取最新的 `data.userRemainVoteNum`；不能在前端直接增加票数或可用次数。任务完成不等于候选项自动增加票数，投票必须另行调用 `window.ColorboxAI.request.activity.submitVote`。
