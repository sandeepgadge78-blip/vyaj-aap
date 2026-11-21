// =========================================================================
// Hishob Premium Fintech Dashboard V3 + Clean Categorized Menu (☰ & ⋮)
// V14.1: Clickable Dashboard Drill-Downs (Principal / Interest / Pending)
// + Unified Mobile Back-Button Controller + Zero Duplicate Menu Items + Call Everywhere
// =========================================================================

(function () {
  function esc(str) {
    return String(str === undefined || str === null ? '' : str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function getBridge() { return window.HishobBridge || null; }
  function fmt(val) { const br = getBridge(); return br ? br.fmtAmt(val) : `₹${Number(val || 0).toLocaleString('en-IN')}`; }
  function getTodayIso(offset = 0) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const MARATHI_MONTHS = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];
  function fmtYmMarathi(ym) {
    if (!ym || !ym.includes('-')) return ym || '';
    const [y, m] = ym.split('-');
    return `${MARATHI_MONTHS[parseInt(m, 10) - 1] || m} ${y}`;
  }

  function csvCell(val) {
    return `"${String(val === undefined || val === null ? '' : val).replace(/"/g, '""')}"`;
  }

  function downloadCsvFile(filename, lines) {
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function showToast(msg, isError = false) {
    let t = document.getElementById('v3Toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'v3Toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = `v3-toast ${isError ? 'err' : 'ok'} show`;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  // =========================================================================
  // ☰ मेन्यूमधील साधने उघडण्याचे पॉपअप कंट्रोलर
  // =========================================================================
  function openToolSection(sectionId, titleText) {
    const modal = document.getElementById('toolSectionModal');
    const titleEl = document.getElementById('toolSectionModalTitle');
    if (!modal) return;
    document.querySelectorAll('#toolSectionModal .tool-sec-pane').forEach(sec => sec.classList.add('hidden'));
    const target = document.getElementById(sectionId);
    if (target) target.classList.remove('hidden');
    if (titleEl) titleEl.textContent = titleText || 'साधने';
    document.getElementById('v3Overlay')?.classList.add('hidden');
    modal.classList.remove('hidden');
    pushNavHistory(`tool:${sectionId}`);
  }

  function closeToolSectionModal() {
    document.getElementById('toolSectionModal')?.classList.add('hidden');
  }

  // =========================================================================
  // संपूर्ण अ‍ॅपसाठी एकच मजबूत मोबाईल Back-Button कंट्रोलर
  // =========================================================================
  const MODAL_IDS = [
    'statDrillModal', 'toolSectionModal', 'smartInfoModal', 'pnlModal',
    'securityModal', 'versionModal', 'notifModal', 'docsModal', 'editModal', 'passbookModal'
  ];
  let v3TabHistory = [];
  let lastBackPressTime = 0;

  function pushNavHistory(tag) {
    try { history.pushState({ hishobV3Nav: tag, ts: Date.now() }, ''); } catch (_) {}
  }

  try { history.replaceState({ hishobRoot: true }, ''); history.pushState({ hishobGuard: true }, ''); } catch (_) {}

  window.addEventListener('popstate', () => {
    // १. Three-Dot मेन्यू उघडा असल्यास बंद करा
    const tdMenu = document.getElementById('threeDotDropdown');
    if (tdMenu && !tdMenu.classList.contains('hidden')) {
      tdMenu.classList.add('hidden');
      return;
    }
    // २. Hamburger मेन्यू उघडा असल्यास बंद करा
    if (isDrawerOpen) {
      setDrawerState(false, true);
      return;
    }
    // ३. कोणताही Modal उघडा असल्यास बंद करा
    for (const id of MODAL_IDS) {
      const m = document.getElementById(id);
      if (m && !m.classList.contains('hidden')) {
        m.classList.add('hidden');
        return;
      }
    }
    // ४. V3 फुलस्क्रीन डॅशबोर्ड उघडा असल्यास आधीच्या टॅबवर किंवा Home वर जा
    const v3Ov = document.getElementById('v3Overlay');
    if (v3Ov && !v3Ov.classList.contains('hidden')) {
      if (v3TabHistory.length > 1) {
        v3TabHistory.pop();
        const prevTab = v3TabHistory[v3TabHistory.length - 1];
        switchV3Tab(prevTab, false);
      } else {
        v3TabHistory = [];
        v3Ov.classList.add('hidden');
      }
      return;
    }
    // ५. Home स्क्रीनवर Double-Back to Exit
    const now = Date.now();
    if (now - lastBackPressTime < 2000) {
      history.back();
    } else {
      lastBackPressTime = now;
      showToast('बाहेर पडण्यासाठी पुन्हा Back दाबा');
      try { history.pushState({ hishobGuard: true }, ''); } catch (_) {}
    }
  });

  // १. Premium CSS (V14.1)
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .hm-btn {
      width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--border);
      background: var(--card-2); color: var(--text); font-size: 1.2rem;
      display: inline-flex; align-items: center; justify-content: center;
      cursor: pointer; transition: 0.2s; flex-shrink: 0; padding: 0;
    }
    .hm-btn:hover { border-color: var(--accent); background: rgba(56,189,248,0.14); }
    .hm-btn.open { background: #991b1b; border-color: #ef4444; color: #fff; }

    .hm-backdrop {
      position: fixed; inset: 0; background: rgba(2, 6, 23, 0.72);
      z-index: 88; opacity: 0; pointer-events: none; transition: opacity 0.24s ease;
    }
    .hm-backdrop.open { opacity: 1; pointer-events: auto; }
    .hm-drawer {
      position: fixed; top: 0; left: 0; bottom: 0; width: 300px; max-width: 86vw;
      background: var(--card); border-right: 1px solid var(--border);
      z-index: 90; transform: translateX(-105%); transition: transform 0.26s cubic-bezier(.22,1,.36,1);
      display: flex; flex-direction: column; box-shadow: 10px 0 32px rgba(0,0,0,0.45);
    }
    .hm-drawer.open { transform: translateX(0); }
    .hm-head {
      padding: 13px 14px; border-bottom: 1px solid var(--border);
      background: linear-gradient(135deg, #0284c7, #1d4ed8); color: #fff;
    }
    .hm-profile { display: flex; align-items: center; gap: 10px; }
    .hm-avatar {
      width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
      background: rgba(255,255,255,0.22); color: #fff; border: 1px solid rgba(255,255,255,0.4);
      display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1rem;
      overflow: hidden;
    }
    .hm-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .hm-wa-bar {
      padding: 10px 12px; background: rgba(34, 197, 94, 0.12);
      border-bottom: 1px solid var(--border);
    }
    .hm-wa-bar label { display: block; font-size: 0.74rem; font-weight: 700; color: #22c55e; margin-bottom: 5px; }
    .hm-wa-row { display: flex; gap: 6px; }
    .hm-wa-row input { flex: 1; min-width: 0; padding: 6px 8px; font-size: 0.8rem; }
    .hm-sec-lbl {
      font-size: 0.72rem; font-weight: 800; color: var(--muted); text-transform: uppercase;
      padding: 10px 10px 4px; letter-spacing: 0.4px;
    }
    .hm-body { flex: 1; overflow-y: auto; padding: 6px 8px 16px; display: flex; flex-direction: column; gap: 2px; }
    .hm-item {
      display: flex; align-items: center; justify-content: space-between; width: 100%;
      padding: 9px 10px; border-radius: 9px; border: 1px solid transparent;
      background: transparent; color: var(--text); font-size: 0.85rem; text-align: left; cursor: pointer;
    }
    .hm-item:hover, .hm-item.active { background: var(--card-2); border-color: var(--border); color: var(--accent); }
    .hm-item-left { display: flex; align-items: center; gap: 9px; }
    .hm-badge { background: var(--danger); color: #fff; font-size: 0.7rem; font-weight: 700; padding: 1px 6px; border-radius: 999px; }
    .hm-div { height: 1px; background: var(--border); margin: 5px 4px; }

    /* डॅशबोर्ड ड्रिल-डाऊन यादी कार्ड */
    .sd-row-card {
      background: var(--meta-bg); border: 1px solid var(--border); border-radius: 10px;
      padding: 10px 12px; margin-bottom: 8px;
    }
    .sd-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
    .sd-actions { display: flex; gap: 6px; align-items: center; }

    /* Cloud Sync, Backup & Restore रंगीत कार्ड बटणे */
    .cs-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
    @media (max-width: 560px) { .cs-grid-4 { grid-template-columns: repeat(2, 1fr); } }
    .cs-big-btn {
      border: none !important; border-radius: 12px !important; padding: 14px 8px !important;
      color: #fff !important; font-weight: 700 !important; font-size: 0.82rem !important;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 6px; text-align: center; line-height: 1.3; min-height: 88px; cursor: pointer;
    }
    .cs-big-btn.purple { background: linear-gradient(135deg, #9333ea, #7e22ce) !important; }
    .cs-big-btn.blue { background: linear-gradient(135deg, #0284c7, #0369a1) !important; }
    .cs-big-btn.green { background: linear-gradient(135deg, #16a34a, #15803d) !important; }
    .cs-big-btn.teal { background: linear-gradient(135deg, #0d9488, #0f766e) !important; }
    .cs-vault-btn {
      width: 100%; border: none !important; border-radius: 12px !important; padding: 12px !important;
      background: linear-gradient(90deg, #ea580c, #f97316) !important; color: #fff !important;
      font-weight: 800 !important; font-size: 0.9rem !important; margin-top: 6px;
    }

    .td-wrap { position: relative; display: inline-block; }
    .td-btn { font-size: 1.15rem; padding: 4px 10px; line-height: 1; }
    .td-menu {
      position: fixed; right: 14px; top: 64px; min-width: 220px; z-index: 95;
      background: var(--card); border: 1px solid var(--border); border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5); padding: 6px; display: flex; flex-direction: column; gap: 4px;
    }
    .td-menu button { text-align: left; width: 100%; background: transparent; border: 1px solid transparent; padding: 9px 11px; font-size: 0.85rem; border-radius: 8px; }
    .td-menu button:hover { background: var(--card-2); border-color: var(--border); }
    .td-divider { height: 1px; background: var(--border); margin: 4px 0; }

    .v3-bottom-nav {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
      background: var(--card); border-top: 1px solid var(--border);
      display: flex; justify-content: space-around; align-items: center; padding: 6px 4px;
      box-shadow: 0 -4px 18px rgba(0,0,0,0.28);
    }
    .v3-bottom-nav button {
      background: transparent; border: none; color: var(--muted); font-size: 0.72rem;
      display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 10px;
    }
    .v3-bottom-nav button.active, .v3-bottom-nav button:hover { color: var(--accent); }
    .v3-fab {
      position: fixed; right: 16px; bottom: 68px; z-index: 42;
      width: 50px; height: 50px; border-radius: 50%; border: none;
      background: linear-gradient(135deg, #6366f1, #0ea5e9); color: #fff;
      font-size: 1.5rem; font-weight: 700; box-shadow: 0 8px 20px rgba(99,102,241,0.45);
      display: flex; align-items: center; justify-content: center; cursor: pointer;
    }

    .v3-overlay { position: fixed; inset: 0; z-index: 70; background: var(--bg); display: flex; overflow: hidden; }
    .v3-overlay.v3-gradient-theme { background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #0f172a 100%); }
    .v3-sidebar {
      width: 230px; background: rgba(17, 24, 39, 0.94); border-right: 1px solid var(--border);
      display: flex; flex-direction: column; padding: 14px 10px; gap: 6px; overflow-y: auto; flex-shrink: 0;
    }
    .v3-sidebar.collapsed { width: 64px; }
    .v3-sidebar.collapsed .v3-nav-lbl { display: none; }
    .v3-nav-item {
      display: flex; align-items: center; gap: 10px; padding: 9px 11px; border-radius: 10px;
      background: transparent; border: 1px solid transparent; color: var(--muted);
      font-size: 0.86rem; text-align: left; width: 100%; cursor: pointer;
    }
    .v3-nav-item.active, .v3-nav-item:hover {
      background: linear-gradient(90deg, rgba(99,102,241,0.22), rgba(14,165,233,0.14));
      border-color: rgba(99,102,241,0.45); color: var(--text);
    }
    .v3-main { flex: 1; overflow-y: auto; padding: 16px; padding-bottom: 84px; }
    .v3-topbar {
      display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center;
      margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--border);
    }
    .v3-kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-bottom: 14px; }
    .v3-wave-card {
      position: relative; overflow: hidden; border-radius: 14px; padding: 14px;
      background: var(--card); border: 1px solid var(--border); box-shadow: 0 6px 18px rgba(0,0,0,0.18);
      cursor: pointer; transition: transform 0.15s;
    }
    .v3-wave-card:hover { transform: translateY(-2px); }
    .v3-wave-card svg.wave { position: absolute; left: 0; bottom: 0; width: 100%; height: 44px; opacity: 0.25; pointer-events: none; }
    .v3-kpi-title { font-size: 0.78rem; color: var(--muted); }
    .v3-kpi-num { font-size: 1.4rem; font-weight: 800; margin: 4px 0; }
    .v3-kpi-sub { font-size: 0.75rem; }
    .v3-layout-2 { display: grid; grid-template-columns: 1.65fr 1fr; gap: 14px; }
    @media (max-width: 860px) {
      .v3-sidebar { display: none; }
      .v3-layout-2 { grid-template-columns: 1fr; }
    }
    .v3-panel {
      background: var(--card); border: 1px solid var(--border); border-radius: 14px;
      padding: 14px; margin-bottom: 14px; box-shadow: 0 4px 14px rgba(0,0,0,0.14);
    }
    .v3-loan-card {
      border: 1px solid var(--border); border-left: 5px solid #6366f1;
      border-radius: 12px; padding: 10px 12px; margin-top: 8px; background: var(--card-2);
    }
    .v3-toast {
      position: fixed; left: 50%; bottom: 76px; transform: translateX(-50%) translateY(20px);
      padding: 10px 16px; border-radius: 999px; font-size: 0.84rem; font-weight: 600;
      z-index: 120; opacity: 0; pointer-events: none; transition: 0.25s; color: #fff;
      white-space: nowrap;
    }
    .v3-toast.ok { background: #15803d; }
    .v3-toast.err { background: #b91c1c; }
    .v3-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .v3-seg-wrap { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
    .v3-seg-btn {
      padding: 6px 11px; border-radius: 999px; font-size: 0.78rem; font-weight: 600;
      background: var(--card-2); border: 1px solid var(--border); color: var(--muted); cursor: pointer;
    }
    .v3-seg-btn.active { background: #0284c7; border-color: #38bdf8; color: #fff; }
    .v3-pay-summary {
      background: var(--card-2); border: 1px solid var(--border); border-radius: 12px;
      padding: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 0.85rem;
    }
    .v3-pay-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .v3-pay-cell { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; }
    .v3-month-pill {
      display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.74rem; font-weight: 600;
      background: rgba(239, 68, 68, 0.16); border: 1px solid rgba(239, 68, 68, 0.45); color: #fca5a5;
      margin: 2px 4px 2px 0;
    }
    .v3-month-pill.partial {
      background: rgba(245, 158, 11, 0.18); border-color: rgba(245, 158, 11, 0.5); color: #fcd34d;
    }
  `;
  document.head.appendChild(styleEl);

  // २. Strict Start Month व बाकी महिन्यांची अचूक यादी
  function extractValidYm(val) {
    const s = String(val || '').trim();
    return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : '';
  }

  function getEffectiveStartYm(borrower) {
    return (
      extractValidYm(borrower.startYm) ||
      extractValidYm(borrower.startMonth) ||
      extractValidYm(borrower.loanDate) ||
      extractValidYm(borrower.createdAt) ||
      getTodayIso().slice(0, 7)
    );
  }

  function getPendingMonthsList(borrower, upToYm) {
    const startYm = getEffectiveStartYm(borrower);
    if (!startYm || !upToYm || startYm > upToYm) return [];
    const list = [];
    let [y, m] = startYm.split('-').map(Number);
    const [ey, em] = upToYm.split('-').map(Number);
    let guard = 0;
    while ((y < ey || (y === ey && m <= em)) && guard < 120) {
      const ym = `${y}-${String(m).padStart(2, '0')}`;
      const isPaid = Boolean(borrower.paidMonths && borrower.paidMonths[ym]);
      if (!isPaid) {
        const partAmt = Number((borrower.partialPayments && borrower.partialPayments[ym]) || 0);
        list.push({ ym, label: fmtYmMarathi(ym), isPartial: partAmt > 0, partAmt });
      }
      m++;
      if (m > 12) { m = 1; y++; }
      guard++;
    }
    return list;
  }

  function hasTransactionInMonth(borrower, targetYm) {
    const hasPaidObj = Boolean(borrower.paidMonths && borrower.paidMonths[targetYm]);
    const hasPartial = Number((borrower.partialPayments && borrower.partialPayments[targetYm]) || 0) > 0;
    const hasHist = (borrower.paymentHistory || []).some(p => extractValidYm(p.date) === targetYm || p.ym === targetYm);
    const hasPrin = [...(borrower.extraPrincipals || []), ...(borrower.principalReductions || [])]
      .some(x => extractValidYm(x.date) === targetYm);
    const hasCustomDue = Boolean(borrower.customPastDues && borrower.customPastDues[targetYm]);
    return hasPaidObj || hasPartial || hasHist || hasPrin || hasCustomDue;
  }

  function isAccountActiveInMonth(borrower, targetYm) {
    if (borrower.isDeleted) return false;
    const startYm = getEffectiveStartYm(borrower);
    const hasTx = hasTransactionInMonth(borrower, targetYm);
    if (startYm > targetYm && !hasTx) return false;
    if (borrower.accountStatus === 'closed') {
      const closedYm = extractValidYm(borrower.settlement && borrower.settlement.date);
      if (closedYm && closedYm < targetYm && !hasTx) return false;
    }
    return true;
  }

  function computeV3Data(overrideYm = null) {
    const br = getBridge();
    if (!br) return null;
    const allBorrowers = (br.getBorrowers() || []).filter(b => !b.isDeleted);
    const activeYm = overrideYm || document.getElementById('activeYm')?.value || getTodayIso().slice(0, 7);
    const todayIso = getTodayIso(0), tomorrowIso = getTodayIso(1);

    let activeLoans = 0, closedLoans = 0, totalPrincipal = 0, remainingPrincipal = 0;
    let principalRecovered = 0, monthlyExpected = 0, monthlyCollected = 0, todayCollected = 0;
    let todayCash = 0, todayUpi = 0, todayBank = 0;
    let totalInterestReceived = 0, totalOutstanding = 0, totalOverdue = 0;
    let paidCnt = 0, partialCnt = 0, unpaidCnt = 0;
    const monthlySeries = {}, recentPayments = [], todayPaymentsList = [], dueCustomers = [], allActiveRows = [], monthLedgerRows = [];

    allBorrowers.forEach(b => {
      const effStart = getEffectiveStartYm(b);
      const bForCalc = b.startYm ? b : { ...b, startYm: effStart };
      const c = br.computeLedgerUpToMonth(bForCalc, activeYm);
      const origP = Number(b.originalPrincipal || b.principal || 0);

      (b.principalReductions || []).forEach(r => { principalRecovered += Number(r.amount || 0); });
      (b.paymentHistory || []).forEach(p => {
        const amt = Number(p.amount || 0), dt = String(p.date || '').slice(0, 10), ym = dt.slice(0, 7);
        const mode = p.mode || 'Cash';
        totalInterestReceived += amt;
        if (dt === todayIso) {
          todayCollected += amt;
          if (mode === 'UPI') todayUpi += amt;
          else if (mode === 'Bank') todayBank += amt;
          else todayCash += amt;
          todayPaymentsList.push({ name: b.name, amount: amt, mode, note: p.note || p.type || 'जमा', time: String(p.date || '').slice(11, 16) });
        }
        if (ym === activeYm) monthlyCollected += amt;
        if (ym) monthlySeries[ym] = (monthlySeries[ym] || 0) + amt;
        recentPayments.push({ name: b.name, amount: amt, date: dt, mode, note: p.note || p.type || 'जमा' });
      });

      if (b.accountStatus === 'closed') {
        closedLoans++;
        principalRecovered += Number((b.settlement && b.settlement.amount) || origP);
      } else {
        activeLoans++;
        remainingPrincipal += c.principal;
        monthlyExpected += c.monthlyInterest;
        totalOutstanding += c.totalPayable;
        if (c.status === 'paid') paidCnt++;
        else if (c.status === 'partial') partialCnt++;
        else unpaidCnt++;

        const isOverdue = c.lateDays > 0 || c.pastDue > 0;
        if (isOverdue && c.totalPayable > 0) totalOverdue += c.totalPayable;

        const row = {
          id: b.id, name: b.name, mobile: b.mobile || '', principal: c.principal,
          monthlyInterest: c.monthlyInterest, paidThisMonth: c.paidThisMonth,
          remainingThisMonth: c.remainingThisMonth,
          pastDue: c.pastDue, outstanding: c.totalPayable, status: c.status, lateDays: c.lateDays, raw: b
        };
        allActiveRows.push(row);
        if (c.totalPayable > 0) dueCustomers.push(row);
      }

      if (isAccountActiveInMonth(b, activeYm)) {
        totalPrincipal += b.accountStatus === 'closed' ? 0 : c.principal;
        monthLedgerRows.push({
          id: b.id, name: b.name, mobile: b.mobile || '', startYm: effStart,
          hasTx: hasTransactionInMonth(b, activeYm),
          principal: b.accountStatus === 'closed' ? 0 : c.principal,
          monthlyInterest: c.monthlyInterest, paidThisMonth: c.paidThisMonth,
          pastDue: c.pastDue, outstanding: c.totalPayable, status: c.status
        });
      }
    });

    recentPayments.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    dueCustomers.sort((a, b) => b.outstanding - a.outstanding);

    return {
      activeYm, todayIso, tomorrowIso, activeLoans, closedLoans, totalPrincipal, remainingPrincipal,
      principalRecovered, monthlyExpected, monthlyCollected, todayCollected, todayCash, todayUpi, todayBank,
      todayPaymentsList, totalInterestReceived, totalOutstanding, totalOverdue, paidCnt, partialCnt, unpaidCnt,
      monthlySeries, recentPayments: recentPayments.slice(0, 12), dueCustomers, allActiveRows, monthLedgerRows
    };
  }

  // =========================================================================
  // मुख्य डॅशबोर्ड कार्ड्स क्लिक केल्यावर उघडणारी सविस्तर यादी (मुद्दल / व्याज / बाकी)
  // =========================================================================
  let currentDrillMode = 'principal';

  function renderStatDrillList(searchQuery = '') {
    const d = computeV3Data();
    const listEl = document.getElementById('statDrillList');
    const sumEl = document.getElementById('statDrillSummary');
    const titleEl = document.getElementById('statDrillTitle');
    if (!d || !listEl || !sumEl || !titleEl) return;

    const q = String(searchQuery || '').trim().toLowerCase();
    const matchQ = (r) => !q || `${r.name || ''} ${r.mobile || ''}`.toLowerCase().includes(q);

    if (currentDrillMode === 'principal') {
      const rows = d.allActiveRows.filter(matchQ).sort((a, b) => b.principal - a.principal);
      const total = rows.reduce((s, r) => s + r.principal, 0);
      titleEl.textContent = `💰 एकूण मुद्दल यादी (${rows.length} खाती)`;
      sumEl.innerHTML = `एकूण सक्रिय मुद्दल: <span class="ok">${fmt(total)}</span>`;
      listEl.innerHTML = rows.length ? rows.map((r, i) => {
        const mob = String(r.mobile || '').replace(/\D/g, '');
        return `
          <div class="sd-row-card">
            <div class="sd-top">
              <div><strong>${i + 1}. ${esc(r.name)}</strong><div class="muted" style="font-size:0.75rem;">दर: ${Number((r.raw && r.raw.rate) || 0)}% | मासिक व्याज: ${fmt(r.monthlyInterest)}</div></div>
              <div class="sd-actions">
                <strong style="font-size:1rem;">${fmt(r.principal)}</strong>
                ${mob.length >= 10 ? `<button type="button" class="success sm" onclick="window.location.href='tel:${esc(mob)}'">📞 Call</button>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('') : '<p class="muted" style="text-align:center;">कोणतीही नोंद नाही.</p>';

    } else if (currentDrillMode === 'interest') {
      const rows = d.allActiveRows.filter(matchQ).sort((a, b) => b.monthlyInterest - a.monthlyInterest);
      const total = rows.reduce((s, r) => s + r.monthlyInterest, 0);
      titleEl.textContent = `📈 मासिक व्याज यादी — ${fmtYmMarathi(d.activeYm)}`;
      sumEl.innerHTML = `एकूण अपेक्षित व्याज: <span style="color:#38bdf8;">${fmt(total)}</span> (${rows.length} खाती)`;
      listEl.innerHTML = rows.length ? rows.map((r, i) => {
        const mob = String(r.mobile || '').replace(/\D/g, '');
        const stBadge = r.status === 'paid'
          ? '<span class="badge paid">जमा</span>'
          : r.status === 'partial'
            ? `<span class="badge partial">अर्धवट (${fmt(r.paidThisMonth)})</span>`
            : '<span class="badge pending">बाकी</span>';
        return `
          <div class="sd-row-card">
            <div class="sd-top">
              <div><strong>${i + 1}. ${esc(r.name)}</strong> ${stBadge}<div class="muted" style="font-size:0.75rem;">मुद्दल: ${fmt(r.principal)}</div></div>
              <div class="sd-actions">
                <strong style="color:#38bdf8; font-size:1rem;">${fmt(r.monthlyInterest)}</strong>
                ${mob.length >= 10 ? `<button type="button" class="success sm" onclick="window.location.href='tel:${esc(mob)}'">📞 Call</button>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('') : '<p class="muted" style="text-align:center;">कोणतीही नोंद नाही.</p>';

    } else if (currentDrillMode === 'pending') {
      const rows = d.dueCustomers.filter(matchQ);
      const total = rows.reduce((s, r) => s + r.outstanding, 0);
      titleEl.textContent = `⏳ बाकी व्याज यादी — ${fmtYmMarathi(d.activeYm)}`;
      sumEl.innerHTML = `एकूण बाकी व्याज: <span class="err">${fmt(total)}</span> (${rows.length} बाकीदार)`;
      listEl.innerHTML = rows.length ? rows.map((r, i) => {
        const mob = String(r.mobile || '').replace(/\D/g, '');
        const pendMonths = getPendingMonthsList(r.raw || {}, d.activeYm);
        const targetWa = mob.length === 10 ? `91${mob}` : mob;
        const waMsg = encodeURIComponent(`नमस्कार *${r.name}*,\nआपली *${fmtYmMarathi(d.activeYm)}* पर्यंतची एकूण व्याज/बाकी रक्कम *₹${r.outstanding}* देय आहे. कृपया लवकर जमा करावी. धन्यवाद!`);
        return `
          <div class="sd-row-card">
            <div class="sd-top">
              <div><strong>${i + 1}. ${esc(r.name)}</strong><div class="muted" style="font-size:0.75rem;">चालू बाकी: ${fmt(r.remainingThisMonth)} | मागील बाकी: <span class="warn-text">${fmt(r.pastDue)}</span></div></div>
              <div class="sd-actions">
                <strong class="err" style="font-size:1rem;">${fmt(r.outstanding)}</strong>
                ${mob.length >= 10 ? `<button type="button" class="success sm" onclick="window.location.href='tel:${esc(mob)}'">📞 Call</button>` : ''}
                ${mob.length >= 10 ? `<button type="button" class="primary sm" onclick="window.open('https://wa.me/${esc(targetWa)}?text=${waMsg}','_blank','noopener,noreferrer')">💬 WA</button>` : ''}
              </div>
            </div>
            <div style="margin-top:6px;">
              <span class="muted" style="font-size:0.74rem;">बाकी महिने (${pendMonths.length}): </span>
              ${pendMonths.length
                ? pendMonths.map(pm => `<span class="v3-month-pill ${pm.isPartial ? 'partial' : ''}">${esc(pm.label)}${pm.isPartial ? ` (अर्धवट)` : ''}</span>`).join('')
                : '<span class="muted" style="font-size:0.74rem;">चालू महिना / मॅन्युअल बाकी</span>'}
            </div>
          </div>
        `;
      }).join('') : '<p class="ok" style="text-align:center; font-weight:700;">🎉 कोणाचेही व्याज बाकी नाही!</p>';
    }
  }

  function openStatDrillModal(mode) {
    currentDrillMode = mode;
    const sInp = document.getElementById('statDrillSearch');
    if (sInp) sInp.value = '';
    renderStatDrillList('');
    document.getElementById('statDrillModal')?.classList.remove('hidden');
    pushNavHistory(`drill:${mode}`);
  }

  // ३. नवीन स्वच्छ Three-Line Hamburger Menu (☰) — रिपीट न झालेले फक्त मुख्य कामकाज
  let isDrawerOpen = false;
  let touchStartX = 0;

  function setDrawerState(open, fromPopstate = false) {
    isDrawerOpen = Boolean(open);
    const btn = document.getElementById('hmMenuBtn');
    const drawer = document.getElementById('hmDrawer');
    const backdrop = document.getElementById('hmBackdrop');
    if (!drawer || !backdrop || !btn) return;

    if (isDrawerOpen) {
      refreshDrawerLiveInfo();
      drawer.classList.add('open');
      backdrop.classList.add('open');
      btn.classList.add('open');
      btn.textContent = '✕';
      document.body.style.overflow = 'hidden';
      if (!fromPopstate) pushNavHistory('drawer');
    } else {
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
      btn.classList.remove('open');
      btn.textContent = '☰';
      document.body.style.overflow = '';
    }
  }

  function refreshDrawerLiveInfo() {
    const user = (window.firebase && firebase.auth) ? firebase.auth().currentUser : null;
    const nameEl = document.getElementById('hmUserName');
    const emailEl = document.getElementById('hmUserEmail');
    const avEl = document.getElementById('hmAvatar');
    if (user && nameEl && emailEl && avEl) {
      const disp = user.displayName || (user.email ? user.email.split('@')[0] : 'Admin');
      nameEl.textContent = disp;
      emailEl.textContent = user.email || 'Authorized Admin';
      avEl.innerHTML = user.photoURL ? `<img src="${esc(user.photoURL)}" alt="Admin" />` : esc(disp[0].toUpperCase());
    }
    const waInp = document.getElementById('hmDirectWaInput');
    if (waInp) waInp.value = localStorage.getItem('hishob_self_wa') || document.getElementById('selfWaNumber')?.value || '';
    const d = computeV3Data();
    if (d) {
      const dueBadge = document.getElementById('hmDueBadge');
      if (dueBadge) dueBadge.textContent = String(d.dueCustomers.length);
    }
  }

  function initHamburgerDrawer() {
    // डॅशबोर्ड कार्ड्स क्लिक इव्हेंट्स
    document.querySelectorAll('[data-stat-drill]').forEach(tile => {
      tile.addEventListener('click', () => openStatDrillModal(tile.getAttribute('data-stat-drill')));
    });
    document.getElementById('statDrillSearch')?.addEventListener('input', (e) => renderStatDrillList(e.target.value));
    document.getElementById('statDrillPrintBtn')?.addEventListener('click', () => {
      const pa = document.getElementById('printArea');
      if (!pa) return;
      pa.innerHTML = `<h2>${esc(document.getElementById('statDrillTitle')?.textContent || '')}</h2><p>${document.getElementById('statDrillSummary')?.innerHTML || ''}</p>${document.getElementById('statDrillList')?.innerHTML || ''}`;
      window.print();
    });

    document.getElementById('borrowersList')?.addEventListener('click', (e) => {
      if (e.target.closest('button[data-action="add-loan-same"]')) {
        openToolSection('addBorrowerSection', '➕ नवीन ग्राहक / कर्ज नोंद');
      }
    });

    const brandEl = document.querySelector('header .brand');
    if (brandEl && !document.getElementById('hmMenuBtn')) {
      const hmBtn = document.createElement('button');
      hmBtn.id = 'hmMenuBtn'; hmBtn.className = 'hm-btn';
      hmBtn.title = 'मेन्यू उघडा / बंद करा'; hmBtn.textContent = '☰';
      brandEl.insertBefore(hmBtn, brandEl.firstChild);
      hmBtn.addEventListener('click', (e) => { e.stopPropagation(); setDrawerState(!isDrawerOpen); });
    }

    if (document.getElementById('hmDrawer')) return;

    const backdrop = document.createElement('div');
    backdrop.id = 'hmBackdrop'; backdrop.className = 'hm-backdrop';
    document.body.appendChild(backdrop);

    const drawer = document.createElement('aside');
    drawer.id = 'hmDrawer'; drawer.className = 'hm-drawer';
    drawer.innerHTML = `
      <div class="hm-head">
        <div class="hm-profile">
          <div id="hmAvatar" class="hm-avatar">H</div>
          <div style="overflow:hidden;">
            <div id="hmUserName" style="font-weight:700; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Hishob Admin</div>
            <div id="hmUserEmail" style="font-size:0.75rem; opacity:0.9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Secure Account</div>
          </div>
        </div>
      </div>

      <div class="hm-wa-bar">
        <label>📲 माझा WhatsApp रिमाइंडर नंबर सेव्ह करा:</label>
        <div class="hm-wa-row">
          <input type="tel" id="hmDirectWaInput" placeholder="उदा. 919876543210" />
          <button type="button" id="hmDirectWaSaveBtn" class="success sm">सेव्ह</button>
        </div>
      </div>

      <div class="hm-body">
        <div class="hm-sec-lbl">मुख्य मेनू</div>
        <button class="hm-item active" data-hm="home"><span class="hm-item-left"><span>🏠</span><span>मुख्य Dashboard</span></span></button>
        <button class="hm-item" data-hm="add-cust"><span class="hm-item-left"><span>➕</span><span>नवीन नाव जोडा (Compose)</span></span></button>
        <button class="hm-item" data-hm="archive"><span class="hm-item-left"><span>📅</span><span>मागील महिन्यांचा हिशोब (Months)</span></span></button>
        <button class="hm-item" data-hm="quick-pay"><span class="hm-item-left"><span>⚡</span><span>Quick Add Payment</span></span></button>
        <button class="hm-item" data-hm="notifs">
          <span class="hm-item-left"><span>🔔</span><span>आजचे वायदे व थकबाकी</span></span>
          <span id="hmDueBadge" class="hm-badge">0</span>
        </button>
        <button class="hm-item" data-hm="v3-dash"><span class="hm-item-left"><span>🚀</span><span>Premium Dashboard V3</span></span></button>

        <div class="hm-div"></div>
        <div class="hm-sec-lbl">अ‍ॅडव्हान्स रिपोर्ट्स व साधने</div>
        <button class="hm-item" data-hm="daily-cash"><span class="hm-item-left"><span>💰</span><span>आजची वसुली (Daily Cashbook)</span></span></button>
        <button class="hm-item" data-hm="bulk-wa"><span class="hm-item-left"><span>📲</span><span>Bulk WhatsApp रिमाइंडर रांग</span></span></button>
        <button class="hm-item" data-hm="guarantor-rep"><span class="hm-item-left"><span>🤝</span><span>जमीनदार निहाय कर्ज यादी</span></span></button>
        <button class="hm-item" data-hm="gmail-rep"><span class="hm-item-left"><span>📧</span><span>Gmail वर मास्टर रिपोर्ट पाठवा</span></span></button>
        <button class="hm-item" data-hm="tool-reports"><span class="hm-item-left"><span>📥</span><span>हिशोब डाउनलोड (PDF/Excel) & Sheet</span></span></button>
        <button class="hm-item" data-hm="tool-emi"><span class="hm-item-left"><span>🧮</span><span>EMI Simulator</span></span></button>
        <button class="hm-item" data-hm="analytics"><span class="hm-item-left"><span>📈</span><span>Analytics & Charts</span></span></button>
        <button class="hm-item" data-hm="pnl"><span class="hm-item-left"><span>💹</span><span>Profit & Loss Report</span></span></button>

        <div class="hm-div"></div>
        <div class="hm-sec-lbl">सुरक्षा, अ‍ॅडमिन व मेंटेनन्स</div>
        <button class="hm-item" data-hm="cloud-sync"><span class="hm-item-left"><span>☁️</span><span>Cloud Sync, Backup & Restore</span></span></button>
        <button class="hm-item" data-hm="security"><span class="hm-item-left"><span>🛡️</span><span>Admin Security Dashboard & Threats</span></span></button>
        <button class="hm-item" data-hm="tool-recycle"><span class="hm-item-left"><span>🗑️</span><span>Recycle Bin (डिलीट झालेली नावे)</span></span></button>
        <button class="hm-item" data-hm="tool-audit"><span class="hm-item-left"><span>📜</span><span>Audit Log</span></span></button>
        <button class="hm-item" data-hm="tool-rem"><span class="hm-item-left"><span>⚙️</span><span>UPI QR व Notification सेटिंग</span></span></button>
      </div>
    `;
    document.body.appendChild(drawer);

    document.getElementById('hmDirectWaSaveBtn').addEventListener('click', () => {
      const val = document.getElementById('hmDirectWaInput').value.trim();
      const mainInp = document.getElementById('selfWaNumber');
      if (mainInp) mainInp.value = val;
      document.getElementById('saveWaNumberBtn')?.click();
      showToast('✅ WhatsApp रिमाइंडर नंबर सेव्ह झाला!');
    });

    backdrop.addEventListener('click', () => setDrawerState(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isDrawerOpen) setDrawerState(false); });
    drawer.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    drawer.addEventListener('touchend', (e) => { if (touchStartX - e.changedTouches[0].clientX > 55) setDrawerState(false); }, { passive: true });

    drawer.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-hm]');
      if (!btn) return;
      const act = btn.getAttribute('data-hm');
      setDrawerState(false);

      if (act === 'home') { v3TabHistory = []; closeToolSectionModal(); document.getElementById('v3Overlay')?.classList.add('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      else if (act === 'archive') openV3Dashboard('archive');
      else if (act === 'v3-dash') openV3Dashboard('overview');
      else if (act === 'quick-pay') openV3Dashboard('payments');
      else if (act === 'notifs') document.getElementById('notifBellBtn')?.click();
      else if (act === 'daily-cash') openV3Dashboard('daily-cash');
      else if (act === 'bulk-wa') openV3Dashboard('bulk-wa');
      else if (act === 'guarantor-rep') openV3Dashboard('guarantor-rep');
      else if (act === 'cloud-sync') openV3Dashboard('cloud-sync');
      else if (act === 'gmail-rep') document.getElementById('gmailReportBtn')?.click();
      else if (act === 'add-cust') openToolSection('addBorrowerSection', '➕ नवीन नाव जोडा (Compose)');
      else if (act === 'tool-rem') openToolSection('remSection', '⚙️ UPI QR व Notification सेटिंग');
      else if (act === 'tool-reports') openToolSection('reportsSection', '📥 हिशोब डाउनलोड (PDF/Excel) & Sheet');
      else if (act === 'tool-emi') openToolSection('emiSection', '🧮 EMI Simulator');
      else if (act === 'tool-recycle') openToolSection('recycleSection', '🗑️ Recycle Bin');
      else if (act === 'tool-audit') openToolSection('auditSection', '📜 Audit Log');
      else if (act === 'analytics') openV3Dashboard('analytics');
      else if (act === 'pnl') document.getElementById('openPnlBtn')?.click();
      else if (act === 'security') document.getElementById('openSecurityDashBtn')?.click();
    });
  }

  // ४. Three-Dot (⋮) Menu (फक्त सेटिंग्जसाठी — कोणतेही रिपीट नाही) + Bottom Nav + FAB
  function initNavigationChrome() {
    initHamburgerDrawer();

    const slot = document.getElementById('threeDotMenuSlot');
    if (slot && !slot.dataset.ready) {
      slot.dataset.ready = '1';
      slot.innerHTML = `
        <div class="td-wrap">
          <button id="threeDotBtn" class="sm td-btn" title="सेटिंग्ज">⋮</button>
          <div id="threeDotDropdown" class="td-menu hidden">
            <button data-td="hide-amt">👁️ रकमा Hide / Show</button>
            <button data-td="theme">☀️ Dark / Light Mode</button>
            <button data-td="reset-pass">🔑 Password Reset Email</button>
            <button data-td="about">ℹ️ About Hishob (V14.1)</button>
            <div class="td-divider"></div>
            <button data-td="logout" style="color:var(--danger);">🔒 अ‍ॅप लॉक करा (Logout)</button>
          </div>
        </div>
      `;
      const btn = document.getElementById('threeDotBtn');
      const menu = document.getElementById('threeDotDropdown');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = menu.classList.contains('hidden');
        menu.classList.toggle('hidden');
        if (willOpen) pushNavHistory('td-menu');
      });
      document.addEventListener('click', () => menu.classList.add('hidden'));
      menu.addEventListener('click', async (e) => {
        const item = e.target.closest('button[data-td]'); if (!item) return;
        menu.classList.add('hidden');
        const act = item.getAttribute('data-td');
        if (act === 'hide-amt') document.getElementById('toggleHideAmtBtn')?.click();
        else if (act === 'theme') document.getElementById('toggleThemeBtn')?.click();
        else if (act === 'reset-pass') {
          const u = firebase.auth().currentUser;
          if (!u || !u.email) { showToast('ईमेल सापडला नाही.', true); return; }
          try { await firebase.auth().sendPasswordResetEmail(u.email); showToast(`✅ ${u.email} वर Password Reset लिंक पाठवली.`); }
          catch (err) { showToast(`एरर: ${err.message}`, true); }
        }
        else if (act === 'about') showToast('व्याज हिशोब वही V14.1 — Pro Clean Edition');
        else if (act === 'logout') document.getElementById('lockBtn')?.click();
      });
    }

    if (!document.getElementById('v3BottomNav')) {
      const nav = document.createElement('nav');
      nav.id = 'v3BottomNav'; nav.className = 'v3-bottom-nav';
      nav.innerHTML = `
        <button data-bnav="home" class="active"><span>🏠</span><span>Home</span></button>
        <button data-bnav="archive"><span>📅</span><span>Months</span></button>
        <button data-bnav="daily"><span>💰</span><span>आजची वसुली</span></button>
        <button data-bnav="pay"><span>⚡</span><span>Pay</span></button>
        <button data-bnav="drawer"><span>☰</span><span>Menu</span></button>
      `;
      document.body.appendChild(nav);

      const fab = document.createElement('button');
      fab.id = 'v3FabBtn'; fab.className = 'v3-fab'; fab.title = 'झटपट पेमेंट'; fab.textContent = '+';
      document.body.appendChild(fab);

      fab.addEventListener('click', () => openV3Dashboard('payments'));
      nav.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-bnav]'); if (!b) return;
        const t = b.getAttribute('data-bnav');
        if (t === 'home') { v3TabHistory = []; closeToolSectionModal(); document.getElementById('v3Overlay')?.classList.add('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else if (t === 'archive') openV3Dashboard('archive');
        else if (t === 'daily') openV3Dashboard('daily-cash');
        else if (t === 'pay') openV3Dashboard('payments');
        else if (t === 'drawer') setDrawerState(true);
      });
    }
  }

  // ५. Premium V3 Fullscreen Dashboard Shell (✕ बंद करा बटण काढले — फोनच्या Back ने बंद होईल)
  let v3Tab = 'overview';
  let v3Gradient = localStorage.getItem('hishob_v3_grad') !== '0';
  let isSavingPay = false;
  let archiveSelectedYear = getTodayIso().slice(0, 4);
  let archiveSelectedMonth = getTodayIso().slice(5, 7);
  let hasClickedShowMonthLedger = false;
  let archiveViewMode = 'all';
  let archiveStatusFilter = 'all';
  let archiveSearchQuery = '';
  let bulkWaIdx = 0;

  function ensureV3Overlay() {
    if (document.getElementById('v3Overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'v3Overlay';
    ov.className = `v3-overlay hidden ${v3Gradient ? 'v3-gradient-theme' : ''}`;
    ov.innerHTML = `
      <aside id="v3Sidebar" class="v3-sidebar">
        <div class="row" style="justify-content:space-between; padding:4px 6px 10px;">
          <strong class="v3-nav-lbl" style="font-size:1.05rem;">💎 Hishob V14</strong>
          <button id="v3ToggleSideBtn" class="sm" title="Sidebar लहान/मोठा">☰</button>
        </div>
        <button class="v3-nav-item active" data-v3tab="overview"><span>📊</span><span class="v3-nav-lbl">Dashboard</span></button>
        <button class="v3-nav-item" data-v3tab="archive"><span>📅</span><span class="v3-nav-lbl">महिना निहाय हिशोब</span></button>
        <button class="v3-nav-item" data-v3tab="payments"><span>⚡</span><span class="v3-nav-lbl">Quick Payment</span></button>
        <button class="v3-nav-item" data-v3tab="daily-cash"><span>💰</span><span class="v3-nav-lbl">आजची वसुली</span></button>
        <button class="v3-nav-item" data-v3tab="bulk-wa"><span>📲</span><span class="v3-nav-lbl">Bulk WhatsApp</span></button>
        <button class="v3-nav-item" data-v3tab="guarantor-rep"><span>🤝</span><span class="v3-nav-lbl">जमीनदार यादी</span></button>
        <button class="v3-nav-item" data-v3tab="cloud-sync"><span>☁️</span><span class="v3-nav-lbl">Cloud & Backup</span></button>
        <button class="v3-nav-item" data-v3tab="analytics"><span>📈</span><span class="v3-nav-lbl">Analytics & Charts</span></button>
        <div style="margin-top:auto; padding-top:10px; border-top:1px solid var(--border);">
          <button id="v3GradThemeBtn" class="v3-nav-item"><span>🎨</span><span class="v3-nav-lbl">Gradient Theme</span></button>
        </div>
      </aside>
      <section class="v3-main">
        <div class="v3-topbar">
          <div>
            <div style="font-weight:800; font-size:1.12rem;">Welcome Back! 👋</div>
            <div id="v3DateClock" class="muted" style="font-size:0.78rem;"></div>
          </div>
          <div class="row">
            <button id="v3MobOverviewBtn" class="sm primary">📊 Dash</button>
            <button id="v3MobArchiveBtn" class="sm warn">📅 Months</button>
            <button id="v3MobPayBtn" class="sm success">⚡ Pay</button>
            <button id="v3TopRefreshBtn" class="sm">🔄</button>
          </div>
        </div>
        <div id="v3Body"></div>
      </section>
    `;
    document.body.appendChild(ov);

    document.getElementById('v3ToggleSideBtn').addEventListener('click', () => document.getElementById('v3Sidebar').classList.toggle('collapsed'));
    document.getElementById('v3TopRefreshBtn').addEventListener('click', () => { renderV3Body(); showToast('रिफ्रेश झाले!'); });
    document.getElementById('v3GradThemeBtn').addEventListener('click', () => {
      v3Gradient = !v3Gradient; localStorage.setItem('hishob_v3_grad', v3Gradient ? '1' : '0');
      ov.classList.toggle('v3-gradient-theme', v3Gradient);
    });
    document.getElementById('v3MobOverviewBtn').addEventListener('click', () => switchV3Tab('overview', true));
    document.getElementById('v3MobArchiveBtn').addEventListener('click', () => switchV3Tab('archive', true));
    document.getElementById('v3MobPayBtn').addEventListener('click', () => switchV3Tab('payments', true));
    document.getElementById('v3Sidebar').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-v3tab]'); if (!btn) return;
      switchV3Tab(btn.getAttribute('data-v3tab'), true);
    });
  }

  function switchV3Tab(tab, pushToHistory = true) {
    v3Tab = tab;
    if (pushToHistory) {
      if (v3TabHistory[v3TabHistory.length - 1] !== tab) {
        v3TabHistory.push(tab);
        pushNavHistory(`v3:${tab}`);
      }
    }
    document.querySelectorAll('#v3Sidebar .v3-nav-item[data-v3tab]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-v3tab') === tab);
    });
    renderV3Body();
  }

  function openV3Dashboard(tab = 'overview') {
    ensureV3Overlay();
    closeToolSectionModal();
    const curYm = document.getElementById('activeYm')?.value || getTodayIso().slice(0, 7);
    archiveSelectedYear = curYm.slice(0, 4);
    archiveSelectedMonth = curYm.slice(5, 7);
    hasClickedShowMonthLedger = true;
    document.getElementById('v3Overlay').classList.remove('hidden');
    switchV3Tab(tab, true);
  }

  // ६. Pure SVG Charts
  function buildSvgAreaChart(monthlySeries) {
    const keys = Object.keys(monthlySeries).sort().slice(-6);
    if (!keys.length) return '<div class="muted">अद्याप मासिक भरणा नोंदी नाहीत.</div>';
    const vals = keys.map(k => monthlySeries[k]), maxV = Math.max(1, ...vals);
    const w = 420, h = 130, pad = 20;
    const pts = vals.map((v, i) => ({
      x: Math.round(pad + (i * (w - pad * 2)) / Math.max(1, vals.length - 1)),
      y: Math.round(h - pad - ((v / maxV) * (h - pad * 2))), k: keys[i], v
    }));
    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const areaPath = `${linePath} L${pts[pts.length - 1].x},${h - pad} L${pts[0].x},${h - pad} Z`;
    return `
      <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:150px;">
        <defs><linearGradient id="v3AreaG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#38bdf8" stop-opacity="0.45"/><stop offset="100%" stop-color="#38bdf8" stop-opacity="0.02"/></linearGradient></defs>
        <path d="${areaPath}" fill="url(#v3AreaG)" />
        <path d="${linePath}" fill="none" stroke="#38bdf8" stroke-width="2.5" />
        ${pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#22c55e"><title>${esc(p.k)}: ₹${p.v}</title></circle>`).join('')}
      </svg>
      <div class="row" style="justify-content:space-between; font-size:0.75rem;">
        ${pts.map(p => `<span>${esc(p.k)}: <strong>${fmt(p.v)}</strong></span>`).join('')}
      </div>
    `;
  }

  function buildSvgDonut(paid, partial, unpaid) {
    const total = Math.max(1, paid + partial + unpaid);
    const p1 = (paid / total) * 100, p2 = (partial / total) * 100, p3 = (unpaid / total) * 100;
    return `
      <div class="row" style="gap:16px; align-items:center;">
        <svg viewBox="0 0 36 36" style="width:110px; height:110px; transform:rotate(-90deg);">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#334155" stroke-width="3.6" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#22c55e" stroke-width="3.6" stroke-dasharray="${p1} ${100 - p1}" stroke-dashoffset="0" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f59e0b" stroke-width="3.6" stroke-dasharray="${p2} ${100 - p2}" stroke-dashoffset="${-p1}" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#ef4444" stroke-width="3.6" stroke-dasharray="${p3} ${100 - p3}" stroke-dashoffset="${-(p1 + p2)}" />
        </svg>
        <div style="font-size:0.84rem; line-height:1.8;">
          <div>🟢 पूर्ण जमा: <strong>${paid}</strong> (${Math.round(p1)}%)</div>
          <div>🟡 अर्धवट जमा: <strong>${partial}</strong> (${Math.round(p2)}%)</div>
          <div>🔴 बाकी खाती: <strong>${unpaid}</strong> (${Math.round(p3)}%)</div>
        </div>
      </div>
    `;
  }

  // ७. V3 Dashboard Body Render
  function renderV3Body() {
    const body = document.getElementById('v3Body');
    const clock = document.getElementById('v3DateClock');
    if (clock) clock.textContent = new Date().toLocaleString('mr-IN', { dateStyle: 'medium', timeStyle: 'short' });

    const d = computeV3Data();
    if (!d) { body.innerHTML = '<p class="muted">डेटा लोड होत आहे...</p>'; return; }

    const target = Number(localStorage.getItem('hishob_monthly_target') || d.monthlyExpected || 0);
    const pct = target > 0 ? Math.min(100, Math.round((d.monthlyCollected / target) * 100)) : 0;

    if (v3Tab === 'cloud-sync') {
      const user = (window.firebase && firebase.auth) ? firebase.auth().currentUser : null;
      const savedGmail = localStorage.getItem('hishob_report_gmail') || (user && user.email) || '';
      const savedHook = localStorage.getItem('hishob_webhook_url') || document.getElementById('webhookUrlInput')?.value || '';

      body.innerHTML = `
        <div class="v3-panel" style="max-width:620px; margin:0 auto;">
          <div class="row" style="justify-content:space-between; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--border);">
            <h3 style="margin:0; color:#38bdf8;">☁️ Update-Safe Cloud Sync, Backup & Restore</h3>
          </div>

          <div style="margin-bottom:12px;">
            <label class="muted" style="font-size:0.8rem; font-weight:700; display:block; margin-bottom:5px;">🔗 कनेक्टेड Gmail खाते:</label>
            <div class="row">
              <input type="email" id="csGmailInp" value="${esc(savedGmail)}" placeholder="tumcha@gmail.com" style="flex:1;" />
              <button type="button" id="csSaveGmailBtn" class="success sm">Gmail सेव्ह करा</button>
            </div>
          </div>

          <div style="margin-bottom:14px;">
            <label class="muted" style="font-size:0.8rem; font-weight:700; display:block; margin-bottom:5px;">⚙️ Google Apps Script Webhook URL (ऐच्छिक):</label>
            <div class="row">
              <input type="url" id="csWebhookInp" value="${esc(savedHook)}" placeholder="https://script.google.com/macros/s/.../exe" style="flex:1;" />
              <button type="button" id="csSaveHookBtn" class="primary sm">सेव्ह</button>
            </div>
          </div>

          <div class="meta-box" style="padding:12px;">
            <div style="font-weight:800; margin-bottom:8px; font-size:0.9rem;">🛡️ डेटा सुरक्षा व बॅकअप पर्याय:</div>
            <div class="row" style="margin-bottom:8px;">
              <input type="password" id="csPasskeyInp" placeholder="Encrypted बॅकअपसाठी Passkey (किमान ६ अक्षरे)" style="flex:1;" />
            </div>

            <div class="cs-grid-4">
              <button type="button" id="csCloudSyncBtn" class="cs-big-btn purple"><span>🔄</span><span>क्लाउड डेटा सिंक करा</span></button>
              <button type="button" id="csShaBackupBtn" class="cs-big-btn blue"><span>💾</span><span>SHA-256 बॅकअप (.JSON)</span></button>
              <button type="button" id="csShaRestoreBtn" class="cs-big-btn green"><span>📂</span><span>सुरक्षित रिस्टोअर (.JSON)</span></button>
              <button type="button" id="csGmailRepBtn" class="cs-big-btn teal"><span>📧</span><span>Gmail वर रिपोर्ट पाठवा</span></button>
            </div>

            <button type="button" id="csLocalVaultBtn" class="cs-vault-btn">🛟 लोकल सेफ्टी व्हॉल्टमधून परत आणा</button>
          </div>
        </div>
      `;

      document.getElementById('csSaveGmailBtn').addEventListener('click', () => {
        localStorage.setItem('hishob_report_gmail', document.getElementById('csGmailInp').value.trim());
        showToast('✅ Gmail खाते सेव्ह झाले!');
      });
      document.getElementById('csSaveHookBtn').addEventListener('click', () => {
        const u = document.getElementById('csWebhookInp').value.trim();
        const mainHook = document.getElementById('webhookUrlInput');
        if (mainHook) mainHook.value = u;
        document.getElementById('saveWebhookBtn')?.click();
        showToast('✅ Webhook URL सेव्ह झाले!');
      });
      document.getElementById('csCloudSyncBtn').addEventListener('click', () => {
        document.getElementById('saveCloudBackupBtn')?.click();
        showToast('☁️ क्लाउड डेटा सिंक सुरू झाले!');
      });
      document.getElementById('csShaBackupBtn').addEventListener('click', () => {
        const pk = document.getElementById('csPasskeyInp').value;
        if (!pk || pk.length < 6) { showToast('आधी किमान ६ अक्षरांची Passkey टाका.', true); return; }
        const mainPk = document.getElementById('backupPasskey');
        if (mainPk) mainPk.value = pk;
        document.getElementById('exportEncBtn')?.click();
        showToast('💾 SHA-256 Encrypted बॅकअप डाउनलोड सुरू!');
      });
      document.getElementById('csShaRestoreBtn').addEventListener('click', () => {
        const pk = document.getElementById('csPasskeyInp').value;
        if (!pk || pk.length < 6) { showToast('आधी किमान ६ अक्षरांची Passkey टाका.', true); return; }
        const mainPk = document.getElementById('backupPasskey');
        if (mainPk) mainPk.value = pk;
        const fileInp = document.getElementById('importEncFile');
        if (fileInp) {
          fileInp.onchange = () => { document.getElementById('importEncBtn')?.click(); showToast('🔓 रिस्टोअर प्रक्रिया सुरू!'); };
          fileInp.click();
        }
      });
      document.getElementById('csGmailRepBtn').addEventListener('click', () => document.getElementById('gmailReportBtn')?.click());
      document.getElementById('csLocalVaultBtn').addEventListener('click', () => {
        const pk = document.getElementById('csPasskeyInp').value;
        if (!pk || pk.length < 6) { showToast('व्हॉल्ट रिस्टोअरसाठी Passkey टाका.', true); return; }
        const mainPk = document.getElementById('backupPasskey');
        if (mainPk) mainPk.value = pk;
        document.getElementById('restoreLocalVaultBtn')?.click();
        showToast('🛟 लोकल व्हॉल्टमधून डेटा रिस्टोअर सुरू!');
      });

    } else if (v3Tab === 'daily-cash') {
      body.innerHTML = `
        <div class="v3-panel">
          <h3 style="margin-top:0;">💰 आजची वसुली — Daily Cashbook (${esc(d.todayIso)})</h3>
          <div class="v3-kpi-row">
            <div class="v3-wave-card"><div class="v3-kpi-title">आजची एकूण वसुली</div><div class="v3-kpi-num ok">${fmt(d.todayCollected)}</div><div class="v3-kpi-sub">नोंदी: ${d.todayPaymentsList.length}</div></div>
            <div class="v3-wave-card"><div class="v3-kpi-title">💵 रोख (Cash)</div><div class="v3-kpi-num">${fmt(d.todayCash)}</div></div>
            <div class="v3-wave-card"><div class="v3-kpi-title">📱 UPI / 🏦 Bank</div><div class="v3-kpi-num" style="color:#38bdf8;">${fmt(d.todayUpi + d.todayBank)}</div><div class="v3-kpi-sub">UPI: ${fmt(d.todayUpi)} | Bank: ${fmt(d.todayBank)}</div></div>
          </div>

          <h4 style="margin:10px 0 6px;">📋 आजच्या सर्व जमा नोंदी</h4>
          ${d.todayPaymentsList.length ? d.todayPaymentsList.map((p, i) => `
            <div class="row" style="justify-content:space-between; padding:8px 10px; border-bottom:1px solid var(--border); font-size:0.86rem;">
              <div><strong>${i + 1}. ${esc(p.name)}</strong> <span class="badge">${esc(p.mode)}</span><div class="muted" style="font-size:0.75rem;">${esc(p.note)}</div></div>
              <strong class="ok">+${fmt(p.amount)}</strong>
            </div>
          `).join('') : '<div class="meta-box" style="text-align:center;">आज अद्याप कोणतीही जमा नोंद झालेली नाही.</div>'}
        </div>
      `;

    } else if (v3Tab === 'bulk-wa') {
      const queue = d.dueCustomers.filter(c => String(c.mobile || '').replace(/\D/g, '').length >= 10);
      if (bulkWaIdx >= queue.length) bulkWaIdx = 0;
      const cur = queue[bulkWaIdx];
      const curMob = cur ? String(cur.mobile || '').replace(/\D/g, '') : '';

      body.innerHTML = `
        <div class="v3-panel" style="max-width:560px; margin:0 auto;">
          <h3 style="margin-top:0;">📲 Bulk WhatsApp रिमाइंडर रांग (${queue.length} ग्राहक)</h3>
          ${cur ? `
            <div class="meta-box" style="padding:14px;">
              <div class="row" style="justify-content:space-between; margin-bottom:8px;">
                <span class="badge">क्र. ${bulkWaIdx + 1} / ${queue.length}</span>
                <span class="muted">📱 ${esc(cur.mobile)}</span>
              </div>
              <div style="font-size:1.15rem; font-weight:800; margin-bottom:6px;">${esc(cur.name)}</div>
              <div style="margin-bottom:10px;">मुद्दल: <strong>${fmt(cur.principal)}</strong> | एकूण बाकी: <strong class="err">${fmt(cur.outstanding)}</strong></div>
              <div class="row">
                <button type="button" id="bwaCallBtn" class="success sm">📞 Call</button>
                <button type="button" id="bwaSendBtn" class="success" style="flex:1;">💬 WhatsApp पाठवा</button>
                <button type="button" id="bwaNextBtn" class="primary">पुढचा →</button>
              </div>
            </div>
          ` : '<div class="meta-box" style="text-align:center;">मोबाईल नंबर असलेला कोणताही बाकी ग्राहक नाही!</div>'}
        </div>
      `;

      document.getElementById('bwaCallBtn')?.addEventListener('click', () => { if (curMob) window.location.href = `tel:${curMob}`; });
      document.getElementById('bwaSendBtn')?.addEventListener('click', () => {
        const target = curMob.length === 10 ? `91${curMob}` : curMob;
        const msg = `नमस्कार *${cur.name}*,\nआपली *${fmtYmMarathi(d.activeYm)}* पर्यंतची एकूण व्याज/बाकी रक्कम *₹${cur.outstanding}* देय आहे. कृपया लवकर जमा करावी. धन्यवाद!`;
        window.open(`https://wa.me/${target}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
      });
      document.getElementById('bwaNextBtn')?.addEventListener('click', () => {
        bulkWaIdx = (bulkWaIdx + 1) % Math.max(1, queue.length);
        renderV3Body();
      });

    } else if (v3Tab === 'guarantor-rep') {
      const gMap = {};
      d.allActiveRows.forEach(r => {
        const gName = String((r.raw && r.raw.guarantor) || '').trim() || 'जमीनदार नोंद नाही';
        if (!gMap[gName]) gMap[gName] = { name: gName, count: 0, principal: 0, outstanding: 0, customers: [] };
        gMap[gName].count++;
        gMap[gName].principal += r.principal;
        gMap[gName].outstanding += r.outstanding;
        gMap[gName].customers.push(r);
      });
      const gList = Object.values(gMap).sort((a, b) => b.principal - a.principal);

      body.innerHTML = `
        <div class="v3-panel">
          <h3 style="margin-top:0;">🤝 जमीनदार निहाय कर्ज यादी (${gList.length} जमीनदार)</h3>
          ${gList.map(g => `
            <div class="v3-loan-card">
              <div class="row" style="justify-content:space-between; margin-bottom:6px;">
                <strong>🤝 ${esc(g.name)} (${g.count} खाती)</strong>
                <div>मुद्दल: <strong>${fmt(g.principal)}</strong> | बाकी: <strong class="err">${fmt(g.outstanding)}</strong></div>
              </div>
              <div style="display:flex; flex-direction:column; gap:5px;">
                ${g.customers.map(c => {
                  const m = String(c.mobile || '').replace(/\D/g, '');
                  return `<div class="row" style="justify-content:space-between; font-size:0.8rem; border-top:1px dashed var(--border); padding-top:4px;">
                    <span>• ${esc(c.name)} (मुद्दल: ${fmt(c.principal)} | बाकी: <span class="err">${fmt(c.outstanding)}</span>)</span>
                    ${m.length >= 10 ? `<button type="button" class="success sm" onclick="window.location.href='tel:${esc(m)}'">📞 Call</button>` : ''}
                  </div>`;
                }).join('')}
              </div>
            </div>
          `).join('') || '<p class="muted">कोणतीही सक्रिय खाती नाहीत.</p>'}
        </div>
      `;

    } else if (v3Tab === 'archive') {
      const selYm = `${archiveSelectedYear}-${archiveSelectedMonth}`;
      const mData = computeV3Data(selYm) || d;
      const baseRows = mData.monthLedgerRows || [];

      const filteredRows = baseRows.filter(r => {
        if (archiveViewMode === 'tx' && !r.hasTx) return false;
        if (archiveStatusFilter !== 'all' && r.status !== archiveStatusFilter) return false;
        if (archiveSearchQuery) {
          const q = archiveSearchQuery.toLowerCase();
          const txt = `${r.name || ''} ${r.mobile || ''}`.toLowerCase();
          if (!txt.includes(q)) return false;
        }
        return true;
      });

      const mPrincipal = filteredRows.reduce((s, r) => s + r.principal, 0);
      const mExpected = filteredRows.reduce((s, r) => s + r.monthlyInterest, 0);
      const mPaid = filteredRows.reduce((s, r) => s + r.paidThisMonth, 0);
      const mPastDue = filteredRows.reduce((s, r) => s + r.pastDue, 0);
      const mTotalOut = filteredRows.reduce((s, r) => s + r.outstanding, 0);
      const years = ['2024', '2025', '2026', '2027', '2028', '2029', '2030'];

      body.innerHTML = `
        <div class="v3-panel">
          <div class="row" style="justify-content:space-between; margin-bottom:10px;">
            <h3 style="margin:0;">📅 महिना निहाय खरा हिशोब (V14.1)</h3>
            <button id="v3ApplyMainYmBtn" class="sm">📂 मुख्य स्क्रीनवर सेट करा</button>
          </div>
          <div class="row" style="margin-bottom:12px; align-items:flex-end;">
            <div style="flex:1; min-width:115px;">
              <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:4px;">वर्ष निवडा (Year):</label>
              <select id="v3ArchYearSel" style="width:100%;">
                ${years.map(y => `<option value="${y}" ${y === archiveSelectedYear ? 'selected' : ''}>${y}</option>`).join('')}
              </select>
            </div>
            <div style="flex:1.3; min-width:145px;">
              <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:4px;">महिना निवडा (Month):</label>
              <select id="v3ArchMonthSel" style="width:100%;">
                ${MARATHI_MONTHS.map((mName, idx) => {
                  const mm = String(idx + 1).padStart(2, '0');
                  return `<option value="${mm}" ${mm === archiveSelectedMonth ? 'selected' : ''}>${mName} (${mm})</option>`;
                }).join('')}
              </select>
            </div>
            <div style="flex:1; min-width:140px;">
              <button id="v3ShowMonthLedgerBtn" class="primary" style="width:100%; padding:9px 12px;">🔍 हिशोब पहा</button>
            </div>
          </div>

          ${hasClickedShowMonthLedger ? `
            <div style="margin-bottom:10px; padding:8px 10px; border-radius:10px; background:var(--card-2); border:1px solid var(--border); font-weight:700; color:#38bdf8;">
              📌 निवडलेला महिना: ${esc(fmtYmMarathi(selYm))} (${esc(selYm)})
            </div>
            <div class="v3-seg-wrap">
              <button type="button" class="v3-seg-btn ${archiveViewMode === 'all' ? 'active' : ''}" data-archmode="all">📋 सर्व सक्रिय हिशोब (${baseRows.length})</button>
              <button type="button" class="v3-seg-btn ${archiveViewMode === 'tx' ? 'active' : ''}" data-archmode="tx">💸 फक्त व्यवहार (${baseRows.filter(x => x.hasTx).length})</button>
            </div>
            <div class="v3-seg-wrap">
              <button type="button" class="v3-seg-btn ${archiveStatusFilter === 'all' ? 'active' : ''}" data-archst="all">सर्व</button>
              <button type="button" class="v3-seg-btn ${archiveStatusFilter === 'paid' ? 'active' : ''}" data-archst="paid">🟢 पूर्ण जमा</button>
              <button type="button" class="v3-seg-btn ${archiveStatusFilter === 'partial' ? 'active' : ''}" data-archst="partial">🟡 अर्धवट</button>
              <button type="button" class="v3-seg-btn ${archiveStatusFilter === 'pending' ? 'active' : ''}" data-archst="pending">🔴 बाकी</button>
            </div>
            <input type="text" id="v3ArchSearchInp" value="${esc(archiveSearchQuery)}" placeholder="🔍 या महिन्यातील ग्राहक शोधा..." style="width:100%; margin-bottom:12px;" />

            <div class="v3-kpi-row">
              <div class="v3-wave-card"><div class="v3-kpi-title">या महिन्यातील खाती / मुद्दल</div><div class="v3-kpi-num">${filteredRows.length} खाती</div><div class="v3-kpi-sub">मुद्दल: ${fmt(mPrincipal)}</div></div>
              <div class="v3-wave-card"><div class="v3-kpi-title">महिन्याचे व्याज / जमा</div><div class="v3-kpi-num" style="color:#38bdf8;">${fmt(mExpected)}</div><div class="v3-kpi-sub ok">जमा: ${fmt(mPaid)}</div></div>
              <div class="v3-wave-card"><div class="v3-kpi-title">मागील व्याज बाकी + एकूण बाकी</div><div class="v3-kpi-num err">${fmt(mTotalOut)}</div><div class="v3-kpi-sub warn-text">मागील व्याज बाकी: ${fmt(mPastDue)}</div></div>
            </div>

            <div style="overflow-x:auto;">
              <table class="passbook-table">
                <thead><tr><th>क्र.</th><th>ग्राहक</th><th>मुद्दल</th><th>मासिक व्याज</th><th>जमा</th><th>मागील बाकी</th><th>एकूण बाकी</th><th>Call</th></tr></thead>
                <tbody>
                  ${filteredRows.length ? filteredRows.map((r, i) => {
                    const m = String(r.mobile || '').replace(/\D/g, '');
                    return `<tr><td>${i + 1}</td><td><strong>${esc(r.name)}</strong></td><td>${fmt(r.principal)}</td><td>${fmt(r.monthlyInterest)}</td><td class="ok">${fmt(r.paidThisMonth)}</td><td class="warn-text">${fmt(r.pastDue)}</td><td class="err"><strong>${fmt(r.outstanding)}</strong></td><td>${m.length >= 10 ? `<button type="button" class="success sm" onclick="window.location.href='tel:${esc(m)}'">📞</button>` : '-'}</td></tr>`;
                  }).join('') : '<tr><td colspan="8" class="muted" style="text-align:center; padding:14px;">नोंद नाही.</td></tr>'}
                </tbody>
              </table>
            </div>
            <div style="margin-top:14px;"><button id="v3DownloadIndepExcelBtn" class="success" style="width:100%;">📊 ${esc(fmtYmMarathi(selYm))} ची स्वतंत्र Excel डाउनलोड करा</button></div>
          ` : `<div class="meta-box" style="text-align:center; padding:16px;">वर <strong>वर्ष</strong> आणि <strong>महिना</strong> निवडून <strong>🔍 हिशोब पहा</strong> दाबा.</div>`}
        </div>
      `;

      document.getElementById('v3ArchYearSel')?.addEventListener('change', (e) => { archiveSelectedYear = e.target.value; hasClickedShowMonthLedger = false; renderV3Body(); });
      document.getElementById('v3ArchMonthSel')?.addEventListener('change', (e) => { archiveSelectedMonth = e.target.value; hasClickedShowMonthLedger = false; renderV3Body(); });
      document.getElementById('v3ShowMonthLedgerBtn')?.addEventListener('click', () => { hasClickedShowMonthLedger = true; renderV3Body(); });
      body.querySelectorAll('button[data-archmode]').forEach(b => b.addEventListener('click', () => { archiveViewMode = b.getAttribute('data-archmode'); renderV3Body(); }));
      body.querySelectorAll('button[data-archst]').forEach(b => b.addEventListener('click', () => { archiveStatusFilter = b.getAttribute('data-archst'); renderV3Body(); }));
      const sInp = document.getElementById('v3ArchSearchInp');
      if (sInp) sInp.addEventListener('input', (e) => { archiveSearchQuery = e.target.value; renderV3Body(); const r = document.getElementById('v3ArchSearchInp'); if (r) { r.focus(); r.setSelectionRange(r.value.length, r.value.length); } });
      document.getElementById('v3ApplyMainYmBtn')?.addEventListener('click', () => {
        const mainYmInp = document.getElementById('activeYm');
        if (mainYmInp) { mainYmInp.value = selYm; mainYmInp.dispatchEvent(new Event('change')); }
        v3TabHistory = []; document.getElementById('v3Overlay')?.classList.add('hidden');
        showToast(`📅 मुख्य स्क्रीनवर ${fmtYmMarathi(selYm)} सेट केले!`);
      });
      document.getElementById('v3DownloadIndepExcelBtn')?.addEventListener('click', () => {
        if (!filteredRows.length) { showToast('नोंद नाही.', true); return; }
        const header = ['क्र.', 'महिना', 'ग्राहक नाव', 'मोबाईल', 'मुद्दल (₹)', 'मासिक व्याज (₹)', 'जमा रक्कम (₹)', 'मागील व्याज बाकी (₹)', 'एकूण बाकी (₹)'].map(csvCell).join(',');
        const bodyLines = filteredRows.map((r, i) => [i + 1, selYm, r.name, r.mobile || '-', r.principal, r.monthlyInterest, r.paidThisMonth, r.pastDue, r.outstanding].map(csvCell).join(','));
        downloadCsvFile(`Hishob_${selYm}.csv`, [header, ...bodyLines]);
        showToast(`✅ ${selYm} ची Excel डाउनलोड झाली!`);
      });

    } else if (v3Tab === 'overview') {
      body.innerHTML = `
        <div class="v3-kpi-row">
          <div class="v3-wave-card" data-jump="daily-cash">
            <div class="v3-kpi-title">शिल्लक सक्रिय मुद्दल</div>
            <div class="v3-kpi-num">${fmt(d.remainingPrincipal)}</div>
            <div class="v3-kpi-sub ok">सक्रिय कर्जे: ${d.activeLoans} | बंद: ${d.closedLoans}</div>
            <svg class="wave" viewBox="0 0 200 44" preserveAspectRatio="none"><path d="M0,25 Q50,5 100,25 T200,20 L200,44 L0,44 Z" fill="#38bdf8"/></svg>
          </div>
          <div class="v3-wave-card" data-jump="daily-cash">
            <div class="v3-kpi-title">महिन्याची वसुली (${esc(fmtYmMarathi(d.activeYm))})</div>
            <div class="v3-kpi-num ok">${fmt(d.monthlyCollected)}</div>
            <div class="v3-kpi-sub">आज जमा: ${fmt(d.todayCollected)} | Target: ${pct}%</div>
            <svg class="wave" viewBox="0 0 200 44" preserveAspectRatio="none"><path d="M0,30 Q60,10 120,28 T200,15 L200,44 L0,44 Z" fill="#22c55e"/></svg>
          </div>
          <div class="v3-wave-card" data-jump="bulk-wa">
            <div class="v3-kpi-title">एकूण थकबाकी (Outstanding)</div>
            <div class="v3-kpi-num err">${fmt(d.totalOutstanding)}</div>
            <div class="v3-kpi-sub warn-text">Overdue: ${fmt(d.totalOverdue)}</div>
            <svg class="wave" viewBox="0 0 200 44" preserveAspectRatio="none"><path d="M0,20 Q50,38 110,18 T200,26 L200,44 L0,44 Z" fill="#f97316"/></svg>
          </div>
        </div>
        <div class="v3-layout-2">
          <div>
            <div class="v3-panel"><h4 style="margin:0 0 8px;">📈 Cash Flow Overview (मासिक वसुली)</h4>${buildSvgAreaChart(d.monthlySeries)}</div>
            <div class="v3-panel"><h4 style="margin:0 0 8px;">🍩 Customer Payment Status</h4>${buildSvgDonut(d.paidCnt, d.partialCnt, d.unpaidCnt)}</div>
          </div>
          <div>
            <div class="v3-panel">
              <h4 style="margin:0 0 8px;">🕒 Recent Payments</h4>
              ${d.recentPayments.slice(0, 6).map(p => `
                <div class="row" style="justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border); font-size:0.83rem;">
                  <div><strong>${esc(p.name)}</strong><div class="muted" style="font-size:0.74rem;">${esc(p.date)} • ${esc(p.note)}</div></div>
                  <strong class="ok">+${fmt(p.amount)}</strong>
                </div>
              `).join('') || '<div class="muted">अद्याप भरणा नोंद नाही.</div>'}
            </div>
          </div>
        </div>
      `;
      body.querySelectorAll('.v3-wave-card[data-jump]').forEach(c => c.addEventListener('click', () => switchV3Tab(c.getAttribute('data-jump'), true)));

    } else if (v3Tab === 'payments') {
      body.innerHTML = `
        <div class="v3-panel" style="max-width:560px; margin:0 auto;">
          <h3 style="margin-top:0;">⚡ Quick Add Payment (झटपट पेमेंट नोंद)</h3>
          <div style="display:flex; flex-direction:column; gap:10px;">
            <label class="muted">ग्राहक निवडा:</label>
            <select id="v3PayCustomer">
              <option value="">-- ग्राहक निवडा --</option>
              ${d.allActiveRows.map(r => `<option value="${r.id}">${esc(r.name)} (बाकी: ₹${r.outstanding})</option>`).join('')}
            </select>
            <div id="v3PayBalInfo" class="meta-box">ग्राहक निवडल्यावर मुद्दल, आधीची बाकी, बाकी महिने, जामीनदार आणि Call बटण दिसेल.</div>
            <input type="number" id="v3PayAmount" placeholder="जमा रक्कम (₹)" min="1" />
            <select id="v3PayMode">
              <option value="Cash">💵 रोख (Cash)</option>
              <option value="UPI">📱 UPI / GPay / PhonePe</option>
              <option value="Bank">🏦 बँक ट्रान्सफर</option>
            </select>
            <input type="text" id="v3PayNote" placeholder="टीप (पर्यायी)" />
            <button id="v3SaveQuickPayBtn" class="success">✅ पेमेंट सेव्ह करा</button>
          </div>
        </div>
      `;
      const sel = document.getElementById('v3PayCustomer'), amtInp = document.getElementById('v3PayAmount'), infoBox = document.getElementById('v3PayBalInfo');
      sel.addEventListener('change', () => {
        const bId = sel.value, row = d.allActiveRows.find(x => x.id === bId);
        if (!row) { infoBox.className = 'meta-box'; infoBox.innerHTML = 'ग्राहक निवडल्यावर संपूर्ण माहिती दिसेल.'; amtInp.value = ''; return; }
        const raw = row.raw || {}, cleanMob = String(row.mobile || '').replace(/\D/g, '');
        const guarantors = [raw.guarantor, raw.extraGuarantors].filter(Boolean).join(', ') || 'नोंद नाही';
        const pendMonths = getPendingMonthsList(raw, d.activeYm);
        infoBox.className = 'v3-pay-summary';
        infoBox.innerHTML = `
          <div class="row" style="justify-content:space-between; align-items:center;">
            <div><strong style="font-size:0.98rem;">${esc(row.name)}</strong><div class="muted" style="font-size:0.78rem;">📱 ${esc(row.mobile || 'नंबर नाही')}</div></div>
            ${cleanMob ? `<button type="button" id="v3QuickPayCallBtn" class="success sm">📞 Call</button>` : `<span class="muted" style="font-size:0.75rem;">नंबर नाही</span>`}
          </div>
          <div class="v3-pay-grid">
            <div class="v3-pay-cell"><div class="muted" style="font-size:0.74rem;">एकूण मुद्दल</div><strong>${fmt(row.principal)}</strong></div>
            <div class="v3-pay-cell"><div class="muted" style="font-size:0.74rem;">मासिक व्याज</div><strong style="color:#38bdf8;">${fmt(row.monthlyInterest)}</strong></div>
            <div class="v3-pay-cell"><div class="muted" style="font-size:0.74rem;">आधीची बाकी</div><strong class="warn-text">${fmt(row.pastDue)}</strong></div>
            <div class="v3-pay-cell"><div class="muted" style="font-size:0.74rem;">एकूण थकबाकी</div><strong class="err">${fmt(row.outstanding)}</strong></div>
          </div>
          <div>
            <div class="muted" style="font-size:0.75rem; margin-bottom:3px;">📅 बाकी असलेले महिने (${pendMonths.length}):</div>
            <div>${pendMonths.length ? pendMonths.map(pm => `<span class="v3-month-pill ${pm.isPartial ? 'partial' : ''}">${esc(pm.label)}${pm.isPartial ? ` (अर्धवट ₹${pm.partAmt})` : ''}</span>`).join('') : '<span class="ok" style="font-weight:600;">🟢 सर्व महिने पूर्ण जमा!</span>'}</div>
          </div>
          <div style="border-top:1px solid var(--border); padding-top:6px; font-size:0.82rem;">🤝 <span class="muted">जामीनदार:</span> <strong>${esc(guarantors)}</strong></div>
        `;
        document.getElementById('v3QuickPayCallBtn')?.addEventListener('click', () => { window.location.href = `tel:${cleanMob}`; });
        amtInp.value = row.monthlyInterest > 0 ? row.monthlyInterest : row.outstanding;
      });

      document.getElementById('v3SaveQuickPayBtn').addEventListener('click', async () => {
        if (isSavingPay) return;
        const bId = sel.value, amt = Number(amtInp.value || 0), mode = document.getElementById('v3PayMode').value, note = document.getElementById('v3PayNote').value.trim();
        const user = firebase.auth().currentUser;
        if (!user || !bId || amt <= 0) { showToast('कृपया ग्राहक आणि योग्य रक्कम टाका.', true); return; }
        isSavingPay = true;
        try {
          const b = d.allActiveRows.find(x => x.id === bId), nowIso = new Date().toISOString(), ym = d.activeYm;
          const prevPartial = Number((b.raw.partialPayments && b.raw.partialPayments[ym]) || 0), nextTotal = prevPartial + amt;
          const payload = {
            paymentHistory: firebase.firestore.FieldValue.arrayUnion({
              date: nowIso, ym, type: nextTotal >= b.monthlyInterest ? 'FULL_INTEREST' : 'PARTIAL_INTEREST',
              amount: amt, mode, note: note || `${ym} (${mode}) जमा`
            })
          };
          if (nextTotal >= b.monthlyInterest && b.monthlyInterest > 0) {
            payload[`paidMonths.${ym}`] = { paidAt: nowIso, amount: b.monthlyInterest };
            payload[`partialPayments.${ym}`] = firebase.firestore.FieldValue.delete();
          } else payload[`partialPayments.${ym}`] = nextTotal;
          await firebase.firestore().collection('users').doc(user.uid).collection('borrowers').doc(bId).update(payload);
          showToast(`✅ ${b.name} चे ₹${amt} (${mode}) जमा झाले!`);
          renderV3Body();
        } catch (err) { showToast(`एरर: ${err.message}`, true); }
        finally { isSavingPay = false; }
      });

    } else if (v3Tab === 'analytics') {
      body.innerHTML = `
        <div class="v3-panel"><h4 style="margin:0 0 8px;">📈 Monthly Collection Trend</h4>${buildSvgAreaChart(d.monthlySeries)}</div>
        <div class="v3-panel"><h4 style="margin:0 0 8px;">🍩 Payment Status Breakdown</h4>${buildSvgDonut(d.paidCnt, d.partialCnt, d.unpaidCnt)}</div>
        <div class="v3-kpi-row">
          <div class="v3-wave-card"><div class="v3-kpi-title">एकूण दिलेले मुद्दल</div><div class="v3-kpi-num">${fmt(d.totalPrincipal)}</div></div>
          <div class="v3-wave-card"><div class="v3-kpi-title">परत आलेले मुद्दल</div><div class="v3-kpi-num ok">${fmt(d.principalRecovered)}</div></div>
          <div class="v3-wave-card"><div class="v3-kpi-title">एकूण मिळालेले व्याज</div><div class="v3-kpi-num ok">${fmt(d.totalInterestReceived)}</div></div>
        </div>
      `;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNavigationChrome);
  else initNavigationChrome();
})();
