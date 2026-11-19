/**
 * 客户端模块（design §10.2 / §10.6 / §14.1）。
 *
 * **边界**：
 * - 只做「协议机械劳动」：请求头、签名、超时、`protocolVersion` 注入、
 *   响应结构解析、`retryable` 透传；
 * - **不替调用方决定 `from` / `to`**（§14.1）：区间由平台权威时间决定，
 *   SDK 不生成、不推断结算区间；
 * - 不真连服务：`Transport` 可注入，默认实现基于 `fetch`。
 *   服务端协议面尚不存在，注入式传输让「协议正确性」
 *   能被真实断言，而不与「网络可用性」耦合。
 */
/** 一次 HTTP 请求的最小描述（不含认证头之外的任何业务语义）。 */
export interface HttpRequest {
    method: "GET" | "POST" | "PUT" | "DELETE";
    /** 相对路径，如 `/shaper/timeflow/v1/player/123/stream`。 */
    path: string;
    headers: Record<string, string>;
    /** 已序列化的 JSON 请求体；`GET` 时为 `undefined`。 */
    body?: string;
}
/** 一次 HTTP 响应。 */
export interface HttpResponse {
    status: number;
    headers: Record<string, string>;
    /** 原始响应体文本。 */
    body: string;
}
/**
 * 传输层接口。默认实现基于 `fetch`；测试注入内存实现。
 *
 * 这是本模块**唯一的 IO 出口**——所有协议正确性都发生在它之上，
 * 因此换掉它就能在无服务端的情况下端到端验证 §10.2。
 */
export interface Transport {
    send(request: HttpRequest): Promise<HttpResponse>;
}
/**
 * 签名器。默认实现用 HMAC-SHA256。
 *
 * 返回签名串（放 `X-Signature`）。**必须对同一输入可复现**——
 * 否则重试会因为签名不同而被服务端拒绝（§10.8 的时间窗校验）。
 */
export interface Signer {
    sign(canonical: string): Promise<string> | string;
}
/** HMAC-SHA256 签名器（Node 运行时；懒加载 `node:crypto` 以免浏览器打包时硬依赖）。 */
export declare function createHmacSigner(secret: string): Signer;
/** `fetch` 默认传输实现。 */
export declare class FetchTransport implements Transport {
    private readonly baseUrl;
    private readonly fetchImpl;
    constructor(baseUrl: string, fetchImpl?: typeof fetch);
    send(request: HttpRequest): Promise<HttpResponse>;
}
/** 客户端配置。 */
export interface ClientOptions {
    /** 传输层（必填：由调用方决定是直连 fetch、BFF 还是测试桩）。 */
    transport: Transport;
    /** 工作区标识 → `X-Workspace-Id`。 */
    workspaceId: string;
    /** 协议主版本 → `X-Protocol-Version`（不兼容由服务端拒绝，§10.6）。 */
    protocolVersion: number;
    /** 认证统一使用 Shaper 标准 Token → `X-Shaper-Token`。 */
    accessToken?: string;
    /**
     * 签名器 → `X-Signature`。认证直连客户端必须同时提供 `accessToken` 和
     * `signer`；仅通过已认证 BFF 的浏览器客户端可以不提供两者。
     */
    signer?: Signer;
    /** 请求超时（ms）。默认 2000（对齐 §10.1 的接口超时量级）。 */
    timeoutMs?: number;
    /** 时钟注入（毫秒）。默认 `Date.now`。测试用它固定 `X-Timestamp`。 */
    now?: () => number;
    /**
     * 请求追踪 ID 生成器 → `X-Request-Id`。
     *
     * **每次请求都变**（含重试）：它只用于全链路日志关联，**不是幂等键**。
     * 默认实现用 `crypto.randomUUID`（回退到计数器）。
     */
    requestIdFactory?: () => string;
    /**
     * 浏览器经 BFF 调用时，由 BFF 添加服务凭据。此时 SDK 不发送
     * `X-Shaper-Token`/`X-Signature`。默认 `false`，要求 Token + signer。
     */
    delegatedTransport?: boolean;
}
/** 一次调用的可选参数（幂等键 / 请求体 / 是否幂等）。 */
export interface CallOptions<TBody = unknown> {
    method?: HttpRequest["method"];
    body?: TBody;
    /**
     * 幂等键 → `X-Idempotency-Key`。**与 `X-Request-Id` 分离**（§10.2）。
     * 幂等接口必填；缺省时**不写该头**（而不是用 requestId 顶替）。
     */
    idempotencyKey?: string;
    /** 覆盖本次调用的超时。 */
    timeoutMs?: number;
}
/** 调用结果：已解析的响应 + 透传的元信息。 */
export interface CallResult<TData> {
    ok: true;
    data: TData;
    /** 服务端回传的 `requestId`（用于与服务端日志对齐）。 */
    requestId?: string;
    /** 幂等命中回放（§7.5）：本次没有产生新副作用。 */
    replayed: boolean;
    /** 本次请求实际使用的追踪 ID。 */
    sentRequestId: string;
    /** HTTP 状态码。 */
    httpStatus: number;
}
/**
 * 协议客户端。
 *
 * 设计 §10.2 的请求头在这里**一次性构造**，不散落到各接口方法里：
 * `X-Workspace-Id` / `X-Protocol-Version` / `X-Request-Id` / `X-Idempotency-Key` /
 * `X-Timestamp` / `X-Signature`。
 */
export declare class ProtocolClient {
    private readonly transport;
    private readonly workspaceId;
    private readonly protocolVersion;
    private readonly accessToken?;
    private readonly signer?;
    private readonly timeoutMs;
    private readonly now;
    private readonly requestIdFactory;
    private readonly delegatedTransport;
    constructor(options: ClientOptions);
    /**
     * 构造请求头（**纯函数式**：同样的入参得到同样的头）。
     *
     * 单独暴露是为了让「头构造」可被直接断言，而不必跑一次完整调用——
     * `X-Request-Id` 与 `X-Idempotency-Key` 的分离是本设计最容易写错的地方。
     */
    buildHeaders(options: {
        requestId: string;
        timestamp: number;
        idempotencyKey?: string;
        signature?: string;
        hasBody: boolean;
    }): Record<string, string>;
    /**
     * 构造签名原文（canonical string）。
     *
     * 格式：`<method>\n<path>\n<timestamp>\n<idempotencyKey ?? "">\n<body ?? "">`。
     *
     * 把幂等键纳入签名：否则改幂等键不会破坏签名，等于绕过 §10.2
     * 「头与请求体的幂等键必须一致」的约束。时间戳纳入签名以配合 ±5 分钟时间窗（§10.8）。
     */
    buildCanonical(input: {
        method: string;
        path: string;
        timestamp: number;
        idempotencyKey?: string;
        body?: string;
    }): string;
    /**
     * 发起一次调用并解析响应。
     *
     * - HTTP 层失败（非 2xx 且无协议错误体）→ 抛 `ProtocolError`（`retryable` 由状态码推得）；
     * - 协议层失败（`ok:false`）→ 抛 `ProtocolError`，`retryable` **原样透传**服务端判断（D21）；
     * - 成功 → 返回 `CallResult`（含 `replayed`）。
     *
     * **本方法不重试**：重试策略属于 `retry` 模块，调用方用 `withRetry` 包裹。
     * 这样「是否幂等」的决策留在调用点，而不是藏进客户端。
     */
    call<TData = unknown, TBody = unknown>(path: string, options?: CallOptions<TBody>): Promise<CallResult<TData>>;
    /** 带超时的传输调用。超时抛 `ProtocolError`（`retryable=true`：超时是典型可重试场景）。 */
    private sendWithTimeout;
    /** 解析响应体：区分「协议错误」「HTTP 错误」「成功」。 */
    private parseResponse;
}
//# sourceMappingURL=index.d.ts.map