// व्याज Infinity X - Financial Error Detection Engine (System Guardian) (src/guardian/error-detector.js)
// शोधते: Duplicate Payment, Negative Balance, चुकीचा व्याजदर, Ledger Mismatch, जास्त जमा व अपूर्ण माहिती.

import { getState } from "../core/store.js";
import { computeBorrowerLedger, toPaise, parseStrictDate, getIstCurrentYm, formatPaiseInr } from "../core/ledger-v16.js";

export function runFinancialErrorScan(forceYm) {
  const { borrowers, udhaari, activeYm } = getState();
  const ym = forceYm || activeYm || getIstCurrentYm();
  const issues = [];

  const pushIssue = (severity, code, title, detail, target = {}) => {
    issues.push({ severity, code, title, detail, ...target });
  };

  // १. सर्व सक्रिय व बंद ग्राहक खात्यांची तपासणी
  (borrowers || []).forEach((b) => {
    if (!b || b.isDeleted) return;
    const name = b.name || "अनामिक ग्राहक";
    const principalP = toPaise(b.principal || 0);
    const origP = toPaise(b.originalPrincipal || 0);
    const rate = Number(b.rate || 0);
    const fixedInt = Number(b.fixedMonthlyInterest || 0);

    // अ) Negative Balance / चुकीचे मुद्दल
    if (principalP < 0n || origP < 0n) {
      pushIssue("critical", "NEGATIVE_PRINCIPAL", `${name}: नकारात्मक मुद्दल`, `मुद्दल शून्यापेक्षा कमी (₹${b.principal}) आढळले आहे.`, { borrowerId: b.id });
    }

    // ब) असामान्य किंवा शून्य व्याजदर (सक्रिय खात्यासाठी)
    if (b.accountStatus !== "closed") {
      if (rate < 0 || (rate === 0 && fixedInt <= 0)) {
        pushIssue("warning", "ZERO_OR_NEG_RATE", `${name}: व्याजदर शून्य किंवा अवैध`, `दर ${rate}% आणि निश्चित व्याज ₹${fixedInt} आहे.`, { borrowerId: b.id });
      } else if (String(b.ratePeriod || "monthly") === "monthly" && rate > 25) {
        pushIssue("warning", "HIGH_RATE_CHECK", `${name}: अत्यंत जास्त मासिक दर (${rate}%)`, `मासिक दर २५% पेक्षा जास्त आहे — चुकून वार्षिक दर टाकला नाही ना ते तपासा.`, { borrowerId: b.id });
      }
    }

    // क) Ledger Mismatch: एकाच महिन्यात paidMonths आणि partialPayments दोन्ही असणे
    const paidMonths = b.paidMonths || {};
    const partialPayments = b.partialPayments || {};
    Object.keys(paidMonths).forEach((mKey) => {
      if (paidMonths[mKey] && Number(partialPayments[mKey] || 0) > 0) {
        pushIssue(
          "critical",
          "LEDGER_MISMATCH",
          `${name}: ${mKey} मध्ये Paid व Partial दोन्ही नोंदी`,
          `एकाच महिन्यासाठी पूर्ण जमा आणि अर्धवट जमा दोन्ही रकाने भरलेले आहेत.`,
          { borrowerId: b.id, ym: mKey }
        );
      }
    });

    // ड) Duplicate Payment तपासणी (समान तारीख/वेळ आणि समान रक्कम)
    const payHist = Array.isArray(b.paymentHistory) ? b.paymentHistory : [];
    const seenTxIds = new Set();
    const seenDayAmt = new Map();
    payHist.forEach((p) => {
      if (!p) return;
      if (p.txId) {
        if (seenTxIds.has(p.txId)) {
          pushIssue("critical", "DUPLICATE_TX_ID", `${name}: दुहेरी Transaction ID`, `रक्कम ₹${p.amount} (${p.ym || ""}) साठी समान txId पुन्हा आढळला.`, { borrowerId: b.id });
        }
        seenTxIds.add(p.txId);
      }
      const dayKey = `${String(p.date || "").slice(0, 10)}|${toPaise(p.amount || 0).toString()}`;
      const prevTs = seenDayAmt.get(dayKey);
      const curTs = Date.parse(p.date || "") || 0;
      if (prevTs !== undefined && curTs > 0 && Math.abs(curTs - prevTs) < 120000) {
        pushIssue(
          "warning",
          "POSSIBLE_DUPLICATE_PAY",
          `${name}: संभाव्य दुहेरी पेमेंट (₹${p.amount})`,
          `${String(p.date || "").slice(0, 10)} रोजी २ मिनिटांच्या आत सारख्याच रकमेची दुसरी नोंद आढळली.`,
          { borrowerId: b.id }
        );
      }
      seenDayAmt.set(dayKey, curTs);
    });

    // इ) चालू महिन्यात अनपेक्षित जास्त जमा (Overpayment Check)
    if (b.accountStatus !== "closed") {
      const ledger = computeBorrowerLedger(b, ym);
      const rawPartialP = toPaise(partialPayments[ym] || 0);
      if (ledger.monthlyInterestPaise > 0n && rawPartialP > ledger.monthlyInterestPaise) {
        pushIssue(
          "warning",
          "OVER_PARTIAL_PAYMENT",
          `${name}: अर्धवट रक्कम मासिक व्याजापेक्षा जास्त`,
          `मासिक व्याज ${formatPaiseInr(ledger.monthlyInterestPaise)} पण partialPayments मध्ये ${formatPaiseInr(rawPartialP)} आहे.`,
          { borrowerId: b.id, ym }
        );
      }
    }

    // ई) चुकीच्या वायदा तारखा (Strict Date Check)
    [b.promiseDate1, b.promiseDate2, b.promiseDate3].filter(Boolean).forEach((dt) => {
      const chk = parseStrictDate(dt);
      if (!chk.valid) {
        pushIssue("info", "INVALID_PROMISE_DATE", `${name}: अवैध वायदा तारीख (${dt})`, chk.error, { borrowerId: b.id });
      }
    });

    // उ) सक्रिय खात्यात मोबाईल नंबर नसणे
    if (b.accountStatus !== "closed" && String(b.mobile || "").replace(/\D/g, "").length < 10) {
      pushIssue("info", "MISSING_MOBILE", `${name}: मोबाईल नंबर नाही`, `Call / WhatsApp रिमाइंडरसाठी १० अंकी नंबर नोंदवा.`, { borrowerId: b.id });
    }
  });

  // २. स्वतंत्र उधारी खात्यांची तपासणी
  (udhaari || []).forEach((u) => {
    if (!u || u.isDeleted) return;
    const amtP = toPaise(u.amount || 0);
    const paidP = toPaise(u.paidAmount || 0);
    if (amtP <= 0n || paidP < 0n) {
      pushIssue("critical", "UDHAARI_INVALID_AMT", `उधारी (${u.name || "व्यक्ती"}): अवैध रक्कम`, `उधारी रक्कम ₹${u.amount} किंवा परतफेड ₹${u.paidAmount} चुकीची आहे.`, { udhaariId: u.id });
    } else if (paidP > amtP) {
      pushIssue("warning", "UDHAARI_OVERPAID", `उधारी (${u.name || "व्यक्ती"}): जास्त परतफेड नोंद`, `दिलेली उधारी ${formatPaiseInr(amtP)}, पण परतफेड ${formatPaiseInr(paidP)} दिसते.`, { udhaariId: u.id });
    }
  });

  const criticalCount = issues.filter((x) => x.severity === "critical").length;
  const warningCount = issues.filter((x) => x.severity === "warning").length;
  const infoCount = issues.filter((x) => x.severity === "info").length;

  // सिस्टीम हेल्थ स्कोअर (१०० पैकी)
  const score = Math.max(0, 100 - criticalCount * 20 - warningCount * 7 - Math.min(15, infoCount));

  return {
    scannedAt: new Date().toISOString(),
    ym,
    score,
    totalIssues: issues.length,
    criticalCount,
    warningCount,
    infoCount,
    issues
  };
}
