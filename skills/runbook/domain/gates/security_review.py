# -*- coding: utf-8 -*-
"""Security-review 发布安全审查阶段门禁策略。"""
from __future__ import annotations

import json
import hashlib
from pathlib import Path
from typing import Any

from domain.gates.base import BaseGate
from domain.security_review import h5_source_sha256


class SecurityReviewGate(BaseGate):
    """以后台同一自动审核的结果和源码指纹决定是否继续。"""

    def evaluate(self, activity_dir: Path, state: dict[str, Any]) -> list[str]:
        confirmed = state.get("confirmed", {})
        reasons: list[str] = []

        report = activity_dir / "security-review.json"
        if not report.is_file():
            reasons.append("缺少 activity/security-review.json（先按审查协议产出并原样落盘）")
            return reasons

        try:
            data = json.loads(report.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            reasons.append(f"activity/security-review.json 无法解析（{error}）")
            return reasons

        if not isinstance(data, dict):
            return ["security-review.json 必须为 JSON 对象"]
        if data.get("schemaVersion") != "security_review_json_v1":
            reasons.append("security-review.json 的 schemaVersion 必须为 security_review_json_v1")
        decision = data.get("decision")
        if decision not in {"passed", "needs_review", "blocked"}:
            reasons.append(f"security-review.json 的 decision 非法：{decision!r}")
        elif decision == "blocked":
            reasons.append(f"发布安全审查未通过（decision={decision}），先 state.py reject 回 implement 整改")

        try:
            evidence = json.loads((activity_dir / "security-review-api.json").read_text(encoding="utf-8"))
            api = evidence.get("api", {})
            if (api.get("success") is not True or api.get("schemaVersion") != "code_package_validation_v1"
                    or not api.get("validatorVersion") or not api.get("requestId") or api.get("data") != data
                    or api.get("submissionAllowed") is not (decision != "blocked")):
                reasons.append("后台校验交接证据无效，重新运行 review-h5.py；不能自行改写 API 判定")
            elif api.get("submissionAllowed") is not True:
                reasons.append("后台自动审核存在阻断项，请按 findings 整改")
            archive_hash = hashlib.sha256((activity_dir / "security-review-source.zip").read_bytes()).hexdigest()
            if api.get("packageSha256") != archive_hash or data.get("package", {}).get("archiveSha256") != archive_hash:
                reasons.append("审核 ZIP 与后台结果不一致，重新运行 review-h5.py")
            if evidence.get("sourceSha256") != h5_source_sha256(activity_dir.parent):
                reasons.append("H5 已变化，重新运行 review-h5.py 校验当前源码")
        except (OSError, ValueError, AttributeError):
            reasons.append("缺少有效后台校验/源码证据，先 python3 skills/runbook/scripts/review-h5.py；接口失败不能写成安全拒绝或通过")

        if not confirmed.get("security-review"):
            reasons.append("安全审查结果未确认（先 state.py confirm security-review）")

        return reasons
