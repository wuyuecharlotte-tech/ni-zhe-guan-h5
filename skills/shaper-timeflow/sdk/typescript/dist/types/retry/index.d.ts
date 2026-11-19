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
export interface RetryOptions {
    /**
     * 该接口是否幂等。**`false` 时不会进入重试循环**（只跑一次）。
     * 这个标志是调用方的显式声明，不是从错误里推断的——因为
     * 「这个请求重发一次是否安全」是接口的静态属性，与失败原因无关。
     */
    idempotent: boolean;
    /** 最大**额外**重试次数（不含首次）。默认 3。 */
    maxRetries?: number;
    /** 首次退避基数（ms）。默认 200（design §10.6 的指数退避）。 */
    baseDelayMs?: number;
    /** 退避上限（ms）。默认 10_000。 */
    maxDelayMs?: number;
    /** 抖动比例 0..1，默认 0.2（防「退避同步」造成的重试风暴）。 */
    jitterRatio?: number;
    /** 随机源，便于测试注入确定性实现。默认 `Math.random`。 */
    random?: () => number;
    /** 休眠函数，便于测试注入（不真等）。默认 `setTimeout`。 */
    sleep?: (ms: number) => Promise<void>;
    /** 每次重试前的钩子（观测 / 日志）。 */
    onRetry?: (info: {
        attempt: number;
        delayMs: number;
        error: unknown;
    }) => void;
}
/**
 * 计算第 `attempt` 次（1 起）重试的退避时长。
 *
 * 公式：`min(base * 2^(attempt-1), max)`，再乘 `(1 + jitter)`。
 * 若错误自带 `retryAfterMs`（如 `RATE_LIMITED` 的 `Retry-After`，§10.7），
 * 它作为**下限**：退避时长取 `max(指数退避, retryAfterMs)`，即**绝不早于**服务端要求的时间。
 * 不直接取 `retryAfterMs` 而取两者较大值，是因为服务端给的是「最早可再来」的时刻——
 * 比它更早重试是协议违规；比它稍晚（含抖动）则无害。
 */
export declare function computeBackoffMs(attempt: number, options?: Pick<RetryOptions, "baseDelayMs" | "maxDelayMs" | "jitterRatio" | "random">, error?: unknown): number;
/**
 * 带退避的执行器。
 *
 * - `idempotent: false` → **只执行一次**，失败原样抛出（不进入循环）；
 * - `idempotent: true`  → 仅当错误 `retryable=true` 且未超上限时重试；
 * - 非 `ProtocolError`（如网络异常）在幂等路径上视为可重试，非幂等路径直接抛。
 */
export declare function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T>;
//# sourceMappingURL=index.d.ts.map