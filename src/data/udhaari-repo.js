// व्याज Infinity X - १००% स्वतंत्र उधारी Repository (व्याजाच्या हिशोबापेक्षा वेगळे) (src/data/udhaari-repo.js)

import { getUserPaths } from "../core/firebase.js";
import { setState } from "../core/store.js";
import { toPaise, paiseToRupees, getIstTodayIso, getIstCurrentYm } from "../core/ledger-v16.js";
import { createTxId, isDuplicateTx, markTxProcessed, enqueueOfflineTx, registerOfflineHandler } from "./offline-queue.js";
import { appendAuditLog, normalizeMobile } from "./borrowers-repo.js";

let unsubUdhaari = null;

export function stopUdhaariSync() {
  if (typeof unsubUdhaari === "function") { unsubUdhaari(); unsubUdhaari = null; }
}

export function startUdhaariSync(uid) {
  stopUdhaariSync();
  const paths = getUserPaths(uid);
  unsubUdhaari = paths.udhaari.onSnapshot(
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setState({ udhaari: list });
    },
    (err) => console.warn("Udhaari Sync Warning:", err)
  );
}

export async function addUdhaari(uid, data, userEmail = "") {
  const name = String(data.name || "").trim();
  const amtP = toPaise(data.amount || 0);
  if (!name || amtP <= 0n) throw new Error("कृपया व्यक्तीचे नाव आणि वैध उधारी रक्कम (₹) टाका.");

  const nowIso = new Date().toISOString();
  const givenDate = data.givenDate || getIstTodayIso();
  const docData = {
    name,
    mobile: normalizeMobile(data.mobile),
    amount: paiseToRupees(amtP),
    paidAmount: 0,
    givenDate,
    givenYm: givenDate.slice(0, 7),
    promiseDate: String(data.promiseDate || ""),
    note: String(data.note || "").trim(),
    status: "pending",
    returnedDate: "",
    returnedYm: "",
    payments: [],
    isDeleted: false,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  const ref = await getUserPaths(uid).udhaari.add(docData);
  await appendAuditLog(uid, "UDHAARI_ADDED", `${name} (₹${docData.amount})`, userEmail);
  return ref.id;
}

export async function collectUdhaariReturn(uid, u, payAmount, activeYm, { txId, userEmail = "", _fromOfflineQueue = false } = {}) {
  const payP = toPaise(payAmount);
  if (payP <= 0n) throw new Error("कृपया शून्यापेक्षा जास्त रक्कम टाका.");
  if (!u?.id) throw new Error("उधारी नोंद सापडली नाही.");

  const safeTxId = txId || createTxId("udpay");
  if (isDuplicateTx(safeTxId)) return { status: "duplicate", txId: safeTxId };

  if (!navigator.onLine && !_fromOfflineQueue) {
    const res = await enqueueOfflineTx({
      uid,
      action: "UDHAARI_RETURN",
      txId: safeTxId,
      payload: { udhaariId: u.id, payAmount: paiseToRupees(payP), activeYm: activeYm || getIstCurrentYm(), userEmail }
    });
    return { status: "queued_offline", txId: res.txId };
  }

  const totP = toPaise(u.amount || 0);
  const prevPaidP = toPaise(u.paidAmount || 0);
  const nextPaidP = prevPaidP + payP > totP ? totP : prevPaidP + payP;
  const isNowFull = nextPaidP >= totP;

  const todayIso = getIstTodayIso();
  const ym = String(activeYm || getIstCurrentYm()).slice(0, 7);
  const nowIso = new Date().toISOString();
  const prevPayments = Array.isArray(u.payments) ? u.payments : [];

  await getUserPaths(uid).udhaariDoc(u.id).update({
    paidAmount: paiseToRupees(nextPaidP),
    status: isNowFull ? "paid" : "partial",
    returnedDate: isNowFull ? todayIso : (u.returnedDate || ""),
    returnedYm: isNowFull ? ym : (u.returnedYm || ""),
    payments: [...prevPayments, { id: safeTxId, amount: paiseToRupees(payP), date: todayIso, ym, ts: nowIso }],
    updatedAt: nowIso
  });

  markTxProcessed(safeTxId);
  await appendAuditLog(uid, "UDHAARI_RETURNED", `${u.name} परत ₹${paiseToRupees(payP)}`, userEmail);
  return { status: "committed", txId: safeTxId };
}

export async function deleteUdhaari(uid, u, userEmail = "") {
  if (!u?.id) return;
  await getUserPaths(uid).udhaariDoc(u.id).delete();
  await appendAuditLog(uid, "UDHAARI_DELETED", `${u.name} (₹${u.amount}) डिलीट`, userEmail);
}

registerOfflineHandler("UDHAARI_RETURN", async (payload) => {
  const uid = window.firebase?.auth?.()?.currentUser?.uid;
  if (!uid || !payload.udhaariId) return;
  const snap = await getUserPaths(uid).udhaariDoc(payload.udhaariId).get();
  if (!snap.exists) return;
  await collectUdhaariReturn(uid, { id: snap.id, ...snap.data() }, payload.payAmount, payload.activeYm, {
    txId: payload.txId, userEmail: payload.userEmail, _fromOfflineQueue: true
  });
});
