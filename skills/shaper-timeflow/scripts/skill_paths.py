#!/usr/bin/env python3
"""Resolve files bundled with the installable skill."""
from __future__ import annotations
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
DEFINITION_SCHEMA = SKILL_ROOT / "references" / "schema" / "definition.schema.json"
