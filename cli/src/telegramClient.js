import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import inquirer from 'inquirer';
import input from 'input';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, '..', 'session.txt');

class TelegramClientManager {
  constructor(apiId, apiHash, useNewConnection = false) {
    this.apiId = parseInt(apiId);
    this.apiHash = apiHash;
    this.client = null;
    this.useNewConnection = useNewConnection;
    this.stringSession = new StringSession(useNewConnection ? '' : this.loadSession());
  }

  static hasExistingSession() {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        const session = fs.readFileSync(SESSION_FILE, 'utf-8').trim();
        return session.length > 0;
      }
    } catch (error) {
      // Ignore errors
    }
    return false;
  }

  static clearSession() {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        fs.unlinkSync(SESSION_FILE);
        return true;
      }
    } catch (error) {
      console.error('Error clearing session:', error.message);
    }
    return false;
  }

  loadSession() {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        const session = fs.readFileSync(SESSION_FILE, 'utf-8').trim();
        if (session) {
          console.log('📁 Found existing session, attempting to reuse...');
          return session;
        }
      }
    } catch (error) {
      console.error('Error loading session:', error.message);
    }
    return '';
  }

  saveSession(session) {
    try {
      fs.writeFileSync(SESSION_FILE, session);
      console.log('💾 Session saved for future use');
    } catch (error) {
      console.error('Error saving session:', error.message);
    }
  }

  async connect() {
    console.log('🔧 Initializing Telegram client...');
    
    this.client = new TelegramClient(
      this.stringSession,
      this.apiId,
      this.apiHash,
      {
        connectionRetries: 5,
        useWSS: false,
        timeout: 30,
      }
    );

    console.log('🌐 Connecting to Telegram servers...');
    
    // First connect to Telegram
    await this.client.connect();
    
    // Check if already authorized
    const isAuthorized = await this.client.isUserAuthorized();
    
    if (!isAuthorized) {
      console.log('\n🔐 Authentication required\n');
      
      // Get phone number
      const { phone } = await inquirer.prompt([
        {
          type: 'input',
          name: 'phone',
          message: 'Enter your phone number (with country code, e.g., +1234567890):',
          validate: (val) => {
            if (/^\+\d{10,15}$/.test(val)) return true;
            return 'Please enter a valid phone number with country code (e.g., +1234567890)';
          }
        }
      ]);

      // Send code request
      console.log('📱 Sending verification code...');
      const sendCodeResult = await this.client.sendCode(
        { apiId: this.apiId, apiHash: this.apiHash },
        phone
      );

      // Get the code from user
      const { code } = await inquirer.prompt([
        {
          type: 'input',
          name: 'code',
          message: 'Enter the code you received on Telegram:',
          validate: (val) => {
            if (/^\d{5}$/.test(val)) return true;
            return 'Please enter the 5-digit code';
          }
        }
      ]);

      try {
        // Try to sign in with the code
        await this.client.invoke(
          new (await import('telegram/tl/index.js')).Api.auth.SignIn({
            phoneNumber: phone,
            phoneCodeHash: sendCodeResult.phoneCodeHash,
            phoneCode: code,
          })
        );
      } catch (err) {
        // If 2FA is enabled, ask for password
        if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
          console.log('🔒 Two-factor authentication is enabled');
          
          const { password } = await inquirer.prompt([
            {
              type: 'password',
              name: 'password',
              message: 'Enter your 2FA password:',
              mask: '*'
            }
          ]);

          await this.client.signInWithPassword(
            { apiId: this.apiId, apiHash: this.apiHash },
            {
              password: async () => password,
              onError: (err) => { throw err; }
            }
          );
        } else {
          throw err;
        }
      }
    }

    // Save session for future use
    const sessionString = this.client.session.save();
    if (sessionString) {
      this.saveSession(sessionString);
    }

    console.log('✅ Connected successfully!');
    return this.client;
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
    }
  }

  getClient() {
    return this.client;
  }

  async getMe() {
    const me = await this.client.getMe();
    return me;
  }
}

export default TelegramClientManager;
