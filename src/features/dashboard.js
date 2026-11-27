// व्याज Infinity X - Reactive Single-Signal Dashboard (Zero Blinking + 3 Operating Modes + Dual-Ring Split + Promises + Date-Wise Day Summary) (src/features/dashboard.js)

import { getState, setState, getUnifiedMonthReport } from "../core/store.js";
import { getOperatingMode, setOperatingMode, isFeatureEnabled } from "../core/feature-flags.js";
import {
  formatRupeesInr, fmtYmMr, getIstTodayIso, getIstParts, parseStrictDate, toPaise, paiseToRupees
} from "../core/ledger-v16.js";
import { getLastBackupMeta } from "../data/backup-vault.js";
import { updateBorrower } from "../data/borrowers-repo.js";
import {
  esc, fmtDateShort, cleanMobile, triggerCall, openWhatsApp, openModal, closeModal, buildRingSvg, showToast, printPureWhiteA4
} from "../ui/dom-utils.js";

let promiseExpanded = false;
let promiseTab = "today"; // today | tomorrow | overdue
let lastDashSig = "";
let pendingModalTab = "current"; // current | past
let pendingSearch = "";
let daySummaryDateIso = ""; // निवडलेली तारीख (YYYY-MM-DD)
let dayModalTab = "all"; // all | in | out
let daySearch = "";

// कोणतीही तारीख किंवा UTC Timestamp अचूक IST तारखेत (YYYY-MM-DD) रूपांतरित करा
function toIstDateIso(val) {
  if (!val) return "";
  try {
    if (typeof val === "object") {
      if (typeof val.toDate === "function") return getIstParts(val.toDate()).isoDate;
      if (typeof val.seconds === "number") return getIstParts(new Date(val.seconds * 1000)).isoDate;
    }
    if (typeof val === "number" && val > 100000000000) {
      return getIstParts(new Date(val)).isoDate;
    }
    const s = String(val).trim();
    if (!s) return "";
    // साधी तारीख (YYYY-MM-DD किंवा DD/MM/YYYY) असल्यास थेट घ्या
    const strict = parseStrictDate(s);
    if (strict.valid) return strict.iso;
    // UTC ISO Timestamp असल्यास अचूक IST मध्ये रूपांतरित करा
    if (s.includes("T") || s.endsWith("Z")) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) return getIstParts(d).isoDate;
    }
  } catch (_) {}
  return "";
}

// दिलेल्या तारखेत दिवस मागे किंवा पुढे करा (Timezone शिवाय अचूक गणना)
function shiftIsoDate(iso, deltaDays) {
  const p = parseStrictDate(iso);
  if (!p.valid) return getIstTodayIso(0);
  const d = new Date(p.utcMs + deltaDays * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Timestamp मधून IST वेळ काढा (उदा. 01:24 pm)
function formatIstTimeShort(val) {
  if (!val) return "";
  try {
    const isObj = typeof val === "object";
    const s = isObj ? "" : String(val).trim();
    if (!isObj && typeof val !== "number" && !s.includes("T") && !s.endsWith("Z")) return "";
    const d = isObj && typeof val.toDate === "function"
      ? val.toDate()
      : (isObj && typeof val.seconds === "number" ? new Date(val.seconds * 1000) : new Date(val));
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
  } catch (_) {
    return "";
  }
}

// निवडलेल्या तारखेच्या सर्व नोंदी गोळा करा (फक्त Read-Only, BigInt अचूकता)
function collectDaySummary(st, requestedIso) {
  const chk = parseStrictDate(requestedIso);
  const targetIso = chk.valid ? chk.iso : getIstTodayIso(0);
  const items = [];

  let inCashP = 0n;
  let outCashP = 0n;
  let interestInP = 0n;
  let prinRedInP = 0n;
  let udRetInP = 0n;
  let otherInP = 0n;
  let newAccOutP = 0n;
  let extraPrinOutP = 0n;
  let udGivenOutP = 0n;
  let nonCashP = 0n;

  try {
    const borrowers = (st.borrowers || []).filter((b) => b && !b.isDeleted);

    // बल्क-इम्पोर्ट केलेली जुनी खाती चुकून नवीन खात्यांत येऊ नयेत म्हणून तपासणी
    const bulkBuckets = new Map();
    borrowers.forEach((b) => {
      const slot = String(b.createdAt || "").slice(0, 15);
      if (slot) bulkBuckets.set(slot, (bulkBuckets.get(slot) || 0) + 1);
    });

    borrowers.forEach((b) => {
      const bName = b.name || "ग्राहक";
      const bId = b.id || "";

      // १. निवडलेल्या तारखेचे नवीन खाते (loanDate ला प्राधान्य; नसल्यास createdAt)
      const loanIso = toIstDateIso(b.loanDate);
      const createdIso = toIstDateIso(b.createdAt);
      const slot = String(b.createdAt || "").slice(0, 15);
      const isBulk = Boolean(slot && (bulkBuckets.get(slot) || 0) >= 6);
      const isNewOnDate = loanIso
        ? (loanIso === targetIso && (!isBulk || b.isManualNew || loanIso !== createdIso))
        : (createdIso === targetIso && !isBulk);

      if (isNewOnDate) {
        const initP = toPaise(b.v17OpeningPrincipal ?? b.originalPrincipal ?? b.principal ?? 0);
        if (initP > 0n) {
          outCashP += initP;
          newAccOutP += initP;
          items.push({
            dir: "out",
            tag: "🆕 नवीन खाते",
            borrowerId: bId,
            name: bName,
            amount: paiseToRupees(initP),
            time: createdIso === targetIso ? formatIstTimeShort(b.createdAt) : "",
            sortKey: String(createdIso === targetIso ? (b.createdAt || b.loanDate || "") : (b.loanDate || "")),
            note: `दर: ${b.rate || 0}%${b.guarantor ? ` • ${b.guarantor}` : ""}`
          });
        }
      }

      // २. निवडलेल्या तारखेला जमा झालेले व्याज (paymentHistory मधून)
      (Array.isArray(b.paymentHistory) ? b.paymentHistory : []).forEach((p) => {
        if (!p || toIstDateIso(p.date) !== targetIso) return;
        const amtP = toPaise(p.amount || 0);
        if (amtP <= 0n) return;
        const isWalletApply = String(p.mode || "").toLowerCase() === "advance wallet";

        if (isWalletApply) {
          nonCashP += amtP;
          items.push({
            dir: "noncash",
            tag: "👛 वॉलेट लागू (रोख नाही)",
            borrowerId: bId,
            name: bName,
            amount: paiseToRupees(amtP),
            time: formatIstTimeShort(p.date),
            sortKey: String(p.date || ""),
            note: p.note || `${p.ym || ""} वॉलेटमधून व्याज जमा`
          });
        } else {
          inCashP += amtP;
          interestInP += amtP;
          items.push({
            dir: "in",
            tag: "💰 व्याज जमा",
            borrowerId: bId,
            name: bName,
            amount: paiseToRupees(amtP),
            time: formatIstTimeShort(p.date),
            sortKey: String(p.date || ""),
            note: `${p.mode ? `[${p.mode}] ` : ""}${p.note || ""}`.trim()
          });
        }
      });

      // ३. निवडलेल्या तारखेला दिलेले अतिरिक्त मुद्दल किंवा चक्रवाढ (extraPrincipals मधून)
      (Array.isArray(b.extraPrincipals) ? b.extraPrincipals : []).forEach((ev) => {
        if (!ev || toIstDateIso(ev.date) !== targetIso) return;
        const amtP = toPaise(ev.amount || 0);
        if (amtP <= 0n) return;
        const isComp = Boolean(ev.isCompound || String(ev.note || "").includes("चक्रवाढ"));

        if (isComp) {
          nonCashP += amtP;
          items.push({
            dir: "noncash",
            tag: "🔁 चक्रवाढ (रोख नाही)",
            borrowerId: bId,
            name: bName,
            amount: paiseToRupees(amtP),
            time: formatIstTimeShort(ev.date),
            sortKey: String(ev.date || ""),
            note: ev.note || "थकीत व्याज मुद्दलात जोडले"
          });
        } else {
          outCashP += amtP;
          extraPrinOutP += amtP;
          items.push({
            dir: "out",
            tag: "➕ अतिरिक्त मुद्दल",
            borrowerId: bId,
            name: bName,
            amount: paiseToRupees(amtP),
            time: formatIstTimeShort(ev.date),
            sortKey: String(ev.date || ""),
            note: ev.note || "अतिरिक्त मुद्दल दिले"
          });
        }
      });

      // ४. निवडलेल्या तारखेला परत आलेले मुद्दल (principalReductions मधून)
      (Array.isArray(b.principalReductions) ? b.principalReductions : []).forEach((ev) => {
        if (!ev || toIstDateIso(ev.date) !== targetIso) return;
        const amtP = toPaise(ev.amount || 0);
        if (amtP <= 0n) return;
        inCashP += amtP;
        prinRedInP += amtP;
        items.push({
          dir: "in",
          tag: "➖ मुद्दल परत",
          borrowerId: bId,
          name: bName,
          amount: paiseToRupees(amtP),
          time: formatIstTimeShort(ev.date),
          sortKey: String(ev.date || ""),
          note: ev.note || "मुद्दल परत जमा"
        });
      });

      // ५. निवडलेल्या तारखेला खाते बंद सेटलमेंट (settlement मधून)
      if (b.accountStatus === "closed" && b.settlement) {
        const setIso = toIstDateIso(b.settlement.closedAt || b.settlement.date);
        const amtP = toPaise(b.settlement.amount || 0);
        if (setIso === targetIso && amtP > 0n) {
          inCashP += amtP;
          otherInP += amtP;
          items.push({
            dir: "in",
            tag: "🔒 खाते बंद सेटलमेंट",
            borrowerId: bId,
            name: bName,
            amount: paiseToRupees(amtP),
            time: formatIstTimeShort(b.settlement.closedAt),
            sortKey: String(b.settlement.closedAt || b.settlement.date || ""),
            note: b.settlement.note || "खाते बंद रक्कम जमा"
          });
        }
      }

      // ६. थेट अ‍ॅडव्हान्स वॉलेट जमा (व्याज एक्स्ट्रा मधून आलेली रक्कम दुहेरी मोजू नका)
      const wTxs = Array.isArray(b.v16AdvanceWallet?.transactions) ? b.v16AdvanceWallet.transactions : [];
      wTxs.forEach((tx) => {
        if (!tx || tx.type !== "credit") return;
        if (String(tx.note || "").includes("मधून एक्स्ट्रा अ‍ॅडव्हान्स वॉलेटमध्ये जमा")) return;
        if (toIstDateIso(tx.ts || tx.date) !== targetIso) return;
        const amtP = toPaise(tx.amount || 0);
        if (amtP <= 0n) return;
        inCashP += amtP;
        otherInP += amtP;
        items.push({
          dir: "in",
          tag: "👛 अ‍ॅडव्हान्स वॉलेट जमा",
          borrowerId: bId,
          name: bName,
          amount: paiseToRupees(amtP),
          time: formatIstTimeShort(tx.ts),
          sortKey: String(tx.ts || tx.date || ""),
          note: tx.note || "वॉलेट जमा"
        });
      });
    });

    // ७. स्वतंत्र उधारी नोंदी (दिलेली + परत मिळालेली)
    (st.udhaari || []).forEach((u) => {
      if (!u || u.isDeleted) return;
      const uName = u.name || "व्यक्ती";

      if (toIstDateIso(u.givenDate) === targetIso) {
        const amtP = toPaise(u.amount || 0);
        if (amtP > 0n) {
          outCashP += amtP;
          udGivenOutP += amtP;
          items.push({
            dir: "out",
            tag: "🤝 उधारी दिली",
            borrowerId: "",
            name: uName,
            amount: paiseToRupees(amtP),
            time: formatIstTimeShort(u.createdAt),
            sortKey: String(u.createdAt || u.givenDate || ""),
            note: u.promiseDate ? `वायदा: ${fmtDateShort(u.promiseDate)}` : (u.note || "")
          });
        }
      }

      const pays = Array.isArray(u.payments) ? u.payments : [];
      if (pays.length) {
        pays.forEach((p) => {
          if (!p || toIstDateIso(p.date || p.ts) !== targetIso) return;
          const pP = toPaise(p.amount || 0);
          if (pP <= 0n) return;
          inCashP += pP;
          udRetInP += pP;
          items.push({
            dir: "in",
            tag: "🤝 उधारी परत",
            borrowerId: "",
            name: uName,
            amount: paiseToRupees(pP),
            time: formatIstTimeShort(p.ts || p.date),
            sortKey: String(p.ts || p.date || ""),
            note: p.note || "उधारी परत जमा"
          });
        });
      } else if (toIstDateIso(u.returnedDate) === targetIso) {
        const pP = toPaise(u.paidAmount || 0);
        if (pP > 0n) {
          inCashP += pP;
          udRetInP += pP;
          items.push({
            dir: "in",
            tag: "🤝 उधारी परत",
            borrowerId: "",
            name: uName,
            amount: paiseToRupees(pP),
            time: formatIstTimeShort(u.updatedAt),
            sortKey: String(u.updatedAt || u.returnedDate || ""),
            note: u.note || "उधारी परत जमा"
          });
        }
      }
    });

    // सर्वात नवीन नोंद वर दिसावी म्हणून क्रम लावा
    items.sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)));
  } catch (err) {
    console.warn("Day Summary Error:", err);
  }

  return {
    targetIso,
    items,
    totals: {
      inCash: paiseToRupees(inCashP),
      outCash: paiseToRupees(outCashP),
      interestIn: paiseToRupees(interestInP),
      prinRedIn: paiseToRupees(prinRedInP),
      udRetIn: paiseToRupees(udRetInP),
      otherIn: paiseToRupees(otherInP),
      newAccOut: paiseToRupees(newAccOutP),
      extraPrinOut: paiseToRupees(extraPrinOutP),
      udGivenOut: paiseToRupees(udGivenOutP),
      nonCash: paiseToRupees(nonCashP)
    }
  };
}

// कोणत्याही एका दिवसाचा सारांश मोडल उघडा (आजची तारीख किंवा निवडलेली तारीख)
export function openTodaySummaryModal(actions = {}, initialDateIso = "") {
  daySummaryDateIso = parseStrictDate(initialDateIso).valid ? parseStrictDate(initialDateIso).iso : getIstTodayIso(0);
  dayModalTab = "all";
  daySearch = "";

  const renderInner = () => {
    const st = getState();
    const hide = st.ui.hideAmounts;
    const todayIso = getIstTodayIso(0);
    const data = collectDaySummary(st, daySummaryDateIso);
    const t = data.totals;
    const isToday = data.targetIso === todayIso;
    const q = daySearch.trim().toLowerCase();

    const inList = data.items.filter((x) => x.dir === "in");
    const outList = data.items.filter((x) => x.dir === "out");
    const base = dayModalTab === "in" ? inList : dayModalTab === "out" ? outList : data.items;
    const filtered = base.filter((x) => !q || `${x.name} ${x.tag} ${x.note}`.toLowerCase().includes(q));

    const rowsHtml = filtered.length
      ? filtered.map((x) => {
          const isOut = x.dir === "out";
          const isNonCash = x.dir === "noncash";
          const borderCol = isNonCash ? "var(--warn)" : isOut ? "var(--gold)" : "var(--accent-2)";
          const amtCol = isNonCash ? "var(--warn)" : isOut ? "var(--gold)" : "var(--accent-2)";
          const sign = isNonCash ? "" : isOut ? "-" : "+";
          return `
            <div class="meta-box" style="margin-bottom:6px; border-left:3px solid ${borderCol};">
              <div class="row-between">
                <div style="min-width:0;">
                  <div style="font-weight:800; font-size:0.85rem;">${esc(x.name)}</div>
                  <div class="muted" style="font-size:0.7rem; margin-top:2px;">
                    ${esc(x.tag)}${x.time ? ` • 🕒 ${esc(x.time)}` : ""}
                  </div>
                  ${x.note ? `<div class="muted" style="font-size:0.69rem; margin-top:2px;">${esc(x.note)}</div>` : ""}
                </div>
                <strong style="color:${amtCol}; font-size:0.93rem; white-space:nowrap;">${sign}${formatRupeesInr(x.amount, hide)}</strong>
              </div>
              ${x.borrowerId ? `
                <div class="row" style="margin-top:6px;">
                  <button type="button" class="warn xs" data-ts-jump="${esc(x.borrowerId)}">⚡ कार्ड पहा</button>
                </div>
              ` : ""}
            </div>
          `;
        }).join("")
      : `<div class="muted" style="text-align:center; padding:18px;">${esc(fmtDateShort(data.targetIso))} रोजी या विभागात कोणतीही नोंद नाही.</div>`;

    const html = `
      <div class="modal-head">
        <div>
          <h3>📅 दिवसाचा सारांश (${esc(fmtDateShort(data.targetIso))})${isToday ? ` <span class="badge paid">आज</span>` : ""}</h3>
          <div class="muted" style="font-size:0.7rem;">एकूण नोंदी: <strong>${data.items.length}</strong> • अचूक IST हिशोब</div>
        </div>
        <div class="row" style="gap:5px;">
          <button type="button" class="primary xs" id="tsPdfBtn">🖨️ PDF</button>
          <button type="button" class="xs" id="tsCloseBtn">✕</button>
        </div>
      </div>

      <!-- तारीख निवड पट्टी (आधीचा दिवस / कॅलेंडर / पुढचा दिवस / आज) -->
      <div class="meta-box" style="margin-bottom:8px; padding:7px 8px;">
        <div class="row" style="gap:6px; align-items:center;">
          <button type="button" class="xs" id="tsPrevDayBtn" title="आधीचा दिवस">◀</button>
          <input type="date" id="tsDateInp" value="${esc(data.targetIso)}" max="${esc(todayIso)}" style="flex:1; min-width:0; padding:6px 8px; border-radius:8px; border:1px solid rgba(148,163,184,0.35); background:rgba(15,23,42,0.25); color:inherit; font-weight:700; font-size:0.82rem;" />
          <button type="button" class="xs" id="tsNextDayBtn" title="पुढचा दिवस" ${data.targetIso >= todayIso ? "disabled style='opacity:0.45;'" : ""}>▶</button>
          ${!isToday ? `<button type="button" class="primary xs" id="tsTodayBtn">आज</button>` : ""}
        </div>
      </div>

      <div class="grid-2" style="margin-bottom:8px;">
        <div class="meta-box">
          <div class="muted" style="font-size:0.68rem;">📥 आलेले रोख पैसे</div>
          <div class="ok" style="font-size:1rem; font-weight:900;">${formatRupeesInr(t.inCash, hide)}</div>
          <div class="muted" style="font-size:0.64rem;">व्याज: ${formatRupeesInr(t.interestIn, hide)} • मुद्दल: ${formatRupeesInr(t.prinRedIn, hide)} • उधारी: ${formatRupeesInr(t.udRetIn, hide)}</div>
        </div>
        <div class="meta-box">
          <div class="muted" style="font-size:0.68rem;">📤 दिलेले रोख पैसे</div>
          <div class="gold-text" style="font-size:1rem; font-weight:900;">${formatRupeesInr(t.outCash, hide)}</div>
          <div class="muted" style="font-size:0.64rem;">नवीन: ${formatRupeesInr(t.newAccOut, hide)} • अति.: ${formatRupeesInr(t.extraPrinOut, hide)} • उधारी: ${formatRupeesInr(t.udGivenOut, hide)}</div>
        </div>
      </div>

      ${t.nonCash > 0 ? `<div class="meta-box" style="margin-bottom:8px; font-size:0.72rem;">🔁 चक्रवाढ / वॉलेट लागू (रोख नाही): <strong class="warn-text">${formatRupeesInr(t.nonCash, hide)}</strong></div>` : ""}

      <div class="tab-row-3">
        <button type="button" class="seg-btn ${dayModalTab === "all" ? "is-active" : ""}" data-tstab="all">📋 सर्व (${data.items.length})</button>
        <button type="button" class="seg-btn ${dayModalTab === "in" ? "is-active" : ""}" data-tstab="in">📥 आलेले (${inList.length})</button>
        <button type="button" class="seg-btn ${dayModalTab === "out" ? "is-active" : ""}" data-tstab="out">📤 दिलेले (${outList.length})</button>
      </div>

      <input type="text" id="tsSearchInp" class="search-input" value="${esc(daySearch)}" placeholder="🔍 नाव किंवा प्रकार शोधा..." />
      <div style="max-height:42vh; overflow-y:auto;">${rowsHtml}</div>
    `;

    openModal("todaySummaryModal", html, {
      onAfterRender: (card) => {
        card.querySelector("#tsCloseBtn")?.addEventListener("click", () => closeModal("todaySummaryModal"));

        card.querySelector("#tsPrevDayBtn")?.addEventListener("click", () => {
          daySummaryDateIso = shiftIsoDate(data.targetIso, -1);
          renderInner();
        });

        card.querySelector("#tsNextDayBtn")?.addEventListener("click", () => {
          const nextIso = shiftIsoDate(data.targetIso, 1);
          if (nextIso <= todayIso) {
            daySummaryDateIso = nextIso;
            renderInner();
          }
        });

        card.querySelector("#tsTodayBtn")?.addEventListener("click", () => {
          daySummaryDateIso = todayIso;
          renderInner();
        });

        card.querySelector("#tsDateInp")?.addEventListener("change", (ev) => {
          const picked = parseStrictDate(ev.target.value);
          if (picked.valid) {
            daySummaryDateIso = picked.iso;
            renderInner();
          }
        });

        card.querySelectorAll("[data-tstab]").forEach((btn) => {
          btn.addEventListener("click", () => {
            dayModalTab = btn.getAttribute("data-tstab");
            renderInner();
          });
        });

        const inp = card.querySelector("#tsSearchInp");
        inp?.addEventListener("input", () => {
          daySearch = inp.value;
          const pos = inp.selectionStart || daySearch.length;
          renderInner();
          const next = document.getElementById("tsSearchInp");
          if (next) { next.focus(); next.setSelectionRange(pos, pos); }
        });

        card.querySelectorAll("[data-ts-jump]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-ts-jump");
            closeModal("todaySummaryModal");
            actions.onJumpBorrower?.(id);
          });
        });

        card.querySelector("#tsPdfBtn")?.addEventListener("click", () => {
          const biz = st.profile?.bizName || "व्याज हिशोब वही";
          const tblRows = data.items.map((x, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${esc(x.name)}</td>
              <td>${esc(x.tag)}${x.time ? ` (${esc(x.time)})` : ""}</td>
              <td>${esc(x.note || "-")}</td>
              <td class="pw-num">${x.dir === "out" ? "-" : x.dir === "in" ? "+" : ""}${formatRupeesInr(x.amount)}</td>
            </tr>
          `).join("") || `<tr><td colspan="5" style="text-align:center;">या तारखेला कोणतीही नोंद नाही</td></tr>`;

          printPureWhiteA4(`
            <div class="pw-head">
              <div><h2 class="pw-title">${esc(biz)} — दिवसाचा सारांश (${esc(fmtDateShort(data.targetIso))})</h2></div>
              <div class="pw-sub">रोख आले: ${formatRupeesInr(t.inCash)} | रोख दिले: ${formatRupeesInr(t.outCash)}</div>
            </div>
            <table class="pw-tbl">
              <thead><tr><th>क्र.</th><th>नाव</th><th>प्रकार</th><th>तपशील</th><th class="pw-num">रक्कम</th></tr></thead>
              <tbody>${tblRows}</tbody>
            </table>
          `);
        });
      }
    });
  };

  renderInner();
}

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
      <div style="margin-top:6px;">
        <button type="button" class="primary sm" style="width:100%;" id="dashTodaySummaryBtn">📅 दिवसाचा सारांश (आज / तारीख निवडा)</button>
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
  containerEl.querySelector("#dashTodaySummaryBtn")?.addEventListener("click", () => openTodaySummaryModal(actions));
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
