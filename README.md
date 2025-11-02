# Telegram Bulk Add Suite

This workspace contains a hybrid Telegram automation project:

- **Bot API service** (`src/bot_app.py`) uses a lightweight HTTP long-polling loop to listen for commands (e.g., `/add`, `/verify`) in private chats, groups, supergroups, and channels.
- **Telethon userbot** (`src/userbot/service.py`) signs in with a real user account to add members directly by phone number, username, or numeric ID—no invite links required.
- **Utilities** in `src/utils` normalize identifiers and manage configuration.

## Requirements

- Python 3.11+
- Telegram Bot token (`BOT_TOKEN`)
- Telegram API ID and API Hash (`TELETHON_API_ID`, `TELETHON_API_HASH`) for the user account that performs the adds
- Optional: MTProto login helpers: `TELETHON_PHONE_NUMBER` (+country code), `TELETHON_PASSWORD` (if your account has 2FA)
- Optional: rate limiting knob: `TELETHON_INVITE_INTERVAL_SECONDS` — minimum delay between invite requests (default `1.0` second)
- Optional: `BOT_ALLOWED_CHATS` — comma-separated chat IDs allowed to execute `/add`

## Quick start (PowerShell)

```powershell
# Optional: create a virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install dependencies
python -m pip install -r requirements.txt

# Option 1: store credentials in a .env file located in the project root
# BOT_TOKEN=123456789:AAExampleTokenHere
# TELETHON_API_ID=123456
# TELETHON_API_HASH=your_api_hash_value
# TELETHON_PHONE_NUMBER=+15551234567
# TELETHON_PASSWORD=optional_2fa_password
# TELETHON_INVITE_INTERVAL_SECONDS=1.0
# BOT_ALLOWED_CHATS=1234567890,0987654321

# Option 2: export credentials for the current shell session
$Env:BOT_TOKEN = 'your-bot-token'
$Env:TELETHON_API_ID = '123456'
$Env:TELETHON_API_HASH = 'your_api_hash'

# Run the bot service (handles commands and delegates to Telethon worker)
python -m src.bot_app
```

The bot replies with a summary after processing, listing users added and any failures. Use `/verify` to run the same identifier parsing plus Telethon resolution pipeline without sending invites; the bot reports which usernames, phone numbers, or IDs could be resolved alongside reasons for any that failed.

## Standalone Telethon usage

```powershell
python -m src.userbot https://t.me/yourGroupUsername +1234567890 @another_user 123456789
# include --phone or set TELETHON_PHONE_NUMBER to skip the phone prompt
```
```powershell
python -m src.userbot --phone +15551234567 https://t.me/yourGroupUsername +1234567890
```

The first run will prompt for the Telegram login code (and 2FA password if enabled). If `TELETHON_PHONE_NUMBER`/`TELETHON_PASSWORD` are provided, only the one-time code is requested. The resulting session file is reused by both the CLI and the bot service.

## Rate limiting

Telegram enforces strict flood-control limits. The worker now throttles bulk adds according to `TELETHON_INVITE_INTERVAL_SECONDS`, ensuring requests are spread out to reduce “Too many requests” errors. Increase the delay if you see repeated flood-wait warnings.

## Testing

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest
```

## Security and compliance

- Never commit tokens, API IDs, API hashes, or Telethon session files.
- Respect Telegram rate limits. Channels and supergroups still enforce privacy rules—users who disabled invites or never interacted with your account cannot be added automatically.
- Consider rotating credentials regularly and limiting `/add` to known chat IDs via `BOT_ALLOWED_CHATS`.
