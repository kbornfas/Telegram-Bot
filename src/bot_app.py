"""Bot API service entrypoint implemented with raw HTTP polling."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Sequence

import httpx

from .config import load_bot_settings
from .userbot.service import AddUserPayload, AddUserRequest, AddUserResult, AddUserService
from .utils.identifiers import parse_identifiers

logger = logging.getLogger(__name__)


class BotServer:
    """Minimal Telegram Bot API poller that delegates add requests to the Telethon service."""

    def __init__(self, service: AddUserService) -> None:
        self._service = service
        self._settings = load_bot_settings()
        self._api_url = f"https://api.telegram.org/bot{self._settings.bot_token}/"
        self._client: httpx.AsyncClient | None = None
        self._offset = 0
        self._running = False

    async def start(self) -> None:
        """Start the polling loop until cancelled."""
        await self._service.start()
        timeout = httpx.Timeout(connect=10.0, read=35.0, write=10.0, pool=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            self._client = client
            self._running = True
            logger.info("Starting bot polling loop")
            try:
                while self._running:
                    try:
                        updates = await self._get_updates()
                    except asyncio.CancelledError:
                        raise
                    except Exception as exc:  # noqa: BLE001
                        logger.exception("getUpdates failed: %s", exc)
                        await asyncio.sleep(5)
                        continue

                    for update in updates:
                        update_id = update.get("update_id")
                        if isinstance(update_id, int) and update_id >= self._offset:
                            self._offset = update_id + 1
                        await self._handle_update(update)
            finally:
                self._running = False
        await self._service.stop()

    async def stop(self) -> None:
        self._running = False

    async def _get_updates(self) -> Sequence[Dict[str, Any]]:
        assert self._client is not None
        params = {"offset": self._offset, "timeout": 30, "allowed_updates": ["message", "channel_post"]}
        response = await self._client.get(f"{self._api_url}getUpdates", params=params)
        data = response.json()
        if not data.get("ok"):
            raise RuntimeError(f"getUpdates failed: {data}")
        result = data.get("result", [])
        if not isinstance(result, list):
            raise RuntimeError("Unexpected getUpdates payload")
        return result

    async def _handle_update(self, update: Dict[str, Any]) -> None:
        message = update.get("message") or update.get("channel_post")
        if not isinstance(message, dict):
            return

        chat = message.get("chat")
        if not isinstance(chat, dict):
            return

        chat_id = chat.get("id")
        if not isinstance(chat_id, int):
            return

        text = message.get("text") or message.get("caption")
        if not isinstance(text, str) or not text.startswith("/"):
            return

        command, *args = self._split_command(text)

        if command == "/start":
            await self._send_message(chat_id, "Send /add <space separated usernames or phone numbers> to queue an import.")
            return

        if command == "/help":
            await self._send_message(chat_id, "Use /add and provide usernames (with or without @) or phone numbers.")
            return

        if command == "/add":
            await self._handle_add(chat_id, message, args)

    async def _handle_add(self, chat_id: int, message: Dict[str, Any], args: List[str]) -> None:
        if self._settings.allowed_chats and chat_id not in self._settings.allowed_chats:
            await self._send_message(chat_id, "This chat is not authorized to run bulk add commands.")
            return

        if not args:
            await self._send_message(chat_id, "Usage: /add user1 +1555123456 @another")
            return

        identifiers = parse_identifiers(args)
        payload = AddUserPayload(
            chat_id=chat_id,
            identifiers=identifiers,
            requested_by=self._extract_user_id(message.get("from")),
        )
        await self._send_message(chat_id, f"Processing {len(identifiers)} users, please wait...")

        try:
            result = await self._service.enqueue(AddUserRequest(payload=payload))
        except Exception as exc:  # noqa: BLE001
            logger.exception("Bulk add failed")
            await self._send_message(chat_id, f"❌ Failed to add users: {exc}")
            return

        text = self._format_summary(result)
        await self._send_message(chat_id, text)

    async def _send_message(self, chat_id: int, text: str) -> None:
        assert self._client is not None
        payload = {"chat_id": chat_id, "text": text}
        try:
            response = await self._client.post(f"{self._api_url}sendMessage", json=payload)
            data = response.json()
            if not data.get("ok"):
                logger.warning("sendMessage failed for chat %s: %s", chat_id, data)
        except Exception as exc:  # noqa: BLE001
            logger.exception("sendMessage error: %s", exc)

    def _split_command(self, text: str) -> List[str]:
        head, *tail = text.strip().split()
        command = head.split("@", 1)[0]
        return [command, *tail]

    def _extract_user_id(self, data: Any) -> int | None:
        if isinstance(data, dict):
            value = data.get("id")
            if isinstance(value, int):
                return value
        return None

    def _format_summary(self, result: AddUserResult) -> str:
        lines = ["Operation complete."]
        if result.added:
            lines.append(f"✅ Added ({len(result.added)}):")
            lines.extend(f"  • {entry}" for entry in result.added[:10])
            if len(result.added) > 10:
                lines.append(f"  ... and {len(result.added) - 10} more")
        if result.failed:
            lines.append(f"❌ Failed ({len(result.failed)}):")
            lines.extend(f"  • {entry}" for entry in result.failed[:10])
            if len(result.failed) > 10:
                lines.append(f"  ... and {len(result.failed) - 10} more")
        if not result.added and not result.failed:
            lines.append("No users were added. They may have privacy restrictions or invalid data.")
        return "\n".join(lines)


def run_bot(service: AddUserService) -> None:
    logging.basicConfig(level=logging.INFO)
    server = BotServer(service)
    try:
        asyncio.run(server.start())
    except KeyboardInterrupt:
        logger.info("Stopping bot (keyboard interrupt)")


if __name__ == "__main__":
    run_bot(AddUserService())
