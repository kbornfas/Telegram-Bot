================================================================================
                        CONTACTS DATA FOLDER
================================================================================

Place your contact files here. The CLI will read them automatically.

SUPPORTED FORMATS:
------------------

1. TXT FILES (one contact per line):
   - Phone numbers: +254712345678
   - Usernames: @username
   
   Example (contacts.txt):
   +254712345678
   +254798765432
   @johndoe
   @janedoe

2. CSV FILES (comma-separated):
   - Must have headers: phone,username,name (at least one required)
   
   Example (contacts.csv):
   phone,username,name
   +254712345678,@johndoe,John Doe
   +254798765432,,Jane Smith
   ,@bobsmith,Bob Smith

3. JSON FILES:
   - Array of contact objects
   
   Example (contacts.json):
   [
     {"phone": "+254712345678", "username": "johndoe", "name": "John Doe"},
     {"phone": "+254798765432", "name": "Jane Smith"},
     {"username": "bobsmith", "name": "Bob Smith"}
   ]

NOTES:
------
- Phone numbers should include country code (e.g., +254, +1, +44)
- Usernames can be with or without @ symbol
- The CLI will automatically detect the format
- You can have multiple files - they will all be loaded

================================================================================
