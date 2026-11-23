// व्याज हिशोब वही - Instagram / Facebook स्टाईल Smart Background State & Instant Resume Switcher (js/pro/smart-switcher.js - V14.36)
(function () {
  const MODAL_LABELS = {
    settingsModal: "⚙️ सेटिंग्ज",
    profileModal: "👤 प्रोफाईल",
    proReportsHubModal: "📊 रिपोर्ट्स हब",
    proCustomerDetailsModal: "📋 All Details",
    proPendingSplitModal: "📊 बाकी व्याज",
    proPastDuesModal: "📅 बाकी महिने",
    proDueRadarModal: "🗓️ व्याज रडार",
    proGroupHubModal: "🏢 विभाग/जामीनदार",
    proCashflowModal: "📊 कॅशफ्लो अंदाज",
    proInvoiceModal: "🧾 QR पावती",
    passbookModal: "📖 Passbook",
    pnlModal: "📈 P&L अहवाल",
    securityModal: "🛡️ Security",
    notifModal: "🔔 सूचना",
    editModal: "✏️ Edit",
    toolSectionModal: "🧰 साधने",
    helpGuideModal: "❓ गाईड",
    proSnapshotsModal: "🕒 Snapshots"
  };

  let currentActiveSnapshot = null;
  let minimizedSnapshot = null;
  let watchTimer = null;

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function injectSwitcherCss() {
    if (document.getElementById("vyajSmartSwitcherCss")) return;
    const st = document.createElement("style");
    st.id = "vyajSmartSwitcherCss";
    st.textContent = `
      .ss-resume-bar {
        position: fixed; left: 12px; bottom: 64px; z-index: 44;
        display: inline-flex; align-items: center; gap: 6px;
        max-width: calc(100vw - 115px);
        padding: 6px 8px 6px 11px; border-radius: 999px;
        background: rgba(20, 23, 31, 0.92);
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(125, 211, 252, 0.45);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
        animation: ssSlideUp 0.2s ease-out;
      }
      body.light-mode .ss-resume-bar {
        background: rgba(251, 250, 247, 0.96);
        border-color: #0f766e;
        box-shadow: 0 6px 18px rgba(31, 36, 45, 0.16);
      }
      .ss-resume-bar.hidden { display: none !important; }
      @keyframes ssSlideUp {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .ss-resume-btn {
        background: transparent !important; border: none !important; padding: 0 !important;
        color: var(--text) !important; font-size: 0.73rem !important; font-weight: 800 !important;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;
        display: inline-flex; align-items: center; gap: 5px;
      }
      .ss-resume-dot {
        width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex-shrink: 0;
      }
      .ss-dismiss-btn {
        width: 20px; height: 20px; border-radius: 50% !important; padding: 0 !important;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 0.7rem !important; font-weight: 900 !important;
        background: rgba(255, 255, 255, 0.1) !important; color: var(--muted) !important;
        border: none !important; flex-shrink: 0;
      }
      body.light-mode .ss-dismiss-btn { background: #e5e1d8 !important; color: #334155 !important; }
    `;
    document.head.appendChild(st);
  }

  function getTopVisibleModal() {
    const list = Array.from(document.querySelectorAll(".modal-backdrop")).filter(
      (m) => m.id && !m.classList.contains("hidden") && window.getComputedStyle(m).display !== "none"
    );
    return list.length ? list[list.length - 1] : null;
  }

  function buildModalSnapshot(modalEl) {
    if (!modalEl || !modalEl.id) return null;
    const id = modalEl.id;
    let label = MODAL_LABELS[id] || "मागील स्क्रीन";
    let paneId = "";
    let paneTitle = "";

    if (id === "toolSectionModal") {
      const activePane = modalEl.querySelector(".tool-sec-pane:not(.hidden)");
      paneId = activePane ? activePane.id : "";
      paneTitle = (document.getElementById("toolSectionModalTitle")?.textContent || "").trim();
      if (paneTitle) label = paneTitle.slice(0, 22);
    }

    const card = modalEl.querySelector(".modal-card");
    const scrollTop = card ? card.scrollTop : 0;

    return {
      id,
      label,
      paneId,
      paneTitle,
      scrollTop,
      ts: Date.now()
    };
  }

  function ensureResumeBar() {
    let bar = document.getElementById("proSmartResumeBar");
    if (bar) return bar;

    bar = document.createElement("div");
    bar.id = "proSmartResumeBar";
    bar.className = "ss-resume-bar hidden";
    bar.innerHTML = `
      <button type="button" id="ssResumeTrigger" class="ss-resume-btn">
        <span class="ss-resume-dot"></span>
        <span id="ssResumeLabel">↩️ परत जा</span>
      </button>
      <button type="button" id="ssDismissTrigger" class="ss-dismiss-btn" title="बंद करा">✕</button>
    `;
    document.body.appendChild(bar);

    document.getElementById("ssResumeTrigger")?.addEventListener("click", () => {
      if (!minimizedSnapshot) return;
      const snap = minimizedSnapshot;
      minimizedSnapshot = null;
      renderResumeBar();
      restoreSnapshot(snap);
    });

    document.getElementById("ssDismissTrigger")?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      minimizedSnapshot = null;
      renderResumeBar();
    });

    return bar;
  }

  function renderResumeBar() {
    const bar = ensureResumeBar();
    const appScreen = document.getElementById("appScreen");
    const isAppVisible = appScreen && !appScreen.classList.contains("hidden");
    const hasOpenModal = Boolean(getTopVisibleModal());

    // फक्त मुख्य डॅशबोर्डवर असताना आणि एखादी स्क्रीन Minimize केलेली असतानाच चिप दाखवा
    if (!isAppVisible || hasOpenModal || !minimizedSnapshot) {
      bar.classList.add("hidden");
      return;
    }

    const lbl = document.getElementById("ssResumeLabel");
    if (lbl) lbl.textContent = `↩️ ${minimizedSnapshot.label}`;
    bar.classList.remove("hidden");
  }

  function restoreSnapshot(snap) {
    if (!snap || !snap.id) return;
    const modal = document.getElementById(snap.id);
    if (!modal) return;

    if (snap.id === "toolSectionModal" && snap.paneId) {
      document.querySelectorAll(".tool-sec-pane").forEach((p) => p.classList.add("hidden"));
      document.getElementById(snap.paneId)?.classList.remove("hidden");
      const tEl = document.getElementById("toolSectionModalTitle");
      if (tEl && snap.paneTitle) tEl.textContent = snap.paneTitle;
    }

    modal.classList.remove("hidden");
    if (window.VyajNavStack) window.VyajNavStack.pushModal(snap.id);

    // जिथे स्क्रोल सोडले होते नेमके तिथेच परत आणा
    const card = modal.querySelector(".modal-card");
    if (card && snap.scrollTop > 0) {
      requestAnimationFrame(() => { card.scrollTop = snap.scrollTop; });
    }
  }

  function syncSwitcherState() {
    const topModal = getTopVisibleModal();

    if (topModal) {
      // सध्या उघड्या असलेल्या मॉडेलची ताजी स्थिती ट्रॅक करा
      currentActiveSnapshot = buildModalSnapshot(topModal);
    } else if (currentActiveSnapshot) {
      // युजर बॅक येऊन मुख्य स्क्रीनवर आला -> आधीची स्क्रीन बॅकग्राउंडमध्ये Minimize करा
      minimizedSnapshot = { ...currentActiveSnapshot };
      currentActiveSnapshot = null;
    }

    renderResumeBar();
  }

  function initSmartSwitcher() {
    injectSwitcherCss();
    ensureResumeBar();

    // स्क्रोल करताना ताजी स्क्रोल पोझिशन जतन करा
    document.addEventListener("scroll", (ev) => {
      const card = ev.target && ev.target.classList && ev.target.classList.contains("modal-card") ? ev.target : null;
      if (card && currentActiveSnapshot) {
        currentActiveSnapshot.scrollTop = card.scrollTop;
      }
    }, true);

    // Lock / Logout दाबल्यास Minimize स्थिती सुरक्षितपणे स्वच्छ करा
    document.addEventListener("click", (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest("button") : null;
      if (!btn) return;
      if (btn.id === "lockBtn" || btn.id === "proMenuQuickLock") {
        currentActiveSnapshot = null;
        minimizedSnapshot = null;
        renderResumeBar();
      }
    }, true);

    const obs = new MutationObserver(() => {
      clearTimeout(watchTimer);
      watchTimer = setTimeout(syncSwitcherState, 80);
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initSmartSwitcher);
  else initSmartSwitcher();
})();
