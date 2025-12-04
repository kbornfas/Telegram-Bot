import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRAFTS_DIR = path.join(__dirname, '..', 'drafts');

class CLI {
  constructor(contactsManager, messageSender, groupManager = null, dataManager = null) {
    this.contactsManager = contactsManager;
    this.messageSender = messageSender;
    this.groupManager = groupManager;
    this.dataManager = dataManager;
    this.ensureDraftsDir();
  }

  ensureDraftsDir() {
    if (!fs.existsSync(DRAFTS_DIR)) {
      fs.mkdirSync(DRAFTS_DIR, { recursive: true });
    }
  }

  async showMainMenu() {
    console.log(chalk.cyan('\n═══════════════════════════════════════'));
    console.log(chalk.cyan.bold('     📱 Telegram Bulk Messenger CLI'));
    console.log(chalk.cyan('═══════════════════════════════════════\n'));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '📝 Compose & Send Message', value: 'compose' },
          { name: '👥 Group Management', value: 'groups' },
          { name: '📂 Data & Contacts Files', value: 'data' },
          { name: '📋 Manage Drafts', value: 'drafts' },
          { name: '👥 View Contacts', value: 'contacts' },
          { name: '⚙️  Settings', value: 'settings' },
          new inquirer.Separator(),
          { name: '🚪 Exit', value: 'exit' }
        ]
      }
    ]);

    return action;
  }

  async selectSendMode() {
    const { mode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'How would you like to send the message?',
        choices: [
          { name: '🚀 SEND TO ALL CONTACTS (reliable with retry)', value: 'reliable' },
          { name: '📤 Send to NEWLY IMPORTED contacts only', value: 'newonly' },
          new inquirer.Separator(),
          { name: '👤 Send to individual contacts', value: 'individual' },
          { name: '📦 Send in batches', value: 'batch' },
          { name: '🌐 Send to ALL contacts (basic)', value: 'all' },
          new inquirer.Separator(),
          { name: '📂 Send to contacts from FILE (phone/username)', value: 'file' },
          new inquirer.Separator(),
          { name: '⬅️  Back to main menu', value: 'back' }
        ]
      }
    ]);

    return mode;
  }

  async confirmReliableSend(contacts, message) {
    console.log(chalk.cyan('\n' + '═'.repeat(55)));
    console.log(chalk.cyan.bold('  🚀 RELIABLE SEND TO ALL CONTACTS'));
    console.log(chalk.cyan('═'.repeat(55) + '\n'));
    
    console.log(chalk.white(`  📋 Total contacts: ${contacts.length}`));
    console.log(chalk.gray(`  ⏱️  Estimated time: ${Math.ceil(contacts.length * 3 / 60)} - ${Math.ceil(contacts.length * 5 / 60)} minutes`));
    console.log(chalk.gray('  🔄 Auto-retry on temporary failures'));
    console.log(chalk.gray('  ⏳ Auto-pause on rate limiting\n'));

    console.log(chalk.cyan('  📝 Message preview:'));
    console.log(chalk.white('  ' + message.substring(0, 100) + (message.length > 100 ? '...' : '') + '\n'));

    console.log(chalk.yellow('  ⚠️  This will attempt to message ALL your Telegram contacts.'));
    console.log(chalk.yellow('  ⚠️  Messages that fail due to privacy settings will be skipped.\n'));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: chalk.red.bold(`Send message to ALL ${contacts.length} contacts?`),
        default: false
      }
    ]);

    return confirm;
  }

  async selectFileForMessaging() {
    if (!this.dataManager) {
      console.log(chalk.red('\n❌ Data manager not available!'));
      return null;
    }

    const files = this.dataManager.listContactFiles();
    
    if (files.length === 0) {
      console.log(chalk.yellow('\n⚠️  No contact files found in data folder!'));
      console.log(chalk.gray(`   Add files to: ${this.dataManager.getDataDir()}`));
      console.log(chalk.gray('   Or use "Scan computer for contact files" first.\n'));
      return null;
    }

    const { source } = await inquirer.prompt([
      {
        type: 'list',
        name: 'source',
        message: 'Select contact file to message:',
        choices: [
          ...files.map(f => {
            try {
              const contacts = this.dataManager.readContactFile(f.path);
              return {
                name: `📄 ${f.name} (${contacts.length} contacts)`,
                value: f.path
              };
            } catch {
              return {
                name: `📄 ${f.name} (error reading)`,
                value: f.path
              };
            }
          }),
          new inquirer.Separator(),
          { name: '⬅️  Back', value: 'back' }
        ]
      }
    ]);

    if (source === 'back') return null;
    return source;
  }

  async confirmFileMessage(contacts, message) {
    const withPhone = contacts.filter(c => c.phone);
    const withUsername = contacts.filter(c => !c.phone && c.username);
    const invalid = contacts.filter(c => !c.phone && !c.username);

    console.log(chalk.cyan('\n📋 Contacts to message:\n'));
    console.log(chalk.gray(`   • With phone number: ${withPhone.length}`));
    console.log(chalk.gray(`   • With username only: ${withUsername.length}`));
    if (invalid.length > 0) {
      console.log(chalk.yellow(`   • Invalid (no phone/username): ${invalid.length} (will be skipped)`));
    }

    console.log(chalk.cyan('\n📝 Message preview:'));
    console.log(chalk.white('   ' + message.substring(0, 100) + (message.length > 100 ? '...' : '')));

    console.log(chalk.yellow('\n⚠️  Note: Only users registered on Telegram can receive messages.'));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Send message to ${withPhone.length + withUsername.length} contacts?`,
        default: false
      }
    ]);

    return confirm;
  }

  async selectContacts() {
    const contacts = this.contactsManager.getContacts();
    
    if (contacts.length === 0) {
      console.log(chalk.yellow('\n⚠️  No contacts found!'));
      return [];
    }

    const { selectedIds } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedIds',
        message: `Select contacts to message (${contacts.length} available):`,
        choices: this.contactsManager.getContactChoices(),
        pageSize: 15,
        validate: (answer) => {
          if (answer.length === 0) {
            return 'Please select at least one contact';
          }
          return true;
        }
      }
    ]);

    return this.contactsManager.findContactsByIds(selectedIds);
  }

  async getBatchSize(totalContacts) {
    const { batchSize } = await inquirer.prompt([
      {
        type: 'number',
        name: 'batchSize',
        message: `Enter batch size (total contacts: ${totalContacts}):`,
        default: 10,
        validate: (value) => {
          if (value < 1) return 'Batch size must be at least 1';
          if (value > totalContacts) return `Batch size cannot exceed ${totalContacts}`;
          return true;
        }
      }
    ]);

    return batchSize;
  }

  async composeMessage() {
    const { messageChoice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'messageChoice',
        message: 'How would you like to compose your message?',
        choices: [
          { name: '✏️  Write new message', value: 'new' },
          { name: '📂 Load from draft', value: 'draft' },
          new inquirer.Separator(),
          { name: '⬅️  Back', value: 'back' }
        ]
      }
    ]);

    if (messageChoice === 'back') {
      return null;
    }

    if (messageChoice === 'draft') {
      return await this.loadDraft();
    }

    return await this.writeNewMessage();
  }

  async writeNewMessage() {
    console.log(chalk.cyan('\n📝 Enter your message below.'));
    console.log(chalk.gray('   (Type your message, then press Enter twice to finish)\n'));

    const lines = [];
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const message = await new Promise((resolve) => {
      let emptyLineCount = 0;
      
      const askLine = () => {
        rl.question(chalk.gray('> '), (line) => {
          if (line === '') {
            emptyLineCount++;
            if (emptyLineCount >= 1 && lines.length > 0) {
              rl.close();
              resolve(lines.join('\n'));
              return;
            }
          } else {
            emptyLineCount = 0;
            lines.push(line);
          }
          askLine();
        });
      };
      
      askLine();
    });

    if (!message || message.trim().length === 0) {
      console.log(chalk.red('\n❌ Message cannot be empty!'));
      return null;
    }

    console.log(chalk.green('\n✅ Message captured!\n'));

    // Ask if user wants to save as draft
    const { saveDraft } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'saveDraft',
        message: 'Would you like to save this message as a draft?',
        default: false
      }
    ]);

    if (saveDraft) {
      await this.saveDraft(message);
    }

    return message.trim();
  }

  async saveDraft(message) {
    const { draftName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'draftName',
        message: 'Enter a name for this draft:',
        validate: (input) => {
          if (!input || input.trim().length === 0) {
            return 'Draft name cannot be empty';
          }
          return true;
        }
      }
    ]);

    const filename = `${draftName.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    const filepath = path.join(DRAFTS_DIR, filename);
    fs.writeFileSync(filepath, message);
    console.log(chalk.green(`\n✅ Draft saved as: ${filename}`));
  }

  async loadDraft() {
    const drafts = this.listDrafts();
    
    if (drafts.length === 0) {
      console.log(chalk.yellow('\n⚠️  No drafts found!'));
      return await this.writeNewMessage();
    }

    const { draftFile } = await inquirer.prompt([
      {
        type: 'list',
        name: 'draftFile',
        message: 'Select a draft to load:',
        choices: [
          ...drafts.map(d => ({ name: d.name, value: d.path })),
          new inquirer.Separator(),
          { name: '✏️  Write new message instead', value: 'new' }
        ]
      }
    ]);

    if (draftFile === 'new') {
      return await this.writeNewMessage();
    }

    const message = fs.readFileSync(draftFile, 'utf-8');
    console.log(chalk.gray('\n--- Draft Preview ---'));
    console.log(chalk.white(message.substring(0, 200) + (message.length > 200 ? '...' : '')));
    console.log(chalk.gray('--- End Preview ---\n'));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Use this draft?',
        default: true
      }
    ]);

    return confirm ? message.trim() : null;
  }

  listDrafts() {
    if (!fs.existsSync(DRAFTS_DIR)) {
      return [];
    }

    return fs.readdirSync(DRAFTS_DIR)
      .filter(f => f.endsWith('.txt'))
      .map(f => ({
        name: f.replace('.txt', ''),
        path: path.join(DRAFTS_DIR, f),
        modified: fs.statSync(path.join(DRAFTS_DIR, f)).mtime
      }))
      .sort((a, b) => b.modified - a.modified);
  }

  async manageDrafts() {
    const drafts = this.listDrafts();

    if (drafts.length === 0) {
      console.log(chalk.yellow('\n⚠️  No drafts found!'));
      return;
    }

    console.log(chalk.cyan('\n📋 Your Drafts:\n'));
    drafts.forEach((draft, i) => {
      console.log(chalk.white(`  ${i + 1}. ${draft.name}`));
      console.log(chalk.gray(`     Modified: ${draft.modified.toLocaleString()}`));
    });

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '👁️  View a draft', value: 'view' },
          { name: '🗑️  Delete a draft', value: 'delete' },
          { name: '✏️  Create new draft', value: 'create' },
          new inquirer.Separator(),
          { name: '⬅️  Back to main menu', value: 'back' }
        ]
      }
    ]);

    if (action === 'view') {
      const { draftFile } = await inquirer.prompt([
        {
          type: 'list',
          name: 'draftFile',
          message: 'Select draft to view:',
          choices: drafts.map(d => ({ name: d.name, value: d.path }))
        }
      ]);
      const content = fs.readFileSync(draftFile, 'utf-8');
      console.log(chalk.cyan('\n--- Draft Content ---'));
      console.log(chalk.white(content));
      console.log(chalk.cyan('--- End ---\n'));
    } else if (action === 'delete') {
      const { draftFile } = await inquirer.prompt([
        {
          type: 'list',
          name: 'draftFile',
          message: 'Select draft to delete:',
          choices: drafts.map(d => ({ name: d.name, value: d.path }))
        }
      ]);
      fs.unlinkSync(draftFile);
      console.log(chalk.green('\n✅ Draft deleted!'));
    } else if (action === 'create') {
      const message = await this.writeNewMessage();
      if (message) {
        await this.saveDraft(message);
      }
    }
  }

  async viewContacts() {
    const contacts = this.contactsManager.getContacts();
    
    console.log(chalk.cyan(`\n👥 Your Contacts (${contacts.length} total):\n`));
    
    contacts.forEach((contact, i) => {
      console.log(chalk.white(`  ${i + 1}. ${contact.displayName}`));
      if (contact.phone) {
        console.log(chalk.gray(`     📞 ${contact.phone}`));
      }
    });

    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: 'Press Enter to continue...'
      }
    ]);
  }

  async configureSettings() {
    const { setting } = await inquirer.prompt([
      {
        type: 'list',
        name: 'setting',
        message: 'Settings:',
        choices: [
          { name: `⏱️  Message delay (current: ${this.messageSender.delay / 1000}s)`, value: 'delay' },
          { name: `📦 Batch delay (current: ${this.messageSender.batchDelay / 1000}s)`, value: 'batchDelay' },
          new inquirer.Separator(),
          { name: '⬅️  Back to main menu', value: 'back' }
        ]
      }
    ]);

    if (setting === 'delay') {
      const { delay } = await inquirer.prompt([
        {
          type: 'number',
          name: 'delay',
          message: 'Enter delay between messages (in seconds):',
          default: this.messageSender.delay / 1000,
          validate: (value) => value >= 1 ? true : 'Delay must be at least 1 second'
        }
      ]);
      this.messageSender.setDelay(delay * 1000);
      console.log(chalk.green(`\n✅ Message delay set to ${delay} seconds`));
    } else if (setting === 'batchDelay') {
      const { delay } = await inquirer.prompt([
        {
          type: 'number',
          name: 'delay',
          message: 'Enter delay between batches (in seconds):',
          default: this.messageSender.batchDelay / 1000,
          validate: (value) => value >= 1 ? true : 'Delay must be at least 1 second'
        }
      ]);
      this.messageSender.setBatchDelay(delay * 1000);
      console.log(chalk.green(`\n✅ Batch delay set to ${delay} seconds`));
    }
  }

  async confirmSend(contacts, message) {
    console.log(chalk.yellow('\n📋 Message Preview:'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.white(message.substring(0, 300) + (message.length > 300 ? '...' : '')));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.yellow(`\n📤 Will be sent to ${contacts.length} contact(s)\n`));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: chalk.red('Are you sure you want to send this message?'),
        default: false
      }
    ]);

    return confirm;
  }

  // ==================== GROUP MANAGEMENT ====================

  async showGroupMenu() {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Group Management:',
        choices: [
          { name: '➕ Add contacts to a group', value: 'add' },
          { name: '👁️  View my groups', value: 'view' },
          { name: '⬆️  Convert Basic Groups to Supergroups', value: 'convert' },
          new inquirer.Separator(),
          { name: '⬅️  Back to main menu', value: 'back' }
        ]
      }
    ]);

    return action;
  }

  async selectBasicGroupsToConvert() {
    if (!this.groupManager) {
      console.log(chalk.red('\n❌ Group manager not available!'));
      return null;
    }

    const basicGroups = this.groupManager.getBasicGroups();
    
    if (basicGroups.length === 0) {
      console.log(chalk.yellow('\n⚠️  No Basic Groups found!'));
      console.log(chalk.gray('   All your groups are already Supergroups.\n'));
      return null;
    }

    console.log(chalk.cyan(`\n📝 Found ${basicGroups.length} Basic Group(s) that can be converted:\n`));
    console.log(chalk.yellow('⚠️  Warning: Converting to Supergroup is PERMANENT and cannot be undone!'));
    console.log(chalk.gray('   Supergroups have: 200K member limit, message history, public links, etc.\n'));

    const choices = [
      { name: chalk.cyan(`📦 Convert ALL Basic Groups (${basicGroups.length})`), value: 'all' },
      new inquirer.Separator(),
      ...this.groupManager.getBasicGroupChoices(),
      new inquirer.Separator(),
      { name: '⬅️  Back', value: 'back' }
    ];

    const { selected } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selected',
        message: 'Select groups to convert to Supergroup:',
        choices: choices,
        validate: (answer) => {
          if (answer.length === 0) {
            return 'Please select at least one group (or press Ctrl+C to cancel)';
          }
          return true;
        }
      }
    ]);

    if (selected.includes('back') || selected.length === 0) {
      return null;
    }

    // Handle "Select ALL" option
    if (selected.includes('all')) {
      return basicGroups;
    }

    // Return selected groups
    return selected.map(id => this.groupManager.findGroupById(id)).filter(g => g);
  }

  async confirmConversion(groups) {
    console.log(chalk.cyan(`\n📝 Groups to convert: ${groups.length}\n`));
    groups.forEach((g, i) => {
      console.log(chalk.gray(`   ${i + 1}. ${g.title} (${g.participantsCount || '?'} members)`));
    });
    console.log('');

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: chalk.yellow(`Convert ${groups.length} group(s) to Supergroups? (This is PERMANENT)`),
        default: false
      }
    ]);

    return confirm;
  }

  async selectGroup() {
    if (!this.groupManager) {
      console.log(chalk.red('\n❌ Group manager not available!'));
      return null;
    }

    const groups = this.groupManager.getGroups();
    
    if (groups.length === 0) {
      console.log(chalk.yellow('\n⚠️  No groups found! You need to be a member of at least one group.'));
      return null;
    }

    const { groupId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'groupId',
        message: `Select a group (${groups.length} available):`,
        choices: [
          ...this.groupManager.getGroupChoices(),
          new inquirer.Separator(),
          { name: '⬅️  Back', value: 'back' }
        ],
        pageSize: 15
      }
    ]);

    if (groupId === 'back') return null;

    return this.groupManager.findGroupById(groupId);
  }

  async viewGroups() {
    if (!this.groupManager) {
      console.log(chalk.red('\n❌ Group manager not available!'));
      return;
    }

    const groups = this.groupManager.getGroups();
    
    console.log(chalk.cyan(`\n👥 Your Groups (${groups.length} total):\n`));
    
    groups.forEach((group, i) => {
      const type = group.isMegagroup ? 'Supergroup' : 'Group';
      console.log(chalk.white(`  ${i + 1}. ${group.title}`));
      console.log(chalk.gray(`     ${type} • ${group.participantsCount || '?'} members`));
    });

    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: 'Press Enter to continue...'
      }
    ]);
  }

  async confirmAddToGroup(contacts, group) {
    console.log(chalk.yellow(`\n👥 Group: ${group.title}`));
    console.log(chalk.yellow(`📊 Contacts to add: ${contacts.length}\n`));

    console.log(chalk.gray('Contacts:'));
    contacts.slice(0, 10).forEach(c => {
      console.log(chalk.gray(`  • ${c.displayName}`));
    });
    if (contacts.length > 10) {
      console.log(chalk.gray(`  ... and ${contacts.length - 10} more`));
    }

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: chalk.red('Are you sure you want to add these contacts to the group?'),
        default: false
      }
    ]);

    return confirm;
  }

  // ==================== DATA MANAGEMENT ====================

  async showDataMenu() {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Data & Contacts Files:',
        choices: [
          { name: '🔍 Scan computer for contact files', value: 'scan' },
          { name: '📂 View files in data folder', value: 'view' },
          { name: '📥 Load contacts from file (preview)', value: 'load' },
          { name: '📲 Import contacts to Telegram', value: 'import' },
          { name: '🔎 Check which contacts have Telegram', value: 'check' },
          { name: '💾 Export Telegram contacts to file', value: 'export' },
          { name: '📁 Open data folder location', value: 'location' },
          new inquirer.Separator(),
          { name: '🗑️  DELETE all Telegram contacts', value: 'deleteall' },
          new inquirer.Separator(),
          { name: '⬅️  Back to main menu', value: 'back' }
        ]
      }
    ]);

    return action;
  }

  async selectImportSource() {
    if (!this.dataManager) {
      console.log(chalk.red('\n❌ Data manager not available!'));
      return null;
    }

    const files = this.dataManager.listContactFiles();
    
    if (files.length === 0) {
      console.log(chalk.yellow('\n⚠️  No contact files found in data folder!'));
      console.log(chalk.gray(`   Add files to: ${this.dataManager.getDataDir()}`));
      return null;
    }

    const { source } = await inquirer.prompt([
      {
        type: 'list',
        name: 'source',
        message: 'Select import source:',
        choices: [
          { name: `🌐 Import ALL files (${files.length} files)`, value: 'all' },
          new inquirer.Separator(),
          ...files.map(f => ({
            name: `📄 ${f.name} (${this.dataManager.formatFileSize(f.size)})`,
            value: f.path
          })),
          new inquirer.Separator(),
          { name: '⬅️  Back', value: 'back' }
        ]
      }
    ]);

    return source;
  }

  async confirmImport(contacts) {
    // Show preview
    console.log(chalk.cyan(`\n📋 Contacts to import: ${contacts.length}\n`));
    
    const withPhone = contacts.filter(c => c.phone);
    const withoutPhone = contacts.filter(c => !c.phone);
    
    console.log(chalk.gray(`   • With phone number: ${withPhone.length} (will be imported)`));
    console.log(chalk.gray(`   • Without phone number: ${withoutPhone.length} (will be skipped)`));
    
    if (withPhone.length === 0) {
      console.log(chalk.yellow('\n⚠️  No contacts with phone numbers to import!'));
      console.log(chalk.gray('   Telegram requires phone numbers to import contacts.\n'));
      return { confirm: false };
    }

    // Show sample
    console.log(chalk.cyan('\nSample contacts:'));
    withPhone.slice(0, 5).forEach((c, i) => {
      console.log(chalk.gray(`   ${i + 1}. ${c.phone} ${c.name ? `(${c.name})` : ''}`));
    });
    if (withPhone.length > 5) {
      console.log(chalk.gray(`   ... and ${withPhone.length - 5} more\n`));
    }

    // Ask about import mode
    const { importMode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'importMode',
        message: 'How do you want to import these contacts?',
        choices: [
          { name: '➕ Add new only (skip existing)', value: 'add' },
          { name: '🔄 Replace existing contacts (delete & re-import ALL)', value: 'replace' },
          new inquirer.Separator(),
          { name: '❌ Cancel', value: 'cancel' }
        ]
      }
    ]);

    if (importMode === 'cancel') {
      return { confirm: false };
    }

    const replaceExisting = importMode === 'replace';

    if (replaceExisting) {
      console.log(chalk.yellow('\n⚠️  WARNING: This will DELETE existing contacts with these phone numbers'));
      console.log(chalk.yellow('   and re-import them as NEW contacts.\n'));
    }

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: replaceExisting 
          ? chalk.red(`Delete & re-import ${withPhone.length} contacts?`)
          : `Import ${withPhone.length} contacts to your Telegram account?`,
        default: !replaceExisting
      }
    ]);

    return { confirm, replaceExisting };
  }

  async scanAndImportFiles() {
    if (!this.dataManager) {
      console.log(chalk.red('\n❌ Data manager not available!'));
      return;
    }

    // Scan for files
    const files = await this.dataManager.scanHostForTxtFiles();

    if (files.length === 0) {
      console.log(chalk.yellow('\n⚠️  No eligible contact files found on your computer!'));
      console.log(chalk.gray('   Files must contain phone numbers (+1234567890) or usernames (@username)\n'));
      return;
    }

    console.log(chalk.green(`\n✅ Found ${files.length} eligible contact file(s)!\n`));

    // Show files and let user select which to import
    const choices = files.map((f, idx) => {
      const contactInfo = [];
      if (f.hasPhones) contactInfo.push('phones');
      if (f.hasUsernames) contactInfo.push('usernames');
      
      return {
        name: `${f.name} (${f.contactCount} contacts: ${contactInfo.join(', ')}) - ${f.location}`,
        value: f.path,
        short: f.name
      };
    });

    const { selectedFiles } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedFiles',
        message: 'Select files to import to CLI data folder:',
        choices: [
          { name: chalk.cyan('📦 Select ALL files'), value: 'all' },
          new inquirer.Separator(),
          ...choices
        ],
        validate: (answer) => {
          if (answer.length === 0) {
            return 'Please select at least one file (or press Ctrl+C to cancel)';
          }
          return true;
        }
      }
    ]);

    if (selectedFiles.length === 0) {
      console.log(chalk.yellow('\n❌ No files selected.'));
      return;
    }

    // Handle "Select ALL" option
    let filesToImport = selectedFiles;
    if (selectedFiles.includes('all')) {
      filesToImport = files.map(f => f.path);
    }

    // Confirm import
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Import ${filesToImport.length} file(s) to CLI data folder?`,
        default: true
      }
    ]);

    if (!confirm) {
      console.log(chalk.yellow('\n❌ Import cancelled.'));
      return;
    }

    // Import files
    console.log(chalk.cyan('\n📥 Importing files...\n'));
    const results = this.dataManager.importFilesToDataFolder(filesToImport);

    // Show results
    if (results.imported.length > 0) {
      console.log(chalk.green(`✅ Successfully imported ${results.imported.length} file(s):`));
      results.imported.forEach(r => {
        console.log(chalk.gray(`   • ${r.fileName}`));
      });
    }

    if (results.failed.length > 0) {
      console.log(chalk.red(`\n❌ Failed to import ${results.failed.length} file(s):`));
      results.failed.forEach(r => {
        console.log(chalk.gray(`   • ${path.basename(r.path)}: ${r.error}`));
      });
    }

    console.log(chalk.cyan(`\n📁 Files stored in: ${this.dataManager.getDataDir()}`));
    console.log(chalk.gray('   You can now use "Import contacts to Telegram" to add them to your account.\n'));
  }

  async viewDataFiles() {
    if (!this.dataManager) {
      console.log(chalk.red('\n❌ Data manager not available!'));
      return;
    }

    const files = this.dataManager.listContactFiles();
    
    if (files.length === 0) {
      console.log(chalk.yellow('\n⚠️  No contact files found in data folder!'));
      console.log(chalk.gray(`   Location: ${this.dataManager.getDataDir()}`));
      console.log(chalk.gray('   Supported formats: .txt, .csv, .json\n'));
      return;
    }

    console.log(chalk.cyan(`\n📂 Contact Files (${files.length} found):\n`));
    
    for (const file of files) {
      try {
        const contacts = this.dataManager.readContactFile(file.path);
        console.log(chalk.white(`  📄 ${file.name}`));
        console.log(chalk.gray(`     Format: ${file.format.toUpperCase()} | Size: ${this.dataManager.formatFileSize(file.size)} | Contacts: ${contacts.length}`));
        console.log(chalk.gray(`     Modified: ${file.modified.toLocaleString()}`));
      } catch (error) {
        console.log(chalk.white(`  📄 ${file.name}`));
        console.log(chalk.red(`     Error reading file: ${error.message}`));
      }
    }

    console.log(chalk.gray(`\n   Folder: ${this.dataManager.getDataDir()}\n`));

    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: 'Press Enter to continue...'
      }
    ]);
  }

  async selectContactFile() {
    if (!this.dataManager) {
      console.log(chalk.red('\n❌ Data manager not available!'));
      return null;
    }

    const files = this.dataManager.listContactFiles();
    
    if (files.length === 0) {
      console.log(chalk.yellow('\n⚠️  No contact files found!'));
      console.log(chalk.gray(`   Add files to: ${this.dataManager.getDataDir()}`));
      return null;
    }

    const { filePath } = await inquirer.prompt([
      {
        type: 'list',
        name: 'filePath',
        message: 'Select a contact file to load:',
        choices: [
          ...this.dataManager.getFileChoices(),
          new inquirer.Separator(),
          { name: '⬅️  Back', value: 'back' }
        ]
      }
    ]);

    if (filePath === 'back') return null;

    return filePath;
  }

  async loadContactsFromFile(client) {
    const filePath = await this.selectContactFile();
    if (!filePath) return null;

    try {
      const fileContacts = this.dataManager.readContactFile(filePath);
      console.log(chalk.green(`\n✅ Loaded ${fileContacts.length} contacts from file\n`));

      // Preview contacts
      console.log(chalk.cyan('Preview:'));
      fileContacts.slice(0, 5).forEach((c, i) => {
        const identifier = c.phone || `@${c.username}`;
        console.log(chalk.gray(`  ${i + 1}. ${identifier}${c.name ? ` (${c.name})` : ''}`));
      });
      if (fileContacts.length > 5) {
        console.log(chalk.gray(`  ... and ${fileContacts.length - 5} more\n`));
      }

      return fileContacts;
    } catch (error) {
      console.log(chalk.red(`\n❌ Error loading file: ${error.message}`));
      return null;
    }
  }

  async exportContacts() {
    if (!this.dataManager || !this.contactsManager) {
      console.log(chalk.red('\n❌ Required managers not available!'));
      return;
    }

    const contacts = this.contactsManager.getContacts();
    
    if (contacts.length === 0) {
      console.log(chalk.yellow('\n⚠️  No contacts to export!'));
      return;
    }

    const { filename } = await inquirer.prompt([
      {
        type: 'input',
        name: 'filename',
        message: 'Enter filename for export (without extension):',
        default: `telegram_contacts_${new Date().toISOString().split('T')[0]}`,
        validate: (input) => {
          if (!input || input.trim().length === 0) {
            return 'Filename cannot be empty';
          }
          return true;
        }
      }
    ]);

    const { format } = await inquirer.prompt([
      {
        type: 'list',
        name: 'format',
        message: 'Select export format:',
        choices: [
          { name: 'JSON (recommended)', value: 'json' },
          { name: 'CSV (spreadsheet compatible)', value: 'csv' },
          { name: 'TXT (simple list)', value: 'txt' }
        ]
      }
    ]);

    const fullFilename = `${filename.replace(/[^a-zA-Z0-9_-]/g, '_')}.${format}`;
    const result = this.dataManager.exportTelegramContacts(contacts, fullFilename);
    
    console.log(chalk.green(`\n✅ Exported ${result.count} contacts to:`));
    console.log(chalk.white(`   ${result.path}\n`));
  }

  showDataFolderLocation() {
    if (!this.dataManager) {
      console.log(chalk.red('\n❌ Data manager not available!'));
      return;
    }

    console.log(chalk.cyan('\n📁 Data Folder Location:\n'));
    console.log(chalk.white(`   ${this.dataManager.getDataDir()}\n`));
    console.log(chalk.gray('   Supported file formats:'));
    console.log(chalk.gray('   • .txt - One phone/username per line'));
    console.log(chalk.gray('   • .csv - Comma-separated with headers (phone,username,name)'));
    console.log(chalk.gray('   • .json - Array of contact objects\n'));
  }
}

export default CLI;
