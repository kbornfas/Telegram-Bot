"""Telethon-backed service to add users via phone numbers or usernames."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Dict, List, Sequence, Tuple

from telethon import TelegramClient
from telethon.errors import RPCError
from telethon.errors.rpcerrorlist import (
    FloodWaitError,
    UserAlreadyParticipantError,
    UserNotMutualContactError,
    UserNotParticipantError,
    UserPrivacyRestrictedError,
)
from telethon.tl import functions
from telethon.tl.functions.channels import InviteToChannelRequest, GetParticipantRequest
from telethon.tl.functions.messages import AddChatUserRequest
from telethon.tl.types import InputPhoneContact

from ..config import TelethonSettings, load_telethon_settings
from ..utils.identifiers import Identifier

logger = logging.getLogger(__name__)

MAX_FLOOD_WAIT_RETRIES = 2


@dataclass(slots=True)
class AddUserPayload:
    chat_id: int | str
    identifiers: Sequence[Identifier]
    requested_by: int | None = None


@dataclass(slots=True)
class AddUserRequest:
    payload: AddUserPayload


@dataclass(slots=True)
class AddUserResult:
    added: List[str] = field(default_factory=list)
    failed: List[str] = field(default_factory=list)


class AddUserService:
    def __init__(self) -> None:
        self._settings: TelethonSettings | None = None
        self._queue: asyncio.Queue[Tuple[AddUserRequest, asyncio.Future[AddUserResult]]] = asyncio.Queue()
        self._worker_task: asyncio.Task[None] | None = None
        self._worker_started = asyncio.Event()
        self._running = False
    self._invite_interval = 1.0
    self._last_invite_at = 0.0

    async def start(self) -> None:
        self._ensure_settings()
        if self._running:
            await self._worker_started.wait()
            return
        self._running = True
        if not self._worker_task or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker(), name="userbot-worker")
        await self._worker_started.wait()

    async def stop(self) -> None:
        self._running = False
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        self._worker_task = None
        self._worker_started.clear()

    async def enqueue(self, request: AddUserRequest) -> AddUserResult:
        loop = asyncio.get_running_loop()
        future: asyncio.Future[AddUserResult] = loop.create_future()
        await self._queue.put((request, future))
        if not self._worker_task or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker(), name="userbot-worker")
        return await future

    async def join(self) -> None:
        await self._queue.join()

    async def _worker(self) -> None:
        self._worker_started.set()
        try:
            while True:
                try:
                    request, future = await self._queue.get()
                except asyncio.CancelledError:
                    raise

                try:
                    result = await self._process(request)
                except Exception as exc:  # noqa: BLE001
                    logger.exception("Failed to process add request: %s", exc)
                    if not future.done():
                        future.set_exception(exc)
                else:
                    if not future.done():
                        future.set_result(result)
                finally:
                    self._queue.task_done()
        except asyncio.CancelledError:
            logger.info("Userbot worker cancelled")
            raise
        finally:
            self._worker_started.clear()

    async def _process(self, request: AddUserRequest) -> AddUserResult:
        self._ensure_settings()
        assert self._settings is not None  # for type checkers
        payload = request.payload
        async with TelegramClient(
            self._settings.session_name,
            self._settings.api_id,
            self._settings.api_hash,
        ) as client:
            if not await client.is_user_authorized():
                await self._ensure_authorized(client)
            me = await client.get_me()
            if getattr(me, "bot", False):
                raise RuntimeError(
                    "The Telethon session is logged in as a bot. Delete userbot_session.session and authorize with a user phone number."
                )
            self._invite_interval = max(self._settings.invite_interval_seconds, 0.0)
            return await self._process_with_client(client, payload)

    async def _process_with_client(self, client: TelegramClient, payload: AddUserPayload) -> AddUserResult:
        phone_identifiers = [identifier for identifier in payload.identifiers if identifier.kind == "phone"]
        username_identifiers = [identifier for identifier in payload.identifiers if identifier.kind == "username"]
        user_id_identifiers = [identifier for identifier in payload.identifiers if identifier.kind == "user_id"]

        resolved_users = {}

        if phone_identifiers:
            phones = [identifier.value for identifier in phone_identifiers]
            resolved_users.update(await self._import_contacts(client, phones))

        # Resolve usernames and numeric IDs
        for identifier in username_identifiers:
            username = identifier.value.lstrip("@")
            try:
                user = await client.get_entity(username)
                resolved_users[identifier.value] = user
                resolved_users[username] = user
            except (ValueError, RPCError) as exc:
                logger.warning("Cannot resolve username %s: %s", identifier.value, exc)

        for identifier in user_id_identifiers:
            try:
                user = await client.get_entity(int(identifier.value))
                resolved_users[identifier.value] = user
            except (ValueError, RPCError) as exc:
                logger.warning("Cannot resolve user id %s: %s", identifier.value, exc)

        return await self._invite_all(client, payload.chat_id, payload.identifiers, resolved_users)

    async def _import_contacts(self, client: TelegramClient, phones: Sequence[str]) -> Dict[str, object]:
        contacts = [
            InputPhoneContact(client_id=10_000 + idx, phone=phone, first_name="", last_name="")
            for idx, phone in enumerate(phones)
        ]
        try:
            result = await client(functions.contacts.ImportContactsRequest(contacts=contacts))
        except RPCError as exc:
            logger.error("Import contacts failed: %s", exc)
            return {}

        mapping: Dict[str, object] = {}
        users_by_id: Dict[int, object] = {user.id: user for user in result.users}
        for imported in result.imported:
            index = imported.client_id - 10_000
            if index < 0 or index >= len(contacts):
                continue
            user = users_by_id.get(imported.user_id)
            if not user:
                continue
            phone = contacts[index].phone
            mapping[phone if phone.startswith("+") else f"+{phone}"] = user
            mapping[phone.lstrip("+")] = user
        return mapping

    async def _invite_all(
        self,
        client: TelegramClient,
        chat_id: int | str,
        identifiers: Sequence[Identifier],
        resolved_users: Dict[str, object],
    ) -> AddUserResult:
        result = AddUserResult()
        entity = await client.get_entity(chat_id)

        for identifier in identifiers:
            attempts = 0
            while True:
                try:
                    user = await self._resolve_user(client, identifier, resolved_users)
                    if user is None:
                        logger.warning("Skipping %s: could not resolve to a Telegram user", identifier.value)
                        result.failed.append(f"{identifier.value}: could not resolve user")
                        break

                    if getattr(entity, "megagroup", False) or getattr(entity, "broadcast", False):
                        await self._throttle_invite()
                        await client(InviteToChannelRequest(channel=entity, users=[user]))
                    else:
                        await self._throttle_invite()
                        await client(AddChatUserRequest(chat_id=entity.id, user_id=user.id, fwd_limit=0))

                    try:
                        present = await self._verify_membership(client, entity, user)
                    except Exception as exc:  # noqa: BLE001
                        logger.debug("Could not verify membership for %s due to: %s", identifier.value, exc)
                        present = True

                    if present:
                        logger.info("Added %s", identifier.value)
                        result.added.append(identifier.value)
                    else:
                        logger.warning("Invite reported success but user missing afterwards: %s", identifier.value)
                        result.failed.append(f"{identifier.value}: invited but not present after invite")
                    break
                except FloodWaitError as exc:
                    attempts += 1
                    wait_time = getattr(exc, "seconds", 0) or 1
                    logger.warning(
                        "Rate limited when adding %s: waiting %s seconds before retry (%s/%s)",
                        identifier.value,
                        wait_time,
                        attempts,
                        MAX_FLOOD_WAIT_RETRIES,
                    )
                    await asyncio.sleep(wait_time + 1)
                    if attempts >= MAX_FLOOD_WAIT_RETRIES:
                        result.failed.append(f"{identifier.value}: rate limited after multiple retries")
                        break
                except UserAlreadyParticipantError:
                    logger.info("%s already a participant", identifier.value)
                    result.added.append(identifier.value)
                    break
                except (UserPrivacyRestrictedError, UserNotMutualContactError) as exc:
                    logger.warning("Privacy restriction for %s: %s", identifier.value, exc)
                    result.failed.append(f"{identifier.value}: {exc}")
                    break
                except RPCError as exc:
                    logger.warning("Failed to add %s: %s", identifier.value, exc)
                    result.failed.append(f"{identifier.value}: {exc}")
                    break
                except Exception as exc:  # noqa: BLE001
                    logger.exception("Unexpected error adding %s: %s", identifier.value, exc)
                    result.failed.append(f"{identifier.value}: {exc}")
                    break

        return result

    async def _verify_membership(self, client: TelegramClient, entity: object, user: object) -> bool:
        """Check whether the invited user is now a member of the target chat."""
        try:
            if getattr(entity, "megagroup", False) or getattr(entity, "broadcast", False) or getattr(entity, "gigagroup", False):
                await client(GetParticipantRequest(channel=entity, participant=user))
                return True
        except UserNotParticipantError:
            return False
        except RPCError as exc:
            logger.debug("Channel participant check failed for %s: %s", getattr(user, "id", "?"), exc)

        try:
            participants = await client.get_participants(entity, limit=0)
        except RPCError as exc:
            logger.debug("get_participants failed while verifying %s: %s", getattr(user, "id", "?"), exc)
            return True

        user_id = getattr(user, "id", None)
        return any(getattr(participant, "id", None) == user_id for participant in participants)

    async def _throttle_invite(self) -> None:
        if self._invite_interval <= 0:
            self._last_invite_at = time.monotonic()
            return
        now = time.monotonic()
        wait = self._last_invite_at + self._invite_interval - now
        if wait > 0:
            await asyncio.sleep(wait)
            now = time.monotonic()
        self._last_invite_at = now

    async def _resolve_user(
        self,
        client: TelegramClient,
        identifier: Identifier,
        resolved_users: Dict[str, object],
    ) -> object | None:
        if identifier.kind == "phone":
            return (
                resolved_users.get(identifier.value)
                or resolved_users.get(identifier.value.lstrip("+"))
                or await self._try_get_entity(client, identifier.value)
            )
        if identifier.kind == "username":
            key = identifier.value
            if key in resolved_users:
                return resolved_users[key]
            try:
                username = identifier.value.lstrip("@")
                user = await client.get_entity(username)
                resolved_users[key] = user
                resolved_users[username] = user
                return user
            except (ValueError, RPCError) as exc:
                logger.warning("Cannot resolve username %s: %s", identifier.value, exc)
                return None
        if identifier.kind == "user_id":
            key = identifier.value
            if key in resolved_users:
                return resolved_users[key]
            try:
                user = await client.get_entity(int(identifier.value))
                resolved_users[key] = user
                return user
            except (ValueError, RPCError) as exc:
                logger.warning("Cannot resolve user id %s: %s", identifier.value, exc)
                return None
        return None

    async def _ensure_authorized(self, client: TelegramClient) -> None:
        assert self._settings is not None
        phone = self._settings.phone_number
        if not phone:
            raise RuntimeError(
                "Telethon session is not authorized. Set TELETHON_PHONE_NUMBER or use --phone when running the helper once."
            )

        logger.info("Authorizing Telethon session for %s", phone)
        await client.start(
            phone=phone,
            password=self._settings.password,
            code_callback=self._prompt_code,
        )
        if not await client.is_user_authorized():
            raise RuntimeError("Failed to authorize Telethon session. Check the code and try again.")

    @staticmethod
    def _prompt_code() -> str:
        return input("Enter the Telegram login code: ")

    async def _try_get_entity(self, client: TelegramClient, identifier: str) -> object | None:
        candidates = [identifier]
        if identifier.startswith("+"):
            candidates.append(identifier.lstrip("+"))
        else:
            candidates.append(f"+{identifier}")

        for candidate in candidates:
            try:
                return await client.get_entity(candidate)
            except (ValueError, RPCError):
                continue

        if identifier.lstrip("+").isdigit():
            try:
                return await client.get_entity(int(identifier.lstrip("+")))
            except (ValueError, RPCError):
                return None

        return None

    def _ensure_settings(self) -> None:
        if self._settings is None:
            self._settings = load_telethon_settings()
