# 在 Codex、Claude Code、Cursor 等外部工具中执行

有 Shaper `materials_*` 工具时继续使用对应操作说明；没有这些工具、但工作区含下载技能包的 `credentials.json` 时，使用本说明和 `scripts/material-library.mjs`。不要求用户配置 MCP、Qoder 会话或项目 ID，仅管理素材时不创建 H5；应用中使用或替换素材按 [use.md](use.md) 执行。

## 身份与入口

需要 Node.js 20+；上传清单、下载 ZIP 需要 Python 3，无第三方依赖。先运行：

```sh
node skills/material-library/scripts/material-library.mjs --help
node skills/material-library/scripts/material-library.mjs list
```

脚本从**自身所在技能包根目录**读取 `credentials.json` 的 `aiGameServerUrl` 和 `shaperToken`，不受终端当前目录影响。运维可通过 `AI_GAME_SERVER_URL`、`SHAPER_TOKEN` 覆盖；二者必须对应同一环境，不在命令行传令牌、不打印凭据。

身份链路与 runbook 的 `notify-dingtalk.mjs` 一致：脚本请求 Shaper 后台时带 `X-Shaper-Token`，后台 `resolveActor` 校验有效期、撤销状态及用户权限，从已认证用户的 `subject` 得到 puid，向素材服务注入 `X-User-Id: <puid>` 和 `X-Tenant-Id: shaper`。不能将本地用户 UUID、Token 字符串或自行解码的值作为 puid；外部脚本不直接请求素材微服务、不发送自选身份头。

后台会检查素材库菜单和“素材库管理”技能权限。401 时重新授权/下载技能包；403 时让管理员授权。不可用时如实报告，不用模拟列表替代。

命令第二个参数为 JSON 对象，或 `@参数文件.json`。参数文件只放操作参数，不含凭据；路径以终端当前目录解析。下例中的 ID 必须替换为本次真实结果，不能直接执行占位符。

## 查询和选择

```sh
node skills/material-library/scripts/material-library.mjs list '{"category":"image","keyword":"banner","pageSize":20}'
node skills/material-library/scripts/material-library.mjs list '{"queryId":"上次返回的queryId","direction":"next"}'
node skills/material-library/scripts/material-library.mjs list '{"category":"trash"}'
```

分类支持 all/image/audio/video/spine/model/document/font/other/trash；默认全部第一页20项。翻页仅传 queryId、direction（next/previous）；切换筛选重新查第一页。可使用真实列表返回的文件夹 ID 作为 parentId。用户要所有页时根据 hasNext 逐页查询。分类直接使用接口返回的素材，不按扩展名、MIME 或上传格式规则再次过滤。sourceTotal 和翻页状态使用接口返回值，不把总数当作当前页条数。

展示文件名、类型、大小、当前页和翻页状态，保存用户所见编号到 selectionId 的映射。后续命令使用本脚本返回的 selectionId，不能混用 MCP 的选择 ID。选择和删除计划在技能包根目录 `.material-library/` 私有保存，绑定已认证用户、后台和素材空间，30分钟过期后重新查询。该目录已在下载包 `.gitignore` 中忽略，不放入应用交付包。

## 在应用中使用或替换

先读 [use.md](use.md)。查询并取得真实选择后获取原文件 URL：

```sh
node skills/material-library/scripts/material-library.mjs use '{"selections":["真实selectionId"]}'
```

返回的 URL 清单供代理判断和接入，不等于已下载或接入成功。普通素材默认使用验证可公开访问的原始 URL，不内联 base64，不用素材库 UI 图标或缩略图代替原文件。带签名/过期参数的地址仅用于传输，不写入应用；改用下方 `download` 下载、解压到项目后引用本地文件。Spine 始终下载完整项目并保留相对路径加载。临时地址不复制到用户答复或交付包。

## 上传

先按 [folders.md](folders.md) 查询并展示当前已有文件夹，等待用户选择并确认已有目录、自定义名称新目录或当天日期新目录。确认前不运行 `folder-create` 或 `upload`。新建目录示例（仅在用户确认名称及位置后执行）：

```sh
node skills/material-library/scripts/material-library.mjs folder-create '{"name":"用户确认的实际名称"}'
```

可加真实 `parentId` 在指定目录下创建，省略时创建于根目录。拿到返回的真实 `folderId` 后，普通上传将其传给 `folderId`，动画目录和 ZIP 上传将其传给 `parentId`；创建失败或结果未知时停止上传并重新查询，不重复创建或回退根目录。以下示例中的 ID 必须替换为用户确认的已有普通目录或新建目录结果。

```sh
node skills/material-library/scripts/material-library.mjs upload '{"paths":["./banner.png","./rules.txt"],"mode":"files","folderId":"已确认目标的真实folderId"}'
node skills/material-library/scripts/material-library.mjs upload '{"paths":["./hero/hero.skel","./hero/hero.atlas","./hero/hero.png"],"mode":"spine","parentId":"已确认普通文件夹的真实folderId"}'
node skills/material-library/scripts/material-library.mjs upload '{"paths":["./hero.zip"],"mode":"spine-zip","parentId":"已确认普通文件夹的真实folderId","projectName":"hero"}'
```

只上传用户指定的真实本地文件。普通文件每批20个/200MB，可传真实 folderId；动画目录每项目200文件/200MB，paths 要列出整个项目所需的文件，脚本保留共同目录前缀；动画ZIP每批1包/50MB。动画使用 parentId 在普通文件夹下新建项目，不传 folderId；projectName 仅用于ZIP。必须先按 folders.md 确认父目录及项目名称；用户明确选择根目录时才省略 parentId。不能上传到已有 Spine 项目或其内部目录，不支持追加。格式遵循 [upload.md](upload.md)；普通批次中不支持的项单独报告失败，其余继续；动画项目存在无效成员时整批停止。不能把普通ZIP当成素材包上传。

混合文件夹先按 [upload.md 的 Spine 项目规则](upload.md#混合目录中的-spine-项目) 分组和过滤，再构造各次 `upload` 的 `paths`。`upload.py manifest` 和本脚本不会自动判断 Spine 项目边界或 atlas 引用；执行代理必须先排除项目内未引用的封面等文件。普通 `files` 的 `paths` 不得包含已识别 Spine 项目目录内的剩余文件；atlas 引用的贴图只随项目上传，项目目录外的独立素材照常处理。将本地过滤项和服务端跳过项单独汇总，禁止把它们按普通素材补传。

脚本实际发送 multipart 字节，按真实接口返回逐项统计 successCount/failureCount/unknownCount。动画ZIP按1包统计，内部 fileCount/skippedCount 另行报告。上传后用 `list '{"category":"all","parentId":"已确认普通文件夹的真实folderId"}'` 核对项目位置，并报告实际父目录和返回的项目名称。结果未知时先重新查询，不能自动重复上传。外部上传不使用 MCP 上传票据或 upload_status；上传接口响应和刷新后的素材列表是核对依据。

## 下载

```sh
node skills/material-library/scripts/material-library.mjs download '{"selections":["真实selectionId"],"output":"./download-result-new"}'
```

output 必须是尚不存在的新目录。文件夹和动画项目自动递归展开，最多1000项/10层。脚本获取新签名地址，调用随包 `download.py` 下载真实字节、校验大小并生成 ZIP 与脱敏报告。仅 downloadedCount 算成功；空目录不产生素材包。签名地址只短暂写入私有目录，用后删除，不输出到答复。向用户提供真实本地文件链接；只有平台实际交付成功才称为可下载入口，不能声称已经保存到用户电脑。最近删除项先恢复后下载。

## 删除：先展示清单，再等人确认

```sh
node skills/material-library/scripts/material-library.mjs delete-prepare '{"selections":["真实selectionId"]}'
```

此步骤不删除。脚本递归展开文件夹、记录确定的目标快照并返回 planId、完整 targets 和 warning。展示完整清单（过长时提供清单文件）和警告：**删除可能影响引用这些素材的应用；已删除素材可在30天内从最近删除恢复，普通文件夹自身不保证可恢复。**

使用外部工具本身的提问能力或普通对话，等待用户在看到此清单和风险后明确回复“确认删除”。本轮首次说“删除这些”、自动模式、模型代答及选择素材不算这次风险确认。用户取消、不回复或无法取得人工回答时停止。只有取得该计划的明确人工确认后，才可以执行：

```sh
node skills/material-library/scripts/material-library.mjs delete '{"planId":"真实planId","confirmation":"确认删除"}'
```

confirmation 是脚本的本地执行门槛，**不是服务端验证过的人工确认凭证**；执行代理负责依据本次真实用户回答传入，禁止自动填入。Shaper 内置 MCP 仍使用其服务端校验的 Ask 卡片，不走此路径。

计划过期或清单改变时重新准备并确认。脚本对计划做独占执行标记，重复调用或网络中断后不得重新创建计划自动重试；先刷新正常列表和最近删除核对。先处理快照中的文件/整动画项目，再处理空文件夹，不能把新增文件自动纳入已确认清单。汇总成功、失败、未确认数量，不提供永久删除或清空回收站。

## 恢复

```sh
node skills/material-library/scripts/material-library.mjs restore '{"selections":["最近删除中返回的selectionId"]}'
```

只恢复真实最近删除记录，单批最多100项。脚本区分文件与动画项目，调用对应恢复接口。展示真实恢复数量、失败原因及重命名信息；项目 skippedCount>0 不能称完整成功。超过30天是否可恢复以接口为准。恢复后重新查询普通列表和最近删除核对；网络中断先核对，不盲目重试。普通文件夹自身没有独立恢复接口。

上传大小限制：所有模式单个文件最多 50 MiB（52,428,800 字节，含动画 ZIP 和动画目录中的每个文件）；普通批次及动画目录总量最多 200 MiB。超过单文件上限时请压缩或精简文件，拆分批次不能解决单文件超限。
