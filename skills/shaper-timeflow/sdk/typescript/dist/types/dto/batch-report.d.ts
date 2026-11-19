/**
 * 批量上报请求与逐条结果（design §10.3）。批量超限整体拒绝；条目部分成功是正常语义。
 */
export type BatchReport = StreamBatchRequest | WindowBatchRequest | PointBatchRequest | CrossEventBatchRequest | BatchResult;
export interface StreamBatchRequest {
    /**
     * @minItems 1
     * @maxItems 200
     */
    items: [StreamUpdate & {}, ...(StreamUpdate & {})[]];
    [k: string]: unknown;
}
/**
 * 单条流状态上报（design §10.4）。字符串十进制避免跨语言浮点漂移。
 */
export interface StreamUpdate {
    streamKey: string;
    /**
     * 可选展示名称；空白值保留原名，不参与业务身份
     */
    displayName?: string;
    value: string;
    rate?: string;
    /**
     * 仅用于创建实例；已有实例的 phase 由平台结算或显式 transition 单调推进，不能回退
     */
    phaseIndex?: number;
    capacity?: string | null;
    expectedVersion: number;
    requestId: string;
    [k: string]: unknown;
}
export interface WindowBatchRequest {
    /**
     * @minItems 1
     * @maxItems 200
     */
    items: [WindowReport, ...WindowReport[]];
    [k: string]: unknown;
}
/**
 * 带时间窗的速率/容量修正上报（design §10.4）。endTime 必须晚于 startTime。
 */
export interface WindowReport {
    streamKey: string;
    stat: "rate" | "capacity";
    op: "add" | "mul";
    value: string;
    startTime: number;
    endTime: number;
    source?: string;
    requestId: string;
    [k: string]: unknown;
}
export interface PointBatchRequest {
    /**
     * @minItems 1
     * @maxItems 200
     */
    items: [PointReport, ...PointReport[]];
    [k: string]: unknown;
}
/**
 * 时间点事件与值操作上报（design §3.5 / §10.4）。v1 值操作只开放 ADD 与 SET。
 */
export interface PointReport {
    streamKey: string;
    kind: string;
    eventTime: number;
    /**
     * @maxItems 64
     */
    ops?: {
        op: "ADD" | "SET";
        value: string;
        [k: string]: unknown;
    }[];
    transition?: string;
    eventId: string;
    [k: string]: unknown;
}
export interface CrossEventBatchRequest {
    /**
     * @minItems 1
     * @maxItems 500
     */
    items: [
        {
            eventId: string;
            sourceType: string;
            sourceId: string;
            targetType: string;
            targetId: string;
            point: PointReport;
            [k: string]: unknown;
        },
        ...{
            eventId: string;
            sourceType: string;
            sourceId: string;
            targetType: string;
            targetId: string;
            point: PointReport;
            [k: string]: unknown;
        }[]
    ];
    [k: string]: unknown;
}
export interface BatchResult {
    results: BatchItemResult[];
    accepted: number;
    rejected: number;
    [k: string]: unknown;
}
export interface BatchItemResult {
    id: string;
    idempotencyKind: "requestId" | "eventId";
    status: "accepted" | "replayed" | "rejected";
    code?: string;
    message?: string;
    retryable?: boolean;
    replayed?: boolean;
    details?: {
        [k: string]: unknown;
    };
    [k: string]: unknown;
}
//# sourceMappingURL=batch-report.d.ts.map