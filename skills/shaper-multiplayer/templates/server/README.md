# 服务端模板

新游戏直接复制 [../game/](../game/README.md)，其中是可运行、可源码部署的完整 Node 服务。

本目录的 admission、cluster、persistence 和 src 片段用于理解边界或扩展旧项目，不作为首次部署入口。新模板对应实现位于 server/runtime/，不依赖私有 SDK 包。
