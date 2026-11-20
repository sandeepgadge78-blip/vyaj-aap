// १. Hishob (hishob-4b548) साठी अचूक Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDYpC1Pdm9jDtmNlT2J6BOPzk88QvBo8ds",
  authDomain: "hishob-4b548.firebaseapp.com",
  projectId: "hishob-4b548",
  storageBucket: "hishob-4b548.firebasestorage.app",
  messagingSenderId: "528801714157",
  appId: "1:528801714157:web:c7e43ad3b05203b87be1e4",
  measurementId: "G-RH91B88LZB"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

async function ensurePersistenceEnabled() {
  try {
    await db.enablePersistence({ synchronizeTabs: true });
  } catch (_) {}
}
ensurePersistenceEnabled();

// २. अ‍ॅप स्टेट व Auto-lock टायमर
const state = {
  user: null,
  borrowers: [],
  auditLogs: [],
  unsubscribeBorrowers: null,
  unsubscribeAudit: null,
  autoLockTimer: null,
  autoLockMs: 300000
};

const currentYmDefault = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

document.getElementById('bStartYm').value = currentYmDefault();
document.getElementById('activeYm').value = currentYmDefault();

function resetAutoLockTimer() {
  if (state.autoLockTimer) {
    clearTimeout(state.autoLockTimer);
    state.autoLockTimer = null;
  }
  if (!state.user) return;
  state.autoLockTimer = setTimeout(() => {
    performFullLockAndLogout();
  }, state.autoLockMs);
}

['click', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
  window.addEventListener(evt, resetAutoLockTimer, { passive: true });
});

document.getElementById('autoLockSelect').addEventListener('change', (e) => {
  state.autoLockMs = Number(e.target.value || 300000);
  resetAutoLockTimer();
});

// ३. Safe Chunked Base64 Helpers
function uint8ToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function base64ToUint8(base64Str) {
  const binary = atob(base64Str);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ४. Web Crypto AES-GCM Encryption (युजर Passkey अनिवार्य)
async function deriveAesKey(passkey, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passkey),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 150000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptPayload(obj, passkey) {
  if (!passkey || passkey.trim().length < 6) {
    throw new Error('कृपया किमान ६ अक्षरांची मजबूत Passkey टाका.');
  }
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveAesKey(passkey, salt);
  const plainBytes = enc.encode(JSON.stringify(obj));
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plainBytes);

  return JSON.stringify({
    v: 12,
    salt: uint8ToBase64(salt),
    iv: uint8ToBase64(iv),
    data: uint8ToBase64(new Uint8Array(cipherBuffer))
  });
}

async function decryptPayload(jsonText, passkey) {
  if (!passkey || passkey.trim().length < 6) {
    throw new Error('डिक्रिप्ट करण्यासाठी योग्य Passkey टाका.');
  }
  const parsed = JSON.parse(jsonText);
  const salt = base64ToUint8(parsed.salt);
  const iv = base64ToUint8(parsed.iv);
  const cipherBytes = base64ToUint8(parsed.data);
  const aesKey = await deriveAesKey(passkey, salt);
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, cipherBytes);
  return JSON.parse(new TextDecoder().decode(plainBuffer));
}

// ५. Audit Log (Append-Only)
async function appendAuditLog(action, details) {
  if (!state.user) return;
  const entry = {
    action,
    details,
    by: state.user.email || state.user.uid,
    ts: new Date().toISOString()
  };
  try {
    await db
      .collection('users')
      .doc(state.user.uid)
      .collection('auditLogs')
      .add(entry);
  } catch (e) {
    console.warn('Audit log write warning:', e.message);
  }
}

// ६. मॅन्युअल "मागील बाकी" आणि मासिक हिशोब गणित
function compareYm(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

function nextYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function computeLedgerUpToMonth(borrower, targetYm) {
  const principal = Number(borrower.principal || 0);
  const rate = Number(borrower.rate || 0);
  const paidMonths = borrower.paidMonths || {};
  const customPastDues = borrower.customPastDues || {};
  const customCashPaid = borrower.customCashPaid || {};

  let runningPastDue = 0;
  let cursor = borrower.startYm || targetYm;
  let guard = 0;

  while (compareYm(cursor, targetYm) <= 0 && guard < 240) {
    guard++;
    const monthlyInterest = Math.round((principal * rate) / 100);
    const isPaid = Boolean(paidMonths[cursor]);

    if (Object.prototype.hasOwnProperty.call(customPastDues, cursor)) {
      runningPastDue += Number(customPastDues[cursor] || 0);
    }

    if (Object.prototype.hasOwnProperty.call(customCashPaid, cursor)) {
      runningPastDue = Math.max(0, runningPastDue - Number(customCashPaid[cursor] || 0));
    }

    if (cursor === targetYm) {
      const currentDue = isPaid ? 0 : monthlyInterest;
      const totalPayable = Math.max(0, runningPastDue) + currentDue;
      return {
        principal,
        monthlyInterest,
        isPaid,
        pastDue: Math.max(0, runningPastDue),
        totalPayable
      };
    }

    if (!isPaid) {
      runningPastDue += monthlyInterest;
    }

    cursor = nextYm(cursor);
  }

  const monthlyInterest = Math.round((principal * rate) / 100);
  const isPaid = Boolean(paidMonths[targetYm]);
  return {
    principal,
    monthlyInterest,
    isPaid,
    pastDue: Math.max(0, runningPastDue),
    totalPayable: Math.max(0, runningPastDue) + (isPaid ? 0 : monthlyInterest)
  };
}

// ७. हप्ता जमा/रद्द, मॅन्युअल बाकी कपात, मॅन्युअल बाकी काढणे व मुद्दल कमी करणे
async function toggleMonthPayment(borrowerId, ym, currentlyPaid) {
  if (!state.user) return;
  const docRef = db.collection('users').doc(state.user.uid).collection('borrowers').doc(borrowerId);

  if (currentlyPaid) {
    await docRef.update({
      [`paidMonths.${ym}`]: firebase.firestore.FieldValue.delete()
    });
    await appendAuditLog('PAYMENT_CANCELLED', `${borrowerId} साठी ${ym} चा हप्ता रद्द केला`);
  } else {
    await docRef.update({
      [`paidMonths.${ym}`]: { paidAt: new Date().toISOString() }
    });
    await appendAuditLog('PAYMENT_MARKED', `${borrowerId} साठी ${ym} चा हप्ता जमा केला`);
  }
}

async function payCustomPastDue(borrowerId, ym, currentPastDue) {
  if (!state.user) return;
  const inputEl = document.getElementById(`payPastInput_${borrowerId}`);
  const amountToPay = Number(inputEl ? inputEl.value : 0);
  if (!amountToPay || amountToPay <= 0) {
    alert('कृपया जमा करायची रक्कम (₹) टाका.');
    return;
  }

  const docRef = db.collection('users').doc(state.user.uid).collection('borrowers').doc(borrowerId);
  const existingBorrower = state.borrowers.find(b => b.id === borrowerId) || {};
  const prevCashPaid = Number((existingBorrower.customCashPaid && existingBorrower.customCashPaid[ym]) || 0);
  const newPastDue = Math.max(0, Number(currentPastDue || 0) - amountToPay);

  const updatePayload = {
    [`customCashPaid.${ym}`]: prevCashPaid + amountToPay
  };

  if (newPastDue === 0 && existingBorrower.customPastDues && Object.prototype.hasOwnProperty.call(existingBorrower.customPastDues, ym)) {
    updatePayload[`customPastDues.${ym}`] = firebase.firestore.FieldValue.delete();
  }

  await docRef.update(updatePayload);
  if (inputEl) inputEl.value = '';
  await appendAuditLog('PAST_DUE_PAID', `${borrowerId} (${ym}) मधून ₹${amountToPay} जमा केले; उरलेली बाकी ₹${newPastDue}`);
}

async function clearManualPastDueForMonth(borrowerId, ym) {
  if (!state.user) return;
  const docRef = db.collection('users').doc(state.user.uid).collection('borrowers').doc(borrowerId);
  await docRef.update({
    [`customPastDues.${ym}`]: firebase.firestore.FieldValue.delete(),
    [`customCashPaid.${ym}`]: firebase.firestore.FieldValue.delete()
  });
  await appendAuditLog('MANUAL_DUE_REMOVED', `${borrowerId} (${ym}) ची मॅन्युअल बाकी नोंद काढून टाकली`);
}

async function reducePrincipal(borrowerId, currentPrincipal) {
  if (!state.user) return;
  const inputEl = document.getElementById(`reducePrincipalInput_${borrowerId}`);
  const reduceAmt = Number(inputEl ? inputEl.value : 0);
  if (!reduceAmt || reduceAmt <= 0) {
    alert('कृपया कमी करायची मुद्दल रक्कम (₹) टाका.');
    return;
  }
  const nextPrincipal = Math.max(0, Number(currentPrincipal || 0) - reduceAmt);
  const docRef = db.collection('users').doc(state.user.uid).collection('borrowers').doc(borrowerId);
  await docRef.update({ principal: nextPrincipal });
  if (inputEl) inputEl.value = '';
  await appendAuditLog('PRINCIPAL_REDUCED', `${borrowerId} मुद्दल ₹${reduceAmt} ने कमी करून ₹${nextPrincipal} केले`);
}

// ८. Safe CSV Parser व HTML Escaping
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// ९. UI Render (५-लाईन कार्ड माहितीसह)
function renderBorrowers() {
  const container = document.getElementById('borrowersList');
  const activeYm = document.getElementById('activeYm').value || currentYmDefault();
  const query = (document.getElementById('searchInput').value || '').trim().toLowerCase();

  const filtered = state.borrowers.filter(b =>
    !query || String(b.name || '').toLowerCase().includes(query)
  );

  if (!filtered.length) {
    container.innerHTML = '<p class="muted">कोणतीही कर्ज/व्याज नोंद आढळली नाही.</p>';
    return;
  }

  container.innerHTML = filtered.map(b => {
    const calc = computeLedgerUpToMonth(b, activeYm);
    return `
      <div class="borrower-item">
        <div><strong>1. ग्राहक:</strong> ${escapeHtml(b.name || 'नाव नाही')} (${calc.isPaid ? 'हप्ता जमा' : 'प्रलंबित'})</div>
        <div><strong>2. मुद्दल व दर:</strong> ₹${calc.principal} (दर ${b.rate || 0}%)</div>
        <div><strong>3. मासिक व्याज:</strong> ₹${calc.monthlyInterest}</div>
        <div><strong>4. चालू महिना जमा स्थिती:</strong> ${calc.isPaid ? `${activeYm} जमा` : `${activeYm} बाकी`}</div>
        <div><strong>5. मागील बाकी व एकूण देणे:</strong> मागील बाकी ₹${calc.pastDue} | एकूण देणे <strong class="ok">₹${calc.totalPayable}</strong></div>
        <div style="margin-top:10px;" class="row">
          <button data-action="toggle-pay" data-id="${b.id}" data-ym="${activeYm}" data-paid="${calc.isPaid}" class="${calc.isPaid ? 'danger' : 'success'}">
            ${calc.isPaid ? 'हप्ता रद्द करा' : 'चालू हप्ता जमा करा'}
          </button>
          <input type="number" id="payPastInput_${b.id}" placeholder="मागील बाकी जमा (₹)" min="1" style="width:165px;" />
          <button data-action="pay-past" data-id="${b.id}" data-ym="${activeYm}" data-past="${calc.pastDue}" class="primary">
            मागील बाकी कपात करा
          </button>
          <button data-action="clear-past" data-id="${b.id}" data-ym="${activeYm}" class="warn">
            मॅन्युअल बाकी काढा
          </button>
          <input type="number" id="reducePrincipalInput_${b.id}" placeholder="मुद्दल कपात (₹)" min="1" style="width:150px;" />
          <button data-action="reduce-principal" data-id="${b.id}" data-principal="${calc.principal}">
            मुद्दल कमी करा
          </button>
        </div>
      </div>
    `;
  }).join('');
}

document.getElementById('borrowersList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  const id = btn.getAttribute('data-id');
  const ym = btn.getAttribute('data-ym');

  if (action === 'toggle-pay') {
    toggleMonthPayment(id, ym, btn.getAttribute('data-paid') === 'true');
  } else if (action === 'pay-past') {
    payCustomPastDue(id, ym, Number(btn.getAttribute('data-past') || 0));
  } else if (action === 'clear-past') {
    clearManualPastDueForMonth(id, ym);
  } else if (action === 'reduce-principal') {
    reducePrincipal(id, Number(btn.getAttribute('data-principal') || 0));
  }
});

function renderAuditLogs() {
  const box = document.getElementById('auditList');
  if (!state.auditLogs.length) {
    box.innerHTML = '<div class="muted">कोणत्याही Audit नोंदी नाहीत.</div>';
    return;
  }
  box.innerHTML = state.auditLogs.map(log => `
    <div style="padding:4px 0; border-bottom:1px solid #1e293b;">
      <span class="muted">[${escapeHtml(log.ts || '')}]</span>
      <strong>${escapeHtml(log.action || '')}</strong> — ${escapeHtml(log.details || '')}
    </div>
  `).join('');
}

// १०. नवीन ग्राहक जोडणे व फिल्टर्स
document.getElementById('addBorrowerBtn').addEventListener('click', async () => {
  if (!state.user) return;
  const name = document.getElementById('bName').value.trim();
  const principal = Number(document.getElementById('bPrincipal').value || 0);
  const rate = Number(document.getElementById('bRate').value || 0);
  const startYm = document.getElementById('bStartYm').value || currentYmDefault();
  const customDue = Number(document.getElementById('bCustomDue').value || 0);

  if (!name || principal <= 0) {
    alert('कृपया ग्राहकाचे नाव आणि मुद्दल रक्कम टाका.');
    return;
  }

  const payload = {
    name,
    principal,
    rate,
    startYm,
    paidMonths: {},
    customPastDues: customDue > 0 ? { [startYm]: customDue } : {},
    customCashPaid: {},
    createdAt: new Date().toISOString()
  };

  await db.collection('users').doc(state.user.uid).collection('borrowers').add(payload);
  await appendAuditLog('BORROWER_ADDED', `${name} (मुद्दल ₹${principal}, सुरू ${startYm})`);

  document.getElementById('bName').value = '';
  document.getElementById('bPrincipal').value = '';
  document.getElementById('bCustomDue').value = '';
});

document.getElementById('activeYm').addEventListener('change', renderBorrowers);
document.getElementById('searchInput').addEventListener('input', renderBorrowers);

// ११. Google Sheet Import
document.getElementById('importSheetBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg');
  const raw = document.getElementById('sheetUrlInput').value.trim();
  if (!raw || !state.user) {
    msgEl.textContent = 'कृपया Google Sheet URL किंवा ID टाका.';
    return;
  }

  let fetchUrl = raw;
  const idMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (idMatch) {
    fetchUrl = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv`;
  } else if (/^[a-zA-Z0-9-_]{20,}$/.test(raw)) {
    fetchUrl = `https://docs.google.com/spreadsheets/d/${raw}/export?format=csv`;
  }

  try {
    msgEl.textContent = 'Google Sheet मधून डेटा वाचत आहे...';
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csvText = await res.text();
    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let importedCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const name = cols[0];
      const principal = Number(cols[1] || 0);
      const rate = Number(cols[2] || 2);
      const startYm = cols[3] || currentYmDefault();
      if (name && principal > 0) {
        await db.collection('users').doc(state.user.uid).collection('borrowers').add({
          name,
          principal,
          rate,
          startYm,
          paidMonths: {},
          customPastDues: {},
          customCashPaid: {},
          importedFromSheet: true,
          createdAt: new Date().toISOString()
        });
        importedCount++;
      }
    }
    await appendAuditLog('SHEET_IMPORT', `${importedCount} नोंदी Sheet मधून आयात केल्या`);
    msgEl.textContent = `${importedCount} नोंदी यशस्वीरीत्या आयात झाल्या.`;
  } catch (err) {
    msgEl.textContent = `Sheet Import एरर: ${err.message}`;
  }
});

// १२. Encrypted Export & Restore
document.getElementById('exportEncBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg');
  const passkey = document.getElementById('backupPasskey').value;
  try {
    const bundle = { exportedAt: new Date().toISOString(), borrowers: state.borrowers };
    const encryptedStr = await encryptPayload(bundle, passkey);
    const blob = new Blob([encryptedStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hishob-backup-${currentYmDefault()}.enc.json`;
    a.click();
    URL.revokeObjectURL(url);
    msgEl.textContent = 'Encrypted बॅकअप फाईल तयार झाली.';
  } catch (err) {
    msgEl.textContent = `बॅकअप एरर: ${err.message}`;
  }
});

document.getElementById('importEncBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg');
  const passkey = document.getElementById('backupPasskey').value;
  const fileInput = document.getElementById('importEncFile');
  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    msgEl.textContent = 'कृपया बॅकअप फाईल निवडा.';
    return;
  }
  try {
    const text = await file.text();
    const restored = await decryptPayload(text, passkey);
    const list = Array.isArray(restored.borrowers) ? restored.borrowers : [];
    for (const item of list) {
      const cleanCopy = { ...item };
      delete cleanCopy.id;
      await db.collection('users').doc(state.user.uid).collection('borrowers').add(cleanCopy);
    }
    await appendAuditLog('ENCRYPTED_RESTORE', `${list.length} नोंदी रिस्टोर केल्या`);
    msgEl.textContent = `${list.length} नोंदी यशस्वीरीत्या रिस्टोर झाल्या.`;
  } catch (err) {
    msgEl.textContent = `रिस्टोर एरर: ${err.message}`;
  }
});

// १३. Login, खरा Lock (auth.signOut()) व स्टोरेज साफ करणे
document.getElementById('emailLoginBtn').addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassword').value;
  const msg = document.getElementById('authMsg');
  msg.textContent = 'लॉगिन होत आहे...';
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    msg.textContent = '';
  } catch (e) {
    msg.textContent = `लॉगिन अयशस्वी: ${e.message}`;
  }
});

document.getElementById('googleLoginBtn').addEventListener('click', async () => {
  const msg = document.getElementById('authMsg');
  msg.textContent = 'Google Login सुरू आहे...';
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
    msg.textContent = '';
  } catch (e) {
    msg.textContent = `Google Login एरर: ${e.message}`;
  }
});

async function performFullLockAndLogout() {
  if (state.autoLockTimer) {
    clearTimeout(state.autoLockTimer);
    state.autoLockTimer = null;
  }
  if (typeof state.unsubscribeBorrowers === 'function') {
    state.unsubscribeBorrowers();
    state.unsubscribeBorrowers = null;
  }
  if (typeof state.unsubscribeAudit === 'function') {
    state.unsubscribeAudit();
    state.unsubscribeAudit = null;
  }
  state.borrowers = [];
  state.auditLogs = [];

  try {
    await auth.signOut();
  } catch (_) {}

  try {
    localStorage.removeItem('vyaj_v11_audit');
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('vyaj_') || k.startsWith('hishob_')) {
        localStorage.removeItem(k);
      }
    });
    sessionStorage.clear();
  } catch (_) {}

  try {
    await db.terminate();
    await db.clearPersistence();
  } catch (_) {}

  window.location.reload();
}

document.getElementById('lockBtn').addEventListener('click', performFullLockAndLogout);

// १४. Auth State Listener
auth.onAuthStateChanged(async (user) => {
  const authScreen = document.getElementById('authScreen');
  const appScreen = document.getElementById('appScreen');
  const topActions = document.getElementById('topActions');
  const badge = document.getElementById('syncStatus');
  const emailBadge = document.getElementById('userEmailBadge');

  if (typeof state.unsubscribeBorrowers === 'function') {
    state.unsubscribeBorrowers();
    state.unsubscribeBorrowers = null;
  }
  if (typeof state.unsubscribeAudit === 'function') {
    state.unsubscribeAudit();
    state.unsubscribeAudit = null;
  }

  if (!user) {
    state.user = null;
    state.borrowers = [];
    state.auditLogs = [];
    if (state.autoLockTimer) clearTimeout(state.autoLockTimer);
    authScreen.classList.remove('hidden');
    appScreen.classList.add('hidden');
    topActions.classList.add('hidden');
    badge.textContent = 'Locked / Signed Out';
    return;
  }

  await ensurePersistenceEnabled();

  state.user = user;
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  topActions.classList.remove('hidden');
  emailBadge.textContent = user.email || '';
  badge.textContent = 'Live Synced';
  resetAutoLockTimer();

  const userRoot = db.collection('users').doc(user.uid);

  state.unsubscribeBorrowers = userRoot.collection('borrowers').onSnapshot(
    (snap) => {
      state.borrowers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderBorrowers();
    },
    () => {
      badge.textContent = 'Sync Error';
    }
  );

  state.unsubscribeAudit = userRoot.collection('auditLogs')
    .orderBy('ts', 'desc')
    .limit(50)
    .onSnapshot(
      (snap) => {
        state.auditLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAuditLogs();
      },
      () => {
        userRoot.collection('auditLogs').limit(50).get().then(snap => {
          state.auditLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          renderAuditLogs();
        }).catch(() => {});
      }
    );
});

// १५. खऱ्या sw.js फाईलचे सुरक्षित रजिस्ट्रेशन
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

