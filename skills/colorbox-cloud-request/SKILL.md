---
name: cloud-request
description: 使用 ColorboxAI 调用旧版 CloudBase 活动接口。
---

# CloudBase 活动请求

本技能用于下载技能包的旧项目，保留原有 SDK 和环境绑定，不迁移到 Shaper CLI/MCP。

- 使用 `window.ColorboxAI.cloud.request`，不要求旧 SDK 提供 `ShaperAI`。
- `url` 填写已绑定环境的完整接口地址；方法支持 GET、POST，默认 GET。
- 需要登录的接口传 `auth: true` 和原 `envId`，由 SDK 完成登录和 Bearer 管理。
- 只使用 `url`、`method`、`headers`、`data`、`envId`、`auth`；不传新版 `path` 参数。
- 不在请求体中自报 puid，不手写 Token，不切换或重建已有云环境。
- 开通、部署仍遵循 act-cloudbase 的用户确认要求。

```js
await window.ColorboxAI.cloud.request({
  url: window.ACTIVITY_API_BASE + '/progress',
  method: 'POST',
  data: { score: 100 },
  envId: window.ACTIVITY_ENV_ID,
  auth: true
});
```

返回 `{ statusCode, code, message, data }`。先检查返回状态，再使用业务数据。
