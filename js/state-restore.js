// व्याज हिशोब वही - १००% Universal Refresh State Restore + Pull-to-Refresh संरक्षण (js/state-restore.js - V14.27)
(function () {
  const STATE_KEY = "vyaj_active_screen_state_v1";
  let restoreCompleted = false;
  let pendingState = null;
  let saveTimer = null;
  let lastDrillType = "";
  let lastInvoiceBid = "";

  // रिफ्रेश होताच जुनी सेव्ह स्थिती लगेच सुरक्षित वाचून घ्या (पुसली जाऊ नये म्हणून)
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // जास्तीत जास्त २ तासांपर्यंतची सेशन स्थिती वैध माना
      if (parsed && parsed.type && (Date.now() - Number(parsed.ts || 0) < 2 * 60 * 60 * 1000)) {
        pendingState = parsed;
      }
    }
  } catch (_) {}

  function clearSavedState() {
    try { sessionStorage.removeItem(STATE_KEY); } catch (_) {}
    pendingState = null;
  }

  function writeSavedState(obj) {
    if (!restoreCompleted) return;
    try {
      if (!obj) sessionStorage.removeItem(STATE_KEY);
      else sessionStorage.setItem(STATE_KEY, JSON.stringify({ ...obj, ts: Date.now() }));
    } catch (_) {}
  }

  // पॉपअप किंवा मेन्यू उघडे असताना चुकून Pull-to-Refresh होऊ नये यासाठी CSS
  function injectScrollProtectionCss() {
    if (document.getElementById("vyajStateRestoreCss")) return;
    const st = document.createElement("style");
    st.id = "vyajStateRestoreCss";
    st.textContent = `
      .modal-backdrop, .modal-card, .pro-drawer {
        overscroll-behavior-y: contain !important;
      }
      body.vyaj-overlay-lock {
        overscroll-behavior-y: none !important;
      }
    `;
    document.head.appendChild(st);
  }

  function getTopVisibleModal() {
    const list = Array.from(document.querySelectorAll(".modal-backdrop")).filter(
      (m) => !m.classList.contains("hidden") && window.getComputedStyle(m).display !== "none"
    );
    return list.length ? list[list.length - 1] : null;
  }

  function isProDrawerOpen() {
    const d = document.getElementById("proUnifiedDrawer");
    return Boolean(d && !d.classList.contains("hidden") && d.classList.contains("open"));
  }

  // सध्या स्क्रीनवर कोणता ऑप्शन उघडा आहे ते ओळखून सेव्ह करा (भविष्यातील नवीन Modals आपोआप पकडले जातील)
  function captureCurrentState() {
    const appScreen = document.getElementById("appScreen");
    const isAppVisible = appScreen && !appScreen.classList.contains("hidden");
    const topModal = getTopVisibleModal();
    const drawerOpen = isProDrawerOpen();

    document.body.classList.toggle("vyaj-overlay-lock", Boolean(topModal || drawerOpen));

    if (!restoreCompleted || !isAppVisible) return;

    if (topModal && topModal.id) {
      const id = topModal.id;
      if (id === "proCustomerDetailsModal" && window.vyajLastDetailBorrowerId) {
        writeSavedState({ type: "customer_details", id, borrowerId: window.vyajLastDetailBorrowerId });
        return;
      }
      if (id === "proInvoiceModal" && lastInvoiceBid) {
        writeSavedState({ type: "invoice", id, borrowerId: lastInvoiceBid });
        return;
      }
      if (id === "proReportsHubModal") {
        writeSavedState({ type: "reports_hub", id });
        return;
      }
      if (id === "interestContributorsModal") {
        writeSavedState({ type: "interest_list", id });
        return;
      }
      if (id === "statDrillModal" && lastDrillType) {
        writeSavedState({ type: "stat_drill", id, drillType: lastDrillType });
        return;
      }
      if (id === "toolSectionModal") {
        const activePane = topModal.querySelector(".tool-sec-pane:not(.hidden)");
        const titleTxt = document.getElementById("toolSectionModalTitle")?.textContent || "साधने";
        if (activePane && activePane.id) {
          writeSavedState({ type: "tool_pane", id, paneId: activePane.id, paneTitle: titleTxt });
          return;
        }
      }
      // भविष्यातील कोणत्याही नवीन पॉपअपसाठी Universal Auto-Save
      writeSavedState({ type: "generic_modal", id });
      return;
    }

    if (drawerOpen) {
      writeSavedState({ type: "drawer", id: "proUnifiedDrawer" });
      return;
    }

    // कोणतेही पॉपअप उघडे नसेल तर डॅशबोर्ड स्थिती (क्लिअर करा)
    writeSavedState(null);
  }

  // Invoice आणि Drill क्लिकचे ID आपोआप ट्रॅक करा
  function hookDynamicTriggers() {
    if (typeof window.openInvoiceReceipt === "function" && !window.openInvoiceReceipt._srWrapped) {
      const origFn = window.openInvoiceReceipt;
      const wrapped = function (bId) {
        lastInvoiceBid = bId;
        return origFn.apply(this, arguments);
      };
      wrapped._srWrapped = true;
      window.openInvoiceReceipt = wrapped;
      window.openReceiptCard = wrapped;
    }

    // सुरक्षा नियम: Lock, Logout किंवा Home दाबताच सेव्ह स्थिती लगेच पुसा
    document.addEventListener("click", (ev) => {
      const t = ev.target && ev.target.closest ? ev.target.closest("button, a, [data-stat-drill]") : null;
      if (!t) return;

      const drill = t.getAttribute("data-stat-drill");
      if (drill) lastDrillType = drill;

      const txt = (t.textContent || "").trim().toLowerCase();
      if (
        t.id === "lockBtn" ||
        t.id === "proMenuQuickLock" ||
        txt === "home" ||
        txt.endsWith("home") ||
        txt.includes("लॉगआउट") ||
        txt.includes("sign out")
      ) {
        clearSavedState();
      }
    }, true);
  }

  // सेव्ह केलेली स्थिती रिफ्रेश नंतर पुन्हा उघडा
  function executeRestore(st) {
    if (!st) return;
    try {
      if (st.type === "drawer" && typeof window.openProUnifiedMenu === "function") {
        window.openProUnifiedMenu();
      } else if (st.type === "reports_hub" && typeof window.openProReportsHub === "function") {
        window.openProReportsHub();
      } else if (st.type === "interest_list" && typeof window.openVyajInterestList === "function") {
        window.openVyajInterestList();
      } else if (st.type === "customer_details" && st.borrowerId && typeof window.openProCustomerDetails === "function") {
        window.openProCustomerDetails(st.borrowerId);
      } else if (st.type === "invoice" && st.borrowerId && typeof window.openInvoiceReceipt === "function") {
        lastInvoiceBid = st.borrowerId;
        window.openInvoiceReceipt(st.borrowerId);
      } else if (st.type === "stat_drill" && st.drillType) {
        lastDrillType = st.drillType;
        document.querySelector(`[data-stat-drill="${st.drillType}"]`)?.click();
      } else if (st.type === "tool_pane" && st.paneId) {
        const modal = document.getElementById("toolSectionModal");
        const pane = document.getElementById(st.paneId);
        const titleEl = document.getElementById("toolSectionModalTitle");
        if (modal && pane) {
          document.querySelectorAll(".tool-sec-pane").forEach((p) => p.classList.add("hidden"));
          pane.classList.remove("hidden");
          if (titleEl && st.paneTitle) titleEl.textContent = st.paneTitle;
          modal.classList.remove("hidden");
        }
      } else if (st.type === "generic_modal" && st.id) {
        if (st.id === "pnlModal") document.getElementById("openPnlBtn")?.click();
        else if (st.id === "securityModal") document.getElementById("openSecurityDashBtn")?.click();
        else if (st.id === "notifModal") document.getElementById("notifBellBtn")?.click();
        else document.getElementById(st.id)?.classList.remove("hidden");
      }
    } catch (err) {
      console.error("State Restore Error:", err);
    }
  }

  // Firebase डेटा व मुख्य स्क्रीन तयार होताच अचूक रिस्टोअर करा
  function waitAndRestore() {
    if (!pendingState) {
      restoreCompleted = true;
      return;
    }

    const needsBorrowerData = ["customer_details", "invoice", "reports_hub", "interest_list", "stat_drill"].includes(pendingState.type);
    const startTs = Date.now();

    const timer = setInterval(() => {
      const appScreen = document.getElementById("appScreen");
      const authScreen = document.getElementById("authScreen");
      const isAppReady = appScreen && !appScreen.classList.contains("hidden");
      const isLoginVisible = authScreen && !authScreen.classList.contains("hidden");
      const elapsed = Date.now() - startTs;

      // जर युजर लॉगआउट/लॉक स्क्रीनवर असेल तर रिस्टोअर करू नका
      if (isLoginVisible && !isAppReady && elapsed > 2500) {
        clearInterval(timer);
        restoreCompleted = true;
        return;
      }

      const borrowersLoaded = window.HishobBridge &&
        typeof window.HishobBridge.getBorrowers === "function" &&
        (window.HishobBridge.getBorrowers() || []).length > 0;

      const readyNow = isAppReady && (!needsBorrowerData || borrowersLoaded || elapsed > 4500);

      if (readyNow || elapsed > 7000) {
        clearInterval(timer);
        const stateToApply = pendingState;
        pendingState = null;
        if (isAppReady && stateToApply) {
          setTimeout(() => {
            executeRestore(stateToApply);
            setTimeout(() => { restoreCompleted = true; captureCurrentState(); }, 250);
          }, 180);
        } else {
          restoreCompleted = true;
        }
      }
    }, 180);
  }

  function initStateRestore() {
    injectScrollProtectionCss();
    hookDynamicTriggers();
    waitAndRestore();

    const obs = new MutationObserver(() => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(captureCurrentState, 110);
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });

    setTimeout(hookDynamicTriggers, 1200);
  }

  window.VyajStateRestore = {
    clear: clearSavedState,
    capture: captureCurrentState
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStateRestore);
  } else {
    initStateRestore();
  }
})();
