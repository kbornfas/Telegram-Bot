"""Lightweight unit tests for helper utilities in AddUserService."""

from __future__ import annotations

import types

import pytest

from src.userbot.service import AddUserService
from src.utils.identifiers import Identifier


def test_phone_candidates_normalizes_variants() -> None:
    service = AddUserService()
    assert service._phone_candidates("+15551234567") == ["+15551234567", "15551234567"]


def test_cache_resolved_user_adds_user_id_alias() -> None:
    service = AddUserService()
    cache: dict[str, object] = {}
    stub_user = types.SimpleNamespace(id=42)
    identifier = Identifier(kind="user_id", value="42")

    service._cache_resolved_user(identifier, stub_user, cache)

    assert cache["42"] is stub_user


def test_build_resolved_user_normalizes_phone_and_username() -> None:
    service = AddUserService()
    identifier = Identifier(kind="username", value="@Alice")
    stub_user = types.SimpleNamespace(id=7, access_hash=123456789, phone="15550001111", username="alice")

    resolved = service._build_resolved_user(identifier, stub_user)

    assert resolved.user_id == 7
    assert resolved.access_hash == 123456789
    assert resolved.phone == "+15550001111"
    assert resolved.username == "alice"


def test_build_resolved_user_requires_user_id() -> None:
    service = AddUserService()
    identifier = Identifier(kind="username", value="@missing")
    stub_user = types.SimpleNamespace(access_hash=None, phone=None, username=None)

    with pytest.raises(ValueError):
        service._build_resolved_user(identifier, stub_user)
