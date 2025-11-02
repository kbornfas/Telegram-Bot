"""CLI entrypoint for running one-off Telethon imports."""

from __future__ import annotations

import argparse
import asyncio
import logging
import os

from .service import AddUserPayload, AddUserRequest, AddUserService
from ..utils.identifiers import parse_identifiers


async def main() -> None:
    parser = argparse.ArgumentParser(description="Add Telegram users by phone or username")
    parser.add_argument("chat", help="Target chat id, username, or invite link")
    parser.add_argument("identifiers", nargs="+", help="Usernames (@name), phone numbers (+123), or numeric IDs")
    parser.add_argument("--phone", dest="phone", help="Telegram phone number used for MTProto authorization")
    parser.add_argument("--password", dest="password", help="2FA password for the Telegram account (if enabled)")
    args = parser.parse_args()

    identifiers = parse_identifiers(args.identifiers)

    if args.phone:
        os.environ["TELETHON_PHONE_NUMBER"] = args.phone
    if args.password:
        os.environ["TELETHON_PASSWORD"] = args.password

    service = AddUserService()
    await service.start()
    result = await service.enqueue(
        AddUserRequest(payload=AddUserPayload(chat_id=args.chat, identifiers=identifiers))
    )
    await service.stop()

    print("Added:", len(result.added))
    if result.added:
        for entry in result.added:
            print("  +", entry)
    print("Failed:", len(result.failed))
    if result.failed:
        for entry in result.failed:
            print("  -", entry)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
