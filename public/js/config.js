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
