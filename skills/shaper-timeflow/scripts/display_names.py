#!/usr/bin/env python3
"""Validate business-readable workspace and scope display names."""
from __future__ import annotations

import re
from collections.abc import Iterable


MACHINE_NAME = re.compile(
    r"^(?:"
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    r"|[0-9a-f]{32}"
    r"|[0-9A-HJKMNP-TV-Z]{26}"
    r"|app_[A-Za-z0-9_-]+"
    r"|ws_[0-9a-f]{32}"
    r"|project-[A-Za-z0-9_-]+"
    r")$",
)


class DisplayNameError(ValueError):
    """A display name is missing or cannot be understood as a business label."""


def normalize_display_name(
    value: object,
    *,
    field: str,
    forbidden: Iterable[str | None] = (),
) -> str:
    if not isinstance(value, str):
        raise DisplayNameError(f"{field} must be a string")
    normalized = value.strip()
    if not normalized:
        raise DisplayNameError(f"{field} is required")
    if len(normalized.encode("utf-16-le")) // 2 > 128:
        raise DisplayNameError(f"{field} must be at most 128 characters")
    if any(ord(char) < 32 or 0x7F <= ord(char) <= 0x9F for char in normalized):
        raise DisplayNameError(f"{field} must not contain control characters")
    if not any(char.isalpha() for char in normalized):
        raise DisplayNameError(f"{field} must contain readable letters")
    if MACHINE_NAME.fullmatch(normalized):
        raise DisplayNameError(f"{field} must be a business name, not a machine identifier")
    for candidate in forbidden:
        if isinstance(candidate, str) and candidate and normalized == candidate.strip():
            raise DisplayNameError(
                f"{field} must describe the business object instead of repeating its identifier")
    return normalized
