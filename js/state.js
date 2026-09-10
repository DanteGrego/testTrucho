/**
 * state.js - Manejo del estado, persistencia en localStorage y lógica contable
 */

const STORAGE_KEY = 'cuentas_app_data_v3';

let appState = {
  user: { id: 'user_me', name: 'Yo' },
  friends: [],
  debts: [], // Deudas directas o partes grupales entre user_me y un amigo
  groups: []
};

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      appState.user = parsed.user || { id: 'user_me', name: 'Yo' };
      appState.friends = parsed.friends || [];
      appState.debts = parsed.debts || [];
      appState.groups = parsed.groups || [];
    }
  } catch (e) {
    console.error('Error al cargar datos:', e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (e) {
    console.error('Error al guardar datos:', e);
  }
}

function formatMoney(amount) {
  return '$' + Number(amount).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function getFriendName(id) {
  const friend = appState.friends.find(f => f.id === id);
  return friend ? friend.name : 'Desconocido';
}

/**
 * Retorna el balance neto entre el usuario principal y un amigo específico.
 * Positivo: El amigo me debe dinero.
 * Negativo: Debo dinero al amigo.
 */
function getNetBalanceWithFriend(friendId) {
  let balance = 0;
  appState.debts.forEach(d => {
    if (d.settled) return;
    if (d.friendId === friendId) {
      if (d.direction === 'lent') {
        balance += d.amount; // Amigo me debe
      } else if (d.direction === 'borrowed') {
        balance -= d.amount; // Debo al amigo
      }
    }
  });
  return balance;
}

/**
 * Calcula los totales generales de balances para la cabecera.
 */
function getOverviewBalances() {
  let totalOwedToMe = 0;
  let totalIOwe = 0;

  appState.friends.forEach(friend => {
    const net = getNetBalanceWithFriend(friend.id);
    if (net > 0) {
      totalOwedToMe += net;
    } else if (net < 0) {
      totalIOwe += Math.abs(net);
    }
  });

  const netTotal = totalOwedToMe - totalIOwe;
  return { totalOwedToMe, totalIOwe, netTotal };
}

/**
 * Salda una deuda individual (total o porcentaje parcial).
 */
function settleDebtPartial(debtId, percentage) {
  const debt = appState.debts.find(d => d.id === debtId);
  if (!debt || debt.settled) return false;

  const pct = Math.min(100, Math.max(1, Number(percentage)));

  if (pct >= 100) {
    debt.settled = true;
  } else {
    const settledAmount = parseFloat((debt.amount * (pct / 100)).toFixed(2));
    const remainingAmount = parseFloat((debt.amount - settledAmount).toFixed(2));

    if (remainingAmount <= 0.01) {
      debt.settled = true;
    } else {
      // Ajustar deuda activa al saldo restante
      debt.amount = remainingAmount;
      // Generar registro histórico de pago saldado
      appState.debts.unshift({
        id: 'd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        friendId: debt.friendId,
        direction: debt.direction,
        amount: settledAmount,
        concept: `${debt.concept} (Pago ${pct}%)`,
        date: new Date().toLocaleDateString('es-AR'),
        settled: true,
        groupId: debt.groupId || null
      });
    }
  }

  saveState();
  return true;
}

/**
 * Salda el balance total con un amigo (total o porcentaje parcial).
 */
function settleFriendBalancePartial(friendId, percentage) {
  const friend = appState.friends.find(f => f.id === friendId);
  if (!friend) return false;

  const net = getNetBalanceWithFriend(friendId);
  if (Math.abs(net) <= 0.01) return false;

  const pct = Math.min(100, Math.max(1, Number(percentage)));
  const activeDebts = appState.debts.filter(d => !d.settled && d.friendId === friendId);

  if (pct >= 100) {
    activeDebts.forEach(d => { d.settled = true; });
  } else {
    activeDebts.forEach(d => {
      const settledAmount = parseFloat((d.amount * (pct / 100)).toFixed(2));
      const remainingAmount = parseFloat((d.amount - settledAmount).toFixed(2));
      if (remainingAmount <= 0.01) {
        d.settled = true;
      } else {
        d.amount = remainingAmount;
        appState.debts.unshift({
          id: 'd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          friendId: d.friendId,
          direction: d.direction,
          amount: settledAmount,
          concept: `${d.concept} (Pago ${pct}%)`,
          date: new Date().toLocaleDateString('es-AR'),
          settled: true,
          groupId: d.groupId || null
        });
      }
    });
  }

  saveState();
  return true;
}

/* Backups y datos de prueba */
function loadSampleData() {
  if (appState.friends.length > 0 && !confirm('Reemplazar con datos de ejemplo?')) return;

  const today = new Date().toLocaleDateString('es-AR');
  appState = {
    user: { id: 'user_me', name: 'Yo' },
    friends: [
      { id: 'f_lucas', name: 'Lucas' },
      { id: 'f_sofia', name: 'Sofia' },
      { id: 'f_martin', name: 'Martin' }
    ],
    debts: [
      { id: 'd_1', friendId: 'f_lucas', direction: 'lent', amount: 3500, concept: 'Cena', date: today, settled: false, groupId: null },
      { id: 'd_2', friendId: 'f_sofia', direction: 'borrowed', amount: 1200, concept: 'Helado', date: today, settled: false, groupId: null },
      { id: 'd_3', friendId: 'f_martin', direction: 'borrowed', amount: 4000, concept: 'Asado', date: today, settled: false, groupId: 'g_asado' }
    ],
    groups: [
      { id: 'g_asado', name: 'Asado', memberIds: ['user_me', 'f_lucas', 'f_martin'] }
    ]
  };

  saveState();
}

function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
  const dl = document.createElement('a');
  dl.setAttribute("href", dataStr);
  dl.setAttribute("download", "cuentas_backup.json");
  dl.click();
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (imported.friends && imported.debts) {
          appState = imported;
          saveState();
          if (typeof renderAll === 'function') renderAll();
          alert('Datos importados.');
        } else {
          alert('Formato no valido.');
        }
      } catch (err) {
        alert('Error al leer archivo.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function resetData() {
  if (confirm('Reiniciar todos los datos?')) {
    localStorage.removeItem(STORAGE_KEY);
    appState = {
      user: { id: 'user_me', name: 'Yo' },
      friends: [],
      debts: [],
      groups: []
    };
    saveState();
    if (typeof renderAll === 'function') renderAll();
  }
}

