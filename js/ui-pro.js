// व्याज हिशोब वही - Business Pro Customer Avatar, Single-Line Actions, UI Glass New Button & Global Mobile Back System (js/ui-pro.js - V14.19)
(function () {
  let modalHistoryCount = 0;
  let enhanceTimer = null;

  // १. डुप्लिकेट '+' व तळाचे 'Menu' बटण आणि पॉपअपमधील '✕ बंद' बटणे सुरक्षितपणे लपवा
  function cleanDuplicateControls() {
    // जुने गोल '+' FAB बटण लपवा
    document.querySelectorAll("button, a, div").forEach((el) => {
      if (el.id === "uiProNewBtn") return;
      const txt = (el.textContent || "").trim();
      if (txt === "+" && window.getComputedStyle(el).position === "fixed") {
        if (el.style.display !== "none") el.style.display = "none";
      }
    });

    // तळाच्या बारमधील डुप्लिकेट 'Menu' बटण लपवा
    document.querySelectorAll("nav button, nav a, [class*='bottom'] button, [class*='bottom'] a, [id*='bottom'] button").forEach((el) => {
      const txt = (el.textContent || "").trim().toLowerCase();
      if (txt === "menu" || txt.endsWith("menu")) {
        if (el.style.display !== "none") el.style.display = "none";
      }
    });

    // सर्व पॉपअपमधील '✕ बंद' बटणे लपवा
    document.querySelectorAll(".modal-card button").forEach((btn) => {
      const t = (btn.textContent || "").trim();
      if (t === "✕ बंद" || t === "✕" || t === "बंद" || t === "बंद करा") {
        if (!btn.classList.contains("ui-pro-hide-close")) {
          btn.classList.add("ui-pro-hide-close");
        }
      }
    });
  }

  // २. प्रत्येक ग्राहक कार्डवर गोल अवतार (Avatar) व एकाच ओळीतील अ‍ॅक्शन बार लावा
  function enhanceCustomerCards() {
    const listEl = document.getElementById("borrowersList");
    if (!listEl) return;

    listEl.querySelectorAll(".borrower-item").forEach((card) => {
      // अ) ग्राहकाच्या नावापुढे गोल अवतार (Avatar) एकदाच जोडा
      if (!card.querySelector(".pro-avatar-badge")) {
        const nameEl = card.querySelector("strong, h4, h3");
        if (nameEl) {
          const rawName = (nameEl.textContent || "").trim();
          const firstChar = rawName ? Array.from(rawName)[0].toUpperCase() : "👤";
          const avatar = document.createElement("span");
          avatar.className = "pro-avatar-badge";
          avatar.textContent = firstChar;
          nameEl.parentNode.insertBefore(avatar, nameEl);
        }
      }

      // ब) कार्डमधील फक्त बटणांच्या ओळींना 'pro-action-strip' (सिंगल-लाईन) क्लास लावा
      card.querySelectorAll(".row").forEach((row) => {
        if (row.classList.contains("pro-action-strip")) return;
        const hasFormField = row.querySelector("input, select, textarea");
        const btnCount = row.querySelectorAll("button").length;
        if (!hasFormField && btnCount >= 2) {
          row.classList.add("pro-action-strip");
        }
      });
    });
  }

  // ३. Business Pro UI Glass '＋ New' बटण तयार करा
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

  function getOpenModals() {
    return Array.from(document.querySelectorAll(".modal-backdrop")).filter(
      (m) => !m.classList.contains("hidden") && window.getComputedStyle(m).display !== "none"
    );
  }

  function isAnyOverlayOpen() {
    if (getOpenModals().length > 0) return true;
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
    if (newBtn.classList.contains("hidden") === shouldShow) {
      newBtn.classList.toggle("hidden", !shouldShow);
    }
  }

  // ४. ग्लोबल मोबाईल Back बटण सिस्टम (सध्याच्या आणि भविष्यातील सर्व पॉपअपसाठी)
  function pushOverlayHistory(tag) {
    try {
      history.pushState({ uiProOverlay: tag || "modal", ts: Date.now() }, "");
      modalHistoryCount += 1;
    } catch (_) {}
  }

  function handleGlobalBackButton() {
    const openModals = getOpenModals();
    if (openModals.length > 0) {
      const topModal = openModals[openModals.length - 1];
      topModal.classList.add("hidden");
      modalHistoryCount = Math.max(0, modalHistoryCount - 1);
      updateNewButtonVisibility();
      return;
    }

    const openDrawer = document.querySelector(".drawer.open, .sidebar.open, #sideDrawer:not(.hidden), #mobileDrawer.open");
    if (openDrawer) {
      openDrawer.classList.remove("open");
      if (openDrawer.id === "sideDrawer") openDrawer.classList.add("hidden");
      updateNewButtonVisibility();
    }
  }

  // हलका Debounced Observer जेणेकरून अ‍ॅप अजिबात स्लो होणार नाही
  function observeAppChanges() {
    let prevOpenCount = getOpenModals().length;

    const obs = new MutationObserver(() => {
      const curOpenCount = getOpenModals().length;
      if (curOpenCount > prevOpenCount) {
        pushOverlayHistory("auto_modal");
      }
      prevOpenCount = curOpenCount;
      updateNewButtonVisibility();

      clearTimeout(enhanceTimer);
      enhanceTimer = setTimeout(() => {
        cleanDuplicateControls();
        enhanceCustomerCards();
      }, 60);
    });

    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function initUiPro() {
    createGlassNewButton();
    cleanDuplicateControls();
    enhanceCustomerCards();
    updateNewButtonVisibility();
    observeAppChanges();

    window.addEventListener("popstate", handleGlobalBackButton);
    setTimeout(() => {
      cleanDuplicateControls();
      enhanceCustomerCards();
      updateNewButtonVisibility();
    }, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUiPro);
  } else {
    initUiPro();
  }
})();
