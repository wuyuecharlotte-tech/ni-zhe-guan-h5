---
name: engineering-skills
description: 用于后端工程的性能设计、工作量分析、缓存与并发可靠性，以及实现验证；作为工程技能组的模块入口，按问题读取相关专项技能。
---

# 后端工程模块入口

四个原始专项技能保持独立。本入口只选择所需专项，不复制其方法，也不依赖上层协调入口或游戏前端模块。

| 任务 | 读取 |
|---|---|
| 新功能设计、负载边界、架构取舍 | [engineering-design](skills/engineering-design/SKILL.md) |
| API/SQL 变慢、重复工作、请求扇出、容量 | [engineering-workload](skills/engineering-workload/SKILL.md) |
| 缓存、交易、重试、异步、过载与恢复 | [engineering-reliability](skills/engineering-reliability/SKILL.md) |
| 性能/一致性改动的证据与回归 | [engineering-verification](skills/engineering-verification/SKILL.md) |

按当前任务加载相关入口，由它们继续选择参考资料。诊断通常从 workload 开始；设计任务从 design 开始；涉及一致性进入 reliability；实现验收进入 verification。无需一次读完全部材料。

保持 skills/ 下四个目录的相对结构，原始技能之间有相互引用。需要独立安装时将这四个目录一起放进目标环境的技能目录。
