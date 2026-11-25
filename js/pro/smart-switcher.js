// व्याज हिशोब वही - Smart Resume Switcher (कार्ड/पॉपअप उघडल्यावर ऑटो-हाइड • ०% ओव्हरलॅप) (js/pro/smart-switcher.js - V15.0)
(function () {
  const FRIENDLY_LABELS = {
    proUdhaariModal: "🤝 उधारी",
    proMonthActivityModal: "📋 महिना नोंदी",
    proPendingSplitModal: "📊 बाकी व्याज",
    proRadarModal: "📡 व्याज रडार",
    proSnapshotsModal: "🕒 बॅकअप Vault",
    statDrillModal: "📊 तपशील यादी",
    settingsModal: "⚙️ Settings",
    profileModal: "👤 प्रोफाईल",
    helpGuideModal: "❓ गाईड",
    pnlModal: "📈 P&L",
    securityModal: "🛡️ Security",
    notifModal: "🔔 रिमाइंडर",
    toolSectionModal: "🧰 मागील साधन"
  };

  const IGNORE_MODALS = new Set([
    "editModal",
    "docsModal",
    "passbookModal",
    "smartInfoModal",
    "versionModal",
    "proPastDuesModal"
  ]);

  let currentOpenModalId = null;
  let lastClosedFeature = null; // { id, label }
  let isDismissed = false;
  let syncTimer = null;

  function injectSwitcherCss() {
    if (document.getElementById("vyajSmartSwitcherCss")) return;
    const st = document.createElement("style");
    st.id = "vyajSmartSwitcherCss";
    st.textContent = `
      #proSmartSwitcherChip {
        position: fixed;
        left: 12px;
        bottom: 66px;
        z-index: 38;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(18, 21, 28, 0.96);
        border: 1px solid rgba(125, 211, 252, 0.42);
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.55);
        color: #eceff4;
        font-size: 0.72rem;
        font-weight: 800;
        cursor: pointer;
        max-width: 58vw;
      }
      body.light-mode #proSmartSwitcherChip {
        background: #1f242d;
        color: #fbfaf7;
      }
      #proSmartSwitcherChip.hidden { display: none !important; }
      .ss-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: #7dd3fc; flex-shrink: 0;
      }
      .ss-label {
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .ss-close {
        margin-left: 2px;
        width: 18px; height: 18px; border-radius: 50%;
        display: inline-flex; align-items: center; justify-content: center;
        background: rgba(255, 255, 255, 0.14);
        color: #fff; font-size: 0.66rem; border: none; padding: 0; cursor: pointer;
      }
    `;
    document.head.appendChild(st);
  }

  function ensureChipEl() {
    let chip = document.getElementById("proSmartSwitcherChip");
    if (chip) return chip;

    chip = document.createElement("div");
    chip.id = "proSmartSwitcherChip";
    chip.className = "hidden";
    chip.innerHTML = `
      <span class="ss-dot"></span>
      <span class="ss-label" id="proSmartSwitcherTxt">↩️ मागील स्क्रीन</span>
      <button type="button" class="ss-close" id="proSmartSwitcherClose" title="बंद करा">✕</button>
    `;
    document.body.appendChild(chip);

    chip.addEventListener("click", (ev) => {
      if (ev.target && ev.target.closest("#proSmartSwitcherClose")) {
        ev.stopPropagation();
        isDismissed = true;
        chip.classList.add("hidden");
        return;
      }
      reopenLastFeature();
    });

    return chip;
  }

  function getModalLabel(modalEl) {
    if (!modalEl || !modalEl.id) return "मागील स्क्रीन";
    if (modalEl.id === "toolSectionModal") {
      const t = document.getElementById("toolSectionModalTitle")?.textContent?.trim();
      return t ? `↩️ ${t}` : "↩️ मागील साधन";
    }
    const base = FRIENDLY_LABELS[modalEl.id];
    return base ? `↩️ ${base}` : "↩️ मागील स्क्रीन";
  }

  function reopenLastFeature() {
    if (!lastClosedFeature || !lastClosedFeature.id) return;
    const id = lastClosedFeature.id;

    if (id === "proUdhaariModal" && typeof window.openProUdhaari === "function") {
      window.openProUdhaari("pending");
      return;
    }
    if (id === "proMonthActivityModal" && typeof window.openVyajMonthActivity === "function") {
      window.openVyajMonthActivity();
      return;
    }
    if (id === "proPendingSplitModal" && typeof window.openProPendingSplit === "function") {
      window.openProPendingSplit("current");
      return;
    }

    const modal = document.getElementById(id);
    if (modal) modal.classList.remove("hidden");
  }

  function hasInlineUiExpanded() {
    if (document.querySelector('#borrowersList [id^="cardDetails_"]:not(.hidden)')) return true;
    if (document.getElementById("pbDrawerBody")) return true;
    return false;
  }

  function syncSwitcherState() {
    const chip = ensureChipEl();
    const openModals = Array.from(document.querySelectorAll(".modal-backdrop")).filter(
      (m) => m.id && !m.classList.contains("hidden") && window.getComputedStyle(m).display !== "none"
    );

    if (openModals.length > 0) {
      const active = openModals[openModals.length - 1];
      if (!IGNORE_MODALS.has(active.id)) {
        currentOpenModalId = active.id;
        isDismissed = false;
      }
      chip.classList.add("hidden");
      return;
    }

    // जर आधी एखादे मुख्य पॉपअप उघडे होते आणि आता बंद झाले असेल तर त्याची नोंद ठेवा
    if (currentOpenModalId) {
      const prevEl = document.getElementById(currentOpenModalId);
      if (prevEl && !IGNORE_MODALS.has(currentOpenModalId)) {
        lastClosedFeature = { id: currentOpenModalId, label: getModalLabel(prevEl) };
      }
      currentOpenModalId = null;
    }

    // ग्राहक कार्ड किंवा वायदा ड्रॉवर उघडा असल्यास चिप लपवून ठेवा (०% ओव्हरलॅप)
    if (!lastClosedFeature || isDismissed || hasInlineUiExpanded()) {
      chip.classList.add("hidden");
      return;
    }

    const txtEl = document.getElementById("proSmartSwitcherTxt");
    if (txtEl) txtEl.textContent = lastClosedFeature.label;
    chip.classList.remove("hidden");
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncSwitcherState, 110);
  }

  function initSmartSwitcher() {
    injectSwitcherCss();
    ensureChipEl();

    // कार्ड टॅप किंवा वायदा क्लिक होताच लगेच चिपची स्थिती तपासा
    document.addEventListener("click", (ev) => {
      if (ev.target && ev.target.closest(".nc-clickable-area, #pbToggleBar, .modal-backdrop")) {
        scheduleSync();
      }
    }, true);

    window.addEventListener("vyaj:resetInlineUI", scheduleSync);

    const obs = new MutationObserver(scheduleSync);
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
