"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtocolClient = exports.FetchTransport = void 0;
exports.createHmacSigner = createHmacSigner;
const index_js_1 = require("../errors/index.js");
/** HMAC-SHA256 签名器（Node 运行时；懒加载 `node:crypto` 以免浏览器打包时硬依赖）。 */
function createHmacSigner(secret) {
    return {
        async sign(canonical) {
            const { createHmac } = await Promise.resolve().then(() => __importStar(require("node:crypto")));
            return createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
        },
    };
}
/** `fetch` 默认传输实现。 */
class FetchTransport {
    baseUrl;
    fetchImpl;
    constructor(baseUrl, fetchImpl = globalThis.fetch) {
        this.baseUrl = baseUrl;
        this.fetchImpl = fetchImpl;
    }
    async send(request) {
        const url = new URL(request.path, this.baseUrl).toString();
        const init = {
            method: request.method,
            headers: request.headers,
            ...(request.body === undefined ? {} : { body: request.body }),
        };
        const response = await this.fetchImpl(url, init);
        const headers = {};
        response.headers.forEach((value, key) => {
            headers[key.toLowerCase()] = value;
        });
        return { status: response.status, headers, body: await response.text() };
    }
}
exports.FetchTransport = FetchTransport;
/**
 * 协议客户端。
 *
 * 设计 §10.2 的请求头在这里**一次性构造**，不散落到各接口方法里：
 * `X-Workspace-Id` / `X-Protocol-Version` / `X-Request-Id` / `X-Idempotency-Key` /
 * `X-Timestamp` / `X-Signature`。
 */
class ProtocolClient {
    transport;
    workspaceId;
    protocolVersion;
    accessToken;
    signer;
    timeoutMs;
    now;
    requestIdFactory;
    delegatedTransport;
    constructor(options) {
        this.transport = options.transport;
        this.workspaceId = options.workspaceId;
        this.protocolVersion = options.protocolVersion;
        if (options.accessToken !== undefined) {
            this.accessToken = options.accessToken;
        }
        if (options.signer !== undefined) {
            this.signer = options.signer;
        }
        this.delegatedTransport = options.delegatedTransport ?? false;
        if (this.delegatedTransport) {
            if (options.accessToken !== undefined || options.signer !== undefined) {
                throw new Error("delegatedTransport must not carry X-Shaper-Token or signer");
            }
        }
        else if (this.accessToken === undefined || this.signer === undefined) {
            throw new Error("authenticated ProtocolClient requires accessToken and signer; " +
                "use delegatedTransport for browser calls through an authenticated BFF");
        }
        this.timeoutMs = options.timeoutMs ?? 2000;
        this.now = options.now ?? Date.now;
        this.requestIdFactory = options.requestIdFactory ?? defaultRequestIdFactory();
    }
    /**
     * 构造请求头（**纯函数式**：同样的入参得到同样的头）。
     *
     * 单独暴露是为了让「头构造」可被直接断言，而不必跑一次完整调用——
     * `X-Request-Id` 与 `X-Idempotency-Key` 的分离是本设计最容易写错的地方。
     */
    buildHeaders(options) {
        const headers = {
            "X-Workspace-Id": this.workspaceId,
            "X-Protocol-Version": String(this.protocolVersion),
            // 追踪 ID：每次请求都变（含重试），仅用于观测。
            "X-Request-Id": options.requestId,
            "X-Timestamp": String(options.timestamp),
        };
        if (!this.delegatedTransport && this.accessToken !== undefined) {
            headers["X-Shaper-Token"] = this.accessToken;
        }
        // 幂等键：只在调用方显式给出时写。**绝不用 requestId 顶替**。
        if (options.idempotencyKey !== undefined) {
            headers["X-Idempotency-Key"] = options.idempotencyKey;
        }
        if (!this.delegatedTransport && options.signature !== undefined) {
            headers["X-Signature"] = options.signature;
        }
        if (options.hasBody) {
            headers["Content-Type"] = "application/json; charset=utf-8";
        }
        return headers;
    }
    /**
     * 构造签名原文（canonical string）。
     *
     * 格式：`<method>\n<path>\n<timestamp>\n<idempotencyKey ?? "">\n<body ?? "">`。
     *
     * 把幂等键纳入签名：否则改幂等键不会破坏签名，等于绕过 §10.2
     * 「头与请求体的幂等键必须一致」的约束。时间戳纳入签名以配合 ±5 分钟时间窗（§10.8）。
     */
    buildCanonical(input) {
        return [
            input.method.toUpperCase(),
            input.path,
            String(input.timestamp),
            input.idempotencyKey ?? "",
            input.body ?? "",
        ].join("\n");
    }
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
    async call(path, options = {}) {
        const method = options.method ?? "POST";
        const body = options.body === undefined ? undefined : JSON.stringify(options.body);
        const requestId = this.requestIdFactory();
        const timestamp = this.now();
        const canonical = this.buildCanonical({
            method,
            path,
            timestamp,
            ...(options.idempotencyKey !== undefined ? { idempotencyKey: options.idempotencyKey } : {}),
            ...(body !== undefined ? { body } : {}),
        });
        const signature = this.signer ? await this.signer.sign(canonical) : undefined;
        const headers = this.buildHeaders({
            requestId,
            timestamp,
            ...(options.idempotencyKey !== undefined ? { idempotencyKey: options.idempotencyKey } : {}),
            ...(signature !== undefined ? { signature } : {}),
            hasBody: body !== undefined,
        });
        const request = {
            method,
            path,
            headers,
            ...(body !== undefined ? { body } : {}),
        };
        const response = await this.sendWithTimeout(request, options.timeoutMs ?? this.timeoutMs);
        return this.parseResponse(response, requestId);
    }
    /** 带超时的传输调用。超时抛 `ProtocolError`（`retryable=true`：超时是典型可重试场景）。 */
    async sendWithTimeout(request, timeoutMs) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(new index_js_1.ProtocolError({ code: "TIMEOUT", message: `请求超时（${timeoutMs}ms）`, retryable: true }, { httpStatus: 0 }));
            }, timeoutMs);
        });
        try {
            return await Promise.race([this.transport.send(request), timeout]);
        }
        finally {
            if (timer !== undefined) {
                clearTimeout(timer);
            }
        }
    }
    /** 解析响应体：区分「协议错误」「HTTP 错误」「成功」。 */
    parseResponse(response, sentRequestId) {
        let parsed;
        try {
            parsed = JSON.parse(response.body);
        }
        catch {
            parsed = undefined;
        }
        // 协议层失败：`retryable` 原样透传服务端判断（老服务端不给时由 errors 模块回退）。
        if (parsed && parsed.ok === false) {
            const error = parsed.error ?? { code: "UNKNOWN", message: "服务端返回 ok:false 但无 error 体" };
            throw new index_js_1.ProtocolError(error, {
                httpStatus: response.status,
                ...(parsed.requestId !== undefined ? { requestId: parsed.requestId } : {}),
            });
        }
        // HTTP 层失败（无协议体可解析时）：按状态码给出保守判断。
        if (response.status < 200 || response.status >= 300) {
            throw new index_js_1.ProtocolError({
                code: `HTTP_${response.status}`,
                message: `HTTP ${response.status}`,
                retryable: isRetryableStatus(response.status),
            }, { httpStatus: response.status, requestId: sentRequestId });
        }
        if (!parsed) {
            throw new index_js_1.ProtocolError({ code: "MALFORMED_RESPONSE", message: "响应体不是合法 JSON", retryable: false }, { httpStatus: response.status, requestId: sentRequestId });
        }
        const result = {
            ok: true,
            data: parsed.data,
            replayed: parsed.replayed === true,
            sentRequestId,
            httpStatus: response.status,
        };
        if (parsed.requestId !== undefined) {
            result.requestId = parsed.requestId;
        }
        return result;
    }
}
exports.ProtocolClient = ProtocolClient;
/**
 * HTTP 状态码 → 可重试（design §10.2 的状态码表）。
 *
 * 只在**没有协议错误体**时兜底使用。`429` / `500` / `503` 可重试；
 * `409` 需要协议体的 `retryable`（这里保守判 `false`）。
 */
function isRetryableStatus(status) {
    return status === 429 || status === 500 || status === 503;
}
/** 默认追踪 ID 生成器：优先 `crypto.randomUUID`，回退到时间 + 计数器。 */
function defaultRequestIdFactory() {
    const cryptoRef = globalThis.crypto;
    if (cryptoRef?.randomUUID) {
        const randomUUID = cryptoRef.randomUUID.bind(cryptoRef);
        return () => `req-${randomUUID()}`;
    }
    let counter = 0;
    return () => {
        counter += 1;
        return `req-${Date.now().toString(36)}-${counter.toString(36)}`;
    };
}
//# sourceMappingURL=index.js.map