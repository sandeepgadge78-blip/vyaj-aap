// व्याज Infinity X - Borrowers Repository (जुना डेटा १००% सुरक्षित + BigInt वसुली + Auto-Reverse + V16 Locks/Compound/Wallet) (src/data/borrowers-repo.js)

import { getUserPaths, FieldValue } from "../core/firebase.js";
import { setState, updateUi } from "../core/store.js";
import {
  toPaise, paiseToRupees, compareYm, nextYm, fmtYmMr, getIstTodayIso, getIstCurrentYm,
  computeMonthInterestDetails, computeBorrowerLedger, buildHistoricalTermUpdate,
  evaluateCompound, buildWalletTransaction
} from "../core/ledger-v16.js";
import {
  createTxId, isDuplicateTx, markTxProcessed, enqueueOfflineTx, registerOfflineHandler
} from "./offline-queue.js";

let unsubBorrowers = null;
let unsubAudit = null;

// =========================================================================
// १. रिअल-टाइम Firestore Subscriptions व Audit Trail
// =========================================================================
export function stopBorrowersSync() {
  if (typeof unsubBorrowers === "function") { unsubBorrowers(); unsubBorrowers = null; }
  if (typeof unsubAudit === "function") { unsubAudit(); unsubAudit = null; }
}

export function startBorrowersSync(uid) {
  stopBorrowersSync();
  const paths = getUserPaths(uid);

  unsubBorrowers = paths.borrowers.onSnapshot(
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setState({ borrowers: list });
      updateUi({ syncStatus: navigator.onLine ? "Synced" : "Offline Mode" });
    },
    (err) => {
      console.error("Borrowers Snapshot Error:", err);
      updateUi({ syncStatus: "Sync Error" });
    }
  );

  unsubAudit = paths.auditLogs.orderBy("ts", "desc").limit(60).onSnapshot(
    (snap) => {
      setState({ auditLogs: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    },
    () => {
      // जर इंडेक्स नसेल तर साधा Fallback
      paths.auditLogs.limit(60).get().then((snap) => {
        setState({ auditLogs: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
      }).catch(() => {});
    }
  );
}

export async function appendAuditLog(uid, action, details, userEmail = "") {
  if (!uid) return;
  try {
    const paths = getUserPaths(uid);
    await paths.auditLogs.add({
      action,
      details,
      by: userEmail || uid,
      ts: new Date().toISOString()
    });
  } catch (_) {}
}

// =========================================================================
// २. ग्राहक जोडणे, एडिट, Version Snapshot व Delete/Restore
// =========================================================================
export function normalizeMobile(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function buildVersionSnapshot(b) {
  return {
    savedAt: new Date().toISOString(),
    name: b.name || "",
    mobile: b.mobile || "",
    principal: Number(b.principal || 0),
    originalPrincipal: Number(b.originalPrincipal || b.principal || 0),
    rate: Number(b.rate || 0),
    fixedMonthlyInterest: Number(b.fixedMonthlyInterest || 0),
    interestType: b.interestType || "reducing",
    ratePeriod: b.ratePeriod || "monthly",
    interestDay: Number(b.interestDay || 0),
    guarantor: b.guarantor || "",
    extraGuarantors: b.extraGuarantors || "",
    note: b.note || ""
  };
}

export async function addBorrower(uid, input, userEmail = "") {
  const name = String(input.name || "").trim();
  const principal = Number(input.principal || 0);
  if (!name || principal <= 0) throw new Error("कृपया ग्राहकाचे नाव आणि शून्यापेक्षा जास्त मुद्दल टाका.");

  const nowIso = new Date().toISOString();
  const startYm = input.startYm || getIstCurrentYm();
  const customDue = Math.max(0, Number(input.customDue || 0));

  const docData = {
    name,
    loanLabel: String(input.loanLabel || "").trim(),
    mobile: normalizeMobile(input.mobile),
    principal,
    originalPrincipal: principal,
    v17OpeningPrincipal: principal,
    loanDate: input.loanDate || getIstTodayIso(),
    startYm,
    rate: Number(input.rate ?? 2),
    ratePeriod: String(input.ratePeriod || "monthly").toLowerCase(),
    fixedMonthlyInterest: Number(input.fixedMonthlyInterest || 0),
    interestType: input.interestType === "flat" ? "flat" : "reducing",
    interestDay: Number(input.interestDay || 0),
    lateFeePerDay: Number(input.lateFeePerDay || 0),
    guarantor: String(input.guarantor || "").trim(),
    extraGuarantors: String(input.extraGuarantors || "").trim(),
    jobType: String(input.jobType || ""),
    companyDept: String(input.companyDept || "").trim(),
    retirementDate: String(input.retirementDate || ""),
    promiseDate1: String(input.promiseDate1 || ""),
    promiseDate2: String(input.promiseDate2 || ""),
    promiseDate3: String(input.promiseDate3 || ""),
    promiseList: [],
    note: String(input.note || "").trim(),
    accountStatus: "active",
    isDeleted: false,
    isManualNew: true,
    paidMonths: {},
    partialPayments: {},
    paymentHistory: [],
    extraPrincipals: [],
    principalReductions: [],
    versionHistory: [],
    followUps: [],
    customPastDues: customDue > 0 ? { [startYm]: customDue } : {},
    customCashPaid: {},
    createdAt: nowIso,
    updatedAt: nowIso
  };

  const paths = getUserPaths(uid);
  const docRef = await paths.borrowers.add(docData);
  await appendAuditLog(uid, "BORROWER_ADDED", `${name} (₹${principal})`, userEmail);
  return docRef.id;
}

export async function updateBorrower(uid, borrower, patch, { saveVersion = true, userEmail = "" } = {}) {
  if (!uid || !borrower?.id) throw new Error("अवैध ग्राहक ID.");
  const paths = getUserPaths(uid);
  const nextPayload = { ...patch, updatedAt: new Date().toISOString() };

  if (saveVersion) {
    const prevVersions = Array.isArray(borrower.versionHistory) ? borrower.versionHistory : [];
    nextPayload.versionHistory = [...prevVersions, buildVersionSnapshot(borrower)].slice(-8);
  }
  await paths.borrowerDoc(borrower.id).update(nextPayload);
  await appendAuditLog(uid, "BORROWER_UPDATED", `${patch.name || borrower.name} माहिती अपडेट`, userEmail);
}

export async function softDeleteBorrower(uid, borrower, userEmail = "") {
  const paths = getUserPaths(uid);
  await paths.borrowerDoc(borrower.id).update({ isDeleted: true, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await appendAuditLog(uid, "BORROWER_SOFT_DELETE", `${borrower.name} Recycle Bin मध्ये`, userEmail);
}

export async function restoreBorrower(uid, borrower, userEmail = "") {
  const paths = getUserPaths(uid);
  await paths.borrowerDoc(borrower.id).update({ isDeleted: false, deletedAt: FieldValue.delete(), updatedAt: new Date().toISOString() });
  await appendAuditLog(uid, "BORROWER_RESTORED", `${borrower.name} Restore केले`, userEmail);
}

export async function permanentDeleteBorrower(uid, borrower, userEmail = "") {
  const paths = getUserPaths(uid);
  await paths.borrowerDoc(borrower.id).delete();
  await appendAuditLog(uid, "BORROWER_PERM_DELETE", `${borrower.name} कायमचे डिलीट`, userEmail);
}

export async function closeAccount(uid, borrower, settlementAmount, note = "", userEmail = "") {
  const nowIso = new Date().toISOString();
  const paths = getUserPaths(uid);
  await paths.borrowerDoc(borrower.id).update({
    accountStatus: "closed",
    settlement: { amount: Number(settlementAmount || 0), date: getIstTodayIso(), note: String(note).trim(), closedAt: nowIso },
    updatedAt: nowIso
  });
  await appendAuditLog(uid, "ACCOUNT_CLOSED", `${borrower.name} खाते बंद (₹${settlementAmount})`, userEmail);
}

export async function reopenAccount(uid, borrower, userEmail = "") {
  const paths = getUserPaths(uid);
  await paths.borrowerDoc(borrower.id).update({ accountStatus: "active", updatedAt: new Date().toISOString() });
  await appendAuditLog(uid, "ACCOUNT_REOPENED", `${borrower.name} पुन्हा सुरू`, userEmail);
}

// =========================================================================
// ३. BigInt अचूक पेमेंट वसुली (Duplicate Guard + Offline Queue + Extra Allocation)
// =========================================================================
export async function collectMonthlyPayment(uid, borrower, { ym, amount, mode = "Cash", sendExtraToWallet = false, txId, userEmail = "", _fromOfflineQueue = false }) {
  const amtPaise = toPaise(amount);
  if (amtPaise <= 0n) throw new Error("कृपया शून्यापेक्षा जास्त रक्कम (₹) टाका.");
  if (!borrower?.id) throw new Error("ग्राहक सापडला नाही.");

  const safeTxId = txId || createTxId("pay");
  if (isDuplicateTx(safeTxId)) {
    return { status: "duplicate", txId: safeTxId };
  }

  // ऑफलाइन असल्यास Encrypted IndexedDB रांगेत सुरक्षित जतन करा
  if (!navigator.onLine && !_fromOfflineQueue) {
    const res = await enqueueOfflineTx({
      uid,
      action: "COLLECT_PAYMENT",
      txId: safeTxId,
      payload: { borrowerId: borrower.id, ym, amount: paiseToRupees(amtPaise), mode, sendExtraToWallet, userEmail }
    });
    return { status: "queued_offline", txId: res.txId };
  }

  const targetYm = String(ym || getIstCurrentYm()).slice(0, 7);
  const nowIso = new Date().toISOString();
  const paidMonths = { ...(borrower.paidMonths || {}) };
  const partialPayments = { ...(borrower.partialPayments || {}) };
  const customPastDues = borrower.customPastDues || {};
  const customCashPaid = { ...(borrower.customCashPaid || {}) };
  const extraOut = { ...(borrower.extraOut || {}) };
  const extraIn = { ...(borrower.extraIn || {}) };

  const curDet = computeMonthInterestDetails(borrower, targetYm);
  const mIntP = curDet.interestPaise;
  const curPaidP = paidMonths[targetYm]
    ? mIntP
    : (toPaise(partialPayments[targetYm] || 0) > mIntP ? mIntP : toPaise(partialPayments[targetYm] || 0));
  const remCurP = mIntP > curPaidP ? mIntP - curPaidP : 0n;

  const applyCurP = mIntP > 0n ? (amtPaise < remCurP ? amtPaise : remCurP) : amtPaise;
  let extraLeftP = amtPaise > applyCurP ? amtPaise - applyCurP : 0n;

  const updatePayload = { updatedAt: nowIso };
  const newTransfers = [];

  // पायरी १: चालू महिन्याची जमा नोंद
  const nextCurPaidP = curPaidP + applyCurP;
  const isNowFull = mIntP > 0n && nextCurPaidP >= mIntP;
  if (applyCurP > 0n || isNowFull) {
    if (isNowFull) {
      updatePayload[`paidMonths.${targetYm}`] = { paidAt: nowIso, amount: paiseToRupees(mIntP), mode, txId: safeTxId };
      updatePayload[`partialPayments.${targetYm}`] = FieldValue.delete();
      paidMonths[targetYm] = { paidAt: nowIso, amount: paiseToRupees(mIntP) };
      delete partialPayments[targetYm];
    } else {
      updatePayload[`partialPayments.${targetYm}`] = paiseToRupees(nextCurPaidP);
      partialPayments[targetYm] = paiseToRupees(nextCurPaidP);
    }
  }

  // पायरी २: एक्स्ट्रा रक्कम असल्यास आधी नियमित मागील बाकी महिन्यांतून कमी करा
  if (extraLeftP > 0n && mIntP > 0n && !sendExtraToWallet) {
    let cursor = borrower.startYm || targetYm;
    let guard = 0;
    while (compareYm(cursor, targetYm) < 0 && extraLeftP > 0n && guard < 240) {
      guard++;
      const cIntP = computeMonthInterestDetails(borrower, cursor).interestPaise;
      const cPaidP = paidMonths[cursor] ? cIntP : toPaise(partialPayments[cursor] || 0);
      const cRemP = cIntP > cPaidP ? cIntP - cPaidP : 0n;
      if (cRemP > 0n) {
        const cutP = extraLeftP < cRemP ? extraLeftP : cRemP;
        const nextCPaidP = cPaidP + cutP;
        if (nextCPaidP >= cIntP) {
          updatePayload[`paidMonths.${cursor}`] = { paidAt: nowIso, amount: paiseToRupees(cIntP), fromExtra: targetYm };
          updatePayload[`partialPayments.${cursor}`] = FieldValue.delete();
          paidMonths[cursor] = { paidAt: nowIso, amount: paiseToRupees(cIntP) };
          delete partialPayments[cursor];
        } else {
          updatePayload[`partialPayments.${cursor}`] = paiseToRupees(nextCPaidP);
          partialPayments[cursor] = paiseToRupees(nextCPaidP);
        }
        newTransfers.push({ fromYm: targetYm, toYm: cursor, amount: paiseToRupees(cutP), kind: "past", ts: nowIso });
        extraLeftP -= cutP;
      }
      cursor = nextYm(cursor);
    }

    // पायरी ३: मॅन्युअल मागील बाकी (customPastDues) मधून कमी करा
    if (extraLeftP > 0n) {
      let totCustomP = 0n;
      let totCustomPaidP = 0n;
      Object.entries(customPastDues).forEach(([k, v]) => { if (compareYm(k, targetYm) <= 0) totCustomP += toPaise(v || 0); });
      Object.entries(customCashPaid).forEach(([k, v]) => { if (compareYm(k, targetYm) <= 0) totCustomPaidP += toPaise(v || 0); });
      const netCustomP = totCustomP > totCustomPaidP ? totCustomP - totCustomPaidP : 0n;
      if (netCustomP > 0n) {
        const cutCustomP = extraLeftP < netCustomP ? extraLeftP : netCustomP;
        const nextCustomCashP = toPaise(customCashPaid[targetYm] || 0) + cutCustomP;
        updatePayload[`customCashPaid.${targetYm}`] = paiseToRupees(nextCustomCashP);
        newTransfers.push({ fromYm: targetYm, toYm: "custom", amount: paiseToRupees(cutCustomP), kind: "past_custom", ts: nowIso });
        extraLeftP -= cutCustomP;
      }
    }
  }

  // पायरी ४: उरलेले एक्स्ट्रा स्वतंत्र अ‍ॅडव्हान्स वॉलेटमध्ये (v16AdvanceWallet) सुरक्षित ठेवा
  if (extraLeftP > 0n) {
    const walletRes = buildWalletTransaction(
      borrower,
      "credit",
      paiseToRupees(extraLeftP),
      targetYm,
      `${fmtYmMr(targetYm)} मधून एक्स्ट्रा अ‍ॅडव्हान्स वॉलेटमध्ये जमा`
    );
    if (!walletRes.error) {
      updatePayload.v16AdvanceWallet = walletRes.v16AdvanceWallet;
      newTransfers.push({ fromYm: targetYm, toYm: "wallet", amount: paiseToRupees(extraLeftP), kind: "wallet", ts: nowIso });
      extraLeftP = 0n;
    }
  }

  if (newTransfers.length > 0) {
    const existingOut = Array.isArray(extraOut[targetYm]) ? [...extraOut[targetYm]] : [];
    updatePayload[`extraOut.${targetYm}`] = [...existingOut, ...newTransfers];

    const groupedIn = {};
    newTransfers.forEach((tr) => {
      if (tr.toYm && tr.toYm !== "custom" && tr.toYm !== "wallet") {
        if (!groupedIn[tr.toYm]) groupedIn[tr.toYm] = Array.isArray(extraIn[tr.toYm]) ? [...extraIn[tr.toYm]] : [];
        groupedIn[tr.toYm].push(tr);
      }
    });
    Object.entries(groupedIn).forEach(([tYm, arr]) => { updatePayload[`extraIn.${tYm}`] = arr; });
  }

  const amtRupees = paiseToRupees(amtPaise);
  const noteParts = newTransfers.map((tr) => {
    if (tr.kind === "past") return `एक्स्ट्रा ₹${tr.amount} → ${fmtYmMr(tr.toYm)} बाकी कपात`;
    if (tr.kind === "past_custom") return `एक्स्ट्रा ₹${tr.amount} → मागील मॅन्युअल बाकी कपात`;
    return `एक्स्ट्रा ₹${tr.amount} → स्वतंत्र अ‍ॅडव्हान्स वॉलेट`;
  });

  updatePayload.paymentHistory = FieldValue.arrayUnion({
    id: safeTxId,
    txId: safeTxId,
    date: nowIso,
    ym: targetYm,
    mode,
    type: newTransfers.length ? "EXTRA_ADJUSTED" : (isNowFull ? "FULL_INTEREST" : "PARTIAL_INTEREST"),
    amount: amtRupees,
    note: noteParts.length ? `${targetYm} जमा ₹${amtRupees} (${noteParts.join(", ")})` : `${targetYm} ${isNowFull ? "पूर्ण जमा" : "अर्धवट जमा"} (${mode})`
  });

  const paths = getUserPaths(uid);
  await paths.borrowerDoc(borrower.id).update(updatePayload);
  markTxProcessed(safeTxId);
  await appendAuditLog(uid, isNowFull ? "PAYMENT_MARKED" : "PARTIAL_PAYMENT", `${borrower.name} (${targetYm}) ₹${amtRupees} [${mode}]`, userEmail);
  return { status: "committed", txId: safeTxId, transfers: newTransfers };
}

// =========================================================================
// ४. Reset Payment (Auto-Reverse सहित)
// =========================================================================
export async function resetMonthPayment(uid, borrower, ym, userEmail = "") {
  const targetYm = String(ym || getIstCurrentYm()).slice(0, 7);
  const outList = borrower.extraOut && Array.isArray(borrower.extraOut[targetYm]) ? borrower.extraOut[targetYm] : [];
  const paidMonths = { ...(borrower.paidMonths || {}) };
  const partialPayments = { ...(borrower.partialPayments || {}) };
  const customCashPaid = { ...(borrower.customCashPaid || {}) };
  const extraIn = { ...(borrower.extraIn || {}) };

  const updatePayload = {
    [`paidMonths.${targetYm}`]: FieldValue.delete(),
    [`partialPayments.${targetYm}`]: FieldValue.delete(),
    updatedAt: new Date().toISOString()
  };

  if (outList.length > 0) {
    let customRevertP = 0n;
    const targetRevertMap = {};

    outList.forEach((tr) => {
      if (tr.kind === "past_custom") customRevertP += toPaise(tr.amount || 0);
      else if (tr.toYm && tr.toYm !== "wallet") {
        targetRevertMap[tr.toYm] = (targetRevertMap[tr.toYm] || 0n) + toPaise(tr.amount || 0);
      }
    });

    if (customRevertP > 0n) {
      const curCustomP = toPaise(customCashPaid[targetYm] || 0);
      const nextCustomP = curCustomP > customRevertP ? curCustomP - customRevertP : 0n;
      updatePayload[`customCashPaid.${targetYm}`] = nextCustomP > 0n ? paiseToRupees(nextCustomP) : FieldValue.delete();
    }

    Object.entries(targetRevertMap).forEach(([tYm, revP]) => {
      const mIntP = computeMonthInterestDetails(borrower, tYm).interestPaise;
      const curPaidP = paidMonths[tYm] ? mIntP : toPaise(partialPayments[tYm] || 0);
      const nextPaidP = curPaidP > revP ? curPaidP - revP : 0n;
      updatePayload[`paidMonths.${tYm}`] = FieldValue.delete();
      if (nextPaidP >= mIntP && mIntP > 0n) {
        updatePayload[`paidMonths.${tYm}`] = { paidAt: new Date().toISOString(), amount: paiseToRupees(mIntP) };
        updatePayload[`partialPayments.${tYm}`] = FieldValue.delete();
      } else if (nextPaidP > 0n) {
        updatePayload[`partialPayments.${tYm}`] = paiseToRupees(nextPaidP);
      } else {
        updatePayload[`partialPayments.${tYm}`] = FieldValue.delete();
      }
      if (Array.isArray(extraIn[tYm])) {
        const remIn = extraIn[tYm].filter((x) => x.fromYm !== targetYm);
        updatePayload[`extraIn.${tYm}`] = remIn.length ? remIn : FieldValue.delete();
      }
    });

    updatePayload[`extraOut.${targetYm}`] = FieldValue.delete();
  }

  if (borrower.extraIn && borrower.extraIn[targetYm]) {
    updatePayload[`extraIn.${targetYm}`] = FieldValue.delete();
  }

  const paths = getUserPaths(uid);
  await paths.borrowerDoc(borrower.id).update(updatePayload);
  await appendAuditLog(uid, "PAYMENT_RESET", `${borrower.name} (${targetYm}) Reset`, userEmail);
}

// =========================================================================
// ५. अतिरिक्त मुद्दल, मुद्दल कपात, Historical Lock, Compound, Wallet व Promises
// =========================================================================
export async function addExtraPrincipal(uid, borrower, amount, note = "अतिरिक्त मुद्दल", userEmail = "") {
  const amtP = toPaise(amount);
  if (amtP <= 0n) throw new Error("वैध रक्कम टाका.");
  const nextP = paiseToRupees(toPaise(borrower.principal || 0) + amtP);
  const nextOrig = paiseToRupees(toPaise(borrower.originalPrincipal || borrower.principal || 0) + amtP);
  const nowIso = new Date().toISOString();

  await getUserPaths(uid).borrowerDoc(borrower.id).update({
    principal: nextP,
    originalPrincipal: nextOrig,
    extraPrincipals: FieldValue.arrayUnion({ date: nowIso, amount: paiseToRupees(amtP), balanceAfter: nextP, note: String(note).trim() }),
    updatedAt: nowIso
  });
  await appendAuditLog(uid, "PRINCIPAL_ADDED", `${borrower.name} +₹${paiseToRupees(amtP)}`, userEmail);
}

export async function reducePrincipal(uid, borrower, amount, note = "मुद्दल कपात", userEmail = "") {
  const amtP = toPaise(amount);
  if (amtP <= 0n) throw new Error("वैध रक्कम टाका.");
  const curP = toPaise(borrower.principal || 0);
  const nextP = paiseToRupees(curP > amtP ? curP - amtP : 0n);
  const nowIso = new Date().toISOString();

  await getUserPaths(uid).borrowerDoc(borrower.id).update({
    principal: nextP,
    principalReductions: FieldValue.arrayUnion({ date: nowIso, amount: paiseToRupees(amtP), balanceAfter: nextP, note: String(note).trim() }),
    updatedAt: nowIso
  });
  await appendAuditLog(uid, "PRINCIPAL_REDUCED", `${borrower.name} -₹${paiseToRupees(amtP)}`, userEmail);
}

export async function saveHistoricalTerms(uid, borrower, newTerms, activeYm, userEmail = "") {
  const payload = buildHistoricalTermUpdate(borrower, newTerms, activeYm);
  if (newTerms.effectiveYm && compareYm(newTerms.effectiveYm, activeYm) <= 0) {
    payload.rate = Number(newTerms.rate);
    payload.interestType = newTerms.interestType;
  }
  await getUserPaths(uid).borrowerDoc(borrower.id).update(payload);
  await appendAuditLog(uid, "HISTORICAL_TERM_LOCKED", `${borrower.name} (${newTerms.effectiveYm})`, userEmail);
}

export async function toggleOptInCompound(uid, borrower, userEmail = "") {
  const prev = borrower.v18Compound && typeof borrower.v18Compound === "object" ? borrower.v18Compound : {};
  const nextEnabled = !prev.enabled;
  await getUserPaths(uid).borrowerDoc(borrower.id).update({
    v18Compound: { ...prev, enabled: nextEnabled, updatedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString()
  });
  await appendAuditLog(uid, "COMPOUND_TOGGLED", `${borrower.name} चक्रवाढ ${nextEnabled ? "ON" : "OFF"}`, userEmail);
}

export async function runOptInCompound(uid, borrower, activeYm, userEmail = "") {
  const ledger = computeBorrowerLedger(borrower, activeYm);
  const ev = evaluateCompound(borrower, activeYm, ledger.pastDuePaise);
  if (!ev.eligible) throw new Error(ev.reason === "already_compounded_this_month" ? "या महिन्याचे चक्रवाढ आधीच पूर्ण झाले आहे." : "चक्रवाढसाठी थकीत बाकी नाही.");

  const nowIso = new Date().toISOString();
  const todayIst = getIstTodayIso();
  const lockPayload = buildHistoricalTermUpdate(borrower, {
    effectiveYm: activeYm, principal: ev.newPrincipalRupees, rate: borrower.rate,
    ratePeriod: borrower.ratePeriod || "monthly", interestType: borrower.interestType || "reducing"
  }, activeYm);

  const prevComp = borrower.v18Compound || {};
  const prevHist = Array.isArray(prevComp.history) ? prevComp.history : [];

  await getUserPaths(uid).borrowerDoc(borrower.id).update({
    ...lockPayload,
    principal: ev.newPrincipalRupees,
    extraPrincipals: FieldValue.arrayUnion({
      date: nowIso, amount: ev.addedInterestRupees, balanceAfter: ev.newPrincipalRupees,
      isCompound: true, note: `थकीत व्याज चक्रवाढ (${activeYm})`
    }),
    v18Compound: {
      ...prevComp, enabled: true, lastCompoundedYm: activeYm,
      history: [...prevHist, { ym: activeYm, date: todayIst, addedInterest: ev.addedInterestRupees, newPrincipal: ev.newPrincipalRupees, ts: nowIso }]
    },
    updatedAt: nowIso
  });
  await appendAuditLog(uid, "COMPOUND_APPLIED", `${borrower.name} ₹${ev.addedInterestRupees} मुद्दलात जोडले`, userEmail);
  return ev;
}

export async function creditAdvanceWallet(uid, borrower, amount, activeYm, note = "", userEmail = "") {
  const res = buildWalletTransaction(borrower, "credit", amount, activeYm, note || "अ‍ॅडव्हान्स वॉलेट जमा");
  if (res.error) throw new Error(res.error);
  await getUserPaths(uid).borrowerDoc(borrower.id).update({ v16AdvanceWallet: res.v16AdvanceWallet, updatedAt: new Date().toISOString() });
  await appendAuditLog(uid, "WALLET_CREDITED", `${borrower.name} +₹${amount}`, userEmail);
}

export async function applyAdvanceWalletToMonth(uid, borrower, amount, activeYm, userEmail = "") {
  const res = buildWalletTransaction(borrower, "apply", amount, activeYm, `${activeYm} व्याजात लागू`);
  if (res.error) throw new Error(res.error);
  await getUserPaths(uid).borrowerDoc(borrower.id).update({ v16AdvanceWallet: res.v16AdvanceWallet, updatedAt: new Date().toISOString() });
  return collectMonthlyPayment(uid, { ...borrower, v16AdvanceWallet: res.v16AdvanceWallet }, {
    ym: activeYm, amount, mode: "Advance Wallet", sendExtraToWallet: true, userEmail
  });
}

export async function saveUnifiedPromises(uid, borrowerId, promiseList) {
  const clean = (Array.isArray(promiseList) ? promiseList : [])
    .filter((p) => p && /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || "")))
    .map((p) => ({
      id: p.id || `pr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: String(p.date),
      amount: Number(p.amount || 0),
      note: String(p.note || "").trim(),
      status: p.status === "done" ? "done" : "pending",
      createdAt: p.createdAt || new Date().toISOString()
    }));

  const top3 = Array.from(new Set(clean.filter((p) => p.status !== "done").map((p) => p.date).sort()));
  await getUserPaths(uid).borrowerDoc(borrowerId).update({
    promiseList: clean,
    promiseDate1: top3[0] || "",
    promiseDate2: top3[1] || "",
    promiseDate3: top3[2] || "",
    updatedAt: new Date().toISOString()
  });
}

// ऑफलाइन रांगेतील पेमेंट नेट येताच चालवण्यासाठी हँडलर नोंदणी
registerOfflineHandler("COLLECT_PAYMENT", async (payload) => {
  const { borrowerId, ym, amount, mode, sendExtraToWallet, txId, userEmail } = payload;
  const uid = window.firebase?.auth?.()?.currentUser?.uid;
  if (!uid || !borrowerId) throw new Error("ऑफलाइन सिंकसाठी युजर किंवा ग्राहक
