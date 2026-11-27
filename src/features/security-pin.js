// व्याज Infinity X - ४-अंकी SHA-256 PIN लॉक, Auto-Lock, प्रोफाईल, Settings, Backup Vault, Recycle Bin व Audit Log (src/features/security-pin.js)

import { auth } from "../core/firebase.js";
import { getState, updateUi } from "../core/store.js";
import { getFeatureState, setFeatureOverride } from "../core/feature-flags.js";
import { saveBusinessProfile, saveAppSettings } from "../data/cashbook-repo.js";
import {
  performLiveBackup, getLocalSnapshots, exportEncryptedBackupFile,
  restoreFromEncryptedText, restoreFromPayload, saveEmergencyLocalVault, saveMonthlyArchive
} from "../data/backup-vault.js";
import { restoreBorrower, permanentDeleteBorrower } from "../data/borrowers-repo.js";
import { esc, fmtDateShort, openModal, closeModal, showToast } from "../ui/dom-utils.js";

const PIN_HASH_KEY = "vyaj_aap_pin_hash_v1";
const PIN_ENABLED_KEY = "vyaj_aap_pin_enabled_v1";
const SESSION_UNLOCKED_KEY = "vyaj_aap_pin_unlocked_session";

let inactivityTimer = null;

// =========================================================================
// १. ४-अंकी SHA-256 PIN लॉक व Auto-Lock इंजिन
// =========================================================================
async function hashPin(pin) {
  const data = new TextEncoder().encode("vyaj_salt_v14_" + pin);
  if (window.crypto && window.crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return btoa("vyaj_salt_v14_" + pin);
}

export function isPinEnabled() {
  return localStorage.getItem(PIN_ENABLED_KEY) === "true" && Boolean(localStorage.getItem(PIN_HASH_KEY));
}

export function isUnlockedInSession() {
  return sessionStorage.getItem(SESSION_UNLOCKED_KEY) === "true";
}

export function markSessionUnlocked() {
  sessionStorage.setItem(SESSION_UNLOCKED_KEY, "true");
}

// PIN लॉक किंवा लॉगआउट पडताळणी स्क्रीन
export function showPinOverlay({ mode = "unlock", onVerified } = {}) {
  if (!isPinEnabled()) { onVerified?.(); return; }
  if (document.getElementById("vyajPinOverlay")) return;

  if (mode === "unlock") sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
  let entered = "";

  const overlay = document.createElement("div");
  overlay.id = "vyajPinOverlay";
  overlay.style.cssText = "position:fixed; inset:0; z-index:9990; background:radial-gradient(circle at 50% 25%, #161c2e 0%, #06080d 80%); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; color:#f8fafc;";
  overlay.innerHTML = `
    <div style="font-size:2.2rem; margin-bottom:6px;">🔐</div>
    <h2 style="margin:0 0 6px; font-size:1.2rem;">${mode === "confirm" ? "लॉगआउटसाठी PIN पडताळणी" : "व्याज हिशोब वही लॉक"}</h2>
    <div id="pinMsgTxt" style="font-size:0.8rem; color:#98a1b0; margin-bottom:14px;">४-अंकी सुरक्षा PIN टाका</div>
    <div id="pinDots" style="display:flex; gap:12px; margin-bottom:18px;">
      ${[0, 1, 2, 3].map(() => `<span class="pdot" style="width:14px; height:14px; border-radius:50%; border:2px solid #7dd3fc;"></span>`).join("")}
    </div>
    <div style="display:grid; grid-template-columns:repeat(3, 68px); gap:10px;">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0, "⌫"].map((k) => `<button type="button" data-pk="${k}" style="height:54px; font-size:1.1rem; border-radius:14px; background:#1c2230; color:#fff; border:1px solid rgba(255,255,255,0.16);">${k}</button>`).join("")}
    </div>
    ${mode === "confirm" ? `<button type="button" id="pinCancelBtn" class="sm" style="margin-top:16px;">रद्द करा</button>` : ""}
  `;
  document.body.appendChild(overlay);

  const updateDots = () => {
    overlay.querySelectorAll(".pdot").forEach((d, i) => { d.style.background = i < entered.length ? "#7dd3fc" : "transparent"; });
  };

  overlay.querySelector("#pinCancelBtn")?.addEventListener("click", () => overlay.remove());

  overlay.querySelectorAll("[data-pk]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const v = btn.getAttribute("data-pk");
      const msg = overlay.querySelector("#pinMsgTxt");
      if (v === "C") { entered = ""; updateDots(); return; }
      if (v === "⌫") { entered = entered.slice(0, -1); updateDots(); return; }
      if (entered.length < 4) { entered += v; updateDots(); }
      if (entered.length === 4) {
        const saved = localStorage.getItem(PIN_HASH_KEY);
        if ((await hashPin(entered)) === saved) {
          markSessionUnlocked();
          overlay.remove();
          onVerified?.();
        } else {
          msg.textContent = "❌ चुकीचा PIN! पुन्हा प्रयत्न करा.";
          msg.style.color = "#f07178";
          entered = "";
          setTimeout(() => { updateDots(); msg.textContent = "४-अंकी सुरक्षा PIN टाका"; msg.style.color = "#98a1b0"; }, 850);
        }
      }
    });
  });
}

export function resetAutoLockTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  const ms = Number(getState().settings?.autoLockMs || 300000);
  if (ms < 60000 || !getState().user) return;
  inactivityTimer = setTimeout(() => {
    if (isPinEnabled()) showPinOverlay({ mode: "unlock" });
  }, ms);
}

export function initSecurityWatcher() {
  ["click", "touchstart", "keydown", "scroll"].forEach((evt) => {
    window.addEventListener(evt, resetAutoLockTimer, { passive: true });
  });
}

export async function secureSignOut() {
  const doLogout = async () => {
    sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
    try { await auth.signOut(); } catch (_) {}
    showToast("🔒 सुरक्षित लॉगआउट झाले.", "ok");
  };

  if (isPinEnabled()) {
    showPinOverlay({ mode: "confirm", onVerified: doLogout });
  } else if (confirm("तुम्हाला अ‍ॅपमधून लॉगआउट करायचे आहे का?")) {
    await doLogout();
  }
}

// =========================================================================
// २. बिझनेस प्रोफाईल (Auto-Branding व UPI ID) Modal
// =========================================================================
export function openProfileModal() {
  const p = getState().profile || {};
  openModal("profileModal", `
    <div class="modal-head">
      <h3>👤 बिझनेस प्रोफाईल (Auto-Branding)</h3>
      <button type="button" class="sm" id="prCloseBtn">✕ बंद</button>
    </div>
    <p class="muted" style="margin-top:0;">इथे सेव्ह केलेले नाव, नंबर व UPI ID तुमच्या PDF अहवाल, पावती व वचनचिट्ठीवर आपोआप छापून येईल.</p>
    <div style="display:flex; flex-direction:column; gap:8px;">
      <div class="field"><label>व्यवसायाचे / फर्मचे नाव</label><input type="text" id="prBiz" value="${esc(p.bizName || "")}" placeholder="उदा. श्री गणेश फायनान्स" /></div>
      <div class="field"><label>तुमचे पूर्ण नाव</label><input type="text" id="prOwner" value="${esc(p.ownerName || "")}" /></div>
      <div class="field"><label>मोबाईल नंबर</label><input type="tel" id="prMob" value="${esc(p.mobile || "")}" /></div>
      <div class="field"><label>तुमचा UPI ID (QR साठी)</label><input type="text" id="prUpi" value="${esc(p.upiId || "")}" placeholder="name@okaxis" /></div>
      <div class="field"><label>स्वतःचा WhatsApp नंबर (91XXXXXXXXXX)</label><input type="tel" id="prWa" value="${esc(p.selfWaNumber || "")}" /></div>
      <button type="button" class="success" id="prSaveBtn">✅ प्रोफाईल सेव्ह करा</button>
    </div>
  `, {
    maxWidth: "490px",
    onAfterRender: (card) => {
      card.querySelector("#prCloseBtn")?.addEventListener("click", () => closeModal("profileModal"));
      card.querySelector("#prSaveBtn")?.addEventListener("click", async () => {
        try {
          await saveBusinessProfile(getState().user?.uid, {
            bizName: card.querySelector("#prBiz").value.trim(),
            ownerName: card.querySelector("#prOwner").value.trim(),
            mobile: card.querySelector("#prMob").value.trim(),
            upiId: card.querySelector("#prUpi").value.trim(),
            selfWaNumber: card.querySelector("#prWa").value.trim()
          });
          closeModal("profileModal");
          showToast("✅ बिझनेस प्रोफाईल सेव्ह झाले!", "ok");
        } catch (err) {
          showToast("❌ " + err.message, "err");
        }
      });
    }
  });
}

// =========================================================================
// ३. Settings, PIN सेटअप, Theme, Privacy व Safe Cache Clean Modal
// =========================================================================
export function openSettingsModal() {
  const renderInner = () => {
    const st = getState();
    const s = st.settings || {};
    const pinOn = isPinEnabled();
    const flags = getFeatureState().features;

    openModal("settingsModal", `
      <div class="modal-head">
        <h3>⚙️ अ‍ॅप सेटिंग्ज व सुरक्षा</h3>
        <button type="button" class="sm" id="stCloseBtn">✕ बंद</button>
      </div>

      <div class="meta-box" style="margin-bottom:9px;">
        <div class="grid-2" style="gap:7px;">
          <div class="field">
            <label>⏱️ Auto-Lock टाईमर</label>
            <select id="stLockMs">
              <option value="120000" ${s.autoLockMs === 120000 ? "selected" : ""}>२ मिनिटे</option>
              <option value="300000" ${s.autoLockMs === 300000 ? "selected" : ""}>५ मिनिटे</option>
              <option value="600000" ${s.autoLockMs === 600000 ? "selected" : ""}>१० मिनिटे</option>
              <option value="900000" ${s.autoLockMs === 900000 ? "selected" : ""}>१५ मिनिटे</option>
            </select>
          </div>
          <div class="field">
            <label>📊 Default मासिक दर (%)</label>
            <input type="number" step="0.1" id="stDefRate" value="${esc(s.defaultRate ?? 2)}" />
          </div>
        </div>
        <button type="button" class="primary sm" style="width:100%; margin-top:8px;" id="stSaveBtn">💾 सेटिंग्ज सेव्ह करा</button>
      </div>

      <div class="meta-box" style="margin-bottom:9px;">
        <div class="row-between" style="margin-bottom:6px;">
          <strong>🔐 ४-अंकी अ‍ॅप PIN लॉक</strong>
          <span class="badge ${pinOn ? "paid" : ""}">${pinOn ? "चालू (ON)" : "बंद (OFF)"}</span>
        </div>
        <div class="row" style="gap:6px;">
          <input type="password" inputmode="numeric" maxlength="4" id="stPinInp" placeholder="नवीन ४-अंकी PIN" style="flex:1;" />
          <button type="button" class="success sm" id="stPinSaveBtn">सेव्ह</button>
          ${pinOn ? `<button type="button" class="warn sm" id="stPinLockNowBtn">🔒 लॉक</button><button type="button" class="danger sm" id="stPinOffBtn">बंद</button>` : ""}
        </div>
      </div>

      <div class="meta-box" style="margin-bottom:9px;">
        <strong style="font-size:0.78rem; display:block; margin-bottom:6px;">🎛️ Adaptive Feature Flags (गरजेनुसार ON/OFF)</strong>
        <div class="grid-2" style="gap:5px; font-size:0.75rem;">
          ${[
            ["bankingV16Controls", "🏦 बँकिंग V16 कंट्रोल्स"],
            ["systemGuardian", "🛡️ System Guardian"],
            ["timeMachine", "⏳ Time Machine"],
            ["cashbook", "📒 रोजचा कॅशबुक"]
          ].map(([k, lbl]) => `
            <label class="row-between" style="background:var(--card); padding:6px 8px; border-radius:8px; border:1px solid var(--border);">
              <span>${lbl}</span>
              <input type="checkbox" data-flag-key="${k}" ${flags[k] ? "checked" : ""} />
            </label>
          `).join("")}
        </div>
      </div>

      <div class="row" style="gap:6px; margin-bottom:8px;">
        <button type="button" class="sm" style="flex:1;" id="stThemeBtn">${st.ui.theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}</button>
        <button type="button" class="sm" style="flex:1;" id="stHideBtn">${st.ui.hideAmounts ? "👁️ रकमा दाखवा" : "🙈 रकमा लपवा"}</button>
      </div>
      <div class="row" style="gap:6px;">
        <button type="button" class="primary sm" style="flex:1;" id="stCacheBtn">🧹 Safe Cache Clean</button>
        <button type="button" class="warn sm" style="flex:1;" id="stResetPassBtn">🔑 Password Reset</button>
      </div>
    `, {
      maxWidth: "520px",
      onAfterRender: (card) => {
        card.querySelector("#stCloseBtn")?.addEventListener("click", () => closeModal("settingsModal"));
        card.querySelector("#stSaveBtn")?.addEventListener("click", async () => {
          await saveAppSettings(getState().user?.uid, {
            autoLockMs: card.querySelector("#stLockMs").value,
            defaultRate: card.querySelector("#stDefRate").value
          });
          resetAutoLockTimer();
          showToast("✅ सेटिंग्ज सेव्ह झाल्या!", "ok");
        });
        card.querySelector("#stPinSaveBtn")?.addEventListener("click", async () => {
          const val = (card.querySelector("#stPinInp")?.value || "").trim();
          if (!/^\d{4}$/.test(val)) { showToast("फक्त ४ अंकी (0-9) PIN टाका.", "err"); return; }
          localStorage.setItem(PIN_HASH_KEY, await hashPin(val));
          localStorage.setItem(PIN_ENABLED_KEY, "true");
          markSessionUnlocked();
          showToast("✅ ४-अंकी PIN सेट झाला!", "ok");
          renderInner();
        });
        card.querySelector("#stPinLockNowBtn")?.addEventListener("click", () => { closeModal("settingsModal"); showPinOverlay({ mode: "unlock" }); });
        card.querySelector("#stPinOffBtn")?.addEventListener("click", () => {
          if (!confirm("PIN लॉक बंद करायचा का?")) return;
          localStorage.removeItem(PIN_HASH_KEY);
          localStorage.setItem(PIN_ENABLED_KEY, "false");
          showToast("PIN लॉक बंद केला.", "ok");
          renderInner();
        });
        card.querySelectorAll("[data-flag-key]").forEach((chk) => {
          chk.addEventListener("change", () => {
            setFeatureOverride(chk.getAttribute("data-flag-key"), chk.checked);
            showToast("✅ Feature Flag अपडेट झाले!", "ok");
          });
        });
        card.querySelector("#stThemeBtn")?.addEventListener("click", () => {
          const nextTheme = getState().ui.theme === "light" ? "dark" : "light";
          localStorage.setItem("vyaj_theme", nextTheme);
          document.body.classList.toggle("light-mode", nextTheme === "light");
          updateUi({ theme: nextTheme });
          renderInner();
        });
        card.querySelector("#stHideBtn")?.addEventListener("click", () => {
          updateUi({ hideAmounts: !getState().ui.hideAmounts });
          renderInner();
        });
        card.querySelector("#stCacheBtn")?.addEventListener("click", async () => {
          if (!confirm("तात्पुरता कॅश साफ करून अ‍ॅप रीलोड करायचे का? (तुमचा Firebase डेटा १००% सुरक्षित राहील.)")) return;
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          window.location.reload();
        });
        card.querySelector("#stResetPassBtn")?.addEventListener("click", async () => {
          const email = getState().user?.email;
          if (!email) return;
          try { await auth.sendPasswordResetEmail(email); showToast(`✅ ${email} वर लिंक पाठवली!`, "ok"); }
          catch (err) { showToast("❌ " + err.message, "err"); }
        });
      }
    });
  };
  renderInner();
}

// =========================================================================
// ४. Encrypted Backup, Local 3-Snapshot Vault व Restore Modal
// =========================================================================
export function openBackupVaultModal() {
  const renderInner = () => {
    const st = getState();
    const snaps = getLocalSnapshots();
    const snapRows = snaps.length
      ? snaps.map((s, idx) => `
          <div class="meta-box row-between" style="margin-bottom:6px;">
            <div>
              <strong>#${idx + 1} • ${new Date(s.ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</strong>
              <div class="muted" style="font-size:0.7rem;">खाती: ${s.count} • उधारी: ${s.udhaariCount || 0} (${esc(s.reason)})</div>
            </div>
            <div class="row" style="gap:4px;">
              <button type="button" class="primary xs" data-sn-dl="${idx}">📥</button>
              <button type="button" class="warn xs" data-sn-res="${idx}">♻️ Restore</button>
            </div>
          </div>
        `).join("")
      : `<div class="muted" style="text-align:center; padding:12px;">अजून कोणताही Snapshot नाही.</div>`;

    openModal("backupVaultModal", `
      <div class="modal-head">
        <h3>☁️ Backup Vault व Encrypted Restore</h3>
        <button type="button" class="sm" id="bvCloseBtn">✕ बंद</button>
      </div>

      <div class="row" style="gap:6px; margin-bottom:10px;">
        <button type="button" class="success sm" style="flex:1;" id="bvLiveBtn">⚡ Cloud + Local बॅकअप घ्या</button>
        <button type="button" class="primary sm" style="flex:1;" id="bvArchBtn">📦 महिना Archive सेव्ह</button>
      </div>

      <div class="meta-box" style="margin-bottom:10px;">
        <strong style="font-size:0.78rem; display:block; margin-bottom:6px;">🔐 AES-256-GCM + SHA-256 Encrypted Backup</strong>
        <input type="password" id="bvPass" placeholder="Passkey (किमान ६ अक्षरे)" style="width:100%; margin-bottom:7px;" />
        <div class="row" style="gap:6px; margin-bottom:7px;">
          <button type="button" class="success xs" style="flex:1;" id="bvExpEncBtn">🔐 Encrypted डाउनलोड</button>
          <button type="button" class="warn xs" style="flex:1;" id="bvVaultSaveBtn">🛡️ Local Vault</button>
        </div>
        <div class="row" style="gap:6px;">
          <input type="file" id="bvFileInp" accept=".json,.txt" style="flex:1; font-size:0.72rem;" />
          <button type="button" class="primary xs" id="bvImpEncBtn">🔓 Restore</button>
        </div>
        <div id="bvShaOut" class="muted" style="font-size:0.68rem; margin-top:6px; word-break:break-all;"></div>
      </div>

      <strong style="font-size:0.78rem; display:block; margin-bottom:6px;">🕒 शेवटचे ३ सेफ्टी Snapshots (व्याज + उधारी)</strong>
      ${snapRows}
    `, {
      onAfterRender: (card) => {
        card.querySelector("#bvCloseBtn")?.addEventListener("click", () => closeModal("backupVaultModal"));
        card.querySelector("#bvLiveBtn")?.addEventListener("click", async () => {
          const res = await performLiveBackup(st.user?.uid, { reason: "manual", userEmail: st.user?.email });
          showToast(res.ok ? (res.cloudOk ? "✅ Cloud + Local बॅकअप पूर्ण!" : "✅ Local Snapshot सेव्ह!") : res.message, res.ok ? "ok" : "err");
          renderInner();
        });
        card.querySelector("#bvArchBtn")?.addEventListener("click", async () => {
          if (!st.user) return;
          await saveMonthlyArchive(st.user.uid, st.activeYm, st.user.email);
          showToast(`📦 ${st.activeYm} Archive सेव्ह झाले!`, "ok");
        });
        card.querySelector("#bvExpEncBtn")?.addEventListener("click", async () => {
          try {
            const r = await exportEncryptedBackupFile(card.querySelector("#bvPass").value);
            card.querySelector("#bvShaOut").textContent = `SHA-256: ${r.sha256}`;
            showToast("🔐 Encrypted बॅकअप डाउनलोड झाला!", "ok");
          } catch (err) { showToast("❌ " + err.message, "err"); }
        });
        card.querySelector("#bvVaultSaveBtn")?.addEventListener("click", async () => {
          try {
            await saveEmergencyLocalVault(card.querySelector("#bvPass").value);
            showToast("🛡️ Emergency Local Vault सेव्ह झाले!", "ok");
          } catch (err) { showToast("❌ " + err.message, "err"); }
        });
        card.querySelector("#bvImpEncBtn")?.addEventListener("click", async () => {
          const file = card.querySelector("#bvFileInp").files?.[0];
          const pass = card.querySelector("#bvPass").value;
          if (!file || !st.user) { showToast("कृपया फाईल व Passkey द्या.", "err"); return; }
          if (!confirm("Encrypted Backup रिस्टोर करायचा का? आधी सेफ्टी Snapshot जतन केला जाईल.")) return;
          try {
            const res = await restoreFromEncryptedText(st.user.uid, await file.text(), pass, st.user.email);
            showToast(`✅ ${res.restoredBorrowers} खाती + ${res.restoredUdhaari} उधारी रिस्टोर!`, "ok");
          } catch (err) { showToast("❌ " + err.message, "err"); }
        });
        card.querySelectorAll("[data-sn-dl]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const snap = snaps[Number(btn.getAttribute("data-sn-dl"))];
            if (!snap) return;
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" }));
            a.download = `vyaj-snapshot-${new Date(snap.ts).toISOString().slice(0, 10)}.json`;
            a.click();
          });
        });
        card.querySelectorAll("[data-sn-res]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const snap = snaps[Number(btn.getAttribute("data-sn-res"))];
            if (!snap || !st.user || !confirm(`हा Snapshot (${snap.count} खाती) Restore करायचा का?`)) return;
            try {
              const r = await restoreFromPayload(st.user.uid, snap, st.user.email);
              showToast(`♻️ ${r.restoredBorrowers} खाती Restore झाली!`, "ok");
            } catch (err) { showToast("❌ " + err.message, "err"); }
          });
        });
      }
    });
  };
  renderInner();
}

// =========================================================================
// ५. Recycle Bin व Audit Log Modal
// =========================================================================
export function openRecycleAndAuditModal(initialTab = "recycle") {
  let tab = initialTab;
  const renderInner = () => {
    const st = getState();
    const deleted = (st.borrowers || []).filter((b) => b && b.isDeleted);
    const logs = st.auditLogs || [];

    const content = tab === "recycle"
      ? (deleted.length
          ? deleted.map((b) => `
              <div class="meta-box row-between" style="margin-bottom:6px;">
                <div><strong>${esc(b.name)}</strong><div class="muted" style="font-size:0.7rem;">मुद्दल: ₹${Number(b.principal || 0).toLocaleString("en-IN")}</div></div>
                <div class="row" style="gap:5px;">
                  <button type="button" class="success xs" data-rb-res="${esc(b.id)}">♻️ Restore</button>
                  <button type="button" class="danger xs" data-rb-del="${esc(b.id)}">❌ Delete</button>
                </div>
              </div>
            `).join("")
          : `<div class="muted" style="text-align:center; padding:18px;">Recycle Bin रिकामा आहे.</div>`)
      : (logs.length
          ? logs.map((l) => `<div style="padding:5px 0; border-bottom:1px dashed var(--border); font-size:0.74rem;"><span class="muted">[${esc(fmtDateShort(l.ts))} ${esc(String(l.ts || "").slice(11, 16))}]</span> <strong>${esc(l.action)}</strong> — ${esc(l.details)}</div>`).join("")
          : `<div class="muted" style="text-align:center; padding:18px;">कोणत्याही नोंदी नाहीत.</div>`);

    openModal("recycleAuditModal", `
      <div class="modal-head">
        <h3>${tab === "recycle" ? "🗑️ Recycle Bin" : "📜 Audit Log"}</h3>
        <button type="button" class="sm" id="raCloseBtn">✕ बंद</button>
      </div>
      <div class="tab-row-2">
        <button type="button" class="seg-btn ${tab === "recycle" ? "is-active" : ""}" data-ratab="recycle">🗑️ Recycle Bin (${deleted.length})</button>
        <button type="button" class="seg-btn ${tab === "audit" ? "is-active" : ""}" data-ratab="audit">📜 Audit Log (${logs.length})</button>
      </div>
      <div style="max-height:54vh; overflow-y:auto;">${content}</div>
    `, {
      onAfterRender: (card) => {
        card.querySelector("#raCloseBtn")?.addEventListener("click", () => closeModal("recycleAuditModal"));
        card.querySelectorAll("[data-ratab]").forEach((btn) => {
          btn.addEventListener("click", () => { tab = btn.getAttribute("data-ratab"); renderInner(); });
        });
        card.querySelectorAll("[data-rb-res]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const b = deleted.find((x) => x.id === btn.getAttribute("data-rb-res"));
            if (!b || !st.user) return;
            await restoreBorrower(st.user.uid, b, st.user.email);
            showToast("♻️ खाते Restore झाले!", "ok");
            setTimeout(renderInner, 220);
          });
        });
        card.querySelectorAll("[data-rb-del]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const b = deleted.find((x) => x.id === btn.getAttribute("data-rb-del"));
            if (!b || !st.user || !confirm(`'${b.name}' कायमचे डिलीट करायचे का?`)) return;
            await permanentDeleteBorrower(st.user.uid, b, st.user.email);
            showToast("❌ खाते कायमचे डिलीट झाले.", "ok");
            setTimeout(renderInner, 220);
          });
        });
      }
    });
  };
  renderInner();
}
