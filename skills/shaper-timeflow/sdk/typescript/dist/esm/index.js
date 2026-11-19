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
// ---- errors ----------------------------------------------------------------
export { ERROR_CODES, ProtocolError, defaultRetryable, isKnownErrorCode, resolveRetryable, } from "./errors/index.js";
// ---- idempotency -----------------------------------------------------------
export { MemoryIdempotencyStore, deriveIdempotencyKey, identityOf, registerIdempotencyKey, resolveIdempotencyKey, } from "./idempotency/index.js";
// ---- retry -----------------------------------------------------------------
export { computeBackoffMs, withRetry } from "./retry/index.js";
// ---- client ----------------------------------------------------------------
export { FetchTransport, ProtocolClient, createHmacSigner, } from "./client/index.js";
// ---- report ----------------------------------------------------------------
export { appliedDigest, canonicalAmount, parseTimeline, REPORT_APPLIED_DIGEST, snapshotConservation, } from "./report/index.js";
//# sourceMappingURL=index.js.map