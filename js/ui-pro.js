// व्याज हिशोब वही - Customer Avatar, Single-Line Actions, 4-Card Reports Hub, Toggle Settings, Glass New & Global Back (js/ui-pro.js - V14.21)
(function () {
  let modalHistoryCount = 0;
  let enhanceTimer = null;

  function fmtInr(n) {
    if (window.HishobBridge && typeof window.HishobBridge.fmtAmt === "function") {
      return window.HishobBridge.fmtAmt(n);
    }
    return "₹" + Number(n || 0).toLocaleString("en-IN");
  }

  // १. डुप्लिकेट बटणे आणि पॉपअपमधील '✕ बंद' बटणे लपवा
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
        if (!btn.classList.contains("ui-pro-hide-close")) {
          btn.classList.add("ui-pro-hide-close");
        }
      }
    });
  }

  // २. ग्राहक कार्डवर गोल अवतार व एकाच ओळीतील अ‍ॅक्शन बार लावा
  function enhanceCustomerCards() {
    const listEl = document.getElementById("borrowersList");
    if (!listEl) return;

    listEl.querySelectorAll(".borrower-item").forEach((card) => {
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

  // ३. टप्पा २: ४-रंगी Eye-Comfort 'Reports Hub' पॉपअप तयार करा
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

        <!-- ४ सॉफ्ट ग्रेडियंट कार्ड्स -->
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

        <!-- Quick Reports यादी -->
        <div style="font-size:0.8rem; font-weight:800; color:var(--muted); margin-bottom:8px;">⚡ Quick Reports & Exports</div>
        <div class="pro-quick-list">
          <div class="pro-quick-item" id="repQuickPdf">
            <span>🖨️ चालू महिन्याचा PDF रिपोर्ट</span>
            <span style="color:var(--accent);">▸</span>
          </div>
          <div class="pro-quick-item" id="repQuickMonthCsv">
            <span>📊 चालू महिन्याची Excel / CSV फाईल</span>
            <span style="color:var(--accent);">▸</span>
          </div>
          <div class="pro-quick-item" id="repQuickAllCsv">
            <span>📑 संपूर्ण खातेवही (All-Time CSV)</span>
            <span style="color:var(--accent);">▸</span>
          </div>
          <div class="pro-quick-item" id="repQuickPnl">
            <span>📈 Profit & Loss (नफा-तोटा अहवाल)</span>
            <span style="color:var(--accent);">▸</span>
          </div>
          <div class="pro-quick-item" id="repQuickBackup">
            <span>☁️ Cloud Backup, Restore व Import</span>
            <span style="color:var(--accent);">▸</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });

    // ४ कार्ड्सचे क्लिक अ‍ॅक्शन
    document.getElementById("repCardProfit")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      if (typeof window.openVyajInterestList === "function") window.openVyajInterestList();
    });
    document.getElementById("repCardMonthly")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      document.getElementById("tileInterest")?.click();
    });
    document.getElementById("repCardPending")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      document.getElementById("tilePending")?.click();
    });
    document.getElementById("repCardPrincipal")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      document.getElementById("tilePrincipal")?.click();
    });

    // Quick Reports बटणांचे क्लिक अ‍ॅक्शन
    document.getElementById("repQuickPdf")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      document.getElementById("printMonthlyPdfBtn")?.click();
    });
    document.getElementById("repQuickMonthCsv")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      document.getElementById("exportMonthlyCsvBtn")?.click();
    });
    document.getElementById("repQuickAllCsv")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      document.getElementById("exportAllCsvBtn")?.click();
    });
    document.getElementById("repQuickPnl")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      document.getElementById("openPnlBtn")?.click();
    });
    document.getElementById("repQuickBackup")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      const toolModal = document.getElementById("toolSectionModal");
      const repSec = document.getElementById("reportsSection");
      const titleEl = document.getElementById("toolSectionModalTitle");
      if (toolModal && repSec) {
        document.querySelectorAll(".tool-sec-pane").forEach((p) => p.classList.add("hidden"));
        repSec.classList.remove("hidden");
        if (titleEl) titleEl.textContent = "☁️ Cloud Backup, Restore व Import";
        toolModal.classList.remove("hidden");
      }
    });

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

  // ४. टप्पा २: Settings मध्ये आधुनिक Toggle Switch UI जोडा (जुन्या IDs न तोडता)
  function upgradeSettingsWithToggles() {
    const settingsModal = document.getElementById("settingsModal");
    if (!settingsModal) return;

    const oldThemeBtn = document.getElementById("setToggleThemeBtn");
    const oldHideBtn = document.getElementById("setToggleHideBtn");

    if (!document.getElementById("proSettingsToggles")) {
      const targetRow = oldThemeBtn ? oldThemeBtn.closest(".row") : null;
      if (targetRow) {
        // जुनी बटणे लपवा पण DOM मध्येच ठेवा जेणेकरून मूळ इव्हेंट्स चालत राहतील
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
            <label class="pro-switch">
              <input type="checkbox" id="proToggleDark" />
              <span class="pro-slider"></span>
            </label>
          </div>

          <div class="pro-toggle-row">
            <div class="pro-toggle-info">
              <span class="pro-toggle-title">👁️ रकमा लपवा (Privacy Mode)</span>
              <span class="pro-toggle-desc">डॅशबोर्डवरील रकमा सुरक्षितपणे लपवा</span>
            </div>
            <label class="pro-switch">
              <input type="checkbox" id="proToggleHideAmt" />
              <span class="pro-slider"></span>
            </label>
          </div>

          <div class="pro-toggle-row">
            <div class="pro-toggle-info">
              <span class="pro-toggle-title">🔔 10/4/6 Push अलर्ट</span>
              <span class="pro-toggle-desc">वायद्याचे वेळेवर मोबाईल नोटिफिकेशन</span>
            </div>
            <label class="pro-switch">
              <input type="checkbox" id="proTogglePush" />
              <span class="pro-slider"></span>
            </label>
          </div>
        `;
        targetRow.parentNode.insertBefore(toggleGroup, targetRow);

        // Toggle १: Night / Day Mode
        document.getElementById("proToggleDark")?.addEventListener("change", () => {
          if (oldThemeBtn) oldThemeBtn.click();
          else document.getElementById("toggleThemeBtn")?.click();
          setTimeout(syncSettingsToggleStates, 80);
        });

        // Toggle २: Hide / Show Amounts
        document.getElementById("proToggleHideAmt")?.addEventListener("change", () => {
          if (oldHideBtn) oldHideBtn.click();
          else document.getElementById("toggleHideAmtBtn")?.click();
          setTimeout(syncSettingsToggleStates, 80);
        });

        // Toggle ३: Push Notifications
        document.getElementById("proTogglePush")?.addEventListener("change", (ev) => {
          const msgEl = document.getElementById("setStatusMsg");
          if (ev.target.checked) {
            const pushBtn = document.getElementById("enableProPushBtn") || document.getElementById("enableNotifBtn");
            if (pushBtn) pushBtn.click();
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
      darkChk.checked = isNight;
      if (themeDesc) {
        themeDesc.textContent = isNight ? "सध्या: Smoked Black Glass (Night)" : "सध्या: Warm Eye-Comfort Paper (Day)";
      }
    }

    const hideChk = document.getElementById("proToggleHideAmt");
    if (hideChk) {
      const sampleAmt = (document.getElementById("dashTotalPrincipal")?.textContent || "").trim();
      hideChk.checked = sampleAmt.includes("*") || sampleAmt.includes("•");
    }

    const pushChk = document.getElementById("proTogglePush");
    if (pushChk) {
      const permOk = "Notification" in window && Notification.permission === "granted";
      pushChk.checked = localStorage.getItem("vyaj_fcm_enabled") === "true" && permOk;
    }
  }

  // ५. UI Glass '＋ New' बटण तयार करा
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

  // ६. ग्लोबल मोबाईल Back बटण सिस्टम
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

  function observeAppChanges() {
    let prevOpenCount = getOpenModals().length;

    const obs = new MutationObserver(() => {
      const curOpenCount = getOpenModals().length;
      if (curOpenCount > prevOpenCount) {
        pushOverlayHistory("auto_modal");
        syncSettingsToggleStates();
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
    upgradeSettingsWithToggles();
    cleanDuplicateControls();
    enhanceCustomerCards();
    updateNewButtonVisibility();
    observeAppChanges();

    window.addEventListener("popstate", handleGlobalBackButton);
    setTimeout(() => {
      upgradeSettingsWithToggles();
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
