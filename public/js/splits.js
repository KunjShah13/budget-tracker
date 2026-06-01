document.addEventListener('DOMContentLoaded', () => {
  if (typeof CONFIG === 'undefined') return;
  
  initMonthSelector();
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  
  const now = new Date();
  currentMonth = now.getMonth() + 1;
  currentYear = now.getFullYear();
  loadSplits(currentMonth, currentYear);
});

let currentMonth;
let currentYear;

function initMonthSelector() {
  const monthSelector = document.getElementById('month-selector');
  monthSelector.addEventListener('change', (e) => {
    const [y, m] = e.target.value.split('-');
    currentYear = parseInt(y);
    currentMonth = parseInt(m);
    loadSplits(currentMonth, currentYear);
  });
}

async function loadSplits(month, year) {
  try {
    const data = await apiCall('GET', `/splits?month=${month}&year=${year}`);
    
    // Get available months to populate selector
    const monthsData = await apiCall('GET', '/months');
    updateMonthSelector(monthsData.months, month, year);
    
    renderSplits(data.splits, data.expenses);
    renderSettlement(data.settlement);
  } catch (err) {
    console.error('Failed to load splits', err);
  }
}

function updateMonthSelector(months, currentM, currentY) {
  const selector = document.getElementById('month-selector');
  selector.innerHTML = '';
  
  const currentKey = `${currentY}-${currentM}`;
  const hasCurrent = months.some(m => m.year === currentY && m.month === currentM);
  if (!hasCurrent) {
    months.unshift({ year: currentY, month: currentM });
  }
  
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  months.forEach(m => {
    const option = document.createElement('option');
    option.value = `${m.year}-${m.month}`;
    option.textContent = `${monthNames[m.month - 1]} ${m.year}`;
    if (m.year === currentY && m.month === currentM) {
      option.selected = true;
    }
    selector.appendChild(option);
  });
}

function formatAmount(amount) {
  const num = parseFloat(amount);
  const formatted = Math.abs(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `₹${formatted}`;
}

function renderSplits(splits, expenses) {
  const list = document.getElementById('split-transactions-list');
  const title = document.getElementById('split-count-title');
  
  list.innerHTML = '';
  title.textContent = `📋 Shared Expenses (${expenses.length})`;
  
  if (expenses.length === 0) {
    list.innerHTML = '<div style="color:#888; padding:20px 0;">No shared expenses this month</div>';
    return;
  }
  
  const sortedExpenses = [...expenses].reverse();
  
  sortedExpenses.forEach(exp => {
    const split = splits[exp.id];
    if (!split) return;
    
    const sharesText = split.people.map(p => `${p.replace('Others:', '')} ${formatAmount(split.shares[p] || 0)}`).join(' · ');
    
    const div = document.createElement('div');
    div.className = 'split-item';
    div.innerHTML = `
      <div class="split-item-top">
        <span>${exp.date} &nbsp; <span class="split-item-desc">${exp.description}</span></span>
        <span style="font-weight:600;">${formatAmount(exp.amount)}</span>
      </div>
      <div class="split-item-details">
        Paid by: ${split.paidBy} · ${split.type === 'equal' ? 'Equal' : 'Custom'} split
      </div>
      <div class="split-item-shares">
        ${sharesText}
      </div>
    `;
    list.appendChild(div);
  });
}

function renderSettlement(settlement) {
  const list = document.getElementById('settlement-list');
  const summary = document.getElementById('net-summary');
  
  list.innerHTML = '';
  summary.innerHTML = '';
  
  const people = Object.keys(settlement);
  if (people.length === 0) {
    list.innerHTML = '<div style="color:#888;">All settled up!</div>';
    return;
  }
  
  let netOwedToYou = 0;
  
  people.forEach(p => {
    const amt = settlement[p];
    if (amt === 0) return;
    
    netOwedToYou += amt;
    
    const div = document.createElement('div');
    div.className = 'settle-row';
    
    const displayName = p.replace('Others:', '');
    
    if (amt > 0) {
      div.innerHTML = `
        <span>${displayName} owes you</span>
        <span style="color:#ef4444; font-weight:600;">${formatAmount(amt)} 🔴</span>
      `;
    } else {
      div.innerHTML = `
        <span>You owe ${displayName}</span>
        <span style="color:#22c55e; font-weight:600;">${formatAmount(Math.abs(amt))} 🟢</span>
      `;
    }
    
    list.appendChild(div);
  });
  
  if (netOwedToYou > 0) {
    summary.innerHTML = `Net: Others owe you <span style="color:#ef4444">${formatAmount(netOwedToYou)}</span>`;
  } else if (netOwedToYou < 0) {
    summary.innerHTML = `Net: You owe others <span style="color:#22c55e">${formatAmount(Math.abs(netOwedToYou))}</span>`;
  } else {
    summary.innerHTML = `Net: Fully balanced`;
  }
}

async function handleLogout() {
  try {
    await apiCall('POST', '/auth/logout');
    window.location.href = '/budget/login';
  } catch (err) {
    console.error('Logout failed', err);
  }
}
