// व्याज हिशोब वही - '📋 महिना नोंदी' (VyajKernel Single Source of Truth वर आधारित • १००% अचूक हिशोब) (js/pro/month-activity-pro.js - V15.0)
(function () {
  let activeTab = "newAcc"; // newAcc | principal | interest | udhaari
  let searchQuery = "";

  function injectMonthActivityCss() {
    if (document.getElementById("vyajMonthActivityCss")) return;
    const st = document.createElement("style");
    st.id = "vyajMonthActivityCss";
    st.textContent = `
      .ma-hero-btn {
        background: linear-gradient(135deg, #1d4ed8, #2563eb) !important;
        border: 1px solid rgba(125, 211, 252, 0.45) !important;
        color: #fff !important;
        font-weight: 800 !important;
      }
      .ma-kpi-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; margin-bottom: 9px; }
      .ma-kpi { padding: 8px; border-radius: 11px; background: var(--meta-bg); border: 1px solid var(--border); }
      .ma-kpi-lbl { font-size: 0.67rem; color: var(--muted); font-weight: 700; }
      .ma-kpi-val { font-size: 0.96rem; font-weight: 900; margin-top: 2px; }
      .ma-kpi-sub { font-size: 0.64rem; color: var(--muted); margin-top: 2px; }

      .ma-tabs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px; margin-bottom: 9px; }
      .ma-tab-btn {
        padding: 6px 5px !important; font-size: 0.72rem !important; font-weight: 800 !important;
        border-radius: 10px !important; background: var(--meta-bg) !important; color: var(--text) !important;
      }
      .ma-tab-btn.is-active { background: #eceff4 !important; color: #090a0d !important; border-color: #eceff4 !important; }
      body.light-mode .ma-tab-btn.is-active { background: #1f242d !important; color: #fbfaf7 !important; }

      .ma-item {
        padding: 9px 10px; border-radius: 11px; margin-bottom: 7px;
        background: var(--meta-bg); border: 1px solid var(--border);
        border-left: 3px solid var(--accent);
        display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;
      }
      .ma-item.is-out { border-left-color: var(--gold); }
      .ma-item.is-in { border-left-color: var(--accent-2); }
      .ma-item.is-ud { border-left-color: #c4b5fd; }
      .ma-name { font-size: 0.85rem; font-weight: 800; color: var(--text); }
      .ma-meta { font-size: 0.7rem; color: var(--muted); margin-top: 2px; line-height: 1.4; }
      .ma-amt { font-size: 0.92rem; font-weight: 900; white-space: nowrap; text-align: right; }
    `;
    document.head.appendChild(st);
  }

  function ensureModal() {
    let modal = document.getElementById("proMonthActivityModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "proMonthActivityModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `<div class="modal-card" style="max-width:650px;" id="proMonthActivityBody"></div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("proMonthActivityModal");
      }
    });
    return modal;
  }

  function renderModal() {
    const body = document.getElementById("proMonthActivityBody");
    if (!body || !window.VyajKernel) return;

    const K = window.VyajKernel;
    const r = K.getMonthReport();
    const s = r.summary;
    const ud = r.udhaari;
    const q = searchQuery.trim().toLowerCase();

    let rowsHtml = "";
    if (activeTab === "newAcc") {
      const list = r.newAccounts.filter((x) => !q || `${x.name} ${x.guarantor}`.toLowerCase().includes(q));
      rowsHtml = list.length
        ? list.map((x) => `
          <div class="ma-item is-out">
            <div>
              <div class="ma-name">🆕 ${K.esc(x.name)}</div>
              <div class="ma-meta">📅 ${K.esc(K.fmtDateShort(x.date))} • दर: ${K.esc(x.rate)}%${x.guarantor ? ` • जामीनदार: ${K.esc(x.guarantor)}` : ""}</div>
            </div>
            <div class="ma-amt" style="color:var(--gold);">${K.fmtInrPlain(x.amount)}<div style="font-size:0.63rem; color:var(--muted);">नवीन मुद्दल</div></div>
          </div>
        `).join("")
        : `<div class="muted" style="text-align:center; padding:18px; font-size:0.8rem;">या महिन्यात कोणतेही नवीन खाते जोडलेले नाही.</div>`;
    } else if (activeTab === "principal") {
      const list = r.principalMoves.filter((x) => !q || `${x.name} ${x.note}`.toLowerCase().includes(q));
      rowsHtml = list.length
        ? list.map((x) => `
          <div class="ma-item ${x.kind === "add" ? "is-out" : "is-in"}">
            <div>
              <div class="ma-name">${x.kind === "add" ? "➕" : "➖"} ${K.esc(x.name)}</div>
              <div class="ma-meta">📅 ${K.esc(K.fmtDateShort(x.date))} • ${x.kind === "add" ? "अतिरिक्त मुद्दल दिले" : "मुद्दल परत आले"}${x.note ? ` • ${K.esc(x.note)}` : ""}</div>
            </div>
            <div class="ma-amt" style="color:${x.kind === "add" ? "var(--gold)" : "var(--accent-2)"};">${x.kind === "add" ? "+" : "-"}${K.fmtInrPlain(x.amount)}</div>
          </div>
        `).join("")
        : `<div class="muted" style="text-align:center; padding:18px; font-size:0.8rem;">या महिन्यात अतिरिक्त किंवा परत मुद्दलाची नोंद नाही.</div>`;
    } else if (activeTab === "interest") {
      const list = r.interestMoves.filter((x) => !q || `${x.name} ${x.extraNote}`.toLowerCase().includes(q));
      rowsHtml = list.length
        ? list.map((x) => `
          <div class="ma-item is-in">
            <div>
              <div class="ma-name">💰 ${K.esc(x.name)}</div>
              <div class="ma-meta">
                चालू व्याज जमा: ${K.fmtInrPlain(x.currentInterestPaid)} (मासिक: ${K.fmtInrPlain(x.monthlyInterest)})
                ${x.extraNote ? `<br/><strong style="color:var(--accent);">💡 एक्स्ट्रा ${K.esc(x.extraNote)}</strong>` : ""}
              </div>
            </div>
            <div class="ma-amt" style="color:var(--accent-2);">+${K.fmtInrPlain(x.collected)}<div style="font-size:0.63rem; color:var(--muted);">एकूण जमा</div></div>
          </div>
        `).join("")
        : `<div class="muted" style="text-align:center; padding:18px; font-size:0.8rem;">या महिन्यात अजून व्याज जमा नोंद नाही.</div>`;
    } else {
      const list = ud.moves.filter((x) => !q || `${x.name} ${x.note}`.toLowerCase().includes(q));
      rowsHtml = list.length
        ? list.map((x) => `
          <div class="ma-item is-ud">
            <div>
              <div class="ma-name">🤝 ${K.esc(x.name)}</div>
              <div class="ma-meta">📅 ${K.esc(K.fmtDateShort(x.date))} • ${x.kind === "given" ? "उधारी दिली" : "उधारी परत मिळाली"}${x.note ? ` • ${K.esc(x.note)}` : ""}</div>
            </div>
            <div class="ma-amt" style="color:${x.kind === "given" ? "var(--gold)" : "var(--accent-2)"};">${x.kind === "given" ? "-" : "+"}${K.fmtInrPlain(x.amount)}</div>
          </div>
        `).join("")
        : `<div class="muted" style="text-align:center; padding:18px; font-size:0.8rem;">या महिन्यात कोणतीही उधारी हालचाल नाही.</div>`;
    }

    body.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:9px; padding-bottom:8px; border-bottom:1px solid var(--border);">
        <div>
          <h3 style="margin:0; color:var(--accent);">📋 महिना नोंदी (${K.esc(K.fmtYmMr(r.activeYm))})</h3>
          <div class="muted" style="font-size:0.71rem;">नवीन खाती, अति. मुद्दल, व्याज व उधारी (१००% अचूक)</div>
        </div>
        <button type="button" id="maPrintPdfBtn" class="primary sm">🖨️ नोंदी PDF</button>
      </div>

      <div class="ma-kpi-grid">
        <div class="ma-kpi">
          <div class="ma-kpi-lbl">📤 या महिन्यात दिलेले पैसे</div>
          <div class="ma-kpi-val" style="color:var(--gold);">${K.fmtInrPlain(r.cashflow.totalOut)}</div>
          <div class="ma-kpi-sub">नवीन: ${K.fmtInrPlain(s.newPrincipalSum)} • अति.: ${K.fmtInrPlain(s.extraPrincipalAddedSum)} • उधारी: ${K.fmtInrPlain(ud.givenInMonthSum)}</div>
        </div>
        <div class="ma-kpi">
          <div class="ma-kpi-lbl">📥 या महिन्यात आलेले पैसे</div>
          <div class="ma-kpi-val" style="color:var(--accent-2);">${K.fmtInrPlain(r.cashflow.totalIn)}</div>
          <div class="ma-kpi-sub">व्याज: ${K.fmtInrPlain(s.collectedInterest)} • मुद्दल: ${K.fmtInrPlain(s.extraPrincipalReducedSum)} • उधारी: ${K.fmtInrPlain(ud.returnedInMonthSum)}</div>
        </div>
      </div>

      <div class="ma-tabs">
        <button type="button" class="ma-tab-btn ${activeTab === "newAcc" ? "is-active" : ""}" data-matab="newAcc">🆕 नवीन खाती (${r.newAccounts.length})</button>
        <button type="button" class="ma-tab-btn ${activeTab === "principal" ? "is-active" : ""}" data-matab="principal">➕ अति. मुद्दल (${r.principalMoves.length})</button>
        <button type="button" class="ma-tab-btn ${activeTab === "interest" ? "is-active" : ""}" data-matab="interest">💰 व्याज/एक्स्ट्रा (${r.interestMoves.length})</button>
        <button type="button" class="ma-tab-btn ${activeTab === "udhaari" ? "is-active" : ""}" data-matab="udhaari">🤝 उधारी (${ud.moves.length})</button>
      </div>

      <input type="text" id="maSearchInp" class="search-pill-box" value="${K.esc(searchQuery)}" placeholder="🔍 या महिन्याच्या नोंदीत नाव शोधा..." style="margin-bottom:8px;" />
      <div style="max-height:48vh; overflow-y:auto;">${rowsHtml}</div>
    `;

    body.querySelectorAll("[data-matab]").forEach((btn) => {
      btn.addEventListener("click", () => { activeTab = btn.getAttribute("data-matab"); renderModal(); });
    });

    const sInp = document.getElementById("maSearchInp");
    sInp?.addEventListener("input", () => {
      searchQuery = sInp.value;
      const pos = sInp.selectionStart || searchQuery.length;
      renderModal();
      const next = document.getElementById("maSearchInp");
      if (next) { next.focus(); next.setSelectionRange(pos, pos); }
    });

    document.getElementById("maPrintPdfBtn")?.addEventListener("click", () => {
      const biz = (document.getElementById("profBizName")?.value || document.getElementById("tBrandTitle")?.textContent || "व्याज हिशोब वही").trim();
      const newRows = r.newAccounts.map((x, i) => `<tr><td>${i + 1}</td><td>${K.esc(x.name)}</td><td>${K.esc(K.fmtDateShort(x.date))}</td><td class="pw-num">${K.fmtInrPlain(x.amount)}</td><td class="pw-num">${K.esc(x.rate)}%</td></tr>`).join("") || `<tr><td colspan="5" style="text-align:center;">नोंद नाही</td></tr>`;
      const prinRows = r.principalMoves.map((x, i) => `<tr><td>${i + 1}</td><td>${K.esc(x.name)}</td><td>${K.esc(K.fmtDateShort(x.date))}</td><td>${x.kind === "add" ? "अतिरिक्त दिले" : "परत आले"}</td><td class="pw-num">${K.fmtInrPlain(x.amount)}</td></tr>`).join("") || `<tr><td colspan="5" style="text-align:center;">नोंद नाही</td></tr>`;
      const intRows = r.interestMoves.map((x, i) => `<tr><td>${i + 1}</td><td>${K.esc(x.name)}</td><td class="pw-num">${K.fmtInrPlain(x.monthlyInterest)}</td><td class="pw-num">${K.fmtInrPlain(x.collected)}</td><td>${K.esc(x.extraNote || "-")}</td></tr>`).join("") || `<tr><td colspan="5" style="text-align:center;">नोंद नाही</td></tr>`;
      const udRows = ud.moves.map((x, i) => `<tr><td>${i + 1}</td><td>${K.esc(x.name)}</td><td>${K.esc(K.fmtDateShort(x.date))}</td><td>${x.kind === "given" ? "उधारी दिली" : "परत मिळाली"}</td><td class="pw-num">${K.fmtInrPlain(x.amount)}</td></tr>`).join("") || `<tr><td colspan="5" style="text-align:center;">नोंद नाही</td></tr>`;

      const html = `
        <div class="pw-head">
          <div><h2 class="pw-title">${K.esc(biz)} — महिना नोंदी तपशील (${K.esc(K.fmtYmMr(r.activeYm))})</h2></div>
          <div class="pw-sub">दिले: ${K.fmtInrPlain(r.cashflow.totalOut)} | आले: ${K.fmtInrPlain(r.cashflow.totalIn)}</div>
        </div>
        <div class="pw-sec-title" style="border-top:none; margin-top:4px;">१. नवीन खाती (${r.newAccounts.length}) — एकूण ${K.fmtInrPlain(s.newPrincipalSum)}</div>
        <table class="pw-tbl"><thead><tr><th>क्र.</th><th>नाव</th><th>तारीख</th><th class="pw-num">मुद्दल</th><th class="pw-num">दर</th></tr></thead><tbody>${newRows}</tbody></table>
        <div class="pw-sec-title">२. अतिरिक्त / परत मुद्दल (${r.principalMoves.length})</div>
        <table class="pw-tbl"><thead><tr><th>क्र.</th><th>नाव</th><th>तारीख</th><th>प्रकार</th><th class="pw-num">रक्कम</th></tr></thead><tbody>${prinRows}</tbody></table>
        <div class="pw-sec-title">३. जमा व्याज व एक्स्ट्रा (${r.interestMoves.length}) — एकूण ${K.fmtInrPlain(s.collectedInterest)}</div>
        <table class="pw-tbl"><thead><tr><th>क्र.</th><th>नाव</th><th class="pw-num">मासिक व्याज</th><th class="pw-num">एकूण जमा</th><th>एक्स्ट्रा शेरा</th></tr></thead><tbody>${intRows}</tbody></table>
        <div class="pw-sec-title">४. स्वतंत्र उधारी हालचाल (${ud.moves.length})</div>
        <table class="pw-tbl"><thead><tr><th>क्र.</th><th>नाव</th><th>तारीख</th><th>प्रकार</th><th class="pw-num">रक्कम</th></tr></thead><tbody>${udRows}</tbody></table>
      `;
      K.printPureWhiteA4(html);
    });
  }

  function openMonthActivityModal() {
    const modal = ensureModal();
    renderModal();
    modal.classList.remove("hidden");
  }

  function injectHeroActivityButton() {
    const excelBtn = document.getElementById("heroExcelLink");
    if (!excelBtn || document.getElementById("heroMonthActivityBtn")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "heroMonthActivityBtn";
    btn.className = "ma-hero-btn";
    btn.textContent = "📋 महिना नोंदी";
    btn.title = "या महिन्यातील नवीन खाती, अतिरिक्त मुद्दल, व्याज व उधारी नोंदी पहा";
    btn.addEventListener("click", openMonthActivityModal);

    excelBtn.insertAdjacentElement("afterend", btn);
  }

  window.openVyajMonthActivity = openMonthActivityModal;

  function initMonthActivityPro() {
    injectMonthActivityCss();
    injectHeroActivityButton();
    setTimeout(injectHeroActivityButton, 900);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMonthActivityPro);
  else initMonthActivityPro();
})();
