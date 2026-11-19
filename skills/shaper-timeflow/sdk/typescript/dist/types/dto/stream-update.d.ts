export type DecimalUnsigned = string;
export type DecimalSigned = string;
/**
 * 单条流状态上报（design §10.4）。字符串十进制避免跨语言浮点漂移。
 */
export interface StreamUpdate {
    streamKey: string;
    /**
     * 可选展示名称；空白值保留原名，不参与业务身份
     */
    displayName?: string;
    value: DecimalUnsigned;
    rate?: DecimalSigned;
    /**
     * 仅用于创建实例；已有实例的 phase 由平台结算或显式 transition 单调推进，不能回退
     */
    phaseIndex?: number;
    capacity?: DecimalUnsigned | null;
    expectedVersion: number;
    requestId: string;
    [k: string]: unknown;
}
//# sourceMappingURL=stream-update.d.ts.map