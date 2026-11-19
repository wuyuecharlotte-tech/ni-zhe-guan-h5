# 旧云存档接口用法与迁移方案

维护已有使用 `window.ColorboxAI.cloudSave.getValue({ key })` / `.setValue({ key, value })` 的应用，或准备迁移其存档时读取。这里的 get/set 指这两个云存档方法，不包括本地 `storage.*`。新应用、新接入功能首选主 Skill 的 `save/load`；旧接口继续可用，但不作为第一选择。

SDK 继续保留旧方法，旧应用可以继续运行，无须为升级 SDK 强制迁移。改用 `save/load` 时，新存档位与旧业务 key 不会自动关联，不能只替换方法名。迁移由应用明确旧 key 与目标 slot 的对应关系，SDK 不会枚举或自动搬运旧数据。

## 继续使用旧接口

在 `window.ColorboxAI` 可用后调用：

| 操作 | 调用 | 成功结果 |
| --- | --- | --- |
| 读取旧存档 | `window.ColorboxAI.cloudSave.getValue({ key })` | `code === 200`，`data` 为字符串或 null |
| 保存旧存档 | `window.ColorboxAI.cloudSave.setValue({ key, value })` | `code === 200` |

- `key` 是非空业务字符串，沿用原应用的 key 及生成规则；同一用户、活动、key 再次保存会完整覆盖旧值。不要把 key 直接替换成 slot 编号，也不要在维护时任意改名，否则会读不到原存档。
- 旧接口按用户、活动和 key 定位，不会自动追加应用隔离前缀；维护时保留原 key 的应用前缀或生成规则。同活动下多个应用若共用同一个 key，会访问同一份旧数据，迁移前须确认其归属，不把共享数据误当成当前应用独有数据。
- `value` 必须为字符串，单个 key 最多 2MiB UTF-8 字节；对象先按白名单构造再 `JSON.stringify`。读取 JSON 存档时捕获解析异常并校验字段，不能以默认值覆盖无法识别的旧格式。
- 只有读取返回 `200 + null` 表示无记录，空字符串是有效内容；写入空字符串不会删除记录。先检查 code，读取失败不得按无记录处理，保存失败保留用户编辑、不自动循环重试。
- 继续沿用适合该功能的保存时机，不因保留旧接口额外添加自动保存。主 Skill 的数据精简、恢复时序和失败处理同样适用于旧 key；slot 数量和编号限制仅适用于 `save/load`。

下面演示沿用已有文本草稿 key 的读写；将 `draft` 换成原应用实际 key。由页面读取入口调用读取函数，保存事件调用保存函数，并在调用方捕获错误、提示结果、保留未保存内容。

```javascript
const EXISTING_DRAFT_KEY = "draft";

async function loadExistingDraft() {
  const result = await window.ColorboxAI.cloudSave.getValue({ key: EXISTING_DRAFT_KEY });
  if (result.code !== 200) throw new Error(result.message || "读取失败");
  return result.data; // string | null；空字符串仍是有效存档。
}

async function saveExistingDraft(text) {
  const result = await window.ColorboxAI.cloudSave.setValue({
    key: EXISTING_DRAFT_KEY,
    value: text,
  });
  if (result.code !== 200) throw new Error(result.message || "保存失败");
}
```

以下内容仅用于已经决定从旧接口切换到 `save/load` 的应用；继续维护旧接口的应用无需执行迁移步骤。

## 先确定映射与切换范围

- 确认实际加载的 SDK 提供 `save/load/getValue` 后再启用迁移入口；缺少新方法时继续原接口流程并先升级 SDK，不能停掉旧入口后才发现迁移不可用。
- 从原应用代码确认实际使用的 key、生成规则、数据格式和保存时机，不猜 key，也不扫描可能存在的 key。迁移沿用原用户、应用和活动；活动或应用标识变化需要另行安排数据迁移，不由此方案跨范围搬运。
- 为每组要迁移的数据固定目标 slot（1–5，建议最多三个），确认用途未被其他功能占用。独立内容可以分别迁移；多个旧 key 合并到一个 slot 时，先读齐必要数据、校验并构造完整对象，再一次保存，不能逐个 key 覆盖同一 slot。任何必要读取失败都停止；缺失数据是否允许补默认值由业务确定。
- 分批迁移按每组数据独立判断和切换，某个 slot 成功不代表其他数据已经迁移。合并多个旧 key 的逻辑一旦上线，后续新增来源字段应按格式升级处理，不能因目标非空就把后来加入的旧 key 当成已迁移，也不能覆盖已有新编辑。
- 旧格式与新格式相同可保留原字符串；格式调整时显式转换并校验，只精简可重建的冗余，保留必要正文。转换后仍受每个 slot 2MiB UTF-8 字节上限约束，不能截断必要数据。
- 先停旧保存入口、定时器和待写任务，处理已经发出的写入；在初始化恢复阶段完成迁移，再开放编辑和保存。页面退出或切换用户、应用、活动时使本次任务失效，旧结果不得应用到新页面；忽略结果不能撤销已经发出的写入。

## 迁移顺序

1. 调用 `load({ slot })`。失败就停止，不读取旧值覆盖目标；成功且 `data !== null` 时，校验并恢复新存档，**包括空字符串或业务空状态**，不再回退旧 key。新数据不兼容时保留并提示，不以旧值覆盖。
2. 仅当新存档明确返回 `code === 200 && data === null`，调用 `getValue({ key: 旧key })`。失败就停止；成功且旧值为 null，按首次使用处理，不为迁移写入默认值。旧值是空字符串时仍属于有效存档。
3. 校验旧值并按需转换，使用 `save({ slot, value })` 写入完整的新存档。只有返回 200 才认为迁移完成，并开放使用新接口的正常读写；失败保留旧云存档及本次读取的内容，提示迁移未完成，暂停后续写入，不静默回退到旧写入链路。
4. 迁移成功后，这组数据统一使用 `save/load`，尚未迁移的独立数据保持原接口。保留旧 key 的数据，不清空、不删除、不持续双写。以后启动优先读取新 slot，不重复搬运旧数据；业务清空时在新 slot 保存可识别的空状态，避免旧数据被再次恢复。

迁移写入超时也可能已经落库。停止自动重试；后续重新进入或用户主动核对时仍从读取新 slot 开始，不能用旧值无条件重写。读取只能确认当时可见值，不能证明旧超时请求已结束；在结果不确定时保持写入暂停，遵循主 Skill 的超时处理。

## 单个文本草稿的接入示例

下面仅演示已确认的一个旧文本 key 对应一个新 slot，不添加自动保存。`draft` 必须替换为原应用实际 key；目标编号须与应用的存档分配一致。JSON 或多个旧 key 需要按上文补充业务校验与转换，不能直接套用文本校验。

```javascript
const DRAFT_SLOT = 1;
const LEGACY_DRAFT_KEY = "draft";

function requireSuccess(result, action) {
  if (result.code !== 200) {
    throw new Error(result.message || `${action}失败`);
  }
}

function validateDraft(value) {
  if (typeof value !== "string") throw new Error("草稿格式不兼容");
  return value;
}

// 调用期间禁止编辑/保存；同一初始化任务只运行一次。
// assertCurrent 由页面生命周期提供：退出或上下文切换后抛错。
async function restoreOrMigrateDraft(assertCurrent) {
  const cloudSave = window.ColorboxAI.cloudSave;
  assertCurrent();
  const current = await cloudSave.load({ slot: DRAFT_SLOT });
  assertCurrent();
  requireSuccess(current, "读取新存档");
  if (current.data !== null) return validateDraft(current.data);

  const legacy = await cloudSave.getValue({ key: LEGACY_DRAFT_KEY });
  assertCurrent();
  requireSuccess(legacy, "读取旧存档");
  if (legacy.data === null) return null;

  const value = validateDraft(legacy.data);
  const saved = await cloudSave.save({ slot: DRAFT_SLOT, value });
  assertCurrent();
  requireSuccess(saved, "迁移草稿");
  return value;
}
```

调用方捕获异常、提示错误并保留已有内容；不能在 catch 中把返回值当 null、写默认值或开放尚未完成迁移的保存入口。成功返回 null 才按首次使用处理。页面生命周期检查应覆盖用户、应用、活动和本次初始化任务，不使用永远通过的空函数。

## 上线与回退

- 验证新 slot 有数据时不读旧 key、不写入；两边都无记录时不写入；旧空字符串能迁移；读取失败、转换失败、超限、写入失败时不丢原数据；迁移成功后再次进入不重复搬运；切换页面时不应用旧结果。
- 迁移入口按用户首次使用新版本时执行。不能只因发版一段时间就移除旧读取逻辑，长期未打开应用的用户可能尚未迁移；待确认迁移覆盖情况后再移除。
- 保留旧 key 是保留迁移前副本，不代表旧应用能看到迁移后的新编辑。回退应用版本时，应保留读取新 slot 的能力；否则先安排受控的数据回迁，再恢复旧写入入口。不要直接回退到只读旧 key 的版本并宣称数据无损。
- 迁移方案不需要服务端批量修改数据，搬运时仅用旧 `getValue` 读取、新 `save` 写入，不持续双写；这不影响尚未迁移的应用继续使用旧 `setValue` 保存。
