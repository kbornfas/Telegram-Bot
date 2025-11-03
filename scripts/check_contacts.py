from __future__ import annotations

import asyncio

from telethon import TelegramClient

API_ID = 22992268
API_HASH = "2badd21c4d36c05a66ced22a92aae860"
SESSION = "userbot_session"
PHONES = [
    "+4917661003137",
    "+491711111005",
]


async def main() -> None:
    async with TelegramClient(SESSION, API_ID, API_HASH) as client:
        for phone in PHONES:
            try:
                user = await client.get_entity(phone)
            except Exception as exc:  # noqa: BLE001
                print(f"{phone} unresolved: {exc}")
            else:
                username = getattr(user, "username", None)
                resolved_phone = getattr(user, "phone", None)
                print(
                    f"{phone} -> id={getattr(user, 'id', None)} username={username} phone={resolved_phone}"
                )


if __name__ == "__main__":
    asyncio.run(main())
