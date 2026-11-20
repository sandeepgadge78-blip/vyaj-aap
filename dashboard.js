// =========================================================================
// Hishob Premium Fintech Dashboard V3 + Mobile Bottom Bar + 3-Dot Menu
// जुन्या V12.8 कोडला व डेटाला धक्का न लावता 100% Real Firestore Data वर आधारित
// =========================================================================

(function () {
  function esc(str) {
    return String(str === undefined || str === null ? '' : str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function getBridge() { return window.HishobBridge || null; }
  function fmt(val) { const br = getBridge(); return br ? br.fmtAmt(val) : `₹${Number(val || 0)}`; }
  function getTodayIso(offset = 0) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Toast Notification (जुन्या alert ऐवजी स्वच्छ पॉपअप)
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

  // १. Premium V3 CSS (Desktop Sidebar + Mobile Bottom Nav + Wave Cards + Gradient Theme)
  const styleEl = document.createElement('style');
  styleEl.textContent = `
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

    /* Mobile Bottom Navigation Bar & Floating + Button */
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

    /* Fullscreen Premium V3 Dashboard Shell */
    .v3-overlay {
      position: fixed; inset: 0; z-index: 70; background: var(--bg);
      display: flex; overflow: hidden;
    }
    .v3-overlay.v3-gradient-theme {
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #0f172a 100%);
    }
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

    /* Wave KPI Cards (Image 1 Inspiration) */
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

    /* Two-column Premium Layout (Image 1 & 3) */
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

  // २. Real Business Data Analytics Engine
  function computeV3Data() {
    const br = getBridge();
    if (!br) return null;
    const borrowers = (br.getBorrowers() || []).filter(b => !b.isDeleted);
    const activeYm = document.getElementById('activeYm')?.value || getTodayIso().slice(0, 7);
    const todayIso = getTodayIso(0), tomorrowIso = getTodayIso(1);

    let activeLoans = 0, closedLoans = 0, totalPrincipal = 0, remainingPrincipal = 0;
    let principalRecovered = 0, monthlyExpected = 0, monthlyCollected = 0, todayCollected = 0;
    let totalInterestReceived = 0, totalOutstanding = 0, totalOverdue = 0;
    let paidCnt = 0, partialCnt = 0, unpaidCnt = 0;
    const monthlySeries = {}, recentPayments = [], dueCustomers = [], allActiveRows = [];

    borrowers.forEach(b => {
      const c = br.computeLedgerUpToMonth(b, activeYm);
      const origP = Number(b.originalPrincipal || b.principal || 0);
      totalPrincipal += origP;

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

        const row = { id: b.id, name: b.name, mobile: b.mobile || '', principal: c.principal, monthlyInterest: c.monthlyInterest, outstanding: c.totalPayable, status: c.status, lateDays: c.lateDays, raw: b };
        allActiveRows.push(row);
        if (c.totalPayable > 0) dueCustomers.push(row);
      }
    });

    recentPayments.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    dueCustomers.sort((a, b) => b.outstanding - a.outstanding);

    return {
      activeYm, todayIso, tomorrowIso, activeLoans, closedLoans, totalPrincipal, remainingPrincipal,
      principalRecovered, monthlyExpected, monthlyCollected, todayCollected, totalInterestReceived,
      totalOutstanding, totalOverdue, paidCnt, partialCnt, unpaidCnt,
      monthlySeries, recentPayments: recentPayments.slice(0, 12), dueCustomers, allActiveRows
    };
  }

  // ३. Three-Dot (⋮) Menu + Mobile Bottom Navigation + Floating `+` Button
  function initNavigationChrome() {
    const slot = document.getElementById('threeDotMenuSlot');
    if (slot && !slot.dataset.ready) {
      slot.dataset.ready = '1';
      slot.innerHTML = `
        <div class="td-wrap">
          <button id="threeDotBtn" class="sm td-btn" title="अधिक पर्याय (Menu)">⋮</button>
          <div id="threeDotDropdown" class="td-menu hidden">
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
        if (act === 'v3-dash') openV3Dashboard('overview');
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

    // Mobile Bottom Navigation Bar (फक्त लॉगिन झाल्यावर दिसेल)
    if (!document.getElementById('v3BottomNav')) {
      const nav = document.createElement('nav');
      nav.id = 'v3BottomNav';
      nav.className = 'v3-bottom-nav';
      nav.innerHTML = `
        <button data-bnav="home" class="active"><span>🏠</span><span>Home</span></button>
        <button data-bnav="v3"><span>🚀</span><span>V3 Dash</span></button>
        <button data-bnav="pay"><span>⚡</span><span>Pay</span></button>
        <button data-bnav="analytics"><span>📊</span><span>Charts</span></button>
        <button data-bnav="menu"><span>⋮</span><span>Menu</span></button>
      `;
      document.body.appendChild(nav);

      const fab = document.createElement('button');
      fab.id = 'v3FabBtn';
      fab.className = 'v3-fab';
      fab.title = 'नवीन ग्राहक / झटपट पेमेंट';
      fab.textContent = '+';
      document.body.appendChild(fab);

      fab.addEventListener('click', () => openV3Dashboard('payments'));
      nav.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-bnav]'); if (!b) return;
        const t = b.getAttribute('data-bnav');
        if (t === 'home') { document.getElementById('v3Overlay')?.classList.add('hidden'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else if (t === 'v3') openV3Dashboard('overview');
        else if (t === 'pay') openV3Dashboard('payments');
        else if (t === 'analytics') openV3Dashboard('analytics');
        else if (t === 'menu') { document.getElementById('threeDotBtn')?.click(); }
      });
    }
  }

  // ४. Premium V3 Fullscreen Dashboard Shell
  let v3Tab = 'overview';
  let v3Gradient = localStorage.getItem('hishob_v3_grad') !== '0';
  let isSavingPay = false;

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
      v3Gradient = !v3Gradient;
      localStorage.setItem('hishob_v3_grad', v3Gradient ? '1' : '0');
      ov.classList.toggle('v3-gradient-theme', v3Gradient);
    });

    document.getElementById('v3MobOverviewBtn').addEventListener('click', () => switchV3Tab('overview'));
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
    document.getElementById('v3Overlay').classList.remove('hidden');
    switchV3Tab(tab);
  }

  // ५. Pure SVG Area Chart व Donut Chart जनरेटर (कोणतीही बाह्य लायब्ररी नाही)
  function buildSvgAreaChart(monthlySeries) {
    const keys = Object.keys(monthlySeries).sort().slice(-6);
    if (!keys.length) return '<div class="muted">अद्याप मासिक भरणा नोंदी नाहीत.</div>';
    const vals = keys.map(k => monthlySeries[k]);
    const maxV = Math.max(1, ...vals);
    const w = 420, h = 130, pad = 20;
    const pts = vals.map((v, i) => {
      const x = pad + (i * (w - pad * 2)) / Math.max(1, vals.length - 1);
      const y = h - pad - ((v / maxV) * (h - pad * 2));
      return { x: Math.round(x), y: Math.round(y), k: keys[i], v };
    });
    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const areaPath = `${linePath} L${pts[pts.length - 1].x},${h - pad} L${pts[0].x},${h - pad} Z`;

    return `
      <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:150px;">
        <defs><linearGradient id="v3AreaG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#38bdf8" stop-opacity="0.45"/><stop offset="100%" stop-color="#38bdf8" stop-opacity="0.02"/></linearGradient></defs>
        <path d="${areaPath}" fill="url(#v3AreaG)" />
        <path d="${linePath}" fill="none" stroke="#38bdf8" stroke-width="2.5" />
        ${pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#22c55e"><title>${esc(p.k)}: ₹${p.v}</title></circle>`).join('')}
      </svg>
      <div class="row" style="justify-content:space-between; font-size:0.75rem;" class="muted">
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

  // ६. V3 Dashboard Body Render
  function renderV3Body() {
    const body = document.getElementById('v3Body');
    const clock = document.getElementById('v3DateClock');
    if (clock) clock.textContent = new Date().toLocaleString('mr-IN', { dateStyle: 'medium', timeStyle: 'short' });

    const d = computeV3Data();
    if (!d) { body.innerHTML = '<p class="muted">डेटा लोड होत आहे...</p>'; return; }

    const target = Number(localStorage.getItem('hishob_monthly_target') || d.monthlyExpected || 0);
    const pct = target > 0 ? Math.min(100, Math.round((d.monthlyCollected / target) * 100)) : 0;

    if (v3Tab === 'overview') {
      body.innerHTML = `
        <div class="v3-kpi-row">
          <div class="v3-wave-card" data-jump="customers">
            <div class="v3-kpi-title">शिल्लक सक्रिय मुद्दल</div>
            <div class="v3-kpi-num">${fmt(d.remainingPrincipal)}</div>
            <div class="v3-kpi-sub ok">सक्रिय कर्जे: ${d.activeLoans} | बंद: ${d.closedLoans}</div>
            <svg class="wave" viewBox="0 0 200 44" preserveAspectRatio="none"><path d="M0,25 Q50,5 100,25 T200,20 L200,44 L0,44 Z" fill="#38bdf8"/></svg>
          </div>
          <div class="v3-wave-card" data-jump="analytics">
            <div class="v3-kpi-title">महिन्याची वसुली (${esc(d.activeYm)})</div>
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
            <div class="v3-panel">
              <h4 style="margin:0 0 8px;">📈 Cash Flow Overview (मासिक वसुली)</h4>
              ${buildSvgAreaChart(d.monthlySeries)}
            </div>
            <div class="v3-panel">
              <h4 style="margin:0 0 8px;">🍩 Customer Payment Status</h4>
              ${buildSvgDonut(d.paidCnt, d.partialCnt, d.unpaidCnt)}
            </div>
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

      const sel = document.getElementById('v3PayCustomer');
      const amtInp = document.getElementById('v3PayAmount');
      sel.addEventListener('change', () => {
        const opt = sel.options[sel.selectedIndex];
        if (!opt || !opt.value) return;
        const out = Number(opt.getAttribute('data-out') || 0);
        const mi = Number(opt.getAttribute('data-int') || 0);
        document.getElementById('v3PayBalInfo').innerHTML = `मासिक व्याज: <strong>${fmt(mi)}</strong> | एकूण थकबाकी: <strong class="err">${fmt(out)}</strong>`;
        amtInp.value = mi > 0 ? mi : out;
      });

      document.getElementById('v3SaveQuickPayBtn').addEventListener('click', async () => {
        if (isSavingPay) return;
        const bId = sel.value, amt = Number(amtInp.value || 0);
        const mode = document.getElementById('v3PayMode').value;
        const note = document.getElementById('v3PayNote').value.trim();
        const user = firebase.auth().currentUser;
        if (!user || !bId || amt <= 0) { showToast('कृपया ग्राहक आणि योग्य रक्कम टाका.', true); return; }

        isSavingPay = true;
        try {
          const b = d.allActiveRows.find(x => x.id === bId);
          const nowIso = new Date().toISOString();
          const ym = d.activeYm;
          const prevPartial = Number((b.raw.partialPayments && b.raw.partialPayments[ym]) || 0);
          const nextTotal = prevPartial + amt;
          const payload = {
            paymentHistory: firebase.firestore.FieldValue.arrayUnion({
              date: nowIso, ym, type: nextTotal >= b.monthlyInterest ? 'FULL_INTEREST' : 'PARTIAL_INTEREST',
              amount: amt, mode, note: note || `${ym} (${mode}) जमा`
            })
          };
          if (nextTotal >= b.monthlyInterest && b.monthlyInterest > 0) {
            payload[`paidMonths.${ym}`] = { paidAt: nowIso, amount: b.monthlyInterest };
            payload[`partialPayments.${ym}`] = firebase.firestore.FieldValue.delete();
          } else {
            payload[`partialPayments.${ym}`] = nextTotal;
          }
          await firebase.firestore().collection('users').doc(user.uid).collection('borrowers').doc(bId).update(payload);
          showToast(`✅ ${b.name} चे ₹${amt} (${mode}) यशस्वीरीत्या जमा झाले!`);
          renderV3Body();
        } catch (err) {
          showToast(`एरर: ${err.message}`, true);
        } finally {
          isSavingPay = false;
        }
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
        const txt = `नमस्कार ${b.getAttribute('data-v3name')}, आपली ₹${b.getAttribute('data-v3amt')} व्याज/बाकी रक्कम देय आहे. कृपया लवकर जमा करावी.`;
        window.open(`https://wa.me/${target}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener,noreferrer');
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
          <h3 style="margin-top:0;">🎯 Monthly Collection Goal (${esc(d.activeYm)})</h3>
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
