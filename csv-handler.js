const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getFilePath(month, year) {
  const paddedMonth = month.toString().padStart(2, '0');
  return path.join(DATA_DIR, `expenses_${year}_${paddedMonth}.csv`);
}

function escapeCSV(str) {
  if (str === null || str === undefined) return '';
  const stringified = String(str);
  if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
    return `"${stringified.replace(/"/g, '""')}"`;
  }
  return stringified;
}

function parseCSVLine(line) {
  const result = [];
  let currentToken = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        currentToken += '"';
        i++; // Skip the escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(currentToken);
      currentToken = '';
    } else {
      currentToken += char;
    }
  }
  result.push(currentToken);
  return result;
}

function initFile(filePath) {
  if (!fs.existsSync(filePath)) {
    // UTF-8 BOM
    fs.writeFileSync(filePath, '\uFEFFID,Date,Description,Amount,Payment Mode,Sub-category,Category,Splitwise\n', 'utf8');
  }
}

function readExpenses(month, year) {
  const filePath = getFilePath(month, year);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  
  // Skip header (handle BOM if present in first line)
  const dataLines = lines.slice(1);
  
  return dataLines.map(line => {
    const [id, date, description, amount, paymentMode, subCategory, category, splitwise] = parseCSVLine(line);
    return { id, date, description, amount: parseFloat(amount), paymentMode, subCategory, category, splitwise };
  });
}

function addExpense(expenseData) {
  const { date, description, amount, paymentMode, subCategory, category, splitwise } = expenseData;
  const parsedDate = new Date(date);
  const month = parsedDate.getMonth() + 1;
  const year = parsedDate.getFullYear();
  
  const filePath = getFilePath(month, year);
  initFile(filePath);
  
  const id = uuidv4().substring(0, 8);
  const formattedDate = `${parsedDate.getDate()}/${month}`;
  
  const csvRow = [
    id,
    formattedDate,
    description,
    amount,
    paymentMode,
    subCategory,
    category,
    splitwise
  ].map(escapeCSV).join(',') + '\n';
  
  fs.appendFileSync(filePath, csvRow, 'utf8');
  
  return { id, date: formattedDate, description, amount: parseFloat(amount), paymentMode, subCategory, category, splitwise };
}

function updateExpense(id, expenseData, month, year) {
  const filePath = getFilePath(month, year);
  if (!fs.existsSync(filePath)) return null;

  const expenses = readExpenses(month, year);
  const index = expenses.findIndex(e => e.id === id);
  if (index === -1) return null;

  // For update, the incoming date might be YYYY-MM-DD. 
  // If it's already D/M, keep it or convert it if it's YYYY-MM-DD
  let formattedDate = expenseData.date;
  if (expenseData.date && expenseData.date.includes('-')) {
    const parsedDate = new Date(expenseData.date);
    formattedDate = `${parsedDate.getDate()}/${parsedDate.getMonth() + 1}`;
  } else if (!formattedDate) {
    formattedDate = expenses[index].date; // fallback
  }

  expenses[index] = {
    id,
    date: formattedDate,
    description: expenseData.description,
    amount: parseFloat(expenseData.amount),
    paymentMode: expenseData.paymentMode,
    subCategory: expenseData.subCategory,
    category: expenseData.category,
    splitwise: expenseData.splitwise
  };

  writeAllExpenses(filePath, expenses);
  return expenses[index];
}

function deleteExpense(id, month, year) {
  const filePath = getFilePath(month, year);
  if (!fs.existsSync(filePath)) return false;

  const expenses = readExpenses(month, year);
  const filtered = expenses.filter(e => e.id !== id);
  
  if (filtered.length === expenses.length) return false;
  
  writeAllExpenses(filePath, filtered);
  return true;
}

function writeAllExpenses(filePath, expenses) {
  const header = '\uFEFFID,Date,Description,Amount,Payment Mode,Sub-category,Category,Splitwise\n';
  const rows = expenses.map(e => 
    [e.id, e.date, e.description, e.amount, e.paymentMode, e.subCategory, e.category, e.splitwise]
    .map(escapeCSV).join(',')
  ).join('\n');
  fs.writeFileSync(filePath, header + (rows ? rows + '\n' : ''), 'utf8');
}

function getCSVContent(month, year) {
  const filePath = getFilePath(month, year);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  return null;
}

function getAvailableMonths() {
  if (!fs.existsSync(DATA_DIR)) return [];
  const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('expenses_') && f.endsWith('.csv'));
  
  const months = files.map(f => {
    const match = f.match(/expenses_(\d{4})_(\d{2})\.csv/);
    if (match) {
      return { year: parseInt(match[1]), month: parseInt(match[2]) };
    }
    return null;
  }).filter(Boolean);
  
  // Sort newest first
  months.sort((a, b) => b.year - a.year || b.month - a.month);
  
  // Deduplicate
  const unique = [];
  const seen = new Set();
  for (const m of months) {
    const key = `${m.year}-${m.month}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(m);
    }
  }
  return unique;
}

module.exports = {
  readExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  getCSVContent,
  getAvailableMonths
};
