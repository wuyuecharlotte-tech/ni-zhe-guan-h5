#!/usr/bin/env python3
"""Resolve a stable Shaper Timeflow workspace identity before registration."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True

from display_names import DisplayNameError, normalize_display_name


SKILL_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ID = re.compile(r"^[\x21-\x7E]{1,64}$")
GENERATED_WORKSPACE_ID = re.compile(r"^ws_[0-9a-f]{32}$")
DEFAULT_TIMEFLOW_FILE = "timeflow.json"


class ResolutionError(RuntimeError):
    def __init__(self, code: str, message: str, exit_code: int = 2) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.exit_code = exit_code


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def fail(error: ResolutionError) -> int:
    print(json.dumps({
        "ok": False,
        "code": error.code,
        "message": error.message,
    }, ensure_ascii=False, separators=(",", ":")), file=sys.stderr)
    return error.exit_code


def clean_identifier(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized if WORKSPACE_ID.fullmatch(normalized) else None


def read_activity_id(value: object) -> str | None:
    if not isinstance(value, dict):
        return None
    return clean_identifier(value.get("activityId"))


def activity_candidates(explicit: str | None) -> list[Path]:
    if explicit:
        return [Path(explicit).expanduser()]
    candidates = [
        Path.cwd() / "activity.json",
        SKILL_ROOT.parent.parent / "activity.json",
        SKILL_ROOT.parent / "activity.json",
    ]
    unique: list[Path] = []
    for path in candidates:
        if path not in unique:
            unique.append(path)
    return unique


def find_activity_id(explicit: str | None) -> str | None:
    for path in activity_candidates(explicit):
        if not path.is_file():
            continue
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, ValueError):
            continue
        identity = read_activity_id(value)
        if identity is not None:
            return identity
    return None


def read_timeflow_config(path: Path) -> dict[str, str] | None:
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, ValueError) as failure:
        raise ResolutionError(
            "INVALID_TIMEFLOW_FILE",
            f"{path} is not a readable JSON object: {failure}") from failure
    workspace_id = clean_identifier(
        value.get("workspaceId") if isinstance(value, dict) else None)
    if workspace_id is None:
        raise ResolutionError(
            "INVALID_TIMEFLOW_FILE",
            f"{path} must contain a valid workspaceId")
    display_name = value.get("displayName") if isinstance(value, dict) else None
    try:
        normalized_name = normalize_display_name(
            display_name,
            field="displayName",
            forbidden=(workspace_id,))
    except DisplayNameError as failure:
        raise ResolutionError(
            "INVALID_TIMEFLOW_FILE",
            f"{path} has an invalid displayName: {failure}") from failure
    return {
        "workspaceId": workspace_id,
        "displayName": normalized_name,
    }


def write_timeflow_config(path: Path, workspace_id: str, display_name: str) -> None:
    payload = {
        "workspaceId": workspace_id,
        "displayName": display_name,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=path.parent,
                prefix=f".{path.name}.",
                suffix=".tmp",
                delete=False) as output:
            temporary = output.name
            json.dump(payload, output, ensure_ascii=False, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        temporary = None
    finally:
        if temporary is not None:
            try:
                Path(temporary).unlink()
            except OSError:
                pass


def success(
    workspace_id: str,
    source: str,
    *,
    trusted_project_id: str | None = None,
    requires_confirmation: bool = False,
    saved: bool = False,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "ok": True,
        "workspaceId": workspace_id,
        "source": source,
        "requiresConfirmation": requires_confirmation,
        "saved": saved,
    }
    if trusted_project_id is not None:
        result["trustedProjectId"] = trusted_project_id
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Resolve a stable workspaceId for Shaper Timeflow onboarding.")
    parser.add_argument(
        "--activity-file",
        help="explicit activity.json path; omitted uses cwd then the skill workspace")
    parser.add_argument("--app-id", help="appId returned by MCP project_context")
    parser.add_argument(
        "--project-id",
        help="Shaper-hosted Qoder projectId; requires --qoder-session")
    parser.add_argument(
        "--qoder-session",
        help="current Shaper-hosted Qoder session, proving the projectId context")
    parser.add_argument(
        "--generate",
        action="store_true",
        help="generate a candidate ID when no authoritative identity exists")
    parser.add_argument(
        "--confirm-generated",
        help="exact previously displayed ws_<32 hex> candidate confirmed by the user")
    parser.add_argument("--display-name", help="business-readable workspace name")
    parser.add_argument(
        "--save",
        help=f"persist a confirmed generated identity to this path, usually {DEFAULT_TIMEFLOW_FILE}")
    return parser.parse_args()


def validate_args(args: argparse.Namespace) -> None:
    if args.project_id is not None and not args.qoder_session:
        raise ResolutionError(
            "QODER_CONTEXT_REQUIRED",
            "--project-id is only valid with --qoder-session; use --app-id outside Qoder")
    if args.qoder_session is not None and not args.project_id:
        raise ResolutionError(
            "QODER_PROJECT_ID_REQUIRED",
            "--qoder-session requires --project-id")
    if args.app_id is not None and clean_identifier(args.app_id) is None:
        raise ResolutionError(
            "INVALID_APP_ID",
            "--app-id must be 1..64 visible ASCII characters")
    if args.project_id is not None and clean_identifier(args.project_id) is None:
        raise ResolutionError(
            "INVALID_PROJECT_ID",
            "--project-id must be 1..64 visible ASCII characters")
    if args.confirm_generated is not None:
        if args.save is None:
            raise ResolutionError(
                "CONFIRMATION_STORAGE_REQUIRED",
                "--confirm-generated requires --save")
        if not GENERATED_WORKSPACE_ID.fullmatch(args.confirm_generated.strip()):
            raise ResolutionError(
                "INVALID_GENERATED_ID",
                "--confirm-generated must be ws_ followed by 32 lowercase hex characters")
        if args.display_name is None:
            target = Path(args.save).expanduser()
            existing = read_timeflow_config(target)
            if existing is None \
                    or existing["workspaceId"] != args.confirm_generated.strip():
                raise ResolutionError(
                    "DISPLAY_NAME_REQUIRED",
                    "--display-name is required when saving a new generated workspace identity")
    elif args.save is not None:
        raise ResolutionError(
            "CONFIRMATION_REQUIRED",
            "--save requires --confirm-generated after explicit user confirmation")
    if args.display_name is not None and args.confirm_generated is None:
        raise ResolutionError(
            "DISPLAY_NAME_REQUIRES_SAVE",
            "--display-name requires --confirm-generated")
    if args.activity_file is not None and not Path(args.activity_file).expanduser().is_file():
        raise ResolutionError(
            "ACTIVITY_FILE_NOT_FOUND",
            "--activity-file must point to an existing file")


def confirm_generated(
    args: argparse.Namespace,
    target: Path,
) -> dict[str, Any]:
    workspace_id = args.confirm_generated.strip()
    existing = read_timeflow_config(target)
    if existing is not None:
        if existing["workspaceId"] == workspace_id:
            if args.display_name is not None:
                try:
                    requested_name = normalize_display_name(
                        args.display_name,
                        field="displayName",
                        forbidden=(workspace_id,))
                except DisplayNameError as failure:
                    raise ResolutionError(
                        "INVALID_DISPLAY_NAME", str(failure)) from failure
                if requested_name != existing["displayName"]:
                    raise ResolutionError(
                        "TIMEFLOW_CONFIG_CONFLICT",
                        f"{target} already contains a different workspace displayName",
                        exit_code=1)
            return success(workspace_id, "generated", saved=True)
        raise ResolutionError(
            "TIMEFLOW_CONFIG_CONFLICT",
            f"{target} already contains a different workspaceId",
            exit_code=1)
    if args.display_name is None:
        raise ResolutionError(
            "DISPLAY_NAME_REQUIRED",
            "--display-name is required when saving a new generated workspace identity")
    try:
        display_name = normalize_display_name(
            args.display_name,
            field="displayName",
            forbidden=(workspace_id,))
    except DisplayNameError as failure:
        raise ResolutionError("INVALID_DISPLAY_NAME", str(failure)) from failure
    write_timeflow_config(target, workspace_id, display_name)
    return success(workspace_id, "generated", saved=True)


def resolve(args: argparse.Namespace) -> dict[str, Any]:
    validate_args(args)
    target = (
        Path(args.save).expanduser()
        if args.save is not None
        else Path.cwd() / DEFAULT_TIMEFLOW_FILE
    )

    activity_id = find_activity_id(args.activity_file)
    if activity_id is not None:
        return success(activity_id, "activity")

    if args.qoder_session and args.project_id:
        project_id = clean_identifier(args.project_id)
        assert project_id is not None
        return success(
            project_id,
            "qoder-project",
            trusted_project_id=project_id)

    if args.app_id is not None:
        app_id = clean_identifier(args.app_id)
        assert app_id is not None
        return success(app_id, "mcp-app")

    if args.confirm_generated is not None:
        return confirm_generated(args, target)

    existing = read_timeflow_config(target)
    if existing is not None:
        return success(
            existing["workspaceId"],
            "saved",
            saved=True)

    if args.generate:
        candidate = f"ws_{uuid.uuid4().hex}"
        return success(
            candidate,
            "generated",
            requires_confirmation=True,
            saved=False)

    raise ResolutionError(
        "WORKSPACE_IDENTITY_REQUIRED",
        "no activityId, Qoder projectId, MCP appId, or saved timeflow.json; "
        "call project_context or use --generate")


def main() -> int:
    try:
        emit(resolve(parse_args()))
        return 0
    except ResolutionError as failure:
        return fail(failure)


if __name__ == "__main__":
    raise SystemExit(main())
