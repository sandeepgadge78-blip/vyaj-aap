// व्याज हिशोब वही - Ultra-Pro UI Polish, Single-Line Bar, UI Glass New Button & Global Mobile Back System (js/ui-pro.js - V14.18)
(function () {
  let modalHistoryCount = 0;

  // १. प्रोफेशनल UI व कार्ड पॉलिशसाठी CSS स्टाईल्स जोडा
  function injectUiProStyles() {
    if (document.getElementById("vyajUiProCss")) return;
    const st = document.createElement("style");
    st.id = "vyajUiProCss";
    st.textContent = `
      /* पाचही मुख्य बटणे (फास्ट वसुली, PDF, Excel, Backup, कॅशबुक) एकाच सरळ ओळीत */
      .month-hero-links {
        display: flex !important;
        flex-wrap: nowrap !important;
        overflow-x: auto !important;
        justify-content: flex-start !important;
        gap: 6px !important;
        padding: 4px 2px 6px !important;
        margin-bottom: 8px !important;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }
      .month-hero-links::-webkit-scrollbar { display: none; }
      .month-hero-links button {
        flex: 0 0 auto !important;
        white-space: nowrap !important;
        padding: 5px 10px !important;
        font-size: 0.74rem !important;
        border-radius: 999px !important;
      }

      /* सर्व पॉपअपमधील '✕ बंद' बटणे लपवा (मोबाईलचे Back बटण वापरण्यासाठी) */
      .modal-card button[id*="Close"],
      .modal-card button[id*="close"],
      .modal-card .ui-pro-hide-close {
        display: none !important;
      }

      /* UI Glass 'New' बटण (फक्त मुख्य डॅशबोर्डवरच दिसेल) */
      #uiProNewBtn {
        position: fixed;
        right: 16px;
        bottom: 74px;
        z-index: 35;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 11px 18px;
        border-radius: 999px;
        font-size: 0.9rem;
        font-weight: 800;
        letter-spacing: 0.3px;
        color: #f8fafc;
        background: rgba(14, 165, 233, 0.24);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(56, 189, 248, 0.55);
        box-shadow: 0 8px 28px rgba(14, 165, 233, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.28);
        cursor: pointer;
        transition: transform 0.16s ease, opacity 0.2s ease, box-shadow 0.2s ease;
      }
      #uiProNewBtn:active {
        transform: scale(0.94);
      }
      body.light-mode #uiProNewBtn {
        color: #0369a1;
        background: rgba(255, 255, 255, 0.78);
        border-color: rgba(2, 132, 199, 0.45);
        box-shadow: 0 6px 22px rgba(2, 132, 199, 0.2);
      }

      /* ग्राहक कार्ड (बाहेरून व आतून) अजून स्वच्छ व प्रोफेशनल डिझाइन */
      #borrowersList .borrower-item {
        padding: 14px 13px !important;
        border-radius: 16px !important;
        margin-bottom: 12px !important;
      }
      #borrowersList .borrower-item .meta-box {
        border-radius: 12px !important;
        padding: 9px 10px !important;
        line-height: 1.5;
      }
      #borrowersList .borrower-item .row {
        gap: 6px !important;
      }
      #borrowersList .borrower-item button.sm {
        border-radius: 9px !important;
        padding: 6px 10px !important;
        font-size: 0.76rem !important;
      }
    `;
    document.head.appendChild(st);
  }

  // २. जुने गोल '+' बटण आणि तळाच्या बारमधील डुप्लिकेट 'Menu' बटण लपवा
  function cleanDuplicateControls() {
    // जुने गोल '+' FAB बटण शोधा व लपवा
    document.querySelectorAll("button, a, div").forEach((el) => {
      if (el.id === "uiProNewBtn") return;
      const txt = (el.textContent || "").trim();
      const style = window.getComputedStyle(el);
      if (txt === "+" && style.position === "fixed") {
        el.style.display = "none";
      }
    });

    // तळाच्या नेव्हिगेशन बारमधील 'Menu' बटण काढून टाका
    document.querySelectorAll("nav button, nav a, [class*='bottom'] button, [class*='bottom'] a, [id*='bottom'] button").forEach((el) => {
      const txt = (el.textContent || "").trim().toLowerCase();
      if (txt === "menu" || txt.endsWith("menu")) {
        el.style.display = "none";
      }
    });

    // सर्व पॉपअपमधील '✕ बंद' किंवा 'बंद' बटणे लपवा
    document.querySelectorAll(".modal-card button").forEach((btn) => {
      const t = (btn.textContent || "").trim();
      if (t === "✕ बंद" || t === "✕" || t === "बंद" || t === "बंद करा") {
        btn.classList.add("ui-pro-hide-close");
      }
    });
  }

  // ३. UI Glass 'New' बटण तयार करा (थेट नवीन ग्राहक नोंद उघडेल)
  function createGlassNewButton() {
    if (document.getElementById("uiProNewBtn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "uiProNewBtn";
    btn.className = "hidden";
    btn.innerHTML = `<span style="font-size:1.05rem;">＋</span><span>New</span>`;
    btn.title = "नवीन ग्राहक / कर्ज नोंद जोडा";

    btn.addEventListener("click", () => {
      const modal = document.getElementById("toolSectionModal");
      const titleEl = document.getElementById("toolSectionModalTitle");
      const addPane = document.getElementById("addBorrowerSection");
      if (!modal || !addPane) return;

      document.querySelectorAll(".tool-sec-pane").forEach((p) => p.classList.add("hidden"));
      addPane.classList.remove("hidden");
      if (titleEl) titleEl.textContent = "➕ नवीन ग्राहक / कर्ज नोंद";

      modal.classList.remove("hidden");
      pushOverlayHistory("toolSectionModal");
      updateNewButtonVisibility();
    });

    document.body.appendChild(btn);
  }

  // कोणतेही पॉपअप किंवा साईड-मेन्यू उघडा आहे का ते तपासा
  function getOpenModals() {
    return Array.from(document.querySelectorAll(".modal-backdrop")).filter(
      (m) => !m.classList.contains("hidden") && window.getComputedStyle(m).display !== "none"
    );
  }

  function isAnyOverlayOpen() {
    if (getOpenModals().length > 0) return true;
    // साईड ड्रॉवर उघडा आहे का ते पहा
    const openDrawer = document.querySelector(".drawer.open, .sidebar.open, #sideDrawer:not(.hidden), #mobileDrawer.open");
    return Boolean(openDrawer);
  }

  // फक्त मुख्य डॅशबोर्डवर असतानाच 'New' बटण दाखवा
  function updateNewButtonVisibility() {
    const newBtn = document.getElementById("uiProNewBtn");
    const appScreen = document.getElementById("appScreen");
    if (!newBtn || !appScreen) return;

    const isAppVisible = !appScreen.classList.contains("hidden");
    const shouldShow = isAppVisible && !isAnyOverlayOpen();
    newBtn.classList.toggle("hidden", !shouldShow);
  }

  // ४. ग्लोबल मोबाईल Back बटण सिस्टम (सध्याच्या आणि भविष्यातील सर्व फीचर्ससाठी)
  function pushOverlayHistory(tag) {
    try {
      history.pushState({ uiProOverlay: tag || "modal", ts: Date.now() }, "");
      modalHistoryCount += 1;
    } catch (_) {}
  }

  function handleGlobalBackButton() {
    const openModals = getOpenModals();
    if (openModals.length > 0) {
      // सर्वात वर असलेले पॉपअप बंद करा
      const topModal = openModals[openModals.length - 1];
      topModal.classList.add("hidden");
      modalHistoryCount = Math.max(0, modalHistoryCount - 1);
      updateNewButtonVisibility();
      return;
    }

    // जर साईड-मेन्यू उघडा असेल तर तो बंद करा
    const openDrawer = document.querySelector(".drawer.open, .sidebar.open, #sideDrawer:not(.hidden), #mobileDrawer.open");
    if (openDrawer) {
      openDrawer.classList.remove("open");
      if (openDrawer.id === "sideDrawer") openDrawer.classList.add("hidden");
      updateNewButtonVisibility();
    }
  }

  // कोणत्याही पॉपअपची स्थिती बदलताच आपोआप Back History व 'New' बटण अ‍ॅडजस्ट करा
  function observeAllOverlays() {
    let prevOpenCount = getOpenModals().length;

    const obs = new MutationObserver(() => {
      cleanDuplicateControls();
      const curOpenCount = getOpenModals().length;
      if (curOpenCount > prevOpenCount) {
        pushOverlayHistory("auto_modal");
      }
      prevOpenCount = curOpenCount;
      updateNewButtonVisibility();
    });

    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    });
  }

  function initUiPro() {
    injectUiProStyles();
    createGlassNewButton();
    cleanDuplicateControls();
    updateNewButtonVisibility();
    observeAllOverlays();

    window.addEventListener("popstate", handleGlobalBackButton);
    setTimeout(() => {
      cleanDuplicateControls();
      updateNewButtonVisibility();
    }, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUiPro);
  } else {
    initUiPro();
  }
})();
