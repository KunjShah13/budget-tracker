const { v4: uuidv4 } = require('uuid');
const { db, initDb } = require('./db');

initDb();

function accountIdFor(paymentMode) {
  return String(paymentMode || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function accountNameFor(paymentMode) {
  const mode = String(paymentMode || 'Unknown').trim() || 'Unknown';
  const knownBanks = new Set(['ICICI', 'Kotak', 'Jupiter']);
  return {
    id: accountIdFor(mode),
    name: mode,
    bank: knownBanks.has(mode) ? mode : null,
    type: knownBanks.has(mode) ? 'bank' : 'payment_mode'
  };
}

const upsertAccount = db.prepare(`
  INSERT INTO accounts (id, name, bank, type)
  VALUES (@id, @name, @bank, @type)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    bank = excluded.bank,
    type = excluded.type
`);

function parseIsoDateParts(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function toIsoDate(value, fallbackYear, fallbackMonth, fallbackDay = 1) {
  if (!value && fallbackYear && fallbackMonth) {
    return `${fallbackYear}-${String(fallbackMonth).padStart(2, '0')}-${String(fallbackDay).padStart(2, '0')}`;
  }

  const iso = parseIsoDateParts(value);
  if (iso) {
    return `${iso.year}-${String(iso.month).padStart(2, '0')}-${String(iso.day).padStart(2, '0')}`;
  }

  const dm = String(value || '').match(/^(\d{1,2})\/(\d{1,2})$/);
  if (dm && fallbackYear) {
    return `${fallbackYear}-${String(Number(dm[2])).padStart(2, '0')}-${String(Number(dm[1])).padStart(2, '0')}`;
  }

  throw new Error(`Unsupported date format: ${value}`);
}

function toLegacyExpense(row) {
  const match = row.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const month = match ? match[2] : '1';
  const day = match ? match[3] : '1';
  return {
    id: row.id,
    date: `${Number(day)}/${Number(month)}`,
    description: row.description,
    amount: Number(row.amount),
    paymentMode: row.payment_mode,
    subCategory: row.sub_category,
    category: row.category,
    splitwise: row.splitwise
  };
}

function readExpenses(month, year) {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const rows = db.prepare(`
    SELECT id, date, description, amount, payment_mode, sub_category, category, splitwise
    FROM transactions
    WHERE substr(date, 1, 7) = ?
    ORDER BY date ASC, created_at ASC, id ASC
  `).all(monthKey);

  return rows.map(toLegacyExpense);
}

function getAvailableMonths() {
  const rows = db.prepare(`
    SELECT substr(date, 1, 4) AS year, substr(date, 6, 2) AS month
    FROM transactions
    GROUP BY substr(date, 1, 7)
    ORDER BY substr(date, 1, 7) DESC
  `).all();

  return rows.map(row => ({ year: Number(row.year), month: Number(row.month) }));
}

function escapeCSV(str) {
  if (str === null || str === undefined) return '';
  const stringified = String(str);
  if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
    return `"${stringified.replace(/"/g, '""')}"`;
  }
  return stringified;
}

function getCSVContent(month, year) {
  const expenses = readExpenses(month, year);
  if (!expenses.length) return null;

  const header = '\uFEFFID,Date,Description,Amount,Payment Mode,Sub-category,Category,Splitwise\n';
  const rows = expenses.map(e => [
    e.id,
    e.date,
    e.description,
    e.amount,
    e.paymentMode,
    e.subCategory,
    e.category,
    e.splitwise
  ].map(escapeCSV).join(','));

  return header + rows.join('\n') + '\n';
}

function addExpense(expenseData) {
  const { date, description, amount, paymentMode, subCategory, category, splitwise } = expenseData;
  const isoDate = toIsoDate(date);
  const numericAmount = Number(amount);
  const id = uuidv4().substring(0, 8);
  const account = accountNameFor(paymentMode);

  const insert = db.transaction(() => {
    upsertAccount.run(account);
    db.prepare(`
      INSERT INTO transactions (
        id, account_id, date, description, amount, direction, payment_mode,
        category, sub_category, splitwise, source, source_ref, raw_description
      ) VALUES (
        @id, @account_id, @date, @description, @amount, @direction, @payment_mode,
        @category, @sub_category, @splitwise, @source, @source_ref, @raw_description
      )
    `).run({
      id,
      account_id: account.id,
      date: isoDate,
      description,
      amount: numericAmount,
      direction: numericAmount < 0 ? 'credit' : 'debit',
      payment_mode: paymentMode,
      category,
      sub_category: subCategory,
      splitwise: splitwise || 'No',
      source: 'manual',
      source_ref: id,
      raw_description: description
    });
  });

  insert();

  return toLegacyExpense({
    id,
    date: isoDate,
    description,
    amount: numericAmount,
    payment_mode: paymentMode,
    sub_category: subCategory,
    category,
    splitwise: splitwise || 'No'
  });
}

function updateExpense(id, expenseData, month, year) {
  const existing = db.prepare(`
    SELECT id, date, description, amount, payment_mode, sub_category, category, splitwise, source, source_ref
    FROM transactions
    WHERE id = ?
  `).get(id);

  if (!existing) return null;

  const existingParts = parseIsoDateParts(existing.date) || { year, month, day: 1 };
  const nextDate = expenseData.date
    ? toIsoDate(expenseData.date, existingParts.year, existingParts.month, existingParts.day)
    : existing.date;
  const nextPaymentMode = expenseData.paymentMode || existing.payment_mode;
  const nextAmount = expenseData.amount !== undefined ? Number(expenseData.amount) : Number(existing.amount);
  const nextDescription = expenseData.description ?? existing.description;
  const nextSubCategory = expenseData.subCategory ?? existing.sub_category;
  const nextCategory = expenseData.category ?? existing.category;
  const nextSplitwise = expenseData.splitwise ?? existing.splitwise;
  const account = accountNameFor(nextPaymentMode);

  const update = db.transaction(() => {
    upsertAccount.run(account);
    db.prepare(`
      UPDATE transactions
      SET account_id = @account_id,
          date = @date,
          description = @description,
          amount = @amount,
          direction = @direction,
          payment_mode = @payment_mode,
          category = @category,
          sub_category = @sub_category,
          splitwise = @splitwise,
          raw_description = @raw_description,
          updated_at = datetime('now')
      WHERE id = @id
    `).run({
      id,
      account_id: account.id,
      date: nextDate,
      description: nextDescription,
      amount: nextAmount,
      direction: nextAmount < 0 ? 'credit' : 'debit',
      payment_mode: nextPaymentMode,
      category: nextCategory,
      sub_category: nextSubCategory,
      splitwise: nextSplitwise,
      raw_description: nextDescription
    });
  });

  update();

  return toLegacyExpense({
    id,
    date: nextDate,
    description: nextDescription,
    amount: nextAmount,
    payment_mode: nextPaymentMode,
    sub_category: nextSubCategory,
    category: nextCategory,
    splitwise: nextSplitwise
  });
}

function deleteExpense(id) {
  const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
  return result.changes > 0;
}

module.exports = {
  readExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  getCSVContent,
  getAvailableMonths
};
