/**
 * 错误码模块（design §10.7 / D21 / ADR-35）。
 *
 * **边界**：SDK 不自行推断「这个错误能不能重试」。
 * `retryable` 是**服务端**在响应体 `error.retryable` 里给的权威判断（D21），
 * 因为错误码 → 可否重试的映射属于平台语义，新增错误码时老 SDK 也必须能正确决策。
 *
 * 本模块里的 `retryable` 只作为**离线默认值与文档**：
 * - 服务端给了 `error.retryable` → 以服务端为准（见 `resolveRetryable`）；
 * - 服务端没给（老服务端 / 传输层伪造的错误）→ 回退到这里的默认值；
 * - **未知错误码 → 保守不重试**（design §10.2）。
 */
/**
 * design §10.7 的错误码全集。
 *
 * 本表**逐条**对应设计稿的表格；`errors.test.ts` 有一条用例断言集合一致，
 * 增删码必须同时改设计与本表（否则用例变红）。
 */
export const ERROR_CODES = {
    /** 协议主版本不兼容。升级 SDK，不要重试。 */
    PROTOCOL_UNSUPPORTED: "PROTOCOL_UNSUPPORTED",
    /** 回放验收不通过。修正规则 / 定义，不要重试。 */
    REPLAY_VERIFY_FAILED: "REPLAY_VERIFY_FAILED",
    /** 规则版本缺失或已下线。修正定义，不要重试。 */
    RULE_VERSION_MISSING: "RULE_VERSION_MISSING",
    /** 定义校验失败（§4.3 五条硬性校验）。修正定义，不要重试。 */
    DEFINITION_INVALID: "DEFINITION_INVALID",
    /** 作用域类型未在该工作区注册或未开放。在定义中注册该作用域类型。 */
    SCOPE_TYPE_DISABLED: "SCOPE_TYPE_DISABLED",
    /** 共享指标未登记；当前版本拒绝 `shared:true`。修正定义，不要重试。 */
    SHARED_RESOURCE_UNKNOWN: "SHARED_RESOURCE_UNKNOWN",
    /** 请求携带的工作区不存在或已停用。校验身份与工作区，不要重试。 */
    WORKSPACE_UNKNOWN: "WORKSPACE_UNKNOWN",
    /** 上报的 `streamKey` 不在定义中匹配任何 `streamPattern`。修正定义或上报，不要重试。 */
    STREAM_UNKNOWN: "STREAM_UNKNOWN",
    /** `expectedVersion` 不匹配（并发上报）。重新拉取后重试一次。 */
    STREAM_VERSION_CONFLICT: "STREAM_VERSION_CONFLICT",
    /** 上报的点时间早于流 `last_update_time`。修正上报时间，不要重试。 */
    POINT_IN_PAST: "POINT_IN_PAST",
    /** 批量条数超上限（§10.3）。拆分后重试。 */
    BATCH_TOO_LARGE: "BATCH_TOO_LARGE",
    /** 头与请求体的幂等键不一致。修正 SDK 调用，不要重试。 */
    IDEMPOTENCY_KEY_MISMATCH: "IDEMPOTENCY_KEY_MISMATCH",
    /** 签名错误。校准时钟并重签，不要重试。 */
    SIGNATURE_INVALID: "SIGNATURE_INVALID",
    /** 时间窗超出 ±5 分钟。校准时钟并重签，不要重试。 */
    TIMESTAMP_EXPIRED: "TIMESTAMP_EXPIRED",
    /** 触达工作区 QPS 上限。按 `Retry-After` 退避（§10.11）。 */
    RATE_LIMITED: "RATE_LIMITED",
    /** `taskKey` 不在当前定义版本中。修正定义，不要重试。 */
    TASK_UNKNOWN: "TASK_UNKNOWN",
    /** 选择器含非白名单字段或 SQL 片段（§11.2b）。修正定义，不要重试。 */
    TASK_SELECTOR_INVALID: "TASK_SELECTOR_INVALID",
    /** 动作不在五种白名单内。修正定义，不要重试。 */
    TASK_ACTION_NOT_ALLOWED: "TASK_ACTION_NOT_ALLOWED",
    /** 该工作区任务配额用尽。退避重试；必要时调低频率。 */
    TASK_QUOTA_EXCEEDED: "TASK_QUOTA_EXCEEDED",
    /** 同作用域已有在飞结算。按 `settlementId` 轮询，不要重复提交。 */
    SETTLE_IN_PROGRESS: "SETTLE_IN_PROGRESS",
    /** 请求携带的区间已过期。用响应中的权威 `from/to` 重试一次。 */
    SETTLE_STALE_RANGE: "SETTLE_STALE_RANGE",
    /** 超事件循环硬上限，需续算。用返回的 `resumeCursor` 继续调用。 */
    NEED_RESUME: "NEED_RESUME",
    /** 流状态缺失或事件未就绪。补报后重试；连续失败则告警。 */
    DATA_INCOMPLETE: "DATA_INCOMPLETE",
    /** 回执的 `settlementId` 平台不存在。校验传参，不要重试。 */
    ACK_UNKNOWN_SETTLE: "ACK_UNKNOWN_SETTLE",
    /** 该工作区配额或熔断。退避重试；必要时降级该工作区。 */
    QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
    /** 检测到时间回拨（审计码，非拒绝）。记录并告警，不重试。 */
    CLOCK_REGRESSION: "CLOCK_REGRESSION",
    /** 作用域已冻结或关闭，拒绝新权益与结算。需要由业务侧重建有效作用域。 */
    SCOPE_LIFECYCLE_FROZEN: "SCOPE_LIFECYCLE_FROZEN",
    /** 作用域生命周期迁移不合法。修正状态机调用。 */
    SCOPE_LIFECYCLE_INVALID: "SCOPE_LIFECYCLE_INVALID",
};
/**
 * design §10.7 的**离线默认** retryable 映射（服务端未给 `error.retryable` 时的回退）。
 *
 * 取值依据设计稿「调用方动作」一列：
 * - 写「不要重试 / 修正后重试」→ `false`
 * - 写「重试一次 / 退避重试 / 补报后重试 / 继续调用」→ `true`
 *
 * 注意 `CLOCK_REGRESSION` 是**审计码而非拒绝**（design §10.7 明确），
 * 它本身不代表请求失败，故为 `false`。
 */
const DEFAULT_RETRYABLE = {
    PROTOCOL_UNSUPPORTED: false,
    REPLAY_VERIFY_FAILED: false,
    RULE_VERSION_MISSING: false,
    DEFINITION_INVALID: false,
    SCOPE_TYPE_DISABLED: false,
    SHARED_RESOURCE_UNKNOWN: false,
    WORKSPACE_UNKNOWN: false,
    STREAM_UNKNOWN: false,
    STREAM_VERSION_CONFLICT: true,
    POINT_IN_PAST: false,
    BATCH_TOO_LARGE: true,
    IDEMPOTENCY_KEY_MISMATCH: false,
    SIGNATURE_INVALID: false,
    TIMESTAMP_EXPIRED: false,
    RATE_LIMITED: true,
    TASK_UNKNOWN: false,
    TASK_SELECTOR_INVALID: false,
    TASK_ACTION_NOT_ALLOWED: false,
    TASK_QUOTA_EXCEEDED: true,
    SETTLE_IN_PROGRESS: true,
    SETTLE_STALE_RANGE: true,
    NEED_RESUME: true,
    DATA_INCOMPLETE: true,
    ACK_UNKNOWN_SETTLE: false,
    QUOTA_EXCEEDED: true,
    CLOCK_REGRESSION: false,
    SCOPE_LIFECYCLE_FROZEN: false,
    SCOPE_LIFECYCLE_INVALID: false,
};
/** 类型守卫：该错误码是否在设计 §10.7 的已知集合内。 */
export function isKnownErrorCode(code) {
    return Object.prototype.hasOwnProperty.call(ERROR_CODES, code);
}
/**
 * 离线默认值。**未知码返回 `false`**（保守不重试，design §10.2）。
 */
export function defaultRetryable(code) {
    return isKnownErrorCode(code) ? DEFAULT_RETRYABLE[code] : false;
}
/**
 * 解析最终 retryable：**服务端优先，未知码保守不重试**。
 *
 * 这是 SDK 唯一允许用来决定「是否重试」的入口（`retry` 模块只调它）。
 * 服务端显式给了布尔值就照用——哪怕与本地默认值冲突，因为服务端知道
 * 当前的错误码语义（新增码时老 SDK 的本地表必然过期）。
 */
export function resolveRetryable(error) {
    if (typeof error.retryable === "boolean") {
        return error.retryable;
    }
    return defaultRetryable(error.code);
}
/**
 * 协议错误：把响应体的 `error` 包装成可 `throw` 的对象，保留 `requestId` 便于排障。
 *
 * `retryable` 在构造时就已由 `resolveRetryable` 定好——调用方不需要（也不应该）
 * 再按 `code` 自行判断。
 */
export class ProtocolError extends Error {
    code;
    retryable;
    retryAfterMs;
    details;
    requestId;
    httpStatus;
    constructor(error, options = {}) {
        super(error.message ?? `协议错误 ${error.code}`);
        this.name = "ProtocolError";
        this.code = error.code;
        this.retryable = resolveRetryable(error);
        if (error.retryAfterMs !== undefined) {
            this.retryAfterMs = error.retryAfterMs;
        }
        if (error.details !== undefined) {
            this.details = error.details;
        }
        if (options.requestId !== undefined) {
            this.requestId = options.requestId;
        }
        if (options.httpStatus !== undefined) {
            this.httpStatus = options.httpStatus;
        }
    }
}
//# sourceMappingURL=index.js.map