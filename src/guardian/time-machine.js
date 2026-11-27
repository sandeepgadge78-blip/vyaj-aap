// व्याज Infinity X - Financial Time Machine (जुन्या कोणत्याही तारखेचा अचूक आर्थिक स्नॅपशॉट) (src/guardian/time-machine.js)

import { getState } from "../core/store.js";
import {
  toPaise, paiseToRupees, parseStrictDate, getOpeningPrincipalPaise,
  computeBorrowerLedger, extractYm
} from "../core/ledger-v16.js";

function toIsoDateOnly(val) {
  if (!val) return "";
  if (typeof val === "object" && typeof val.toDate === "function") {
    return val.toDate().toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

// विशिष्ट ग्राहकाची दिलेल्या जुन्या तारखेची (targetIso) नेमकी आर्थिक स्थिती काढा
export function inspectBorrowerAtDate(b, targetIso) {
  const chk = parseStrictDate(targetIso);
  if (!chk.valid) return { valid: false, error: chk.error };

  const cutDate = chk.iso;
  const cutYm = cutDate.slice(0, 7);

  // त्या तारखेला खाते सुरू झाले होते का ते तपासा
  const startIso = toIsoDateOnly(b.loanDate) || (b.startYm ? `${b.startYm}-01` : toIsoDateOnly(b.createdAt));
  if (startIso && startIso > cutDate) {
    return { valid: true, existed: false, cutDate, cutYm };
  }

  // त्या तारखेला खाते बंद झाले होते का?
  const closedDate = toIsoDateOnly(b.settlement?.date || b.settlement?.closedAt);
  const wasClosed = Boolean(b.accountStatus === "closed" && closedDate && closedDate <= cutDate);

  // त्या तारखेपर्यंतचे मुद्दल = मूळ मुद्दल + अतिरिक्त मुद्दल (<= cutDate) - मुद्दल कपात (<= cutDate)
  let prinP = getOpeningPrincipalPaise(b);
  (Array.isArray(b.extraPrincipals) ? b.extraPrincipals : []).forEach((ep) => {
    const dt = toIsoDateOnly(ep?.date);
    if (!dt || dt <= cutDate) prinP += toPaise(ep?.amount || 0);
  });
  (Array.isArray(b.principalReductions) ? b.principalReductions : []).forEach((pr) => {
    const dt = toIsoDateOnly(pr?.date);
    if (!dt || dt <= cutDate) {
      const amtP = toPaise(pr?.amount || 0);
      prinP = prinP > amtP ? prinP - amtP : 0n;
    }
  });

  // त्या तारखेपर्यंत जमा झालेले एकूण व्याज (paymentHistory वरून)
  let interestPaidTillDateP = 0n;
  (Array.isArray(b.paymentHistory) ? b.paymentHistory : []).forEach((ph) => {
    const dt = toIsoDateOnly(ph?.date);
    if (dt && dt <= cutDate) interestPaidTillDateP += toPaise(ph?.amount || 0);
  });

  // आभासी (Virtual) ग्राहक तयार करून त्या महिन्याचा हिशोब काढा (मूळ डेटा न बदलता)
  const virtualBorrower = {
    ...b,
    principal: paiseToRupees(prinP),
    accountStatus: wasClosed ? "closed" : "active"
  };
  const ledger = computeBorrowerLedger(virtualBorrower, cutYm);

  return {
    valid: true,
    existed: true,
    wasClosed,
    cutDate,
    cutYm,
    borrowerId: b.id,
    name: b.name || "ग्राहक",
    principalPaise: wasClosed ? 0n : prinP,
    principal: wasClosed ? 0 : paiseToRupees(prinP),
    monthlyInterestPaise: ledger.monthlyInterestPaise,
    monthlyInterest: ledger.monthlyInterest,
    interestPaidTillDatePaise: interestPaidTillDateP,
    interestPaidTillDate: paiseToRupees(interestPaidTillDateP),
    pendingAsOfMonthPaise: ledger.totalPayablePaise,
    pendingAsOfMonth: ledger.totalPayable
  };
}

// संपूर्ण व्यवसायाचा (व्याज + स्वतंत्र उधारी) दिलेल्या जुन्या तारखेचा स्नॅपशॉट
export function inspectPortfolioAtDate(targetIso) {
  const chk = parseStrictDate(targetIso);
  if (!chk.valid) return { valid: false, error: chk.error };

  const cutDate = chk.iso;
  const cutYm = cutDate.slice(0, 7);
  const { borrowers, udhaari } = getState();

  let activeCount = 0;
  let closedCount = 0;
  let totalPrincipalP = 0n;
  let expectedMonthlyIntP = 0n;
  let totalInterestCollectedTillDateP = 0n;
  let pendingAsOfMonthP = 0n;
  const accountSnapshots = [];

  (borrowers || []).forEach((b) => {
    if (!b || b.isDeleted) return;
    const res = inspectBorrowerAtDate(b, cutDate);
    if (!res.valid || !res.existed) return;

    if (res.wasClosed) closedCount += 1;
    else activeCount += 1;

    totalPrincipalP += res.principalPaise;
    expectedMonthlyIntP += res.monthlyInterestPaise;
    totalInterestCollectedTillDateP += res.interestPaidTillDatePaise;
    pendingAsOfMonthP += res.pendingAsOfMonthPaise;
    accountSnapshots.push(res);
  });

  // त्या तारखेची स्वतंत्र उधारी स्थिती
  let udActiveCount = 0;
  let udGivenP = 0n;
  let udReturnedTillDateP = 0n;
  let udRemainingP = 0n;

  (udhaari || []).forEach((u) => {
    if (!u || u.isDeleted) return;
    const gDate = toIsoDateOnly(u.givenDate) || (extractYm(u.givenYm) ? `${extractYm(u.givenYm)}-01` : "");
    if (gDate && gDate > cutDate) return;

    const amtP = toPaise(u.amount || 0);
    let paidTillDateP = 0n;
    const pays = Array.isArray(u.payments) ? u.payments : [];
    if (pays.length) {
      pays.forEach((p) => {
        const pd = toIsoDateOnly(p?.date);
        if (!pd || pd <= cutDate) paidTillDateP += toPaise(p?.amount || 0);
      });
    } else if (u.returnedDate && toIsoDateOnly(u.returnedDate) <= cutDate) {
      paidTillDateP = toPaise(u.paidAmount || 0);
    }

    const remP = amtP > paidTillDateP ? amtP - paidTillDateP : 0n;
    if (remP > 0n) udActiveCount += 1;
    udGivenP += amtP;
    udReturnedTillDateP += paidTillDateP;
    udRemainingP += remP;
  });

  return {
    valid: true,
    cutDate,
    cutYm,
    activeCount,
    closedCount,
    totalPrincipal: paiseToRupees(totalPrincipalP),
    expectedMonthlyInterest: paiseToRupees(expectedMonthlyIntP),
    totalInterestCollectedTillDate: paiseToRupees(totalInterestCollectedTillDateP),
    pendingAsOfMonth: paiseToRupees(pendingAsOfMonthP),
    udhaari: {
      activeCount: udActiveCount,
      totalGiven: paiseToRupees(udGivenP),
      totalReturnedTillDate: paiseToRupees(udReturnedTillDateP),
      totalRemaining: paiseToRupees(udRemainingP)
    },
    accounts: accountSnapshots.sort((a, c) => c.principal - a.principal)
  };
}
