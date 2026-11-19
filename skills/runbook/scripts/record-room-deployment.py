#!/usr/bin/env python3
"""从已绑定的公网 /health 采集 Room 发布证据；不创建、更新云资源。"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.io import load_credentials, load_decisions, load_identity, now
from domain.implementation import load_implementation, read_object, room_source_reasons, room_source_sha256
from domain.gates.room_deployment import room_deployment_reasons


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--activity-dir", default="activity")
    args = parser.parse_args()
    adir = Path(args.activity_dir).resolve()
    try:
        implementation = load_implementation(adir, load_decisions(adir) or {})
        if implementation["runtime"] != "room":
            raise ValueError("当前实现路线不是 room")
        reasons = room_source_reasons(adir.parent)
        if reasons:
            raise ValueError("；".join(reasons))
        config = read_object(adir.parent / "game-service.json")
        build = read_object(adir / "room-build.json")
        app_id = (load_identity() or {}).get("activityId", "")
        env_id = (load_credentials() or {}).get("envId", "")
        if config.get("appId") != app_id or config.get("envId") != env_id:
            raise ValueError("game-service.json 与绑定身份/凭据不一致")
        endpoint = str(config.get("endpoint") or "").rstrip("/")
        url = urlsplit(endpoint)
        if url.scheme != "https" or not url.netloc or url.username or url.password or url.query or url.fragment:
            raise ValueError("Room endpoint 必须是已绑定的 HTTPS 公网地址")
        with urlopen(endpoint + "/health", timeout=15) as response:
            health = json.load(response)
        if not isinstance(health, dict):
            raise ValueError("/health 返回格式无效")
        # 仅保存公开字段，避免把平台环境变量或密钥写进验收报告。
        report = {"schemaVersion": "room_deployment_v1", "checkedAt": now(),
                  **{key: config.get(key) for key in ("appId", "envId", "serverName", "endpoint", "ready", "healthy")},
                  "buildId": build.get("buildId"), "versionName": build.get("versionName"),
                  "sourceSha256": room_source_sha256(adir.parent),
                  "health": {key: health.get(key) for key in ("ok", "appId", "version", "redis", "instanceId")}}
        # 先验证候选报告，失败时清理旧证据，防止旧成功记录被误用。
        report_path = adir / "room-deployment.json"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        reasons = room_deployment_reasons(adir, implementation, app_id, env_id)
        if reasons:
            report_path.unlink(missing_ok=True)
            raise ValueError("；".join(reasons))
        print(f"✓ Room 版本 {health['version']} 已验证；证据：{report_path}")
        return 0
    except (OSError, ValueError, KeyError) as error:
        (adir / "room-deployment.json").unlink(missing_ok=True)
        print(f"✗ {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
