// व्याज हिशोब वही - VyajOS Central Kernel V16.0 (BigInt Ledger V16 + IST + Historical Locks + Compound + Advance Wallet + Pure White A4 Print) (js/core/vyaj-kernel.js)
(function () {
  const MONTHS_MR = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];
  const MONTHS_SHORT = ["जाने", "फेब्रु", "मार्च", "एप्रि", "मे", "जून", "जुलै", "ऑग", "सप्टें", "ऑक्टो", "नोव्हें", "डिसें"];

  const subscribers = new Set();
  let cacheKey = "";
  let cacheTs = 0;
  let cachedReport = null;
  let busTimer = null;

  function L16() {
    return window.VyajLedgerV16 || null;
  }

  // =========================================================================
  // १. सुरक्षित युटिलिटी फंक्शन्स (IST आणि BigInt फॉरमॅटिंगसह)
  // =========================================================================
  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function fmtNum(val) {
    const n = Number(val || 0);
    if (Math.abs(n - Math.round(n)) > 0.001) {
      return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return Math.round(n).toLocaleString("en-IN");
  }

  function fmtInr(val) {
    const n = Number(val || 0);
    if (document.body.classList.contains("hide-amounts")) return "₹••••";
    const L = L16();
    if (L) return L.formatPaiseInr(L.toPaise(n), false);
    if (window.HishobBridge && typeof window.HishobBridge.fmtAmt === "function") {
      return window.HishobBridge.fmtAmt(n);
    }
    return "₹" + fmtNum(n);
  }

  function fmtInrPlain(val) {
    const L = L16();
    if (L) return L.formatPaiseInr(L.toPaise(val || 0), false);
    return "₹" + fmtNum(val);
  }

  function fmtYmMr(ym) {
    if (!ym || !String(ym).includes("-")) return String(ym || "");
    const [y, m] = String(ym).split("-");
    return `${MONTHS_MR[parseInt(m, 10) - 1] || m} ${y}`;
  }

  function fmtYmShort(ym) {
    if (!ym || !String(ym).includes("-")) return String(ym || "");
    const [y, m] = String(ym).split("-");
    return `${MONTHS_SHORT[parseInt(m, 10) - 1] || m} ${String(y).slice(-2)}`;
  }

  function getActiveYm() {
    const inpVal = document.getElementById("activeYm")?.value;
    if (inpVal) return inpVal;
    const L = L16();
    return L ? L.getIstCurrentYm() : new Date().toISOString().slice(0, 7);
  }

  function getPrevYm(ym) {
    if (!ym || !String(ym).includes("-")) return "";
    let [y, m] = String(ym).split("-").map((x) => parseInt(x, 10));
    m -= 1;
    if (m <= 0) { m = 12; y -= 1; }
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  function cleanMob(raw) {
    const d = String(raw || "").replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("91")) return d.slice(2);
    if (d.length === 11 && d.startsWith("0")) return d.slice(1);
    return d.slice(-10);
  }

  function extractYm(val) {
    if (!val) return "";
    if (typeof val === "object") {
      if (typeof val.toDate === "function") {
        const L = L16();
        return L ? L.getIstParts(val.toDate()).ym : val.toDate().toISOString().slice(0, 7);
      }
      if (typeof val.seconds === "number") {
        const d = new Date(val.seconds * 1000);
        const L = L16();
        return L ? L.getIstParts(d).ym : d.toISOString().slice(0, 7);
      }
    }
    if (typeof val === "number" && val > 100000000000) {
      const d = new Date(val);
      if (!Number.isNaN(d.getTime())) {
        const L = L16();
        return L ? L.getIstParts(d).ym : d.toISOString().slice(0, 7);
      }
    }
    const s = String(val).trim();
    const iso = s.match(/^(\d{4})[-/](\d{1,2})/);
    if (iso) return `${iso[1]}-${String(parseInt(iso[2], 10)).padStart(2, "0")}`;
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmy) return `${dmy[3]}-${String(parseInt(dmy[2], 10)).padStart(2, "0")}`;
    return "";
  }

  function fmtDateShort(val) {
    if (!val) return "-";
    if (typeof val === "object" && typeof val.toDate === "function") {
      const L = L16();
      const iso = L ? L.getIstParts(val.toDate()).isoDate : val.toDate().toISOString().slice(0, 10);
      return fmtDateShort(iso);
    }
    if (typeof val === "number" && val > 100000000000) {
      const d = new Date(val);
      if (!Number.isNaN(d.getTime())) {
        const L = L16();
        const iso = L ? L.getIstParts(d).isoDate : d.toISOString().slice(0, 10);
        return fmtDateShort(iso);
      }
    }
    const s = String(val).trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmy) return `${dmy[1].padStart(2, "0")}/${dmy[2].padStart(2, "0")}/${dmy[3]}`;
    return s;
  }

  // =========================================================================
  // २. ऐतिहासिक लॉक, बल्क-इम्पोर्ट ओळख आणि अतिरिक्त मुद्दल (चक्रवाढ वेगळे ठेवून)
  // =========================================================================
  function hasManualPastDueData(b) {
    if (Number(b.customDue || 0) > 0 || Number(b.manualDue || 0) > 0 || Number(b.initialPastDue || 0) > 0) return true;
    const mp = b.manualPastDues || b.pastManualDues || b.manualMonths || b.customMonths;
    if (Array.isArray(mp) && mp.length > 0) return true;
    if (mp && typeof mp === "object" && Object.keys(mp).length > 0) return true;
    return false;
  }

  function detectBulkImportBuckets(borrowers) {
    const bucketCounts = new Map();
    borrowers.forEach((b) => {
      const cStr = String(b.createdAt || "").slice(0, 15);
      if (cStr) bucketCounts.set(cStr, (bucketCounts.get(cStr) || 0) + 1);
    });
    return bucketCounts;
  }

  function isTrulyNewInMonth(b, calc, activeYm, bulkBuckets) {
    if (Number(calc.pastDue || 0) > 0) return false;
    if (Array.isArray(calc.pastPendingMonths) && calc.pastPendingMonths.length > 0) return false;
    if (hasManualPastDueData(b)) return false;

    const loanYm = extractYm(b.loanDate);
    const startYm = extractYm(b.startYm);
    const createdYm = extractYm(b.createdAt);

    if (loanYm && loanYm !== activeYm) return false;

    const cBucket = String(b.createdAt || "").slice(0, 15);
    const isBulkBatch = Boolean(cBucket && (bulkBuckets.get(cBucket) || 0) >= 6);
    if (isBulkBatch && !loanYm) return false;
    if (isBulkBatch && loanYm === activeYm && !b.isManualNew) {
      const loanDay = String(b.loanDate || "").slice(0, 10);
      const createdDay = String(b.createdAt || "").slice(0, 10);
      if (loanDay === createdDay) return false;
    }

    if (loanYm === activeYm) return true;
    if (!loanYm && startYm === activeYm && createdYm === activeYm && !isBulkBatch) return true;
    return false;
  }

  // अतिरिक्त मुद्दल (+) व परत मुद्दल (-) काढा — चक्रवाढ व्याज (compound_capitalization) रोख मुद्दलातून वेगळे ठेवा
  function getPrincipalEventsInMonth(b, activeYm) {
    const rawLists = []
      .concat(Array.isArray(b.principalHistory) ? b.principalHistory : [])
      .concat(Array.isArray(b.principalLogs) ? b.principalLogs : [])
      .concat(Array.isArray(b.principalTransactions) ? b.principalTransactions : [])
      .concat(Array.isArray(b.loanHistory) ? b.loanHistory : [])
      .concat(Array.isArray(b.extraPrincipals) ? b.extraPrincipals : []);

    const seen = new Set();
    let added = 0;
    let reduced = 0;
    let compoundedAdded = 0;
    const items = [];

    rawLists.forEach((ev, idx) => {
      if (!ev || typeof ev !== "object") return;
      const evYm = extractYm(ev.ym || ev.month || ev.date || ev.addedAt || ev.ts || ev.createdAt);
      if (evYm !== activeYm) return;

      const typeStr = String(ev.type || ev.action || ev.kind || "").toLowerCase();
      const noteStr = String(ev.note || ev.reason || ev.label || "").toLowerCase();
      if (typeStr === "initial" || typeStr === "opening" || typeStr === "create" || noteStr.includes("मूळ मुद्दल") || noteStr.includes("initial")) {
        return;
      }

      let rawAmt = 0;
      if (ev.delta !== undefined && ev.delta !== null && ev.delta !== "") rawAmt = Number(ev.delta);
      else if (ev.amount !== undefined && ev.amount !== null && ev.amount !== "") rawAmt = Number(ev.amount);
      else if (ev.change !== undefined && ev.change !== null && ev.change !== "") rawAmt = Number(ev.change);
      else if (ev.newPrincipal !== undefined && ev.oldPrincipal !== undefined) {
        rawAmt = Number(ev.newPrincipal) - Number(ev.oldPrincipal);
      }

      if (!rawAmt || Number.isNaN(rawAmt)) return;

      const dateVal = ev.date || ev.addedAt || ev.ts || ev.createdAt || activeYm;
      const sig = `${evYm}|${fmtDateShort(dateVal)}|${rawAmt}|${typeStr}|${ev.note || idx}`;
      if (seen.has(sig)) return;
      seen.add(sig);

      const absAmt = Math.abs(rawAmt);

      // चक्रवाढ मुद्दलात जोडलेले थकीत व्याज रोख दिलेल्या पैशांत मोजू नका
      if (typeStr === "compound_capitalization" || ev.isCompound === true) {
        compoundedAdded += absAmt;
        items.push({ kind: "compound", amount: absAmt, date: dateVal, note: ev.note || "चक्रवाढ व्याज मुद्दलात जोडले" });
        return;
      }

      const isReduce =
        rawAmt < 0 ||
        typeStr.includes("reduce") ||
        typeStr.includes("sub") ||
        typeStr.includes("return") ||
        typeStr.includes("deduct") ||
        typeStr.includes("minus") ||
        typeStr.includes("paid") ||
        noteStr.includes("कमी") ||
        noteStr.includes("परत");

      if (isReduce) {
        reduced += absAmt;
        items.push({ kind: "reduce", amount: absAmt, date: dateVal, note: ev.note || ev.reason || "" });
      } else {
        added += absAmt;
        items.push({ kind: "add", amount: absAmt, date: dateVal, note: ev.note || ev.reason || "" });
      }
    });

    return { added, reduced, compoundedAdded, items };
  }

  function computeExtraAllocation(b, calc, monthlyInt, activeYm) {
    const collected = Math.max(0, Number(calc.collectedInMonth || 0));
    const currentInterestPaid = Math.min(collected, monthlyInt);
    const extraPaid = Math.max(0, Number((collected - monthlyInt).toFixed(2)));

    if (extraPaid <= 0) {
      return { currentInterestPaid, extraPaid: 0, extraToPast: 0, extraToAdvance: 0, extraNote: "-" };
    }

    const currentPastDue = Math.max(0, Number(calc.pastDue || 0));
    const hasManualPast = hasManualPastDueData(b);

    if (currentPastDue > 0) {
      const label = hasManualPast
        ? `+${fmtInrPlain(extraPaid)} (मागील मॅन्युअल बाकीतून वजा)`
        : `+${fmtInrPlain(extraPaid)} (मागील बाकीतून वजा)`;
      return { currentInterestPaid, extraPaid, extraToPast: extraPaid, extraToAdvance: 0, extraNote: label };
    }

    let prevPending = 0;
    const prevYm = getPrevYm(activeYm);
    const startYm = extractYm(b.startYm);
    if (prevYm && (!startYm || prevYm >= startYm) && window.HishobBridge && typeof window.HishobBridge.computeLedgerUpToMonth === "function") {
      try {
        const prevCalc = window.HishobBridge.computeLedgerUpToMonth(b, prevYm);
        prevPending = Math.max(0, Number(prevCalc.totalPayable || 0));
      } catch (_) {}
    }

    const paysInMonth = (Array.isArray(b.paymentHistory) ? b.paymentHistory : []).filter(
      (p) => extractYm(p.ym || p.month || p.date || p.ts) === activeYm
    );
    const mentionedPastCut = paysInMonth.some((p) => {
      const txt = `${p.note || ""} ${p.type || ""} ${p.appliedTo || ""}`.toLowerCase();
      return txt.includes("मागील") || txt.includes("past") || txt.includes("manual") || txt.includes("मॅन्युअल");
    });

    if (prevPending > 0) {
      const cutPast = Math.min(extraPaid, prevPending);
      const toAdv = Math.max(0, Number((extraPaid - cutPast).toFixed(2)));
      const note = toAdv > 0
        ? `+${fmtInrPlain(cutPast)} (मागील बाकीत वजा), +${fmtInrPlain(toAdv)} (पुढील अ‍ॅडव्हान्स)`
        : `+${fmtInrPlain(cutPast)} (मागील बाकीतून वजा)`;
      return { currentInterestPaid, extraPaid, extraToPast: cutPast, extraToAdvance: toAdv, extraNote: note };
    }

    if (hasManualPast || mentionedPastCut) {
      return {
        currentInterestPaid,
        extraPaid,
        extraToPast: extraPaid,
        extraToAdvance: 0,
        extraNote: `+${fmtInrPlain(extraPaid)} (मागील मॅन्युअल बाकीतून वजा)`
      };
    }

    return {
      currentInterestPaid,
      extraPaid,
      extraToPast: 0,
      extraToAdvance: extraPaid,
      extraNote: `+${fmtInrPlain(extraPaid)} (पुढील महिन्यात अ‍ॅडव्हान्स)`
    };
  }

  function buildPastDueBreakdown(calc) {
    const pastTotal = Math.max(0, Number(calc.pastDue || 0));
    if (pastTotal <= 0) return { text: "-", last3: [], olderSum: 0 };

    const months = (Array.isArray(calc.pastPendingMonths) ? calc.pastPendingMonths : [])
      .filter((pm) => Number(pm.remaining || 0) > 0)
      .sort((a, b) => String(a.ym || "").localeCompare(String(b.ym || "")));

    if (!months.length) {
      return { text: `मागील बाकी: ${fmtInrPlain(pastTotal)}`, last3: [], olderSum: pastTotal };
    }

    const last3 = months.slice(-3);
    const olderMonths = months.slice(0, -3);
    const itemizedSum = months.reduce((s, pm) => s + Number(pm.remaining || 0), 0);
    const unitemized = Math.max(0, pastTotal - itemizedSum);
    const olderSum = olderMonths.reduce((s, pm) => s + Number(pm.remaining || 0), 0) + unitemized;

    const parts = last3.map((pm) => `${fmtYmShort(pm.ym)}: ${fmtInrPlain(pm.remaining)}`);
    if (olderSum > 0) parts.push(`त्याआधीची बाकी: ${fmtInrPlain(olderSum)}`);

    return { text: parts.join(" | "), last3, olderSum };
  }

  // =========================================================================
  // ३. मुख्य Single Source of Truth रिपोर्ट बिल्डर (V16 BigInt सुसंगत)
  // =========================================================================
  function getMonthReport(forceYm) {
    const activeYm = forceYm || getActiveYm();
    const L = L16();
    const borrowers = window.HishobBridge && typeof window.HishobBridge.getBorrowers === "function"
      ? (window.HishobBridge.getBorrowers() || [])
      : [];
    const udRaw = typeof window.getProUdhaariList === "function" ? (window.getProUdhaariList() || []) : [];

    let pSum = 0, payCnt = 0, updMax = "", wSum = 0;
    for (let i = 0; i < borrowers.length; i++) {
      const b = borrowers[i];
      pSum += Number(b.principal || 0);
      payCnt += Array.isArray(b.paymentHistory) ? b.paymentHistory.length : 0;
      wSum += Number(b.v16AdvanceWallet?.balance || 0);
      const u = String(b.updatedAt || "");
      if (u > updMax) updMax = u;
    }
    const key = `${activeYm}|${borrowers.length}|${pSum}|${payCnt}|${wSum}|${updMax}|ud:${udRaw.length}`;
    const now = Date.now();
    if (cachedReport && cacheKey === key && now - cacheTs < 450) {
      return cachedReport;
    }

    const validBorrowers = borrowers.filter((b) => b && !b.isDeleted);
    const bulkBuckets = detectBulkImportBuckets(validBorrowers);

    const rows = [];
    const newAccounts = [];
    const principalMoves = [];
    const interestMoves = [];

    const summary = {
      activeCount: 0,
      newCount: 0,
      newPrincipalSum: 0,
      totalPrincipal: 0,
      extraPrincipalAddedSum: 0,
      extraPrincipalReducedSum: 0,
      compoundedPrincipalSum: 0,
      advanceWalletTotalSum: 0,
      expectedInterest: 0,
      collectedInterest: 0,
      paidAccountsCount: 0,
      currentPendingSum: 0,
      currentPendingCount: 0,
      pastPendingSum: 0,
      pastPendingCount: 0,
      totalPendingSum: 0,
      collectionPct: 0
    };

    validBorrowers.forEach((b) => {
      const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
      const pe = getPrincipalEventsInMonth(b, activeYm);
      const isNew = isTrulyNewInMonth(b, calc, activeYm, bulkBuckets);
      const isClosed = b.accountStatus === "closed";

      if (isClosed && !isNew && pe.added === 0 && pe.reduced === 0 && pe.compoundedAdded === 0 && Number(calc.collectedInMonth || 0) <= 0) {
        return;
      }

      // V16 BigInt अचूकता + Historical Lock + Advance Wallet तपासा
      const v16Det = L ? L.computeMonthInterestDetails(b, activeYm) : null;
      const hasV16Special = Boolean(
        v16Det &&
        (v16Det.isLocked ||
          (Array.isArray(b.v16Terms) && b.v16Terms.length > 0) ||
          (b.ratePeriod && b.ratePeriod !== "monthly") ||
          (Number(b.fixedInterest || 0) <= 0 && Number(b.rate || 0) > 0))
      );

      const monthlyInterest = hasV16Special
        ? Math.max(0, v16Det.interestRupees)
        : Math.max(0, Number(calc.monthlyInterest || 0));

      const principal = Number(b.principal || 0);
      const collected = Math.max(0, Number(calc.collectedInMonth || 0));
      const pastDue = Math.max(0, Number(calc.pastDue || 0));

      // चालू महिन्याची बाकी BigInt नुसार अचूक काढा (अ‍ॅडव्हान्स वॉलेट यात मिसळत नाही)
      const currentPending = L
        ? Math.max(0, L.paiseToRupeesNum(L.toPaise(monthlyInterest) - L.toPaise(Math.min(collected, monthlyInterest))))
        : Math.max(0, Number(calc.remainingThisMonth || 0));

      const totalPending = L
        ? Math.max(0, L.paiseToRupeesNum(L.toPaise(currentPending) + L.toPaise(pastDue)))
        : Math.max(0, Number(calc.totalPayable || 0));

      const walletBalancePaise = L ? L.getAdvanceWalletBalancePaise(b) : 0n;
      const walletBalance = L ? L.paiseToRupeesNum(walletBalancePaise) : 0;
      const lateFeeInfo = L && currentPending > 0 ? L.computeLateFeeIstPaise(b, activeYm) : { daysLate: 0, feePaise: 0n };

      const extra = computeExtraAllocation(b, calc, monthlyInterest, activeYm);
      const pastBrk = buildPastDueBreakdown(calc);

      let statusLabel = "बाकी";
      if (isClosed) statusLabel = "बंद";
      else if (monthlyInterest > 0 && collected >= monthlyInterest) statusLabel = "पूर्ण जमा";
      else if (collected > 0) statusLabel = "अर्धवट";

      if (!isClosed) {
        summary.activeCount += 1;
        summary.totalPrincipal += principal;
        summary.expectedInterest = Number((summary.expectedInterest + monthlyInterest).toFixed(2));
        summary.collectedInterest = Number((summary.collectedInterest + collected).toFixed(2));
        summary.advanceWalletTotalSum = Number((summary.advanceWalletTotalSum + walletBalance).toFixed(2));
        if (collected > 0 || statusLabel === "पूर्ण जमा") summary.paidAccountsCount += 1;
        if (currentPending > 0) { summary.currentPendingSum = Number((summary.currentPendingSum + currentPending).toFixed(2)); summary.currentPendingCount += 1; }
        if (pastDue > 0) { summary.pastPendingSum = Number((summary.pastPendingSum + pastDue).toFixed(2)); summary.pastPendingCount += 1; }
        summary.totalPendingSum = Number((summary.totalPendingSum + totalPending).toFixed(2));
      }

      summary.extraPrincipalAddedSum += pe.added;
      summary.extraPrincipalReducedSum += pe.reduced;
      summary.compoundedPrincipalSum += pe.compoundedAdded;

      if (isNew) {
        const initAmt = Number(b.v17OpeningPrincipal || b.originalPrincipal || b.principal || 0);
        summary.newCount += 1;
        summary.newPrincipalSum += initAmt;
        newAccounts.push({
          id: b.id,
          name: b.name || "ग्राहक",
          amount: initAmt,
          date: b.loanDate || activeYm,
          rate: b.rate || 0,
          guarantor: b.guarantor || ""
        });
      }

      pe.items.forEach((it) => {
        principalMoves.push({
          id: b.id,
          name: b.name || "ग्राहक",
          kind: it.kind, // add | reduce | compound
          amount: it.amount,
          date: it.date,
          note: it.note
        });
      });

      if (collected > 0) {
        interestMoves.push({
          id: b.id,
          name: b.name || "ग्राहक",
          monthlyInterest,
          collected,
          currentInterestPaid: extra.currentInterestPaid,
          extraPaid: extra.extraPaid,
          extraToPast: extra.extraToPast,
          extraToAdvance: extra.extraToAdvance,
          extraNote: extra.extraNote === "-" ? "" : extra.extraNote,
          statusLabel
        });
      }

      rows.push({
        b,
        calc,
        v16: {
          isLocked: Boolean(v16Det?.isLocked),
          ratePeriod: v16Det?.terms?.ratePeriod || b.ratePeriod || "monthly",
          interestType: v16Det?.terms?.interestType || b.interestType || "reducing",
          openingPrincipal: v16Det ? L.paiseToRupeesNum(v16Det.openingPrincipalPaise) : Number(b.originalPrincipal || principal),
          compoundEnabled: Boolean(b.v18Compound?.enabled),
          lastCompoundedYm: b.v18Compound?.lastCompoundedYm || "",
          compoundedAddedInMonth: pe.compoundedAdded,
          walletBalance,
          walletBalancePaise,
          daysLateIst: lateFeeInfo.daysLate,
          lateFeeIst: L ? L.paiseToRupeesNum(lateFeeInfo.feePaise) : 0
        },
        id: b.id,
        name: b.name || "ग्राहक",
        mobile: cleanMob(b.mobile) || "-",
        isClosed,
        isNew,
        principal,
        extraPrincipalAdded: pe.added,
        extraPrincipalReduced: pe.reduced,
        compoundedPrincipalAdded: pe.compoundedAdded,
        monthlyInterest,
        collected,
        currentInterestPaid: extra.currentInterestPaid,
        extraPaid: extra.extraPaid,
        extraToPast: extra.extraToPast,
        extraToAdvance: extra.extraToAdvance,
        extraNote: extra.extraNote,
        currentPending,
        pastDue,
        pastBreakdownText: pastBrk.text,
        totalPending,
        walletBalance,
        statusLabel
      });
    });

    summary.collectionPct = summary.expectedInterest > 0
      ? Math.min(100, Math.round((summary.collectedInterest / summary.expectedInterest) * 100))
      : 0;

    // स्वतंत्र उधारी विभाग (व्याजापेक्षा १००% वेगळा)
    const udRows = [];
    const udMoves = [];
    let udTotAmt = 0, udTotPaid = 0, udTotRem = 0, udGivenInMonthSum = 0, udRetInMonthSum = 0;

    udRaw.forEach((u) => {
      if (!u || u.isDeleted) return;
      const gYm = extractYm(u.givenYm || u.givenDate) || activeYm;
      if (gYm > activeYm) return;

      const amt = Number(u.amount || 0);
      const paidAmt = Number(u.paidAmount || 0);
      const remAmt = Math.max(0, amt - paidAmt);
      const isFull = remAmt <= 0 || u.status === "paid";
      const retYm = extractYm(u.returnedYm || u.returnedDate);

      if (gYm === activeYm) {
        udGivenInMonthSum += amt;
        udMoves.push({
          kind: "given",
          name: u.name || "व्यक्ती",
          amount: amt,
          date: u.givenDate || activeYm,
          note: u.promiseDate ? `वायदा: ${fmtDateShort(u.promiseDate)}` : (u.note || "")
        });
      }

      const pays = Array.isArray(u.payments) ? u.payments : [];
      if (pays.length) {
        pays.forEach((p) => {
          const pYm = extractYm(p.ym || p.date);
          if (pYm === activeYm && Number(p.amount || 0) > 0) {
            const pAmt = Number(p.amount || 0);
            udRetInMonthSum += pAmt;
            udMoves.push({
              kind: "returned",
              name: u.name || "व्यक्ती",
              amount: pAmt,
              date: p.date || activeYm,
              note: `घेतले: ${fmtYmMr(gYm)}`
            });
          }
        });
      } else if (retYm === activeYm && paidAmt > 0) {
        udRetInMonthSum += paidAmt;
        udMoves.push({
          kind: "returned",
          name: u.name || "व्यक्ती",
          amount: paidAmt,
          date: u.returnedDate || activeYm,
          note: `घेतले: ${fmtYmMr(gYm)}`
        });
      }

      if (isFull && retYm && retYm < activeYm) return;

      udTotAmt += amt;
      udTotPaid += paidAmt;
      udTotRem += remAmt;
      udRows.push({ ...u, givenYm: gYm, retYm, amt, paidAmt, remAmt, isFull });
    });

    udRows.sort((a, b) => Number(a.isFull) - Number(b.isFull));

    // टीप: चक्रवाढ (compoundedPrincipalSum) रोख खर्च (totalOut) किंवा रोख जमा (totalIn) मध्ये चुकून मोजले जात नाही!
    const cashflow = {
      totalOut: Number((summary.newPrincipalSum + summary.extraPrincipalAddedSum + udGivenInMonthSum).toFixed(2)),
      totalIn: Number((summary.collectedInterest + summary.extraPrincipalReducedSum + udRetInMonthSum).toFixed(2))
    };

    cachedReport = {
      activeYm,
      rows,
      newAccounts,
      principalMoves,
      interestMoves,
      summary,
      udhaari: {
        rows: udRows,
        moves: udMoves,
        totAmt: udTotAmt,
        totPaid: udTotPaid,
        totRem: udTotRem,
        givenInMonthSum: udGivenInMonthSum,
        returnedInMonthSum: udRetInMonthSum
      },
      cashflow
    };
    cacheKey = key;
    cacheTs = now;
    return cachedReport;
  }

  // =========================================================================
  // ४. Pure White Professional A4 Portrait Print Engine (० काळे पट्टे, ० कोरी पेजेस)
  // =========================================================================
  function injectPureWhitePrintCss() {
    if (document.getElementById("vyajPureWhiteA4Css")) return;
    const st = document.createElement("style");
    st.id = "vyajPureWhiteA4Css";
    st.textContent = `
      @media print {
        @page { size: A4 portrait; margin: 9mm 7mm; }
        html, body {
          background: #ffffff !important;
          color: #000000 !important;
          color-scheme: light !important;
          height: auto !important;
          min-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          -webkit-print-color-adjust: economy !important;
          print-color-adjust: economy !important;
        }
        body > *:not(#printArea) {
          display: none !important;
        }
        #printArea {
          display: block !important;
          visibility: visible !important;
          position: static !important;
          width: 100% !important;
          height: auto !important;
          background: #ffffff !important;
          color: #000000 !important;
          padding: 0 !important;
          margin: 0 !important;
          font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif !important;
        }
        #printArea * {
          visibility: visible !important;
          color: #000000 !important;
          background: transparent !important;
          box-shadow: none !important;
          text-shadow: none !important;
        }
        #printArea .pw-head {
          display: flex; justify-content: space-between; align-items: flex-end; gap: 8px;
          border-bottom: 2px solid #000000; padding-bottom: 5px; margin-bottom: 7px;
        }
        #printArea .pw-title { font-size: 14px; font-weight: 900; margin: 0; }
        #printArea .pw-sub { font-size: 9.5px; margin-top: 2px; }
        #printArea .pw-kpi {
          display: flex; flex-wrap: wrap; gap: 5px 12px; font-size: 9.5px; font-weight: 700;
          padding: 5px 7px; margin-bottom: 8px; border: 1.4px solid #000000;
        }
        #printArea table.pw-tbl {
          width: 100%; border-collapse: collapse; font-size: 8.6px; margin-bottom: 10px;
          table-layout: auto;
        }
        #printArea table.pw-tbl thead { display: table-header-group; }
        #printArea table.pw-tbl tr { page-break-inside: avoid; break-inside: avoid; }
        #printArea table.pw-tbl th, #printArea table.pw-tbl td {
          border: 1px solid #222222; padding: 3px 3.5px; vertical-align: top; line-height: 1.28;
        }
        #printArea table.pw-tbl th {
          border-bottom: 2px solid #000000; font-weight: 900; text-align: left;
        }
        #printArea table.pw-tbl tfoot td {
          border-top: 2px solid #000000; font-weight: 900;
        }
        #printArea .pw-num { text-align: right; white-space: nowrap; }
        #printArea .pw-tag {
          display: inline-block; padding: 0 3px; margin-left: 3px;
          border: 1px solid #000000; border-radius: 2px; font-size: 7.2px; font-weight: 900;
        }
        #printArea .pw-mob { font-size: 7.6px; display: block; margin-top: 1px; }
        #printArea .pw-sec-title {
          font-size: 11.5px; font-weight: 900; margin: 10px 0 5px;
          padding-top: 7px; border-top: 2px dashed #000000;
        }
      }
    `;
    document.head.appendChild(st);
  }

  function printPureWhiteA4(htmlContent) {
    injectPureWhitePrintCss();
    const printArea = document.getElementById("printArea");
    if (!printArea) return;

    printArea.innerHTML = htmlContent;

    const wasLight = document.body.classList.contains("light-mode");
    document.documentElement.style.colorScheme = "light";
    if (!wasLight) document.body.classList.add("light-mode");

    let restored = false;
    const restoreTheme = () => {
      if (restored) return;
      restored = true;
      document.documentElement.style.colorScheme = "";
      if (!wasLight) document.body.classList.remove("light-mode");
    };

    window.addEventListener("afterprint", restoreTheme, { once: true });
    setTimeout(() => {
      window.print();
      setTimeout(restoreTheme, 1800);
    }, 60);
  }

  // =========================================================================
  // ५. Single Render Scheduler (सर्व मॉड्यूल्ससाठी एकच शांत सिग्नल)
  // =========================================================================
  function invalidateAndNotify() {
    cacheTs = 0;
    clearTimeout(busTimer);
    busTimer = setTimeout(() => {
      const report = getMonthReport();
      subscribers.forEach((fn) => {
        try { fn(report); } catch (err) { console.warn("Kernel Subscriber Warning:", err); }
      });
    }, 180);
  }

  function subscribe(fn) {
    if (typeof fn === "function") subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  function initKernelBus() {
    const listEl = document.getElementById("borrowersList");
    if (listEl) {
      const obs = new MutationObserver(invalidateAndNotify);
      obs.observe(listEl, { childList: true });
    }
    document.getElementById("activeYm")?.addEventListener("change", invalidateAndNotify);
  }

  window.VyajLedgerCache = {
    getSnapshot: (ym) => {
      const r = getMonthReport(ym);
      const s = r.summary;
      return {
        activeYm: r.activeYm,
        activeCount: s.activeCount,
        expected: s.expectedInterest,
        collected: s.collectedInterest,
        paidAccounts: s.paidAccountsCount,
        currentPending: s.currentPendingSum,
        currentPendingCount: s.currentPendingCount,
        pastPending: s.pastPendingSum,
        pastPendingCount: s.pastPendingCount,
        totalPending: s.totalPendingSum,
        pct: s.collectionPct,
        rows: r.rows
      };
    }
  };

  window.VyajKernel = {
    version: "16.0",
    esc,
    fmtNum,
    fmtInr,
    fmtInrPlain,
    fmtYmMr,
    fmtYmShort,
    fmtDateShort,
    extractYm,
    getActiveYm,
    cleanMob,
    getMonthReport,
    printPureWhiteA4,
    subscribe,
    refresh: invalidateAndNotify
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initKernelBus);
  else initKernelBus();
})();
