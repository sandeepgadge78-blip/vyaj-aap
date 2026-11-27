// व्याज Infinity X - Reactive Single-Signal Dashboard (Zero Blinking + 3 Operating Modes + Dual-Ring Split + Promises) (src/features/dashboard.js)

import { getState, setState, getUnifiedMonthReport } from "../core/store.js";
import { getOperatingMode, setOperatingMode, isFeatureEnabled } from "../core/feature-flags.js";
import {
  formatRupeesInr, fmtYmMr, getIstTodayIso, parseStrictDate
} from "../core/ledger-v16.js";
import { getLastBackupMeta } from "../data/backup-vault.js";
import { updateBorrower } from "../data/borrowers-repo.js";
import { esc, fmtDateShort, cleanMobile, triggerCall, openWhatsApp, openModal, closeModal, buildRingSvg, showToast } from "../ui/dom-utils.js";

let promiseExpanded = false;
let promiseTab = "today"; // today | tomorrow | overdue
let lastDashSig = "";
let pendingModalTab = "current"; // current | past
let pendingSearch = "";

// आज, उद्या आणि थकीत वायदे एकाच Unified Report मधून काढा
function collectPromiseBuckets(report) {
  const todayStr = getIstTodayIso(0);
  const tmrStr = getIstTodayIso(1);
  const out = { today: [], tomorrow: [], overdue: [] };

  (report.rows || []).forEach(({ b, ledger }) => {
    if (ledger.isClosed || ledger.totalPayable <= 0) return;
    const rawDates = [
      { field: "promiseDate1", val: b.promiseDate1 },
      { field: "promiseDate2", val: b.promiseDate2 },
      { field: "promiseDate3", val: b.promiseDate3 }
    ];
    if (Array.isArray(b.promiseList)) {
      b.promiseList.forEach((p) => {
        if (p && p.status !== "done" && p.date) rawDates.push({ field: "promiseDate1", val: p.date });
      });
    }

    const valid = rawDates
      .map((x) => ({ field: x.field, chk: parseStrictDate(x.val) }))
      .filter((x) => x.chk.valid)
      .map((x) => ({ field: x.field, iso: x.chk.iso }));

    if (!valid.length) return;
    const hitToday = valid.find((x) => x.iso === todayStr);
    const hitTmr = valid.find((x) => x.iso === tmrStr);
    const hitPast = valid.filter((x) => x.iso < todayStr).sort((a, c) => c.iso.localeCompare(a.iso));

    if (hitToday) out.today.push({ b, ledger, date: hitToday.iso, field: hitToday.field });
    else if (hitTmr) out.tomorrow.push({ b, ledger, date: hitTmr.iso, field: hitTmr.field });
    else if (hitPast.length) out.overdue.push({ b, ledger, date: hitPast[0].iso, field: hitPast[0].field });
  });

  out.today.sort((a, c) => c.ledger.totalPayable - a.ledger.totalPayable);
  out.tomorrow.sort((a, c) => c.ledger.totalPayable - a.ledger.totalPayable);
  out.overdue.sort((a, c) => c.date.localeCompare(a.date));
  return out;
}

// बाकी व्याज विभागणी तपशील मोडल (चालू महिना vs मागील महिने)
export function openPendingSplitModal(initialTab = "current", actions = {}) {
  pendingModalTab = initialTab;

  const renderInner = () => {
    const { ui, profile } = getState();
    const report = getUnifiedMonthReport();
    const s = report.summary;
    const isPast = pendingModalTab === "past";

    const curList = report.rows
      .filter(({ ledger }) => !ledger.isClosed && ledger.remainingThisMonth > 0)
      .sort((a, c) => c.ledger.remainingThisMonth - a.ledger.remainingThisMonth);
    const pastList = report.rows
      .filter(({ ledger }) => !ledger.isClosed && ledger.pastDue > 0)
      .sort((a, c) => c.ledger.pastDue - a.ledger.pastDue);

    const base = isPast ? pastList : curList;
    const q = pendingSearch.trim().toLowerCase();
    const filtered = base.filter(({ b }) => !q || `${b.name || ""} ${b.mobile || ""} ${b.guarantor || ""}`.toLowerCase().includes(q));

    const cardsHtml = filtered.length
      ? filtered.map(({ b, ledger }) => {
          const amt = isPast ? ledger.pastDue : ledger.remainingThisMonth;
          const mob = cleanMobile(b.mobile);
          const sub = isPast
            ? `📅 ${esc(ledger.pastBreakdownText)}`
            : `मासिक: ${formatRupeesInr(ledger.monthlyInterest, ui.hideAmounts)} • जमा: ${formatRupeesInr(ledger.collectedInMonth, ui.hideAmounts)}`;
          return `
            <div class="meta-box" style="margin-bottom:7px; border-left:3px solid ${isPast ? "var(--warn)" : "var(--danger)"};">
              <div class="row-between">
                <div style="min-width:0;">
                  <div style="font-weight:800; font-size:0.86rem;">${esc(b.name || "ग्राहक")}</div>
                  <div class="muted" style="font-size:0.71rem; margin-top:2px;">${sub}</div>
                </div>
                <div style="text-align:right; white-space:nowrap;">
                  <strong style="color:${isPast ? "var(--warn)" : "var(--danger)"}; font-size:0.94rem;">${formatRupeesInr(amt, ui.hideAmounts)}</strong>
                  <div class="muted" style="font-size:0.65rem;">एकूण: ${formatRupeesInr(ledger.totalPayable, ui.hideAmounts)}</div>
                </div>
              </div>
              <div class="row" style="margin-top:7px; gap:5px;">
                ${mob.length >= 10 ? `<button type="button" class="success xs" data-ps-call="${esc(mob)}">📞 Call</button>` : ""}
                ${mob.length >= 10 ? `<button type="button" class="teal xs" data-ps-wa="${esc(b.id)}">💬 WA</button>` : ""}
                <button type="button" class="warn xs" data-ps-jump="${esc(b.id)}">⚡ जमा / कार्ड</button>
              </div>
            </div>
          `;
        }).join("")
      : `<div class="muted" style="text-align:center; padding:18px;">या विभागात सध्या कोणतीही बाकी नाही.</div>`;

    const html = `
      <div class="modal-head">
        <div>
          <h3>📊 बाकी व्याज विभागणी (${esc(fmtYmMr(report.ym))})</h3>
          <div class="muted">एकूण थकबाकी: <strong class="err">${formatRupeesInr(s.totalPending, ui.hideAmounts)}</strong></div>
        </div>
        <button type="button" class="sm" id="psCloseBtn">✕ बंद</button>
      </div>
      <div class="tab-row-2">
        <button type="button" class="seg-btn ${!isPast ? "is-active" : ""}" data-pstab="current">🔴 चालू महिना (${s.curPendingCount}) • ${formatRupeesInr(s.currentPending, ui.hideAmounts)}</button>
        <button type="button" class="seg-btn ${isPast ? "is-active" : ""}" data-pstab="past">🟠 मागील महिने (${s.pastPendingCount}) • ${formatRupeesInr(s.pastPending, ui.hideAmounts)}</button>
      </div>
      <input type="text" id="psSearchInp" class="search-input" value="${esc(pendingSearch)}" placeholder="🔍 नाव किंवा मोबाईल शोधा..." />
      <div style="max-height:56vh; overflow-y:auto;">${cardsHtml}</div>
    `;

    openModal("pendingSplitModal", html, {
      onAfterRender: (card) => {
        card.querySelector("#psCloseBtn")?.addEventListener("click", () => closeModal("pendingSplitModal"));
        card.querySelectorAll("[data-pstab]").forEach((btn) => {
          btn.addEventListener("click", () => { pendingModalTab = btn.getAttribute("data-pstab"); renderInner(); });
        });
        const inp = card.querySelector("#psSearchInp");
        inp?.addEventListener("input", () => {
          pendingSearch = inp.value;
          const pos = inp.selectionStart || pendingSearch.length;
          renderInner();
          const next = document.getElementById("psSearchInp");
          if (next) { next.focus(); next.setSelectionRange(pos, pos); }
        });
        card.querySelectorAll("[data-ps-call]").forEach((btn) => btn.addEventListener("click", () => triggerCall(btn.getAttribute("data-ps-call"))));
        card.querySelectorAll("[data-ps-wa]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const found = filtered.find((x) => x.b.id === btn.getAttribute("data-ps-wa"));
            if (!found) return;
            const biz = profile?.bizName || "व्याज हिशोब वही";
            openWhatsApp(found.b.mobile, `नमस्कार *${found.b.name}*,\nआपले ${fmtYmMr(report.ym)} चे एकूण बाकी व्याज *₹${found.ledger.totalPayable.toLocaleString("en-IN")}* आहे.\nकृपया वेळेवर जमा करावे. धन्यवाद!\n— *${biz}*`);
          });
        });
        card.querySelectorAll("[data-ps-jump]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-ps-jump");
            closeModal("pendingSplitModal");
            if (typeof actions.onJumpBorrower === "function") actions.onJumpBorrower(id);
          });
        });
      }
    });
  };

  renderInner();
}

// मुख्य डॅशबोर्ड रेंडर (Smart Diff — फक्त बदल झाल्यासच DOM अपडेट)
export function renderDashboard(containerEl, actions = {}, forceRender = false) {
  if (!containerEl) return;
  const st = getState();
  const report = getUnifiedMonthReport();
  const s = report.summary;
  const hide = st.ui.hideAmounts;
  const mode = getOperatingMode();
  const bkMeta = getLastBackupMeta();
  const promises = collectPromiseBuckets(report);

  const todayIso = getIstTodayIso(0);
  const dueUdhaari = report.udhaari.rows.filter((u) => !u.isFull && u.promiseDate && u.promiseDate <= todayIso);
  const dueUdSum = dueUdhaari.reduce((acc, u) => acc + Number(u.remP) / 100, 0);

  const sig = [
    report.ym, mode, hide, st.ui.pendingOfflineCount,
    s.activeCount, s.totalPrincipal, s.expectedInterest, s.collectedInterest,
    s.currentPending, s.pastPending, s.totalPending, s.collectionPct,
    promises.today.length, promises.tomorrow.length, promises.overdue.length,
    promiseExpanded, promiseTab, report.udhaari.rows.filter((u) => !u.isFull).length,
    dueUdhaari.length, bkMeta?.ts || 0
  ].join("|");

  if (!forceRender && sig === lastDashSig && containerEl.children.length > 0) return;
  lastDashSig = sig;

  const curPendPct = s.expectedInterest > 0 ? Math.min(100, Math.round((s.currentPending / s.expectedInterest) * 100)) : 0;
  const pastPendPct = s.expectedInterest > 0 ? Math.min(100, Math.round((s.pastPending / s.expectedInterest) * 100)) : 0;
  const activeUdCount = report.udhaari.rows.filter((u) => !u.isFull).length;

  // वायदा पट्टीची शीर्षक माहिती
  const todayCnt = promises.today.length;
  const tmrCnt = promises.tomorrow.length;
  const ovCnt = promises.overdue.length;
  if (promiseTab === "today" && todayCnt === 0) {
    if (ovCnt > 0) promiseTab = "overdue";
    else if (tmrCnt > 0) promiseTab = "tomorrow";
  }

  let promTitle = "✅ आज कोणताही बाकी वायदा नाही";
  let promSub = tmrCnt || ovCnt ? `उद्या: ${tmrCnt} • थकीत वायदे: ${ovCnt}` : "सर्व वायदे वेळेवर आहेत";
  let promCls = "calm";
  if (todayCnt > 0) {
    const tSum = promises.today.reduce((acc, x) => acc + x.ledger.totalPayable, 0);
    promTitle = `🔔 आजचे ${todayCnt} वायदे • ${formatRupeesInr(tSum, hide)}`;
    promSub = `उद्या: ${tmrCnt} • थकीत: ${ovCnt} • पाहण्यासाठी टॅप करा`;
    promCls = "";
  } else if (ovCnt > 0) {
    const oSum = promises.overdue.reduce((acc, x) => acc + x.ledger.totalPayable, 0);
    promTitle = `⚠️ ${ovCnt} थकीत वायदे • ${formatRupeesInr(oSum, hide)}`;
    promSub = `आज: 0 • उद्या: ${tmrCnt} • पाहण्यासाठी टॅप करा`;
    promCls = "";
  }

  const activePromItems = promises[promiseTab] || [];
  const promCardsHtml = activePromItems.length
    ? activePromItems.map(({ b, ledger, date, field }) => {
        const mob = cleanMobile(b.mobile);
        return `
          <div class="meta-box" style="margin-bottom:6px;">
            <div class="row-between">
              <div style="min-width:0;">
                <div style="font-weight:800; font-size:0.84rem;">${esc(b.name || "ग्राहक")}</div>
                <div class="muted" style="font-size:0.7rem;">📅 ${esc(fmtDateShort(date))}${mob ? ` • 📱 ${esc(mob)}` : ""}</div>
              </div>
              <strong class="gold-text">${formatRupeesInr(ledger.totalPayable, hide)}</strong>
            </div>
            <div class="row" style="margin-top:6px; gap:5px;">
              ${mob.length >= 10 ? `<button type="button" class="success xs" data-dp-call="${esc(mob)}">📞 Call</button>` : ""}
              ${mob.length >= 10 ? `<button type="button" class="teal xs" data-dp-wa="${esc(b.id)}">💬 WA</button>` : ""}
              <button type="button" class="warn xs" data-dp-jump="${esc(b.id)}">⚡ जमा</button>
              <button type="button" class="danger xs" data-dp-snooze="${esc(b.id)}" data-field="${esc(field)}">⏰ +३ दिन</button>
            </div>
          </div>
        `;
      }).join("")
    : `<div class="muted" style="text-align:center; padding:10px;">या विभागात बाकी वायदा नाही.</div>`;

  const bkLabel = bkMeta?.ts
    ? `☁️ बॅकअप: ${new Date(bkMeta.ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} ${new Date(bkMeta.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
    : "☁️ बॅकअप: अजून घेतलेला नाही";

  containerEl.innerHTML = `
    <!-- १. Operating Mode Switcher (Simple / Pro / Ultra) -->
    <div class="mode-strip">
      <span class="muted" style="font-size:0.7rem; font-weight:800;">⚡ Mode:</span>
      <div class="mode-pills">
        <button type="button" class="mode-pill ${mode === "simple" ? "is-active" : ""}" data-setmode="simple">Simple</button>
        <button type="button" class="mode-pill ${mode === "pro" ? "is-active" : ""}" data-setmode="pro">Pro</button>
        <button type="button" class="mode-pill ${mode === "ultra" ? "is-active" : ""}" data-setmode="ultra">Ultra</button>
      </div>
      ${st.ui.pendingOfflineCount > 0 ? `<span class="badge partial">⏳ Offline: ${st.ui.pendingOfflineCount}</span>` : `<span class="badge paid">BigInt IST</span>`}
    </div>

    <!-- २. स्वतंत्र उधारी वायदा अलर्ट (व्याजापेक्षा वेगळे) -->
    ${isFeatureEnabled("udhaari") && dueUdhaari.length > 0 ? `
      <div class="alert-bar purple" id="dashUdAlertBtn">
        <div class="alert-bar-head">
          <div style="min-width:0;">
            <div style="font-size:0.78rem; font-weight:800; color:var(--purple);">🤝 उधारी वायदा अलर्ट (${dueUdhaari.length} जण)</div>
            <div class="muted" style="font-size:0.69rem;">येणे बाकी: <strong>${formatRupeesInr(dueUdSum, hide)}</strong> • ${esc(dueUdhaari.slice(0, 2).map((x) => x.name).join(", "))}</div>
          </div>
          <span class="badge purple">पहा ▸</span>
        </div>
      </div>
    ` : ""}

    <!-- ३. व्याज वायदा Activity पट्टी -->
    <section class="alert-bar ${promCls}">
      <div class="alert-bar-head" id="dashPromiseToggle">
        <div style="min-width:0;">
          <div style="font-size:0.79rem; font-weight:800;">${esc(promTitle)}</div>
          <div class="muted" style="font-size:0.68rem;">${esc(promSub)}</div>
        </div>
        <span class="badge">${promiseExpanded ? "बंद ▴" : "पहा ▾"}</span>
      </div>
      ${promiseExpanded ? `
        <div class="alert-bar-drawer">
          <div class="tab-row-3">
            <button type="button" class="seg-btn ${promiseTab === "today" ? "is-active" : ""}" data-dptab="today">🔴 आज (${todayCnt})</button>
            <button type="button" class="seg-btn ${promiseTab === "tomorrow" ? "is-active" : ""}" data-dptab="tomorrow">🟠 उद्या (${tmrCnt})</button>
            <button type="button" class="seg-btn ${promiseTab === "overdue" ? "is-active" : ""}" data-dptab="overdue">⚠️ थकीत (${ovCnt})</button>
          </div>
          <div style="max-height:290px; overflow-y:auto;">${promCardsHtml}</div>
        </div>
      ` : ""}
    </section>

    <!-- ४. महिना Hero Card -->
    <section class="month-hero-card">
      <div class="month-hero-sub">चालू खातेवही महिना (IST)</div>
      <div class="month-hero-title" id="dashMonthPickerBtn" title="महिना बदलण्यासाठी टॅप करा">
        <span>${esc(fmtYmMr(report.ym))}</span>
        <span style="font-size:0.8rem; color:var(--accent);">▾</span>
      </div>
      <div class="hero-action-grid">
        <button type="button" class="primary" id="dashPdfBtn">🖨️ PDF</button>
        <button type="button" class="success" id="dashExcelBtn">📊 Excel</button>
        <button type="button" style="background:#1d4ed8; color:#fff; border-color:rgba(125,211,252,0.45);" id="dashMonthActBtn">📋 नोंदी</button>
        <button type="button" class="teal" id="dashPreviewBtn">🧮 अंदाज</button>
      </div>
      <div class="hero-prog-wrap">
        <div class="hero-prog-head">
          <span>महिन्याची वसुली प्रगती</span>
          <span class="ok">${s.collectionPct}% (${formatRupeesInr(s.collectedInterest, hide)} / ${formatRupeesInr(s.expectedInterest, hide)})</span>
        </div>
        <div class="hero-prog-track"><div class="hero-prog-fill" style="width:${s.collectionPct}%;"></div></div>
      </div>
    </section>

    <!-- ५. Live Backup Bar -->
    <section class="card-box row-between" style="padding:8px 10px;">
      <div style="min-width:0;">
        <div style="font-size:0.75rem; font-weight:800;">${esc(bkLabel)}</div>
        <div class="muted" style="font-size:0.66rem;">${s.activeCount} खाती • ${activeUdCount} बाकी उधारी</div>
      </div>
      <div class="row" style="gap:5px; flex-shrink:0;">
        <button type="button" class="primary xs" id="dashQuickBackupBtn">⚡ बॅकअप</button>
        <button type="button" class="xs" id="dashSnapshotsBtn">🕒 Vault</button>
      </div>
    </section>

    <!-- ६. मुख्य २ KPI कार्ड्स (एकूण खाती व एकूण मुद्दल) -->
    <section class="grid-2" style="margin-bottom:9px;">
      <div class="stat-tile" id="dashAccountsTile">
        <div class="stat-tile-lbl"><span>एकूण सक्रिय खाती</span><span>▾</span></div>
        <div class="stat-tile-val purple-text">${s.activeCount}</div>
      </div>
      <div class="stat-tile gold" id="dashPrincipalTile">
        <div class="stat-tile-lbl"><span>एकूण मुद्दल</span><span class="gold-text">पहा ▸</span></div>
        <div class="stat-tile-val gold-text">${formatRupeesInr(s.totalPrincipal, hide)}</div>
      </div>
    </section>

    <!-- ७. Dual-Ring: मासिक व्याज व जमा -->
    <section class="split-bar">
      <div class="split-head">
        <span>💰 मासिक व्याज व जमा (${esc(fmtYmMr(report.ym))})</span>
        <span>टॅप करून पहा ▸</span>
      </div>
      <div class="split-grid">
        <div class="split-tile cyan" id="dashExpectedTile">
          <div class="split-info">
            <span class="split-lbl">🔵 मासिक व्याज</span>
            <span class="split-amt" style="color:var(--accent);">${formatRupeesInr(s.expectedInterest, hide)}</span>
            <span class="split-sub">${s.activeCount} खाती ▸</span>
          </div>
          ${buildRingSvg(100, "#7dd3fc")}
        </div>
        <div class="split-tile green" id="dashCollectedTile">
          <div class="split-info">
            <span class="split-lbl">🟢 जमा व्याज</span>
            <span class="split-amt ok">${formatRupeesInr(s.collectedInterest, hide)}</span>
            <span class="split-sub">${s.paidCount} खाती जमा ▸</span>
          </div>
          ${buildRingSvg(s.collectionPct, "#4ade80")}
        </div>
      </div>
    </section>

    <!-- ८. Dual-Ring: बाकी व्याज विभागणी -->
    <section class="split-bar">
      <div class="split-head">
        <span>📊 बाकी व्याज विभागणी <span class="badge pending">एकूण ${formatRupeesInr(s.totalPending, hide)}</span></span>
        <span>यादी पहा ▸</span>
      </div>
      <div class="split-grid">
        <div class="split-tile red" id="dashCurPendTile">
          <div class="split-info">
            <span class="split-lbl">🔴 चालू महिना बाकी</span>
            <span class="split-amt err">${formatRupeesInr(s.currentPending, hide)}</span>
            <span class="split-sub">${s.curPendingCount} खाती बाकी ▸</span>
          </div>
          ${buildRingSvg(curPendPct, "#f07178")}
        </div>
        <div class="split-tile orange" id="dashPastPendTile">
          <div class="split-info">
            <span class="split-lbl">🟠 मागील महिने बाकी</span>
            <span class="split-amt warn-text">${formatRupeesInr(s.pastPending, hide)}</span>
            <span class="split-sub">${s.pastPendingCount} खाती थकीत ▸</span>
          </div>
          ${buildRingSvg(pastPendPct, "#e5a952")}
        </div>
      </div>
    </section>

    <!-- ९. Zero-Scroll Pro & Ultra Tools Strip -->
    <section class="pro-strip-grid ${isFeatureEnabled("systemGuardian") ? "" : "cols-3"}">
      <button type="button" class="purple" id="dashOpenUdhaariBtn">🤝 उधारी (${activeUdCount})</button>
      <button type="button" class="primary" id="dashOpenCashbookBtn">📒 कॅशबुक</button>
      <button type="button" class="teal" id="dashOpenEmiBtn">🧮 EMI</button>
      ${isFeatureEnabled("systemGuardian") ? `<button type="button" class="warn" id="dashOpenGuardianBtn">🛡️ Guardian</button>` : ""}
    </section>
  `;

  // इव्हेंट बाइंडिंग्स (सर्व थेट एकदाच जोडलेले)
  containerEl.querySelectorAll("[data-setmode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = btn.getAttribute("data-setmode");
      setOperatingMode(m);
      showToast(`✅ ${m.toUpperCase()} Mode सक्रिय झाले!`, "ok");
      renderDashboard(containerEl, actions, true);
    });
  });

  containerEl.querySelector("#dashUdAlertBtn")?.addEventListener("click", () => actions.onOpenUdhaari?.("due"));
  containerEl.querySelector("#dashPromiseToggle")?.addEventListener("click", () => {
    promiseExpanded = !promiseExpanded;
    renderDashboard(containerEl, actions, true);
  });
  containerEl.querySelectorAll("[data-dptab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      promiseTab = btn.getAttribute("data-dptab");
      renderDashboard(containerEl, actions, true);
    });
  });
  containerEl.querySelectorAll("[data-dp-call]").forEach((btn) => btn.addEventListener("click", () => triggerCall(btn.getAttribute("data-dp-call"))));
  containerEl.querySelectorAll("[data-dp-wa]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const hit = activePromItems.find((x) => x.b.id === btn.getAttribute("data-dp-wa"));
      if (!hit) return;
      const biz = st.profile?.bizName || "व्याज हिशोब वही";
      openWhatsApp(hit.b.mobile, `नमस्कार *${hit.b.name}*,\nआपला वायदा दिनांक *${fmtDateShort(hit.date)}* असून एकूण बाकी *₹${hit.ledger.totalPayable.toLocaleString("en-IN")}* आहे.\nकृपया वेळेवर जमा करावे. धन्यवाद!\n— *${biz}*`);
    });
  });
  containerEl.querySelectorAll("[data-dp-jump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      promiseExpanded = false;
      actions.onJumpBorrower?.(btn.getAttribute("data-dp-jump"));
    });
  });
  containerEl.querySelectorAll("[data-dp-snooze]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const bId = btn.getAttribute("data-dp-snooze");
      const field = btn.getAttribute("data-field") || "promiseDate1";
      const hit = activePromItems.find((x) => x.b.id === bId);
      if (!hit || !st.user) return;
      const nextIso = getIstTodayIso(3);
      try {
        await updateBorrower(st.user.uid, hit.b, { [field]: nextIso }, { saveVersion: false, userEmail: st.user.email });
        showToast(`⏰ वायदा ३ दिवसांनी (${fmtDateShort(nextIso)}) पुढे ढकलला!`, "ok");
      } catch (err) {
        showToast("वायदा बदल एरर: " + err.message, "err");
      }
    });
  });

  containerEl.querySelector("#dashMonthPickerBtn")?.addEventListener("click", () => {
    const nextM = prompt("महिना निवडा (YYYY-MM स्वरूपात, उदा. 2026-11):", report.ym);
    if (nextM && /^\d{4}-\d{2}$/.test(nextM.trim())) {
      setState({ activeYm: nextM.trim() });
    }
  });

  containerEl.querySelector("#dashPdfBtn")?.addEventListener("click", () => actions.onOpenPdf?.());
  containerEl.querySelector("#dashExcelBtn")?.addEventListener("click", () => actions.onExportExcel?.());
  containerEl.querySelector("#dashMonthActBtn")?.addEventListener("click", () => actions.onOpenMonthActivity?.());
  containerEl.querySelector("#dashPreviewBtn")?.addEventListener("click", () => actions.onOpenInterestPreview?.());
  containerEl.querySelector("#dashQuickBackupBtn")?.addEventListener("click", () => actions.onTriggerBackup?.());
  containerEl.querySelector("#dashSnapshotsBtn")?.addEventListener("click", () => actions.onOpenBackupSnapshots?.());

  containerEl.querySelector("#dashPrincipalTile")?.addEventListener("click", () => actions.onOpenDrill?.("principal"));
  containerEl.querySelector("#dashExpectedTile")?.addEventListener("click", () => actions.onOpenDrill?.("interest"));
  containerEl.querySelector("#dashCollectedTile")?.addEventListener("click", () => actions.onOpenDrill?.("collected"));
  containerEl.querySelector("#dashCurPendTile")?.addEventListener("click", () => openPendingSplitModal("current", actions));
  containerEl.querySelector("#dashPastPendTile")?.addEventListener("click", () => openPendingSplitModal("past", actions));

  containerEl.querySelector("#dashOpenUdhaariBtn")?.addEventListener("click", () => actions.onOpenUdhaari?.("pending"));
  containerEl.querySelector("#dashOpenCashbookBtn")?.addEventListener("click", () => actions.onOpenCashbook?.());
  containerEl.querySelector("#dashOpenEmiBtn")?.addEventListener("click", () => actions.onOpenEmi?.());
  containerEl.querySelector("#dashOpenGuardianBtn")?.addEventListener("click", () => actions.onOpenGuardian?.());
}
