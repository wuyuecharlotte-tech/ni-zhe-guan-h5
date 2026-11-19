"""Room 发布证据：目标绑定、源码指纹、流量版本与线上 health。"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from domain.implementation import read_object, room_source_sha256


def room_deployment_reasons(activity_dir: Path, implementation: dict[str, Any],
                            app_id: str, env_id: str) -> list[str]:
    try:
        config = read_object(activity_dir.parent / "game-service.json")
        report = read_object(activity_dir / "room-deployment.json")
        build = read_object(activity_dir / "room-build.json")
    except (OSError, ValueError) as error:
        return [f"Room 发布证据缺失或无法解析：{error}；按 game-room-deploy.md 记录本次构建与线上版本"]
    reasons: list[str] = []
    if report.get("schemaVersion") != "room_deployment_v1":
        reasons.append("room-deployment.json 协议必须为 room_deployment_v1")
    for key, expected in (("appId", app_id), ("envId", env_id),
                          ("serverName", config.get("serverName")), ("endpoint", config.get("endpoint"))):
        if not expected or config.get(key) != expected or report.get(key) != expected:
            reasons.append(f"Room 发布证据与绑定目标不一致：{key}")
    if report.get("ready") is not True or report.get("healthy") is not True:
        reasons.append("Room 基础服务未就绪或不健康")
    if report.get("sourceSha256") != room_source_sha256(activity_dir.parent):
        reasons.append("Room 源码已改变，需重新部署并采集版本证据")
    health = report.get("health")
    if not isinstance(health, dict):
        reasons.append("Room 缺少线上 health 证据")
    elif (health.get("ok") is not True or health.get("redis") != "connected"
          or health.get("appId") != app_id or health.get("version") != implementation["expectedVersion"]):
        reasons.append("线上 /health 必须健康、Redis connected、appId 匹配且 version 等于本次 expectedVersion；Demo 就绪不能替代玩法上线")
    flow = build.get("flowRatio")
    if (build.get("status") != "success" or type(flow) not in (int, float) or flow != 100
            or not build.get("buildId") or not build.get("versionName")
            or report.get("buildId") != build.get("buildId")
            or report.get("versionName") != build.get("versionName")):
        reasons.append("本次 Room 构建成功且版本承接 100% 流量的记录缺失（room-build.json）")
    return reasons
