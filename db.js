const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = process.env.BUDGET_DB_PATH || path.join(DATA_DIR, 'budget.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      bank TEXT,
      type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
      payment_mode TEXT NOT NULL,
      category TEXT NOT NULL,
      sub_category TEXT NOT NULL,
      splitwise TEXT NOT NULL DEFAULT 'No',
      source TEXT,
      source_ref TEXT,
      raw_description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS imports (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      filename TEXT NOT NULL,
      period_start TEXT,
      period_end TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      row_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_transactions_payment_mode ON transactions(payment_mode);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_source_ref
      ON transactions(source, source_ref);
  `);
}

function getDbPath() {
  return DB_PATH;
}

module.exports = {
  db,
  initDb,
  getDbPath
};
