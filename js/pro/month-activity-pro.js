// व्याज हिशोब वही - '📋 महिना नोंदी' (नवीन खाती, अति. मुद्दल, व्याज/एक्स्ट्रा जमा व उधारी हालचाल) (js/pro/month-activity-pro.js - V14.44)
(function () {
  const MONTHS_MR = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];
  let activeTab = "newAcc"; // newAcc | principal | interest | udhaari
  let searchQuery = "";

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function fmtInr(val) {
    return "₹" + Number(val || 0).toLocaleString("en-IN");
  }

  function fmtYmMr(ym) {
    if (!ym || !String(ym).includes("-")) return String(ym || "");
    const [y, m] = String(ym).split("-");
    return `${MONTHS_MR[parseInt(m, 10) - 1] || m} ${y}`;
  }

  function fmtDateShort(iso) {
    if (!iso) return "-";
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
  }

  function getPrevYm(ym) {
    if (!ym || !String(ym).includes("-")) return "";
    let [y, m] = String(ym).split("-").map((x) => parseInt(x, 10));
    m -= 1;
    if (m <= 0) { m = 12; y -= 1; }
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  function getActiveYm() {
    return document.getElementById("activeYm")?.value || new Date().toISOString().slice(0, 7);
  }

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
      .ma-kpi {
        padding: 8px; border-radius: 11px; background: var(--meta-bg); border: 1px solid var(--border);
      }
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

  // निवडलेल्या महिन्यातील सर्व हालचाली (नवीन खाती, अति. मुद्दल, व्याज व उधारी) एकत्रित करा
  function collectMonthActivityData(activeYm) {
    const newAcc = [];
    const principalMoves = [];
    const interestMoves = [];
    const udhaariMoves = [];

    let totalOut = 0; // दिलेले पैसे
    let totalIn = 0;  // आलेले पैसे
    let newAccSum = 0, extraPrinAddSum = 0, extraPrinRedSum = 0, interestColSum = 0, udGivenSum = 0, udRetSum = 0;

    const borrowers = window.HishobBridge && typeof window.HishobBridge.getBorrowers === "function"
      ? (window.HishobBridge.getBorrowers() || []).filter((b) => !b.isDeleted)
      : [];

    const prevYm = getPrevYm(activeYm);

    borrowers.forEach((b) => {
      // १. नवीन खाती
      const loanYm = String(b.loanDate || "").slice(0, 7);
      const startYm = String(b.startYm || "").slice(0, 7);
      const isNew = loanYm ? loanYm === activeYm : startYm === activeYm;
      if (isNew) {
        const initAmt = Number(b.originalPrincipal || b.principal || 0);
        newAccSum += initAmt;
        totalOut += initAmt;
        newAcc.push({
          id: b.id,
          name: b.name || "ग्राहक",
          amount: initAmt,
          date: b.loanDate || activeYm,
          rate: b.rate || 0,
          guarantor: b.guarantor || ""
        });
      }

      // २. अतिरिक्त / परत मुद्दल नोंदी
      const pSources = []
        .concat(Array.isArray(b.principalHistory) ? b.principalHistory : [])
        .concat(Array.isArray(b.principalLogs) ? b.principalLogs : [])
        .concat(Array.isArray(b.principalTransactions) ? b.principalTransactions : []);

      const seenP = new Set();
      pSources.forEach((ev) => {
        if (!ev) return;
        const evYm = String(ev.ym || ev.month || ev.date || ev.ts || "").slice(0, 7);
        if (evYm !== activeYm) return;
        const tStr = String(ev.type || ev.action || "").toLowerCase();
        const nStr = String(ev.note || ev.reason || "").toLowerCase();
        if (tStr === "initial" || tStr === "opening" || nStr.includes("मूळ मुद्दल") || nStr.includes("initial")) return;

        const rawAmt = Number(ev.delta !== undefined ? ev.delta : (ev.amount || ev.change || 0));
        if (!rawAmt) return;
        const sig = `${ev.date || evYm}|${rawAmt}|${tStr}|${ev.note || ""}`;
        if (seenP.has(sig)) return;
        seenP.add(sig);

        const isRed = rawAmt < 0 || tStr.includes("reduce") || tStr.includes("sub") || tStr.includes("return") || tStr.includes("deduct") || tStr.includes("minus");
        const absAmt = Math.abs(rawAmt);
        if (isRed) { extraPrinRedSum += absAmt; totalIn += absAmt; }
        else { extraPrinAddSum += absAmt; totalOut += absAmt; }

        principalMoves.push({
          id: b.id,
          name: b.name || "ग्राहक",
          kind: isRed ? "reduce" : "add",
          amount: absAmt,
          date: ev.date || activeYm,
          note: ev.note || ev.reason || ""
        });
      });

      // ३. या महिन्यातील व्याज व एक्स्ट्रा जमा
      const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
      const col = Number(calc.collectedInMonth || 0);
      if (col > 0) {
        interestColSum += col;
        totalIn += col;
        const mInt = Number(calc.monthlyInterest || 0);
        const extraAmt = Math.max(0, col - mInt);
        let extraNote = "";
        if (extraAmt > 0) {
          let prevPending = 0;
          if (prevYm && (!startYm || prevYm >= startYm)) {
            try { prevPending = Math.max(0, Number(window.HishobBridge.computeLedgerUpToMonth(b, prevYm).totalPayable || 0)); } catch (_) {}
          }
          if (prevPending > 0) {
            const cutPast = Math.min(extraAmt, prevPending);
            const toAdv = Math.max(0, extraAmt - cutPast);
            extraNote = toAdv > 0
              ? `एक्स्ट्रा +${fmtInr(cutPast)} (मागील बाकीत वजा) व +${fmtInr(toAdv)} (पुढील अ‍ॅडव्हान्स)`
              : `एक्स्ट्रा +${fmtInr(cutPast)} (मागील बाकीतून वजा)`;
          } else {
            extraNote = `एक्स्ट्रा +${fmtInr(extraAmt)} (पुढील महिन्यात अ‍ॅडव्हान्स)`;
          }
        }
        interestMoves.push({
          id: b.id,
          name: b.name || "ग्राहक",
          monthlyInt: mInt,
          collected: col,
          extraAmt,
          extraNote,
          status: calc.status
        });
      }
    });

    // ४. या महिन्यातील स्वतंत्र उधारी हालचाल (दिलेली + परत मिळालेली)
    const udList = typeof window.getProUdhaariList === "function" ? (window.getProUdhaariList() || []) : [];
    udList.forEach((u) => {
      if (!u || u.isDeleted) return;
      const gYm = u.givenYm || String(u.givenDate || "").slice(0, 7);
      if (gYm === activeYm) {
        const amt = Number(u.amount || 0);
        udGivenSum += amt;
        totalOut += amt;
        udhaariMoves.push({
          kind: "given",
          name: u.name || "व्यक्ती",
          amount: amt,
          date: u.givenDate || activeYm,
          note: u.promiseDate ? `वायदा: ${fmtDateShort(u.promiseDate)}` : (u.note || "")
        });
      }

      const pays = Array.isArray(u.payments) ? u.payments : [];
      if (pays.length) {
        pays.forEach((p) => {
          const pYm = p.ym || String(p.date || "").slice(0, 7);
          if (pYm === activeYm && Number(p.amount || 0) > 0) {
            const pAmt = Number(p.amount || 0);
            udRetSum += pAmt;
            totalIn += pAmt;
            udhaariMoves.push({
              kind: "returned",
              name: u.name || "व्यक्ती",
              amount: pAmt,
              date: p.date || activeYm,
              note: `घेतले: ${fmtYmMr(gYm)}`
            });
          }
        });
      } else if (u.returnedYm === activeYm && Number(u.paidAmount || 0) > 0) {
        const pAmt = Number(u.paidAmount || 0);
        udRetSum += pAmt;
        totalIn += pAmt;
        udhaariMoves.push({
          kind: "returned",
          name: u.name || "व्यक्ती",
          amount: pAmt,
          date: u.returnedDate || activeYm,
          note: `घेतले: ${fmtYmMr(gYm)}`
        });
      }
    });

    return {
      activeYm, newAcc, principalMoves, interestMoves, udhaariMoves,
      totalOut, totalIn, newAccSum, extraPrinAddSum, extraPrinRedSum, interestColSum, udGivenSum, udRetSum
    };
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
    if (!body) return;

    const d = collectMonthActivityData(getActiveYm());
    const q = searchQuery.trim().toLowerCase();

    let rowsHtml = "";
    if (activeTab === "newAcc") {
      const list = d.newAcc.filter((x) => !q || `${x.name} ${x.guarantor}`.toLowerCase().includes(q));
      rowsHtml = list.length
        ? list.map((x) => `
          <div class="ma-item is-out">
            <div>
              <div class="ma-name">🆕 ${esc(x.name)}</div>
              <div class="ma-meta">📅 ${esc(fmtDateShort(x.date))} • दर: ${esc(x.rate)}%${x.guarantor ? ` • जामीनदार: ${esc(x.guarantor)}` : ""}</div>
            </div>
            <div class="ma-amt" style="color:var(--gold);">${fmtInr(x.amount)}<div style="font-size:0.63rem; color:var(--muted);">नवीन मुद्दल</div></div>
          </div>
        `).join("")
        : `<div class="muted" style="text-align:center; padding:18px; font-size:0.8rem;">या महिन्यात कोणतेही नवीन खाते जोडलेले नाही.</div>`;
    } else if (activeTab === "principal") {
      const list = d.principalMoves.filter((x) => !q || `${x.name} ${x.note}`.toLowerCase().includes(q));
      rowsHtml = list.length
        ? list.map((x) => `
          <div class="ma-item ${x.kind === "add" ? "is-out" : "is-in"}">
            <div>
              <div class="ma-name">${x.kind === "add" ? "➕" : "➖"} ${esc(x.name)}</div>
              <div class="ma-meta">📅 ${esc(fmtDateShort(x.date))} • ${x.kind === "add" ? "अतिरिक्त मुद्दल दिले" : "मुद्दल परत आले"}${x.note ? ` • ${esc(x.note)}` : ""}</div>
            </div>
            <div class="ma-amt" style="color:${x.kind === "add" ? "var(--gold)" : "var(--accent-2)"};">${x.kind === "add" ? "+" : "-"}${fmtInr(x.amount)}</div>
          </div>
        `).join("")
        : `<div class="muted" style="text-align:center; padding:18px; font-size:0.8rem;">या महिन्यात अतिरिक्त किंवा परत मुद्दलाची नोंद नाही.</div>`;
    } else if (activeTab === "interest") {
      const list = d.interestMoves.filter((x) => !q || `${x.name} ${x.extraNote}`.toLowerCase().includes(q));
      rowsHtml = list.length
        ? list.map((x) => `
          <div class="ma-item is-in">
            <div>
              <div class="ma-name">💰 ${esc(x.name)}</div>
              <div class="ma-meta">मासिक व्याज: ${fmtInr(x.monthlyInt)}${x.extraNote ? `<br/><strong style="color:var(--accent);">💡 ${esc(x.extraNote)}</strong>` : ""}</div>
            </div>
            <div class="ma-amt" style="color:var(--accent-2);">+${fmtInr(x.collected)}<div style="font-size:0.63rem; color:var(--muted);">जमा व्याज</div></div>
          </div>
        `).join("")
        : `<div class="muted" style="text-align:center; padding:18px; font-size:0.8rem;">या महिन्यात अजून व्याज जमा नोंद नाही.</div>`;
    } else {
      const list = d.udhaariMoves.filter((x) => !q || `${x.name} ${x.note}`.toLowerCase().includes(q));
      rowsHtml = list.length
        ? list.map((x) => `
          <div class="ma-item is-ud">
            <div>
              <div class="ma-name">🤝 ${esc(x.name)}</div>
              <div class="ma-meta">📅 ${esc(fmtDateShort(x.date))} • ${x.kind === "given" ? "उधारी दिली" : "उधारी परत मिळाली"}${x.note ? ` • ${esc(x.note)}` : ""}</div>
            </div>
            <div class="ma-amt" style="color:${x.kind === "given" ? "var(--gold)" : "var(--accent-2)"};">${x.kind === "given" ? "-" : "+"}${fmtInr(x.amount)}</div>
          </div>
        `).join("")
        : `<div class="muted" style="text-align:center; padding:18px; font-size:0.8rem;">या महिन्यात कोणतीही उधारी हालचाल नाही.</div>`;
    }

    body.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:9px; padding-bottom:8px; border-bottom:1px solid var(--border);">
        <div>
          <h3 style="margin:0; color:var(--accent);">📋 महिना नोंदी (${esc(fmtYmMr(d.activeYm))})</h3>
          <div class="muted" style="font-size:0.71rem;">नवीन खाती, अति. मुद्दल, व्याज व उधारी संपूर्ण हालचाल</div>
        </div>
        <button type="button" id="maPrintPdfBtn" class="primary sm">🖨️ नोंदी PDF</button>
      </div>

      <div class="ma-kpi-grid">
        <div class="ma-kpi">
          <div class="ma-kpi-lbl">📤 या महिन्यात दिलेले पैसे</div>
          <div class="ma-kpi-val" style="color:var(--gold);">${fmtInr(d.totalOut)}</div>
          <div class="ma-kpi-sub">नवीन: ${fmtInr(d.newAccSum)} • अति.: ${fmtInr(d.extraPrinAddSum)} • उधारी: ${fmtInr(d.udGivenSum)}</div>
        </div>
        <div class="ma-kpi">
          <div class="ma-kpi-lbl">📥 या महिन्यात आलेले पैसे</div>
          <div class="ma-kpi-val" style="color:var(--accent-2);">${fmtInr(d.totalIn)}</div>
          <div class="ma-kpi-sub">व्याज: ${fmtInr(d.interestColSum)} • मुद्दल: ${fmtInr(d.extraPrinRedSum)} • उधारी: ${fmtInr(d.udRetSum)}</div>
        </div>
      </div>

      <div class="ma-tabs">
        <button type="button" class="ma-tab-btn ${activeTab === "newAcc" ? "is-active" : ""}" data-matab="newAcc">🆕 नवीन खाती (${d.newAcc.length})</button>
        <button type="button" class="ma-tab-btn ${activeTab === "principal" ? "is-active" : ""}" data-matab="principal">➕ अति. मुद्दल (${d.principalMoves.length})</button>
        <button type="button" class="ma-tab-btn ${activeTab === "interest" ? "is-active" : ""}" data-matab="interest">💰 व्याज/एक्स्ट्रा (${d.interestMoves.length})</button>
        <button type="button" class="ma-tab-btn ${activeTab === "udhaari" ? "is-active" : ""}" data-matab="udhaari">🤝 उधारी (${d.udhaariMoves.length})</button>
      </div>

      <input type="text" id="maSearchInp" class="search-pill-box" value="${esc(searchQuery)}" placeholder="🔍 या महिन्याच्या नोंदीत नाव शोधा..." style="margin-bottom:8px;" />
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
      const printArea = document.getElementById("printArea");
      if (!printArea) return;
      const biz = document.getElementById("tBrandTitle")?.textContent?.trim() || "व्याज हिशोब वही";
      const newRows = d.newAcc.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td>${esc(fmtDateShort(x.date))}</td><td>${fmtInr(x.amount)}</td><td>${esc(x.rate)}%</td></tr>`).join("") || `<tr><td colspan="5">नोंद नाही</td></tr>`;
      const prinRows = d.principalMoves.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td>${esc(fmtDateShort(x.date))}</td><td>${x.kind === "add" ? "अतिरिक्त दिले" : "परत आले"}</td><td>${fmtInr(x.amount)}</td></tr>`).join("") || `<tr><td colspan="5">नोंद नाही</td></tr>`;
      const intRows = d.interestMoves.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td>${fmtInr(x.monthlyInt)}</td><td>${fmtInr(x.collected)}</td><td>${esc(x.extraNote || "-")}</td></tr>`).join("") || `<tr><td colspan="5">नोंद नाही</td></tr>`;
      const udRows = d.udhaariMoves.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td>${esc(fmtDateShort(x.date))}</td><td>${x.kind === "given" ? "उधारी दिली" : "परत मिळाली"}</td><td>${fmtInr(x.amount)}</td></tr>`).join("") || `<tr><td colspan="5">नोंद नाही</td></tr>`;

      printArea.innerHTML = `
        <div style="font-family:system-ui,sans-serif;">
          <h2 style="margin:0 0 4px;">${esc(biz)} — महिना नोंदी तपशील (${esc(fmtYmMr(d.activeYm))})</h2>
          <p style="margin:0 0 10px; font-size:12px;">एकूण दिलेले: <strong>${fmtInr(d.totalOut)}</strong> | एकूण आलेले: <strong>${fmtInr(d.totalIn)}</strong></p>
          <h4>१. नवीन खाती (${d.newAcc.length}) — एकूण ${fmtInr(d.newAccSum)}</h4>
          <table><thead><tr><th>क्र.</th><th>नाव</th><th>तारीख</th><th>मुद्दल</th><th>दर</th></tr></thead><tbody>${newRows}</tbody></table>
          <h4>२. अतिरिक्त / परत मुद्दल (${d.principalMoves.length})</h4>
          <table><thead><tr><th>क्र.</th><th>नाव</th><th>तारीख</th><th>प्रकार</th><th>रक्कम</th></tr></thead><tbody>${prinRows}</tbody></table>
          <h4>३. जमा व्याज व एक्स्ट्रा (${d.interestMoves.length}) — एकूण ${fmtInr(d.interestColSum)}</h4>
          <table><thead><tr><th>क्र.</th><th>नाव</th><th>मासिक व्याज</th><th>जमा</th><th>एक्स्ट्रा शेरा</th></tr></thead><tbody>${intRows}</tbody></table>
          <h4>४. स्वतंत्र उधारी हालचाल (${d.udhaariMoves.length})</h4>
          <table><thead><tr><th>क्र.</th><th>नाव</th><th>तारीख</th><th>प्रकार</th><th>रक्कम</th></tr></thead><tbody>${udRows}</tbody></table>
        </div>
      `;
      window.print();
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
