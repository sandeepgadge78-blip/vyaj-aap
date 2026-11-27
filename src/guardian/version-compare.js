// व्याज Infinity X - Smart Version Comparison (अपडेटपूर्वी आणि नंतरच्या हिशोबाची पैशा-पैशाची तुलना) (src/guardian/version-compare.js)

import { getUnifiedMonthReport } from "../core/store.js";
import { toPaise, paiseToRupees } from "../core/ledger-v16.js";

const BASELINE_KEY = "vyaj_infinity_version_baseline_v1";

export function captureVersionBaseline(label = "अपडेटपूर्वीचा Snapshot", forceYm) {
  const r = getUnifiedMonthReport(forceYm);
  const perAccount = {};
  r.rows.forEach(({ b, ledger }) => {
    perAccount[b.id] = {
      name: b.name || "ग्राहक",
      principal: ledger.principal,
      monthlyInterest: ledger.monthlyInterest,
      collected: ledger.collectedInMonth,
      pending: ledger.totalPayable
    };
  });

  const baseline = {
    label,
    savedAt: new Date().toISOString(),
    ym: r.ym,
    summary: { ...r.summary },
    udhaari: {
      count: r.udhaari.rows.length,
      totalGiven: r.udhaari.totalGiven,
      totalReturned: r.udhaari.totalReturned,
      totalRemaining: r.udhaari.totalRemaining
    },
    perAccount
  };

  try {
    localStorage.setItem(BASELINE_KEY, JSON.stringify(baseline));
  } catch (_) {}
  return baseline;
}

export function getSavedBaseline() {
  try {
    return JSON.parse(localStorage.getItem(BASELINE_KEY) || "null");
  } catch (_) {
    return null;
  }
}

export function compareWithBaseline() {
  const before = getSavedBaseline();
  if (!before) {
    return { hasBaseline: false, message: "तुलनेसाठी आधी 'Baseline जतन करा' दाबा." };
  }

  const afterReport = getUnifiedMonthReport(before.ym);
  const sBefore = before.summary || {};
  const sAfter = afterReport.summary || {};

  const diffMetric = (key, labelMr, isMoney = true) => {
    const bVal = Number(sBefore[key] || 0);
    const aVal = Number(sAfter[key] || 0);
    const delta = isMoney
      ? paiseToRupees(toPaise(aVal) - toPaise(bVal))
      : aVal - bVal;
    return { key, labelMr, before: bVal, after: aVal, delta, matched: delta === 0, isMoney };
  };

  const metrics = [
    diffMetric("activeCount", "सक्रिय खाती", false),
    diffMetric("totalPrincipal", "एकूण मुद्दल", true),
    diffMetric("expectedInterest", "मासिक अपेक्षित व्याज", true),
    diffMetric("collectedInterest", "जमा व्याज", true),
    diffMetric("totalPending", "एकूण बाकी व्याज", true)
  ];

  // उधारी तुलना
  const udBeforeRem = Number(before.udhaari?.totalRemaining || 0);
  const udAfterRem = Number(afterReport.udhaari?.totalRemaining || 0);
  const udDelta = paiseToRupees(toPaise(udAfterRem) - toPaise(udBeforeRem));
  metrics.push({
    key: "udhaariRemaining",
    labelMr: "स्वतंत्र उधारी बाकी",
    before: udBeforeRem,
    after: udAfterRem,
    delta: udDelta,
    matched: udDelta === 0,
    isMoney: true
  });

  // नेमक्या कोणत्या ग्राहकाचे आकडे बदलले ते शोधा
  const changedAccounts = [];
  const afterMap = new Map();
  afterReport.rows.forEach(({ b, ledger }) => {
    afterMap.set(b.id, {
      name: b.name || "ग्राहक",
      principal: ledger.principal,
      pending: ledger.totalPayable
    });
  });

  const beforeAccounts = before.perAccount || {};
  const allIds = new Set([...Object.keys(beforeAccounts), ...afterMap.keys()]);
  allIds.forEach((id) => {
    const bAcc = beforeAccounts[id];
    const aAcc = afterMap.get(id);
    if (!bAcc && aAcc) {
      changedAccounts.push({ id, name: aAcc.name, change: "नवीन खाते जोडले गेले" });
    } else if (bAcc && !aAcc) {
      changedAccounts.push({ id, name: bAcc.name, change: "खाते डिलीट / काढले गेले" });
    } else if (bAcc && aAcc) {
      const pDiff = paiseToRupees(toPaise(aAcc.principal) - toPaise(bAcc.principal));
      const dDiff = paiseToRupees(toPaise(aAcc.pending) - toPaise(bAcc.pending));
      if (pDiff !== 0 || dDiff !== 0) {
        changedAccounts.push({
          id,
          name: aAcc.name,
          change: `मुद्दल फरक: ${pDiff >= 0 ? "+" : ""}₹${pDiff} | बाकी फरक: ${dDiff >= 0 ? "+" : ""}₹${dDiff}`
        });
      }
    }
  });

  const allMatched = metrics.every((m) => m.matched) && changedAccounts.length === 0;

  return {
    hasBaseline: true,
    ym: before.ym,
    baselineLabel: before.label,
    baselineSavedAt: before.savedAt,
    allMatched,
    metrics,
    changedAccounts
  };
}
