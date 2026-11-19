export type Decimal = string;
/**
 * 带时间窗的速率/容量修正上报（design §10.4）。endTime 必须晚于 startTime。
 */
export interface WindowReport {
    streamKey: string;
    stat: "rate" | "capacity";
    op: "add" | "mul";
    value: Decimal;
    startTime: number;
    endTime: number;
    source?: string;
    requestId: string;
    [k: string]: unknown;
}
//# sourceMappingURL=window-report.d.ts.map