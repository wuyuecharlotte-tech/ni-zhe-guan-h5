"use strict";
/**
 * 报告解析模块（design §4.4 / §10.4 / §14.1）。
 *
 * **边界**：纯函数，只**读**报告，不改报告、不重算。
 * 报告必须自包含（工作区侧只靠它就能落地与对账），所以这里只做
 * 「把协议里的数组结构翻译成接入方好用的形态」这一件事。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPORT_APPLIED_DIGEST = void 0;
exports.appliedDigest = appliedDigest;
exports.canonicalAmount = canonicalAmount;
exports.parseTimeline = parseTimeline;
exports.snapshotConservation = snapshotConservation;
/**
 * Settlement report ACK uses the canonical digest of an empty change set.
 * Generic change delivery owns per-event digests and subscriber ACKs.
 */
exports.REPORT_APPLIED_DIGEST = "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945";
/**
 * 与 Java 服务端完全一致的工作区落地摘要。
 *
 * The report ACK confirms that the app consumed the report. Downstream allocation
 * is outside the generic platform, so no report-side aggregate is
 * recomputed here.
 */
function appliedDigest(_report) {
    return exports.REPORT_APPLIED_DIGEST;
}
/** 规范化字符串十进制：去尾随零，零统一为 "0"。 */
function canonicalAmount(value) {
    const trimmed = value.trim();
    if (!/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(trimmed)) {
        throw new Error(`invalid decimal amount: ${value}`);
    }
    const negative = trimmed.startsWith("-");
    const unsigned = negative ? trimmed.slice(1) : trimmed;
    const [integer = "0", fraction = ""] = unsigned.split(".");
    const normalizedInteger = integer.replace(/^0+(?=\d)/, "") || "0";
    const normalizedFraction = fraction.replace(/0+$/, "");
    if (normalizedInteger === "0" && normalizedFraction === "")
        return "0";
    return `${negative ? "-" : ""}${normalizedInteger}${normalizedFraction ? `.${normalizedFraction}` : ""}`;
}
/**
 * 把 `segments[]` 解析成带时长与索引的时间轴。
 *
 * 保持原始顺序（协议已保证 `from` 单调），**不排序、不合并**——
 * 排序会掩盖服务端产出的异常区间，而「区间异常」正是对账要找的东西。
 */
function parseTimeline(report) {
    return report.segments.map((segment, index) => ({
        ...segment,
        index,
        durationMs: segment.to - segment.from,
    }));
}
/**
 * 协议精度：金额/速率统一 `DECIMAL(18,6)`（ADR-17）。
 * 所有金额都缩放到这个位数后以 BigInt 运算，保证跨语言无浮点漂移。
 *
 * **超出 6 位小数的输入会被截断（向零）**，不做四舍五入：协议已声明精度是 6 位，
 * 多出来的位属于越界输入；四舍五入会在「对账」场景里引入方向不确定的偏差，
 * 而截断至少是确定且可解释的。
 */
const PROTOCOL_SCALE = 6;
/** 汇总报告的金额字段。缺失的 map / 字段视为空。 */
function snapshotConservation(report) {
    // 全部缩放到 PROTOCOL_SCALE，因此各和天然可比。
    const gains = sumStringMap(report.gains, PROTOCOL_SCALE);
    const losses = sumStringMap(report.losses, PROTOCOL_SCALE);
    const capped = sumStringMap(report.capped, PROTOCOL_SCALE);
    const netChange = sumStringMap(report.netChange ?? {}, PROTOCOL_SCALE);
    const segmentTotal = report.segments.reduce((total, segment) => total + toScaledBigInt(segment.netChange ?? "0", PROTOCOL_SCALE), 0n);
    return {
        gains: fromScaledBigInt(gains, PROTOCOL_SCALE),
        losses: fromScaledBigInt(losses, PROTOCOL_SCALE),
        capped: fromScaledBigInt(capped, PROTOCOL_SCALE),
        netChange: fromScaledBigInt(netChange, PROTOCOL_SCALE),
        segmentNetChangeTotal: fromScaledBigInt(segmentTotal, PROTOCOL_SCALE),
    };
}
/** 小数位数（无小数点或空串视为 0）。 */
function decimalPlaces(value) {
    const dot = value.indexOf(".");
    return dot === -1 ? 0 : value.length - dot - 1;
}
/** 把字符串十进制按 `scale` 放大成 BigInt（缺位补零）。 */
function toScaledBigInt(value, scale) {
    const trimmed = value.trim();
    if (trimmed === "" || trimmed === "0") {
        return 0n;
    }
    const negative = trimmed.startsWith("-");
    const unsigned = negative ? trimmed.slice(1) : trimmed;
    const [intPart = "0", fracPart = ""] = unsigned.split(".");
    const paddedFrac = (fracPart + "0".repeat(scale)).slice(0, scale);
    const magnitude = BigInt(`${intPart}${paddedFrac}`);
    return negative ? -magnitude : magnitude;
}
/** 把放大后的 BigInt 还原成字符串十进制（去除尾部多余的 0，但保留整数形态）。 */
function fromScaledBigInt(value, scale) {
    if (scale === 0) {
        return value.toString();
    }
    const negative = value < 0n;
    const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
    const intPart = digits.slice(0, digits.length - scale);
    const fracPart = digits.slice(digits.length - scale).replace(/0+$/, "");
    const body = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
    return negative ? `-${body}` : body;
}
/**
 * 累加一个 `map<metricId, 字符串十进制>`，返回**缩放到 `scale`** 的 BigInt。
 *
 * 显式传入 `scale`（而不是按各值自适应）：同一份报告里的四张 map 必须用同一
 * 基准，否则 `netChange === gains + losses` 会在不同 scale 之间比较，恒等式失真。
 */
function sumStringMap(map, scale) {
    return Object.values(map ?? {}).reduce((total, value) => total + toScaledBigInt(value, scale), 0n);
}
//# sourceMappingURL=index.js.map