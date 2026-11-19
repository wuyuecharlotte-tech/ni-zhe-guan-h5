"use strict";
/**
 * 退避重试模块（design §7.5 / §10.2 / §10.6）。
 *
 * **唯一硬约束**：只对**幂等接口**重试。
 * 非幂等接口进入重试循环 = 可能产生第二个副作用（重复扣款 / 重复发货），
 * 因此本模块在**调用前**就用 `idempotent` 标志把这条路封死：
 * 非幂等请求只执行一次，失败直接抛错（AC11 的证伪点）。
 *
 * 是否重试由**错误自身**决定（`ProtocolError.retryable`，源自服务端 D21），
 * 本模块不按错误码自行推断——`retryable=false` 的错误立刻抛出，
 * 哪怕接口本身是幂等的。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeBackoffMs = computeBackoffMs;
exports.withRetry = withRetry;
const index_js_1 = require("../errors/index.js");
/** 默认休眠：`setTimeout` 的 Promise 包装。 */
const defaultSleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
/**
 * 计算第 `attempt` 次（1 起）重试的退避时长。
 *
 * 公式：`min(base * 2^(attempt-1), max)`，再乘 `(1 + jitter)`。
 * 若错误自带 `retryAfterMs`（如 `RATE_LIMITED` 的 `Retry-After`，§10.7），
 * 它作为**下限**：退避时长取 `max(指数退避, retryAfterMs)`，即**绝不早于**服务端要求的时间。
 * 不直接取 `retryAfterMs` 而取两者较大值，是因为服务端给的是「最早可再来」的时刻——
 * 比它更早重试是协议违规；比它稍晚（含抖动）则无害。
 */
function computeBackoffMs(attempt, options = {}, error) {
    const base = options.baseDelayMs ?? 200;
    const max = options.maxDelayMs ?? 10_000;
    const jitterRatio = options.jitterRatio ?? 0.2;
    const random = options.random ?? Math.random;
    const serverHint = error instanceof index_js_1.ProtocolError ? error.retryAfterMs : undefined;
    const exponential = Math.min(base * 2 ** Math.max(0, attempt - 1), max);
    const ceiling = serverHint !== undefined ? Math.max(exponential, serverHint) : exponential;
    const jitter = ceiling * jitterRatio * random();
    return Math.round(ceiling + jitter);
}
/**
 * 带退避的执行器。
 *
 * - `idempotent: false` → **只执行一次**，失败原样抛出（不进入循环）；
 * - `idempotent: true`  → 仅当错误 `retryable=true` 且未超上限时重试；
 * - 非 `ProtocolError`（如网络异常）在幂等路径上视为可重试，非幂等路径直接抛。
 */
async function withRetry(operation, options) {
    const maxRetries = options.maxRetries ?? 3;
    const sleep = options.sleep ?? defaultSleep;
    // 非幂等：跑一次就结束。这是硬边界，不因错误类型而放宽。
    if (!options.idempotent) {
        return operation();
    }
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
            return await operation();
        }
        catch (error) {
            lastError = error;
            // 服务端说不可重试 → 立即抛出，不消耗重试预算。
            if (error instanceof index_js_1.ProtocolError && !error.retryable) {
                throw error;
            }
            const isLastAttempt = attempt >= maxRetries;
            if (isLastAttempt) {
                break;
            }
            const delayMs = computeBackoffMs(attempt + 1, options, error);
            options.onRetry?.({ attempt: attempt + 1, delayMs, error });
            await sleep(delayMs);
        }
    }
    throw lastError;
}
//# sourceMappingURL=index.js.map