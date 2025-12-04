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

  async addMultipleContactsToGroup(contacts, group, delay = 15000) {
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

  // ==================== CONVERT TO SUPERGROUP ====================

  getBasicGroups() {
    return this.groups.filter(g => g.isBasicGroup);
  }

  getBasicGroupChoices() {
    const basicGroups = this.getBasicGroups();
    return basicGroups.map(g => ({
      name: `${g.title} (${g.participantsCount || '?'} members)`,
      value: g.id,
      short: g.title
    }));
  }

  async convertToSupergroup(group) {
    try {
      if (!group.isBasicGroup) {
        return {
          success: false,
          group,
          error: 'Already a supergroup'
        };
      }

      // Use messages.MigrateChat to convert basic group to supergroup
      const result = await this.client.invoke(
        new Api.messages.MigrateChat({
          chatId: group.entity.id
        })
      );

      // The result contains the new channel/supergroup
      const newChannel = result.chats?.find(c => c.className === 'Channel');
      
      return {
        success: true,
        group,
        newGroup: newChannel ? {
          id: newChannel.id.toString(),
          title: newChannel.title,
          isSupergroup: true
        } : null
      };
    } catch (error) {
      return {
        success: false,
        group,
        error: this.parseConversionError(error)
      };
    }
  }

  parseConversionError(error) {
    const errorMap = {
      'CHAT_ADMIN_REQUIRED': 'You must be an admin to convert this group',
      'CHAT_NOT_MODIFIED': 'Group cannot be modified',
      'PEER_ID_INVALID': 'Invalid group',
      'CHAT_ID_INVALID': 'Invalid chat ID',
      'PARTICIPANTS_TOO_FEW': 'Group needs more members to convert'
    };

    for (const [key, message] of Object.entries(errorMap)) {
      if (error.message?.includes(key)) {
        return message;
      }
    }
    
    return error.message || 'Unknown error';
  }

  async convertMultipleToSupergroup(groups) {
    const results = {
      successful: [],
      failed: [],
      alreadySupergroup: []
    };

    const progressBar = new cliProgress.SingleBar({
      format: 'Converting |' + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total} | {group}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(groups.length, 0, { group: 'Starting...' });

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      progressBar.update(i, { group: group.title.substring(0, 25) });

      const result = await this.convertToSupergroup(group);
      
      if (result.success) {
        results.successful.push({ group: result.group, newGroup: result.newGroup });
      } else if (result.error === 'Already a supergroup') {
        results.alreadySupergroup.push(result.group);
      } else {
        results.failed.push({ group: result.group, error: result.error });
      }

      progressBar.update(i + 1, { group: group.title.substring(0, 25) });

      // Add delay between conversions
      if (i < groups.length - 1) {
        await this.sleep(2000);
      }
    }

    progressBar.stop();
    return results;
  }

  formatConversionResults(results) {
    let output = '\n' + chalk.cyan('═'.repeat(50)) + '\n';
    output += chalk.cyan.bold('  📊 CONVERSION RESULTS\n');
    output += chalk.cyan('═'.repeat(50)) + '\n\n';
    
    output += chalk.green(`  ✅ Converted to Supergroup: ${results.successful.length}\n`);
    
    if (results.successful.length > 0) {
      results.successful.forEach(({ group, newGroup }) => {
        output += chalk.gray(`     • ${group.title}`);
        if (newGroup) {
          output += chalk.green(` → Supergroup`);
        }
        output += '\n';
      });
    }
    
    if (results.alreadySupergroup.length > 0) {
      output += chalk.yellow(`\n  ⏭️  Already Supergroup: ${results.alreadySupergroup.length}\n`);
      results.alreadySupergroup.forEach(group => {
        output += chalk.gray(`     • ${group.title}\n`);
      });
    }
    
    if (results.failed.length > 0) {
      output += chalk.red(`\n  ❌ Failed: ${results.failed.length}\n`);
      results.failed.forEach(({ group, error }) => {
        output += chalk.red(`     • ${group.title}: ${error}\n`);
      });
    }
    
    output += '\n' + chalk.cyan('═'.repeat(50)) + '\n';
    output += chalk.gray('  Note: Conversion is permanent and cannot be reversed.\n');
    output += chalk.cyan('═'.repeat(50)) + '\n';
    
    return output;
  }
}

export default GroupManager;