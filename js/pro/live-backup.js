// व्याज हिशोब वही - Lock-Safe व Quota-Safe (1MB/5MB Guard) Live Backup पट्टी + Manual बटण + 3 Snapshots (js/pro/live-backup.js - V14.41)
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
    return `${d.getDate()} ${months[d.getMonth()]}, ${hr12}:${min} ${ampm}`;
  }

  function getLastBackupMeta() {
    try { return JSON.parse(localStorage.getItem(LAST_META_KEY) || "null"); } catch (_) { return null; }
  }

  function getSnapshots() {
    try {
      const arr = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }

  // Firestore 1MB आणि localStorage 5MB मर्यादा कधीही ओलांडू नये म्हणून जड तांत्रिक रकाने वगळा
  function buildQuotaSafeBorrowers(borrowers) {
    return borrowers.map((b) => {
      const copy = { ...b };
      delete copy.documents;
      delete copy.versionHistory;
      delete copy.versions;
      return copy;
    });
  }

  function computeDataFingerprint() {
    if (!window.HishobBridge || typeof window.HishobBridge.getBorrowers !== "function") return "";
    const list = window.HishobBridge.getBorrowers() || [];
    if (!list.length) return "";
    let pSum = 0, payCnt = 0, maxUpd = "";
    list.forEach((b) => {
      pSum += Number(b.principal || 0);
      payCnt += Array.isArray(b.paymentHistory) ? b.paymentHistory.length : 0;
      const u = String(b.updatedAt || "");
      if (u > maxUpd) maxUpd = u;
    });
    return `${list.length}|${pSum}|${payCnt}|${maxUpd}`;
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

  function saveLocalSnapshot(lightBorrowers, reason) {
    const now = Date.now();
    const snap = {
      id: "snap_" + now,
      ts: now,
      reason: reason || "Manual",
      count: lightBorrowers.length,
      borrowers: lightBorrowers
    };

    const nextList = [snap, ...getSnapshots()].slice(0, 3);
    try {
      localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(nextList));
    } catch (_) {
      // जागा कमी पडल्यास फक्त सर्वात ताजा १ Snapshot सेव्ह करा (PIN/Settings सुरक्षित ठेवून)
      try { localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify([snap])); } catch (__) {}
    }
    return snap;
  }

  async function performLiveBackup(sourceReason) {
    if (isBackingUp) return;
    if (!window.HishobBridge || typeof window.HishobBridge.getBorrowers !== "function") return;

    const borrowers = window.HishobBridge.getBorrowers() || [];
    if (!borrowers.length) {
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
      saveLocalSnapshot(lightBorrowers, sourceReason || "manual");

      const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;

      if (navigator.onLine && user) {
        try {
          const payloadObj = {
            updatedAt: new Date(now).toISOString(),
            ts: now,
            reason: sourceReason || "manual",
            count: lightBorrowers.length,
            borrowers: lightBorrowers
          };
          // Firestore 1MB Quota Guard (~850 KB पेक्षा लहान असल्यासच एकाच डॉक्युमेंटमध्ये लिहा)
          const estBytes = JSON.stringify(payloadObj).length;
          if (estBytes < 850000) {
            await firebase.firestore().collection("users").doc(user.uid).collection("proBackups").doc("latest").set(payloadObj);
            cloudOk = true;
            localStorage.removeItem(OFFLINE_QUEUE_KEY);
          } else {
            // ५००+ मोठा डेटा असल्यास फक्त सारांश मेटाडेटा सेव्ह करा (एरर टाळण्यासाठी)
            await firebase.firestore().collection("users").doc(user.uid).collection("proBackups").doc("latest").set({
              updatedAt: payloadObj.updatedAt,
              ts: now,
              reason: "summary_only_large_db",
              count: lightBorrowers.length
            }, { merge: true });
            cloudOk = true;
          }
        } catch (cloudErr) {
          console.warn("Cloud Backup Warning:", cloudErr);
        }
      } else {
        localStorage.setItem(OFFLINE_QUEUE_KEY, "1");
      }

      const meta = { ts: now, date: isoDate, count: borrowers.length, cloudOk, reason: sourceReason || "manual" };
      localStorage.setItem(LAST_META_KEY, JSON.stringify(meta));
      localStorage.setItem("vyaj_last_backup_date", isoDate);

      const legacyBadge = document.getElementById("lastBackupBadge");
      if (legacyBadge) legacyBadge.textContent = `शेवटचा Auto-Backup: ${isoDate}`;

      const statusNote = cloudOk
        ? (isManual ? "✅ Cloud + Local बॅकअप पूर्ण!" : "")
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
          <div class="lb-main-txt" id="lbMainText">☁️ शेवटचा बॅकअप: तपासत आहे...</div>
          <div class="lb-sub-txt" id="lbSubText">Auto-Backup स्थिती</div>
        </div>
      </div>
      <div class="lb-actions">
        <button type="button" id="lbManualBackupBtn" class="success">⚡ आता बॅकअप घ्या</button>
        <button type="button" id="lbSnapshotsBtn" class="primary" title="मागील ३ बॅकअप Snapshots">🕒 3</button>
      </div>
    `;
    heroCard.insertAdjacentElement("afterend", bar);

    document.getElementById("lbManualBackupBtn")?.addEventListener("click", () => performLiveBackup("manual"));
    document.getElementById("lbSnapshotsBtn")?.addEventListener("click", openSnapshotsModal);
  }

  function updateBackupBarUi(tempNotice) {
    const dot = document.getElementById("lbHealthDot");
    const mainTxt = document.getElementById("lbMainText");
    const subTxt = document.getElementById("lbSubText");
    if (!dot || !mainTxt || !subTxt) return;

    const meta = getLastBackupMeta();
    const mode = getScheduledMode();
    const pendingOffline = localStorage.getItem(OFFLINE_QUEUE_KEY) === "1";

    let dotClass = "err";
    if (meta && meta.ts) {
      const ageHrs = (Date.now() - Number(meta.ts)) / (1000 * 60 * 60);
      if (ageHrs <= 24) dotClass = "ok";
      else if (ageHrs <= 72) dotClass = "warn";
    }
    dot.className = `lb-dot ${dotClass}`;

    mainTxt.textContent = tempNotice || `☁️ बॅकअप: ${meta ? formatBackupTime(meta.ts) : "अजून घेतलेला नाही"}`;

    const modeLabels = {
      realtime: "⚡ रिअल-टाइम ऑटो-बॅकअप चालू",
      daily: "📅 दररोज ऑटो-बॅकअप",
      weekly: "📅 साप्ताहिक ऑटो-बॅकअप",
      monthly: "📅 मासिक ऑटो-बॅकअप",
      off: "Manual मोड"
    };
    const queueTag = pendingOffline ? " • ⏳ Offline रांगेत" : (meta?.count ? ` • ${meta.count} खाती` : "");
    subTxt.textContent = `${modeLabels[mode] || "Manual मोड"}${queueTag}`;
  }

  function ensureSnapshotsModal() {
    let modal = document.getElementById("proSnapshotsModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "proSnapshotsModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `
      <div class="modal-card" style="max-width:540px;">
        <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
          <h3 style="margin:0; color:var(--accent);">🕒 शेवटचे ३ सेफ्टी बॅकअप (Lock-Safe)</h3>
          <span class="badge paid">Auto-Vault</span>
        </div>
        <p class="muted" style="margin-top:0; font-size:0.78rem;">अ‍ॅप लॉक झाले तरी हे ३ सेफ्टी बॅकअप सुरक्षित राहतात. यातून कोणताही एक परत आणा किंवा .JSON डाउनलोड करा.</p>
        <div id="proSnapshotsList"></div>
        <div id="proSnapStatus" class="muted" style="text-align:center; margin-top:6px;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("proSnapshotsModal");
      }
    });
    return modal;
  }

  function openSnapshotsModal() {
    const modal = ensureSnapshotsModal();
    const listEl = document.getElementById("proSnapshotsList");
    const statusEl = document.getElementById("proSnapStatus");
    if (statusEl) statusEl.textContent = "";

    const snaps = getSnapshots();
    if (!snaps.length) {
      listEl.innerHTML = `<div class="muted" style="text-align:center; padding:16px;">अजून कोणताही Snapshot सेव्ह नाही. आधी '⚡ आता बॅकअप घ्या' दाबा.</div>`;
    } else {
      listEl.innerHTML = snaps.map((s, idx) => `
        <div class="lb-snap-row">
          <div>
            <strong style="font-size:0.86rem;">#${idx + 1} • ${esc(formatBackupTime(s.ts))}</strong>
            <div class="muted" style="font-size:0.74rem;">एकूण खाती: ${esc(s.count)} • प्रकार: ${esc(s.reason || "Backup")}</div>
          </div>
          <div class="row" style="gap:5px;">
            <button type="button" class="primary sm" data-snap-dl="${idx}" title="JSON डाउनलोड">📥</button>
            <button type="button" class="warn sm" data-snap-restore="${idx}">♻️ Restore</button>
          </div>
        </div>
      `).join("");

      listEl.querySelectorAll("[data-snap-dl]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const snap = snaps[Number(btn.getAttribute("data-snap-dl"))];
          if (!snap) return;
          const blob = new Blob([JSON.stringify({ exportedAt: new Date(snap.ts).toISOString(), borrowers: snap.borrowers }, null, 2)], { type: "application/json" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `Vyaj_Snapshot_${new Date(snap.ts).toISOString().slice(0, 10)}.json`;
          a.click();
        });
      });

      listEl.querySelectorAll("[data-snap-restore]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const snap = snaps[Number(btn.getAttribute("data-snap-restore"))];
          if (!snap || !Array.isArray(snap.borrowers)) return;
          if (!confirm(`${formatBackupTime(snap.ts)} चा बॅकअप (${snap.count} खाती) अ‍ॅपमध्ये Restore करायचा का?`)) return;

          const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
          if (!user) { alert("कृपया आधी लॉगिन करा."); return; }

          if (statusEl) statusEl.textContent = "⏳ Snapshot Restore होत आहे...";
          try {
            const db = firebase.firestore();
            const colRef = db.collection("users").doc(user.uid).collection("borrowers");
            for (let i = 0; i < snap.borrowers.length; i += 25) {
              const batch = db.batch();
              snap.borrowers.slice(i, i + 25).forEach((b) => {
                const docId = b.id || colRef.doc().id;
                const payload = { ...b };
                delete payload.id;
                batch.set(colRef.doc(docId), payload, { merge: true });
              });
              await batch.commit();
            }
            if (statusEl) statusEl.textContent = "✅ Snapshot यशस्वीरित्या Restore झाला!";
          } catch (err) {
            if (statusEl) statusEl.textContent = "❌ Restore एरर: " + err.message;
          }
        });
      });
    }
    modal.classList.remove("hidden");
  }

  function upgradeScheduledBackupSelect() {
    const sel = document.getElementById("scheduledBackupSelect");
    if (!sel) return;
    if (!sel.querySelector('option[value="realtime"]')) {
      const opt = document.createElement("option");
      opt.value = "realtime";
      opt.textContent = "⚡ रिअल-टाइम (बदल होताच ऑटो-बॅकअप)";
      sel.insertBefore(opt, sel.children[1] || null);
    }

    const saved = localStorage.getItem(SCHED_MODE_KEY);
    if (saved && sel.querySelector(`option[value="${saved}"]`)) sel.value = saved;

    if (!sel.dataset.lbBound) {
      sel.dataset.lbBound = "1";
      sel.addEventListener("change", () => {
        localStorage.setItem(SCHED_MODE_KEY, sel.value);
        updateBackupBarUi();
        if (sel.value === "realtime") setTimeout(() => performLiveBackup("realtime_init"), 800);
      });
    }
  }

  function getScheduledMode() {
    return localStorage.getItem(SCHED_MODE_KEY) || document.getElementById("scheduledBackupSelect")?.value || "off";
  }

  function checkScheduledBackupDue() {
    const mode = getScheduledMode();
    if (mode === "off" || mode === "realtime") return;
    const meta = getLastBackupMeta();
    const ageHrs = meta && meta.ts ? (Date.now() - Number(meta.ts)) / (1000 * 60 * 60) : 9999;
    const limit = mode === "daily" ? 23 : mode === "weekly" ? 168 : 720;
    if (ageHrs >= limit) performLiveBackup("scheduled_" + mode);
  }

  function watchBorrowerDataChanges() {
    const listEl = document.getElementById("borrowersList");
    if (!listEl) return;

    const checkChange = () => {
      const fp = computeDataFingerprint();
      if (!fp) return;
      if (!fingerprintInitialized) {
        lastDataFingerprint = fp;
        fingerprintInitialized = true;
        checkScheduledBackupDue();
        return;
      }
      if (fp !== lastDataFingerprint) {
        lastDataFingerprint = fp;
        if (getScheduledMode() === "realtime") {
          clearTimeout(realtimeTimer);
          realtimeTimer = setTimeout(() => performLiveBackup("realtime"), 6000);
        }
      }
    };

    const obs = new MutationObserver(() => {
      clearTimeout(observerTimer);
      observerTimer = setTimeout(checkChange, 1500);
    });
    obs.observe(listEl, { childList: true });
    setTimeout(checkChange, 2500);
  }

  window.addEventListener("online", () => {
    if (localStorage.getItem(OFFLINE_QUEUE_KEY) === "1") {
      setTimeout(() => performLiveBackup("online_sync"), 2000);
    }
  });

  function initLiveBackup() {
    injectLiveBackupCss();
    ensureBackupStatusBar();
    upgradeScheduledBackupSelect();
    updateBackupBarUi();
    watchBorrowerDataChanges();
    setTimeout(() => {
      ensureBackupStatusBar();
      upgradeScheduledBackupSelect();
      updateBackupBarUi();
    }, 1500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initLiveBackup);
  else initLiveBackup();
})();
