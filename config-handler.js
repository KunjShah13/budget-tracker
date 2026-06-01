const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'data', 'user-config.json');

const DEFAULTS = {
  paymentModes: {
    'Savings Acc': ['Jupiter', 'ICICI', 'Kotak', 'HDFC', 'SBI', 'Niyo'],
    'Credit Card': ['ICICI Amazon', 'HDFC Swiggy', 'ICICI Coral', 'Scapia', 'Amex', 'Corp'],
    'Prepaid':     ['Cash', 'Family', 'Amazon Wallet', 'Cred Wallet', 'Misc']
  },
  creditCardModes: ['ICICI Amazon', 'HDFC Swiggy', 'ICICI Coral', 'Scapia', 'Amex', 'Corp'],
  splitPeople: ['Self', 'Anil', 'Atul', 'Shree', 'Family', 'Others']
};

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading config, using defaults:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function writeConfig(config) {
  // Basic validation
  if (!config.paymentModes || typeof config.paymentModes !== 'object') throw new Error('Invalid paymentModes');
  if (!Array.isArray(config.creditCardModes)) throw new Error('Invalid creditCardModes');
  if (!Array.isArray(config.splitPeople)) throw new Error('Invalid splitPeople');
  if (!config.splitPeople.includes('Self')) config.splitPeople.unshift('Self');

  // Ensure data dir exists
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  return config;
}

module.exports = { readConfig, writeConfig, DEFAULTS };
