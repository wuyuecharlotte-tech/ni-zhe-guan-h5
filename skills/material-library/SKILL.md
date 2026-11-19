---
name: material-library
description: 管理当前用户素材库，支持上传图片、音频、视频、动画、模型、文稿、字体、其他八类素材（其他接收未归入既有分类的非代码文件），支持分类分页查询、批量上传、删除、下载和恢复，以及在应用中使用、替换素材。用户说“查素材”“下一页”“上传这些文件”“删除所选素材”“批量下载”“恢复素材”或“使用/替换素材库资源”时使用；不用于为 H5 接入文件上传组件。
---

# 素材库管理

操作当前用户素材库，支持 Shaper 内置 MCP 和下载技能包的外部工具（Codex、Claude Code、Cursor）。身份、权限和空间由 Shaper 后台认证后解析，不向用户索要令牌或构造其他用户身份。仅管理素材时无需创建或重新交付 H5；用户要求在应用中使用或替换素材时，按请求修改应用。

上传前必须先查询并展示真实已有文件夹，让用户选择已有目录、单独新建自定义名称目录或当天日期目录；取得明确确认后才创建目录和开始上传。内置与外部环境均先读 [references/folders.md](references/folders.md)。

Spine 完整目录和 ZIP 均可上传到已确认的普通文件夹：使用真实文件夹 ID 作为 `parentId`，在其下新建独立动画项目；省略时在空间根目录新建。不能上传到已有 Spine 项目或其内部目录，也不支持追加项目文件。普通文件仍使用 `folderId`。

上传混合文件夹时，先按 [references/upload.md](references/upload.md#混合目录中的-spine-项目) 识别 Spine 项目边界与图集引用。项目内未引用的文件（例如 `cover.png`）直接跳过，不转为独立素材上传；项目目录外的普通文件仍正常处理。不能仅按文件名过滤，atlas 实际引用的同名贴图必须保留。

使用或替换素材时，普通素材默认引用素材库原始资源 URL，不能把附件转成 base64 内联，也不能用素材库 UI 图标、缩略图或封面代替原文件。Spine 下载到项目中，保留骨架、atlas 和引用贴图的相对路径后本地加载。临时签名地址、鉴权代理和 blob URL 不作为应用长期地址；无可用 URL 时保存真实文件并说明回退原因。具体流程见 [references/use.md](references/use.md)。

## 选择执行环境

- 已有 Shaper `materials_*` 工具（前缀可能为 `mcp__shaper__`）：按下表和共同约束执行。
- 外部工具没有这些 MCP 工具，工作区含技能包 `credentials.json`：改读 [references/external-tools.md](references/external-tools.md)，使用 [scripts/material-library.mjs](scripts/material-library.mjs) 执行查询、上传、下载、删除和恢复。脚本自动读取 shaperToken，后台解析 puid 并注入上游 X-User-Id，无需配置 MCP、项目或浏览器登录态。外部工具的参数、选择上下文和人工删除确认以该说明为准，不套用下方 MCP Ask 卡片要求。

## Shaper MCP：选择操作

按本轮请求只读取所需说明；连续操作可以在本技能内切换，无需选择其他技能。

| 用户请求                                                              | 执行前读取                                                                           | 工具                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| 查询全部、图片、音频、视频、动画、模型、文稿、字体、其他或最近删除；下一页/上一页 | [references/list.md](references/list.md)：分类、分页、编号和选择上下文               | `materials_list`                                      |
| 使用、替换素材、设置背景或图标 | [references/use.md](references/use.md)：原始 URL 优先，Spine 下载到项目 | `materials_list`、`materials_download` |
| 上传附件、本地文件或完整动画项目                                      | [references/upload.md](references/upload.md)：先确认文件夹，再校验格式、分批上传与统计 | `materials_list`、`materials_folder_create`、`materials_upload_prepare`、`materials_upload_status` |
| 删除文件、文件夹或动画项目                                            | [references/delete.md](references/delete.md)：展开清单、风险提示、人工确认和结果     | `materials_delete_prepare`、`materials_delete`        |
| 下载指定文件或文件夹                                                  | [references/download.md](references/download.md)：下载真实字节、打包和交付           | `materials_download`                                  |
| 恢复最近删除中的素材                                                  | [references/restore.md](references/restore.md)：选择删除项、恢复、重命名和结果核对   | `materials_restore`                                   |

## Shaper MCP：共同约束

- 查询默认第一页，后续翻页只传最近一次 `queryId` 和 `direction`（不传 `pageSize` 等字段），筛选和页大小由服务端沿用，逐项使用本次工具结果的页码、数量和翻页状态；接口总数不等于当前页条数。
- 下载、删除和恢复使用真实列表返回的 `selectionId`。同名或选择含糊时先明确对象。选择项 30 分钟过期后重新查询，不能猜测 ID。
- 删除前展示完整清单，提示可能影响引用素材的应用，并将工具返回的 Ask 原样交给 `ask_user_question`。即使在自动模式，也必须等待用户手动选择“确认删除”；仅说“删除这些”不算确认。确认工具不可用时停止删除。已删除素材 30 天内可从“最近删除”恢复，普通文件夹自身不保证可恢复。
- 上传使用 [scripts/upload.py](scripts/upload.py)，下载使用 [scripts/download.py](scripts/download.py)。先运行脚本 `--help`，再按对应操作说明执行。平台以内联文本提供资源时，先按资源路径保存到新工作目录；相对引用仍以本技能目录解析。
- 工具返回和文件传输完成才构成操作结果；获取下载 URL 不等于下载成功，附件已在聊天 Drive 中不等于已上传素材库。逐项汇总成功、失败及未确认数量；结果未知时先核对列表，避免盲目重试。
- 权限不足时提示管理员授权“素材库管理”和素材库菜单；工具不可用时说明环境未配置，不能用模拟数据代替。临时签名 URL、上传票据和凭证不进入应用源码、交付包或用户答复；可公开访问的原始资源 URL 可按使用规则写入应用。

## 用户结果

查询显示当前页及真实文件列表，支持用户按编号继续操作。上传、删除、恢复报告成功/失败数量和原因；下载交付真实文件包后提供可下载入口。省略内部工具名、选择 ID 和鉴权细节；需要用户处理的问题用文件名和可行操作说明。

上传前校验单文件不超过 50 MiB（含动画 ZIP），批次或动画目录合计不超过 200 MiB；具体流程见 [references/upload.md](references/upload.md)。
