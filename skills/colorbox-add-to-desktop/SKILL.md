---
name: addToDesktop
description: 在虎扑 App 内将当前游戏添加到桌面，创建桌面快捷方式。用户提到添加到桌面、加到桌面、桌面快捷方式、收藏到桌面或创建桌面入口时使用；仅在用户明确点击相关按钮后调用。游戏名称、Shell 链接、Icon 地址和是否全屏由 Shell 自动注入。
---

# Usage

- JS Path: `window.ColorboxAI.addToDesktop()`

# Constraints

- 必须使用 window.ColorboxAI.addToDesktop()，底层调用 hupu.common.shortcut.add，并传递由 Shell 自动生成的 name、originalUrl、iconUrl
- 只允许在用户明确点击添加到桌面后调用，禁止页面加载后自动触发
- SDK 在调用 Bridge 前自动上报点击埋点：act=click、pg=PHBS7947、blk=BMC001、eid=535、ext.label=添加到桌面。ext.pi、ext.pl、et 和 custom 由 Shell 按 onload 同一套规则补齐，页面不要再单独打这条点击
- SDK 会将客户端 hasShortcut 和 result 的 true/false、1/0、字符串 true/false 和 1/0 统一为布尔值，字符串忽略大小写与首尾空格。页面对归一化结果使用严格布尔判断，不使用 Boolean(value) 或直接按真值判断；未知值归一化为 undefined，不当成成功或未添加
- 仅安卓：SDK 先调用 hupu.common.shortcut.check，originalUrl 由 Shell 生成为 huputiyu://webview/openencodeurl?fullscreen=0或1&url=编码后的当前链接，当前链接带 entrance=fromdesktop，fullscreen 读取 window.__COLORBOX_FULLSCREEN__，缺省为 0。这条链接与添加使用的 originalUrl 相同。客户端返回 hasShortcut === true 时跳过添加，SDK 返回 data.alreadyAdded === true，页面提示已添加过，请勿重复添加；hasShortcut === false 时继续添加。检查结果无效时返回异常，不继续添加。页面无需自行调用检查 Bridge
- 客户端添加回调格式：成功为 { result: true }，安卓（data.platform === android）提示已添加，其他系统保持静默；失败为 { result: false, errorCode, errorMsg }，展示 errorMsg，缺失或为空时使用添加到桌面失败，请稍后重试。读取 SDK 返回的 data.bridgeResult，使用 result === false 判断客户端异常，不要仅凭外层 code === 200 判断客户端成功。SDK 调用异常时展示 message；添加回调为空时保持静默，不代表失败或已创建快捷方式
- 仅安卓添加和检查时，Shell 生成的 originalUrl 都使用 huputiyu://webview/openencodeurl 开头，fullscreen 读取 window.__COLORBOX_FULLSCREEN__，缺省为 0；编码后的页面地址带 entrance=fromdesktop，不走 shortcut=prepare，从桌面打开时由虎扑 App 打开游戏页。iOS 添加仍只追加 shortcut=prepare，通用 bridge 不修改传入链接；Safari 首次打开 shortcut=prepare 时不加载游戏，展示添加到主屏幕引导页，并把地址栏更新为 entrance=fromdesktop，用户添加到主屏幕后再次打开才进入简单页面，并按 Shell 的 window.__COLORBOX_FULLSCREEN__ 拼接 huputiyu://webview/openencodeurl 跳转虎扑 App
- 非 App / 无 Bridge 环境可能不会真正添加到桌面，业务代码需做好 Web 预览环境下的降级表现

# Parameters

| 参数名 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |

# Returns

- Type: `Promise<Response>`

### Response Properties

| 属性名 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| code | number | 是 | 状态码，200 表示正常返回，不代表快捷方式已创建；安卓可能因已添加而跳过添加调用 |
| message | string | 是 | 调用结果信息，正常时不展示，仅异常时用于错误提示 |
| data | object | 否 | Bridge 调用信息 |
| data.channel | string | 否 | 实际调用通道，固定为 bridge |
| data.method | string | 否 | 底层 Native Bridge 方法名，添加时为 hupu.common.shortcut.add，安卓已添加时为 hupu.common.shortcut.check |
| data.platform | string | 否 | android 表示安卓，other 表示其他系统；安卓才展示已添加过，请勿重复添加或已添加提示 |
| data.alreadyAdded | boolean | 否 | 安卓检查到已有快捷方式时为 true，此时未调用添加 Bridge |
| data.bridgeResult | object | 否 | 客户端回调结果；安卓已添加时为检查结果，否则为添加结果。添加 result 为 true 时安卓提示已添加，其他系统静默；为 false 时展示 errorMsg；为空时静默 |
| data.bridgeResult.hasShortcut | boolean | 否 | 安卓检查结果，true 表示已有桌面快捷方式 |
| data.bridgeResult.result | boolean | 否 | 客户端操作结果，true 表示成功，false 表示失败 |
| data.bridgeResult.errorCode | number | 否 | 失败时返回的客户端错误码 |
| data.bridgeResult.errorMsg | string | 否 | 失败时展示的客户端错误信息，可能为空，需提供默认错误提示 |

# Examples

```javascript
window.ColorboxAI.addToDesktop().then(res => { if (res.code !== 200) { alert(res.message || "添加到桌面失败，请稍后重试"); return; } const data = res.data; if (data?.platform === "android" && data.alreadyAdded === true) { alert("已添加过，请勿重复添加"); return; } const callback = data?.bridgeResult; if (callback?.result === false) { alert(callback.errorMsg || "添加到桌面失败，请稍后重试"); } else if (data?.platform === "android" && callback?.result === true) { alert("已添加"); } }).catch(() => { alert("添加到桌面失败，请稍后重试"); })
```