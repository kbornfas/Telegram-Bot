#!/usr/bin/env node

import 'dotenv/config';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

import TelegramClientManager from './src/telegramClient.js';
import ContactsManager from './src/contactsManager.js';
import MessageSender from './src/messageSender.js';
import GroupManager from './src/groupManager.js';
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

    // Initialize message sender and CLI
    const messageSender = new MessageSender(telegramManager.getClient());
    const cli = new CLI(contactsManager, messageSender, groupManager);

    // Main application loop
    let running = true;
    while (running) {
      const action = await cli.showMainMenu();

      switch (action) {
        case 'compose':
          await handleCompose(cli, contactsManager, messageSender);
          break;
        
        case 'groups':
          await handleGroupManagement(cli, contactsManager, groupManager);
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

async function handleCompose(cli, contactsManager, messageSender) {
  // Select send mode
  const mode = await cli.selectSendMode();
  
  if (mode === 'back') return;

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

async function handleGroupManagement(cli, contactsManager, groupManager) {
  const action = await cli.showGroupMenu();
  
  if (action === 'back') return;

  if (action === 'view') {
    await cli.viewGroups();
    return;
  }

  if (action === 'add') {
    // Select group
    const group = await cli.selectGroup();
    if (!group) return;

    // Select contacts to add
    const contacts = await cli.selectContacts();
    if (contacts.length === 0) return;

    // Confirm
    const confirmed = await cli.confirmAddToGroup(contacts, group);
    if (!confirmed) {
      console.log(chalk.yellow('\n❌ Operation cancelled.'));
      return;
    }

    // Add contacts
    console.log(chalk.cyan('\n📤 Adding contacts to group...\n'));
    const results = await groupManager.addMultipleContactsToGroup(contacts, group);
    console.log(groupManager.formatResults(results));
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\n👋 Shutting down gracefully...'));
  process.exit(0);
});

// Run the application
main().catch(console.error);
