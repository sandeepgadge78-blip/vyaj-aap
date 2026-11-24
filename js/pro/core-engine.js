// व्याज हिशोब वही - Instant Security Gate + Central Single-Overlay Manager + Universal 100% Working Call Engine (js/pro/core-engine.js - V14.40)
(function () {
  let activeOverlayId = null;
  let overlayObserverTimer = null;

  // =========================================================================
  // १. Instant Security & Auth Gate (लॉगिन / PIN तपासणी पूर्ण होईपर्यंत डॅशबोर्ड लपवून ठेवा)
  // =========================================================================
  function initInstantSecurityGate() {
    const splash = document.getElementById("splashScreen");
    if (!splash) return;

    // अ‍ॅप उघडताच १.८ सेकंद किंवा Auth/PIN रेडी होईपर्यंत Splash सुरक्षित ठेवा
    let gateReleased = false;
    const releaseGate = () => {
      if (gateReleased) return;
      gateReleased = true;
      splash.classList.add("splash-hide");
    };

    const checkAuthAndPinReady = () => {
      const authScreen = document.getElementById("authScreen");
      const appScreen = document.getElementById("appScreen");
      const pinOverlay = document.getElementById("proPinLockOverlay") || document.querySelector('[id*="pinLock"], [id*="PinLock"]');

      const authVisible = authScreen && !authScreen.classList.contains("hidden");
      const appVisible = appScreen && !appScreen.classList.contains("hidden");
      const pinVisible = pinOverlay && !pinOverlay.classList.contains("hidden");

      if (authVisible || pinVisible) {
        releaseGate();
        return true;
      }
      if (appVisible) {
        // जर PIN सेट केलेला असेल तर security.js ला उघडण्यासाठी थोडा वेळ द्या
        const hasSavedPin = Object.keys(localStorage).some((k) => k.startsWith("vyaj_aap_pin_") && localStorage.getItem(k));
        if (!hasSavedPin) {
          releaseGate();
          return true;
        }
      }
      return false;
    };

    const poll = setInterval(() => {
      if (checkAuthAndPinReady()) clearInterval(poll);
    }, 120);

    // कमाल २.४ सेकंदांनंतर कधीही अडकू नये म्हणून सुरक्षित रिलीझ
    setTimeout(() => {
      clearInterval(poll);
      releaseGate();
    }, 2400);
  }

  // =========================================================================
  // २. Central Single-Overlay Manager (एका वेळी फक्त १ मेन्यू / ड्रॉवर / पॉपअप उघडा राहील)
  // =========================================================================
  function closePromiseActivityDrawer() {
    const drawer = document.getElementById("pbDrawerBody");
    const toggleBar = document.getElementById("pbToggleBar");
    if (drawer && toggleBar) {
      toggleBar.click();
    }
  }

  function closeSidebarMenus() {
    // ☰ साइडबार किंवा 3-dot मेन्यू उघडा असल्यास बंद करा
    const sidebarIds = ["proSidebarOverlay", "proSidebarDrawer", "proThreeDotDropdown", "uiProMenuDrawer"];
    sidebarIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.classList.contains("hidden")) {
        el.classList.add("hidden");
      }
    });
    // कोणतेही उघडे <details> मेन्यू सेक्शन्स (General, Reports, Backup, Security) स्वच्छ बंद करा
    document.querySelectorAll("details[open]").forEach((det) => {
      if (!det.closest(".modal-backdrop:not(.hidden)")) {
        det.removeAttribute("open");
      }
    });
  }

  function closeOtherModalsExcept(keepId) {
    document.querySelectorAll(".modal-backdrop").forEach((m) => {
      if (!m.id || m.id === keepId) return;
      if (!m.classList.contains("hidden")) {
        m.classList.add("hidden");
      }
    });
  }

  function enforceSingleOverlay() {
    const openModals = Array.from(document.querySelectorAll(".modal-backdrop")).filter(
      (m) => m.id && !m.classList.contains("hidden") && window.getComputedStyle(m).display !== "none"
    );

    if (openModals.length > 0) {
      // सर्वात शेवटी उघडलेला पॉपअप ओळखा
      const newest = openModals.find((m) => m.id !== activeOverlayId) || openModals[openModals.length - 1];
      activeOverlayId = newest.id;

      // इतर सर्व जुने उघडे पॉपअप, वायदा ड्रॉवर आणि साइडबार मेन्यू बंद करा
      if (openModals.length > 1) {
        closeOtherModalsExcept(newest.id);
      }
      closePromiseActivityDrawer();
      closeSidebarMenus();
    } else {
      activeOverlayId = null;
    }
  }

  // तळाच्या नेव्हिगेशन बारवर (Home, Months, आजची वसुली, Pay) क्लिक करताच आधीचे सर्व पॉपअप/ड्रॉवर बंद करा
  function bindGlobalNavCleanup() {
    document.addEventListener("click", (ev) => {
      const target = ev.target && ev.target.closest ? ev.target.closest("button, a") : null;
      if (!target) return;

      // तळाच्या बारवरील बटण किंवा Home क्लिक
      if (target.closest("#uiProBottomNav, .bottom-nav, nav")) {
        closePromiseActivityDrawer();
        closeSidebarMenus();
        const txt = (target.textContent || "").trim().toLowerCase();
        if (txt.includes("home")) {
          closeOtherModalsExcept("");
        }
      }

      // वायदा Activity पट्टी उघडताना इतर पॉपअप व मेन्यू बंद ठेवा
      if (target.id === "pbToggleBar" || target.closest("#pbToggleBar")) {
        closeOtherModalsExcept("");
        closeSidebarMenus();
      }
    }, true);
  }

  // =========================================================================
  // ३. Universal 100% Working Call Engine (संपूर्ण अ‍ॅपमधील सर्व Call बटणांसाठी)
  // =========================================================================
  function cleanIndianMobile(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
    if (digits.length >= 10) return digits.slice(-10);
    return digits;
  }

  function triggerNativeDialer(mobileNumber) {
    const clean = cleanIndianMobile(mobileNumber);
    if (!clean || clean.length < 10) {
      alert("या ग्राहकाचा वैध १० अंकी मोबाईल नंबर सेव्ह नाही.");
      return;
    }
    const a = document.createElement("a");
    a.href = `tel:${clean}`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 300);
  }

  function extractMobileFromElement(el) {
    if (!el) return "";
    // १. थेट href="tel:..." किंवा data-* अ‍ॅट्रीब्यूट तपासा
    const href = el.getAttribute("href") || "";
    if (href.startsWith("tel:")) return cleanIndianMobile(href.replace("tel:", ""));

    const directAttrs = ["data-mobile", "data-sr-call", "data-cd-call", "data-call", "data-phone"];
    for (const attr of directAttrs) {
      const val = el.getAttribute(attr);
      if (val) {
        const c = cleanIndianMobile(val);
        if (c.length >= 10) return c;
      }
    }

    // २. onclick मधील tel: नंबर शोधा
    const onClk = el.getAttribute("onclick") || "";
    const telMatch = onClk.match(/tel:([+\d\s\-]{10,15})/);
    if (telMatch) return cleanIndianMobile(telMatch[1]);

    // ३. जवळच्या ग्राहक कार्डवरून HishobBridge मधून नंबर काढा
    const card = el.closest(".borrower-item, .pb-card, .psb-item, .sr-item-card, .ud-card");
    if (card) {
      const bId =
        card.getAttribute("data-pro-bid") ||
        card.querySelector("[data-toggle-card]")?.getAttribute("data-toggle-card") ||
        card.querySelector("[data-id]")?.getAttribute("data-id");

      if (bId && window.HishobBridge && typeof window.HishobBridge.getBorrowers === "function") {
        const b = (window.HishobBridge.getBorrowers() || []).find((x) => x.id === bId);
        if (b && b.mobile) {
          const c = cleanIndianMobile(b.mobile);
          if (c.length >= 10) return c;
        }
      }
      // ४. कार्डमधील टेक्स्टवरून १० अंकी नंबर शोधा
      const txtMatch = (card.textContent || "").match(/[6-9]\d{9}/);
      if (txtMatch) return txtMatch[0];
    }
    return "";
  }

  function bindUniversalCallEngine() {
    document.addEventListener("click", (ev) => {
      const el = ev.target && ev.target.closest ? ev.target.closest("a, button") : null;
      if (!el) return;

      const href = el.getAttribute("href") || "";
      const action = el.getAttribute("data-action") || "";
      const txt = (el.textContent || "").trim().toLowerCase();

      const isCallElement =
        href.startsWith("tel:") ||
        action === "call-borrower" ||
        el.hasAttribute("data-sr-call") ||
        el.hasAttribute("data-cd-call") ||
        el.classList.contains("pb-call") ||
        (txt.includes("call") && !txt.includes("+नंबर") && !txt.includes("add"));

      if (!isCallElement) return;

      const mob = extractMobileFromElement(el);
      if (mob && mob.length >= 10) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        triggerNativeDialer(mob);
      }
    }, true);
  }

  window.VyajCore = {
    triggerNativeDialer,
    closeAllOverlays: () => {
      closeOtherModalsExcept("");
      closePromiseActivityDrawer();
      closeSidebarMenus();
    }
  };

  function initCoreEngine() {
    initInstantSecurityGate();
    bindGlobalNavCleanup();
    bindUniversalCallEngine();

    const obs = new MutationObserver(() => {
      clearTimeout(overlayObserverTimer);
      overlayObserverTimer = setTimeout(enforceSingleOverlay, 60);
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initCoreEngine);
  else initCoreEngine();
})();
