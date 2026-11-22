// व्याज हिशोब वही - एकत्रित Modern Business मेन्यू (☰ + ⋮) + WhatsApp नंबर + Smart Feature Search (js/pro-menu.js - V14.22)
(function () {
  const RECENT_KEY = "vyaj_recent_features_v1";

  function esc(str) {
    return String(str || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  // toolSectionModal मधील विशिष्ट विभाग उघडा
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
    const m = document.getElementById(id);
    if (m) m.classList.remove("hidden");
  }

  // अ‍ॅपमधील सर्व फीचर्सची मास्टर यादी (सर्च आणि कॅटेगरी मेन्यूसाठी)
  const ALL_FEATURES = [
    // Pinned / Quick
    { id: "new_cust", icon: "➕", label: "नवीन ग्राहक / कर्ज जोडा", cat: "quick", kw: "new add customer borrower navin grahak karj नवे नवीन ग्राहक कर्ज", run: () => openToolPane("addBorrowerSection", "➕ नवीन ग्राहक / कर्ज नोंद") },
    { id: "fast_collect", icon: "⚡", label: "फास्ट वसुली", cat: "quick", kw: "fast quick collect pay vasuli फास्ट वसुली जमा", run: () => { const b = document.getElementById("openQuickCollectBtn") || document.querySelector("[data-quick-collect]"); if (b) b.click(); else openSimpleModal("quickCollectModal"); } },
    { id: "reports_hub", icon: "📊", label: "बिझनेस रिपोर्ट्स हब", cat: "quick", kw: "report reports hub pdf excel csv रिपोर्ट्स अहवाल", run: () => { if (typeof window.openProReportsHub === "function") window.openProReportsHub(); else openToolPane("reportsSection", "📑 रिपोर्ट्स व बॅकअप"); } },
    { id: "cashbook", icon: "📒", label: "कॅशबुक (रोकड वही)", cat: "quick", kw: "cashbook cash rokad book कॅशबुक रोकड वही", run: () => { const b = document.getElementById("openCashbookBtn") || document.querySelector("[data-cashbook]"); if (b) b.click(); else openSimpleModal("cashbookModal"); } },

    // General
    { id: "settings", icon: "⚙️", label: "अ‍ॅप सेटिंग्ज (Toggle / Theme)", cat: "general", kw: "settings theme dark light mode night day hide lock सेटिंग्ज थीम", run: () => openSimpleModal("settingsModal") },
    { id: "profile", icon: "👤", label: "बिझनेस प्रोफाईल व UPI ID", cat: "general", kw: "profile business owner upi branding प्रोफाईल व्यवसाय", run: () => openSimpleModal("profileModal") },
    { id: "help", icon: "❓", label: "मराठी अ‍ॅप गाईड (Help & FAQ)", cat: "general", kw: "help guide faq tutorial मदत गाईड माहिती", run: () => openSimpleModal("helpGuideModal") },

    // Reports & Tools
    { id: "paid_list", icon: "💚", label: "जमा व्याज व ग्राहकनिहाय इतिहास", cat: "reports", kw: "interest profit paid history jama vyaj नफा जमा व्याज इतिहास", run: () => { if (typeof window.openVyajInterestList === "function") window.openVyajInterestList(); } },
    { id: "pnl", icon: "📈", label: "Profit & Loss अहवाल", cat: "reports", kw: "profit loss pnl nafa tota नफा तोटा अहवाल", run: () => document.getElementById("openPnlBtn")?.click() },
    { id: "pdf_month", icon: "🖨️", label: "चालू महिन्याचा PDF रिपोर्ट", cat: "reports", kw: "pdf print monthly report पीडीएफ प्रिंट", run: () => document.getElementById("printMonthlyPdfBtn")?.click() },
    { id: "excel_month", icon: "📑", label: "महिन्याची Excel / CSV फाईल", cat: "reports", kw: "excel csv export download एक्सेल फाईल", run: () => document.getElementById("exportMonthlyCsvBtn")?.click() },
    { id: "reminders", icon: "🔔", label: "WhatsApp, UPI QR व रिमाइंडर", cat: "reports", kw: "whatsapp qr reminder notification alarm वायदा रिमाइंडर", run: () => openToolPane("remSection", "📲 WhatsApp, UPI QR व रिमाइंडर") },
    { id: "emi", icon: "🧮", label: "EMI कॅल्क्युलेटर (Simulator)", cat: "reports", kw: "emi calculator interest flat reducing कॅल्क्युलेटर", run: () => openToolPane("emiSection", "🧮 EMI कॅल्क्युलेटर") },

    // Backup & Data
    { id: "backup_all", icon: "☁️", label: "Cloud Sync, Backup व Restore", cat: "backup", kw: "backup restore cloud sync json vault बॅकअप रिस्टोर क्लाउड", run: () => openToolPane("reportsSection", "☁️ Cloud Sync, Backup व Restore") },
    { id: "csv_import", icon: "📥", label: "CSV / Google Sheet Import", cat: "backup", kw: "import csv google sheet webhook इम्पोर्ट", run: () => openToolPane("reportsSection", "📥 CSV / Sheet Import व Webhook") },
    { id: "recycle", icon: "🗑️", label: "Recycle Bin (डिलीट खाती)", cat: "backup", kw: "recycle bin delete restore trash डिलीट खाती", run: () => openToolPane("recycleSection", "🗑️ Recycle Bin (डिलीट खाती)") },

    // Security & Privacy
    { id: "sec_dash", icon: "🛡️", label: "Admin Security Dashboard", cat: "security", kw: "security threat scan diagnostics सुरक्षा", run: () => document.getElementById("openSecurityDashBtn")?.click() },
    { id: "audit", icon: "📜", label: "Audit Log (बदलांचा इतिहास)", cat: "security", kw: "audit log history activity लॉग इतिहास", run: () => openToolPane("auditSection", "📜 Audit Log") },
    { id: "lock_app", icon: "🔒", label: "अ‍ॅप लगेच लॉक करा (Lock)", cat: "security", kw: "lock pin biometric security लॉक", run: () => document.getElementById("lockBtn")?.click() },
    { id: "logout", icon: "🚪", label: "लॉगआउट (Sign Out)", cat: "security", kw: "logout signout exit बाहेर लॉगआउट", run: () => {
      if (confirm("तुम्हाला अ‍ॅपमधून लॉगआउट करायचे आहे का?")) {
        if (typeof firebase !== "undefined" && firebase.auth) firebase.auth().signOut();
      }
    } }
  ];

  function getRecentIds() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch (_) { return []; }
  }

  function recordRecent(id) {
    try {
      const arr = getRecentIds().filter((x) => x !== id);
      arr.unshift(id);
      localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 4)));
    } catch (_) {}
  }

  // फीचर चालवा (Step-by-Step Back साठी मेन्यूला suspend करून पुढे जा)
  function launchFeature(feat) {
    if (!feat) return;
    recordRecent(feat.id);
    const searchInput = document.getElementById("proMenuSearchInput");
    if (searchInput) searchInput.value = "";
    renderSearchResults("");

    if (feat.id === "lock_app" || feat.id === "logout" || feat.id === "pdf_month" || feat.id === "excel_month") {
      closeProDrawer(false);
      setTimeout(() => feat.run(), 60);
      return;
    }

    if (window.VyajNavStack) {
      window.VyajNavStack.navigateFrom("proUnifiedDrawer", () => {
        feat.run();
      });
    } else {
      closeProDrawer(false);
      feat.run();
    }
  }

  // बिझनेस प्रोफाईलची माहिती वाचा
  function readProfileSummary() {
    const biz = document.getElementById("profBizName")?.value?.trim() || localStorage.getItem("vyaj_biz_name") || "व्याज हिशोब वही";
    const owner = document.getElementById("profOwnerName")?.value?.trim() || localStorage.getItem("vyaj_owner_name") || "बिझनेस प्रोफाईल सेट करा";
    const email = document.getElementById("userEmailBadge")?.textContent?.trim() ||
      (typeof firebase !== "undefined" && firebase.auth && firebase.auth().currentUser ? firebase.auth().currentUser.email : "");
    return { biz, owner, email };
  }

  // Modern Business Pro मेन्यू तयार करा
  function ensureProDrawer() {
    let drawer = document.getElementById("proUnifiedDrawer");
    if (drawer) return drawer;

    const backdrop = document.createElement("div");
    backdrop.id = "proMenuBackdrop";
    backdrop.className = "pro-menu-backdrop hidden";
    backdrop.addEventListener("click", () => {
      closeProDrawer(false);
      if (window.VyajNavStack) window.VyajNavStack.popIfTop("proUnifiedDrawer");
    });
    document.body.appendChild(backdrop);

    drawer = document.createElement("aside");
    drawer.id = "proUnifiedDrawer";
    drawer.className = "pro-drawer hidden";
    drawer.innerHTML = `
      <!-- १. प्रोफाईल कार्ड + Quick Lock -->
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

      <!-- २. माझा WhatsApp रिमाइंडर नंबर सेव्ह करा -->
      <div class="pro-menu-wa-box">
        <label class="pro-menu-wa-lbl" for="proMenuWaInput">📱 माझा WhatsApp रिमाइंडर नंबर सेव्ह करा:</label>
        <div class="pro-menu-wa-row">
          <input type="tel" id="proMenuWaInput" placeholder="9198XXXXXXXX" />
          <button type="button" id="proMenuWaSaveBtn" class="success sm">सेव्ह</button>
        </div>
        <div id="proMenuWaMsg" class="pro-menu-wa-msg"></div>
      </div>

      <!-- ३. स्मार्ट Feature Search Bar (WhatsApp नंबरच्या लगेच खाली) -->
      <div class="pro-menu-search-wrap">
        <input type="text" id="proMenuSearchInput" class="pro-menu-search-input" placeholder="🔍 फीचर शोधा (उदा. backup, pdf, emi, lock)..." autocomplete="off" />
        <div id="proMenuRecentStrip" class="pro-menu-recent-strip"></div>
        <div id="proMenuSearchResults" class="pro-menu-search-results hidden"></div>
      </div>

      <!-- ४. रोजची महत्त्वाची साधने (Quick Pinned 2x2) -->
      <div class="pro-menu-sec-lbl">⚡ मुख्य साधने</div>
      <div class="pro-menu-pinned-grid" id="proMenuPinnedGrid"></div>

      <!-- ५. कॅटेगरीनुसार Advance Accordion मेन्यू -->
      <div class="pro-menu-sec-lbl">📂 सर्व विभाग</div>
      <div class="pro-menu-acc-list" id="proMenuAccList"></div>
    `;
    document.body.appendChild(drawer);

    // प्रोफाईल कार्ड क्लिक
    document.getElementById("proMenuProfileTrigger")?.addEventListener("click", () => {
      const f = ALL_FEATURES.find((x) => x.id === "profile");
      launchFeature(f);
    });

    // Quick Lock क्लिक
    document.getElementById("proMenuQuickLock")?.addEventListener("click", () => {
      const f = ALL_FEATURES.find((x) => x.id === "lock_app");
      launchFeature(f);
    });

    // WhatsApp नंबर सेव्ह
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

    // स्मार्ट Feature Search इव्हेंट
    const searchInput = document.getElementById("proMenuSearchInput");
    searchInput?.addEventListener("input", () => {
      renderSearchResults(searchInput.value);
    });

    renderPinnedAndCategories();
    return drawer;
  }

  function renderPinnedAndCategories() {
    // १. Pinned Grid
    const pinnedEl = document.getElementById("proMenuPinnedGrid");
    if (pinnedEl) {
      const quickItems = ALL_FEATURES.filter((f) => f.cat === "quick");
      pinnedEl.innerHTML = quickItems
        .map((f) => `
          <button type="button" class="pro-pin-card" data-pro-feat="${esc(f.id)}">
            <span class="pro-pin-icon">${f.icon}</span>
            <span class="pro-pin-lbl">${esc(f.label)}</span>
          </button>
        `)
        .join("");
    }

    // २. चार कॅटेगरी ग्रुप्स (Accordion)
    const accEl = document.getElementById("proMenuAccList");
    if (accEl) {
      const groups = [
        { key: "general", icon: "⚙️", title: "General (सामान्य सेटिंग्ज)", open: true },
        { key: "reports", icon: "📊", title: "Reports & Tools (रिपोर्ट्स व साधने)", open: false },
        { key: "backup", icon: "☁️", title: "Backup & Data (बॅकअप व डेटा)", open: false },
        { key: "security", icon: "🛡️", title: "Security & Privacy (सुरक्षा)", open: false }
      ];

      accEl.innerHTML = groups
        .map((g) => {
          const items = ALL_FEATURES.filter((f) => f.cat === g.key);
          const rowsHtml = items
            .map((f) => {
              const extraBadge = f.id === "recycle" ? `<span class="badge" id="proMenuRecyclePill">0</span>` : "";
              return `
                <button type="button" class="pro-acc-item" data-pro-feat="${esc(f.id)}">
                  <span>${f.icon} ${esc(f.label)}</span>
                  <span class="pro-acc-right">${extraBadge}<span>▸</span></span>
                </button>
              `;
            })
            .join("");

          return `
            <div class="pro-acc-group ${g.open ? "is-open" : ""}" data-acc-group="${g.key}">
              <button type="button" class="pro-acc-head" data-acc-toggle="${g.key}">
                <span>${g.icon} ${esc(g.title)}</span>
                <span class="pro-acc-arrow">▾</span>
              </button>
              <div class="pro-acc-body">${rowsHtml}</div>
            </div>
          `;
        })
        .join("");

      accEl.querySelectorAll("[data-acc-toggle]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const grp = btn.closest(".pro-acc-group");
          if (grp) grp.classList.toggle("is-open");
        });
      });
    }

    // सर्व फीचर बटणांवर क्लिक जोडा
    document.getElementById("proUnifiedDrawer")?.querySelectorAll("[data-pro-feat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const feat = ALL_FEATURES.find((x) => x.id === btn.getAttribute("data-pro-feat"));
        launchFeature(feat);
      });
    });
  }

  function renderRecentChips() {
    const strip = document.getElementById("proMenuRecentStrip");
    if (!strip) return;
    const ids = getRecentIds();
    const items = ids.map((id) => ALL_FEATURES.find((f) => f.id === id)).filter(Boolean);
    if (!items.length) {
      strip.innerHTML = "";
      return;
    }
    strip.innerHTML = `<span class="pro-recent-tag">नुकतेच:</span>` + items
      .map((f) => `<button type="button" class="pro-recent-chip" data-rec-feat="${esc(f.id)}">${f.icon} ${esc(f.label.split(" ")[0])}</button>`)
      .join("");

    strip.querySelectorAll("[data-rec-feat]").forEach((b) => {
      b.addEventListener("click", () => {
        const feat = ALL_FEATURES.find((x) => x.id === b.getAttribute("data-rec-feat"));
        launchFeature(feat);
      });
    });
  }

  function renderSearchResults(query) {
    const resBox = document.getElementById("proMenuSearchResults");
    if (!resBox) return;
    const q = String(query || "").trim().toLowerCase();
    if (!q) {
      resBox.classList.add("hidden");
      resBox.innerHTML = "";
      return;
    }

    const matches = ALL_FEATURES.filter((f) => {
      return f.label.toLowerCase().includes(q) || f.kw.toLowerCase().includes(q);
    });

    resBox.classList.remove("hidden");
    if (!matches.length) {
      resBox.innerHTML = `<div class="muted" style="padding:8px; text-align:center; font-size:0.78rem;">कोणतेही फीचर सापडले नाही.</div>`;
      return;
    }

    resBox.innerHTML = matches
      .map((f) => `
        <button type="button" class="pro-search-hit" data-hit-feat="${esc(f.id)}">
          <span>${f.icon} ${esc(f.label)}</span>
          <span style="color:var(--accent);">उघडा ▸</span>
        </button>
      `)
      .join("");

    resBox.querySelectorAll("[data-hit-feat]").forEach((b) => {
      b.addEventListener("click", () => {
        const feat = ALL_FEATURES.find((x) => x.id === b.getAttribute("data-hit-feat"));
        launchFeature(feat);
      });
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

    const recCount = document.getElementById("recycleCountBadge")?.textContent || "0";
    const recPill = document.getElementById("proMenuRecyclePill");
    if (recPill) recPill.textContent = recCount;

    renderRecentChips();
  }

  function openProDrawer(isRestore = false) {
    const drawer = ensureProDrawer();
    const backdrop = document.getElementById("proMenuBackdrop");
    syncDrawerLiveData();

    drawer.classList.remove("hidden");
    backdrop?.classList.remove("hidden");
    requestAnimationFrame(() => drawer.classList.add("open"));

    if (!isRestore && window.VyajNavStack) {
      window.VyajNavStack.pushDrawer(
        "proUnifiedDrawer",
        () => closeProDrawer(false),
        () => openProDrawer(true)
      );
    }
    if (typeof window.updateVyajNewBtnVisibility === "function") {
      window.updateVyajNewBtnVisibility();
    }
  }

  function closeProDrawer() {
    const drawer = document.getElementById("proUnifiedDrawer");
    const backdrop = document.getElementById("proMenuBackdrop");
    if (drawer) {
      drawer.classList.remove("open");
      drawer.classList.add("hidden");
    }
    if (backdrop) backdrop.classList.add("hidden");
    if (typeof window.updateVyajNewBtnVisibility === "function") {
      window.updateVyajNewBtnVisibility();
    }
  }

  // हेडरमधील ☰ बटणाला आपला एकत्रित मेन्यू जोडा आणि ⋮ (Three-dot) लपवा
  function bindHeaderMenuButton() {
    const header = document.querySelector("header");
    if (!header) return;

    // जुने तीन-टिंब (⋮) स्लॉट पूर्णपणे लपवा
    const threeDot = document.getElementById("threeDotMenuSlot");
    if (threeDot) threeDot.style.display = "none";

    // आधीच एखादे ☰ बटण (dashboard.js कडून) असेल तर त्याचा क्लिक intercept करा
    const existingHam = Array.from(header.querySelectorAll("button")).find((b) => {
      const t = (b.textContent || "").trim();
      return t === "☰" || b.id.toLowerCase().includes("menu") || b.id.toLowerCase().includes("drawer");
    });

    if (existingHam && !existingHam.dataset.proBound) {
      existingHam.dataset.proBound = "1";
      existingHam.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        openProDrawer(false);
      }, true);
      return;
    }

    if (!existingHam && !document.getElementById("proMainMenuBtn")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "proMainMenuBtn";
      btn.className = "sm";
      btn.textContent = "☰";
      btn.title = "मुख्य मेन्यू";
      btn.style.fontSize = "1.05rem";
      btn.style.padding = "5px 10px";
      btn.addEventListener("click", () => openProDrawer(false));
      header.prepend(btn);
    }
  }

  window.openProUnifiedMenu = () => openProDrawer(false);

  function initProMenu() {
    ensureProDrawer();
    bindHeaderMenuButton();
    setTimeout(bindHeaderMenuButton, 800);
    setTimeout(bindHeaderMenuButton, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProMenu);
  } else {
    initProMenu();
  }
})();
