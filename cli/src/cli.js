import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRAFTS_DIR = path.join(__dirname, '..', 'drafts');

class CLI {
  constructor(contactsManager, messageSender, groupManager = null) {
    this.contactsManager = contactsManager;
    this.messageSender = messageSender;
    this.groupManager = groupManager;
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
          { name: '👤 Send to individual contacts', value: 'individual' },
          { name: '📦 Send in batches', value: 'batch' },
          { name: '🌐 Send to ALL contacts', value: 'all' },
          new inquirer.Separator(),
          { name: '⬅️  Back to main menu', value: 'back' }
        ]
      }
    ]);

    return mode;
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
          new inquirer.Separator(),
          { name: '⬅️  Back to main menu', value: 'back' }
        ]
      }
    ]);

    return action;
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
}

export default CLI;
