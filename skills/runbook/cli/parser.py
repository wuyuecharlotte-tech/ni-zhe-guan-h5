# -*- coding: utf-8 -*-
"""runbook CLI 参数解析器。"""
from __future__ import annotations

import argparse


def build_parser() -> argparse.ArgumentParser:
    """构建命令行参数解析器。"""
    ap = argparse.ArgumentParser(description="Colorbox 活动交付状态机")
    ap.add_argument(
        "command",
        choices=["init", "current", "configure", "confirm", "advance", "reject", "goto", "log", "tree", "decide", "present", "clean"],
        help="指令名称"
    )
    ap.add_argument("arg", nargs="?", help="confirm/reject/goto 的阶段名、log 的备注、decide 的决策 id")
    ap.add_argument("arg2", nargs="?", help="decide 的选项（A/B/C）")
    ap.add_argument("--note", default="", help="advance/reject/goto 的备注")
    ap.add_argument("--frontier", action="store_true", help="present 标记当前前沿全部决策为已展示")
    ap.add_argument("--to", default=None, help="reject 的目标阶段（默认回退到上一阶段）")
    ap.add_argument("--json", action="store_true", help="current 输出 JSON")
    ap.add_argument("--activity-dir", default="activity", help="活动产物目录（默认 ./activity）")
    ap.add_argument("--runtime", choices=["static", "activity-api", "room"], help="configure：实现运行方式")
    ap.add_argument("--persistence", choices=["none", "postgresql"], help="configure：跨重启持久化方式")
    ap.add_argument("--expected-version", default="", help="configure：本次 Room 的 /health.version")
    ap.add_argument("--activity-api", action="store_true", help="configure：Room 另含活动 API")
    return ap
