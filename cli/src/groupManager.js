import { Api } from 'telegram/tl/index.js';
import chalk from 'chalk';
import cliProgress from 'cli-progress';

class GroupManager {
  constructor(client) {
    this.client = client;
    this.groups = [];
  }

  async fetchGroups() {
    try {
      const dialogs = await this.client.getDialogs({});
      
      this.groups = dialogs
        .filter(dialog => {
          // Filter for groups and supergroups (not channels, not private chats)
          const entity = dialog.entity;
          return entity.className === 'Chat' || 
                 (entity.className === 'Channel' && entity.megagroup);
        })
        .map(dialog => {
          const entity = dialog.entity;
          const isChannel = entity.className === 'Channel';
          const isMegagroup = entity.megagroup || false;
          
          return {
            id: entity.id.toString(),
            title: entity.title || 'Unknown Group',
            accessHash: entity.accessHash?.toString() || '0',
            participantsCount: entity.participantsCount || 0,
            isChannel: isChannel,
            isMegagroup: isMegagroup,
            // A group is a supergroup if it's a Channel with megagroup=true
            isSupergroup: isChannel && isMegagroup,
            // Regular chat (basic group)
            isBasicGroup: entity.className === 'Chat',
            entity: entity
          };
        });

      return this.groups;
    } catch (error) {
      console.error('Error fetching groups:', error.message);
      throw error;
    }
  }

  getGroups() {
    return this.groups;
  }

  getGroupChoices() {
    return this.groups.map(g => ({
      name: `${g.title} (${g.participantsCount || '?'} members) ${g.isSupergroup ? '[Supergroup]' : '[Basic]'}`,
      value: g.id,
      short: g.title
    }));
  }

  findGroupById(id) {
    return this.groups.find(g => g.id === id);
  }

  async addContactToGroup(contact, group) {
    try {
      // Use the stored entity directly - this is more reliable
      const groupEntity = group.entity;
      
      // Get the user entity
      const userEntity = await this.client.getEntity(BigInt(contact.id));
      
      if (group.isSupergroup || group.isChannel) {
        // For supergroups/megagroups - use channels.InviteToChannel with entity
        await this.client.invoke(
          new Api.channels.InviteToChannel({
            channel: groupEntity,
            users: [userEntity]
          })
        );
      } else {
        // For basic/regular groups - use messages.AddChatUser
        await this.client.invoke(
          new Api.messages.AddChatUser({
            chatId: groupEntity.id,
            userId: userEntity,
            fwdLimit: 100
          })
        );
      }

      return { success: true, contact, group };
    } catch (error) {
      return { 
        success: false, 
        contact, 
        group,
        error: this.parseError(error)
      };
    }
  }

  parseError(error) {
    const errorMap = {
      'USER_ALREADY_PARTICIPANT': 'Already in group',
      'USER_PRIVACY_RESTRICTED': 'Privacy settings prevent adding',
      'USER_NOT_MUTUAL_CONTACT': 'Not a mutual contact',
      'CHAT_ADMIN_REQUIRED': 'Admin rights required',
      'PEER_FLOOD': 'Too many requests, try later',
      'USER_CHANNELS_TOO_MUCH': 'User is in too many groups',
      'USERS_TOO_MUCH': 'Group is full',
      'USER_KICKED': 'User was kicked from group',
      'CHAT_WRITE_FORBIDDEN': 'Cannot write to this chat',
      'USER_BANNED_IN_CHANNEL': 'User is banned',
      'CHAT_ID_INVALID': 'Invalid chat ID',
      'CHANNEL_INVALID': 'Invalid channel',
      'CHANNEL_PRIVATE': 'Channel is private',
      'USER_ID_INVALID': 'Invalid user ID'
    };

    for (const [key, message] of Object.entries(errorMap)) {
      if (error.message?.includes(key)) {
        return message;
      }
    }
    
    return error.message || 'Unknown error';
  }

  async addMultipleContactsToGroup(contacts, group, delay = 2000) {
    const results = {
      successful: [],
      failed: [],
      skipped: []
    };

    const progressBar = new cliProgress.SingleBar({
      format: 'Adding |' + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total} | {contact}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(contacts.length, 0, { contact: 'Starting...' });

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      progressBar.update(i, { contact: contact.displayName.substring(0, 25) });

      const result = await this.addContactToGroup(contact, group);
      
      if (result.success) {
        results.successful.push(result.contact);
      } else if (result.error === 'Already in group') {
        results.skipped.push({ contact: result.contact, reason: result.error });
      } else {
        results.failed.push({ contact: result.contact, error: result.error });
      }

      progressBar.update(i + 1, { contact: contact.displayName.substring(0, 25) });

      // Add delay between adds to avoid rate limiting
      if (i < contacts.length - 1) {
        await this.sleep(delay);
      }
    }

    progressBar.stop();
    return results;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  formatResults(results) {
    let output = '\n' + chalk.bold('📊 Add to Group Results:\n');
    output += chalk.green(`✅ Added: ${results.successful.length}\n`);
    output += chalk.yellow(`⏭️  Skipped (already in group): ${results.skipped.length}\n`);
    output += chalk.red(`❌ Failed: ${results.failed.length}\n`);

    if (results.failed.length > 0) {
      output += '\n' + chalk.red('Failed contacts:\n');
      results.failed.forEach(({ contact, error }) => {
        output += chalk.red(`  • ${contact.displayName}: ${error}\n`);
      });
    }

    return output;
  }
}

export default GroupManager;
