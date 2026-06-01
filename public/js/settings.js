// settings.js — local working state (not saved until "Save Changes")
let state = {
  paymentModes: {},       // { groupName: [item, ...] }
  creditCardModes: [],    // flat list of credit-card items
  splitPeople: []         // ["Self", "Anil", ...]
};

let pendingDeleteGroup = null;

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Enter key support
  document.getElementById('new-group-name').addEventListener('keydown', e => { if (e.key === 'Enter') addGroup(); });
  document.getElementById('new-person-name').addEventListener('keydown', e => { if (e.key === 'Enter') addPerson(); });

  await loadConfig();
});

// ─── LOAD ────────────────────────────────────────────────────────────────────

async function loadConfig() {
  try {
    const data = await apiCall('GET', '/config');
    state.paymentModes  = JSON.parse(JSON.stringify(data.paymentModes  || CONFIG.PAYMENT_MODES));
    state.creditCardModes = [...(data.creditCardModes || CONFIG.CREDIT_CARD_MODES)];
    state.splitPeople   = [...(data.splitPeople   || CONFIG.SPLIT_PEOPLE)];
  } catch (e) {
    // Fall back to hardcoded defaults
    state.paymentModes  = JSON.parse(JSON.stringify(CONFIG.PAYMENT_MODES));
    state.creditCardModes = [...CONFIG.CREDIT_CARD_MODES];
    state.splitPeople   = [...CONFIG.SPLIT_PEOPLE];
  }
  renderAll();
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function renderAll() {
  renderPaymentGroups();
  renderSplitPeople();
}

function renderPaymentGroups() {
  const container = document.getElementById('payment-groups');
  container.innerHTML = '';

  for (const groupName in state.paymentModes) {
    const items = state.paymentModes[groupName];
    const block = document.createElement('div');
    block.className = 'group-block';
    block.dataset.group = groupName;

    block.innerHTML = `
      <div class="group-header">
        <span class="group-name">${groupName}</span>
        <div class="group-actions">
          <button class="btn-danger-icon" title="Delete group" onclick="confirmDeleteGroup('${escHtml(groupName)}')">🗑️</button>
        </div>
      </div>
      <div class="group-items" id="items-${cssId(groupName)}">
        ${items.map(item => renderTag(item, groupName)).join('')}
      </div>
      <div style="padding: 0 14px 12px;">
        <div class="add-row">
          <input type="text"
            id="new-item-${cssId(groupName)}"
            placeholder="Add item to ${escHtml(groupName)}"
            onkeydown="if(event.key==='Enter') addItem('${escHtml(groupName)}')">
          <button class="btn-add" onclick="addItem('${escHtml(groupName)}')">+ Add</button>
        </div>
        <div class="cc-toggle">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="cc-all-${cssId(groupName)}"
              ${items.every(i => state.creditCardModes.includes(i)) && items.length > 0 ? 'checked' : ''}
              onchange="toggleAllCreditCard('${escHtml(groupName)}', this.checked)">
            Mark entire group as Credit Card
          </label>
        </div>
      </div>
    `;
    container.appendChild(block);
  }
}

function renderTag(item, groupName) {
  const isCC = state.creditCardModes.includes(item);
  return `
    <span class="tag ${isCC ? 'credit-card' : ''}" id="tag-${cssId(item)}">
      <span onclick="toggleCreditCard('${escHtml(item)}', '${escHtml(groupName)}')" 
            style="cursor:pointer;" 
            title="${isCC ? 'Click to unmark as credit card' : 'Click to mark as credit card'}">
        ${isCC ? '⭐ ' : ''}${escHtml(item)}
      </span>
      <button class="tag-remove" onclick="removeItem('${escHtml(groupName)}', '${escHtml(item)}')" title="Remove">×</button>
    </span>
  `;
}

function renderSplitPeople() {
  const container = document.getElementById('split-people-list');
  container.innerHTML = '';
  state.splitPeople.forEach(person => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `
      ${escHtml(person)}
      ${person !== 'Self' ? `<button class="tag-remove" onclick="removePerson('${escHtml(person)}')" title="Remove">×</button>` : ''}
    `;
    container.appendChild(tag);
  });
}

// ─── PAYMENT MODE ACTIONS ─────────────────────────────────────────────────────

function addGroup() {
  const input = document.getElementById('new-group-name');
  const name = input.value.trim();
  if (!name) return;
  if (state.paymentModes[name]) { showToast('Group already exists'); return; }
  state.paymentModes[name] = [];
  input.value = '';
  markDirty();
  renderPaymentGroups();
  // Focus the new group's input
  const newInput = document.getElementById(`new-item-${cssId(name)}`);
  if (newInput) newInput.focus();
}

function addItem(groupName) {
  const input = document.getElementById(`new-item-${cssId(groupName)}`);
  const value = input.value.trim();
  if (!value) return;
  // Check for duplicates across all groups
  for (const g in state.paymentModes) {
    if (state.paymentModes[g].includes(value)) {
      showToast(`"${value}" already exists in ${g}`);
      return;
    }
  }
  state.paymentModes[groupName].push(value);
  input.value = '';
  markDirty();
  renderPaymentGroups();
  document.getElementById(`new-item-${cssId(groupName)}`).focus();
}

function removeItem(groupName, item) {
  state.paymentModes[groupName] = state.paymentModes[groupName].filter(i => i !== item);
  state.creditCardModes = state.creditCardModes.filter(i => i !== item);
  markDirty();
  renderPaymentGroups();
}

function confirmDeleteGroup(groupName) {
  pendingDeleteGroup = groupName;
  document.getElementById('confirm-group-msg').textContent = `Delete group "${groupName}" and all its items?`;
  document.getElementById('confirm-group-btn').onclick = () => deleteGroup(groupName);
  document.getElementById('confirm-group-modal').style.display = 'flex';
}

function closeGroupModal() {
  pendingDeleteGroup = null;
  document.getElementById('confirm-group-modal').style.display = 'none';
}

function deleteGroup(groupName) {
  const items = state.paymentModes[groupName] || [];
  items.forEach(item => {
    state.creditCardModes = state.creditCardModes.filter(i => i !== item);
  });
  delete state.paymentModes[groupName];
  closeGroupModal();
  markDirty();
  renderPaymentGroups();
}

function toggleCreditCard(item, groupName) {
  if (state.creditCardModes.includes(item)) {
    state.creditCardModes = state.creditCardModes.filter(i => i !== item);
  } else {
    state.creditCardModes.push(item);
  }
  markDirty();
  renderPaymentGroups();
}

function toggleAllCreditCard(groupName, checked) {
  const items = state.paymentModes[groupName] || [];
  if (checked) {
    items.forEach(item => {
      if (!state.creditCardModes.includes(item)) state.creditCardModes.push(item);
    });
  } else {
    state.creditCardModes = state.creditCardModes.filter(i => !items.includes(i));
  }
  markDirty();
  renderPaymentGroups();
}

// ─── SPLIT PEOPLE ACTIONS ─────────────────────────────────────────────────────

function addPerson() {
  const input = document.getElementById('new-person-name');
  const name = input.value.trim();
  if (!name) return;
  if (state.splitPeople.includes(name)) { showToast('Person already exists'); return; }
  state.splitPeople.push(name);
  input.value = '';
  markDirty();
  renderSplitPeople();
}

function removePerson(name) {
  if (name === 'Self') return;
  state.splitPeople = state.splitPeople.filter(p => p !== name);
  markDirty();
  renderSplitPeople();
}

// ─── SAVE ─────────────────────────────────────────────────────────────────────

async function saveConfig() {
  try {
    await apiCall('POST', '/config', {
      paymentModes: state.paymentModes,
      creditCardModes: state.creditCardModes,
      splitPeople: state.splitPeople
    });
    document.getElementById('save-status').textContent = 'Saved ✓';
    document.getElementById('save-status').style.color = '#22c55e';
    setTimeout(() => { document.getElementById('save-status').textContent = ''; }, 3000);
    showToast('Settings saved!');
  } catch (e) {
    showToast('Failed to save settings');
    console.error(e);
  }
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function markDirty() {
  document.getElementById('save-status').textContent = 'Unsaved changes';
  document.getElementById('save-status').style.color = '#eab308';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cssId(str) {
  return str.replace(/[^a-zA-Z0-9]/g, '_');
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
  } catch (err) { console.error('Logout failed', err); }
}
