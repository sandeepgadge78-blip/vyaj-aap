// व्याज हिशोब वही - Lock-Safe व Quota-Safe (1MB/5MB Guard) Live Backup (व्याज + उधारी दोन्हीचा बॅकअप व Restore) (js/pro/live-backup.js - V14.42)
(function () {
  const SNAPSHOTS_KEY = "vyaj_aap_auto_snapshot_backups_v2";
  const LAST_META_KEY = "vyaj_aap_settings_live_backup_meta_v2";
  const SCHED_MODE_KEY = "vyaj_aap_settings_sched_backup_mode_v2";
  const OFFLINE_QUEUE_KEY = "vyaj_aap_settings_pending_cloud_backup_v2";

  let lastDataFingerprint = "";
  let fingerprintInitialized = false;
  let realtimeTimer = null;
  let observerTimer = null;
  let isBackingUp = false;

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function formatBackupTime(ts) {
    if (!ts) return "अजून घेतलेला नाही";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const hr24 = d.getHours();
    const ampm = hr24 >= 12 ? "PM" : "AM";
    const hr12 = hr24 % 12 || 12;
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${d.getDate()}${months[d.getMonth()]}, ${hr12}:${min} ${ampm}`; }  function getLastBackupMeta() { try { return JSON.parse(localStorage.getItem(LAST_META_KEY) \vert{}\vert{} "null"); } catch (_) { return null; } }  function getSnapshots() { try { const arr = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) \vert{}\vert{} "[]"); return Array.isArray(arr) ? arr : []; } catch (_) { return []; } }  function getCurrentUdhaariList() { if (typeof window.getProUdhaariList === "function") { const list = window.getProUdhaariList(); return Array.isArray(list) ? list : []; } return []; }  // Firestore 1MB आणि localStorage 5MB मर्यादा कधीही ओलांडू नये म्हणून जड तांत्रिक रकाने वगळा function buildQuotaSafeBorrowers(borrowers) { return borrowers.map((b) => { const copy = { ...b }; delete copy.documents; delete copy.versionHistory; delete copy.versions; return copy; }); }  function computeDataFingerprint() { if (!window.HishobBridge \vert{}\vert{} typeof window.HishobBridge.getBorrowers !== "function") return ""; const list = window.HishobBridge.getBorrowers() \vert{}\vert{} []; const udList = getCurrentUdhaariList(); if (!list.length && !udList.length) return ""; let pSum = 0, payCnt = 0, maxUpd = ""; list.forEach((b) => { pSum += Number(b.principal \vert{}\vert{} 0); payCnt += Array.isArray(b.paymentHistory) ? b.paymentHistory.length : 0; const u = String(b.updatedAt \vert{}\vert{} ""); if (u > maxUpd) maxUpd = u; }); return `${list.length}|${pSum}\vert{}${payCnt}|${maxUpd}\vert{}ud:${udList.length}`;
  }

  function injectLiveBackupCss() {
    if (document.getElementById("vyajLiveBackupCss")) return;
    const st = document.createElement("style");
    st.id = "vyajLiveBackupCss";
    st.textContent = `
      .lb-bar {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        padding: 8px 11px; margin-bottom: 11px; border-radius: 14px;
        background: var(--card); border: 1px solid var(--border);
        box-shadow: var(--glass-shadow); flex-wrap: wrap;
      }
      .lb-left { display: flex; align-items: center; gap: 7px; min-width: 0; flex: 1; }
      .lb-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
      .lb-dot.ok { background: #4ade80; box-shadow: 0 0 8px rgba(74, 222, 128, 0.7); }
      .lb-dot.warn { background: #e5a952; box-shadow: 0 0 8px rgba(229, 169, 82, 0.7); }
      .lb-dot.err { background: #f07178; box-shadow: 0 0 8px rgba(240, 113, 120, 0.7); }
      .lb-txt-col { display: flex; flex-direction: column; min-width: 0; }
      .lb-main-txt { font-size: 0.75rem; font-weight: 800; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .lb-sub-txt { font-size: 0.66rem; color: var(--muted); }
      .lb-actions { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
      .lb-actions button { padding: 5px 9px !important; font-size: 0.71rem !important; border-radius: 999px !important; }
      .lb-snap-row {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        padding: 10px; border-radius: 12px; background: var(--meta-bg); border: 1px solid var(--border); margin-bottom: 8px;
      }
    `;
    document.head.appendChild(st);
  }

  function saveLocalSnapshot(lightBorrowers, udhaariItems, reason) {
    const now = Date.now();
    const snap = {
      id: "snap_" + now,
      ts: now,
      reason: reason || "Manual",
      count: lightBorrowers.length,
      udhaariCount: udhaariItems.length,
      borrowers: lightBorrowers,
      udhaari: udhaariItems
    };

    const nextList = [snap, ...getSnapshots()].slice(0, 3);
    try {
      localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(nextList));
    } catch (_) {
      try { localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify([snap])); } catch (__) {}
    }
    return snap;
  }

  async function performLiveBackup(sourceReason) {
    if (isBackingUp) return;
    if (!window.HishobBridge || typeof window.HishobBridge.getBorrowers !== "function") return;

    const borrowers = window.HishobBridge.getBorrowers() || [];
    const udhaariItems = getCurrentUdhaariList();
    if (!borrowers.length && !udhaariItems.length) {
      updateBackupBarUi("⚠️ बॅकअपसाठी डेटा लोड होण्याची वाट पहा.");
      return;
    }

    isBackingUp = true;
    const isManual = sourceReason === "manual";
    if (isManual) updateBackupBarUi("⏳ बॅकअप घेत आहे...");

    const now = Date.now();
    const isoDate = new Date(now).toISOString().slice(0, 10);
    let cloudOk = false;

    try {
      const lightBorrowers = buildQuotaSafeBorrowers(borrowers);
      saveLocalSnapshot(lightBorrowers, udhaariItems, sourceReason || "manual");

      const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;

      if (navigator.onLine && user) {
        try {
          const payloadObj = {
            updatedAt: new Date(now).toISOString(),
            ts: now,
            reason: sourceReason || "manual",
            count: lightBorrowers.length,
            udhaariCount: udhaariItems.length,
            borrowers: lightBorrowers,
            udhaari: udhaariItems
          };
          const estBytes = JSON.stringify(payloadObj).length;
          if (estBytes < 850000) {
            await firebase.firestore().collection("users").doc(user.uid).collection("proBackups").doc("latest").set(payloadObj);
            cloudOk = true;
            localStorage.removeItem(OFFLINE_QUEUE_KEY);
          } else {
            await firebase.firestore().collection("users").doc(user.uid).collection("proBackups").doc("latest").set({
              updatedAt: payloadObj.updatedAt,
              ts: now,
              reason: "summary_only_large_db",
              count: lightBorrowers.length,
              udhaariCount: udhaariItems.length
            }, { merge: true });
            cloudOk = true;
          }
        } catch (cloudErr) {
          console.warn("Cloud Backup Warning:", cloudErr);
        }
      } else {
        localStorage.setItem(OFFLINE_QUEUE_KEY, "1");
      }

      const meta = {
        ts: now,
        date: isoDate,
        count: borrowers.length,
        udhaariCount: udhaariItems.length,
        cloudOk,
        reason: sourceReason || "manual"
      };
      localStorage.setItem(LAST_META_KEY, JSON.stringify(meta));
      localStorage.setItem("vyaj_last_backup_date", isoDate);

      const legacyBadge = document.getElementById("lastBackupBadge");
      if (legacyBadge) legacyBadge.textContent = `शेवटचा Auto-Backup: ${isoDate}`;

      const statusNote = cloudOk
        ? (isManual ? "✅ Cloud + Local (व्याज + उधारी) बॅकअप पूर्ण!" : "")
        : (navigator.onLine ? "✅ Local Snapshot सेव्ह!" : "📶 Offline: Local सेव्ह (नेट येताच Cloud सिंक)");
      updateBackupBarUi(statusNote);
    } finally {
      isBackingUp = false;
    }
  }

  window.triggerVyajLiveBackup = performLiveBackup;

  function ensureBackupStatusBar() {
    const appScreen = document.getElementById("appScreen");
    const heroCard = appScreen?.querySelector(".month-hero-card");
    if (!appScreen || !heroCard || document.getElementById("vyajLiveBackupBar")) return;

    const bar = document.createElement("section");
    bar.id = "vyajLiveBackupBar";
    bar.className = "lb-bar";
    bar.innerHTML = `
      <div class="lb-left">
        <span id="lbHealthDot" class="lb-dot warn" title="Backup स्थिती"></span>
        <div class="lb-txt-col">
          <div class="lb-main-txt" id="
