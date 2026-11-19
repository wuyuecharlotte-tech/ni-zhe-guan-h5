# 查询素材列表

使用 Shaper MCP 的 `materials_list`，工具前缀可能为 `mcp__shaper__`。身份来自当前会话，不让用户提供账号、令牌或空间 ID。仅查询素材时不创建 H5 页面。

- 分类映射：全部 `all`、图片 `image`、音频 `audio`、视频 `video`、动画 `spine`、模型 `model`、文稿 `document`、字体 `font`、其他 `other`、最近删除 `trash`。未指定分类用 `all`；首次查询默认 `page:1,pageSize:20`。允许 `keyword`、从真实结果取得的 `parentId`。
- “下一页”/“上一页”：用最近一次结果的 `queryId`，分别传 `direction:"next"`/`"previous"`，服务端自动保留原分类、关键词、文件夹和页大小。翻页调用只能含 `queryId`、`direction` 两个字段，不能附带 `pageSize`、`page`、`category`、`keyword` 或 `parentId`（即使数值未变）。例如 `materials_list({"queryId":"上次结果的 queryId","direction":"next"})`。无上下文先查第一页。切换分类、关键词或文件夹重新查第一页，不带 queryId。
- 展示当前页、文件名、文件/文件夹/动画项目类型、可读大小，以及下一页/上一页状态。给结果编号，在会话中保存编号到 `selectionId` 的对应关系；同名对象需显示所在目录或 ID 尾部让用户区分。页码、大小、sourceTotal 和翻页状态逐项取自本次工具结果；不要沿用上一轮数字或自行减去当前页。sourceTotal 是当前分类接口返回的总数，不是当前页条数。完整展示工具返回的素材，不按扩展名、MIME 或上传格式规则再次过滤；分页状态以接口为准。
- 默认只查一页；用户明确要求所有页时按 hasNext 翻页，直到末页，不能把第一页称为全部结果。
- 指定“第 1、3 个”时引用用户看到的那一页；跨页选择保留各自 selectionId。列表选择 30 分钟过期，重新查询核对后再操作，不能猜测 ID。

按用户要求继续本技能的对应操作：

- 删除：按 [delete.md](delete.md) 的准备 → 风险展示 → 用户手动确认 → 执行流程。调用 `materials_delete_prepare({selections:[...]})` 后把返回的 ask 原样交给 `ask_user_question`，等待用户点击“确认删除”，再 `materials_delete({planId})`。选择列表或说“删除这些”都不是风险确认。
- 下载：按 [download.md](download.md) 执行，调用 `materials_download` 后下载真实字节并交付文件；获得临时链接不等于下载完成。
- 恢复：仅对最近删除的结果按 [restore.md](restore.md) 执行 `materials_restore`；普通素材无需恢复。最近删除中的素材先恢复再下载，不进行永久删除。

权限不足说明需要管理员授权素材库管理技能和素材库菜单。工具不可用说明环境尚未接通，不能用模拟列表、浏览器令牌或其他用户身份替代真实结果。

用户继续要求使用或替换查询到的素材时，转读 [use.md](use.md)：普通素材默认使用原始资源 URL，Spine 下载到项目本地引用，不用预览图或 base64 替代。
