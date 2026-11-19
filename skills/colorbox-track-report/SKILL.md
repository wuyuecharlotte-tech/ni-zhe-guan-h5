---
name: track-report
description: 支持页面加载、点击、曝光等标准数据埋点上报，用于统计分析用户流量、模块点击和页面互动情况，方便了解页面表现与转化效果。
---

# Usage

- JS Path: `window.ColorboxAI.track(params)`

# Constraints

- 必须仅使用 window.ColorboxAI.track(params) 进行打点，严禁直接引入 @hupu/hp-tracer 或手动拼接 Hermes 接口 URL
- 页面加载事件 access 由底层框架自动触发上报，业务代码切勿重复调用
- 事件类型 act 必须且只能是：click (点击)、exposure (曝光)、videoact (视频) 之一；access、onload、onPageOpen、onPageClose 以及 submit、feed_xxx 等自定义 act 都不合法；不合法 act 会触发前端 SDK warning 与日志上报
- 点击与曝光必须双向成对：同一模块只要埋了点击，就必须同时埋对应曝光；只要埋了曝光，就必须同时埋对应点击，禁止只实现单边；曝光在模块实际可见时上报，点击在用户实际点击时上报，禁止在点击时补报虚假曝光
- 点击埋点应写在事件处理器(handler)的最前端，保障先上报再请求/跳转；曝光埋点使用 IntersectionObserver 监测，可见比例达到 50% 时才上报，同一个元素在单次会话中只上报一次，重复渲染不得重复绑定或重复曝光
- 埋点上报必须控制数量：页面初始化阶段最多上报 50 个埋点，单页面 1 分钟内最多上报 200 个埋点，同一个 blk 在 1 分钟内最多上报 100 个埋点；超过限制的埋点会被前端 SDK 丢弃，不要通过循环、定时器或重复曝光规避限制
- blk 固定为 BMC001，所有埋点点位统一使用该编号，禁止使用 BMC002 等其它编号或 VOTE_MODULE、HEADER_CLICK 等语义字符串
- pos 固定为 T1；label 必须放在 ext.label 中，且必填、必须使用中文，保持简洁，控制在 10 个中文字以内（含 10 个字），禁止省略、留空或使用英文代码标识；统一使用“业务场景-模块或入口”结构，以半角连字符 - 分隔，如“活动首页-报名入口”“任务中心-奖励领取”“排行榜-选手详情”，避免只写“点击”“按钮”“提交”等无法区分业务点位的通用文案；其它扩展业务属性写在 ext.custom（小写驼峰）
- 同一模块的曝光与点击埋点必须复用完全一致的 ext.label 字符串（包括空格和标点），不得分别添加“点击”“曝光”等前后缀，两者仅通过 act 区分；发现任一模块只有 click 或只有 exposure，或两者 ext.label 不完全一致时，必须补齐配对事件并统一 label 后再交付
- 不要手动传入 pg、pi、sc 等系统字段；ext 是埋点扩展字段容器，label 和业务扩展数据必须放在 ext 内，底座会自动完成其它系统字段的补充封装

# Parameters

| 参数名 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| params | object | 是 | 埋点上报参数，包含 act (事件类型), blk (固定为 BMC001), pos (固定为 T1), ext.label (必填中文点位名称，使用“业务场景-模块或入口”结构，10 个中文字以内，同一模块点击与曝光的值必须完全一致), ext.custom (自定义小写驼峰业务数据) |

# Returns

- Type: `Promise<Response>`

### Response Properties

| 属性名 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| ok | boolean | 否 | 是否成功唤起底层上报方法 |

# Examples

```javascript
// 页面需已有 id="activity-join-btn" 的参与按钮；在按钮渲染后绑定一次。
const joinButton = document.getElementById("activity-join-btn");
if (joinButton) {
  const point = {
    blk: "BMC001",
    pos: "T1",
    ext: {
      label: "活动首页-报名入口",
      custom: { activityId: 101, entryId: "mainVenue" }
    }
  };

  joinButton.addEventListener("click", () => {
    window.ColorboxAI.track({ ...point, act: "click" });
    // 在埋点之后执行实际参与操作或跳转。
  });

  let exposed = false;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!exposed && entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        exposed = true;
        window.ColorboxAI.track({ ...point, act: "exposure" });
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  observer.observe(joinButton);
}
```