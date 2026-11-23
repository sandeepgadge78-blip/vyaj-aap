// व्याज हिशोब वही - Advance मागील बाकी महिने व रक्कम मॅनेजर (वर्ष + एकाधिक महिने निवड + जमा/एडिट/डिलीट + अचूक पुढील महिना रोलओव्हर) (js/pro/past-dues-pro.js - V14.33)
(function () {
  const MONTHS_FULL = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];
  const MONTHS_SHORT = ["जाने", "फेब्रु", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टें", "ऑक्टो", "नोव्हें", "डिसें"];

  let activeBorrowerId = null;
  let selectedYear = new Date().getFullYear();
  let selectedMonthsSet = new Set();
  let btnLabelTimer = null;

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function fmtInr(val) {
    const n = Number(val || 0);
    if (window.HishobBridge && typeof window.HishobBridge.fmtAmt === "function") {
      return window.HishobBridge.fmtAmt(n);
    }
    return "₹" + n.toLocaleString("en-IN");
  }

  function fmtYmMr(ym) {
    if (!ym || !String(ym).includes("-")) return String(ym || "");
    const [y, m] = String(ym).split("-");
    return `${MONTHS_FULL[parseInt(m, 10) - 1] || m} ${y}`;
  }

  function compareYmSafe(a, b) {
    return String(a || "").localeCompare(String(b || ""));
  }

  function nextYmSafe(ym) {
    const [y, m] = String(ym).split("-").map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }

  // =========================================================================
  // भाग १: app.js च्या computeLedgerUpToMonth ला बाहेरून सुरक्षितपणे अपग्रेड करा
  // (startYm च्या आधीचे आणि सर्व वर्षांचे मागील बाकी महिने १००% अचूक मोजण्यासाठी)
  // =========================================================================
  function enhancedComputeLedgerUpToMonth(borrower, targetYm) {
    const principal = Number(borrower.principal || 0);
    const originalPrincipal = Number(borrower.originalPrincipal || principal);
    const interestType = borrower.interestType === "flat" ? "flat" : "reducing";

    if (borrower.accountStatus === "closed") {
      return {
        principal: 0, originalPrincipal, interestType, monthlyInterest: 0, paidThisMonth: 0, collectedInMonth: 0,
        remainingThisMonth: 0, status: "closed", isPaid: true, pastDue: 0, lateDays: 0, lateFee: 0, totalPayable: 0,
        pastPendingMonths: [], extraOutList: [], extraInList: []
      };
    }

    const monthlyInterest = typeof window.getMonthlyInterestAmount === "function"
      ? window.getMonthlyInterestAmount(borrower)
      : (() => {
          const fixedInt = Number(borrower.fixedMonthlyInterest || 0);
          if (fixedInt > 0) return Math.round(fixedInt);
          const base = interestType === "flat" ? originalPrincipal : principal;
          return Math.round((base * Number(borrower.rate || 0)) / 100);
        })();

    const paidMonths = borrower.paidMonths || {};
    const partialPayments = borrower.partialPayments || {};
    const customPastDues = borrower.customPastDues || {};
    const customCashPaid = borrower.customCashPaid || {};
    const manualDueCollected = borrower.manualDueCollected || {};
    const extraOutMap = borrower.extraOut || {};
    const extraInMap = borrower.extraIn || {};

    const extraOutList = Array.isArray(extraOutMap[targetYm]) ? extraOutMap[targetYm] : [];
    const extraInList = Array.isArray(extraInMap[targetYm]) ? extraInMap[targetYm] : [];
    const extraOutNonCustom = extraOutList.filter((x) => x.kind !== "past_custom").reduce((s, x) => s + Number(x.amount || 0), 0);

    // १. targetYm पर्यंतची सर्व customCashPaid रक्कम गोळा करा (जुने paid pool)
    let remainingCashPool = 0;
    Object.entries(customCashPaid).forEach(([k, v]) => {
      if (compareYmSafe(k, targetYm) <= 0) remainingCashPool += Number(v || 0);
    });

    // २. सर्व customPastDues (कोणत्याही वर्षाचे, startYm आधीचेही!) कालक्रमानुसार मोजा
    const manualEntriesByYm = new Map();
    Object.keys(customPastDues)
      .filter((k) => /^\d{4}-\d{2}$/.test(k) && compareYmSafe(k, targetYm) <= 0 && Number(customPastDues[k] || 0) > 0)
      .sort(compareYmSafe)
      .forEach((ym) => {
        const origAmt = Number(customPastDues[ym] || 0);
        const deducted = Math.min(origAmt, remainingCashPool);
        remainingCashPool = Math.max(0, remainingCashPool - deducted);
        const rem = Math.max(0, origAmt - deducted);
        if (rem > 0) {
          manualEntriesByYm.set(ym, {
            ym,
            monthlyInterest: origAmt,
            paid: deducted,
            remaining: rem,
            manualAmt: rem,
            isManual: true,
            extraIn: []
          });
        }
      });

    // ३. startYm पासून targetYm पर्यंतचा नियमित मासिक हिशोब मोजा
    const regularPastList = [];
    let cursor = borrower.startYm || targetYm;
    let guard = 0;

    while (compareYmSafe(cursor, targetYm) < 0 && guard < 240) {
      guard++;
      const cPaid = Boolean(paidMonths[cursor]) ? monthlyInterest : Math.min(monthlyInterest, Number(partialPayments[cursor] || 0));
      let cRem = Math.max(0, monthlyInterest - cPaid);

      // जर अजून customCashPaid शिल्लक असेल तर ते नियमित बाकीमधूनही वजा करा
      if (cRem > 0 && remainingCashPool > 0) {
        const cut = Math.min(cRem, remainingCashPool);
        cRem -= cut;
        remainingCashPool -= cut;
      }

      const cursorExtraIn = Array.isArray(extraInMap[cursor]) ? extraInMap[cursor] : [];
      if (cRem > 0 || cursorExtraIn.length > 0) {
        regularPastList.push({
          ym: cursor,
          monthlyInterest,
          paid: cPaid,
          remaining: cRem,
          isManual: false,
          extraIn: cursorExtraIn
        });
      }
      cursor = nextYmSafe(cursor);
    }

    // ४. मॅन्युअल व नियमित मागील बाकी महिने एकत्र करून कालक्रमानुसार लावा
    const combinedMap = new Map();
    regularPastList.forEach((item) => {
      combinedMap.set(item.ym, { ...item });
    });
    manualEntriesByYm.forEach((mItem, ym) => {
      if (combinedMap.has(ym)) {
        const existing = combinedMap.get(ym);
        existing.remaining += mItem.remaining;
        existing.manualAmt = mItem.remaining;
        existing.hasManual = true;
      } else {
        combinedMap.set(ym, { ...mItem, hasManual: true });
      }
    });

    const pastPendingMonths = Array.from(combinedMap.values()).sort((a, b) => compareYmSafe(a.ym, b.ym));
    const runningPastDue = pastPendingMonths.reduce((sum, item) => sum + Number(item.remaining || 0), 0);

    // ५. निवडलेल्या चालू महिन्याचा (targetYm) हिशोब
    const paidThisMonth = Boolean(paidMonths[targetYm]) ? monthlyInterest : Math.min(monthlyInterest, Number(partialPayments[targetYm] || 0));
    const remainingThisMonth = Math.max(0, monthlyInterest - paidThisMonth);
    const pastPaidThisMonth = Number(customCashPaid[targetYm] || 0) + Number(manualDueCollected[targetYm] || 0);

    let status = "pending";
    if (remainingThisMonth === 0 && monthlyInterest > 0) status = "paid";
    else if (paidThisMonth > 0 && remainingThisMonth > 0) status = "partial";

    const lateInfo = typeof window.calculateLateFee === "function"
      ? window.calculateLateFee(borrower, targetYm, status === "paid")
      : { lateDays: 0, lateFee: 0 };

    return {
      principal,
      originalPrincipal,
      interestType,
      monthlyInterest,
      paidThisMonth,
      collectedInMonth: paidThisMonth + pastPaidThisMonth + extraOutNonCustom,
      remainingThisMonth,
      status,
      isPaid: status === "paid",
      pastDue: Math.max(0, runningPastDue),
      lateDays: lateInfo.lateDays,
      lateFee: lateInfo.lateFee,
      totalPayable: Math.max(0, runningPastDue) + remainingThisMonth + lateInfo.lateFee,
      pastPendingMonths,
      extraOutList,
      extraInList
    };
  }

  function installEnhancedLedgerEngine() {
    window.computeLedgerUpToMonth = enhancedComputeLedgerUpToMonth;
    if (window.HishobBridge) {
      window.HishobBridge.computeLedgerUpToMonth = enhancedComputeLedgerUpToMonth;
    }
    if (typeof window.renderBorrowers === "function") {
      try { window.renderBorrowers(); } catch (_) {}
    }
  }

  // =========================================================================
  // भाग २: Advance मागील बाकी महिने मॅनेजर पॉपअप (वर्ष + एकाधिक महिने + जमा/एडिट/डिलीट)
  // =========================================================================
  function injectPastDuesCss() {
    if (document.getElementById("vyajPastDuesProCss")) return;
    const st = document.createElement("style");
    st.id = "vyajPastDuesProCss";
    st.textContent = `
      .pd-summary {
        display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;
        padding: 9px 11px; border-radius: 12px; margin-bottom: 11px;
        background: rgba(159, 18, 57, 0.16); border: 1px solid rgba(240, 113, 120, 0.35);
      }
      body.light-mode .pd-summary { background: #fcecef; border-color: #fda4af; }

      .pd-sec-title {
        font-size: 0.78rem; font-weight: 800; color: var(--accent); margin: 10px 0 6px;
        display: flex; justify-content: space-between; align-items: center;
      }

      .pd-due-row {
        display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
        padding: 9px 10px; border-radius: 11px; background: var(--meta-bg);
        border: 1px solid var(--border); margin-bottom: 7px;
      }
      .pd-due-acts { display: flex; gap: 5px; flex-shrink: 0; }
      .pd-due-acts button { padding: 4px 8px !important; font-size: 0.7rem !important; border-radius: 8px !important; }

      .pd-add-box {
        padding: 11px; border-radius: 13px; background: var(--meta-bg); border: 1px solid var(--border);
      }
      .pd-year-row { display: flex; gap: 8px; align-items: center; margin-bottom: 9px; flex-wrap: wrap; }
      .pd-year-row select { font-weight: 800; min-width: 110px; }
      .pd-year-row input[type="number"] { flex: 1; min-width: 120px; font-weight: 800; }

      .pd-month-grid {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px;
      }
      @media (max-width: 380px) { .pd-month-grid { grid-template-columns: repeat(3, 1fr); } }
      .pd-m-chip {
        padding: 7px 4px !important; font-size: 0.74rem !important; font-weight: 700 !important;
        border-radius: 10px !important; text-align: center;
        background: var(--card-2) !important; border: 1px solid var(--border) !important; color: var(--text) !important;
      }
      .pd-m-chip.is-selected {
        background: #15803d !important; border-color: #4ade80 !important; color: #ffffff !important;
        box-shadow: 0 0 10px rgba(74, 222, 128, 0.35);
      }
      .pd-m-chip.is-already {
        border-color: rgba(240, 113, 120, 0.65) !important; color: var(--danger) !important;
      }
      .pd-m-chip.is-selected.is-already { color: #fff !important; }
    `;
    document.head.appendChild(st);
  }

  function ensurePastDuesModal() {
    let modal = document.getElementById("proPastDuesModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "proPastDuesModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `<div class="modal-card" style="max-width:600px;" id="proPastDuesBody"></div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("proPastDuesModal");
      }
    });
    return modal;
  }

  function getBorrowerById(id) {
    if (!window.HishobBridge) return null;
    return (window.HishobBridge.getBorrowers() || []).find((x) => x.id === id) || null;
  }

  function getActiveYm() {
    return document.getElementById("activeYm")?.value || new Date().toISOString().slice(0, 7);
  }

  function renderPastDuesModal(statusMsg = "") {
    const body = document.getElementById("proPastDuesBody");
    const b = getBorrowerById(activeBorrowerId);
    if (!body || !b) return;

    const activeYm = getActiveYm();
    const calc = enhancedComputeLedgerUpToMonth(b, activeYm);
    const pendingList = (calc.pastPendingMonths || []).filter((x) => Number(x.remaining || 0) > 0);
    const pendingYmSet = new Set(pendingList.map((x) => x.ym));
    const defaultAmt = calc.monthlyInterest > 0 ? calc.monthlyInterest : 0;

    // वर्षांचे पर्याय (२०२२ ते पुढील वर्ष)
    const curYr = new Date().getFullYear();
    const years = [];
    for (let y = Math.max(2021, curYr - 4); y <= curYr + 2; y++) years.push(y);

    const existingHtml = pendingList.length
      ? pendingList.map((pm) => {
          const badge = pm.isManual ? `<span class="badge partial">मॅन्युअल</span>` : `<span class="badge pending">ऑटो बाकी</span>`;
          return `
            <div class="pd-due-row">
              <div>
                <div style="font-size:0.86rem; font-weight:800; color:var(--text);">📅 ${esc(fmtYmMr(pm.ym))} ${badge}</div>
                <div style="font-size:0.78rem; font-weight:800; color:var(--danger); margin-top:2px;">बाकी: ${fmtInr(pm.remaining)}</div>
              </div>
              <div class="pd-due-acts">
                <button type="button" class="success" data-pd-pay="${esc(pm.ym)}" data-rem="${pm.remaining}" data-manual="${pm.isManual ? "1" : "0"}">✅ जमा</button>
                <button type="button" class="primary" data-pd-edit="${esc(pm.ym)}" data-rem="${pm.remaining}" data-manual="${pm.isManual ? "1" : "0"}">✏️ बदला</button>
                ${pm.isManual ? `<button type="button" class="danger" data-pd-del="${esc(pm.ym)}">🗑️</button>` : ""}
              </div>
            </div>
          `;
        }).join("")
      : `<div class="ok" style="text-align:center; padding:12px; font-size:0.82rem; font-weight:700;">✅ सध्या कोणत्याही मागील महिन्याचे व्याज बाकी नाही.</div>`;

    const monthChipsHtml = MONTHS_SHORT.map((lbl, idx) => {
      const mStr = String(idx + 1).padStart(2, "0");
      const ymKey = `${selectedYear}-${mStr}`;
      const isSel = selectedMonthsSet.has(ymKey);
      const isAlready = pendingYmSet.has(ymKey);
      return `<button type="button" class="pd-m-chip ${isSel ? "is-selected" : ""} ${isAlready ? "is-already" : ""}" data-pd-mkey="${ymKey}">${esc(lbl)} ${isSel ? "✓" : ""}</button>`;
    }).join("");

    const selCount = selectedMonthsSet.size;

    body.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
        <div>
          <h3 style="margin:0; color:var(--accent);">📅 मागील बाकी महिने मॅनेजर</h3>
          <div class="muted" style="font-size:0.74rem; margin-top:2px;">ग्राहक: <strong>${esc(b.name)}</strong> • मासिक व्याज: ${fmtInr(defaultAmt)}</div>
        </div>
      </div>

      <div class="pd-summary">
        <div>
          <div style="font-size:0.72rem; color:var(--muted); font-weight:700;">एकूण मागील बाकी (${pendingList.length} महिने)</div>
          <div style="font-size:1.18rem; font-weight:900; color:var(--danger);">${fmtInr(calc.pastDue)}</div>
        </div>
        <div style="text-align:right; font-size:0.74rem; color:var(--muted);">
          पुढील सर्व महिन्यांत<br/>आपोआप दिसेल ✅
        </div>
      </div>

      <div class="pd-sec-title">
        <span>१. सध्याचे थकीत महिने (${pendingList.length})</span>
      </div>
      <div style="max-height:210px; overflow-y:auto; margin-bottom:10px;">${existingHtml}</div>

      <div class="pd-sec-title">
        <span>२. नवीन मागील बाकी महिने जोडा (वर्ष व महिने निवडा)</span>
        ${selCount > 0 ? `<span class="badge paid">${selCount} निवडले</span>` : ""}
      </div>

      <div class="pd-add-box">
        <div class="pd-year-row">
          <div class="field" style="min-width:110px;">
            <label>वर्ष निवडा</label>
            <select id="pdYearSelect">
              ${years.map((y) => `<option value="${y}" ${y === selectedYear ? "selected" : ""}>${y}</option>`).join("")}
            </select>
          </div>
          <div class="field" style="flex:1;">
            <label>प्रत्येक महिन्याची बाकी रक्कम (₹)</label>
            <input type="number" id="pdAmtInput" min="1" value="${defaultAmt || ""}" placeholder="उदा. 6500" />
          </div>
        </div>

        <div style="font-size:0.72rem; color:var(--muted); margin-bottom:6px; font-weight:600;">
          खालीलपैकी १ किंवा एकापेक्षा जास्त महिने टॅप करून निवडा:
        </div>
        <div class="pd-month-grid">${monthChipsHtml}</div>

        <div id="pdStatusMsg" class="muted" style="text-align:center; margin-bottom:8px; font-weight:700; color:var(--accent-2);">${esc(statusMsg)}</div>

        <button type="button" id="pdSaveMonthsBtn" class="success" style="width:100%;">
          💾 ${selCount > 0 ? `निवडलेले ${selCount} महिने बाकीत जोडा` : "वर महिने निवडून सेव्ह करा"}
        </button>
      </div>
    `;

    // वर्ष बदलणे
    document.getElementById("pdYearSelect")?.addEventListener("change", (e) => {
      selectedYear = Number(e.target.value);
      renderPastDuesModal("");
    });

    // महिने टिक / अनटिक करणे
    body.querySelectorAll("[data-pd-mkey]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const k = btn.getAttribute("data-pd-mkey");
        if (selectedMonthsSet.has(k)) selectedMonthsSet.delete(k);
        else selectedMonthsSet.add(k);
        renderPastDuesModal("");
      });
    });

    // निवडलेले सर्व महिने एका क्लिकवर सेव्ह करा
    document.getElementById("pdSaveMonthsBtn")?.addEventListener("click", async () => {
      const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
      if (!user) { alert("कृपया आधी लॉगिन करा."); return; }
      if (!selectedMonthsSet.size) {
        alert("कृपया आधी वर किमान १ महिना टॅप करून निवडा.");
        return;
      }
      const amt = Number(document.getElementById("pdAmtInput")?.value || 0);
      if (!amt || amt <= 0) {
        alert("कृपया वैध बाकी रक्कम (₹) टाका.");
        return;
      }

      const payload = { updatedAt: new Date().toISOString() };
      const addedLabels = [];
      selectedMonthsSet.forEach((ym) => {
        payload[`customPastDues.${ym}`] = amt;
        addedLabels.push(fmtYmMr(ym));
      });

      try {
        await firebase.firestore().collection("users").doc(user.uid).collection("borrowers").doc(b.id).update(payload);
        selectedMonthsSet.clear();
        setTimeout(() => renderPastDuesModal(`✅ ${addedLabels.join(", ")} ची बाकी यशस्वीरित्या सेव्ह झाली!`), 300);
      } catch (err) {
        alert("सेव्ह करताना एरर: " + err.message);
      }
    });

    // थकीत महिन्याची रक्कम जमा करा (✅ जमा)
    body.querySelectorAll("[data-pd-pay]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ym = btn.getAttribute("data-pd-pay");
        const rem = Number(btn.getAttribute("data-rem") || 0);
        const isManual = btn.getAttribute("data-manual") === "1";
        const payStr = prompt(`${fmtYmMr(ym)} च्या बाकी (₹${rem}) मधून किती रक्कम जमा झाली?`, String(rem));
        if (payStr === null) return;
        const payAmt = Number(payStr || 0);
        if (!payAmt || payAmt <= 0) return;

        const user = firebase.auth().currentUser;
        if (!user) return;
        const nowIso = new Date().toISOString();
        const curYm = getActiveYm();
        const FieldValue = firebase.firestore.FieldValue;
        const payload = {
          updatedAt: nowIso,
          paymentHistory: FieldValue.arrayUnion({
            date: nowIso,
            ym: curYm,
            type: "PAST_DUE_PAID",
            amount: payAmt,
            note: `मागील बाकी जमा (${fmtYmMr(ym)})`
          })
        };

        if (isManual) {
          const origManual = Number((b.customPastDues && b.customPastDues[ym]) || rem);
          const nextRem = Math.max(0, origManual - payAmt);
          payload[`customPastDues.${ym}`] = nextRem > 0 ? nextRem : FieldValue.delete();
          const prevColl = Number((b.manualDueCollected && b.manualDueCollected[curYm]) || 0);
          payload[`manualDueCollected.${curYm}`] = prevColl + payAmt;
        } else {
          const mInt = calc.monthlyInterest || rem;
          const prevPaid = Number((b.partialPayments && b.partialPayments[ym]) || 0);
          const nextPaid = prevPaid + payAmt;
          if (nextPaid >= mInt && mInt > 0) {
            payload[`paidMonths.${ym}`] = { paidAt: nowIso, amount: mInt };
            payload[`partialPayments.${ym}`] = FieldValue.delete();
          } else {
            payload[`partialPayments.${ym}`] = nextPaid;
          }
        }

        try {
          await firebase.firestore().collection("users").doc(user.uid).collection("borrowers").doc(b.id).update(payload);
          setTimeout(() => renderPastDuesModal(`✅ ${fmtYmMr(ym)} चे ₹${payAmt.toLocaleString("en-IN")} जमा नोंद झाले!`), 300);
        } catch (err) {
          alert("जमा करताना एरर: " + err.message);
        }
      });
    });

    // थकीत महिन्याची रक्कम बदला (✏️ बदला)
    body.querySelectorAll("[data-pd-edit]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ym = btn.getAttribute("data-pd-edit");
        const rem = Number(btn.getAttribute("data-rem") || 0);
        const isManual = btn.getAttribute("data-manual") === "1";
        const nextStr = prompt(`${fmtYmMr(ym)} ची नवीन बाकी रक्कम (₹) टाका (0 टाकल्यास क्लिअर होईल):`, String(rem));
        if (nextStr === null) return;
        const nextAmt = Number(nextStr);
        if (Number.isNaN(nextAmt) || nextAmt < 0) return;

        const user = firebase.auth().currentUser;
        if (!user) return;
        const FieldValue = firebase.firestore.FieldValue;
        const payload = { updatedAt: new Date().toISOString() };

        if (isManual) {
          payload[`customPastDues.${ym}`] = nextAmt > 0 ? nextAmt : FieldValue.delete();
        } else {
          const mInt = calc.monthlyInterest || rem;
          if (nextAmt === 0) {
            payload[`paidMonths.${ym}`] = { paidAt: new Date().toISOString(), amount: mInt };
            payload[`partialPayments.${ym}`] = FieldValue.delete();
          } else if (nextAmt < mInt) {
            payload[`paidMonths.${ym}`] = FieldValue.delete();
            payload[`partialPayments.${ym}`] = mInt - nextAmt;
          } else {
            payload[`paidMonths.${ym}`] = FieldValue.delete();
            payload[`partialPayments.${ym}`] = FieldValue.delete();
            if (nextAmt > mInt) payload[`customPastDues.${ym}`] = nextAmt - mInt;
          }
        }

        try {
          await firebase.firestore().collection("users").doc(user.uid).collection("borrowers").doc(b.id).update(payload);
          setTimeout(() => renderPastDuesModal(`✏️ ${fmtYmMr(ym)} ची बाकी ₹${nextAmt.toLocaleString("en-IN")} अपडेट झाली!`), 300);
        } catch (err) {
          alert("अपडेट करताना एरर: " + err.message);
        }
      });
    });

    // मॅन्युअल बाकी महिना काढून टाका (🗑️)
    body.querySelectorAll("[data-pd-del]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ym = btn.getAttribute("data-pd-del");
        if (!confirm(`${fmtYmMr(ym)} ची मॅन्युअल बाकी नोंद काढून टाकायची का?`)) return;
        const user = firebase.auth().currentUser;
        if (!user) return;
        try {
          await firebase.firestore().collection("users").doc(user.uid).collection("borrowers").doc(b.id).update({
            [`customPastDues.${ym}`]: firebase.firestore.FieldValue.delete(),
            updatedAt: new Date().toISOString()
          });
          setTimeout(() => renderPastDuesModal(`🗑️ ${fmtYmMr(ym)} ची बाकी काढून टाकली.`), 300);
        } catch (err) {
          alert("काढताना एरर: " + err.message);
        }
      });
    });
  }

  function openPastDuesManager(borrowerId) {
    activeBorrowerId = borrowerId;
    const actYm = getActiveYm();
    selectedYear = Number(String(actYm).split("-")[0]) || new Date().getFullYear();
    selectedMonthsSet.clear();
    const modal = ensurePastDuesModal();
    renderPastDuesModal("");
    modal.classList.remove("hidden");
  }

  // जुन्या '+/✏️ बाकी लिहा' बटनाचा क्लिक अडवून आपला Advance मॅनेजर उघडा
  function interceptAddManualMonthClicks() {
    document.addEventListener("click", (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest('button[data-action="add-manual-month"]') : null;
      if (!btn) return;
      const bId = btn.getAttribute("data-id");
      if (!bId) return;
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      openPastDuesManager(bId);
    }, true);
  }

  function enhancePastDueButtons() {
    document.querySelectorAll('#borrowersList button[data-action="add-manual-month"]').forEach((btn) => {
      if (btn.textContent.trim() !== "📅 बाकी महिने मॅनेजर") {
        btn.textContent = "📅 बाकी महिने मॅनेजर";
      }
    });
  }

  window.openProPastDuesManager = openPastDuesManager;

  function initPastDuesPro() {
    injectPastDuesCss();
    installEnhancedLedgerEngine();
    interceptAddManualMonthClicks();
    enhancePastDueButtons();

    const listEl = document.getElementById("borrowersList");
    if (listEl) {
      const obs = new MutationObserver(() => {
        clearTimeout(btnLabelTimer);
        btnLabelTimer = setTimeout(enhancePastDueButtons, 80);
      });
      obs.observe(listEl, { childList: true });
    }
    setTimeout(installEnhancedLedgerEngine, 900);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initPastDuesPro);
  else initPastDuesPro();
})();
