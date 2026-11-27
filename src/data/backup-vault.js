// व्याज Infinity X - PBKDF2 + AES-256-GCM + SHA-256 Encrypted Backup Vault व Quota-Safe Snapshots (src/data/backup-vault.js)

import { db, getUserPaths } from "../core/firebase.js";
import { getState, getUnifiedMonthReport } from "../core/store.js";
import { getIstTodayIso, getIstCurrentYm } from "../core/ledger-v16.js";
import { appendAuditLog } from "./borrowers-repo.js";

const SNAPSHOTS_KEY = "vyaj_aap_auto_snapshot_backups_v2";
const LAST_META_KEY = "vyaj_aap_settings_live_backup_meta_v2";
const LOCAL_VAULT_KEY = "hishob_emergency_vault";

// =========================================================================
// १. Base64, SHA-256 व PBKDF2 + AES-256-GCM Encryption Helpers
// =========================================================================
function uint8ToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function base64ToUint8(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function computeSha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function deriveAesKey(passkey, saltBytes) {
  const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(passkey), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: 150000, hash: "SHA-256" },
    km,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptBackupPayload(obj, passkey) {
  if (!passkey || String(passkey).trim().length < 6) {
    throw new Error("सुरक्षिततेसाठी किमान ६ अक्षरांची Passkey टाका.");
  }
  const plainText = JSON.stringify(obj);
  const sha256 = await computeSha256Hex(plainText);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passkey, salt);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plainText));

  return {
    sha256,
    jsonString: JSON.stringify({
      v: 16,
      app: "VyajInfinityX",
      sha256,
      salt: uint8ToBase64(salt),
      iv: uint8ToBase64(iv),
      data: uint8ToBase64(new Uint8Array(cipherBuf))
    })
  };
}

// जुन्या app.js (v: 12) व नवीन (v: 16) दोन्ही Encrypted बॅकअप फाईल्सना १००% सपोर्ट
export async function decryptBackupPayload(jsonText, passkey) {
  if (!passkey || String(passkey).trim().length < 6) {
    throw new Error("कृपया योग्य Passkey टाका.");
  }
  const parsed = JSON.parse(jsonText);
  if (!parsed || !parsed.salt || !parsed.iv || !parsed.data) {
    throw new Error("ही वैध Encrypted Backup फाईल नाही.");
  }
  const key = await deriveAesKey(passkey, base64ToUint8(parsed.salt));
  let plainText = "";
  try {
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToUint8(parsed.iv) }, key, base64ToUint8(parsed.data));
    plainText = new TextDecoder().decode(plainBuf);
  } catch (_) {
    throw new Error("चुकीची Passkey किंवा खराब झालेली बॅकअप फाईल.");
  }

  if (parsed.sha256) {
    const actualHash = await computeSha256Hex(plainText);
    if (actualHash !== parsed.sha256) {
      throw new Error("SHA-256 अखंडता तपासणी अयशस्वी! फाईलमध्ये बदल झाला आहे.");
    }
  }
  return JSON.parse(plainText);
}

// =========================================================================
// २. Quota-Safe Local Snapshots (Firestore 1MB व localStorage 5MB संरक्षण)
// =========================================================================
export function buildQuotaSafeBorrowers(borrowers) {
  return (Array.isArray(borrowers) ? borrowers : []).map((b) => {
    const copy = { ...b };
    delete copy.documents;
    delete copy.versionHistory;
    delete copy.versions;
    return copy;
  });
}

export function getLocalSnapshots() {
  try {
    const arr = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

export function getLastBackupMeta() {
  try {
    return JSON.parse(localStorage.getItem(LAST_META_KEY) || "null");
  } catch (_) {
    return null;
  }
}

export function saveLocalSafetySnapshot(borrowers, udhaari, reason = "manual") {
  const lightBorrowers = buildQuotaSafeBorrowers(borrowers);
  const udList = Array.isArray(udhaari) ? udhaari : [];
  const now = Date.now();
  const snap = {
    id: `snap_${now}`,
    ts: now,
    reason,
    count: lightBorrowers.length,
    udhaariCount: udList.length,
    borrowers: lightBorrowers,
    udhaari: udList
  };

  const next = [snap, ...getLocalSnapshots()].slice(0, 3);
  try {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(next));
  } catch (_) {
    try { localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify([snap])); } catch (__) {}
  }
  return snap;
}

// =========================================================================
// ३. Live Cloud + Local Backup, Download व Safe Batch Restore (२५ नोंदी बॅच)
// =========================================================================
export async function performLiveBackup(uid, { reason = "manual", userEmail = "" } = {}) {
  const { borrowers, udhaari } = getState();
  if (!borrowers.length && !udhaari.length) {
    return { ok: false, message: "बॅकअपसाठी डेटा उपलब्ध नाही." };
  }

  const now = Date.now();
  const isoDate = getIstTodayIso();
  const lightBorrowers = buildQuotaSafeBorrowers(borrowers);
  saveLocalSafetySnapshot(lightBorrowers, udhaari, reason);

  let cloudOk = false;
  if (uid && navigator.onLine) {
    try {
      const payload = {
        updatedAt: new Date(now).toISOString(),
        ts: now,
        reason,
        count: lightBorrowers.length,
        udhaariCount: udhaari.length,
        borrowers: lightBorrowers,
        udhaari
      };
      const paths = getUserPaths(uid);
      if (JSON.stringify(payload).length < 850000) {
        await paths.latestProBackup.set(payload);
      } else {
        await paths.latestProBackup.set({
          updatedAt: payload.updatedAt, ts: now, reason: "summary_large_db",
          count: lightBorrowers.length, udhaariCount: udhaari.length
        }, { merge: true });
      }
      cloudOk = true;
      await appendAuditLog(uid, "LIVE_BACKUP", `${lightBorrowers.length} खाती + ${udhaari.length} उधारी (${reason})`, userEmail);
    } catch (err) {
      console.warn("Cloud Backup Warning:", err?.message);
    }
  }

  const meta = { ts: now, date: isoDate, count: borrowers.length, udhaariCount: udhaari.length, cloudOk, reason };
  try {
    localStorage.setItem(LAST_META_KEY, JSON.stringify(meta));
    localStorage.setItem("vyaj_last_backup_date", isoDate);
  } catch (_) {}

  return { ok: true, cloudOk, meta };
}

export async function exportEncryptedBackupFile(passkey) {
  const { borrowers, udhaari, cashbook, profile } = getState();
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "VyajInfinityX",
    borrowers,
    udhaari,
    cashbook,
    profile
  };
  const res = await encryptBackupPayload(payload, passkey);
  const blob = new Blob([res.jsonString], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vyaj-infinity-backup-${getIstTodayIso()}.enc.json`;
  a.click();
  URL.revokeObjectURL(url);
  return { sha256: res.sha256, count: borrowers.length, udhaariCount: udhaari.length };
}

export async function saveEmergencyLocalVault(passkey) {
  const { borrowers, udhaari } = getState();
  const res = await encryptBackupPayload({ savedAt: new Date().toISOString(), borrowers: buildQuotaSafeBorrowers(borrowers), udhaari }, passkey);
  localStorage.setItem(LOCAL_VAULT_KEY, res.jsonString);
  return { sha256: res.sha256 };
}

async function batchWriteCollection(colRef, items) {
  let count = 0;
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    const batch = db.batch();
    chunk.forEach((item) => {
      const copy = { ...item };
      const docId = copy.id || colRef.doc().id;
      delete copy.id;
      batch.set(colRef.doc(docId), copy, { merge: true });
      count += 1;
    });
    await batch.commit();
  }
  return count;
}

export async function restoreFromPayload(uid, parsedData, userEmail = "") {
  if (!uid) throw new Error("रिस्टोर करण्यासाठी लॉगिन आवश्यक आहे.");
  const borrowers = Array.isArray(parsedData?.borrowers) ? parsedData.borrowers : [];
  const udhaari = Array.isArray(parsedData?.udhaari) ? parsedData.udhaari : [];
  if (!borrowers.length && !udhaari.length) {
    throw new Error("बॅकअपमध्ये रिस्टोर करण्यासाठी कोणताही डेटा नाही.");
  }

  // रिस्टोरपूर्वी सध्याच्या डेटाचा सेफ्टी Snapshot जपून ठेवा (Rollback साठी)
  const current = getState();
  saveLocalSafetySnapshot(current.borrowers, current.udhaari, "pre_restore_safety");

  const paths = getUserPaths(uid);
  const restoredBorrowers = borrowers.length ? await batchWriteCollection(paths.borrowers, borrowers) : 0;
  const restoredUdhaari = udhaari.length ? await batchWriteCollection(paths.udhaari, udhaari) : 0;

  await appendAuditLog(uid, "BACKUP_RESTORED", `${restoredBorrowers} खाती + ${restoredUdhaari} उधारी रिस्टोर`, userEmail);
  return { restoredBorrowers, restoredUdhaari };
}

export async function restoreFromEncryptedText(uid, jsonText, passkey, userEmail = "") {
  const decrypted = await decryptBackupPayload(jsonText, passkey);
  return restoreFromPayload(uid, decrypted, userEmail);
}

export async function saveMonthlyArchive(uid, ym, userEmail = "") {
  const targetYm = ym || getIstCurrentYm();
  const report = getUnifiedMonthReport(targetYm);
  const paths = getUserPaths(uid);
  await paths.monthlyArchives.doc(targetYm).set({
    ym: targetYm,
    archivedAt: new Date().toISOString(),
    summary: report.summary,
    udhaariSummary: {
      count: report.udhaari.rows.length,
      totalGiven: report.udhaari.totalGiven,
      totalReturned: report.udhaari.totalReturned,
      totalRemaining: report.udhaari.totalRemaining
    },
    records: report.rows.map(({ b, ledger }) => ({
      id: b.id,
      name: b.name || "",
      principal: ledger.principal,
      monthlyInterest: ledger.monthlyInterest,
      collectedInMonth: ledger.collectedInMonth,
      pastDue: ledger.pastDue,
      totalPayable: ledger.totalPayable,
      status: ledger.status
    }))
  });
  await appendAuditLog(uid, "MONTHLY_ARCHIVE", `${targetYm} Archive सेव्ह`, userEmail);
}
