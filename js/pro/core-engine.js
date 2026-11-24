// व्याज हिशोब वही - Master UI Reset Bus + Sidebar Accordion + Double-Tap Guard + Scroll Lock + Crash Guard + Universal Call (js/pro/core-engine.js - V14.42)
(function () {
  let activeOverlayId = null;
  let overlayObserverTimer = null;

  // १. Global Crash Guard (अचानक एरर आल्यास अ‍ॅप हँग होऊ नये म्हणून)
  window.addEventListener("error", (ev) => {
    console.warn("Vyaj Crash Guard:", ev.message);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    console.warn("Vyaj Promise Guard:", ev.reason);
  });

  // २. Instant Security & Auth Gate (लॉगिन / PIN तपासणी होईपर्यंत डॅशबोर्ड लपवा)
  function initInstantSecurityGate() {
    const splash = document.getElementById("splashScreen");
    if (!splash) return;

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

      if (authVisible || pinVisible) { releaseGate(); return true; }
      if (appVisible) {
        const hasSavedPin = Object.keys(localStorage).some((k) => k.startsWith("vyaj_aap_pin_") && localStorage.getItem(k));
        if (!hasSavedPin) { releaseGate(); return true; }
      }
      return false;
    };

    const poll = setInterval(() => {
      if (checkAuthAndPinReady()) clearInterval(poll);
    }, 120);

    setTimeout(() => { clearInterval(poll); releaseGate(); }, 2400);
  }

  // ३. Master UI Reset Bus (ग्राहक कार्ड, थकीत वायदे, लाईन चार्ट आणि साइडबार सेक्शन्स आपोआप बंद करा)
  function closeAllExpandedBorrowerCards() {
    document.querySelectorAll('#borrowersList [id^="cardDetails_"]:not(.hidden)').forEach((el) => {
      el.classList.add("hidden");
      const card = el.closest(".borrower-item.nc-card");
      if (card) card.classList.remove("pc-is-open");
      const id = el.id.replace("cardDetails_", "");
      const tBtn = document.getElementById(`toggleDetailBtn_${id}`);
      if (tBtn) tBtn.textContent = "▼ तपशील";
    });
  }

  // उघडा असलेला 'लाईन चार्ट' बंद करा
  function closeLineChartIfOpen() {
    const chartCanvas = document.querySelector('#appScreen canvas, #appScreen [id*="chartBox"], #appScreen [id*="ChartWrap"]');
    if (chartCanvas && chartCanvas.offsetParent !== null) {
      const chartBtn = Array.from(document.querySelectorAll("#appScreen button")).find((b) =>
        (b.textContent || "").includes("लाईन चार्ट")
      );
      if (chartBtn) chartBtn.click();
    }
  }

  // साइडबारमधील सर्व कस्टम सेक्शन्स (General, Reports & Tools, Backup & Data, Security & Privacy) बंद करा
  const SIDEBAR_SEC_KEYWORDS = ["general", "reports & tools", "backup & data", "security & privacy"];

  function collapseAllSidebarSections(exceptBtn) {
    const drawer = document.getElementById("proSidebarDrawer") || document.getElementById("uiProMenuDrawer") || document.body;
    drawer.querySelectorAll("details[open]").forEach((det) => {
      if (!det.closest(".modal-backdrop:not(.hidden)")) det.removeAttribute("open");
    });

    // कस्टम बटण + त्याच्या पुढचा बॉक्स (sibling container) बंद करा
    drawer.querySelectorAll("button, .menu-group-header, .sb-acc-head").forEach((hdr) => {
      if (exceptBtn && hdr === exceptBtn) return;
      const txt = (hdr.textContent || "").toLowerCase();
      if (!SIDEBAR_SEC_KEYWORDS.some((k) => txt.includes(k))) return;

      const body = hdr.nextElementSibling;
      if (body && !body.classList.contains("hidden") && window.getComputedStyle(body).display !== "none") {
        body.classList.add("hidden");
        body.style.display = "none";
        hdr.classList.remove("open", "active", "is-open");
      }
    });
  }

  function closeSidebarMenus() {
    collapseAllSidebarSections(null);
    ["proSidebarOverlay", "proSidebarDrawer", "proThreeDotDropdown", "uiProMenuDrawer"].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.classList.contains("hidden")) el.classList.add("hidden");
    });
  }

  function dispatchResetSignal(sourceTag) {
    window.dispatchEvent(new CustomEvent("vyaj:resetInlineUI", { detail: { source: sourceTag || "core" } }));
  }

  function closeOtherModalsExcept(keepId) {
    document.querySelectorAll(".modal-backdrop").forEach((m) => {
      if (!m.id || m.id === keepId) return;
      if (!m.classList.contains("hidden")) m.classList.add("hidden");
    });
  }

  // Native App सारखा Scroll Lock (पॉपअप उघडल्यावर मागचा डॅशबोर्ड हलणार नाही)
  function syncBodyScrollLock(hasOpenModal) {
    document.body.style.overflow = hasOpenModal ? "hidden" : "";
  }

  function enforceSingleOverlay() {
    const openModals = Array.from(document.querySelectorAll(".modal-backdrop")).filter(
      (m) => m.id && !m.classList.contains("hidden") && window.getComputedStyle(m).display !== "none"
    );

    syncBodyScrollLock(openModals.length > 0);

    if (openModals.length > 0) {
      const newest = openModals.find((m) => m.id !== activeOverlayId) || openModals[openModals.length - 1];
      activeOverlayId = newest.id;

      if (openModals.length > 1) closeOtherModalsExcept(newest.id);
      closeSidebarMenus();
      closeLineChartIfOpen();

      // Edit, Docs किंवा Passbook सोडून इतर मुख्य फीचर उघडल्यास उघडे ग्राहक कार्ड व वायदे बंद करा
      const keepCardFor = new Set(["editModal", "docsModal", "passbookModal", "proPastDuesModal", "smartInfoModal"]);
      if (!keepCardFor.has(newest.id)) {
        closeAllExpandedBorrowerCards();
        dispatchResetSignal("modal_" + newest.id);
      } else {
        window.dispatchEvent(new CustomEvent("vyaj:closePromiseBar"));
      }
    } else {
      activeOverlayId = null;
    }
  }

  function bindGlobalNavAndGuards() {
    document.addEventListener("click", (ev) => {
      const target = ev.target && ev.target.closest ? ev.target.closest("button, a, .nc-clickable-area, .menu-group-header") : null;
      if (!target) return;

      // अ) Double-Tap Payment Guard: 'जमा करा' बटनावर स्लो नेटवर डबल क्लिक थांबवा
      const act = target.getAttribute("data-action") || "";
      const txtLower = (target.textContent || "").trim().toLowerCase();
      if (act === "smart-collect" || target.id === "udFSaveBtn") {
        if (target.dataset.vyajBusy === "1") {
          ev.preventDefault();
          ev.stopPropagation();
          ev.stopImmediatePropagation();
          return;
        }
        target.dataset.vyajBusy = "1";
        target.style.opacity = "0.65";
        setTimeout(() => {
          delete target.dataset.vyajBusy;
          target.style.opacity = "";
        }, 1500);
      }

      // ब) साइडबारमधील General / Reports / Backup / Security वर क्लिक -> इतर सेक्शन्स आपोआप बंद (Accordion)
      if (SIDEBAR_SEC_KEYWORDS.some((k) => txtLower.includes(k))) {
        collapseAllSidebarSections(target);
        // जर आपण आधी display:none लावले असेल तर पुन्हा उघडायला मदत करा
        const nextBox = target.nextElementSibling;
        if (nextBox && nextBox.style.display === "none") {
          nextBox.style.display = "";
        }
        return;
      }

      // क) ग्राहक कार्ड उघडताना -> 'थकीत वायदे' व 'लाईन चार्ट' आपोआप बंद करा
      if (target.classList.contains("nc-clickable-area")) {
        window.dispatchEvent(new CustomEvent("vyaj:closePromiseBar"));
        closeLineChartIfOpen();
        return;
      }

      // ड) 'लाईन चार्ट' उघडताना -> 'थकीत वायदे' व ग्राहक कार्ड बंद करा
      if (txtLower.includes("लाईन चार्ट")) {
        window.dispatchEvent(new CustomEvent("vyaj:closePromiseBar"));
        closeAllExpandedBorrowerCards();
        dispatchResetSignal("line_chart");
        return;
      }

      // इ) तळाच्या नेव्हिगेशन बारवर क्लिक केल्यास सर्व उघडे कार्ड्स, वायदे व मेन्यू बंद करा
      if (target.closest("#uiProBottomNav, .bottom-nav, nav")) {
        closeSidebarMenus();
        closeLineChartIfOpen();
        closeAllExpandedBorrowerCards();
        dispatchResetSignal("bottom_nav");
        if (txtLower.includes("home")) closeOtherModalsExcept("");
        return;
      }

      // ई) साइडबार किंवा ३-डॉट मेन्यू उघडताना उघडे कार्ड व वायदे बंद करा
      if (target.closest("#threeDotMenuSlot") || target.id === "uiProHamburgerBtn") {
        closeAllExpandedBorrowerCards();
        dispatchResetSignal("sidebar_open");
        return;
      }

      // उ) वायदा Activity पट्टी उघडताना इतर सर्व बंद करा
      if (target.id === "pbToggleBar" || target.closest("#pbToggleBar")) {
        closeOtherModalsExcept("");
        closeSidebarMenus();
        closeLineChartIfOpen();
        closeAllExpandedBorrowerCards();
      }
    }, true);

    // Smart Back बटण: पॉपअप नसताना ग्राहक कार्ड किंवा वायदा ड्रॉवर उघडा असेल तर आधी ते बंद करा
    window.addEventListener("popstate", () => {
      const hasOpenModal = Array.from(document.querySelectorAll(".modal-backdrop")).some(
        (m) => m.id && !m.classList.contains("hidden")
      );
      if (!hasOpenModal) {
        closeAllExpandedBorrowerCards();
        dispatchResetSignal("popstate");
      }
    });
  }

  // ४. Universal 100% Working Call Engine (संपूर्ण अ‍ॅपमधील सर्व Call बटणांसाठी)
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
    const href = el.getAttribute("href") || "";
    if (href.startsWith("tel:")) return cleanIndianMobile(href.replace("tel:", ""));

    for (const attr of ["data-mobile", "data-sr-call", "data-cd-call", "data-call", "data-phone"]) {
      const val = el.getAttribute(attr);
      if (val) {
        const c = cleanIndianMobile(val);
        if (c.length >= 10) return c;
      }
    }

    const onClk = el.getAttribute("onclick") || "";
    const telMatch = onClk.match(/tel:([+\d\s\-]{10,15})/);
    if (telMatch) return cleanIndianMobile(telMatch[1]);

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

  // ५. Settings मध्ये १-क्लिक सुरक्षित Cache Cleaner
  function injectCacheCleanerInSettings() {
    const resetBtn = document.getElementById("setResetPassBtn");
    if (!resetBtn || document.getElementById("proSafeCacheCleanBtn")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "proSafeCacheCleanBtn";
    btn.className = "primary sm";
    btn.style.width = "100%";
    btn.textContent = "🧹 अ‍ॅप स्पीड व कॅश साफ करा (Safe Clean)";
    btn.addEventListener("click", async () => {
      if (!confirm("तात्पुरता कॅश साफ करून अ‍ॅप ताजे करायचे का? (तुमचा Firebase डेटा, PIN व प्रोफाईल १००% सुरक्षित राहील.)")) return;
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        sessionStorage.clear();
        alert("✅ कॅश साफ झाला! अ‍ॅप आता नवीन वेगाने रीलोड होत आहे.");
        window.location.reload();
      } catch (err) {
        alert("कॅश साफ करताना एरर: " + err.message);
      }
    });
    resetBtn.insertAdjacentElement("beforebegin", btn);
  }

  window.VyajCore = {
    triggerNativeDialer,
    closeAllExpandedBorrowerCards,
    closeAllOverlays: () => {
      closeOtherModalsExcept("");
      closeSidebarMenus();
      closeLineChartIfOpen();
      closeAllExpandedBorrowerCards();
      dispatchResetSignal("api");
    }
  };

  function initCoreEngine() {
    initInstantSecurityGate();
    bindGlobalNavAndGuards();
    bindUniversalCallEngine();
    injectCacheCleanerInSettings();

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
