"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareReports = compareReports;
exports.segmentationEquivalent = segmentationEquivalent;
exports.receiptStable = receiptStable;
function decimalEqual(left, right) {
    if (left === undefined || right === undefined)
        return left === right;
    const scale = Math.max(decimalPlaces(left), decimalPlaces(right));
    return scaled(left, scale) === scaled(right, scale);
}
function decimalPlaces(value) {
    const dot = value.indexOf(".");
    return dot === -1 ? 0 : value.length - dot - 1;
}
function scaled(value, scale) {
    const negative = value.startsWith("-");
    const unsigned = negative ? value.slice(1) : value;
    const [integer = "0", fraction = ""] = unsigned.split(".");
    const digits = BigInt(`${integer}${(fraction + "0".repeat(scale)).slice(0, scale)}`);
    return negative ? -digits : digits;
}
function mapCheck(name, expected, actual) {
    const left = expected ?? {};
    const right = actual ?? {};
    const keys = Object.keys(left).sort();
    const same = keys.length === Object.keys(right).length
        && keys.every((key) => decimalEqual(left[key], right[key]));
    return { name, passed: same, expected: JSON.stringify(left), actual: JSON.stringify(right) };
}
function segmentsCheck(expected, actual) {
    const left = expected.segments;
    const right = actual.segments;
    if (left.length !== right.length) {
        return {
            name: "segments", passed: false,
            expected: `count=${left.length}`, actual: `count=${right.length}`,
        };
    }
    const same = left.every((segment, index) => {
        const other = right[index];
        return segment.from === other.from && segment.to === other.to
            && segment.streamKey === other.streamKey
            && segment.metricId === other.metricId
            && decimalEqual(segment.netChange, other.netChange);
    });
    return {
        name: "segments", passed: same,
        expected: `count=${left.length}`, actual: `count=${right.length}`,
    };
}
/** Compare a golden report with an actual report. */
function compareReports(expected, actual) {
    const checks = [
        {
            name: "settlementId",
            passed: expected.settlementId === actual.settlementId,
            expected: expected.settlementId, actual: actual.settlementId,
        },
        {
            name: "definitionVersion", passed: expected.definitionVersion === actual.definitionVersion,
            expected: String(expected.definitionVersion), actual: String(actual.definitionVersion),
        },
        mapCheck("gains", expected.gains, actual.gains),
        mapCheck("losses", expected.losses, actual.losses),
        mapCheck("capped", expected.capped, actual.capped),
        mapCheck("netChange", expected.netChange, actual.netChange),
        segmentsCheck(expected, actual),
    ];
    return { passed: checks.every((check) => check.passed), checks };
}
/** One-segment and many-segment reports must agree on metric totals. */
function segmentationEquivalent(one, many) {
    const checks = [
        mapCheck("netChange", one.netChange, many.netChange),
        mapCheck("gains", one.gains, many.gains),
        mapCheck("losses", one.losses, many.losses),
    ];
    return { passed: checks.every((check) => check.passed), checks };
}
/** A redelivered report must retain the same settlementId and stable content. */
function receiptStable(first, second) {
    return compareReports(first, second);
}
//# sourceMappingURL=index.js.map