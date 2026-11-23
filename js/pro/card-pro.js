// व्याज हिशोब वही - Advance Business Pro ग्राहक कार्ड व Lazy ४-टॅब अपग्रेडर + Active Tab Memory (js/pro/card-pro.js - V14.34)
(function () {
  let openCardId = null;
  const activeTabByCard = new Map();
  let enhanceTimer = null;

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function getBorrowerById(id) {
    if (!window.HishobBridge || typeof window.HishobBridge.getBorrowers !== "function") return null;
    return (window.HishobBridge.getBorrowers() || []).find((x) => x.id === id) || null;
  }

  function getActiveYm() {
    return document.getElementById("activeYm")?.value || new Date().toISOString().slice(0, 7);
  }

  // Edit पॉपअप उघडून थेट विशिष्ट रकान्यावर (उदा. व्याज दर किंवा नोकरी) फोकस करा
  function openFocusedEdit(borrowerId, focusInputId) {
    const editBtn = document.querySelector(`#borrowersList button[data-action="full-edit"][data-id="${borrowerId}"]`);
    if (editBtn) {
      editBtn.click();
      if (focusInputId) {
        setTimeout(() => {
          const inp = document.getElementById(focusInputId);
          if (inp) {
            inp.focus();
            inp.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 160);
      }
    }
  }

  // =========================================================================
  // भाग १: बंद स्थितीतील मुख्य कार्डला स्वच्छ Fintech लूक द्या (अतिशय हलके)
  // =========================================================================
  function polishCollapsedFront(card, bId) {
    if (card.dataset.pcFrontReady === "1") return;
    card.dataset.pcFrontReady = "1";

    const b = getBorrowerById(bId);
    const activeYm = getActiveYm();
    const calc = (b && window.HishobBridge && typeof window.HishobBridge.computeLedgerUpToMonth === "function")
      ? window.HishobBridge.computeLedgerUpToMonth(b, activeYm)
      : null;

    // १. नावासमोर स्पष्ट स्टेटस बॅज जोडा
    const titleEl = card.querySelector(".nc-title");
    if (titleEl && !titleEl.querySelector(".pc-status-pill")) {
      let cls = "pc-st-pending";
      let txt = "बाकी";
      if (card.classList.contains("status-closed")) { cls = "pc-st-closed"; txt = "बंद"; }
      else if (card.classList.contains("status-paid")) { cls = "pc-st-paid"; txt = "पूर्ण जमा"; }
      else if (card.classList.contains("status-partial")) { cls = "pc-st-partial"; txt = "अर्धवट"; }

      const pill = document.createElement("span");
      pill.className = `pc-status-pill ${cls}`;
      pill.textContent = txt;
      titleEl.appendChild(pill);
    }

    // २. नोकरी पिलशेजारीच जामीनदार चिप स्वच्छ एका ओळीत बसवा
    const jobBtn = card.querySelector(".nc-job-pill");
    if (jobBtn && jobBtn.parentElement && !jobBtn.parentElement.classList.contains("pc-meta-chips-row")) {
      jobBtn.parentElement.classList.add("pc-meta-chips-row");
      const gName = String(b?.guarantor || "").trim();
      if (gName && !jobBtn.parentElement.querySelector(".pc-guar-chip")) {
        const gChip = document.createElement("span");
        gChip.className = "pc-guar-chip";
        gChip.textContent = `🤝 ${gName}`;
        jobBtn.parentElement.appendChild(gChip);
      }
    }

    // ३. तळाच्या ओळीत 'मागील बाकी' सोबत किती महिने बाकी आहेत ते दाखवा (उदा. 3 महिने)
    if (calc && calc.pastDue > 0) {
      const pendingMonthsCount = (calc.pastPendingMonths || []).filter((pm) => Number(pm.remaining || 0) > 0).length;
      const footErr = card.querySelector(".nc-foot-row .err");
      if (footErr && pendingMonthsCount > 0 && !footErr.querySelector(".pc-months-tag")) {
        const mTag = document.createElement("span");
        mTag.className = "pc-months-tag";
        mTag.textContent = `${pendingMonthsCount} महिने`;
        footErr.appendChild(mTag);
      }
    }
  }

  // =========================================================================
  // भाग २: उघडलेल्या कार्डला Lazy On-Demand पद्धतीने ४ स्वच्छ टॅब्समध्ये बदला
  // (सर्व मूळ app.js बटणे व इनपुट्स जसेच्या तसे आत हलवून — १००% वर्किंग!)
  // =========================================================================
  function upgradeExpandedCard(card, bId) {
    if (!card || !bId || card.dataset.pcTabsReady === "1") return;
    if (card.classList.contains("status-closed")) return; // बंद खात्याला टॅब्सची गरज नाही

    const detailsWrap = document.getElementById(`cardDetails_${bId}`);
    if (!detailsWrap || detailsWrap.classList.contains("hidden")) return;

    const oldScWrap = detailsWrap.querySelector(".sc-wrap");
    if (!oldScWrap) return;

    const sections = Array.from(oldScWrap.querySelectorAll(":scope > .sc-sec"));
    if (sections.length < 6) return;

    card.dataset.pcTabsReady = "1";

    // प्रत्येक मूळ विभाग त्याच्या आतील अचूक अ‍ॅट्रीब्यूटवरून ओळखा
    const secGuarHeader = sections.find((s) => s.querySelector('[data-action="quick-edit-guarantor"]'));
    const secPrincipal = sections.find((s) => s.querySelector('[data-action="add-principal-prompt"]'));
    const secInterest = sections.find((s) => (s.textContent || "").includes("3) महिन्याचे व्याज"));
    const secCurMonth = sections.find((s) => s.querySelector('[data-action="smart-collect"]'));
    const secPastDues = sections.find((s) => s.querySelector('[data-action="add-manual-month"]'));
    const secDocsStrip = sections.find((s) => (s.textContent || "").includes("कागदपत्रे:") && s.querySelector('[data-action="docs"]'));
    const secMobile = sections.find((s) => s.querySelector('[data-action="quick-edit-mobile"]'));
    const secIntDay = sections.find((s) => s.querySelector('[data-action="quick-edit-day"]'));
    const secPromises = sections.find((s) => s.querySelector('input[data-promise-field]'));
    const secBottomTools = sections.find((s) => s.querySelector('[data-action="passbook"]'));

    const b = getBorrowerById(bId);
    const calc = (b && window.HishobBridge) ? window.HishobBridge.computeLedgerUpToMonth(b, getActiveYm()) : null;
    const hasPastDue = Boolean(calc && calc.pastDue > 0);
    const hasPromises = Boolean(b && (b.promiseDate1 || b.promiseDate2 || b.promiseDate3));

    const currentTab = activeTabByCard.get(bId) || "ledger";

    // नवीन ४-टॅब शेल तयार करा
    const shell = document.createElement("div");
    shell.className = "pc-tab-shell";
    shell.innerHTML = `
      <div class="pc-tab-nav" role="tablist">
        <button type="button" class="pc-tab-btn ${currentTab === "ledger" ? "is-active" : ""}" data-pctab="ledger">
          <span class="pc-t-ic">💰</span><span>हिशोब</span>
          ${hasPastDue ? `<span class="pc-tab-dot" title="मागील बाकी आहे"></span>` : ""}
        </button>
        <button type="button" class="pc-tab-btn ${currentTab === "loan" ? "is-active" : ""}" data-pctab="loan">
          <span class="pc-t-ic">🏦</span><span>मुद्दल/दर</span>
        </button>
        <button type="button" class="pc-tab-btn ${currentTab === "contact" ? "is-active" : ""}" data-pctab="contact">
          <span class="pc-t-ic">📅</span><span>वायदे/संपर्क</span>
          ${hasPromises ? `<span class="pc-tab-dot" style="background:var(--accent);" title="वायदा नोंदवला आहे"></span>` : ""}
        </button>
        <button type="button" class="pc-tab-btn ${currentTab === "tools" ? "is-active" : ""}" data-pctab="tools">
          <span class="pc-t-ic">🧰</span><span>साधने</span>
        </button>
      </div>
      <div class="pc-tab-panes">
        <div class="pc-pane ${currentTab === "ledger" ? "" : "hidden"}" data-pcpane="ledger"></div>
        <div class="pc-pane ${currentTab === "loan" ? "" : "hidden"}" data-pcpane="loan"></div>
        <div class="pc-pane ${currentTab === "contact" ? "" : "hidden"}" data-pcpane="contact"></div>
        <div class="pc-pane ${currentTab === "tools" ? "" : "hidden"}" data-pcpane="tools"></div>
      </div>
    `;

    const paneLedger = shell.querySelector('[data-pcpane="ledger"]');
    const paneLoan = shell.querySelector('[data-pcpane="loan"]');
    const paneContact = shell.querySelector('[data-pcpane="contact"]');
    const paneTools = shell.querySelector('[data-pcpane="tools"]');

    const wrapInBlock = (title, rightBtnHtml, contentNode) => {
      const blk = document.createElement("div");
      blk.className = "pc-block";
      if (title) {
        const hd = document.createElement("div");
        hd.className = "pc-block-head";
        hd.innerHTML = `<span class="pc-block-title">${title}</span>${rightBtnHtml || ""}`;
        blk.appendChild(hd);
      }
      if (contentNode) blk.appendChild(contentNode);
      return blk;
    };

    // ----- टॅब १: 💰 हिशोब व मागील बाकी -----
    if (secCurMonth) {
      paneLedger.appendChild(wrapInBlock("चालू महिना वसुली नोंद", "", secCurMonth));
    }

    // टीप बॉक्स (Note) बाहेर काढून टॅब ३ साठी बाजूला ठेवा
    const noteBoxNode = secPastDues ? secPastDues.querySelector(".sc-note-box") : null;
    if (noteBoxNode) noteBoxNode.remove();

    if (secPastDues) {
      const headingDiv = secPastDues.querySelector(":scope > div:first-child");
      if (headingDiv && (headingDiv.textContent || "").includes("5) मागील बाकी")) {
        headingDiv.style.display = "none";
      }
      paneLedger.appendChild(wrapInBlock("मागील बाकी महिने व रक्कम (वर्षनिहाय)", "", secPastDues));
    }

    // ----- टॅब २: 🏦 मुद्दल, व्याज दर व व्याज तारीख -----
    if (secPrincipal) {
      paneLoan.appendChild(wrapInBlock("मुद्दल व इतिहास", "", secPrincipal));
    }
    if (secInterest) {
      const blkInt = wrapInBlock(
        "मासिक व्याज व दर",
        `<button type="button" class="pc-adv-edit-btn" data-pc-fedit="eRate">✏️ दर / व्याज बदला</button>`,
        secInterest
      );
      paneLoan.appendChild(blkInt);
    }

    // टॅब ४ साठी QR, वचनचिट्ठी, Timeline बटणे बाजूला काढून व्याज तारीख टॅब २ मध्ये ठेवा
    const movedToolBtns = [];
    if (secIntDay) {
      ["upi-qr", "vachan", "timeline"].forEach((act) => {
        const btn = secIntDay.querySelector(`button[data-action="${act}"]`);
        if (btn) { btn.remove(); movedToolBtns.push(btn); }
      });
      paneLoan.appendChild(wrapInBlock("दरमहा व्याजाची तारीख", "", secIntDay));
    }

    // ----- टॅब ३: 📅 वायदे, संपर्क, जामीनदार व टीप -----
    if (secGuarHeader) {
      // एडिट, डॉक्युमेंट्स, डिलीट बटणे टॅब ४ साठी बाजूला काढा
      ["full-edit", "docs", "soft-delete"].forEach((act) => {
        const btn = secGuarHeader.querySelector(`button[data-action="${act}"]`);
        if (btn) { btn.remove(); movedToolBtns.push(btn); }
      });
      const blkGuar = wrapInBlock(
        "जामीनदार व खाते दर्जा",
        `<button type="button" class="pc-adv-edit-btn" data-pc-fedit="eCompanyDept">✏️ नोकरी / विभाग</button>`,
        secGuarHeader
      );
      paneContact.appendChild(blkGuar);
    }
    if (secMobile) {
      paneContact.appendChild(wrapInBlock("मोबाईल संपर्क व WhatsApp", "", secMobile));
    }
    if (secPromises) {
      paneContact.appendChild(wrapInBlock("वायद्याच्या ३ तारखा व रिमाइंडर", "", secPromises));
    }
    if (noteBoxNode) {
      const noteTitleDiv = noteBoxNode.querySelector(":scope > div:first-child");
      const noteTextarea = noteBoxNode.querySelector("textarea[data-inline-note]");
      if (noteTitleDiv && noteTextarea) {
        const row = document.createElement("div");
        row.className = "pc-note-save-row";
        row.appendChild(noteTitleDiv);
        const saveNoteBtn = document.createElement("button");
        saveNoteBtn.type = "button";
        saveNoteBtn.className = "success sm";
        saveNoteBtn.style.padding = "3px 8px";
        saveNoteBtn.style.fontSize = "0.68rem";
        saveNoteBtn.textContent = "💾 सेव्ह";
        saveNoteBtn.addEventListener("click", () => {
          noteTextarea.dispatchEvent(new Event("change", { bubbles: true }));
          saveNoteBtn.textContent = "✅ सेव्ह!";
          setTimeout(() => { saveNoteBtn.textContent = "💾 सेव्ह"; }, 1800);
        });
        row.appendChild(saveNoteBtn);
        noteBoxNode.prepend(row);
      }
      paneContact.appendChild(noteBoxNode);
    }

    // ----- टॅब ४: 🧰 सर्व साधने (स्वच्छ २-कॉलम ग्रिड) -----
    const toolsGrid = document.createElement("div");
    toolsGrid.className = "pc-tools-grid";

    // सर्व साधनांची बटणे एका स्वच्छ क्रमाने गोळा करा
    const bottomBtns = secBottomTools ? Array.from(secBottomTools.querySelectorAll("button")) : [];
    const allToolButtons = [...movedToolBtns, ...bottomBtns];

    // क्रम निश्चित करा (Full Edit, All Details, QR पावती, UPI QR, वचनचिट्ठी, Docs, Passbook, Timeline, Follow-up, नवीन कर्ज, Versions, खाते बंद, डिलीट)
    const priorityOrder = (btn) => {
      const act = btn.getAttribute("data-action") || "";
      if (act === "full-edit") return 1;
      if (btn.hasAttribute("data-pro-details-btn")) return 2;
      if (btn.hasAttribute("data-pro-invoice-btn")) return 3;
      if (act === "upi-qr") return 4;
      if (act === "vachan") return 5;
      if (act === "docs") return 6;
      if (act === "passbook") return 7;
      if (act === "timeline") return 8;
      if (act === "followup") return 9;
      if (act === "add-loan-same") return 10;
      if (act === "versions") return 11;
      if (act === "close-acc") return 12;
      if (act === "soft-delete") return 13;
      return 20;
    };

    allToolButtons.sort((a, c) => priorityOrder(a) - priorityOrder(c));
    allToolButtons.forEach((btn) => {
      if (btn.getAttribute("data-action") === "soft-delete" && btn.textContent.trim() === "🗑️") {
        btn.textContent = "🗑️ खाते डिलीट";
      }
      if (btn.getAttribute("data-action") === "full-edit") {
        btn.textContent = "✏️ संपूर्ण प्रोफाईल एडिट";
      }
      toolsGrid.appendChild(btn);
    });

    // जर डिजिटल QR पावती बटण आधीपासून नसले आणि फंक्शन उपलब्ध असेल तर तेही जोडा
    if (typeof window.openInvoiceReceipt === "function" && !toolsGrid.querySelector("[data-pro-invoice-btn]")) {
      const invBtn = document.createElement("button");
      invBtn.type = "button";
      invBtn.className = "success sm";
      invBtn.setAttribute("data-pro-invoice-btn", bId);
      invBtn.textContent = "🧾 डिजिटल QR पावती";
      invBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        window.openInvoiceReceipt(bId);
      });
      toolsGrid.insertBefore(invBtn, toolsGrid.children[2] || null);
    }

    // जर All Details बटण आधीपासून नसले तर तेही जोडा
    if (typeof window.openProCustomerDetails === "function" && !toolsGrid.querySelector("[data-pro-details-btn]")) {
      const detBtn = document.createElement("button");
      detBtn.type = "button";
      detBtn.className = "primary sm";
      detBtn.setAttribute("data-pro-details-btn", bId);
      detBtn.textContent = "📋 All Details";
      detBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        window.openProCustomerDetails(bId);
      });
      toolsGrid.insertBefore(detBtn, toolsGrid.children[1] || null);
    }

    paneTools.appendChild(wrapInBlock("खाते साधने व दस्तऐवज", "", toolsGrid));

    // अनावश्यक डुप्लिकेट कागदपत्रे पट्टी काढून टाका
    if (secDocsStrip) secDocsStrip.remove();

    // जुन्या .sc-wrap च्या जागी नवीन ४-टॅब शेल बसवा
    oldScWrap.replaceWith(shell);

    // टॅब स्विच इव्हेंट्स जोडा
    shell.querySelectorAll("[data-pctab]").forEach((tBtn) => {
      tBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const tabKey = tBtn.getAttribute("data-pctab");
        activeTabByCard.set(bId, tabKey);
        shell.querySelectorAll("[data-pctab]").forEach((x) => x.classList.toggle("is-active", x === tBtn));
        shell.querySelectorAll("[data-pcpane]").forEach((p) => p.classList.toggle("hidden", p.getAttribute("data-pcpane") !== tabKey));
      });
    });

    // Advance Edit शॉर्टकट इव्हेंट्स
    shell.querySelectorAll("[data-pc-fedit]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openFocusedEdit(bId, btn.getAttribute("data-pc-fedit"));
      });
    });
  }

  // सर्व कार्ड्सचा मुख्य लूक अपडेट करा + जर एखादे कार्ड आधी उघडे होते तर ते पुन्हा त्याच टॅबवर उघडा
  function processBorrowersList() {
    const listEl = document.getElementById("borrowersList");
    if (!listEl) return;

    const cards = Array.from(listEl.querySelectorAll(".borrower-item.nc-card"));
    cards.forEach((card) => {
      const clickArea = card.querySelector(".nc-clickable-area[data-toggle-card]");
      const bId = clickArea ? clickArea.getAttribute("data-toggle-card") : "";
      if (!bId) return;

      polishCollapsedFront(card, bId);

      // जर हे कार्ड आधी युजरने उघडे ठेवले होते (उदा. जमा/सेव्ह नंतर re-render झाले), तर पुन्हा त्याच टॅबवर उघडा
      const detailsEl = document.getElementById(`cardDetails_${bId}`);
      if (openCardId === bId && detailsEl && detailsEl.classList.contains("hidden")) {
        detailsEl.classList.remove("hidden");
        const tBtn = document.getElementById(`toggleDetailBtn_${bId}`);
        if (tBtn) tBtn.textContent = "▲ बंद";
      }

      if (detailsEl && !detailsEl.classList.contains("hidden")) {
        upgradeExpandedCard(card, bId);
      }
    });
  }

  // कार्ड उघडल्यावर लगेच ४-टॅब रचना तयार करा (On-Demand)
  function bindCardToggleWatcher() {
    const listEl = document.getElementById("borrowersList");
    if (!listEl) return;

    listEl.addEventListener("click", (ev) => {
      const toggleBtn = ev.target && ev.target.closest ? ev.target.closest('button[data-action="toggle-card-details"], .nc-clickable-area[data-toggle-card]') : null;
      if (!toggleBtn) return;

      // जर आतल्या Call किंवा Job बटनावर क्लिक झाले असेल तर टॉगल ट्रॅक करू नका
      if (ev.target.closest('button[data-action="call-borrower"], button[data-action="quick-edit-mobile"], button[data-action="full-edit"]')) return;

      const bId = toggleBtn.getAttribute("data-id") || toggleBtn.getAttribute("data-toggle-card");
      if (!bId) return;

      setTimeout(() => {
        const detailsEl = document.getElementById(`cardDetails_${bId}`);
        const card = toggleBtn.closest(".borrower-item.nc-card");
        if (!detailsEl || !card) return;

        if (!detailsEl.classList.contains("hidden")) {
          openCardId = bId;
          upgradeExpandedCard(card, bId);
        } else if (openCardId === bId) {
          openCardId = null;
        }
      }, 20);
    });

    // सर्च, फिल्टर किंवा महिना बदलला तर उघड्या कार्डची मेमरी स्वच्छ करा
    document.getElementById("searchInput")?.addEventListener("input", () => { openCardId = null; });
    document.getElementById("activeYm")?.addEventListener("change", () => { openCardId = null; });
    document.querySelectorAll("[data-statusfilter], [data-jobfilter], [data-accfilter]").forEach((b) => {
      b.addEventListener("click", () => { openCardId = null; });
    });

    const obs = new MutationObserver(() => {
      clearTimeout(enhanceTimer);
      enhanceTimer = setTimeout(processBorrowersList, 60);
    });
    obs.observe(listEl, { childList: true });
  }

  function initCardPro() {
    bindCardToggleWatcher();
    processBorrowersList();
    setTimeout(processBorrowersList, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initCardPro);
  else initCardPro();
})();
