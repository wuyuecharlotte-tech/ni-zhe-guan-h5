#!/usr/bin/env python3
"""Provision a Timeflow workspace and scope type with controlled credentials."""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True

from display_names import DisplayNameError, normalize_display_name


DEFAULT_BASE_URL = "https://relay.hupu.com"
SKILL_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_PATH = "/shaper/timeflow/v1/workspaces"
SCOPE_TYPE_PATH = "/shaper/timeflow/v1/scope-types"
SCOPE_REGISTER_PATH = "/shaper/timeflow/v1/scopes/register"
WORKSPACE_ID = re.compile(r"^[\x21-\x7E]{1,64}$")
SCOPE_TYPE = re.compile(r"^[a-z][a-z0-9_]{0,31}$")
KIND = re.compile(r"^[\x21-\x7E]{1,32}$")
LOCK_STRATEGY = re.compile(r"^(row|two-level|single-writer)$")
REQUEST_ID = re.compile(r"^[\x21-\x7E]{1,64}$")
SCOPE_ID = re.compile(r"^[0-9]{1,20}$")
BIGINT_UNSIGNED_MAX = 2**64 - 1
DEFAULT_TRACE_ID = "register-platform"


def credential_file_value(name: str) -> str:
    for path in (SKILL_ROOT.parent / "credentials.json", SKILL_ROOT / "credentials.json"):
        if not path.is_file():
            continue
        try:
            credentials = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, ValueError) as failure:
            raise ValueError(f"invalid {path.name}: {failure}") from failure
        if not isinstance(credentials, dict):
            raise ValueError(f"{path.name} must contain a JSON object")
        value = credentials.get(name)
        return value.strip() if isinstance(value, str) else ""
    return ""


def shaper_token() -> str:
    value = os.environ.get("SHAPER_TOKEN", "").strip()
    if value:
        return value
    try:
        return credential_file_value("shaperToken")
    except ValueError:
        return ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Register a Shaper Timeflow workspace and scope type.")
    parser.add_argument(
        "--base-url", default=os.environ.get("TIMEFLOW_BASE_URL", DEFAULT_BASE_URL),
        help="platform origin; defaults to TIMEFLOW_BASE_URL or relay.hupu.com")
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--display-name", required=True)
    parser.add_argument("--kind", default="business")
    parser.add_argument("--scope-type", required=True)
    parser.add_argument("--lock-strategy", default="row")
    parser.add_argument("--settle-priority", type=int, default=30)
    parser.add_argument("--enabled", choices=("true", "false"), default="true")
    parser.add_argument("--request-id", required=True)
    parser.add_argument(
        "--scope-id",
        help="optionally create one scope after enabling the scope type")
    parser.add_argument(
        "--scope-display-name",
        help="business-readable scope name; required with --scope-id")
    parser.add_argument(
        "--shaper-token", "--workspace-token",
        dest="shaper_token",
        default=shaper_token(),
        help="Shaper token; defaults to SHAPER_TOKEN or credentials.json.shaperToken; "
             "required only with --scope-id")
    return parser.parse_args()


def normalize_base_url(value: str) -> str:
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("base URL must be an absolute http/https URL")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise ValueError("base URL must contain only scheme, host and optional port")
    return value.rstrip("/")


def scoped_request_id(prefix: str, *parts: str) -> str:
    value = prefix + ":" + ":".join(parts)
    if len(value) <= 64:
        return value
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]
    return f"{prefix[:24]}:{digest}"


def validate_registration_args(args: argparse.Namespace) -> tuple[str, str] | None:
    """Return a stable local error before any control-plane request is attempted."""
    checks = (
        (WORKSPACE_ID.fullmatch(args.workspace) is not None,
         "INVALID_WORKSPACE_ID",
         "workspaceId must be 1..64 visible ASCII characters"),
        (bool(args.display_name), "INVALID_DISPLAY_NAME",
         "displayName is required"),
        (bool(args.display_name)
         and _display_name_valid(
             args.display_name, "displayName", (args.workspace,)),
         "INVALID_DISPLAY_NAME",
         _display_name_error(args.display_name, "displayName", (args.workspace,))),
        (KIND.fullmatch(args.kind) is not None, "INVALID_WORKSPACE_KIND",
         "kind must be 1..32 visible ASCII characters"),
        (SCOPE_TYPE.fullmatch(args.scope_type) is not None, "INVALID_SCOPE_TYPE",
         "scopeType must match ^[a-z][a-z0-9_]{0,31}$"),
        (LOCK_STRATEGY.fullmatch(args.lock_strategy) is not None, "INVALID_LOCK_STRATEGY",
         "lockStrategy must be row, two-level or single-writer"),
        (0 <= args.settle_priority <= 255, "INVALID_SETTLE_PRIORITY",
         "settlePriority must be 0..255"),
        (REQUEST_ID.fullmatch(args.request_id) is not None, "INVALID_REQUEST_ID",
         "requestId must be 1..64 visible ASCII characters"),
        (args.scope_id is None
         or (SCOPE_ID.fullmatch(args.scope_id) is not None
             and int(args.scope_id) <= BIGINT_UNSIGNED_MAX),
         "INVALID_SCOPE_ID",
         "scopeId must be 1..20 decimal digits within BIGINT UNSIGNED"),
        (args.scope_id is None or args.scope_display_name is not None,
         "SCOPE_DISPLAY_NAME_REQUIRED",
         "--scope-id requires --scope-display-name"),
        (args.scope_id is not None or args.scope_display_name is None,
         "SCOPE_DISPLAY_NAME_WITHOUT_SCOPE",
         "--scope-display-name requires --scope-id"),
        (args.scope_id is None
         or _display_name_valid(
             args.scope_display_name or "", "scope displayName",
             (args.scope_type, args.scope_id)),
         "INVALID_SCOPE_DISPLAY_NAME",
         _display_name_error(
             args.scope_display_name or "", "scope displayName",
             (args.scope_type, args.scope_id))),
    )
    for valid, code, message in checks:
        if not valid:
            return code, message
    return None


def _display_name_valid(
    value: str,
    field: str,
    forbidden: tuple[str | None, ...],
) -> bool:
    try:
        normalize_display_name(value, field=field, forbidden=forbidden)
        return True
    except DisplayNameError:
        return False


def _display_name_error(
    value: str,
    field: str,
    forbidden: tuple[str | None, ...],
) -> str:
    try:
        normalize_display_name(value, field=field, forbidden=forbidden)
    except DisplayNameError as failure:
        return str(failure)
    return f"{field} is invalid"


def post_json(url: str, body: dict[str, Any], token: str | None,
              extra_headers: dict[str, str] | None = None,
              sign: bool = False,
              shaper_auth: bool = False) -> dict[str, Any]:
    data = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if token:
        if not shaper_auth:
            raise ValueError("Timeflow registration requests require X-Shaper-Token")
        headers["X-Shaper-Token"] = token
    if extra_headers:
        headers.update(extra_headers)
    if sign:
        if not token:
            raise ValueError("signed Timeflow requests require a Shaper token")
        timestamp = str(int(time.time() * 1000))
        encoded_path = urllib.parse.urlsplit(url).path
        idempotency = body.get("requestId", "")
        canonical = "\n".join((
            "POST", encoded_path, timestamp, str(idempotency),
            data.decode("utf-8"),
        )).encode("utf-8")
        headers["X-Timestamp"] = timestamp
        headers["X-Request-Id"] = str(uuid.uuid4())
        headers["X-Signature"] = hmac.new(
            token.encode("utf-8"), canonical, hashlib.sha256).hexdigest()
    request = urllib.request.Request(
        url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            try:
                payload = json.loads(response.read().decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                raise RuntimeError(json.dumps({
                    "status": response.status,
                    "code": "INVALID_RESPONSE",
                    "message": "platform returned non-JSON",
                }, separators=(",", ":"))) from None
            if not isinstance(payload, dict):
                raise RuntimeError(json.dumps({
                    "status": response.status,
                    "code": "INVALID_RESPONSE",
                    "message": "platform response is not a JSON object",
                }, separators=(",", ":")))
            if payload.get("ok") is False:
                error = payload.get("error", {})
                raise RuntimeError(json.dumps({
                    "status": response.status,
                    "code": error.get("code", "PROTOCOL_ERROR"),
                    "message": error.get("message", "request rejected"),
                }, ensure_ascii=False, separators=(",", ":")))
            return {"status": response.status, "body": payload}
    except urllib.error.HTTPError as failure:
        try:
            payload = json.loads(failure.read().decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            payload = None
        error = payload.get("error", {}) if isinstance(payload, dict) else {}
        raise RuntimeError(json.dumps({
            "status": failure.code,
            "code": error.get("code", "HTTP_ERROR"),
            "message": error.get("message", "request failed"),
        }, ensure_ascii=False, separators=(",", ":"))) from None
    except (urllib.error.URLError, OSError) as failure:
        reason = getattr(failure, "reason", failure)
        raise RuntimeError(json.dumps({
            "status": 0,
            "code": "TRANSPORT_ERROR",
            "message": type(reason).__name__,
        }, ensure_ascii=False, separators=(",", ":"))) from None


def main() -> int:
    args = parse_args()
    args.workspace = args.workspace.strip()
    args.kind = args.kind.strip()
    args.scope_type = args.scope_type.strip()
    args.lock_strategy = args.lock_strategy.strip()
    args.request_id = args.request_id.strip()
    args.display_name = args.display_name.strip()
    args.scope_display_name = (
        args.scope_display_name.strip()
        if args.scope_display_name is not None
        else None
    )
    validation_error = validate_registration_args(args)
    if validation_error is not None:
        code, message = validation_error
        print(json.dumps({
            "ok": False, "code": code, "message": message,
        }, ensure_ascii=False), file=sys.stderr)
        return 2
    try:
        base_url = normalize_base_url(args.base_url)
    except ValueError as failure:
        print(json.dumps({
            "ok": False, "code": "INVALID_BASE_URL", "message": str(failure),
        }, ensure_ascii=False), file=sys.stderr)
        return 2

    if not args.shaper_token:
        print(json.dumps({
            "ok": False, "code": "SHAPER_TOKEN_REQUIRED",
            "message": "set SHAPER_TOKEN, add shaperToken to credentials.json, "
                       "or pass --shaper-token",
        }, ensure_ascii=False), file=sys.stderr)
        return 2

    workspace_request = scoped_request_id(
        args.request_id, "workspace", args.workspace)
    scope_type_request = scoped_request_id(
        args.request_id, "scope-type", args.workspace, args.scope_type)
    trace_prefix = DEFAULT_TRACE_ID + "-" + uuid.uuid4().hex[:8]
    trace_id = scoped_request_id("trace", trace_prefix, args.request_id)
    if not REQUEST_ID.fullmatch(trace_id):
        print(json.dumps({
            "ok": False, "code": "INVALID_REQUEST_ID",
            "message": "derived request trace ID is invalid",
        }, ensure_ascii=False), file=sys.stderr)
        return 2
    trace_headers = {"X-Request-Id": trace_id}
    workspace_trace_id = trace_id

    try:
        workspace = post_json(
            base_url + WORKSPACE_PATH,
            {
                "workspaceId": args.workspace,
                "displayName": args.display_name,
                "kind": args.kind,
                "requestId": workspace_request,
            },
            args.shaper_token,
            {
                **trace_headers,
                "X-Workspace-Id": args.workspace,
                "X-Protocol-Version": "1",
                "X-Idempotency-Key": workspace_request,
            },
            sign=True,
            shaper_auth=True,
        )
        scope_type_trace_id = scoped_request_id(
            "trace", DEFAULT_TRACE_ID + "-" + uuid.uuid4().hex[:8],
            args.request_id)
        trace_headers = {"X-Request-Id": scope_type_trace_id}
        scope_type = post_json(
            base_url + SCOPE_TYPE_PATH,
            {
                "workspaceId": args.workspace,
                "scopeType": args.scope_type,
                "lockStrategy": args.lock_strategy,
                "settlePriority": args.settle_priority,
                "enabled": args.enabled == "true",
                "requestId": scope_type_request,
            },
            args.shaper_token,
            {
                **trace_headers,
                "X-Workspace-Id": args.workspace,
                "X-Protocol-Version": "1",
                "X-Idempotency-Key": scope_type_request,
            },
            sign=True,
            shaper_auth=True,
        )
        result: dict[str, Any] = {
            "ok": True,
            "workspace": {
                "workspaceId": args.workspace,
                "requestId": workspace_trace_id,
                "status": workspace["status"],
                "responseRequestId": workspace["body"].get("requestId"),
                "replayed": workspace["body"].get("replayed"),
            },
            "scopeType": {
                "workspaceId": args.workspace,
                "requestId": scope_type_trace_id,
                "scopeType": args.scope_type,
                "status": scope_type["status"],
                "responseRequestId": scope_type["body"].get("requestId"),
                "replayed": scope_type["body"].get("replayed"),
            },
        }
        if args.scope_id:
            scope_request = scoped_request_id(
                args.request_id, "scope", args.workspace,
                args.scope_type, args.scope_id)
            scope = post_json(
                base_url + SCOPE_REGISTER_PATH,
                {
                    "scopeType": args.scope_type,
                    "scopeId": args.scope_id,
                    "displayName": args.scope_display_name,
                    "requestId": scope_request,
                },
                args.shaper_token,
                {
                    "X-Workspace-Id": args.workspace,
                    "X-Protocol-Version": "1",
                    "X-Idempotency-Key": scope_request,
                },
                sign=True,
                shaper_auth=True,
            )
            result["scope"] = {
                "workspaceId": args.workspace,
                "scopeType": args.scope_type,
                "scopeId": args.scope_id,
                "displayName": args.scope_display_name,
                "status": scope["status"],
                "replayed": scope["body"].get("replayed"),
            }
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        return 0
    except RuntimeError as failure:
        print(str(failure), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
