const dashboardState = {
  availableMonths: [],
  selectedMonth: '',
  compareMonths: [],
  compareDraftMonths: [],
  includeTransfers: false
};

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('selected-month').addEventListener('change', handleSelectedMonthChange);
  document.getElementById('include-transfers-toggle').addEventListener('change', handleIncludeTransfersChange);
  document.getElementById('compare-last-6-btn').addEventListener('click', selectLastMonthsDraft);
  document.getElementById('compare-clear-btn').addEventListener('click', clearCompareDraft);
  document.getElementById('compare-apply-btn').addEventListener('click', applyCompareMonths);

  await loadDashboard();
});

async function loadDashboard() {
  try {
    const params = new URLSearchParams();
    if (dashboardState.selectedMonth) params.set('month', dashboardState.selectedMonth);
    if (dashboardState.compareMonths.length) params.set('months', dashboardState.compareMonths.join(','));
    params.set('includeTransfers', dashboardState.includeTransfers ? 'true' : 'false');

    const query = params.toString();
    const data = await apiCall('GET', `/dashboard/cashflow${query ? `?${query}` : ''}`);

    dashboardState.availableMonths = data.availableMonths || [];
    dashboardState.selectedMonth = data.filters.selectedMonth;
    dashboardState.compareMonths = data.filters.compareMonths || [];
    dashboardState.compareDraftMonths = [...dashboardState.compareMonths];
    dashboardState.includeTransfers = Boolean(data.filters.includeTransfers);

    syncControls();
    renderDashboard(data);
  } catch (error) {
    console.error('Failed to load dashboard', error);
    showToast('Failed to load dashboard');
  }
}

function syncControls() {
  const monthSelect = document.getElementById('selected-month');
  monthSelect.innerHTML = '';

  dashboardState.availableMonths.forEach(month => {
    const option = document.createElement('option');
    option.value = month.key;
    option.textContent = month.label;
    option.selected = month.key === dashboardState.selectedMonth;
    monthSelect.appendChild(option);
  });

  document.getElementById('include-transfers-toggle').checked = dashboardState.includeTransfers;
  renderCompareDraft();
}

function renderCompareDraft() {
  const container = document.getElementById('compare-month-checkboxes');
  container.innerHTML = '';

  dashboardState.availableMonths.forEach(month => {
    const label = document.createElement('label');
    label.className = 'compare-month-option';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = month.key;
    input.checked = dashboardState.compareDraftMonths.includes(month.key);
    input.addEventListener('change', () => {
      if (input.checked) {
        if (!dashboardState.compareDraftMonths.includes(month.key)) {
          dashboardState.compareDraftMonths.push(month.key);
        }
      } else {
        dashboardState.compareDraftMonths = dashboardState.compareDraftMonths.filter(item => item !== month.key);
      }
      dashboardState.compareDraftMonths.sort();
      updateCompareSummaryText();
    });

    const meta = document.createElement('div');
    meta.className = 'compare-month-meta';
    meta.innerHTML = `<span>${month.label}</span><small>${month.key}</small>`;

    label.appendChild(input);
    label.appendChild(meta);
    container.appendChild(label);
  });

  updateCompareSummaryText();
}

function updateCompareSummaryText() {
  const summaryEl = document.getElementById('compare-summary-text');
  const labels = dashboardState.compareDraftMonths
    .map(key => dashboardState.availableMonths.find(item => item.key === key)?.label || key);

  if (!labels.length) {
    summaryEl.textContent = 'No months selected';
    return;
  }

  if (labels.length <= 2) {
    summaryEl.textContent = labels.join(' • ');
    return;
  }

  summaryEl.textContent = `${labels.length} months selected`;
}

function renderDashboard(data) {
  document.getElementById('selected-month-title').textContent = `${data.selectedMonth.label} cashflow`;
  document.getElementById('trend-subtitle').textContent = `${data.trend.length} month${data.trend.length === 1 ? '' : 's'} in view`;

  const displayTrend = [...data.trend].reverse();
  document.getElementById('category-subtitle').textContent = dashboardState.includeTransfers
    ? 'Selected month outflow incl. transfers'
    : 'Selected month outflow excl. transfers';

  renderSummaryCards(data.selectedMonth);
  renderTrendLegend();
  renderTrendChart(displayTrend);
  renderCompareTable(displayTrend);
  renderBreakdown('category-breakdown', data.selectedMonth.categories, 'No category outflows in this month');
  renderBreakdown('payment-breakdown', data.selectedMonth.paymentModes, 'No payment-mode outflows in this month');
  renderTopTransactions(data.selectedMonth.topOutflows);
}

function renderSummaryCards(summary) {
  const cards = [
    { label: 'Income', value: formatAmount(summary.income), tone: 'positive' },
    { label: 'Expenses', value: formatAmount(summary.expenses), tone: 'negative' },
    { label: 'Transfer In', value: formatAmount(summary.transferIn), tone: 'neutral' },
    { label: 'Transfer Out', value: formatAmount(summary.transferOut), tone: 'neutral' },
    { label: 'Net Cashflow', value: formatSignedAmount(summary.netCashflow), tone: summary.netCashflow >= 0 ? 'positive' : 'negative' },
    { label: 'Expense Count', value: String(summary.expenseCount), tone: 'neutral' }
  ];

  const container = document.getElementById('summary-cards');
  container.innerHTML = cards.map(card => `
    <article class="summary-card summary-${card.tone}">
      <p class="summary-label">${card.label}</p>
      <p class="summary-value">${card.value}</p>
    </article>
  `).join('');
}

function renderTrendLegend() {
  document.getElementById('trend-legend').innerHTML = `
    <span><i class="legend-swatch legend-income"></i>Income</span>
    <span><i class="legend-swatch legend-expense"></i>Expenses</span>
  `;
}

function renderTrendChart(months) {
  const container = document.getElementById('trend-chart');
  container.innerHTML = '';

  if (!months.length) {
    container.innerHTML = '<div class="empty-state">No month data available.</div>';
    return;
  }

  months.forEach(month => {
    const totalFlow = month.income + month.expenses;
    const incomePct = totalFlow > 0 ? (month.income / totalFlow) * 100 : 0;
    const expensePct = totalFlow > 0 ? (month.expenses / totalFlow) * 100 : 0;

    const row = document.createElement('div');
    row.className = 'trend-month trend-month-horizontal';
    row.innerHTML = `
      <div class="trend-row-top">
        <div>
          <div class="trend-month-label">${month.label}</div>
          <div class="trend-row-subtitle">Income ${formatAmount(month.income)} · Expenses ${formatAmount(month.expenses)}</div>
        </div>
        <div class="trend-net-pill ${month.netCashflow >= 0 ? 'trend-net-positive' : 'trend-net-negative'}">${formatSignedAmount(month.netCashflow)}</div>
      </div>
      <div class="trend-stack-track" title="${month.label} · Income: ${formatAmount(month.income)} · Expenses: ${formatAmount(month.expenses)} · Net: ${formatSignedAmount(month.netCashflow)}">
        <div class="trend-stack-fill trend-stack-income" style="width:${incomePct.toFixed(2)}%"></div>
        <div class="trend-stack-fill trend-stack-expense" style="width:${expensePct.toFixed(2)}%"></div>
      </div>
      <div class="trend-row-values">
        <span class="trend-value-chip"><i class="legend-swatch legend-income"></i>${formatAmount(month.income)}</span>
        <span class="trend-value-chip"><i class="legend-swatch legend-expense"></i>${formatAmount(month.expenses)}</span>
      </div>
    `;
    container.appendChild(row);
  });
}

function renderCompareTable(months) {
  const container = document.getElementById('compare-table');

  if (!months.length) {
    container.innerHTML = '<div class="empty-state">No month data available.</div>';
    return;
  }

  container.innerHTML = `
    <div class="compare-table-header compare-table-row">
      <span>Month</span>
      <span>Income</span>
      <span>Expenses</span>
      <span>Net</span>
    </div>
    ${months.map(month => `
      <div class="compare-table-row">
        <span>${month.label}</span>
        <span>${formatAmount(month.income)}</span>
        <span>${formatAmount(month.expenses)}</span>
        <span class="${month.netCashflow >= 0 ? 'text-positive' : 'text-negative'}">${formatSignedAmount(month.netCashflow)}</span>
      </div>
    `).join('')}
  `;
}

function renderBreakdown(elementId, items, emptyMessage) {
  const container = document.getElementById(elementId);
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
    return;
  }

  const max = Math.max(...items.map(item => item.amount), 1);
  container.innerHTML = items.map(item => `
    <div class="breakdown-item">
      <div class="breakdown-item-top">
        <span>${escapeHtml(item.name)}</span>
        <strong>${formatAmount(item.amount)}</strong>
      </div>
      <div class="breakdown-bar-track">
        <div class="breakdown-bar-fill" style="width:${Math.max(6, (item.amount / max) * 100)}%"></div>
      </div>
    </div>
  `).join('');
}

function renderTopTransactions(items) {
  const container = document.getElementById('top-transactions');

  if (!items.length) {
    container.innerHTML = '<div class="empty-state">No outflows found for this month.</div>';
    return;
  }

  container.innerHTML = items.map(item => `
    <article class="transaction-item">
      <div class="transaction-main">
        <div>
          <p class="transaction-desc">${escapeHtml(item.description)}</p>
          <p class="transaction-meta">${formatDate(item.date)} · ${escapeHtml(item.category || 'Uncategorized')} · ${escapeHtml(item.paymentMode || 'Unknown')}</p>
        </div>
        <p class="transaction-amount">${formatAmount(item.amount)}</p>
      </div>
    </article>
  `).join('');
}

function handleSelectedMonthChange(event) {
  dashboardState.selectedMonth = event.target.value;
  dashboardState.compareMonths = [];
  dashboardState.compareDraftMonths = [];
  loadDashboard();
}

function handleIncludeTransfersChange(event) {
  dashboardState.includeTransfers = event.target.checked;
  loadDashboard();
}

function selectLastMonthsDraft() {
  const allKeysAsc = dashboardState.availableMonths.map(item => item.key).slice().reverse();
  const selectedIndex = allKeysAsc.indexOf(dashboardState.selectedMonth);
  const endIndex = selectedIndex >= 0 ? selectedIndex : allKeysAsc.length - 1;
  const startIndex = Math.max(0, endIndex - 5);
  dashboardState.compareDraftMonths = allKeysAsc.slice(startIndex, endIndex + 1);
  renderCompareDraft();
}

function clearCompareDraft() {
  dashboardState.compareDraftMonths = [];
  renderCompareDraft();
}

function applyCompareMonths() {
  dashboardState.compareMonths = [...dashboardState.compareDraftMonths];
  document.getElementById('compare-picker').removeAttribute('open');
  loadDashboard();
}

function formatAmount(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatSignedAmount(value) {
  const amount = Number(value || 0);
  const prefix = amount >= 0 ? '+' : '-';
  return `${prefix}${formatAmount(Math.abs(amount)).replace('₹', '₹')}`;
}

function formatDate(dateStr) {
  const [year, month, day] = String(dateStr).split('-');
  return `${day}/${month}/${year}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

async function handleLogout() {
  try {
    await apiCall('POST', '/auth/logout');
    window.location.href = '/budget/login';
  } catch (err) {
    console.error('Logout failed', err);
    showToast('Logout failed');
  }
}
