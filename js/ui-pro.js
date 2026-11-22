// व्याज हिशोब वही - All-in-One Business Pro UI, Unified Menu + Feature Search, Step-by-Step Back, Reports Hub & Toggle Settings (js/ui-pro.js - V14.25)
(function () {
  const RECENT_KEY = "vyaj_recent_features_v1";
  let enhanceTimer = null;
  let legacyDrawerEl = null;

  function esc(str) {
    return String(str || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function fmtInr(n) {
    if (window.HishobBridge && typeof window.HishobBridge.fmtAmt === "function") {
      return window.HishobBridge.fmtAmt(n);
    }
    return "₹" + Number(n || 0).toLocaleString("en-IN");
  }

  // Splash Screen कधीही अडकू नये म्हणून सुरक्षित Auto-Hide (Fail-Safe)
  function ensureSplashHidden() {
    const sp = document.getElementById("splashScreen");
    if (sp && !sp.classList.contains("splash-hide")) {
      sp.classList.add("splash-hide");
    }
  }

  // मेन्यू, सर्च बार आणि जुना ड्रॉवर लपवण्यासाठी खात्रीशीर CSS जोडा (Self-Contained CSS)
  function injectProMenuCss() {
    if (document.getElementById("vyajProMenuFixCss")) return;
    const st = document.createElement("style");
    st.id = "vyajProMenuFixCss";
    st.textContent = `
      [data-legacy-drawer-hidden="1"],
      #threeDotMenuSlot {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
        opacity: 0 !important;
      }
      .pro-menu-backdrop {
        position: fixed; inset: 0; z-index: 90;
        background: rgba(0, 0, 0, 0.72); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
      }
      .pro-drawer {
        position: fixed; top: 0; left: 0; bottom: 0; width: 86%; max-width: 345px; z-index: 95;
        background: linear-gradient(180deg, #15171e 0%, #0b0c10 100%);
        border-right: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 12px 0 36px rgba(0, 0, 0, 0.75);
        padding: 14px 12px 26px; overflow-y: auto;
        transform: translateX(-100%); transition: transform 0.22s cubic-bezier(.22, 1, .36, 1);
      }
      .pro-drawer.open { transform: translateX(0); }
      body.light-mode .pro-drawer {
        background: #f6f4ef; border-right: 1px solid #d5cfc2;
        box-shadow: 10px 0 28px rgba(31, 36, 45, 0.18);
      }
      .pro-menu-profile {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        padding: 11px; border-radius: 15px; margin-bottom: 10px;
        background: rgba(255, 255, 255, 0.06); border: 1px solid var(--border);
      }
      body.light-mode .pro-menu-profile { background: #fbfaf7; }
      .pro-menu-prof-left { display: flex; align-items: center; gap: 10px; min-width: 0; cursor: pointer; flex: 1; }
      .pro-menu-avatar {
        width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.15rem; font-weight: 900; color: #f8fafc;
        background: linear-gradient(135deg, #333846, #1d2029); border: 1.5px solid rgba(255, 255, 255, 0.25);
      }
      .pro-menu-biz { font-size: 0.94rem; font-weight: 800; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pro-menu-owner { font-size: 0.72rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
      .pro-menu-lock-btn { padding: 7px 10px !important; border-radius: 12px !important; font-size: 0.95rem !important; flex-shrink: 0; }
      .pro-menu-wa-box {
        padding: 10px; border-radius: 14px; margin-bottom: 10px;
        background: rgba(22, 101, 52, 0.15); border: 1px solid rgba(74, 222, 128, 0.3);
      }
      body.light-mode .pro-menu-wa-box { background: #eef7f1; border-color: #86efac; }
      .pro-menu-wa-lbl { display: block; font-size: 0.74rem; font-weight: 700; color: var(--text); margin-bottom: 6px; }
      .pro-menu-wa-row { display: flex; gap: 6px; }
      .pro-menu-wa-row input { flex: 1; min-width: 0; padding: 7px 9px !important; font-size: 0.82rem !important; border-radius: 9px !important; }
      .pro-menu-wa-msg { font-size: 0.72rem; font-weight: 700; margin-top: 4px; }
      .pro-menu-search-wrap { margin-bottom: 12px; }
      .pro-menu-search-input {
        width: 100%; padding: 9px 13px !important; border-radius: 12px !important; font-size: 0.82rem !important;
        background: var(--meta-bg) !important; border: 1px solid var(--border) !important; color: var(--text) !important;
      }
      .pro-menu-recent-strip { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; margin-top: 6px; }
      .pro-recent-tag { font-size: 0.68rem; color: var(--muted); font-weight: 700; }
      .pro-recent-chip { padding: 3px 8px !important; font-size: 0.7rem !important; border-radius: 999px !important; background: var(--meta-bg) !important; color: var(--text) !important; }
      .pro-menu-search-results {
        margin-top: 6px; border-radius: 12px; padding: 6px;
        background: var(--card-solid); border: 1px solid var(--border);
        display: flex; flex-direction: column; gap: 5px;
      }
      .pro-search-hit {
        width: 100%; display: flex; align-items: center; justify-content: space-between;
        padding: 8px 10px !important; font-size: 0.8rem !important; border-radius: 9px !important;
        background: var(--meta-bg) !important; text-align: left; color: var(--text) !important;
      }
      .pro-menu-sec-lbl { font-size: 0.72rem; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; margin: 10px 2px 6px; }
      .pro-menu-pinned-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; margin-bottom: 10px; }
      .pro-pin-card {
        display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
        padding: 10px !important; border-radius: 13px !important; text-align: left;
        background: var(--meta-bg) !important; border: 1px solid var(--border) !important;
      }
      .pro-pin-icon { font-size: 1.15rem; }
      .pro-pin-lbl { font-size: 0.76rem; font-weight: 700; color: var(--text); line-height: 1.25; }
      .pro-menu-acc-list { display: flex; flex-direction: column; gap: 7px; }
      .pro-acc-group { border-radius: 13px; overflow: hidden; background: var(--meta-bg); border: 1px solid var(--border); }
      .pro-acc-head {
        width: 100%; display: flex; align-items: center; justify-content: space-between;
        padding: 10px 12px !important; background: transparent !important; border: none !important;
        font-size: 0.83rem !important; font-weight: 800 !important; color: var(--text) !important; border-radius: 0 !important;
      }
      .pro-acc-meta-badge {
        font-size: 0.64rem; font-weight: 700; padding: 2px 7px; border-radius: 999px;
        background: rgba(74, 222, 128, 0.14); color: var(--accent-2); border: 1px solid rgba(74, 222, 128, 0.3);
      }
      .pro-acc-arrow { transition: transform 0.2s ease; color: var(--muted); }
      .pro-acc-group.is-open .pro-acc-arrow { transform: rotate(180deg); color: var(--accent); }
      .pro-acc-body { display: none; flex-direction: column; gap: 4px; padding: 0 8px 8px; }
      .pro-acc-group.is-open .pro-acc-body { display: flex; }
      .pro-acc-item {
        width: 100%; display: flex; align-items: center; justify-content: space-between;
        padding: 8px 10px !important; font-size: 0.79rem !important; font-weight: 600 !important;
        background: rgba(255, 255, 255, 0.04) !important; border: 1px solid transparent !important;
        border-radius: 9px !important; text-align: left; color: var(--text) !important;
      }
      body.light-mode .pro-acc-item { background: #fbfaf7 !important; border-color: #eae6dd !important; }
      .pro-acc-right { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
      .pro-menu-ver { text-align: center; font-size: 0.68rem; color: var(--muted); margin-top: 14px; opacity: 0.75; }
    `;
    document.head.appendChild(st);
  }

  // =========================================================================
  // भाग १: ग्लोबल Step-by-Step Back Navigation मॅनेजर (VyajNavStack)
  // =========================================================================
  const navStack = [];
  let isInternalNav = false;
  let navSyncTimer = null;

  function getVisibleModals() {
    return Array.from(document.querySelectorAll(".modal-backdrop")).filter(
      (m) => !m.classList.contains("hidden") && window.getComputedStyle(m).display !== "none"
    );
  }

  function isProDrawerOpen() {
    const el = document.getElementById("proUnifiedDrawer");
    return Boolean(el && !el.classList.contains("hidden") && el.classList.contains("open"));
  }

  function pushBrowserStep(tag) {
    try { history.pushState({ vyajNavStep: tag || "step", ts: Date.now() }, ""); } catch (_) {}
  }

  function hideNavEntry(entry) {
    if (!entry) return;
    isInternalNav = true;
    try {
      if (entry.type === "substep") {
        if (typeof entry.onBack === "function") entry.onBack();
      } else if (entry.type === "drawer") {
        if (typeof entry.onClose === "function") entry.onClose();
        else closeProDrawer();
      } else if (entry.type === "modal") {
        const el = document.getElementById(entry.id);
        if (el) el.classList.add("hidden");
      }
    } finally {
      setTimeout(() => { isInternalNav = false; updateNewButtonVisibility(); }, 40);
    }
  }

  function restoreNavEntry(entry) {
    if (!entry) return;
    isInternalNav = true;
    try {
      entry.suspended = false;
      if (entry.type === "drawer") {
        if (typeof entry.onRestore === "function") entry.onRestore();
        else openProDrawer(true);
      } else if (entry.type === "modal") {
        const el = document.getElementById(entry.id);
        if (el) el.classList.remove("hidden");
      }
    } finally {
      setTimeout(() => { isInternalNav = false; updateNewButtonVisibility(); }, 40);
    }
  }

  const VyajNavStack = {
    pushDrawer(id, onClose, onRestore) {
      const idx = navStack.findIndex((x) => x.id === id && x.type === "drawer");
      if (idx !== -1) navStack.splice(idx, 1);
      navStack.push({ id, type: "drawer", suspended: false, onClose, onRestore });
      pushBrowserStep("drawer:" + id);
      updateNewButtonVisibility();
    },
    pushModal(id) {
      if (!id) return;
      const top = navStack[navStack.length - 1];
      if (top && top.type === "modal" && top.id === id && !top.suspended) return;
      const idx = navStack.findIndex((x) => x.id === id && x.type === "modal");
      if (idx !== -1) navStack.splice(idx, 1);
      navStack.push({ id, type: "modal", suspended: false });
      pushBrowserStep("modal:" + id);
      updateNewButtonVisibility();
    },
    pushSubStep(id, onBack) {
      const idx = navStack.findIndex((x) => x.id === id && x.type === "substep");
      if (idx !== -1) navStack.splice(idx, 1);
      navStack.push({ id, type: "substep", suspended: false, onBack });
      pushBrowserStep("sub:" + id);
    },
    navigateFrom(currentId, openNextFn) {
      isInternalNav = true;
      try {
        const idx = navStack.findIndex((x) => x.id === currentId);
        if (idx !== -1) {
          const cur = navStack[idx];
          cur.suspended = true;
          if (cur.type === "drawer") closeProDrawer();
          else {
            const el = document.getElementById(cur.id);
            if (el) el.classList.add("hidden");
          }
        } else if (currentId) {
          const isDrw = currentId === "proUnifiedDrawer";
          navStack.push({ id: currentId, type: isDrw ? "drawer" : "modal", suspended: true });
          if (isDrw) closeProDrawer();
          else document.getElementById(currentId)?.classList.add("hidden");
        }
      } finally {
        isInternalNav = false;
      }
      if (typeof openNextFn === "function") openNextFn();
      setTimeout(() => { syncAutoModals(); updateNewButtonVisibility(); }, 60);
    },
    stepBack() {
      if (navStack.length > 0) {
        const top = navStack.pop();
        hideNavEntry(top);
        const prev = navStack[navStack.length - 1];
        if (prev && prev.suspended) restoreNavEntry(prev);
        return true;
      }
      const vis = getVisibleModals();
      if (vis.length > 0) {
        isInternalNav = true;
        vis[vis.length - 1].classList.add("hidden");
        setTimeout(() => { isInternalNav = false; updateNewButtonVisibility(); }, 40);
        return true;
      }
      if (isProDrawerOpen()) {
        closeProDrawer();
        return true;
      }
      return false;
    },
    popIfTop(id) {
      const top = navStack[navStack.length - 1];
      if (top && top.id === id) {
        navStack.pop();
        const prev = navStack[navStack.length - 1];
        if (prev && prev.suspended) restoreNavEntry(prev);
        updateNewButtonVisibility();
      }
    },
    clearAll() {
      isInternalNav = true;
      while (navStack.length > 0) {
        const item = navStack.pop();
        if (item.type === "drawer") closeProDrawer();
        else if (item.type === "modal") document.getElementById(item.id)?.classList.add("hidden");
      }
      getVisibleModals().forEach((m) => m.classList.add("hidden"));
      closeProDrawer();
      setTimeout(() => { isInternalNav = false; updateNewButtonVisibility(); }, 40);
    },
    hasActiveOverlay() {
      return getVisibleModals().length > 0 || isProDrawerOpen();
    }
  };
  window.VyajNavStack = VyajNavStack;

  function syncAutoModals() {
    if (isInternalNav) return;
    getVisibleModals().forEach((m) => {
      if (!m.id) return;
      const exists = navStack.some((x) => x.id === m.id && x.type === "modal" && !x.suspended);
      if (!exists) VyajNavStack.pushModal(m.id);
    });
    for (let i = navStack.length - 1; i >= 0; i--) {
      const item = navStack[i];
      if (item.type === "modal" && !item.suspended) {
        const el = document.getElementById(item.id);
        if (!el || el.classList.contains("hidden")) {
          navStack.splice(i, 1);
          const prev = navStack[navStack.length - 1];
          if (prev && prev.suspended) restoreNavEntry(prev);
        }
      }
    }
    updateNewButtonVisibility();
  }

  window.addEventListener("popstate", () => VyajNavStack.stepBack());

  // =========================================================================
  // भाग २: जुना निळा ड्रॉवर शोधून कायमचा लपवा (डोममधून डिलीट न करता)
  // =========================================================================
  function suppressLegacyDrawer() {
    Array.from(document.body.children).forEach((el) => {
      if (!el || el.nodeType !== 1) return;
      if (
        el.id === "appScreen" ||
        el.id === "authScreen" ||
        el.id === "splashScreen" ||
        el.id === "proUnifiedDrawer" ||
        el.id === "proMenuBackdrop" ||
        el.id === "printArea" ||
        el.tagName === "HEADER" ||
        el.tagName === "MAIN" ||
        el.tagName === "SCRIPT" ||
        el.tagName === "STYLE" ||
        el.classList.contains("modal-backdrop")
      ) return;

      const txt = el.textContent || "";
      if (
        txt.includes("Premium Dashboard V3") ||
        (txt.includes("मुख्य मेन्यू") && txt.includes("नवीन नाव जोडा")) ||
        (txt.includes("माझा WhatsApp रिमाइंडर नंबर") && txt.includes("अ‍ॅडव्हान्स रिपोर्ट्स"))
      ) {
        legacyDrawerEl = el;
        if (el.getAttribute("data-legacy-drawer-hidden") !== "1") {
          el.setAttribute("data-legacy-drawer-hidden", "1");
        }
      }
    });
  }

  // जुन्या मेन्यूमधील कोणताही लपलेला पर्याय सुरक्षितपणे ट्रिगर करा
  function triggerLegacyByText(keywords) {
    const kws = keywords.map((k) => k.toLowerCase());
    const roots = legacyDrawerEl ? [legacyDrawerEl, document.body] : [document.body];
    for (const root of roots) {
      const candidates = root.querySelectorAll("button, a, div, li, span");
      for (const el of candidates) {
        if (el.closest("#proUnifiedDrawer") || el.closest("#proReportsHubModal")) continue;
        if (el.children.length > 3) continue;
        const txt = (el.textContent || "").trim().toLowerCase();
        if (!txt || txt.length > 65) continue;
        if (kws.some((k) => txt.includes(k))) {
          el.click();
          return true;
        }
      }
    }
    return false;
  }

  // =========================================================================
  // भाग ३: एकत्रित Modern Business मेन्यू (☰ + ⋮) + Smart Feature Search
  // =========================================================================
  function openToolPane(paneId, title) {
    const modal = document.getElementById("toolSectionModal");
    const pane = document.getElementById(paneId);
    const titleEl = document.getElementById("toolSectionModalTitle");
    if (!modal || !pane) return;
    document.querySelectorAll(".tool-sec-pane").forEach((p) => p.classList.add("hidden"));
    pane.classList.remove("hidden");
    if (titleEl) titleEl.textContent = title;
    modal.classList.remove("hidden");
  }

  function openSimpleModal(id) {
    document.getElementById(id)?.classList.remove("hidden");
  }

  const ALL_FEATURES = [
    // ⚡ रोजची ४ मुख्य साधने (Quick Pinned)
    { id: "new_cust", icon: "➕", label: "नवीन ग्राहक / कर्ज", cat: "quick", kw: "new add customer borrower compose navin grahak karj नवीन ग्राहक कर्ज नाव जोडा", run: () => openToolPane("addBorrowerSection", "➕ नवीन ग्राहक / कर्ज नोंद") },
    { id: "fast_collect", icon: "⚡", label: "फास्ट वसुली", cat: "quick", kw: "fast quick collect pay vasuli payment फास्ट वसुली जमा", run: () => { if (!triggerLegacyByText(["फास्ट वसुली", "quick add payment"])) openSimpleModal("quickCollectModal"); } },
    { id: "reports_hub", icon: "📊", label: "रिपोर्ट्स हब", cat: "quick", kw: "report reports hub dashboard summary pdf excel रिपोर्ट्स हब अहवाल", run: () => openProReportsHub() },
    { id: "cashbook", icon: "📒", label: "कॅशबुक (वसुली)", cat: "quick", kw: "cashbook daily cash rokad book aajchi vasuli कॅशबुक रोकड वही आजची वसुली", run: () => { if (!triggerLegacyByText(["कॅशबुक", "daily cashbook", "आजची वसुली"])) openSimpleModal("cashbookModal"); } },

    // ⚙️ General (सामान्य)
    { id: "settings", icon: "⚙️", label: "अ‍ॅप सेटिंग्ज (Toggle / Theme)", cat: "general", kw: "settings theme dark light mode night day hide auto lock rate सेटिंग्ज थीम", run: () => openSimpleModal("settingsModal") },
    { id: "profile", icon: "👤", label: "बिझनेस प्रोफाईल व UPI ID", cat: "general", kw: "profile business owner name upi qr branding प्रोफाईल व्यवसाय", run: () => openSimpleModal("profileModal") },
    { id: "help", icon: "❓", label: "मराठी अ‍ॅप गाईड (Help & FAQ)", cat: "general", kw: "help guide faq tutorial info मदत गाईड माहिती", run: () => openSimpleModal("helpGuideModal") },

    // 📊 Reports & Tools
    { id: "reports_hub_sub", icon: "📊", label: "बिझनेस रिपोर्ट्स हब", cat: "reports", kw: "business reports hub summary अहवाल", run: () => openProReportsHub() },
    { id: "months_view", icon: "📅", label: "मागील महिन्यांचा हिशोब (Months)", cat: "reports", kw: "months previous month calendar mahina मागील महिने हिशोब", run: () => { if (!triggerLegacyByText(["मागील महिन्यांचा हिशोब", "months"])) document.getElementById("bigActiveMonthTitle")?.click(); } },
    { id: "passbook_hist", icon: "📖", label: "जमा व्याज व पासबुक इतिहास", cat: "reports", kw: "passbook interest profit paid history ledger jama vyaj पासबुक जमा व्याज इतिहास नफा", run: () => { if (typeof window.openVyajInterestList === "function") window.openVyajInterestList(); } },
    { id: "guarantor_list", icon: "🤝", label: "जमीनदार निहाय कर्ज यादी", cat: "reports", kw: "guarantor jamindar jamin list जमीनदार जामीनदार यादी", run: () => triggerLegacyByText(["जमीनदार निहाय", "guarantor"]) },
    { id: "pnl", icon: "📈", label: "Profit & Loss अहवाल", cat: "reports", kw: "profit loss pnl nafa tota नफा तोटा अहवाल", run: () => document.getElementById("openPnlBtn")?.click() },
    { id: "pdf_month", icon: "🖨️", label: "चालू महिन्याचा PDF रिपोर्ट", cat: "reports", kw: "pdf print monthly statement पीडीएफ प्रिंट", run: () => document.getElementById("printMonthlyPdfBtn")?.click() },
    { id: "excel_month", icon: "📑", label: "महिन्याची Excel / CSV फाईल", cat: "reports", kw: "excel csv export download sheet एक्सेल फाईल", run: () => document.getElementById("exportMonthlyCsvBtn")?.click() },
    { id: "bulk_wa", icon: "📲", label: "Bulk WhatsApp रिमाइंडर रांग", cat: "reports", kw: "bulk whatsapp reminder queue message व्हॉट्सॲप रांग", run: () => { if (!triggerLegacyByText(["bulk whatsapp", "रिमाइंडर रांग"])) openToolPane("remSection", "📲 WhatsApp, UPI QR व रिमाइंडर"); } },
    { id: "reminders", icon: "🔔", label: "रिमाइंडर्स व UPI QR सेटिंग्ज", cat: "reports", kw: "reminder notification upi qr alarm vavda वायदा रिमाइंडर", run: () => openToolPane("remSection", "📲 WhatsApp, UPI QR व रिमाइंडर") },
    { id: "gmail_rep", icon: "📧", label: "Gmail वर मास्टर रिपोर्ट पाठवा", cat: "reports", kw: "gmail email master report send ईमेल रिपोर्ट", run: () => document.getElementById("gmailReportBtn")?.click() },
    { id: "emi", icon: "🧮", label: "EMI कॅल्क्युलेटर (Simulator)", cat: "reports", kw: "emi calculator simulator flat reducing कॅल्क्युलेटर", run: () => openToolPane("emiSection", "🧮 EMI कॅल्क्युलेटर") },

    // ☁️ Backup & Data
    { id: "backup_all", icon: "☁️", label: "Cloud Sync, Backup व Restore", cat: "backup", kw: "backup restore cloud sync json vault archive बॅकअप रिस्टोर क्लाउड", run: () => openToolPane("reportsSection", "☁️ Cloud Sync, Backup व Restore") },
    { id: "csv_import", icon: "📥", label: "CSV / Google Sheet Import व Webhook", cat: "backup", kw: "import csv google sheet webhook data इम्पोर्ट शीट", run: () => openToolPane("reportsSection", "📥 CSV / Sheet Import व Webhook") },
    { id: "recycle", icon: "🗑️", label: "Recycle Bin (डिलीट खाती)", cat: "backup", kw: "recycle bin delete restore trash डिलीट खाती", run: () => openToolPane("recycleSection", "🗑️ Recycle Bin (डिलीट खाती)") },

    // 🛡️ Security & Privacy
    { id: "sec_dash", icon: "🛡️", label: "Admin Security Dashboard", cat: "security", kw: "security admin threat scan diagnostics सुरक्षा", run: () => document.getElementById("openSecurityDashBtn")?.click() },
    { id: "audit", icon: "📜", label: "Audit Log (बदलांचा इतिहास)", cat: "security", kw: "audit log history activity track लॉग इतिहास", run: () => openToolPane("auditSection", "📜 Audit Log") },
    { id: "lock_app", icon: "🔒", label: "अ‍ॅप लगेच लॉक करा (Lock)", cat: "security", kw: "lock pin biometric privacy security लॉक", run: () => document.getElementById("lockBtn")?.click() },
    { id: "logout", icon: "🚪", label: "लॉगआउट (Sign Out)", cat: "security", kw: "logout signout exit बाहेर लॉगआउट", run: () => { if (confirm("तुम्हाला अ‍ॅपमधून लॉगआउट करायचे आहे का?")) { if (typeof firebase !== "undefined" && firebase.auth) firebase.auth().signOut(); } } }
  ];

  function getRecentIds() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch (_) { return []; }
  }

  function recordRecent(id) {
    try {
      const arr = getRecentIds().filter((x) => x !== id);
      arr.unshift(id);
      localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 3)));
    } catch (_) {}
  }

  function getLastBackupShortText() {
    const badgeTxt = (document.getElementById("lastBackupBadge")?.textContent || "").trim();
    if (badgeTxt && badgeTxt.length > 2) return badgeTxt.replace(/^.*?:\s*/, "").trim().slice(0, 14);
    const lsDate = localStorage.getItem("vyaj_last_backup_date") || localStorage.getItem("lastBackupTime") || "";
    return lsDate ? String(lsDate).slice(0, 10) : "Ready";
  }

  function launchMenuFeature(feat) {
    if (!feat) return;
    recordRecent(feat.id);
    const sInput = document.getElementById("proMenuSearchInput");
    if (sInput) sInput.value = "";
    renderMenuSearchResults("");

    const immediateActions = ["lock_app", "logout", "pdf_month", "excel_month", "gmail_rep"];
    if (immediateActions.includes(feat.id)) {
      closeProDrawer();
      VyajNavStack.popIfTop("proUnifiedDrawer");
      setTimeout(() => feat.run(), 70);
      return;
    }

    VyajNavStack.navigateFrom("proUnifiedDrawer", () => {
      feat.run();
    });
  }

  function readProfileSummary() {
    const biz = document.getElementById("profBizName")?.value?.trim() || localStorage.getItem("vyaj_biz_name") || "व्याज हिशोब वही";
    const owner = document.getElementById("profOwnerName")?.value?.trim() || localStorage.getItem("vyaj_owner_name") || "प्रोफाईल सेट करा";
    const email = document.getElementById("userEmailBadge")?.textContent?.trim() ||
      (typeof firebase !== "undefined" && firebase.auth && firebase.auth().currentUser ? firebase.auth().currentUser.email : "");
    return { biz, owner, email };
  }

  function ensureProDrawer() {
    let drawer = document.getElementById("proUnifiedDrawer");
    if (drawer) return drawer;

    const backdrop = document.createElement("div");
    backdrop.id = "proMenuBackdrop";
    backdrop.className = "pro-menu-backdrop hidden";
    backdrop.addEventListener("click", () => {
      closeProDrawer();
      VyajNavStack.popIfTop("proUnifiedDrawer");
    });
    document.body.appendChild(backdrop);

    drawer = document.createElement("aside");
    drawer.id = "proUnifiedDrawer";
    drawer.className = "pro-drawer hidden";
    drawer.innerHTML = `
      <div class="pro-menu-profile">
        <div class="pro-menu-prof-left" id="proMenuProfileTrigger">
          <div class="pro-menu-avatar" id="proMenuAvatar">व्</div>
          <div style="min-width:0;">
            <div class="pro-menu-biz" id="proMenuBizName">व्याज हिशोब वही</div>
            <div class="pro-menu-owner" id="proMenuOwnerSub">प्रोफाईल सेट करा ▸</div>
          </div>
        </div>
        <button type="button" id="proMenuQuickLock" class="pro-menu-lock-btn" title="अ‍ॅप लगेच लॉक करा">🔒</button>
      </div>

      <div class="pro-menu-wa-box">
        <label class="pro-menu-wa-lbl" for="proMenuWaInput">📱 माझा WhatsApp रिमाइंडर नंबर सेव्ह करा:</label>
        <div class="pro-menu-wa-row">
          <input type="tel" id="proMenuWaInput" placeholder="उदा. 919876543210" />
          <button type="button" id="proMenuWaSaveBtn" class="success sm">सेव्ह</button>
        </div>
        <div id="proMenuWaMsg" class="pro-menu-wa-msg"></div>
      </div>

      <div class="pro-menu-search-wrap">
        <input type="text" id="proMenuSearchInput" class="pro-menu-search-input" placeholder="🔍 फीचर शोधा (backup, pdf, emi, passbook, lock)..." autocomplete="off" />
        <div id="proMenuRecentStrip" class="pro-menu-recent-strip hidden"></div>
        <div id="proMenuSearchResults" class="pro-menu-search-results hidden"></div>
      </div>

      <div class="pro-menu-sec-lbl">⚡ मुख्य साधने</div>
      <div class="pro-menu-pinned-grid" id="proMenuPinnedGrid"></div>

      <div class="pro-menu-sec-lbl">📂 सर्व विभाग</div>
      <div class="pro-menu-acc-list" id="proMenuAccList"></div>

      <div class="pro-menu-ver">व्याज हिशोब वही • Business Pro V14.25</div>
    `;
    document.body.appendChild(drawer);

    document.getElementById("proMenuProfileTrigger")?.addEventListener("click", () => {
      launchMenuFeature(ALL_FEATURES.find((x) => x.id === "profile"));
    });
    document.getElementById("proMenuQuickLock")?.addEventListener("click", () => {
      launchMenuFeature(ALL_FEATURES.find((x) => x.id === "lock_app"));
    });

    document.getElementById("proMenuWaSaveBtn")?.addEventListener("click", () => {
      const val = (document.getElementById("proMenuWaInput")?.value || "").replace(/\D/g, "");
      const msgEl = document.getElementById("proMenuWaMsg");
      if (val.length < 10) {
        if (msgEl) { msgEl.textContent = "कृपया वैध १०–१२ अंकी नंबर टाका."; msgEl.style.color = "var(--danger)"; }
        return;
      }
      const formatted = val.length === 10 ? "91" + val : val;
      const origInput = document.getElementById("selfWaNumber");
      if (origInput) origInput.value = formatted;
      localStorage.setItem("vyaj_self_wa_num", formatted);
      document.getElementById("saveWaNumberBtn")?.click();
      if (msgEl) { msgEl.textContent = "✅ रिमाइंडर नंबर सेव्ह झाला!"; msgEl.style.color = "var(--accent-2)"; }
      setTimeout(() => { if (msgEl) msgEl.textContent = ""; }, 2500);
    });

    const searchInput = document.getElementById("proMenuSearchInput");
    searchInput?.addEventListener("focus", () => renderRecentChips(true));
    searchInput?.addEventListener("input", () => renderMenuSearchResults(searchInput.value));

    renderPinnedAndCategories();
    return drawer;
  }

  function renderPinnedAndCategories() {
    const pinnedEl = document.getElementById("proMenuPinnedGrid");
    if (pinnedEl) {
      pinnedEl.innerHTML = ALL_FEATURES.filter((f) => f.cat === "quick")
        .map((f) => `
          <button type="button" class="pro-pin-card" data-pro-feat="${esc(f.id)}">
            <span class="pro-pin-icon">${f.icon}</span>
            <span class="pro-pin-lbl">${esc(f.label)}</span>
          </button>
        `).join("");
    }

    const accEl = document.getElementById("proMenuAccList");
    if (accEl) {
      const groups = [
        { key: "general", icon: "⚙️", title: "General (सामान्य)", open: true, badgeId: "" },
        { key: "reports", icon: "📊", title: "Reports & Tools", open: false, badgeId: "" },
        { key: "backup", icon: "☁️", title: "Backup & Data", open: false, badgeId: "proMenuBackupBadge" },
        { key: "security", icon: "🛡️", title: "Security & Privacy", open: false, badgeId: "" }
      ];

      accEl.innerHTML = groups.map((g) => {
        const rowsHtml = ALL_FEATURES.filter((f) => f.cat === g.key).map((f) => {
          const extraBadge = f.id === "recycle" ? `<span class="badge" id="proMenuRecyclePill">0</span>` : "";
          return `
            <button type="button" class="pro-acc-item" data-pro-feat="${esc(f.id)}">
              <span>${f.icon} ${esc(f.label)}</span>
              <span class="pro-acc-right">${extraBadge}<span>▸</span></span>
            </button>
          `;
        }).join("");
        const headerBadge = g.badgeId ? `<span class="pro-acc-meta-badge" id="${g.badgeId}">Ready</span>` : "";
        return `
          <div class="pro-acc-group ${g.open ? "is-open" : ""}" data-acc-group="${g.key}">
            <button type="button" class="pro-acc-head" data-acc-toggle="${g.key}">
              <span>${g.icon} ${esc(g.title)}</span>
              <span class="pro-acc-right">${headerBadge}<span class="pro-acc-arrow">▾</span></span>
            </button>
            <div class="pro-acc-body">${rowsHtml}</div>
          </div>
        `;
      }).join("");

      accEl.querySelectorAll("[data-acc-toggle]").forEach((btn) => {
        btn.addEventListener("click", () => btn.closest(".pro-acc-group")?.classList.toggle("is-open"));
      });
    }

    document.getElementById("proUnifiedDrawer")?.querySelectorAll("[data-pro-feat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const feat = ALL_FEATURES.find((x) => x.id === btn.getAttribute("data-pro-feat"));
        launchMenuFeature(feat);
      });
    });
  }

  function renderRecentChips(forceShow) {
    const strip = document.getElementById("proMenuRecentStrip");
    if (!strip) return;
    const items = getRecentIds().map((id) => ALL_FEATURES.find((f) => f.id === id)).filter(Boolean);
    if (!items.length) { strip.classList.add("hidden"); strip.innerHTML = ""; return; }
    if (forceShow) strip.classList.remove("hidden");
    strip.innerHTML = `<span class="pro-recent-tag">नुकतेच:</span>` + items
      .map((f) => `<button type="button" class="pro-recent-chip" data-rec-feat="${esc(f.id)}">${f.icon} ${esc(f.label.split(" ")[0])}</button>`)
      .join("");
    strip.querySelectorAll("[data-rec-feat]").forEach((b) => {
      b.addEventListener("click", () => launchMenuFeature(ALL_FEATURES.find((x) => x.id === b.getAttribute("data-rec-feat"))));
    });
  }

  function renderMenuSearchResults(query) {
    const resBox = document.getElementById("proMenuSearchResults");
    if (!resBox) return;
    const q = String(query || "").trim().toLowerCase();
    if (!q) { resBox.classList.add("hidden"); resBox.innerHTML = ""; return; }

    const matches = ALL_FEATURES.filter((f) => {
      if (f.id === "reports_hub_sub") return false;
      return f.label.toLowerCase().includes(q) || f.kw.toLowerCase().includes(q);
    });

    resBox.classList.remove("hidden");
    if (!matches.length) {
      resBox.innerHTML = `<div class="muted" style="padding:8px; text-align:center; font-size:0.78rem;">कोणतेही फीचर सापडले नाही.</div>`;
      return;
    }

    resBox.innerHTML = matches.map((f) => `
      <button type="button" class="pro-search-hit" data-hit-feat="${esc(f.id)}">
        <span>${f.icon} ${esc(f.label)}</span>
        <span style="color:var(--accent);">उघडा ▸</span>
      </button>
    `).join("");

    resBox.querySelectorAll("[data-hit-feat]").forEach((b) => {
      b.addEventListener("click", () => launchMenuFeature(ALL_FEATURES.find((x) => x.id === b.getAttribute("data-hit-feat"))));
    });
  }

  function syncDrawerLiveData() {
    const prof = readProfileSummary();
    const bizEl = document.getElementById("proMenuBizName");
    const subEl = document.getElementById("proMenuOwnerSub");
    const avEl = document.getElementById("proMenuAvatar");
    if (bizEl) bizEl.textContent = prof.biz;
    if (subEl) subEl.textContent = prof.owner + (prof.email ? ` • ${prof.email}` : "");
    if (avEl) avEl.textContent = Array.from(prof.biz)[0] || "व्";

    const waInput = document.getElementById("proMenuWaInput");
    const origWa = document.getElementById("selfWaNumber")?.value || localStorage.getItem("vyaj_self_wa_num") || "";
    if (waInput && origWa) waInput.value = origWa;

    const recPill = document.getElementById("proMenuRecyclePill");
    if (recPill) recPill.textContent = document.getElementById("recycleCountBadge")?.textContent || "0";

    const bkBadge = document.getElementById("proMenuBackupBadge");
    if (bkBadge) bkBadge.textContent = getLastBackupShortText();

    renderRecentChips(false);
  }

  function openProDrawer(isRestore = false) {
    suppressLegacyDrawer();
    const drawer = ensureProDrawer();
    const backdrop = document.getElementById("proMenuBackdrop");
    syncDrawerLiveData();

    drawer.classList.remove("hidden");
    backdrop?.classList.remove("hidden");
    requestAnimationFrame(() => drawer.classList.add("open"));

    if (!isRestore) {
      VyajNavStack.pushDrawer("proUnifiedDrawer", () => closeProDrawer(), () => openProDrawer(true));
    }
    updateNewButtonVisibility();
  }

  function closeProDrawer() {
    const drawer = document.getElementById("proUnifiedDrawer");
    const backdrop = document.getElementById("proMenuBackdrop");
    if (drawer) { drawer.classList.remove("open"); drawer.classList.add("hidden"); }
    if (backdrop) backdrop.classList.add("hidden");
    updateNewButtonVisibility();
  }

  window.openProUnifiedMenu = () => openProDrawer(false);

  // १००% खात्रीशीर क्लिक इंटरसेप्टर (Window Capture Phase): जुन्या ☰ वर क्लिक करताच आपलाच मेन्यू उघडेल
  function bindGlobalMenuAndHomeCapture() {
    window.addEventListener("click", (ev) => {
      const target = ev.target;
      if (!target || !target.closest) return;

      // १. तळाचे Home बटण दाबल्यावर सर्व उघडे पॉपअप व Back Stack स्वच्छ करा
      const navBtn = target.closest("button, a");
      if (navBtn && !navBtn.closest("#proUnifiedDrawer")) {
        const nt = (navBtn.textContent || "").trim().toLowerCase();
        if (nt === "home" || nt.endsWith("home")) {
          VyajNavStack.clearAll();
          return;
        }
      }

      // २. हेडरमधील डाव्या ☰ बटनावर क्लिक पकडा (कोणत्याही टॅगमध्ये असले तरी)
      const header = target.closest("header");
      if (!header) return;
      if (
        target.closest("#notifBellBtn") ||
        target.closest("#topActions") ||
        target.id === "tBrandTitle" ||
        target.id === "networkBadge" ||
        target.id === "syncStatus"
      ) return;

      const clickable = target.closest("button, [role='button'], div, span, svg");
      if (!clickable || clickable === header) return;

      const rect = clickable.getBoundingClientRect();
      const txt = (clickable.textContent || "").trim();
      const idCls = `${clickable.id || ""} ${typeof clickable.className === "string" ? clickable.className : ""}`;
      const isHamburger =
        clickable.id === "proMainMenuBtn" ||
        txt === "☰" ||
        /menu|drawer|ham|side/i.test(idCls) ||
        (rect.left < 68 && rect.width > 12 && rect.width <= 60 && rect.height <= 60);

      if (isHamburger) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        suppressLegacyDrawer();
        openProDrawer(false);
      }
    }, true);
  }

  // =========================================================================
  // भाग ४: डॅशबोर्ड पॉलिश, ४-रंगी Reports Hub, Toggle Settings व Glass New
  // =========================================================================
  function cleanDuplicateControls() {
    document.querySelectorAll("button, a, div").forEach((el) => {
      if (el.id === "uiProNewBtn") return;
      const txt = (el.textContent || "").trim();
      if (txt === "+" && window.getComputedStyle(el).position === "fixed") {
        if (el.style.display !== "none") el.style.display = "none";
      }
    });

    document.querySelectorAll("nav button, nav a, [class*='bottom'] button, [class*='bottom'] a, [id*='bottom'] button").forEach((el) => {
      const txt = (el.textContent || "").trim().toLowerCase();
      if (txt === "menu" || txt.endsWith("menu")) {
        if (el.style.display !== "none") el.style.display = "none";
      }
    });

    document.querySelectorAll(".modal-card button").forEach((btn) => {
      const t = (btn.textContent || "").trim();
      if (t === "✕ बंद" || t === "✕" || t === "बंद" || t === "बंद करा") {
        if (!btn.classList.contains("ui-pro-hide-close")) btn.classList.add("ui-pro-hide-close");
      }
    });
  }

  function enhanceCustomerCards() {
    const listEl = document.getElementById("borrowersList");
    if (!listEl) return;

    listEl.querySelectorAll(".borrower-item").forEach((card) => {
      if (!card.querySelector(".pro-avatar-badge")) {
        const nameEl = card.querySelector("strong, h4, h3");
        if (nameEl) {
          const rawName = (nameEl.textContent || "").trim();
          const avatar = document.createElement("span");
          avatar.className = "pro-avatar-badge";
          avatar.textContent = rawName ? Array.from(rawName)[0].toUpperCase() : "👤";
          nameEl.parentNode.insertBefore(avatar, nameEl);
        }
      }

      card.querySelectorAll(".row").forEach((row) => {
        if (row.classList.contains("pro-action-strip")) return;
        const hasFormField = row.querySelector("input, select, textarea");
        const btnCount = row.querySelectorAll("button").length;
        if (!hasFormField && btnCount >= 2) row.classList.add("pro-action-strip");
      });
    });
  }

  function ensureProReportsHubModal() {
    let modal = document.getElementById("proReportsHubModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "proReportsHubModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `
      <div class="modal-card" style="max-width:600px;">
        <div class="row" style="justify-content:space-between; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--border);">
          <h3 style="margin:0; color:var(--text);">📊 बिझनेस रिपोर्ट्स हब</h3>
          <span class="badge paid">Live Sync</span>
        </div>
        <div class="pro-rep-grid">
          <div class="pro-rep-card rep-emerald" id="repCardProfit">
            <span class="pro-rep-icon">💚</span>
            <div class="pro-rep-title">एकूण नफा (जमा व्याज)</div>
            <div class="pro-rep-val" id="repValProfit">₹0</div>
            <div class="pro-rep-sub" id="repSubProfit">यादी पहा ▸</div>
          </div>
          <div class="pro-rep-card rep-teal" id="repCardMonthly">
            <span class="pro-rep-icon">📈</span>
            <div class="pro-rep-title">मासिक वसुली</div>
            <div class="pro-rep-val" id="repValMonthly">₹0</div>
            <div class="pro-rep-sub" id="repSubMonthly" style="color:var(--accent);">0% पूर्ण</div>
          </div>
          <div class="pro-rep-card rep-coral" id="repCardPending">
            <span class="pro-rep-icon">🔴</span>
            <div class="pro-rep-title">एकूण बाकी व्याज</div>
            <div class="pro-rep-val" id="repValPending">₹0</div>
            <div class="pro-rep-sub" id="repSubPending" style="color:var(--danger);">High-Risk: 0</div>
          </div>
          <div class="pro-rep-card rep-amber" id="repCardPrincipal">
            <span class="pro-rep-icon">💰</span>
            <div class="pro-rep-title">एकूण मुद्दल</div>
            <div class="pro-rep-val" id="repValPrincipal">₹0</div>
            <div class="pro-rep-sub" id="repSubPrincipal" style="color:var(--gold);">खाती: 0</div>
          </div>
        </div>
        <div style="font-size:0.8rem; font-weight:800; color:var(--muted); margin-bottom:8px;">⚡ Quick Reports & Exports</div>
        <div class="pro-quick-list">
          <div class="pro-quick-item" id="repQuickPdf"><span>🖨️ चालू महिन्याचा PDF रिपोर्ट</span><span style="color:var(--accent);">▸</span></div>
          <div class="pro-quick-item" id="repQuickMonthCsv"><span>📊 चालू महिन्याची Excel / CSV फाईल</span><span style="color:var(--accent);">▸</span></div>
          <div class="pro-quick-item" id="repQuickAllCsv"><span>📑 संपूर्ण खातेवही (All-Time CSV)</span><span style="color:var(--accent);">▸</span></div>
          <div class="pro-quick-item" id="repQuickPnl"><span>📈 Profit & Loss (नफा-तोटा अहवाल)</span><span style="color:var(--accent);">▸</span></div>
          <div class="pro-quick-item" id="repQuickBackup"><span>☁️ Cloud Backup, Restore व Import</span><span style="color:var(--accent);">▸</span></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        VyajNavStack.popIfTop("proReportsHubModal");
      }
    });

    const stepFromHub = (fn) => VyajNavStack.navigateFrom("proReportsHubModal", fn);
    document.getElementById("repCardProfit")?.addEventListener("click", () => stepFromHub(() => { if (typeof window.openVyajInterestList === "function") window.openVyajInterestList(); }));
    document.getElementById("repCardMonthly")?.addEventListener("click", () => stepFromHub(() => document.getElementById("tileInterest")?.click()));
    document.getElementById("repCardPending")?.addEventListener("click", () => stepFromHub(() => document.getElementById("tilePending")?.click()));
    document.getElementById("repCardPrincipal")?.addEventListener("click", () => stepFromHub(() => document.getElementById("tilePrincipal")?.click()));
    document.getElementById("repQuickPdf")?.addEventListener("click", () => document.getElementById("printMonthlyPdfBtn")?.click());
    document.getElementById("repQuickMonthCsv")?.addEventListener("click", () => document.getElementById("exportMonthlyCsvBtn")?.click());
    document.getElementById("repQuickAllCsv")?.addEventListener("click", () => document.getElementById("exportAllCsvBtn")?.click());
    document.getElementById("repQuickPnl")?.addEventListener("click", () => stepFromHub(() => document.getElementById("openPnlBtn")?.click()));
    document.getElementById("repQuickBackup")?.addEventListener("click", () => stepFromHub(() => openToolPane("reportsSection", "☁️ Cloud Backup, Restore व Import")));

    return modal;
  }

  function openProReportsHub() {
    const modal = ensureProReportsHubModal();
    const s = window.VyajAnalyticsStats || {};
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt("repValProfit", fmtInr(s.lifetimeProfit || 0));
    setTxt("repValMonthly", fmtInr(s.totalCollected || 0));
    setTxt("repSubMonthly", `${s.recoveryPct || 0}% वसुली पूर्ण`);
    setTxt("repValPending", fmtInr(s.totalPending || 0));
    setTxt("repSubPending", `High-Risk खाती: ${s.highRiskCount || 0}`);
    setTxt("repValPrincipal", fmtInr(s.totalPrincipal || 0));
    setTxt("repSubPrincipal", `सक्रिय खाती: ${s.activeCount || 0}`);
    modal.classList.remove("hidden");
    updateNewButtonVisibility();
  }
  window.openProReportsHub = openProReportsHub;

  function upgradeSettingsWithToggles() {
    const settingsModal = document.getElementById("settingsModal");
    if (!settingsModal) return;
    const oldThemeBtn = document.getElementById("setToggleThemeBtn");
    const oldHideBtn = document.getElementById("setToggleHideBtn");

    if (!document.getElementById("proSettingsToggles")) {
      const targetRow = oldThemeBtn ? oldThemeBtn.closest(".row") : null;
      if (targetRow) {
        targetRow.classList.add("hidden");
        const toggleGroup = document.createElement("div");
        toggleGroup.id = "proSettingsToggles";
        toggleGroup.className = "pro-toggle-group";
        toggleGroup.innerHTML = `
          <div class="pro-toggle-row">
            <div class="pro-toggle-info">
              <span class="pro-toggle-title">🌙 Smoked Night Mode</span>
              <span class="pro-toggle-desc" id="proThemeDesc">रात्रीसाठी ब्लॅक ग्लास • दिवसासाठी वॉर्म पेपर</span>
            </div>
            <label class="pro-switch"><input type="checkbox" id="proToggleDark" /><span class="pro-slider"></span></label>
          </div>
          <div class="pro-toggle-row">
            <div class="pro-toggle-info">
              <span class="pro-toggle-title">👁️ रकमा लपवा (Privacy Mode)</span>
              <span class="pro-toggle-desc">डॅशबोर्डवरील रकमा सुरक्षितपणे लपवा</span>
            </div>
            <label class="pro-switch"><input type="checkbox" id="proToggleHideAmt" /><span class="pro-slider"></span></label>
          </div>
          <div class="pro-toggle-row">
            <div class="pro-toggle-info">
              <span class="pro-toggle-title">🔔 10/4/6 Push अलर्ट</span>
              <span class="pro-toggle-desc">वायद्याचे वेळेवर मोबाईल नोटिफिकेशन</span>
            </div>
            <label class="pro-switch"><input type="checkbox" id="proTogglePush" /><span class="pro-slider"></span></label>
          </div>
        `;
        targetRow.parentNode.insertBefore(toggleGroup, targetRow);

        document.getElementById("proToggleDark")?.addEventListener("change", () => {
          (oldThemeBtn || document.getElementById("toggleThemeBtn"))?.click();
          setTimeout(syncSettingsToggleStates, 80);
        });
        document.getElementById("proToggleHideAmt")?.addEventListener("change", () => {
          (oldHideBtn || document.getElementById("toggleHideAmtBtn"))?.click();
          setTimeout(syncSettingsToggleStates, 80);
        });
        document.getElementById("proTogglePush")?.addEventListener("change", (ev) => {
          const msgEl = document.getElementById("setStatusMsg");
          if (ev.target.checked) {
            (document.getElementById("enableProPushBtn") || document.getElementById("enableNotifBtn"))?.click();
          } else {
            localStorage.setItem("vyaj_fcm_enabled", "false");
            if (msgEl) msgEl.textContent = "🔕 Push अलर्ट तात्पुरते बंद केले आहेत.";
          }
          setTimeout(syncSettingsToggleStates, 300);
        });
      }
    }
    syncSettingsToggleStates();
  }

  function syncSettingsToggleStates() {
    const darkChk = document.getElementById("proToggleDark");
    const themeDesc = document.getElementById("proThemeDesc");
    if (darkChk) {
      const isNight = !document.body.classList.contains("light-mode");
      if (darkChk.checked !== isNight) darkChk.checked = isNight;
      const desired = isNight ? "सध्या: Smoked Black Glass (Night)" : "सध्या: Warm Eye-Comfort Paper (Day)";
      if (themeDesc && themeDesc.textContent !== desired) themeDesc.textContent = desired;
    }
    const hideChk = document.getElementById("proToggleHideAmt");
    if (hideChk) {
      const sample = (document.getElementById("dashTotalPrincipal")?.textContent || "").trim();
      const isHidden = sample.includes("*") || sample.includes("•");
      if (hideChk.checked !== isHidden) hideChk.checked = isHidden;
    }
    const pushChk = document.getElementById("proTogglePush");
    if (pushChk) {
      const isOn = localStorage.getItem("vyaj_fcm_enabled") === "true" && "Notification" in window && Notification.permission === "granted";
      if (pushChk.checked !== isOn) pushChk.checked = isOn;
    }
  }

  function createGlassNewButton() {
    if (document.getElementById("uiProNewBtn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "uiProNewBtn";
    btn.className = "hidden";
    btn.innerHTML = `<span style="font-size:1.05rem;">＋</span><span>New</span>`;
    btn.title = "नवीन ग्राहक / कर्ज नोंद जोडा";
    btn.addEventListener("click", () => {
      openToolPane("addBorrowerSection", "➕ नवीन ग्राहक / कर्ज नोंद");
      updateNewButtonVisibility();
    });
    document.body.appendChild(btn);
  }

  function updateNewButtonVisibility() {
    const newBtn = document.getElementById("uiProNewBtn");
    const appScreen = document.getElementById("appScreen");
    if (!newBtn || !appScreen) return;
    const shouldShow = !appScreen.classList.contains("hidden") && !VyajNavStack.hasActiveOverlay();
    if (newBtn.classList.contains("hidden") === shouldShow) {
      newBtn.classList.toggle("hidden", !shouldShow);
    }
  }
  window.updateVyajNewBtnVisibility = updateNewButtonVisibility;

  // सुरक्षित Debounced Observer
  function observeAppChanges() {
    const obs = new MutationObserver(() => {
      if (!isInternalNav) {
        clearTimeout(navSyncTimer);
        navSyncTimer = setTimeout(syncAutoModals, 55);
      }
      clearTimeout(enhanceTimer);
      enhanceTimer = setTimeout(() => {
        try {
          suppressLegacyDrawer();
          updateNewButtonVisibility();
          syncSettingsToggleStates();
          cleanDuplicateControls();
          enhanceCustomerCards();
        } catch (err) {
          console.error("UI-Pro Observer Error:", err);
        }
      }, 90);
    });

    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function initUiPro() {
    try {
      injectProMenuCss();
      bindGlobalMenuAndHomeCapture();
      ensureProDrawer();
      createGlassNewButton();
      upgradeSettingsWithToggles();
      suppressLegacyDrawer();
      cleanDuplicateControls();
      enhanceCustomerCards();
      updateNewButtonVisibility();
      observeAppChanges();
    } catch (err) {
      console.error("UI-Pro Init Error:", err);
    }

    setTimeout(ensureSplashHidden, 900);
    setTimeout(() => {
      suppressLegacyDrawer();
      upgradeSettingsWithToggles();
      cleanDuplicateControls();
      enhanceCustomerCards();
      updateNewButtonVisibility();
      ensureSplashHidden();
    }, 1600);
  }

  window.addEventListener("load", () => setTimeout(ensureSplashHidden, 500));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUiPro);
  } else {
    initUiPro();
  }
})();
