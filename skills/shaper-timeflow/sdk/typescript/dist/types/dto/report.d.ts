/**
 * SettleReport（design §4.4 / §10.4）——必须自包含：工作区侧只靠这一份报告就能完成落地与对账。
 */
export interface TimeflowSettleReport {
    /**
     * 结算标识；工作区侧落地幂等键
     */
    settlementId: string;
    /**
     * 真实离线时长（ms）
     */
    realDuration: number;
    /**
     * 封顶后参与积分的时长（ms）
     */
    effectiveDuration: number;
    /**
     * 可解释时间轴——客服 / 对账 / 业务变化明细三处复用同一份数据
     */
    segments: {
        from: number;
        to: number;
        streamKey?: string;
        metricId?: string;
        /**
         * 段内相位序号——解释「这段为什么是这个速率」（对应定义 stream[].phases[phaseIndex]）
         */
        phaseIndex?: number;
        rate?: string;
        modifiers?: {};
        produced?: string;
        capped?: string;
        netChange?: string;
        /**
         * 段起点存量（同一内核段结果）
         */
        valueStart?: string;
        /**
         * 段终点存量（同一内核段结果）
         */
        valueEnd?: string;
    }[];
    /**
     * 只记实际正变化（Σ max(netChange,0)），逐 metricId；容量截断不进 gains
     */
    gains: {
        [k: string]: string;
    };
    /**
     * 只记负变化（Σ min(netChange,0)）；SET 重置不算 losses
     */
    losses: {
        [k: string]: string;
    };
    /**
     * 因容量上限未获得的部分，单独可查
     */
    capped: {
        [k: string]: string;
    };
    /**
     * 区间内的事件与值操作（含重置）
     */
    events: {
        streamKey?: string;
        kind?: string;
        eventTime?: number;
        eventId?: string | null;
        origin?: "report" | "derived";
        ops?: unknown[];
    }[];
    /**
     * 本次结算固化的 ruleKey → ruleVersion（design §19.5）
     */
    ruleVersions: {
        [k: string]: number;
    };
    /**
     * 本次结算使用的定义版本（重放必须用它）
     */
    definitionVersion: number;
    curveApplied?: boolean;
    /**
     * 幂等回放（命中已完成记录，未重算）
     */
    replayed: boolean;
    /**
     * 切点降采样近似（超 MAX_CUTS）
     */
    approximated: boolean;
    /**
     * 是否因 maxOfflineTime 封顶（与 capped 的容量截断区分）；真实时长照记 realDuration
     */
    cappedByTime?: boolean;
    /**
     * 是否发生时钟回拨（now < last_settle_time）：本次 effectiveDuration=0、不产出，并记 CLOCK_REGRESSION 审计
     */
    clockRegression?: boolean;
    /**
     * 逐资源 Σ netChange（价值守恒 value_end − value_start == Σ netChange 的对外呈现）
     */
    netChange?: {
        [k: string]: string;
    };
    /**
     * 本次计算确认的资源实例生命周期事实；旧报告缺省为空数组
     */
    streamLifecycles?: {
        streamKey: string;
        kind: "finite" | "continuous" | null;
        state: "active" | "terminated" | "legacy_unknown";
        terminalAt?: number | null;
        terminalReason?: "progress" | "event" | "legacy" | null;
        terminalPhaseIndex?: number | null;
        terminalValue?: string | null;
        terminalEventId?: string | null;
    }[];
    [k: string]: unknown;
}
//# sourceMappingURL=report.d.ts.map