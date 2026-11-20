// =========================================================================
// Hishob Premium Fintech Dashboard V3 + Gmail-Style Hamburger Menu (☰)
// + Exact Month Ledger (Real Firestore Data Only, Past Due Included, Independent Excel)
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
    t._timer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // १. Premium CSS
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
      position: fixed; top: 0; left: 0; bottom: 0; width: 290px; max-width: 84vw;
      background: var(--card); border-right: 1px solid var(--border);
      z-index: 90; transform: translateX(-105%); transition: transform 0.26s cubic-bezier(.22,1,.36,1);
      display: flex; flex-direction: column; box-shadow: 10px 0 32px rgba(0,0,0,0.45);
    }
    .hm-drawer.open { transform: translateX(0); }
    .hm-head {
      padding: 14px; border-bottom: 1px solid var(--border);
      background: linear-gradient(135deg, rgba(99,102,241,0.18), rgba(14,165,233,0.12));
    }
    .hm-profile { display: flex; align-items: center; gap: 10px; }
    .hm-avatar {
      width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0;
      background: linear-gradient(135deg, #6366f1, #0ea5e9); color: #fff;
      display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.05rem;
      overflow: hidden;
    }
    .hm-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .hm-mini-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 10px; }
    .hm-mini-box { background: var(--card-2); border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; font-size: 0.74rem; }
    .hm-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 3px; }
    .hm-item {
      display: flex; align-items: center; justify-content: space-between; width: 100%;
      padding: 9px 11px; border-radius: 9px; border: 1px solid transparent;
      background: transparent; color: var(--text); font-size: 0.86rem; text-align: left; cursor: pointer;
    }
    .hm-item:hover, .hm-item.active { background: var(--card-2); border-color: var(--border); color: var(--accent); }
    .hm-item-left { display: flex; align-items: center; gap: 10px; }
    .hm-badge { background: var(--danger); color: #fff; font-size: 0.7rem; font-weight: 700; padding: 1px 6px; border-radius: 999px; }
    .hm-sub { padding-left: 24px; display: flex; flex-direction: column; gap: 3px; margin: 2px 0 6px; }
    .hm-div { height: 1px; background: var(--border); margin: 6px 4px; }
    .hm-foot { padding: 10px; border-top: 1px solid var(--border); display: flex; gap: 6px; }

    .td-wrap { position: relative; display: inline-block; }
    .td-btn { font-size: 1.15rem; padding: 4px 10px; line-height: 1; }
    .td-menu {
      position: fixed; right: 14px; top: 64px; min-width: 235px; z-index: 95;
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
    .v3-avatar-strip { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; }
    .v3-avatar-chip {
      min-width: 74px; text-align: center; background: var(--card-2); border: 1px solid var(--border);
      border-radius: 12px; padding: 8px 6px; font-size: 0.74rem; cursor: pointer;
    }
    .v3-avatar-circle {
      width: 34px; height: 34px; border-radius: 50%; margin: 0 auto 4px;
      background: linear-gradient(135deg, #6366f1, #ec4899); color: #fff;
      display: flex; align-items: center; justify-content: center; font-weight: 700;
    }
    .v3-loan-card {
      border: 1px solid var(--border); border-left: 5px solid #6366f1;
      border-radius: 12px; padding: 10px 12px; margin-top: 8px; background: var(--card-2);
    }
    .v3-loan-card.teal { border-left-color: #14b8a6; }
    .v3-loan-card.pink { border-left-color: #ec4899; }
    .v3-toast {
      position: fixed; left: 50%; bottom: 76px; transform: translateX(-50%) translateY(20px);
      padding: 10px 16px; border-radius: 999px; font-size: 0.84rem; font-weight: 600;
      z-index: 120; opacity: 0; pointer-events: none; transition: 0.25s; color: #fff;
    }
    .v3-toast.ok { background: #15803d; }
    .v3-toast.err { background: #b91c1c; }
    .v3-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  `;
  document.head.appendChild(styleEl);

  // २. Real Business Data Engine
  // ज्या महिन्यात कर्ज/व्यवहार सुरू झालेला नाही, त्या महिन्यात चुकीची एंट्री दिसू नये म्हणून काटेकोर तपासणी
  function isAccountActiveInMonth(borrower, targetYm) {
    if (borrower.isDeleted) return false;
    const startYm = String(borrower.startYm || '').slice(0, 7);
    const hasPayInMonth = (borrower.paymentHistory || []).some(p => String(p.date || '').slice(0, 7) === targetYm || p.ym === targetYm);
    const hasPrinChangeInMonth = [...(borrower.extraPrincipals || []), ...(borrower.principalReductions || [])]
      .some(x => String(x.date || '').slice(0, 7) === targetYm);

    if (startYm && startYm > targetYm && !hasPayInMonth && !hasPrinChangeInMonth) {
      return false;
    }
    if (borrower.accountStatus === 'closed') {
      const closedYm = String((borrower.settlement && borrower.settlement.date) || '').slice(0, 7);
      if (closedYm && closedYm < targetYm && !hasPayInMonth && !hasPrinChangeInMonth) {
        return false;
      }
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
    let totalInterestReceived = 0, totalOutstanding = 0, totalOverdue = 0;
    let paidCnt = 0, partialCnt = 0, unpaidCnt = 0;
    const monthlySeries = {}, recentPayments = [], dueCustomers = [], allActiveRows = [], monthLedgerRows = [];

    allBorrowers.forEach(b => {
      const c = br.computeLedgerUpToMonth(b, activeYm);
      const origP = Number(b.originalPrincipal || b.principal || 0);

      (b.principalReductions || []).forEach(r => { principalRecovered += Number(r.amount || 0); });
      (b.paymentHistory || []).forEach(p => {
        const amt = Number(p.amount || 0), dt = String(p.date || '').slice(0, 10), ym = dt.slice(0, 7);
        totalInterestReceived += amt;
        if (dt === todayIso) todayCollected += amt;
        if (ym === activeYm) monthlyCollected += amt;
        if (ym) monthlySeries[ym] = (monthlySeries[ym] || 0) + amt;
        recentPayments.push({ name: b.name, amount: amt, date: dt, note: p.note || p.type || 'जमा' });
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
          pastDue: c.pastDue, outstanding: c.totalPayable, status: c.status, lateDays: c.lateDays, raw: b
        };
        allActiveRows.push(row);
        if (c.totalPayable > 0) dueCustomers.push(row);
      }

      // निवडलेल्या महिन्यासाठी काटेकोर तपासणी (कोणताही व्यवहार/कर्ज नसल्यास एंट्री दिसणार नाही)
      if (isAccountActiveInMonth(b, activeYm)) {
        totalPrincipal += b.accountStatus === 'closed' ? 0 : c.principal;
        monthLedgerRows.push({
          id: b.id,
          name: b.name,
          mobile: b.mobile || '',
          principal: b.accountStatus === 'closed' ? 0 : c.principal,
          monthlyInterest: c.monthlyInterest,
          paidThisMonth: c.paidThisMonth,
          pastDue: c.pastDue,
          outstanding: c.totalPayable,
          status: c.status
        });
      }
    });

    recentPayments.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    dueCustomers.sort((a, b) => b.outstanding - a.outstanding);

    return {
      activeYm, todayIso, tomorrowIso, activeLoans, closedLoans, totalPrincipal, remainingPrincipal,
      principalRecovered, monthlyExpected, monthlyCollected, todayCollected, totalInterestReceived,
      totalOutstanding, totalOverdue, paidCnt, partialCnt, unpaidCnt,
      monthlySeries, recentPayments: recentPayments.slice(0, 12), dueCustomers, allActiveRows, monthLedgerRows
    };
  }

  // ३. Gmail-Style Three-Line Hamburger Menu (☰) + Drawer
  let isDrawerOpen = false;
  let touchStartX = 0;

  function setDrawerState(open) {
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
      avEl.innerHTML = user.photoURL
        ? `<img src="${esc(user.photoURL)}" alt="Admin" />`
        : esc(disp[0].toUpperCase());
    }
    const d = computeV3Data();
    if (d) {
      const todayEl = document.getElementById('hmMiniToday');
      const pendEl = document.getElementById('hmMiniPending');
      const dueBadge = document.getElementById('hmDueBadge');
      if (todayEl) todayEl.textContent = fmt(d.todayCollected);
      if (pendEl) pendEl.textContent = fmt(d.totalOutstanding);
      if (dueBadge) dueBadge.textContent = String(d.dueCustomers.length);
    }
  }

  function initHamburgerDrawer() {
    const brandEl = document.querySelector('header .brand');
    if (brandEl && !document.getElementById('hmMenuBtn')) {
      const hmBtn = document.createElement('button');
      hmBtn.id = 'hmMenuBtn';
      hmBtn.className = 'hm-btn';
      hmBtn.title = 'मेन्यू उघडा / बंद करा';
      hmBtn.textContent = '☰';
      brandEl.insertBefore(hmBtn, brandEl.firstChild);

      hmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setDrawerState(!isDrawerOpen);
      });
    }

    if (document.getElementById('hmDrawer')) return;

    const backdrop = document.createElement('div');
    backdrop.id = 'hmBackdrop';
    backdrop.className = 'hm-backdrop';
    document.body.appendChild(backdrop);

    const drawer = document.createElement('aside');
    drawer.id = 'hmDrawer';
    drawer.className = 'hm-drawer';
    drawer.innerHTML = `
      <div class="hm-head">
        <div class="hm-profile">
          <div id="hmAvatar" class="hm-avatar">H</div>
          <div style="overflow:hidden;">
            <div id="hmUserName" style="font-weight:700; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Hishob Admin</div>
            <div id="hmUserEmail" class="muted" style="font-size:0.75rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Secure Account</div>
          </div>
        </div>
        <div class="hm-mini-stats">
          <div class="hm-mini-box"><div class="muted">आजची वसुली</div><strong id="hmMiniToday" class="ok">₹0</strong></div>
          <div class="hm-mini-box"><div class="muted">एकूण बाकी</div><strong id="hmMiniPending" class="err">₹0</strong></div>
        </div>
      </div>

      <div class="hm-body">
        <button class="hm-item active" data-hm="home"><span class="hm-item-left"><span>🏠</span><span>मुख्य Dashboard</span></span></button>
        <button class="hm-item" data-hm="archive"><span class="hm-item-left"><span>📅</span><span>महिना निहाय हिशोब (Month Ledger)</span></span></button>
        <button class="hm-item" data-hm="v3-dash"><span class="hm-item-left"><span>🚀</span><span>Premium Dashboard V3</span></span></button>
        <button class="hm-item" data-hm="add-cust"><span class="hm-item-left"><span>➕</span><span>नवीन ग्राहक / कर्ज जोडा</span></span></button>
        <button class="hm-item" data-hm="quick-pay"><span class="hm-item-left"><span>⚡</span><span>Quick Add Payment</span></span></button>
        <button class="hm-item" data-hm="due-list">
          <span class="hm-item-left"><span>⏳</span><span>Pending / Overdue खाती</span></span>
          <span id="hmDueBadge" class="hm-badge">0</span>
        </button>
        <button class="hm-item" data-hm="analytics"><span class="hm-item-left"><span>📈</span><span>Analytics & Charts</span></span></button>
        <button class="hm-item" data-hm="goals"><span class="hm-item-left"><span>🎯</span><span>Goals & Targets</span></span></button>
        <button class="hm-item" data-hm="notifs"><span class="hm-item-left"><span>🔔</span><span>Notifications & वायदे</span></span></button>

        <div class="hm-div"></div>
        <button class="hm-item" id="hmReportsToggle"><span class="hm-item-left"><span>📑</span><span>Reports & Export</span></span><span>▾</span></button>
        <div id="hmReportsSub" class="hm-sub hidden">
          <button class="hm-item" data-hm="pnl"><span class="hm-item-left"><span>📈</span><span>Profit & Loss Report</span></span></button>
          <button class="hm-item" data-hm="pdf"><span class="hm-item-left"><span>🖨️</span><span>महिन्याचा PDF / Print</span></span></button>
          <button class="hm-item" data-hm="csv"><span class="hm-item-left"><span>📊</span><span>महिन्याची Excel CSV</span></span></button>
          <button class="hm-item" data-hm="all-csv"><span class="hm-item-left"><span>📋</span><span>संपूर्ण खात्यांची CSV</span></span></button>
        </div>

        <button class="hm-item" data-hm="backup"><span class="hm-item-left"><span>☁️</span><span>Cloud Backup सेव्ह</span></span></button>
        <button class="hm-item" data-hm="security"><span class="hm-item-left"><span>🛡️</span><span>Security Dashboard</span></span></button>

        <div class="hm-div"></div>
        <button class="hm-item" data-hm="hide-amt"><span class="hm-item-left"><span>👁️</span><span>रकमा Hide / Show</span></span></button>
        <button class="hm-item" data-hm="theme"><span class="hm-item-left"><span>☀️</span><span>Dark / Light Theme</span></span></button>
        <button class="hm-item" data-hm="reset-pass"><span class="hm-item-left"><span>🔑</span><span>Password Reset Email</span></span></button>
        <button class="hm-item" data-hm="about"><span class="hm-item-left"><span>ℹ️</span><span>About Hishob App</span></span></button>
      </div>

      <div class="hm-foot">
        <button class="danger sm" data-hm="logout" style="width:100%;">🔒 लॉक / लॉगआउट</button>
      </div>
    `;
    document.body.appendChild(drawer);

    backdrop.addEventListener('click', () => setDrawerState(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isDrawerOpen) setDrawerState(false); });

    drawer.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    drawer.addEventListener('touchend', (e) => {
      if (touchStartX - e.changedTouches[0].clientX > 55) setDrawerState(false);
    }, { passive: true });

    document.getElementById('hmReportsToggle').addEventListener('click', () => {
      document.getElementById('hmReportsSub').classList.toggle('hidden');
    });

    drawer.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-hm]');
      if (!btn) return;
      const act = btn.getAttribute('data-hm');
      setDrawerState(false);

      if (act === 'home') { document.getElementById('v3Overlay')?.classList.add('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      else if (act === 'archive') openV3Dashboard('archive');
      else if (act === 'v3-dash') openV3Dashboard('overview');
      else if (act === 'add-cust') {
        document.getElementById('v3Overlay')?.classList.add('hidden');
        document.getElementById('addBorrowerSection')?.scrollIntoView({ behavior: 'smooth' });
      }
      else if (act === 'quick-pay') openV3Dashboard('payments');
      else if (act === 'due-list') openV3Dashboard('customers');
      else if (act === 'analytics') openV3Dashboard('analytics');
      else if (act === 'goals') openV3Dashboard('goals');
      else if (act === 'notifs') document.getElementById('notifBellBtn')?.click();
      else if (act === 'pnl') document.getElementById('openPnlBtn')?.click();
      else if (act === 'pdf') document.getElementById('printMonthlyPdfBtn')?.click();
      else if (act === 'csv') document.getElementById('exportMonthlyCsvBtn')?.click();
      else if (act === 'all-csv') document.getElementById('exportAllCsvBtn')?.click();
      else if (act === 'backup') document.getElementById('saveCloudBackupBtn')?.click();
      else if (act === 'security') document.getElementById('openSecurityDashBtn')?.click();
      else if (act === 'hide-amt') document.getElementById('toggleHideAmtBtn')?.click();
      else if (act === 'theme') document.getElementById('toggleThemeBtn')?.click();
      else if (act === 'reset-pass') {
        const u = firebase.auth().currentUser;
        if (!u || !u.email) { showToast('ईमेल सापडला नाही.', true); return; }
        try { await firebase.auth().sendPasswordResetEmail(u.email); showToast(`✅ ${u.email} वर Password Reset लिंक पाठवली.`); }
        catch (err) { showToast(`एरर: ${err.message}`, true); }
      }
      else if (act === 'about') showToast('व्याज हिशोब वही V13.1 — Secure Loan Ledger');
      else if (act === 'logout') document.getElementById('lockBtn')?.click();
    });
  }

  // ४. Three-Dot (⋮) Menu + Mobile Bottom Navigation + Floating `+` Button
  function initNavigationChrome() {
    initHamburgerDrawer();

    const slot = document.getElementById('threeDotMenuSlot');
    if (slot && !slot.dataset.ready) {
      slot.dataset.ready = '1';
      slot.innerHTML = `
        <div class="td-wrap">
          <button id="threeDotBtn" class="sm td-btn" title="अधिक पर्याय (Menu)">⋮</button>
          <div id="threeDotDropdown" class="td-menu hidden">
            <button data-td="archive">📅 महिना निहाय हिशोब</button>
            <button data-td="v3-dash">🚀 Premium Dashboard V3</button>
            <button data-td="v3-pay">⚡ Quick Add Payment</button>
            <button data-td="pnl">📈 Profit & Loss Report</button>
            <button data-td="security">🛡️ Security Dashboard</button>
            <div class="td-divider"></div>
            <button data-td="pdf">🖨️ महिन्याचा PDF / Print</button>
            <button data-td="csv">📊 महिन्याची Excel CSV</button>
            <button data-td="cloud-bkp">☁️ Cloud Backup सेव्ह</button>
            <div class="td-divider"></div>
            <button data-td="hide-amt">👁️ रकमा Hide / Show</button>
            <button data-td="theme">☀️ Dark / Light Mode</button>
            <button data-td="logout" style="color:var(--danger);">🔒 लॉक / लॉगआउट</button>
          </div>
        </div>
      `;
      const btn = document.getElementById('threeDotBtn');
      const menu = document.getElementById('threeDotDropdown');
      btn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); });
      document.addEventListener('click', () => menu.classList.add('hidden'));
      menu.addEventListener('click', (e) => {
        const item = e.target.closest('button[data-td]'); if (!item) return;
        menu.classList.add('hidden');
        const act = item.getAttribute('data-td');
        if (act === 'archive') openV3Dashboard('archive');
        else if (act === 'v3-dash') openV3Dashboard('overview');
        else if (act === 'v3-pay') openV3Dashboard('payments');
        else if (act === 'pnl') document.getElementById('openPnlBtn')?.click();
        else if (act === 'security') document.getElementById('openSecurityDashBtn')?.click();
        else if (act === 'pdf') document.getElementById('printMonthlyPdfBtn')?.click();
        else if (act === 'csv') document.getElementById('exportMonthlyCsvBtn')?.click();
        else if (act === 'cloud-bkp') document.getElementById('saveCloudBackupBtn')?.click();
        else if (act === 'hide-amt') document.getElementById('toggleHideAmtBtn')?.click();
        else if (act === 'theme') document.getElementById('toggleThemeBtn')?.click();
        else if (act === 'logout') document.getElementById('lockBtn')?.click();
      });
    }

    if (!document.getElementById('v3BottomNav')) {
      const nav = document.createElement('nav');
      nav.id = 'v3BottomNav';
      nav.className = 'v3-bottom-nav';
      nav.innerHTML = `
        <button data-bnav="home" class="active"><span>🏠</span><span>Home</span></button>
        <button data-bnav="archive"><span>📅</span><span>Months</span></button>
        <button data-bnav="v3"><span>🚀</span><span>V3 Dash</span></button>
        <button data-bnav="pay"><span>⚡</span><span>Pay</span></button>
        <button data-bnav="drawer"><span>☰</span><span>Menu</span></button>
      `;
      document.body.appendChild(nav);

      const fab = document.createElement('button');
      fab.id = 'v3FabBtn';
      fab.className = 'v3-fab';
      fab.title = 'झटपट पेमेंट';
      fab.textContent = '+';
      document.body.appendChild(fab);

      fab.addEventListener('click', () => openV3Dashboard('payments'));
      nav.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-bnav]'); if (!b) return;
        const t = b.getAttribute('data-bnav');
        if (t === 'home') { document.getElementById('v3Overlay')?.classList.add('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else if (t === 'archive') openV3Dashboard('archive');
        else if (t === 'v3') openV3Dashboard('overview');
        else if (t === 'pay') openV3Dashboard('payments');
        else if (t === 'drawer') setDrawerState(true);
      });
    }
  }

  // ५. Premium V3 Fullscreen Dashboard Shell
  let v3Tab = 'overview';
  let v3Gradient = localStorage.getItem('hishob_v3_grad') !== '0';
  let isSavingPay = false;
  let archiveSelectedYear = getTodayIso().slice(0, 4);
  let archiveSelectedMonth = getTodayIso().slice(5, 7);

  function ensureV3Overlay() {
    if (document.getElementById('v3Overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'v3Overlay';
    ov.className = `v3-overlay hidden ${v3Gradient ? 'v3-gradient-theme' : ''}`;
    ov.innerHTML = `
      <aside id="v3Sidebar" class="v3-sidebar">
        <div class="row" style="justify-content:space-between; padding:4px 6px 10px;">
          <strong class="v3-nav-lbl" style="font-size:1.05rem;">💎 Hishob V3</strong>
          <button id="v3ToggleSideBtn" class="sm" title="Sidebar लहान/मोठा">☰</button>
        </div>
        <button class="v3-nav-item active" data-v3tab="overview"><span>📊</span><span class="v3-nav-lbl">Dashboard</span></button>
        <button class="v3-nav-item" data-v3tab="archive"><span>📅</span><span class="v3-nav-lbl">महिना निहाय हिशोब</span></button>
        <button class="v3-nav-item" data-v3tab="payments"><span>⚡</span><span class="v3-nav-lbl">Quick Payment</span></button>
        <button class="v3-nav-item" data-v3tab="customers"><span>👥</span><span class="v3-nav-lbl">Due Customers</span></button>
        <button class="v3-nav-item" data-v3tab="analytics"><span>📈</span><span class="v3-nav-lbl">Analytics & Charts</span></button>
        <button class="v3-nav-item" data-v3tab="goals"><span>🎯</span><span class="v3-nav-lbl">Goals & Targets</span></button>
        <div style="margin-top:auto; padding-top:10px; border-top:1px solid var(--border);">
          <button id="v3GradThemeBtn" class="v3-nav-item"><span>🎨</span><span class="v3-nav-lbl">Gradient Theme</span></button>
          <button id="v3CloseBtn" class="v3-nav-item" style="color:var(--danger);"><span>⬅️</span><span class="v3-nav-lbl">मुख्य अ‍ॅपवर जा</span></button>
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
            <button id="v3MobChartsBtn" class="sm">📈 Charts</button>
            <button id="v3TopRefreshBtn" class="sm">🔄</button>
            <button id="v3TopCloseBtn" class="danger sm">✕ बंद करा</button>
          </div>
        </div>
        <div id="v3Body"></div>
      </section>
    `;
    document.body.appendChild(ov);

    document.getElementById('v3ToggleSideBtn').addEventListener('click', () => document.getElementById('v3Sidebar').classList.toggle('collapsed'));
    document.getElementById('v3CloseBtn').addEventListener('click', () => ov.classList.add('hidden'));
    document.getElementById('v3TopCloseBtn').addEventListener('click', () => ov.classList.add('hidden'));
    document.getElementById('v3TopRefreshBtn').addEventListener('click', () => { renderV3Body(); showToast('Dashboard रिफ्रेश झाले!'); });
    document.getElementById('v3GradThemeBtn').addEventListener('click', () => {
      v3Gradient = !v3Gradient; localStorage.setItem('hishob_v3_grad', v3Gradient ? '1' : '0');
      ov.classList.toggle('v3-gradient-theme', v3Gradient);
    });
    document.getElementById('v3MobOverviewBtn').addEventListener('click', () => switchV3Tab('overview'));
    document.getElementById('v3MobArchiveBtn').addEventListener('click', () => switchV3Tab('archive'));
    document.getElementById('v3MobPayBtn').addEventListener('click', () => switchV3Tab('payments'));
    document.getElementById('v3MobChartsBtn').addEventListener('click', () => switchV3Tab('analytics'));
    document.getElementById('v3Sidebar').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-v3tab]'); if (!btn) return;
      switchV3Tab(btn.getAttribute('data-v3tab'));
    });
  }

  function switchV3Tab(tab) {
    v3Tab = tab;
    document.querySelectorAll('#v3Sidebar .v3-nav-item[data-v3tab]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-v3tab') === tab);
    });
    renderV3Body();
  }

  function openV3Dashboard(tab = 'overview') {
    ensureV3Overlay();
    const curYm = document.getElementById('activeYm')?.value || getTodayIso().slice(0, 7);
    archiveSelectedYear = curYm.slice(0, 4);
    archiveSelectedMonth = curYm.slice(5, 7);
    document.getElementById('v3Overlay').classList.remove('hidden');
    switchV3Tab(tab);
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

    if (v3Tab === 'archive') {
      const selYm = `${archiveSelectedYear}-${archiveSelectedMonth}`;
      const mData = computeV3Data(selYm) || d;
      const rows = mData.monthLedgerRows || [];
      const mPrincipal = rows.reduce((s, r) => s + r.principal, 0);
      const mExpected = rows.reduce((s, r) => s + r.monthlyInterest, 0);
      const mPaid = rows.reduce((s, r) => s + r.paidThisMonth, 0);
      const mPastDue = rows.reduce((s, r) => s + r.pastDue, 0);
      const mTotalOut = rows.reduce((s, r) => s + r.outstanding, 0);
      const years = ['2024', '2025', '2026', '2027', '2028', '2029', '2030'];

      body.innerHTML = `
        <div class="v3-panel">
          <div class="row" style="justify-content:space-between; margin-bottom:10px;">
            <h3 style="margin:0;">📅 ${esc(fmtYmMarathi(selYm))} — खरा हिशोब</h3>
            <button id="v3ApplyMainYmBtn" class="primary sm">📂 मुख्य स्क्रीनवर हा महिना सेट करा</button>
          </div>

          <div class="row" style="margin-bottom:12px;">
            <div style="flex:1; min-width:130px;">
              <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:4px;">वर्ष निवडा (Year):</label>
              <select id="v3ArchYearSel" style="width:100%;">
                ${years.map(y => `<option value="${y}" ${y === archiveSelectedYear ? 'selected' : ''}>${y}</option>`).join('')}
              </select>
            </div>
            <div style="flex:1.4; min-width:160px;">
              <label class="muted" style="font-size:0.75rem; display:block; margin-bottom:4px;">महिना निवडा (Month):</label>
              <select id="v3ArchMonthSel" style="width:100%;">
                ${MARATHI_MONTHS.map((mName, idx) => {
                  const mm = String(idx + 1).padStart(2, '0');
                  return `<option value="${mm}" ${mm === archiveSelectedMonth ? 'selected' : ''}>${mName} (${mm})</option>`;
                }).join('')}
              </select>
            </div>
          </div>

          <div class="v3-kpi-row">
            <div class="v3-wave-card">
              <div class="v3-kpi-title">या महिन्यातील खाती / मुद्दल</div>
              <div class="v3-kpi-num">${rows.length} खाती</div>
              <div class="v3-kpi-sub">मुद्दल: ${fmt(mPrincipal)}</div>
            </div>
            <div class="v3-wave-card">
              <div class="v3-kpi-title">महिन्याचे व्याज / जमा</div>
              <div class="v3-kpi-num" style="color:#38bdf8;">${fmt(mExpected)}</div>
              <div class="v3-kpi-sub ok">जमा: ${fmt(mPaid)}</div>
            </div>
            <div class="v3-wave-card">
              <div class="v3-kpi-title">मागील व्याज बाकी + एकूण बाकी</div>
              <div class="v3-kpi-num err">${fmt(mTotalOut)}</div>
              <div class="v3-kpi-sub warn-text">मागील व्याज बाकी: ${fmt(mPastDue)}</div>
            </div>
          </div>

          <h4 style="margin:10px 0 6px;">📋 ${esc(fmtYmMarathi(selYm))} मधील नोंदी (${rows.length})</h4>
          <div style="overflow-x:auto;">
            <table class="passbook-table">
              <thead>
                <tr>
                  <th>क्र.</th>
                  <th>ग्राहक</th>
                  <th>मुद्दल</th>
                  <th>मासिक व्याज</th>
                  <th>जमा</th>
                  <th>मागील बाकी</th>
                  <th>एकूण बाकी</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length ? rows.map((r, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td><strong>${esc(r.name)}</strong></td>
                    <td>${fmt(r.principal)}</td>
                    <td>${fmt(r.monthlyInterest)}</td>
                    <td class="ok">${fmt(r.paidThisMonth)}</td>
                    <td class="warn-text">${fmt(r.pastDue)}</td>
                    <td class="err"><strong>${fmt(r.outstanding)}</strong></td>
                  </tr>
                `).join('') : '<tr><td colspan="7" class="muted" style="text-align:center;">या महिन्यात कोणताही हिशोब किंवा व्यवहार नोंदवलेला नाही.</td></tr>'}
              </tbody>
            </table>
          </div>

          <div style="margin-top:14px;">
            <button id="v3DownloadIndepExcelBtn" class="success" style="width:100%;">📊 ${esc(fmtYmMarathi(selYm))} (${esc(selYm)}) ची स्वतंत्र Excel डाउनलोड करा</button>
          </div>
        </div>
      `;

      document.getElementById('v3ArchYearSel')?.addEventListener('change', (e) => {
        archiveSelectedYear = e.target.value;
        renderV3Body();
      });
      document.getElementById('v3ArchMonthSel')?.addEventListener('change', (e) => {
        archiveSelectedMonth = e.target.value;
        renderV3Body();
      });

      document.getElementById('v3ApplyMainYmBtn')?.addEventListener('click', () => {
        const mainYmInp = document.getElementById('activeYm');
        if (mainYmInp) {
          mainYmInp.value = selYm;
          mainYmInp.dispatchEvent(new Event('change'));
        }
        document.getElementById('v3Overlay')?.classList.add('hidden');
        showToast(`📅 मुख्य स्क्रीनवर ${fmtYmMarathi(selYm)} सेट केले!`);
      });

      document.getElementById('v3DownloadIndepExcelBtn')?.addEventListener('click', () => {
        const header = ['क्र.', 'महिना', 'ग्राहक नाव', 'मोबाईल', 'मुद्दल (₹)', 'मासिक व्याज (₹)', 'जमा रक्कम (₹)', 'मागील व्याज बाकी (₹)', 'एकूण बाकी (₹)'].map(csvCell).join(',');
        const bodyLines = rows.map((r, i) => [
          i + 1, selYm, r.name, r.mobile || '-', r.principal, r.monthlyInterest, r.paidThisMonth, r.pastDue, r.outstanding
        ].map(csvCell).join(','));
        downloadCsvFile(`Hishob_${selYm}.csv`, [header, ...bodyLines]);
        showToast(`✅ ${selYm} ची स्वतंत्र Excel फाईल डाउनलोड झाली!`);
      });

    } else if (v3Tab === 'overview') {
      body.innerHTML = `
        <div class="v3-kpi-row">
          <div class="v3-wave-card" data-jump="customers">
            <div class="v3-kpi-title">शिल्लक सक्रिय मुद्दल</div>
            <div class="v3-kpi-num">${fmt(d.remainingPrincipal)}</div>
            <div class="v3-kpi-sub ok">सक्रिय कर्जे: ${d.activeLoans} | बंद: ${d.closedLoans}</div>
            <svg class="wave" viewBox="0 0 200 44" preserveAspectRatio="none"><path d="M0,25 Q50,5 100,25 T200,20 L200,44 L0,44 Z" fill="#38bdf8"/></svg>
          </div>
          <div class="v3-wave-card" data-jump="analytics">
            <div class="v3-kpi-title">महिन्याची वसुली (${esc(fmtYmMarathi(d.activeYm))})</div>
            <div class="v3-kpi-num ok">${fmt(d.monthlyCollected)}</div>
            <div class="v3-kpi-sub">आज जमा: ${fmt(d.todayCollected)} | Target: ${pct}%</div>
            <svg class="wave" viewBox="0 0 200 44" preserveAspectRatio="none"><path d="M0,30 Q60,10 120,28 T200,15 L200,44 L0,44 Z" fill="#22c55e"/></svg>
          </div>
          <div class="v3-wave-card" data-jump="customers">
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
              <h4 style="margin:0 0 8px;">📞 Top Due Contacts (१-क्लिक संपर्क)</h4>
              <div class="v3-avatar-strip">
                ${d.dueCustomers.slice(0, 8).map(c => `
                  <div class="v3-avatar-chip" data-callmob="${esc(c.mobile.replace(/\D/g, ''))}">
                    <div class="v3-avatar-circle">${esc(String(c.name || '?')[0].toUpperCase())}</div>
                    <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(c.name)}</div>
                    <div class="err" style="font-weight:700;">${fmt(c.outstanding)}</div>
                  </div>
                `).join('') || '<div class="muted">कोणतीही बाकी नाही!</div>'}
              </div>
            </div>
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
      body.querySelectorAll('.v3-wave-card[data-jump]').forEach(c => c.addEventListener('click', () => switchV3Tab(c.getAttribute('data-jump'))));
      body.querySelectorAll('.v3-avatar-chip[data-callmob]').forEach(c => c.addEventListener('click', () => {
        const m = c.getAttribute('data-callmob');
        if (m) window.location.href = `tel:${m}`; else showToast('मोबाईल नंबर सेव्ह नाही.', true);
      }));

    } else if (v3Tab === 'payments') {
      body.innerHTML = `
        <div class="v3-panel" style="max-width:560px; margin:0 auto;">
          <h3 style="margin-top:0;">⚡ Quick Add Payment (झटपट पेमेंट नोंद)</h3>
          <div style="display:flex; flex-direction:column; gap:10px;">
            <label class="muted">ग्राहक निवडा:</label>
            <select id="v3PayCustomer">
              <option value="">-- ग्राहक निवडा --</option>
              ${d.allActiveRows.map(r => `<option value="${r.id}" data-out="${r.outstanding}" data-int="${r.monthlyInterest}">${esc(r.name)} (बाकी: ₹${r.outstanding})</option>`).join('')}
            </select>
            <div id="v3PayBalInfo" class="meta-box">ग्राहक निवडल्यावर थकबाकी दिसेल.</div>
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
      const sel = document.getElementById('v3PayCustomer'), amtInp = document.getElementById('v3PayAmount');
      sel.addEventListener('change', () => {
        const opt = sel.options[sel.selectedIndex]; if (!opt || !opt.value) return;
        const out = Number(opt.getAttribute('data-out') || 0), mi = Number(opt.getAttribute('data-int') || 0);
        document.getElementById('v3PayBalInfo').innerHTML = `मासिक व्याज: <strong>${fmt(mi)}</strong> | एकूण थकबाकी: <strong class="err">${fmt(out)}</strong>`;
        amtInp.value = mi > 0 ? mi : out;
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

    } else if (v3Tab === 'customers') {
      const colors = ['', 'teal', 'pink'];
      body.innerHTML = `
        <h3 style="margin-top:0;">👥 बाकी असलेली ग्राहक खाती (${d.dueCustomers.length})</h3>
        ${d.dueCustomers.map((c, idx) => `
          <div class="v3-loan-card ${colors[idx % 3]}">
            <div class="row" style="justify-content:space-between;">
              <div><strong>${esc(c.name)}</strong> <span class="muted">(${esc(c.mobile || '-')})</span></div>
              <div class="row">
                ${c.mobile ? `<button data-v3call="${esc(c.mobile.replace(/\D/g, ''))}" class="success sm">📞 Call</button>` : ''}
                ${c.mobile ? `<button data-v3wa="${esc(c.mobile.replace(/\D/g, ''))}" data-v3name="${esc(c.name)}" data-v3amt="${c.outstanding}" class="primary sm">💬 WhatsApp</button>` : ''}
              </div>
            </div>
            <div style="font-size:0.84rem; margin-top:4px;">मुद्दल: <strong>${fmt(c.principal)}</strong> | मासिक व्याज: ${fmt(c.monthlyInterest)} | एकूण बाकी: <strong class="err">${fmt(c.outstanding)}</strong></div>
          </div>
        `).join('') || '<p class="muted">सर्व खात्यांचे व्याज जमा आहे!</p>'}
      `;
      body.querySelectorAll('button[data-v3call]').forEach(b => b.addEventListener('click', () => { window.location.href = `tel:${b.getAttribute('data-v3call')}`; }));
      body.querySelectorAll('button[data-v3wa]').forEach(b => b.addEventListener('click', () => {
        const m = b.getAttribute('data-v3wa'), target = m.length === 10 ? `91${m}` : m;
        window.open(`https://wa.me/${target}?text=${encodeURIComponent(`नमस्कार ${b.getAttribute('data-v3name')}, आपली ₹${b.getAttribute('data-v3amt')} व्याज/बाकी रक्कम देय आहे. कृपया लवकर जमा करावी.`)}`, '_blank', 'noopener,noreferrer');
      }));

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

    } else if (v3Tab === 'goals') {
      const rem = Math.max(0, target - d.monthlyCollected);
      body.innerHTML = `
        <div class="v3-panel" style="max-width:560px; margin:0 auto;">
          <h3 style="margin-top:0;">🎯 Monthly Collection Goal (${esc(fmtYmMarathi(d.activeYm))})</h3>
          <div class="row" style="margin-bottom:12px;">
            <input type="number" id="v3GoalInput" value="${target}" style="flex:1;" />
            <button id="v3SaveGoalBtn" class="primary sm">Target सेव्ह करा</button>
          </div>
          <div style="font-size:1.1rem; font-weight:700; margin-bottom:6px;">पूर्ण: ${pct}% (${fmt(d.monthlyCollected)} / ${fmt(target)})</div>
          <div style="height:14px; background:var(--bg); border-radius:999px; overflow:hidden; border:1px solid var(--border);">
            <div style="height:100%; width:${pct}%; background:linear-gradient(90deg,#6366f1,#22c55e);"></div>
          </div>
          <div class="muted" style="margin-top:8px;">उरलेले लक्ष्य: <strong>${fmt(rem)}</strong></div>
        </div>
      `;
      document.getElementById('v3SaveGoalBtn').addEventListener('click', () => {
        localStorage.setItem('hishob_monthly_target', String(Number(document.getElementById('v3GoalInput').value || 0)));
        showToast('🎯 Monthly Target सेव्ह झाले!');
        renderV3Body();
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNavigationChrome);
  else initNavigationChrome();
})();
