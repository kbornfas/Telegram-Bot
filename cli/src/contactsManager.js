import { Api } from 'telegram/tl/index.js';

class ContactsManager {
  constructor(client) {
    this.client = client;
    this.contacts = [];
  }

  async fetchContacts() {
    try {
      const result = await this.client.invoke(
        new Api.contacts.GetContacts({
          hash: BigInt(0)
        })
      );

      if (result.users) {
        this.contacts = result.users
          .filter(user => !user.bot && !user.deleted && !user.self)
          .map(user => ({
            id: user.id.toString(),
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            username: user.username || '',
            phone: user.phone || '',
            accessHash: user.accessHash?.toString() || '',
            displayName: this.formatDisplayName(user)
          }));
      }

      return this.contacts;
    } catch (error) {
      console.error('Error fetching contacts:', error.message);
      throw error;
    }
  }

  formatDisplayName(user) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    if (user.username) {
      return `${name} (@${user.username})`;
    }
    return name || user.phone || 'Unknown';
  }

  getContacts() {
    return this.contacts;
  }

  findContactById(id) {
    return this.contacts.find(c => c.id === id);
  }

  findContactsByIds(ids) {
    return this.contacts.filter(c => ids.includes(c.id));
  }

  searchContacts(query) {
    const lowerQuery = query.toLowerCase();
    return this.contacts.filter(c => 
      c.firstName.toLowerCase().includes(lowerQuery) ||
      c.lastName.toLowerCase().includes(lowerQuery) ||
      c.username.toLowerCase().includes(lowerQuery) ||
      c.phone.includes(query)
    );
  }

  getContactChoices() {
    return this.contacts.map(c => ({
      name: `${c.displayName}${c.phone ? ` [${c.phone}]` : ''}`,
      value: c.id,
      short: c.displayName
    }));
  }

  splitIntoBatches(contactIds, batchSize) {
    const batches = [];
    for (let i = 0; i < contactIds.length; i += batchSize) {
      batches.push(contactIds.slice(i, i + batchSize));
    }
    return batches;
  }
}

export default ContactsManager;
