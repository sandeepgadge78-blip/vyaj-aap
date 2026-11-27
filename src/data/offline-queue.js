// व्याज Infinity X - AES-256-GCM Encrypted IndexedDB Offline Queue + Duplicate Payment Guard (src/data/offline-queue.js)

import { updateUi } from "../core/store.js";

const DB_NAME = "vyaj_infinity_offline_v1";
const DB_VERSION = 1;
const STORE_NAME = "pending_tx";
const RECENT_TX_KEY = "vyaj_recent_tx_ids_v1";
const DEVICE_SALT_KEY = "vyaj_offline_device_salt_v1";

let dbPromise = null;
let syncRunning = false;
const handlers = new Map(); // actionType -> async (payload) => void

// =========================================================================
// १. Duplicate Transaction Protection (दुहेरी पेमेंट रोखण्यासाठी युनिक ID)
// =========================================================================
export function createTxId(prefix = "tx") {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

function loadRecentTxMap() {
  try {
    const obj = JSON.parse(localStorage.getItem(RECENT_TX_KEY) || "{}");
    const now = Date.now();
    const clean = {};
    // २४ तासांपूर्वीचे जुने IDs आपोआप साफ करा
    Object.entries(obj).forEach(([id, ts]) => {
      if (now - Number(ts || 0) < 86400000) clean[id] = ts;
    });
    return clean;
  } catch (_) {
    return {};
  }
}

export function isDuplicateTx(txId) {
  if (!txId) return false;
  const map = loadRecentTxMap();
  return Boolean(map[txId]);
}

export function markTxProcessed(txId) {
  if (!txId) return;
  try {
    const map = loadRecentTxMap();
    map[txId] = Date.now();
    localStorage.setItem(RECENT_TX_KEY, JSON.stringify(map));
  } catch (_) {}
}

// =========================================================================
// २. डिव्हाइस-बाउंड AES-256-GCM Encryption (ऑफलाइन डेटा सुरक्षित ठेवण्यासाठी)
// =========================================================================
function getDeviceSaltBytes() {
  let b64 = localStorage.getItem(DEVICE_SALT_KEY);
  if (!b64) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    b64 = btoa(String.fromCharCode(...bytes));
    localStorage.setItem(DEVICE_SALT_KEY, b64);
  }
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function deriveQueueKey(uid) {
  const secret = `vyaj_infinity_q_${uid || "local"}_${location.origin}`;
  const km = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: getDeviceSaltBytes(), iterations: 80000, hash: "SHA-256" },
    km,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptObj(uid, obj) {
  if (!window.crypto || !window.crypto.subtle) {
    return { plain: true, data: JSON.stringify(obj) };
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveQueueKey(uid);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(obj))
  );
  return {
    plain: false,
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(cipher))
  };
}

async function decryptObj(uid, record) {
  if (!record) return null;
  if (record.plain) return JSON.parse(record.data);
  const key = await deriveQueueKey(uid);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(record.iv) },
    key,
    new Uint8Array(record.data)
  );
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

// =========================================================================
// ३. IndexedDB स्टोरेज ऑपरेशन्स
// =========================================================================
function openQueueDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB उपलब्ध नाही."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "txId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function getPendingTxList(uid) {
  try {
    const db = await openQueueDb();
    const rawItems = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    const out = [];
    for (const row of rawItems) {
      if (uid && row.uid !== uid) continue;
      try {
        const payload = await decryptObj(row.uid, row.encrypted);
        out.push({ txId: row.txId, uid: row.uid, action: row.action, createdAt: row.createdAt, retries: row.retries || 0, payload });
      } catch (err) {
        console.warn("Offline Queue Decrypt Warning:", row.txId, err);
      }
    }
    out.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    return out;
  } catch (_) {
    return [];
  }
}

export async function refreshPendingCount(uid) {
  const list = await getPendingTxList(uid);
  updateUi({ pendingOfflineCount: list.length });
  return list.length;
}

export async function enqueueOfflineTx({ uid, action, payload, txId }) {
  const id = txId || createTxId(action || "tx");
  if (isDuplicateTx(id)) return { queued: false, duplicate: true, txId: id };

  const encrypted = await encryptObj(uid, payload);
  const db = await openQueueDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({
      txId: id,
      uid,
      action,
      encrypted,
      retries: 0,
      createdAt: Date.now()
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  await refreshPendingCount(uid);
  return { queued: true, duplicate: false, txId: id };
}

export async function removePendingTx(txId, uid) {
  const db = await openQueueDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(txId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await refreshPendingCount(uid);
}

// =========================================================================
// ४. हँडलर नोंदणी व ऑटो-सिंक इंजिन (नेट परत येताच Pending व्यवहार Sync करा)
// =========================================================================
export function registerOfflineHandler(actionName, fn) {
  if (actionName && typeof fn === "function") handlers.set(actionName, fn);
}

export async function syncPendingQueue(uid) {
  if (!uid || !navigator.onLine || syncRunning) return { synced: 0, failed: 0 };
  syncRunning = true;
  let synced = 0;
  let failed = 0;

  try {
    const items = await getPendingTxList(uid);
    if (!items.length) return { synced: 0, failed: 0 };

    updateUi({ syncStatus: "Syncing..." });
    for (const item of items) {
      if (isDuplicateTx(item.txId)) {
        await removePendingTx(item.txId, uid);
        continue;
      }
      const handler = handlers.get(item.action);
      if (!handler) continue;

      try {
        await handler({ ...item.payload, txId: item.txId, _fromOfflineQueue: true });
        markTxProcessed(item.txId);
        await removePendingTx(item.txId, uid);
        synced += 1;
      } catch (err) {
        console.warn("Offline Sync Failed for:", item.txId, err);
        failed += 1;
      }
    }
    updateUi({ syncStatus: failed > 0 ? "Sync Partial" : "Synced" });
  } finally {
    syncRunning = false;
    await refreshPendingCount(uid);
  }
  return { synced, failed };
}

export function initOfflineQueueWatcher(getUidFn) {
  window.addEventListener("online", () => {
    updateUi({ isOnline: true });
    const uid = typeof getUidFn === "function" ? getUidFn() : null;
    if (uid) setTimeout(() => syncPendingQueue(uid), 1200);
  });
  window.addEventListener("offline", () => {
    updateUi({ isOnline: false, syncStatus: "Offline Mode" });
  });
}
