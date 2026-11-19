---
name: game-auth
description: 使用当前登录态获取目标应用的短期游戏令牌。默认使用当前页面所属应用，也可显式传入其他 appId。游戏地址由游戏自身配置。
---

# Usage

- JS Path: `window.ColorboxAI.game.auth(params)`

# Constraints

- 页面通过 window.ColorboxAI.game.auth 获取连接凭证；无需接触签发地址、CloudBase 环境或验签密钥
- appId 指向目标游戏所属应用，格式为 app_xxxxx；不能从 CloudBase envId 推导
- 令牌交给 Colyseus 客户端的 client.auth.token，不放入 URL、消息或 join options
- 每次准备入房时获取新凭证；重连使用 Colyseus reconnectionToken
- 必须根据返回的 code 判断是否成功，若 code 不等于 200，必须使用返回的 message 对用户进行友好提示（如 Toast 或弹窗）。

# Parameters

| 参数名 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| appId | string | 否 | 目标游戏所属应用 ID；省略时使用当前页面的 appId |

# Returns

- Type: `Promise<Response>`

### Response Properties

| 属性名 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| code | number | 是 | 状态码，成功为 200 |
| message | string | 是 | 提示信息 |
| data | object | 否 |  |
| data.token | string | 否 | 短期 Game Token |
| data.expiresAt | number | 否 | 令牌过期时间，毫秒时间戳 |

# Examples

```javascript
const res = await window.ColorboxAI.game.auth(); if (res.code === 200) console.log(res.data.token);
```

```javascript
const res = await window.ColorboxAI.game.auth({ appId: "app_1234567890" });
```