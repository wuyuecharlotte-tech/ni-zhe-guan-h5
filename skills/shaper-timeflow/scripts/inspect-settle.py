#!/usr/bin/env python3
"""Inspect a settlement report without touching platform storage."""
from __future__ import annotations

import argparse
import json
from decimal import Decimal
from pathlib import Path


def decimal_map(values: dict[str, object] | None) -> Decimal:
    return sum((Decimal(str(value)) for value in (values or {}).values()), Decimal("0"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", required=True, help="SettleReport JSON from the protocol")
    args = parser.parse_args()
    path = Path(args.report).expanduser()
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"cannot read report: {error}")
        return 1

    settle_id = report.get("settlementId", "")
    segments = report.get("segments") or []
    print(f"settlementId={settle_id}")
    print(f"definitionVersion={report.get('definitionVersion')}")
    print(f"realDuration={report.get('realDuration')} effectiveDuration={report.get('effectiveDuration')}")
    print(f"cappedByTime={report.get('cappedByTime')} approximated={report.get('approximated')}")
    print(f"segments={len(segments)}")
    for index, segment in enumerate(segments):
        print(
            f"  [{index}] {segment.get('from')}..{segment.get('to')} "
            f"{segment.get('streamKey')} {segment.get('metricId')} "
            f"netChange={segment.get('netChange')}"
        )
    print(f"netChangeSum={decimal_map(report.get('netChange'))}")
    print(f"segmentNetChangeSum={sum((Decimal(str(s.get('netChange', '0'))) for s in segments), Decimal('0'))}")
    error = report.get("error")
    if error:
        print(f"errorCode={error.get('code')} retryable={error.get('retryable')}")
        if error.get("code") == "NEED_RESUME":
            print("diagnosis=settlement incomplete; no state should be written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
