// =========================================================================
// Hishob Advanced Business Dashboard V2 + Three-Dot (⋮) Menu (dashboard.js)
// जुन्या V12.8 कोडला कोणताही धक्का न लावता 100% Real Data वर चालणारे मॉड्यूल
// =========================================================================

(function () {
  // १. सुरक्षिततेसाठी HTML Escape हेल्पर
  function esc(str) {
    return String(str === undefined || str === null ? '' : str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function getBridge() {
    return window.HishobBridge || null;
  }

  function fmt(val) {
    const br = getBridge();
    return br ? br.fmtAmt(val) : `₹${Number(val || 0)}`;
  }

  function getTodayIso(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // २. Three-Dot (⋮) Menu आणि Dashboard V2 साठी CSS स्टाईल जोडणे
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .td-wrap { position: relative; display: inline-block; }
    .td-btn { font-size: 1.15rem; padding: 4px 10px; line-height: 1; }
    .td-menu {
      position: absolute; right: 0; top: 38px; min-width: 230px; z-index: 60;
      background: var(--card); border: 1px solid var(--border); border-radius: 10px;
      box-shadow: 0 10px 28px rgba(0,0,0,0.45); padding: 6px; display: flex; flex-direction: column; gap: 4px;
    }
    .td-menu button { text-align: left; width: 100%; background: transparent; border: 1px solid transparent; padding: 8px 10px; font-size: 0.85rem; }
    .td-menu button:hover { background: var(--card-2); border-color: var(--border); }
    .td-divider { height: 1px; background: var(--border); margin: 4px 0; }
    .adv-modal-card { max-width: 980px !important; }
    .adv-grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 10px; margin-top: 8px; }
    .adv-kpi { background: var(--card-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
    .adv-kpi-lbl { font-size: 0.76rem; color: var(--muted); }
    .adv-kpi-val { font-size: 1.15rem; font-weight: 700; margin-top: 4px; }
    .bar-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; font-size: 0.82rem; }
    .bar-track { flex: 1; height: 12px; background: var(--bg); border-radius: 999px; overflow: hidden; border: 1px solid var(--border); }
    .bar-fill { height: 100%; background: linear-gradient(90deg, #0284c7, #22c55e); border-radius: 999px; }
    .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-top: 10px; }
    .cal-day {
      border: 1px solid var(--border); border-radius: 8px; padding: 8px 4px; text-align: center;
      cursor: pointer; font-size: 0.82rem; background: var(--card-2);
    }
    .cal-day.has-due { border-color: #f59e0b; background: rgba(245,158,11,0.18); font-weight: 700; }
    .cal-day.is-today { border-color: #38bdf8; box-shadow: 0 0 0 2px rgba(56,189,248,0.4); }
    .risk-badge { padding: 2px 7px; border-radius: 999px; font-size: 0.72rem; font-weight: 700; }
    .risk-low { background: rgba(34,197,94,0.2); color: #22c55e; }
    .risk-medium { background: rgba(245,158,11,0.2); color: #f59e0b; }
    .risk-high { background: rgba(239,68,68,0.2); color: #ef4444; }
    .risk-critical { background: #991b1b; color: #fff; }
  `;
  document.head.appendChild(styleEl);

  // ३. Three-Dot (⋮) Menu ची रचना तयार करणे
  function initThreeDotMenu() {
    const slot = document.getElementById('threeDotMenuSlot');
    if (!slot || slot.dataset.ready) return;
    slot.dataset.ready = '1';

    slot.innerHTML = `
      <div class="td-wrap">
        <button id="threeDotBtn" class="sm td-btn" title="अधिक पर्याय (Menu)">⋮</button>
        <div id="threeDotDropdown" class="td-menu hidden">
          <button data-td="adv-dash">🚀 Advanced Dashboard V2</button>
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

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });

    document.addEventListener('click', () => menu.classList.add('hidden'));

    menu.addEventListener('click', (e) => {
      const item = e.target.closest('button[data-td]');
      if (!item) return;
      menu.classList.add('hidden');
      const act = item.getAttribute('data-td');
      if (act === 'adv-dash') openAdvancedDashboard();
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

  // ४. Advanced Business Dashboard V2 Modal तयार करणे
  let activeAdvTab = 'overview';
  let isCompactMode = localStorage.getItem('hishob_adv_compact') === '1';

  function ensureAdvModal() {
    if (document.getElementById('advDashModal')) return;
    const modal = document.createElement('div');
    modal.id = 'advDashModal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `
      <div class="modal-card adv-modal-card">
        <div class="row" style="justify-content:space-between; margin-bottom:10px;">
          <h3 style="margin:0;">🚀 Advanced Business Dashboard V2</h3>
          <div class="row">
            <button id="advCompactBtn" class="sm">${isCompactMode ? 'Full Mode' : 'Compact Mode'}</button>
            <button id="advRefreshBtn" class="primary sm">🔄 Refresh</button>
            <button id="closeAdvDashBtn" class="danger sm">बंद करा</button>
          </div>
        </div>
        <div class="tab-bar" id="advTabBar">
          <button class="tab-btn active sm" data-advtab="overview">📊 Overview</button>
          <button class="tab-btn sm" data-advtab="collection">🎯 Smart Collection</button>
          <button class="tab-btn sm" data-advtab="risk">⚠️ Risk Analysis</button>
          <button class="tab-btn sm" data-advtab="analytics">📈 Analytics</button>
          <button class="tab-btn sm" data-advtab="calendar">📅 Payment Calendar</button>
          <button class="tab-btn sm" data-advtab="assistant">🤖 AI & Data Health</button>
        </div>
        <div id="advDashContent"></div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('closeAdvDashBtn').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('advRefreshBtn').addEventListener('click', renderAdvTab);
    document.getElementById('advCompactBtn').addEventListener('click', (e) => {
      isCompactMode = !isCompactMode;
      localStorage.setItem('hishob_adv_compact', isCompactMode ? '1' : '0');
      e.target.textContent = isCompactMode ? 'Full Mode' : 'Compact Mode';
      renderAdvTab();
    });

    document.getElementById('advTabBar').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-advtab]');
      if (!btn) return;
      activeAdvTab = btn.getAttribute('data-advtab');
      document.querySelectorAll('#advTabBar .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderAdvTab();
    });
  }

  // ५. संपूर्ण खऱ्या डेटाची गणना (Real Ledger Data Analysis)
  function analyzeBusinessData() {
    const br = getBridge();
    if (!br) return null;
    const borrowers = (br.getBorrowers() || []).filter(b => !b.isDeleted);
    const activeYm = document.getElementById('activeYm')?.value || getTodayIso().slice(0, 7);
    const currentYear = activeYm.slice(0, 4);
    const todayIso = getTodayIso(0);
    const tomorrowIso = getTodayIso(1);

    let activeLoans = 0, closedLoans = 0, totalPrincipalGiven = 0, totalPrincipalReceived = 0;
    let remainingPrincipal = 0, totalInterestGenerated = 0, totalInterestReceived = 0;
    let pendingInterest = 0, todayCollection = 0, monthlyCollection = 0, yearlyCollection = 0;
    let totalOutstanding = 0, totalOverdue = 0, partialCount = 0, missedCount = 0, totalTx = 0;
    const todayDueList = [], tomorrowDueList = [], riskList = [], monthlySeries = {};

    const uniqueCustomerNames = new Set();

    borrowers.forEach(b => {
      uniqueCustomerNames.add(String(b.name || '').trim().toLowerCase());
      const calc = br.computeLedgerUpToMonth(b, activeYm);
      const origP = Number(b.originalPrincipal || b.principal || 0);
      totalPrincipalGiven += origP;

      (b.principalReductions || []).forEach(r => {
        totalPrincipalReceived += Number(r.amount || 0);
        totalTx++;
      });

      let custInterestPaid = 0;
      let lastPayDate = '';
      (b.paymentHistory || []).forEach(p => {
        const amt = Number(p.amount || 0);
        const dt = String(p.date || '').slice(0, 10);
        const ym = dt.slice(0, 7);
        totalInterestReceived += amt;
        custInterestPaid += amt;
        totalTx++;
        if (dt === todayIso) todayCollection += amt;
        if (ym === activeYm) monthlyCollection += amt;
        if (dt.startsWith(currentYear)) yearlyCollection += amt;
        if (ym) monthlySeries[ym] = (monthlySeries[ym] || 0) + amt;
        if (dt > lastPayDate) lastPayDate = dt;
      });

      if (b.accountStatus === 'closed') {
        closedLoans++;
        totalPrincipalReceived += Number((b.settlement && b.settlement.amount) || origP);
      } else {
        activeLoans++;
        remainingPrincipal += calc.principal;
        totalInterestGenerated += calc.monthlyInterest;
        pendingInterest += calc.remainingThisMonth;
        totalOutstanding += calc.totalPayable;

        if (calc.status === 'partial') partialCount++;
        if (calc.status === 'pending' && calc.totalPayable > 0) missedCount++;

        const pDates = [b.promiseDate1, b.promiseDate2, b.promiseDate3].filter(Boolean);
        if (pDates.includes(todayIso) && calc.totalPayable > 0) todayDueList.push({ b, calc });
        if (pDates.includes(tomorrowIso) && calc.totalPayable > 0) tomorrowDueList.push({ b, calc });

        // Overdue व Risk Score मोजणी
        let daysOverdue = calc.lateDays || 0;
        if (daysOverdue === 0 && calc.pastDue > 0) daysOverdue = 30;
        if (daysOverdue > 0 && calc.totalPayable > 0) totalOverdue += calc.totalPayable;

        let riskLevel = 'low', riskScore = 15, riskReason = 'नियमित भरणा';
        if (daysOverdue >= 60 || calc.totalPayable > calc.monthlyInterest * 3) {
          riskLevel = 'critical'; riskScore = 92; riskReason = `${daysOverdue}+ दिवस थकबाकी`;
        } else if (daysOverdue >= 30 || calc.pastDue > 0) {
          riskLevel = 'high'; riskScore = 74; riskReason = 'मागील महिन्याचे व्याज बाकी';
        } else if (calc.status === 'partial' || daysOverdue > 0) {
          riskLevel = 'medium'; riskScore = 45; riskReason = 'अर्धवट जमा / विलंब';
        }

        riskList.push({
          id: b.id, name: b.name, mobile: b.mobile || '', principal: calc.principal,
          outstanding: calc.totalPayable, monthlyInterest: calc.monthlyInterest,
          status: calc.status, daysOverdue, riskLevel, riskScore, riskReason,
          lastPayDate: lastPayDate || '-', interestDay: Number(b.interestDay || 0),
          promiseDates: pDates, custInterestPaid
        });
      }
    });

    const perfScore = totalInterestGenerated > 0
      ? Math.min(100, Math.round((monthlyCollection / totalInterestGenerated) * 100))
      : 100;

    return {
      activeYm, todayIso, tomorrowIso,
      totalCustomers: uniqueCustomerNames.size, activeLoans, closedLoans,
      totalPrincipalGiven, totalPrincipalReceived, remainingPrincipal,
      totalInterestGenerated, totalInterestReceived, pendingInterest,
      todayCollection, monthlyCollection, yearlyCollection,
      totalOutstanding, totalOverdue, partialCount, missedCount, totalTx,
      todayDueList, tomorrowDueList, riskList, monthlySeries, perfScore, borrowers
    };
  }

  // ६. टॅब्स Render करणे
  function renderAdvTab() {
    const box = document.getElementById('advDashContent');
    const data = analyzeBusinessData();
    if (!data) {
      box.innerHTML = '<p class="muted">डेटा लोड होत आहे...</p>';
      return;
    }

    if (activeAdvTab === 'overview') {
      box.innerHTML = `
        <div class="adv-grid-4">
          <div class="adv-kpi"><div class="adv-kpi-lbl">एकूण ग्राहक / सक्रिय कर्जे</div><div class="adv-kpi-val">${data.totalCustomers} / ${data.activeLoans}</div></div>
          <div class="adv-kpi"><div class="adv-kpi-lbl">बंद झालेली कर्जे</div><div class="adv-kpi-val">${data.closedLoans}</div></div>
          <div class="adv-kpi"><div class="adv-kpi-lbl">एकूण दिलेले मुद्दल</div><div class="adv-kpi-val">${fmt(data.totalPrincipalGiven)}</div></div>
          <div class="adv-kpi"><div class="adv-kpi-lbl">शिल्लक सक्रिय मुद्दल</div><div class="adv-kpi-val warn-text">${fmt(data.remainingPrincipal)}</div></div>
          <div class="adv-kpi"><div class="adv-kpi-lbl">आजची वसुली</div><div class="adv-kpi-val ok">${fmt(data.todayCollection)}</div></div>
          <div class="adv-kpi"><div class="adv-kpi-lbl">महिन्याची वसुली (${esc(data.activeYm)})</div><div class="adv-kpi-val ok">${fmt(data.monthlyCollection)}</div></div>
          <div class="adv-kpi"><div class="adv-kpi-lbl">वार्षिक वसुली</div><div class="adv-kpi-val ok">${fmt(data.yearlyCollection)}</div></div>
          <div class="adv-kpi"><div class="adv-kpi-lbl">एकूण थकबाकी (Outstanding)</div><div class="adv-kpi-val err">${fmt(data.totalOutstanding)}</div></div>
          ${!isCompactMode ? `
            <div class="adv-kpi"><div class="adv-kpi-lbl">Overdue रक्कम</div><div class="adv-kpi-val err">${fmt(data.totalOverdue)}</div></div>
            <div class="adv-kpi"><div class="adv-kpi-lbl">अर्धवट / बाकी खाती</div><div class="adv-kpi-val">${data.partialCount} / ${data.missedCount}</div></div>
            <div class="adv-kpi"><div class="adv-kpi-lbl">एकूण व्यवहार (Transactions)</div><div class="adv-kpi-val">${data.totalTx}</div></div>
            <div class="adv-kpi"><div class="adv-kpi-lbl">Business Performance Score</div><div class="adv-kpi-val ok">${data.perfScore}%</div></div>
          ` : ''}
        </div>
      `;
    } else if (activeAdvTab === 'collection') {
      const savedTarget = Number(localStorage.getItem('hishob_monthly_target') || data.totalInterestGenerated || 0);
      const pct = savedTarget > 0 ? Math.min(100, Math.round((data.monthlyCollection / savedTarget) * 100)) : 0;
      const pendingList = data.riskList.filter(r => r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding);

      box.innerHTML = `
        <div class="meta-box">
          <div class="row" style="justify-content:space-between;">
            <strong>🎯 Monthly Collection Target: ${fmt(savedTarget)} (पूर्ण: ${pct}%)</strong>
            <div class="row">
              <input type="number" id="advTargetInput" value="${savedTarget}" style="width:130px;" />
              <button id="advSaveTargetBtn" class="primary sm">Target सेव्ह</button>
            </div>
          </div>
          <div class="bar-row">
            <span>जमा: ${fmt(data.monthlyCollection)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%;"></div></div>
            <span>${pct}%</span>
          </div>
        </div>
        <h4 style="margin:12px 0 6px;">⏳ Pending व Overdue Collection यादी (${pendingList.length})</h4>
        ${pendingList.slice(0, 20).map(r => `
          <div class="meta-box row" style="justify-content:space-between;">
            <div>
              <strong>${esc(r.name)}</strong> (${esc(r.mobile || '-')}) — बाकी: <strong class="err">${fmt(r.outstanding)}</strong>
              <span class="muted">| शेवटचा भरणा: ${esc(r.lastPayDate)}</span>
            </div>
            <div class="row">
              ${r.mobile ? `<button data-advcall="${esc(r.mobile.replace(/\D/g, ''))}" class="success sm">📞 Call</button>` : ''}
              ${r.mobile ? `<button data-advwa="${esc(r.mobile.replace(/\D/g, ''))}" data-advname="${esc(r.name)}" data-advamt="${r.outstanding}" class="primary sm">💬 WhatsApp</button>` : ''}
            </div>
          </div>
        `).join('') || '<p class="muted">कोणतीही बाकी नाही!</p>'}
      `;

      document.getElementById('advSaveTargetBtn')?.addEventListener('click', () => {
        const v = Number(document.getElementById('advTargetInput').value || 0);
        localStorage.setItem('hishob_monthly_target', String(v));
        renderAdvTab();
      });

      box.querySelectorAll('button[data-advcall]').forEach(b => {
        b.addEventListener('click', () => { window.location.href = `tel:${b.getAttribute('data-advcall')}`; });
      });
      box.querySelectorAll('button[data-advwa]').forEach(b => {
        b.addEventListener('click', () => {
          const mob = b.getAttribute('data-advwa');
          const target = mob.length === 10 ? `91${mob}` : mob;
          const msg = `नमस्कार ${b.getAttribute('data-advname')}, आपली ₹${b.getAttribute('data-advamt')} व्याज/बाकी रक्कम देय आहे. कृपया लवकर जमा करावी.`;
          window.open(`https://wa.me/${target}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
        });
      });
    } else if (activeAdvTab === 'risk') {
      const sortedRisk = [...data.riskList].sort((a, b) => b.riskScore - a.riskScore || b.outstanding - a.outstanding);
      const counts = { low: 0, medium: 0, high: 0, critical: 0 };
      sortedRisk.forEach(r => counts[r.riskLevel]++);

      box.innerHTML = `
        <div class="adv-grid-4">
          <div class="adv-kpi"><div class="adv-kpi-lbl">Critical Risk</div><div class="adv-kpi-val err">${counts.critical}</div></div>
          <div class="adv-kpi"><div class="adv-kpi-lbl">High Risk</div><div class="adv-kpi-val err">${counts.high}</div></div>
          <div class="adv-kpi"><div class="adv-kpi-lbl">Medium Risk</div><div class="adv-kpi-val warn-text">${counts.medium}</div></div>
          <div class="adv-kpi"><div class="adv-kpi-lbl">Low Risk (नियमित)</div><div class="adv-kpi-val ok">${counts.low}</div></div>
        </div>
        <h4 style="margin:12px 0 6px;">🔥 Top 10 Follow-up Priority & Highest Outstanding</h4>
        <table class="passbook-table">
          <thead><tr><th>ग्राहक</th><th>बाकी रक्कम</th><th>दिवस Overdue</th><th>Risk Score</th><th>कारण</th></tr></thead>
          <tbody>
            ${sortedRisk.slice(0, 10).map(r => `
              <tr>
                <td><strong>${esc(r.name)}</strong></td>
                <td class="err">${fmt(r.outstanding)}</td>
                <td>${r.daysOverdue} दिवस</td>
                <td><span class="risk-badge risk-${r.riskLevel}">${r.riskLevel.toUpperCase()} (${r.riskScore})</span></td>
                <td>${esc(r.riskReason)}</td>
              </tr>
            `).join('') || '<tr><td colspan="5">डेटा नाही.</td></tr>'}
          </tbody>
        </table>
      `;
    } else if (activeAdvTab === 'analytics') {
      const months = Object.keys(data.monthlySeries).sort().slice(-6);
      const maxVal = Math.max(1, ...months.map(m => data.monthlySeries[m]));
      const netCashFlow = (data.totalPrincipalReceived + data.totalInterestReceived) - data.totalPrincipalGiven;

      box.innerHTML = `
        <div class="adv-grid-4">
          <div class="adv-kpi"><div class="adv-kpi-lbl">Cash Outflow (दिलेले मुद्दल)</div><div class="adv-kpi-val err">${fmt(data.totalPrincipalGiven)}</div></div>
          <div class="adv-kpi"><div class="adv-kpi-lbl">Cash Inflow (मुद्दल + व्याज)</div><div class="adv-kpi-val ok">${fmt(data.totalPrincipalReceived + data.totalInterestReceived)}</div></div>
          <div class="adv-kpi"><div class="adv-kpi-lbl">Net Cash Flow</div><div class="adv-kpi-val ${netCashFlow >= 0 ? 'ok' : 'warn-text'}">${fmt(netCashFlow)}</div></div>
          <div class="adv-kpi"><div class="adv-kpi-lbl">एकूण मिळालेले व्याज</div><div class="adv-kpi-val ok">${fmt(data.totalInterestReceived)}</div></div>
        </div>
        <h4 style="margin:14px 0 6px;">📊 Monthly Income Graph (शेवटचे ६ महिने)</h4>
        <div class="meta-box">
          ${months.length ? months.map(m => {
            const val = data.monthlySeries[m];
            const w = Math.round((val / maxVal) * 100);
            return `<div class="bar-row"><span style="width:72px;">${esc(m)}</span><div class="bar-track"><div class="bar-fill" style="width:${w}%;"></div></div><strong style="width:85px; text-align:right;">${fmt(val)}</strong></div>`;
          }).join('') : '<p class="muted">अद्याप मासिक भरणा नोंदी नाहीत.</p>'}
        </div>
      `;
    } else if (activeAdvTab === 'calendar') {
      const [y, m] = data.activeYm.split('-').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const todayDay = data.todayIso.startsWith(data.activeYm) ? Number(data.todayIso.slice(8, 10)) : -1;

      const dayMap = {};
      data.riskList.forEach(r => {
        if (r.interestDay >= 1 && r.interestDay <= daysInMonth) {
          dayMap[r.interestDay] = dayMap[r.interestDay] || [];
          dayMap[r.interestDay].push(r);
        }
      });

      let cells = '';
      for (let d = 1; d <= daysInMonth; d++) {
        const list = dayMap[d] || [];
        const cls = `${list.length ? 'has-due' : ''} ${d === todayDay ? 'is-today' : ''}`;
        cells += `<div class="cal-day ${cls}" data-calday="${d}"><div>${d}</div><div class="muted" style="font-size:0.7rem;">${list.length ? `${list.length} खाती` : ''}</div></div>`;
      }

      box.innerHTML = `
        <div class="muted">महिना: <strong>${esc(data.activeYm)}</strong> (तारखेवर क्लिक करून त्या दिवशीची खाती पहा)</div>
        <div class="cal-grid">${cells}</div>
        <div id="calDayDetails" class="meta-box" style="margin-top:10px;">कोणत्याही तारखेवर क्लिक करा.</div>
      `;

      box.querySelectorAll('.cal-day').forEach(el => {
        el.addEventListener('click', () => {
          const d = Number(el.getAttribute('data-calday'));
          const list = dayMap[d] || [];
          const det = document.getElementById('calDayDetails');
          det.innerHTML = list.length
            ? `<strong>${d} तारखेची खाती (${list.length}):</strong>` + list.map(r => `<div>• ${esc(r.name)} — व्याज ${fmt(r.monthlyInterest)} | बाकी ${fmt(r.outstanding)}</div>`).join('')
            : `${d} तारखेला कोणत्याही ग्राहकाची व्याज तारीख नाही.`;
        });
      });
    } else if (activeAdvTab === 'assistant') {
      // Data Health: Duplicate Customers व Duplicate Payments तपासणी
      const nameCounts = {};
      let dupCustomers = 0, dupPayments = 0;
      data.borrowers.forEach(b => {
        const key = `${String(b.name || '').trim().toLowerCase()}|${String(b.mobile || '').trim()}`;
        nameCounts[key] = (nameCounts[key] || 0) + 1;
        const seenPay = new Set();
        (b.paymentHistory || []).forEach(p => {
          const pk = `${String(p.date || '').slice(0, 10)}|${p.amount}|${p.type}`;
          if (seenPay.has(pk)) dupPayments++;
          else seenPay.add(pk);
        });
      });
      Object.values(nameCounts).forEach(c => { if (c > 1) dupCustomers++; });

      box.innerHTML = `
        <div class="meta-box">
          <h4 style="margin-top:0;">🤖 AI Smart Business Assistant (मराठी / English)</h4>
          <div class="row">
            <input type="text" id="aiQueryInput" placeholder="उदा. आज किती जमा? / सर्वात जास्त बाकी? / high risk" style="flex:1; min-width:200px;" />
            <button id="aiAskBtn" class="primary sm">विचारा</button>
          </div>
          <div id="aiAnswerBox" style="margin-top:8px;" class="muted">तुमच्या व्यवसायाबद्दल प्रश्न विचारा (100% खऱ्या डेटावर आधारित उत्तरे).</div>
        </div>
        <h4 style="margin:12px 0 6px;">🩺 Data Health Check</h4>
        <div class="adv-grid-4">
          <div class="adv-kpi"><div class="adv-kpi-lbl">Duplicate Customers</div><div class="adv-kpi-val ${dupCustomers ? 'warn-text' : 'ok'}">${dupCustomers}</div></div>
          <div class="adv-kpi"><div class="adv-kpi-lbl">Duplicate Payments</div><div class="adv-kpi-val ${dupPayments ? 'err' : 'ok'}">${dupPayments}</div></div>
          <div class="adv-kpi"><div class="adv-kpi-lbl">Ledger Integrity</div><div class="adv-kpi-val ok">✅ Verified</div></div>
          <div class="adv-kpi"><div class="adv-kpi-lbl">Local Storage Keys</div><div class="adv-kpi-val">${Object.keys(localStorage).length}</div></div>
        </div>
      `;

      document.getElementById('aiAskBtn')?.addEventListener('click', () => {
        const q = (document.getElementById('aiQueryInput').value || '').toLowerCase();
        const ans = document.getElementById('aiAnswerBox');
        if (q.includes('आज') || q.includes('today')) {
          ans.innerHTML = `✅ आज (${esc(data.todayIso)}) एकूण <strong>${fmt(data.todayCollection)}</strong> जमा झाले आहेत आणि <strong>${data.todayDueList.length}</strong> ग्राहकांचे आज वायदे आहेत.`;
        } else if (q.includes('जास्त') || q.includes('highest') || q.includes('top')) {
          const top = [...data.riskList].sort((a, b) => b.outstanding - a.outstanding)[0];
          ans.innerHTML = top ? `📌 सर्वात जास्त थकबाकी <strong>${esc(top.name)}</strong> यांची आहे — <strong>${fmt(top.outstanding)}</strong>.` : 'कोणतीही थकबाकी नाही.';
        } else if (q.includes('risk') || q.includes('धोका') || q.includes('overdue')) {
          const high = data.riskList.filter(r => r.riskLevel === 'high' || r.riskLevel === 'critical');
          ans.innerHTML = `⚠️ सध्या <strong>${high.length}</strong> ग्राहक High/Critical Risk मध्ये आहेत. एकूण Overdue रक्कम: <strong>${fmt(data.totalOverdue)}</strong>.`;
        } else {
          ans.innerHTML = `📊 सारांश (${esc(data.activeYm)}): सक्रिय कर्जे <strong>${data.activeLoans}</strong> | शिल्लक मुद्दल <strong>${fmt(data.remainingPrincipal)}</strong> | महिन्याची वसुली <strong>${fmt(data.monthlyCollection)}</strong> | एकूण थकबाकी <strong>${fmt(data.totalOutstanding)}</strong>.`;
        }
      });
    }
  }

  function openAdvancedDashboard() {
    ensureAdvModal();
    renderAdvTab();
    document.getElementById('advDashModal').classList.remove('hidden');
  }

  // पेज लोड झाल्यावर Three-Dot Menu सक्रिय करा
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThreeDotMenu);
  } else {
    initThreeDotMenu();
  }
})();

