/**
 * 报告解析模块（design §4.4 / §10.4 / §14.1）。
 *
 * **边界**：纯函数，只**读**报告，不改报告、不重算。
 * 报告必须自包含（工作区侧只靠它就能落地与对账），所以这里只做
 * 「把协议里的数组结构翻译成接入方好用的形态」这一件事。
 */
import type { TimeflowSettleReport } from "../dto/report.js";
export type SettleReport = TimeflowSettleReport;
export type SettleSegment = SettleReport["segments"][number];
/**
 * Settlement report ACK uses the canonical digest of an empty change set.
 * Generic change delivery owns per-event digests and subscriber ACKs.
 */
export declare const REPORT_APPLIED_DIGEST = "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945";
/**
 * 与 Java 服务端完全一致的工作区落地摘要。
 *
 * The report ACK confirms that the app consumed the report. Downstream allocation
 * is outside the generic platform, so no report-side aggregate is
 * recomputed here.
 */
export declare function appliedDigest(_report: SettleReport): string;
/** 规范化字符串十进制：去尾随零，零统一为 "0"。 */
export declare function canonicalAmount(value: string): string;
/** 时间轴的一段，已补上 `durationMs` 与索引，便于直接渲染。 */
export interface TimelineSegment extends SettleSegment {
    /** 段在 `segments[]` 中的原始下标（保留可追溯性）。 */
    index: number;
    /** `to - from`；报告本身不带这个值，但客服/对账每次都算。 */
    durationMs: number;
}
/**
 * 把 `segments[]` 解析成带时长与索引的时间轴。
 *
 * 保持原始顺序（协议已保证 `from` 单调），**不排序、不合并**——
 * 排序会掩盖服务端产出的异常区间，而「区间异常」正是对账要找的东西。
 */
export declare function parseTimeline(report: SettleReport): TimelineSegment[];
/**
 * 报告的金额汇总快照：把报告里四张 `map<metricId, 金额>` 加总，供接入方对账。
 *
 * **刻意不在这里断言 `netChange == gains + losses`**：该等式只在「区间内没有
 * 值操作」时成立。设计 §6.5 / §21.6.1 的黄金样例里 `SET` 重置（收割）既进
 * `netChange` 又不进 `losses`，于是 gains(120) + losses(−35) = 85 ≠ netChange(0)。
 * 把这条错误的等式写成断言，会把「语义正确」的结算判成不一致。
 * 需要守恒校验的接入方请用 `segmentNetChangeTotal` 与 `netChange` 自行对照
 * （前提：区间内无值操作事件）。
 */
export interface ConservationSnapshot {
    /** Σ gains（字符串十进制）。 */
    gains: string;
    /** Σ losses（通常为负）。 */
    losses: string;
    /** Σ capped（容量截断，未获得的部分）。 */
    capped: string;
    /** Σ netChange（对外的价值变化合计）。 */
    netChange: string;
    /** Σ `segments[].netChange`（逐段积分产出之和，不含值操作）。 */
    segmentNetChangeTotal: string;
}
/** 汇总报告的金额字段。缺失的 map / 字段视为空。 */
export declare function snapshotConservation(report: SettleReport): ConservationSnapshot;
//# sourceMappingURL=index.d.ts.map