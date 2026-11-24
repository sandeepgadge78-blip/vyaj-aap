// व्याज हिशोब वही - General (सामान्य) विभाग कायमस्वरूपी सुरक्षित ठेवण्यासाठी हलकी फाईल (js/pro/general-pro.js - V14.43)
(function () {
  // १. General (सामान्य) विभाग कधीही लपला जाऊ नये म्हणून सुरक्षित CSS
  function injectGeneralSafeCss() {
    if (document.getElementById("vyajGeneralProSafeCss")) return;
    const st = document.createElement("style");
    st.id = "vyajGeneralProSafeCss";
    st.textContent = `
      #proUnifiedDrawer [data-acc-group="general"] {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      #proUnifiedDrawer [data-acc-group="general"].is-open .pro-acc-body {
        display: flex !important;
        visibility: visible !important;
      }
      #proUnifiedDrawer [data-acc-group="general"] .gp-safe-item {
        display: flex !important;
        visibility: visible !important;
      }
    `;
    document.head.appendChild(st);
  }

  // २. कोणतेही Modal सुरक्षितपणे आणि Back-Navigation सह उघडण्याचे फंक्शन
  function openModalFromMenu(modalId) {
    const openFn = () => {
      const el = document.getElementById(modalId);
      if (el) el.classList.remove("hidden");
    };

    if (window.VyajNavStack && typeof window.VyajNavStack.navigateFrom === "function") {
      window.VyajNavStack.navigateFrom("proUnifiedDrawer", openFn);
    } else {
      const drawer = document.getElementById("proUnifiedDrawer");
      const backdrop = document.getElementById("proMenuBackdrop");
      if (drawer) {
        drawer.classList.remove("open");
        drawer.classList.add("hidden");
      }
      if (backdrop) backdrop.classList.add("hidden");
      openFn();
    }
  }

  // ३. General (सामान्य) विभागातील सर्व ऑप्शन्स तपासून गरज असल्यास पुन्हा जोडणे
  function ensureGeneralOptions() {
    const drawer = document.getElementById("proUnifiedDrawer");
    const accList = document.getElementById("proMenuAccList");
    if (!drawer || !accList) return;

    // जर General ग्रुप पूर्णपणे गायब असेल, तर तो पुन्हा तयार करा
    let genGroup = accList.querySelector('[data-acc-group="general"]');
    if (!genGroup) {
      genGroup = document.createElement("div");
      genGroup.className = "pro-acc-group is-open";
      genGroup.setAttribute("data-acc-group", "general");
      genGroup.innerHTML = `
        <button type="button" class="pro-acc-head" data-acc-toggle="general">
          <span>⚙️ General (सामान्य)</span>
          <span class="pro-acc-right"><span class="pro-acc-arrow">▾</span></span>
        </button>
        <div class="pro-acc-body"></div>
      `;
      accList.prepend(genGroup);
      genGroup.querySelector("[data-acc-toggle]")?.addEventListener("click", () => {
        genGroup.classList.toggle("is-open");
      });
    }

    const body = genGroup.querySelector(".pro-acc-body");
    if (!body) return;

    // सध्याचे Theme आणि Privacy स्थिती तपासा
    const isLight = document.body.classList.contains("light-mode");
    const sampleAmt = (document.getElementById("dashTotalPrincipal")?.textContent || "").trim();
    const isHidden = sampleAmt.includes("•") || sampleAmt.includes("*");

    // General विभागातील सर्व कायमस्वरूपी ऑप्शन्स
    const generalItems = [
      {
        id: "gp_settings",
        icon: "⚙️",
        label: "अ‍ॅप सेटिंग्ज (Theme / भाषा / Lock)",
        onClick: () => openModalFromMenu("settingsModal")
      },
      {
        id: "gp_profile",
        icon: "👤",
        label: "बिझनेस प्रोफाईल व UPI ID",
        onClick: () => openModalFromMenu("profileModal")
      },
      {
        id: "gp_theme",
        icon: isLight ? "🌙" : "☀️",
        label: isLight ? "Dark Mode चालू करा" : "Light Mode चालू करा",
        onClick: () => {
          document.getElementById("toggleThemeBtn")?.click();
          setTimeout(ensureGeneralOptions, 80);
        }
      },
      {
        id: "gp_privacy",
        icon: isHidden ? "👁️" : "🙈",
        label: isHidden ? "रकमा दाखवा (Show)" : "रकमा लपवा (Privacy)",
        onClick: () => {
          document.getElementById("toggleHideAmtBtn")?.click();
          setTimeout(ensureGeneralOptions, 80);
        }
      },
      {
        id: "gp_help",
        icon: "❓",
        label: "मराठी अ‍ॅप गाईड (Help & FAQ)",
        onClick: () => openModalFromMenu("helpGuideModal")
      }
    ];

    // जुने तुटलेले किंवा लपलेले ऑप्शन्स काढून स्वच्छ ऑप्शन्स लावा
    body.innerHTML = "";
    generalItems.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pro-acc-item gp-safe-item";
      btn.setAttribute("data-gp-id", item.id);
      btn.innerHTML = `<span>${item.icon} ${item.label}</span><span class="pro-acc-right"><span>▸</span></span>`;
      btn.addEventListener("click", item.onClick);
      body.appendChild(btn);
    });
  }

  // ४. मेन्यू उघडताच (On-Demand) General ऑप्शन्स तपासा — बॅकग्राउंड लोड ०%
  function hookMenuOpen() {
    const origOpen = window.openProUnifiedMenu;
    if (typeof origOpen === "function" && !origOpen.__gpWrapped) {
      const wrapped = function () {
        const res = origOpen.apply(this, arguments);
        setTimeout(ensureGeneralOptions, 30);
        return res;
      };
      wrapped.__gpWrapped = true;
      window.openProUnifiedMenu = wrapped;
    }

    // हेडरमधील ☰ बटनावर क्लिक झाल्यावरही एकदा तपासा
    document.addEventListener("click", (e) => {
      if (e.target && e.target.closest && e.target.closest("header")) {
        setTimeout(ensureGeneralOptions, 60);
      }
    }, true);
  }

  function initGeneralPro() {
    injectGeneralSafeCss();
    hookMenuOpen();
    setTimeout(ensureGeneralOptions, 400);
    setTimeout(ensureGeneralOptions, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGeneralPro);
  } else {
    initGeneralPro();
  }
})();
