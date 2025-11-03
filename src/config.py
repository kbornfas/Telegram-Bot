"""Configuration utilities for the Telegram automation project."""

from __future__ import annotations

import dataclasses
import os
from typing import List

from dotenv import load_dotenv

# Load variables from a local .env file if present so developers can keep secrets out of source.
# override=True ensures the .env file wins over any stale environment variables from previous sessions.
load_dotenv(override=True)


@dataclasses.dataclass
class BotSettings:
    bot_token: str
    allowed_chats: List[int]


@dataclasses.dataclass
class TelethonSettings:
    api_id: int
    api_hash: str
    session_name: str = "userbot_session"
    phone_number: str | None = None
    password: str | None = None
    invite_interval_seconds: float = 1.0


def parse_allowed_chats(raw: str | None) -> List[int]:
    if not raw:
        return []
    ids: List[int] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            ids.append(int(part))
        except ValueError:
            raise ValueError(f"Invalid chat id value: {part!r}")
    return ids


def load_bot_settings() -> BotSettings:
    token = os.getenv("BOT_TOKEN")
    if not token:
        raise RuntimeError("BOT_TOKEN environment variable is required")
    return BotSettings(bot_token=token, allowed_chats=parse_allowed_chats(os.getenv("BOT_ALLOWED_CHATS")))


def load_telethon_settings() -> TelethonSettings:
    api_id_raw = os.getenv("TELETHON_API_ID")
    api_hash = os.getenv("TELETHON_API_HASH")

    if not api_id_raw or not api_hash:
        raise RuntimeError("TELETHON_API_ID and TELETHON_API_HASH environment variables are required")

    try:
        api_id = int(api_id_raw)
    except ValueError as exc:
        raise RuntimeError("TELETHON_API_ID must be an integer") from exc

    session_name = os.getenv("TELETHON_SESSION_NAME", "userbot_session")
    phone_number = os.getenv("TELETHON_PHONE_NUMBER")
    password = os.getenv("TELETHON_PASSWORD")
    try:
        invite_interval_raw = os.getenv("TELETHON_INVITE_INTERVAL_SECONDS")
        invite_interval = float(invite_interval_raw) if invite_interval_raw else 1.0
        if invite_interval < 0:
            raise ValueError
    except ValueError as exc:
        raise RuntimeError("TELETHON_INVITE_INTERVAL_SECONDS must be a non-negative number") from exc

    return TelethonSettings(
        api_id=api_id,
        api_hash=api_hash,
        session_name=session_name,
        phone_number=phone_number or None,
        password=password or None,
        invite_interval_seconds=invite_interval,
    )
