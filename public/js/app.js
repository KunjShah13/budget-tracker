document.addEventListener('DOMContentLoaded', async () => {
  // Wait for config and auth functions to be available
  if (typeof CONFIG === 'undefined') return;

  // Load user-saved config (payment modes, split people) from server
  if (typeof loadUserConfig === 'function') { await loadUserConfig(); }

  // Initialization
  initFormFields();
  initSplitwiseToggle();
  initMonthSelector();
  
  // Event listeners
  document.getElementById('expense-form').addEventListener('submit', handleFormSubmit);
  document.getElementById('cancel-edit-btn').addEventListener('click', cancelEdit);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('download-btn').addEventListener('click', handleDownloadCSV);
  document.getElementById('confirm-delete-btn').addEventListener('click', confirmDelete);
  document.getElementById('cancel-delete-btn').addEventListener('click', closeDeleteModal);
  
  // Set default date + max allowed date
  const dateField = document.getElementById('field-date');
  const todayIso = getTodayIsoDate();
  dateField.value = todayIso;
  dateField.max = todayIso;
  
  // Load initial data
  const now = new Date();
  loadData(now.getMonth() + 1, now.getFullYear());
});

// --- STATE ---
let currentExpenses = [];
let editingId = null;
let currentMonth = new Date().getMonth() + 1;
let currentYear = new Date().getFullYear();

// --- INITIALIZATION ---
function initFormFields() {
  // Payment Modes
  const paymentSelect = document.getElementById('field-payment-mode');
  paymentSelect.innerHTML = '<option value="" disabled selected>Select...</option>';
  
  for (const group in CONFIG.PAYMENT_MODES) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group;
    CONFIG.PAYMENT_MODES[group].forEach(mode => {
      const option = document.createElement('option');
      option.value = mode;
      option.textContent = mode;
      optgroup.appendChild(option);
    });
    paymentSelect.appendChild(optgroup);
  }
  
  // Sub-categories
  const subCatSelect = document.getElementById('field-subcategory');
  subCatSelect.innerHTML = '<option value="" disabled selected>Select...</option>';
  
  const allSubCats = [];
  for (const cat in CONFIG.SUBCATEGORIES) {
    allSubCats.push(...CONFIG.SUBCATEGORIES[cat]);
  }
  // Sort alphabetically
  allSubCats.sort().forEach(sub => {
    const option = document.createElement('option');
    option.value = sub;
    option.textContent = sub;
    subCatSelect.appendChild(option);
  });
  
  // Categories
  const catSelect = document.getElementById('field-category');
  CONFIG.CATEGORIES.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    catSelect.appendChild(option);
  });
  
  // Auto-fill category on sub-category change
  subCatSelect.addEventListener('change', (e) => {
    const sub = e.target.value;
    if (CONFIG.SUBCAT_TO_CAT[sub]) {
      catSelect.value = CONFIG.SUBCAT_TO_CAT[sub];
    }
  });
}

function initSplitwiseToggle() {
  const splitToggleBtns = document.querySelectorAll('#splitwise-toggle .toggle-btn');
  const splitSection = document.getElementById('split-section');
  const peopleContainer = document.getElementById('split-people');
  const othersNameInput = document.getElementById('others-name');
  const typeToggleBtns = document.querySelectorAll('#split-type-toggle .toggle-btn');
  const customAmountsContainer = document.getElementById('custom-amounts');
  const paidBySelect = document.getElementById('field-paid-by');
  const amountInput = document.getElementById('field-amount');
  
  // Render people checkboxes
  CONFIG.SPLIT_PEOPLE.forEach(person => {
    const label = document.createElement('label');
    label.className = 'person-check';
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = person;
    cb.className = 'split-person-cb';
    
    if (person === 'Self') {
      cb.checked = true;
      cb.disabled = true;
    }
    
    cb.addEventListener('change', () => {
      if (person === 'Others') {
        othersNameInput.style.display = cb.checked ? 'block' : 'none';
        if (cb.checked) othersNameInput.required = true;
        else { othersNameInput.required = false; othersNameInput.value = ''; }
      }
      updatePaidByDropdown();
      updateCustomAmounts();
    });
    
    label.appendChild(cb);
    label.appendChild(document.createTextNode(person));
    peopleContainer.appendChild(label);
  });
  
  // Splitwise Yes/No toggle
  splitToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      splitToggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      if (btn.dataset.value === 'Yes') {
        splitSection.style.display = 'block';
        updatePaidByDropdown();
      } else {
        splitSection.style.display = 'none';
      }
    });
  });
  
  // Split Type toggle
  typeToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typeToggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      if (btn.dataset.value === 'custom') {
        customAmountsContainer.style.display = 'block';
        updateCustomAmounts();
      } else {
        customAmountsContainer.style.display = 'none';
      }
    });
  });
  
  // Update on amount change
  amountInput.addEventListener('input', updateCustomAmounts);
}

function updatePaidByDropdown() {
  const paidBySelect = document.getElementById('field-paid-by');
  const currentVal = paidBySelect.value;
  paidBySelect.innerHTML = '';
  
  const selectedPeople = getSelectedPeople();
  
  selectedPeople.forEach(p => {
    const option = document.createElement('option');
    option.value = p;
    option.textContent = p;
    paidBySelect.appendChild(option);
  });
  
  if (selectedPeople.includes(currentVal)) {
    paidBySelect.value = currentVal;
  } else {
    paidBySelect.value = 'Self';
  }
}

function updateCustomAmounts() {
  const typeBtn = document.querySelector('#split-type-toggle .active');
  if (typeBtn.dataset.value !== 'custom') return;
  
  const customAmountsContainer = document.getElementById('custom-amounts');
  const selectedPeople = getSelectedPeople();
  
  // Keep existing values if possible
  const existingInputs = {};
  customAmountsContainer.querySelectorAll('input').forEach(input => {
    existingInputs[input.dataset.person] = input.value;
  });
  
  customAmountsContainer.innerHTML = '';
  
  selectedPeople.forEach(p => {
    const row = document.createElement('div');
    row.className = 'custom-amount-row';
    
    const span = document.createElement('span');
    span.textContent = p;
    
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.dataset.person = p;
    input.placeholder = '₹0.00';
    if (existingInputs[p]) input.value = existingInputs[p];
    
    row.appendChild(span);
    row.appendChild(input);
    customAmountsContainer.appendChild(row);
  });
}

function getSelectedPeople() {
  const cbs = document.querySelectorAll('.split-person-cb:checked');
  const people = [];
  cbs.forEach(cb => {
    if (cb.value === 'Others') {
      const name = document.getElementById('others-name').value.trim() || 'Others';
      people.push(`Others:${name}`);
    } else {
      people.push(cb.value);
    }
  });
  return people;
}

function initMonthSelector() {
  const monthSelector = document.getElementById('month-selector');
  monthSelector.addEventListener('change', (e) => {
    const [y, m] = e.target.value.split('-');
    currentYear = parseInt(y);
    currentMonth = parseInt(m);
    loadData(currentMonth, currentYear);
  });
}

// --- DATA LOADING & RENDERING ---
async function loadData(month, year) {
  try {
    const data = await apiCall('GET', `/expenses?month=${month}&year=${year}`);
    if (data && data.expenses) {
      currentExpenses = data.expenses;
      renderEntries();
    }
    
    if (data && data.availableMonths) {
      updateMonthSelector(data.availableMonths, month, year);
    }
  } catch (err) {
    console.error('Failed to load data', err);
  }
}

function updateMonthSelector(months, currentM, currentY) {
  const selector = document.getElementById('month-selector');
  selector.innerHTML = '';
  
  // Ensure current month is in the list
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

function getTransactionColor(amount, paymentMode) {
  if (amount < 0) return 'tx-green';
  if (CONFIG.CREDIT_CARD_MODES.includes(paymentMode)) return 'tx-yellow';
  return 'tx-red';
}

function formatAmount(amount) {
  const num = parseFloat(amount);
  const formatted = Math.abs(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return num < 0 ? `-₹${formatted}` : `₹${formatted}`;
}

function renderEntries() {
  const tbody = document.getElementById('entries-tbody');
  const cardsContainer = document.getElementById('entries-cards');
  let totalRed = 0;
  
  tbody.innerHTML = '';
  cardsContainer.innerHTML = '';
  
  if (currentExpenses.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#888;">No expenses this month</td></tr>';
    cardsContainer.innerHTML = '<div style="text-align:center; color:#888; padding:20px;">No expenses this month</div>';
    document.getElementById('total-amount').textContent = '₹0.00';
    return;
  }
  
  // Render newest first if they are ordered chronologically by insertion, 
  // actually CSV handler appends, so reverse to show latest at top
  const sortedExpenses = [...currentExpenses].reverse();
  
  sortedExpenses.forEach(exp => {
    const colorClass = getTransactionColor(exp.amount, exp.paymentMode);
    
    if (colorClass === 'tx-red') {
      totalRed += exp.amount;
    }
    
    // Desktop Table Row
    const tr = document.createElement('tr');
    tr.className = colorClass;
    tr.innerHTML = `
      <td>${exp.date}</td>
      <td>${exp.description}</td>
      <td class="amt-cell"><span class="amt">${formatAmount(exp.amount)}</span></td>
      <td>${exp.paymentMode}</td>
      <td>${exp.subCategory}</td>
      <td>${exp.category}</td>
      <td>${exp.splitwise === 'Yes' ? '🤝 Yes' : 'No'}</td>
      <td>
        <div class="actions">
          <button title="Edit" onclick="editExpense('${exp.id}')">✏️</button>
          <button title="Delete" onclick="openDeleteModal('${exp.id}')">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
    
    // Mobile Card
    const card = document.createElement('div');
    card.className = `entry-card ${colorClass}`;
    card.innerHTML = `
      <div class="entry-top">
        <span class="entry-desc">${exp.description}</span>
        <span class="amt" style="font-weight:600;">${formatAmount(exp.amount)}</span>
      </div>
      <div class="entry-bottom">
        <span>${exp.date}</span>
        <span>•</span>
        <span>${exp.category}</span>
        <span>•</span>
        <span>${exp.paymentMode}</span>
      </div>
      <div class="actions">
        <button onclick="editExpense('${exp.id}')">✏️</button>
        <button onclick="openDeleteModal('${exp.id}')">🗑️</button>
      </div>
    `;
    cardsContainer.appendChild(card);
  });
  
  document.getElementById('total-amount').textContent = formatAmount(totalRed);
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function isFutureDate(dateStr) {
  return Boolean(dateStr) && dateStr > getTodayIsoDate();
}

// --- FORM HANDLING ---
async function handleFormSubmit(e) {
  e.preventDefault();
  
  const dateInput = document.getElementById('field-date').value;
  const description = document.getElementById('field-description').value;
  const amount = parseFloat(document.getElementById('field-amount').value);
  const paymentMode = document.getElementById('field-payment-mode').value;
  const subCategory = document.getElementById('field-subcategory').value;
  const category = document.getElementById('field-category').value;
  
  if (isFutureDate(dateInput)) {
    showToast('Date cannot be greater than today');
    return;
  }

  const splitBtn = document.querySelector('#splitwise-toggle .active');
  const splitwise = splitBtn ? splitBtn.dataset.value : 'No';
  
  let splitDetails = null;
  
  if (splitwise === 'Yes') {
    const typeBtn = document.querySelector('#split-type-toggle .active');
    const splitType = typeBtn ? typeBtn.dataset.value : 'equal';
    const paidBy = document.getElementById('field-paid-by').value;
    const people = getSelectedPeople();
    
    const shares = {};
    if (splitType === 'equal') {
      const share = amount / people.length;
      people.forEach(p => shares[p] = share);
    } else {
      let sum = 0;
      people.forEach(p => {
        const input = document.querySelector(`#custom-amounts input[data-person="${p}"]`);
        const val = parseFloat(input ? input.value : 0) || 0;
        shares[p] = val;
        sum += val;
      });
      // Validate custom sum
      if (Math.abs(sum - amount) > 0.01) {
        showToast('Custom split amounts must equal total amount!');
        return;
      }
    }
    
    splitDetails = {
      type: splitType,
      paidBy,
      people,
      shares
    };
  }
  
  const expenseData = {
    date: dateInput,
    description,
    amount,
    paymentMode,
    subCategory,
    category,
    splitwise,
    splitDetails
  };
  
  try {
    if (editingId) {
      await apiCall('PUT', `/expense/${editingId}?month=${currentMonth}&year=${currentYear}`, expenseData);
      showToast('Expense updated successfully');
      cancelEdit();
    } else {
      await apiCall('POST', '/expense', expenseData);
      showToast('Expense added successfully');
      // Reset form but keep date
      document.getElementById('expense-form').reset();
      document.getElementById('field-date').value = dateInput;
      // Reset toggles
      document.querySelector('#splitwise-toggle button[data-value="No"]').click();
    }
    
    // If the date entered belongs to a different month than currently viewing, change view
    const enteredDate = new Date(dateInput);
    if (enteredDate.getMonth() + 1 !== currentMonth || enteredDate.getFullYear() !== currentYear) {
      currentMonth = enteredDate.getMonth() + 1;
      currentYear = enteredDate.getFullYear();
    }
    
    loadData(currentMonth, currentYear);
  } catch (err) {
    showToast('Failed to save expense');
    console.error(err);
  }
}

async function editExpense(id) {
  const expense = currentExpenses.find(e => e.id === id);
  if (!expense) return;
  
  editingId = id;
  
  // Convert D/M back to YYYY-MM-DD for the date input
  const parts = expense.date.split('/');
  if (parts.length === 2) {
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    document.getElementById('field-date').value = `${currentYear}-${m}-${d}`;
  }
  
  document.getElementById('field-description').value = expense.description;
  document.getElementById('field-amount').value = expense.amount;
  document.getElementById('field-payment-mode').value = expense.paymentMode;
  document.getElementById('field-subcategory').value = expense.subCategory;
  document.getElementById('field-category').value = expense.category;
  
  document.getElementById('form-title').textContent = 'Edit Expense';
  document.getElementById('submit-btn').textContent = 'Update Expense';
  document.getElementById('cancel-edit-btn').style.display = 'block';
  
  // Set splitwise toggle
  const splitBtn = document.querySelector(`#splitwise-toggle button[data-value="${expense.splitwise}"]`);
  if (splitBtn) splitBtn.click();
  
  if (expense.splitwise === 'Yes') {
    try {
      // Need to fetch splits to populate edit form accurately
      const data = await apiCall('GET', `/splits?month=${currentMonth}&year=${currentYear}`);
      const splitDetails = data.splits[id];
      if (splitDetails) {
        // We leave population of complex custom splits for the user to re-verify for now
        // To keep it simple, just load the basic people checks
        const othersNameInput = document.getElementById('others-name');
        document.querySelectorAll('.split-person-cb').forEach(cb => {
          if (cb.value !== 'Self') cb.checked = false;
        });
        
        splitDetails.people.forEach(p => {
          if (p.startsWith('Others:')) {
            const othersCb = document.querySelector('.split-person-cb[value="Others"]');
            if (othersCb) othersCb.checked = true;
            othersNameInput.style.display = 'block';
            othersNameInput.value = p.split(':')[1];
          } else {
            const cb = document.querySelector(`.split-person-cb[value="${p}"]`);
            if (cb) cb.checked = true;
          }
        });
        
        const typeBtn = document.querySelector(`#split-type-toggle button[data-value="${splitDetails.type}"]`);
        if (typeBtn) typeBtn.click();
        
        updatePaidByDropdown();
        document.getElementById('field-paid-by').value = splitDetails.paidBy;
        
        if (splitDetails.type === 'custom') {
          setTimeout(() => {
            splitDetails.people.forEach(p => {
              const input = document.querySelector(`#custom-amounts input[data-person="${p}"]`);
              if (input) input.value = splitDetails.shares[p];
            });
          }, 100);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
  editingId = null;
  const dateVal = document.getElementById('field-date').value;
  document.getElementById('expense-form').reset();
  document.getElementById('field-date').value = dateVal;
  document.getElementById('form-title').textContent = 'Add Expense';
  document.getElementById('submit-btn').textContent = 'Add Expense';
  document.getElementById('cancel-edit-btn').style.display = 'none';
  document.querySelector('#splitwise-toggle button[data-value="No"]').click();
}

function openDeleteModal(id) {
  document.getElementById('delete-id').value = id;
  document.getElementById('delete-modal').style.display = 'flex';
}

function closeDeleteModal() {
  document.getElementById('delete-modal').style.display = 'none';
  document.getElementById('delete-id').value = '';
}

async function confirmDelete() {
  const id = document.getElementById('delete-id').value;
  if (!id) return;
  
  try {
    await apiCall('DELETE', `/expense/${id}?month=${currentMonth}&year=${currentYear}`);
    showToast('Expense deleted');
    closeDeleteModal();
    loadData(currentMonth, currentYear);
  } catch (err) {
    showToast('Failed to delete expense');
    console.error(err);
  }
}

// --- UTILITIES ---
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
  }
}

function handleDownloadCSV() {
  window.location.href = `${CONFIG.API_BASE}/download?month=${currentMonth}&year=${currentYear}`;
}
