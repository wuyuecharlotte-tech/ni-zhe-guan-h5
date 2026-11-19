/**
 * CI-facing report gates. These functions compare reports; they never rerun
 * settlement and never mutate input.
 */
import type { TimeflowSettleReport } from "../dto/report.js";
export interface ReportCheck {
    name: string;
    passed: boolean;
    expected: string;
    actual: string;
}
export interface ReportCheckResult {
    passed: boolean;
    checks: ReportCheck[];
}
/** Compare a golden report with an actual report. */
export declare function compareReports(expected: TimeflowSettleReport, actual: TimeflowSettleReport): ReportCheckResult;
/** One-segment and many-segment reports must agree on metric totals. */
export declare function segmentationEquivalent(one: TimeflowSettleReport, many: TimeflowSettleReport): ReportCheckResult;
/** A redelivered report must retain the same settlementId and stable content. */
export declare function receiptStable(first: TimeflowSettleReport, second: TimeflowSettleReport): ReportCheckResult;
//# sourceMappingURL=index.d.ts.map