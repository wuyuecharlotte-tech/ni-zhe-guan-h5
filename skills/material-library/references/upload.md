# 素材批量上传

使用 Shaper MCP 的 `materials_upload_prepare`、`materials_upload_status` 和返回的一次性 multipart 地址。只处理用户指定的附件或本地文件；聊天附件在 Drive 中不代表已进入素材库。先用附件上下文中的临时地址下载到工作目录。不得把它误用成 H5 的 `upload_prepare`。

聊天入口每次最多接收 10 个附件、每个 50 MB。超过聊天限制时，提示用户先通过素材库页面上传，或提供已在当前工作目录中的文件；不要声称聊天能接收 200 MB 附件。素材工具的批次限制见下文。完整动画目录通过 ZIP 附件提供，可保留项目结构。

## 上传前确认目标

先执行 [folders.md](folders.md)：展示当前已有文件夹，提供已有目录、自定义名称新目录、当天日期新目录三种选择，等待用户明确确认。确认前不得调用 `materials_folder_create`、`materials_upload_prepare` 或发送文件字节；确认后普通文件使用真实目标 `folderId`，动画目录和 ZIP 使用真实普通文件夹 ID 作为 `parentId`，在其下新建项目。只有用户明确选择根目录时才省略动画的 `parentId`，不能向已有 Spine 项目或其内部目录上传。

## 混合目录中的 Spine 项目

用户指定的文件夹或解压后的目录中包含 Spine 时，在生成普通文件批次前先检查目录树和引用关系：

1. 以骨骼导出（`.skel` 或内容确认为 Spine 骨骼的 `.json`）、配套 `.atlas` 所在的项目目录为边界。普通 JSON、单张图片或目录名含 spine 都不能单独证明是 Spine 项目；目录内有多组骨骼或图集时保留完整项目，不按一组三件套截断。保持项目内相对路径；无法确定边界或缺少依赖时先报告具体问题，不把疑似项目拆为普通文件上传。
2. 逐个解析项目 atlas 中的 page 贴图路径，以 atlas 所在目录为基准解析相对引用；保留骨骼、配套图集、实际被引用的全部贴图和必要项目文件。不要用 atlas 中的 region 名称、同名猜测或“所有图片”代替 page 引用。缺失的引用文件须报告，不能假装项目完整。
3. 项目目录内不属于上述依赖的文件（如未被引用的 `cover.png`、其他预览图、说明文件和系统文件）记录为跳过，既不加入普通 `files` 批次，也不新建为图片或文稿素材。不能只屏蔽 `cover.png` 这个名字：如果它被 atlas 引用则必须保留；其他名称的未引用文件也按同一规则跳过。
4. 从普通文件清单中排除整个已识别项目目录，而不只是排除已选中的骨骼、图集和贴图。项目目录外的音频、图片、文稿等继续按普通素材规则处理；不得因为父目录包含 Spine 就过滤父目录内所有其他文件。

例如 `上传/aether-dragon/` 内有 `aether-dragon.json`、`aether-dragon.atlas`、atlas 引用的 `aether-dragon.png` 和未引用的 `cover.png`：上传一个包含前 3 个文件的动画项目，跳过 `cover.png`；`上传/` 下的 MP3、WebP 和文稿照常处理。若用户另外明确指定该封面为独立素材，再按该次请求处理。

每个识别出的项目使用 `spine` 模式；明确指定的完整动画 ZIP 继续使用 `spine-zip`，由动画接口过滤内部无关文件。服务端返回的 `skipped` / `skippedCount` 只用于报告，禁止把这些项目内文件再次按 `files` 补传。混合素材 ZIP 须先在工作目录解压并按上述规则分组，不能把整个混合目录当成单个动画项目。

## 格式与分批

- 图片：PNG/JPG/JPEG/SVG/GIF/WebP。
- 音频：MP3/WAV/OGG/M4A/AAC/FLAC/OPUS/AIFF/WMA，及真实 MIME 为 audio/* 的文件。
- 视频：MP4/WebM/MOV/M4V/AVI/MKV/OGV/MPEG/MPG，及真实 MIME 为 video/* 的文件。
- 模型：GLTF/GLB/OBJ/FBX/STL/PLY/DAE；2D 模型贴图 PNG/JPG/JPEG/WebP/GIF。
- 文稿：PDF/DOC/DOCX/TXT/MD/CSV/XLSX。
- 字体：TTF/OTF/WOFF/WOFF2/TTC/EOT，按普通 `files` 模式上传；列表查询使用 `category:"font"`（接口 `fileCategory=font`），直接展示接口返回记录，不按扩展名或 MIME 二次过滤。
- 其他：未被图片、音频、视频、动画、模型、文稿或字体识别的非代码文件（包括 `.data` 和常见二进制/资源扩展名），按普通 `files` 模式上传，列表查询使用 `category:"other"`（接口 `fileCategory=other`）。作为原始字节保存，不解包、不执行、不按文稿或 Spine 解析；代码文件仍应使用 Agent 附件或工作区，单文件仍最多 50 MiB。
- 动画：SKEL/JSON/ATLAS/SPINE，项目贴图 PNG/JPG/JPEG/WebP/GIF/BMP/AVIF。完整项目用 mode=spine，保留共同项目目录（hero/hero.skel、hero/hero.atlas、hero/hero.png）；动画 ZIP 用 spine-zip。ZIP 不作为普通素材包上传。不能拆散一个动画项目来满足分批限制。
- PSD 暂不支持；HEIC/BMP/AVIF/TIFF 等独立图片友好提示转 PNG/JPG/WebP。BMP/AVIF 仅可作为动画项目贴图。不要改后缀或伪造 MIME 绕过校验。
- files 模式每批最多 20 文件、合计 200MB；spine 每项目最多 200 文件/200MB；spine-zip 每批 1 包/50MB。多文件分批时各批用独立 requestKey。普通目标目录用真实 folderId；动画项目用 parentId，不传 folderId；ZIP 可传 projectName。

超过限制时，明确告诉用户是大小超限还是数量超限，并报告当前实际值、对应模式上限及可行处理方式；同时超出两项时分别提示。普通素材可分批，动画项目须整体精简，ZIP 每次只上传一个；不得静默截取文件、拆散动画项目或反复重试同一超限请求。工具返回的具体限制错误应如实转告，不要替换为“上传失败”。

## 执行

辅助脚本见 [scripts/upload.py](../scripts/upload.py)。若由平台以内联资源提供脚本，先保存到新的工作目录后执行。
先运行 `python3 <技能目录>/scripts/upload.py --help` 查看参数，直接执行脚本，无需读取源码。

1. `python3 <技能目录>/scripts/upload.py manifest --mode files <路径...> > manifest.json`，动画改为 spine 或 spine-zip。检查脚本的文件名与实际项目目录，记录 localPaths 映射。只把输出的 files 交给 MCP，不把 localPaths 作为工具参数。
2. 完成上述目标确认；需新建目录时先创建并取得真实 `folderId`，失败则停止。普通文件调用 `materials_upload_prepare({requestKey,mode:"files",files,folderId})`；动画目录或 ZIP 调用 `materials_upload_prepare({requestKey,mode:"spine"或"spine-zip",files,parentId,projectName?})`，其中 `parentId` 为已确认普通文件夹的真实 ID，`projectName` 仅用于 ZIP。大小和 SHA256 必须来自真实文件；不在 MCP 参数传文件字节。把结果保存为 ticket.json。目标会与清单一起保存在票据记录中，发送脚本无需额外传目录字段；更改目标或文件清单必须用新 requestKey。展示 rejectedFiles 的文件名与友好原因，但继续上传 acceptedFiles。动画项目若有无效成员，修正完整项目再重试。
3. pending 且有 acceptedFiles 时：`python3 <技能目录>/scripts/upload.py send manifest.json ticket.json`。脚本按校验清单发送真实文件，只执行一次。不要打印或交付 ticket.json、临时 URL 或下载凭据。
4. 用 `materials_upload_status({uploadId})` 读取结果。只有 complete 的逐项成功才计入成功；failed 显示具体原因；running/unknown 表示尚未确认，先核对库中结果，不盲目重复上传。改变文件后使用新 requestKey；同一批不要自动创建新 key 重试。
5. 汇总所有批次和本地未发送项：共 N 个文件，成功 S 个，失败 F 个；存在未确认项另列 U 个。主动过滤的项目内文件另列“跳过”数量、文件名及未引用原因，不计为成功或失败，也不重新上传。逐项列出失败原因和可行修正方式。动画 ZIP 按提交的 1 个包统计，另外报告 project.fileCount 与 skippedCount，不能把 ZIP 包数和内部文件数相加。按已确认目标刷新列表核对已上传文件；动画使用 `materials_list({category:"all",parentId})` 确认项目在目标普通目录下，并报告实际目录及服务端返回的项目名称。

上传大小限制：所有模式单个文件最多 50 MiB（52,428,800 字节，含动画 ZIP 和动画目录中的每个文件）；普通批次及动画目录总量最多 200 MiB。超过单文件上限时请压缩或精简文件，拆分批次不能解决单文件超限。
