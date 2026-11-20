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

let persistenceReady = false;
async function ensurePersistenceEnabled() {
  try {
    await db.enablePersistence({ synchronizeTabs: true });
    persistenceReady = true;
  } catch (_) {}
}
ensurePersistenceEnabled();

// २. Multi-language Dictionary (Marathi / Hindi / English)
const I18N = {
  mr: {
    dashTitle: '📊 सर्व खाती Dashboard', lblPrincipal: 'एकूण मुद्दल', lblExpected: 'मासिक अपेक्षित व्याज',
    lblCollected: 'महिन्यात जमा रक्कम', lblPending: 'एकूण बाकी व्याज / थकबाकी',
    remTitle: '📲 WhatsApp व सकाळचे Notification रिमाइंडर', addTitle: 'नवीन ग्राहक / कर्ज नोंद',
    ledgerTitle: 'मासिक हिशोब व जमा नोंद', reportsTitle: '📑 रिपोर्ट्स, CSV, Archive, Scheduled Backup व Webhook'
  },
  hi: {
    dashTitle: '📊 सभी खाते Dashboard', lblPrincipal: 'कुल मूलधन', lblExpected: 'मासिक अपेक्षित ब्याज',
    lblCollected: 'महीने में जमा राशि', lblPending: 'कुल बकाया ब्याज',
    remTitle: '📲 WhatsApp और सुबह का Notification रिमाइंडर', addTitle: 'नया ग्राहक / कर्ज खाता जोड़ें',
    ledgerTitle: 'मासिक हिसाब और जमा नोंद', reportsTitle: '📑 रिपोर्ट्स, CSV, Archive, Scheduled Backup और Webhook'
  },
  en: {
    dashTitle: '📊 All Accounts Dashboard', lblPrincipal: 'Total Principal', lblExpected: 'Monthly Expected Interest',
    lblCollected: 'Collected This Month', lblPending: 'Total Pending Dues',
    remTitle: '📲 WhatsApp & Morning Notification Reminders', addTitle: 'Add New Customer / Loan Account',
    ledgerTitle: 'Monthly Ledger & Payments', reportsTitle: '📑 Reports, CSV, Archive, Scheduled Backup & Webhook'
  }
};

// ३. अ‍ॅप स्टेट
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
  currentVersionBorrowerId: null,
  accountFilter: 'active',
  jobFilter: 'all',
  statusFilter: 'all',
  hideAmounts: false,
  expandAllDetails: false,
  lang: localStorage.getItem('hishob_lang') || 'mr',
  scheduledBackup: localStorage.getItem('hishob_sched_backup') || 'off',
  selfWaNumber: localStorage.getItem('hishob_self_wa') || '',
  webhookUrl: localStorage.getItem('hishob_webhook_url') || '',
  todayPromisesCache: [],
  pendingPartialCache: [],
  security: { fileScans: 0, quarantined: 0, blockedThreats: 0, threatLog: [], writeTimestamps: [] }
};

function applyLanguage(lang) {
  const dict = I18N[lang] || I18N.mr;
  state.lang = lang;
  localStorage.setItem('hishob_lang', lang);
  document.getElementById('langSelect').value = lang;
  document.getElementById('tDashTitle').textContent = dict.dashTitle;
  document.getElementById('tLblPrincipal').textContent = dict.lblPrincipal;
  document.getElementById('tLblExpected').textContent = dict.lblExpected;
  document.getElementById('tLblCollected').textContent = dict.lblCollected;
  document.getElementById('tLblPending').textContent = dict.lblPending;
  document.getElementById('tRemTitle').textContent = dict.remTitle;
  document.getElementById('tAddTitle').textContent = dict.addTitle;
  document.getElementById('tLedgerTitle').textContent = dict.ledgerTitle;
  document.getElementById('tReportsTitle').textContent = dict.reportsTitle;
}
document.getElementById('langSelect').addEventListener('change', (e) => applyLanguage(e.target.value));
applyLanguage(state.lang);

// Network Status Indicator
function updateNetworkBadge() {
  const el = document.getElementById('networkBadge');
  if (navigator.onLine) { el.textContent = 'Online 🟢'; el.className = 'badge paid'; }
  else { el.textContent = 'Offline 🔴'; el.className = 'badge pending'; }
}
window.addEventListener('online', updateNetworkBadge);
window.addEventListener('offline', updateNetworkBadge);
updateNetworkBadge();

// Security Threat Log, Rate Limit व File Validation
function recordThreat(type, reason, isQuarantine = false) {
  state.security.blockedThreats++;
  if (isQuarantine) state.security.quarantined++;
  state.security.threatLog.unshift({ ts: new Date().toISOString().slice(11, 19), type, reason });
  if (state.security.threatLog.length > 50) state.security.threatLog.pop();
  updateSecurityDashboardUI();
}

function checkRateLimit(actionLabel) {
  const now = Date.now();
  state.security.writeTimestamps = state.security.writeTimestamps.filter(t => now - t < 5000);
  if (state.security.writeTimestamps.length >= 15) {
    recordThreat('RATE_LIMIT', `${actionLabel} साठी खूप वेगवान रिक्वेस्ट्स थांबवल्या.`);
    alert('कृपया काही सेकंद थांबा — सुरक्षिततेसाठी तात्पुरते Rate Limit लागू झाले आहे.');
    return false;
  }
  state.security.writeTimestamps.push(now);
  return true;
}

async function validateFileUpload(file, mode) {
  state.security.fileScans++;
  updateSecurityDashboardUI();
  if (!file) return { ok: false, reason: 'फाईल निवडलेली नाही.' };
  const nameLower = String(file.name || '').toLowerCase();

  if (mode === 'image') {
    const validExt = /\.(jpg|jpeg|png|webp)$/.test(nameLower);
    const validMime = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    if (!validExt || !validMime) { recordThreat('INVALID_IMAGE_MIME', `चुकीची इमेज: ${file.name}`, true); return { ok: false, reason: 'फक्त JPG, PNG किंवा WEBP फोटोलाच परवानगी आहे.' }; }
    if (file.size > 5 * 1024 * 1024) { recordThreat('FILE_SIZE_EXCEEDED', `5MB पेक्षा मोठा फोटो: ${file.name}`, true); return { ok: false, reason: 'फोटो 5MB पेक्षा लहान असावा.' }; }
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const isJpeg = head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF;
    const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47;
    const isWebp = head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46;
    if (!isJpeg && !isPng && !isWebp) { recordThreat('MAGIC_BYTES_MISMATCH', `बनावट इमेज Quarantine केली: ${file.name}`, true); return { ok: false, reason: 'ही खरी इमेज फाईल नाही (Quarantine केले).' }; }
    return { ok: true };
  }
  if (mode === 'csv' || mode === 'json') {
    const extOk = mode === 'csv' ? /\.csv$/.test(nameLower) : /\.(json|txt)$/.test(nameLower);
    if (!extOk) { recordThreat('INVALID_EXTENSION', `चुकीचे एक्सटेंशन: ${file.name}`, true); return { ok: false, reason: `फक्त .${mode} फाईललाच परवानगी आहे.` }; }
    if (file.size > 2 * 1024 * 1024) { recordThreat('FILE_SIZE_EXCEEDED', `2MB पेक्षा मोठी फाईल: ${file.name}`, true); return { ok: false, reason: 'फाईल 2MB पेक्षा लहान असावी.' }; }
    if (/<script|javascript:|onerror\s*=/i.test(await file.slice(0, 4096).text())) { recordThreat('SCRIPT_INJECTION_BLOCKED', `संशयास्पद स्क्रिप्ट Quarantine केली: ${file.name}`, true); return { ok: false, reason: 'फाईलमध्ये संशयास्पद स्क्रिप्ट आढळली.' }; }
    return { ok: true };
  }
  return { ok: true };
}

function updateSecurityDashboardUI() {
  document.getElementById('secScanCount').textContent = String(state.security.fileScans);
  document.getElementById('secQuarantineCount').textContent = String(state.security.quarantined);
  document.getElementById('secBlockedCount').textContent = String(state.security.blockedThreats);
  document.getElementById('secNetSync').textContent = `${navigator.onLine ? 'Online' : 'Offline'} / ${document.getElementById('syncStatus').textContent}`;
  document.getElementById('threatLogBox').innerHTML = state.security.threatLog.length
    ? state.security.threatLog.map(t => `<div style="padding:4px 0; border-bottom:1px solid #1e293b;"><span class="muted">[${escapeHtml(t.ts)}]</span> <strong class="err">${escapeHtml(t.type)}</strong> — ${escapeHtml(t.reason)}</div>`).join('')
    : '<div class="muted">कोणताही धोका आढळला नाही.</div>';
}

document.getElementById('openSecurityDashBtn').addEventListener('click', () => { updateSecurityDashboardUI(); document.getElementById('securityModal').classList.remove('hidden'); });
document.getElementById('closeSecurityModalBtn').addEventListener('click', () => document.getElementById('securityModal').classList.add('hidden'));
document.getElementById('runDiagnosticsBtn').addEventListener('click', () => {
  const isHttps = location.protocol === 'https:' || location.hostname === 'localhost';
  const hasCsp = Boolean(document.querySelector('meta[http-equiv="Content-Security-Policy"]'));
  document.getElementById('diagnosticsResult').innerHTML = `
    <div>${isHttps ? '✅' : '❌'} HTTPS सुरक्षित कनेक्शन</div>
    <div>${hasCsp ? '✅' : '❌'} Content Security Policy (CSP) सक्रिय</div>
    <div>${'serviceWorker' in navigator ? '✅' : '❌'} Service Worker सपोर्ट</div>
    <div>${window.crypto && window.crypto.subtle ? '✅' : '❌'} Web Crypto (AES-GCM + SHA-256) उपलब्ध</div>
    <div>${state.user ? '✅' : '❌'} Firebase Auth सेशन सक्रिय</div>
    <div>${persistenceReady ? '✅' : '⚠️'} Offline Persistence स्थिती</div>
    <div>${navigator.onLine ? '✅ Online' : '⚠️ Offline'} नेटवर्क स्थिती</div>
  `;
});

const currentYmDefault = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const getLocalDateIso = (offsetDays = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function fmtAmt(val) { return state.hideAmounts ? '₹••••' : `₹${Number(val || 0)}`; }

document.getElementById('bStartYm').value = currentYmDefault();
document.getElementById('activeYm').value = currentYmDefault();
document.getElementById('selfWaNumber').value = state.selfWaNumber;
document.getElementById('webhookUrlInput').value = state.webhookUrl;
document.getElementById('scheduledBackupSelect').value = state.scheduledBackup;

function resetAutoLockTimer() {
  if (state.autoLockTimer) { clearTimeout(state.autoLockTimer); state.autoLockTimer = null; }
  if (!state.user) return;
  state.autoLockTimer = setTimeout(() => { performFullLockAndLogout(); }, state.autoLockMs);
}
['click', 'keydown', 'touchstart', 'scroll'].forEach(evt => window.addEventListener(evt, resetAutoLockTimer, { passive: true }));
document.getElementById('autoLockSelect').addEventListener('change', (e) => { state.autoLockMs = Number(e.target.value || 300000); resetAutoLockTimer(); });

// Scheduled Cloud Backup
document.getElementById('scheduledBackupSelect').addEventListener('change', (e) => {
  state.scheduledBackup = e.target.value;
  localStorage.setItem('hishob_sched_backup', state.scheduledBackup);
  checkAndRunScheduledBackup();
});

async function checkAndRunScheduledBackup() {
  if (!state.user || state.scheduledBackup === 'off' || !state.borrowers.length) return;
  const lastTs = Number(localStorage.getItem('hishob_last_sched_backup_ts') || 0);
  const now = Date.now();
  const intervalMs = state.scheduledBackup === 'daily' ? 86400000 : state.scheduledBackup === 'weekly' ? 7 * 86400000 : 30 * 86400000;
  if (now - lastTs >= intervalMs) {
    try {
      const nowIso = new Date().toISOString();
      await db.collection('users').doc(state.user.uid).collection('cloudBackups').add({
        createdAt: nowIso, scheduled: state.scheduledBackup, count: state.borrowers.length, borrowers: state.borrowers
      });
      localStorage.setItem('hishob_last_sched_backup_ts', String(now));
      document.getElementById('lastBackupBadge').textContent = `शेवटचा Auto-Backup: ${nowIso.slice(0, 10)}`;
    } catch (_) {}
  } else if (lastTs > 0) {
    document.getElementById('lastBackupBadge').textContent = `शेवटचा Auto-Backup: ${new Date(lastTs).toISOString().slice(0, 10)}`;
  }
}

// Automatic Month-End Report अलर्ट
function checkAutomaticMonthEndReport() {
  const banner = document.getElementById('monthEndBanner');
  const today = new Date();
  const day = today.getDate();
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  if (day >= lastDayOfMonth - 1 || day <= 3) {
    const activeYm = document.getElementById('activeYm').value || currentYmDefault();
    banner.classList.remove('hidden');
    banner.innerHTML = `
      <div class="row" style="justify-content:space-between;">
        <span>📆 <strong>Automatic Month-End Report:</strong> महिन्याचा शेवट / सुरुवात आहे. ${escapeHtml(activeYm)} चा PDF रिपोर्ट किंवा Archive सेव्ह करून घ्या.</span>
        <button id="quickMonthEndPrintBtn" class="primary sm">🖨️ Month-End PDF काढा</button>
      </div>
    `;
    const btn = document.getElementById('quickMonthEndPrintBtn');
    if (btn) btn.onclick = () => document.getElementById('printMonthlyPdfBtn').click();
  } else {
    banner.classList.add('hidden');
  }
}

// Profit & Loss Report Modal
document.getElementById('openPnlBtn').addEventListener('click', () => {
  const activeYm = document.getElementById('activeYm').value || currentYmDefault();
  const nonDeleted = state.borrowers.filter(b => !b.isDeleted);
  let totalDisbursed = 0, totalActivePrincipal = 0, totalRecoveredPrincipal = 0, totalInterestEarned = 0, totalPendingDues = 0, closedCount = 0;

  nonDeleted.forEach(b => {
    const orig = Number(b.originalPrincipal || b.principal || 0);
    totalDisbursed += orig;
    if (b.accountStatus === 'closed') {
      closedCount++;
      totalRecoveredPrincipal += Number((b.settlement && b.settlement.amount) || orig);
    } else {
      totalActivePrincipal += Number(b.principal || 0);
      totalPendingDues += computeLedgerUpToMonth(b, activeYm).totalPayable;
    }
    (b.principalReductions || []).forEach(r => { totalRecoveredPrincipal += Number(r.amount || 0); });
    (b.paymentHistory || []).forEach(p => { totalInterestEarned += Number(p.amount || 0); });
  });

  document.getElementById('pnlContent').innerHTML = `
    <div class="dash-grid">
      <div class="dash-box"><div class="dash-label">एकूण दिलेले मुद्दल</div><div class="dash-val">${fmtAmt(totalDisbursed)}</div></div>
      <div class="dash-box"><div class="dash-label">एकूण मिळालेले व्याज (नफा)</div><div class="dash-val ok">${fmtAmt(totalInterestEarned)}</div></div>
      <div class="dash-box"><div class="dash-label">परत आलेले मुद्दल / सेटलमेंट</div><div class="dash-val">${fmtAmt(totalRecoveredPrincipal)}</div></div>
      <div class="dash-box"><div class="dash-label">सध्याचे सक्रिय मुद्दल</div><div class="dash-val warn-text">${fmtAmt(totalActivePrincipal)}</div></div>
      <div class="dash-box"><div class="dash-label">सध्याची एकूण थकबाकी</div><div class="dash-val err">${fmtAmt(totalPendingDues)}</div></div>
      <div class="dash-box"><div class="dash-label">बंद झालेली खाती</div><div class="dash-val">${closedCount}</div></div>
    </div>
  `;
  document.getElementById('pnlModal').classList.remove('hidden');
});
document.getElementById('closePnlModalBtn').addEventListener('click', () => document.getElementById('pnlModal').classList.add('hidden'));

// Hide/Show, Dark/Light, Expand All
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

// WhatsApp & Notifications
document.getElementById('saveWaNumberBtn').addEventListener('click', async () => {
  const num = document.getElementById('selfWaNumber').value.replace(/\D/g, '');
  const msgEl = document.getElementById('notifStatusMsg');
  if (num.length < 10) { msgEl.textContent = 'कृपया योग्य १० अंकी किंवा 91 सहित नंबर टाका.'; return; }
  const formatted = num.length === 10 ? `91${num}` : num;
  state.selfWaNumber = formatted; document.getElementById('selfWaNumber').value = formatted;
  localStorage.setItem('hishob_self_wa', formatted);
  if (state.user) { try { await db.collection('users').doc(state.user.uid).set({ selfWaNumber: formatted }, { merge: true }); } catch (_) {} }
  msgEl.textContent = `स्वतःचा WhatsApp नंबर (${formatted}) सेव्ह झाला.`;
});

function openSelfWhatsApp(messageText) {
  const num = (state.selfWaNumber || document.getElementById('selfWaNumber').value || '').replace(/\D/g, '');
  if (num.length < 10) { alert('कृपया आधी तुमचा स्वतःचा WhatsApp नंबर सेव्ह करा.'); return; }
  window.open(`https://wa.me/${num.length === 10 ? `91${num}` : num}?text=${encodeURIComponent(messageText)}`, '_blank', 'noopener,noreferrer');
}

document.getElementById('waTodayPromiseBtn').addEventListener('click', () => {
  const todayStr = getLocalDateIso(0);
  if (!state.todayPromisesCache.length) { alert(`आज (${todayStr}) कोणत्याही ग्राहकाचा बाकी वायदा नाही.`); return; }
  const lines = state.todayPromisesCache.map((x, idx) => `${idx + 1}. ${x.name} (${x.mobile || '-'}) — बाकी ₹${x.amount}`);
  openSelfWhatsApp(`🔔 *Hishob — आजच्या वायद्याची यादी (${todayStr})*\n\n${lines.join('\n')}`);
});
document.getElementById('waPendingListBtn').addEventListener('click', () => {
  const activeYm = document.getElementById('activeYm').value || currentYmDefault();
  if (!state.pendingPartialCache.length) { alert(`${activeYm} साठी कोणतेही बाकी किंवा अर्धवट खाते नाही.`); return; }
  const lines = state.pendingPartialCache.map((x, idx) => `${idx + 1}. ${x.name} (${x.status === 'partial' ? 'अर्धवट' : 'बाकी'}) — ₹${x.totalPayable} | ${x.mobile || '-'}`);
  openSelfWhatsApp(`📋 *Hishob — बाकी / अर्धवट खात्यांची यादी (${activeYm})*\n\n${lines.join('\n')}`);
});

function showBrowserNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body }); } catch (_) {}
}
document.getElementById('enableNotifBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('notifStatusMsg');
  if (!('Notification' in window)) { msgEl.textContent = 'Notification उपलब्ध नाही.'; return; }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') { msgEl.textContent = '✅ मोबाईल Notification चालू झाले!'; triggerDailyMorningNotification(true); }
  else msgEl.textContent = 'Notification परवानगी नाकारली.';
});
document.getElementById('testNotifBtn').addEventListener('click', () => {
  if (!('Notification' in window) || Notification.permission !== 'granted') { alert('कृपया आधी Notification चालू करा.'); return; }
  showBrowserNotification('Hishob — रिमाइंडर अलर्ट', `आज ${state.todayPromisesCache.length} वायदे आणि ${state.pendingPartialCache.length} बाकी/अर्धवट खाती आहेत.`);
});
function triggerDailyMorningNotification(force = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const todayStr = getLocalDateIso(0);
  if (!force && localStorage.getItem('hishob_last_notif_date') === todayStr) return;
  if (state.todayPromisesCache.length > 0 || state.pendingPartialCache.length > 0) {
    const body = state.todayPromisesCache.length > 0 ? `आजचे वायदे (${state.todayPromisesCache.length}): ${state.todayPromisesCache.map(x => x.name).slice(0, 3).join(', ')}` : `बाकी/अर्धवट खाती: ${state.pendingPartialCache.length}`;
    showBrowserNotification(`🔔 Hishob सकाळचा रिमाइंडर (${todayStr})`, body);
    localStorage.setItem('hishob_last_notif_date', todayStr);
  }
}

document.getElementById('notifBellBtn').addEventListener('click', () => {
  const box = document.getElementById('notifModalContent');
  const todayHtml = state.todayPromisesCache.length ? state.todayPromisesCache.map(x => `<div class="meta-box"><strong>${escapeHtml(x.name)}</strong> (${escapeHtml(x.mobile || '-')}) — <strong class="err">${fmtAmt(x.amount)}</strong></div>`).join('') : '<p class="muted">आज वायदा नाही.</p>';
  const pendingHtml = state.pendingPartialCache.length ? state.pendingPartialCache.map(x => `<div class="meta-box"><strong>${escapeHtml(x.name)}</strong> (${x.status === 'partial' ? 'अर्धवट' : 'बाकी'}) — <strong class="warn-text">${fmtAmt(x.totalPayable)}</strong></div>`).join('') : '<p class="muted">सर्व खात्यांचे व्याज जमा आहे.</p>';
  box.innerHTML = `<h4>📅 आजचे वायदे (${state.todayPromisesCache.length})</h4>${todayHtml}<h4 style="margin-top:12px;">⏳ बाकी / अर्धवट खाती (${state.pendingPartialCache.length})</h4>${pendingHtml}`;
  document.getElementById('notifModal').classList.remove('hidden');
});
document.getElementById('closeNotifModalBtn').addEventListener('click', () => document.getElementById('notifModal').classList.add('hidden'));

// Voice Search & Filters
document.getElementById('voiceSearchBtn').addEventListener('click', () => {
  const msgEl = document.getElementById('voiceStatusMsg'), SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) { msgEl.textContent = 'Voice Search उपलब्ध नाही.'; return; }
  const recognition = new SpeechRec(); recognition.lang = 'mr-IN'; msgEl.textContent = '🎙️ बोला (मराठीत)...';
  recognition.onresult = (e) => { const t = (e.results[0][0].transcript || '').trim(); document.getElementById('searchInput').value = t; msgEl.textContent = `शोधले: "${t}"`; renderBorrowers(); };
  recognition.onerror = (err) => { msgEl.textContent = `Voice एरर: ${err.error}`; };
  recognition.onend = () => { if (msgEl.textContent.startsWith('🎙️')) msgEl.textContent = ''; };
  recognition.start();
});

document.querySelectorAll('button[data-accfilter]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.accountFilter = btn.getAttribute('data-accfilter');
    document.querySelectorAll('button[data-accfilter]').forEach(b => b.classList.remove('filter-active'));
    btn.classList.add('filter-active'); renderBorrowers();
  });
});
document.querySelectorAll('button[data-jobfilter]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.jobFilter = btn.getAttribute('data-jobfilter');
    document.querySelectorAll('button[data-jobfilter]').forEach(b => b.classList.remove('filter-active'));
    btn.classList.add('filter-active'); renderBorrowers();
  });
});
document.querySelectorAll('button[data-statusfilter]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.statusFilter = btn.getAttribute('data-statusfilter');
    document.querySelectorAll('button[data-statusfilter]').forEach(b => b.classList.remove('filter-active'));
    btn.classList.add('filter-active'); renderBorrowers();
  });
});

// ४. Base64, SHA-256 व AES-GCM Helpers
function uint8ToBase64(bytes) { let b = ''; for (let i = 0; i < bytes.length; i += 0x8000) b += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(b); }
function base64ToUint8(str) { const bin = atob(str), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
async function computeSha256Hex(text) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))).map(b => b.toString(16).padStart(2, '0')).join(''); }
async function deriveAesKey(passkey, saltBytes) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(passkey), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: saltBytes, iterations: 150000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptPayload(obj, passkey) {
  if (!passkey || passkey.trim().length < 6) throw new Error('कृपया किमान ६ अक्षरांची मजबूत Passkey टाका.');
  const plainText = JSON.stringify(obj), sha256 = await computeSha256Hex(plainText);
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveAesKey(passkey, salt), new TextEncoder().encode(plainText));
  return { sha256, jsonString: JSON.stringify({ v: 12, sha256, salt: uint8ToBase64(salt), iv: uint8ToBase64(iv), data: uint8ToBase64(new Uint8Array(cipherBuffer)) }) };
}
async function decryptPayload(jsonText, passkey) {
  if (!passkey || passkey.trim().length < 6) throw new Error('योग्य Passkey टाका.');
  const parsed = JSON.parse(jsonText);
  const plainText = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToUint8(parsed.iv) }, await deriveAesKey(passkey, base64ToUint8(parsed.salt)), base64ToUint8(parsed.data)));
  if (parsed.sha256 && (await computeSha256Hex(plainText)) !== parsed.sha256) {
    recordThreat('TAMPERING_DETECTED', 'Backup फाईलचा SHA-256 हॅश जुळला नाही.', true);
    throw new Error('SHA-256 तपासणी अयशस्वी!');
  }
  return JSON.parse(plainText);
}

async function appendAuditLog(action, details) {
  if (!state.user) return;
  try { await db.collection('users').doc(state.user.uid).collection('auditLogs').add({ action, details, by: state.user.email || state.user.uid, ts: new Date().toISOString() }); } catch (_) {}
}

// ५. हिशोब गणित
function compareYm(a, b) { return String(a || '').localeCompare(String(b || '')); }
function nextYm(ym) { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; }

function calculateLateFee(borrower, targetYm, isFullyPaid) {
  if (isFullyPaid || borrower.accountStatus === 'closed') return { lateDays: 0, lateFee: 0 };
  const interestDay = Number(borrower.interestDay || 0), lateFeePerDay = Number(borrower.lateFeePerDay || 0);
  if (!interestDay || !lateFeePerDay) return { lateDays: 0, lateFee: 0 };
  const [y, m] = targetYm.split('-').map(Number);
  const dueDate = new Date(y, m - 1, Math.min(interestDay, new Date(y, m, 0).getDate()));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (today <= dueDate) return { lateDays: 0, lateFee: 0 };
  const diffDays = Math.floor((today - dueDate) / 86400000);
  return { lateDays: diffDays, lateFee: diffDays * lateFeePerDay };
}

function getMonthlyInterestAmount(borrower) {
  if (borrower.accountStatus === 'closed') return 0;
  const fixedInt = Number(borrower.fixedMonthlyInterest || 0);
  if (fixedInt > 0) return Math.round(fixedInt);
  const principal = Number(borrower.principal || 0);
  const base = borrower.interestType === 'flat' ? Number(borrower.originalPrincipal || principal) : principal;
  return Math.round((base * Number(borrower.rate || 0)) / 100);
}

function computeLedgerUpToMonth(borrower, targetYm) {
  const principal = Number(borrower.principal || 0);
  const originalPrincipal = Number(borrower.originalPrincipal || principal);
  const interestType = borrower.interestType === 'flat' ? 'flat' : 'reducing';
  if (borrower.accountStatus === 'closed') {
    return { principal: 0, originalPrincipal, interestType, monthlyInterest: 0, paidThisMonth: 0, collectedInMonth: 0, remainingThisMonth: 0, status: 'closed', isPaid: true, pastDue: 0, lateDays: 0, lateFee: 0, totalPayable: 0 };
  }
  const monthlyInterest = getMonthlyInterestAmount(borrower);
  const paidMonths = borrower.paidMonths || {}, partialPayments = borrower.partialPayments || {};
  const customPastDues = borrower.customPastDues || {}, customCashPaid = borrower.customCashPaid || {};
  let runningPastDue = 0, cursor = borrower.startYm || targetYm, guard = 0;

  while (compareYm(cursor, targetYm) <= 0 && guard < 240) {
    guard++;
    const paidThisMonth = Boolean(paidMonths[cursor]) ? monthlyInterest : Math.min(monthlyInterest, Number(partialPayments[cursor] || 0));
    const remainingThisMonth = Math.max(0, monthlyInterest - paidThisMonth);
    const pastPaidThisMonth = Number(customCashPaid[cursor] || 0);
    if (Object.prototype.hasOwnProperty.call(customPastDues, cursor)) runningPastDue += Number(customPastDues[cursor] || 0);
    if (Object.prototype.hasOwnProperty.call(customCashPaid, cursor)) runningPastDue = Math.max(0, runningPastDue - pastPaidThisMonth);

    if (cursor === targetYm) {
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
    if (remainingThisMonth > 0) runningPastDue += remainingThisMonth;
    cursor = nextYm(cursor);
  }
  const paidThisMonth = Boolean(paidMonths[targetYm]) ? monthlyInterest : Math.min(monthlyInterest, Number(partialPayments[targetYm] || 0));
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
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const parts = dates.map(dStr => {
    const diffDays = Math.round((new Date(dStr + 'T00:00:00') - today) / 86400000);
    if (totalPayable <= 0) return `${escapeHtml(dStr)} (पूर्ण जमा)`;
    if (diffDays < 0) return `<span class="err">${escapeHtml(dStr)} (${Math.abs(diffDays)} दिवस उलटले | बाकी ${fmtAmt(totalPayable)})</span>`;
    if (diffDays === 0) return `<span class="warn-text">${escapeHtml(dStr)} (आजचा वायदा | बाकी ${fmtAmt(totalPayable)})</span>`;
    return `${escapeHtml(dStr)} (${diffDays} दिवस बाकी | ${fmtAmt(totalPayable)})`;
  });
  return `<div>📅 वायद्यानुसार बाकी: ${parts.join(' | ')}</div>`;
}

// ६. खाते बंद (Final Settlement), Re-open, Follow-up व एकाच ग्राहकाचे नवीन कर्ज
async function closeAccountWithSettlement(borrowerId, name, currentPrincipal, totalPending) {
  if (!state.user || !checkRateLimit('CLOSE_ACC')) return;
  const suggested = Number(currentPrincipal || 0) + Number(totalPending || 0);
  const amtStr = prompt(`'${name}' यांचे खाते बंद करण्यासाठी Final Settlement रक्कम (₹) टाका:`, String(suggested));
  if (amtStr === null) return;
  const note = prompt('Final Settlement टीप (पर्यायी):', 'संपूर्ण हिशोब पूर्ण') || '';
  const nowIso = new Date().toISOString();
  await getBorrowerDoc(borrowerId).update({
    accountStatus: 'closed',
    settlement: { amount: Number(amtStr || 0), date: nowIso.slice(0, 10), note: note.trim(), closedAt: nowIso }
  });
  await appendAuditLog('ACCOUNT_CLOSED', `${name} खाते बंद केले (Final Settlement: ₹${amtStr})`);
}

async function reopenAccount(borrowerId, name) {
  if (!state.user || !confirm(`'${name}' यांचे बंद खाते पुन्हा Active करायचे का?`)) return;
  await getBorrowerDoc(borrowerId).update({ accountStatus: 'active' });
  await appendAuditLog('ACCOUNT_REOPENED', `${name} खाते पुन्हा Active केले`);
}

async function addFollowUpNote(borrowerId, name) {
  if (!state.user || !checkRateLimit('FOLLOWUP')) return;
  const note = prompt(`'${name}' यांच्याशी झालेल्या Follow-up ची टीप लिहा (उदा. कॉल केला, सोमवारी देतील):`);
  if (!note || !note.trim()) return;
  const entry = { date: getLocalDateIso(0), ts: new Date().toISOString(), note: note.trim() };
  await getBorrowerDoc(borrowerId).update({
    followUps: firebase.firestore.FieldValue.arrayUnion(entry)
  });
  await appendAuditLog('FOLLOWUP_LOGGED', `${name}: ${note.trim()}`);
}

function prefillNewLoanForCustomer(borrowerId) {
  const b = state.borrowers.find(x => x.id === borrowerId);
  if (!b) return;
  const existingLoansCount = state.borrowers.filter(x => !x.isDeleted && String(x.name || '').trim().toLowerCase() === String(b.name || '').trim().toLowerCase()).length;
  document.getElementById('bName').value = b.name || '';
  document.getElementById('bLoanLabel').value = `कर्ज #${existingLoansCount + 1}`;
  document.getElementById('bMobile').value = b.mobile || '';
  document.getElementById('bGuarantor').value = b.guarantor || '';
  document.getElementById('bExtraGuarantors').value = b.extraGuarantors || '';
  document.getElementById('bJobType').value = b.jobType || '';
  document.getElementById('bCompanyDept').value = b.companyDept || '';
  document.getElementById('bPrincipal').value = '';
  document.getElementById('addBorrowerSection').scrollIntoView({ behavior: 'smooth' });
  document.getElementById('bPrincipal').focus();
}

// ७. Version History व Conflict Rollback
function buildVersionSnapshot(b) {
  return {
    savedAt: new Date().toISOString(), name: b.name || '', mobile: b.mobile || '',
    principal: Number(b.principal || 0), originalPrincipal: Number(b.originalPrincipal || b.principal || 0),
    rate: Number(b.rate || 0), fixedMonthlyInterest: Number(b.fixedMonthlyInterest || 0),
    interestType: b.interestType || 'reducing', interestDay: Number(b.interestDay || 0),
    guarantor: b.guarantor || '', extraGuarantors: b.extraGuarantors || '', note: b.note || ''
  };
}

function openVersionModal(borrowerId) {
  const b = state.borrowers.find(x => x.id === borrowerId);
  if (!b) return;
  state.currentVersionBorrowerId = borrowerId;
  document.getElementById('versionModalTitle').textContent = `🕒 ${b.name || 'ग्राहक'} — Version History व Rollback`;
  const list = Array.isArray(b.versionHistory) ? b.versionHistory : [];
  document.getElementById('versionModalContent').innerHTML = !list.length
    ? '<p class="muted">अद्याप कोणतीही जुनी आवृत्ती सेव्ह झालेली नाही.</p>'
    : list.slice().reverse().map((v, revIdx) => {
        const origIdx = list.length - 1 - revIdx;
        return `<div class="meta-box"><div class="row" style="justify-content:space-between;"><div><strong>आवृत्ती #${origIdx + 1}</strong> <span class="muted">(${escapeHtml(String(v.savedAt || '').slice(0, 19).replace('T', ' '))})</span><div>नाव: ${escapeHtml(v.name)} | मुद्दल: ${fmtAmt(v.principal)} | दर: ${v.rate}%</div></div><button data-rollback-idx="${origIdx}" class="warn sm">↩️ Rollback</button></div></div>`;
      }).join('');
  document.getElementById('versionModal').classList.remove('hidden');
}
document.getElementById('closeVersionModalBtn').addEventListener('click', () => document.getElementById('versionModal').classList.add('hidden'));
document.getElementById('versionModalContent').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-rollback-idx]');
  if (!btn || !state.currentVersionBorrowerId || !checkRateLimit('ROLLBACK')) return;
  const idx = Number(btn.getAttribute('data-rollback-idx')), b = state.borrowers.find(x => x.id === state.currentVersionBorrowerId);
  if (!b || !b.versionHistory || !b.versionHistory[idx] || !confirm(`आवृत्ती #${idx + 1} वर Rollback करायचे का?`)) return;
  const v = b.versionHistory[idx];
  await getBorrowerDoc(b.id).update({ name: v.name, mobile: v.mobile, principal: v.principal, originalPrincipal: v.originalPrincipal, rate: v.rate, fixedMonthlyInterest: v.fixedMonthlyInterest, interestType: v.interestType, interestDay: v.interestDay, guarantor: v.guarantor, extraGuarantors: v.extraGuarantors || '', note: v.note });
  await appendAuditLog('CONFLICT_ROLLBACK', `${b.name} ला आवृत्ती #${idx + 1} वर Rollback केले`);
  document.getElementById('versionModal').classList.add('hidden');
});

// ८. रिपोर्ट्स, CSV, Gmail, Webhook, Vault, Cloud Backup व Archive
function downloadTextFile(filename, content, mimeType) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
function csvCell(val) { return `"${String(val === undefined || val === null ? '' : val).replace(/"/g, '""')}"`; }

document.getElementById('printMonthlyPdfBtn').addEventListener('click', () => {
  const activeYm = document.getElementById('activeYm').value || currentYmDefault();
  const list = state.borrowers.filter(b => !b.isDeleted && b.accountStatus !== 'closed');
  let totP = 0, totInt = 0, totCol = 0, totPen = 0;
  const rows = list.map((b, i) => {
    const c = computeLedgerUpToMonth(b, activeYm);
    totP += c.principal; totInt += c.monthlyInterest; totCol += c.collectedInMonth; totPen += c.totalPayable;
    return `<tr><td>${i + 1}</td><td>${escapeHtml(b.name)}${b.loanLabel ? ` (${escapeHtml(b.loanLabel)})` : ''}</td><td>${escapeHtml(b.mobile || '-')}</td><td>₹${c.principal}</td><td>₹${c.monthlyInterest}</td><td>₹${c.collectedInMonth}</td><td>₹${c.totalPayable}</td><td>${c.status === 'paid' ? 'पूर्ण जमा' : c.status === 'partial' ? 'अर्धवट' : 'बाकी'}</td></tr>`;
  }).join('');
  document.getElementById('printArea').innerHTML = `<h2>Hishob — मासिक अहवाल (${activeYm})</h2><p>एकूण मुद्दल: ₹${totP} | अपेक्षित व्याज: ₹${totInt} | जमा: ₹${totCol} | थकबाकी: ₹${totPen}</p><table><thead><tr><th>क्र.</th><th>ग्राहक</th><th>मोबाईल</th><th>मुद्दल</th><th>व्याज</th><th>जमा</th><th>थकबाकी</th><th>स्थिती</th></tr></thead><tbody>${rows}</tbody></table>`;
  window.print();
});

document.getElementById('exportMonthlyCsvBtn').addEventListener('click', () => {
  const activeYm = document.getElementById('activeYm').value || currentYmDefault();
  const lines = [['नाव', 'कर्ज खाते', 'मोबाईल', 'मुद्दल', 'दर (%)', 'मासिक व्याज', 'चालू जमा', 'मागील बाकी', 'एकूण थकबाकी', 'स्थिती'].map(csvCell).join(',')];
  state.borrowers.filter(b => !b.isDeleted && b.accountStatus !== 'closed').forEach(b => {
    const c = computeLedgerUpToMonth(b, activeYm);
    lines.push([b.name, b.loanLabel || '', b.mobile || '', c.principal, b.rate || 0, c.monthlyInterest, c.paidThisMonth, c.pastDue, c.totalPayable, c.status].map(csvCell).join(','));
  });
  downloadTextFile(`hishob-monthly-${activeYm}.csv`, '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8;');
  document.getElementById('ioMsg').textContent = `${activeYm} ची Excel-सुसंगत CSV डाउनलोड झाली.`;
});

document.getElementById('exportAllCsvBtn').addEventListener('click', () => {
  const lines = [['नाव', 'मुद्दल', 'दर (%)', 'सुरू महिना', 'मोबाईल', 'खाते स्थिती', 'कर्ज खाते', 'जामीनदार', 'अतिरिक्त जामीनदार', 'नोकरी', 'कंपनी/डिपार्टमेंट', 'टीप'].map(csvCell).join(',')];
  state.borrowers.filter(b => !b.isDeleted).forEach(b => {
    lines.push([b.name, b.principal, b.rate || 0, b.startYm || '', b.mobile || '', b.accountStatus || 'active', b.loanLabel || '', b.guarantor || '', b.extraGuarantors || '', b.jobType || '', b.companyDept || '', b.note || ''].map(csvCell).join(','));
  });
  downloadTextFile(`hishob-all-accounts-${getLocalDateIso(0)}.csv`, '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8;');
  document.getElementById('ioMsg').textContent = 'संपूर्ण खात्यांची CSV डाउनलोड झाली.';
});

document.getElementById('importCsvBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg'), file = document.getElementById('importCsvFile').files && document.getElementById('importCsvFile').files[0];
  if (!state.user || !checkRateLimit('CSV_IMPORT')) return;
  const check = await validateFileUpload(file, 'csv');
  if (!check.ok) { msgEl.textContent = `❌ ${check.reason}`; return; }
  try {
    const lines = (await file.text()).replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]), name = cols[0], principal = Number(cols[1] || 0), rate = Number(cols[2] || 2), startYm = cols[3] || currentYmDefault();
      if (name && principal > 0) {
        await db.collection('users').doc(state.user.uid).collection('borrowers').add({
          name, principal, originalPrincipal: principal, rate, fixedMonthlyInterest: 0, startYm, mobile: cols[4] || '',
          accountStatus: 'active', interestType: 'reducing', isDeleted: false, paidMonths: {}, partialPayments: {},
          paymentHistory: [], extraPrincipals: [], principalReductions: [], versionHistory: [], followUps: [],
          customPastDues: {}, customCashPaid: {}, createdAt: new Date().toISOString()
        });
        count++;
      }
    }
    await appendAuditLog('CSV_IMPORT', `${count} नोंदी CSV मधून आयात`);
    msgEl.textContent = `✅ ${count} नोंदी CSV मधून आयात झाल्या.`;
  } catch (err) { msgEl.textContent = `CSV Import एरर: ${err.message}`; }
});

document.getElementById('gmailReportBtn').addEventListener('click', () => {
  const activeYm = document.getElementById('activeYm').value || currentYmDefault();
  let totP = 0, totInt = 0, totCol = 0, totPen = 0;
  const rows = state.borrowers.filter(b => !b.isDeleted && b.accountStatus !== 'closed').map((b, i) => {
    const c = computeLedgerUpToMonth(b, activeYm);
    totP += c.principal; totInt += c.monthlyInterest; totCol += c.collectedInMonth; totPen += c.totalPayable;
    return `${i + 1}. ${b.name} | मुद्दल ₹${c.principal} | व्याज ₹${c.monthlyInterest} | थकबाकी ₹${c.totalPayable}`;
  });
  const body = `Hishob मासिक अहवाल (${activeYm})\nएकूण मुद्दल: ₹${totP}\nअपेक्षित व्याज: ₹${totInt}\nजमा: ₹${totCol}\nथकबाकी: ₹${totPen}\n\n${rows.join('\n')}`;
  window.location.href = `mailto:${encodeURIComponent(state.user ? state.user.email : '')}?subject=${encodeURIComponent(`Hishob मासिक अहवाल (${activeYm})`)}&body=${encodeURIComponent(body)}`;
});

document.getElementById('saveWebhookBtn').addEventListener('click', async () => {
  const url = document.getElementById('webhookUrlInput').value.trim();
  state.webhookUrl = url; localStorage.setItem('hishob_webhook_url', url);
  if (state.user) { try { await db.collection('users').doc(state.user.uid).set({ webhookUrl: url }, { merge: true }); } catch (_) {} }
  document.getElementById('ioMsg').textContent = 'Webhook URL सेव्ह झाली.';
});
document.getElementById('sendWebhookBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg'), url = document.getElementById('webhookUrlInput').value.trim();
  if (!url || !checkRateLimit('WEBHOOK')) { msgEl.textContent = 'Webhook URL टाका.'; return; }
  try {
    const activeYm = document.getElementById('activeYm').value || currentYmDefault();
    await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ym: activeYm, sentAt: new Date().toISOString(), borrowers: state.borrowers.filter(b => !b.isDeleted).map(b => ({ name: b.name, mobile: b.mobile || '', ...computeLedgerUpToMonth(b, activeYm) })) }) });
    await appendAuditLog('WEBHOOK_SENT', `${activeYm} अहवाल Webhook वर पाठवला`);
    msgEl.textContent = '✅ Webhook वर डेटा पाठवला गेला.';
  } catch (err) { msgEl.textContent = `Webhook एरर: ${err.message}`; }
});

document.getElementById('saveLocalVaultBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg');
  try {
    const res = await encryptPayload({ savedAt: new Date().toISOString(), borrowers: state.borrowers }, document.getElementById('backupPasskey').value);
    localStorage.setItem('hishob_emergency_vault', res.jsonString);
    msgEl.textContent = '🛡️ Encrypted Emergency Local Vault सेव्ह झाला.';
  } catch (err) { msgEl.textContent = `Vault एरर: ${err.message}`; }
});
document.getElementById('restoreLocalVaultBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg'), raw = localStorage.getItem('hishob_emergency_vault');
  if (!raw || !checkRateLimit('VAULT_RESTORE')) { msgEl.textContent = 'कोणताही Local Vault सापडला नाही.'; return; }
  try {
    const list = (await decryptPayload(raw, document.getElementById('backupPasskey').value)).borrowers || [];
    for (const item of list) { const copy = { ...item }; delete copy.id; await db.collection('users').doc(state.user.uid).collection('borrowers').add(copy); }
    msgEl.textContent = `♻️ Local Vault मधून ${list.length} नोंदी रिस्टोर झाल्या.`;
  } catch (err) { msgEl.textContent = `Vault Restore एरर: ${err.message}`; }
});
document.getElementById('saveCloudBackupBtn').addEventListener('click', async () => {
  if (!state.user || !checkRateLimit('CLOUD_BACKUP')) return;
  const msgEl = document.getElementById('ioMsg');
  try {
    const nowIso = new Date().toISOString();
    await db.collection('users').doc(state.user.uid).collection('cloudBackups').add({ createdAt: nowIso, count: state.borrowers.length, borrowers: state.borrowers });
    await appendAuditLog('CLOUD_BACKUP', `${state.borrowers.length} खात्यांचा Cloud Backup सेव्ह`);
    msgEl.textContent = `☁️ Cloud Backup सेव्ह झाला (${nowIso.slice(0, 10)}).`;
  } catch (err) { msgEl.textContent = `Cloud Backup एरर: ${err.message}`; }
});
document.getElementById('saveMonthlyArchiveBtn').addEventListener('click', async () => {
  if (!state.user || !checkRateLimit('MONTHLY_ARCHIVE')) return;
  const msgEl = document.getElementById('ioMsg'), activeYm = document.getElementById('activeYm').value || currentYmDefault();
  try {
    const summary = state.borrowers.filter(b => !b.isDeleted).map(b => ({ id: b.id, name: b.name, ...computeLedgerUpToMonth(b, activeYm) }));
    await db.collection('users').doc(state.user.uid).collection('monthlyArchives').doc(activeYm).set({ ym: activeYm, archivedAt: new Date().toISOString(), count: summary.length, records: summary });
    await appendAuditLog('MONTHLY_ARCHIVE', `${activeYm} चा Archive सेव्ह`);
    msgEl.textContent = `📦 ${activeYm} चा मासिक Archive सेव्ह झाला.`;
  } catch (err) { msgEl.textContent = `Archive एरर: ${err.message}`; }
});

// ९. Document Upload व Gallery
function compressImageToBase64(file, maxWidth = 800, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width), canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('फोटो वाचता आला नाही.')); img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('फाईल वाचता आली नाही.')); reader.readAsDataURL(file);
  });
}
async function loadBorrowerDocs(borrowerId) {
  const grid = document.getElementById('docGalleryGrid'); grid.innerHTML = '<div class="muted">लोड होत आहे...</div>';
  try {
    const snap = await getBorrowerDoc(borrowerId).collection('documents').orderBy('uploadedAt', 'desc').get();
    grid.innerHTML = snap.empty ? '<div class="muted">कोणतेही डॉक्युमेंट नाही.</div>' : snap.docs.map(d => {
      const doc = d.data();
      return `<div class="doc-card"><img src="${doc.dataUrl}" alt="${escapeHtml(doc.docName || 'Doc')}" /><div style="margin-top:6px;"><strong>${escapeHtml(doc.docName || 'डॉक्युमेंट')}</strong></div><div class="muted">${escapeHtml(String(doc.uploadedAt || '').slice(0, 10))}</div><button data-deldoc="${d.id}" class="danger sm" style="margin-top:6px;">डिलीट</button></div>`;
    }).join('');
  } catch (err) { grid.innerHTML = `<div class="err">एरर: ${escapeHtml(err.message)}</div>`; }
}
function openDocsModal(borrowerId) {
  const b = state.borrowers.find(x => x.id === borrowerId); if (!b) return;
  state.currentDocsBorrowerId = borrowerId;
  document.getElementById('docsModalTitle').textContent = `📎 ${b.name || 'ग्राहक'} — Document Gallery`;
  document.getElementById('docUploadMsg').textContent = '';
  document.getElementById('docsModal').classList.remove('hidden'); loadBorrowerDocs(borrowerId);
}
document.getElementById('closeDocsModalBtn').addEventListener('click', () => document.getElementById('docsModal').classList.add('hidden'));
document.getElementById('uploadDocBtn').addEventListener('click', async () => {
  if (!state.user || !state.currentDocsBorrowerId || !checkRateLimit('DOC_UPLOAD')) return;
  const docName = document.getElementById('docNameInput').value.trim(), fileInput = document.getElementById('docFileInput'), file = fileInput.files && fileInput.files[0], msgEl = document.getElementById('docUploadMsg');
  if (!docName || !file) { msgEl.textContent = 'डॉक्युमेंटचे नाव आणि फोटो निवडा.'; return; }
  const check = await validateFileUpload(file, 'image');
  if (!check.ok) { msgEl.textContent = `❌ ${check.reason}`; return; }
  try {
    msgEl.textContent = 'फोटो तपासून अपलोड करत आहे...';
    await getBorrowerDoc(state.currentDocsBorrowerId).collection('documents').add({ docName, dataUrl: await compressImageToBase64(file), uploadedAt: new Date().toISOString() });
    await appendAuditLog('DOC_UPLOADED', `${state.currentDocsBorrowerId} साठी '${docName}' अपलोड`);
    document.getElementById('docNameInput').value = ''; fileInput.value = ''; msgEl.textContent = '✅ सेव्ह झाले.';
    loadBorrowerDocs(state.currentDocsBorrowerId);
  } catch (err) { msgEl.textContent = `Upload एरर: ${err.message}`; }
});
document.getElementById('docGalleryGrid').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-deldoc]');
  if (!btn || !state.currentDocsBorrowerId || !confirm('डिलीट करायचे का?')) return;
  await getBorrowerDoc(state.currentDocsBorrowerId).collection('documents').doc(btn.getAttribute('data-deldoc')).delete();
  loadBorrowerDocs(state.currentDocsBorrowerId);
});

// १०. ग्राहक अ‍ॅक्शन्स
function getBorrowerDoc(borrowerId) { return db.collection('users').doc(state.user.uid).collection('borrowers').doc(borrowerId); }
async function markFullMonthPayment(borrowerId, ym, monthlyInterest) {
  if (!state.user || !checkRateLimit('FULL_PAY')) return;
  const nowIso = new Date().toISOString();
  await getBorrowerDoc(borrowerId).update({ [`paidMonths.${ym}`]: { paidAt: nowIso, amount: monthlyInterest }, [`partialPayments.${ym}`]: firebase.firestore.FieldValue.delete(), paymentHistory: firebase.firestore.FieldValue.arrayUnion({ date: nowIso, ym, type: 'FULL_INTEREST', amount: monthlyInterest, note: `${ym} पूर्ण व्याज जमा` }) });
  await appendAuditLog('PAYMENT_MARKED', `${borrowerId} (${ym}) पूर्ण व्याज ₹${monthlyInterest}`);
}
async function addPartialPayment(borrowerId, ym, monthlyInterest, alreadyPaid) {
  if (!state.user || !checkRateLimit('PARTIAL_PAY')) return;
  const inputEl = document.getElementById(`partialPayInput_${borrowerId}`), amt = Number(inputEl ? inputEl.value : 0);
  if (!amt || amt <= 0) { alert('अर्धवट जमा रक्कम (₹) टाका.'); return; }
  const nowIso = new Date().toISOString(), nextTotal = Number(alreadyPaid || 0) + amt;
  const updatePayload = { paymentHistory: firebase.firestore.FieldValue.arrayUnion({ date: nowIso, ym, type: 'PARTIAL_INTEREST', amount: amt, note: `${ym} अर्धवट व्याज जमा` }) };
  if (nextTotal >= monthlyInterest) { updatePayload[`paidMonths.${ym}`] = { paidAt: nowIso, amount: monthlyInterest }; updatePayload[`partialPayments.${ym}`] = firebase.firestore.FieldValue.delete(); }
  else updatePayload[`partialPayments.${ym}`] = nextTotal;
  await getBorrowerDoc(borrowerId).update(updatePayload); if (inputEl) inputEl.value = '';
  await appendAuditLog('PARTIAL_PAYMENT', `${borrowerId} (${ym}) अर्धवट ₹${amt}`);
}
async function resetMonthPayment(borrowerId, ym) {
  if (!state.user || !checkRateLimit('RESET_PAY')) return;
  await getBorrowerDoc(borrowerId).update({ [`paidMonths.${ym}`]: firebase.firestore.FieldValue.delete(), [`partialPayments.${ym}`]: firebase.firestore.FieldValue.delete() });
  await appendAuditLog('PAYMENT_RESET', `${borrowerId} (${ym}) पेमेंट Reset`);
}
async function addManualPendingForMonth(borrowerId) {
  if (!state.user || !checkRateLimit('MANUAL_DUE')) return;
  const ymInput = prompt('कोणत्या महिन्यासाठी मॅन्युअल बाकी जोडायची? (YYYY-MM)', document.getElementById('activeYm').value || currentYmDefault());
  if (!ymInput || !/^\d{4}-\d{2}$/.test(ymInput.trim())) { alert('योग्य महिना टाका.'); return; }
  const amt = Number(prompt(`${ymInput.trim()} ची मॅन्युअल बाकी (₹):`, '0') || 0); if (!amt || amt <= 0) return;
  const existing = state.borrowers.find(b => b.id === borrowerId) || {};
  await getBorrowerDoc(borrowerId).update({ [`customPastDues.${ymInput.trim()}`]: Number((existing.customPastDues && existing.customPastDues[ymInput.trim()]) || 0) + amt });
  await appendAuditLog('MANUAL_DUE_ADDED', `${borrowerId} (${ymInput.trim()}) मॅन्युअल बाकी ₹${amt}`);
}
async function payCustomPastDue(borrowerId, ym, currentPastDue) {
  if (!state.user || !checkRateLimit('PAY_PAST')) return;
  const inputEl = document.getElementById(`payPastInput_${borrowerId}`), amountToPay = Number(inputEl ? inputEl.value : 0);
  if (!amountToPay || amountToPay <= 0) { alert('जमा करायची रक्कम (₹) टाका.'); return; }
  const existing = state.borrowers.find(b => b.id === borrowerId) || {};
  const newPastDue = Math.max(0, Number(currentPastDue || 0) - amountToPay);
  const updatePayload = { [`customCashPaid.${ym}`]: Number((existing.customCashPaid && existing.customCashPaid[ym]) || 0) + amountToPay, paymentHistory: firebase.firestore.FieldValue.arrayUnion({ date: new Date().toISOString(), ym, type: 'PAST_DUE_PAID', amount: amountToPay, note: `${ym} मागील बाकी जमा` }) };
  if (newPastDue === 0 && existing.customPastDues && Object.prototype.hasOwnProperty.call(existing.customPastDues, ym)) updatePayload[`customPastDues.${ym}`] = firebase.firestore.FieldValue.delete();
  await getBorrowerDoc(borrowerId).update(updatePayload); if (inputEl) inputEl.value = '';
  await appendAuditLog('PAST_DUE_PAID', `${borrowerId} (${ym}) मागील बाकी ₹${amountToPay}`);
}
async function clearManualPastDueForMonth(borrowerId, ym) {
  if (!state.user || !checkRateLimit('CLEAR_PAST')) return;
  await getBorrowerDoc(borrowerId).update({ [`customPastDues.${ym}`]: firebase.firestore.FieldValue.delete(), [`customCashPaid.${ym}`]: firebase.firestore.FieldValue.delete() });
  await appendAuditLog('MANUAL_DUE_REMOVED', `${borrowerId} (${ym}) मॅन्युअल बाकी काढली`);
}
async function reducePrincipal(borrowerId, currentPrincipal) {
  if (!state.user || !checkRateLimit('REDUCE_P')) return;
  const inputEl = document.getElementById(`principalAmtInput_${borrowerId}`), amt = Number(inputEl ? inputEl.value : 0);
  if (!amt || amt <= 0) { alert('कमी करायची मुद्दल रक्कम (₹) टाका.'); return; }
  const nextPrincipal = Math.max(0, Number(currentPrincipal || 0) - amt);
  await getBorrowerDoc(borrowerId).update({ principal: nextPrincipal, principalReductions: firebase.firestore.FieldValue.arrayUnion({ date: new Date().toISOString(), amount: amt, balanceAfter: nextPrincipal }) });
  if (inputEl) inputEl.value = ''; await appendAuditLog('PRINCIPAL_REDUCED', `${borrowerId} मुद्दल ₹${amt} ने कमी`);
}
async function addExtraPrincipal(borrowerId, currentPrincipal, currentOriginal) {
  if (!state.user || !checkRateLimit('ADD_P')) return;
  const inputEl = document.getElementById(`principalAmtInput_${borrowerId}`), amt = Number(inputEl ? inputEl.value : 0);
  if (!amt || amt <= 0) { alert('वाढवायची मुद्दल रक्कम (₹) टाका.'); return; }
  const nextPrincipal = Number(currentPrincipal || 0) + amt;
  await getBorrowerDoc(borrowerId).update({ principal: nextPrincipal, originalPrincipal: Number(currentOriginal || currentPrincipal || 0) + amt, extraPrincipals: firebase.firestore.FieldValue.arrayUnion({ date: new Date().toISOString(), amount: amt, balanceAfter: nextPrincipal }) });
  if (inputEl) inputEl.value = ''; await appendAuditLog('PRINCIPAL_ADDED', `${borrowerId} अतिरिक्त मुद्दल ₹${amt}`);
}
async function quickEditField(borrowerId, fieldName, label, currentVal) {
  if (!state.user || !checkRateLimit('QUICK_EDIT')) return;
  const nextVal = prompt(`${label} बदला:`, currentVal || ''); if (nextVal === null) return;
  await getBorrowerDoc(borrowerId).update({ [fieldName]: fieldName === 'interestDay' ? Number(nextVal || 0) : nextVal.trim() });
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
  await getBorrowerDoc(borrowerId).delete(); await appendAuditLog('PERMANENT_DELETED', `${name} कायमचे डिलीट`);
}

// ११. Passbook, EMI, Full Edit
function buildBorrowerEvents(b) {
  const events = [];
  if (b.loanDate || b.createdAt) events.push({ date: b.loanDate || String(b.createdAt).slice(0, 10), type: 'कर्ज सुरुवात', principalDebit: Number(b.originalPrincipal || b.principal || 0), principalCredit: 0, interestCredit: 0, note: `मुद्दल वितरण (${b.interestType === 'flat' ? 'Flat' : 'Reducing'} @ ${b.rate || 0}%)` });
  (b.extraPrincipals || []).forEach(ep => events.push({ date: String(ep.date || '').slice(0, 10), type: 'अतिरिक्त मुद्दल', principalDebit: Number(ep.amount || 0), principalCredit: 0, interestCredit: 0, note: 'मुद्दल वाढले' }));
  (b.principalReductions || []).forEach(pr => events.push({ date: String(pr.date || '').slice(0, 10), type: 'मुद्दल कपात', principalDebit: 0, principalCredit: Number(pr.amount || 0), interestCredit: 0, note: 'मुद्दल कमी झाले' }));
  (b.paymentHistory || []).forEach(ph => events.push({ date: String(ph.date || '').slice(0, 10), type: ph.type || 'व्याज भरणा', principalDebit: 0, principalCredit: 0, interestCredit: Number(ph.amount || 0), note: ph.note || `${ph.ym || ''} जमा` }));
  if (b.settlement && b.settlement.date) events.push({ date: b.settlement.date, type: 'Final Settlement', principalDebit: 0, principalCredit: Number(b.settlement.amount || 0), interestCredit: 0, note: b.settlement.note || 'खाते बंद' });
  events.sort((a, c) => String(a.date).localeCompare(String(c.date)));
  return events;
}

function renderPassbookContent() {
  const b = state.borrowers.find(x => x.id === state.currentPassbookBorrowerId), content = document.getElementById('pbContent');
  if (!b) return;
  document.getElementById('pbTitle').textContent = `${b.name || 'ग्राहक'} — Passbook व Timeline`;
  const tab = state.currentPassbookTab, events = buildBorrowerEvents(b);

  if (tab === 'passbook') {
    let principalBal = 0;
    const rows = events.map(ev => {
      principalBal = Math.max(0, principalBal + ev.principalDebit - ev.principalCredit);
      return `<tr><td>${escapeHtml(ev.date)}</td><td>${escapeHtml(ev.type)} — ${escapeHtml(ev.note)}</td><td class="err">${ev.principalDebit > 0 ? `+${fmtAmt(ev.principalDebit)}` : '-'}</td><td class="ok">${ev.principalCredit > 0 ? `-${fmtAmt(ev.principalCredit)}` : '-'}</td><td class="ok">${ev.interestCredit > 0 ? fmtAmt(ev.interestCredit) : '-'}</td><td><strong>${fmtAmt(principalBal)}</strong></td></tr>`;
    }).join('');
    content.innerHTML = `<table class="passbook-table"><thead><tr><th>तारीख</th><th>तपशील</th><th>मुद्दल नावे (+)</th><th>मुद्दल जमा (-)</th><th>व्याज/बाकी जमा</th><th>मुद्दल शिल्लक</th></tr></thead><tbody>${rows || '<tr><td colspan="6">कोणतीही नोंद नाही.</td></tr>'}</tbody></table>`;
  } else if (tab === 'timeline') {
    content.innerHTML = events.length ? events.map(ev => `<div class="meta-box"><strong>[${escapeHtml(ev.date)}] ${escapeHtml(ev.type)}</strong> — ${escapeHtml(ev.note)}</div>`).join('') : '<p class="muted">नोंदी नाहीत.</p>';
  } else if (tab === 'payments') {
    const list = b.paymentHistory || [];
    content.innerHTML = list.length ? list.slice().reverse().map(p => `<div class="meta-box"><strong>${escapeHtml(String(p.date || '').slice(0, 10))}</strong> | ${escapeHtml(p.ym || '')} | <span class="ok">${fmtAmt(p.amount || 0)}</span> — ${escapeHtml(p.note || p.type || '')}</div>`).join('') : '<p class="muted">कोणतीही Payment History नाही.</p>';
  } else if (tab === 'principals') {
    const extras = (b.extraPrincipals || []).map(x => `<div class="meta-box">➕ <strong>${escapeHtml(String(x.date || '').slice(0, 10))}</strong>: अतिरिक्त मुद्दल ${fmtAmt(x.amount)}</div>`).join('');
    const reds = (b.principalReductions || []).map(x => `<div class="meta-box">➖ <strong>${escapeHtml(String(x.date || '').slice(0, 10))}</strong>: मुद्दल कपात ${fmtAmt(x.amount)}</div>`).join('');
    content.innerHTML = `<h4>अतिरिक्त मुद्दल</h4>${extras || '<p class="muted">नाही.</p>'}<h4>मुद्दल कपात</h4>${reds || '<p class="muted">नाही.</p>'}`;
  }
}
function openPassbookModal(borrowerId) {
  state.currentPassbookBorrowerId = borrowerId; state.currentPassbookTab = 'passbook';
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-pbtab') === 'passbook'));
  renderPassbookContent(); document.getElementById('passbookModal').classList.remove('hidden');
}
document.getElementById('closePassbookBtn').addEventListener('click', () => document.getElementById('passbookModal').classList.add('hidden'));
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.currentPassbookTab = btn.getAttribute('data-pbtab');
    document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
    btn.classList.add('active'); renderPassbookContent();
  });
});

document.getElementById('calcEmiBtn').addEventListener('click', () => {
  const P = Number(document.getElementById('emiPrincipal').value || 0), r = Number(document.getElementById('emiMonthlyRate').value || 0) / 100, n = Number(document.getElementById('emiMonths').value || 0), type = document.getElementById('emiType').value, out = document.getElementById('emiResult');
  if (P <= 0 || n <= 0) { out.textContent = 'योग्य मुद्दल आणि महिने टाका.'; return; }
  let emi = 0, totalPayable = 0, totalInterest = 0;
  if (type === 'flat') { totalInterest = Math.round(P * r * n); totalPayable = P + totalInterest; emi = Math.round(totalPayable / n); }
  else {
    if (r === 0) { emi = Math.round(P / n); totalPayable = P; }
    else { const f = Math.pow(1 + r, n); emi = Math.round((P * r * f) / (f - 1)); totalPayable = emi * n; totalInterest = Math.max(0, totalPayable - P); }
  }
  out.innerHTML = `<div><strong>मासिक EMI:</strong> <span class="ok">${fmtAmt(emi)}</span></div><div><strong>एकूण व्याज:</strong> ${fmtAmt(totalInterest)} | <strong>एकूण परतफेड:</strong> ${fmtAmt(totalPayable)}</div>`;
});

function openEditModal(borrowerId) {
  const b = state.borrowers.find(item => item.id === borrowerId); if (!b) return;
  document.getElementById('eId').value = b.id; document.getElementById('eName').value = b.name || '';
  document.getElementById('eLoanLabel').value = b.loanLabel || ''; document.getElementById('eMobile').value = b.mobile || '';
  document.getElementById('ePrincipal').value = b.principal || 0; document.getElementById('eOriginalPrincipal').value = b.originalPrincipal || b.principal || 0;
  document.getElementById('eLoanDate').value = b.loanDate || ''; document.getElementById('eStartYm').value = b.startYm || currentYmDefault();
  document.getElementById('eRate').value = b.rate || 0; document.getElementById('eFixedInterest').value = b.fixedMonthlyInterest || 0;
  document.getElementById('eInterestType').value = b.interestType === 'flat' ? 'flat' : 'reducing';
  document.getElementById('eInterestDay').value = b.interestDay || ''; document.getElementById('eLateFee').value = b.lateFeePerDay || 0;
  document.getElementById('eGuarantor').value = b.guarantor || ''; document.getElementById('eExtraGuarantors').value = b.extraGuarantors || '';
  document.getElementById('eJobType').value = b.jobType || ''; document.getElementById('eCompanyDept').value = b.companyDept || '';
  document.getElementById('eRetirementDate').value = b.retirementDate || '';
  document.getElementById('ePromise1').value = b.promiseDate1 || ''; document.getElementById('ePromise2').value = b.promiseDate2 || '';
  document.getElementById('ePromise3').value = b.promiseDate3 || ''; document.getElementById('eNote').value = b.note || '';
  document.getElementById('editModal').classList.remove('hidden');
}
document.getElementById('closeEditModalBtn').addEventListener('click', () => document.getElementById('editModal').classList.add('hidden'));
document.getElementById('saveEditBtn').addEventListener('click', async () => {
  if (!state.user || !checkRateLimit('FULL_EDIT')) return;
  const id = document.getElementById('eId').value, name = document.getElementById('eName').value.trim();
  if (!id || !name) { alert('ग्राहकाचे नाव आवश्यक आहे.'); return; }
  const existing = state.borrowers.find(x => x.id === id);
  const nextVersions = existing ? [...(existing.versionHistory || []), buildVersionSnapshot(existing)].slice(-5) : [];
  await getBorrowerDoc(id).update({
    name, loanLabel: document.getElementById('eLoanLabel').value.trim(), mobile: document.getElementById('eMobile').value.trim(),
    principal: Number(document.getElementById('ePrincipal').value || 0), originalPrincipal: Number(document.getElementById('eOriginalPrincipal').value || 0),
    loanDate: document.getElementById('eLoanDate').value || '', startYm: document.getElementById('eStartYm').value || currentYmDefault(),
    rate: Number(document.getElementById('eRate').value || 0), fixedMonthlyInterest: Number(document.getElementById('eFixedInterest').value || 0),
    interestType: document.getElementById('eInterestType').value === 'flat' ? 'flat' : 'reducing',
    interestDay: Number(document.getElementById('eInterestDay').value || 0), lateFeePerDay: Number(document.getElementById('eLateFee').value || 0),
    guarantor: document.getElementById('eGuarantor').value.trim(), extraGuarantors: document.getElementById('eExtraGuarantors').value.trim(),
    jobType: document.getElementById('eJobType').value || '', companyDept: document.getElementById('eCompanyDept').value.trim(),
    retirementDate: document.getElementById('eRetirementDate').value || '',
    promiseDate1: document.getElementById('ePromise1').value || '', promiseDate2: document.getElementById('ePromise2').value || '',
    promiseDate3: document.getElementById('ePromise3').value || '', note: document.getElementById('eNote').value.trim(),
    versionHistory: nextVersions
  });
  await appendAuditLog('FULL_EDIT', `${name} (${id}) अपडेट केले`);
  document.getElementById('editModal').classList.add('hidden');
});

// १२. CSV Parser व Helpers
function parseCsvLine(line) {
  const result = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else current += ch;
  }
  result.push(current.trim()); return result;
}
function escapeHtml(str) { return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function jobLabel(jobType) { return jobType === 'govt' ? 'सरकारी नोकरी' : jobType === 'private' ? 'खाजगी नोकरी' : jobType === 'business' ? 'व्यवसाय / इतर' : '-'; }

// १३. UI Render
function renderBorrowers() {
  const container = document.getElementById('borrowersList');
  const recycleContainer = document.getElementById('recycleBinList');
  const activeYm = document.getElementById('activeYm').value || currentYmDefault();
  const query = (document.getElementById('searchInput').value || '').trim().toLowerCase();

  const nonDeleted = state.borrowers.filter(b => !b.isDeleted);
  const deletedList = state.borrowers.filter(b => b.isDeleted);
  document.getElementById('recycleCountBadge').textContent = String(deletedList.length);

  const activeAccs = nonDeleted.filter(b => b.accountStatus !== 'closed');
  const closedAccs = nonDeleted.filter(b => b.accountStatus === 'closed');

  const todayStr = getLocalDateIso(0), tomorrowStr = getLocalDateIso(1);
  let totalPrincipal = 0, totalExpectedInterest = 0, totalCollectedMonth = 0, totalPending = 0;
  const todayPromises = [], tomorrowPromises = [], pendingOrPartial = [];

  const enriched = nonDeleted.map(b => {
    const calc = computeLedgerUpToMonth(b, activeYm);
    if (b.accountStatus !== 'closed') {
      totalPrincipal += calc.principal; totalExpectedInterest += calc.monthlyInterest;
      totalCollectedMonth += calc.collectedInMonth; totalPending += calc.totalPayable;
      if (calc.status !== 'paid' && calc.totalPayable > 0) pendingOrPartial.push({ name: b.name, mobile: b.mobile, status: calc.status, totalPayable: calc.totalPayable });
      const pDates = [b.promiseDate1, b.promiseDate2, b.promiseDate3].filter(Boolean);
      if (pDates.includes(todayStr) && calc.totalPayable > 0) todayPromises.push({ name: b.name, mobile: b.mobile, amount: calc.totalPayable });
      if (pDates.includes(tomorrowStr) && calc.totalPayable > 0) tomorrowPromises.push({ name: b.name, mobile: b.mobile, amount: calc.totalPayable });
    }
    return { b, calc };
  });

  state.todayPromisesCache = todayPromises; state.pendingPartialCache = pendingOrPartial;
  document.getElementById('dueCounterBadge').textContent = String(todayPromises.length + pendingOrPartial.length);
  triggerDailyMorningNotification(false);
  checkAutomaticMonthEndReport();

  document.getElementById('dashActiveCount').textContent = `सक्रिय खाती: ${activeAccs.length}`;
  document.getElementById('dashClosedCount').textContent = `बंद खाती: ${closedAccs.length}`;
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
    const isClosed = b.accountStatus === 'closed';
    if (state.accountFilter === 'active' && isClosed) return false;
    if (state.accountFilter === 'closed' && !isClosed) return false;
    if (state.jobFilter !== 'all' && b.jobType !== state.jobFilter) return false;
    if (state.statusFilter !== 'all' && calc.status !== state.statusFilter) return false;
    if (!query) return true;
    return [b.name, b.loanLabel, b.mobile, b.companyDept, b.guarantor, b.extraGuarantors].map(v => String(v || '').toLowerCase()).join(' ').includes(query);
  });

  if (!filtered.length) {
    container.innerHTML = '<p class="muted">या फिल्टरनुसार कोणतीही नोंद आढळली नाही.</p>';
  } else {
    container.innerHTML = filtered.map(({ b, calc }) => {
      const isClosed = b.accountStatus === 'closed';
      const statusText = isClosed ? 'बंद (Closed)' : calc.status === 'paid' ? 'पूर्ण जमा' : calc.status === 'partial' ? `अर्धवट जमा (${fmtAmt(calc.paidThisMonth)} / ${fmtAmt(calc.monthlyInterest)})` : 'बाकी';
      const interestModeLabel = Number(b.fixedMonthlyInterest || 0) > 0 ? 'निश्चित व्याज' : `${b.rate || 0}% (${calc.interestType === 'flat' ? 'Flat' : 'Reducing'})`;
      const cardColorClass = isClosed ? 'status-closed' : calc.status === 'paid' ? 'status-paid' : calc.status === 'partial' ? 'status-partial' : '';
      const detailsHiddenClass = state.expandAllDetails ? '' : 'hidden';
      const cleanMobile = String(b.mobile || '').replace(/\D/g, '');
      const lastFollowUp = (b.followUps && b.followUps.length) ? b.followUps[b.followUps.length - 1] : null;

      return `
        <div class="borrower-item ${cardColorClass}">
          <div class="row" style="justify-content:space-between;">
            <div class="row">
              <strong>1. ग्राहक: ${escapeHtml(b.name || 'नाव नाही')} ${b.loanLabel ? `<span class="badge">${escapeHtml(b.loanLabel)}</span>` : ''}</strong>
              <span class="badge ${isClosed ? 'closed' : calc.status}">${statusText}</span>
            </div>
            <div class="row">
              ${cleanMobile ? `<button data-action="call-borrower" data-mobile="${escapeHtml(cleanMobile)}" class="success sm">📞 Call</button>` : ''}
              <button data-action="followup" data-id="${b.id}" data-name="${escapeHtml(b.name || '')}" class="warn sm">📝 Follow-up</button>
              <button data-action="add-loan-same" data-id="${b.id}" class="sm">➕ नवीन कर्ज</button>
              <button data-action="docs" data-id="${b.id}" class="sm">📎 Docs</button>
              <button data-action="versions" data-id="${b.id}" class="sm">🕒 Versions</button>
              <button data-action="toggle-card-details" data-id="${b.id}" class="sm">तपशील</button>
              <button data-action="passbook" data-id="${b.id}" class="primary sm">📖 Passbook</button>
              <button data-action="full-edit" data-id="${b.id}" class="sm">✏️ Edit</button>
              <button data-action="soft-delete" data-id="${b.id}" data-name="${escapeHtml(b.name || '')}" class="danger sm">🗑️</button>
            </div>
          </div>
          ${isClosed && b.settlement ? `
            <div class="meta-box">
              <strong>✅ खाते बंद (Final Settlement):</strong> रक्कम ${fmtAmt(b.settlement.amount)} | तारीख: ${escapeHtml(b.settlement.date || '-')} | टीप: ${escapeHtml(b.settlement.note || '-')}
              <button data-action="reopen-acc" data-id="${b.id}" data-name="${escapeHtml(b.name || '')}" class="primary sm" style="margin-left:8px;">🔓 Re-open करा</button>
            </div>
          ` : `
            <div><strong>2. मुद्दल व पद्धत:</strong> ${fmtAmt(calc.principal)} | ${interestModeLabel} ${b.loanDate ? `| तारीख: ${escapeHtml(b.loanDate)}` : ''}</div>
            <div><strong>3. मासिक अपेक्षित व्याज:</strong> ${fmtAmt(calc.monthlyInterest)} ${b.interestDay ? `| व्याजाची तारीख: दरमहा ${b.interestDay}` : ''}</div>
            <div><strong>4. चालू महिना (${activeYm}):</strong> जमा ${fmtAmt(calc.paidThisMonth)} | उरलेले व्याज ${fmtAmt(calc.remainingThisMonth)} ${calc.lateFee > 0 ? `<span class="err">| विलंब दंड (${calc.lateDays} दिवस): ${fmtAmt(calc.lateFee)}</span>` : ''}</div>
            <div><strong>5. मागील बाकी व एकूण देणे:</strong> मागील बाकी ${fmtAmt(calc.pastDue)} | एकूण थकबाकी <strong class="ok">${fmtAmt(calc.totalPayable)}</strong></div>
          `}

          ${lastFollowUp ? `<div class="muted" style="margin-top:4px;">📝 शेवटचा Follow-up (${escapeHtml(lastFollowUp.date)}): ${escapeHtml(lastFollowUp.note)}</div>` : ''}

          <div id="cardDetails_${b.id}" class="${detailsHiddenClass}">
            <div class="meta-box">
              <div>📱 मोबाईल: ${escapeHtml(b.mobile || '-')} | 🤝 मुख्य जामीनदार: ${escapeHtml(b.guarantor || '-')}</div>
              ${b.extraGuarantors ? `<div>🤝 अतिरिक्त जामीनदार: ${escapeHtml(b.extraGuarantors)}</div>` : ''}
              <div>💼 नोकरी: ${jobLabel(b.jobType)} ${b.companyDept ? `(${escapeHtml(b.companyDept)})` : ''} ${b.retirementDate ? `| Retirement: ${escapeHtml(b.retirementDate)}` : ''}</div>
              ${!isClosed ? getPromiseStatusHtml(b, calc.totalPayable) : ''}
              ${b.note ? `<div>📝 टीप: ${escapeHtml(b.note)}</div>` : ''}
            </div>
            ${!isClosed ? `
              <div style="margin-top:8px;" class="row">
                <button data-action="quick-mobile" data-id="${b.id}" data-val="${escapeHtml(b.mobile || '')}" class="sm">📱 मोबाईल Add/Edit</button>
                <button data-action="quick-guarantor" data-id="${b.id}" data-val="${escapeHtml(b.guarantor || '')}" class="sm">🤝 जामीनदार Edit</button>
                <button data-action="quick-day" data-id="${b.id}" data-val="${b.interestDay || ''}" class="sm">📅 व्याज तारीख Edit</button>
                <button data-action="add-manual-month" data-id="${b.id}" class="warn sm">+ Manual Pending Month</button>
                <button data-action="close-acc" data-id="${b.id}" data-name="${escapeHtml(b.name || '')}" data-principal="${calc.principal}" data-pending="${calc.totalPayable}" class="danger sm">✅ खाते बंद (Final Settlement)</button>
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
            ` : ''}
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
  const btn = e.target.closest('button[data-action]'); if (!btn) return;
  const action = btn.getAttribute('data-action'), id = btn.getAttribute('data-id'), ym = btn.getAttribute('data-ym');
  if (action === 'call-borrower') { const mob = btn.getAttribute('data-mobile'); if (mob) window.location.href = `tel:${mob}`; }
  else if (action === 'followup') addFollowUpNote(id, btn.getAttribute('data-name'));
  else if (action === 'add-loan-same') prefillNewLoanForCustomer(id);
  else if (action === 'close-acc') closeAccountWithSettlement(id, btn.getAttribute('data-name'), Number(btn.getAttribute('data-principal') || 0), Number(btn.getAttribute('data-pending') || 0));
  else if (action === 'reopen-acc') reopenAccount(id, btn.getAttribute('data-name'));
  else if (action === 'docs') openDocsModal(id);
  else if (action === 'versions') openVersionModal(id);
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
  const btn = e.target.closest('button[data-action]'); if (!btn) return;
  if (btn.getAttribute('data-action') === 'restore') restoreBorrower(btn.getAttribute('data-id'), btn.getAttribute('data-name'));
  else if (btn.getAttribute('data-action') === 'perm-delete') permanentDeleteBorrower(btn.getAttribute('data-id'), btn.getAttribute('data-name'));
});

function renderAuditLogs() {
  document.getElementById('auditList').innerHTML = state.auditLogs.length
    ? state.auditLogs.map(log => `<div style="padding:4px 0; border-bottom:1px solid #1e293b;"><span class="muted">[${escapeHtml(log.ts || '')}]</span> <strong>${escapeHtml(log.action || '')}</strong> — ${escapeHtml(log.details || '')}</div>`).join('')
    : '<div class="muted">कोणत्याही Audit नोंदी नाहीत.</div>';
}

// १४. नवीन ग्राहक / कर्ज जोडणे
document.getElementById('addBorrowerBtn').addEventListener('click', async () => {
  if (!state.user || !checkRateLimit('ADD_BORROWER')) return;
  const name = document.getElementById('bName').value.trim(), principal = Number(document.getElementById('bPrincipal').value || 0);
  const startYm = document.getElementById('bStartYm').value || currentYmDefault(), customDue = Number(document.getElementById('bCustomDue').value || 0);
  if (!name || principal <= 0) { alert('कृपया ग्राहकाचे नाव आणि मुद्दल रक्कम टाका.'); return; }

  await db.collection('users').doc(state.user.uid).collection('borrowers').add({
    name, loanLabel: document.getElementById('bLoanLabel').value.trim(), mobile: document.getElementById('bMobile').value.trim(),
    principal, originalPrincipal: principal, loanDate: document.getElementById('bLoanDate').value || '', startYm,
    rate: Number(document.getElementById('bRate').value || 0), fixedMonthlyInterest: Number(document.getElementById('bFixedInterest').value || 0),
    interestType: document.getElementById('bInterestType').value === 'flat' ? 'flat' : 'reducing',
    interestDay: Number(document.getElementById('bInterestDay').value || 0), lateFeePerDay: Number(document.getElementById('bLateFee').value || 0),
    guarantor: document.getElementById('bGuarantor').value.trim(), extraGuarantors: document.getElementById('bExtraGuarantors').value.trim(),
    jobType: document.getElementById('bJobType').value || '', companyDept: document.getElementById('bCompanyDept').value.trim(),
    retirementDate: document.getElementById('bRetirementDate').value || '',
    promiseDate1: document.getElementById('bPromise1').value || '', promiseDate2: document.getElementById('bPromise2').value || '',
    promiseDate3: document.getElementById('bPromise3').value || '', note: document.getElementById('bNote').value.trim(),
    accountStatus: 'active', isDeleted: false, paidMonths: {}, partialPayments: {}, paymentHistory: [],
    extraPrincipals: [], principalReductions: [], versionHistory: [], followUps: [],
    customPastDues: customDue > 0 ? { [startYm]: customDue } : {}, customCashPaid: {}, createdAt: new Date().toISOString()
  });
  await appendAuditLog('BORROWER_ADDED', `${name} (मुद्दल ₹${principal})`);
  ['bName', 'bLoanLabel', 'bMobile', 'bPrincipal', 'bLoanDate', 'bFixedInterest', 'bCustomDue', 'bInterestDay', 'bGuarantor', 'bExtraGuarantors', 'bCompanyDept', 'bRetirementDate', 'bPromise1', 'bPromise2', 'bPromise3', 'bNote'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('bLateFee').value = '0'; document.getElementById('bJobType').value = '';
});

document.getElementById('activeYm').addEventListener('change', renderBorrowers);
document.getElementById('searchInput').addEventListener('input', renderBorrowers);

// १५. Google Sheet Import व Encrypted Export/Restore
document.getElementById('importSheetBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg'), raw = document.getElementById('sheetUrlInput').value.trim();
  if (!raw || !state.user || !checkRateLimit('SHEET_IMPORT')) { msgEl.textContent = 'Google Sheet URL किंवा ID टाका.'; return; }
  let fetchUrl = raw;
  const idMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (idMatch) fetchUrl = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv`;
  else if (/^[a-zA-Z0-9-_]{20,}$/.test(raw)) fetchUrl = `https://docs.google.com/spreadsheets/d/${raw}/export?format=csv`;
  try {
    msgEl.textContent = 'Google Sheet वाचत आहे...';
    const res = await fetch(fetchUrl); if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lines = (await res.text()).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]), name = cols[0], principal = Number(cols[1] || 0), rate = Number(cols[2] || 2), startYm = cols[3] || currentYmDefault();
      if (name && principal > 0) {
        await db.collection('users').doc(state.user.uid).collection('borrowers').add({
          name, principal, originalPrincipal: principal, rate, fixedMonthlyInterest: 0, startYm, accountStatus: 'active',
          interestType: 'reducing', isDeleted: false, paidMonths: {}, partialPayments: {}, paymentHistory: [],
          extraPrincipals: [], principalReductions: [], versionHistory: [], followUps: [], customPastDues: {}, customCashPaid: {},
          importedFromSheet: true, createdAt: new Date().toISOString()
        });
        count++;
      }
    }
    await appendAuditLog('SHEET_IMPORT', `${count} नोंदी आयात केल्या`);
    msgEl.textContent = `${count} नोंदी आयात झाल्या.`;
  } catch (err) { msgEl.textContent = `Sheet Import एरर: ${err.message}`; }
});

document.getElementById('exportEncBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg'), shaBox = document.getElementById('shaDigestBox');
  try {
    const res = await encryptPayload({ exportedAt: new Date().toISOString(), borrowers: state.borrowers }, document.getElementById('backupPasskey').value);
    downloadTextFile(`hishob-backup-${currentYmDefault()}.enc.json`, res.jsonString, 'application/json');
    msgEl.textContent = 'Encrypted बॅकअप तयार झाला.'; shaBox.classList.remove('hidden');
    shaBox.innerHTML = `<strong>SHA-256 Digest:</strong> <code>${escapeHtml(res.sha256)}</code>`;
  } catch (err) { msgEl.textContent = `बॅकअप एरर: ${err.message}`; }
});

document.getElementById('importEncBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('ioMsg'), file = document.getElementById('importEncFile').files && document.getElementById('importEncFile').files[0];
  if (!checkRateLimit('ENC_RESTORE')) return;
  const check = await validateFileUpload(file, 'json');
  if (!check.ok) { msgEl.textContent = `❌ ${check.reason}`; return; }
  try {
    const list = (await decryptPayload(await file.text(), document.getElementById('backupPasskey').value)).borrowers || [];
    for (const item of list) { const cleanCopy = { ...item }; delete cleanCopy.id; await db.collection('users').doc(state.user.uid).collection('borrowers').add(cleanCopy); }
    await appendAuditLog('ENCRYPTED_RESTORE', `${list.length} नोंदी रिस्टोर`);
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
      if ((k.startsWith('vyaj_') || k.startsWith('hishob_')) && k !== 'hishob_emergency_vault') localStorage.removeItem(k);
    });
    sessionStorage.clear();
  } catch (_) {}
  try { await db.terminate(); await db.clearPersistence(); } catch (_) {}
  window.location.reload();
}
document.getElementById('lockBtn').addEventListener('click', performFullLockAndLogout);

// १७. Auth State Listener
auth.onAuthStateChanged(async (user) => {
  const authScreen = document.getElementById('authScreen'), appScreen = document.getElementById('appScreen'), topActions = document.getElementById('topActions'), badge = document.getElementById('syncStatus');
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
      checkAndRunScheduledBackup();
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

// १९. Advanced Dashboard V2 (dashboard.js) साठी सुरक्षित डेटा ब्रिज
window.HishobBridge = {
  getBorrowers: () => state.borrowers,
  computeLedgerUpToMonth,
  fmtAmt
};
