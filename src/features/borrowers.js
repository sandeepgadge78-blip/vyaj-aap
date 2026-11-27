// व्याज Infinity X - 4-Tab Fintech ग्राहक कार्ड, BigInt पेमेंट, V16 बँकिंग कंट्रोल्स, Passbook व Add/Edit (src/features/borrowers.js)

import { getState, updateFilters, getUnifiedMonthReport } from "../core/store.js";
import { isFeatureEnabled } from "../core/feature-flags.js";
import { getUserPaths, FieldValue } from "../core/firebase.js";
import {
  formatRupeesInr, formatPaiseInr, fmtYmMr, getIstTodayIso, getIstCurrentYm,
  nextYm, evaluateCompound, toPaise
} from "../core/ledger-v16.js";
import {
  addBorrower, updateBorrower, softDeleteBorrower, closeAccount, reopenAccount,
  collectMonthlyPayment, resetMonthPayment, addExtraPrincipal, reducePrincipal,
  saveHistoricalTerms, toggleOptInCompound, runOptInCompound,
  creditAdvanceWallet, applyAdvanceWalletToMonth, saveUnifiedPromises
} from "../data/borrowers-repo.js";
import {
  esc, cleanMobile, fmtDateShort, matchesSmartSearch, showToast,
  triggerCall, openWhatsApp, openModal, closeModal, printPureWhiteA4
} from "../ui/dom-utils.js";

let openCardId = null;
const activeTabByCard = new Map(); // borrowerId -> ledger | loan | contact | tools
const busyPayIds = new Set();      // Double-Tap Payment Guard

function jobLabelMr(jobType) {
  if (jobType === "govt") return "सरकारी";
  if (jobType === "private") return "खाजगी";
  if (jobType === "business") return "व्यवसाय";
  return "";
}

function getUnifiedPromises(b) {
  const list = Array.isArray(b.promiseList)
    ? b.promiseList
        .filter((p) => p && /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || "")))
        .map((p, i) => ({
          id: p.id || `pr_${i}_${p.date}`,
          date: String(p.date),
          amount: Number(p.amount || 0),
          note: String(p.note || "").trim(),
          status: p.status === "done" ? "done" : "pending"
        }))
    : [];
  const existing = new Set(list.map((p) => p.date));
  [b.promiseDate1, b.promiseDate2, b.promiseDate3].forEach((d, idx) => {
    const s = String(d || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !existing.has(s)) {
      existing.add(s);
      list.push({ id: `leg_${idx + 1}_${s}`, date: s, amount: 0, note: "", status: "pending" });
    }
  });
  list.sort((a, c) => (a.status !== c.status ? (a.status === "pending" ? -1 : 1) : a.date.localeCompare(c.date)));
  return list;
}

// =========================================================================
// १. ग्राहक यादी + सर्च + फिल्टर पिल्स रेंडर
// =========================================================================
export function renderBorrowersSection(containerEl) {
  if (!containerEl) return;
  const st = getState();
  const report = getUnifiedMonthReport();
  const hide = st.ui.hideAmounts;
  const f = st.filters;

  // सर्च बार व फिल्टर शेल एकदाच तयार करा (टाइप करताना फोकस तुटू नये म्हणून)
  if (!containerEl.querySelector("#bFilterShell")) {
    containerEl.innerHTML = `
      <div id="bFilterShell">
        <input type="text" id="vyajSearchInput" class="search-input" placeholder="🔍 नाव (मराठी/इंग्रजी), मोबाईल किंवा जामीनदार शोधा..." value="${esc(f.search)}" />
        <div class="pill-strip" id="vyajFilterPills">
          <button type="button" class="pill-btn" data-f-status="all">सर्व खाती</button>
          <button type="button" class="pill-btn" data-f-job="govt">Govt</button>
          <button type="button" class="pill-btn" data-f-job="private">Pvt</button>
          <button type="button" class="pill-btn" data-f-status="paid">पूर्ण जमा</button>
          <button type="button" class="pill-btn" data-f-status="partial">अर्धवट</button>
          <button type="button" class="pill-btn" data-f-status="pending">बाकी</button>
          <button type="button" class="pill-btn" data-f-acc="closed">Closed</button>
        </div>
      </div>
      <div id="vyajBorrowersList"></div>
    `;

    containerEl.querySelector("#vyajSearchInput")?.addEventListener("input", (ev) => {
      openCardId = null;
      updateFilters({ search: ev.target.value });
    });

    containerEl.querySelector("#vyajFilterPills")?.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      openCardId = null;
      const curF = getState().filters;
      if (btn.hasAttribute("data-f-status")) {
        updateFilters({ status: btn.getAttribute("data-f-status"), account: "active" });
      } else if (btn.hasAttribute("data-f-job")) {
        const j = btn.getAttribute("data-f-job");
        updateFilters({ job: curF.job === j ? "all" : j });
      } else if (btn.hasAttribute("data-f-acc")) {
        updateFilters({ account: curF.account === "closed" ? "active" : "closed", status: "all" });
      }
    });
  }

  // सक्रिय फिल्टर पिल्स हायलाईट करा
  containerEl.querySelectorAll("[data-f-status]").forEach((b) => {
    b.classList.toggle("active", f.account === "active" && f.status === b.getAttribute("data-f-status"));
  });
  containerEl.querySelectorAll("[data-f-job]").forEach((b) => {
    b.classList.toggle("active", f.job === b.getAttribute("data-f-job"));
  });
  containerEl.querySelectorAll("[data-f-acc]").forEach((b) => {
    b.classList.toggle("active", f.account === b.getAttribute("data-f-acc"));
  });

  const filtered = report.rows.filter(({ b, ledger }) => {
    if (f.account === "active" && ledger.isClosed) return false;
    if (f.account === "closed" && !ledger.isClosed) return false;
    if (f.job !== "all" && b.jobType !== f.job) return false;
    if (f.status !== "all" && ledger.status !== f.status) return false;
    return matchesSmartSearch(b, f.search);
  });

  const listEl = containerEl.querySelector("#vyajBorrowersList");
  if (!listEl) return;

  if (!filtered.length) {
    listEl.innerHTML = `<div class="card-box muted" style="text-align:center; padding:22px;">कोणतेही ग्राहक खाते आढळले नाही.</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(({ b, ledger }, idx) => buildBorrowerCardHtml(b, ledger, idx, report.ym, hide)).join("");
  bindListEvents(listEl, filtered, report.ym);
}

function buildBorrowerCardHtml(b, ledger, idx, activeYm, hide) {
  const isOpen = openCardId === b.id;
  const mob = cleanMobile(b.mobile);
  const statusCls = ledger.isClosed ? "status-closed" : ledger.status === "paid" ? "status-paid" : ledger.status === "partial" ? "status-partial" : "";
  const badgeCls = ledger.isClosed ? "" : ledger.status === "paid" ? "paid" : ledger.status === "partial" ? "partial" : "pending";
  const jobTxt = [jobLabelMr(b.jobType), b.companyDept].filter(Boolean).join(" • ");
  const promises = getUnifiedPromises(b);
  const activeProms = promises.filter((p) => p.status !== "done");
  const nextPromTxt = activeProms.length ? fmtDateShort(activeProms[0].date) : "नाही";
  const pastMonthsCount = ledger.pastPendingMonths.filter((x) => x.remaining > 0).length;

  const frontHtml = `
    <div class="b-card-front" data-toggle-card="${esc(b.id)}">
      <div class="b-card-top">
        <div class="b-card-name">
          <span class="b-num">#${idx + 1}</span>
          <span>${esc(b.name || "नाव नाही")}</span>
          <span class="badge ${badgeCls}">${esc(ledger.statusLabel)}</span>
        </div>
        <div class="row" style="gap:5px; flex-shrink:0;">
          ${mob.length >= 10
            ? `<button type="button" class="success xs" data-act="call" data-mob="${esc(mob)}">📞 Call</button>`
            : `<button type="button" class="xs" data-act="edit-mob" data-id="${esc(b.id)}">📞 +नंबर</button>`}
          <span class="muted" style="font-size:0.8rem;">${isOpen ? "▴" : "▾"}</span>
        </div>
      </div>

      <div class="b-chips">
        ${jobTxt ? `<span class="badge">💼 ${esc(jobTxt)}</span>` : ""}
        <span class="badge" data-act="edit-guar" data-id="${esc(b.id)}" style="cursor:pointer;">🤝 ${esc(b.guarantor || "+ जामीनदार")}</span>
        ${ledger.walletBalance > 0 ? `<span class="badge purple">💼 वॉलेट ${formatRupeesInr(ledger.walletBalance, hide)}</span>` : ""}
        ${b.v18Compound?.enabled ? `<span class="badge partial">🔁 चक्रवाढ ON</span>` : ""}
      </div>

      <div class="b-kpi-3">
        <div>
          <div class="b-kpi-lbl">एकूण मुद्दल</div>
          <div class="b-kpi-val gold-text">${formatRupeesInr(ledger.principal, hide)}</div>
        </div>
        <div>
          <div class="b-kpi-lbl">दर (${ledger.ratePeriod === "daily" ? "दैनिक" : ledger.ratePeriod === "yearly" ? "वार्षिक" : "मासिक"})</div>
          <div class="b-kpi-val">${Number(b.rate || 0)}%</div>
        </div>
        <div>
          <div class="b-kpi-lbl">महिन्याचे व्याज</div>
          <div class="b-kpi-val" style="color:var(--accent);">${formatRupeesInr(ledger.monthlyInterest, hide)}</div>
        </div>
      </div>

      <div class="b-card-foot">
        <div>
          ${ledger.isClosed
            ? `<span class="muted">✓ खाते बंद (${formatRupeesInr(b.settlement?.amount || 0, hide)})</span>`
            : ledger.pastDue > 0
              ? `<span class="err" style="font-weight:800;">⚠️ मागील बाकी: ${formatRupeesInr(ledger.pastDue, hide)}${pastMonthsCount ? ` (${pastMonthsCount} म.)` : ""}</span>`
              : `<span class="ok" style="font-weight:800;">✅ मागील बाकी: ₹0</span>`}
        </div>
        <div class="row" style="gap:6px;">
          <span class="muted" style="font-size:0.71rem;">📅 ${esc(nextPromTxt)}</span>
          ${!ledger.isClosed && ledger.remainingThisMonth > 0
            ? `<button type="button" class="success xs" data-act="quick-focus-pay" data-id="${esc(b.id)}">⚡ जमा</button>`
            : ""}
        </div>
      </div>
    </div>
  `;

  if (!isOpen) return `<article class="b-card ${statusCls}" data-card-id="${esc(b.id)}">${frontHtml}</article>`;

  const tab = activeTabByCard.get(b.id) || "ledger";
  const bodyHtml = buildExpandedTabsHtml(b, ledger, activeYm, tab, promises, hide);
  return `<article class="b-card ${statusCls}" data-card-id="${esc(b.id)}">${frontHtml}${bodyHtml}</article>`;
}

function buildExpandedTabsHtml(b, ledger, activeYm, tab, promises, hide) {
  if (ledger.isClosed) {
    return `
      <div class="b-tabs-wrap" style="padding:10px;">
        <div class="row-between">
          <div>
            <strong>✅ खाते बंद (Final Settlement)</strong>
            <div class="muted">रक्कम: ${formatRupeesInr(b.settlement?.amount || 0, hide)} • दिनांक: ${esc(fmtDateShort(b.settlement?.date))}</div>
          </div>
          <div class="row" style="gap:5px;">
            <button type="button" class="primary sm" data-act="passbook" data-id="${esc(b.id)}">📖 Passbook</button>
            <button type="button" class="success sm" data-act="reopen" data-id="${esc(b.id)}">🔓 Re-open</button>
          </div>
        </div>
      </div>
    `;
  }

  const showBankingV16 = isFeatureEnabled("bankingV16Controls");
  const suggestedPay = ledger.remainingThisMonth > 0 ? ledger.remainingThisMonth : ledger.monthlyInterest;
  const compEval = evaluateCompound(b, activeYm, ledger.pastDuePaise);

  let paneHtml = "";

  if (tab === "ledger") {
    const extraOutLines = (ledger.extraOutList || []).map((tr) => {
      if (tr.kind === "past") return `➕ एक्स्ट्रा ${formatRupeesInr(tr.amount, hide)} → ${esc(fmtYmMr(tr.toYm))} बाकीतून वजा`;
      if (tr.kind === "past_custom") return `➕ एक्स्ट्रा ${formatRupeesInr(tr.amount, hide)} → मागील मॅन्युअल बाकीतून वजा`;
      if (tr.kind === "wallet") return `💼 एक्स्ट्रा ${formatRupeesInr(tr.amount, hide)} → स्वतंत्र अ‍ॅडव्हान्स वॉलेटमध्ये जमा`;
      return `➕ एक्स्ट्रा ${formatRupeesInr(tr.amount, hide)} → ${esc(fmtYmMr(tr.toYm))} अ‍ॅडव्हान्स`;
    });

    const pastRowsHtml = ledger.pastPendingMonths.length
      ? ledger.pastPendingMonths.map((pm) => `<div class="muted" style="font-size:0.74rem;">• <strong>${esc(fmtYmMr(pm.ym))}:</strong> <span class="err">${formatRupeesInr(pm.remaining, hide)}</span>${pm.isManual ? " (मॅन्युअल)" : ""}</div>`).join("")
      : `<div class="ok" style="font-size:0.76rem; font-weight:700;">✅ मागील कोणतीही बाकी नाही.</div>`;

    paneHtml = `
      <div class="b-block">
        <div class="b-block-title">
          <span>चालू महिना वसुली (${esc(fmtYmMr(activeYm))})</span>
          <span class="${ledger.status === "paid" ? "ok" : ledger.status === "partial" ? "warn-text" : "err"}">${esc(ledger.statusLabel)}</span>
        </div>
        <div class="muted" style="margin-bottom:7px; font-size:0.75rem;">
          जमा: <strong class="ok">${formatRupeesInr(ledger.paidThisMonth, hide)}</strong> • चालू बाकी: <strong class="err">${formatRupeesInr(ledger.remainingThisMonth, hide)}</strong>
          ${ledger.lateDays > 0 ? ` • <span class="err">⏰ ${ledger.lateDays}d दंड: ${formatRupeesInr(ledger.lateFee, hide)}</span>` : ""}
        </div>
        <div class="row" style="gap:6px;">
          <input type="number" id="payInp_${esc(b.id)}" value="${suggestedPay}" min="1" step="0.01" style="flex:1; min-width:95px;" />
          <select id="payMode_${esc(b.id)}" style="width:92px;">
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
            <option value="Bank">Bank</option>
          </select>
          <button type="button" class="success sm" data-act="collect-pay" data-id="${esc(b.id)}">जमा करा</button>
          ${(ledger.paidThisMonth > 0 || ledger.extraOutList.length > 0)
            ? `<button type="button" class="danger sm" data-act="reset-pay" data-id="${esc(b.id)}" title="Reset & Auto-Reverse">↺</button>`
            : ""}
        </div>
        ${extraOutLines.length ? `<div class="meta-box" style="margin-top:7px; font-size:0.74rem; border-color:rgba(125,211,252,0.4);">${extraOutLines.join("<br/>")}</div>` : ""}
      </div>

      <div class="b-block">
        <div class="b-block-title">
          <span>मागील बाकी महिने (${formatRupeesInr(ledger.pastDue, hide)})</span>
          <button type="button" class="primary xs" data-act="add-manual-due" data-id="${esc(b.id)}">+/✏️ बाकी लिहा</button>
        </div>
        ${pastRowsHtml}
        ${ledger.pastDue > 0 ? `
          <div class="row" style="margin-top:7px; gap:6px;">
            <button type="button" class="success xs" data-act="pay-past" data-id="${esc(b.id)}">💰 बाकी कपात</button>
          </div>
        ` : ""}
      </div>
    `;
  } else if (tab === "loan") {
    const openingStr = formatPaiseInr(ledger.openingPrincipalPaise, false);
    const nextYmVal = nextYm(activeYm);

    paneHtml = `
      <div class="b-block">
        <div class="b-block-title">
          <span>मुद्दल व इतिहास (मूळ: ${esc(openingStr)})</span>
          <span class="muted" style="font-size:0.68rem;">सुरू: ${esc(fmtYmMr(b.startYm || activeYm))}</span>
        </div>
        <div class="row" style="gap:6px; margin-bottom:6px;">
          <button type="button" class="success sm" style="flex:1;" data-act="add-prin" data-id="${esc(b.id)}">+ अतिरिक्त मुद्दल</button>
          <button type="button" class="primary sm" style="flex:1;" data-act="red-prin" data-id="${esc(b.id)}">▼ मुद्दल कपात</button>
        </div>
        <div class="muted" style="font-size:0.72rem;">
          व्याज पद्धत: <strong>${ledger.interestType === "flat" ? "Flat (मूळ मुद्दलावर)" : "Reducing Balance"}</strong> • दरमहा तारीख: <strong>${b.interestDay || "-"}</strong>
        </div>
      </div>

      ${showBankingV16 ? `
        <div class="b-block">
          <div class="b-block-title">
            <span>💼 स्वतंत्र अ‍ॅडव्हान्स वॉलेट (V16)</span>
            <strong class="purple-text">${formatRupeesInr(ledger.walletBalance, hide)}</strong>
          </div>
          <div class="row" style="gap:6px;">
            <button type="button" class="primary xs" data-act="wallet-add" data-id="${esc(b.id)}">+ वॉलेट जमा</button>
            <button type="button" class="success xs" data-act="wallet-apply" data-id="${esc(b.id)}" ${ledger.walletBalance > 0 ? "" : "disabled style='opacity:0.45;'"}>⚡ व्याजात लागू करा (Apply)</button>
          </div>
        </div>

        <div class="b-block">
          <div class="b-block-title">
            <span>🔁 ऑप्ट-इन चक्रवाढ (v18Compound)</span>
            <span class="badge ${b.v18Compound?.enabled ? "partial" : ""}">${b.v18Compound?.enabled ? "ON" : "OFF"}</span>
          </div>
          <div class="row" style="gap:6px;">
            <button type="button" class="${b.v18Compound?.enabled ? "warn" : "primary"} xs" data-act="comp-toggle" data-id="${esc(b.id)}">${b.v18Compound?.enabled ? "⏸️ बंद करा" : "✅ चालू करा"}</button>
            ${b.v18Compound?.enabled && compEval.eligible
              ? `<button type="button" class="danger xs" data-act="comp-run" data-id="${esc(b.id)}">🔁 थकीत ${formatRupeesInr(compEval.addedInterestRupees, hide)} मुद्दलात जोडा</button>`
              : ""}
          </div>
          <div class="muted" style="font-size:0.68rem; margin-top:4px;">चक्रवाढ महिन्यातून फक्त एकदाच चालते आणि रोख जमा म्हणून मोजले जात नाही.</div>
        </div>

        <div class="b-block">
          <div class="b-block-title">
            <span>🔒 ऐतिहासिक दर व मुद्दल लॉक (v16Terms)</span>
            ${ledger.isLocked ? `<span class="badge paid">🔒 लॉक</span>` : ""}
          </div>
          <div class="grid-2" style="gap:6px;">
            <div class="field">
              <label>दर कालावधी</label>
              <select id="lkPer_${esc(b.id)}">
                <option value="monthly" ${ledger.ratePeriod === "monthly" ? "selected" : ""}>मासिक (Monthly)</option>
                <option value="daily" ${ledger.ratePeriod === "daily" ? "selected" : ""}>दैनिक (Daily)</option>
                <option value="yearly" ${ledger.ratePeriod === "yearly" ? "selected" : ""}>वार्षिक (Actual/365)</option>
              </select>
            </div>
            <div class="field">
              <label>व्याज पद्धत</label>
              <select id="lkTyp_${esc(b.id)}">
                <option value="reducing" ${ledger.interestType === "reducing" ? "selected" : ""}>Reducing</option>
                <option value="flat" ${ledger.interestType === "flat" ? "selected" : ""}>Flat</option>
              </select>
            </div>
            <div class="field"><label>नवीन दर (%)</label><input type="number" step="0.01" id="lkRate_${esc(b.id)}" value="${esc(b.rate || 0)}" /></div>
            <div class="field"><label>नवीन मुद्दल (₹)</label><input type="number" step="1" id="lkPrin_${esc(b.id)}" value="${esc(ledger.principal || 0)}" /></div>
            <div class="field" style="grid-column:1 / -1;"><label>लागू महिना (जुने महिने बदलणार नाहीत)</label><input type="month" id="lkYm_${esc(b.id)}" value="${esc(nextYmVal)}" /></div>
          </div>
          <button type="button" class="success sm" style="width:100%; margin-top:7px;" data-act="save-lock" data-id="${esc(b.id)}">🔒 ऐतिहासिक लॉकसह सेव्ह करा</button>
        </div>
      ` : `<div class="muted" style="font-size:0.73rem; text-align:center;">बँकिंग V16 कंट्रोल्स (वॉलेट, चक्रवाढ, ऐतिहासिक लॉक) साठी वरून <strong>Pro</strong> किंवा <strong>Ultra Mode</strong> निवडा.</div>`}
    `;
  } else if (tab === "contact") {
    const mob = cleanMobile(b.mobile);
    const promListHtml = promises.length
      ? promises.map((p) => `
          <div class="row-between meta-box" style="margin-bottom:5px; padding:6px 8px; ${p.status === "done" ? "opacity:0.55;" : ""}">
            <div>
              <strong style="font-size:0.78rem;">📅 ${esc(fmtDateShort(p.date))}</strong>
              ${p.amount > 0 ? `<span class="badge">₹${p.amount.toLocaleString("en-IN")}</span>` : ""}
              ${p.note ? `<div class="muted" style="font-size:0.69rem;">${esc(p.note)}</div>` : ""}
            </div>
            <div class="row" style="gap:4px;">
              <button type="button" class="${p.status === "done" ? "primary" : "success"} xs" data-act="prom-toggle" data-id="${esc(b.id)}" data-pid="${esc(p.id)}">${p.status === "done" ? "↺" : "✓"}</button>
              <button type="button" class="danger xs" data-act="prom-del" data-id="${esc(b.id)}" data-pid="${esc(p.id)}">🗑️</button>
            </div>
          </div>
        `).join("")
      : `<div class="muted" style="font-size:0.74rem;">वायदा नोंदवलेला नाही.</div>`;

    paneHtml = `
      <div class="b-block">
        <div class="b-block-title">
          <span>मोबाईल व WhatsApp</span>
          <span>${esc(mob || "नंबर नाही")}</span>
        </div>
        <div class="row" style="gap:6px;">
          <button type="button" class="xs" data-act="edit-mob" data-id="${esc(b.id)}">✏️ नंबर</button>
          ${mob.length >= 10 ? `<button type="button" class="success xs" data-act="call" data-mob="${esc(mob)}">📞 Call</button>` : ""}
          <button type="button" class="teal xs" data-act="wa-receipt" data-id="${esc(b.id)}">💬 WA पावती</button>
          <button type="button" class="warn xs" data-act="wa-remind" data-id="${esc(b.id)}">🔔 WA रिमाइंडर</button>
        </div>
      </div>

      <div class="b-block">
        <div class="b-block-title">
          <span>अमर्यादित वायदे (${promises.filter((p) => p.status !== "done").length} सक्रिय)</span>
          <button type="button" class="primary xs" data-act="prom-add" data-id="${esc(b.id)}">+ नवीन वायदा</button>
        </div>
        ${promListHtml}
      </div>

      <div class="b-block">
        <div class="b-block-title">
          <span>📝 खात्याची टीप (Note)</span>
          <button type="button" class="success xs" data-act="save-note" data-id="${esc(b.id)}">💾 सेव्ह</button>
        </div>
        <textarea id="noteInp_${esc(b.id)}" rows="2" style="width:100%;" placeholder="महत्त्वाची टीप लिहा...">${esc(b.note || "")}</textarea>
      </div>
    `;
  } else {
    paneHtml = `
      <div class="b-block">
        <div class="b-block-title"><span>खाते साधने व दस्तऐवज</span></div>
        <div class="grid-2" style="gap:6px;">
          <button type="button" class="primary sm" data-act="full-edit" data-id="${esc(b.id)}">✏️ प्रोफाईल एडिट</button>
          <button type="button" class="primary sm" data-act="passbook" data-id="${esc(b.id)}">📖 Passbook</button>
          <button type="button" class="success sm" data-act="receipt" data-id="${esc(b.id)}">🧾 QR पावती</button>
          <button type="button" class="warn sm" data-act="vachan" data-id="${esc(b.id)}">📄 वचनचिट्ठी</button>
          <button type="button" class="purple sm" data-act="docs" data-id="${esc(b.id)}">📁 डॉक्युमेंट्स</button>
          <button type="button" class="danger sm" data-act="close-acc" data-id="${esc(b.id)}">✅ खाते बंद</button>
          <button type="button" class="danger sm" style="grid-column:1 / -1;" data-act="soft-del" data-id="${esc(b.id)}">🗑️ Recycle Bin मध्ये पाठवा</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="b-tabs-wrap">
      <div class="b-tab-nav">
        <button type="button" class="b-tab-btn ${tab === "ledger" ? "is-active" : ""}" data-card-tab="ledger" data-id="${esc(b.id)}"><span>💰</span><span>हिशोब</span></button>
        <button type="button" class="b-tab-btn ${tab === "loan" ? "is-active" : ""}" data-card-tab="loan" data-id="${esc(b.id)}"><span>🏦</span><span>मुद्दल/दर</span></button>
        <button type="button" class="b-tab-btn ${tab === "contact" ? "is-active" : ""}" data-card-tab="contact" data-id="${esc(b.id)}"><span>📅</span><span>वायदे/संपर्क</span></button>
        <button type="button" class="b-tab-btn ${tab === "tools" ? "is-active" : ""}" data-card-tab="tools" data-id="${esc(b.id)}"><span>🧰</span><span>साधने</span></button>
      </div>
      <div class="b-tab-body">${paneHtml}</div>
    </div>
  `;
}

// =========================================================================
// २. कार्डवरील सर्व इव्हेंट्सचे सुरक्षित नियंत्रण (Event Delegation)
// =========================================================================
function bindListEvents(listEl, rows, activeYm) {
  const findRow = (id) => rows.find((r) => r.b.id === id);

  listEl.onclick = async (ev) => {
    const tabBtn = ev.target.closest("[data-card-tab]");
    if (tabBtn) {
      ev.stopPropagation();
      activeTabByCard.set(tabBtn.getAttribute("data-id"), tabBtn.getAttribute("data-card-tab"));
      renderBorrowersSection(listEl.parentElement);
      return;
    }

    const actBtn = ev.target.closest("[data-act]");
    if (actBtn) {
      ev.stopPropagation();
      const act = actBtn.getAttribute("data-act");
      const id = actBtn.getAttribute("data-id");
      const st = getState();
      const uid = st.user?.uid;
      const email = st.user?.email || "";

      if (act === "call") { triggerCall(actBtn.getAttribute("data-mob")); return; }
      const item = findRow(id);
      if (!item || !uid) return;
      const { b, ledger } = item;

      try {
        if (act === "quick-focus-pay") {
          openCardId = b.id;
          activeTabByCard.set(b.id, "ledger");
          renderBorrowersSection(listEl.parentElement);
          setTimeout(() => document.getElementById(`payInp_${b.id}`)?.focus(), 60);
          return;
        }
        if (act === "collect-pay") {
          if (busyPayIds.has(b.id)) return;
          busyPayIds.add(b.id);
          actBtn.disabled = true;
          try {
            const amt = Number(document.getElementById(`payInp_${b.id}`)?.value || 0);
            const mode = document.getElementById(`payMode_${b.id}`)?.value || "Cash";
            const res = await collectMonthlyPayment(uid, b, { ym: activeYm, amount: amt, mode, userEmail: email });
            if (res.status === "queued_offline") showToast("📴 ऑफलाइन: Encrypted रांगेत सुरक्षित जतन झाले!", "ok");
            else if (res.status === "duplicate") showToast("⚠️ दुहेरी पेमेंट रोखले गेले.", "err");
            else showToast(`✅ ₹${amt.toLocaleString("en-IN")} यशस्वीरित्या जमा झाले!`, "ok");
          } finally {
            setTimeout(() => busyPayIds.delete(b.id), 1200);
          }
          return;
        }
        if (act === "reset-pay") {
          if (!confirm(`${fmtYmMr(activeYm)} ची जमा नोंद Reset व Auto-Reverse करायची का?`)) return;
          await resetMonthPayment(uid, b, activeYm, email);
          showToast("↺ जमा नोंद Reset झाली.", "ok");
          return;
        }
        if (act === "add-manual-due") {
          const mInp = prompt("कोणत्या महिन्याची बाकी लिहायची? (YYYY-MM):", activeYm);
          if (!mInp || !/^\d{4}-\d{2}$/.test(mInp.trim())) return;
          const aInp = Number(prompt(`${fmtYmMr(mInp.trim())} ची बाकी रक्कम (₹):`, String(ledger.monthlyInterest || 0)) || 0);
          if (aInp <= 0) return;
          const prev = Number(b.customPastDues?.[mInp.trim()] || 0);
          await getUserPaths(uid).borrowerDoc(b.id).update({ [`customPastDues.${mInp.trim()}`]: prev + aInp, updatedAt: new Date().toISOString() });
          showToast("✅ मागील बाकी नोंदवली गेली.", "ok");
          return;
        }
        if (act === "pay-past") {
          const amt = Number(prompt(`मागील बाकी (₹${ledger.pastDue}) मधून किती रक्कम जमा झाली?`, String(ledger.pastDue)) || 0);
          if (amt <= 0) return;
          const prevCash = Number(b.customCashPaid?.[activeYm] || 0);
          await getUserPaths(uid).borrowerDoc(b.id).update({
            [`customCashPaid.${activeYm}`]: prevCash + amt,
            paymentHistory: FieldValue.arrayUnion({ date: new Date().toISOString(), ym: activeYm, type: "PAST_DUE_PAID", amount: amt, note: `${activeYm} मागील बाकी जमा` }),
            updatedAt: new Date().toISOString()
          });
          showToast(`✅ मागील बाकीतून ₹${amt} वजा झाले.`, "ok");
          return;
        }
        if (act === "add-prin") {
          const amt = Number(prompt(`अतिरिक्त मुद्दल (₹) किती वाढवायचे?`, "") || 0);
          if (amt <= 0) return;
          const note = prompt("टीप (पर्यायी):", "अतिरिक्त मुद्दल") || "अतिरिक्त मुद्दल";
          await addExtraPrincipal(uid, b, amt, note, email);
          showToast(`✅ अतिरिक्त मुद्दल +₹${amt} जोडले!`, "ok");
          return;
        }
        if (act === "red-prin") {
          const amt = Number(prompt(`मुद्दल ₹${ledger.principal} मधून किती परत आले (कमी करायचे)?`, "") || 0);
          if (amt <= 0) return;
          await reducePrincipal(uid, b, amt, "मुद्दल कपात", email);
          showToast(`✅ मुद्दल -₹${amt} कमी झाले!`, "ok");
          return;
        }
        if (act === "wallet-add") {
          const amt = Number(prompt(`'${b.name}' यांच्या स्वतंत्र अ‍ॅडव्हान्स वॉलेटमध्ये किती रक्कम (₹) जमा करायची?`, "") || 0);
          if (amt <= 0) return;
          await creditAdvanceWallet(uid, b, amt, activeYm, "अ‍ॅडव्हान्स वॉलेट जमा", email);
          showToast(`💼 ₹${amt} वॉलेटमध्ये सुरक्षित जमा!`, "ok");
          return;
        }
        if (act === "wallet-apply") {
          const sug = ledger.totalPayable > 0 ? Math.min(ledger.walletBalance, ledger.totalPayable) : ledger.walletBalance;
          const amt = Number(prompt(`वॉलेट शिल्लक ₹${ledger.walletBalance} मधून व्याजात किती लागू करायचे?`, String(sug)) || 0);
          if (amt <= 0) return;
          await applyAdvanceWalletToMonth(uid, b, amt, activeYm, email);
          showToast(`⚡ वॉलेटमधून ₹${amt} व्याजात लागू केले!`, "ok");
          return;
        }
        if (act === "comp-toggle") {
          await toggleOptInCompound(uid, b, email);
          showToast("🔁 चक्रवाढ सेटिंग अपडेट झाले!", "ok");
          return;
        }
        if (act === "comp-run") {
          if (!confirm(`थकीत व्याज ₹${ledger.pastDue} मुद्दलात जोडायचे का? (रोख जमा म्हणून मोजले जाणार नाही.)`)) return;
          const res = await runOptInCompound(uid, b, activeYm, email);
          showToast(`✅ चक्रवाढ पूर्ण! नवीन मुद्दल ₹${res.newPrincipalRupees}`, "ok");
          return;
        }
        if (act === "save-lock") {
          const terms = {
            ratePeriod: document.getElementById(`lkPer_${b.id}`)?.value || "monthly",
            interestType: document.getElementById(`lkTyp_${b.id}`)?.value || "reducing",
            rate: Number(document.getElementById(`lkRate_${b.id}`)?.value || 0),
            principal: Number(document.getElementById(`lkPrin_${b.id}`)?.value || 0),
            effectiveYm: document.getElementById(`lkYm_${b.id}`)?.value || nextYm(activeYm)
          };
          await saveHistoricalTerms(uid, b, terms, activeYm, email);
          showToast(`🔒 ऐतिहासिक लॉक सेव्ह! नवीन दर ${fmtYmMr(terms.effectiveYm)} पासून लागू.`, "ok");
          return;
        }
        if (act === "edit-mob") {
          const nextM = prompt("१० अंकी मोबाईल नंबर टाका:", b.mobile || "");
          if (nextM === null) return;
          await updateBorrower(uid, b, { mobile: cleanMobile(nextM) }, { saveVersion: false, userEmail: email });
          showToast("✅ मोबाईल नंबर सेव्ह झाला.", "ok");
          return;
        }
        if (act === "edit-guar") {
          const nextG = prompt("जामीनदाराचे नाव:", b.guarantor || "");
          if (nextG === null) return;
          await updateBorrower(uid, b, { guarantor: nextG.trim() }, { saveVersion: false, userEmail: email });
          showToast("✅ जामीनदार अपडेट झाला.", "ok");
          return;
        }
        if (act === "save-note") {
          const txt = document.getElementById(`noteInp_${b.id}`)?.value || "";
          await updateBorrower(uid, b, { note: txt.trim() }, { saveVersion: false, userEmail: email });
          showToast("💾 टीप सेव्ह झाली!", "ok");
          return;
        }
        if (act === "prom-add") {
          const dt = prompt("नवीन वायदा तारीख टाका (YYYY-MM-DD):", getIstTodayIso(3));
          if (!dt || !/^\d{4}-\d{2}-\d{2}$/.test(dt.trim())) return;
          const note = prompt("वायदा टीप (पर्यायी):", "") || "";
          const cur = getUnifiedPromises(b);
          await saveUnifiedPromises(uid, b.id, [...cur, { id: `pr_${Date.now()}`, date: dt.trim(), amount: ledger.totalPayable, note: note.trim(), status: "pending" }]);
          showToast("✅ नवीन वायदा सेव्ह झाला!", "ok");
          return;
        }
        if (act === "prom-toggle") {
          const pid = actBtn.getAttribute("data-pid");
          const next = getUnifiedPromises(b).map((p) => (p.id === pid ? { ...p, status: p.status === "done" ? "pending" : "done" } : p));
          await saveUnifiedPromises(uid, b.id, next);
          return;
        }
        if (act === "prom-del") {
          const pid = actBtn.getAttribute("data-pid");
          await saveUnifiedPromises(uid, b.id, getUnifiedPromises(b).filter((p) => p.id !== pid));
          return;
        }
        if (act === "wa-receipt") {
          const biz = st.profile?.bizName || "व्याज हिशोब वही";
          openWhatsApp(b.mobile, `🧾 *व्याज पावती — ${biz}*\n• ग्राहक: *${b.name}*\n• महिना: *${fmtYmMr(activeYm)}*\n• जमा: *₹${ledger.collectedInMonth.toLocaleString("en-IN")}*\n• एकूण बाकी: *₹${ledger.totalPayable.toLocaleString("en-IN")}*\n• दिनांक: ${fmtDateShort(getIstTodayIso())}`);
          return;
        }
        if (act === "wa-remind") {
          const biz = st.profile?.bizName || "व्याज हिशोब वही";
          openWhatsApp(b.mobile, `नमस्कार *${b.name}*,\nआपली ${fmtYmMr(activeYm)} पर्यंतची एकूण व्याज/बाकी रक्कम *₹${ledger.totalPayable.toLocaleString("en-IN")}* देय आहे.\nकृपया वेळेवर जमा करावी. धन्यवाद!\n— *${biz}*`);
          return;
        }
        if (act === "full-edit") { openEditBorrowerModal(b); return; }
        if (act === "passbook") { openPassbookModal(b); return; }
        if (act === "receipt") { openDigitalReceiptModal(b, ledger, activeYm); return; }
        if (act === "vachan") { openVachanChitthiModal(b, ledger); return; }
        if (act === "docs") { openDocsModal(b); return; }
        if (act === "close-acc") {
          const settle = prompt(`'${b.name}' खाते बंद करण्यासाठी Final Settlement रक्कम (₹):`, String(ledger.principal + ledger.totalPayable));
          if (settle === null) return;
          const note = prompt("टीप:", "संपूर्ण हिशोब पूर्ण") || "";
          await closeAccount(uid, b, Number(settle || 0), note, email);
          showToast("✅ खाते सुरक्षित बंद झाले.", "ok");
          return;
        }
        if (act === "reopen") {
          if (!confirm(`'${b.name}' चे बंद खाते पुन्हा Active करायचे का?`)) return;
          await reopenAccount(uid, b, email);
          showToast("🔓 खाते पुन्हा सुरू झाले.", "ok");
          return;
        }
        if (act === "soft-del") {
          if (!confirm(`'${b.name}' यांना Recycle Bin मध्ये पाठवायचे का?`)) return;
          await softDeleteBorrower(uid, b, email);
          openCardId = null;
          showToast("🗑️ खाते Recycle Bin मध्ये गेले.", "ok");
          return;
        }
      } catch (err) {
        showToast("❌ " + (err?.message || "एरर आला"), "err");
      }
      return;
    }

    const front = ev.target.closest("[data-toggle-card]");
    if (front) {
      const id = front.getAttribute("data-toggle-card");
      openCardId = openCardId === id ? null : id;
      renderBorrowersSection(listEl.parentElement);
    }
  };
}

// डॅशबोर्डवरून थेट विशिष्ट ग्राहकाच्या कार्डवर उडी मारण्यासाठी
export function jumpToBorrowerCard(containerEl, borrowerId) {
  openCardId = borrowerId;
  activeTabByCard.set(borrowerId, "ledger");
  updateFilters({ search: "", status: "all", job: "all", account: "active" });
  renderBorrowersSection(containerEl);
  setTimeout(() => {
    const card = containerEl?.querySelector(`[data-card-id="${borrowerId}"]`);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 90);
}

// =========================================================================
// ३. नवीन ग्राहक / Edit / Passbook / Receipt / Docs / Drill Modals
// =========================================================================
export function openAddBorrowerModal() {
  const st = getState();
  const defRate = st.settings?.defaultRate ?? 2;
  const html = `
    <div class="modal-head">
      <h3>➕ नवीन ग्राहक / कर्ज नोंद</h3>
      <button type="button" class="sm" id="abCloseBtn">✕ बंद</button>
    </div>
    <div class="grid-3">
      <div class="field"><label>ग्राहकाचे नाव *</label><input type="text" id="abName" placeholder="पूर्ण नाव" /></div>
      <div class="field"><label>मोबाईल नंबर</label><input type="tel" id="abMob" placeholder="10 अंकी नंबर" /></div>
      <div class="field"><label>एकूण मुद्दल (₹) *</label><input type="number" id="abPrin" min="1" placeholder="उदा. 50000" /></div>
      <div class="field"><label>व्याज दर (%)</label><input type="number" id="abRate" step="0.01" value="${esc(defRate)}" /></div>
      <div class="field"><label>दर कालावधी</label><select id="abPer"><option value="monthly">मासिक</option><option value="daily">दैनिक</option><option value="yearly">वार्षिक (365)</option></select></div>
      <div class="field"><label>व्याज पद्धत</label><select id="abType"><option value="reducing">Reducing</option><option value="flat">Flat</option></select></div>
      <div class="field"><label>मुद्दल तारीख</label><input type="date" id="abDate" value="${getIstTodayIso()}" /></div>
      <div class="field"><label>हिशोब सुरू महिना</label><input type="month" id="abYm" value="${getIstCurrentYm()}" /></div>
      <div class="field"><label>व्याज तारीख (1-31)</label><input type="number" id="abDay" min="1" max="31" placeholder="उदा. 5" /></div>
      <div class="field"><label>सुरुवातीची मागील बाकी (₹)</label><input type="number" id="abDue" min="0" placeholder="0" /></div>
      <div class="field"><label>जामीनदार</label><input type="text" id="abGuar" placeholder="जामीनदार नाव" /></div>
      <div class="field"><label>नोकरी प्रकार</label><select id="abJob"><option value="">निवडा</option><option value="govt">सरकारी</option><option value="private">खाजगी</option><option value="business">व्यवसाय</option></select></div>
      <div class="field"><label>कंपनी / विभाग</label><input type="text" id="abDept" placeholder="उदा. BMC / Police" /></div>
      <div class="field"><label>वायदा तारीख १</label><input type="date" id="abP1" /></div>
      <div class="field"><label>विलंब दंड (₹/दिन)</label><input type="number" id="abLate" value="0" min="0" /></div>
    </div>
    <div class="field" style="margin-top:8px;"><label>टीप (Note)</label><textarea id="abNote" rows="2"></textarea></div>
    <button type="button" id="abSaveBtn" class="success" style="width:100%; margin-top:10px;">💾 ग्राहक खाते जोडा</button>
  `;

  openModal("addBorrowerModal", html, {
    onAfterRender: (card) => {
      card.querySelector("#abCloseBtn")?.addEventListener("click", () => closeModal("addBorrowerModal"));
      card.querySelector("#abSaveBtn")?.addEventListener("click", async () => {
        const curSt = getState();
        if (!curSt.user) return;
        try {
          await addBorrower(curSt.user.uid, {
            name: card.querySelector("#abName").value,
            mobile: card.querySelector("#abMob").value,
            principal: card.querySelector("#abPrin").value,
            rate: card.querySelector("#abRate").value,
            ratePeriod: card.querySelector("#abPer").value,
            interestType: card.querySelector("#abType").value,
            loanDate: card.querySelector("#abDate").value,
            startYm: card.querySelector("#abYm").value,
            interestDay: card.querySelector("#abDay").value,
            customDue: card.querySelector("#abDue").value,
            guarantor: card.querySelector("#abGuar").value,
            jobType: card.querySelector("#abJob").value,
            companyDept: card.querySelector("#abDept").value,
            promiseDate1: card.querySelector("#abP1").value,
            lateFeePerDay: card.querySelector("#abLate").value,
            note: card.querySelector("#abNote").value
          }, curSt.user.email);
          closeModal("addBorrowerModal");
          showToast("✅ नवीन ग्राहक खाते जोडले गेले!", "ok");
        } catch (err) {
          showToast("❌ " + err.message, "err");
        }
      });
    }
  });
}

export function openEditBorrowerModal(b) {
  const html = `
    <div class="modal-head">
      <h3>✏️ माहिती Edit — ${esc(b.name)}</h3>
      <button type="button" class="sm" id="ebCloseBtn">✕ बंद</button>
    </div>
    <div class="grid-3">
      <div class="field"><label>नाव *</label><input type="text" id="ebName" value="${esc(b.name || "")}" /></div>
      <div class="field"><label>मोबाईल</label><input type="tel" id="ebMob" value="${esc(b.mobile || "")}" /></div>
      <div class="field"><label>सध्याचे मुद्दल (₹)</label><input type="number" id="ebPrin" value="${esc(b.principal || 0)}" /></div>
      <div class="field"><label>मूळ मुद्दल (₹)</label><input type="number" id="ebOrig" value="${esc(b.originalPrincipal || b.principal || 0)}" /></div>
      <div class="field"><label>व्याज दर (%)</label><input type="number" step="0.01" id="ebRate" value="${esc(b.rate || 0)}" /></div>
      <div class="field"><label>निश्चित व्याज (₹)</label><input type="number" id="ebFix" value="${esc(b.fixedMonthlyInterest || 0)}" /></div>
      <div class="field"><label>मुद्दल तारीख</label><input type="date" id="ebDate" value="${esc(b.loanDate || "")}" /></div>
      <div class="field"><label>सुरू महिना</label><input type="month" id="ebYm" value="${esc(b.startYm || "")}" /></div>
      <div class="field"><label>व्याज तारीख (1-31)</label><input type="number" id="ebDay" value="${esc(b.interestDay || "")}" /></div>
      <div class="field"><label>जामीनदार</label><input type="text" id="ebGuar" value="${esc(b.guarantor || "")}" /></div>
      <div class="field"><label>नोकरी</label><select id="ebJob"><option value="">निवडा</option><option value="govt" ${b.jobType === "govt" ? "selected" : ""}>सरकारी</option><option value="private" ${b.jobType === "private" ? "selected" : ""}>खाजगी</option><option value="business" ${b.jobType === "business" ? "selected" : ""}>व्यवसाय</option></select></div>
      <div class="field"><label>कंपनी / विभाग</label><input type="text" id="ebDept" value="${esc(b.companyDept || "")}" /></div>
      <div class="field"><label>रिटायरमेंट तारीख</label><input type="date" id="ebRet" value="${esc(b.retirementDate || "")}" /></div>
      <div class="field"><label>विलंब दंड (₹/दिन)</label><input type="number" id="ebLate" value="${esc(b.lateFeePerDay || 0)}" /></div>
    </div>
    <div class="field" style="margin-top:8px;"><label>टीप</label><textarea id="ebNote" rows="2">${esc(b.note || "")}</textarea></div>
    <button type="button" id="ebSaveBtn" class="success" style="width:100%; margin-top:10px;">💾 बदल सेव्ह करा</button>
  `;

  openModal("editBorrowerModal", html, {
    onAfterRender: (card) => {
      card.querySelector("#ebCloseBtn")?.addEventListener("click", () => closeModal("editBorrowerModal"));
      card.querySelector("#ebSaveBtn")?.addEventListener("click", async () => {
        const curSt = getState();
        if (!curSt.user) return;
        try {
          await updateBorrower(curSt.user.uid, b, {
            name: card.querySelector("#ebName").value.trim(),
            mobile: cleanMobile(card.querySelector("#ebMob").value),
            principal: Number(card.querySelector("#ebPrin").value || 0),
            originalPrincipal: Number(card.querySelector("#ebOrig").value || 0),
            rate: Number(card.querySelector("#ebRate").value || 0),
            fixedMonthlyInterest: Number(card.querySelector("#ebFix").value || 0),
            loanDate: card.querySelector("#ebDate").value || "",
            startYm: card.querySelector("#ebYm").value || b.startYm,
            interestDay: Number(card.querySelector("#ebDay").value || 0),
            guarantor: card.querySelector("#ebGuar").value.trim(),
            jobType: card.querySelector("#ebJob").value || "",
            companyDept: card.querySelector("#ebDept").value.trim(),
            retirementDate: card.querySelector("#ebRet").value || "",
            lateFeePerDay: Number(card.querySelector("#ebLate").value || 0),
            note: card.querySelector("#ebNote").value.trim()
          }, { saveVersion: true, userEmail: curSt.user.email });
          closeModal("editBorrowerModal");
          showToast("✅ माहिती सेव्ह झाली!", "ok");
        } catch (err) {
          showToast("❌ " + err.message, "err");
        }
      });
    }
  });
}

function openPassbookModal(b) {
  const events = [];
  if (b.loanDate || b.createdAt) {
    events.push({ date: String(b.loanDate || b.createdAt).slice(0, 10), type: "कर्ज सुरुवात", pAdd: Number(b.originalPrincipal || b.principal || 0), pRed: 0, iCol: 0, note: `${b.rate || 0}%` });
  }
  (b.extraPrincipals || []).forEach((x) => events.push({ date: String(x.date || "").slice(0, 10), type: x.isCompound ? "चक्रवाढ मुद्दल" : "अतिरिक्त मुद्दल", pAdd: Number(x.amount || 0), pRed: 0, iCol: 0, note: x.note || "" }));
  (b.principalReductions || []).forEach((x) => events.push({ date: String(x.date || "").slice(0, 10), type: "मुद्दल कपात", pAdd: 0, pRed: Number(x.amount || 0), iCol: 0, note: x.note || "" }));
  (b.paymentHistory || []).forEach((x) => events.push({ date: String(x.date || "").slice(0, 10), type: x.mode || "व्याज जमा", pAdd: 0, pRed: 0, iCol: Number(x.amount || 0), note: x.note || x.ym || "" }));
  events.sort((a, c) => String(a.date).localeCompare(String(c.date)));

  let balP = 0n;
  const rowsHtml = events.map((ev) => {
    balP = balP + toPaise(ev.pAdd) - toPaise(ev.pRed);
    if (balP < 0n) balP = 0n;
    return `<tr><td>${esc(fmtDateShort(ev.date))}</td><td><strong>${esc(ev.type)}</strong><div class="muted" style="font-size:0.68rem;">${esc(ev.note)}</div></td><td class="err">${ev.pAdd ? `+₹${ev.pAdd.toLocaleString("en-IN")}` : "-"}</td><td class="ok">${ev.pRed ? `-₹${ev.pRed.toLocaleString("en-IN")}` : "-"}</td><td class="ok">${ev.iCol ? `₹${ev.iCol.toLocaleString("en-IN")}` : "-"}</td><td><strong>${formatPaiseInr(balP)}</strong></td></tr>`;
  }).join("") || `<tr><td colspan="6" style="text-align:center;">नोंद नाही</td></tr>`;

  openModal("passbookModal", `
    <div class="modal-head">
      <h3>📖 Passbook — ${esc(b.name)}</h3>
      <button type="button" class="sm" id="pbCloseBtn">✕ बंद</button>
    </div>
    <div style="overflow-x:auto;">
      <table class="data-tbl">
        <thead><tr><th>तारीख</th><th>तपशील</th><th>मुद्दल (+)</th><th>मुद्दल (-)</th><th>व्याज</th><th>शिल्लक</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `, {
    maxWidth: "740px",
    onAfterRender: (card) => card.querySelector("#pbCloseBtn")?.addEventListener("click", () => closeModal("passbookModal"))
  });
}

function openDigitalReceiptModal(b, ledger, activeYm) {
  const { profile } = getState();
  const biz = profile?.bizName || "व्याज हिशोब वही";
  const upi = profile?.upiId || "";
  const qrAmt = ledger.totalPayable > 0 ? ledger.totalPayable : ledger.monthlyInterest;
  const upiStr = upi ? `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(biz)}&am=${qrAmt}&cu=INR&tn=${encodeURIComponent("Vyaj " + b.name)}` : "";
  const qrUrl = upiStr ? `https://api.qrserver.com/v1/create-qr-code/?size=190x190&data=${encodeURIComponent(upiStr)}` : "";

  const paperHtml = `
    <div class="pw-head">
      <div><h2 class="pw-title">${esc(biz)} — डिजिटल पावती</h2><div class="pw-sub">${esc([profile?.ownerName, profile?.mobile].filter(Boolean).join(" • "))}</div></div>
      <div class="pw-sub">दिनांक: ${esc(fmtDateShort(getIstTodayIso()))}</div>
    </div>
    <table class="pw-tbl">
      <tbody>
        <tr><td><strong>ग्राहक</strong></td><td>${esc(b.name)} (${esc(cleanMobile(b.mobile) || "-")})</td></tr>
        <tr><td><strong>महिना</strong></td><td>${esc(fmtYmMr(activeYm))}</td></tr>
        <tr><td><strong>चालू मुद्दल</strong></td><td class="pw-num">₹${ledger.principal.toLocaleString("en-IN")}</td></tr>
        <tr><td><strong>मासिक व्याज</strong></td><td class="pw-num">₹${ledger.monthlyInterest.toLocaleString("en-IN")}</td></tr>
        <tr><td><strong>या महिन्यात जमा</strong></td><td class="pw-num">₹${ledger.collectedInMonth.toLocaleString("en-IN")}</td></tr>
        <tr><td><strong>एकूण बाकी</strong></td><td class="pw-num"><strong>₹${ledger.totalPayable.toLocaleString("en-IN")}</strong></td></tr>
      </tbody>
    </table>
  `;

  openModal("receiptModal", `
    <div class="modal-head">
      <h3>🧾 डिजिटल पावती व UPI QR</h3>
      <button type="button" class="sm" id="rcCloseBtn">✕ बंद</button>
    </div>
    <div class="meta-box" style="margin-bottom:10px;">
      <div class="row-between"><strong>${esc(b.name)}</strong><span class="badge">${esc(fmtYmMr(activeYm))}</span></div>
      <div class="row-between" style="margin-top:6px;"><span class="muted">चालू मुद्दल</span><strong>₹${ledger.principal.toLocaleString("en-IN")}</strong></div>
      <div class="row-between"><span class="muted">मासिक व्याज</span><strong>₹${ledger.monthlyInterest.toLocaleString("en-IN")}</strong></div>
      <div class="row-between"><span class="muted">जमा व्याज</span><strong class="ok">₹${ledger.collectedInMonth.toLocaleString("en-IN")}</strong></div>
      <div class="row-between"><span class="muted">एकूण बाकी</span><strong class="err">₹${ledger.totalPayable.toLocaleString("en-IN")}</strong></div>
      ${qrUrl ? `<div style="text-align:center; margin-top:10px;"><img src="${qrUrl}" alt="UPI QR" style="width:170px; height:170px; border-radius:10px; background:#fff; padding:6px;" /><div class="muted" style="margin-top:4px;">UPI: ${esc(upi)}</div></div>` : `<div class="muted" style="text-align:center; margin-top:8px;">QR साठी बिझनेस प्रोफाईलमध्ये UPI ID सेव्ह करा.</div>`}
    </div>
    <div class="row" style="gap:6px;">
      <button type="button" class="primary sm" style="flex:1;" id="rcPrintBtn">🖨️ प्रिंट / PDF</button>
      <button type="button" class="success sm" style="flex:1;" id="rcWaBtn">💬 WhatsApp</button>
    </div>
  `, {
    maxWidth: "460px",
    onAfterRender: (card) => {
      card.querySelector("#rcCloseBtn")?.addEventListener("click", () => closeModal("receiptModal"));
      card.querySelector("#rcPrintBtn")?.addEventListener("click", () => printPureWhiteA4(paperHtml));
      card.querySelector("#rcWaBtn")?.addEventListener("click", () => {
        openWhatsApp(b.mobile, `*${biz}* — डिजिटल पावती\nग्राहक: *${b.name}*\nमहिना: ${fmtYmMr(activeYm)}\nमुद्दल: ₹${ledger.principal.toLocaleString("en-IN")}\nजमा व्याज: ₹${ledger.collectedInMonth.toLocaleString("en-IN")}\nएकूण बाकी: *₹${ledger.totalPayable.toLocaleString("en-IN")}*${upi ? `\nUPI ID: ${upi}` : ""}`);
      });
    }
  });
}

function openVachanChitthiModal(b, ledger) {
  const { profile } = getState();
  const biz = profile?.bizName || "व्याज हिशोब वही";
  const bodyHtml = `
    <div style="border:1.5px solid #222; padding:14px; line-height:1.8;">
      <h2 style="text-align:center; margin:0;">${esc(biz)}</h2>
      <h3 style="text-align:center; margin:4px 0 10px;">वचनचिट्ठी (Promissory Note)</h3>
      <div style="text-align:right;"><strong>दिनांक:</strong> ${esc(fmtDateShort(getIstTodayIso()))}</div>
      <p>मी <strong>${esc(b.name)}</strong> (मोबाईल: ${esc(cleanMobile(b.mobile) || "-")}, जामीनदार: <strong>${esc(b.guarantor || "-")}</strong>), रक्कम <strong>₹${ledger.principal.toLocaleString("en-IN")}</strong> मुद्दल म्हणून घेतली असून दरमहा <strong>${b.interestDay || 10} तारखेला ₹${ledger.monthlyInterest.toLocaleString("en-IN")}</strong> व्याज वेळेवर परत करण्याची हमी देतो/देते.</p>
      <div style="display:flex; justify-content:space-between; margin-top:42px;"><div>__________________<br/>ग्राहकाची सही</div><div>__________________<br/>जामीनदाराची सही</div></div>
    </div>
  `;
  printPureWhiteA4(bodyHtml);
}

function openDocsModal(b) {
  const st = getState();
  if (!st.user) return;
  const uid = st.user.uid;

  const renderDocs = async (card) => {
    const grid = card.querySelector("#docsGridBox");
    if (!grid) return;
    grid.innerHTML = `<div class="muted">लोड होत आहे...</div>`;
    try {
      const snap = await getUserPaths(uid).borrowerDocs(b.id).orderBy("uploadedAt", "desc").get();
      if (snap.empty) { grid.innerHTML = `<div class="muted">अजून कोणतेही डॉक्युमेंट नाही.</div>`; return; }
      grid.innerHTML = snap.docs.map((d) => {
        const doc = d.data();
        return `<div class="meta-box" style="text-align:center;"><img src="${doc.dataUrl}" alt="${esc(doc.docName || "Doc")}" style="max-width:100%; max-height:150px; border-radius:8px;" /><div style="margin-top:5px; font-weight:700;">${esc(doc.docName || "डॉक्युमेंट")}</div><button type="button" class="danger xs" style="margin-top:5px;" data-del-doc="${esc(d.id)}">🗑️ डिलीट</button></div>`;
      }).join("");
      grid.querySelectorAll("[data-del-doc]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("हे डॉक्युमेंट डिलीट करायचे का?")) return;
          await getUserPaths(uid).borrowerDocs(b.id).doc(btn.getAttribute("data-del-doc")).delete();
          renderDocs(card);
        });
      });
    } catch (err) {
      grid.innerHTML = `<div class="err">${esc(err.message)}</div>`;
    }
  };

  openModal("docsModal", `
    <div class="modal-head">
      <h3>📁 डॉक्युमेंट्स — ${esc(b.name)}</h3>
      <button type="button" class="sm" id="dmCloseBtn">✕ बंद</button>
    </div>
    <div class="row" style="margin-bottom:10px;">
      <input type="text" id="dmName" placeholder="डॉक्युमेंटचे नाव" style="flex:1; min-width:140px;" />
      <input type="file" id="dmFile" accept="image/jpeg,image/png,image/webp" />
      <button type="button" class="success sm" id="dmUpBtn">⬆️ Upload</button>
    </div>
    <div id="docsGridBox" class="grid-2"></div>
  `, {
    onAfterRender: (card) => {
      card.querySelector("#dmCloseBtn")?.addEventListener("click", () => closeModal("docsModal"));
      card.querySelector("#dmUpBtn")?.addEventListener("click", async () => {
        const name = card.querySelector("#dmName").value.trim();
        const file = card.querySelector("#dmFile").files?.[0];
        if (!name || !file) { showToast("नाव व फोटो निवडा.", "err"); return; }
        if (file.size > 5 * 1024 * 1024) { showToast("फोटो 5MB पेक्षा लहान असावा.", "err"); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = async () => {
            const scale = Math.min(1, 800 / img.width);
            const c = document.createElement("canvas");
            c.width = Math.round(img.width * scale);
            c.height = Math.round(img.height * scale);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            await getUserPaths(uid).borrowerDocs(b.id).add({ docName: name, dataUrl: c.toDataURL("image/jpeg", 0.65), uploadedAt: new Date().toISOString() });
            card.querySelector("#dmName").value = "";
            card.querySelector("#dmFile").value = "";
            showToast("✅ डॉक्युमेंट अपलोड झाले!", "ok");
            renderDocs(card);
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
      renderDocs(card);
    }
  });
}

// डॅशबोर्ड KPI कार्ड्सवरील क्लिकसाठी तपशील यादी (मुद्दल / व्याज / जमा)
export function openDrillListModal(drillType, onJumpBorrower) {
  const { ui } = getState();
  const report = getUnifiedMonthReport();
  const active = report.rows.filter(({ ledger }) => !ledger.isClosed);

  let title = "एकूण मुद्दल यादी";
  let list = active.map(({ b, ledger }) => ({ b, val: ledger.principal, sub: `दर: ${b.rate || 0}% • व्याज: ${formatRupeesInr(ledger.monthlyInterest, ui.hideAmounts)}` }));

  if (drillType === "interest") {
    title = `मासिक व्याज यादी (${fmtYmMr(report.ym)})`;
    list = active.map(({ b, ledger }) => ({ b, val: ledger.monthlyInterest, sub: `मुद्दल: ${formatRupeesInr(ledger.principal, ui.hideAmounts)} • स्थिती: ${ledger.statusLabel}` }));
  } else if (drillType === "collected") {
    title = `जमा व्याज यादी (${fmtYmMr(report.ym)})`;
    list = active.filter(({ ledger }) => ledger.collectedInMonth > 0).map(({ b, ledger }) => ({ b, val: ledger.collectedInMonth, sub: `मासिक: ${formatRupeesInr(ledger.monthlyInterest, ui.hideAmounts)} • बाकी: ${formatRupeesInr(ledger.totalPayable, ui.hideAmounts)}` }));
  }

  list.sort((a, c) => c.val - a.val);
  const totalSum = list.reduce((s, x) => s + x.val, 0);

  openModal("drillListModal", `
    <div class="modal-head">
      <div><h3>📊 ${esc(title)}</h3><div class="muted">${list.length} खाती • एकूण: <strong>${formatRupeesInr(totalSum, ui.hideAmounts)}</strong></div></div>
      <button type="button" class="sm" id="dlCloseBtn">✕ बंद</button>
    </div>
    <div style="max-height:62vh; overflow-y:auto;">
      ${list.map((x, i) => `
        <div class="meta-box row-between" style="margin-bottom:6px; cursor:pointer;" data-dl-jump="${esc(x.b.id)}">
          <div><strong>${i + 1}. ${esc(x.b.name)}</strong><div class="muted" style="font-size:0.71rem;">${x.sub}</div></div>
          <strong class="gold-text">${formatRupeesInr(x.val, ui.hideAmounts)}</strong>
        </div>
      `).join("") || `<div class="muted" style="text-align:center; padding:16px;">नोंद नाही.</div>`}
    </div>
  `, {
    onAfterRender: (card) => {
      card.querySelector("#dlCloseBtn")?.addEventListener("click", () => closeModal("drillListModal"));
      card.querySelectorAll("[data-dl-jump]").forEach((el) => {
        el.addEventListener("click", () => {
          closeModal("drillListModal");
          onJumpBorrower?.(el.getAttribute("data-dl-jump"));
        });
      });
    }
  });
}
