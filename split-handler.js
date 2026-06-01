const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getFilePath(month, year) {
  const paddedMonth = month.toString().padStart(2, '0');
  return path.join(DATA_DIR, `splits_${year}_${paddedMonth}.json`);
}

function getSplits(month, year) {
  const filePath = getFilePath(month, year);
  if (!fs.existsSync(filePath)) return {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error('Error reading splits file:', e);
    return {};
  }
}

function saveSplit(expenseId, splitData, month, year) {
  const filePath = getFilePath(month, year);
  const splits = getSplits(month, year);
  
  splits[expenseId] = splitData;
  
  fs.writeFileSync(filePath, JSON.stringify(splits, null, 2), 'utf8');
  return splits[expenseId];
}

function deleteSplit(expenseId, month, year) {
  const filePath = getFilePath(month, year);
  const splits = getSplits(month, year);
  
  if (splits[expenseId]) {
    delete splits[expenseId];
    fs.writeFileSync(filePath, JSON.stringify(splits, null, 2), 'utf8');
    return true;
  }
  return false;
}

function getSettlement(month, year) {
  const splits = getSplits(month, year);
  const settlement = {}; // { personName: netAmount (positive = they owe you, negative = you owe them) }
  
  for (const expId in splits) {
    const split = splits[expId];
    const { paidBy, shares, people } = split;
    
    // If Self paid
    if (paidBy === 'Self') {
      for (const person of people) {
        if (person === 'Self') continue;
        if (!settlement[person]) settlement[person] = 0;
        // They owe you their share
        settlement[person] += (shares[person] || 0);
      }
    } 
    // If someone else paid
    else {
      if (!settlement[paidBy]) settlement[paidBy] = 0;
      // You owe them your share
      settlement[paidBy] -= (shares['Self'] || 0);
      
      // Also calculate if other people owe the person who paid?
      // Actually, from "your" perspective:
      // We only care about what others owe "Self" or what "Self" owes others.
      // So Self owes the 'paidBy' person Self's share.
      // We don't track what Anil owes Atul. The app tracks relative to Self.
    }
  }
  
  return settlement;
}

module.exports = {
  getSplits,
  saveSplit,
  deleteSplit,
  getSettlement
};
