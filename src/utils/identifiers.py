"""Utilities for parsing user identifiers."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, List


@dataclass(slots=True)
class Identifier:
    kind: str
    value: str


WRAP_PATTERN = re.compile(r"^[\s<>{}\[\]()'\"]+|[\s<>{}\[\]()'\"]+$")


def normalize_identifier(raw: str) -> Identifier:
    candidate = raw.strip()
    if not candidate:
        raise ValueError("Empty identifier")

    candidate = WRAP_PATTERN.sub("", candidate)
    candidate = candidate.strip()
    if not candidate:
        raise ValueError("Empty identifier")

    stripped = candidate.replace(" ", "").replace("-", "")
    if stripped.startswith("00") and stripped[2:].isdigit():
        stripped = "+" + stripped[2:]

    if stripped.startswith("+") and stripped[1:].isdigit():
        return Identifier(kind="phone", value=stripped)

    if stripped.isdigit() and len(stripped) >= 7:
        return Identifier(kind="phone", value="+" + stripped)

    if candidate.startswith("@"):
        return Identifier(kind="username", value=candidate)

    if candidate.isdigit():
        return Identifier(kind="user_id", value=candidate)

    return Identifier(kind="username", value="@" + candidate)


def parse_identifiers(iterable: Iterable[str]) -> List[Identifier]:
    result: List[Identifier] = []
    seen: set[tuple[str, str]] = set()
    for item in iterable:
        identifier = normalize_identifier(item)
        key = (identifier.kind, identifier.value.lower() if identifier.kind == "username" else identifier.value)
        if key in seen:
            continue
        seen.add(key)
        result.append(identifier)
    return result
