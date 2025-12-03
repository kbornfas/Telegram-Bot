# Telegram Bulk Messenger CLI

A command-line tool to send bulk messages via your personal Telegram account.

## Features

- 🔐 **Secure Authentication**: Uses Telegram's official MTProto protocol
- 👥 **Contact Management**: View and select from your Telegram contacts
- 📝 **Message Drafts**: Save and reuse message templates
- 📤 **Flexible Sending Options**:
  - Send to individual contacts
  - Send in customizable batches
  - Send to all contacts at once
- ⏱️ **Rate Limiting**: Built-in delays to respect Telegram's rate limits
- 📊 **Progress Tracking**: Real-time progress bar and delivery reports

## Prerequisites

- Node.js 18 or higher
- A Telegram account
- Telegram API credentials (API_ID and API_HASH)

## Getting Telegram API Credentials

1. Go to [https://my.telegram.org/apps](https://my.telegram.org/apps)
2. Log in with your phone number
3. Click on "API development tools"
4. Fill in the form to create a new application
5. Copy your `API_ID` and `API_HASH`

## Installation

1. Navigate to the CLI directory:
   ```bash
   cd cli
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your credentials:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and add your API credentials:
   ```
   API_ID=your_api_id_here
   API_HASH=your_api_hash_here
   ```

## Usage

Start the CLI:

```bash
npm start
```

Or run directly:

```bash
node index.js
```

### First Run

On first run, you'll be prompted to:
1. Enter your phone number (with country code, e.g., +1234567890)
2. Enter the verification code sent to your Telegram
3. Enter your 2FA password (if enabled)

Your session will be saved locally for future use.

### Main Menu Options

1. **📝 Compose & Send Message**
   - Select sending mode (individual, batch, or all contacts)
   - Choose contacts (for individual mode)
   - Write a new message or load from drafts
   - Confirm and send

2. **📋 Manage Drafts**
   - View saved drafts
   - Create new drafts
   - Delete drafts

3. **👥 View Contacts**
   - See all your Telegram contacts

4. **⚙️ Settings**
   - Adjust message delay (default: 2 seconds)
   - Adjust batch delay (default: 5 seconds)

## Sending Modes

### Individual Mode
Select specific contacts from your contact list to send messages to.

### Batch Mode
Send to all contacts in batches. You can customize the batch size.
For example, with 100 contacts and batch size of 10, messages will be sent in 10 batches.

### All Mode
Send to all contacts one by one with a delay between each message.

## Rate Limiting

To avoid being rate-limited by Telegram, the tool includes:
- Default 2-second delay between messages
- Default 5-second delay between batches
- These can be adjusted in Settings

## File Structure

```
cli/
├── index.js              # Main entry point
├── package.json          # Dependencies
├── .env.example          # Example environment file
├── .gitignore           # Git ignore rules
├── drafts/              # Saved message drafts
├── session.txt          # Saved Telegram session
└── src/
    ├── telegramClient.js  # Telegram connection manager
    ├── contactsManager.js # Contacts management
    ├── messageSender.js   # Message sending logic
    └── cli.js            # Interactive CLI menus
```

## Security Notes

- Your session is stored locally in `session.txt`
- Never share your session file or `.env` file
- The `.gitignore` excludes sensitive files from version control

## Troubleshooting

### "API_ID_INVALID" Error
- Double-check your API_ID and API_HASH in the `.env` file
- Make sure there are no extra spaces or quotes

### "FLOOD_WAIT" Error
- You're sending too many messages too quickly
- Increase the delay settings and wait before retrying

### Connection Issues
- Check your internet connection
- Telegram may be blocked in your region (try a VPN)

## License

MIT
