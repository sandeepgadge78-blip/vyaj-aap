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
  autoLockMs: 300000,
  currentPassbookBorrowerId: null,
  currentPassbookTab: 'passbook'
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
    await db.collection('users').doc(state.user.uid).collection('auditLogs').add(entry);
  } catch (e) {
    console.warn('Audit log write warning:', e.message);
  }
}

// ६. Flat/Reducing व्याज, Partial Payment, Manual Pending Month, विलंब दंड व वायद्यानुसार बाकी गणित
function compareYm(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

function nextYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function calculateLateFee(borrower, targetYm, isFullyPaid) {
  if (isFullyPaid) return { lateDays: 0, lateFee: 0 };
  const interestDay = Number(borrower.interestDay || 0);
  const lateFeePerDay = Number(borrower.lateFeePerDay || 0);
  if (!interestDay || !lateFeePerDay) return { lateDays: 0, lateFee: 0 };

  const [y, m] = targetYm.split('-').map(Number);
  const maxDayInMonth = new Date(y, m, 0).getDate();
  const safeDueDay = Math.min(interestDay, maxDayInMonth);
  const dueDate = new Date(y, m - 1, safeDueDay);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (today <= dueDate) return { lateDays: 0, lateFee: 0 };
  const diffDays = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
  return { lateDays: diffDays, lateFee: diffDays * lateFeePerDay };
}

function computeLedgerUpToMonth(borrower, targetYm) {
  const principal = Number(borrower.principal || 0);
  const originalPrincipal = Number(borrower.originalPrincipal || principal);
  const interestType = borrower.interestType === 'flat' ? 'flat' : 'reducing';
  const baseForInterest = interestType === 'flat' ? originalPrincipal : principal;
  const rate = Number(borrower.rate || 0);
  const paidMonths = borrower.paidMonths || {};
  const partialPayments = borrower.partialPayments || {};
  const customPastDues = borrower.customPastDues || {};
  const customCashPaid = borrower.customCashPaid || {};

  let runningPastDue = 0;
  let cursor = borrower.startYm || targetYm;
  let guard = 0;

  while (compareYm(cursor, targetYm) <= 0 && guard < 240) {
    guard++;
    const monthlyInterest = Math.round((baseForInterest * rate) / 100);
    const isFullMarked = Boolean(paidMonths[cursor]);
    const partialAmt = Number(partialPayments[cursor] || 0);
    const paidThisMonth = isFullMarked ? monthlyInterest : Math.min(monthlyInterest, partialAmt);
    const remainingThisMonth = Math.max(0, monthlyInterest - paidThisMonth);

    if (Object.prototype.hasOwnProperty.call(customPastDues, cursor)) {
      runningPastDue += Number(customPastDues[cursor] || 0);
    }
    if (Object.prototype.hasOwnProperty.call(customCashPaid, cursor)) {
      runningPastDue = Math.max(0, runningPastDue - Number(customCashPaid[cursor] || 0));
    }

    if (cursor === targetYm) {
      let status = 'pending';
      if (remainingThisMonth === 0 && monthlyInterest > 0) status = 'paid';
      else if (paidThisMonth > 0 && remainingThisMonth > 0) status = 'partial';

      const lateInfo = calculateLateFee(borrower, targetYm, status === 'paid');
      const totalPayable = Math.max(0, runningPastDue) + remainingThisMonth + lateInfo.lateFee;

      return {
        principal,
        originalPrincipal,
        interestType,
        monthlyInterest,
        paidThisMonth,
        remainingThisMonth,
        status,
        isPaid: status === 'paid',
        pastDue: Math.max(0, runningPastDue),
        lateDays: lateInfo.lateDays,
        lateFee: lateInfo.lateFee,
        totalPayable
      };
    }

    // मागील महिन्यातील उरलेले व्याज पुढील महिन्याच्या बाकीत जमा करा
    if (remainingThisMonth > 0) {
      runningPastDue += remainingThisMonth;
    }
    cursor = nextYm(cursor);
  }

  const monthlyInterest = Math.round((baseForInterest * rate) / 100);
  const isFullMarked = Boolean(paidMonths[targetYm]);
  const partialAmt = Number(partialPayments[targetYm] || 0);
  const paidThisMonth = isFullMarked ? monthlyInterest : Math.min(monthlyInterest, partialAmt);
  const remainingThisMonth = Math.max(0, monthlyInterest - paidThisMonth);
  let status = 'pending';
  if (remainingThisMonth === 0 && monthlyInterest > 0) status = 'paid';
  else if (paidThisMonth > 0 && remainingThisMonth > 0) status = 'partial';
  const lateInfo = calculateLateFee(borrower, targetYm, status === 'paid');

  return {
    principal,
    originalPrincipal,
    interestType,
    monthlyInterest,
    paidThisMonth,
    remainingThisMonth,
    status,
    isPaid: status === 'paid',
    pastDue: Math.max(0, runningPastDue),
    lateDays: lateInfo.lateDays,
    lateFee: lateInfo.lateFee,
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
    if (diffDays < 0) return `<span class="err">${escapeHtml(dStr)} (${Math.abs(diffDays)} दिवस उलटले | बाकी ₹${totalPayable})</span>`;
    if (diffDays === 0) return `<span class="warn-text">${escapeHtml(dStr)} (आजचा वायदा | बाकी ₹${totalPayable})</span>`;
    return `${escapeHtml(dStr)} (${diffDays} दिवस बाकी | ₹${totalPayable})`;
  });
  return `<div>📅 वायद्यानुसार बाकी: ${parts.join(' | ')}</div>`;
}

// ७. ग्राहक अ‍ॅक्शन्स (Full Pay, Partial Pay, Reset, Manual Pending Month, Extra/Reduce Principal)
function getBorrowerDoc(borrowerId) {
  return db.collection('users').doc(state.user.uid).collection('borrowers').doc(borrowerId);
}

async function markFullMonthPayment(borrowerId, ym, monthlyInterest) {
  if (!state.user) return;
  const nowIso = new Date().toISOString();
  await getBorrowerDoc(borrowerId).update({
    [`paidMonths.${ym}`]: { paidAt: nowIso, amount: monthlyInterest },
    [`partialPayments.${ym}`]: firebase.firestore.FieldValue.delete(),
    paymentHistory: firebase.firestore.FieldValue.arrayUnion({
      date: nowIso,
      ym,
      type: 'FULL_INTEREST',
      amount: monthlyInterest,
      note: `${ym} पूर्ण व्याज जमा`
    })
  });
  await appendAuditLog('PAYMENT_MARKED', `${borrowerId} साठी ${ym} चे पूर्ण व्याज ₹${monthlyInterest} जमा`);
}

async function addPartialPayment(borrowerId, ym, monthlyInterest, alreadyPaid) {
  if (!state.user) return;
  const inputEl = document.getElementById(`partialPayInput_${borrowerId}`);
  const amt = Number(inputEl ? inputEl.value : 0);
  if (!amt || amt <= 0) {
    alert('कृपया अर्धवट (Partial) जमा रक्कम (₹) टाका.');
    return;
  }
  const nowIso = new Date().toISOString();
  const nextTotal = Number(alreadyPaid || 0) + amt;
  const updatePayload = {
    paymentHistory: firebase.firestore.FieldValue.arrayUnion({
      date: nowIso,
      ym,
      type: 'PARTIAL_INTEREST',
      amount: amt,
      note: `${ym} अर्धवट व्याज जमा`
    })
  };

  if (nextTotal >= monthlyInterest) {
    updatePayload[`paidMonths.${ym}`] = { paidAt: nowIso, amount: monthlyInterest };
    updatePayload[`partialPayments.${ym}`] = firebase.firestore.FieldValue.delete();
  } else {
    updatePayload[`partialPayments.${ym}`] = nextTotal;
  }

  await getBorrowerDoc(borrowerId).update(updatePayload);
  if (inputEl) inputEl.value = '';
  await appendAuditLog('PARTIAL_PAYMENT', `${borrowerId} (${ym}) अर्धवट ₹${amt} जमा (एकूण ₹${nextTotal})`);
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
  if (!ymInput || !/^\d{4}-\d{2}$/.test(ymInput.trim())) {
    alert('कृपया योग्य महिना (YYYY-MM) टाका.');
    return;
  }
  const amtInput = prompt(`${ymInput.trim()} महिन्याची मॅन्युअल बाकी रक्कम (₹) टाका:`, '0');
  const amt = Number(amtInput || 0);
  if (!amt || amt <= 0) return;

  const existingBorrower = state.borrowers.find(b => b.id === borrowerId) || {};
  const prevAmt = Number((existingBorrower.customPastDues && existingBorrower.customPastDues[ymInput.trim()]) || 0);

  await getBorrowerDoc(borrowerId).update({
    [`customPastDues.${ymInput.trim()}`]: prevAmt + amt
  });
  await appendAuditLog('MANUAL_DUE_ADDED', `${borrowerId} साठी ${ymInput.trim()} मध्ये मॅन्युअल बाकी ₹${amt} जोडली`);
}

async function payCustomPastDue(borrowerId, ym, currentPastDue) {
  if (!state.user) return;
  const inputEl = document.getElementById(`payPastInput_${borrowerId}`);
  const amountToPay = Number(inputEl ? inputEl.value : 0);
  if (!amountToPay || amountToPay <= 0) {
    alert('कृपया जमा करायची रक्कम (₹) टाका.');
    return;
  }
  const nowIso = new Date().toISOString();
  const existingBorrower = state.borrowers.find(b => b.id === borrowerId) || {};
  const prevCashPaid = Number((existingBorrower.customCashPaid && existingBorrower.customCashPaid[ym]) || 0);
  const newPastDue = Math.max(0, Number(currentPastDue || 0) - amountToPay);

  const updatePayload = {
    [`customCashPaid.${ym}`]: prevCashPaid + amountToPay,
    paymentHistory: firebase.firestore.FieldValue.arrayUnion({
      date: nowIso,
      ym,
      type: 'PAST_DUE_PAID',
      amount: amountToPay,
      note: `${ym} मागील बाकी जमा`
    })
  };
  if (newPastDue === 0 && existingBorrower.customPastDues && Object.prototype.hasOwnProperty.call(existingBorrower.customPastDues, ym)) {
    updatePayload[`customPastDues.${ym}`] = firebase.firestore.FieldValue.delete();
  }

  await getBorrowerDoc(borrowerId).update(updatePayload);
  if (inputEl) inputEl.value = '';
  await appendAuditLog('PAST_DUE_PAID', `${borrowerId} (${ym}) मधून ₹${amountToPay} जमा; उरलेली बाकी ₹${newPastDue}`);
}

async function clearManualPastDueForMonth(borrowerId, ym) {
  if (!state.user) return;
  await getBorrowerDoc(borrowerId).update({
    [`customPastDues.${ym}`]: firebase.firestore.FieldValue.delete(),
    [`customCashPaid.${ym}`]: firebase.firestore.FieldValue.delete()
  });
  await appendAuditLog('MANUAL_DUE_REMOVED', `${borrowerId} (${ym}) ची मॅन्युअल बाकी नोंद काढली`);
}

async function reducePrincipal(borrowerId, currentPrincipal) {
  if (!state.user) return;
  const inputEl = document.getElementById(`principalAmtInput_${borrowerId}`);
  const amt = Number(inputEl ? inputEl.value : 0);
  if (!amt || amt <= 0) {
    alert('कृपया कमी करायची मुद्दल रक्कम (₹) टाका.');
    return;
  }
  const nowIso = new Date().toISOString();
  const nextPrincipal = Math.max(0, Number(currentPrincipal || 0) - amt);
  await getBorrowerDoc(borrowerId).update({
    principal: nextPrincipal,
    principalReductions: firebase.firestore.FieldValue.arrayUnion({
      date: nowIso,
      amount: amt,
      balanceAfter: nextPrincipal
    })
  });
  if (inputEl) inputEl.value = '';
  await appendAuditLog('PRINCIPAL_REDUCED', `${borrowerId} मुद्दल ₹${amt} ने कमी करून ₹${nextPrincipal} केले`);
}

async function addExtraPrincipal(borrowerId, currentPrincipal, currentOriginal) {
  if (!state.user) return;
  const inputEl = document.getElementById(`principalAmtInput_${borrowerId}`);
  const amt = Number(inputEl ? inputEl.value : 0);
  if (!amt || amt <= 0) {
    alert('कृपया वाढवायची अतिरिक्त मुद्दल रक्कम (₹) टाका.');
    return;
  }
  const nowIso = new Date().toISOString();
  const nextPrincipal = Number(currentPrincipal || 0) + amt;
  const nextOriginal = Number(currentOriginal || currentPrincipal || 0) + amt;
  await getBorrowerDoc(borrowerId).update({
    principal: nextPrincipal,
    originalPrincipal: nextOriginal,
    extraPrincipals: firebase.firestore.FieldValue.arrayUnion({
      date: nowIso,
      amount: amt,
      balanceAfter: nextPrincipal
    })
  });
  if (inputEl) inputEl.value = '';
  await appendAuditLog('PRINCIPAL_ADDED', `${borrowerId} मध्ये अतिरिक्त मुद्दल ₹${amt} जोडले; एकूण ₹${nextPrincipal}`);
}

async function quickEditField(borrowerId, fieldName, label, currentVal) {
  if (!state.user) return;
  const nextVal = prompt(`${label} बदला:`, currentVal || '');
  if (nextVal === null) return;
  const cleaned = fieldName === 'interestDay' ? Number(nextVal || 0) : nextVal.trim();
  await getBorrowerDoc(borrowerId).update({ [fieldName]: cleaned });
  await appendAuditLog('QUICK_EDIT', `${borrowerId} चे ${label} बदलून '${cleaned}' केले`);
}

async function softDeleteBorrower(borrowerId, name) {
  if (!state.user) return;
  if (!confirm(`'${name}' यांना Recycle Bin मध्ये पाठवायचे का?`)) return;
  await getBorrowerDoc(borrowerId).update({ isDeleted: true, deletedAt: new Date().toISOString() });
  await appendAuditLog('SOFT_DELETED', `${name} (${borrowerId}) यांना Recycle Bin मध्ये हलवले`);
}

async function restoreBorrower(borrowerId, name) {
  if (!state.user) return;
  await getBorrowerDoc(borrowerId).update({ isDeleted: false, deletedAt: firebase.firestore.FieldValue.delete() });
  await appendAuditLog('RESTORED', `${name} (${borrowerId}) यांना Restore केले`);
}

async function permanentDeleteBorrower(borrowerId, name) {
  if (!state.user) return;
  if (!confirm(`सावधान! '${name}' यांची नोंद कायमची डिलीट करायची का?`)) return;
  await getBorrowerDoc(borrowerId).delete();
  await appendAuditLog('PERMANENT_DELETED', `${name} (${borrowerId}) कायमचे डिलीट केले`);
}

// ८. Passbook, Payment History व Financial Timeline Modal
function buildBorrowerEvents(b) {
  const events = [];
  if (b.loanDate || b.createdAt) {
    events.push({
      date: b.loanDate || String(b.createdAt).slice(0, 10),
      type: 'कर्ज सुरुवात',
      debit: Number(b.originalPrincipal || b.principal || 0),
      credit: 0,
      note: `मुद्दल वितरण (${b.interestType === 'flat' ? 'Flat' : 'Reducing'} @ ${b.rate || 0}%)`
    });
  }
  (b.extraPrincipals || []).forEach(ep => {
    events.push({
      date: String(ep.date || '').slice(0, 10),
      type: 'अतिरिक्त मुद्दल',
      debit: Number(ep.amount || 0),
      credit: 0,
      note: `मुद्दल वाढले (शिल्लक ₹${ep.balanceAfter || '-'})`
    });
  });
  (b.principalReductions || []).forEach(pr => {
    events.push({
      date: String(pr.date || '').slice(0, 10),
      type: 'मुद्दल कपात',
      debit: 0,
      credit: Number(pr.amount || 0),
      note: `मुद्दल कमी झाले (शिल्लक ₹${pr.balanceAfter || '-'})`
    });
  });
  (b.paymentHistory || []).forEach(ph => {
    events.push({
      date: String(ph.date || '').slice(0, 10),
      type: ph.type || 'भरणा',
      debit: 0,
      credit: Number(ph.amount || 0),
      note: ph.note || `${ph.ym || ''} जमा`
    });
  });
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
    let runningBal = 0;
    const rows = events.map(ev => {
      runningBal += ev.debit - ev.credit;
      return `
        <tr>
          <td>${escapeHtml(ev.date)}</td>
          <td>${escapeHtml(ev.type)} — ${escapeHtml(ev.note)}</td>
          <td>${ev.debit > 0 ? `₹${ev.debit}` : '-'}</td>
          <td class="ok">${ev.credit > 0 ? `₹${ev.credit}` : '-'}</td>
          <td><strong>₹${Math.max(0, runningBal)}</strong></td>
        </tr>
      `;
    }).join('');
    content.innerHTML = `
      <table class="passbook-table">
        <thead><tr><th>तारीख</th><th>तपशील</th><th>नावे (Debit)</th><th>जमा (Credit)</th><th>शिल्लक</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">अद्याप कोणतीही नोंद नाही.</td></tr>'}</tbody>
      </table>
    `;
  } else if (tab === 'timeline') {
    content.innerHTML = events.length
      ? events.map(ev => `
          <div class="meta-box">
            <strong>[${escapeHtml(ev.date)}] ${escapeHtml(ev.type)}</strong> — ${escapeHtml(ev.note)}
            ${ev.debit > 0 ? `<span class="err">(नावे ₹${ev.debit})</span>` : ''}
            ${ev.credit > 0 ? `<span class="ok">(जमा ₹${ev.credit})</span>` : ''}
          </div>
        `).join('')
      : '<p class="muted">Timeline साठी अद्याप नोंदी नाहीत.</p>';
  } else if (tab === 'payments') {
    const list = b.paymentHistory || [];
    content.innerHTML = list.length
      ? list.slice().reverse().map(p => `
          <div class="meta-box">
            <strong>${escapeHtml(String(p.date || '').slice(0, 10))}</strong> | ${escapeHtml(p.ym || '')} |
            <span class="ok">₹${p.amount || 0}</span> — ${escapeHtml(p.note || p.type || '')}
          </div>
        `).join('')
      : '<p class="muted">अद्याप कोणतीही Payment History नोंद नाही.</p>';
  } else if (tab === 'principals') {
    const extras = (b.extraPrincipals || []).map(x => `<div class="meta-box">➕ <strong>${escapeHtml(String(x.date || '').slice(0, 10))}</strong>: अतिरिक्त मुद्दल ₹${x.amount} (नवीन मुद्दल ₹${x.balanceAfter})</div>`).join('');
    const reds = (b.principalReductions || []).map(x => `<div class="meta-box">➖ <strong>${escapeHtml(String(x.date || '').slice(0, 10))}</strong>: मुद्दल कपात ₹${x.amount} (उरलेले मुद्दल ₹${x.balanceAfter})</div>`).join('');
    content.innerHTML = `
      <h4>अतिरिक्त मुद्दल नोंदी</h4>${extras || '<p class="muted">कोणतीही नोंद नाही.</p>'}
      <h4>मुद्दल कपात नोंदी</h4>${reds || '<p class="muted">कोणतीही नोंद नाही.</p>'}
    `;
  }
}

function openPassbookModal(borrowerId) {
  state.currentPassbookBorrowerId = borrowerId;
  state.currentPassbookTab = 'passbook';
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-pbtab') === 'passbook');
  });
  renderPassbookContent();
  document.getElementById('passbookModal').classList.remove('hidden');
}

document.getElementById('closePassbookBtn').addEventListener('click', () => {
  document.getElementById('passbookModal').classList.add('hidden');
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.currentPassbookTab = btn.getAttribute('data-pbtab');
    document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    renderPassbookContent();
  });
});

// ९. EMI Simulator
document.getElementById('calcEmiBtn').addEventListener('click', () => {
  const P = Number(document.getElementById('emiPrincipal').value || 0);
  const r = Number(document.getElementById('emiMonthlyRate').value || 0) / 100;
  const n = Number(document.getElementById('emiMonths').value || 0);
  const type = document.getElementById('emiType').value;
  const out = document.getElementById('emiResult');

  if (P <= 0 || n <= 0) {
    out.textContent = 'कृपया योग्य मुद्दल आणि महिने टाका.';
    return;
  }

  let emi = 0, totalPayable = 0, totalInterest = 0;
  if (type === 'flat') {
    totalInterest = Math.round(P * r * n);
    totalPayable = P + totalInterest;
    emi = Math.round(totalPayable / n);
  } else {
    if (r === 0) {
      emi = Math.round(P / n);
      totalPayable = P;
      totalInterest = 0;
    } else {
      const factor = Math.pow(1 + r, n);
      emi = Math.round((P * r * factor) / (factor - 1));
      totalPayable = emi * n;
      totalInterest = Math.max(0, totalPayable - P);
    }
  }

  out.innerHTML = `
    <div><strong>मासिक EMI:</strong> <span class="ok">₹${emi}</span></div>
    <div><strong>एकूण व्याज:</strong> ₹${totalInterest} | <strong>एकूण परतफेड:</strong> ₹${totalPayable}</div>
  `;
});

// १०. Full Edit Modal
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

document.getElementById('closeEditModalBtn').addEventListener('click', () => {
  document.getElementById('editModal').classList.add('hidden');
});

document.getElementById('saveEditBtn').addEventListener('click', async () => {
  if (!state.user) return;
  const id = document.getElementById('eId').value;
  const name = document.getElementById('eName').value.trim();
  if (!id || !name) {
    alert('ग्राहकाचे नाव आवश्यक आहे.');
    return;
  }

  await getBorrowerDoc(id).update({
    name,
    mobile: document.getElementById('eMobile').value.trim(),
    principal: Number(document.getElementById('ePrincipal').value || 0),
    originalPrincipal: Number(document.getElementById('eOriginalPrincipal').value || 0),
    loanDate: document.getElementById('eLoanDate').value || '',
    startYm: document.getElementById('eStartYm').value || currentYmDefault(),
    rate: Number(document.getElementById('eRate').value || 0),
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
  await appendAuditLog('FULL_EDIT', `${name} (${id}) ची संपूर्ण माहिती अपडेट केली`);
  document.getElementById('editModal').classList.add('hidden');
});

// ११. Safe CSV Parser व Helpers
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
  const recycleCountBadge = document.getElementById('recycleCountBadge');
  const activeYm = document.getElementById('activeYm').value || currentYmDefault();
  const query = (document.getElementById('searchInput').value || '').trim().toLowerCase();

  const activeList = state.borrowers.filter(b => !b.isDeleted);
  const deletedList = state.borrowers.filter(b => b.isDeleted);
  recycleCountBadge.textContent = String(deletedList.length);

  const filtered = activeList.filter(b => {
    if (!query) return true;
    return String(b.name || '').toLowerCase().includes(query) ||
           String(b.mobile || '').toLowerCase().includes(query);
  });

  if (!filtered.length) {
    container.innerHTML = '<p class="muted">कोणतीही सक्रिय कर्ज/व्याज नोंद आढळली नाही.</p>';
  } else {
    container.innerHTML = filtered.map(b => {
      const calc = computeLedgerUpToMonth(b, activeYm);
      const statusText = calc.status === 'paid'
        ? 'पूर्ण जमा'
        : calc.status === 'partial'
          ? `अर्धवट जमा (₹${calc.paidThisMonth} / ₹${calc.monthlyInterest})`
          : 'बाकी';

      return `
        <div class="borrower-item">
          <div class="row" style="justify-content:space-between;">
            <div class="row">
              <strong>1. ग्राहक: ${escapeHtml(b.name || 'नाव नाही')}</strong>
              <span class="badge ${calc.status}">${statusText}</span>
            </div>
            <div class="row">
              <button data-action="passbook" data-id="${b.id}" class="primary sm">📖 Passbook / Timeline</button>
              <button data-action="full-edit" data-id="${b.id}" class="sm">✏️ Full Edit</button>
              <button data-action="soft-delete" data-id="${b.id}" data-name="${escapeHtml(b.name || '')}" class="danger sm">🗑️ Delete</button>
            </div>
          </div>
          <div><strong>2. मुद्दल व पद्धत:</strong> ₹${calc.principal} | दर ${b.rate || 0}% (${calc.interestType === 'flat' ? 'Flat' : 'Reducing'}) ${b.loanDate ? `| तारीख: ${escapeHtml(b.loanDate)}` : ''}</div>
          <div><strong>3. मासिक अपेक्षित व्याज:</strong> ₹${calc.monthlyInterest} ${b.interestDay ? `| व्याजाची तारीख: दरमहा ${b.interestDay}` : ''}</div>
          <div><strong>4. चालू महिना (${activeYm}):</strong> जमा ₹${calc.paidThisMonth} | उरलेले व्याज ₹${calc.remainingThisMonth} ${calc.lateFee > 0 ? `<span class="err">| विलंब दंड (${calc.lateDays} दिवस): ₹${calc.lateFee}</span>` : ''}</div>
          <div><strong>5. मागील बाकी व एकूण देणे:</strong> मागील बाकी ₹${calc.pastDue} | एकूण थकबाकी <strong class="ok">₹${calc.totalPayable}</strong></div>

          <div class="meta-box">
            <div>📱 मोबाईल: ${escapeHtml(b.mobile || '-')} | 🤝 जामीनदार: ${escapeHtml(b.guarantor || '-')}</div>
            <div>💼 नोकरी: ${jobLabel(b.jobType)} ${b.companyDept ? `(${escapeHtml(b.companyDept)})` : ''} ${b.retirementDate ? `| Retirement: ${escapeHtml(b.retirementDate)}` : ''}</div>
            ${getPromiseStatusHtml(b, calc.totalPayable)}
            ${b.note ? `<div>📝 टीप: ${escapeHtml(b.note)}</div>` : ''}
          </div>

          <div style="margin-top:8px;" class="row">
            <button data-action="quick-mobile" data-id="${b.id}" data-val="${escapeHtml(b.mobile || '')}" class="sm">📱 मोबाईल Edit</button>
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
      `;
    }).join('');
  }

  if (!deletedList.length) {
    recycleContainer.innerHTML = '<div class="muted">Recycle Bin रिकामा आहे.</div>';
  } else {
    recycleContainer.innerHTML = deletedList.map(b => `
      <div class="borrower-item">
        <div class="row" style="justify-content:space-between;">
          <div>
            <strong>${escapeHtml(b.name || 'नाव नाही')}</strong>
            <span class="muted">(मुद्दल: ₹${b.principal || 0}, मोबाईल: ${escapeHtml(b.mobile || '-')})</span>
          </div>
          <div class="row">
            <button data-action="restore" data-id="${b.id}" data-name="${escapeHtml(b.name || '')}" class="success sm">♻️ Restore</button>
            <button data-action="perm-delete" data-id="${b.id}" data-name="${escapeHtml(b.name || '')}" class="danger sm">❌ Permanent Delete</button>
          </div>
        </div>
      </div>
    `).join('');
  }
}

document.getElementById('borrowersList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  const id = btn.getAttribute('data-id');
  const ym = btn.getAttribute('data-ym');

  if (action === 'full-pay') markFullMonthPayment(id, ym, Number(btn.getAttribute('data-interest') || 0));
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
  const action = btn.getAttribute('data-action');
  const id = btn.getAttribute('data-id');
  const name = btn.getAttribute('data-name');
  if (action === 'restore') restoreBorrower(id, name);
  else if (action === 'perm-delete') permanentDeleteBorrower(id, name);
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

// १३. नवीन ग्राहक जोडणे
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
    mobile: document.getElementById('bMobile').value.trim(),
    principal,
    originalPrincipal: principal,
    loanDate: document.getElementById('bLoanDate').value || '',
    startYm,
    rate,
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
    isDeleted: false,
    paidMonths: {},
    partialPayments: {},
    paymentHistory: [],
    extraPrincipals: [],
    principalReductions: [],
    customPastDues: customDue > 0 ? { [startYm]: customDue } : {},
    customCashPaid: {},
    createdAt: new Date().toISOString()
  };

  await db.collection('users').doc(state.user.uid).collection('borrowers').add(payload);
  await appendAuditLog('BORROWER_ADDED', `${name} (मुद्दल ₹${principal}, सुरू ${startYm})`);

  ['bName', 'bMobile', 'bPrincipal', 'bLoanDate', 'bCustomDue', 'bInterestDay', 'bGuarantor', 'bCompanyDept', 'bRetirementDate', 'bPromise1', 'bPromise2', 'bPromise3', 'bNote'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('bLateFee').value = '0';
  document.getElementById('bJobType').value = '';
});

document.getElementById('activeYm').addEventListener('change', renderBorrowers);
document.getElementById('searchInput').addEventListener('input', renderBorrowers);

// १४. Google Sheet Import
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
          originalPrincipal: principal,
          rate,
          startYm,
          interestType: 'reducing',
          isDeleted: false,
          paidMonths: {},
          partialPayments: {},
          paymentHistory: [],
          extraPrincipals: [],
          principalReductions: [],
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

// १५. Encrypted Export & Restore
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

// १६. Login, खरा Lock (auth.signOut()) व स्टोरेज साफ करणे
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

  try { await auth.signOut(); } catch (_) {}

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

// १७. Auth State Listener
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
      if (!document.getElementById('passbookModal').classList.contains('hidden')) {
        renderPassbookContent();
      }
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

// १८. sw.js रजिस्ट्रेशन
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
