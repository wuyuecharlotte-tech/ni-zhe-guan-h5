"""实现路线与 Room 产物；运行方式和持久化分别建模。"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from domain.decisions import DEPLOYMENT_CLOUD, DEPLOYMENT_UNRESOLVED, deployment_mode


def read_object(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path.name} 必须是 JSON 对象")
    return data


def validate_implementation(data: dict[str, Any]) -> None:
    if data.get("schemaVersion") != "implementation_v1":
        raise ValueError("implementation.json 的 schemaVersion 必须为 implementation_v1")
    runtime = data.get("runtime")
    persistence = data.get("persistence")
    if runtime not in {"static", "activity-api", "room"}:
        raise ValueError("runtime 必须为 static / activity-api / room")
    if persistence not in {"none", "postgresql"}:
        raise ValueError("persistence 必须为 none / postgresql")
    if runtime == "static" and persistence != "none":
        raise ValueError("static 路线不能配置云端持久化")
    if runtime == "activity-api" and persistence != "postgresql":
        raise ValueError("activity-api 路线使用 PostgreSQL 基线")
    if type(data.get("activityApi", False)) is not bool:
        raise ValueError("activityApi 必须为 boolean")
    if data.get("activityApi") and (runtime != "room" or persistence != "postgresql"):
        raise ValueError("Room 附加活动 API 时需要 postgresql 持久化")
    if runtime == "room" and (not isinstance(data.get("expectedVersion"), str) or not data["expectedVersion"].strip()):
        raise ValueError("Room 路线必须设置 expectedVersion（对应本次 /health.version）")
    if not str(data.get("note") or "").strip():
        raise ValueError("实现路线缺少已确认需求的依据 note")


def load_implementation(activity_dir: Path, decisions: dict[str, Any]) -> dict[str, Any]:
    path = activity_dir / "implementation.json"
    mode = deployment_mode(decisions)
    if path.exists():
        data = read_object(path)
        validate_implementation(data)
        cloud = mode == DEPLOYMENT_CLOUD
        if mode == DEPLOYMENT_UNRESOLVED or (data["runtime"] != "static") != cloud:
            raise ValueError("实现路线与部署决策不一致；Room 需要云运行，即使不保存战绩")
        return data
    # 兼容既有活动包；有 Room 产物时必须明确选路，避免套用 SQL/云函数门禁。
    if (activity_dir.parent / "game").exists() or (activity_dir.parent / "game-service.json").exists():
        raise ValueError("发现 Room 产物，先 state.py configure --runtime room --persistence none --expected-version <本次版本> --note <需求依据>；需要持久化时选 postgresql")
    if mode == DEPLOYMENT_UNRESOLVED:
        return {"runtime": "unresolved", "persistence": "unresolved"}
    cloud = mode == DEPLOYMENT_CLOUD
    return {"runtime": "activity-api" if cloud else "static", "persistence": "postgresql" if cloud else "none"}


def room_source_reasons(workspace: Path) -> list[str]:
    root = workspace / "game"
    required = ["Dockerfile", "package.json", "package-lock.json", "server/index.js"]
    reasons = [f"缺少 game/{name}" for name in required if not (root / name).is_file()]
    if not (root / "server" / "rooms").is_dir() or not any((root / "server" / "rooms").glob("*.js")):
        reasons.append("缺少 game/server/rooms/ 下的 Room 实现")
    if not (root / "server" / "runtime").is_dir():
        reasons.append("缺少 game/server/runtime/ 平台接线")
    return reasons


def room_source_sha256(workspace: Path) -> str:
    root = workspace / "game"
    files = [root / name for name in ("Dockerfile", "package.json", "package-lock.json")]
    files += [p for p in (root / "server").rglob("*") if p.is_file()]
    digest = hashlib.sha256()
    for path in sorted(files):
        digest.update(path.relative_to(root).as_posix().encode("utf-8") + b"\0")
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()
