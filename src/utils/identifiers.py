"""Utilities for parsing user identifiers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Sequence


@dataclass(slots=True)
class Identifier:
    kind: str
    value: str


def normalize_identifier(raw: str) -> Identifier:
    candidate = raw.strip()
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
    for item in iterable:
        result.append(normalize_identifier(item))
    return result
