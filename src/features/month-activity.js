// व्याज Infinity X - '📋 महिना नोंदी' व Shared Monthly Activity Analyzer (कार्ड, नोंदी व PDF मध्ये १००% एकच हिशोब) (src/features/month-activity.js)

import { getState, getUnifiedMonthReport } from "../core/store.js";
import {
  extractYm, fmtYmMr, formatPaiseInr, formatRupeesInr, toPaise, paiseToRupees, prevYm, computeBorrowerLedger
} from "../core/ledger-v16.js";
import { esc, fmtDateShort, openModal, closeModal, printPureWhiteA4 } from "../ui/dom-utils.js";

let activeTab = "newAcc"; // newAcc | principal | interest | udhaari
let searchQuery = "";

// एकाच वेळी ६+ बल्क-इम्पोर्ट केलेली जुनी खाती ओळखा (ती 'नवीन खाती' मध्ये चुकून येऊ नयेत)
function detectBulkImportBuckets(rows) {
  const counts = new Map();
  rows.forEach(({ b }) => {
    const slot = String(b.createdAt || "").slice(0, 15);
    if (slot) counts.set(slot, (counts.get(slot) || 0) + 1);
  });
  return counts;
}

function isTrulyNewInMonth(b, ledger, ym, bulkBuckets) {
  if (ledger.pastDuePaise > 0n) return false;
  if (ledger.pastPendingMonths.length > 0) return false;
  if (b.customPastDues && Object.keys(b.customPastDues).length > 0) return false;

  const loanYm = extractYm(b.loanDate);
  const startYm = extractYm(b.startYm);
  const createdYm = extractYm(b.createdAt);
  if (loanYm && loanYm !== ym) return false;

  const slot = String(b.createdAt || "").slice(0, 15);
  const isBulk = Boolean(slot && (bulkBuckets.get(slot) || 0) >= 6);
  if (isBulk && !b.isManualNew) {
    const lDay = String(b.loanDate || "").slice(0, 10);
    const cDay = String(b.createdAt || "").slice(0, 10);
    if (!loanYm || lDay === cDay) return false;
  }

  if (loanYm === ym) return true;
  if (!loanYm && startYm === ym && createdYm === ym && !isBulk) return true;
  return false;
}

// एक्स्ट्रा जमा रकमेचा १००% अचूक शेरा (मागील बाकी / मॅन्युअल बाकी / वॉलेट / अ‍ॅडव्हान्स)
function buildExtraAllocationNote(b, ledger, ym) {
  if (ledger.collectedInMonthPaise <= ledger.monthlyInterestPaise) {
    return { extraPaise: 0n, note: "-" };
  }
  const extraP = ledger.collectedInMonthPaise - ledger.monthlyInterestPaise;

  // १. जर थेट extraOut मध्ये नोंद असेल तर तीच १००% अचूक वापरा
  if (Array.isArray(ledger.extraOutList) && ledger.extraOutList.length > 0) {
    const parts = ledger.extraOutList.map((tr) => {
      if (tr.kind === "past") return `+₹${tr.amount} (${fmtYmMr(tr.toYm)} बाकीतून वजा)`;
      if (tr.kind === "past_custom") return `+₹${tr.amount} (मागील मॅन्युअल बाकीतून वजा)`;
      if (tr.kind === "wallet") return `+₹${tr.amount} (स्वतंत्र अ‍ॅडव्हान्स वॉलेट)`;
      return `+₹${tr.amount} (${fmtYmMr(tr.toYm)} अ‍ॅडव्हान्स)`;
    });
    return { extraPaise: extraP, note: parts.join(", ") };
  }

  // २. आत्ताही मागील बाकी शिल्लक असल्यास एक्स्ट्रा रक्कम मागील बाकीतूनच वजा झाली आहे
  if (ledger.pastDuePaise > 0n) {
    const hasManual = Boolean(b.customPastDues && Object.keys(b.customPastDues).length > 0);
    return {
      extraPaise: extraP,
      note: `+${formatPaiseInr(extraP)} (${hasManual ? "मागील मॅन्युअल बाकीतून वजा" : "मागील बाकीतून वजा"})`
    };
  }

  // ३. मागील महिन्याची बाकी तपासा
  const pYm = prevYm(ym);
  const startYm = extractYm(b.startYm);
  if (pYm && (!startYm || pYm >= startYm)) {
    const prevLedger = computeBorrowerLedger(b, pYm);
    if (prevLedger.totalPayablePaise > 0n) {
      return { extraPaise: extraP, note: `+${formatPaiseInr(extraP)} (मागील बाकीतून वजा)` };
    }
  }

  return { extraPaise: extraP, note: `+${formatPaiseInr(extraP)} (पुढील महिन्यात अ‍ॅडव्हान्स)` };
}

// Single Source of Truth: महिना नोंदी आणि Master PDF दोन्ही हाच एकत्रित डेटा वापरतील
export function analyzeMonthlyActivity(forceYm) {
  const report = getUnifiedMonthReport(forceYm);
  const ym = report.ym;
  const bulkBuckets = detectBulkImportBuckets(report.rows);

  const enrichedRows = [];
  const newAccounts = [];
  const principalMoves = [];
  const interestMoves = [];

  let newAccSumP = 0n;
  let extraPrinAddP = 0n;
  let extraPrinRedP = 0n;
  let compoundedSumP = 0n;
  let interestColP = 0n;

  report.rows.forEach(({ b, ledger }) => {
    const pe = ledger.principalEvents;
    const isNew = isTrulyNewInMonth(b, ledger, ym, bulkBuckets);
    const extraInfo = buildExtraAllocationNote(b, ledger, ym);

    // बंद खात्यात कोणतीच हालचाल नसेल तर वगळा
    if (ledger.isClosed && !isNew && pe.items.length === 0 && ledger.collectedInMonthPaise <= 0n) return;

    if (isNew) {
      const initP = ledger.openingPrincipalPaise;
      newAccSumP += initP;
      newAccounts.push({
        id: b.id, name: b.name || "ग्राहक",
        amount: paiseToRupees(initP), date: b.loanDate || ym,
        rate: b.rate || 0, guarantor: b.guarantor || ""
      });
    }

    extraPrinAddP += pe.addedPaise;
    extraPrinRedP += pe.reducedPaise;
    compoundedSumP += pe.compoundedPaise;
    pe.items.forEach((it) => {
      principalMoves.push({ id: b.id, name: b.name || "ग्राहक", ...it });
    });

    if (ledger.collectedInMonthPaise > 0n) {
      interestColP += ledger.collectedInMonthPaise;
      const curPaidP = ledger.collectedInMonthPaise < ledger.monthlyInterestPaise
        ? ledger.collectedInMonthPaise
        : ledger.monthlyInterestPaise;
      interestMoves.push({
        id: b.id, name: b.name || "ग्राहक",
        monthlyInterest: ledger.monthlyInterest,
        currentInterestPaid: paiseToRupees(curPaidP),
        collected: ledger.collectedInMonth,
        extraPaise: extraInfo.extraPaise,
        extraNote: extraInfo.note === "-" ? "" : extraInfo.note
      });
    }

    enrichedRows.push({ b, ledger, isNew, extraInfo });
  });

  // स्वतंत्र उधारी हालचाल (दिलेली + परत मिळालेली)
  const udMoves = [];
  let udGivenInMonthP = 0n;
  let udRetInMonthP = 0n;

  (getState().udhaari || []).forEach((u) => {
    if (!u || u.isDeleted) return;
    const gYm = extractYm(u.givenYm || u.givenDate);
    if (gYm === ym) {
      const amtP = toPaise(u.amount || 0);
      udGivenInMonthP += amtP;
      udMoves.push({ kind: "given", name: u.name || "व्यक्ती", amount: paiseToRupees(amtP), date: u.givenDate || ym, note: u.promiseDate ? `वायदा: ${fmtDateShort(u.promiseDate)}` : (u.note || "") });
    }
    const pays = Array.isArray(u.payments) ? u.payments : [];
    if (pays.length) {
      pays.forEach((p) => {
        if (extractYm(p.ym || p.date) === ym && toPaise(p.amount || 0) > 0n) {
          const pP = toPaise(p.amount || 0);
          udRetInMonthP += pP;
          udMoves.push({ kind: "returned", name: u.name || "व्यक्ती", amount: paiseToRupees(pP), date: p.date || ym, note: `घेतले: ${fmtYmMr(gYm)}` });
        }
      });
    } else if (extractYm(u.returnedYm || u.returnedDate) === ym && toPaise(u.paidAmount || 0) > 0n) {
      const pP = toPaise(u.paidAmount || 0);
      udRetInMonthP += pP;
      udMoves.push({ kind: "returned", name: u.name || "व्यक्ती", amount: paiseToRupees(pP), date: u.returnedDate || ym, note: `घेतले: ${fmtYmMr(gYm)}` });
    }
  });

  // टीप: चक्रवाढ (compoundedSumP) रोख खर्चात किंवा रोख जमेत कधीही मिसळत नाही
  const totalOutCash = paiseToRupees(newAccSumP + extraPrinAddP + udGivenInMonthP);
  const totalInCash = paiseToRupees(interestColP + extraPrinRedP + udRetInMonthP);

  return {
    report,
    ym,
    enrichedRows,
    newAccounts,
    principalMoves,
    interestMoves,
    udMoves,
    totals: {
      newAccSum: paiseToRupees(newAccSumP),
      extraPrinAdd: paiseToRupees(extraPrinAddP),
      extraPrinRed: paiseToRupees(extraPrinRedP),
      compoundedSum: paiseToRupees(compoundedSumP),
      interestCol: paiseToRupees(interestColP),
      udGivenInMonth: paiseToRupees(udGivenInMonthP),
      udRetInMonth: paiseToRupees(udRetInMonthP),
      totalOutCash,
      totalInCash
    }
  };
}

export function openMonthActivityModal() {
  const renderInner = () => {
    const st = getState();
    const d = analyzeMonthlyActivity();
    const t = d.totals;
    const hide = st.ui.hideAmounts;
    const q = searchQuery.trim().toLowerCase();

    let rowsHtml = "";
    if (activeTab === "newAcc") {
      const list = d.newAccounts.filter((x) => !q || `${x.name} ${x.guarantor}`.toLowerCase().includes(q));
      rowsHtml = list.length
        ? list.map((x) => `
            <div class="meta-box row-between" style="margin-bottom:6px; border-left:3px solid var(--gold);">
              <div><strong>🆕 ${esc(x.name)}</strong><div class="muted" style="font-size:0.7rem;">📅 ${esc(fmtDateShort(x.date))} • दर: ${esc(x.rate)}%${x.guarantor ? ` • ${esc(x.guarantor)}` : ""}</div></div>
              <strong class="gold-text">${formatRupeesInr(x.amount, hide)}</strong>
            </div>
          `).join("")
        : `<div class="muted" style="text-align:center; padding:18px;">या महिन्यात कोणतेही नवीन खाते जोडलेले नाही.</div>`;
    } else if (activeTab === "principal") {
      const list = d.principalMoves.filter((x) => !q || `${x.name} ${x.note}`.toLowerCase().includes(q));
      rowsHtml = list.length
        ? list.map((x) => {
            const isComp = x.kind === "compound";
            const isAdd = x.kind === "add";
            const col = isComp ? "var(--warn)" : isAdd ? "var(--gold)" : "var(--accent-2)";
            const lbl = isComp ? "🔁 चक्रवाढ (रोख नाही)" : isAdd ? "➕ अतिरिक्त दिले" : "➖ मुद्दल परत";
            return `
              <div class="meta-box row-between" style="margin-bottom:6px; border-left:3px solid ${col};">
                <div><strong>${esc(x.name)}</strong><div class="muted" style="font-size:0.7rem;">📅 ${esc(fmtDateShort(x.date))} • ${lbl}${x.note ? ` • ${esc(x.note)}` : ""}</div></div>
                <strong style="color:${col};">${isAdd || isComp ? "+" : "-"}${formatRupeesInr(x.amount, hide)}</strong>
              </div>
            `;
          }).join("")
        : `<div class="muted" style="text-align:center; padding:18px;">या महिन्यात मुद्दल हालचाल नाही.</div>`;
    } else if (activeTab === "interest") {
      const list = d.interestMoves.filter((x) => !q || `${x.name} ${x.extraNote}`.toLowerCase().includes(q));
      rowsHtml = list.length
        ? list.map((x) => `
            <div class="meta-box row-between" style="margin-bottom:6px; border-left:3px solid var(--accent-2);">
              <div>
                <strong>💰 ${esc(x.name)}</strong>
                <div class="muted" style="font-size:0.7rem;">चालू जमा: ${formatRupeesInr(x.currentInterestPaid, hide)} (मासिक: ${formatRupeesInr(x.monthlyInterest, hide)})</div>
                ${x.extraNote ? `<div style="font-size:0.71rem; color:var(--accent); font-weight:700;">💡 ${esc(x.extraNote)}</div>` : ""}
              </div>
              <strong class="ok">+${formatRupeesInr(x.collected, hide)}</strong>
            </div>
          `).join("")
        : `<div class="muted" style="text-align:center; padding:18px;">या महिन्यात अजून व्याज जमा नाही.</div>`;
    } else {
      const list = d.udMoves.filter((x) => !q || `${x.name} ${x.note}`.toLowerCase().includes(q));
      rowsHtml = list.length
        ? list.map((x) => `
            <div class="meta-box row-between" style="margin-bottom:6px; border-left:3px solid var(--purple);">
              <div><strong>🤝 ${esc(x.name)}</strong><div class="muted" style="font-size:0.7rem;">📅 ${esc(fmtDateShort(x.date))} • ${x.kind === "given" ? "उधारी दिली" : "उधारी परत"}${x.note ? ` • ${esc(x.note)}` : ""}</div></div>
              <strong style="color:${x.kind === "given" ? "var(--gold)" : "var(--accent-2)"};">${x.kind === "given" ? "-" : "+"}${formatRupeesInr(x.amount, hide)}</strong>
            </div>
          `).join("")
        : `<div class="muted" style="text-align:center; padding:18px;">या महिन्यात उधारी हालचाल नाही.</div>`;
    }

    const html = `
      <div class="modal-head">
        <div>
          <h3>📋 महिना नोंदी (${esc(fmtYmMr(d.ym))})</h3>
          <div class="muted" style="font-size:0.7rem;">Single Source of Truth • रोख व चक्रवाढ स्वतंत्र</div>
        </div>
        <div class="row" style="gap:5px;">
          <button type="button" class="primary xs" id="maPdfBtn">🖨️ PDF</button>
          <button type="button" class="xs" id="maCloseBtn">✕</button>
        </div>
      </div>

      <div class="grid-2" style="margin-bottom:9px;">
        <div class="meta-box">
          <div class="muted" style="font-size:0.68rem;">📤 या महिन्यात दिलेले रोख पैसे</div>
          <div class="gold-text" style="font-size:1rem; font-weight:900;">${formatRupeesInr(t.totalOutCash, hide)}</div>
          <div class="muted" style="font-size:0.65rem;">नवीन: ${formatRupeesInr(t.newAccSum, hide)} • अति.: ${formatRupeesInr(t.extraPrinAdd, hide)} • उधारी: ${formatRupeesInr(t.udGivenInMonth, hide)}</div>
        </div>
        <div class="meta-box">
          <div class="muted" style="font-size:0.68rem;">📥 या महिन्यात आलेले रोख पैसे</div>
          <div class="ok" style="font-size:1rem; font-weight:900;">${formatRupeesInr(t.totalInCash, hide)}</div>
          <div class="muted" style="font-size:0.65rem;">व्याज: ${formatRupeesInr(t.interestCol, hide)} • मुद्दल: ${formatRupeesInr(t.extraPrinRed, hide)} • उधारी: ${formatRupeesInr(t.udRetInMonth, hide)}</div>
        </div>
      </div>

      ${t.compoundedSum > 0 ? `<div class="meta-box" style="margin-bottom:8px; font-size:0.73rem;">🔁 चक्रवाढ मुद्दल (रोख नाही): <strong class="warn-text">${formatRupeesInr(t.compoundedSum, hide)}</strong></div>` : ""}

      <div class="tab-row-2">
        <button type="button" class="seg-btn ${activeTab === "newAcc" ? "is-active" : ""}" data-matab="newAcc">🆕 नवीन खाती (${d.newAccounts.length})</button>
        <button type="button" class="seg-btn ${activeTab === "principal" ? "is-active" : ""}" data-matab="principal">➕ अति./चक्रवाढ (${d.principalMoves.length})</button>
        <button type="button" class="seg-btn ${activeTab === "interest" ? "is-active" : ""}" data-matab="interest">💰 व्याज/एक्स्ट्रा (${d.interestMoves.length})</button>
        <button type="button" class="seg-btn ${activeTab === "udhaari" ? "is-active" : ""}" data-matab="udhaari">🤝 उधारी (${d.udMoves.length})</button>
      </div>

      <input type="text" id="maSearchInp" class="search-input" value="${esc(searchQuery)}" placeholder="🔍 नोंदीत नाव शोधा..." />
      <div style="max-height:44vh; overflow-y:auto;">${rowsHtml}</div>
    `;

    openModal("monthActivityModal", html, {
      onAfterRender: (card) => {
        card.querySelector("#maCloseBtn")?.addEventListener("click", () => closeModal("monthActivityModal"));
        card.querySelectorAll("[data-matab]").forEach((btn) => {
          btn.addEventListener("click", () => { activeTab = btn.getAttribute("data-matab"); renderInner(); });
        });
        const inp = card.querySelector("#maSearchInp");
        inp?.addEventListener("input", () => {
          searchQuery = inp.value;
          const pos = inp.selectionStart || searchQuery.length;
          renderInner();
          const next = document.getElementById("maSearchInp");
          if (next) { next.focus(); next.setSelectionRange(pos, pos); }
        });
        card.querySelector("#maPdfBtn")?.addEventListener("click", () => {
          const biz = st.profile?.bizName || "व्याज हिशोब वही";
          const newR = d.newAccounts.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td>${esc(fmtDateShort(x.date))}</td><td class="pw-num">${formatRupeesInr(x.amount)}</td><td class="pw-num">${esc(x.rate)}%</td></tr>`).join("") || `<tr><td colspan="5" style="text-align:center;">नोंद नाही</td></tr>`;
          const prR = d.principalMoves.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td>${esc(fmtDateShort(x.date))}</td><td>${x.kind === "compound" ? "चक्रवाढ (रोख नाही)" : x.kind === "add" ? "अतिरिक्त दिले" : "परत आले"}</td><td class="pw-num">${formatRupeesInr(x.amount)}</td></tr>`).join("") || `<tr><td colspan="5" style="text-align:center;">नोंद नाही</td></tr>`;
          const intR = d.interestMoves.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td class="pw-num">${formatRupeesInr(x.monthlyInterest)}</td><td class="pw-num">${formatRupeesInr(x.collected)}</td><td>${esc(x.extraNote || "-")}</td></tr>`).join("") || `<tr><td colspan="5" style="text-align:center;">नोंद नाही</td></tr>`;
          const udR = d.udMoves.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td>${esc(fmtDateShort(x.date))}</td><td>${x.kind === "given" ? "उधारी दिली" : "परत मिळाली"}</td><td class="pw-num">${formatRupeesInr(x.amount)}</td></tr>`).join("") || `<tr><td colspan="5" style="text-align:center;">नोंद नाही</td></tr>`;

          printPureWhiteA4(`
            <div class="pw-head">
              <div><h2 class="pw-title">${esc(biz)} — महिना नोंदी (${esc(fmtYmMr(d.ym))})</h2></div>
              <div class="pw-sub">रोख दिले: ${formatRupeesInr(t.totalOutCash)} | रोख आले: ${formatRupeesInr(t.totalInCash)}</div>
            </div>
            <div class="pw-sec-title" style="border-top:none;">१. नवीन खाती (${d.newAccounts.length})</div>
            <table class="pw-tbl"><thead><tr><th>क्र.</th><th>नाव</th><th>तारीख</th><th class="pw-num">मुद्दल</th><th class="pw-num">दर</th></tr></thead><tbody>${newR}</tbody></table>
            <div class="pw-sec-title">२. अतिरिक्त / परत / चक्रवाढ मुद्दल (${d.principalMoves.length})</div>
            <table class="pw-tbl"><thead><tr><th>क्र.</th><th>नाव</th><th>तारीख</th><th>प्रकार</th><th class="pw-num">रक्कम</th></tr></thead><tbody>${prR}</tbody></table>
            <div class="pw-sec-title">३. रोख जमा व्याज (${d.interestMoves.length})</div>
            <table class="pw-tbl"><thead><tr><th>क्र.</th><th>नाव</th><th class="pw-num">मासिक व्याज</th><th class="pw-num">जमा</th><th>एक्स्ट्रा शेरा</th></tr></thead><tbody>${intR}</tbody></table>
            <div class="pw-sec-title">४. स्वतंत्र उधारी हालचाल (${d.udMoves.length})</div>
            <table class="pw-tbl"><thead><tr><th>क्र.</th><th>नाव</th><th>तारीख</th><th>प्रकार</th><th class="pw-num">रक्कम</th></tr></thead><tbody>${udR}</tbody></table>
          `);
        });
      }
    });
  };

  renderInner();
}
