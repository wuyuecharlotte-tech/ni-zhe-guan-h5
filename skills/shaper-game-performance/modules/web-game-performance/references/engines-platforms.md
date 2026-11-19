# 引擎与平台适配

先读取项目 manifest/lockfile、引擎版本、渲染器及构建配置。下列是排查映射，不保证所有版本存在同名 API；调用前以安装版本的类型声明、源码或官方文档确认。已有引擎统计优先，避免重复 monkey-patch 渲染底层。

## 1. 引擎映射

| 引擎 | 应首先检查 | 可选优化路径 | 生命周期与常见误区 |
|---|---|---|---|
| Phaser | scene/tween/timer/input、display/update list、WebGL batch、Arcade/Matter physics | atlas 与纹理状态、粒子上限、静态 Tilemap/camera cull、静态/动态 physics 分离 | scene shutdown/destroy 清理自己的订阅、timer 与异步任务；scene 停止不代表全局 TextureManager 资源自动释放；不要删除其他 scene 使用的 key |
| PixiJS | renderer 后端、batch、filters/masks、text/glyph atlas、ticker、场景树 | texture/source 复用、适合版本的 particle 容器、静态容器缓存、事件命中遍历控制 | v7/v8 的初始化、资源销毁和缓存 API 有差别；display object destroy 时核对 texture/source 是否共享；cache 每帧失效可能更慢 |
| Three.js | renderer.info、所有 render pass、program/geometry/texture 数、scene graph、matrix updates | InstancedMesh、空间分块、LOD、纹理压缩、阴影更新、后处理降采样 | geometry/material/texture/render target 各有生命周期；从 scene remove 不等于 dispose，material.dispose 不等于自动处理其 texture；多 pass 汇总时检查统计自动重置 |
| React Three Fiber | React commit、useFrame、对象创建、事件 raycast、全局状态订阅 | 高频值用 ref/引擎对象，减少逐帧 setState；按需渲染适合静态画面，动效及时 invalidate | 核实自动 dispose 与 primitive、缓存 loader、共享资源的语义；不能为实时动作场景强制 demand 而漏帧 |
| Babylon.js | Inspector/Instrumentation、active meshes、material/mesh/texture、shadow/postprocess | instances/thin instances、合适的 freeze world matrix/material/active meshes、硬件缩放、LOD | 静态冻结有明确解冻与更新条件；thin instance 的边界/剔除与交互要验证；dispose 的级联选项须核实共享资源 |
| Cocos Creator | profiler、UI batch、dynamic/static atlas、2D mask、3D pipeline、资源引用 | 按版本处理 UIBatcher、图集/材质兼容、静动 UI 分离、节点池与 bundle 分关 | addRef/decRef、assetManager、releaseAsset 等依版本核实；节点销毁不等于所有资源立刻释放；避免打断共享资源引用 |
| PlayCanvas | MiniStats/profiler、layer/camera、batch group、mesh instance、asset registry | 静态/动态 batch 选择、hardware instancing、LOD、纹理/阴影档位 | entity 生命周期与 asset unload 分开；batch group 不能无条件吞掉全场景剔除；按安装版本核实 |
| Unity WebGL | Development Build profiler 定位后用 release 复测；PlayerLoop、GC、渲染 CPU/提交、WASM heap、AssetBundle/Addressables；线程能力依实际构建确认 | IL2CPP/code stripping（保留反射需要的类型）、按关加载、压缩纹理、LOD/instancing、合理 shader variant 集、资源引用计数 | MonoBehaviour Destroy 不代表 Addressables 句柄全部释放；核实 Addressables.Release/ReleaseInstance、Bundle 卸载及共享依赖；线性内存容量不因 free 自动变小；原生平台经验不等同 Web |
| 自研 Canvas/WebGL/WebGPU | 唯一循环、GPU 资源账本、pipeline/shader、draw/pass/上传/读回 | 按本文矩阵逐项实验，离屏渲染/worker 有能力回退 | 显式管理 buffer/texture/target/source 和 device/context lost；不靠 JS GC 及时回收所有 GPU 资源 |

## 2. WebGL / WebGPU / Worker

### WebGL

- 用扩展/能力查询确认压缩纹理、timer query、最大纹理尺寸、instancing 与 VAO 等支持情况；这些查询在初始化阶段缓存，避免逐帧调用。
- WebGL1/WebGL2 在 NPOT texture、索引、MRT、float attachment、压缩格式等方面不同，依据实际 backend 验证回退。
- 使用兼容 framebuffer attachment，避免频繁重配；调试检查正确性，生产不用逐帧同步 getError/读回充当健康监控。
- 收到 `webglcontextlost` 后停止失效路径；按应用需要 `preventDefault()` 允许恢复，再用可靠的资源来源重建。不要把丢失都认定为 OOM。

### WebGPU

- 先检测 adapter/device、required features/limits 与浏览器支持；保留业务需要的 WebGL 或低档回退。
- 缓存 pipeline、bind group 与 layout；避免逐帧 createPipeline、createBuffer/Texture、大量绑定对象重建。
- 批量上传、复用 staging/uniform 空间，按对齐和使用范围管理；compute 适合大批数据，先算 CPU↔GPU 搬运和同步成本。
- timestamp query 是可选能力；readback 用异步完成与小数据量，不在每帧等待所有 GPU 工作完成。
- `device.lost` 需要重建 device 相关资源；WebGPU 不自动提高 FPS，不要求为了性能审计迁移后端。

### OffscreenCanvas / Worker / SharedArrayBuffer

- 先检查宿主、浏览器、引擎对 transferControlToOffscreen/Worker 渲染及输入/音频集成的支持；迁移时明确 canvas 所有权与 resize 协议。
- Transferable 转移后原 buffer 可能 detached；双缓冲/池协议要防止在途覆盖、过期结果和无界排队。
- SharedArrayBuffer 与 WASM 多线程在 Web 上通常需要满足安全上下文和 cross-origin isolation 等条件，可能影响第三方资源/嵌入；按目标引擎及浏览器核实。小游戏运行时单独检查，不照搬 HTTP header 方案。
- Worker 改善主线程响应不意味着总 CPU、内存、功耗下降；同脚本评估端到端延迟。

## 3. 微信小游戏边界

用户提供的微信文档是内存调优依据，不能据此把整套 skill 绑定微信。

- **工具与生命周期**：开发者工具用于定位，真机/云测/现网数据用于验收；DOM、Service Worker、浏览器 DevTools 和部分标准 Web API 在小游戏环境不可假定可用。使用项目实际可用的微信工具与引擎 adapter。
- **宿主开销**：微信官方内存综述描述 iOS 下小游戏与微信客户端同进程，系统 OOM 风险受总内存影响；文中设备分布和阈值图有时效性，不能推导通用 Web 页的安全上限。
- **告警**：确认当前基础库与运行环境提供 `wx.onMemoryWarning` 后注册，退出时按可用 API 解绑；清除可重建缓存、取消非关键预取、降低资源档。告警不保证在所有 OOM 前到达，主动预算仍是主线。
- **资源与启动**：代码包/资源包、分包、缓存/文件系统配额依据当前平台规则；首局关键路径优先，网络、解码、上传分开限制并发。
- **纹理与 GC**：使用官方适配支持的 GPU 压缩格式与回退；先减少垃圾和资源保留。微信 GC 文档说明，JS Canvas/Image 对象尚未回收时，对应客户端纹理存储也不会回收；这属于该宿主的说明，不能外推为所有浏览器的释放规则。确认当前平台支持后，可在局间比较 `wx.triggerGC()` 的停顿与峰值；该接口只加快触发 GC，**不保证立即回收**，也不替代解除引用和引擎资源释放。标准浏览器不能照搬此 API，战斗逐帧强制 GC 不作为默认方案。
- **线上闭环**：按版本、场景、设备档位看内存分布、时间趋势及异常退出；官方平台采样/上报频率可能更新，查询最新说明，不把当前文档频率固化成要求。

## 4. 不可用时的退路

无法测 GPU 时间 → 使用受控画质/分辨率实验 + 引擎计数器并标注间接判断。
无法测进程内存 → 交付资源规格账本、引用链及真机采样步骤，不宣称不存在 OOM 风险。
无 profiler → 先在少数关键阶段加有界 User Timing/引擎计时，再按采样热点深化；不能把每个函数都包日志。
