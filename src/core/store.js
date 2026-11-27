// व्याज Infinity X - सिंगल रिअ‍ॅक्टिव्ह State Store (शून्य MutationObserver, ०% ब्लिंकिंग) (src/core/store.js)

import { computeBorrowerLedger, getIstCurrentYm, toPaise, paiseToRupees, extractYm } from "./ledger-v16.js";

const initialState = {
  user: null,
  activeYm: getIstCurrentYm(),
  borrowers: [],
  udhaari: [],
  cashbook: [],
  auditLogs: [],
  profile: loadJson("hishob_biz_profile", {}),
  settings: loadJson("vyaj_aap_settings_v1", { autoLockMs: 300000, defaultRate: 2 }),
  filters: {
    search: "",
    account: "active", // active | closed
    job: "all",        // all | govt | private | business
    status: "all"      // all | paid | partial | pending
  },
  ui: {
    hideAmounts: false,
    theme: localStorage.getItem("vyaj_theme") || "dark",
    isOnline: navigator.onLine,
    syncStatus: "Locked",
    pendingOfflineCount: 0
  }
};

let state = initialState;
const listeners = new Set();
let cachedMonthSig = "";
let cachedMonthReport = null;

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

export function getState() {
  return state;
}

export function setState(patch) {
  const next = typeof patch === "function" ? patch(state) : { ...state, ...patch };
  state = next;
  cachedMonthSig = ""; // डेटा बदलला तरच रिपोर्ट कॅश ताजा करा
  listeners.forEach((fn) => {
    try { fn(state); } catch (err) { console.warn("Store Listener Error:", err); }
  });
}

export function updateFilters(filterPatch) {
  setState((prev) => ({ ...prev, filters: { ...prev.filters, ...filterPatch } }));
}

export function updateUi(uiPatch) {
  setState((prev) => ({ ...prev, ui: { ...prev.ui, ...uiPatch } }));
}

export function subscribeStore(fn) {
  if (typeof fn === "function") listeners.add(fn);
  return () => listeners.delete(fn);
}

// संपूर्ण अ‍ॅपसाठी एकच Single Source of Truth मासिक रिपोर्ट (Dashboard, Cards, Month Activity व PDF साठी)
export function getUnifiedMonthReport(forceYm) {
  const ym = forceYm || state.activeYm || getIstCurrentYm();
  const sig = `${ym}|b:${state.borrowers.length}|u:${state.udhaari.length}|h:${state.ui.hideAmounts}`;
  if (cachedMonthReport && cachedMonthSig === sig) return cachedMonthReport;

  const validBorrowers = state.borrowers.filter((b) => b && !b.isDeleted);
  const rows = [];

  let totalPrincipalP = 0n, expectedIntP = 0n, collectedIntP = 0n;
  let curPendingP = 0n, pastPendingP = 0n, totalPendingP = 0n;
  let extraAddedP = 0n, extraReducedP = 0n, compoundedP = 0n, walletTotalP = 0n;
  let activeCount = 0, paidCount = 0, curPendingCount = 0, pastPendingCount = 0;

  validBorrowers.forEach((b) => {
    const ledger = computeBorrowerLedger(b, ym);
    rows.push({ b, ledger });

    if (!ledger.isClosed) {
      activeCount += 1;
      totalPrincipalP += ledger.principalPaise;
      expectedIntP += ledger.monthlyInterestPaise;
      collectedIntP += ledger.collectedInMonthPaise;
      walletTotalP += ledger.walletBalancePaise;
      if (ledger.status === "paid" || ledger.collectedInMonthPaise > 0n) paidCount += 1;
      if (ledger.remainingThisMonthPaise > 0n) { curPendingP += ledger.remainingThisMonthPaise; curPendingCount += 1; }
      if (ledger.pastDuePaise > 0n) { pastPendingP += ledger.pastDuePaise; pastPendingCount += 1; }
      totalPendingP += ledger.totalPayablePaise;
    }

    extraAddedP += ledger.principalEvents.addedPaise;
    extraReducedP += ledger.principalEvents.reducedPaise;
    compoundedP += ledger.principalEvents.compoundedPaise;
  });

  // स्वतंत्र उधारी गोळा करा (व्याजापेक्षा १००% वेगळे)
  const udRows = [];
  let udGivenP = 0n, udPaidP = 0n, udRemP = 0n;
  state.udhaari.forEach((u) => {
    if (!u || u.isDeleted) return;
    const gYm = extractYm(u.givenYm || u.givenDate) || ym;
    if (gYm > ym) return;
    const amtP = toPaise(u.amount || 0);
    const paidP = toPaise(u.paidAmount || 0);
    const remP = amtP > paidP ? amtP - paidP : 0n;
    const isFull = remP === 0n || u.status === "paid";
    const retYm = extractYm(u.returnedYm || u.returnedDate);
    if (isFull && retYm && retYm < ym) return;

    udGivenP += amtP;
    udPaidP += paidP;
    udRemP += remP;
    udRows.push({ ...u, givenYm: gYm, retYm, amtP, paidP, remP, isFull });
  });

  const collectionPct = expectedIntP > 0n
    ? Math.min(100, Number((collectedIntP * 100n) / expectedIntP))
    : 0;

  cachedMonthReport = {
    ym,
    rows,
    summary: {
      activeCount,
      paidCount,
      curPendingCount,
      pastPendingCount,
      collectionPct,
      totalPrincipal: paiseToRupees(totalPrincipalP),
      expectedInterest: paiseToRupees(expectedIntP),
      collectedInterest: paiseToRupees(collectedIntP),
      currentPending: paiseToRupees(curPendingP),
      pastPending: paiseToRupees(pastPendingP),
      totalPending: paiseToRupees(totalPendingP),
      extraPrincipalAdded: paiseToRupees(extraAddedP),
      extraPrincipalReduced: paiseToRupees(extraReducedP),
      compoundedPrincipal: paiseToRupees(compoundedP),
      advanceWalletTotal: paiseToRupees(walletTotalP)
    },
    udhaari: {
      rows: udRows,
      totalGiven: paiseToRupees(udGivenP),
      totalReturned: paiseToRupees(udPaidP),
      totalRemaining: paiseToRupees(udRemP)
    }
  };
  cachedMonthSig = sig;
  return cachedMonthReport;
}
