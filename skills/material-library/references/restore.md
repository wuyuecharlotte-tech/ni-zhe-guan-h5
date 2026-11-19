# 素材恢复

用 Shaper MCP `materials_list({category:"trash",page:1})` 查询最近删除；翻页用 queryId 与 direction。按用户指定文件名或编号取得 selectionId，同名项需结合删除时间或 ID 区分；只能恢复当前用户的素材。

调用 `materials_restore({selections:[...]})`，每次最多 100 项，更多项分批。文件使用文件恢复接口，动画项目使用整项目恢复接口，由工具根据真实记录区分，不能将 projectId 当作 fileId。明确指定恢复即可执行，无需删除确认。

按返回的 successCount/failureCount/unknownCount 汇总，并展示失败项的原因。文件 result.renamed 或项目 result.folderRenamed 为 true 时告诉用户发生重命名；展示返回的新名称（如有），否则重新查询，不猜测名称。项目 result.restoredCount/skippedCount 按内部文件单独报告，跳过成员不能算完整成功。超过 30 天或 expiresAt 已过期时说明可能已不可恢复，以接口结果为准，不承诺必定能恢复。

恢复后重新查询对应素材分类或“全部”，核对恢复结果；不要把仍在最近删除中的项说成已恢复。普通文件夹本身没有独立恢复接口，应恢复回收站中的文件或动画项目。网络中断导致结果未确认时先刷新列表核对，不盲目重复恢复。
