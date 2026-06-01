const CONFIG = {
  CATEGORIES: ['Fun', 'Future You', 'Essentials'],
  
  SUBCATEGORIES: {
    'Fun': ['Food', 'Shopping', 'Travel', 'Entertainment', 'Services'],
    'Essentials': ['Bills', 'Groceries', 'Rent', 'Health', 'Family'],
    'Future You': ['SIPs', 'Stocks', 'Bonds', 'Home']
  },
  
  // Reverse mapping: subcategory -> category
  SUBCAT_TO_CAT: {
    'Food': 'Fun', 'Shopping': 'Fun', 'Travel': 'Fun', 'Entertainment': 'Fun', 'Services': 'Fun',
    'Bills': 'Essentials', 'Groceries': 'Essentials', 'Rent': 'Essentials', 'Health': 'Essentials', 'Family': 'Essentials',
    'SIPs': 'Future You', 'Stocks': 'Future You', 'Bonds': 'Future You', 'Home': 'Future You'
  },
  
  PAYMENT_MODES: {
    'Savings Acc': ['Jupiter', 'ICICI', 'Kotak', 'HDFC', 'SBI', 'Niyo'],
    'Credit Card': ['ICICI Amazon', 'HDFC Swiggy', 'ICICI Coral', 'Scapia', 'Amex', 'Corp'],
    'Prepaid': ['Cash', 'Family', 'Amazon Wallet', 'Cred Wallet', 'Misc']
  },
  
  // Flat list of all credit card payment modes (for yellow color coding)
  CREDIT_CARD_MODES: ['ICICI Amazon', 'HDFC Swiggy', 'ICICI Coral', 'Scapia', 'Amex', 'Corp'],
  
  SPLIT_PEOPLE: ['Self', 'Anil', 'Atul', 'Shree', 'Family', 'Others'],
  
  API_BASE: '/budget/api'
};

// Fetch user-saved config from server and merge into CONFIG.
// Falls back silently to hardcoded defaults above if the request fails.
async function loadUserConfig() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/config`);
    if (res.status === 401) {
      window.location.href = '/budget/login';
      return;
    }
    if (!res.ok) return;
    const data = await res.json();

    if (data.paymentModes && typeof data.paymentModes === 'object') {
      CONFIG.PAYMENT_MODES = data.paymentModes;
    }
    if (Array.isArray(data.creditCardModes)) {
      CONFIG.CREDIT_CARD_MODES = data.creditCardModes;
    }
    if (Array.isArray(data.splitPeople)) {
      CONFIG.SPLIT_PEOPLE = data.splitPeople;
    }
  } catch (e) {
    console.warn('Using default config (failed to load user config):', e.message);
  }
}
