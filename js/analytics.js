// व्याज हिशोब वही - Analytics + % बॅज + चालू/एकूण जमा व्याज + बाकी यादीत कॉल (js/analytics.js - V14.16)
(function () {
  const MARATHI_SHORT_MONTHS = ["जाने", "फेब्रु", "मार्च", "एप्रि", "मे", "जून", "जुलै", "ऑग", "सप्टें", "ऑक्टो", "नोव्हें", "डिसें"];
  let isChartOpen = false;
  let isRiskOpen = false;
  let contributorScope = "month"; // "month" किंवा "all"
  let monthContributors = [];
  let allTimeContributors = [];

  // CSS स्टाईल्स जोडा (inject lightweight CSS)
  function injectAnalyticsStyles() {
    if (document.getElementById("vyajAnalyticsCss")) return;
    const st = document.createElement("style");
    st.id = "vyajAnalyticsCss";
    st.textContent = `
      .an-card {
        background: var(--card); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        border: 1px solid var(--border); border-radius: 16px; padding: 12px 14px;
        margin-bottom: 12px; box-shadow: var(--glass-shadow);
      }
      .an-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
      .an-ring-wrap { display: flex; align-items: center; gap: 10px; }
      .an-profit-trigger {
        cursor: pointer; padding: 4px 8px; border-radius: 10px;
        transition: background 0.18s ease, transform 0.14s ease;
      }
      .an-profit-trigger:hover { background: rgba(16, 185, 129, 0.12); }
      .an-profit-trigger:active { transform: scale(0.97); }
      .an-ring-svg { width: 52px; height: 52px; transform: rotate(-90deg); }
      .an-ring-bg { fill: none; stroke: rgba(148,163,184,0.2); stroke-width: 6; }
      .an-ring-fg { fill: none; stroke: #10b981; stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset 0.5s ease; }
      .an-bars {
        display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px;
        align-items: end; height: 110px; margin-top: 12px; padding: 10px 8px 4px;
        background: var(--meta-bg); border: 1px solid var(--border); border-radius: 12px;
      }
      .an-bar-col { display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; justify-content: flex-end; }
      .an-bar-val { font-size: 0.66rem; color: var(--accent); font-weight: 700; white-space: nowrap; }
      .an-bar-fill {
        width: 100%; max-width: 28px; border-radius: 6px 6px 2px 2px;
        background: linear-gradient(180deg, #38bdf8, #6366f1);
        min-height: 4px; transition: height 0.4s ease;
      }
      .an-bar-lbl { font-size: 0.7rem; color: var(--muted); font-weight: 600; }
      .an-risk-box {
        margin-top: 10px; padding: 10px; border-radius: 12px;
        background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.4);
      }
      .an-tile-pct {
        font-size: 0.68rem; font-weight: 800; padding: 1px 6px; border-radius: 999px;
        background: rgba(56, 189, 248, 0.14); color: var(--accent); margin-left: 4px;
      }
      .an-tile-pct.pend {
        background: rgba(244, 63, 94, 0.16); color: #fb7185;
      }

      /* UI व डिझाइन पॉलिश: कार्डवरील आकडे स्पष्ट व वाचायला सोपे */
      #borrowersList .meta-box strong,
      #borrowersList .meta-box b {
        font-size: 0.96rem;
        font-weight: 800;
        letter-spacing: 0.2px;
      }
      #borrowersList .borrower-item {
        transition: transform 0.15s ease, border-color 0.2s ease, box-shadow 0.2s ease;
      }
      button, .pill-btn, .stat-tile.clickable {
        -webkit-tap-highlight-color: transparent;
      }
      button:active, .pill-btn:active {
        transform: scale(0.96);
      }
    `;
    document.head.appendChild(st);
  }

  function esc(str) {
    return String(str || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  // ISO किंवा Timestamp तारखेचे स्वच्छ DD/MM/YYYY स्वरूपात रूपांतर (format clean date)
  function formatCleanDate(raw) {
    if (!raw) return "-";
    const s = String(raw).trim();
    const mMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (mMatch) {
      return `${mMatch[3]}/${mMatch[2]}/${mMatch[1]}`;
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yy = d.getFullYear();
      return `${dd}/${mm}/${yy}`;
    }
    return s;
  }

  function getLast6Months(baseYm) {
    const [yStr, mStr] = (baseYm || "").split("-");
    let y = Number(yStr) || new Date().getFullYear();
    let m = Number(mStr) || (new Date().getMonth() + 1);
    const list = [];
    for (let i = 5; i >= 0; i--) {
      let tm = m - i;
      let ty = y;
      while (tm <= 0) { tm += 12; ty -= 1; }
      list.push({
        ym: `${ty}-${String(tm).padStart(2, "0")}`,
        label: MARATHI_SHORT_MONTHS[tm - 1] || String(tm)
      });
    }
    return list;
  }

  function shortAmt(val) {
    const n = Number(val || 0);
    if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(Math.round(n));
  }

  // मासिक व्याज आणि बाकी व्याज कार्ड्सवर % बॅज अपडेट करा (update % badge on dashboard tiles)
  function updateDashboardTilePercentages(totalExpected, totalCollected, totalPending) {
    const intLbl = document.querySelector("#tileInterest .stat-tile-lbl span:first-child");
    if (intLbl) {
      const colPct = totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 100)) : 0;
      let badge = intLbl.querySelector(".an-tile-pct");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "an-tile-pct";
        intLbl.appendChild(badge);
      }
      badge.textContent = `${colPct}% जमा`;
    }

    const pendLbl = document.querySelector("#tilePending .stat-tile-lbl span:first-child");
    if (pendLbl) {
      const denom = totalExpected + totalPending;
      const pendPct = denom > 0 ? Math.min(100, Math.round((totalPending / denom) * 100)) : 0;
      let pBadge = pendLbl.querySelector(".an-tile-pct");
      if (!pBadge) {
        pBadge = document.createElement("span");
        pBadge.className = "an-tile-pct pend";
        pendLbl.appendChild(pBadge);
      }
      pBadge.textContent = `${pendPct}% बाकी`;
    }
  }

  // 'बाकी व्याज' पॉपअप यादीमध्ये प्रत्येक नावासमोर थेट '📞' कॉल बटण जोडा
  function injectCallButtonsInDrillList() {
    const drillList = document.getElementById("statDrillList");
    if (!drillList || !window.HishobBridge) return;
    const borrowers = window.HishobBridge.getBorrowers() || [];
    const byName = new Map();
    borrowers.forEach((b) => {
      const clean = String(b.mobile || "").replace(/\D/g, "");
      if (b.name && clean.length >= 10) {
        byName.set(String(b.name).trim(), clean);
      }
    });

    drillList.querySelectorAll(".meta-box, .borrower-item, div").forEach((el) => {
      if (el.children.length === 0 && el.textContent && el.textContent.trim()) {
        const txt = el.textContent.trim();
        for (const [bName, mob] of byName.entries()) {
          if (txt.includes(bName) && !el.querySelector("[data-drill-call]")) {
            const callBtn = document.createElement("button");
            callBtn.type = "button";
            callBtn.className = "success sm";
            callBtn.setAttribute("data-drill-call", mob);
            callBtn.textContent = "📞";
            callBtn.style.marginLeft = "8px";
            callBtn.addEventListener("click", (ev) => {
              ev.stopPropagation();
              window.location.href = `tel:${mob}`;
            });
            el.appendChild(callBtn);
            break;
          }
        }
      }
    });
  }

  // जमा व्याज कोणी-कोणी केले याची पॉपअप यादी तयार करा (create Paid Interest Contributors Modal)
  function ensureInterestContributorsModal() {
    let modal = document.getElementById("interestContributorsModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "interestContributorsModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `
      <div class="modal-card" style="max-width:600px;">
        <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
          <h3 style="margin:0; color:var(--accent-2);">💚 जमा व्याज भरलेले ग्राहक</h3>
          <div class="row" style="gap:6px;">
            <button type="button" id="icPrintBtn" class="primary sm">🖨️ प्रिंट</button>
            <button type="button" id="icCloseBtn" class="danger sm">✕ बंद</button>
          </div>
        </div>

        <div class="row" style="margin-bottom:10px; gap:6px;">
          <button type="button" id="icScopeMonthBtn" class="pill-btn filter-active sm">📅 चालू महिना</button>
          <button type="button" id="icScopeAllBtn" class="pill-btn sm">📚 आजपर्यंत एकूण</button>
        </div>

        <div id="icSummaryBox" class="meta-box" style="margin-bottom:10px; font-weight:700;"></div>
        <input type="text" id="icSearchInput" class="search-pill-box" placeholder="🔍 जमा केलेल्या ग्राहकाचे नाव शोधा..." style="margin-bottom:10px;" />
        <div id="icListContainer" style="max-height:54vh; overflow-y:auto;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });

    document.getElementById("icCloseBtn").addEventListener("click", () => {
      modal.classList.add("hidden");
    });

    document.getElementById("icScopeMonthBtn").addEventListener("click", () => {
      contributorScope = "month";
      updateScopeButtons();
      renderInterestContributorsList();
    });

    document.getElementById("icScopeAllBtn").addEventListener("click", () => {
      contributorScope = "all";
      updateScopeButtons();
      renderInterestContributorsList();
    });

    document.getElementById("icSearchInput").addEventListener("input", () => {
      renderInterestContributorsList();
    });

    document.getElementById("icPrintBtn").addEventListener("click", () => {
      const list = contributorScope === "month" ? monthContributors : allTimeContributors;
      const printArea = document.getElementById("printArea");
      if (!printArea) return;
      const rows = list
        .map((x, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${esc(x.name)}</td>
            <td>₹${Number(x.totalPaid || 0).toLocaleString("en-IN")}</td>
            <td>${x.count} नोंद</td>
            <td>${esc(formatCleanDate(x.lastDate))}</td>
          </tr>
        `)
        .join("");
      printArea.innerHTML = `
        <h2>जमा व्याज भरलेले ग्राहक (${contributorScope === "month" ? "चालू महिना" : "आजपर्यंत एकूण"})</h2>
        <table>
          <thead>
            <tr><th>#</th><th>ग्राहकाचे नाव</th><th>जमा रक्कम</th><th>नोंदी</th><th>तारीख</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      window.print();
    });

    return modal;
  }

  function updateScopeButtons() {
    const mBtn = document.getElementById("icScopeMonthBtn");
    const aBtn = document.getElementById("icScopeAllBtn");
    if (mBtn && aBtn) {
      mBtn.classList.toggle("filter-active", contributorScope === "month");
      aBtn.classList.toggle("filter-active", contributorScope === "all");
    }
  }

  // पॉपअपमध्ये जमा व्याज भरलेल्या ग्राहकांची यादी दाखवा
  function renderInterestContributorsList() {
    const container = document.getElementById("icListContainer");
    const summaryBox = document.getElementById("icSummaryBox");
    if (!container) return;

    const activeList = contributorScope === "month" ? monthContributors : allTimeContributors;
    const q = (document.getElementById("icSearchInput")?.value || "").trim().toLowerCase();

    const filtered = activeList.filter((item) => {
      if (!q) return true;
      return String(item.name || "").toLowerCase().includes(q) || String(item.mobile || "").toLowerCase().includes(q);
    });

    const grandTotal = activeList.reduce((sum, x) => sum + Number(x.totalPaid || 0), 0);
    const scopeLabel = contributorScope === "month" ? "चालू महिन्याचे जमा व्याज" : "आजपर्यंतचे एकूण जमा व्याज";

    if (summaryBox) {
      summaryBox.innerHTML = `${scopeLabel}: <span style="color:var(--accent-2);">₹${grandTotal.toLocaleString("en-IN")}</span> &nbsp;|&nbsp; ग्राहक: <span style="color:var(--accent);">${activeList.length}</span>`;
    }

    if (!filtered.length) {
      container.innerHTML = `<div class="muted" style="text-align:center; padding:16px;">${contributorScope === "month" ? "या महिन्यात अद्याप कोणतीही व्याज जमा नोंद नाही." : "कोणतीही जमा व्याज नोंद सापडली नाही."}</div>`;
      return;
    }

    container.innerHTML = filtered
      .map((item) => {
        const cleanMob = String(item.mobile || "").replace(/\D/g, "");
        return `
          <div class="meta-box row" style="justify-content:space-between; margin-bottom:8px;">
            <div>
              <strong style="font-size:0.95rem;">${esc(item.name)}</strong>
              <span class="badge paid" style="margin-left:6px;">${item.count} ${item.count === 1 ? "नोंद" : "नोंदी"}</span>
              <div style="color:var(--accent-2); font-weight:800; font-size:0.94rem; margin-top:2px;">
                जमा रक्कम: ${window.HishobBridge ? window.HishobBridge.fmtAmt(item.totalPaid) : "₹" + item.totalPaid}
              </div>
              <div class="muted" style="font-size:0.75rem;">तारीख: ${esc(formatCleanDate(item.lastDate))} (${esc(item.lastMode || "Cash")})</div>
            </div>
            ${cleanMob.length >= 10 ? `<button type="button" class="success sm" onclick="window.location.href='tel:${esc(cleanMob)}'">📞</button>` : ""}
          </div>
        `;
      })
      .join("");
  }

  function openInterestContributorsModal() {
    contributorScope = "month";
    const modal = ensureInterestContributorsModal();
    updateScopeButtons();
    const sInput = document.getElementById("icSearchInput");
    if (sInput) sInput.value = "";
    renderInterestContributorsList();
    modal.classList.remove("hidden");
    try { history.pushState({ hishobOverlay: "interestContributorsModal" }, ""); } catch (_) {}
  }

  // मुख्य Analytics कार्ड रेंडर करा (render Analytics & High-Risk Card)
  function renderAnalyticsCard() {
    if (!window.HishobBridge) return;
    const appScreen = document.getElementById("appScreen");
    const searchBox = document.getElementById("searchInput");
    if (!appScreen || !searchBox) return;

    const borrowers = window.HishobBridge.getBorrowers() || [];
    const activeYm = (document.getElementById("activeYm") && document.getElementById("activeYm").value) || new Date().toISOString().slice(0, 7);

    let totalExpected = 0;
    let totalCollected = 0;
    let totalPendingSum = 0;
    let lifetimeInterestProfit = 0;
    let currentMonthInterestSum = 0;

    const highRiskList = [];
    const allMap = new Map();
    const monthMap = new Map();

    const last6 = getLast6Months(activeYm);
    const monthTotals = {};
    last6.forEach((x) => { monthTotals[x.ym] = 0; });

    borrowers
      .filter((b) => !b.isDeleted)
      .forEach((b) => {
        let bAllSum = 0;
        let bAllCount = 0;
        let bAllLastDate = "";
        let bAllLastMode = "Cash";

        let bCurSum = 0;
        let bCurCount = 0;
        let bCurLastDate = "";
        let bCurLastMode = "Cash";

        (b.paymentHistory || []).forEach((p) => {
          const amt = Number(p.amount || 0);
          if (amt <= 0) return;

          const pDate = String(p.date || "");
          const pYm = (p.ym && /^\d{4}-\d{2}$/.test(p.ym)) ? p.ym : pDate.slice(0, 7);

          lifetimeInterestProfit += amt;
          bAllSum += amt;
          bAllCount += 1;
          if (!bAllLastDate || pDate >= bAllLastDate) {
            bAllLastDate = pDate;
            bAllLastMode = p.mode || "Cash";
          }

          if (pYm === activeYm) {
            currentMonthInterestSum += amt;
            bCurSum += amt;
            bCurCount += 1;
            if (!bCurLastDate || pDate >= bCurLastDate) {
              bCurLastDate = pDate;
              bCurLastMode = p.mode || "Cash";
            }
          }

          if (Object.prototype.hasOwnProperty.call(monthTotals, pYm)) {
            monthTotals[pYm] += amt;
          }
        });

        if (bAllSum > 0) {
          allMap.set(b.id, {
            id: b.id,
            name: b.name || "ग्राहक",
            mobile: b.mobile || "",
            totalPaid: bAllSum,
            count: bAllCount,
            lastDate: bAllLastDate,
            lastMode: bAllLastMode
          });
        }

        if (bCurSum > 0) {
          monthMap.set(b.id, {
            id: b.id,
            name: b.name || "ग्राहक",
            mobile: b.mobile || "",
            totalPaid: bCurSum,
            count: bCurCount,
            lastDate: bCurLastDate,
            lastMode: bCurLastMode
          });
        }

        if (b.accountStatus === "closed") return;

        const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
        totalExpected += calc.monthlyInterest;
        totalCollected += calc.collectedInMonth;
        totalPendingSum += Math.max(0, calc.totalPayable);

        if (calc.monthlyInterest > 0 && calc.totalPayable >= calc.monthlyInterest * 2) {
          const approxMonths = Math.floor(calc.totalPayable / calc.monthlyInterest);
          highRiskList.push({
            id: b.id,
            name: b.name || "ग्राहक",
            mobile: b.mobile || "",
            totalPayable: calc.totalPayable,
            approxMonths
          });
        }
      });

    allTimeContributors = Array.from(allMap.values()).sort((a, b) => b.totalPaid - a.totalPaid);
    monthContributors = Array.from(monthMap.values()).sort((a, b) => b.totalPaid - a.totalPaid);
    highRiskList.sort((a, b) => b.totalPayable - a.totalPayable);

    updateDashboardTilePercentages(totalExpected, totalCollected, totalPendingSum);

    const pct = totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 100)) : 0;
    const radius = 21;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;

    let card = document.getElementById("vyajAnalyticsCard");
    if (!card) {
      card = document.createElement("section");
      card.id = "vyajAnalyticsCard";
      card.className = "an-card";
      appScreen.insertBefore(card, searchBox);
    }

    const maxVal = Math.max(1, ...Object.values(monthTotals));
    const barsHtml = last6
      .map((m) => {
        const val = monthTotals[m.ym] || 0;
        const hPct = Math.max(6, Math.round((val / maxVal) * 70));
        return `
          <div class="an-bar-col">
            <div class="an-bar-val">${val > 0 ? shortAmt(val) : "0"}</div>
            <div class="an-bar-fill" style="height:${hPct}px;"></div>
            <div class="an-bar-lbl">${m.label}</div>
          </div>
        `;
      })
      .join("");

    const riskRowsHtml = highRiskList.length
      ? highRiskList
          .map((item) => {
            const cleanMob = String(item.mobile || "").replace(/\D/g, "");
            return `
              <div class="meta-box row" style="justify-content:space-between; margin-top:6px;">
                <div>
                  <strong>${esc(item.name)}</strong>
                  <span class="badge pending" style="margin-left:4px;">${item.approxMonths}+ महिने बाकी</span>
                  <div class="err" style="font-weight:800; font-size:0.86rem;">एकूण बाकी: ${window.HishobBridge.fmtAmt(item.totalPayable)}</div>
                </div>
                <div class="row" style="gap:5px;">
                  ${cleanMob.length >= 10 ? `<button type="button" class="success sm" onclick="window.location.href='tel:${esc(cleanMob)}'">📞</button>` : ""}
                  <button type="button" class="primary sm" data-risk-wa="${esc(item.mobile)}" data-name="${esc(item.name)}" data-amt="${item.totalPayable}">💬 WA</button>
                </div>
              </div>
            `;
          })
          .join("")
      : `<div class="ok" style="font-size:0.84rem; font-weight:700;">✅ कोणताही ग्राहक High-Risk (२+ महिने बाकी) मध्ये नाही!</div>`;

    card.innerHTML = `
      <div class="an-top">
        <div class="an-ring-wrap">
          <div style="position:relative; width:52px; height:52px;">
            <svg class="an-ring-svg" viewBox="0 0 52 52">
              <circle class="an-ring-bg" cx="26" cy="26" r="${radius}"></circle>
              <circle class="an-ring-fg" cx="26" cy="26" r="${radius}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
            </svg>
            <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:0.74rem; font-weight:800; color:var(--accent-2);">${pct}%</div>
          </div>
          <div id="openPaidInterestListBtn" class="an-profit-trigger" title="कोणी-कोणी व्याज जमा केले ते पाहण्यासाठी क्लिक करा">
            <div style="font-size:0.74rem; color:var(--muted);">या महिन्याचे जमा व्याज <span style="color:var(--accent-2);">▸ यादी (${monthContributors.length})</span></div>
            <div style="font-size:1.12rem; font-weight:900; color:var(--accent-2);">${window.HishobBridge.fmtAmt(currentMonthInterestSum)}</div>
            <div class="muted" style="font-size:0.68rem;">एकूण नफा: ${window.HishobBridge.fmtAmt(lifetimeInterestProfit)}</div>
          </div>
        </div>

        <div class="row" style="gap:6px;">
          <button type="button" id="toggleAnChartBtn" class="primary sm">📊 ६-महिने चार्ट ${isChartOpen ? "▲" : "▼"}</button>
          <button type="button" id="toggleAnRiskBtn" class="${highRiskList.length ? "danger" : "success"} sm">
            🔴 High-Risk (${highRiskList.length})
          </button>
        </div>
      </div>

      <div id="anChartBox" class="${isChartOpen ? "" : "hidden"}">
        <div class="muted" style="font-size:0.76rem; margin-top:8px;">📈 मागील ६ महिन्यांची व्याज वसुली:</div>
        <div class="an-bars">${barsHtml}</div>
      </div>

      <div id="anRiskBox" class="an-risk-box ${isRiskOpen ? "" : "hidden"}">
        <div style="font-weight:700; color:#fb7185; font-size:0.84rem; margin-bottom:4px;">🚨 High-Risk थकबाकीदार (२+ महिने व्याज बाकी):</div>
        ${riskRowsHtml}
      </div>
    `;

    document.getElementById("openPaidInterestListBtn")?.addEventListener("click", openInterestContributorsModal);

    document.getElementById("toggleAnChartBtn")?.addEventListener("click", () => {
      isChartOpen = !isChartOpen;
      renderAnalyticsCard();
    });

    document.getElementById("toggleAnRiskBtn")?.addEventListener("click", () => {
      isRiskOpen = !isRiskOpen;
      renderAnalyticsCard();
    });

    card.querySelectorAll("[data-risk-wa]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const clean = String(btn.getAttribute("data-risk-wa") || "").replace(/\D/g, "");
        if (clean.length < 10) { alert("या ग्राहकाचा वैध मोबाईल नंबर सेव्ह नाही."); return; }
        const target = clean.length === 10 ? "91" + clean : clean;
        const name = btn.getAttribute("data-name");
        const amt = btn.getAttribute("data-amt");
        const msg = `नमस्कार *${name}*,\nआपले मागील बऱ्याच महिन्यांचे व्याज थकीत असून एकूण *₹${amt}* बाकी आहे.\nकृपया लवकरात लवकर जमा करावे. धन्यवाद!`;
        window.open(`https://wa.me/${target}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
      });
    });

    setTimeout(injectCallButtonsInDrillList, 120);
  }

  function initAnalytics() {
    injectAnalyticsStyles();
    const listEl = document.getElementById("borrowersList");
    if (listEl) {
      const obs = new MutationObserver(() => renderAnalyticsCard());
      obs.observe(listEl, { childList: true });
    }
    const drillListEl = document.getElementById("statDrillList");
    if (drillListEl) {
      const dObs = new MutationObserver(() => injectCallButtonsInDrillList());
      dObs.observe(drillListEl, { childList: true, subtree: true });
    }
    setTimeout(renderAnalyticsCard, 1600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAnalytics);
  } else {
    initAnalytics();
  }
})();
