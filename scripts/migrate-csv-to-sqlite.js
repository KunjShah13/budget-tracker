const fs = require('fs');
const path = require('path');
const { db, initDb, getDbPath } = require('../db');

const DATA_DIR = path.join(__dirname, '..', 'data');

function parseCSVLine(line) {
  const result = [];
  let currentToken = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        currentToken += '"';
        i++;
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

function readExpenseFile(filePath) {
  const basename = path.basename(filePath);
  const match = basename.match(/^expenses_(\d{4})_(\d{2})\.csv$/);
  if (!match) return [];

  const year = Number(match[1]);
  const month = Number(match[2]);
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  const rows = [];

  for (const line of lines.slice(1)) {
    const [id, date, description, amountRaw, paymentMode, subCategory, category, splitwise] = parseCSVLine(line);
    if (!id || !date) continue;

    const [dayRaw, monthRaw] = date.split('/');
    const day = Number(dayRaw);
    const rowMonth = Number(monthRaw) || month;
    const isoDate = `${year}-${String(rowMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const amount = Number(amountRaw);

    rows.push({
      id,
      account_id: accountIdFor(paymentMode),
      date: isoDate,
      description,
      amount,
      direction: amount < 0 ? 'credit' : 'debit',
      payment_mode: paymentMode,
      category,
      sub_category: subCategory,
      splitwise: splitwise || 'No',
      source: 'csv',
      source_ref: id,
      raw_description: description
    });
  }

  return rows;
}

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

initDb();

// Replace legacy dedupe index if Step 2 created it before this migration script existed.
db.exec(`
  DROP INDEX IF EXISTS idx_transactions_dedupe;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_source_ref
    ON transactions(source, source_ref);
`);

const files = fs.readdirSync(DATA_DIR)
  .filter(file => /^expenses_\d{4}_\d{2}\.csv$/.test(file))
  .sort()
  .map(file => path.join(DATA_DIR, file));

const allRows = files.flatMap(readExpenseFile);
const accounts = new Map();
for (const row of allRows) {
  if (!accounts.has(row.payment_mode)) {
    accounts.set(row.payment_mode, accountNameFor(row.payment_mode));
  }
}

const upsertAccount = db.prepare(`
  INSERT INTO accounts (id, name, bank, type)
  VALUES (@id, @name, @bank, @type)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    bank = excluded.bank,
    type = excluded.type
`);

const upsertTransaction = db.prepare(`
  INSERT INTO transactions (
    id, account_id, date, description, amount, direction, payment_mode,
    category, sub_category, splitwise, source, source_ref, raw_description
  ) VALUES (
    @id, @account_id, @date, @description, @amount, @direction, @payment_mode,
    @category, @sub_category, @splitwise, @source, @source_ref, @raw_description
  )
  ON CONFLICT(id) DO UPDATE SET
    account_id = excluded.account_id,
    date = excluded.date,
    description = excluded.description,
    amount = excluded.amount,
    direction = excluded.direction,
    payment_mode = excluded.payment_mode,
    category = excluded.category,
    sub_category = excluded.sub_category,
    splitwise = excluded.splitwise,
    source = excluded.source,
    source_ref = excluded.source_ref,
    raw_description = excluded.raw_description,
    updated_at = datetime('now')
`);

const migrate = db.transaction(() => {
  for (const account of accounts.values()) upsertAccount.run(account);
  for (const row of allRows) upsertTransaction.run(row);
});

migrate();

const dbCount = db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE source = 'csv'").get().count;
const byYearMonth = db.prepare(`
  SELECT substr(date, 1, 7) AS month, COUNT(*) AS rows
  FROM transactions
  WHERE source = 'csv'
  GROUP BY substr(date, 1, 7)
  ORDER BY month
`).all();

console.log(`DB: ${getDbPath()}`);
console.log(`CSV files: ${files.length}`);
console.log(`CSV rows found: ${allRows.length}`);
console.log(`SQLite csv rows: ${dbCount}`);
console.log('Rows by month:');
for (const row of byYearMonth) {
  console.log(`  ${row.month}: ${row.rows}`);
}

if (dbCount !== allRows.length) {
  console.error(`Row count mismatch: csv=${allRows.length}, sqlite=${dbCount}`);
  process.exit(1);
}
