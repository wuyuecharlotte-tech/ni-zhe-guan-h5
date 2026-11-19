/**
 * 报告落地回执（design §10.5 / §13.1）。ACK 可带 appliedDigest；NACK 必带失败原因与是否可重试。
 */
export type ReceiptRequest = AckRequest | NackRequest;
export type AppliedDigest = string;
export interface AckRequest {
    settlementId: string;
    appliedDigest?: AppliedDigest;
    [k: string]: unknown;
}
export interface NackRequest {
    settlementId: string;
    code: string;
    message: string;
    retryable: boolean;
    details?: {
        [k: string]: unknown;
    };
    [k: string]: unknown;
}
//# sourceMappingURL=receipt-request.d.ts.map