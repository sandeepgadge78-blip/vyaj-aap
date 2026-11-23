// व्याज हिशोब वही - व्याज तारीख रडार (promiseDate1-3 सुसंगत) + विभाग/जामीनदार ग्रुपिंग + कॅशफ्लो व रिटायरमेंट अंदाज (js/pro/smart-radar.js - V14.32)
(function () {
  const MARATHI_MONTHS = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];

  let radarTab = "today";
  let groupTab = "dept";
  let selectedGroupKey = null;
  let badgeTimer = null;

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function fmtInr(val) {
    const n = Number(val || 0);
    if (window.HishobBridge && typeof window.HishobBridge.fmtAmt === "function") return window.HishobBridge.fmtAmt(n);
    return "₹" + n.toLocaleString("en-IN");
  }

  function fmtDate(raw) {
    if (!raw) return "";
    const s = String(raw).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return s;
  }

  function getActiveYm() {
    return document.getElementById("activeYm")?.value || new Date().toISOString().slice(0, 7);
  }

  function getNextMonthLabel(ym) {
    const [yStr, mStr] = String(ym || "").split("-");
    let y = Number(yStr) || new Date().getFullYear();
    let m = (Number(mStr) || (new Date().getMonth() + 1)) + 1;
    if (m > 12) { m = 1; y += 1; }
    return `${MARATHI_MONTHS[m - 1] || m} ${y}`;
  }

  function getActiveBorrowers() {
    if (!window.HishobBridge || typeof window.HishobBridge.getBorrowers !== "function") return [];
    const list = (window.HishobBridge.getBorrowers() || []).filter((b) => !b.isDeleted && b.accountStatus !== "closed");
    if (window.VyajSchema && typeof window.VyajSchema.normalizeBorrower === "function") {
      return list.map((b) => window.VyajSchema.normalizeBorrower(b)?.std || b);
    }
    return list;
  }

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function parseYmdDate(str) {
    if (!str) return null;
    const norm = window.VyajSchema ? window.VyajSchema.normalizeDate(str) : String(str).trim();
    const m = String(norm || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function daysUntilInterestDay(dayNum, today) {
    const dNum = Number(dayNum);
    if (!dNum || dNum < 1 || dNum > 31) return null;
    const y = today.getFullYear();
    const m = today.getMonth();
    const lastDayThisMonth = new Date(y, m + 1, 0).getDate();
    const targetThisMonth = new Date(y, m, Math.min(dNum, lastDayThisMonth));
    const diffThis = Math.round((targetThisMonth - today) / 86400000);
    if (diffThis >= 0) return { diff: diffThis, dateObj: targetThisMonth };

    const lastDayNextMonth = new Date(y, m + 2, 0).getDate();
    const targetNextMonth = new Date(y, m + 1, Math.min(dNum, lastDayNextMonth));
    const diffNext = Math.round((targetNextMonth - today) / 86400000);
    return { diff: diffNext, pastDiff: diffThis, dateObj: targetNextMonth, passedThisMonth: true };
  }

  function injectRadarCss() {
    if (document.getElementById("vyajSmartRadarCss")) return;
    const st = document.createElement("style");
    st.id = "vyajSmartRadarCss";
    st.textContent = `
      .sr-strip { display: flex; gap: 6px; overflow-x: auto; padding: 2px 0 6px; margin-bottom: 10px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
      .sr-strip::-webkit-scrollbar { display: none; }
      .sr-strip-btn {
        flex: 1 0 auto; white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 5px;
        padding: 8px 11px !important; border-radius: 13px !important; font-size: 0.76rem !important; font-weight: 800 !important;
        background: var(--card) !important; border: 1px solid var(--border) !important; color: var(--text) !important;
        box-shadow: var(--glass-shadow);
      }
      .sr-count-pill { background: #be123c; color: #fff; font-size: 0.65rem; font-weight: 800; padding: 1px 6px; border-radius: 999px; }
      .sr-count-pill.zero { background: #15803d; }
      .sr-tabs { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; margin-bottom: 10px; }
      .sr-tabs::-webkit-scrollbar { display: none; }
      .sr-item-card { padding: 10px 11px; border-radius: 13px; background: var(--meta-bg); border: 1px solid var(--border); margin-bottom: 8px; }
      .sr-item-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
      .sr-item-name { font-size: 0.92rem; font-weight: 800; color: var(--text); }
      .sr-item-meta { font-size: 0.74rem; color: var(--muted); margin-top: 3px; }
      .sr-item-acts { display: flex; flex-wrap: nowrap; gap: 6px; margin-top: 8px; overflow-x: auto; }
      .sr-item-acts button { flex: 0 0 auto; padding: 5px 10px !important; font-size: 0.72rem !important; border-radius: 999px !important; }
      .sr-grp-card {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        padding: 11px 12px; border-radius: 13px; background: var(--meta-bg);
        border: 1px solid var(--border); margin-bottom: 8px; cursor: pointer;
        transition: border-color 0.16s ease, transform 0.14s ease;
      }
      .sr-grp-card:hover { border-color: var(--accent); }
      .sr-grp-card:active { transform: scale(0.98); }
      .sr-cf-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px; margin-bottom: 12px; }
      .sr-cf-box { padding: 11px; border-radius: 14px; background: var(--meta-bg); border: 1px solid var(--border); }
      .sr-cf-lbl { font-size: 0.72rem; color: var(--muted); font-weight: 700; }
      .sr-cf-val { font-size: 1.15rem; font-weight: 900; margin-top: 4px; color: var(--text); }
      .sr-cf-sub { font-size: 0.68rem; color: var(--muted); margin-top: 3px; }
    `;
    document.head.appendChild(st);
  }

  function ensureSmartStrip() {
    const appScreen = document.getElementById("appScreen");
    const searchBox = document.getElementById("searchInput");
    if (!appScreen || !searchBox || document.getElementById("vyajSmartProStrip")) return;

    const strip = document.createElement("section");
    strip.id = "vyajSmartProStrip";
    strip.className = "sr-strip";
    strip.innerHTML = `
      <button type="button" id="srOpenRadarBtn" class="sr-strip-btn" title="आज, उद्या आणि पुढील ७ दिवसांच्या व्याज/वायदा तारखा">
        🗓️ व्याज रडार <span id="srRadarCountPill" class="sr-count-pill zero">0</span>
      </button>
      <button type="button" id="srOpenGroupsBtn" class="sr-strip-btn" title="विभाग व जामीनदारानुसार खाती पहा">
        🏢 विभाग / जामीनदार
      </button>
      <button type="button" id="srOpenCashflowBtn" class="sr-strip-btn" title="पुढील महिन्याचा कॅशफ्लो आणि रिटायरमेंट अंदाज">
        📊 कॅशफ्लो अंदाज
      </button>
    `;
    appScreen.insertBefore(strip, searchBox);

    document.getElementById("srOpenRadarBtn")?.addEventListener("click", openDueRadarModal);
    document.getElementById("srOpenGroupsBtn")?.addEventListener("click", openGroupHubModal);
    document.getElementById("srOpenCashflowBtn")?.addEventListener("click", openCashflowModal);
  }

  function collectRadarBuckets() {
    const borrowers = getActiveBorrowers();
    const activeYm = getActiveYm();
    const today = startOfToday();
    const buckets = { today: [], tomorrow: [], week: [], overdue: [] };

    borrowers.forEach((b) => {
      const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
      const pending = Math.max(0, Number(calc.totalPayable || 0));
      const monthly = Number(calc.monthlyInterest || 0);

      // app.js च्या खऱ्या promiseDate1, promiseDate2, promiseDate3 तारखा वाचा
      const promiseDates = [
        b.promiseDate1 || b.promise1,
        b.promiseDate2 || b.promise2,
        b.promiseDate3 || b.promise3
      ].filter(Boolean);
      const addedBuckets = new Set();

      promiseDates.forEach((pStr) => {
        const pd = parseYmdDate(pStr);
        if (!pd) return;
        const diff = Math.round((pd - today) / 86400000);
        const tag = `वायदा: ${fmtDate(pStr)}`;
        if (diff === 0 && !addedBuckets.has("today")) {
          buckets.today.push({ b, calc, pending, monthly, reason: tag, urgent: true });
          addedBuckets.add("today");
        } else if (diff === 1 && !addedBuckets.has("tomorrow")) {
          buckets.tomorrow.push({ b, calc, pending, monthly, reason: tag, urgent: true });
          addedBuckets.add("tomorrow");
        } else if (diff >= 2 && diff <= 7 && !addedBuckets.has("week")) {
          buckets.week.push({ b, calc, pending, monthly, reason: `${tag} (${diff} दिवसांत)`, diff });
          addedBuckets.add("week");
        } else if (diff < 0 && pending > 0 && !addedBuckets.has("overdue")) {
          buckets.overdue.push({ b, calc, pending, monthly, reason: `वायदा उलटला (${fmtDate(pStr)})`, overdueDays: Math.abs(diff) });
          addedBuckets.add("overdue");
        }
      });

      if (b.interestDay) {
        const info = daysUntilInterestDay(b.interestDay, today);
        if (info) {
          const iTag = `दरमहा ${b.interestDay} तारीख`;
          if (info.diff === 0 && !addedBuckets.has("today")) {
            buckets.today.push({ b, calc, pending, monthly, reason: iTag });
            addedBuckets.add("today");
          } else if (info.diff === 1 && !addedBuckets.has("tomorrow")) {
            buckets.tomorrow.push({ b, calc, pending, monthly, reason: iTag });
            addedBuckets.add("tomorrow");
          } else if (info.diff >= 2 && info.diff <= 7 && !addedBuckets.has("week")) {
            buckets.week.push({ b, calc, pending, monthly, reason: `${iTag} (${info.diff} दिवसांत)`, diff: info.diff });
            addedBuckets.add("week");
          }
          if (info.passedThisMonth && pending > 0 && !addedBuckets.has("overdue")) {
            buckets.overdue.push({ b, calc, pending, monthly, reason: `${iTag} उलटली (${Math.abs(info.pastDiff)} दिवस)`, overdueDays: Math.abs(info.pastDiff) });
            addedBuckets.add("overdue");
          }
        }
      }
    });

    buckets.week.sort((a, b) => (a.diff || 9) - (b.diff || 9));
    buckets.overdue.sort((a, b) => b.pending - a.pending);
    return buckets;
  }

  function updateRadarCountBadge() {
    const pill = document.getElementById("srRadarCountPill");
    if (!pill) return;
    const buckets = collectRadarBuckets();
    const urgentCnt = buckets.today.length + buckets.tomorrow.length;
    pill.textContent = String(urgentCnt);
    pill.classList.toggle("zero", urgentCnt === 0);
  }

  function ensureDueRadarModal() {
    let modal = document.getElementById("proDueRadarModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "proDueRadarModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `<div class="modal-card" style="max-width:640px;" id="proDueRadarBody"></div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("proDueRadarModal");
      }
    });

    const obs = new MutationObserver(() => {
      if (!modal.classList.contains("hidden") && !document.getElementById("proDueRadarBody")?.innerHTML.trim()) {
        renderDueRadarModal();
      }
    });
    obs.observe(modal, { attributes: true, attributeFilter: ["class"] });
    return modal;
  }

  function renderDueRadarModal() {
    const body = document.getElementById("proDueRadarBody");
    if (!body) return;
    const buckets = collectRadarBuckets();
    const items = buckets[radarTab] || [];
    const totalExpectedTab = items.reduce((s, x) => s + (x.pending > 0 ? x.pending : x.monthly), 0);

    const rowsHtml = items.length
      ? items.map(({ b, pending, monthly, reason }) => {
          const cleanMob = window.VyajSchema ? window.VyajSchema.normalizeMobile(b.mobile) : String(b.mobile || "").replace(/\D/g, "");
          return `
            <div class="sr-item-card">
              <div class="sr-item-head">
                <div>
                  <div class="sr-item-name">${esc(b.name)}</div>
                  <div class="sr-item-meta">${esc(reason)} • मुद्दल: ${fmtInr(b.principal)}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-weight:900; font-size:0.9rem; color:${pending > 0 ? "var(--danger)" : "var(--accent-2)"};">
                    ${pending > 0 ? "बाकी: " + fmtInr(pending) : "पूर्ण जमा ✅"}
                  </div>
                  <div class="muted" style="font-size:0.7rem;">मासिक व्याज: ${fmtInr(monthly)}</div>
                </div>
              </div>
              <div class="sr-item-acts">
                ${cleanMob.length >= 10 ? `<button type="button" class="success" data-sr-call="${esc(cleanMob)}">📞 Call</button>` : ""}
                ${cleanMob.length >= 10 ? `<button type="button" class="primary" data-sr-wa="${esc(cleanMob)}" data-name="${esc(b.name)}" data-amt="${pending > 0 ? pending : monthly}">💬 WA रिमाइंडर</button>` : ""}
                <button type="button" class="primary" data-sr-details="${esc(b.id)}">📋 Details</button>
                <button type="button" class="warn" data-sr-invoice="${esc(b.id)}">🧾 QR पावती</button>
              </div>
            </div>
          `;
        }).join("")
      : `<div class="muted" style="text-align:center; padding:20px;">या विभागात सध्या कोणतीही व्याज किंवा वायदा तारीख नाही.</div>`;

    body.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
        <h3 style="margin:0; color:var(--accent);">🗓️ व्याज व वायदा तारीख रडार</h3>
        <span class="badge paid">एकूण: ${fmtInr(totalExpectedTab)}</span>
      </div>
      <div class="sr-tabs">
        <button type="button" class="pill-btn ${radarTab === "today" ? "filter-active" : ""}" data-rtab="today">🔴 आज (${buckets.today.length})</button>
        <button type="button" class="pill-btn ${radarTab === "tomorrow" ? "filter-active" : ""}" data-rtab="tomorrow">🟠 उद्या (${buckets.tomorrow.length})</button>
        <button type="button" class="pill-btn ${radarTab === "week" ? "filter-active" : ""}" data-rtab="week">📅 ७ दिवस (${buckets.week.length})</button>
        <button type="button" class="pill-btn pill-pending ${radarTab === "overdue" ? "filter-active" : ""}" data-rtab="overdue">⚠️ थकीत (${buckets.overdue.length})</button>
      </div>
      <div style="max-height:62vh; overflow-y:auto;">${rowsHtml}</div>
    `;

    body.querySelectorAll("[data-rtab]").forEach((btn) => {
      btn.addEventListener("click", () => { radarTab = btn.getAttribute("data-rtab"); renderDueRadarModal(); });
    });
    bindCommonActionButtons(body, "proDueRadarModal");
  }

  function openDueRadarModal() {
    const modal = ensureDueRadarModal();
    renderDueRadarModal();
    modal.classList.remove("hidden");
  }

  function ensureGroupHubModal() {
    let modal = document.getElementById("proGroupHubModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "proGroupHubModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `<div class="modal-card" style="max-width:640px;" id="proGroupHubBody"></div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("proGroupHubModal");
      }
    });

    const obs = new MutationObserver(() => {
      if (!modal.classList.contains("hidden") && !document.getElementById("proGroupHubBody")?.innerHTML.trim()) {
        renderGroupHubModal();
      }
    });
    obs.observe(modal, { attributes: true, attributeFilter: ["class"] });
    return modal;
  }

  function buildGroupsMap(mode) {
    const borrowers = getActiveBorrowers();
    const activeYm = getActiveYm();
    const groups = new Map();

    const addToGroup = (rawLabel, b, calc) => {
      const clean = String(rawLabel || "").trim();
      const display = clean || (mode === "dept" ? "विभाग नोंदवलेला नाही" : "जामीनदार नाही");
      const key = display.toLowerCase();
      if (!groups.has(key)) groups.set(key, { key, label: display, items: [], principalSum: 0, interestSum: 0, pendingSum: 0 });
      const g = groups.get(key);
      if (!g.items.some((x) => x.b.id === b.id)) {
        const pend = Math.max(0, Number(calc.totalPayable || 0));
        g.items.push({ b, calc, pending: pend, monthly: Number(calc.monthlyInterest || 0) });
        g.principalSum += Number(b.principal || 0);
        g.interestSum += Number(calc.monthlyInterest || 0);
        g.pendingSum += pend;
      }
    };

    borrowers.forEach((b) => {
      const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
      if (mode === "dept") {
        addToGroup(b.companyDept || "", b, calc);
      } else {
        const mainG = String(b.guarantor || "").trim();
        const extraG = String(b.extraGuarantors || "").trim();
        if (!mainG && !extraG) addToGroup("", b, calc);
        else {
          if (mainG) addToGroup(mainG, b, calc);
          if (extraG) extraG.split(",").forEach((p) => { if (p.trim()) addToGroup(p.trim(), b, calc); });
        }
      }
    });
    return Array.from(groups.values()).sort((a, b) => b.principalSum - a.principalSum);
  }

  function renderGroupHubModal(searchQuery = "") {
    const body = document.getElementById("proGroupHubBody");
    if (!body) return;
    const groups = buildGroupsMap(groupTab);
    const q = String(searchQuery || "").trim().toLowerCase();

    if (selectedGroupKey) {
      const grp = groups.find((g) => g.key === selectedGroupKey);
      if (!grp) { selectedGroupKey = null; renderGroupHubModal(); return; }

      const custRows = grp.items.map(({ b, pending, monthly }) => {
        const cleanMob = window.VyajSchema ? window.VyajSchema.normalizeMobile(b.mobile) : String(b.mobile || "").replace(/\D/g, "");
        return `
          <div class="sr-item-card">
            <div class="sr-item-head">
              <div>
                <div class="sr-item-name">${esc(b.name)}</div>
                <div class="sr-item-meta">मुद्दल: ${fmtInr(b.principal)} • मासिक व्याज: ${fmtInr(monthly)}</div>
              </div>
              <div style="text-align:right; font-weight:900; color:${pending > 0 ? "var(--danger)" : "var(--accent-2)"};">
                ${pending > 0 ? "बाकी: " + fmtInr(pending) : "पूर्ण जमा ✅"}
              </div>
            </div>
            <div class="sr-item-acts">
              ${cleanMob.length >= 10 ? `<button type="button" class="success" data-sr-call="${esc(cleanMob)}">📞 Call</button>` : ""}
              ${cleanMob.length >= 10 ? `<button type="button" class="primary" data-sr-wa="${esc(cleanMob)}" data-name="${esc(b.name)}" data-amt="${pending > 0 ? pending : monthly}">💬 WA</button>` : ""}
              <button type="button" class="primary" data-sr-details="${esc(b.id)}">📋 Details</button>
              <button type="button" class="warn" data-sr-invoice="${esc(b.id)}">🧾 पावती</button>
            </div>
          </div>
        `;
      }).join("");

      body.innerHTML = `
        <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
          <button type="button" id="srGroupBackBtn" class="primary sm">← सर्व गट</button>
          <strong style="color:var(--accent); font-size:0.95rem;">${esc(grp.label)}</strong>
        </div>
        <div class="meta-box" style="margin-bottom:10px; font-weight:700; display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px;">
          <span>खाती: <strong style="color:var(--purple);">${grp.items.length}</strong></span>
          <span>मुद्दल: <strong style="color:var(--gold);">${fmtInr(grp.principalSum)}</strong></span>
          <span>बाकी: <strong style="color:var(--danger);">${fmtInr(grp.pendingSum)}</strong></span>
        </div>
        <div style="max-height:60vh; overflow-y:auto;">${custRows}</div>
      `;

      document.getElementById("srGroupBackBtn")?.addEventListener("click", () => {
        selectedGroupKey = null;
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("sr_grp_detail");
        renderGroupHubModal();
      });
      bindCommonActionButtons(body, "proGroupHubModal");
      return;
    }

    const filtered = groups.filter((g) => !q || g.label.toLowerCase().includes(q));
    const listHtml = filtered.length
      ? filtered.map((g) => `
          <div class="sr-grp-card" data-open-grp="${esc(g.key)}">
            <div style="min-width:0;">
              <div style="font-size:0.92rem; font-weight:800; color:var(--text);">${esc(g.label)}</div>
              <div class="muted" style="font-size:0.74rem; margin-top:2px;">
                खाती: <strong>${g.items.length}</strong> • मुद्दल: <strong style="color:var(--gold);">${fmtInr(g.principalSum)}</strong> • बाकी: <strong style="color:${g.pendingSum > 0 ? "var(--danger)" : "var(--accent-2)"};">${fmtInr(g.pendingSum)}</strong>
              </div>
            </div>
            <span style="color:var(--accent); font-weight:800; font-size:0.84rem;">पहा ▸</span>
          </div>
        `).join("")
      : `<div class="muted" style="text-align:center; padding:18px;">कोणताही गट सापडला नाही.</div>`;

    body.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
        <h3 style="margin:0; color:var(--accent);">🏢 विभाग व जामीनदार ग्रुपिंग</h3>
        <span class="badge">${groups.length} गट</span>
      </div>
      <div class="row" style="margin-bottom:10px; gap:6px;">
        <button type="button" class="pill-btn ${groupTab === "dept" ? "filter-active" : ""}" data-gtab="dept">🏢 डिपार्टमेंटनुसार</button>
        <button type="button" class="pill-btn ${groupTab === "guarantor" ? "filter-active" : ""}" data-gtab="guarantor">🤝 जामीनदारानुसार</button>
      </div>
      <input type="text" id="srGroupSearchInput" class="search-pill-box" value="${esc(searchQuery)}" placeholder="🔍 विभाग किंवा जामीनदाराचे नाव शोधा..." style="margin-bottom:10px;" />
      <div style="max-height:58vh; overflow-y:auto;">${listHtml}</div>
    `;

    body.querySelectorAll("[data-gtab]").forEach((btn) => {
      btn.addEventListener("click", () => { groupTab = btn.getAttribute("data-gtab"); selectedGroupKey = null; renderGroupHubModal(""); });
    });

    const sInput = document.getElementById("srGroupSearchInput");
    sInput?.addEventListener("input", () => {
      const val = sInput.value;
      const pos = sInput.selectionStart || val.length;
      renderGroupHubModal(val);
      const nextInput = document.getElementById("srGroupSearchInput");
      if (nextInput) { nextInput.focus(); nextInput.setSelectionRange(pos, pos); }
    });

    body.querySelectorAll("[data-open-grp]").forEach((row) => {
      row.addEventListener("click", () => {
        selectedGroupKey = row.getAttribute("data-open-grp");
        if (window.VyajNavStack) {
          window.VyajNavStack.pushSubStep("sr_grp_detail", () => { selectedGroupKey = null; renderGroupHubModal(); });
        }
        renderGroupHubModal();
      });
    });
  }

  function openGroupHubModal() {
    selectedGroupKey = null;
    const modal = ensureGroupHubModal();
    renderGroupHubModal("");
    modal.classList.remove("hidden");
  }

  function ensureCashflowModal() {
    let modal = document.getElementById("proCashflowModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "proCashflowModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `<div class="modal-card" style="max-width:640px;" id="proCashflowBody"></div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("proCashflowModal");
      }
    });

    const obs = new MutationObserver(() => {
      if (!modal.classList.contains("hidden") && !document.getElementById("proCashflowBody")?.innerHTML.trim()) {
        renderCashflowModal();
      }
    });
    obs.observe(modal, { attributes: true, attributeFilter: ["class"] });
    return modal;
  }

  function renderCashflowModal() {
    const body = document.getElementById("proCashflowBody");
    if (!body) return;
    const borrowers = getActiveBorrowers();
    const activeYm = getActiveYm();
    const nextMonthName = getNextMonthLabel(activeYm);
    const today = startOfToday();

    let nextMonthExpected = 0, totalStuckPending = 0, curCollected = 0, totalPrincipal = 0;
    const retiringSoon = [];

    borrowers.forEach((b) => {
      const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
      const prin = Number(b.principal || 0);
      totalPrincipal += prin;
      nextMonthExpected += Number(calc.monthlyInterest || 0);
      totalStuckPending += Math.max(0, Number(calc.totalPayable || 0));
      curCollected += Number(calc.collectedInMonth || 0);

      const retStr = b.retirementDate;
      const retD = parseYmdDate(retStr);
      if (retD && prin > 0) {
        const diffDays = Math.round((retD - today) / 86400000);
        if (diffDays <= 180) {
          retiringSoon.push({ b, principal: prin, retStr, diffDays, pending: Math.max(0, Number(calc.totalPayable || 0)) });
        }
      }
    });

    retiringSoon.sort((a, b) => a.diffDays - b.diffDays);
    const totalPotential = nextMonthExpected + totalStuckPending;
    const dailyAvg = Math.round(curCollected / Math.max(1, today.getDate()));
    const retiringPrincipalSum = retiringSoon.reduce((s, x) => s + x.principal, 0);

    const retHtml = retiringSoon.length
      ? retiringSoon.map((item) => {
          const cleanMob = window.VyajSchema ? window.VyajSchema.normalizeMobile(item.b.mobile) : String(item.b.mobile || "").replace(/\D/g, "");
          const badgeTxt = item.diffDays < 0 ? `तारीख पूर्ण (${Math.abs(item.diffDays)} दि. पूर्वी)` : item.diffDays <= 30 ? `${item.diffDays} दिवसांत!` : `~${Math.round(item.diffDays / 30)} महिन्यांत`;
          return `
            <div class="sr-item-card" style="border-color:rgba(240,113,120,0.4);">
              <div class="sr-item-head">
                <div>
                  <div class="sr-item-name">${esc(item.b.name)}</div>
                  <div class="sr-item-meta">रिटायरमेंट: <strong>${esc(fmtDate(item.retStr))}</strong> • ${esc(item.b.companyDept || "खातेदार")}</div>
                </div>
                <div style="text-align:right;">
                  <span class="badge pending">${esc(badgeTxt)}</span>
                  <div style="font-weight:900; color:var(--gold); margin-top:3px;">मुद्दल: ${fmtInr(item.principal)}</div>
                </div>
              </div>
              <div class="sr-item-acts">
                ${cleanMob.length >= 10 ? `<button type="button" class="success" data-sr-call="${esc(cleanMob)}">📞 Call</button>` : ""}
                <button type="button" class="primary" data-sr-details="${esc(item.b.id)}">📋 Details</button>
              </div>
            </div>
          `;
        }).join("")
      : `<div class="ok" style="font-size:0.82rem; font-weight:700; padding:10px; text-align:center;">✅ पुढील ६ महिन्यांत कोणत्याही सक्रिय ग्राहकाची रिटायरमेंट तारीख नाही.</div>`;

    body.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
        <h3 style="margin:0; color:var(--accent);">📊 कॅशफ्लो व रिटायरमेंट अंदाज</h3>
        <button type="button" id="srPrintCashflowBtn" class="primary sm">🖨️ प्रिंट / PDF</button>
      </div>
      <div class="sr-cf-grid">
        <div class="sr-cf-box"><div class="sr-cf-lbl">📅 ${esc(nextMonthName)} अपेक्षित व्याज</div><div class="sr-cf-val" style="color:var(--accent-2);">${fmtInr(nextMonthExpected)}</div><div class="sr-cf-sub">सक्रिय खाती: ${borrowers.length}</div></div>
        <div class="sr-cf-box"><div class="sr-cf-lbl">🔴 सध्या अडकलेली थकबाकी</div><div class="sr-cf-val" style="color:var(--danger);">${fmtInr(totalStuckPending)}</div><div class="sr-cf-sub">वसुलीसाठी प्राधान्य</div></div>
        <div class="sr-cf-box"><div class="sr-cf-lbl">💰 एकूण वसुली क्षमता</div><div class="sr-cf-val" style="color:var(--gold);">${fmtInr(totalPotential)}</div><div class="sr-cf-sub">पुढील व्याज + मागील बाकी</div></div>
        <div class="sr-cf-box"><div class="sr-cf-lbl">⚡ दैनंदिन वसुली वेग</div><div class="sr-cf-val" style="color:var(--accent);">${fmtInr(dailyAvg)}/दिन</div><div class="sr-cf-sub">या महिन्यात जमा: ${fmtInr(curCollected)}</div></div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin:10px 0 6px;">
        <strong style="font-size:0.84rem; color:var(--danger);">⚠️ आगामी ६ महिने रिटायरमेंट रडार (${retiringSoon.length})</strong>
        ${retiringPrincipalSum > 0 ? `<span class="badge partial">मुद्दल: ${fmtInr(retiringPrincipalSum)}</span>` : ""}
      </div>
      <div style="max-height:38vh; overflow-y:auto;">${retHtml}</div>
    `;

    document.getElementById("srPrintCashflowBtn")?.addEventListener("click", () => {
      const printArea = document.getElementById("printArea");
      if (!printArea) return;
      const biz = document.getElementById("profBizName")?.value?.trim() || localStorage.getItem("vyaj_biz_name") || "व्याज हिशोब वही";
      const retRows = retiringSoon.map((x) => `<tr><td>${esc(x.b.name)}</td><td>${esc(x.b.companyDept || "-")}</td><td>${esc(fmtDate(x.retStr))}</td><td>₹${x.principal.toLocaleString("en-IN")}</td><td>₹${x.pending.toLocaleString("en-IN")}</td></tr>`).join("");
      printArea.innerHTML = `<div style="font-family:system-ui,sans-serif;"><h2>${esc(biz)} — कॅशफ्लो व रिटायरमेंट अंदाज</h2><table><tr><th>पुढील महिना (${esc(nextMonthName)}) अपेक्षित व्याज</th><td>₹${nextMonthExpected.toLocaleString("en-IN")}</td></tr><tr><th>सध्याची अडकलेली थकबाकी</th><td>₹${totalStuckPending.toLocaleString("en-IN")}</td></tr><tr><th>एकूण अपेक्षित वसुली क्षमता</th><td><strong>₹${totalPotential.toLocaleString("en-IN")}</strong></td></tr><tr><th>एकूण सक्रिय मुद्दल</th><td>₹${totalPrincipal.toLocaleString("en-IN")}</td></tr></table>${retiringSoon.length ? `<h3 style="margin-top:14px;">आगामी ६ महिने रिटायरमेंट यादी (${retiringSoon.length})</h3><table><thead><tr><th>नाव</th><th>विभाग</th><th>रिटायरमेंट तारीख</th><th>मुद्दल</th><th>बाकी व्याज</th></tr></thead><tbody>${retRows}</tbody></table>` : ""}</div>`;
      window.print();
    });
    bindCommonActionButtons(body, "proCashflowModal");
  }

  function openCashflowModal() {
    const modal = ensureCashflowModal();
    renderCashflowModal();
    modal.classList.remove("hidden");
  }

  function bindCommonActionButtons(container, parentModalId) {
    container.querySelectorAll("[data-sr-call]").forEach((btn) => {
      btn.addEventListener("click", () => { window.location.href = `tel:${btn.getAttribute("data-sr-call")}`; });
    });
    container.querySelectorAll("[data-sr-wa]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mob = btn.getAttribute("data-sr-wa");
        const target = mob.length === 10 ? "91" + mob : mob;
        const name = btn.getAttribute("data-name") || "";
        const amt = Number(btn.getAttribute("data-amt") || 0);
        const msg = `नमस्कार *${name}*,\nआपली व्याज भरण्याची तारीख आली असून रक्कम *₹${amt.toLocaleString("en-IN")}* देय आहे.\nकृपया वेळेवर जमा करावे. धन्यवाद!`;
        window.open(`https://wa.me/${target}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
      });
    });

    const stepNext = (fn) => {
      if (window.VyajNavStack) window.VyajNavStack.navigateFrom(parentModalId, fn);
      else { document.getElementById(parentModalId)?.classList.add("hidden"); fn(); }
    };
    container.querySelectorAll("[data-sr-details]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bid = btn.getAttribute("data-sr-details");
        stepNext(() => { if (typeof window.openProCustomerDetails === "function") window.openProCustomerDetails(bid); });
      });
    });
    container.querySelectorAll("[data-sr-invoice]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bid = btn.getAttribute("data-sr-invoice");
        stepNext(() => { if (typeof window.openInvoiceReceipt === "function") window.openInvoiceReceipt(bid); });
      });
    });
  }

  window.openProDueRadar = openDueRadarModal;
  window.openProGroupHub = openGroupHubModal;
  window.openProCashflow = openCashflowModal;

  function initSmartRadar() {
    injectRadarCss();
    ensureSmartStrip();
    ensureDueRadarModal();
    ensureGroupHubModal();
    ensureCashflowModal();

    const listEl = document.getElementById("borrowersList");
    if (listEl) {
      const obs = new MutationObserver(() => {
        clearTimeout(badgeTimer);
        badgeTimer = setTimeout(updateRadarCountBadge, 300);
      });
      obs.observe(listEl, { childList: true });
    }
    setTimeout(() => { ensureSmartStrip(); updateRadarCountBadge(); }, 1500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initSmartRadar);
  else initSmartRadar();
})();
