// व्याज Infinity X - Banking-Grade BigInt Financial Engine (src/core/ledger-v16.js)
// वैशिष्ट्ये: BigInt पैसे गणित, Half-Up Rounding, Monthly/Daily/Yearly Actual/365, Reducing/Flat,
// IST (Asia/Kolkata) घड्याळ, Strict Date Validator, Historical Locks, Opt-in Compound, Advance Wallet,
// BigInt EMI आणि जुन्या app.js डेटाशी (extraPrincipals, principalReductions, customPastDues) १००% सुसंगतता.

const RATE_SCALE = 10000n;
const PCT_DENOM = 1000000n;
const YEAR_DENOM = 365000000n;
const FP_SCALE = 1000000000000000000n; // 10^18 Fixed-Point

export const MONTHS_MR = [
  "जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून",
  "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"
];
export const MONTHS_SHORT_MR = [
  "जाने", "फेब्रु", "मार्च", "एप्रि", "मे", "जून",
  "जुलै", "ऑग", "सप्टें", "ऑक्टो", "नोव्हें", "डिसें"
];

// =========================================================================
// १. BigInt पैसे व Half-Up Rounding (१ पैशाचीही चूक नाही)
// =========================================================================
export function divRoundHalfUp(num, den) {
  if (den === 0n) return 0n;
  const neg = (num < 0n) !== (den < 0n);
  const a = num < 0n ? -num : num;
  const b = den < 0n ? -den : den;
  const q = (a * 2n + b) / (b * 2n);
  return neg ? -q : q;
}

export function toPaise(val) {
  if (typeof val === "bigint") return val;
  if (val === null || val === undefined || val === "") return 0n;
  const raw = String(val).replace(/[,₹\s]/g, "").trim();
  if (!raw || raw === "-" || raw === "+") return 0n;
  if (!/^[+-]?\d*(\.\d*)?$/.test(raw)) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? toPaise(parsed.toFixed(4)) : 0n;
  }
  const neg = raw.startsWith("-");
  const clean = raw.replace(/^[+-]/, "");
  const [intStr = "0", fracStr = ""] = clean.split(".");
  let paise = (intStr ? BigInt(intStr) : 0n) * 100n;
  if (fracStr.length > 0) {
    paise += BigInt((fracStr + "00").slice(0, 2));
    if (fracStr.length >= 3 && parseInt(fracStr[2], 10) >= 5) paise += 1n;
  }
  return neg ? -paise : paise;
}

export function rateToScaled(rateVal) {
  if (typeof rateVal === "bigint") return rateVal;
  if (rateVal === null || rateVal === undefined || rateVal === "") return 0n;
  const raw = String(rateVal).replace(/[%\s,]/g, "").trim();
  if (!/^[+-]?\d*(\.\d*)?$/.test(raw)) {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? rateToScaled(n.toFixed(4)) : 0n;
  }
  const clean = raw.replace(/^[+-]/, "");
  const [intStr = "0", fracStr = ""] = clean.split(".");
  let scaled = (intStr ? BigInt(intStr) : 0n) * RATE_SCALE + BigInt((fracStr + "0000").slice(0, 4));
  if (fracStr.length >= 5 && parseInt(fracStr[4], 10) >= 5) scaled += 1n;
  return raw.startsWith("-") ? -scaled : scaled;
}

export function paiseToRupees(paise) {
  return Number(toPaise(paise)) / 100;
}

export function formatPaiseInr(paise, forceDecimals = false) {
  const p = toPaise(paise);
  const neg = p < 0n;
  const absP = neg ? -p : p;
  const rup = absP / 100n;
  const rem = absP % 100n;
  const rupStr = Number(rup).toLocaleString("en-IN");
  const sign = neg ? "-" : "";
  if (!forceDecimals && rem === 0n) return `${sign}₹${rupStr}`;
  return `${sign}₹${rupStr}.${String(rem).padStart(2, "0")}`;
}

export function formatRupeesInr(val, hideAmounts = false) {
  if (hideAmounts) return "₹••••";
  return formatPaiseInr(toPaise(val || 0), false);
}

// =========================================================================
// २. IST (Asia/Kolkata) घड्याळ व Strict Calendar Validator
// =========================================================================
export function isLeapYear(year) {
  const y = Number(year);
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(year, month) {
  const m = Number(month);
  if (m === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(m)) return 30;
  return m >= 1 && m <= 12 ? 31 : 0;
}

export function getIstParts(dateObj) {
  const d = dateObj instanceof Date ? dateObj : new Date();
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    });
    const parts = {};
    fmt.formatToParts(d).forEach((p) => { parts[p.type] = p.value; });
    const year = parseInt(parts.year, 10);
    const month = parseInt(parts.month, 10);
    const day = parseInt(parts.day, 10);
    return {
      year, month, day,
      hour: parseInt(parts.hour, 10) % 24,
      minute: parseInt(parts.minute, 10),
      second: parseInt(parts.second, 10),
      isoDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      ym: `${year}-${String(month).padStart(2, "0")}`
    };
  } catch (_) {
    const x = new Date(d.getTime() + 19800000);
    const year = x.getUTCFullYear();
    const month = x.getUTCMonth() + 1;
    const day = x.getUTCDate();
    return {
      year, month, day,
      hour: x.getUTCHours(), minute: x.getUTCMinutes(), second: x.getUTCSeconds(),
      isoDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      ym: `${year}-${String(month).padStart(2, "0")}`
    };
  }
}

export function getIstTodayIso(offsetDays = 0) {
  const base = new Date(Date.now() + offsetDays * 86400000);
  return getIstParts(base).isoDate;
}

export function getIstCurrentYm() {
  return getIstParts().ym;
}

export function compareYm(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

export function nextYm(ym) {
  const [y, m] = String(ym || getIstCurrentYm()).split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function prevYm(ym) {
  const [y, m] = String(ym || getIstCurrentYm()).split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function fmtYmMr(ym) {
  if (!ym || !String(ym).includes("-")) return String(ym || "");
  const [y, m] = String(ym).split("-");
  return `${MONTHS_MR[parseInt(m, 10) - 1] || m} ${y}`;
}

export function fmtYmShortMr(ym) {
  if (!ym || !String(ym).includes("-")) return String(ym || "");
  const [y, m] = String(ym).split("-");
  return `${MONTHS_SHORT_MR[parseInt(m, 10) - 1] || m} ${String(y).slice(-2)}`;
}

export function extractYm(val) {
  if (!val) return "";
  if (typeof val === "object") {
    if (typeof val.toDate === "function") return getIstParts(val.toDate()).ym;
    if (typeof val.seconds === "number") return getIstParts(new Date(val.seconds * 1000)).ym;
  }
  if (typeof val === "number" && val > 100000000000) return getIstParts(new Date(val)).ym;
  const s = String(val).trim();
  const iso = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${String(parseInt(iso[2], 10)).padStart(2, "0")}`;
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) return `${dmy[3]}-${String(parseInt(dmy[2], 10)).padStart(2, "0")}`;
  return "";
}

export function parseStrictDate(input) {
  if (!input) return { valid: false, error: "कृपया तारीख टाका." };
  const s = String(input).trim();
  let y = 0, m = 0, d = 0;
  const isoM = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const dmyM = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (isoM) { y = +isoM[1]; m = +isoM[2]; d = +isoM[3]; }
  else if (dmyM) { d = +dmyM[1]; m = +dmyM[2]; y = +dmyM[3]; }
  else return { valid: false, error: "तारीख अयोग्य फॉरमॅटमध्ये आहे (YYYY-MM-DD किंवा DD/MM/YYYY वापरा)." };

  if (y < 1900 || y > 2199) return { valid: false, error: `वर्ष (${y}) वैध नाही.` };
  if (m < 1 || m > 12) return { valid: false, error: `महिना (${m}) १ ते १२ दरम्यान असावा.` };
  const maxD = daysInMonth(y, m);
  if (d < 1 || d > maxD) {
    return { valid: false, error: `चुकीची तारीख: ${d}/${m}/${y} अस्तित्वात नाही (कमाल ${maxD} दिवस).` };
  }
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { valid: true, year: y, month: m, day: d, iso, isLeap: isLeapYear(y), utcMs: Date.UTC(y, m - 1, d) };
}

export function diffDaysStrict(startInput, endInput) {
  const st = parseStrictDate(startInput);
  if (!st.valid) return { valid: false, error: `सुरू तारीख — ${st.error}` };
  const en = parseStrictDate(endInput);
  if (!en.valid) return { valid: false, error: `शेवट तारीख — ${en.error}` };
  if (en.utcMs < st.utcMs) return { valid: false, error: "शेवटची तारीख सुरू तारखेपेक्षा आधीची असू शकत नाही." };
  return { valid: true, days: Math.round((en.utcMs - st.utcMs) / 86400000), start: st, end: en };
}

// =========================================================================
// ३. मुख्य व्याज गणना (Monthly / Daily / Yearly Actual/365 + Historical Locks)
// =========================================================================
export function calcInterestPaise({ principalPaise, rate, ratePeriod = "monthly", days = 1, months = 1 }) {
  const P = toPaise(principalPaise);
  const R = rateToScaled(rate);
  if (P <= 0n || R <= 0n) return 0n;
  const period = String(ratePeriod || "monthly").toLowerCase();
  if (period === "daily") {
    return divRoundHalfUp(P * R * BigInt(Math.max(0, Math.round(Number(days || 0)))), PCT_DENOM);
  }
  if (period === "yearly") {
    return divRoundHalfUp(P * R * BigInt(Math.max(0, Math.round(Number(days || 0)))), YEAR_DENOM);
  }
  return divRoundHalfUp(P * R * BigInt(Math.max(0, Math.round(Number(months || 1)))), PCT_DENOM);
}

export function getOpeningPrincipalPaise(b) {
  if (!b) return 0n;
  if (b.v17OpeningPrincipal !== undefined && b.v17OpeningPrincipal !== null && b.v17OpeningPrincipal !== "") {
    return toPaise(b.v17OpeningPrincipal);
  }
  if (b.originalPrincipal !== undefined && b.originalPrincipal !== null && b.originalPrincipal !== "") {
    return toPaise(b.originalPrincipal);
  }
  return toPaise(b.principal || 0);
}

export function resolveTermsForMonth(b, ym) {
  const base = {
    effectiveYm: String(b?.startYm || "").slice(0, 7) || "2000-01",
    principalPaise: toPaise(b?.principal || 0),
    rate: Number(b?.rate || 0),
    ratePeriod: String(b?.ratePeriod || "monthly").toLowerCase(),
    interestType: String(b?.interestType || "reducing").toLowerCase(),
    fixedInterestPaise: toPaise(b?.fixedMonthlyInterest ?? b?.fixedInterest ?? 0)
  };
  const terms = Array.isArray(b?.v16Terms) ? b.v16Terms : [];
  if (!terms.length || !ym) return base;

  const sorted = terms.filter((t) => t && t.effectiveYm).slice().sort((a, c) => compareYm(a.effectiveYm, c.effectiveYm));
  let matched = null;
  for (const t of sorted) {
    if (compareYm(t.effectiveYm, ym) <= 0) matched = t;
    else break;
  }
  if (!matched) return { ...base, principalPaise: getOpeningPrincipalPaise(b) };
  return {
    effectiveYm: String(matched.effectiveYm),
    principalPaise: matched.principal !== undefined ? toPaise(matched.principal) : base.principalPaise,
    rate: matched.rate !== undefined ? Number(matched.rate) : base.rate,
    ratePeriod: String(matched.ratePeriod || base.ratePeriod).toLowerCase(),
    interestType: String(matched.interestType || base.interestType).toLowerCase(),
    fixedInterestPaise: matched.fixedInterest !== undefined ? toPaise(matched.fixedInterest) : base.fixedInterestPaise
  };
}

export function computeMonthInterestDetails(b, ym) {
  const targetYm = String(ym || getIstCurrentYm()).slice(0, 7);
  const [yStr, mStr] = targetYm.split("-");
  const mDays = daysInMonth(parseInt(yStr, 10) || getIstParts().year, parseInt(mStr, 10) || getIstParts().month);
  const terms = resolveTermsForMonth(b, targetYm);
  const openingPaise = getOpeningPrincipalPaise(b);
  const locks = b && b.v16InterestLocks && typeof b.v16InterestLocks === "object" ? b.v16InterestLocks : null;

  if (locks && locks[targetYm] !== undefined && locks[targetYm] !== null) {
    const entry = locks[targetYm];
    const lockedPaise = typeof entry === "object"
      ? (entry.interestPaise !== undefined ? BigInt(String(entry.interestPaise)) : toPaise(entry.interest || 0))
      : toPaise(entry);
    return {
      ym: targetYm, daysInMonth: mDays, isLocked: true,
      interestPaise: lockedPaise, interestRupees: paiseToRupees(lockedPaise),
      basePrincipalPaise: terms.interestType === "flat" ? openingPaise : terms.principalPaise,
      openingPrincipalPaise: openingPaise, terms
    };
  }

  const basePrincipalPaise = terms.interestType === "flat" ? openingPaise : terms.principalPaise;
  const interestPaise = terms.fixedInterestPaise > 0n
    ? terms.fixedInterestPaise
    : calcInterestPaise({ principalPaise: basePrincipalPaise, rate: terms.rate, ratePeriod: terms.ratePeriod, days: mDays, months: 1 });

  return {
    ym: targetYm, daysInMonth: mDays, isLocked: false,
    interestPaise, interestRupees: paiseToRupees(interestPaise),
    basePrincipalPaise, openingPrincipalPaise: openingPaise, terms
  };
}

// IST नुसार विलंब दंड (BigInt पैसे)
export function computeLateFeeIstPaise(b, targetYm, isPaid = false) {
  if (isPaid || b?.accountStatus === "closed") return { daysLate: 0, feePaise: 0n };
  const feePerDayPaise = toPaise(b.lateFeePerDay ?? b.lateFee ?? 0);
  const dueDay = parseInt(b.interestDay || 0, 10);
  if (feePerDayPaise <= 0n || dueDay < 1 || dueDay > 31) return { daysLate: 0, feePaise: 0n };

  const ist = getIstParts();
  const [yStr, mStr] = String(targetYm || ist.ym).split("-");
  const y = parseInt(yStr, 10), m = parseInt(mStr, 10);
  if (!y || !m) return { daysLate: 0, feePaise: 0n };

  const dueIso = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(dueDay, daysInMonth(y, m))).padStart(2, "0")}`;
  if (ist.isoDate <= dueIso) return { daysLate: 0, feePaise: 0n };
  const diff = diffDaysStrict(dueIso, ist.isoDate);
  if (!diff.valid || diff.days <= 0) return { daysLate: 0, feePaise: 0n };
  return { daysLate: diff.days, feePaise: feePerDayPaise * BigInt(diff.days) };
}

// =========================================================================
// ४. अतिरिक्त मुद्दल व मुद्दल कपात वाचन (जुने extraPrincipals / principalReductions + V16)
// =========================================================================
export function getPrincipalEventsInMonth(b, targetYm) {
  let addedPaise = 0n;
  let reducedPaise = 0n;
  let compoundedPaise = 0n;
  const items = [];
  const seen = new Set();

  // १. जुन्या app.js मधील extraPrincipals
  (Array.isArray(b.extraPrincipals) ? b.extraPrincipals : []).forEach((ev, idx) => {
    if (!ev || extractYm(ev.date || ev.ym) !== targetYm) return;
    const amtP = toPaise(ev.amount || 0);
    if (amtP <= 0n) return;
    const isComp = Boolean(ev.isCompound || String(ev.note || "").includes("चक्रवाढ"));
    const sig = `ep|${ev.date}|${amtP}|${idx}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    if (isComp) {
      compoundedPaise += amtP;
      items.push({ kind: "compound", amountPaise: amtP, amount: paiseToRupees(amtP), date: ev.date || targetYm, note: ev.note || "थकीत व्याज चक्रवाढ" });
    } else {
      addedPaise += amtP;
      items.push({ kind: "add", amountPaise: amtP, amount: paiseToRupees(amtP), date: ev.date || targetYm, note: ev.note || "अतिरिक्त मुद्दल" });
    }
  });

  // २. जुन्या app.js मधील principalReductions
  (Array.isArray(b.principalReductions) ? b.principalReductions : []).forEach((ev, idx) => {
    if (!ev || extractYm(ev.date || ev.ym) !== targetYm) return;
    const amtP = toPaise(ev.amount || 0);
    if (amtP <= 0n) return;
    const sig = `pr|${ev.date}|${amtP}|${idx}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    reducedPaise += amtP;
    items.push({ kind: "reduce", amountPaise: amtP, amount: paiseToRupees(amtP), date: ev.date || targetYm, note: ev.note || "मुद्दल परत" });
  });

  // ३. नवीन V16 principalHistory (डुप्लिकेट टाळून)
  (Array.isArray(b.principalHistory) ? b.principalHistory : []).forEach((ev, idx) => {
    if (!ev || extractYm(ev.ym || ev.date || ev.ts) !== targetYm) return;
    const tStr = String(ev.type || "").toLowerCase();
    if (tStr === "initial" || tStr === "opening") return;
    const rawAmt = ev.delta !== undefined ? Number(ev.delta) : Number(ev.amount || 0);
    if (!rawAmt) return;
    const amtP = toPaise(Math.abs(rawAmt));
    const sig = `ph|${ev.date || ev.ym}|${amtP}|${tStr}|${idx}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    if (tStr === "compound_capitalization" || ev.isCompound === true) {
      compoundedPaise += amtP;
      items.push({ kind: "compound", amountPaise: amtP, amount: paiseToRupees(amtP), date: ev.date || targetYm, note: ev.note || "चक्रवाढ व्याज मुद्दलात जोडले" });
    } else if (rawAmt < 0 || tStr.includes("reduce") || tStr.includes("return")) {
      reducedPaise += amtP;
      items.push({ kind: "reduce", amountPaise: amtP, amount: paiseToRupees(amtP), date: ev.date || targetYm, note: ev.note || "मुद्दल परत" });
    } else {
      addedPaise += amtP;
      items.push({ kind: "add", amountPaise: amtP, amount: paiseToRupees(amtP), date: ev.date || targetYm, note: ev.note || "अतिरिक्त मुद्दल" });
    }
  });

  return {
    addedPaise, reducedPaise, compoundedPaise,
    added: paiseToRupees(addedPaise),
    reduced: paiseToRupees(reducedPaise),
    compounded: paiseToRupees(compoundedPaise),
    items
  };
}

// =========================================================================
// ५. एकच केंद्रीय ग्राहक महिना हिशोब (Single Source of Truth — BigInt)
// =========================================================================
export function computeBorrowerLedger(borrower, targetYm) {
  const ym = String(targetYm || getIstCurrentYm()).slice(0, 7);
  const openingPaise = getOpeningPrincipalPaise(borrower);
  const walletPaise = getAdvanceWalletBalancePaise(borrower);

  if (!borrower || borrower.accountStatus === "closed") {
    return {
      ym, isClosed: true, status: "closed", statusLabel: "बंद",
      principalPaise: 0n, principal: 0, openingPrincipalPaise: openingPaise,
      monthlyInterestPaise: 0n, monthlyInterest: 0,
      paidThisMonthPaise: 0n, paidThisMonth: 0,
      collectedInMonthPaise: 0n, collectedInMonth: 0,
      remainingThisMonthPaise: 0n, remainingThisMonth: 0,
      pastDuePaise: 0n, pastDue: 0,
      lateDays: 0, lateFeePaise: 0n, lateFee: 0,
      totalPayablePaise: 0n, totalPayable: 0,
      walletBalancePaise: walletPaise, walletBalance: paiseToRupees(walletPaise),
      pastPendingMonths: [], pastBreakdownText: "-",
      extraOutList: [], extraInList: [],
      principalEvents: getPrincipalEventsInMonth(borrower || {}, ym),
      isLocked: false, ratePeriod: borrower?.ratePeriod || "monthly",
      interestType: borrower?.interestType || "reducing"
    };
  }

  const paidMonths = borrower.paidMonths || {};
  const partialPayments = borrower.partialPayments || {};
  const customPastDues = borrower.customPastDues || {};
  const customCashPaid = borrower.customCashPaid || {};
  const manualDueCollected = borrower.manualDueCollected || {};
  const extraOutMap = borrower.extraOut || {};
  const extraInMap = borrower.extraIn || {};

  const curDet = computeMonthInterestDetails(borrower, ym);
  const principalPaise = toPaise(borrower.principal || 0);
  const monthlyIntPaise = curDet.interestPaise;

  // १. targetYm पर्यंतची सर्व customCashPaid रक्कम (जुने मॅन्युअल बाकी कपात पूल)
  let remainingCashPool = 0n;
  Object.entries(customCashPaid).forEach(([k, v]) => {
    if (compareYm(k, ym) <= 0) remainingCashPool += toPaise(v || 0);
  });

  // २. सर्व वर्षांचे customPastDues (startYm आधीचेही अचूक मोजा)
  const manualByYm = new Map();
  Object.keys(customPastDues)
    .filter((k) => /^\d{4}-\d{2}$/.test(k) && compareYm(k, ym) <= 0 && toPaise(customPastDues[k] || 0) > 0n)
    .sort(compareYm)
    .forEach((mKey) => {
      const origP = toPaise(customPastDues[mKey] || 0);
      const cutP = origP < remainingCashPool ? origP : remainingCashPool;
      remainingCashPool -= cutP;
      const remP = origP - cutP;
      if (remP > 0n) {
        manualByYm.set(mKey, { ym: mKey, remainingPaise: remP, remaining: paiseToRupees(remP), isManual: true });
      }
    });

  // ३. startYm पासून targetYm आधीपर्यंतच्या नियमित महिन्यांची बाकी (ऐतिहासिक लॉक्ससह)
  const combinedMap = new Map();
  let cursor = borrower.startYm || ym;
  let guard = 0;
  while (compareYm(cursor, ym) < 0 && guard < 240) {
    guard++;
    const cDet = computeMonthInterestDetails(borrower, cursor);
    const cIntP = cDet.interestPaise;
    const cPaidP = paidMonths[cursor]
      ? cIntP
      : (toPaise(partialPayments[cursor] || 0) > cIntP ? cIntP : toPaise(partialPayments[cursor] || 0));
    let cRemP = cIntP > cPaidP ? cIntP - cPaidP : 0n;
    if (cRemP > 0n && remainingCashPool > 0n) {
      const cutP = cRemP < remainingCashPool ? cRemP : remainingCashPool;
      cRemP -= cutP;
      remainingCashPool -= cutP;
    }
    if (cRemP > 0n) {
      combinedMap.set(cursor, { ym: cursor, remainingPaise: cRemP, remaining: paiseToRupees(cRemP), isManual: false });
    }
    cursor = nextYm(cursor);
  }

  manualByYm.forEach((mItem, mKey) => {
    if (combinedMap.has(mKey)) {
      const ex = combinedMap.get(mKey);
      ex.remainingPaise += mItem.remainingPaise;
      ex.remaining = paiseToRupees(ex.remainingPaise);
      ex.hasManual = true;
    } else {
      combinedMap.set(mKey, { ...mItem, hasManual: true });
    }
  });

  const pastPendingMonths = Array.from(combinedMap.values()).sort((a, b) => compareYm(a.ym, b.ym));
  const pastDuePaise = pastPendingMonths.reduce((s, x) => s + x.remainingPaise, 0n);

  // मागील बाकीचे शेवटचे ३ महिने + त्याआधीची बाकी विभागणी
  let pastBreakdownText = "-";
  if (pastDuePaise > 0n) {
    const last3 = pastPendingMonths.slice(-3);
    const olderSumP = pastPendingMonths.slice(0, -3).reduce((s, x) => s + x.remainingPaise, 0n);
    const parts = last3.map((pm) => `${fmtYmShortMr(pm.ym)}: ${formatPaiseInr(pm.remainingPaise)}`);
    if (olderSumP > 0n) parts.push(`त्याआधीची बाकी: ${formatPaiseInr(olderSumP)}`);
    pastBreakdownText = parts.join(" | ");
  }

  // ४. चालू महिन्याची जमा रक्कम (वॉलेट यात आपोआप मिसळणार नाही)
  const paidThisMonthPaise = paidMonths[ym]
    ? monthlyIntPaise
    : (toPaise(partialPayments[ym] || 0) > monthlyIntPaise ? monthlyIntPaise : toPaise(partialPayments[ym] || 0));
  const remainingThisMonthPaise = monthlyIntPaise > paidThisMonthPaise ? monthlyIntPaise - paidThisMonthPaise : 0n;

  const extraOutList = Array.isArray(extraOutMap[ym]) ? extraOutMap[ym] : [];
  const extraInList = Array.isArray(extraInMap[ym]) ? extraInMap[ym] : [];
  const extraOutNonCustomPaise = extraOutList
    .filter((x) => x.kind !== "past_custom")
    .reduce((s, x) => s + toPaise(x.amount || 0), 0n);
  const pastPaidInMonthPaise = toPaise(customCashPaid[ym] || 0) + toPaise(manualDueCollected[ym] || 0);
  const collectedInMonthPaise = paidThisMonthPaise + pastPaidInMonthPaise + extraOutNonCustomPaise;

  let status = "pending";
  let statusLabel = "बाकी";
  if (remainingThisMonthPaise === 0n && monthlyIntPaise > 0n) { status = "paid"; statusLabel = "पूर्ण जमा"; }
  else if (paidThisMonthPaise > 0n && remainingThisMonthPaise > 0n) { status = "partial"; statusLabel = "अर्धवट"; }

  const late = computeLateFeeIstPaise(borrower, ym, status === "paid");
  const totalPayablePaise = pastDuePaise + remainingThisMonthPaise + late.feePaise;

  return {
    ym, isClosed: false, status, statusLabel,
    principalPaise, principal: paiseToRupees(principalPaise),
    openingPrincipalPaise: openingPaise,
    monthlyInterestPaise: monthlyIntPaise, monthlyInterest: paiseToRupees(monthlyIntPaise),
    paidThisMonthPaise, paidThisMonth: paiseToRupees(paidThisMonthPaise),
    collectedInMonthPaise, collectedInMonth: paiseToRupees(collectedInMonthPaise),
    remainingThisMonthPaise, remainingThisMonth: paiseToRupees(remainingThisMonthPaise),
    pastDuePaise, pastDue: paiseToRupees(pastDuePaise),
    lateDays: late.daysLate, lateFeePaise: late.feePaise, lateFee: paiseToRupees(late.feePaise),
    totalPayablePaise, totalPayable: paiseToRupees(totalPayablePaise),
    walletBalancePaise: walletPaise, walletBalance: paiseToRupees(walletPaise),
    pastPendingMonths, pastBreakdownText,
    extraOutList, extraInList,
    principalEvents: getPrincipalEventsInMonth(borrower, ym),
    isLocked: curDet.isLocked,
    ratePeriod: curDet.terms.ratePeriod,
    interestType: curDet.terms.interestType
  };
}

// =========================================================================
// ६. Historical Term Update, Opt-in Compound, Advance Wallet व BigInt EMI
// =========================================================================
export function buildHistoricalTermUpdate(b, newTerms, currentYm) {
  const curYm = String(currentYm || getIstCurrentYm()).slice(0, 7);
  const effectiveYm = String(newTerms.effectiveYm || nextYm(curYm)).slice(0, 7);
  const openingPaise = getOpeningPrincipalPaise(b);
  const curDet = computeMonthInterestDetails(b, curYm);

  const nextLocks = { ...(b.v16InterestLocks || {}) };
  if (!nextLocks[curYm]) {
    nextLocks[curYm] = {
      interestPaise: curDet.interestPaise.toString(),
      interest: curDet.interestRupees,
      lockedAt: new Date().toISOString()
    };
  }

  const existingTerms = Array.isArray(b.v16Terms) ? b.v16Terms.slice() : [];
  if (!existingTerms.length) {
    existingTerms.push({
      effectiveYm: String(b.startYm || curYm).slice(0, 7),
      principal: Number(b.principal || 0),
      rate: Number(b.rate || 0),
      ratePeriod: String(b.ratePeriod || "monthly").toLowerCase(),
      interestType: String(b.interestType || "reducing").toLowerCase(),
      fixedInterest: Number(b.fixedMonthlyInterest ?? b.fixedInterest ?? 0)
    });
  }

  const nextTerms = existingTerms.filter((t) => String(t.effectiveYm) !== effectiveYm);
  nextTerms.push({
    effectiveYm,
    principal: newTerms.principal !== undefined ? Number(newTerms.principal) : Number(b.principal || 0),
    rate: newTerms.rate !== undefined ? Number(newTerms.rate) : Number(b.rate || 0),
    ratePeriod: String(newTerms.ratePeriod || b.ratePeriod || "monthly").toLowerCase(),
    interestType: String(newTerms.interestType || b.interestType || "reducing").toLowerCase(),
    fixedInterest: newTerms.fixedInterest !== undefined ? Number(newTerms.fixedInterest) : Number(b.fixedMonthlyInterest || 0),
    updatedAt: new Date().toISOString()
  });
  nextTerms.sort((a, c) => compareYm(a.effectiveYm, c.effectiveYm));

  return {
    v17OpeningPrincipal: paiseToRupees(openingPaise),
    v16Terms: nextTerms,
    v16InterestLocks: nextLocks,
    ratePeriod: String(newTerms.ratePeriod || b.ratePeriod || "monthly").toLowerCase(),
    updatedAt: new Date().toISOString()
  };
}

export function evaluateCompound(b, activeYm, pastDuePaise) {
  const cfg = b && b.v18Compound && typeof b.v18Compound === "object" ? b.v18Compound : null;
  if (!cfg || cfg.enabled !== true) return { eligible: false, reason: "disabled" };
  const ym = String(activeYm || getIstCurrentYm()).slice(0, 7);
  const hist = Array.isArray(cfg.history) ? cfg.history : [];
  if ((cfg.lastCompoundedYm && compareYm(cfg.lastCompoundedYm, ym) >= 0) || hist.some((h) => h && h.ym === ym)) {
    return { eligible: false, reason: "already_compounded_this_month" };
  }
  const addP = toPaise(pastDuePaise || 0n);
  if (addP <= 0n) return { eligible: false, reason: "no_past_due" };
  const curP = toPaise(b.principal || 0);
  return {
    eligible: true, ym,
    addedInterestPaise: addP, addedInterestRupees: paiseToRupees(addP),
    oldPrincipalPaise: curP, newPrincipalPaise: curP + addP, newPrincipalRupees: paiseToRupees(curP + addP),
    entryType: "compound_capitalization"
  };
}

export function getAdvanceWalletBalancePaise(b) {
  const w = b && b.v16AdvanceWallet && typeof b.v16AdvanceWallet === "object" ? b.v16AdvanceWallet : null;
  if (!w) return 0n;
  if (w.balancePaise !== undefined && w.balancePaise !== null) {
    try { return BigInt(String(w.balancePaise)); } catch (_) {}
  }
  return toPaise(w.balance || 0);
}

export function buildWalletTransaction(b, type, amountRupees, ym, note) {
  const curBal = getAdvanceWalletBalancePaise(b);
  const amtP = toPaise(amountRupees || 0);
  if (amtP <= 0n) return { error: "रक्कम शून्यापेक्षा जास्त असावी." };
  if (type === "apply" && amtP > curBal) return { error: "अ‍ॅडव्हान्स वॉलेटमध्ये पुरेशी शिल्लक नाही." };
  const nextBal = type === "credit" ? curBal + amtP : curBal - amtP;
  const prevTx = Array.isArray(b?.v16AdvanceWallet?.transactions) ? b.v16AdvanceWallet.transactions.slice(-49) : [];
  const tx = {
    id: `wtx_${Date.now()}`, type,
    amountPaise: amtP.toString(), amount: paiseToRupees(amtP),
    ym: String(ym || getIstCurrentYm()).slice(0, 7),
    date: getIstTodayIso(), note: String(note || ""), ts: new Date().toISOString()
  };
  return {
    v16AdvanceWallet: {
      balancePaise: nextBal.toString(), balance: paiseToRupees(nextBal),
      updatedAt: new Date().toISOString(), transactions: [...prevTx, tx]
    },
    tx
  };
}

function mulFp(a, b) { return divRoundHalfUp(a * b, FP_SCALE); }
function powFp(base, exp) {
  let res = FP_SCALE, b = base, e = BigInt(exp);
  while (e > 0n) { if (e & 1n) res = mulFp(res, b); b = mulFp(b, b); e >>= 1n; }
  return res;
}

export function calculateEmiBigInt({ principal, monthlyRate, months, type = "reducing" }) {
  const P = toPaise(principal);
  const n = Math.max(1, Math.round(Number(months || 1)));
  const nBig = BigInt(n);
  const rScaled = rateToScaled(monthlyRate);
  if (P <= 0n) return { valid: false, error: "कृपया वैध मुद्दल टाका." };

  if (rScaled <= 0n) {
    const baseEmi = divRoundHalfUp(P, nBig);
    return { valid: true, type, principalPaise: P, months: n, emiPaise: baseEmi, lastEmiPaise: P - baseEmi * (nBig - 1n), totalInterestPaise: 0n, totalPayablePaise: P, schedule: [] };
  }

  if (String(type).toLowerCase() === "flat") {
    const totalInterestPaise = divRoundHalfUp(P * rScaled * nBig, PCT_DENOM);
    const totalPayablePaise = P + totalInterestPaise;
    const emiPaise = divRoundHalfUp(totalPayablePaise, nBig);
    const lastEmiPaise = totalPayablePaise - emiPaise * (nBig - 1n);
    const monthlyIntPaise = divRoundHalfUp(totalInterestPaise, nBig);
    const schedule = [];
    let bal = P;
    for (let i = 1; i <= n; i++) {
      const isLast = i === n;
      const pay = isLast ? lastEmiPaise : emiPaise;
      const intPart = isLast ? totalInterestPaise - monthlyIntPaise * (nBig - 1n) : monthlyIntPaise;
      const prinPart = isLast ? bal : pay - intPart;
      bal = bal > prinPart ? bal - prinPart : 0n;
      schedule.push({ month: i, emiPaise: pay, interestPaise: intPart, principalPaise: prinPart, balancePaise: bal });
    }
    return { valid: true, type: "flat", principalPaise: P, months: n, emiPaise, lastEmiPaise, totalInterestPaise, totalPayablePaise, schedule };
  }

  const rFp = rScaled * 1000000000000n;
  const powN = powFp(FP_SCALE + rFp, n);
  const emiPaise = divRoundHalfUp(P * rFp * powN, (powN - FP_SCALE) * FP_SCALE);
  const schedule = [];
  let bal = P, totalInterestPaise = 0n, totalPayablePaise = 0n, lastEmiPaise = emiPaise;
  for (let i = 1; i <= n; i++) {
    const intPart = divRoundHalfUp(bal * rScaled, PCT_DENOM);
    let prinPart = emiPaise - intPart;
    let pay = emiPaise;
    if (i === n || prinPart >= bal) { prinPart = bal; pay = prinPart + intPart; lastEmiPaise = pay; }
    bal -= prinPart;
    totalInterestPaise += intPart;
    totalPayablePaise += pay;
    schedule.push({ month: i, emiPaise: pay, interestPaise: intPart, principalPaise: prinPart, balancePaise: bal });
    if (bal <= 0n) break;
  }
  return { valid: true, type: "reducing", principalPaise: P, months: schedule.length, emiPaise, lastEmiPaise, totalInterestPaise, totalPayablePaise, schedule };
}
