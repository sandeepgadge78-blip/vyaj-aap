// व्याज हिशोब वही - कॉम्पॅक्ट Fintech ग्राहक कार्ड + वर जामीनदार + थेट कार्ड-टॅप + सुटसुटीत ४-टॅब अपग्रेडर (js/pro/card-pro.js - V14.36)
(function () {
  let openCardId = null;
  const activeTabByCard = new Map();
  let enhanceTimer = null;

  function getBorrowerById(id) {
    if (!window.HishobBridge || typeof window.HishobBridge.getBorrowers !== "function") return null;
    return (window.HishobBridge.getBorrowers() || []).find((x) => x.id === id) || null;
  }

  function getActiveYm() {
    return document.getElementById("activeYm")?.value || new Date().toISOString().slice(0, 7);
  }

  function openFocusedEdit(borrowerId, focusInputId) {
    const editBtn = document.querySelector(`#borrowersList button[data-action="full-edit"][data-id="${borrowerId}"]`);
    if (editBtn) {
      editBtn.click();
      if (focusInputId) {
        setTimeout(() => {
          const inp = document.getElementById(focusInputId);
          if (inp) { inp.focus(); inp.scrollIntoView({ behavior: "smooth", block: "center" }); }
        }, 160);
      }
    }
  }

  // =========================================================================
  // भाग १: कॉम्पॅक्ट मुख्य कार्ड (वर जामीनदार + नाजूक स्टेटस पिल + Quick Pay + ▾ खूण)
  // =========================================================================
  function polishCollapsedFront(card, bId) {
    if (card.dataset.pcFrontReady === "1") return;
    card.dataset.pcFrontReady = "1";

    const b = getBorrowerById(bId);
    const activeYm = getActiveYm();
    const calc = (b && window.HishobBridge && typeof window.HishobBridge.computeLedgerUpToMonth === "function")
      ? window.HishobBridge.computeLedgerUpToMonth(b, activeYm)
      : null;

    // १. नावासमोर छोटा स्टेटस बॅज जोडा
    const titleEl = card.querySelector(".nc-title");
    if (titleEl && !titleEl.querySelector(".pc-status-pill")) {
      let cls = "pc-st-pending", txt = "बाकी";
      if (card.classList.contains("status-closed")) { cls = "pc-st-closed"; txt = "बंद"; }
      else if (card.classList.contains("status-paid")) { cls = "pc-st-paid"; txt = "जमा"; }
      else if (card.classList.contains("status-partial")) { cls = "pc-st-partial"; txt = "अर्धवट"; }

      const pill = document.createElement("span");
      pill.className = `pc-status-pill ${cls}`;
      pill.textContent = txt;
      titleEl.appendChild(pill);
    }

    // २. उजवीकडे '▼ तपशील' ऐवजी नाजूक '▾' आयकॉन जोडा
    const topBtns = card.querySelector(".nc-top-btns");
    if (topBtns && !topBtns.querySelector(".pc-chev-ind")) {
      const chev = document.createElement("span");
      chev.className = "pc-chev-ind";
      chev.textContent = "▾";
      topBtns.appendChild(chev);
    }

    // ३. नोकरी पिलशेजारीच जामीनदाराचे नाव (किंवा '+ जामीनदार' चिप) स्वच्छ एका ओळीत बसवा
    const jobBtn = card.querySelector(".nc-job-pill");
    if (jobBtn && jobBtn.parentElement && !jobBtn.parentElement.classList.contains("pc-meta-chips-row")) {
      jobBtn.parentElement.classList.add("pc-meta-chips-row");
      const gName = String(b?.guarantor || "").trim();
      const gChip = document.createElement("span");
      gChip.className = `pc-guar-chip ${gName ? "" : "is-empty"}`;
      gChip.textContent = gName ? `🤝 ${gName}` : "🤝 + जामीनदार";
      gChip.title = gName ? `जामीनदार: ${gName}` : "जामीनदाराचे नाव जोडा";
      gChip.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const gBtn = card.querySelector('button[data-action="quick-edit-guarantor"]');
        if (gBtn) gBtn.click();
        else openFocusedEdit(bId, "eGuarantor");
      });
      jobBtn.parentElement.appendChild(gChip);
    }

    // ४. तळाच्या ओळीत 'मागील बाकी' सोबत किती महिने बाकी आहेत ते दाखवा + चालू बाकी असल्यास '⚡ जमा' शॉर्टकट
    if (calc) {
      if (calc.pastDue > 0) {
        const pendingMonthsCount = (calc.pastPendingMonths || []).filter((pm) => Number(pm.remaining || 0) > 0).length;
        const footErr = card.querySelector(".nc-foot-row .err");
        if (footErr && pendingMonthsCount > 0 && !footErr.querySelector(".pc-months-tag")) {
          const mTag = document.createElement("span");
          mTag.className = "pc-months-tag";
          mTag.textContent = `${pendingMonthsCount} म.`;
          footErr.appendChild(mTag);
        }
      }

      const footRow = card.querySelector(".nc-foot-row");
      if (footRow && !card.classList.contains("status-closed") && calc.remainingThisMonth > 0 && !footRow.querySelector(".pc-qpay-chip")) {
        const qBtn = document.createElement("button");
        qBtn.type = "button";
        qBtn.className = "pc-qpay-chip";
        qBtn.textContent = "⚡ जमा";
        qBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const detEl = document.getElementById(`cardDetails_${bId}`);
          if (detEl && detEl.classList.contains("hidden")) {
            card.querySelector(`.nc-clickable-area[data-toggle-card="${bId}"]`)?.click();
          }
          activeTabByCard.set(bId, "ledger");
          setTimeout(() => {
            const inp = document.getElementById(`quickPayInput_${bId}`);
            if (inp) { inp.focus(); inp.select(); }
          }, 120);
        });
        footRow.appendChild(qBtn);
      }
    }
  }

  // =========================================================================
  // भाग २: उघडलेल्या कार्डला सुटसुटीत ४ टॅब्समध्ये बदला (डुप्लिकेट हेडिंग्स काढून)
  // =========================================================================
  function upgradeExpandedCard(card, bId) {
    if (!card || !bId || card.dataset.pcTabsReady === "1") return;
    if (card.classList.contains("status-closed")) return;

    const detailsWrap = document.getElementById(`cardDetails_${bId}`);
    if (!detailsWrap || detailsWrap.classList.contains("hidden")) return;

    const oldScWrap = detailsWrap.querySelector(".sc-wrap");
    if (!oldScWrap) return;

    const sections = Array.from(oldScWrap.querySelectorAll(":scope > .sc-sec"));
    if (sections.length < 6) return;

    card.dataset.pcTabsReady = "1";

    const secGuarHeader = sections.find((s) => s.querySelector('[data-action="quick-edit-guarantor"]'));
    const secPrincipal = sections.find((s) => s.querySelector('[data-action="add-principal-prompt"]'));
    const secInterest = sections.find((s) => (s.textContent || "").includes("3) महिन्याचे व्याज"));
    const secCurMonth = sections.find((s) => s.querySelector('[data-action="smart-collect"]'));
    const secPastDues = sections.find((s) => s.querySelector('[data-action="add-manual-month"]'));
    const secDocsStrip = sections.find((s) => (s.textContent || "").includes("कागदपत्रे:") && s.querySelector('[data-action="docs"]'));
    const secMobile = sections.find((s) => s.querySelector('[data-action="quick-edit-mobile"]'));
    const secIntDay = sections.find((s) => s.querySelector('[data-action="quick-edit-day"]'));
    const secPromises = sections.find((s) => s.querySelector('input[data-promise-field]') || s.querySelector('[data-up-widget]'));
    const secBottomTools = sections.find((s) => s.querySelector('[data-action="passbook"]'));

    const b = getBorrowerById(bId);
    const calc = (b && window.HishobBridge) ? window.HishobBridge.computeLedgerUpToMonth(b, getActiveYm()) : null;
    const hasPastDue = Boolean(calc && calc.pastDue > 0);
    const hasPromises = Boolean(b && (b.promiseDate1 || b.promiseDate2 || b.promiseDate3 || (Array.isArray(b.promiseList) && b.promiseList.some((p) => p.status !== "done"))));

    const currentTab = activeTabByCard.get(bId) || "ledger";

    const shell = document.createElement("div");
    shell.className = "pc-tab-shell";
    shell.innerHTML = `
      <div class="pc-tab-nav" role="tablist">
        <button type="button" class="pc-tab-btn ${currentTab === "ledger" ? "is-active" : ""}" data-pctab="ledger">
          <span class="pc-t-ic">💰</span><span>हिशोब</span>
          ${hasPastDue ? `<span class="pc-tab-dot"></span>` : ""}
        </button>
        <button type="button" class="pc-tab-btn ${currentTab === "loan" ? "is-active" : ""}" data-pctab="loan">
          <span class="pc-t-ic">🏦</span><span>मुद्दल/दर</span>
        </button>
        <button type="button" class="pc-tab-btn ${currentTab === "contact" ? "is-active" : ""}" data-pctab="contact">
          <span class="pc-t-ic">📅</span><span>वायदे/संपर्क</span>
          ${hasPromises ? `<span class="pc-tab-dot" style="background:var(--accent);"></span>` : ""}
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

    const wrapInBlock = (title, rightBtnHtml, contentNode, extraCls = "") => {
      const blk = document.createElement("div");
      blk.className = `pc-block ${extraCls}`.trim();
      if (title) {
        const hd = document.createElement("div");
        hd.className = "pc-block-head";
        hd.innerHTML = `<span class="pc-block-title">${title}</span>${rightBtnHtml || ""}`;
        blk.appendChild(hd);
      }
      if (contentNode) blk.appendChild(contentNode);
      return blk;
    };

    // टॅब १: हिशोब व मागील बाकी (डुप्लिकेट क्रमांक शीर्षके लपवा)
    if (secCurMonth) {
      const h = secCurMonth.querySelector(":scope > div:first-child");
      if (h && (h.textContent || "").includes("4) निवडलेला महिना")) h.style.display = "none";
      paneLedger.appendChild(wrapInBlock("चालू महिना वसुली नोंद", "", secCurMonth));
    }

    const noteBoxNode = secPastDues ? secPastDues.querySelector(".sc-note-box") : null;
    if (noteBoxNode) noteBoxNode.remove();

    if (secPastDues) {
      const h = secPastDues.querySelector(":scope > div:first-child");
      if (h && (h.textContent || "").includes("5) मागील बाकी")) h.style.display = "none";
      paneLedger.appendChild(wrapInBlock("मागील बाकी महिने व रक्कम", "", secPastDues));
    }

    // टॅब २: मुद्दल, व्याज दर व व्याज तारीख
    if (secPrincipal) paneLoan.appendChild(wrapInBlock("मुद्दल व इतिहास", "", secPrincipal));
    if (secInterest) {
      paneLoan.appendChild(wrapInBlock(
        "मासिक व्याज व दर",
        `<button type="button" class="pc-adv-edit-btn" data-pc-fedit="eRate">✏️ दर बदला</button>`,
        secInterest
      ));
    }

    const movedToolBtns = [];
    if (secIntDay) {
      ["upi-qr", "vachan", "timeline"].forEach((act) => {
        const btn = secIntDay.querySelector(`button[data-action="${act}"]`);
        if (btn) { btn.remove(); movedToolBtns.push(btn); }
      });
      const stg = secIntDay.querySelector("strong");
      if (stg && (stg.textContent || "").includes("7) व्याजाची तारीख:")) stg.textContent = "तारीख:";
      paneLoan.appendChild(wrapInBlock("दरमहा व्याजाची तारीख", "", secIntDay));
    }

    // टॅब ३: वायदे, संपर्क, जामीनदार व टीप (डुप्लिकेट शीर्षके काढून स्वच्छ एक ओळ)
    if (secGuarHeader) {
      ["full-edit", "docs", "soft-delete"].forEach((act) => {
        const btn = secGuarHeader.querySelector(`button[data-action="${act}"]`);
        if (btn) { btn.remove(); movedToolBtns.push(btn); }
      });
      paneContact.appendChild(wrapInBlock(
        "जामीनदार व खाते दर्जा",
        `<button type="button" class="pc-adv-edit-btn" data-pc-fedit="eCompanyDept">✏️ नोकरी/विभाग</button>`,
        secGuarHeader
      ));
    }

    if (secMobile) {
      const stg = secMobile.querySelector("strong");
      if (stg && (stg.textContent || "").includes("6) मोबाईल नंबर:")) stg.textContent = "📱";
      paneContact.appendChild(wrapInBlock("मोबाईल व WhatsApp", "", secMobile, "pc-mob-compact"));
    }

    if (secPromises) {
      const stg = secPromises.querySelector("strong");
      if (stg && (stg.textContent || "").includes("8) वायद्याच्या")) stg.style.display = "none";
      paneContact.appendChild(wrapInBlock("वायदे व रिमाइंडर (अमर्यादित)", "", secPromises));
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
        saveNoteBtn.style.fontSize = "0.66rem";
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

    // टॅब ४: साधने (स्वच्छ २-कॉलम ग्रिड)
    const toolsGrid = document.createElement("div");
    toolsGrid.className = "pc-tools-grid";

    const bottomBtns = secBottomTools ? Array.from(secBottomTools.querySelectorAll("button")) : [];
    const allToolButtons = [...movedToolBtns, ...bottomBtns];

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
      if (btn.getAttribute("data-action") === "soft-delete" && btn.textContent.trim() === "🗑️") btn.textContent = "🗑️ खाते डिलीट";
      if (btn.getAttribute("data-action") === "full-edit") btn.textContent = "✏️ प्रोफाईल एडिट";
      toolsGrid.appendChild(btn);
    });

    if (typeof window.openInvoiceReceipt === "function" && !toolsGrid.querySelector("[data-pro-invoice-btn]")) {
      const invBtn = document.createElement("button");
      invBtn.type = "button";
      invBtn.className = "success sm";
      invBtn.setAttribute("data-pro-invoice-btn", bId);
      invBtn.textContent = "🧾 QR पावती";
      invBtn.addEventListener("click", (ev) => { ev.stopPropagation(); window.openInvoiceReceipt(bId); });
      toolsGrid.insertBefore(invBtn, toolsGrid.children[2] || null);
    }

    if (typeof window.openProCustomerDetails === "function" && !toolsGrid.querySelector("[data-pro-details-btn]")) {
      const detBtn = document.createElement("button");
      detBtn.type = "button";
      detBtn.className = "primary sm";
      detBtn.setAttribute("data-pro-details-btn", bId);
      detBtn.textContent = "📋 All Details";
      detBtn.addEventListener("click", (ev) => { ev.stopPropagation(); window.openProCustomerDetails(bId); });
      toolsGrid.insertBefore(detBtn, toolsGrid.children[1] || null);
    }

    paneTools.appendChild(wrapInBlock("खाते साधने व दस्तऐवज", "", toolsGrid));

    if (secDocsStrip) secDocsStrip.remove();
    oldScWrap.replaceWith(shell);

    shell.querySelectorAll("[data-pctab]").forEach((tBtn) => {
      tBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const tabKey = tBtn.getAttribute("data-pctab");
        activeTabByCard.set(bId, tabKey);
        shell.querySelectorAll("[data-pctab]").forEach((x) => x.classList.toggle("is-active", x === tBtn));
        shell.querySelectorAll("[data-pcpane]").forEach((p) => p.classList.toggle("hidden", p.getAttribute("data-pcpane") !== tabKey));
      });
    });

    shell.querySelectorAll("[data-pc-fedit]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openFocusedEdit(bId, btn.getAttribute("data-pc-fedit"));
      });
    });
  }

  function processBorrowersList() {
    const listEl = document.getElementById("borrowersList");
    if (!listEl) return;

    Array.from(listEl.querySelectorAll(".borrower-item.nc-card")).forEach((card) => {
      const clickArea = card.querySelector(".nc-clickable-area[data-toggle-card]");
      const bId = clickArea ? clickArea.getAttribute("data-toggle-card") : "";
      if (!bId) return;

      polishCollapsedFront(card, bId);

      const detailsEl = document.getElementById(`cardDetails_${bId}`);
      if (openCardId === bId && detailsEl && detailsEl.classList.contains("hidden")) {
        detailsEl.classList.remove("hidden");
      }

      const isOpen = Boolean(detailsEl && !detailsEl.classList.contains("hidden"));
      card.classList.toggle("pc-is-open", isOpen);
      if (isOpen) upgradeExpandedCard(card, bId);
    });
  }

  function bindCardToggleWatcher() {
    const listEl = document.getElementById("borrowersList");
    if (!listEl) return;

    listEl.addEventListener("click", (ev) => {
      const clickArea = ev.target && ev.target.closest ? ev.target.closest(".nc-clickable-area[data-toggle-card]") : null;
      if (!clickArea) return;
      if (ev.target.closest('button[data-action="call-borrower"], button[data-action="quick-edit-mobile"], button[data-action="full-edit"], .pc-guar-chip, .pc-qpay-chip')) return;

      const bId = clickArea.getAttribute("data-toggle-card");
      if (!bId) return;

      setTimeout(() => {
        const detailsEl = document.getElementById(`cardDetails_${bId}`);
        const card = clickArea.closest(".borrower-item.nc-card");
        if (!detailsEl || !card) return;

        const isOpen = !detailsEl.classList.contains("hidden");
        card.classList.toggle("pc-is-open", isOpen);
        if (isOpen) {
          openCardId = bId;
          upgradeExpandedCard(card, bId);
        } else if (openCardId === bId) {
          openCardId = null;
        }
      }, 25);
    });

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
