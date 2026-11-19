#!/usr/bin/env node
/** External-tool client. Node.js 20+, no npm dependencies. Never sends a caller-chosen puid. */
import {
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
  openSync,
  closeSync,
  existsSync,
  chmodSync,
  unlinkSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

class ClientError extends Error {}

// Keep extensions and classification aligned with src/modules/material-library/formats.ts.
const FORMATS = {
  image: ["png", "jpg", "jpeg", "svg", "gif", "webp"],
  audio: ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "aiff"],
  video: ["mp4", "webm", "mov", "m4v", "avi", "mkv", "ogv", "mpeg", "mpg"],
  model: [
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "gltf",
    "glb",
    "obj",
    "fbx",
    "stl",
    "ply",
    "dae",
  ],
  document: ["pdf", "doc", "docx", "txt", "md", "csv", "xlsx"],
  font: ["ttf", "otf", "woff", "woff2", "ttc", "eot"],
  // Other keeps any non-code file as original bytes.
  other: ["*"],
  spine: [
    "skel",
    "json",
    "atlas",
    "spine",
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "bmp",
    "avif",
  ],
};
const ext = (name) => name.split(".").pop().toLowerCase();
function formatError(file, mode) {
  if (
    file.name.length > 1024 ||
    /^[A-Za-z]:/.test(file.name) ||
    /[\\\x00\r\n]/.test(file.name) ||
    file.name.split("/").some((p) => !p || p === "." || p === "..")
  )
    return "文件路径无效";
  if (/\.wma$/i.test(file.name) || /^(audio|video)\/(?:x-ms-|x-)?wma(?:;|$)/i.test(file.mime || ""))
    return "不支持上传 WMA 音频，请转码为 MP3 或 AAC 后上传（仅修改扩展名无效）。";
  if (mode === "spine-zip")
    return /\.zip$/i.test(file.name) ? undefined : "动画压缩包必须为ZIP";
  if (mode === "spine")
    return file.name.includes("/") && FORMATS.spine.includes(ext(file.name))
      ? undefined
      : "动画项目文件格式或路径无效";
  if (file.name.includes("/"))
    return "普通文件请使用文件名并通过folderId指定目录";
  if (
    [
      "psd",
      "avif",
      "heic",
      "heif",
      "bmp",
      "tif",
      "tiff",
      "jxl",
      "ico",
    ].includes(ext(file.name))
  )
    return "暂不支持此图片格式，请转为PNG/JPG/WebP";
  if (ext(file.name) === "zip")
    return "ZIP 仅用于完整 Spine 动画项目；普通压缩包请解压后上传受支持的文件";
  const codeExtensions = new Set([
    "cjs", "cts", "mts", "bash", "zsh", "fish", "ps1", "bat", "cmd", "exe", "dll", "so", "dylib", "wasm", "class", "jar", "pyc",
    "c", "cc", "cpp", "cxx", "css", "go", "h", "hpp", "html", "htm",
    "java", "js", "jsx", "json", "mjs", "php", "swift", "kt", "kts", "dart",
    "lua", "pl", "r", "m", "mm", "gradle", "toml", "py", "rb", "rs", "sh", "sql",
    "ts", "tsx", "vue", "xml", "yaml", "yml",
  ]);
  if (codeExtensions.has(ext(file.name)) || /^(text\/(?:css|html|javascript|x-?[^;]+script|xml)|application\/(?:javascript|json|typescript|xml|x-httpd-php))/i.test(file.mime)) {
    return "代码文件不能上传到素材库，请使用应用附件或 Qoder 工作区";
  }
  return undefined;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "../../..");
const stateDir = resolve(root, ".material-library");
const MAX_BYTES = 200 * 1024 * 1024;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
function uploadLimitIssue(mode, files) {
  const count = mode === "spine" ? 200 : mode === "spine-zip" ? 1 : 20;
  const subject =
    mode === "files"
      ? "普通素材每批"
      : mode === "spine"
        ? "一个动画项目"
        : "每次动画 ZIP 上传";
  const remedy =
    mode === "files"
      ? "请拆分批次上传"
      : mode === "spine"
        ? "请精简完整项目后重新上传，不要拆散动画项目"
        : "请压缩动画 ZIP 包后重新上传";
  const issues = [];
  const oversized = files.find((file) => file.size > MAX_FILE_BYTES);
  if (oversized)
    issues.push(
      `「${oversized.name}」超过单文件 50 MB 限制，请压缩文件后重新上传。`,
    );
  if (files.length > count)
    issues.push(
      `本次选择 ${files.length} 个文件，${subject}最多 ${count} 个${mode === "spine-zip" ? " ZIP 包" : "文件"}；${mode === "spine-zip" ? "请每次只上传 1 个 ZIP 包" : remedy}。`,
    );
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  if (bytes > MAX_BYTES)
    issues.push(
      `${subject}总大小为 ${(Math.ceil((bytes / 1024 / 1024) * 100) / 100).toFixed(2)} MB，不能超过 200 MB；${remedy}。`,
    );
  return issues.join("\n");
}
function uploadRejectedMessage(path, status, payload) {
  const reason = String(payload?.msg ?? payload?.message ?? "");
  const countExceeded = /数量|个文件|ZIP 包/.test(reason);
  const sizeExceeded = /大小|字节|\b(?:MB|MiB)\b/i.test(reason);
  if (
    status !== 413 &&
    payload?.code !== "MATERIAL_UPLOAD_LIMIT" &&
    !((countExceeded || sizeExceeded) && /超|最多|限制/.test(reason))
  )
    return undefined;
  const zip = path.endsWith("/spine/upload-zip");
  const spine = path.endsWith("/spine/upload");
  if (countExceeded && !sizeExceeded) {
    return `${zip ? "动画 ZIP 上传每次最多 1 个 ZIP 包" : spine ? "一个动画项目最多 200 个文件" : "普通素材每批最多 20 个文件"}，本次上传超过服务数量限制；${zip ? "请单独上传每个 ZIP 包" : spine ? "请精简完整项目后重新上传" : "请拆分批次上传"}。`;
  }
  return `${zip ? "动画 ZIP 包" : spine ? "动画项目" : "普通素材每批"}超过上传服务大小限制（单文件上限 50 MB，批次总量上限 200 MB）；${spine || zip ? "请压缩或精简完整项目后重新上传" : "请压缩超限文件或减少单批总大小后重新上传"}。`;
}
const WARNING =
  "删除可能影响引用这些素材的应用；已删除素材可在30天内从“最近删除”恢复，普通文件夹自身不保证可恢复。";
const encode = encodeURIComponent;
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const print = (value) => console.log(JSON.stringify(value, null, 2));
const required = (value, message) => {
  if (!value) throw new ClientError(message);
  return value;
};
function integer(value, fallback, maximum) {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < 1 || n > maximum)
    throw new ClientError(`数量必须为1到${maximum}的整数`);
  return n;
}
function save(path, value, exclusive = false) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
    flag: exclusive ? "wx" : "w",
  });
  chmodSync(path, 0o600);
}
function verifiedFile(file, path) {
  const bytes = readFileSync(path);
  if (
    bytes.length !== file.size ||
    createHash("sha256").update(bytes).digest("hex") !== file.sha256
  )
    throw new ClientError("文件在生成清单后发生变化，请重新检查文件再上传");
  return bytes;
}
function redacted(value) {
  if (Array.isArray(value)) return value.map(redacted);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/url|token|credential/i.test(key))
        .map(([key, item]) => [key, redacted(item)]),
    );
  return value;
}
const summarize = (items) => ({
  total: items.length,
  successCount: items.filter((i) => i.status === "success").length,
  failureCount: items.filter((i) => i.status === "failed").length,
  unknownCount: items.filter((i) => i.status === "unknown").length,
  items,
});

async function main() {
  const command = process.argv[2];
  if (!command || command === "--help") {
    console.log(
      "用法：node skills/material-library/scripts/material-library.mjs <命令> [JSON参数或@参数文件]\n命令：list、folder-create、upload、use、download、delete-prepare、delete、restore\n从技能包根目录credentials.json读取aiGameServerUrl与shaperToken。参见references/external-tools.md。",
    );
    return;
  }
  const fields = {
    list: [
      "category",
      "parentId",
      "keyword",
      "page",
      "pageSize",
      "queryId",
      "direction",
    ],
    "folder-create": ["name", "parentId"],
    upload: ["paths", "mode", "folderId", "parentId", "projectName"],
    use: ["selections"],
    download: ["selections", "output"],
    "delete-prepare": ["selections"],
    delete: ["planId", "confirmation"],
    restore: ["selections"],
  };
  if (!fields[command]) throw new ClientError("不支持的命令，请先运行--help");
  const raw = process.argv[3] ?? "{}";
  const args = raw.startsWith("@")
    ? json(resolve(raw.slice(1)))
    : JSON.parse(raw);
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    Object.keys(args).some((k) => !fields[command].includes(k))
  )
    throw new ClientError("参数必须是当前命令支持的JSON对象");
  // Read the workspace containing this skill, regardless of the caller's current directory.
  const credentials = existsSync(resolve(root, "credentials.json"))
    ? json(resolve(root, "credentials.json"))
    : {};
  const base = required(
    (process.env.AI_GAME_SERVER_URL || credentials.aiGameServerUrl || "")
      .trim()
      .replace(/\/+$/, ""),
    "缺少后台地址，请从Shaper重新下载技能包",
  );
  const endpoint = new URL(base);
  if (
    !["http:", "https:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new ClientError("后台地址必须为不含凭据、查询参数的HTTP(S)地址");
  const token = required(
    (process.env.SHAPER_TOKEN || credentials.shaperToken || "").trim(),
    "缺少shaperToken，请从Shaper重新下载技能包",
  );
  async function request(path, method = "GET", body, query) {
    const url = new URL(base + path);
    for (const [key, value] of Object.entries(query ?? {}))
      if (value !== undefined && value !== "")
        url.searchParams.set(key, String(value));
    const multipart = body instanceof FormData;
    let response;
    try {
      response = await fetch(url, {
        method,
        redirect: "error",
        headers: {
          accept: "application/json",
          "X-Shaper-Token": token,
          ...(body !== undefined && !multipart
            ? { "content-type": "application/json" }
            : {}),
        },
        ...(body === undefined
          ? {}
          : { body: multipart ? body : JSON.stringify(body) }),
        signal: AbortSignal.timeout(multipart ? 240000 : 20000),
      });
    } catch {
      throw new ClientError(
        method === "POST"
          ? "请求结果未确认，请查询列表核对，勿直接重复操作"
          : "后台不可达，请检查网络或后台地址",
      );
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ClientError(
        uploadRejectedMessage(path, response.status) ||
          "后台未返回有效JSON；写操作结果未确认，请查询列表核对",
      );
    }
    if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
      // Limit messages are generated locally; never expose upstream URLs or tokens.
      const businessCode = Number.isSafeInteger(payload.code)
        ? `，业务码 ${payload.code}`
        : "";
      const error = new ClientError(
        response.status === 401
          ? "授权已失效，请从Shaper重新下载技能包"
          : response.status === 403
            ? "权限不足，请管理员授权素材库菜单和素材库管理技能"
            : payload.code === 50001 &&
                /CloudBase.*环境绑定/.test(payload.msg ?? "")
              ? "素材业务环境未配置（业务码 50001），请管理员检查素材服务的业务与CloudBase环境绑定"
              : uploadRejectedMessage(path, response.status, payload) ||
                `素材请求失败（HTTP ${response.status}${businessCode}），请核对参数和素材列表`,
      );
      error.uncertain = response.status >= 500;
      throw error;
    }
    return path === "/api/v1/me"
      ? payload
      : required(payload.data, "接口结果缺失，请刷新列表核对，勿重复写操作");
  }
  // Bind local snapshots to the authenticated puid and backend; never use the local user UUID.
  const profile = await request("/api/v1/me");
  const owner = required(profile.user?.subject, "后台未返回已认证用户身份");
  const { spaceId } = await request("/api/v1/asset-spaces", "POST", {});
  required(spaceId, "素材空间不可用");
  const prefix = `/api/v1/asset-spaces/${encode(spaceId)}`;
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  function pathFor(id) {
    if (!/^[a-f0-9-]{36}$/.test(id ?? ""))
      throw new ClientError("操作ID无效，请重新查询");
    return resolve(stateDir, id + ".json");
  }
  function record(id, kind) {
    const row = json(pathFor(id));
    if (
      row.kind !== kind ||
      row.owner !== owner ||
      row.base !== base ||
      row.spaceId !== spaceId ||
      row.expiresAt < Date.now()
    )
      throw new ClientError("选择或计划已过期、身份或空间已改变，请重新查询");
    return row;
  }
  function store(kind, data) {
    const id = randomUUID();
    save(
      pathFor(id),
      { kind, owner, base, spaceId, expiresAt: Date.now() + 1800000, ...data },
      true,
    );
    return id;
  }
  function selections(deleted) {
    if (
      !Array.isArray(args.selections) ||
      args.selections.length < 1 ||
      args.selections.length > 100
    )
      throw new ClientError("请选择1到100项真实列表返回的selectionId");
    return [
      ...new Map(
        args.selections.map((selection) => {
          if (
            typeof selection !== "string" ||
            !/^[a-f0-9-]{36}:\d+$/.test(selection)
          )
            throw new ClientError("选择ID无效，请重新查询");
          const [id, index] = String(selection).split(":");
          const row = record(id, "list");
          const item = /^\d+$/.test(index ?? "")
            ? row.items[Number(index)]
            : undefined;
          if (!item || Boolean(item.deleted) !== deleted)
            throw new ClientError("选择无效，请在对应素材列表重新选择");
          return [item.type + ":" + item.id, item];
        }),
      ).values(),
    ];
  }
  const directory = (parentId, page = 1) =>
    request(prefix + "/entries", "GET", undefined, {
      parentId,
      page,
      pageSize: 100,
    });
  async function expand(roots, download) {
    const targets = new Map(),
      visited = new Set();
    async function visit(item, depth) {
      if (depth > 10 || targets.size >= 1000)
        throw new ClientError(
          "本次内容过多，请选择更小的文件夹（最多1000项/10层）",
        );
      if (item.type === "file" || (item.type === "project" && !download)) {
        targets.set(item.type + ":" + item.id, item);
        return;
      }
      const folderId = item.folderId || item.id;
      if (visited.has(folderId)) return;
      visited.add(folderId);
      let page = 1,
        pages;
      do {
        const data = await directory(folderId, page);
        pages = Math.max(
          1,
          Math.ceil(data.files.total / (data.files.pageSize || 100)),
        );
        if (pages > 100) throw new ClientError("文件夹过大，请分批操作");
        for (const file of data.files.records)
          await visit(
            {
              type: "file",
              id: file.fileId,
              name: item.name + "/" + file.name,
              sizeBytes: file.sizeBytes,
            },
            depth + 1,
          );
        if (page === 1)
          for (const folder of data.folders)
            await visit(
              {
                type: folder.projectId ? "project" : "folder",
                id: folder.projectId || folder.folderId,
                folderId: folder.folderId,
                name: item.name + "/" + folder.name,
              },
              depth + 1,
            );
      } while (++page <= pages);
      if (!download)
        targets.set("folder:" + folderId, {
          ...item,
          type: "folder",
          id: folderId,
        });
    }
    for (const item of roots) await visit(item, 0);
    if (targets.size > 1000)
      throw new ClientError("内容超过1000项，请分批操作");
    return [...targets.values()];
  }
  if (command === "list") {
    let query = {
      category: args.category ?? "all",
      page: integer(args.page, 1, 100000),
      pageSize: integer(args.pageSize, 20, 100),
      parentId: args.parentId,
      keyword: args.keyword,
    };
    if (args.queryId) {
      if (
        !["next", "previous"].includes(args.direction) ||
        Object.keys(args).some((k) => !["queryId", "direction"].includes(k))
      )
        throw new ClientError("翻页仅传queryId和direction");
      const previous = record(args.queryId, "list");
      query = {
        ...previous.query,
        page:
          args.direction === "previous"
            ? Math.max(1, previous.query.page - 1)
            : previous.hasNext
              ? previous.query.page + 1
              : previous.query.page,
      };
    } else if (args.direction) throw new ClientError("翻页前请查询第一页");
    if (
      ![
        "all",
        "image",
        "audio",
        "video",
        "spine",
        "model",
        "document",
        "font",
        "other",
        "trash",
      ].includes(query.category)
    )
      throw new ClientError("素材分类无效");
    const trash = query.category === "trash";
    const data = await request(
      prefix + (trash ? "/files/trash" : "/entries"),
      "GET",
      undefined,
      {
        ...query,
        category: undefined,
        fileCategory: ["all", "trash"].includes(query.category)
          ? undefined
          : query.category,
      },
    );
    const files = trash ? data : data.files;
    query.pageSize = files.pageSize || query.pageSize;
    const items = trash
      ? files.records.map((entry) => {
          const item = entry.type === "project" ? entry.project : entry.file;
          return {
            type: entry.type === "project" ? "project" : "file",
            id: item.projectId || item.fileId,
            name: item.originalFileName || item.name,
            deleted: true,
            sizeBytes: item.sizeBytes,
            deletedAt: item.deletedAt,
            expiresAt: item.expiresAt,
          };
        })
      : [
          ...(query.page === 1
            ? data.folders
                .filter(
                  (f) =>
                    f.name
                      .toLocaleLowerCase()
                      .includes(
                        (query.keyword || "").trim().toLocaleLowerCase(),
                      ),
                )
                .map((f) => ({
                  type: f.projectId ? "project" : "folder",
                  id: f.projectId || f.folderId,
                  folderId: f.folderId,
                  name: f.name,
                }))
            : []),
          ...files.records.map((f) => ({
            type: "file",
            id: f.fileId,
            name: f.name,
            sizeBytes: f.sizeBytes,
          })),
        ];
    const hasNext = query.page * query.pageSize < files.total;
    const queryId = store("list", { query, items, hasNext });
    print({
      ...query,
      queryId,
      sourceTotal: files.total,
      hasNext,
      hasPrevious: query.page > 1,
      items: items.map((item, index) => ({
        ...item,
        selectionId: queryId + ":" + index,
      })),
    });
  } else if (command === "folder-create") {
    const name = typeof args.name === "string" ? args.name.trim() : "";
    if (
      !name ||
      name.length > 255 ||
      [".", ".."].includes(name) ||
      /[/\\\x00\r\n]/.test(name) ||
      (args.parentId !== undefined &&
        (typeof args.parentId !== "string" ||
          !args.parentId.trim() ||
          args.parentId.length > 255))
    )
      throw new ClientError(
        "文件夹名称需为1–255个字符，不能为.或..，不能包含路径分隔符或换行；parentId需为真实目录ID",
      );
    const folder = await request(prefix + "/folders", "POST", {
      name,
      ...(args.parentId ? { parentId: args.parentId } : {}),
    });
    if (!folder?.folderId)
      throw new ClientError(
        "文件夹创建结果未确认，请刷新列表核对，勿重复创建或开始上传",
      );
    print({
      folderId: folder.folderId,
      name: folder.name,
      parentId: args.parentId,
    });
  } else if (command === "upload") {
    const mode = args.mode ?? "files";
    if (
      !["files", "spine", "spine-zip"].includes(mode) ||
      !Array.isArray(args.paths) ||
      !args.paths.length ||
      args.paths.some((path) => typeof path !== "string" || !path.trim())
    )
      throw new ClientError("请指定上传模式和本地文件paths");
    let localFiles;
    try {
      localFiles = args.paths.map((path) => {
        const info = statSync(resolve(path));
        if (!info.isFile()) throw new Error();
        return { size: info.size };
      });
    } catch {
      throw new ClientError(
        "读取本地文件失败，请提供可读取的文件路径，动画目录先展开为文件清单",
      );
    }
    const limitIssue = uploadLimitIssue(mode, localFiles);
    if (limitIssue) throw new ClientError(limitIssue);
    if (
      (mode !== "files" && args.folderId !== undefined) ||
      (mode === "files" && args.parentId !== undefined) ||
      (mode !== "spine-zip" && args.projectName) ||
      (args.projectName !== undefined &&
        (typeof args.projectName !== "string" ||
          /[/\\\x00\r\n]/.test(args.projectName)))
    )
      throw new ClientError(
        "普通文件使用folderId；动画目录和ZIP使用parentId指定普通文件夹；projectName仅用于动画ZIP",
      );
    if (
      args.parentId !== undefined &&
      (typeof args.parentId !== "string" ||
        !args.parentId.trim() ||
        args.parentId.length > 255)
    )
      throw new ClientError(
        "parentId必须为已确认普通文件夹的真实ID；上传到根目录时请省略",
      );
    const result = spawnSync(
      "python3",
      [
        resolve(scriptDir, "upload.py"),
        "manifest",
        "--mode",
        mode,
        ...args.paths.map((path) => resolve(path)),
      ],
      { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
    );
    if (result.status !== 0)
      throw new ClientError("读取本地文件失败，请检查Python3及文件路径");
    const manifest = JSON.parse(result.stdout);
    if (
      mode === "spine" &&
      (new Set(manifest.files.map((file) => file.name)).size !==
        manifest.files.length ||
        new Set(manifest.files.map((file) => file.name.split("/")[0])).size !==
          1)
    )
      throw new ClientError("动画项目路径重复或包含多个项目，请分项目上传");
    const manifestIssue = uploadLimitIssue(mode, manifest.files);
    if (manifestIssue) throw new ClientError(manifestIssue);
    const rejected = manifest.files
      .map((file, index) => ({
        name: file.name,
        index,
        message: formatError(file, mode),
      }))
      .filter((f) => f.message);
    if (mode !== "files" && rejected.length)
      throw new ClientError("动画项目必须完整上传，请先修正不支持的格式或路径");
    const accepted = manifest.files
      .map((file, index) => ({ ...file, index }))
      .filter((f) => !rejected.some((r) => r.index === f.index));
    if (!accepted.length) {
      print(summarize(rejected.map((f) => ({ ...f, status: "failed" }))));
      return;
    }
    const form = new FormData();
    for (const file of accepted) {
      const i = file.index;
      if (mode === "spine-zip" && !/\.zip$/i.test(file.name))
        throw new ClientError("动画压缩包必须为ZIP");
      form.append(
        mode === "spine-zip" ? "file" : "files",
        new Blob([verifiedFile(file, manifest.localPaths[i])], {
          type: file.mime,
        }),
        file.name,
      );
    }
    if (args.folderId) form.append("folderId", args.folderId);
    if (args.parentId) form.append("parentId", args.parentId);
    if (args.projectName) form.append("name", args.projectName);
    const data = await request(
      prefix +
        "/" +
        (mode === "files"
          ? "files/upload/batch"
          : mode === "spine"
            ? "spine/upload"
            : "spine/upload-zip"),
      "POST",
      form,
    );
    // Report per-file evidence, never turn a successful HTTP response into blanket success.
    const items = accepted.map((file, index) => {
      const names = [file.name, file.name.slice(file.name.indexOf("/") + 1)];
      const skipped =
        mode === "spine" &&
        data.skipped?.find((item) => names.includes(item.path));
      const item =
        mode === "files"
          ? data.items?.find((i) => i.index === index)
          : mode === "spine"
            ? data.files?.find((i) => names.includes(i.relativePath))
            : undefined;
      const success =
        mode === "files"
          ? item?.file?.fileId && !item.error
          : mode === "spine"
            ? item?.fileId
            : data.folder?.folderId &&
              data.fileCount > 0 &&
              data.skippedCount === 0;
      return {
        name: file.name,
        status: success
          ? "success"
          : item?.error || skipped
            ? "failed"
            : "unknown",
        ...(item?.error || skipped
          ? {
              message:
                "该文件上传失败或被跳过，请检查项目完整性、支持格式和素材服务状态",
            }
          : {}),
      };
    });
    print({
      ...summarize([
        ...items,
        ...rejected.map((f) => ({ ...f, status: "failed" })),
      ]),
      ...(mode !== "files" ? { project: redacted(data) } : {}),
    });
  } else if (command === "download" || command === "use") {
    if (command === "download")
      required(args.output, "请指定新的输出目录output");
    const targets = await expand(selections(false), true),
      items = [];
    for (let i = 0; i < targets.length; i += 100) {
      const batch = targets.slice(i, i + 100);
      const urls = await request(prefix + "/files/download-urls", "POST", {
        fileIds: batch.map((t) => t.id),
      });
      for (const item of batch) {
        const url = urls.find((u) => u.fileId === item.id)?.url;
        items.push({
          ...item,
          status: url ? "success" : "failed",
          ...(url ? { url } : {}),
        });
      }
    }
    if (command === "use") {
      print({
        ...summarize(items),
        stage: "urls_ready",
        message:
          "仅取得原文件地址，尚未下载或接入应用。普通素材优先使用可公开访问的原始 URL；签名/过期地址仅供下载，不能写入应用。Spine 必须下载到项目保留相对路径加载。禁止用 base64 或素材库 UI 图标、缩略图替代原文件。参见 references/use.md。",
      });
      return;
    }
    const payload = resolve(stateDir, randomUUID() + ".json");
    save(payload, { items }, true);
    let result;
    try {
      result = spawnSync(
        "python3",
        [resolve(scriptDir, "download.py"), payload, resolve(args.output)],
        { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
      );
    } finally {
      unlinkSync(payload);
    }
    if (result.status !== 0)
      throw new ClientError(
        "下载未完成，请检查Python3、网络及输出目录（目录必须尚不存在）",
      );
    print(JSON.parse(result.stdout));
  } else if (command === "delete-prepare") {
    const targets = await expand(selections(false), false);
    const planId = store("delete", { targets, status: "pending" });
    print({
      planId,
      targets,
      warning: WARNING,
      message:
        "请展示完整清单和风险，等待用户明确回复确认删除，再执行delete；准备步骤未删除素材。",
    });
  } else {
    let targets, row;
    if (command === "delete") {
      if (args.confirmation !== "确认删除")
        throw new ClientError(
          "尚未确认：展示完整清单和风险后，等待用户明确回复“确认删除”",
        );
      row = record(args.planId, "delete");
      if (row.status !== "pending") {
        print({
          status: row.status,
          result: row.result,
          message: "该计划已执行或结果未确认，禁止重复删除，请核对列表",
        });
        return;
      }
      // An exclusive claim prevents concurrent or uncertain retries from replaying a plan.
      const lock = openSync(pathFor(args.planId) + ".lock", "wx", 0o600);
      closeSync(lock);
      targets = row.targets;
      row.status = "running";
      save(pathFor(args.planId), row);
    } else targets = selections(true);
    const items = [];
    for (const item of targets) {
      try {
        let data;
        if (command === "restore" || item.type === "project") {
          data = await request(
            `${prefix}/${item.type === "project" ? "spine/projects" : "files"}/${encode(item.id)}/${command === "restore" ? "restore" : "delete"}`,
            "POST",
          );
          items.push({
            ...item,
            status: Number(data.skippedCount ?? 0) > 0 ? "unknown" : "success",
            result: redacted(data),
          });
        } else {
          const folder = item.type === "folder";
          data = await request(prefix + "/files/batch-delete", "POST", {
            fileIds: folder ? [] : [item.id],
            folderIds: folder ? [item.id] : [],
          });
          const failed = data.failed?.find(
            (f) => (f.folderId || f.fileId) === item.id,
          );
          const success =
            (folder ? data.deletedFolderCount : data.deletedCount) === 1 ||
            (folder ? data.deletedFolders : data.deleted)?.some(
              (f) => (f.folderId || f.fileId) === item.id,
            );
          items.push({
            ...item,
            status: failed ? "failed" : success ? "success" : "unknown",
            ...(failed
              ? {
                  message:
                    "删除失败，请刷新列表检查素材是否存在、文件夹是否为空及是否仍有权限",
                }
              : {}),
          });
        }
      } catch (error) {
        items.push({
          ...item,
          status: error.uncertain === false ? "failed" : "unknown",
          message:
            error instanceof ClientError
              ? error.message
              : "操作结果未确认，请刷新素材列表核对",
        });
      }
    }
    const result = summarize(items);
    if (row) {
      row.status = "complete";
      row.result = result;
      save(pathFor(args.planId), row);
    }
    print({ ...result, ...(row ? { message: WARNING } : {}) });
  }
}
main().catch((error) => {
  print({
    ok: false,
    message:
      error instanceof ClientError
        ? error.message
        : "操作未完成，请检查JSON参数、本地文件及运行环境；若已发起写操作，请先核对素材列表，勿直接重试",
  });
  process.exitCode = 1;
});
