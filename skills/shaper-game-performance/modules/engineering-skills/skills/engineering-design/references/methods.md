# 方法来源与边界

本包是面向 Agent 的原创工作流程，借鉴下列方法，非 Google、CMU 或 AWS 官方技能，也不等同于完整 ATAM 评估。

- [Google NALSD](https://sre.google/workbook/non-abstract-design/)：从需求迭代到实际资源约束。用于容量估算、缩放与故障推演；文中大型系统规模不应成为小项目的架构目标。
- [CMU SEI ATAM](https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/)：用具体场景分析质量目标的敏感点和取舍。采用其场景与权衡思想，不要求实施完整会议流程。
- [Google SRE 服务目标](https://sre.google/workbook/implementing-slos/)：用用户任务的成功、时延、时效衡量服务；指标目标须来自业务需求，不能伪造。
- [AWS 缓存经验](https://aws.amazon.com/builders-library/caching-challenges-and-strategies/)：检查缓存正常、冷启动、不可用时的不同负载，不能以高命中率代替回源容量设计。
- [AWS 队列与快速失败](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_mitigate_interaction_failure_fail_fast.html)：限制等待，区分工作类型，关注过期工作；关键账本操作按其持久性与正确性契约处理。

工作流中的估算用于暴露敏感因素，不是吞吐证明。模型、检查和单元测试都不能替代未执行的运行验证。上游方法与平台行为可能更新，使用具体参数/API 前查询当前官方资料。
