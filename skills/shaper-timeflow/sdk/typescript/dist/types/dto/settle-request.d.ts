/**
 * 结算触发请求（design §10.4）。from 仅用于与平台权威区间比对，绝不能决定区间。
 */
export interface SettleRequest {
    trigger: "login" | "foreground" | "due" | "event" | "cross_day";
    clientAt?: number;
    from?: number;
    ruleVersionHint?: number;
    [k: string]: unknown;
}
//# sourceMappingURL=settle-request.d.ts.map