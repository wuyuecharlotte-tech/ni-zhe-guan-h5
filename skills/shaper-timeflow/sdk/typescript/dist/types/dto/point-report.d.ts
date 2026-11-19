export type DecimalSigned = string;
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
        value: DecimalSigned;
        [k: string]: unknown;
    }[];
    transition?: string;
    eventId: string;
    [k: string]: unknown;
}
//# sourceMappingURL=point-report.d.ts.map