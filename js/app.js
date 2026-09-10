/**
 * app.js - Renderizado de interfaz, eventos y gestión de modales
 */

let currentSettleTarget = {
  type: null, // 'debt' o 'friend'
  id: null,
  amount: 0
};

/* Actualización de cabecera y tarjetas de balance */
function updateOverviewDOM() {
  const { totalOwedToMe, totalIOwe, netTotal } = getOverviewBalances();

  document.getElementById('totalOwedToMe').textContent = formatMoney(totalOwedToMe);
  document.getElementById('totalIOwe').textContent = formatMoney(totalIOwe);

  const netEl = document.getElementById('totalNet');
  netEl.textContent = (netTotal > 0 ? '+' : '') + formatMoney(netTotal);

  const netCard = document.getElementById('netBalanceCard');
  netCard.className = 'balance-card ' + (netTotal > 0 ? 'pos' : netTotal < 0 ? 'neg' : '');
}

function editUserName() {
  const current = appState.user.name;
  const newName = prompt('Nombre de usuario:', current);
  if (newName && newName.trim() && newName.trim() !== current) {
    appState.user.name = newName.trim();
    saveState();
    renderAll();
  }
}

/* ==========================================================================
   AMIGOS
   ========================================================================== */
function addFriend(e) {
  e.preventDefault();
  const input = document.getElementById('newFriendName');
  const name = input.value.trim();
  if (!name) return;

  const exists = appState.friends.some(f => f.name.toLowerCase() === name.toLowerCase()) ||
                 appState.user.name.toLowerCase() === name.toLowerCase();
  if (exists) {
    alert('Ya existe alguien con ese nombre.');
    return;
  }

  appState.friends.push({
    id: 'f_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    name: name
  });

  saveState();
  input.value = '';
  renderAll();
}

function deleteFriend(id) {
  const friend = appState.friends.find(f => f.id === id);
  if (!friend) return;

  const net = getNetBalanceWithFriend(id);
  if (Math.abs(net) > 0.01) {
    if (!confirm(`"${friend.name}" tiene saldo pendiente de ${formatMoney(Math.abs(net))}. Eliminar amigo y sus deudas?`)) return;
  } else {
    if (!confirm(`Eliminar a "${friend.name}"?`)) return;
  }

  appState.debts = appState.debts.filter(d => d.friendId !== id);
  appState.groups.forEach(g => {
    g.memberIds = g.memberIds.filter(mId => mId !== id);
  });
  appState.friends = appState.friends.filter(f => f.id !== id);

  saveState();
  renderAll();
}

function quickDebt(friendId) {
  switchTab('debts');
  document.getElementById('debtFriendSelect').value = friendId;
  document.getElementById('debtAmount').focus();
}

function renderFriendsList() {
  const listEl = document.getElementById('friendsList');
  if (appState.friends.length === 0) {
    listEl.innerHTML = '<div class="empty-msg">No hay amigos cargados. Agrega uno arriba.</div>';
    return;
  }

  let html = '';
  appState.friends.forEach(f => {
    const net = getNetBalanceWithFriend(f.id);
    let badgeHtml = '';
    let settleBtn = '';

    if (net > 0) {
      badgeHtml = `<span class="badge pos">Me debe ${formatMoney(net)}</span>`;
      settleBtn = `<button class="btn btn-subtle btn-sm" onclick="openSettleModal('friend', '${f.id}', ${net})">Saldar</button>`;
    } else if (net < 0) {
      badgeHtml = `<span class="badge neg">Debo ${formatMoney(Math.abs(net))}</span>`;
      settleBtn = `<button class="btn btn-subtle btn-sm" onclick="openSettleModal('friend', '${f.id}', ${Math.abs(net)})">Saldar</button>`;
    } else {
      badgeHtml = `<span class="badge neutral">$0</span>`;
    }

    html += `
      <div class="friend-item">
        <div>
          <div style="font-weight: 600; font-size: 0.9rem;">${f.name}</div>
          <div style="margin-top: 2px;">${badgeHtml}</div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button class="btn btn-subtle btn-sm" onclick="quickDebt('${f.id}')">+ Deuda</button>
          ${settleBtn}
          <button class="btn-text-danger" onclick="deleteFriend('${f.id}')" title="Eliminar">Eliminar</button>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

/* ==========================================================================
   DEUDAS DIRECTAS
   ========================================================================== */
function populateFriendSelect() {
  const select = document.getElementById('debtFriendSelect');
  const tipEl = document.getElementById('noFriendsTipDebts');
  const prevVal = select.value;

  select.innerHTML = '';
  if (appState.friends.length === 0) {
    tipEl.style.display = 'block';
    return;
  }
  tipEl.style.display = 'none';

  appState.friends.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    select.appendChild(opt);
  });

  if (prevVal && appState.friends.some(f => f.id === prevVal)) {
    select.value = prevVal;
  }
}

function addDirectDebt(e) {
  e.preventDefault();
  const friendId = document.getElementById('debtFriendSelect').value;
  const direction = document.getElementById('debtDirection').value; // 'borrowed' (Debo) o 'lent' (Me debe)
  const amount = parseFloat(document.getElementById('debtAmount').value);
  // Concepto opcional: si está vacío se asigna "Varios"
  const concept = document.getElementById('debtConcept').value.trim() || 'Varios';

  if (!friendId) {
    alert('Selecciona un amigo.');
    return;
  }

  if (!amount || amount <= 0) {
    alert('Monto invalido.');
    return;
  }

  appState.debts.unshift({
    id: 'd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    friendId: friendId,
    direction: direction,
    amount: amount,
    concept: concept,
    date: new Date().toLocaleDateString('es-AR'),
    settled: false,
    groupId: null
  });

  saveState();
  document.getElementById('debtAmount').value = '';
  document.getElementById('debtConcept').value = '';
  renderAll();
}

function deleteDebt(debtId) {
  if (!confirm('Eliminar registro de deuda?')) return;
  appState.debts = appState.debts.filter(d => d.id !== debtId);
  saveState();
  renderAll();
}

function renderDebts() {
  const listEl = document.getElementById('debtsList');
  const hideSettled = document.getElementById('filterHideSettled').checked;

  const filtered = hideSettled 
    ? appState.debts.filter(d => !d.settled) 
    : appState.debts;

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-msg">No hay deudas cargadas.</div>';
    return;
  }

  let html = '';
  filtered.forEach(d => {
    const friendName = getFriendName(d.friendId);
    const isSettled = d.settled;
    const relationText = d.direction === 'lent' ? 'Me debe' : 'Debo';
    const isPartial = !isSettled && d.partialPayments && d.partialPayments.length > 0;

    let actionBtnHtml = '';
    if (!isSettled) {
      actionBtnHtml = `<button class="btn btn-subtle btn-sm" onclick="openSettleModal('debt', '${d.id}', ${d.amount})">Saldar</button>`;
    } else {
      actionBtnHtml = `<button class="btn btn-subtle btn-sm" onclick="reactivateDebt('${d.id}')">Deshacer</button>`;
    }

    let partialInfoHtml = '';
    if (isPartial && d.originalAmount) {
      const totalPaid = d.originalAmount - d.amount;
      partialInfoHtml = `
        <div style="font-size: 0.72rem; color: var(--positive); margin-top: 2px;">
          Pagado: ${formatMoney(totalPaid)} de ${formatMoney(d.originalAmount)}
        </div>
      `;
    }

    html += `
      <div class="debt-item ${isSettled ? 'settled' : ''}">
        <div>
          <div class="debt-desc">
            ${d.concept}
            ${d.groupId ? '<span class="badge neutral" style="font-size: 0.68rem; margin-left: 4px;">Grupo</span>' : ''}
            ${isPartial ? '<span class="badge pos" style="font-size: 0.68rem; margin-left: 4px;">Parcial</span>' : ''}
            ${isSettled ? '<span class="badge neutral" style="font-size: 0.68rem; margin-left: 4px;">Saldada</span>' : ''}
          </div>
          <div class="debt-sub">
            ${friendName} • ${relationText} • ${d.date}
          </div>
          ${partialInfoHtml}
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <div class="debt-amount">
            <div class="val">${formatMoney(d.amount)}</div>
            ${isPartial ? '<div style="font-size: 0.68rem; color: var(--text-muted);">pendiente</div>' : ''}
          </div>
          ${actionBtnHtml}
          <button class="btn-text-danger" onclick="deleteDebt('${d.id}')" title="Eliminar">Eliminar</button>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

function reactivateDebt(debtId) {
  const debt = appState.debts.find(d => d.id === debtId);
  if (!debt) return;
  debt.settled = false;
  debt.amount = debt.originalAmount || debt.amount;
  debt.partialPayments = [];
  saveState();
  renderAll();
}

/* ==========================================================================
   MODAL DE SALDADO POR PORCENTAJE O MONTO EXCLUSIVO
   ========================================================================== */
let currentSettleMode = 'percent'; // 'percent' o 'amount'

function setSettleMode(mode) {
  currentSettleMode = mode;

  const btnPct = document.getElementById('modeBtnPct');
  const btnAmt = document.getElementById('modeBtnAmt');
  const secPct = document.getElementById('settlePercentSection');
  const secAmt = document.getElementById('settleAmountSection');

  if (btnPct) btnPct.classList.toggle('active', mode === 'percent');
  if (btnAmt) btnAmt.classList.toggle('active', mode === 'amount');
  if (secPct) secPct.style.display = mode === 'percent' ? 'block' : 'none';
  if (secAmt) secAmt.style.display = mode === 'amount' ? 'block' : 'none';

  updateSettlePreview();
}

function openSettleModal(type, targetId, totalAmount) {
  currentSettleTarget = { type, id: targetId, amount: totalAmount };

  const titleEl = document.getElementById('settleModalTitle');
  const amountEl = document.getElementById('settleTotalAmount');
  const amtInput = document.getElementById('settleAmountInput');

  if (type === 'debt') {
    const debt = appState.debts.find(d => d.id === targetId);
    titleEl.textContent = `Saldar: ${debt ? debt.concept : ''}`;
  } else {
    const friendName = getFriendName(targetId);
    titleEl.textContent = `Saldar balance con ${friendName}`;
  }

  amountEl.textContent = formatMoney(totalAmount);
  if (amtInput) {
    amtInput.max = totalAmount;
    amtInput.value = totalAmount;
  }

  setSettleMode('percent');
  selectPercentPreset(100);

  document.getElementById('settleModal').showModal();
}

function selectPercentPreset(pct) {
  const pctInput = document.getElementById('settlePercentageInput');
  if (pctInput) pctInput.value = pct;

  document.querySelectorAll('.percent-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.pct) === Number(pct));
  });

  const total = currentSettleTarget.amount;
  const payAmount = parseFloat((total * (pct / 100)).toFixed(2));
  const amtInput = document.getElementById('settleAmountInput');
  if (amtInput) amtInput.value = payAmount;

  updateSettlePreview();
}

function onCustomPercentInput() {
  const pctInput = document.getElementById('settlePercentageInput');
  const pct = Number(pctInput.value);

  document.querySelectorAll('.percent-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.pct) === pct);
  });

  const total = currentSettleTarget.amount;
  if (!isNaN(pct) && pct > 0 && pct <= 100) {
    const payAmount = parseFloat((total * (pct / 100)).toFixed(2));
    const amtInput = document.getElementById('settleAmountInput');
    if (amtInput) amtInput.value = payAmount;
  }

  updateSettlePreview();
}

function onCustomAmountInput() {
  const amtInput = document.getElementById('settleAmountInput');
  const amt = Number(amtInput.value);
  const total = currentSettleTarget.amount;

  if (!isNaN(amt) && amt > 0 && amt <= total) {
    const pct = Math.min(100, Math.max(1, Math.round((amt / total) * 100)));
    const pctInput = document.getElementById('settlePercentageInput');
    if (pctInput) pctInput.value = pct;

    document.querySelectorAll('.percent-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.pct) === pct);
    });
  } else {
    document.querySelectorAll('.percent-btn').forEach(btn => btn.classList.remove('active'));
  }

  updateSettlePreview();
}

function updateSettlePreview() {
  const total = currentSettleTarget.amount;
  const previewEl = document.getElementById('settlePreviewText');
  if (!previewEl) return;

  if (currentSettleMode === 'percent') {
    const pct = Number(document.getElementById('settlePercentageInput').value);
    if (isNaN(pct) || pct <= 0) {
      previewEl.innerHTML = '<span style="color: var(--negative);">Ingresa un porcentaje mayor a 0.</span>';
      return;
    }
    if (pct > 100) {
      previewEl.innerHTML = '<span style="color: var(--negative);">El porcentaje no puede ser mayor al 100%.</span>';
      return;
    }
    const payAmount = parseFloat((total * (pct / 100)).toFixed(2));
    const remaining = parseFloat((total - payAmount).toFixed(2));
    previewEl.innerHTML = `Saldar <strong>${pct}%</strong> (${formatMoney(payAmount)}) • Saldo restante: <strong>${formatMoney(remaining)}</strong>`;
  } else {
    const amt = Number(document.getElementById('settleAmountInput').value);
    if (isNaN(amt) || amt <= 0) {
      previewEl.innerHTML = '<span style="color: var(--negative);">Ingresa un monto mayor a $0.</span>';
      return;
    }
    if (amt > total) {
      previewEl.innerHTML = `<span style="color: var(--negative);">El monto no puede superar la deuda pendiente (${formatMoney(total)}).</span>`;
      return;
    }
    const remaining = parseFloat((total - amt).toFixed(2));
    const pct = parseFloat(((amt / total) * 100).toFixed(1));
    previewEl.innerHTML = `Saldar <strong>${formatMoney(amt)}</strong> (${pct}%) • Saldo restante: <strong>${formatMoney(remaining)}</strong>`;
  }
}

function confirmSettle(e) {
  e.preventDefault();
  const total = currentSettleTarget.amount;

  if (currentSettleMode === 'percent') {
    const pct = Number(document.getElementById('settlePercentageInput').value);
    if (isNaN(pct) || pct <= 0) {
      alert('Ingresa un porcentaje válido mayor a 0.');
      return;
    }
    if (pct > 100) {
      alert('El porcentaje no puede superar el 100%.');
      return;
    }

    if (currentSettleTarget.type === 'debt') {
      settleDebtPartial(currentSettleTarget.id, pct);
    } else if (currentSettleTarget.type === 'friend') {
      settleFriendBalancePartial(currentSettleTarget.id, pct);
    }
  } else {
    const amt = Number(document.getElementById('settleAmountInput').value);
    if (isNaN(amt) || amt <= 0) {
      alert('Ingresa un monto válido mayor a $0.');
      return;
    }
    if (amt > total) {
      alert(`El monto no puede superar la deuda pendiente (${formatMoney(total)}).`);
      return;
    }

    if (currentSettleTarget.type === 'debt') {
      settleDebtByAmount(currentSettleTarget.id, amt);
    } else if (currentSettleTarget.type === 'friend') {
      const pct = Math.min(100, (amt / total) * 100);
      settleFriendBalancePartial(currentSettleTarget.id, pct);
    }
  }

  document.getElementById('settleModal').close();
  renderAll();
}

/* ==========================================================================
   GASTOS GRUPALES
   ========================================================================== */
function renderGroupMemberSelection() {
  const container = document.getElementById('groupMembersSelection');
  const tipEl = document.getElementById('noFriendsTipGroups');

  if (appState.friends.length === 0) {
    tipEl.style.display = 'block';
    container.innerHTML = '';
    return;
  }
  tipEl.style.display = 'none';

  let html = `
    <label class="checkbox-label" style="opacity: 0.8;">
      <input type="checkbox" checked disabled />
      ${appState.user.name} (Tu)
    </label>
  `;

  appState.friends.forEach(f => {
    html += `
      <label class="checkbox-label">
        <input type="checkbox" name="groupFriendMember" value="${f.id}" />
        ${f.name}
      </label>
    `;
  });

  container.innerHTML = html;
}

function createGroup(e) {
  e.preventDefault();
  const nameInput = document.getElementById('groupName');
  const name = nameInput.value.trim();
  if (!name) return;

  const selectedFriends = Array.from(document.querySelectorAll('input[name="groupFriendMember"]:checked')).map(cb => cb.value);

  if (selectedFriends.length === 0) {
    alert('Selecciona al menos 1 amigo para formar el grupo.');
    return;
  }

  appState.groups.push({
    id: 'g_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    name: name,
    memberIds: ['user_me', ...selectedFriends]
  });

  saveState();
  nameInput.value = '';
  renderAll();
}

function deleteGroup(groupId) {
  const grp = appState.groups.find(g => g.id === groupId);
  if (!grp) return;
  if (!confirm(`Eliminar grupo "${grp.name}"?`)) return;

  appState.groups = appState.groups.filter(g => g.id !== groupId);
  saveState();
  renderAll();
}

function openExpenseModal(groupId) {
  const grp = appState.groups.find(g => g.id === groupId);
  if (!grp) return;

  document.getElementById('modalGroupId').value = groupId;
  document.getElementById('modalGroupTitle').textContent = `Gasto en "${grp.name}"`;
  document.getElementById('modalExpenseAmount').value = '';
  document.getElementById('modalExpenseConcept').value = '';

  const payerSel = document.getElementById('modalExpensePayer');
  payerSel.innerHTML = '';
  grp.memberIds.forEach(mId => {
    const opt = document.createElement('option');
    opt.value = mId;
    opt.textContent = (mId === 'user_me') ? `${appState.user.name} (Tu)` : getFriendName(mId);
    payerSel.appendChild(opt);
  });

  const checkContainer = document.getElementById('modalMembersCheckboxes');
  let html = '';
  grp.memberIds.forEach(mId => {
    const displayName = (mId === 'user_me') ? `${appState.user.name} (Tu)` : getFriendName(mId);
    html += `
      <label class="checkbox-label">
        <input type="checkbox" name="splitMember" value="${mId}" checked />
        ${displayName}
      </label>
    `;
  });
  checkContainer.innerHTML = html;

  updateSplitPreview();
  document.getElementById('expenseModal').showModal();
}

function updateSplitPreview() {
  const amount = parseFloat(document.getElementById('modalExpenseAmount').value) || 0;
  const checked = document.querySelectorAll('input[name="splitMember"]:checked');
  const count = checked.length;
  const previewEl = document.getElementById('splitPreviewText');

  if (amount > 0 && count > 0) {
    const perPerson = (amount / count).toFixed(2);
    previewEl.innerHTML = `Total ${formatMoney(amount)} entre ${count} participantes = <strong>${formatMoney(perPerson)} c/u</strong>`;
  } else {
    previewEl.textContent = 'Indica participantes y monto para calcular.';
  }
}

function saveGroupExpense(e) {
  e.preventDefault();
  const groupId = document.getElementById('modalGroupId').value;
  const grp = appState.groups.find(g => g.id === groupId);
  if (!grp) return;

  const payerId = document.getElementById('modalExpensePayer').value;
  const amount = parseFloat(document.getElementById('modalExpenseAmount').value);
  // Concepto opcional: si está vacío se usa el nombre del grupo
  const concept = document.getElementById('modalExpenseConcept').value.trim() || grp.name;
  const checkedMembers = Array.from(document.querySelectorAll('input[name="splitMember"]:checked')).map(cb => cb.value);

  if (!amount || amount <= 0) {
    alert('Monto invalido.');
    return;
  }

  if (checkedMembers.length === 0) {
    alert('Selecciona al menos 1 participante.');
    return;
  }

  const share = parseFloat((amount / checkedMembers.length).toFixed(2));
  const dateStr = new Date().toLocaleDateString('es-AR');

  if (payerId === 'user_me') {
    // Yo pagué el gasto: cada amigo participante me debe su parte
    checkedMembers.forEach(memberId => {
      if (memberId !== 'user_me') {
        appState.debts.unshift({
          id: 'd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          friendId: memberId,
          direction: 'lent', // El amigo me debe
          amount: share,
          concept: `${concept} (${grp.name})`,
          date: dateStr,
          settled: false,
          groupId: groupId
        });
      }
    });
  } else {
    // Un amigo pagó: si yo participé, yo le debo al amigo mi parte
    if (checkedMembers.includes('user_me')) {
      appState.debts.unshift({
        id: 'd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        friendId: payerId,
        direction: 'borrowed', // Debo al amigo
        amount: share,
        concept: `${concept} (${grp.name})`,
        date: dateStr,
        settled: false,
        groupId: groupId
      });
    }
  }

  saveState();
  document.getElementById('expenseModal').close();
  renderAll();
}

function renderGroups() {
  const listEl = document.getElementById('groupsList');
  if (appState.groups.length === 0) {
    listEl.innerHTML = '<div class="empty-msg">No hay grupos creados.</div>';
    return;
  }

  let html = '';
  appState.groups.forEach(g => {
    const memberNames = g.memberIds.map(mId => (mId === 'user_me') ? appState.user.name : getFriendName(mId));
    const tagsHtml = memberNames.map(name => `<span class="member-tag">${name}</span>`).join('');
    const groupDebts = appState.debts.filter(d => d.groupId === g.id);

    html += `
      <div class="group-card">
        <div class="group-header">
          <h3 style="font-size: 0.95rem; font-weight: 700;">${g.name}</h3>
          <button class="btn-text-danger" onclick="deleteGroup('${g.id}')">Eliminar</button>
        </div>
        <div class="member-tags">
          ${tagsHtml}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-subtle);">
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            ${groupDebts.length} partes cargadas
          </div>
          <button class="btn btn-primary btn-sm" onclick="openExpenseModal('${g.id}')">
            + Gasto
          </button>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

/* ==========================================================================
   NAVEGACIÓN DE PESTAÑAS
   ========================================================================== */
function switchTab(tabKey) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('section[id^="tab-"]').forEach(sec => sec.style.display = 'none');

  if (tabKey === 'friends') {
    document.querySelectorAll('.tab-btn')[0].classList.add('active');
    document.getElementById('tab-friends').style.display = 'block';
  } else if (tabKey === 'debts') {
    document.querySelectorAll('.tab-btn')[1].classList.add('active');
    document.getElementById('tab-debts').style.display = 'block';
  } else if (tabKey === 'groups') {
    document.querySelectorAll('.tab-btn')[2].classList.add('active');
    document.getElementById('tab-groups').style.display = 'block';
  }
}

/* ==========================================================================
   RENDER GENERAL
   ========================================================================== */
function renderAll() {
  document.getElementById('userNameDisplay').textContent = appState.user.name;
  updateOverviewDOM();
  renderFriendsList();
  populateFriendSelect();
  renderDebts();
  renderGroupMemberSelection();
  renderGroups();
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  renderAll();
});

