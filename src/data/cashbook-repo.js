// व्याज Infinity X - कॅशबुक, बिझनेस प्रोफाईल व सेटिंग्ज क्लाउड सिंक Repository (src/data/cashbook-repo.js)

import { getUserPaths } from "../core/firebase.js";
import { getState, setState } from "../core/store.js";
import { getIstTodayIso } from "../core/ledger-v16.js";

const CASHBOOK_KEY = "vyaj_aap_cashbook_v1";
const SETTINGS_KEY = "vyaj_aap_settings_v1";
const PROFILE_KEY = "hishob_biz_profile";

// =========================================================================
// १. युजर प्रोफाईल, सेटिंग्ज आणि कॅशबुक क्लाउडमधून आणणे
// =========================================================================
export async function pullUserMetaAndCashbook(uid) {
  if (!uid) return;
  const paths = getUserPaths(uid);

  // अ) मुख्य प्रोफाईल (bizProfile, selfWaNumber, selfUpiId, webhookUrl)
  try {
    const rootSnap = await paths.root.get();
    if (rootSnap.exists) {
      const d = rootSnap.data() || {};
      const nextProfile = {
        ...(getState().profile || {}),
        ...(d.bizProfile || {}),
        selfWaNumber: d.selfWaNumber || d.bizProfile?.selfWaNumber || "",
        upiId: d.bizProfile?.upiId || d.selfUpiId || "",
        webhookUrl: d.webhookUrl || ""
      };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
      setState({ profile: nextProfile });
    }
  } catch (err) {
    console.warn("Profile Pull Warning:", err?.message);
  }

  // ब) अ‍ॅप सेटिंग्ज (autoLockMs, defaultRate)
  try {
    const setSnap = await paths.appSettings.get();
    if (setSnap.exists) {
      const cloud = setSnap.data() || {};
      const local = getState().settings || {};
      if (Number(cloud.updatedAt || 0) >= Number(local.updatedAt || 0)) {
        const merged = {
          autoLockMs: Number(cloud.autoLockMs) || 300000,
          defaultRate: cloud.defaultRate !== undefined ? Number(cloud.defaultRate) : 2,
          updatedAt: Number(cloud.updatedAt) || Date.now()
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
        setState({ settings: merged });
      }
    }
  } catch (err) {
    console.warn("Settings Pull Warning:", err?.message);
  }

  // क) रोजचा कॅशबुक (meta/cashbook)
  try {
    const cbSnap = await paths.cashbook.get();
    const localEntries = loadLocalCashbook();
    if (cbSnap.exists && Array.isArray(cbSnap.data()?.entries)) {
      const cloudEntries = cbSnap.data().entries;
      const finalEntries = cloudEntries.length >= localEntries.length ? cloudEntries : localEntries;
      localStorage.setItem(CASHBOOK_KEY, JSON.stringify(finalEntries));
      setState({ cashbook: finalEntries });
    } else {
      setState({ cashbook: localEntries });
    }
  } catch (err) {
    setState({ cashbook: loadLocalCashbook() });
  }
}

export function loadLocalCashbook() {
  try {
    const arr = JSON.parse(localStorage.getItem(CASHBOOK_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

// =========================================================================
// २. कॅशबुक नोंदी जोडणे व डिलीट करणे
// =========================================================================
export async function addCashbookEntry(uid, { date, type, amount, mode, note }) {
  const amt = Number(amount || 0);
  const cleanNote = String(note || "").trim();
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("कृपया योग्य रक्कम (₹) टाका.");
  if (!cleanNote) throw new Error("कृपया तपशील किंवा कारण लिहा.");

  const dt = date || getIstTodayIso();
  const entry = {
    id: `cb_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    date: dt,
    ym: dt.slice(0, 7),
    type: type === "out" ? "out" : "in",
    amount: amt,
    mode: mode || "Cash",
    note: cleanNote,
    createdAt: Date.now()
  };

  const next = [entry, ...(getState().cashbook || [])];
  localStorage.setItem(CASHBOOK_KEY, JSON.stringify(next));
  setState({ cashbook: next });

  if (uid && navigator.onLine) {
    try {
      await getUserPaths(uid).cashbook.set({ entries: next, updatedAt: Date.now() }, { merge: true });
    } catch (_) {}
  }
  return entry;
}

export async function deleteCashbookEntry(uid, entryId) {
  const next = (getState().cashbook || []).filter((e) => e.id !== entryId);
  localStorage.setItem(CASHBOOK_KEY, JSON.stringify(next));
  setState({ cashbook: next });

  if (uid && navigator.onLine) {
    try {
      await getUserPaths(uid).cashbook.set({ entries: next, updatedAt: Date.now() }, { merge: true });
    } catch (_) {}
  }
}

// =========================================================================
// ३. बिझनेस प्रोफाईल व अ‍ॅप सेटिंग्ज सेव्ह करणे
// =========================================================================
export async function saveBusinessProfile(uid, profilePatch) {
  const next = { ...(getState().profile || {}), ...profilePatch };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  setState({ profile: next });

  if (uid && navigator.onLine) {
    await getUserPaths(uid).root.set({
      bizProfile: {
        bizName: next.bizName || "",
        ownerName: next.ownerName || "",
        mobile: next.mobile || "",
        upiId: next.upiId || ""
      },
      selfUpiId: next.upiId || "",
      selfWaNumber: next.selfWaNumber || "",
      webhookUrl: next.webhookUrl || ""
    }, { merge: true });
  }
}

export async function saveAppSettings(uid, { autoLockMs, defaultRate }) {
  const next = {
    autoLockMs: Number(autoLockMs) || 300000,
    defaultRate: Number.isFinite(Number(defaultRate)) ? Number(defaultRate) : 2,
    updatedAt: Date.now()
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  setState({ settings: next });

  if (uid && navigator.onLine) {
    await getUserPaths(uid).appSettings.set(next, { merge: true });
  }
}
