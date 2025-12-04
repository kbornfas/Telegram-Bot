#!/usr/bin/env node

import 'dotenv/config';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

import TelegramClientManager from './src/telegramClient.js';
import ContactsManager from './src/contactsManager.js';
import MessageSender from './src/messageSender.js';
import GroupManager from './src/groupManager.js';
import DataManager from './src/dataManager.js';
import CLI from './src/cli.js';

// ASCII Art Banner
const banner = `
${chalk.cyan('╔════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.white('📱 Telegram Bulk Messenger CLI')}                         ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('Send messages to contacts individually or in bulk')}     ${chalk.cyan('║')}
${chalk.cyan('╚════════════════════════════════════════════════════════╝')}
`;

async function checkCredentials() {
  const apiId = process.env.API_ID;
  const apiHash = process.env.API_HASH;

  if (!apiId || !apiHash) {
    console.log(chalk.red('\n❌ Missing Telegram API credentials!\n'));
    console.log(chalk.yellow('To get your API credentials:'));
    console.log(chalk.white('  1. Go to https://my.telegram.org/apps'));
    console.log(chalk.white('  2. Log in with your phone number'));
    console.log(chalk.white('  3. Create a new application'));
    console.log(chalk.white('  4. Copy the API_ID and API_HASH\n'));
    
    const { setupNow } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'setupNow',
        message: 'Would you like to enter your credentials now?',
        default: true
      }
    ]);

    if (setupNow) {
      const credentials = await inquirer.prompt([
        {
          type: 'input',
          name: 'apiId',
          message: 'Enter your API_ID:',
          validate: (input) => /^\d+$/.test(input) ? true : 'API_ID should be a number'
        },
        {
          type: 'input',
          name: 'apiHash',
          message: 'Enter your API_HASH:',
          validate: (input) => input.length > 0 ? true : 'API_HASH cannot be empty'
        }
      ]);

      // Save to .env file
      const fs = await import('fs');
      const envContent = `API_ID=${credentials.apiId}\nAPI_HASH=${credentials.apiHash}\nSESSION_NAME=telegram_session\n`;
      fs.writeFileSync('.env', envContent);
      console.log(chalk.green('\n✅ Credentials saved to .env file!\n'));
      
      return { apiId: credentials.apiId, apiHash: credentials.apiHash };
    } else {
      console.log(chalk.yellow('\nPlease create a .env file with your credentials.'));
      console.log(chalk.gray('You can copy .env.example and fill in your values.\n'));
      process.exit(1);
    }
  }

  return { apiId, apiHash };
}

async function selectConnectionMode() {
  const hasSession = TelegramClientManager.hasExistingSession();
  
  if (!hasSession) {
    console.log(chalk.yellow('No saved session found. Will create a new connection.\n'));
    return { useNew: true };
  }

  const { connectionMode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'connectionMode',
      message: 'How would you like to connect?',
      choices: [
        { name: '🔄 Use saved session (faster)', value: 'saved' },
        { name: '🆕 Create new connection (re-authenticate)', value: 'new' },
        { name: '🗑️  Clear saved session and exit', value: 'clear' }
      ]
    }
  ]);

  if (connectionMode === 'clear') {
    TelegramClientManager.clearSession();
    console.log(chalk.green('\n✅ Session cleared! Run the app again to create a new connection.\n'));
    process.exit(0);
  }

  return { useNew: connectionMode === 'new' };
}

async function main() {
  console.log(banner);

  // Check and get credentials
  const { apiId, apiHash } = await checkCredentials();

  // Ask about connection mode
  const { useNew } = await selectConnectionMode();

  // Initialize Telegram client
  const telegramManager = new TelegramClientManager(apiId, apiHash, useNew);
  
  try {
    await telegramManager.connect();

    const me = await telegramManager.getMe();
    console.log(chalk.green(`\n👤 Logged in as: ${me.firstName || ''} ${me.lastName || ''} (@${me.username || 'no username'})\n`));

    // Fetch contacts
    let spinner = ora('Fetching contacts...').start();
    const contactsManager = new ContactsManager(telegramManager.getClient());
    const contacts = await contactsManager.fetchContacts();
    spinner.succeed(`Loaded ${contacts.length} contacts!`);

    // Fetch groups
    spinner = ora('Fetching groups...').start();
    const groupManager = new GroupManager(telegramManager.getClient());
    const groups = await groupManager.fetchGroups();
    spinner.succeed(`Loaded ${groups.length} groups!`);

    // Initialize data manager
    const dataManager = new DataManager();
    const dataFiles = dataManager.listContactFiles();
    console.log(chalk.gray(`📂 Data folder: ${dataFiles.length} contact file(s) available`));

    // Initialize message sender and CLI
    const messageSender = new MessageSender(telegramManager.getClient());
    const cli = new CLI(contactsManager, messageSender, groupManager, dataManager);

    // Session state to track newly imported contacts
    const sessionState = {
      lastImportedContacts: [],  // Contacts from the most recent import
      lastImportTime: null       // When the import happened
    };

    // Main application loop
    let running = true;
    while (running) {
      const action = await cli.showMainMenu();

      switch (action) {
        case 'compose':
          await handleCompose(cli, contactsManager, messageSender, dataManager, sessionState);
          break;
        
        case 'groups':
          await handleGroupManagement(cli, contactsManager, groupManager);
          break;
        
        case 'data':
          await handleDataManagement(cli, dataManager, contactsManager, telegramManager.getClient(), sessionState);
          break;
        
        case 'drafts':
          await cli.manageDrafts();
          break;
        
        case 'contacts':
          await cli.viewContacts();
          break;
        
        case 'settings':
          await cli.configureSettings();
          break;
        
        case 'exit':
          running = false;
          break;
      }
    }

    // Cleanup
    spinner = ora('Disconnecting...').start();
    await telegramManager.disconnect();
    spinner.succeed('Disconnected. Goodbye! 👋');

  } catch (error) {
    console.error(chalk.red('\n❌ Error:', error.message));
    console.error(chalk.gray(error.stack));
    
    if (error.message.includes('API_ID_INVALID')) {
      console.log(chalk.yellow('\nYour API credentials appear to be invalid.'));
      console.log(chalk.yellow('Please check your .env file and try again.\n'));
    }
    
    if (error.message.includes('PHONE_NUMBER_INVALID')) {
      console.log(chalk.yellow('\nThe phone number format is invalid.'));
      console.log(chalk.yellow('Make sure to include country code (e.g., +1234567890)\n'));
    }
    
    process.exit(1);
  }
}

async function handleCompose(cli, contactsManager, messageSender, dataManager, sessionState) {
  // Select send mode
  const mode = await cli.selectSendMode();
  
  if (mode === 'back') return;

  // Handle file-based messaging
  if (mode === 'file') {
    await handleFileMessaging(cli, messageSender, dataManager);
    return;
  }

  // Handle reliable send to ALL
  if (mode === 'reliable') {
    await handleReliableSendAll(cli, contactsManager, messageSender);
    return;
  }

  // Handle send to newly imported contacts only
  if (mode === 'newonly') {
    await handleSendToNewContacts(cli, contactsManager, messageSender, dataManager, sessionState);
    return;
  }

  // Get contacts based on mode
  let selectedContacts;
  
  if (mode === 'individual') {
    selectedContacts = await cli.selectContacts();
    if (selectedContacts.length === 0) return;
  } else if (mode === 'batch' || mode === 'all') {
    selectedContacts = contactsManager.getContacts();
    if (selectedContacts.length === 0) {
      console.log(chalk.yellow('\n⚠️  No contacts available!'));
      return;
    }
  }

  // Compose message
  const message = await cli.composeMessage();
  if (!message) return;

  // Confirm before sending
  const confirmed = await cli.confirmSend(selectedContacts, message);
  if (!confirmed) {
    console.log(chalk.yellow('\n❌ Sending cancelled.'));
    return;
  }

  // Send messages
  let results;
  
  if (mode === 'batch') {
    const batchSize = await cli.getBatchSize(selectedContacts.length);
    results = await messageSender.sendInBatches(selectedContacts, message, batchSize);
  } else {
    results = await messageSender.sendToMultiple(selectedContacts, message);
  }

  // Show results
  console.log(messageSender.formatResults(results));
}

async function handleReliableSendAll(cli, contactsManager, messageSender) {
  const contacts = contactsManager.getContacts();
  
  if (contacts.length === 0) {
    console.log(chalk.yellow('\n⚠️  No contacts available!'));
    console.log(chalk.gray('   Import contacts to Telegram first using Data & Contacts Files.\n'));
    return;
  }

  console.log(chalk.cyan(`\n📋 Found ${contacts.length} Telegram contacts\n`));

  // Compose message first
  const message = await cli.composeMessage();
  if (!message) return;

  // Confirm with detailed info
  const confirmed = await cli.confirmReliableSend(contacts, message);
  if (!confirmed) {
    console.log(chalk.yellow('\n❌ Sending cancelled.'));
    return;
  }

  // Send with reliable method
  const results = await messageSender.sendToAllReliably(contacts, message);

  // Show detailed results
  console.log(messageSender.formatReliableResults(results));
}

async function handleSendToNewContacts(cli, contactsManager, messageSender, dataManager, sessionState) {
  console.log(chalk.cyan('\n' + '═'.repeat(55)));
  console.log(chalk.cyan.bold('  📤 SEND TO NEWLY IMPORTED CONTACTS'));
  console.log(chalk.cyan('═'.repeat(55) + '\n'));

  // Check if we have contacts from the current session
  if (!sessionState || !sessionState.lastImportedContacts || sessionState.lastImportedContacts.length === 0) {
    console.log(chalk.yellow('  ⚠️  No contacts imported in this session yet!\n'));
    console.log(chalk.gray('  To use this feature:'));
    console.log(chalk.gray('    1. Go to "Data & Contacts Files"'));
    console.log(chalk.gray('    2. Select "Import contacts to Telegram"'));
    console.log(chalk.gray('    3. Import a contact file'));
    console.log(chalk.gray('    4. Come back here to message those contacts\n'));
    return;
  }

  const newContacts = sessionState.lastImportedContacts;
  const importTime = sessionState.lastImportTime;
  const timeAgo = importTime ? getTimeAgo(importTime) : 'recently';

  console.log(chalk.green(`  ✅ Found ${newContacts.length} contacts from your last import (${timeAgo})\n`));

  // Preview contacts
  console.log(chalk.cyan('  Contacts to message:'));
  newContacts.slice(0, 10).forEach((c, i) => {
    const id = c.phone || `@${c.username}`;
    console.log(chalk.gray(`     ${i + 1}. ${id}${c.name ? ` (${c.name})` : ''}`));
  });
  if (newContacts.length > 10) {
    console.log(chalk.gray(`     ... and ${newContacts.length - 10} more\n`));
  } else {
    console.log('');
  }

  // Compose message
  const message = await cli.composeMessage();
  if (!message) return;

  // Confirm
  console.log(chalk.cyan('\n  📝 Message preview:'));
  console.log(chalk.white('  ' + message.substring(0, 100) + (message.length > 100 ? '...' : '') + '\n'));

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: chalk.yellow(`Send message to ${newContacts.length} contacts you just imported?`),
      default: false
    }
  ]);

  if (!confirm) {
    console.log(chalk.yellow('\n❌ Sending cancelled.'));
    return;
  }

  // Send messages
  console.log(chalk.cyan(`\n📤 Sending to ${newContacts.length} newly imported contacts...\n`));
  const results = await messageSender.sendToFileContacts(newContacts, message);
  
  // Show results
  console.log(messageSender.formatFileResults(results));
}

// Helper function to get human-readable time ago
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

async function handleFileMessaging(cli, messageSender, dataManager) {
  // Select file
  const filePath = await cli.selectFileForMessaging();
  if (!filePath) return;

  // Read contacts from file
  let fileContacts;
  try {
    fileContacts = dataManager.readContactFile(filePath);
  } catch (error) {
    console.log(chalk.red(`\n❌ Error reading file: ${error.message}`));
    return;
  }

  if (fileContacts.length === 0) {
    console.log(chalk.yellow('\n⚠️  No contacts found in file!'));
    return;
  }

  // Filter valid contacts (must have phone or username)
  const validContacts = fileContacts.filter(c => c.phone || c.username);
  
  if (validContacts.length === 0) {
    console.log(chalk.yellow('\n⚠️  No valid contacts in file! (need phone number or username)'));
    return;
  }

  console.log(chalk.cyan(`\n📂 Loaded ${validContacts.length} contacts from file\n`));

  // Preview contacts
  console.log(chalk.gray('Sample contacts:'));
  validContacts.slice(0, 5).forEach((c, i) => {
    const id = c.phone || `@${c.username}`;
    console.log(chalk.gray(`   ${i + 1}. ${id}${c.name ? ` (${c.name})` : ''}`));
  });
  if (validContacts.length > 5) {
    console.log(chalk.gray(`   ... and ${validContacts.length - 5} more\n`));
  }

  // Compose message
  const message = await cli.composeMessage();
  if (!message) return;

  // Confirm
  const confirmed = await cli.confirmFileMessage(validContacts, message);
  if (!confirmed) {
    console.log(chalk.yellow('\n❌ Sending cancelled.'));
    return;
  }

  // Send messages
  console.log(chalk.cyan('\n📤 Sending messages...\n'));
  const results = await messageSender.sendToFileContacts(validContacts, message);

  // Show results
  console.log(messageSender.formatFileResults(results));
}

async function handleGroupManagement(cli, contactsManager, groupManager) {
  const action = await cli.showGroupMenu();
  
  if (action === 'back') return;

  if (action === 'view') {
    await cli.viewGroups();
    return;
  }

  if (action === 'convert') {
    await handleConvertToSupergroup(cli, groupManager);
    return;
  }

  if (action === 'add') {
    // Select group
    const group = await cli.selectGroup();
    if (!group) return;

    // Get all contacts
    const allContacts = contactsManager.getContacts();
    if (allContacts.length === 0) {
      console.log(chalk.yellow('\n⚠️  No contacts available!'));
      return;
    }

    // Ask how many contacts to add
    const contactCountChoices = [];
    
    if (allContacts.length >= 50) contactCountChoices.push({ name: `📊 Add 50 contacts`, value: 50 });
    if (allContacts.length >= 100) contactCountChoices.push({ name: `📊 Add 100 contacts`, value: 100 });
    if (allContacts.length >= 200) contactCountChoices.push({ name: `📊 Add 200 contacts`, value: 200 });
    if (allContacts.length >= 500) contactCountChoices.push({ name: `📊 Add 500 contacts`, value: 500 });
    if (allContacts.length >= 1000) contactCountChoices.push({ name: `📊 Add 1000 contacts`, value: 1000 });
    contactCountChoices.push({ name: `🌐 Add ALL contacts (${allContacts.length})`, value: 'all' });
    contactCountChoices.push({ name: `👤 Select specific contacts manually`, value: 'manual' });
    contactCountChoices.push(new inquirer.Separator());
    contactCountChoices.push({ name: '⬅️  Back', value: 'back' });

    const { contactCount } = await inquirer.prompt([
      {
        type: 'list',
        name: 'contactCount',
        message: `How many contacts do you want to add? (${allContacts.length} available)`,
        choices: contactCountChoices
      }
    ]);

    if (contactCount === 'back') return;

    let selectedContacts;
    
    if (contactCount === 'manual') {
      // Manual selection
      selectedContacts = await cli.selectContacts();
      if (selectedContacts.length === 0) return;
    } else if (contactCount === 'all') {
      // All contacts
      selectedContacts = allContacts;
    } else {
      // Specific number - take first N contacts
      selectedContacts = allContacts.slice(0, contactCount);
    }

    console.log(chalk.cyan(`\n📋 Selected ${selectedContacts.length} contacts to add to "${group.title}"\n`));

    // Confirm
    const confirmed = await cli.confirmAddToGroup(selectedContacts, group);
    if (!confirmed) {
      console.log(chalk.yellow('\n❌ Operation cancelled.'));
      return;
    }

    // Add contacts
    console.log(chalk.cyan('\n📤 Adding contacts to group...\n'));
    const results = await groupManager.addMultipleContactsToGroup(selectedContacts, group);
    console.log(groupManager.formatResults(results));
  }
}

async function handleConvertToSupergroup(cli, groupManager) {
  // Select groups to convert
  const groupsToConvert = await cli.selectBasicGroupsToConvert();
  
  if (!groupsToConvert || groupsToConvert.length === 0) {
    return;
  }

  // Confirm conversion
  const confirmed = await cli.confirmConversion(groupsToConvert);
  if (!confirmed) {
    console.log(chalk.yellow('\n❌ Conversion cancelled.'));
    return;
  }

  // Perform conversion
  console.log(chalk.cyan('\n⬆️  Converting groups to Supergroups...\n'));
  const results = await groupManager.convertMultipleToSupergroup(groupsToConvert);
  
  // Show results
  console.log(groupManager.formatConversionResults(results));
  
  // Refresh groups list if any were converted
  if (results.successful.length > 0) {
    console.log(chalk.gray('Refreshing groups list...'));
    await groupManager.fetchGroups();
    console.log(chalk.green('✅ Groups list updated!\n'));
  }
}

async function handleDataManagement(cli, dataManager, contactsManager, client, sessionState) {
  const action = await cli.showDataMenu();
  
  if (action === 'back') return;

  switch (action) {
    case 'scan':
      await cli.scanAndImportFiles();
      break;
    
    case 'view':
      await cli.viewDataFiles();
      break;
    
    case 'load':
      const contacts = await cli.loadContactsFromFile();
      if (contacts) {
        console.log(chalk.cyan('\n💡 Tip: These contacts can be used with Group Management to add to groups.'));
        console.log(chalk.gray('   Go to Group Management → Add contacts → Select from file\n'));
      }
      break;
    
    case 'import':
      await handleContactImport(cli, dataManager, client, sessionState);
      break;
    
    case 'check':
      await handleCheckTelegramAccounts(cli, dataManager, client);
      break;
    
    case 'export':
      await cli.exportContacts();
      break;
    
    case 'location':
      cli.showDataFolderLocation();
      break;
    
    case 'deleteall':
      await handleDeleteAllContacts(cli, dataManager, client, contactsManager);
      break;
  }
}

async function handleDeleteAllContacts(cli, dataManager, client, contactsManager) {
  dataManager.setClient(client);

  console.log(chalk.red('\n' + '═'.repeat(55)));
  console.log(chalk.red.bold('  ⚠️  DELETE ALL TELEGRAM CONTACTS'));
  console.log(chalk.red('═'.repeat(55) + '\n'));

  console.log(chalk.yellow('  This will permanently delete ALL contacts from your'));
  console.log(chalk.yellow('  Telegram account on ALL devices (phone, web, desktop).\n'));

  // First confirmation
  const { confirm1 } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm1',
      message: chalk.red('Are you sure you want to delete ALL contacts?'),
      default: false
    }
  ]);

  if (!confirm1) {
    console.log(chalk.green('\n✅ Cancelled. No contacts were deleted.\n'));
    return;
  }

  // Second confirmation with typing
  const { confirm2 } = await inquirer.prompt([
    {
      type: 'input',
      name: 'confirm2',
      message: chalk.red('Type "DELETE ALL" to confirm:'),
    }
  ]);

  if (confirm2 !== 'DELETE ALL') {
    console.log(chalk.green('\n✅ Cancelled. No contacts were deleted.\n'));
    return;
  }

  // Perform deletion
  const results = await dataManager.deleteAllContacts();

  // Show results
  console.log(chalk.red('\n' + '═'.repeat(55)));
  console.log(chalk.red.bold('  🗑️  DELETION RESULTS'));
  console.log(chalk.red('═'.repeat(55) + '\n'));

  console.log(chalk.white(`  📋 Total contacts found:    ${results.total}`));
  console.log(chalk.red(`  🗑️  Successfully deleted:   ${results.deleted}`));

  if (results.errors.length > 0) {
    console.log(chalk.yellow(`  ⚠️  Errors:                 ${results.errors.length}`));
    results.errors.slice(0, 3).forEach(err => {
      console.log(chalk.gray(`     • ${err}`));
    });
  }

  console.log(chalk.red('\n═'.repeat(55) + '\n'));

  // Refresh contacts list
  if (results.deleted > 0) {
    console.log(chalk.gray('Refreshing contacts list...'));
    await contactsManager.fetchContacts();
    console.log(chalk.green('✅ Contacts list updated!\n'));
  }
}

async function handleCheckTelegramAccounts(cli, dataManager, client) {
  // Set the client for dataManager
  dataManager.setClient(client);
  
  // Select file to check
  const source = await cli.selectImportSource();
  if (!source || source === 'back') return;

  let contactsToCheck = [];

  if (source === 'all') {
    contactsToCheck = dataManager.readAllContactFiles();
    console.log(chalk.cyan(`\n📂 Read contacts from all files`));
  } else {
    try {
      contactsToCheck = dataManager.readContactFile(source);
      console.log(chalk.cyan(`\n📂 Read contacts from file`));
    } catch (error) {
      console.log(chalk.red(`\n❌ Error reading file: ${error.message}`));
      return;
    }
  }

  if (contactsToCheck.length === 0) {
    console.log(chalk.yellow('\n⚠️  No contacts found in the selected source!'));
    return;
  }

  console.log(chalk.white(`\n📋 Found ${contactsToCheck.length} contacts to check\n`));

  // Confirm before checking (since it uses API calls)
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Check ${contactsToCheck.length} contacts against Telegram? (This may take a moment)`,
      default: true
    }
  ]);

  if (!confirm) {
    console.log(chalk.yellow('\n❌ Check cancelled.'));
    return;
  }

  // Perform the check
  const results = await dataManager.checkTelegramAccounts(contactsToCheck);
  
  // Show formatted results
  console.log(dataManager.formatCheckResults(results));

  // Offer to export results
  const { exportResults } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'exportResults',
      message: 'Export results to files? (telegram_users.txt & no_telegram.txt)',
      default: false
    }
  ]);

  if (exportResults) {
    const fs = await import('fs');
    const path = await import('path');
    const dataDir = dataManager.getDataDir();

    // Export users with Telegram
    if (results.hasTelegram.length > 0) {
      const telegramFile = path.join(dataDir, 'telegram_users.txt');
      const telegramContent = results.hasTelegram
        .map(c => `${c.phone}\t${c.name || c.telegramName || ''}\t${c.username ? '@' + c.username : ''}`)
        .join('\n');
      fs.writeFileSync(telegramFile, telegramContent);
      console.log(chalk.green(`\n✅ Saved ${results.hasTelegram.length} Telegram users to: telegram_users.txt`));
    }

    // Export users without Telegram
    if (results.noTelegram.length > 0) {
      const noTelegramFile = path.join(dataDir, 'no_telegram.txt');
      const noTelegramContent = results.noTelegram
        .map(c => `${c.phone}\t${c.name || ''}`)
        .join('\n');
      fs.writeFileSync(noTelegramFile, noTelegramContent);
      console.log(chalk.green(`✅ Saved ${results.noTelegram.length} non-Telegram contacts to: no_telegram.txt`));
    }

    console.log(chalk.gray(`\n📁 Files saved to: ${dataDir}\n`));
  }
}

async function handleContactImport(cli, dataManager, client, sessionState) {
  // Set the client for dataManager
  dataManager.setClient(client);
  
  // Select import source
  const source = await cli.selectImportSource();
  if (!source || source === 'back') return;

  let contactsToImport = [];

  if (source === 'all') {
    // Read all files
    const allContacts = dataManager.readAllContactFiles();
    contactsToImport = allContacts;
    console.log(chalk.cyan(`\n📂 Read contacts from all files`));
  } else {
    // Read specific file
    try {
      contactsToImport = dataManager.readContactFile(source);
      console.log(chalk.cyan(`\n📂 Read contacts from file`));
    } catch (error) {
      console.log(chalk.red(`\n❌ Error reading file: ${error.message}`));
      return;
    }
  }

  if (contactsToImport.length === 0) {
    console.log(chalk.yellow('\n⚠️  No contacts found in the selected source!'));
    return;
  }

  // Confirm import
  const importOptions = await cli.confirmImport(contactsToImport);
  if (!importOptions.confirm) {
    console.log(chalk.yellow('\n❌ Import cancelled.'));
    return;
  }

  // Perform import (with optional replace existing)
  if (importOptions.replaceExisting) {
    console.log(chalk.cyan('\n📲 Importing contacts to Telegram (replacing existing)...\n'));
  } else {
    console.log(chalk.cyan('\n📲 Importing contacts to Telegram...\n'));
  }
  const result = await dataManager.importContactsToTelegram(contactsToImport, importOptions.replaceExisting);
  
  // Show detailed results
  console.log(chalk.cyan('\n' + '═'.repeat(50)));
  console.log(chalk.cyan.bold('  📊 IMPORT RESULTS'));
  console.log(chalk.cyan('═'.repeat(50) + '\n'));
  
  console.log(chalk.white(`  📋 Total contacts in file:     ${result.total}`));
  console.log(chalk.white(`  📤 Sent to Telegram API:       ${result.sent}`));
  
  if (result.normalized > 0) {
    console.log(chalk.blue(`  🔧 Phone numbers normalized:   ${result.normalized} (+ prefix added)`));
  }
  
  console.log('');
  console.log(chalk.green(`  ✅ New contacts added:         ${result.newContacts}`));
  
  if (result.noTelegram > 0) {
    console.log(chalk.blue(`  📱 Saved (no Telegram yet):    ${result.noTelegram} (will show "Invite")`));
  }
  
  if (result.existing > 0) {
    console.log(chalk.cyan(`  🔄 Already in contacts:        ${result.existing} (updated)`));
  }
  
  if (result.skipped > 0) {
    console.log(chalk.yellow(`  ⏭️  Skipped (no phone):         ${result.skipped}`));
  }
  
  if (result.failed > 0) {
    console.log(chalk.red(`  ❌ Failed:                     ${result.failed}`));
  }
  
  // Calculate total saved
  const totalSaved = result.newContacts + (result.noTelegram || 0) + (result.existing || 0);
  console.log(chalk.green.bold(`\n  📒 Total in your contacts:     ${totalSaved}`));
  
  // Show sample of processed contacts
  if (result.sampleContacts && result.sampleContacts.length > 0) {
    console.log(chalk.gray('\n  Sample contacts processed:'));
    result.sampleContacts.forEach((phone, i) => {
      console.log(chalk.gray(`     ${i + 1}. ${phone}`));
    });
    if (result.sent > 5) {
      console.log(chalk.gray(`     ... and ${result.sent - 5} more`));
    }
  }
  
  // Show errors if any
  if (result.errors && result.errors.length > 0) {
    console.log(chalk.red('\n  Errors encountered:'));
    result.errors.slice(0, 3).forEach(err => {
      console.log(chalk.red(`     • ${err}`));
    });
    if (result.errors.length > 3) {
      console.log(chalk.red(`     ... and ${result.errors.length - 3} more errors`));
    }
  }
  
  console.log(chalk.cyan('\n' + '═'.repeat(50)));
  console.log(chalk.gray('  ✓ All contacts with phone numbers are saved to Telegram'));
  console.log(chalk.gray('  ✓ Contacts without Telegram show "Invite to Telegram"'));
  console.log(chalk.gray('  ✓ Synced to all your devices automatically'));
  console.log(chalk.cyan('═'.repeat(50) + '\n'));

  // Save imported contacts to session for "Send to newly imported" feature
  if (sessionState && contactsToImport.length > 0) {
    // Normalize and store the contacts we just imported
    sessionState.lastImportedContacts = contactsToImport.map(c => {
      let phone = c.phone?.trim() || '';
      if (phone && !phone.startsWith('+')) {
        phone = '+' + phone;
      }
      return { ...c, phone };
    }).filter(c => c.phone);
    
    sessionState.lastImportTime = new Date();
    
    console.log(chalk.green(`  💾 ${sessionState.lastImportedContacts.length} contacts saved to session`));
    console.log(chalk.cyan('  💡 Use "Send Messages → Send to newly imported" to message them!\n'));
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\n👋 Shutting down gracefully...'));
  process.exit(0);
});

// Run the application
main().catch(console.error);
