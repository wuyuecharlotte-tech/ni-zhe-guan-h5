# 3D 游戏专项

统计整个帧的所有 pass；主相机 draw 少不代表阴影、深度、反射和后处理便宜。先确认 CPU submission、vertex、fragment、带宽与同步中的主要瓶颈。

| ID / 细分维度 | 诊断信号 | 最佳实践 | 具体优化方案 | 验证与取舍 |
|---|---|---|---|---|
| T01 视锥与边界 | 镜头外物体仍提交 | 剔除粒度与提交成本平衡 | 正确 bounding volume，按空间块组织；动态变形/instance 更新边界 | 相机路径、draw/CPU；错误边界会闪现/消失 |
| T02 遮挡剔除 | 室内墙后大量 draw | 遮挡策略适合场景 | 房间/portal、离线可见集或受支持异步 occlusion；避免同步等待查询 | 室内外、移动镜头；查询/延迟成本不能高于节省 |
| T03 LOD/HLOD | 远处仍高顶点/细节 | 按投影尺寸和距离分级 | mesh LOD、材质/阴影 LOD，静态远景 HLOD/impostor，迟滞切换 | 顶点/GPU/跳变；HLOD 占额外内存，保留近处剔除 |
| T04 Instancing | 重复 mesh/material 导致提交多 | 重复对象共享几何/状态 | 分空间单元 instanced draw，instance 属性承载差异，增量更新 transform buffer | CPU、上传、剔除；巨大 instance batch 可放大不可见工作 |
| T05 静态合并 | render-submit 高 | 仅合并状态兼容且一起可见对象 | 按区域和材质合并静态几何，保留 chunk；避免全地图单 mesh | draw 降幅与可见三角形；大合并可能增加显存和遮挡工作 |
| T06 模型拓扑 | vertex/带宽高 | 运行时模型匹配屏幕贡献 | 减面、移除不可见面、索引复用、顶点缓存/overdraw 重排、焊接兼容顶点 | 轮廓、法线、动画、GPU；UV/硬边不可盲目焊接 |
| T07 顶点属性/索引 | 模型 buffer 与上传大 | 只保留 shader 真用属性 | 量化 position/normal/UV、移除冗余属性，选合适索引类型与布局 | 解码 shader 代价、精度；对齐和后端限制先检查 |
| T08 蒙皮与 morph | skinned mesh/权重/骨骼热 | 按角色档位限制复杂度 | 少骨骼/权重、动画采样 LOD、停无用 morph；群体评估 baked/VAT | pose/事件、GPU/纹理内存；不能破坏受击/root motion |
| T09 材质与 shader 变体 | program/pipeline 多、编译尖峰 | 控制 keyword/define 组合 | 复用兼容材质、固定渲染路径；关键变体分批预热，参数变化优先 uniform | 首见卡顿/编译数；预热占启动时间和内存 |
| T10 fragment shader | 降分辨率显著改善 | 按材质贡献分层 | 减昂贵采样/循环，合理精度、normal/PBR 简化档；静态与动态分支基于真机测试 | GPU 与材质外观；低精度可能产生 banding/闪烁 |
| T11 纹理采样/带宽 | 高分辨贴图、采样多 | texel 密度与格式分级 | 压缩纹理、mipmap、贴图尺寸/各向异性分档、合理通道打包 | 远处闪烁/带宽/显存；压缩/打包需遵守颜色空间 |
| T12 灯光数量与范围 | 每增加灯光 GPU 明显上升 | 有限实时灯光与影响范围 | 静态烘焙 lightmap/probe，局部影响 mask；forward/clustered/deferred 依场景选 | 光照质量和全场景 GPU；换渲染器本身可能昂贵 |
| T13 阴影地图 | shadow pass 占多数 | caster/receiver 与范围有限 | 缩小相机范围、分辨率/cascade 数分档，静态阴影按需刷新；远处关投影 | 阴影 ms、RT 内存、acne/peter-panning；不能只看主 pass |
| T14 透明与排序 | 玻璃/烟雾 GPU 高 | 少透明层、面积可控 | 不透明优先；排序保证正确，效果允许时 alpha-test/dither 替代并实测 | GPU/视觉噪点；discard 不保证总更快，排序受渲染器约束 |
| T15 深度与 overdraw | 遮挡物后像素仍昂贵 | 利用深度与合理绘制顺序 | 不透明物体适度 front-to-back；仅在像素成本足够高时评估 depth prepass | GPU，总 draw/vertex；移动 tile GPU 上多 pass 可能更慢 |
| T16 后处理 | bloom/SSAO/DOF/SSR pass 多 | 每个效果有明确像素预算 | bloom 降采样、缩 radius/迭代，去冗余 blit，兼容时融合 pass，低档禁重效果 | 分 pass GPU/带宽/RT、画质；融合会增加 shader 复杂度 |
| T17 AA 与 HDR | RT 内存/带宽高 | 按后端和画质选择 | MSAA sample 分档，HDR 仅必要附件；比较 FXAA/TAA 等方案 | 锯齿、拖影、带宽；HDR 影响颜色流程，非只改 format |
| T18 RT 与 framebuffer | resize/镜面时峰值大 | 少附件、少尺寸变动 | 固定配置复用 RT，按生命周期复用不重叠目标；删未用 depth/stencil，后端允许时标记无需保留附件 | pass 正确、RT 峰值；禁止读写同一纹理造成 feedback |
| T19 反射与额外相机 | cube/reflection 重复整场景 | 刷新频率/范围独立预算 | 预烘焙环境、probe、局部低分辨率反射，降低更新频率及可见层 | 总 pass/GPU、反射时效；cubemap 六面不能只算一张 |
| T20 几何/纹理动态上传 | 每帧 bufferData/texImage 尖峰 | 静态一次上传、动态局部 | dirty range/subdata，稳定 buffer 容量、分帧上传；避免 CPU/GPU 使用冲突 | 上传字节、CPU/GPU 同步；频繁重分配可能拖慢 |
| T21 射线/BVH | 鼠标移动时遍历全部三角形 | 先 broad phase 再精细求交 | 交互层、简化碰撞代理、BVH；动态变形确认重建/refit 成本 | 拾取正确/时延；渲染几何不必作为精细物理网格 |
| T22 地形与大世界 | 大地形顶点、切块峰值 | 空间流式与细节分层 | chunk/clipmap/LOD，按速度/视距预测加载，有限驻留；远离原点时评估 floating origin | 高速移动、接缝、坐标一致性；多系统需同步原点变化 |
| T23 3D 粒子与植被 | alpha billboard 覆盖大 | 距离/密度/阴影联动 LOD | instance、裁边、近远替身、粒子低分辨率 pass；草远处降密度/关投影 | fill、风动画、阴影；alpha test 与 MSAA 的组合需实测 |
| T24 多相机/小地图/XR | 一个画面外重复渲染 | 不同视图独立预算 | 小地图低频/低分辨率、layer mask；XR 按设备帧预算与双眼成本 | 所有 camera/pass 计数；XR 另核对后端与设备能力 |

## 实施顺序示例

症状：静态场景 3,000 draw，CPU render-submit 高；全场景合并后虽降至数十 draw，GPU/显存却上升。

先按空间单元恢复剔除边界，将重复树木/道具实例化，合并同单元内材质兼容的静态几何。分别记录 CPU 提交、可见/实际提交三角形、GPU 时间和资源驻留。若降低 renderScale 仍显著改善，再针对阴影、透明和后处理做单变量实验，避免把所有收益归因于 DrawCall。
