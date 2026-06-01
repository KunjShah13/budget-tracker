const { db, initDb } = require('./db');

initDb();

function parseMonthKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[Number(month) - 1]} ${year}`;
}

function getAvailableMonthKeysAsc() {
  const rows = db.prepare(`
    SELECT substr(date, 1, 7) AS month
    FROM transactions
    GROUP BY substr(date, 1, 7)
    ORDER BY month ASC
  `).all();

  const months = rows.map(row => row.month);
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (!months.includes(currentMonth)) {
    months.push(currentMonth);
    months.sort();
  }
  return months;
}

function getAvailableMonths() {
  return getAvailableMonthKeysAsc()
    .slice()
    .reverse()
    .map(monthKey => ({
      key: monthKey,
      year: Number(monthKey.slice(0, 4)),
      month: Number(monthKey.slice(5, 7)),
      label: formatMonthLabel(monthKey)
    }));
}

function getDefaultSelectedMonth(availableMonthKeys) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (availableMonthKeys.includes(currentMonth)) return currentMonth;
  return availableMonthKeys[availableMonthKeys.length - 1] || currentMonth;
}

function getDefaultCompareMonths(selectedMonth, availableMonthKeys, count = 6) {
  if (!availableMonthKeys.length) return selectedMonth ? [selectedMonth] : [];

  const selectedIndex = availableMonthKeys.indexOf(selectedMonth);
  const endIndex = selectedIndex >= 0 ? selectedIndex : availableMonthKeys.length - 1;
  const startIndex = Math.max(0, endIndex - (count - 1));
  return availableMonthKeys.slice(startIndex, endIndex + 1);
}

function normalizeCompareMonths(rawMonths, selectedMonth, availableMonthKeys) {
  const parsed = String(rawMonths || '')
    .split(',')
    .map(item => parseMonthKey(item.trim()))
    .filter(Boolean)
    .filter(month => availableMonthKeys.includes(month));

  const deduped = [...new Set(parsed)];
  if (!deduped.length) {
    return getDefaultCompareMonths(selectedMonth, availableMonthKeys);
  }

  if (!deduped.includes(selectedMonth) && availableMonthKeys.includes(selectedMonth)) {
    deduped.push(selectedMonth);
  }

  return deduped.sort();
}

function getTransactionsForMonths(monthKeys) {
  if (!monthKeys.length) return [];

  const placeholders = monthKeys.map(() => '?').join(',');
  return db.prepare(`
    SELECT id, date, description, amount, direction, payment_mode, category, sub_category, splitwise, source
    FROM transactions
    WHERE substr(date, 1, 7) IN (${placeholders})
    ORDER BY date ASC, id ASC
  `).all(...monthKeys);
}

function classifyTransaction(tx) {
  const amount = Math.abs(Number(tx.amount) || 0);
  const isTransfer = tx.category === 'Transfer';
  const isCredit = tx.direction === 'credit';
  const month = String(tx.date).slice(0, 7);

  return {
    ...tx,
    month,
    amountAbs: amount,
    isTransfer,
    isCredit,
    isDebit: !isCredit
  };
}

function emptyMonthSummary(monthKey) {
  return {
    month: monthKey,
    label: formatMonthLabel(monthKey),
    income: 0,
    expenses: 0,
    transferIn: 0,
    transferOut: 0,
    netCashflow: 0,
    expenseCount: 0,
    transactionCount: 0,
    categories: [],
    paymentModes: [],
    topOutflows: []
  };
}

function toSortedBreakdown(map) {
  return [...map.entries()]
    .map(([name, amount]) => ({ name, amount: Number(amount.toFixed(2)) }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

function summarizeMonth(monthKey, transactions, includeTransfers) {
  const summary = emptyMonthSummary(monthKey);
  const categoryTotals = new Map();
  const paymentModeTotals = new Map();

  const topOutflows = [];

  for (const tx of transactions) {
    summary.transactionCount += 1;

    if (tx.isCredit) {
      if (tx.isTransfer) {
        summary.transferIn += tx.amountAbs;
      } else {
        summary.income += tx.amountAbs;
      }
      continue;
    }

    if (tx.isTransfer) {
      summary.transferOut += tx.amountAbs;
      if (!includeTransfers) continue;
    } else {
      summary.expenses += tx.amountAbs;
      summary.expenseCount += 1;
    }

    const categoryName = tx.category || 'Uncategorized';
    categoryTotals.set(categoryName, (categoryTotals.get(categoryName) || 0) + tx.amountAbs);
    const paymentModeName = tx.payment_mode || 'Unknown';
    paymentModeTotals.set(paymentModeName, (paymentModeTotals.get(paymentModeName) || 0) + tx.amountAbs);

    topOutflows.push({
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: tx.amountAbs,
      category: tx.category,
      subCategory: tx.sub_category,
      paymentMode: tx.payment_mode
    });
  }

  summary.netCashflow = includeTransfers
    ? summary.income + summary.transferIn - summary.expenses - summary.transferOut
    : summary.income - summary.expenses;

  summary.categories = toSortedBreakdown(categoryTotals);
  summary.paymentModes = toSortedBreakdown(paymentModeTotals);
  summary.topOutflows = topOutflows
    .sort((a, b) => b.amount - a.amount || a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(0, 10);

  for (const key of ['income', 'expenses', 'transferIn', 'transferOut', 'netCashflow']) {
    summary[key] = Number(summary[key].toFixed(2));
  }

  return summary;
}

function buildCashflowDashboard({ selectedMonth, compareMonths, includeTransfers = false }) {
  const availableMonthKeys = getAvailableMonthKeysAsc();
  const availableMonths = getAvailableMonths();
  const resolvedSelectedMonth = parseMonthKey(selectedMonth) && availableMonthKeys.includes(parseMonthKey(selectedMonth))
    ? parseMonthKey(selectedMonth)
    : getDefaultSelectedMonth(availableMonthKeys);
  const resolvedCompareMonths = normalizeCompareMonths(compareMonths, resolvedSelectedMonth, availableMonthKeys);
  const requestedMonths = [...new Set([resolvedSelectedMonth, ...resolvedCompareMonths].filter(Boolean))].sort();
  const rows = getTransactionsForMonths(requestedMonths).map(classifyTransaction);

  const rowsByMonth = new Map(requestedMonths.map(month => [month, []]));
  for (const row of rows) {
    if (!rowsByMonth.has(row.month)) rowsByMonth.set(row.month, []);
    rowsByMonth.get(row.month).push(row);
  }

  const trend = resolvedCompareMonths.map(monthKey => summarizeMonth(
    monthKey,
    rowsByMonth.get(monthKey) || [],
    includeTransfers
  ));

  const selectedMonthSummary = resolvedSelectedMonth
    ? summarizeMonth(resolvedSelectedMonth, rowsByMonth.get(resolvedSelectedMonth) || [], includeTransfers)
    : emptyMonthSummary(new Date().toISOString().slice(0, 7));

  const compareSummary = {
    income: Number(trend.reduce((sum, item) => sum + item.income, 0).toFixed(2)),
    expenses: Number(trend.reduce((sum, item) => sum + item.expenses, 0).toFixed(2)),
    transferIn: Number(trend.reduce((sum, item) => sum + item.transferIn, 0).toFixed(2)),
    transferOut: Number(trend.reduce((sum, item) => sum + item.transferOut, 0).toFixed(2)),
    netCashflow: Number(trend.reduce((sum, item) => sum + item.netCashflow, 0).toFixed(2)),
    expenseCount: trend.reduce((sum, item) => sum + item.expenseCount, 0),
    transactionCount: trend.reduce((sum, item) => sum + item.transactionCount, 0)
  };

  return {
    filters: {
      selectedMonth: resolvedSelectedMonth,
      compareMonths: resolvedCompareMonths,
      includeTransfers
    },
    availableMonths,
    selectedMonth: selectedMonthSummary,
    compareSummary,
    trend
  };
}

module.exports = {
  buildCashflowDashboard
};
