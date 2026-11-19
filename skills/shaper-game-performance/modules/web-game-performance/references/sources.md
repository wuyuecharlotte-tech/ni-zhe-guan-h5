# 来源与适用边界

核对日期：2026-11-06。以下页面已阅读；动态链接的后续内容可能变化。本文是面向 Web 游戏的独立中文整理，按诊断任务重新组织，未打包原插件或复制其完整实现。矩阵中的扩展方案不表示每项都由某一来源原文提出，也不表示已在所有引擎版本上实测。

## 1. 用户指定参考

| 来源 | 采纳的方法 | 在本 skill 中的位置 | 适用边界 |
|---|---|---|---|
| [TapTap @ospec/log-viewer](https://maker.taptap.cn/skills/@ospec/log-viewer) | 日志、性能曲线、场景树和 UI 树联动；有界历史；检查诊断面板自身成本 | measurement：低开销观测；common：第三方与调试、场景图和 UI | 原 skill 含 Lua/特定运行时组件；只借鉴观测设计，不把它的接口、文件或安装流程当作标准 Web 能力。600 帧只在 60FPS 下约等于 10 秒；面板开销必须实测 |
| [微信小游戏：内存调优综述](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-memory-overview.html) | 开发工具、真机/云测、线上数据闭环；内存分布、趋势、异常退出；宿主与运行内存的稳定性影响 | memory-assets：分层、峰值、泄漏、降级；engines-platforms：微信边界 | 文中 iOS 同进程描述、设备分布和 OOM 图表有平台及时间范围；不转成浏览器通用内存上限，不把所有异常退出认定为 OOM。该页标示最后编辑时间为 2026-04-09 |
| [gamedev-skills：performance-optimization](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/tree/main/skills/disciplines/performance-optimization) 与 [profiling-and-budgets](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/main/skills/disciplines/performance-optimization/references/profiling-and-budgets.md) | 先 profile 再处理主要瓶颈；帧时间预算；CPU/GPU 分类；代表性最坏场景、目标硬件、发布构建复测；分配、池化、资源预算和温控 | SKILL 工作流；measurement 基线与实验；2D/3D 矩阵；reporting 验收 | 原参考覆盖 Godot/Unity/Unreal 等环境。保留方法，重新映射到 Web 后端与主流 Web 引擎；其中示例 draw/面数/资源预算不作为统一门槛 |
| [LobeHub：TimelessP/idlegames web-game-optimization](https://lobehub.com/skills/timelessp-idlegames-web-game-optimization) | 时间驱动动画、Canvas 状态分组、频繁实体复用、合成/采样音频选择、热点计算复用、跨设备与可访问交互 | common：C12/C13、G11（离线结算为独立扩展）、A03、M06、X01/X02；measurement：观测条目生命周期。已有图集/池化/空间索引/加载维度不重复新增 | 读取页面展示的 Skill Instructions（页面标示 1.0.1）。按 Web 游戏语义重写，不复制安装/市场注册命令，不打包示例代码 |

针对第三个来源，特别保留以下技术修正：降低 draw 可能改善 CPU 提交，也可能影响 GPU；不能由“CPU bound”推出“合批无用”，也不能由“draw 更少”推出“GPU 必然更快”。屏外销毁、池化、线程化都需要玩法语义、生命周期和实测条件。

针对 LobeHub 来源，采用主题并修正示例边界：音效不逐次新建 AudioContext；静态装饰动画与可暂停游戏时间分开；LUT 不是必然比 Math 函数快；空间网格要处理跨格边界、对象尺寸与动态更新；CSS 缩小图片不减少源纹理内存；classList/DocumentFragment 不保证固定重排次数；UA/DPR 不足以判定性能档位，deviceMemory 不能检测低电量模式；二进制编码不等于压缩，逐实体 stringify 比较 delta 本身可能成为热点。输入 passive 与节流须按手势语义判断，不能妨碍 preventDefault、笔划采样或高刷新输入；`role=application` 也不是所有游戏页面的默认配置。

## 2. 补充核对

| 来源 | 核对的内容 | 使用限制 |
|---|---|---|
| [微信小游戏：垃圾回收（GC）](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-memory-gc.html) | Canvas/Image 的 JS 对象与客户端纹理释放关系；`wx.triggerGC()` 只加快触发、不保证立即回收；局间调用建议 | 按微信运行环境/基础库能力核实；不代替解除引用/显式资源管理，不外推到浏览器。该页标示最后编辑时间为 2026-04-09 |
| [MDN：WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) | 显式删除不再需要的 GPU 对象；阻塞查询/读回；稳定 VAO/FBO；较小 backbuffer；压缩纹理与 mip；shader 编译；异步读回与附件生命周期 | 以实际 WebGL 版本、扩展和设备能力为准。API 层 delete/dispose 不保证驱动立刻降低进程内存；压缩格式必须做能力检测和资产画质验收 |
| [MDN：Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) | 音频加载方式、用户手势与 AudioContext 的创建/恢复、用户音量控制 | 自动播放策略按浏览器及宿主核实，不能以预加载成功推断允许自动发声 |
| [MDN：Navigator.deviceMemory](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory) | 数值是受隐私限制的近似设备内存，且并非所有浏览器支持 | 不代表可用内存、GPU 性能或低电量模式，不作唯一分档依据 |
| [MDN：Performance.clearMeasures](https://developer.mozilla.org/en-US/docs/Web/API/Performance/clearMeasures) | 按名称清理或全部移除 performance timeline 中的 measure | 本工具只清理自己拥有的命名条目；外部聚合缓冲也需要容量约束 |
| [MDN：prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) | 用户希望减少非必要动态效果的系统偏好 | CSS 媒体查询不会自动修改 Canvas/3D 游戏循环，须在效果配置中显式适配；不改变必要玩法信息 |

## 3. 本 skill 的 Web 游戏扩展

2D 部分补充 Sprite 断批、图集生命周期、Canvas 缓存与脏矩形、Tilemap 渲染/碰撞分块、骨骼、字形、滤镜、命中遍历和像素画。3D 部分补充空间剔除、LOD/HLOD、实例化与分区合并、蒙皮、材质变体、阴影、后处理、RT、动态上传、大世界和多视图。

通用部分补充帧循环、固定步长、物理、AI/寻路、群体、网络背压、音频、网页宿主、资源交接、异步取消、WASM 和移动温控。它们是可选诊断维度，不能无证据全部实施。

引擎映射是检索入口：Phaser、PixiJS、Three.js、React Three Fiber、Babylon.js、Cocos Creator、PlayCanvas、Unity WebGL 及自研渲染器。涉及具体 API、销毁级联、线程支持、构建标志时，读取项目安装版本的类型/源码与对应官方文档；这里不声称已逐版本验证全部接口。

WebGPU、Worker、微信与标准浏览器分别做能力检测。浏览器/宿主统计无法提供的数据标记“不可用”或“估算”；静态审计不能替代真机性能验证。
