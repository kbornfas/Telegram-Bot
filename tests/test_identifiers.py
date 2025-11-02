"""Unit tests for identifier parsing."""

from __future__ import annotations

import pytest

from src.utils.identifiers import Identifier, normalize_identifier, parse_identifiers


def test_normalize_phone_with_plus():
    identifier = normalize_identifier("+15551234567")
    assert identifier.kind == "phone"
    assert identifier.value == "+15551234567"


def test_normalize_phone_without_plus():
    identifier = normalize_identifier("15551234567")
    assert identifier.kind == "phone"
    assert identifier.value == "+15551234567"


def test_normalize_username_with_at():
    identifier = normalize_identifier("@alice")
    assert identifier.kind == "username"
    assert identifier.value == "@alice"


def test_normalize_username_without_at():
    identifier = normalize_identifier("bob")
    assert identifier.kind == "username"
    assert identifier.value == "@bob"


def test_normalize_numeric_user_id():
    identifier = normalize_identifier("123456")
    assert identifier.kind == "user_id"
    assert identifier.value == "123456"


def test_parse_identifiers_mixed():
    items = ["@cat", "+123", "456"]
    identifiers = parse_identifiers(items)
    assert [identifier.kind for identifier in identifiers] == ["username", "phone", "user_id"]
