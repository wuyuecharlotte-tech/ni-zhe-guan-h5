"use strict";
/**
 * `@hupu/shaper-timeflow-protocol-sdk` 公共入口（design §14.1 的六个模块）。
 *
 * | 模块 | 职责 | 边界 |
 * |---|---|---|
 * | `dto` | 协议 DTO（**生成物**，源自 `docs/schema/*.json`） | 禁止手写 |
 * | `errors` | 错误码 + `retryable` 透传 | `retryable` 由服务端决定（D21） |
 * | `idempotency` | 幂等键生成 + 持久化重放 | 键由调用方可见可存；重投原样重放 |
 * | `retry` | 幂等接口的指数退避 + 抖动 | 非幂等接口零重试 |
 * | `client` | 上行客户端骨架 + 可注入 transport | 不替调用方决定 `from` / `to` |
 * | `report` | 报告解析辅助（时间轴、金额快照、报告回执摘要） | 纯函数，不改报告 |
 *
 * 运行时**零依赖**：只用 `fetch` 与 `node:crypto`（后者仅签名时懒加载）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.snapshotConservation = exports.REPORT_APPLIED_DIGEST = exports.parseTimeline = exports.canonicalAmount = exports.appliedDigest = exports.createHmacSigner = exports.ProtocolClient = exports.FetchTransport = exports.withRetry = exports.computeBackoffMs = exports.resolveIdempotencyKey = exports.registerIdempotencyKey = exports.identityOf = exports.deriveIdempotencyKey = exports.MemoryIdempotencyStore = exports.resolveRetryable = exports.isKnownErrorCode = exports.defaultRetryable = exports.ProtocolError = exports.ERROR_CODES = void 0;
// ---- errors ----------------------------------------------------------------
var index_js_1 = require("./errors/index.js");
Object.defineProperty(exports, "ERROR_CODES", { enumerable: true, get: function () { return index_js_1.ERROR_CODES; } });
Object.defineProperty(exports, "ProtocolError", { enumerable: true, get: function () { return index_js_1.ProtocolError; } });
Object.defineProperty(exports, "defaultRetryable", { enumerable: true, get: function () { return index_js_1.defaultRetryable; } });
Object.defineProperty(exports, "isKnownErrorCode", { enumerable: true, get: function () { return index_js_1.isKnownErrorCode; } });
Object.defineProperty(exports, "resolveRetryable", { enumerable: true, get: function () { return index_js_1.resolveRetryable; } });
// ---- idempotency -----------------------------------------------------------
var index_js_2 = require("./idempotency/index.js");
Object.defineProperty(exports, "MemoryIdempotencyStore", { enumerable: true, get: function () { return index_js_2.MemoryIdempotencyStore; } });
Object.defineProperty(exports, "deriveIdempotencyKey", { enumerable: true, get: function () { return index_js_2.deriveIdempotencyKey; } });
Object.defineProperty(exports, "identityOf", { enumerable: true, get: function () { return index_js_2.identityOf; } });
Object.defineProperty(exports, "registerIdempotencyKey", { enumerable: true, get: function () { return index_js_2.registerIdempotencyKey; } });
Object.defineProperty(exports, "resolveIdempotencyKey", { enumerable: true, get: function () { return index_js_2.resolveIdempotencyKey; } });
// ---- retry -----------------------------------------------------------------
var index_js_3 = require("./retry/index.js");
Object.defineProperty(exports, "computeBackoffMs", { enumerable: true, get: function () { return index_js_3.computeBackoffMs; } });
Object.defineProperty(exports, "withRetry", { enumerable: true, get: function () { return index_js_3.withRetry; } });
// ---- client ----------------------------------------------------------------
var index_js_4 = require("./client/index.js");
Object.defineProperty(exports, "FetchTransport", { enumerable: true, get: function () { return index_js_4.FetchTransport; } });
Object.defineProperty(exports, "ProtocolClient", { enumerable: true, get: function () { return index_js_4.ProtocolClient; } });
Object.defineProperty(exports, "createHmacSigner", { enumerable: true, get: function () { return index_js_4.createHmacSigner; } });
// ---- report ----------------------------------------------------------------
var index_js_5 = require("./report/index.js");
Object.defineProperty(exports, "appliedDigest", { enumerable: true, get: function () { return index_js_5.appliedDigest; } });
Object.defineProperty(exports, "canonicalAmount", { enumerable: true, get: function () { return index_js_5.canonicalAmount; } });
Object.defineProperty(exports, "parseTimeline", { enumerable: true, get: function () { return index_js_5.parseTimeline; } });
Object.defineProperty(exports, "REPORT_APPLIED_DIGEST", { enumerable: true, get: function () { return index_js_5.REPORT_APPLIED_DIGEST; } });
Object.defineProperty(exports, "snapshotConservation", { enumerable: true, get: function () { return index_js_5.snapshotConservation; } });
//# sourceMappingURL=index.js.map