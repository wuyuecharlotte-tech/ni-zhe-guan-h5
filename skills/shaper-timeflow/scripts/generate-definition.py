#!/usr/bin/env python3
"""Generate a conservative interpreter definition skeleton from CLI arguments."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--version", type=int, default=1)
    parser.add_argument("--metric", required=True)
    parser.add_argument("--pattern", required=True)
    parser.add_argument("--rule", required=True)
    parser.add_argument("--rule-version", type=int, default=1)
    parser.add_argument("--rate", default="0.000001")
    parser.add_argument("--capacity", default="1000000")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    if args.version < 1 or args.rule_version < 1:
        parser.error("definition and rule versions must be positive")

    definition = {
        "workspaceId": args.workspace,
        "definitionVersion": args.version,
        "protocolVersion": 1,
        "scopeTypes": ["player"],
        "metrics": [{
            "metricId": args.metric,
            "precision": 0,
            "cap": None,
            "capScope": "stream",
            "shared": False,
        }],
        "maxOfflineTime": 30 * 24 * 60 * 60 * 1000,
        "stream": [{
            "streamPattern": args.pattern,
            "metricId": args.metric,
            "ruleKey": args.rule,
            "ruleVersion": args.rule_version,
            "carrier": "interpreter",
            "phases": [
                {
                    "name": "growing",
                    "baseRate": args.rate,
                    "capacity": args.capacity,
                    "until": {"kind": "progress", "value": "1"},
                },
                {
                    "name": "mature",
                    "baseRate": "0",
                    "capacity": args.capacity,
                    "until": {"kind": "immortal"},
                },
            ],
            "decay": [],
        }],
    }
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(definition, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
