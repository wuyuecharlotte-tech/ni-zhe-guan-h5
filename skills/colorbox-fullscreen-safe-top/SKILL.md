---
name: fullscreen-safe-top
description: 获取全屏活动 H5 的顶部安全距离，用于自定义头部、顶部固定按钮和页面内容避让状态栏或刘海。
---

# Usage

- JS Path: `window.ColorboxAI.getFullscreenSafeTop()`

# Constraints

- 同步调用 window.ColorboxAI.getFullscreenSafeTop()，无需参数，直接返回数字，单位为 CSS px，可直接用于 height、padding-top 或 top。
- 游戏启动时按固定全屏页面使用；仅在宿主未预留顶部空间时应用，同一内容只避让一次。
- 返回值可直接使用，无需自行计算或换算单位；无法获取安全距离时返回 0。
- 在 SDK 就绪后调用；游戏启动时读取一次即可，不要高频轮询。

# Parameters

| 参数名 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |

# Returns

- Type: `number`

顶部安全距离，单位 CSS px，非负数；无法获取时返回 0。

# Examples

```javascript
const height = window.ColorboxAI.getFullscreenSafeTop();
document.querySelector(".header").style.height = `${height}px`;
```