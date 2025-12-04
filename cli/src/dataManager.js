import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import chalk from 'chalk';
import { Api } from 'telegram/tl/index.js';
import cliProgress from 'cli-progress';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

class DataManager {
  constructor(client = null) {
    this.client = client;
    this.ensureDataDir();
  }

  setClient(client) {
    this.client = client;
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  getDataDir() {
    return DATA_DIR;
  }

  listContactFiles() {
    if (!fs.existsSync(DATA_DIR)) {
      return [];
    }

    return fs.readdirSync(DATA_DIR)
      .filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ['.txt', '.csv', '.json'].includes(ext) && f !== 'README.txt';
      })
      .map(f => ({
        name: f,
        path: path.join(DATA_DIR, f),
        format: path.extname(f).toLowerCase().replace('.', ''),
        size: fs.statSync(path.join(DATA_DIR, f)).size,
        modified: fs.statSync(path.join(DATA_DIR, f)).mtime
      }))
      .sort((a, b) => b.modified - a.modified);
  }

  readContactFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf-8');

    switch (ext) {
      case '.txt':
        return this.parseTxtFile(content);
      case '.csv':
        return this.parseCsvFile(content);
      case '.json':
        return this.parseJsonFile(content);
      default:
        throw new Error(`Unsupported file format: ${ext}`);
    }
  }

  parseTxtFile(content) {
    const contacts = [];
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

    for (const line of lines) {
      if (line.startsWith('+') || /^\d+$/.test(line)) {
        // Phone number
        contacts.push({
          phone: line.startsWith('+') ? line : `+${line}`,
          username: '',
          name: ''
        });
      } else if (line.startsWith('@') || /^[a-zA-Z][a-zA-Z0-9_]{4,}$/.test(line)) {
        // Username
        contacts.push({
          phone: '',
          username: line.startsWith('@') ? line.substring(1) : line,
          name: ''
        });
      }
    }

    return contacts;
  }

  parseCsvFile(content) {
    const contacts = [];
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    
    if (lines.length < 2) return contacts;

    // Parse header
    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    const phoneIdx = headers.findIndex(h => h === 'phone' || h === 'phonenumber' || h === 'phone_number');
    const usernameIdx = headers.findIndex(h => h === 'username' || h === 'user' || h === 'handle');
    const nameIdx = headers.findIndex(h => h === 'name' || h === 'fullname' || h === 'full_name');

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      
      const contact = {
        phone: phoneIdx >= 0 ? (values[phoneIdx] || '').trim() : '',
        username: usernameIdx >= 0 ? (values[usernameIdx] || '').trim().replace('@', '') : '',
        name: nameIdx >= 0 ? (values[nameIdx] || '').trim() : ''
      };

      if (contact.phone || contact.username) {
        contacts.push(contact);
      }
    }

    return contacts;
  }

  parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);

    return values;
  }

  parseJsonFile(content) {
    const data = JSON.parse(content);
    const contacts = [];

    const items = Array.isArray(data) ? data : [data];

    for (const item of items) {
      const contact = {
        phone: (item.phone || item.phoneNumber || item.phone_number || '').toString().trim(),
        username: (item.username || item.user || item.handle || '').toString().trim().replace('@', ''),
        name: (item.name || item.fullName || item.full_name || '').toString().trim()
      };

      if (contact.phone || contact.username) {
        contacts.push(contact);
      }
    }

    return contacts;
  }

  saveContactsToFile(contacts, filename, format = 'json') {
    const filePath = path.join(DATA_DIR, filename);

    switch (format) {
      case 'txt':
        const txtContent = contacts.map(c => c.phone || `@${c.username}`).join('\n');
        fs.writeFileSync(filePath, txtContent);
        break;
      
      case 'csv':
        const csvLines = ['phone,username,name'];
        contacts.forEach(c => {
          csvLines.push(`${c.phone || ''},${c.username || ''},${c.name || ''}`);
        });
        fs.writeFileSync(filePath, csvLines.join('\n'));
        break;
      
      case 'json':
      default:
        fs.writeFileSync(filePath, JSON.stringify(contacts, null, 2));
        break;
    }

    return filePath;
  }

  exportTelegramContacts(telegramContacts, filename) {
    const exportData = telegramContacts.map(c => ({
      id: c.id,
      phone: c.phone || '',
      username: c.username || '',
      name: c.displayName || `${c.firstName} ${c.lastName}`.trim()
    }));

    const filePath = this.saveContactsToFile(exportData, filename, 'json');
    return { path: filePath, count: exportData.length };
  }

  getFileChoices() {
    const files = this.listContactFiles();
    return files.map(f => ({
      name: `${f.name} (${this.formatFileSize(f.size)}) - ${f.modified.toLocaleDateString()}`,
      value: f.path,
      short: f.name
    }));
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ==================== SCAN HOST MACHINE FOR TXT FILES ====================

  getSearchLocations() {
    const homeDir = os.homedir();
    const locations = [
      path.join(homeDir, 'Desktop'),
      path.join(homeDir, 'Documents'),
      path.join(homeDir, 'Downloads'),
      path.join(homeDir, 'OneDrive', 'Desktop'),
      path.join(homeDir, 'OneDrive', 'Documents'),
      path.join(homeDir, 'OneDrive', 'Downloads'),
      // Common paths
      'C:\\Users\\Public\\Documents',
      'D:\\',
      'E:\\'
    ];
    
    // Filter to only existing directories
    return locations.filter(loc => {
      try {
        return fs.existsSync(loc) && fs.statSync(loc).isDirectory();
      } catch {
        return false;
      }
    });
  }

  scanDirectoryForTxtFiles(dirPath, maxDepth = 2, currentDepth = 0) {
    const txtFiles = [];
    
    if (currentDepth > maxDepth) return txtFiles;
    
    try {
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        // Skip hidden folders and system folders
        if (item.startsWith('.') || item.startsWith('$') || 
            ['node_modules', 'AppData', 'Application Data', 'Program Files', 
             'Windows', 'ProgramData', '.git', 'cache', 'Cache'].includes(item)) {
          continue;
        }
        
        const fullPath = path.join(dirPath, item);
        
        try {
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory() && currentDepth < maxDepth) {
            // Recursively scan subdirectories
            txtFiles.push(...this.scanDirectoryForTxtFiles(fullPath, maxDepth, currentDepth + 1));
          } else if (stat.isFile() && path.extname(item).toLowerCase() === '.txt') {
            // Check if file might contain contacts (phone numbers or usernames)
            const isEligible = this.isEligibleContactFile(fullPath);
            if (isEligible.eligible) {
              txtFiles.push({
                name: item,
                path: fullPath,
                size: stat.size,
                modified: stat.mtime,
                location: dirPath,
                contactCount: isEligible.count,
                hasPhones: isEligible.hasPhones,
                hasUsernames: isEligible.hasUsernames
              });
            }
          }
        } catch (e) {
          // Skip files/folders we can't access
        }
      }
    } catch (e) {
      // Skip directories we can't read
    }
    
    return txtFiles;
  }

  isEligibleContactFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      
      let phoneCount = 0;
      let usernameCount = 0;
      
      for (const line of lines) {
        // Check for phone numbers
        if (line.startsWith('+') || /^\d{7,15}$/.test(line)) {
          phoneCount++;
        }
        // Check for usernames
        else if (line.startsWith('@') || /^[a-zA-Z][a-zA-Z0-9_]{4,}$/.test(line)) {
          usernameCount++;
        }
      }
      
      const totalContacts = phoneCount + usernameCount;
      // File is eligible if it has at least 1 contact-like entry
      return {
        eligible: totalContacts >= 1,
        count: totalContacts,
        hasPhones: phoneCount > 0,
        hasUsernames: usernameCount > 0
      };
    } catch (e) {
      return { eligible: false, count: 0, hasPhones: false, hasUsernames: false };
    }
  }

  async scanHostForTxtFiles(progressCallback = null) {
    const locations = this.getSearchLocations();
    const allFiles = [];
    
    console.log(chalk.cyan('\n🔍 Scanning for contact files...\n'));
    
    for (let i = 0; i < locations.length; i++) {
      const location = locations[i];
      if (progressCallback) {
        progressCallback(location, i + 1, locations.length);
      }
      console.log(chalk.gray(`   Scanning: ${location}`));
      
      const files = this.scanDirectoryForTxtFiles(location);
      allFiles.push(...files);
    }
    
    // Remove duplicates by path
    const uniqueFiles = [];
    const seenPaths = new Set();
    
    for (const file of allFiles) {
      if (!seenPaths.has(file.path)) {
        seenPaths.add(file.path);
        uniqueFiles.push(file);
      }
    }
    
    // Sort by contact count (most contacts first)
    uniqueFiles.sort((a, b) => b.contactCount - a.contactCount);
    
    return uniqueFiles;
  }

  copyFileToDataFolder(sourcePath) {
    const fileName = path.basename(sourcePath);
    let destFileName = fileName;
    let destPath = path.join(DATA_DIR, destFileName);
    
    // Handle duplicate filenames
    let counter = 1;
    while (fs.existsSync(destPath)) {
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      destFileName = `${base}_${counter}${ext}`;
      destPath = path.join(DATA_DIR, destFileName);
      counter++;
    }
    
    fs.copyFileSync(sourcePath, destPath);
    
    return {
      sourcePath,
      destPath,
      fileName: destFileName
    };
  }

  importFilesToDataFolder(filePaths) {
    const results = {
      imported: [],
      failed: []
    };
    
    for (const filePath of filePaths) {
      try {
        const result = this.copyFileToDataFolder(filePath);
        results.imported.push(result);
      } catch (error) {
        results.failed.push({ path: filePath, error: error.message });
      }
    }
    
    return results;
  }

  // ==================== IMPORT CONTACTS TO TELEGRAM ====================

  readAllContactFiles() {
    const files = this.listContactFiles();
    const allContacts = [];

    for (const file of files) {
      try {
        const contacts = this.readContactFile(file.path);
        allContacts.push(...contacts);
        console.log(chalk.gray(`   ✓ ${file.name}: ${contacts.length} contacts`));
      } catch (error) {
        console.log(chalk.red(`   ✗ ${file.name}: ${error.message}`));
      }
    }

    return allContacts;
  }

  async importContactsToTelegram(contacts, replaceExisting = false) {
    if (!this.client) {
      throw new Error('Telegram client not set');
    }

    const results = {
      total: contacts.length,
      sent: 0,           // Total sent to Telegram API
      newContacts: 0,    // New contacts added
      existing: 0,       // Already existed or updated
      deleted: 0,        // Deleted before re-importing
      skipped: 0,        // Skipped (no phone)
      failed: 0,         // Failed to process
      normalized: 0,     // Phone numbers that had + added
      errors: [],
      sampleContacts: [] // Sample of processed contacts
    };

    // Filter contacts that have phone numbers (required for importing)
    // Also normalize phone numbers to ensure they start with +
    const phoneContacts = contacts
      .filter(c => c.phone && c.phone.trim())
      .map(c => {
        let phone = c.phone.trim();
        let wasNormalized = false;
        // Ensure phone starts with +
        if (!phone.startsWith('+')) {
          phone = '+' + phone;
          wasNormalized = true;
        }
        if (wasNormalized) results.normalized++;
        return { ...c, phone, wasNormalized };
      });
    
    results.skipped = contacts.length - phoneContacts.length;
    results.sent = phoneContacts.length;
    
    // Store sample contacts for result display
    results.sampleContacts = phoneContacts.slice(0, 5).map(c => c.phone);
    
    if (phoneContacts.length === 0) {
      return { ...results, message: 'No contacts with phone numbers to import' };
    }

    // If replaceExisting is true, delete existing contacts first
    if (replaceExisting) {
      console.log(chalk.yellow(`\n🗑️  Removing existing contacts first...`));
      const deleteResult = await this.deleteContactsByPhone(phoneContacts.map(c => c.phone));
      results.deleted = deleteResult.deleted;
      console.log(chalk.gray(`   Deleted ${results.deleted} existing contacts\n`));
      
      // Small delay after deletion
      await this.sleep(2000);
    }

    console.log(chalk.cyan(`📥 Importing ${phoneContacts.length} contacts to Telegram...`));
    if (results.normalized > 0) {
      console.log(chalk.gray(`   (${results.normalized} phone numbers normalized with + prefix)\n`));
    } else {
      console.log('');
    }

    const progressBar = new cliProgress.SingleBar({
      format: 'Importing |' + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    // Import in batches of 100 (Telegram limit)
    const batchSize = 100;
    const batches = [];
    
    for (let i = 0; i < phoneContacts.length; i += batchSize) {
      batches.push(phoneContacts.slice(i, i + batchSize));
    }

    progressBar.start(phoneContacts.length, 0);
    let processed = 0;
    let contactNumber = 1; // Sequential contact numbering

    for (const batch of batches) {
      try {
        const inputContacts = batch.map((contact, idx) => {
          // Use sequential numbering: "Contact 1", "Contact 2", etc.
          const currentNumber = contactNumber + idx;
          
          return new Api.InputPhoneContact({
            clientId: BigInt(processed + idx),
            phone: contact.phone,
            firstName: 'Contact',
            lastName: String(currentNumber)
          });
        });

        const result = await this.client.invoke(
          new Api.contacts.ImportContacts({
            contacts: inputContacts
          })
        );

        // New contacts that were added
        results.newContacts += result.imported?.length || 0;
        
        // Users that were found/updated (already existed or updated)
        const usersReturned = result.users?.length || 0;
        const newlyImported = result.imported?.length || 0;
        results.existing += Math.max(0, usersReturned - newlyImported);
        
        // Track contacts without Telegram accounts
        // These are still SAVED in contacts but as "invite to Telegram"
        if (result.retryContacts && result.retryContacts.length > 0) {
          results.noTelegram = (results.noTelegram || 0) + result.retryContacts.length;
        }

        // Update contact number for next batch
        contactNumber += batch.length;

      } catch (error) {
        results.failed += batch.length;
        results.errors.push(error.message);
        contactNumber += batch.length; // Still increment on error
      }

      processed += batch.length;
      progressBar.update(processed);

      // Small delay between batches to avoid rate limiting
      if (batches.indexOf(batch) < batches.length - 1) {
        await this.sleep(1000);
      }
    }

    progressBar.stop();
    return results;
  }

  async deleteImportedContacts(contactIds) {
    if (!this.client) {
      throw new Error('Telegram client not set');
    }

    try {
      const users = [];
      for (const id of contactIds) {
        try {
          const user = await this.client.getEntity(id);
          users.push(new Api.InputUser({
            userId: user.id,
            accessHash: user.accessHash
          }));
        } catch (e) {
          // Skip invalid users
        }
      }

      if (users.length > 0) {
        await this.client.invoke(
          new Api.contacts.DeleteContacts({
            id: users
          })
        );
      }

      return { deleted: users.length };
    } catch (error) {
      throw error;
    }
  }

  async deleteContactsByPhone(phoneNumbers) {
    if (!this.client) {
      throw new Error('Telegram client not set');
    }

    const results = {
      deleted: 0,
      notFound: 0,
      errors: []
    };

    // Normalize all phone numbers for comparison
    const normalizedPhones = new Set(
      phoneNumbers.map(p => {
        let phone = p.replace(/[\s\-\(\)]/g, '');
        if (!phone.startsWith('+')) phone = '+' + phone;
        return phone;
      })
    );

    // Get all existing contacts at once (much faster than getEntity for each)
    console.log(chalk.gray('   Fetching existing contacts...'));
    const existingContacts = await this.client.invoke(
      new Api.contacts.GetContacts({ hash: BigInt(0) })
    );

    const usersToDelete = [];

    // Find matching contacts by phone
    if (existingContacts.users) {
      for (const user of existingContacts.users) {
        if (user.phone) {
          let userPhone = user.phone;
          if (!userPhone.startsWith('+')) userPhone = '+' + userPhone;
          
          if (normalizedPhones.has(userPhone)) {
            usersToDelete.push(new Api.InputUser({
              userId: user.id,
              accessHash: user.accessHash || BigInt(0)
            }));
          }
        }
      }
    }

    results.notFound = phoneNumbers.length - usersToDelete.length;
    console.log(chalk.gray(`   Found ${usersToDelete.length} existing contacts to delete...`));

    // Delete in batches
    if (usersToDelete.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < usersToDelete.length; i += batchSize) {
        const batch = usersToDelete.slice(i, i + batchSize);
        try {
          await this.client.invoke(
            new Api.contacts.DeleteContacts({
              id: batch
            })
          );
          results.deleted += batch.length;
          console.log(chalk.gray(`   Deleted batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(usersToDelete.length/batchSize)}...`));
        } catch (error) {
          results.errors.push(error.message);
        }
        
        // Small delay between batches
        if (i + batchSize < usersToDelete.length) {
          await this.sleep(500);
        }
      }
    }

    return results;
  }

  /**
   * Delete ALL contacts from the Telegram account
   * @returns {Object} - Results with deleted count and errors
   */
  async deleteAllContacts() {
    if (!this.client) {
      throw new Error('Telegram client not set');
    }

    const results = {
      total: 0,
      deleted: 0,
      errors: []
    };

    console.log(chalk.cyan('\n📋 Fetching all contacts from Telegram...\n'));

    // Get all existing contacts
    const existingContacts = await this.client.invoke(
      new Api.contacts.GetContacts({ hash: BigInt(0) })
    );

    if (!existingContacts.users || existingContacts.users.length === 0) {
      console.log(chalk.yellow('No contacts found in your Telegram account.'));
      return results;
    }

    results.total = existingContacts.users.length;
    console.log(chalk.white(`Found ${results.total} contacts to delete.\n`));

    const progressBar = new cliProgress.SingleBar({
      format: 'Deleting |' + chalk.red('{bar}') + '| {percentage}% | {value}/{total}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(results.total, 0);

    // Prepare all users for deletion
    const usersToDelete = existingContacts.users.map(user => 
      new Api.InputUser({
        userId: user.id,
        accessHash: user.accessHash || BigInt(0)
      })
    );

    // Delete in batches of 100
    const batchSize = 100;
    for (let i = 0; i < usersToDelete.length; i += batchSize) {
      const batch = usersToDelete.slice(i, i + batchSize);
      
      try {
        await this.client.invoke(
          new Api.contacts.DeleteContacts({
            id: batch
          })
        );
        results.deleted += batch.length;
      } catch (error) {
        results.errors.push(`Batch ${Math.floor(i/batchSize) + 1}: ${error.message}`);
      }

      progressBar.update(Math.min(i + batchSize, usersToDelete.length));

      // Small delay between batches
      if (i + batchSize < usersToDelete.length) {
        await this.sleep(500);
      }
    }

    progressBar.stop();
    return results;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check which contacts from a list have Telegram accounts
   * Uses Api.contacts.ImportContacts to accurately check registration status
   * @param {Array} contacts - Array of contacts with phone numbers
   * @returns {Object} - Results with hasTelegram, noTelegram, and invalid arrays
   */
  async checkTelegramAccounts(contacts) {
    if (!this.client) {
      throw new Error('Telegram client not set');
    }

    const results = {
      hasTelegram: [],    // Contacts with Telegram accounts
      noTelegram: [],     // Contacts without Telegram accounts  
      invalid: [],        // Invalid phone numbers
      total: contacts.length,
      checked: 0
    };

    // Filter contacts with valid phone numbers and normalize
    const phoneContacts = contacts
      .map((c, idx) => {
        let phone = c.phone?.trim() || '';
        if (!phone) {
          results.invalid.push({ ...c, reason: 'No phone number' });
          return null;
        }
        // Normalize phone
        phone = phone.replace(/[\s\-\(\)]/g, '');
        if (!phone.startsWith('+')) {
          phone = '+' + phone;
        }
        return { ...c, phone, originalIndex: idx };
      })
      .filter(Boolean);

    if (phoneContacts.length === 0) {
      return results;
    }

    console.log(chalk.cyan(`\n🔍 Checking ${phoneContacts.length} phone numbers against Telegram...\n`));

    const progressBar = new cliProgress.SingleBar({
      format: 'Checking |' + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(phoneContacts.length, 0);

    // Check in batches of 100 (Telegram API limit)
    const batchSize = 100;
    
    for (let i = 0; i < phoneContacts.length; i += batchSize) {
      const batch = phoneContacts.slice(i, i + batchSize);
      
      try {
        // Create input contacts for checking
        const inputContacts = batch.map((contact, idx) => {
          return new Api.InputPhoneContact({
            clientId: BigInt(i + idx),
            phone: contact.phone,
            firstName: contact.name?.split(' ')[0] || 'Check',
            lastName: contact.name?.split(' ').slice(1).join(' ') || String(i + idx)
          });
        });

        // Import contacts temporarily to check their status
        const result = await this.client.invoke(
          new Api.contacts.ImportContacts({
            contacts: inputContacts
          })
        );

        // Build a map of phone -> user info from the response
        const phoneToUser = new Map();
        if (result.users) {
          for (const user of result.users) {
            if (user.phone) {
              let userPhone = user.phone;
              if (!userPhone.startsWith('+')) userPhone = '+' + userPhone;
              phoneToUser.set(userPhone, {
                id: user.id?.toString(),
                username: user.username || null,
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                isBot: user.bot || false
              });
            }
          }
        }

        // Also check imported array for new contacts
        const importedClientIds = new Set();
        if (result.imported) {
          for (const imp of result.imported) {
            importedClientIds.add(imp.clientId.toString());
          }
        }

        // Categorize each contact in this batch
        for (let j = 0; j < batch.length; j++) {
          const contact = batch[j];
          const clientId = BigInt(i + j).toString();
          const userInfo = phoneToUser.get(contact.phone);
          
          if (userInfo) {
            // Has Telegram account
            results.hasTelegram.push({
              ...contact,
              telegramId: userInfo.id,
              username: userInfo.username,
              telegramName: `${userInfo.firstName} ${userInfo.lastName}`.trim(),
              isNew: importedClientIds.has(clientId)
            });
          } else {
            // Check if in retryContacts (no Telegram)
            const isRetry = result.retryContacts?.some(rc => 
              rc.toString() === clientId
            );
            
            results.noTelegram.push({
              ...contact,
              reason: 'Not registered on Telegram'
            });
          }
          
          results.checked++;
        }

      } catch (error) {
        // On error, mark batch as unknown
        for (const contact of batch) {
          results.invalid.push({
            ...contact,
            reason: `Check failed: ${error.message}`
          });
        }
      }

      progressBar.update(Math.min(i + batchSize, phoneContacts.length));

      // Small delay between batches
      if (i + batchSize < phoneContacts.length) {
        await this.sleep(1000);
      }
    }

    progressBar.stop();

    // Now delete the contacts we just imported to clean up
    // (We don't want to pollute the user's contact list)
    if (results.hasTelegram.length > 0) {
      console.log(chalk.gray('\n   Cleaning up temporary imports...'));
      try {
        await this.deleteContactsByPhone(results.hasTelegram.map(c => c.phone));
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    return results;
  }

  /**
   * Format the check results for display
   */
  formatCheckResults(results) {
    let output = '\n' + chalk.cyan('═'.repeat(60)) + '\n';
    output += chalk.cyan.bold('  📊 TELEGRAM ACCOUNT CHECK RESULTS\n');
    output += chalk.cyan('═'.repeat(60)) + '\n\n';

    output += chalk.white(`  📋 Total contacts checked:    ${results.total}\n`);
    output += chalk.green(`  ✅ Have Telegram account:     ${results.hasTelegram.length}\n`);
    output += chalk.yellow(`  📵 No Telegram account:       ${results.noTelegram.length}\n`);
    
    if (results.invalid.length > 0) {
      output += chalk.red(`  ❌ Invalid/could not check:   ${results.invalid.length}\n`);
    }

    // Show contacts WITH Telegram
    if (results.hasTelegram.length > 0) {
      output += chalk.green('\n  ✅ Contacts WITH Telegram:\n');
      results.hasTelegram.slice(0, 10).forEach((c, i) => {
        const username = c.username ? ` (@${c.username})` : '';
        const name = c.name || c.telegramName || 'Unknown';
        output += chalk.gray(`     ${i + 1}. ${c.phone} - ${name}${username}\n`);
      });
      if (results.hasTelegram.length > 10) {
        output += chalk.gray(`     ... and ${results.hasTelegram.length - 10} more\n`);
      }
    }

    // Show contacts WITHOUT Telegram
    if (results.noTelegram.length > 0) {
      output += chalk.yellow('\n  📵 Contacts WITHOUT Telegram:\n');
      results.noTelegram.slice(0, 10).forEach((c, i) => {
        const name = c.name || 'Unknown';
        output += chalk.gray(`     ${i + 1}. ${c.phone} - ${name}\n`);
      });
      if (results.noTelegram.length > 10) {
        output += chalk.gray(`     ... and ${results.noTelegram.length - 10} more\n`);
      }
    }

    // Summary
    const telegramPercent = results.total > 0 
      ? ((results.hasTelegram.length / results.total) * 100).toFixed(1)
      : 0;
    
    output += '\n' + chalk.cyan('─'.repeat(60)) + '\n';
    output += chalk.white(`  📈 Telegram adoption rate: ${telegramPercent}%\n`);
    output += chalk.gray(`     ${results.hasTelegram.length} out of ${results.total} contacts can receive Telegram messages\n`);
    output += chalk.cyan('═'.repeat(60)) + '\n';

    return output;
  }
}

export default DataManager;
