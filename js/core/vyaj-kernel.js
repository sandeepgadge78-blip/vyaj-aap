// व्याज हिशोब वही - VyajOS Central Kernel (Single Source of Truth + Single Render Bus + Pure White A4 Print Engine) (js/core/vyaj-kernel.js - V15.0)
(function () {
  const MONTHS_MR = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];
  const MONTHS_SHORT = ["जाने", "फेब्रु", "मार्च", "एप्रि", "मे", "जून", "जुलै", "ऑग", "सप्टें", "ऑक्टो", "नोव्हें", "डिसें"];

  const subscribers = new Set();
  let cacheKey = "";
  let cacheTs = 0;
  let cachedReport = null;
  let busTimer = null;

  // =========================================================================
  // १. सुरक्षित युटिलिटी फंक्शन्स (संपूर्ण अ‍ॅपसाठी एकच फॉरमॅट)
  // =========================================================================
  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function fmtNum(val) {
    return Math.round(Number(val || 0)).toLocaleString("en-IN");
  }

  function fmtInr(val) {
    const n = Number(val || 0);
    if (window.HishobBridge && typeof window.HishobBridge.fmtAmt === "function") {
      return window.HishobBridge.fmtAmt(n);
    }
    return "₹" + fmtNum(n);
  }

  function fmtInrPlain(val) {
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
    return document.getElementById("activeYm")?.value || new Date().toISOString().slice(0, 7);
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

  // कोणत्याही तारीख फॉरमॅटमधून (ISO, DD/MM/YYYY, Timestamp, Firestore) अचूक YYYY-MM काढा
  function extractYm(val) {
    if (!val) return "";
    if (typeof val === "object") {
      if (typeof val.toDate === "function") {
        const d = val.toDate();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
      if (typeof val.seconds === "number") {
        const d = new Date(val.seconds * 1000);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
    }
    if (typeof val === "number" && val > 100000000000) {
      const d = new Date(val);
      if (!Number.isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
      const d = val.toDate();
      return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    }
    if (typeof val === "number" && val > 100000000000) {
      const d = new Date(val);
      if (!Number.isNaN(d.getTime())) {
        return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
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
  // २. अचूक मागील बाकी, बल्क-इम्पोर्ट ओळख आणि अतिरिक्त मुद्दल वाचन
  // =========================================================================
  function hasManualPastDueData(b) {
    if (Number(b.customDue || 0) > 0 || Number(b.manualDue || 0) > 0 || Number(b.initialPastDue || 0) > 0) return true;
    const mp = b.manualPastDues || b.pastManualDues || b.manualMonths || b.customMonths;
    if (Array.isArray(mp) && mp.length > 0) return true;
    if (mp && typeof mp === "object" && Object.keys(mp).length > 0) return true;
    return false;
  }

  // जुने बल्क-इम्पोर्ट केलेले ४८ ग्राहक चुकून 'नवीन खाती' मध्ये मोजले जाऊ नयेत म्हणून स्मार्ट तपासणी
  function detectBulkImportBuckets(borrowers) {
    const bucketCounts = new Map();
    borrowers.forEach((b) => {
      const cStr = String(b.createdAt || "").slice(0, 15); // ~१० मिनिटांचा स्लॉट
      if (cStr) bucketCounts.set(cStr, (bucketCounts.get(cStr) || 0) + 1);
    });
    return bucketCounts;
  }

  function isTrulyNewInMonth(b, calc, activeYm, bulkBuckets) {
    // जर खात्याला कोणतीही मागील बाकी किंवा जुने थकीत महिने असतील, तर ते नवीन खाते असूच शकत नाही
    if (Number(calc.pastDue || 0) > 0) return false;
    if (Array.isArray(calc.pastPendingMonths) && calc.pastPendingMonths.length > 0) return false;
    if (hasManualPastDueData(b)) return false;

    const loanYm = extractYm(b.loanDate);
    const startYm = extractYm(b.startYm);
    const createdYm = extractYm(b.createdAt);

    // जर मुद्दल दिल्याची तारीख मागील महिन्याची असेल तर ते जुने खाते आहे
    if (loanYm && loanYm !== activeYm) return false;

    // एकाच वेळी ६+ खाती इम्पोर्ट केली असल्यास ती जुनी माइग्रेटेड खाती माना
    const cBucket = String(b.createdAt || "").slice(0, 15);
    const isBulkBatch = Boolean(cBucket && (bulkBuckets.get(cBucket) || 0) >= 6);
    if (isBulkBatch && !loanYm) return false;
    if (isBulkBatch && loanYm === activeYm && !b.isManualNew) {
      // बल्क इम्पोर्टमध्येही जर loanDate ही createdAt तारखेपेक्षा वेगळी असेल तर ती खरी मुद्दल तारीख समजा
      const loanDay = String(b.loanDate || "").slice(0, 10);
      const createdDay = String(b.createdAt || "").slice(0, 10);
      if (loanDay === createdDay) return false;
    }

    if (loanYm === activeYm) return true;
    if (!loanYm && startYm === activeYm && createdYm === activeYm && !isBulkBatch) return true;
    return false;
  }

  // निवडलेल्या महिन्यातील सर्व अतिरिक्त मुद्दल (+) व परत मुद्दल (-) नोंदी अचूक काढा
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

      const absAmt = Math.abs(rawAmt);
      if (isReduce) {
        reduced += absAmt;
        items.push({ kind: "reduce", amount: absAmt, date: dateVal, note: ev.note || ev.reason || "" });
      } else {
        added += absAmt;
        items.push({ kind: "add", amount: absAmt, date: dateVal, note: ev.note || ev.reason || "" });
      }
    });

    return { added, reduced, items };
  }

  // एक्स्ट्रा जमा रक्कम मागील बाकीतून वजा झाली की पुढील महिन्यात अ‍ॅडव्हान्स गेली याचा १००% अचूक हिशोब
  function computeExtraAllocation(b, calc, activeYm) {
    const monthlyInt = Math.max(0, Number(calc.monthlyInterest || 0));
    const collected = Math.max(0, Number(calc.collectedInMonth || 0));
    const currentInterestPaid = Math.min(collected, monthlyInt);
    const extraPaid = Math.max(0, collected - monthlyInt);

    if (extraPaid <= 0) {
      return { currentInterestPaid, extraPaid: 0, extraToPast: 0, extraToAdvance: 0, extraNote: "-" };
    }

    const currentPastDue = Math.max(0, Number(calc.pastDue || 0));
    const hasManualPast = hasManualPastDueData(b);

    // १. जर आत्ताही मागील बाकी (> 0) शिल्लक असेल (उदा. हर्षद पटेल ₹32,000), तर १००% एक्स्ट्रा रक्कम मागील बाकीतूनच वजा झाली आहे
    if (currentPastDue > 0) {
      const label = hasManualPast
        ? `+${fmtInrPlain(extraPaid)} (मागील मॅन्युअल बाकीतून वजा)`
        : `+${fmtInrPlain(extraPaid)} (मागील बाकीतून वजा)`;
      return { currentInterestPaid, extraPaid, extraToPast: extraPaid, extraToAdvance: 0, extraNote: label };
    }

    // २. मागील महिन्याची बाकी तपासा (जर या एक्स्ट्रा रकमेने मागील बाकी पूर्ण संपली असेल तर)
    let prevPending = 0;
    const prevYm = getPrevYm(activeYm);
    const startYm = extractYm(b.startYm);
    if (prevYm && (!startYm || prevYm >= startYm) && window.HishobBridge && typeof window.HishobBridge.computeLedgerUpToMonth === "function") {
      try {
        const prevCalc = window.HishobBridge.computeLedgerUpToMonth(b, prevYm);
        prevPending = Math.max(0, Number(prevCalc.totalPayable || 0));
      } catch (_) {}
    }

    // ३. जर मॅन्युअल बाकी अस्तित्वात असेल किंवा paymentHistory मध्ये मागील बाकीचा उल्लेख असेल
    const paysInMonth = (Array.isArray(b.paymentHistory) ? b.paymentHistory : []).filter(
      (p) => extractYm(p.ym || p.month || p.date || p.ts) === activeYm
    );
    const mentionedPastCut = paysInMonth.some((p) => {
      const txt = `${p.note || ""} ${p.type || ""} ${p.appliedTo || ""}`.toLowerCase();
      return txt.includes("मागील") || txt.includes("past") || txt.includes("manual") || txt.includes("मॅन्युअल");
    });

    if (prevPending > 0) {
      const cutPast = Math.min(extraPaid, prevPending);
      const toAdv = Math.max(0, extraPaid - cutPast);
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

    // ४. खरोखरच कोणतीही मागील बाकी नसल्यास पुढील महिन्यात अ‍ॅडव्हान्स
    return {
      currentInterestPaid,
      extraPaid,
      extraToPast: 0,
      extraToAdvance: extraPaid,
      extraNote: `+${fmtInrPlain(extraPaid)} (पुढील महिन्यात अ‍ॅडव्हान्स)`
    };
  }

  // मागील बाकी विभागणी: शेवटचे ३ महिने नावासह + त्याआधीची बाकी वेगळी
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
  // ३. मुख्य Single Source of Truth रिपोर्ट बिल्डर (व्याज + स्वतंत्र उधारी)
  // =========================================================================
  function getMonthReport(forceYm) {
    const activeYm = forceYm || getActiveYm();
    const borrowers = window.HishobBridge && typeof window.HishobBridge.getBorrowers === "function"
      ? (window.HishobBridge.getBorrowers() || [])
      : [];
    const udRaw = typeof window.getProUdhaariList === "function" ? (window.getProUdhaariList() || []) : [];

    // जलद Fingerprint तपासणी (एकाच डेटावर पुन्हा-पुन्हा गणित टाळण्यासाठी)
    let pSum = 0, payCnt = 0, updMax = "";
    for (let i = 0; i < borrowers.length; i++) {
      const b = borrowers[i];
      pSum += Number(b.principal || 0);
      payCnt += Array.isArray(b.paymentHistory) ? b.paymentHistory.length : 0;
      const u = String(b.updatedAt || "");
      if (u > updMax) updMax = u;
    }
    const key = `${activeYm}|${borrowers.length}|${pSum}|${payCnt}|${updMax}|ud:${udRaw.length}`;
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

      // बंद खात्यात या महिन्यात कोणतीच हालचाल नसेल तर वगळा
      if (isClosed && !isNew && pe.added === 0 && pe.reduced === 0 && Number(calc.collectedInMonth || 0) <= 0) {
        return;
      }

      const principal = Number(b.principal || 0);
      const monthlyInterest = Math.max(0, Number(calc.monthlyInterest || 0));
      const collected = Math.max(0, Number(calc.collectedInMonth || 0));
      const currentPending = Math.max(0, Number(calc.remainingThisMonth || 0));
      const pastDue = Math.max(0, Number(calc.pastDue || 0));
      const totalPending = Math.max(0, Number(calc.totalPayable || 0));

      const extra = computeExtraAllocation(b, calc, activeYm);
      const pastBrk = buildPastDueBreakdown(calc);

      let statusLabel = "बाकी";
      if (isClosed) statusLabel = "बंद";
      else if (calc.status === "paid" || (monthlyInterest > 0 && collected >= monthlyInterest)) statusLabel = "पूर्ण जमा";
      else if (collected > 0) statusLabel = "अर्धवट";

      if (!isClosed) {
        summary.activeCount += 1;
        summary.totalPrincipal += principal;
        summary.expectedInterest += monthlyInterest;
        summary.collectedInterest += collected;
        if (collected > 0 || calc.status === "paid") summary.paidAccountsCount += 1;
        if (currentPending > 0) { summary.currentPendingSum += currentPending; summary.currentPendingCount += 1; }
        if (pastDue > 0) { summary.pastPendingSum += pastDue; summary.pastPendingCount += 1; }
        summary.totalPendingSum += totalPending;
      }

      summary.extraPrincipalAddedSum += pe.added;
      summary.extraPrincipalReducedSum += pe.reduced;

      if (isNew) {
        const initAmt = Number(b.originalPrincipal || b.principal || 0);
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
          kind: it.kind,
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
        id: b.id,
        name: b.name || "ग्राहक",
        mobile: cleanMob(b.mobile) || "-",
        isClosed,
        isNew,
        principal,
        extraPrincipalAdded: pe.added,
        extraPrincipalReduced: pe.reduced,
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

    const cashflow = {
      totalOut: summary.newPrincipalSum + summary.extraPrincipalAddedSum + udGivenInMonthSum,
      totalIn: summary.collectedInterest + summary.extraPrincipalReducedSum + udRetInMonthSum
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

    // Android Chrome Dark Mode काळे पट्टे टाळण्यासाठी प्रिंटच्या क्षणी तात्पुरता Light Mode
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

  // जुन्या VyajLedgerCache शी १००% सुसंगतता (अ‍ॅप तुटू नये म्हणून)
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
    version: "15.0",
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
