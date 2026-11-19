#!/usr/bin/env python3
"""标准库离线统计。保留坏轮次；不把回调节奏当成实际呈现 FPS。"""
import argparse
import json
import math
import statistics
from pathlib import Path


COMPARE_KEYS = ("scenarioId", "scenarioVersion", "seed", "deviceId", "engine", "backend",
                "quality", "workload", "targetFPS", "toleranceMs", "environment", "protocol")


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def percentile(values, fraction):
    """Nearest-rank: sorted[ceil(p*n)-1]，空样本不补零。"""
    return sorted(values)[max(0, math.ceil(fraction * len(values)) - 1)] if values else None


def intervals(values, budget, tolerance):
    if not values:
        return None
    longest = streak = 0
    for x in values:
        streak = streak + 1 if x > budget + tolerance else 0
        longest = max(longest, streak)
    span = sum(values)
    return {"samples": len(values), "intervalSpanMs": span,
            "callbackOrSubmissionFPS": len(values) * 1000 / span,
            "p50Ms": percentile(values, .5), "p95Ms": percentile(values, .95),
            "p99Ms": percentile(values, .99), "maxMs": max(values),
            "overBudgetPercent": 100 * sum(v > budget + tolerance for v in values) / len(values),
            "over2BCount": sum(v > 2 * budget for v in values),
            "longestOverBudgetStreak": longest}


def read_run(file):
    result = {"file": str(file.resolve()), "valid": False, "reasons": [], "notes": []}
    try:
        raw = json.loads(file.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError("根节点必须是对象")
        meta = raw.get("metadata", {})
        result["metadata"] = meta
        reasons = result["reasons"]
        if raw.get("schemaVersion") != 1:
            reasons.append("不支持的 schemaVersion")
        if raw.get("status") != "ok":
            reasons.append("本轮执行失败或缺少 status:ok")
        if raw.get("failure"):
            reasons.append("存在 failure")
        validation = raw.get("validation") or {}
        if validation.get("passed") is not True or not str(validation.get("details", "")).strip():
            reasons.append("缺少实际工作负载/功能验证")
        if not isinstance(meta, dict):
            raise ValueError("metadata 必须是对象")
        for key in (*COMPARE_KEYS, "buildId"):
            if key not in meta:
                reasons.append(f"metadata 缺少 {key}")
        fps, tolerance = meta.get("targetFPS"), meta.get("toleranceMs")
        if not finite(fps) or fps <= 0 or not finite(tolerance) or tolerance < 0:
            raise ValueError("targetFPS/toleranceMs 无效")
        duration = raw.get("durationMs")
        if not finite(duration) or duration <= 0:
            raise ValueError("durationMs 无效")
        result["durationMs"] = duration
        if "started-hidden" in raw.get("warnings", []) or any(
            event.get("state") != "visible" for event in raw.get("visibilityChanges", [])
        ):
            reasons.append("采样窗口进入后台/不可见")
        if raw.get("resizeEvents", 0):
            reasons.append("稳态窗口发生 resize；如需测试 resize 请单列专项场景")
        if any(raw.get("dropped", {}).values()):
            reasons.append("采样缓冲溢出")
        if raw.get("pageErrors") or raw.get("droppedPageErrors", 0):
            reasons.append("存在页面未捕获异常")
        budget = 1000 / fps
        for field, label in (("rafIntervalsMs", "raf"), ("gameFrameIntervalsMs", "gameFrames")):
            values = raw.get(field, [])
            if not isinstance(values, list) or any(not finite(v) or v <= 0 for v in values):
                raise ValueError(f"{field} 必须是有限正数数组")
            if sum(values) > duration + 1:
                reasons.append(f"{field} 间隔总和超出窗口")
            result[label] = intervals(values, budget, tolerance)
            if not values:
                result["notes"].append(f"{label} 无样本，不能填零或推导实际呈现 FPS")
        if not result.get("raf") and not result.get("gameFrames"):
            reasons.append("没有可分析的帧节奏样本")
        expected = (meta.get("protocol") or {}).get("durationSeconds")
        if finite(expected) and abs(duration - expected * 1000) > max(250, expected * 50):
            # 不删除真实卡顿：保留本轮统计并要求复核窗口延长原因。
            result["notes"].append("实际窗口偏离计划超过 5% 或 250ms；检查驱动等待/主线程长停顿，不得裁掉卡顿")
            result["windowReviewRequired"] = True
        if raw.get("capabilities", {}).get("longTasks") is True:
            tasks = raw.get("longTasks", [])
            for t in tasks:
                if not finite(t.get("startMs")) or not finite(t.get("durationMs")) or t["startMs"] < 0 or t["durationMs"] <= 0:
                    raise ValueError("longTasks 数据无效")
            result["longTasks"] = {"count": len(tasks), "totalMs": sum(
                max(0, min(duration, t["startMs"] + t["durationMs"]) - t["startMs"]) for t in tasks)}
        else:
            result["longTasks"] = None
        result["metrics"] = {}
        for name, metric in raw.get("metrics", {}).items():
            if not metric.get("unit") or metric.get("kind") not in ("measured", "estimated"):
                raise ValueError(f"{name} 单位/口径缺失")
            samples = metric.get("samples", [])
            if any(not finite(s.get("value")) or not finite(s.get("tMs")) or not 0 <= s["tMs"] <= duration + 1 for s in samples):
                raise ValueError(f"{name} 样本值/时间无效")
            values = [s["value"] for s in samples]
            result["metrics"][name] = {"unit": metric["unit"], "kind": metric["kind"],
                "samples": len(values), "first": values[0] if values else None,
                "last": values[-1] if values else None, "min": min(values) if values else None,
                "max": max(values) if values else None, "mean": statistics.mean(values) if values else None}
        result["valid"] = not reasons
    except (ValueError, OSError, TypeError, KeyError, AttributeError) as error:
        result["reasons"].append(str(error))
    return result


def aggregate(runs):
    valid = [r for r in runs if r["valid"]]
    out = {"totalRuns": len(runs), "validRuns": len(valid), "exploratory": len(valid) < 3,
           "buildIds": sorted({str(r.get("metadata", {}).get("buildId")) for r in runs}), "series": {}}
    for group in ("raf", "gameFrames"):
        series = [r[group] for r in valid if r.get(group)]
        for key in ("callbackOrSubmissionFPS", "p50Ms", "p95Ms", "p99Ms", "maxMs", "overBudgetPercent", "over2BCount"):
            values = [s[key] for s in series]
            if values:
                out["series"][f"{group}.{key}"] = {"runs": len(values), "median": statistics.median(values),
                                                     "min": min(values), "max": max(values)}
    return out


def differences(runs):
    if not runs:
        return ["没有轮次文件"]
    differences = []
    # 无效轮次也参与环境核对，不能静默舍弃失败后选择有利样本。
    ref = runs[0].get("metadata", {})
    for run in runs[1:]:
        meta = run.get("metadata", {})
        for key in COMPARE_KEYS:
            if meta.get(key) != ref.get(key):
                differences.append(f"{Path(run['file']).name}: {key} 不同")
    return sorted(set(differences))


def load_runs(location):
    p = Path(location)
    files = sorted(p.glob("run-*.json")) if p.is_dir() else [p]
    if not files:
        raise ValueError(f"{p}: 没有 run-*.json")
    return [read_run(f) for f in files]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--candidate")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    groups = {"baseline": load_runs(args.baseline)}
    if args.candidate:
        groups["candidate"] = load_runs(args.candidate)
    all_runs = [r for runs in groups.values() for r in runs]
    diffs = differences(all_runs)
    # 每组必须对应一个构建；前后构建不同是允许且预期的。
    for label, runs in groups.items():
        if len({str(r.get("metadata", {}).get("buildId")) for r in runs}) != 1:
            diffs.append(f"{label}: 同组混入多个 buildId")
    out = {"schemaVersion": 1, "comparable": not diffs, "differences": diffs,
           "groups": {k: {"aggregate": aggregate(v), "runs": v} for k, v in groups.items()},
           "deltas": {}, "automaticAcceptance": False}
    if not diffs and "candidate" in groups:
        base = out["groups"]["baseline"]["aggregate"]["series"]
        cand = out["groups"]["candidate"]["aggregate"]["series"]
        for key in base.keys() & cand.keys():
            before, after = base[key]["median"], cand[key]["median"]
            out["deltas"][key] = {"baseline": before, "candidate": after, "absolute": after - before,
                                   "percent": 100 * (after - before) / before if before else None}
    report = ["# 游戏性能采样报告", "", "rAF = 浏览器回调节奏；gameFrames = 显式游戏整帧提交节奏，均不保证实际屏幕呈现。",
              "百分位使用 nearest-rank；先逐轮统计，再汇总中位数及轮间范围。不剔除长帧。", "",
              f"配置可比：{'是' if not diffs else '否'}；本工具不自动判定优化验收通过。"]
    report.extend(f"- {d}" for d in diffs)
    for label, value in out["groups"].items():
        a = value["aggregate"]
        report.extend(["", f"## {label}", "", f"有效轮次 {a['validRuns']}/{a['totalRuns']}；构建 {', '.join(a['buildIds'])}。"])
        if a["exploratory"]:
            report.append("重复不足 3 轮：仅作探索性证据。")
        report.extend(["", "| 指标 | 轮中位数 | 轮间最小–最大 |", "|---|---|---|"])
        for key, stats in a["series"].items():
            report.append(f"| {key} | {stats['median']:.4g} | {stats['min']:.4g}–{stats['max']:.4g} |")
        report.append("")
        for run in value["runs"]:
            report.append(f"- 原始文件：`{run['file']}`；{'有效' if run['valid'] else '无效'}；" +
                          "；".join(run["reasons"] + run["notes"]))
    report.extend(["", "缺少 GPU/进程内存/实际呈现数据时为不可用，不能补零。页面异常数量不能直接当线上错误率。",
                   "检查 summary.json 中逐轮长任务、带单位的测量/估算、窗口复核项和差值；功能、输入、画质与波动仍需验收。"])
    target = Path(args.out)
    target.mkdir(parents=True, exist_ok=True)
    for name, data in (("summary.json", json.dumps(out, ensure_ascii=False, indent=2, allow_nan=False)),
                       ("report.md", "\n".join(report) + "\n")):
        with (target / name).open("x", encoding="utf-8") as stream:
            stream.write(data)
    print(f"报告已保存：{target.resolve()}")
    return 2 if diffs or any(not r["valid"] for r in all_runs) else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError) as error:
        raise SystemExit(str(error))
