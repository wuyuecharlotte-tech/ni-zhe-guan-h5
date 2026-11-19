/**
 * 统一成功/失败响应结构（design §10.2）。retryable 由服务端给出，SDK 不自行推断。
 */
export interface ProtocolResponse {
    ok: boolean;
    data?: unknown;
    error?: ProtocolError;
    requestId?: string;
    replayed?: boolean;
    [k: string]: unknown;
}
export interface ProtocolError {
    code: string;
    message?: string;
    retryable: boolean;
    retryAfterMs?: number;
    details?: {
        [k: string]: unknown;
    };
    [k: string]: unknown;
}
//# sourceMappingURL=protocol-response.d.ts.map