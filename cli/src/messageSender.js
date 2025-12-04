import { Api } from 'telegram/tl/index.js';
import cliProgress from 'cli-progress';
import chalk from 'chalk';

class MessageSender {
  constructor(client) {
    this.client = client;
    this.delay = 2000; // Default delay between messages (2 seconds)
    this.batchDelay = 5000; // Delay between batches (5 seconds)
  }

  setDelay(delayMs) {
    this.delay = delayMs;
  }

  setBatchDelay(delayMs) {
    this.batchDelay = delayMs;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async sendMessage(contact, message) {
    try {
      const peer = new Api.InputPeerUser({
        userId: BigInt(contact.id),
        accessHash: BigInt(contact.accessHash)
      });

      await this.client.invoke(
        new Api.messages.SendMessage({
          peer: peer,
          message: message,
          randomId: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))
        })
      );

      return { success: true, contact };
    } catch (error) {
      return { 
        success: false, 
        contact, 
        error: error.message 
      };
    }
  }

  // Send message by phone number or username (for file-based contacts)
  async sendMessageByIdentifier(identifier, message) {
    try {
      // Normalize phone number to ensure it starts with +
      let target = identifier.trim();
      if (/^\d+$/.test(target)) {
        target = '+' + target;
      }

      // Get entity by phone or username
      const entity = await this.client.getEntity(target);
      
      // Send the message
      await this.client.sendMessage(entity, { message: message });

      return { 
        success: true, 
        identifier,
        userId: entity.id?.toString(),
        username: entity.username || null
      };
    } catch (error) {
      return { 
        success: false, 
        identifier, 
        error: this.parseError(error)
      };
    }
  }

  parseError(error) {
    const errorMap = {
      'PEER_ID_INVALID': 'User not found on Telegram',
      'USER_NOT_FOUND': 'User not found',
      'PHONE_NOT_OCCUPIED': 'Phone number not registered on Telegram',
      'USERNAME_NOT_OCCUPIED': 'Username not found',
      'USER_PRIVACY_RESTRICTED': 'Privacy settings prevent messaging',
      'PEER_FLOOD': 'Rate limited, try again later',
      'USER_BANNED_IN_CHANNEL': 'User blocked you',
      'USER_IS_BLOCKED': 'You blocked this user',
      'YOU_BLOCKED_USER': 'You blocked this user'
    };

    for (const [key, msg] of Object.entries(errorMap)) {
      if (error.message?.includes(key)) {
        return msg;
      }
    }
    
    return error.message || 'Unknown error';
  }

  async sendToFileContacts(contacts, message, onProgress = null) {
    const results = {
      successful: [],
      failed: [],
      notOnTelegram: []
    };

    const progressBar = new cliProgress.SingleBar({
      format: 'Sending |' + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total} | {contact}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(contacts.length, 0, { contact: 'Starting...' });

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const identifier = contact.phone || (contact.username ? `@${contact.username}` : null);
      
      if (!identifier) {
        results.failed.push({ identifier: 'Unknown', error: 'No phone or username' });
        progressBar.update(i + 1, { contact: 'Invalid contact' });
        continue;
      }

      progressBar.update(i, { contact: identifier.substring(0, 20) });

      const result = await this.sendMessageByIdentifier(identifier, message);
      
      if (result.success) {
        results.successful.push(result);
      } else if (result.error.includes('not found') || result.error.includes('not registered')) {
        results.notOnTelegram.push({ identifier, error: result.error });
      } else {
        results.failed.push({ identifier, error: result.error });
      }

      progressBar.update(i + 1, { contact: identifier.substring(0, 20) });

      if (onProgress) {
        onProgress(i + 1, contacts.length, result);
      }

      // Add delay between messages to avoid rate limiting
      if (i < contacts.length - 1) {
        await this.sleep(this.delay);
      }
    }

    progressBar.stop();
    return results;
  }

  formatFileResults(results) {
    let output = '\n' + chalk.cyan('═'.repeat(50)) + '\n';
    output += chalk.cyan.bold('  📊 MESSAGE SENDING RESULTS\n');
    output += chalk.cyan('═'.repeat(50)) + '\n\n';
    
    const total = results.successful.length + results.failed.length + results.notOnTelegram.length;
    output += chalk.white(`  📋 Total processed:           ${total}\n`);
    output += chalk.green(`  ✅ Successfully sent:         ${results.successful.length}\n`);
    
    if (results.notOnTelegram.length > 0) {
      output += chalk.yellow(`  📵 Not on Telegram:           ${results.notOnTelegram.length}\n`);
    }
    
    if (results.failed.length > 0) {
      output += chalk.red(`  ❌ Failed:                    ${results.failed.length}\n`);
    }

    // Show sample of successful
    if (results.successful.length > 0) {
      output += chalk.green('\n  Sent to:\n');
      results.successful.slice(0, 5).forEach(r => {
        output += chalk.gray(`     ✓ ${r.identifier}\n`);
      });
      if (results.successful.length > 5) {
        output += chalk.gray(`     ... and ${results.successful.length - 5} more\n`);
      }
    }

    // Show not on Telegram - these need to be contacted via SMS/other
    if (results.notOnTelegram.length > 0) {
      output += chalk.yellow('\n  📵 Not on Telegram (contact via SMS/WhatsApp):\n');
      results.notOnTelegram.slice(0, 10).forEach(r => {
        output += chalk.yellow(`     • ${r.identifier}\n`);
      });
      if (results.notOnTelegram.length > 10) {
        output += chalk.yellow(`     ... and ${results.notOnTelegram.length - 10} more\n`);
      }
      output += chalk.gray(`\n  💡 Tip: These contacts don't have Telegram accounts yet.\n`);
      output += chalk.gray(`     Reach them via SMS, WhatsApp, or invite them to Telegram!\n`);
    }

    // Show failed
    if (results.failed.length > 0) {
      output += chalk.red('\n  Failed:\n');
      results.failed.slice(0, 5).forEach(r => {
        output += chalk.red(`     • ${r.identifier}: ${r.error}\n`);
      });
      if (results.failed.length > 5) {
        output += chalk.red(`     ... and ${results.failed.length - 5} more\n`);
      }
    }

    output += '\n' + chalk.cyan('═'.repeat(50)) + '\n';
    return output;
  }

  async sendToMultiple(contacts, message, onProgress = null) {
    const results = {
      successful: [],
      failed: []
    };

    const progressBar = new cliProgress.SingleBar({
      format: 'Sending |' + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total} | {contact}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(contacts.length, 0, { contact: 'Starting...' });

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      progressBar.update(i, { contact: contact.displayName.substring(0, 30) });

      const result = await this.sendMessage(contact, message);
      
      if (result.success) {
        results.successful.push(result.contact);
      } else {
        results.failed.push({ contact: result.contact, error: result.error });
      }

      progressBar.update(i + 1, { contact: contact.displayName.substring(0, 30) });

      if (onProgress) {
        onProgress(i + 1, contacts.length, result);
      }

      // Add delay between messages to avoid rate limiting
      if (i < contacts.length - 1) {
        await this.sleep(this.delay);
      }
    }

    progressBar.stop();
    return results;
  }

  async sendInBatches(contacts, message, batchSize, onBatchComplete = null) {
    const results = {
      successful: [],
      failed: [],
      batches: []
    };

    const totalBatches = Math.ceil(contacts.length / batchSize);
    console.log(chalk.blue(`\n📦 Sending in ${totalBatches} batches of ${batchSize} contacts each\n`));

    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const start = batchNum * batchSize;
      const end = Math.min(start + batchSize, contacts.length);
      const batchContacts = contacts.slice(start, end);

      console.log(chalk.yellow(`\n📤 Batch ${batchNum + 1}/${totalBatches} (${batchContacts.length} contacts)`));

      const batchResults = await this.sendToMultiple(batchContacts, message);
      
      results.successful.push(...batchResults.successful);
      results.failed.push(...batchResults.failed);
      results.batches.push({
        batchNumber: batchNum + 1,
        successful: batchResults.successful.length,
        failed: batchResults.failed.length
      });

      if (onBatchComplete) {
        onBatchComplete(batchNum + 1, totalBatches, batchResults);
      }

      // Add delay between batches
      if (batchNum < totalBatches - 1) {
        console.log(chalk.gray(`⏳ Waiting ${this.batchDelay / 1000}s before next batch...`));
        await this.sleep(this.batchDelay);
      }
    }

    return results;
  }

  formatResults(results) {
    let output = '\n' + chalk.bold('📊 Sending Results:\n');
    output += chalk.green(`✅ Successful: ${results.successful.length}\n`);
    output += chalk.red(`❌ Failed: ${results.failed.length}\n`);

    if (results.failed.length > 0) {
      output += '\n' + chalk.red('Failed contacts:\n');
      results.failed.forEach(({ contact, error }) => {
        output += chalk.red(`  • ${contact.displayName}: ${error}\n`);
      });
    }

    if (results.batches && results.batches.length > 0) {
      output += '\n' + chalk.blue('Batch Summary:\n');
      results.batches.forEach(batch => {
        output += chalk.blue(`  Batch ${batch.batchNumber}: ✅ ${batch.successful} | ❌ ${batch.failed}\n`);
      });
    }

    return output;
  }

  // ==================== RELIABLE SEND TO ALL CONTACTS ====================

  async sendToAllReliably(contacts, message, maxRetries = 3) {
    const results = {
      successful: [],
      failed: [],
      retried: [],
      rateLimited: 0,
      totalAttempts: 0
    };

    let toSend = [...contacts];
    let attempt = 1;
    let baseDelay = this.delay;

    console.log(chalk.cyan(`\n📤 Starting reliable send to ${contacts.length} contacts...\n`));
    console.log(chalk.gray(`   Max retries: ${maxRetries} | Initial delay: ${baseDelay/1000}s between messages\n`));

    while (toSend.length > 0 && attempt <= maxRetries) {
      if (attempt > 1) {
        console.log(chalk.yellow(`\n🔄 Retry attempt ${attempt}/${maxRetries} for ${toSend.length} remaining contacts...\n`));
        // Increase delay on retries to avoid rate limiting
        baseDelay = Math.min(baseDelay * 1.5, 30000);
        console.log(chalk.gray(`   Delay increased to ${baseDelay/1000}s between messages\n`));
      }

      const progressBar = new cliProgress.SingleBar({
        format: `Attempt ${attempt} |` + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total} | {status}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
      });

      progressBar.start(toSend.length, 0, { status: 'Starting...' });

      const stillFailed = [];

      for (let i = 0; i < toSend.length; i++) {
        const contact = toSend[i];
        const displayName = contact.displayName || contact.phone || `Contact ${contact.id}`;
        progressBar.update(i, { status: displayName.substring(0, 25) });

        results.totalAttempts++;

        const result = await this.sendMessageReliable(contact, message);

        if (result.success) {
          results.successful.push({ ...result, attempts: attempt });
          if (attempt > 1) {
            results.retried.push(contact);
          }
        } else if (result.rateLimited) {
          // Rate limited - wait longer and add back to queue
          results.rateLimited++;
          stillFailed.push(contact);
          progressBar.update(i, { status: '⏳ Rate limited - waiting...' });
          
          // Wait for the flood wait time plus buffer
          const waitTime = (result.floodWait || 60) * 1000 + 5000;
          console.log(chalk.yellow(`\n   ⏳ Rate limited! Waiting ${Math.ceil(waitTime/1000)}s...`));
          await this.sleep(waitTime);
        } else if (result.retryable) {
          // Temporary error - add back to retry queue
          stillFailed.push(contact);
        } else {
          // Permanent failure
          results.failed.push({ contact, error: result.error, attempts: attempt });
        }

        progressBar.update(i + 1, { status: displayName.substring(0, 25) });

        // Delay between messages
        if (i < toSend.length - 1) {
          await this.sleep(baseDelay);
        }
      }

      progressBar.stop();

      // Update toSend with failed contacts for retry
      toSend = stillFailed;
      attempt++;

      // If we still have contacts to retry, wait before next attempt
      if (toSend.length > 0 && attempt <= maxRetries) {
        const cooldown = 30000; // 30 second cooldown between attempts
        console.log(chalk.gray(`\n   ⏳ Cooling down for ${cooldown/1000}s before retry...\n`));
        await this.sleep(cooldown);
      }
    }

    // Any remaining contacts are permanent failures
    for (const contact of toSend) {
      results.failed.push({ contact, error: 'Max retries exceeded', attempts: maxRetries });
    }

    return results;
  }

  async sendMessageReliable(contact, message) {
    try {
      // Try to get entity and send
      let entity;
      
      if (contact.id && contact.accessHash) {
        // Use existing contact info
        entity = new Api.InputPeerUser({
          userId: BigInt(contact.id),
          accessHash: BigInt(contact.accessHash)
        });
      } else if (contact.phone) {
        // Resolve by phone
        let phone = contact.phone.trim();
        if (!phone.startsWith('+')) phone = '+' + phone;
        entity = await this.client.getEntity(phone);
      } else if (contact.username) {
        // Resolve by username
        entity = await this.client.getEntity(contact.username);
      } else {
        return { success: false, error: 'No valid identifier', retryable: false };
      }

      await this.client.sendMessage(entity, { message: message });

      return { 
        success: true, 
        contact,
        displayName: contact.displayName || contact.phone || contact.username
      };

    } catch (error) {
      const errorMsg = error.message || '';
      
      // Check for rate limiting
      if (errorMsg.includes('FLOOD_WAIT') || errorMsg.includes('PEER_FLOOD')) {
        const match = errorMsg.match(/FLOOD_WAIT_(\d+)/);
        const floodWait = match ? parseInt(match[1]) : 60;
        return { 
          success: false, 
          error: 'Rate limited', 
          rateLimited: true, 
          floodWait,
          retryable: true 
        };
      }

      // Retryable errors
      const retryableErrors = [
        'TIMEOUT', 'NETWORK', 'CONNECTION', 'ECONNRESET', 
        'ETIMEDOUT', 'ENOTFOUND', 'MSG_WAIT_FAILED'
      ];
      
      const isRetryable = retryableErrors.some(e => errorMsg.includes(e));
      
      // Permanent errors (don't retry these)
      const permanentErrors = [
        'USER_PRIVACY_RESTRICTED', 'USER_NOT_FOUND', 'PEER_ID_INVALID',
        'USER_BANNED_IN_CHANNEL', 'USER_IS_BLOCKED', 'INPUT_USER_DEACTIVATED',
        'CHAT_WRITE_FORBIDDEN', 'USER_DEACTIVATED'
      ];
      
      const isPermanent = permanentErrors.some(e => errorMsg.includes(e));

      return { 
        success: false, 
        error: this.parseError(error),
        retryable: isRetryable && !isPermanent,
        rateLimited: false
      };
    }
  }

  formatReliableResults(results) {
    let output = '\n' + chalk.cyan('═'.repeat(55)) + '\n';
    output += chalk.cyan.bold('  📊 RELIABLE SEND RESULTS\n');
    output += chalk.cyan('═'.repeat(55)) + '\n\n';
    
    const total = results.successful.length + results.failed.length;
    const successRate = total > 0 ? ((results.successful.length / total) * 100).toFixed(1) : 0;
    
    output += chalk.white(`  📋 Total contacts:          ${total}\n`);
    output += chalk.white(`  🔄 Total send attempts:     ${results.totalAttempts}\n`);
    output += chalk.green(`  ✅ Successfully sent:       ${results.successful.length} (${successRate}%)\n`);
    
    if (results.retried.length > 0) {
      output += chalk.blue(`  🔁 Succeeded on retry:      ${results.retried.length}\n`);
    }
    
    if (results.rateLimited > 0) {
      output += chalk.yellow(`  ⏳ Rate limit hits:         ${results.rateLimited}\n`);
    }
    
    if (results.failed.length > 0) {
      output += chalk.red(`  ❌ Failed (permanent):      ${results.failed.length}\n`);
    }

    // Success breakdown
    if (results.successful.length > 0) {
      output += chalk.green('\n  ✅ Successfully sent to:\n');
      const firstAttempt = results.successful.filter(r => r.attempts === 1).length;
      const retrySuccesses = results.successful.filter(r => r.attempts > 1).length;
      output += chalk.gray(`     • First attempt: ${firstAttempt}\n`);
      if (retrySuccesses > 0) {
        output += chalk.gray(`     • After retry: ${retrySuccesses}\n`);
      }
    }

    // Failed breakdown
    if (results.failed.length > 0) {
      output += chalk.red('\n  ❌ Failed contacts:\n');
      
      // Group by error type
      const errorGroups = {};
      const notOnTelegram = [];
      
      results.failed.forEach(({ contact, error }) => {
        // Check if the error indicates no Telegram account
        if (error.includes('not found') || error.includes('not registered') || 
            error.includes('USER_NOT_FOUND') || error.includes('PEER_ID_INVALID')) {
          notOnTelegram.push(contact);
        } else {
          if (!errorGroups[error]) errorGroups[error] = [];
          errorGroups[error].push(contact);
        }
      });
      
      // Show not on Telegram separately
      if (notOnTelegram.length > 0) {
        output += chalk.yellow(`     📵 Not on Telegram: ${notOnTelegram.length} contact(s)\n`);
        output += chalk.gray(`        (Reach via SMS/WhatsApp instead)\n`);
      }
      
      for (const [error, contacts] of Object.entries(errorGroups)) {
        output += chalk.red(`     • ${error}: ${contacts.length} contact(s)\n`);
      }
    }

    output += '\n' + chalk.cyan('═'.repeat(55)) + '\n';
    
    if (results.successful.length === total) {
      output += chalk.green.bold('  🎉 ALL MESSAGES SENT SUCCESSFULLY!\n');
    } else if (results.failed.length > 0) {
      const notOnTelegramCount = results.failed.filter(f => 
        f.error.includes('not found') || f.error.includes('USER_NOT_FOUND') || f.error.includes('PEER_ID_INVALID')
      ).length;
      
      if (notOnTelegramCount > 0) {
        output += chalk.yellow(`  📵 ${notOnTelegramCount} contacts don't have Telegram\n`);
        output += chalk.gray('     (Contact them via SMS, WhatsApp, or invite to Telegram)\n');
      }
      
      const otherFailed = results.failed.length - notOnTelegramCount;
      if (otherFailed > 0) {
        output += chalk.red(`  ⚠️  ${otherFailed} contacts could not be reached\n`);
        output += chalk.gray('     (Privacy settings, deactivated, or blocked)\n');
      }
    }
    
    output += chalk.cyan('═'.repeat(55)) + '\n';
    
    return output;
  }

  /**
   * Force send message to all phone numbers, attempting each one
   * @param {Array} contacts - Array of contacts with phone numbers
   * @param {string} message - Message to send
   * @returns {Object} - Results with sent, noTelegram, failed arrays
   */
  async forceSendToPhones(contacts, message) {
    const results = {
      sent: [],           // Successfully sent
      noTelegram: [],     // Phone doesn't have Telegram
      failed: [],         // Other failures (blocked, etc.)
      total: contacts.length
    };

    const progressBar = new cliProgress.SingleBar({
      format: 'Sending |' + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total} | {status}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(contacts.length, 0, { status: 'Starting...' });

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const phone = contact.phone;
      
      progressBar.update(i, { status: phone.substring(0, 15) });

      try {
        // Try to get entity by phone number
        const entity = await this.client.getEntity(phone);
        
        // Send the message
        await this.client.sendMessage(entity, { message: message });
        
        results.sent.push({
          phone,
          index: contact.index,
          userId: entity.id?.toString(),
          username: entity.username || null
        });
        
      } catch (error) {
        const errorMsg = error.message || '';
        
        // Check if it's a "not on Telegram" error
        if (errorMsg.includes('Could not find') || 
            errorMsg.includes('not found') ||
            errorMsg.includes('USERNAME_NOT_OCCUPIED') ||
            errorMsg.includes('PHONE_NOT_OCCUPIED') ||
            errorMsg.includes('Cannot get entity')) {
          results.noTelegram.push({
            phone,
            index: contact.index,
            reason: 'Not on Telegram'
          });
        } else {
          results.failed.push({
            phone,
            index: contact.index,
            reason: this.parseError(error)
          });
        }
      }

      progressBar.update(i + 1, { status: phone.substring(0, 15) });

      // Delay between messages to avoid rate limiting
      if (i < contacts.length - 1) {
        await this.sleep(this.delay);
      }
    }

    progressBar.stop();
    return results;
  }

  formatForceSendResults(results) {
    let output = '\n' + chalk.cyan('═'.repeat(60)) + '\n';
    output += chalk.cyan.bold('  💪 FORCE SEND RESULTS\n');
    output += chalk.cyan('═'.repeat(60)) + '\n\n';

    const successRate = results.total > 0 
      ? ((results.sent.length / results.total) * 100).toFixed(1)
      : 0;

    output += chalk.white(`  📋 Total phone numbers:       ${results.total}\n`);
    output += chalk.green(`  ✅ Successfully sent:         ${results.sent.length} (${successRate}%)\n`);
    output += chalk.yellow(`  📵 No Telegram account:       ${results.noTelegram.length}\n`);
    
    if (results.failed.length > 0) {
      output += chalk.red(`  ❌ Failed (other reasons):    ${results.failed.length}\n`);
    }

    // Show sent
    if (results.sent.length > 0) {
      output += chalk.green('\n  ✅ Messages delivered to:\n');
      results.sent.slice(0, 10).forEach((r, i) => {
        const username = r.username ? ` (@${r.username})` : '';
        output += chalk.gray(`     ${i + 1}. ${r.phone}${username}\n`);
      });
      if (results.sent.length > 10) {
        output += chalk.gray(`     ... and ${results.sent.length - 10} more\n`);
      }
    }

    // Show no Telegram
    if (results.noTelegram.length > 0) {
      output += chalk.yellow('\n  📵 No Telegram (cannot message):\n');
      results.noTelegram.slice(0, 10).forEach((r, i) => {
        output += chalk.gray(`     ${i + 1}. ${r.phone}\n`);
      });
      if (results.noTelegram.length > 10) {
        output += chalk.gray(`     ... and ${results.noTelegram.length - 10} more\n`);
      }
    }

    // Show failed
    if (results.failed.length > 0) {
      output += chalk.red('\n  ❌ Failed:\n');
      results.failed.slice(0, 5).forEach((r, i) => {
        output += chalk.red(`     ${i + 1}. ${r.phone}: ${r.reason}\n`);
      });
      if (results.failed.length > 5) {
        output += chalk.red(`     ... and ${results.failed.length - 5} more\n`);
      }
    }

    output += '\n' + chalk.cyan('─'.repeat(60)) + '\n';
    
    if (results.sent.length === results.total) {
      output += chalk.green.bold('  🎉 ALL MESSAGES DELIVERED SUCCESSFULLY!\n');
    } else if (results.sent.length > 0) {
      output += chalk.white(`  📊 Delivery rate: ${successRate}%\n`);
      output += chalk.gray(`     ${results.sent.length} out of ${results.total} messages delivered\n`);
    } else {
      output += chalk.red('  ⚠️  No messages were delivered\n');
    }

    if (results.noTelegram.length > 0) {
      output += chalk.yellow(`\n  💡 ${results.noTelegram.length} contacts don't have Telegram.\n`);
      output += chalk.gray('     Reach them via SMS, WhatsApp, or invite to Telegram.\n');
    }

    output += chalk.cyan('═'.repeat(60)) + '\n';

    return output;
  }
}

export default MessageSender;