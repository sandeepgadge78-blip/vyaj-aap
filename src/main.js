// व्याज Infinity X - मुख्य Application Shell व Controller (Zero MutationObserver • Modular Monolith) (src/main.js)

import { auth, initOfflinePersistence } from "./core/firebase.js";
import { getState, setState, updateUi, subscribeStore, getUnifiedMonthReport } from "./core/store.js";
import { subscribeFeatureFlags, isFeatureEnabled } from "./core/feature-flags.js";
import { fmtYmMr, formatRupeesInr, getIstTodayIso, prevYm, getIstCurrentYm } from "./core/ledger-v16.js";
import { startBorrowersSync, stopBorrowersSync, collectMonthlyPayment } from "./data/borrowers-repo.js";
import { startUdhaariSync, stopUdhaariSync } from "./data/udhaari-repo.js";
import { pullUserMetaAndCashbook } from "./data/cashbook-repo.js";
import { initOfflineQueueWatcher, refreshPendingCount, syncPendingQueue } from "./data/offline-queue.js";
import { performLiveBackup } from "./data/backup-vault.js";
import { esc, showToast, openModal, closeModal, closeAllModals } from "./ui/dom-utils.js";
import { renderDashboard } from "./features/dashboard.js";
import { renderBorrowersSection, jumpToBorrowerCard, openAddBorrowerModal, openDrillListModal } from "./features/borrowers.js";
import { openUdhaariModal } from "./features/udhaari.js";
import { openMonthActivityModal } from "./features/month-activity.js";
import { generateMasterMonthlyPdf, exportMonthlyExcelCsv } from "./features/pdf-reports.js";
import { openInterestPreviewModal, openEmiModal, openCashbookModal, openSystemGuardianModal } from "./features/tools-suite.js";
import {
  isPinEnabled, isUnlockedInSession, markSessionUnlocked, showPinOverlay,
  initSecurityWatcher, resetAutoLockTimer, secureSignOut,
  openProfileModal, openSettingsModal, openBackupVaultModal, openRecycleAndAuditModal
} from "./features/security-pin.js";
import { initAutoPushScheduler, openRemindersModal } from "./features/reminders-fcm.js";

let wasLoggedOut = false;
let quickCollectMode = "Cash";
let quickCollectSearch = "";

// =========================================================================
// १. Global Crash Guard व Theme Init
// =========================================================================
window.addEventListener("error", (ev) => console.warn("Vyaj Infinity Guard:", ev.message));
window.addEventListener("unhandledrejection", (ev) => console.warn("Vyaj Promise Guard:", ev.reason));

function applySavedTheme() {
  const theme = localStorage.getItem("vyaj_theme") || "dark";
  document.body.classList.toggle("light-mode", theme === "light");
}

function hideSplashScreen() {
  const sp = document.getElementById("splashScreen");
  if (sp) sp.classList.add("splash-hide");
}

// =========================================================================
// २. सर्व डॅशबोर्ड व मेन्यू अ‍ॅक्शन्सचे एकच केंद्रीय ऑब्जेक्ट
// =========================================================================
const appActions = {
  onOpenPdf: () => generateMasterMonthlyPdf(),
  onExportExcel: () => exportMonthlyExcelCsv(),
  onOpenMonthActivity: () => openMonthActivityModal(),
  onOpenInterestPreview: () => openInterestPreviewModal(),
  onOpenUdhaari: (tab = "pending") => openUdhaariModal(tab),
  onOpenCashbook: () => openCashbookModal(),
  onOpenEmi: () => openEmiModal(),
  onOpenGuardian: () => openSystemGuardianModal((bId) => jumpToBorrowerCard(document.getElementById("borrowersRoot"), bId)),
  onOpenDrill: (type) => openDrillListModal(type, (bId) => jumpToBorrowerCard(document.getElementById("borrowersRoot"), bId)),
  onJumpBorrower: (bId) => jumpToBorrowerCard(document.getElementById("borrowersRoot"), bId),
  onOpenBackupSnapshots: () => openBackupVaultModal(),
  onTriggerBackup: async () => {
    const st = getState();
    if (!st.user) return;
    showToast("⏳ बॅकअप घेत आहे...", "info", 1500);
    const res = await performLiveBackup(st.user.uid, { reason: "manual", userEmail: st.user.email });
    showToast(res.ok ? (res.cloudOk ? "✅ Cloud + Local बॅकअप पूर्ण!" : "✅ Local Snapshot सेव्ह!") : res.message, res.ok ? "ok" : "err");
    renderAll();
  }
};

// =========================================================================
// ३. हेडर, साइडबार ड्रॉवर व बॉटम नेव्हिगेशन (Months / Quick Pay)
// =========================================================================
function updateHeaderStatus() {
  const st = getState();
  const report = getUnifiedMonthReport();
  const brandEl = document.getElementById("brandTitleText");
  const netEl = document.getElementById("netBadge");
  const syncEl = document.getElementById("syncBadge");
  const dueBadge = document.getElementById("bellCountPill");

  if (brandEl) brandEl.textContent = (st.profile?.bizName || "व्याज हिशोब वही").trim();
  if (netEl) {
    netEl.textContent = st.ui.isOnline ? "Online 🟢" : "Offline 🔴";
    netEl.className = `badge ${st.ui.isOnline ? "paid" : "pending"}`;
  }
  if (syncEl) syncEl.textContent = st.ui.syncStatus || "Synced";

  const todayIso = getIstTodayIso();
  let dueCount = 0;
  report.rows.forEach(({ b, ledger }) => {
    if (ledger.isClosed || ledger.totalPayable <= 0) return;
    const dates = [b.promiseDate1, b.promiseDate2, b.promiseDate3]
      .concat(Array.isArray(b.promiseList) ? b.promiseList.filter((p) => p && p.status !== "done").map((p) => p.date) : [])
      .filter(Boolean);
    if (dates.some((d) => String(d).slice(0, 10) <= todayIso) || ledger.status !== "paid") dueCount += 1;
  });
  if (dueBadge) dueBadge.textContent = String(dueCount);
}

function openSideDrawer() {
  const st = getState();
  const drawer = document.getElementById("sideDrawer");
  const backdrop = document.getElementById("drawerBackdrop");
  if (!drawer || !backdrop) return;

  const biz = (st.profile?.bizName || "व्याज हिशोब वही").trim();
  const email = st.user?.email || "";
  const delCnt = (st.borrowers || []).filter((b) => b && b.isDeleted).length;

  drawer.innerHTML = `
    <div class="meta-box row-between" style="margin-bottom:10px; cursor:pointer;" id="drProfTrigger">
      <div style="min-width:0;">
        <div style="font-weight:900; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(biz)}</div>
        <div class="muted" style="font-size:0.7rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(st.profile?.ownerName || email || "प्रोफाईल सेट करा")}</div>
      </div>
      <span class="badge">प्रोफाईल ▸</span>
    </div>

    <div class="muted" style="font-size:0.68rem; font-weight:800; margin:8px 2px 5px;">⚡ मुख्य साधने</div>
    <div class="grid-2" style="gap:6px; margin-bottom:10px;">
      <button type="button" class="primary sm" data-dr="new">➕ नवीन ग्राहक</button>
      <button type="button" class="success sm" data-dr="qpay">⚡ फास्ट वसुली</button>
      <button type="button" class="purple sm" data-dr="udhaari">🤝 उधारी</button>
      <button type="button" class="teal sm" data-dr="preview">🧮 व्याज अंदाज</button>
    </div>

    <div class="muted" style="font-size:0.68rem; font-weight:800; margin:8px 2px 5px;">📊 अहवाल व साधने</div>
    <div style="display:flex; flex-direction:column; gap:5px; margin-bottom:10px;">
      <button type="button" class="sm" style="text-align:left;" data-dr="mact">📋 महिना नोंदी (नवीन / मुद्दल / व्याज)</button>
      <button type="button" class="sm" style="text-align:left;" data-dr="pdf">🖨️ Master A4 Portrait PDF</button>
      <button type="button" class="sm" style="text-align:left;" data-dr="excel">📊 महिन्याची Excel / CSV</button>
      <button type="button" class="sm" style="text-align:left;" data-dr="cashbook">📒 रोजचा कॅशबुक</button>
      <button type="button" class="sm" style="text-align:left;" data-dr="emi">📊 BigInt EMI कॅल्क्युलेटर</button>
      <button type="button" class="sm" style="text-align:left;" data-dr="reminders">🔔 10/4/6 Push व WhatsApp रिमाइंडर</button>
    </div>

    <div class="muted" style="font-size:0.68rem; font-weight:800; margin:8px 2px 5px;">🛡️ सुरक्षा, बॅकअप व Guardian</div>
    <div style="display:flex; flex-direction:column; gap:5px;">
      <button type="button" class="warn sm" style="text-align:left;" data-dr="guardian">🛡️ System Guardian (Error / Time Machine / Compare)</button>
      <button type="button" class="sm" style="text-align:left;" data-dr="backup">☁️ Encrypted Backup & 3-Snapshot Vault</button>
      <button type="button" class="sm" style="text-align:left;" data-dr="settings">⚙️ सेटिंग्ज, ४-अंकी PIN व Feature Flags</button>
      <button type="button" class="sm" style="text-align:left;" data-dr="recycle">🗑️ Recycle Bin (${delCnt}) व Audit Log</button>
      <button type="button" class="danger sm" style="text-align:left; margin-top:4px;" data-dr="logout">🚪 सुरक्षित लॉगआउट (Sign Out)</button>
    </div>
  `;

  drawer.querySelector("#drProfTrigger")?.addEventListener("click", () => { closeSideDrawer(); openProfileModal(); });
  drawer.querySelectorAll("[data-dr]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.getAttribute("data-dr");
      closeSideDrawer();
      if (k === "new") openAddBorrowerModal();
      else if (k === "qpay") openQuickCollectModal();
      else if (k === "udhaari") openUdhaariModal("pending");
      else if (k === "preview") openInterestPreviewModal();
      else if (k === "mact") openMonthActivityModal();
      else if (k === "pdf") generateMasterMonthlyPdf();
      else if (k === "excel") exportMonthlyExcelCsv();
      else if (k === "cashbook") openCashbookModal();
      else if (k === "emi") openEmiModal();
      else if (k === "reminders") openRemindersModal();
      else if (k === "guardian") appActions.onOpenGuardian();
      else if (k === "backup") openBackupVaultModal();
      else if (k === "settings") openSettingsModal();
      else if (k === "recycle") openRecycleAndAuditModal("recycle");
      else if (k === "logout") secureSignOut();
    });
  });

  backdrop.classList.remove("hidden");
  drawer.classList.remove("hidden");
  requestAnimationFrame(() => drawer.classList.add("open"));
}

function closeSideDrawer() {
  const drawer = document.getElementById("sideDrawer");
  const backdrop = document.getElementById("drawerBackdrop");
  if (drawer) { drawer.classList.remove("open"); drawer.classList.add("hidden"); }
  if (backdrop) backdrop.classList.add("hidden");
}

// १२ महिन्यांचा झटपट Month Switcher Modal
function openMonthsPickerModal() {
  const curActive = getState().activeYm;
  let cursor = getIstCurrentYm();
  const months = [];
  for (let i = 0; i < 12; i++) {
    months.push(cursor);
    cursor = prevYm(cursor);
  }

  openModal("monthsPickerModal", `
    <div class="modal-head">
      <h3>📅 महिना निवडा (IST)</h3>
      <button type="button" class="sm" id="mpCloseBtn">✕ बंद</button>
    </div>
    <div class="grid-2" style="gap:6px; margin-bottom:10px;">
      ${months.map((m) => `<button type="button" class="seg-btn ${m === curActive ? "is-active" : ""}" data-pick-ym="${m}">${esc(fmtYmMr(m))}</button>`).join("")}
    </div>
    <div class="row" style="gap:6px;">
      <input type="month" id="mpCustomInp" value="${esc(curActive)}" style="flex:1;" />
      <button type="button" class="primary sm" id="mpApplyCustom">निवडा</button>
    </div>
  `, {
    maxWidth: "440px",
    onAfterRender: (card) => {
      card.querySelector("#mpCloseBtn")?.addEventListener("click", () => closeModal("monthsPickerModal"));
      card.querySelectorAll("[data-pick-ym]").forEach((btn) => {
        btn.addEventListener("click", () => {
          setState({ activeYm: btn.getAttribute("data-pick-ym") });
          closeModal("monthsPickerModal");
        });
      });
      card.querySelector("#mpApplyCustom")?.addEventListener("click", () => {
        const val = card.querySelector("#mpCustomInp")?.value;
        if (val) { setState({ activeYm: val }); closeModal("monthsPickerModal"); }
      });
    }
  });
}

// ⚡ फास्ट १-क्लिक वसुली Modal (BigInt + Duplicate Guard + Offline Queue)
function openQuickCollectModal() {
  const renderInner = () => {
    const st = getState();
    const report = getUnifiedMonthReport();
    const q = quickCollectSearch.trim().toLowerCase();

    const pending = report.rows
      .filter(({ b, ledger }) => !ledger.isClosed && ledger.totalPayable > 0 && (!q || `${b.name || ""} ${b.mobile || ""}`.toLowerCase().includes(q)))
      .sort((a, c) => c.ledger.totalPayable - a.ledger.totalPayable);

    const listHtml = pending.length
      ? pending.map(({ b, ledger }) => {
          const sug = ledger.remainingThisMonth > 0 ? ledger.remainingThisMonth : ledger.totalPayable;
          return `
            <div class="meta-box row-between" style="margin-bottom:6px; gap:6px;">
              <div style="min-width:0; flex:1;">
                <strong style="font-size:0.84rem;">${esc(b.name)}</strong>
                <div class="muted" style="font-size:0.69rem;">एकूण बाकी: <strong class="err">${formatRupeesInr(ledger.totalPayable, st.ui.hideAmounts)}</strong></div>
              </div>
              <div class="row" style="gap:5px; flex-shrink:0;">
                <input type="number" class="qc-amt" data-qc-inp="${esc(b.id)}" value="${sug}" min="1" style="width:82px; padding:5px 7px;" />
                <button type="button" class="success xs" data-qc-pay="${esc(b.id)}">✅ जमा</button>
              </div>
            </div>
          `;
        }).join("")
      : `<div class="meta-box ok" style="text-align:center; padding:18px;">✅ या महिन्याचे सर्व बाकी व्याज पूर्ण जमा झाले आहे!</div>`;

    openModal("quickCollectModal", `
      <div class="modal-head">
        <div><h3>⚡ फास्ट १-क्लिक वसुली (${esc(fmtYmMr(report.ym))})</h3><div class="muted" style="font-size:0.7rem;">BigInt + ऑफलाइन रांग + दुहेरी पेमेंट संरक्षण</div></div>
        <button type="button" class="sm" id="qcCloseBtn">✕ बंद</button>
      </div>
      <div class="row" style="gap:6px; margin-bottom:8px;">
        <input type="text" id="qcSearch" value="${esc(quickCollectSearch)}" placeholder="🔍 नाव शोधा..." style="flex:1;" />
        <select id="qcModeSel" style="width:94px;">
          <option value="Cash" ${quickCollectMode === "Cash" ? "selected" : ""}>Cash</option>
          <option value="UPI" ${quickCollectMode === "UPI" ? "selected" : ""}>UPI</option>
          <option value="Bank" ${quickCollectMode === "Bank" ? "selected" : ""}>Bank</option>
        </select>
      </div>
      <div style="max-height:58vh; overflow-y:auto;">${listHtml}</div>
    `, {
      onAfterRender: (card) => {
        card.querySelector("#qcCloseBtn")?.addEventListener("click", () => closeModal("quickCollectModal"));
        card.querySelector("#qcModeSel")?.addEventListener("change", (ev) => { quickCollectMode = ev.target.value; });
        const sInp = card.querySelector("#qcSearch");
        sInp?.addEventListener("input", () => {
          quickCollectSearch = sInp.value;
          const pos = sInp.selectionStart || quickCollectSearch.length;
          renderInner();
          const next = document.getElementById("qcSearch");
          if (next) { next.focus(); next.setSelectionRange(pos, pos); }
        });
        card.querySelectorAll("[data-qc-pay]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const bId = btn.getAttribute("data-qc-pay");
            const found = pending.find((x) => x.b.id === bId);
            const curSt = getState();
            if (!found || !curSt.user) return;
            const amt = Number(card.querySelector(`[data-qc-inp="${bId}"]`)?.value || 0);
            if (amt <= 0) return;
            btn.disabled = true;
            btn.textContent = "⏳";
            try {
              const res = await collectMonthlyPayment(curSt.user.uid, found.b, {
                ym: report.ym, amount: amt, mode: quickCollectMode, userEmail: curSt.user.email
              });
              showToast(res.status === "queued_offline" ? "📴 ऑफलाइन रांगेत सेव्ह!" : `✅ ${found.b.name}: ₹${amt} जमा!`, "ok");
              setTimeout(renderInner, 220);
            } catch (err) {
              btn.disabled = false;
              btn.textContent = "✅ जमा";
              showToast("❌ " + err.message, "err");
            }
          });
        });
      }
    });
  };
  renderInner();
}

// =========================================================================
// ४. मुख्य रेंडर सायकल (सिंगल रिअ‍ॅक्टिव्ह सिग्नल)
// =========================================================================
function renderAll(forceDash = false) {
  const st = getState();
  if (!st.user) return;
  updateHeaderStatus();
  renderDashboard(document.getElementById("dashboardRoot"), appActions, forceDash);
  renderBorrowersSection(document.getElementById("borrowersRoot"));
}

// =========================================================================
// ५. Auth, Login, PWA १-क्लिक अपडेट व बूटस्ट्रॅप
// =========================================================================
function bindAuthAndShellEvents() {
  document.getElementById("emailLoginBtn")?.addEventListener("click", async () => {
    const msg = document.getElementById("authMsg");
    const email = (document.getElementById("loginEmail")?.value || "").trim();
    const pass = document.getElementById("loginPassword")?.value || "";
    msg.textContent = "लॉगिन होत आहे...";
    try {
      await auth.signInWithEmailAndPassword(email, pass);
      msg.textContent = "";
    } catch (e) {
      msg.textContent = `❌ ${e.message}`;
    }
  });

  document.getElementById("googleLoginBtn")?.addEventListener("click", async () => {
    const msg = document.getElementById("authMsg");
    msg.textContent = "Google Sign-In...";
    try {
      await auth.signInWithPopup(new window.firebase.auth.GoogleAuthProvider());
      msg.textContent = "";
    } catch (e) {
      msg.textContent = `❌ ${e.message}`;
    }
  });

  document.getElementById("forgotPassBtn")?.addEventListener("click", async () => {
    const msg = document.getElementById("authMsg");
    const email = (document.getElementById("loginEmail")?.value || "").trim();
    if (!email) { msg.textContent = "आधी वर तुमचा Gmail पत्ता टाका."; return; }
    try {
      await auth.sendPasswordResetEmail(email);
      msg.textContent = `✅ ${email} वर Password Reset लिंक पाठवली आहे.`;
    } catch (e) {
      msg.textContent = `❌ ${e.message}`;
    }
  });

  document.getElementById("menuOpenBtn")?.addEventListener("click", openSideDrawer);
  document.getElementById("drawerBackdrop")?.addEventListener("click", closeSideDrawer);
  document.getElementById("headerBellBtn")?.addEventListener("click", openRemindersModal);
  document.getElementById("fabNewBorrower")?.addEventListener("click", openAddBorrowerModal);

  document.getElementById("navHomeBtn")?.addEventListener("click", () => {
    closeSideDrawer();
    closeAllModals();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.getElementById("navMonthsBtn")?.addEventListener("click", () => { closeSideDrawer(); openMonthsPickerModal(); });
  document.getElementById("navCashbookBtn")?.addEventListener("click", () => {
    closeSideDrawer();
    if (isFeatureEnabled("cashbook")) openCashbookModal();
    else openMonthActivityModal();
  });
  document.getElementById("navPayBtn")?.addEventListener("click", () => { closeSideDrawer(); openQuickCollectModal(); });
}

// १-क्लिक PWA Update Banner (sw.js अपडेट झाल्यावर)
function registerServiceWorkerWithUpdatePrompt() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js");
      const showUpdateBanner = (worker) => {
        if (!worker || document.getElementById("pwaUpdateBar")) return;
        const bar = document.createElement("div");
        bar.id = "pwaUpdateBar";
        bar.className = "meta-box row-between";
        bar.style.cssText = "position:fixed; top:54px; left:10px; right:10px; z-index:95; border-color:var(--accent-2); background:#0f291c;";
        bar.innerHTML = `<span style="font-size:0.78rem; font-weight:800;">✨ अ‍ॅपचे नवीन अपडेट तयार आहे!</span><button type="button" class="success xs" id="pwaApplyUpdBtn">🔄 आत्ता अपडेट करा</button>`;
        document.body.appendChild(bar);
        bar.querySelector("#pwaApplyUpdBtn")?.addEventListener("click", () => {
          worker.postMessage({ type: "SKIP_WAITING" });
          bar.remove();
        });
      };

      if (reg.waiting) showUpdateBanner(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        nw?.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner(nw);
        });
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    } catch (err) {
      console.warn("SW Register Note:", err?.message);
    }
  });
}

function bootstrap() {
  applySavedTheme();
  bindAuthAndShellEvents();
  initSecurityWatcher();
  initOfflineQueueWatcher(() => getState().user?.uid);
  registerServiceWorkerWithUpdatePrompt();

  subscribeStore(() => renderAll(false));
  subscribeFeatureFlags(() => renderAll(true));

  auth.onAuthStateChanged(async (user) => {
    const authScreen = document.getElementById("authScreen");
    const appShell = document.getElementById("appShell");

    if (!user) {
      wasLoggedOut = true;
      stopBorrowersSync();
      stopUdhaariSync();
      closeAllModals();
      setState({ user: null, borrowers: [], udhaari: [], auditLogs: [] });
      updateUi({ syncStatus: "Locked" });
      authScreen?.classList.remove("hidden");
      appShell?.classList.add("hidden");
      hideSplashScreen();
      return;
    }

    await initOfflinePersistence();
    if (wasLoggedOut) {
      wasLoggedOut = false;
      markSessionUnlocked();
    } else if (isPinEnabled() && !isUnlockedInSession()) {
      showPinOverlay({ mode: "unlock" });
    }

    setState({ user: { uid: user.uid, email: user.email || "" } });
    updateUi({ syncStatus: navigator.onLine ? "Synced" : "Offline Mode" });
    authScreen?.classList.add("hidden");
    appShell?.classList.remove("hidden");
    hideSplashScreen();

    resetAutoLockTimer();
    startBorrowersSync(user.uid);
    startUdhaariSync(user.uid);
    pullUserMetaAndCashbook(user.uid);
    await refreshPendingCount(user.uid);
    if (navigator.onLine) syncPendingQueue(user.uid);
    initAutoPushScheduler(() => getState().user?.uid);
  });

  // सुरक्षितता: कोणतीही अडचण आली तरी Splash २.२ सेकंदांत नक्की बंद होईल
  setTimeout(hideSplashScreen, 2200);
}

bootstrap();
