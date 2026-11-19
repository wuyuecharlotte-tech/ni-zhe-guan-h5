#!/usr/bin/env python3
"""Run the bundled JSON Schema preflight for a definition."""
from __future__ import annotations

import sys
sys.dont_write_bytecode = True

import argparse
import json
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from skill_paths import DEFINITION_SCHEMA


DECIMAL = re.compile(r"^-?(0|[1-9][0-9]*)(\.[0-9]+)?$")
RESOURCE_ID = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
JSON_TYPE = {
    "object": lambda value: isinstance(value, dict),
    "array": lambda value: isinstance(value, list),
    "string": lambda value: isinstance(value, str),
    "integer": lambda value: isinstance(value, int) and not isinstance(value, bool),
    "number": lambda value: isinstance(value, (int, float)) and not isinstance(value, bool),
    "boolean": lambda value: isinstance(value, bool),
    "null": lambda value: value is None,
}


def error(message: str) -> None:
    print(message, file=sys.stderr)


def decimal_text(value: Any) -> bool:
    return isinstance(value, str) and bool(DECIMAL.fullmatch(value))


def positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 1


def json_path(parts: list[str | int]) -> str:
    if not parts:
        return "$"
    return "$" + "".join(
        f"[{part}]" if isinstance(part, int) else f".{part}" for part in parts)


def schema_errors(value: Any, schema: Any, root: Any,
                  parts: list[str | int] | None = None) -> list[str]:
    """Validate the JSON Schema subset used by the bundled definition schema."""
    parts = [] if parts is None else parts
    path = json_path(parts)
    if not isinstance(schema, dict):
        return [f"schema at {path} must be an object"]
    if "$ref" in schema:
        reference = schema["$ref"]
        if not isinstance(reference, str) or not reference.startswith("#/"):
            return [f"schema at {path} has unsupported $ref: {reference}"]
        target: Any = root
        try:
            for token in reference[2:].split("/"):
                target = target[token.replace("~1", "/").replace("~0", "~")]
        except (KeyError, TypeError):
            return [f"schema at {path} has unresolved $ref: {reference}"]
        return schema_errors(value, target, root, parts)

    errors: list[str] = []
    expected = schema.get("type")
    if expected is not None:
        expected_types = expected if isinstance(expected, list) else [expected]
        if not any(kind in JSON_TYPE and JSON_TYPE[kind](value) for kind in expected_types):
            return [f"{path} must be of type {'|'.join(expected_types)}"]

    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path} must be one of {schema['enum']}")

    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            errors.append(f"{path} must have length >= {schema['minLength']}")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            errors.append(f"{path} must have length <= {schema['maxLength']}")
        if "pattern" in schema and re.fullmatch(schema["pattern"], value) is None:
            errors.append(f"{path} does not match {schema['pattern']}")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path} must be >= {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path} must be <= {schema['maximum']}")

    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append(f"{path} must contain at least {schema['minItems']} item(s)")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(f"{path} must contain at most {schema['maxItems']} item(s)")
        if schema.get("uniqueItems") is True:
            canonical = [json.dumps(item, sort_keys=True, separators=(",", ":"))
                         for item in value]
            if len(canonical) != len(set(canonical)):
                errors.append(f"{path} items must be unique")
        if "items" in schema:
            for index, item in enumerate(value):
                errors.extend(schema_errors(item, schema["items"], root, parts + [index]))

    if isinstance(value, dict):
        for required in schema.get("required", []):
            if required not in value:
                errors.append(f"{json_path(parts + [required])} is required")
        properties = schema.get("properties", {})
        additional = schema.get("additionalProperties", True)
        if additional is False:
            for key in value:
                if key not in properties:
                    errors.append(f"{json_path(parts + [key])} is not allowed")
        elif isinstance(additional, dict):
            for key, item in value.items():
                if key not in properties:
                    errors.extend(schema_errors(item, additional, root, parts + [key]))
        for key, child in properties.items():
            if key in value:
                errors.extend(schema_errors(value[key], child, root, parts + [key]))
    return errors


def business_errors(definition: Any) -> list[str]:
    if not isinstance(definition, dict):
        return []

    metrics = definition.get("metrics")
    metric_ids: set[str] = set()
    errors: list[str] = []
    metrics = metrics if isinstance(metrics, list) else []
    for index, metric in enumerate(metrics):
        prefix = f"metrics[{index}]"
        if not isinstance(metric, dict):
            errors.append(f"{prefix} must be an object")
            continue
        metric_id = metric.get("metricId")
        if not isinstance(metric_id, str) or not RESOURCE_ID.fullmatch(metric_id):
            errors.append(f"{prefix}.metricId is invalid")
        elif metric_id in metric_ids:
            errors.append(f"duplicate metricId: {metric_id}")
        else:
            metric_ids.add(metric_id)
        precision = metric.get("precision")
        if not isinstance(precision, int) or isinstance(precision, bool) \
                or not 0 <= precision <= 6:
            errors.append(f"{prefix}.precision must be an integer in 0..6")
        cap = metric.get("cap")
        if cap is not None and not decimal_text(cap):
            errors.append(f"{prefix}.cap must be a plain decimal string or null")
        if cap is not None and "capScope" not in metric:
            errors.append(f"{prefix}.cap requires capScope")
        if metric.get("shared") is True:
            errors.append(f"{prefix}.shared=true is not supported by v1")

    stream = definition.get("stream")
    stream = stream if isinstance(stream, list) else []
    seen_rules: dict[tuple[str, int], str] = {}
    for index, entry in enumerate(stream):
        prefix = f"stream[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{prefix} must be an object")
            continue
        metric_id = entry.get("metricId")
        if metric_id not in metric_ids:
            errors.append(f"{prefix}.metricId references an undeclared metric")
        rule_key = entry.get("ruleKey")
        version = entry.get("ruleVersion")
        if isinstance(rule_key, str) and positive_int(version):
            key = (rule_key, version)
            canonical = json.dumps(entry, sort_keys=True, separators=(",", ":"))
            if key in seen_rules and seen_rules[key] != canonical:
                errors.append(
                    f"duplicate rule declaration with different content: "
                    f"{rule_key}@{version}")
            seen_rules[key] = canonical
        if entry.get("carrier", "interpreter") != "interpreter":
            errors.append(f"{prefix}.carrier must be interpreter for v1")

        phases = entry.get("phases")
        if not isinstance(phases, list) or not phases:
            continue
        for phase_index, phase in enumerate(phases):
            pp = f"{prefix}.phases[{phase_index}]"
            if not isinstance(phase, dict):
                errors.append(f"{pp} must be an object")
                continue
            if not decimal_text(phase.get("baseRate")):
                errors.append(f"{pp}.baseRate must be a plain decimal string")
            capacity = phase.get("capacity")
            if capacity is not None and not decimal_text(capacity):
                errors.append(f"{pp}.capacity must be a plain decimal string or null")
            until = phase.get("until")
            if isinstance(until, dict) and until.get("kind") == "progress":
                try:
                    if Decimal(str(until.get("value"))) <= 0:
                        errors.append(f"{pp}.until.value must be positive")
                except (InvalidOperation, ValueError):
                    errors.append(f"{pp}.until.value must be numeric")
        immortal = [i for i, phase in enumerate(phases)
                    if isinstance(phase, dict)
                    and isinstance(phase.get("until"), dict)
                    and phase["until"].get("kind") == "immortal"]
        if immortal and immortal != [len(phases) - 1]:
            errors.append(f"{prefix}.immortal must be the final phase only")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("definition", help="definition JSON file")
    args = parser.parse_args()
    definition_path = Path(args.definition).expanduser().resolve()
    if not definition_path.is_file():
        error(f"definition file not found: {definition_path}")
        return 2
    try:
        definition = json.loads(definition_path.read_text(encoding="utf-8"))
        schema = json.loads(DEFINITION_SCHEMA.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as failure:
        error(f"cannot read definition or bundled schema: {failure}")
        return 2

    schema_problems = list(dict.fromkeys(
        schema_errors(definition, schema, schema)))
    business_problems = list(dict.fromkeys(business_errors(definition)))
    problems = schema_problems + business_problems
    if problems:
        if schema_problems:
            print("schema errors:", file=sys.stderr)
            print("\n".join(schema_problems), file=sys.stderr)
        if business_problems:
            print("local business checks:", file=sys.stderr)
            print("\n".join(business_problems), file=sys.stderr)
        return 1
    print("schema preflight passed")
    print("business semantics and platform replay were not verified; "
          "submit to /shaper/timeflow/v1/definitions/{version}/validate")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
