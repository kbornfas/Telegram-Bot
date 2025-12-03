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
}

export default MessageSender;
