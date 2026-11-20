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

// २. अ‍ॅप स्टेट
const state = {
  user: null,
  borrowers: [],
  auditLogs: [],
  unsubscribeBorrowers: null,
  unsubscribeAudit: null,
  autoLockTimer: null,
  autoLockMs: 300000,
  currentPassbookBorrowerId: null,
  currentPassbookTab: 'passbook',
  currentDocsBorrowerId: null,
  jobFilter: 'all',
  statusFilter: 'all',
  hideAmounts: false,
  expandAllDetails: false,
  selfWaNumber: localStorage.getItem('hishob_self_wa') || '',
  webhookUrl: localStorage.getItem('hishob_webhook_url') || '',
  todayPromisesCache: [],
  pendingPartialCache: []
};

const currentYmDefault = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const getLocalDateIso = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function fmtAmt(val) {
  if (state.hideAmounts) return '₹••••';
  return `₹${Number(val || 0)}`;
}

document.getElementById('bStartYm').value = currentYmDefault();
document.getElementById('activeYm').value = currentYmDefault();
document.getElementById('selfWaNumber').value = state.selfWaNumber;
document.getElementById('webhookUrlInput').value = state.webhookUrl;

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

// रकमा Hide / Show, Dark/Light Mode, Expand All
document.getElementById('toggleHideAmtBtn').addEventListener('click', (e) => {
  state.hideAmounts = !state.hideAmounts;
  e.target.textContent = state.hideAmounts ? '👁️ रकमा दाखवा' : '👁️ रकमा लपवा';
  renderBorrowers();
});

document.getElementById('toggleThemeBtn').addEventListener('click', (e) => {
  const isLight = document.body.classList.toggle('light-mode');
  e.target.textContent = isLight ? '🌙 Dark' : '☀️ Light';
});

document.getElementById('toggleExpandAllBtn').addEventListener('click', (e) => {
  state.expandAllDetails = !state.expandAllDetails;
  e.target.textContent = state.expandAllDetails ? '📁 सर्व तपशील बंद करा' : '📂 सर्व तपशील उघडा';
  renderBorrowers();
});

// स्वतःचा WhatsApp नंबर व रिमाइंडर
document.getElementById('saveWaNumberBtn').addEventListener('click', async () => {
  const num = document.getElementById('selfWaNumber').value.replace(/\D/g, '');
  const msgEl = document.getElementById('notifStatusMsg');
  if (num.length < 10) {
    msgEl.textContent = 'कृपया योग्य १० अंकी किंवा 91 सहित WhatsApp नंबर टाका.';
    return;
  }
  const formatted = num.length === 10 ? `91${num}` : num;
  state.selfWaNumber = formatted;
  document.getElementById('selfWaNumber').value = formatted;
  localStorage.setItem('hishob_self_wa', formatted);
  if (state.user) {
    try { await db.collection('users').doc(state.user.uid).set({ selfWaNumber: formatted }, { merge: true }); } catch (_) {}
  }
  msgEl.textContent = `स्वतःचा WhatsApp नंबर (${formatted}) सेव्ह झाला.`;
});

function openSelfWhatsApp(messageText) {
  const num = (state.selfWaNumber || document.getElementById('selfWaNumber').value || '').replace(/\D/g, '');
  if (num.length < 10) {
    alert('कृपया आधी तुमचा स्वतःचा WhatsApp नंबर सेव्ह करा.');
    return;
  }
  const target = num.length === 10 ? `91${num}` : num;
  window.open(`https://wa.me/${target}?text=${encodeURIComponent(messageText)}`, '_blank', 'noopener,noreferrer');
}

document.getElementById('waTodayPromiseBtn').addEventListener('click', () => {
  const todayStr = getLocalDateIso(0);
  if (!state.todayPromisesCache.length) {
    alert(`आज (${todayStr}) कोणत्याही ग्राहकाचा बाकी वायदा नाही.`);
    return;
  }
  const lines = state.todayPromisesCache.map((x, idx) => `${idx + 1}. ${x.name} (${x.mobile || '-'}) — बाकी ₹${x.amount}`);
  openSelfWhatsApp(`🔔 *Hishob — आजच्या वायद्याची यादी (${todayStr})*\n\n${lines.join('\n')}`);
});

document.getElementById('waPendingListBtn').addEventListener('click', () => {
  const activeYm = document.getElementById('activeYm').value || currentYmDefault();
  if (!state.pendingPartialCache.length) {
    alert(`${activeYm} साठी कोणतेही बाकी किंवा अर्धवट खाते नाही.`);
    return;
  }
  const lines = state.pendingPartialCache.map((x, idx) => `${idx + 1}. ${x.name} (${x.status === 'partial' ? 'अर्धवट' : 'बाकी'}) — ₹${x.totalPayable} | ${x.mobile || '-'}`);
  openSelfWhatsApp(`📋 *Hishob — बाकी / अर्धवट खात्यांची यादी (${activeYm})*\n\n${lines.join('\n')}`);
});

// सकाळचे मोबाईल Notification
function showBrowserNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body }); } catch (_) {}
}

document.getElementById('enableNotifBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('notifStatusMsg');
  if (!('Notification' in window)) {
    msgEl.textContent = 'तुमच्या ब्राउझरमध्ये Notification सुविधा उपलब्ध नाही.';
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    msgEl.textContent = '✅ मोबाईल Notification चालू झाले आहे!';
    triggerDailyMorningNotification(true);
  } else {
    msgEl.textContent = 'Notification परवानगी नाकारली आहे.';
  }
});

document.getElementById('testNotifBtn').addEventListener('click', () => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    alert('कृपया आधी "🔔 सकाळचे Notification चालू करा" बटण दाबा.');
    return;
  }
  const count = state.todayPromisesCache.length;
  const body = count > 0
    ? `आज ${count} ग्राहकांचे वायदे आहेत आणि ${state.pendingPartialCache.length} खाती बाकी/अर्धवट आहेत.`
    : `आज कोणताही वायदा नाही. एकूण ${state.pendingPartialCache.length} खाती बाकी/अर्धवट आहेत.`;
  showBrowserNotification('Hishob — रिमाइंडर अलर्ट', body);
});

function triggerDailyMorningNotification(force = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const todayStr = getLocalDateIso(0);
  const lastSent = localStorage.getItem('hishob_last_notif_date');
  if (!force && lastSent === todayStr) return;

  if (state.todayPromisesCache.length > 0 || state.pendingPartialCache.length > 0) {
    const promiseNames = state.todayPromisesCache.map(x => x.name).slice(0, 3).join(', ');
    const body = state.todayPromisesCache.length > 0
      ? `आजचे वायदे (${state.todayPromisesCache.length}): ${promiseNames} | एकूण बाकी खाती: ${state.pendingPartialCache.length}`
      : `चालू महिन्याची बाकी/अर्धवट खाती: ${state.pendingPartialCache.length}`;
    showBrowserNotification(`🔔 Hishob सकाळचा रिमाइंडर (${todayStr})`, body);
    localStorage.setItem('hishob_last_notif_date', todayStr);
  }
}

// Notification Bell Modal
document.getElementById('notifBellBtn').addEventListener('click', () => {
  const box = document.getElementById('notifModalContent');
  const todayHtml = state.todayPromisesCache.length
    ? state.todayPromisesCache.map(x => `<div class="meta-box"><strong>${escapeHtml(x.name)}</strong> (${escapeHtml(x.mobile || '-')}) — <strong class="err">${fmtAmt(x.amount)}</strong></div>`).join('')
    : '<p class="muted">आज कोणत्याही ग्राहकाचा वायदा नाही.</p>';
  const pendingHtml = state.pendingPartialCache.length
    ? state.pendingPartialCache.map(x => `<div class="meta-box"><strong>${escapeHtml(x.name)}</strong> (${x.status === 'partial' ? 'अर्धवट' : 'बाकी'}) — <strong class="warn-text">${fmtAmt(x.totalPayable)}</strong></div>`).join('')
    : '<p class="muted">सर्व खात्यांचे व्याज जमा आहे.</p>';
  box.innerHTML = `<h4>📅 आजचे वायदे (${state.todayPromisesCache.length})</h4>${todayHtml}<h4 style="margin-top:12px;">⏳ बाकी / अर्धवट खाती (${state.pendingPartialCache.length})</h4>${pendingHtml}`;
  document.getElementById('notifModal').classList.remove('hidden');
});

document.getElementById('closeNotifModalBtn').addEventListener('click', () => {
  document.getElementById('notifModal').classList.add('hidden');
});

// मराठी Voice Search
document.getElementById('voiceSearchBtn').addEventListener('click', () => {
  const msgEl = document.getElementById('voiceStatusMsg');
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    msgEl.textContent = 'तुमच्या ब्राउझरमध्ये Voice Search उपलब्ध नाही.';
    return;
  }
  const recognition = new SpeechRec();
  recognition.lang = 'mr-IN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  msgEl.textContent = '🎙️ बोला (मराठीत)...';
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript || '';
    document.getElementById('searchInput').value = transcript.trim();
    msgEl.textContent = `शोधले: "${transcript.trim()}"`;
    renderBorrowers();
  };
  recognition.onerror = (err) => { msgEl.textContent = `Voice एरर: ${err.error}`; };
  recognition.onend = () => { if (msgEl.textContent.startsWith('🎙️')) msgEl.textContent = ''; };
  recognition.start();
});

// फिल्टर्स
document.querySelectorAll('button[data-jobfilter]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.jobFilter = btn.getAttribute('data-jobfilter');
    document.querySelectorAll('button[data-jobfilter]').forEach(b => b.classList.remove('filter-active'));
    btn.classList.add('filter-active');
    renderBorrowers();
  });
});

document.querySelectorAll('button[data-statusfilter]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.statusFilter = btn.getAttribute('data-statusfilter');
    document.querySelectorAll('button[data-statusfilter]').forEach(b => b.classList.remove('filter-active'));
    btn.classList.add('filter-active');
    renderBorrowers();
  });
});

// ३. Base64, SHA-256 Digest व AES-GCM Encryption Helpers
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
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function computeSha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveAesKey(passkey, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passkey), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 150000, hash: 'SHA-256' },
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
  const plainText = JSON.stringify(obj);
  const sha256 = await computeSha256Hex(plainText);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveAesKey(passkey, salt);
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(plainText));

  return {
    sha256,
    jsonString: JSON.stringify({
      v: 12,
      sha256,
      salt: uint8ToBase64(salt),
      iv: uint8ToBase64(iv),
      data: uint8ToBase64(new Uint8Array(cipherBuffer))
    })
  };
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
  const plainText = new TextDecoder().decode(plainBuffer);

  if (parsed.sha256) {
    const checkHash = await computeSha256Hex(plainText);
    if (checkHash !== parsed.sha256) {
      throw new Error('SHA-256 तपासणी अयशस्वी! फाईल बदललेली असू शकते.');
    }
  }
  return JSON.parse(plainText);
}

// ४. Audit Log (Append-Only)
async function appendAuditLog(action, details) {
  if (!state.user) return;
  try {
    await db.collection('users').doc(state.user.uid).collection('auditLogs').add({
      action, details, by: state.user.email || state.user.uid, ts: new Date().toISOString()
    });
  } catch (_) {}
}

// ५. हिशोब गणित (Flat / Reducing / Fixed, Partial, Manual Pending, Late Fee)
function compareYm(a, b) { return String(a || '').localeCompare(String(b || '')); }
function nextYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function calculateLateFee(borrower, targetYm, isFullyPaid) {
  if (isFullyPaid) return { lateDays: 0, lateFee: 0 };
  const interestDay = Number(borrower.interestDay || 0);
  const lateFeePerDay = Number(borrower.lateFeePerDay || 0);
  if (!interestDay || !lateFeePerDay) return { lateDays: 0, lateFee: 0 };
  const [y, m] = targetYm.split('-').map(Number);
  const safeDueDay = Math.min(interestDay, new Date(y, m, 0).getDate());
  const dueDate = new Date(y, m - 1, safeDueDay);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (today <= dueDate) return { lateDays: 0, lateFee: 0 };
  const diffDays = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
  return { lateDays: diffDays, lateFee: diffDays * lateFeePerDay };
}

function getMonthlyInterestAmount(borrower) {
  const fixedInt = Number(borrower.fixedMonthlyInterest || 0);
  if (fixedInt > 0) return Math.round(fixedInt);
  const principal = Number(borrower.principal || 0);
  const originalPrincipal = Number(borrower.originalPrincipal || principal);
  const base = borrower.interestType === 'flat' ? originalPrincipal : principal;
  return Math.round((base * Number(borrower.rate || 0)) / 100);
}

function computeLedgerUpToMonth(borrower, targetYm) {
  const principal = Number(borrower.principal || 0);
  const originalPrincipal = Number(borrower.originalPrincipal || principal);
  const interestType = borrower.interestType === 'flat' ? 'flat' : 'reducing';
  const monthlyInterest = getMonthlyInterestAmount(borrower);
  const paidMonths = borrower.paidMonths || {};
  const partialPayments = borrower.partialPayments || {};
  const customPastDues = borrower.customPastDues || {};
  const customCashPaid = borrower.customCashPaid || {};

  let runningPastDue = 0;
  let cursor = borrower.startYm || targetYm;
  let guard = 0;

  while (compareYm(cursor, targetYm) <= 0 && guard < 240) {
    guard++;
    const isFullMarked = Boolean(paidMonths[cursor]);
    const partialAmt = Number(partialPayments[cursor] || 0);
    const paidThisMonth = isFullMarked ? monthlyInterest : Math.min(monthlyInterest, partialAmt);
    const remainingThisMonth = Math.max(0, monthlyInterest - paidThisMonth);
    const pastPaidThisMonth = Number(customCashPaid[cursor] || 0);

    if (Object.prototype.hasOwnProperty.call(customPastDues, cursor)) runningPastDue += Number(customPastDues[cursor] || 0);
    if (Object.prototype.hasOwnProperty.call(customCashPaid, cursor)) runningPastDue = Math.max(0, runningPastDue - pastPaidThisMonth);

    if (cursor === targetYm) {
      let status = 'pending';
      if (remainingThisMonth === 0 && monthlyInterest > 0) status = 'paid';
      else if (paidThisMonth > 0 && remainingThisMonth > 0) status = 'partial';
      const lateInfo = calculateLateFee(borrower, targetYm, status === 'paid');
      const totalPayable = Math.max(0, runningPastDue) + remainingThisMonth + lateInfo.lateFee;
      return {
        principal, originalPrincipal, interestType, monthlyInterest, paidThisMonth,
        collectedInMonth: paidThisMonth + pastPaidThisMonth, remainingThisMonth,
        status, isPaid: status === 'paid', pastDue: Math.max(0, runningPastDue),
        lateDays: lateInfo.lateDays, lateFee: lateInfo.lateFee, totalPayable
      };
    }
    if (remainingThisMonth > 0) runningPastDue += remainingThisMonth;
    cursor = nextYm(cursor);
  }

  const isFullMarked = Boolean(paidMonths[targetYm]);
  const partialAmt = Number(partialPayments[targetYm] || 0);
  const paidThisMonth = isFullMarked ? monthlyInterest : Math.min(monthlyInterest, partialAmt);
  const remainingThisMonth = Math.max(0, monthlyInterest - paidThisMonth);
  const pastPaidThisMonth = Number(customCashPaid[targetYm] || 0);
  let status = 'pending';
  if (remainingThisMonth === 0 && monthlyInterest > 0) status = 'paid';
  else if (paidThisMonth > 0 && remainingThisMonth > 0) status = 'partial';
  const lateInfo = calculateLateFee(borrower, targetYm, status === 'paid');
  return {
    principal, originalPrincipal, interestType, monthlyInterest, paidThisMonth,
    collectedInMonth: paidThisMonth + pastPaidThisMonth, remainingThisMonth,
    status, isPaid: status === 'paid', pastDue: Math.max(0, runningPastDue),
    lateDays: lateInfo.lateDays, lateFee: lateInfo.lateFee,
    totalPayable: Math.max(0, runningPastDue) + remainingThisMonth + lateInfo.lateFee
  };
}

function getPromiseStatusHtml(borrower, totalPayable) {
  const dates = [borrower.promiseDate1, borrower.promiseDate2, borrower.promiseDate3].filter(Boolean).sort();
  if (!dates.length) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parts = dates.map(dStr => {
    const dt = new Date(dStr + 'T00:00:00');
    const diffDays = Math.round((dt - today) / (1000 * 60 * 60 * 24));
    if (totalPayable <= 0) return `${escapeHtml(dStr)} (पूर्ण जमा)`;
    if (diffDays < 0) return `<span class="err">${escapeHtml(dStr)} (${Math.abs(diffDays)} दिवस उलटले | बाकी ${fmtAmt(totalPayable)})</span>`;
    if (diffDays === 0) return `<span class="warn-text">${escapeHtml(dStr)} (आजचा वायदा | बाकी ${fmtAmt(totalPayable)})</span>`;
    return `${escapeHtml(dStr)} (${diffDays} दिवस बाकी | ${fmtAmt(totalPayable)})`;
  });
  return `<div>📅 वायद्यानुसार बाकी: ${parts.join(' | ')}</div>`;
}

// ६. PDF / Print, Excel-Sufficient CSV, Gmail Report, Webhook, Cloud Backup, Archive & Local Vault
function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(val) {
  const s = String(val === undefined || val === null ? '' : val);
  return `"${s.replace(/"/g, '""')}"`;
}

// महिन्याचा PDF / Print रिपोर्ट
document.getElementById('printMonthlyPdfBtn').addEventListener('click', () => {
  const activeYm = document.getElementById('activeYm').value || currentYmDefault();
  const activeList = state.borrowers.filter(b => !b.isDeleted);
  let totP = 0, totInt = 0, totCol = 0, totPen = 0;

  const rows = activeList.map((b, i) => {
    const c = computeLedgerUpToMonth(b, activeYm);
    totP += c.principal; totInt += c.monthlyInterest; totCol += c.collectedInMonth; totPen += c.totalPayable;
    const st = c.status === 'paid' ? 'पूर्ण जमा' : c.status === 'partial' ? 'अर्धवट' : 'बाकी';
    return `<tr><td>${i + 1}</td><td>${escapeHtml(b.name)}</td><td>${escapeHtml(b.mobile || '-')}</td><td>₹${c.principal}</td><td>₹${c.monthlyInterest}</td><td>₹${c.collectedInMonth}</td><td>₹${c.totalPayable}</td><td>${st}</td></tr>`;
  }).join('');

  document.getElementById('printArea').innerHTML = `
    <h2>Hishob — मासिक अहवाल (${activeYm})</h2>
    <p>एकूण मुद्दल: ₹${totP} | अपेक्षित व्याज: ₹${totInt} | जमा रक्कम: ₹${totCol} | एकूण थकबाकी: ₹${totPen}</p>
    <table>
      <thead><tr><th>क्र.</th><th>ग्राहक नाव</th><th>मोबाईल</th><th>मुद्दल</th><th>मासिक व्याज</th><th>जमा</th><th>थकबाकी</th><th>स्थिती</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  window.print();
});

// महिन्याची Excel-सुसंगत CSV (UTF-8 BOM सह)
document.getElementById('exportMonthlyCsvBtn').addEventListener('click', () => {
  const activeYm = document.getElementById('activeYm').value || currentYmDefault();
  const activeList = state.borrowers.filter(b => !b.isDeleted);
  const header = ['नाव', 'मोबाईल', 'मुद्दल', 'दर (%)', 'मासिक व्याज', 'चालू जमा', 'मागील बाकी', 'एकूण थकबाकी', 'स्थिती'];
  const lines = [header.map(csvCell).join(',')];

  activeList.forEach(b => {
    const c = computeLedgerUpToMonth(b, activeYm);
    lines.push([b.name, b.mobile || '', c.principal, b.rate || 0, c.monthlyInterest, c.paidThisMonth, c.pastDue, c.totalPayable, c.status].map(csvCell).join(','));
  });
  downloadTextFile(`hishob-monthly-${activeYm}.csv`, '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8;');
  document.getElementById('ioMsg').textContent = `${activeYm} ची Excel-सुसंगत CSV डाउनलोड झाली.`;
});

// संपूर्ण खात्यांची CSV
document.getElementById('exportAllCsvBtn').addEventListener('click', () => {
  const activeList = state.borrowers.filter(b => !b.isDeleted);
  const header = ['नाव', 'मुद्दल', 'दर (%)', 'सुरू महिना', 'मोबाईल', 'व्याज पद्धत', 'निश्चित व्याज', 'व्याज तारीख', 'जामीनदार', 'नोकरी', 'कंपनी/डिपार्टमेंट', 'टीप'];
  const lines = [header.map(csvCell).join(',')];

  activeList.forEach(b => {
    lines.push([
      b.name, b.principal, b.rate || 0, b.startYm || '', b.mobile || '',
      b.interestType || 'reducing', b.fixedMonthlyInterest || 0, b.interestDay || '',
      b.guarantor || '', b.jobType || '', b.companyDept || '', b.note || ''
    ].map(csvCell).join(','));
  });
  downloadTextFile(`hishob-all-accounts-${getLocalDateIso(0)}.csv`, '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8;');
  document.getElementById('ioMsg').textContent = 'संपूर्ण खात्यांची CSV डाउनलोड झाली.';
});

// स्थानिक CSV Import
document.getElementById('importCsvBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg');
  const fileInput = document.getElementById('importCsvFile');
  const file = fileInput.files && fileInput.files[0];
  if (!file || !state.user) {
    msgEl.textContent = 'कृपया .csv फाईल निवडा.';
    return;
  }
  try {
    const text = (await file.text()).replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const name = cols[0];
      const principal = Number(cols[1] || 0);
      const rate = Number(cols[2] || 2);
      const startYm = cols[3] || currentYmDefault();
      if (name && principal > 0) {
        await db.collection('users').doc(state.user.uid).collection('borrowers').add({
          name, principal, originalPrincipal: principal, rate, fixedMonthlyInterest: 0,
          startYm, mobile: cols[4] || '', interestType: 'reducing', isDeleted: false,
          paidMonths: {}, partialPayments: {}, paymentHistory: [], extraPrincipals: [],
          principalReductions: [], customPastDues: {}, customCashPaid: {},
          createdAt: new Date().toISOString()
        });
        count++;
      }
    }
    await appendAuditLog('CSV_IMPORT', `${count} नोंदी CSV फाईलमधून आयात केल्या`);
    msgEl.textContent = `${count} नोंदी CSV मधून यशस्वीरीत्या आयात झाल्या.`;
  } catch (err) {
    msgEl.textContent = `CSV Import एरर: ${err.message}`;
  }
});

// Gmail Report (1-Click)
document.getElementById('gmailReportBtn').addEventListener('click', () => {
  const activeYm = document.getElementById('activeYm').value || currentYmDefault();
  const activeList = state.borrowers.filter(b => !b.isDeleted);
  let totP = 0, totInt = 0, totCol = 0, totPen = 0;
  const rows = activeList.map((b, i) => {
    const c = computeLedgerUpToMonth(b, activeYm);
    totP += c.principal; totInt += c.monthlyInterest; totCol += c.collectedInMonth; totPen += c.totalPayable;
    return `${i + 1}. ${b.name} | मुद्दल ₹${c.principal} | व्याज ₹${c.monthlyInterest} | थकबाकी ₹${c.totalPayable}`;
  });
  const subject = `Hishob मासिक अहवाल (${activeYm})`;
  const body = `Hishob मासिक अहवाल (${activeYm})\nएकूण मुद्दल: ₹${totP}\nअपेक्षित व्याज: ₹${totInt}\nजमा रक्कम: ₹${totCol}\nएकूण थकबाकी: ₹${totPen}\n\n${rows.join('\n')}`;
  window.location.href = `mailto:${encodeURIComponent(state.user ? state.user.email : '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});

// Google Apps Script Webhook
document.getElementById('saveWebhookBtn').addEventListener('click', async () => {
  const url = document.getElementById('webhookUrlInput').value.trim();
  state.webhookUrl = url;
  localStorage.setItem('hishob_webhook_url', url);
  if (state.user) {
    try { await db.collection('users').doc(state.user.uid).set({ webhookUrl: url }, { merge: true }); } catch (_) {}
  }
  document.getElementById('ioMsg').textContent = 'Webhook URL सेव्ह झाली.';
});

document.getElementById('sendWebhookBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg');
  const url = document.getElementById('webhookUrlInput').value.trim();
  if (!url) {
    msgEl.textContent = 'कृपया Google Apps Script Webhook URL टाका.';
    return;
  }
  try {
    msgEl.textContent = 'Webhook वर डेटा पाठवत आहे...';
    const activeYm = document.getElementById('activeYm').value || currentYmDefault();
    const payload = {
      ym: activeYm,
      sentAt: new Date().toISOString(),
      borrowersCount: state.borrowers.filter(b => !b.isDeleted).length,
      borrowers: state.borrowers.filter(b => !b.isDeleted).map(b => ({
        name: b.name, mobile: b.mobile || '', ...computeLedgerUpToMonth(b, activeYm)
      }))
    };
    await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    await appendAuditLog('WEBHOOK_SENT', `${activeYm} चा अहवाल Webhook वर पाठवला`);
    msgEl.textContent = '✅ Webhook वर डेटा पाठवला गेला.';
  } catch (err) {
    msgEl.textContent = `Webhook एरर: ${err.message}`;
  }
});

// Encrypted Emergency Local Vault
document.getElementById('saveLocalVaultBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg');
  const passkey = document.getElementById('backupPasskey').value;
  try {
    const res = await encryptPayload({ savedAt: new Date().toISOString(), borrowers: state.borrowers }, passkey);
    localStorage.setItem('hishob_emergency_vault', res.jsonString);
    msgEl.textContent = '🛡️ Encrypted Emergency Local Vault फोनमध्ये सेव्ह झाला.';
  } catch (err) {
    msgEl.textContent = `Vault एरर: ${err.message}`;
  }
});

document.getElementById('restoreLocalVaultBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg');
  const passkey = document.getElementById('backupPasskey').value;
  const raw = localStorage.getItem('hishob_emergency_vault');
  if (!raw) {
    msgEl.textContent = 'कोणताही Local Vault सापडला नाही.';
    return;
  }
  try {
    const restored = await decryptPayload(raw, passkey);
    const list = Array.isArray(restored.borrowers) ? restored.borrowers : [];
    for (const item of list) {
      const copy = { ...item };
      delete copy.id;
      await db.collection('users').doc(state.user.uid).collection('borrowers').add(copy);
    }
    msgEl.textContent = `♻️ Local Vault मधून ${list.length} नोंदी रिस्टोर झाल्या.`;
  } catch (err) {
    msgEl.textContent = `Vault Restore एरर: ${err.message}`;
  }
});

// Cloud Backup Snapshot & महिन्यानुसार Archive
document.getElementById('saveCloudBackupBtn').addEventListener('click', async () => {
  if (!state.user) return;
  const msgEl = document.getElementById('ioMsg');
  try {
    const nowIso = new Date().toISOString();
    await db.collection('users').doc(state.user.uid).collection('cloudBackups').add({
      createdAt: nowIso,
      count: state.borrowers.length,
      borrowers: state.borrowers
    });
    await appendAuditLog('CLOUD_BACKUP', `${state.borrowers.length} खात्यांचा Cloud Backup सेव्ह केला`);
    msgEl.textContent = `☁️ Cloud Backup यशस्वीरीत्या सेव्ह झाला (${nowIso.slice(0, 10)}).`;
  } catch (err) {
    msgEl.textContent = `Cloud Backup एरर: ${err.message}`;
  }
});

document.getElementById('saveMonthlyArchiveBtn').addEventListener('click', async () => {
  if (!state.user) return;
  const msgEl = document.getElementById('ioMsg');
  const activeYm = document.getElementById('activeYm').value || currentYmDefault();
  try {
    const activeList = state.borrowers.filter(b => !b.isDeleted);
    const summary = activeList.map(b => ({ id: b.id, name: b.name, ...computeLedgerUpToMonth(b, activeYm) }));
    await db.collection('users').doc(state.user.uid).collection('monthlyArchives').doc(activeYm).set({
      ym: activeYm,
      archivedAt: new Date().toISOString(),
      count: summary.length,
      records: summary
    });
    await appendAuditLog('MONTHLY_ARCHIVE', `${activeYm} चा मासिक Archive सेव्ह केला`);
    msgEl.textContent = `📦 ${activeYm} चा मासिक Archive Firestore मध्ये सेव्ह झाला.`;
  } catch (err) {
    msgEl.textContent = `Archive एरर: ${err.message}`;
  }
});

// ७. Document Upload (Canvas Compress) & Document Gallery Modal
function compressImageToBase64(file, maxWidth = 800, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('फोटो वाचता आला नाही.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('फाईल वाचता आली नाही.'));
    reader.readAsDataURL(file);
  });
}

async function loadBorrowerDocs(borrowerId) {
  const grid = document.getElementById('docGalleryGrid');
  grid.innerHTML = '<div class="muted">डॉक्युमेंट्स लोड होत आहेत...</div>';
  try {
    const snap = await getBorrowerDoc(borrowerId).collection('documents').orderBy('uploadedAt', 'desc').get();
    if (snap.empty) {
      grid.innerHTML = '<div class="muted">अद्याप कोणतेही डॉक्युमेंट अपलोड केलेले नाही.</div>';
      return;
    }
    grid.innerHTML = snap.docs.map(d => {
      const doc = d.data();
      return `
        <div class="doc-card">
          <img src="${doc.dataUrl}" alt="${escapeHtml(doc.docName || 'Doc')}" />
          <div style="margin-top:6px;"><strong>${escapeHtml(doc.docName || 'डॉक्युमेंट')}</strong></div>
          <div class="muted">${escapeHtml(String(doc.uploadedAt || '').slice(0, 10))}</div>
          <button data-deldoc="${d.id}" class="danger sm" style="margin-top:6px;">डिलीट</button>
        </div>
      `;
    }).join('');
  } catch (err) {
    grid.innerHTML = `<div class="err">एरर: ${escapeHtml(err.message)}</div>`;
  }
}

function openDocsModal(borrowerId) {
  const b = state.borrowers.find(x => x.id === borrowerId);
  if (!b) return;
  state.currentDocsBorrowerId = borrowerId;
  document.getElementById('docsModalTitle').textContent = `📎 ${b.name || 'ग्राहक'} — Document Gallery`;
  document.getElementById('docUploadMsg').textContent = '';
  document.getElementById('docsModal').classList.remove('hidden');
  loadBorrowerDocs(borrowerId);
}

document.getElementById('closeDocsModalBtn').addEventListener('click', () => {
  document.getElementById('docsModal').classList.add('hidden');
});

document.getElementById('uploadDocBtn').addEventListener('click', async () => {
  if (!state.user || !state.currentDocsBorrowerId) return;
  const docName = document.getElementById('docNameInput').value.trim();
  const fileInput = document.getElementById('docFileInput');
  const file = fileInput.files && fileInput.files[0];
  const msgEl = document.getElementById('docUploadMsg');

  if (!docName || !file) {
    msgEl.textContent = 'कृपया डॉक्युमेंटचे नाव आणि फोटो निवडा.';
    return;
  }
  try {
    msgEl.textContent = 'फोटो कॉम्प्रेस करून अपलोड करत आहे...';
    const dataUrl = await compressImageToBase64(file);
    await getBorrowerDoc(state.currentDocsBorrowerId).collection('documents').add({
      docName,
      dataUrl,
      uploadedAt: new Date().toISOString()
    });
    await appendAuditLog('DOC_UPLOADED', `${state.currentDocsBorrowerId} साठी '${docName}' अपलोड केले`);
    document.getElementById('docNameInput').value = '';
    fileInput.value = '';
    msgEl.textContent = '✅ डॉक्युमेंट यशस्वीरीत्या सेव्ह झाले.';
    loadBorrowerDocs(state.currentDocsBorrowerId);
  } catch (err) {
    msgEl.textContent = `Upload एरर: ${err.message}`;
  }
});

document.getElementById('docGalleryGrid').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-deldoc]');
  if (!btn || !state.currentDocsBorrowerId) return;
  if (!confirm('हे डॉक्युमेंट डिलीट करायचे का?')) return;
  await getBorrowerDoc(state.currentDocsBorrowerId).collection('documents').doc(btn.getAttribute('data-deldoc')).delete();
  loadBorrowerDocs(state.currentDocsBorrowerId);
});

// ८. ग्राहक अ‍ॅक्शन्स
function getBorrowerDoc(borrowerId) {
  return db.collection('users').doc(state.user.uid).collection('borrowers').doc(borrowerId);
}

async function markFullMonthPayment(borrowerId, ym, monthlyInterest) {
  if (!state.user) return;
  const nowIso = new Date().toISOString();
  await getBorrowerDoc(borrowerId).update({
    [`paidMonths.${ym}`]: { paidAt: nowIso, amount: monthlyInterest },
    [`partialPayments.${ym}`]: firebase.firestore.FieldValue.delete(),
    paymentHistory: firebase.firestore.FieldValue.arrayUnion({ date: nowIso, ym, type: 'FULL_INTEREST', amount: monthlyInterest, note: `${ym} पूर्ण व्याज जमा` })
  });
  await appendAuditLog('PAYMENT_MARKED', `${borrowerId} साठी ${ym} चे पूर्ण व्याज ₹${monthlyInterest} जमा`);
}

async function addPartialPayment(borrowerId, ym, monthlyInterest, alreadyPaid) {
  if (!state.user) return;
  const inputEl = document.getElementById(`partialPayInput_${borrowerId}`);
  const amt = Number(inputEl ? inputEl.value : 0);
  if (!amt || amt <= 0) { alert('कृपया अर्धवट जमा रक्कम (₹) टाका.'); return; }
  const nowIso = new Date().toISOString();
  const nextTotal = Number(alreadyPaid || 0) + amt;
  const updatePayload = {
    paymentHistory: firebase.firestore.FieldValue.arrayUnion({ date: nowIso, ym, type: 'PARTIAL_INTEREST', amount: amt, note: `${ym} अर्धवट व्याज जमा` })
  };
  if (nextTotal >= monthlyInterest) {
    updatePayload[`paidMonths.${ym}`] = { paidAt: nowIso, amount: monthlyInterest };
    updatePayload[`partialPayments.${ym}`] = firebase.firestore.FieldValue.delete();
  } else {
    updatePayload[`partialPayments.${ym}`] = nextTotal;
  }
  await getBorrowerDoc(borrowerId).update(updatePayload);
  if (inputEl) inputEl.value = '';
  await appendAuditLog('PARTIAL_PAYMENT', `${borrowerId} (${ym}) अर्धवट ₹${amt} जमा`);
}

async function resetMonthPayment(borrowerId, ym) {
  if (!state.user) return;
  await getBorrowerDoc(borrowerId).update({
    [`paidMonths.${ym}`]: firebase.firestore.FieldValue.delete(),
    [`partialPayments.${ym}`]: firebase.firestore.FieldValue.delete()
  });
  await appendAuditLog('PAYMENT_RESET', `${borrowerId} साठी ${ym} चे पेमेंट Reset केले`);
}

async function addManualPendingForMonth(borrowerId) {
  if (!state.user) return;
  const ymInput = prompt('कोणत्या महिन्यासाठी मॅन्युअल बाकी जोडायची? (उदा. 2026-10)', document.getElementById('activeYm').value || currentYmDefault());
  if (!ymInput || !/^\d{4}-\d{2}$/.test(ymInput.trim())) { alert('योग्य महिना (YYYY-MM) टाका.'); return; }
  const amt = Number(prompt(`${ymInput.trim()} ची मॅन्युअल बाकी रक्कम (₹):`, '0') || 0);
  if (!amt || amt <= 0) return;
  const existing = state.borrowers.find(b => b.id === borrowerId) || {};
  const prevAmt = Number((existing.customPastDues && existing.customPastDues[ymInput.trim()]) || 0);
  await getBorrowerDoc(borrowerId).update({ [`customPastDues.${ymInput.trim()}`]: prevAmt + amt });
  await appendAuditLog('MANUAL_DUE_ADDED', `${borrowerId} (${ymInput.trim()}) मॅन्युअल बाकी ₹${amt}`);
}

async function payCustomPastDue(borrowerId, ym, currentPastDue) {
  if (!state.user) return;
  const inputEl = document.getElementById(`payPastInput_${borrowerId}`);
  const amountToPay = Number(inputEl ? inputEl.value : 0);
  if (!amountToPay || amountToPay <= 0) { alert('जमा करायची रक्कम (₹) टाका.'); return; }
  const nowIso = new Date().toISOString();
  const existing = state.borrowers.find(b => b.id === borrowerId) || {};
  const prevCashPaid = Number((existing.customCashPaid && existing.customCashPaid[ym]) || 0);
  const newPastDue = Math.max(0, Number(currentPastDue || 0) - amountToPay);
  const updatePayload = {
    [`customCashPaid.${ym}`]: prevCashPaid + amountToPay,
    paymentHistory: firebase.firestore.FieldValue.arrayUnion({ date: nowIso, ym, type: 'PAST_DUE_PAID', amount: amountToPay, note: `${ym} मागील बाकी जमा` })
  };
  if (newPastDue === 0 && existing.customPastDues && Object.prototype.hasOwnProperty.call(existing.customPastDues, ym)) {
    updatePayload[`customPastDues.${ym}`] = firebase.firestore.FieldValue.delete();
  }
  await getBorrowerDoc(borrowerId).update(updatePayload);
  if (inputEl) inputEl.value = '';
  await appendAuditLog('PAST_DUE_PAID', `${borrowerId} (${ym}) मागील बाकी ₹${amountToPay} जमा`);
}

async function clearManualPastDueForMonth(borrowerId, ym) {
  if (!state.user) return;
  await getBorrowerDoc(borrowerId).update({
    [`customPastDues.${ym}`]: firebase.firestore.FieldValue.delete(),
    [`customCashPaid.${ym}`]: firebase.firestore.FieldValue.delete()
  });
  await appendAuditLog('MANUAL_DUE_REMOVED', `${borrowerId} (${ym}) मॅन्युअल बाकी काढली`);
}

async function reducePrincipal(borrowerId, currentPrincipal) {
  if (!state.user) return;
  const inputEl = document.getElementById(`principalAmtInput_${borrowerId}`);
  const amt = Number(inputEl ? inputEl.value : 0);
  if (!amt || amt <= 0) { alert('कमी करायची मुद्दल रक्कम (₹) टाका.'); return; }
  const nextPrincipal = Math.max(0, Number(currentPrincipal || 0) - amt);
  await getBorrowerDoc(borrowerId).update({
    principal: nextPrincipal,
    principalReductions: firebase.firestore.FieldValue.arrayUnion({ date: new Date().toISOString(), amount: amt, balanceAfter: nextPrincipal })
  });
  if (inputEl) inputEl.value = '';
  await appendAuditLog('PRINCIPAL_REDUCED', `${borrowerId} मुद्दल ₹${amt} ने कमी`);
}

async function addExtraPrincipal(borrowerId, currentPrincipal, currentOriginal) {
  if (!state.user) return;
  const inputEl = document.getElementById(`principalAmtInput_${borrowerId}`);
  const amt = Number(inputEl ? inputEl.value : 0);
  if (!amt || amt <= 0) { alert('वाढवायची मुद्दल रक्कम (₹) टाका.'); return; }
  const nextPrincipal = Number(currentPrincipal || 0) + amt;
  const nextOriginal = Number(currentOriginal || currentPrincipal || 0) + amt;
  await getBorrowerDoc(borrowerId).update({
    principal: nextPrincipal, originalPrincipal: nextOriginal,
    extraPrincipals: firebase.firestore.FieldValue.arrayUnion({ date: new Date().toISOString(), amount: amt, balanceAfter: nextPrincipal })
  });
  if (inputEl) inputEl.value = '';
  await appendAuditLog('PRINCIPAL_ADDED', `${borrowerId} अतिरिक्त मुद्दल ₹${amt}`);
}

async function quickEditField(borrowerId, fieldName, label, currentVal) {
  if (!state.user) return;
  const nextVal = prompt(`${label} बदला:`, currentVal || '');
  if (nextVal === null) return;
  const cleaned = fieldName === 'interestDay' ? Number(nextVal || 0) : nextVal.trim();
  await getBorrowerDoc(borrowerId).update({ [fieldName]: cleaned });
  await appendAuditLog('QUICK_EDIT', `${borrowerId} चे ${label} बदलले`);
}

async function softDeleteBorrower(borrowerId, name) {
  if (!state.user || !confirm(`'${name}' यांना Recycle Bin मध्ये पाठवायचे का?`)) return;
  await getBorrowerDoc(borrowerId).update({ isDeleted: true, deletedAt: new Date().toISOString() });
  await appendAuditLog('SOFT_DELETED', `${name} Recycle Bin मध्ये`);
}

async function restoreBorrower(borrowerId, name) {
  if (!state.user) return;
  await getBorrowerDoc(borrowerId).update({ isDeleted: false, deletedAt: firebase.firestore.FieldValue.delete() });
  await appendAuditLog('RESTORED', `${name} Restore केले`);
}

async function permanentDeleteBorrower(borrowerId, name) {
  if (!state.user || !confirm(`सावधान! '${name}' यांची नोंद कायमची डिलीट करायची का?`)) return;
  await getBorrowerDoc(borrowerId).delete();
  await appendAuditLog('PERMANENT_DELETED', `${name} कायमचे डिलीट केले`);
}

// ९. Passbook / Timeline Modal
function buildBorrowerEvents(b) {
  const events = [];
  if (b.loanDate || b.createdAt) {
    events.push({
      date: b.loanDate || String(b.createdAt).slice(0, 10), type: 'कर्ज सुरुवात',
      principalDebit: Number(b.originalPrincipal || b.principal || 0), principalCredit: 0, interestCredit: 0,
      note: `मुद्दल वितरण (${b.interestType === 'flat' ? 'Flat' : 'Reducing'} @ ${b.rate || 0}%)`
    });
  }
  (b.extraPrincipals || []).forEach(ep => events.push({ date: String(ep.date || '').slice(0, 10), type: 'अतिरिक्त मुद्दल', principalDebit: Number(ep.amount || 0), principalCredit: 0, interestCredit: 0, note: 'मुद्दल वाढले' }));
  (b.principalReductions || []).forEach(pr => events.push({ date: String(pr.date || '').slice(0, 10), type: 'मुद्दल कपात', principalDebit: 0, principalCredit: Number(pr.amount || 0), interestCredit: 0, note: 'मुद्दल कमी झाले' }));
  (b.paymentHistory || []).forEach(ph => events.push({ date: String(ph.date || '').slice(0, 10), type: ph.type || 'व्याज भरणा', principalDebit: 0, principalCredit: 0, interestCredit: Number(ph.amount || 0), note: ph.note || `${ph.ym || ''} जमा` }));
  events.sort((a, c) => String(a.date).localeCompare(String(c.date)));
  return events;
}

function renderPassbookContent() {
  const b = state.borrowers.find(x => x.id === state.currentPassbookBorrowerId);
  const content = document.getElementById('pbContent');
  if (!b) return;
  document.getElementById('pbTitle').textContent = `${b.name || 'ग्राहक'} — Passbook व Timeline`;
  const tab = state.currentPassbookTab;
  const events = buildBorrowerEvents(b);

  if (tab === 'passbook') {
    let principalBal = 0;
    const rows = events.map(ev => {
      principalBal = Math.max(0, principalBal + ev.principalDebit - ev.principalCredit);
      return `<tr><td>${escapeHtml(ev.date)}</td><td>${escapeHtml(ev.type)} — ${escapeHtml(ev.note)}</td><td class="err">${ev.principalDebit > 0 ? `+${fmtAmt(ev.principalDebit)}` : '-'}</td><td class="ok">${ev.principalCredit > 0 ? `-${fmtAmt(ev.principalCredit)}` : '-'}</td><td class="ok">${ev.interestCredit > 0 ? fmtAmt(ev.interestCredit) : '-'}</td><td><strong>${fmtAmt(principalBal)}</strong></td></tr>`;
    }).join('');
    content.innerHTML = `<table class="passbook-table"><thead><tr><th>तारीख</th><th>तपशील</th><th>मुद्दल नावे (+)</th><th>मुद्दल जमा (-)</th><th>व्याज/बाकी जमा</th><th>मुद्दल शिल्लक</th></tr></thead><tbody>${rows || '<tr><td colspan="6">कोणतीही नोंद नाही.</td></tr>'}</tbody></table>`;
  } else if (tab === 'timeline') {
    content.innerHTML = events.length ? events.map(ev => `<div class="meta-box"><strong>[${escapeHtml(ev.date)}] ${escapeHtml(ev.type)}</strong> — ${escapeHtml(ev.note)} ${ev.principalDebit > 0 ? `<span class="err">(+${fmtAmt(ev.principalDebit)})</span>` : ''} ${ev.principalCredit > 0 ? `<span class="ok">(-${fmtAmt(ev.principalCredit)})</span>` : ''} ${ev.interestCredit > 0 ? `<span class="ok">(व्याज ${fmtAmt(ev.interestCredit)})</span>` : ''}</div>`).join('') : '<p class="muted">नोंदी नाहीत.</p>';
  } else if (tab === 'payments') {
    const list = b.paymentHistory || [];
    content.innerHTML = list.length ? list.slice().reverse().map(p => `<div class="meta-box"><strong>${escapeHtml(String(p.date || '').slice(0, 10))}</strong> | ${escapeHtml(p.ym || '')} | <span class="ok">${fmtAmt(p.amount || 0)}</span> — ${escapeHtml(p.note || p.type || '')}</div>`).join('') : '<p class="muted">कोणतीही Payment History नाही.</p>';
  } else if (tab === 'principals') {
    const extras = (b.extraPrincipals || []).map(x => `<div class="meta-box">➕ <strong>${escapeHtml(String(x.date || '').slice(0, 10))}</strong>: अतिरिक्त मुद्दल ${fmtAmt(x.amount)} (नवीन ${fmtAmt(x.balanceAfter)})</div>`).join('');
    const reds = (b.principalReductions || []).map(x => `<div class="meta-box">➖ <strong>${escapeHtml(String(x.date || '').slice(0, 10))}</strong>: मुद्दल कपात ${fmtAmt(x.amount)} (उरलेले ${fmtAmt(x.balanceAfter)})</div>`).join('');
    content.innerHTML = `<h4>अतिरिक्त मुद्दल नोंदी</h4>${extras || '<p class="muted">नोंद नाही.</p>'}<h4>मुद्दल कपात नोंदी</h4>${reds || '<p class="muted">नोंद नाही.</p>'}`;
  }
}

function openPassbookModal(borrowerId) {
  state.currentPassbookBorrowerId = borrowerId;
  state.currentPassbookTab = 'passbook';
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-pbtab') === 'passbook'));
  renderPassbookContent();
  document.getElementById('passbookModal').classList.remove('hidden');
}

document.getElementById('closePassbookBtn').addEventListener('click', () => document.getElementById('passbookModal').classList.add('hidden'));
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.currentPassbookTab = btn.getAttribute('data-pbtab');
    document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    renderPassbookContent();
  });
});

// १०. EMI Simulator व Full Edit Modal
document.getElementById('calcEmiBtn').addEventListener('click', () => {
  const P = Number(document.getElementById('emiPrincipal').value || 0);
  const r = Number(document.getElementById('emiMonthlyRate').value || 0) / 100;
  const n = Number(document.getElementById('emiMonths').value || 0);
  const type = document.getElementById('emiType').value;
  const out = document.getElementById('emiResult');
  if (P <= 0 || n <= 0) { out.textContent = 'योग्य मुद्दल आणि महिने टाका.'; return; }
  let emi = 0, totalPayable = 0, totalInterest = 0;
  if (type === 'flat') {
    totalInterest = Math.round(P * r * n); totalPayable = P + totalInterest; emi = Math.round(totalPayable / n);
  } else {
    if (r === 0) { emi = Math.round(P / n); totalPayable = P; }
    else { const f = Math.pow(1 + r, n); emi = Math.round((P * r * f) / (f - 1)); totalPayable = emi * n; totalInterest = Math.max(0, totalPayable - P); }
  }
  out.innerHTML = `<div><strong>मासिक EMI:</strong> <span class="ok">${fmtAmt(emi)}</span></div><div><strong>एकूण व्याज:</strong> ${fmtAmt(totalInterest)} | <strong>एकूण परतफेड:</strong> ${fmtAmt(totalPayable)}</div>`;
});

function openEditModal(borrowerId) {
  const b = state.borrowers.find(item => item.id === borrowerId);
  if (!b) return;
  document.getElementById('eId').value = b.id;
  document.getElementById('eName').value = b.name || '';
  document.getElementById('eMobile').value = b.mobile || '';
  document.getElementById('ePrincipal').value = b.principal || 0;
  document.getElementById('eOriginalPrincipal').value = b.originalPrincipal || b.principal || 0;
  document.getElementById('eLoanDate').value = b.loanDate || '';
  document.getElementById('eStartYm').value = b.startYm || currentYmDefault();
  document.getElementById('eRate').value = b.rate || 0;
  document.getElementById('eFixedInterest').value = b.fixedMonthlyInterest || 0;
  document.getElementById('eInterestType').value = b.interestType === 'flat' ? 'flat' : 'reducing';
  document.getElementById('eInterestDay').value = b.interestDay || '';
  document.getElementById('eLateFee').value = b.lateFeePerDay || 0;
  document.getElementById('eGuarantor').value = b.guarantor || '';
  document.getElementById('eJobType').value = b.jobType || '';
  document.getElementById('eCompanyDept').value = b.companyDept || '';
  document.getElementById('eRetirementDate').value = b.retirementDate || '';
  document.getElementById('ePromise1').value = b.promiseDate1 || '';
  document.getElementById('ePromise2').value = b.promiseDate2 || '';
  document.getElementById('ePromise3').value = b.promiseDate3 || '';
  document.getElementById('eNote').value = b.note || '';
  document.getElementById('editModal').classList.remove('hidden');
}

document.getElementById('closeEditModalBtn').addEventListener('click', () => document.getElementById('editModal').classList.add('hidden'));
document.getElementById('saveEditBtn').addEventListener('click', async () => {
  if (!state.user) return;
  const id = document.getElementById('eId').value;
  const name = document.getElementById('eName').value.trim();
  if (!id || !name) { alert('ग्राहकाचे नाव आवश्यक आहे.'); return; }
  await getBorrowerDoc(id).update({
    name, mobile: document.getElementById('eMobile').value.trim(),
    principal: Number(document.getElementById('ePrincipal').value || 0),
    originalPrincipal: Number(document.getElementById('eOriginalPrincipal').value || 0),
    loanDate: document.getElementById('eLoanDate').value || '',
    startYm: document.getElementById('eStartYm').value || currentYmDefault(),
    rate: Number(document.getElementById('eRate').value || 0),
    fixedMonthlyInterest: Number(document.getElementById('eFixedInterest').value || 0),
    interestType: document.getElementById('eInterestType').value === 'flat' ? 'flat' : 'reducing',
    interestDay: Number(document.getElementById('eInterestDay').value || 0),
    lateFeePerDay: Number(document.getElementById('eLateFee').value || 0),
    guarantor: document.getElementById('eGuarantor').value.trim(),
    jobType: document.getElementById('eJobType').value || '',
    companyDept: document.getElementById('eCompanyDept').value.trim(),
    retirementDate: document.getElementById('eRetirementDate').value || '',
    promiseDate1: document.getElementById('ePromise1').value || '',
    promiseDate2: document.getElementById('ePromise2').value || '',
    promiseDate3: document.getElementById('ePromise3').value || '',
    note: document.getElementById('eNote').value.trim()
  });
  await appendAuditLog('FULL_EDIT', `${name} (${id}) अपडेट केले`);
  document.getElementById('editModal').classList.add('hidden');
});

// ११. CSV Parser व Helpers
function parseCsvLine(line) {
  const result = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else current += ch;
  }
  result.push(current.trim());
  return result;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function jobLabel(jobType) {
  if (jobType === 'govt') return 'सरकारी नोकरी';
  if (jobType === 'private') return 'खाजगी नोकरी';
  if (jobType === 'business') return 'व्यवसाय / इतर';
  return '-';
}

// १२. UI Render
function renderBorrowers() {
  const container = document.getElementById('borrowersList');
  const recycleContainer = document.getElementById('recycleBinList');
  const activeYm = document.getElementById('activeYm').value || currentYmDefault();
  const query = (document.getElementById('searchInput').value || '').trim().toLowerCase();

  const activeList = state.borrowers.filter(b => !b.isDeleted);
  const deletedList = state.borrowers.filter(b => b.isDeleted);
  document.getElementById('recycleCountBadge').textContent = String(deletedList.length);

  const todayStr = getLocalDateIso(0);
  const tomorrowStr = getLocalDateIso(1);
  let totalPrincipal = 0, totalExpectedInterest = 0, totalCollectedMonth = 0, totalPending = 0;
  const todayPromises = [], tomorrowPromises = [], pendingOrPartial = [];

  const enriched = activeList.map(b => {
    const calc = computeLedgerUpToMonth(b, activeYm);
    totalPrincipal += calc.principal;
    totalExpectedInterest += calc.monthlyInterest;
    totalCollectedMonth += calc.collectedInMonth;
    totalPending += calc.totalPayable;

    if (calc.status !== 'paid' && calc.totalPayable > 0) {
      pendingOrPartial.push({ name: b.name, mobile: b.mobile, status: calc.status, totalPayable: calc.totalPayable });
    }
    const pDates = [b.promiseDate1, b.promiseDate2, b.promiseDate3].filter(Boolean);
    if (pDates.includes(todayStr) && calc.totalPayable > 0) todayPromises.push({ name: b.name, mobile: b.mobile, amount: calc.totalPayable });
    if (pDates.includes(tomorrowStr) && calc.totalPayable > 0) tomorrowPromises.push({ name: b.name, mobile: b.mobile, amount: calc.totalPayable });
    return { b, calc };
  });

  state.todayPromisesCache = todayPromises;
  state.pendingPartialCache = pendingOrPartial;
  document.getElementById('dueCounterBadge').textContent = String(todayPromises.length + pendingOrPartial.length);
  triggerDailyMorningNotification(false);

  document.getElementById('dashActiveCount').textContent = `सक्रिय खाती: ${activeList.length}`;
  document.getElementById('dashTotalPrincipal').textContent = fmtAmt(totalPrincipal);
  document.getElementById('dashExpectedInterest').textContent = fmtAmt(totalExpectedInterest);
  document.getElementById('dashCollectedMonth').textContent = fmtAmt(totalCollectedMonth);
  document.getElementById('dashTotalPending').textContent = fmtAmt(totalPending);

  const todayAlertEl = document.getElementById('todayPromiseAlert');
  if (todayPromises.length) {
    todayAlertEl.classList.remove('hidden');
    todayAlertEl.innerHTML = `<strong>🔔 आजच्या वायद्याचा अलर्ट (${todayStr}):</strong> ${todayPromises.map(x => `${escapeHtml(x.name)} (${escapeHtml(x.mobile || '-')}) — <strong>${fmtAmt(x.amount)}</strong>`).join(' | ')}`;
  } else todayAlertEl.classList.add('hidden');

  const tmrCard = document.getElementById('tomorrowPromiseCard');
  if (tomorrowPromises.length) {
    tmrCard.classList.remove('hidden');
    document.getElementById('tomorrowPromiseList').innerHTML = tomorrowPromises.map(x => `<div class="meta-box"><strong>${escapeHtml(x.name)}</strong> (${escapeHtml(x.mobile || '-')}) — अपेक्षित बाकी: <strong class="warn-text">${fmtAmt(x.amount)}</strong></div>`).join('');
  } else tmrCard.classList.add('hidden');

  const filtered = enriched.filter(({ b, calc }) => {
    if (state.jobFilter !== 'all' && b.jobType !== state.jobFilter) return false;
    if (state.statusFilter !== 'all' && calc.status !== state.statusFilter) return false;
    if (!query) return true;
    return [b.name, b.mobile, b.companyDept, b.guarantor].map(v => String(v || '').toLowerCase()).join(' ').includes(query);
  });

  if (!filtered.length) {
    container.innerHTML = '<p class="muted">या फिल्टरनुसार कोणतीही नोंद आढळली नाही.</p>';
  } else {
    container.innerHTML = filtered.map(({ b, calc }) => {
      const statusText = calc.status === 'paid' ? 'पूर्ण जमा' : calc.status === 'partial' ? `अर्धवट जमा (${fmtAmt(calc.paidThisMonth)} / ${fmtAmt(calc.monthlyInterest)})` : 'बाकी';
      const interestModeLabel = Number(b.fixedMonthlyInterest || 0) > 0 ? 'निश्चित व्याज' : `${b.rate || 0}% (${calc.interestType === 'flat' ? 'Flat' : 'Reducing'})`;
      const cardColorClass = calc.status === 'paid' ? 'status-paid' : calc.status === 'partial' ? 'status-partial' : '';
      const detailsHiddenClass = state.expandAllDetails ? '' : 'hidden';
      const cleanMobile = String(b.mobile || '').replace(/\D/g, '');

      return `
        <div class="borrower-item ${cardColorClass}">
          <div class="row" style="justify-content:space-between;">
            <div class="row">
              <strong>1. ग्राहक: ${escapeHtml(b.name || 'नाव नाही')}</strong>
              <span class="badge ${calc.status}">${statusText}</span>
            </div>
            <div class="row">
              ${cleanMobile ? `<button data-action="call-borrower" data-mobile="${escapeHtml(cleanMobile)}" class="success sm">📞 Call</button>` : ''}
              <button data-action="docs" data-id="${b.id}" class="sm">📎 Docs</button>
              <button data-action="toggle-card-details" data-id="${b.id}" class="sm">तपशील</button>
              <button data-action="passbook" data-id="${b.id}" class="primary sm">📖 Passbook</button>
              <button data-action="full-edit" data-id="${b.id}" class="sm">✏️ Edit</button>
              <button data-action="soft-delete" data-id="${b.id}" data-name="${escapeHtml(b.name || '')}" class="danger sm">🗑️</button>
            </div>
          </div>
          <div><strong>2. मुद्दल व पद्धत:</strong> ${fmtAmt(calc.principal)} | ${interestModeLabel} ${b.loanDate ? `| तारीख: ${escapeHtml(b.loanDate)}` : ''}</div>
          <div><strong>3. मासिक अपेक्षित व्याज:</strong> ${fmtAmt(calc.monthlyInterest)} ${b.interestDay ? `| व्याजाची तारीख: दरमहा ${b.interestDay}` : ''}</div>
          <div><strong>4. चालू महिना (${activeYm}):</strong> जमा ${fmtAmt(calc.paidThisMonth)} | उरलेले व्याज ${fmtAmt(calc.remainingThisMonth)} ${calc.lateFee > 0 ? `<span class="err">| विलंब दंड (${calc.lateDays} दिवस): ${fmtAmt(calc.lateFee)}</span>` : ''}</div>
          <div><strong>5. मागील बाकी व एकूण देणे:</strong> मागील बाकी ${fmtAmt(calc.pastDue)} | एकूण थकबाकी <strong class="ok">${fmtAmt(calc.totalPayable)}</strong></div>

          <div id="cardDetails_${b.id}" class="${detailsHiddenClass}">
            <div class="meta-box">
              <div>📱 मोबाईल: ${escapeHtml(b.mobile || '-')} | 🤝 जामीनदार: ${escapeHtml(b.guarantor || '-')}</div>
              <div>💼 नोकरी: ${jobLabel(b.jobType)} ${b.companyDept ? `(${escapeHtml(b.companyDept)})` : ''} ${b.retirementDate ? `| Retirement: ${escapeHtml(b.retirementDate)}` : ''}</div>
              ${getPromiseStatusHtml(b, calc.totalPayable)}
              ${b.note ? `<div>📝 टीप: ${escapeHtml(b.note)}</div>` : ''}
            </div>
            <div style="margin-top:8px;" class="row">
              <button data-action="quick-mobile" data-id="${b.id}" data-val="${escapeHtml(b.mobile || '')}" class="sm">📱 मोबाईल Add/Edit</button>
              <button data-action="quick-guarantor" data-id="${b.id}" data-val="${escapeHtml(b.guarantor || '')}" class="sm">🤝 जामीनदार Edit</button>
              <button data-action="quick-day" data-id="${b.id}" data-val="${b.interestDay || ''}" class="sm">📅 व्याज तारीख Edit</button>
              <button data-action="add-manual-month" data-id="${b.id}" class="warn sm">+ Manual Pending Month</button>
            </div>
            <div style="margin-top:10px;" class="row">
              <button data-action="full-pay" data-id="${b.id}" data-ym="${activeYm}" data-interest="${calc.monthlyInterest}" class="success sm">पूर्ण व्याज जमा</button>
              <input type="number" id="partialPayInput_${b.id}" placeholder="अर्धवट जमा (₹)" min="1" style="width:135px;" />
              <button data-action="partial-pay" data-id="${b.id}" data-ym="${activeYm}" data-interest="${calc.monthlyInterest}" data-paidamt="${calc.paidThisMonth}" class="primary sm">Partial जमा</button>
              <button data-action="reset-pay" data-id="${b.id}" data-ym="${activeYm}" class="danger sm">↺ Payment Reset</button>
            </div>
            <div style="margin-top:8px;" class="row">
              <input type="number" id="payPastInput_${b.id}" placeholder="मागील बाकी जमा (₹)" min="1" style="width:155px;" />
              <button data-action="pay-past" data-id="${b.id}" data-ym="${activeYm}" data-past="${calc.pastDue}" class="primary sm">मागील बाकी कपात</button>
              <button data-action="clear-past" data-id="${b.id}" data-ym="${activeYm}" class="warn sm">मॅन्युअल बाकी काढा</button>
            </div>
            <div style="margin-top:8px;" class="row">
              <input type="number" id="principalAmtInput_${b.id}" placeholder="मुद्दल रक्कम (₹)" min="1" style="width:155px;" />
              <button data-action="reduce-principal" data-id="${b.id}" data-principal="${calc.principal}" class="sm">- मुद्दल कमी करा</button>
              <button data-action="add-principal" data-id="${b.id}" data-principal="${calc.principal}" data-original="${calc.originalPrincipal}" class="primary sm">+ अतिरिक्त मुद्दल जोडा</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  recycleContainer.innerHTML = deletedList.length
    ? deletedList.map(b => `<div class="borrower-item"><div class="row" style="justify-content:space-between;"><div><strong>${escapeHtml(b.name || 'नाव नाही')}</strong> <span class="muted">(मुद्दल: ${fmtAmt(b.principal || 0)})</span></div><div class="row"><button data-action="restore" data-id="${b.id}" data-name="${escapeHtml(b.name || '')}" class="success sm">♻️ Restore</button><button data-action="perm-delete" data-id="${b.id}" data-name="${escapeHtml(b.name || '')}" class="danger sm">❌ Permanent Delete</button></div></div></div>`).join('')
    : '<div class="muted">Recycle Bin रिकामा आहे.</div>';
}

document.getElementById('borrowersList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  const id = btn.getAttribute('data-id');
  const ym = btn.getAttribute('data-ym');

  if (action === 'call-borrower') { const mob = btn.getAttribute('data-mobile'); if (mob) window.location.href = `tel:${mob}`; }
  else if (action === 'docs') openDocsModal(id);
  else if (action === 'toggle-card-details') { const el = document.getElementById(`cardDetails_${id}`); if (el) el.classList.toggle('hidden'); }
  else if (action === 'full-pay') markFullMonthPayment(id, ym, Number(btn.getAttribute('data-interest') || 0));
  else if (action === 'partial-pay') addPartialPayment(id, ym, Number(btn.getAttribute('data-interest') || 0), Number(btn.getAttribute('data-paidamt') || 0));
  else if (action === 'reset-pay') resetMonthPayment(id, ym);
  else if (action === 'add-manual-month') addManualPendingForMonth(id);
  else if (action === 'pay-past') payCustomPastDue(id, ym, Number(btn.getAttribute('data-past') || 0));
  else if (action === 'clear-past') clearManualPastDueForMonth(id, ym);
  else if (action === 'reduce-principal') reducePrincipal(id, Number(btn.getAttribute('data-principal') || 0));
  else if (action === 'add-principal') addExtraPrincipal(id, Number(btn.getAttribute('data-principal') || 0), Number(btn.getAttribute('data-original') || 0));
  else if (action === 'quick-mobile') quickEditField(id, 'mobile', 'मोबाईल नंबर', btn.getAttribute('data-val'));
  else if (action === 'quick-guarantor') quickEditField(id, 'guarantor', 'जामीनदाराचे नाव', btn.getAttribute('data-val'));
  else if (action === 'quick-day') quickEditField(id, 'interestDay', 'दरमहा व्याजाची तारीख (1-31)', btn.getAttribute('data-val'));
  else if (action === 'full-edit') openEditModal(id);
  else if (action === 'passbook') openPassbookModal(id);
  else if (action === 'soft-delete') softDeleteBorrower(id, btn.getAttribute('data-name'));
});

document.getElementById('recycleBinList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.getAttribute('data-action') === 'restore') restoreBorrower(btn.getAttribute('data-id'), btn.getAttribute('data-name'));
  else if (btn.getAttribute('data-action') === 'perm-delete') permanentDeleteBorrower(btn.getAttribute('data-id'), btn.getAttribute('data-name'));
});

function renderAuditLogs() {
  const box = document.getElementById('auditList');
  box.innerHTML = state.auditLogs.length
    ? state.auditLogs.map(log => `<div style="padding:4px 0; border-bottom:1px solid #1e293b;"><span class="muted">[${escapeHtml(log.ts || '')}]</span> <strong>${escapeHtml(log.action || '')}</strong> — ${escapeHtml(log.details || '')}</div>`).join('')
    : '<div class="muted">कोणत्याही Audit नोंदी नाहीत.</div>';
}

// १३. नवीन ग्राहक जोडणे
document.getElementById('addBorrowerBtn').addEventListener('click', async () => {
  if (!state.user) return;
  const name = document.getElementById('bName').value.trim();
  const principal = Number(document.getElementById('bPrincipal').value || 0);
  const startYm = document.getElementById('bStartYm').value || currentYmDefault();
  const customDue = Number(document.getElementById('bCustomDue').value || 0);
  if (!name || principal <= 0) { alert('कृपया ग्राहकाचे नाव आणि मुद्दल रक्कम टाका.'); return; }

  await db.collection('users').doc(state.user.uid).collection('borrowers').add({
    name, mobile: document.getElementById('bMobile').value.trim(),
    principal, originalPrincipal: principal,
    loanDate: document.getElementById('bLoanDate').value || '',
    startYm, rate: Number(document.getElementById('bRate').value || 0),
    fixedMonthlyInterest: Number(document.getElementById('bFixedInterest').value || 0),
    interestType: document.getElementById('bInterestType').value === 'flat' ? 'flat' : 'reducing',
    interestDay: Number(document.getElementById('bInterestDay').value || 0),
    lateFeePerDay: Number(document.getElementById('bLateFee').value || 0),
    guarantor: document.getElementById('bGuarantor').value.trim(),
    jobType: document.getElementById('bJobType').value || '',
    companyDept: document.getElementById('bCompanyDept').value.trim(),
    retirementDate: document.getElementById('bRetirementDate').value || '',
    promiseDate1: document.getElementById('bPromise1').value || '',
    promiseDate2: document.getElementById('bPromise2').value || '',
    promiseDate3: document.getElementById('bPromise3').value || '',
    note: document.getElementById('bNote').value.trim(),
    isDeleted: false, paidMonths: {}, partialPayments: {}, paymentHistory: [],
    extraPrincipals: [], principalReductions: [],
    customPastDues: customDue > 0 ? { [startYm]: customDue } : {},
    customCashPaid: {}, createdAt: new Date().toISOString()
  });
  await appendAuditLog('BORROWER_ADDED', `${name} (मुद्दल ₹${principal})`);
  ['bName', 'bMobile', 'bPrincipal', 'bLoanDate', 'bFixedInterest', 'bCustomDue', 'bInterestDay', 'bGuarantor', 'bCompanyDept', 'bRetirementDate', 'bPromise1', 'bPromise2', 'bPromise3', 'bNote'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('bLateFee').value = '0';
  document.getElementById('bJobType').value = '';
});

document.getElementById('activeYm').addEventListener('change', renderBorrowers);
document.getElementById('searchInput').addEventListener('input', renderBorrowers);

// १४. Google Sheet Import
document.getElementById('importSheetBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg');
  const raw = document.getElementById('sheetUrlInput').value.trim();
  if (!raw || !state.user) { msgEl.textContent = 'Google Sheet URL किंवा ID टाका.'; return; }
  let fetchUrl = raw;
  const idMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (idMatch) fetchUrl = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv`;
  else if (/^[a-zA-Z0-9-_]{20,}$/.test(raw)) fetchUrl = `https://docs.google.com/spreadsheets/d/${raw}/export?format=csv`;

  try {
    msgEl.textContent = 'Google Sheet वाचत आहे...';
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lines = (await res.text()).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const name = cols[0], principal = Number(cols[1] || 0), rate = Number(cols[2] || 2), startYm = cols[3] || currentYmDefault();
      if (name && principal > 0) {
        await db.collection('users').doc(state.user.uid).collection('borrowers').add({
          name, principal, originalPrincipal: principal, rate, fixedMonthlyInterest: 0, startYm,
          interestType: 'reducing', isDeleted: false, paidMonths: {}, partialPayments: {},
          paymentHistory: [], extraPrincipals: [], principalReductions: [],
          customPastDues: {}, customCashPaid: {}, importedFromSheet: true, createdAt: new Date().toISOString()
        });
        count++;
      }
    }
    await appendAuditLog('SHEET_IMPORT', `${count} नोंदी आयात केल्या`);
    msgEl.textContent = `${count} नोंदी यशस्वीरीत्या आयात झाल्या.`;
  } catch (err) { msgEl.textContent = `Sheet Import एरर: ${err.message}`; }
});

// १५. Encrypted Export (+ SHA-256) & Restore
document.getElementById('exportEncBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg');
  const shaBox = document.getElementById('shaDigestBox');
  const passkey = document.getElementById('backupPasskey').value;
  try {
    const res = await encryptPayload({ exportedAt: new Date().toISOString(), borrowers: state.borrowers }, passkey);
    downloadTextFile(`hishob-backup-${currentYmDefault()}.enc.json`, res.jsonString, 'application/json');
    msgEl.textContent = 'Encrypted बॅकअप फाईल तयार झाली.';
    shaBox.classList.remove('hidden');
    shaBox.innerHTML = `<strong>SHA-256 Digest:</strong> <code>${escapeHtml(res.sha256)}</code>`;
  } catch (err) { msgEl.textContent = `बॅकअप एरर: ${err.message}`; }
});

document.getElementById('importEncBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg');
  const passkey = document.getElementById('backupPasskey').value;
  const file = document.getElementById('importEncFile').files && document.getElementById('importEncFile').files[0];
  if (!file) { msgEl.textContent = 'कृपया बॅकअप फाईल निवडा.'; return; }
  try {
    const restored = await decryptPayload(await file.text(), passkey);
    const list = Array.isArray(restored.borrowers) ? restored.borrowers : [];
    for (const item of list) {
      const cleanCopy = { ...item }; delete cleanCopy.id;
      await db.collection('users').doc(state.user.uid).collection('borrowers').add(cleanCopy);
    }
    await appendAuditLog('ENCRYPTED_RESTORE', `${list.length} नोंदी रिस्टोर केल्या`);
    msgEl.textContent = `✅ SHA-256 तपासणी पूर्ण! ${list.length} नोंदी रिस्टोर झाल्या.`;
  } catch (err) { msgEl.textContent = `रिस्टोर एरर: ${err.message}`; }
});

// १६. Login, Lock & Logout
document.getElementById('emailLoginBtn').addEventListener('click', async () => {
  const msg = document.getElementById('authMsg'); msg.textContent = 'लॉगिन होत आहे...';
  try { await auth.signInWithEmailAndPassword(document.getElementById('loginEmail').value.trim(), document.getElementById('loginPassword').value); msg.textContent = ''; }
  catch (e) { msg.textContent = `लॉगिन अयशस्वी: ${e.message}`; }
});

document.getElementById('googleLoginBtn').addEventListener('click', async () => {
  const msg = document.getElementById('authMsg'); msg.textContent = 'Google Login सुरू आहे...';
  try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); msg.textContent = ''; }
  catch (e) { msg.textContent = `Google Login एरर: ${e.message}`; }
});

async function performFullLockAndLogout() {
  if (state.autoLockTimer) { clearTimeout(state.autoLockTimer); state.autoLockTimer = null; }
  if (typeof state.unsubscribeBorrowers === 'function') { state.unsubscribeBorrowers(); state.unsubscribeBorrowers = null; }
  if (typeof state.unsubscribeAudit === 'function') { state.unsubscribeAudit(); state.unsubscribeAudit = null; }
  state.borrowers = []; state.auditLogs = [];
  try { await auth.signOut(); } catch (_) {}
  try {
    localStorage.removeItem('vyaj_v11_audit');
    Object.keys(localStorage).forEach(k => {
      if ((k.startsWith('vyaj_') || k.startsWith('hishob_')) && k !== 'hishob_emergency_vault') {
        localStorage.removeItem(k);
      }
    });
    sessionStorage.clear();
  } catch (_) {}
  try { await db.terminate(); await db.clearPersistence(); } catch (_) {}
  window.location.reload();
}

document.getElementById('lockBtn').addEventListener('click', performFullLockAndLogout);

// १७. Auth State Listener
auth.onAuthStateChanged(async (user) => {
  const authScreen = document.getElementById('authScreen');
  const appScreen = document.getElementById('appScreen');
  const topActions = document.getElementById('topActions');
  const badge = document.getElementById('syncStatus');

  if (typeof state.unsubscribeBorrowers === 'function') { state.unsubscribeBorrowers(); state.unsubscribeBorrowers = null; }
  if (typeof state.unsubscribeAudit === 'function') { state.unsubscribeAudit(); state.unsubscribeAudit = null; }

  if (!user) {
    state.user = null; state.borrowers = []; state.auditLogs = [];
    if (state.autoLockTimer) clearTimeout(state.autoLockTimer);
    authScreen.classList.remove('hidden'); appScreen.classList.add('hidden'); topActions.classList.add('hidden');
    badge.textContent = 'Locked / Signed Out';
    return;
  }

  await ensurePersistenceEnabled();
  state.user = user;
  authScreen.classList.add('hidden'); appScreen.classList.remove('hidden'); topActions.classList.remove('hidden');
  document.getElementById('userEmailBadge').textContent = user.email || '';
  badge.textContent = 'Live Synced';
  resetAutoLockTimer();

  const userRoot = db.collection('users').doc(user.uid);
  userRoot.get().then(docSnap => {
    if (docSnap.exists) {
      const d = docSnap.data();
      if (d.selfWaNumber) { state.selfWaNumber = d.selfWaNumber; document.getElementById('selfWaNumber').value = d.selfWaNumber; }
      if (d.webhookUrl) { state.webhookUrl = d.webhookUrl; document.getElementById('webhookUrlInput').value = d.webhookUrl; }
    }
  }).catch(() => {});

  state.unsubscribeBorrowers = userRoot.collection('borrowers').onSnapshot(
    (snap) => {
      state.borrowers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderBorrowers();
      if (!document.getElementById('passbookModal').classList.contains('hidden')) renderPassbookContent();
    },
    () => { badge.textContent = 'Sync Error'; }
  );

  state.unsubscribeAudit = userRoot.collection('auditLogs').orderBy('ts', 'desc').limit(50).onSnapshot(
    (snap) => { state.auditLogs = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderAuditLogs(); },
    () => { userRoot.collection('auditLogs').limit(50).get().then(snap => { state.auditLogs = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderAuditLogs(); }).catch(() => {}); }
  );
});

// १८. sw.js रजिस्ट्रेशन
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
