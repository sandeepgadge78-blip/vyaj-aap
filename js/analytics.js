// व्याज हिशोब वही - Glowing SVG Line Chart + SVG Ring % + 100% Synced चालू महिना/ग्राहकनिहाय इतिहास + NavStack Sub-Step (js/analytics.js - V14.22)
(function () {
  const MARATHI_SHORT_MONTHS = ["जाने", "फेब्रु", "मार्च", "एप्रि", "मे", "जून", "जुलै", "ऑग", "सप्टें", "ऑक्टो", "नोव्हें", "डिसें"];
  const MARATHI_FULL_MONTHS = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];

  let isChartOpen = false;
  let isRiskOpen = false;
  let activeModalTab = "month";
  let selectedHistoryBorrowerId = null;
  let currentMonthEntries = [];
  let latestSummaryStats = {
    activeCount: 0, totalPrincipal: 0, totalExpected: 0,
    totalCollected: 0, totalPending: 0, lifetimeProfit: 0,
    highRiskCount: 0, recoveryPct: 0
  };

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
      .an-profit-trigger:hover { background: rgba(74, 222, 128, 0.12); }
      .an-profit-trigger:active { transform: scale(0.97); }
      .an-ring-svg { width: 52px; height: 52px; transform: rotate(-90deg); }
      .an-ring-bg { fill: none; stroke: rgba(148,163,184,0.22); stroke-width: 6; }
      .an-ring-fg { fill: none; stroke: #4ade80; stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset 0.5s ease; }

      .an-mini-ring-box {
        position: relative; width: 40px; height: 40px; flex-shrink: 0;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .an-mini-ring-svg { width: 40px; height: 40px; transform: rotate(-90deg); }
      .an-mini-ring-bg { fill: none; stroke: rgba(148,163,184,0.22); stroke-width: 5; }
      .an-mini-ring-fg { fill: none; stroke-width: 5; stroke-linecap: round; transition: stroke-dashoffset 0.5s ease; }
      .an-mini-ring-txt {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        font-size: 0.64rem; font-weight: 900;
      }
      .an-tile-val-row {
        display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 6px;
      }
      .an-risk-box {
        margin-top: 10px; padding: 10px; border-radius: 12px;
        background: rgba(240, 113, 120, 0.1); border: 1px solid rgba(240, 113, 120, 0.35);
      }
      .an-year-head {
        font-size: 0.86rem; font-weight: 800; color: var(--accent);
        padding: 6px 10px; margin-top: 10px; border-radius: 8px;
        background: rgba(125, 211, 252, 0.12); border-left: 3px solid var(--accent);
      }
      .an-cust-row { cursor: pointer; transition: border-color 0.18s ease; }
      .an-cust-row:hover { border-color: var(--accent); }
    `;
    document.head.appendChild(st);
  }

  function esc(str) {
    return String(str || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function formatCleanDate(raw) {
    if (!raw) return "-";
    const s = String(raw).trim();
    const mMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (mMatch) return `${mMatch[3]}/${mMatch[2]}/${mMatch[1]}`;
    if (/^\d{4}-\d{2}$/.test(s)) return formatMonthNameMr(s);
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    }
    return s;
  }

  function formatMonthNameMr(ym) {
    if (!ym || !String(ym).includes("-")) return String(ym || "-");
    const [y, m] = String(ym).split("-");
    const idx = parseInt(m, 10) - 1;
    return `${MARATHI_FULL_MONTHS[idx] || m} ${y}`;
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
      list.push({ ym: `${ty}-${String(tm).padStart(2, "0")}`, label: MARATHI_SHORT_MONTHS[tm - 1] || String(tm) });
    }
    return list;
  }

  function shortAmt(val) {
    const n = Number(val || 0);
    if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(Math.round(n));
  }

  function buildGlowingLineChartSvg(last6, monthTotals) {
    const maxVal = Math.max(1, ...last6.map((m) => Number(monthTotals[m.ym] || 0)));
    const baseY = 102;
    const topPad = 28;
    const usableH = baseY - topPad;

    const pts = last6.map((m, idx) => {
      const val = Number(monthTotals[m.ym] || 0);
      const x = Math.round(28 + idx * 52.8);
      const y = Math.round(baseY - (val / maxVal) * usableH);
      return { x, y, val, label: m.label };
    });

    let lineD = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const midX = Math.round((p1.x + p2.x) / 2);
      lineD += ` C ${midX},${p1.y} ${midX},${p2.y} ${p2.x},${p2.y}`;
    }
    const areaD = `${lineD} L ${pts[pts.length - 1].x},${baseY} L ${pts[0].x},${baseY} Z`;

    const dotsHtml = pts
      .map((p) => `
        <circle cx="${p.x}" cy="${p.y}" r="4.2" fill="#4ade80" stroke="#090a0d" stroke-width="1.8"></circle>
        <text x="${p.x}" y="${Math.max(12, p.y - 9)}" class="an-chart-val">${p.val > 0 ? shortAmt(p.val) : "0"}</text>
        <text x="${p.x}" y="122" class="an-chart-lbl">${esc(p.label)}</text>
      `)
      .join("");

    return `
      <div class="an-line-wrap">
        <svg class="an-line-svg" viewBox="0 0 320 132" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="vyajLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#2dd4bf" />
              <stop offset="100%" stop-color="#4ade80" />
            </linearGradient>
            <linearGradient id="vyajAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#4ade80" stop-opacity="0.32" />
              <stop offset="100%" stop-color="#2dd4bf" stop-opacity="0.01" />
            </linearGradient>
            <filter id="vyajGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <line x1="16" y1="30" x2="304" y2="30" class="an-chart-grid"></line>
          <line x1="16" y1="66" x2="304" y2="66" class="an-chart-grid"></line>
          <line x1="16" y1="${baseY}" x2="304" y2="${baseY}" class="an-chart-grid"></line>
          <path d="${areaD}" fill="url(#vyajAreaGrad)"></path>
          <path d="${lineD}" fill="none" stroke="url(#vyajLineGrad)" stroke-width="2.8" stroke-linecap="round" filter="url(#vyajGlow)"></path>
          ${dotsHtml}
        </svg>
      </div>
    `;
  }

  function buildMiniRingHtml(pct, colorHex) {
    const safePct = Math.max(0, Math.min(100, Math.round(pct || 0)));
    const r = 16;
    const c = 2 * Math.PI * r;
    const off = c - (safePct / 100) * c;
    return `
      <span class="an-mini-ring-box">
        <svg class="an-mini-ring-svg" viewBox="0 0 40 40">
          <circle class="an-mini-ring-bg" cx="20" cy="20" r="${r}"></circle>
          <circle class="an-mini-ring-fg" cx="20" cy="20" r="${r}" stroke="${colorHex}" stroke-dasharray="${c}" stroke-dashoffset="${off}"></circle>
        </svg>
        <span class="an-mini-ring-txt" style="color:${colorHex};">${safePct}%</span>
      </span>
    `;
  }

  function updateDashboardTileRings(totalExpected, totalCollected, totalPending) {
    const colPct = totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 100)) : 0;
    const pendPct = totalExpected > 0 ? Math.min(100, Math.max(0, Math.round((totalPending / totalExpected) * 100))) : 0;

    const intTile = document.getElementById("tileInterest");
    const intValEl = document.getElementById("dashExpectedInterest");
    if (intTile && intValEl) {
      let wrap = intTile.querySelector(".an-tile-val-row");
      if (!wrap) {
        wrap = document.createElement("div");
        wrap.className = "an-tile-val-row";
        intValEl.parentNode.insertBefore(wrap, intValEl);
        wrap.appendChild(intValEl);
        intValEl.style.marginTop = "0";
      }
      let ringHost = wrap.querySelector("[data-tile-ring='interest']");
      if (!ringHost) {
        ringHost = document.createElement("span");
        ringHost.setAttribute("data-tile-ring", "interest");
        wrap.appendChild(ringHost);
      }
      ringHost.innerHTML = buildMiniRingHtml(colPct, "#4ade80");
    }

    const pendTile = document.getElementById("tilePending");
    const pendValEl = document.getElementById("dashTotalPending");
    if (pendTile && pendValEl) {
      let wrap = pendTile.querySelector(".an-tile-val-row");
      if (!wrap) {
        wrap = document.createElement("div");
        wrap.className = "an-tile-val-row";
        pendValEl.parentNode.insertBefore(wrap, pendValEl);
        wrap.appendChild(pendValEl);
        pendValEl.style.marginTop = "0";
      }
      let ringHost = wrap.querySelector("[data-tile-ring='pending']");
      if (!ringHost) {
        ringHost = document.createElement("span");
        ringHost.setAttribute("data-tile-ring", "pending");
        wrap.appendChild(ringHost);
      }
      ringHost.innerHTML = buildMiniRingHtml(pendPct, "#f07178");
    }
  }

  function injectCallButtonsInDrillList() {
    const drillList = document.getElementById("statDrillList");
    if (!drillList || !window.HishobBridge) return;
    const borrowers = window.HishobBridge.getBorrowers() || [];
    const validContacts = borrowers
      .map((b) => ({ name: String(b.name || "").trim(), mob: String(b.mobile || "").replace(/\D/g, "") }))
      .filter((x) => x.name && x.mob.length >= 10);

    if (!validContacts.length) return;

    const rows = drillList.querySelectorAll(".meta-box, .borrower-item, tr, li");
    const targetNodes = rows.length ? rows : drillList.children;

    Array.from(targetNodes).forEach((row) => {
      if (row.querySelector("[data-drill-call]")) return;
      const txt = row.textContent || "";
      const match = validContacts.find((c) => txt.includes(c.name));
      if (!match) return;

      const callBtn = document.createElement("button");
      callBtn.type = "button";
      callBtn.className = "success sm";
      callBtn.setAttribute("data-drill-call", match.mob);
      callBtn.textContent = "📞";
      callBtn.title = `${match.name} यांना कॉल करा`;
      callBtn.style.marginLeft = "8px";
      callBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        window.location.href = `tel:${match.mob}`;
      });

      const strongEl = row.querySelector("strong, b");
      if (strongEl) strongEl.insertAdjacentElement("afterend", callBtn);
      else row.appendChild(callBtn);
    });
  }

  async function deletePaymentEntry(borrowerId, entryIndex) {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user || !window.HishobBridge) { alert("कृपया आधी लॉगिन करा."); return; }

    const borrowers = window.HishobBridge.getBorrowers() || [];
    const borrower = borrowers.find((b) => b.id === borrowerId);
    if (!borrower || !Array.isArray(borrower.paymentHistory)) return;

    const targetEntry = borrower.paymentHistory[entryIndex];
    if (!targetEntry) return;

    const ok = confirm(
      `ही नोंद कायमची डिलीट करायची का?\n\nग्राहक: ${borrower.name}\nरक्कम: ₹${targetEntry.amount}\nतारीख: ${formatCleanDate(targetEntry.date)}`
    );
    if (!ok) return;

    const updatedHistory = borrower.paymentHistory.filter((_, idx) => idx !== entryIndex);

    try {
      await firebase.firestore().collection("users").doc(user.uid).collection("borrowers").doc(borrowerId).update({
        paymentHistory: updatedHistory,
        updatedAt: new Date().toISOString()
      });
      borrower.paymentHistory = updatedHistory;
      renderAnalyticsCard();
      renderInterestContributorsContent();
    } catch (err) {
      console.error("Delete Payment Error:", err);
      alert("नोंद डिलीट करताना एरर आला: " + err.message);
    }
  }

  function ensureInterestContributorsModal() {
    let modal = document.getElementById("interestContributorsModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "interestContributorsModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `
      <div class="modal-card" style="max-width:640px;">
        <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
          <h3 style="margin:0; color:var(--accent-2);">💚 जमा व्याज तपशील</h3>
        </div>

        <div class="row" style="margin-bottom:10px; gap:6px;">
          <button type="button" id="icTabMonthBtn" class="pill-btn filter-active sm">📅 चालू महिना</button>
          <button type="button" id="icTabHistoryBtn" class="pill-btn sm">📚 ग्राहकनिहाय इतिहास</button>
        </div>

        <div id="icSummaryBox" class="meta-box" style="margin-bottom:10px; font-weight:700;"></div>
        <input type="text" id="icSearchInput" class="search-pill-box" placeholder="🔍 ग्राहकाचे नाव शोधा..." style="margin-bottom:10px;" />
        <div id="icListContainer" style="max-height:58vh; overflow-y:auto;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("interestContributorsModal");
      }
    });

    document.getElementById("icTabMonthBtn").addEventListener("click", () => {
      activeModalTab = "month";
      selectedHistoryBorrowerId = null;
      updateModalTabs();
      renderInterestContributorsContent();
    });

    document.getElementById("icTabHistoryBtn").addEventListener("click", () => {
      activeModalTab = "history";
      selectedHistoryBorrowerId = null;
      updateModalTabs();
      renderInterestContributorsContent();
    });

    document.getElementById("icSearchInput").addEventListener("input", () => {
      renderInterestContributorsContent();
    });

    return modal;
  }

  function updateModalTabs() {
    const mBtn = document.getElementById("icTabMonthBtn");
    const hBtn = document.getElementById("icTabHistoryBtn");
    if (mBtn && hBtn) {
      mBtn.classList.toggle("filter-active", activeModalTab === "month");
      hBtn.classList.toggle("filter-active", activeModalTab === "history");
    }
  }

  function renderInterestContributorsContent() {
    if (!window.HishobBridge) return;
    const container = document.getElementById("icListContainer");
    const summaryBox = document.getElementById("icSummaryBox");
    const searchInput = document.getElementById("icSearchInput");
    if (!container) return;

    const borrowers = (window.HishobBridge.getBorrowers() || []).filter((b) => !b.isDeleted);
    const activeYm = (document.getElementById("activeYm") && document.getElementById("activeYm").value) || new Date().toISOString().slice(0, 7);
    const q = (searchInput?.value || "").trim().toLowerCase();

    if (activeModalTab === "month") {
      if (searchInput) searchInput.classList.remove("hidden");

      const filtered = currentMonthEntries.filter((e) => {
        if (!q) return true;
        return String(e.name || "").toLowerCase().includes(q) || String(e.mobile || "").toLowerCase().includes(q);
      });

      const totalAmt = currentMonthEntries.reduce((s, x) => s + Number(x.amount || 0), 0);
      const uniqueCust = new Set(currentMonthEntries.map((x) => x.borrowerId)).size;

      if (summaryBox) {
        summaryBox.innerHTML = `${formatMonthNameMr(activeYm)} जमा: <span style="color:var(--accent-2);">₹${totalAmt.toLocaleString("en-IN")}</span> &nbsp;|&nbsp; ग्राहक: <span style="color:var(--accent);">${uniqueCust}</span>`;
      }

      if (!filtered.length) {
        container.innerHTML = `<div class="muted" style="text-align:center; padding:16px;">या महिन्यात कोणतीही जमा व्याज नोंद नाही.</div>`;
        return;
      }

      container.innerHTML = filtered
        .map((item) => {
          const cleanMob = String(item.mobile || "").replace(/\D/g, "");
          const actionBtn = item.isLedgerSync
            ? `<span class="badge paid">खातेवही नोंद</span>`
            : `<button type="button" class="danger sm" data-del-bid="${esc(item.borrowerId)}" data-del-idx="${item.historyIndex}" title="ही नोंद डिलीट करा">🗑️</button>`;
          return `
            <div class="meta-box row" style="justify-content:space-between; margin-bottom:8px;">
              <div>
                <strong style="font-size:0.95rem;">${esc(item.name)}</strong>
                <div style="color:var(--accent-2); font-weight:800; font-size:0.94rem; margin-top:2px;">
                  ₹${Number(item.amount || 0).toLocaleString("en-IN")}
                </div>
                <div class="muted" style="font-size:0.75rem;">तारीख: ${esc(formatCleanDate(item.date))} (${esc(item.mode || "Cash")})</div>
              </div>
              <div class="row" style="gap:6px;">
                ${cleanMob.length >= 10 ? `<button type="button" class="success sm" onclick="window.location.href='tel:${esc(cleanMob)}'">📞</button>` : ""}
                ${actionBtn}
              </div>
            </div>
          `;
        })
        .join("");

      container.querySelectorAll("[data-del-bid]").forEach((btn) => {
        btn.addEventListener("click", () => {
          deletePaymentEntry(btn.getAttribute("data-del-bid"), Number(btn.getAttribute("data-del-idx")));
        });
      });
      return;
    }

    if (selectedHistoryBorrowerId) {
      const b = borrowers.find((x) => x.id === selectedHistoryBorrowerId);
      if (!b) {
        selectedHistoryBorrowerId = null;
        renderInterestContributorsContent();
        return;
      }

      if (searchInput) searchInput.classList.add("hidden");

      const hist = Array.isArray(b.paymentHistory) ? b.paymentHistory : [];
      const calcCur = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);

      const combinedHist = hist.map((p, idx) => ({ ...p, historyIndex: idx, isLedgerSync: false }));
      const curHistSum = hist
        .filter((p) => {
          const pYm = (p.ym && /^\d{4}-\d{2}$/.test(p.ym)) ? p.ym : String(p.date || "").slice(0, 7);
          return pYm === activeYm;
        })
        .reduce((s, p) => s + Number(p.amount || 0), 0);

      if (calcCur.collectedInMonth > curHistSum) {
        combinedHist.push({
          amount: calcCur.collectedInMonth - curHistSum,
          date: activeYm, ym: activeYm, mode: "खातेवही नोंद", isLedgerSync: true
        });
      }

      const totalPaidAll = combinedHist.reduce((s, p) => s + Number(p.amount || 0), 0);
      const loanStartInfo = b.loanDate ? formatCleanDate(b.loanDate) : (b.startYm ? formatMonthNameMr(b.startYm) : "-");

      if (summaryBox) {
        summaryBox.innerHTML = `
          <div class="row" style="justify-content:space-between; margin-bottom:6px;">
            <button type="button" id="icBackToCustListBtn" class="primary sm">← सर्व ग्राहक यादी</button>
            <strong style="color:var(--accent); font-size:0.98rem;">${esc(b.name)}</strong>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:6px; font-size:0.82rem;">
            <div style="background:rgba(234,182,118,0.12); padding:6px 8px; border-radius:8px; border:1px solid rgba(234,182,118,0.35);">
              <span class="muted">एकूण मुद्दल:</span><br/>
              <strong style="color:var(--gold); font-size:0.96rem;">₹${Number(b.principal || b.originalPrincipal || 0).toLocaleString("en-IN")}</strong>
            </div>
            <div style="background:rgba(125,211,252,0.12); padding:6px 8px; border-radius:8px; border:1px solid rgba(125,211,252,0.35);">
              <span class="muted">कर्ज घेतलेला महिना/तारीख:</span><br/>
              <strong style="color:var(--accent); font-size:0.9rem;">${esc(loanStartInfo)}</strong>
            </div>
          </div>
          <div style="margin-top:6px; font-size:0.8rem; color:var(--accent-2);">
            आजपर्यंत एकूण जमा व्याज: <strong>₹${totalPaidAll.toLocaleString("en-IN")}</strong>
          </div>
        `;
      }

      document.getElementById("icBackToCustListBtn")?.addEventListener("click", () => {
        selectedHistoryBorrowerId = null;
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("ic_cust_detail");
        renderInterestContributorsContent();
      });

      if (!combinedHist.length) {
        container.innerHTML = `<div class="muted" style="text-align:center; padding:16px;">या ग्राहकाची अद्याप कोणतीही व्याज जमा नोंद नाही.</div>`;
        return;
      }

      const byYear = {};
      combinedHist.forEach((p) => {
        const pDate = String(p.date || "");
        const pYm = (p.ym && /^\d{4}-\d{2}$/.test(p.ym)) ? p.ym : pDate.slice(0, 7);
        const year = (pYm && pYm.slice(0, 4)) || "इतर";
        if (!byYear[year]) byYear[year] = [];
        byYear[year].push({ ...p, pYm });
      });

      const sortedYears = Object.keys(byYear).sort((a, bYear) => bYear.localeCompare(a));
      let html = "";

      sortedYears.forEach((yr) => {
        const entries = byYear[yr].sort((a, bItem) => String(bItem.date || "").localeCompare(String(a.date || "")));
        const yrSum = entries.reduce((s, e) => s + Number(e.amount || 0), 0);

        html += `<div class="an-year-head">📅 वर्ष ${esc(yr)} — एकूण जमा: ₹${yrSum.toLocaleString("en-IN")}</div>`;
        entries.forEach((e) => {
          const delOrTag = e.isLedgerSync
            ? `<span class="badge paid">खातेवही</span>`
            : `<button type="button" class="danger sm" data-del-bid="${esc(b.id)}" data-del-idx="${e.historyIndex}" title="ही नोंद डिलीट करा">🗑️</button>`;
          html += `
            <div class="meta-box row" style="justify-content:space-between; margin-top:6px;">
              <div>
                <strong style="color:var(--text);">${esc(formatMonthNameMr(e.pYm))}</strong>
                <div style="color:var(--accent-2); font-weight:800;">₹${Number(e.amount || 0).toLocaleString("en-IN")}</div>
                <div class="muted" style="font-size:0.74rem;">तारीख: ${esc(formatCleanDate(e.date))} (${esc(e.mode || "Cash")})</div>
              </div>
              ${delOrTag}
            </div>
          `;
        });
      });

      container.innerHTML = html;
      container.querySelectorAll("[data-del-bid]").forEach((btn) => {
        btn.addEventListener("click", () => {
          deletePaymentEntry(btn.getAttribute("data-del-bid"), Number(btn.getAttribute("data-del-idx")));
        });
      });
      return;
    }

    if (searchInput) searchInput.classList.remove("hidden");

    const filteredCust = borrowers.filter((b) => {
      if (!q) return true;
      return String(b.name || "").toLowerCase().includes(q) || String(b.mobile || "").toLowerCase().includes(q);
    });

    if (summaryBox) {
      summaryBox.innerHTML = `एकूण खाती: <span style="color:var(--accent);">${borrowers.length}</span> &nbsp;|&nbsp; <span class="muted" style="font-weight:500;">इतिहास पाहण्यासाठी नावावर क्लिक करा</span>`;
    }

    if (!filteredCust.length) {
      container.innerHTML = `<div class="muted" style="text-align:center; padding:16px;">कोणतेही खाते सापडले नाही.</div>`;
      return;
    }

    container.innerHTML = filteredCust
      .map((b) => {
        const hist = Array.isArray(b.paymentHistory) ? b.paymentHistory : [];
        const calcCur = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
        const histSum = hist.reduce((s, p) => s + Number(p.amount || 0), 0);
        const totalDisplay = Math.max(histSum, calcCur.collectedInMonth || 0);
        return `
          <div class="meta-box row an-cust-row" data-open-hist-bid="${esc(b.id)}" style="justify-content:space-between; margin-bottom:8px;">
            <div>
              <strong style="font-size:0.95rem;">${esc(b.name)}</strong>
              <div class="muted" style="font-size:0.75rem;">
                मुद्दल: ₹${Number(b.principal || 0).toLocaleString("en-IN")} • जमा व्याज: <span style="color:var(--accent-2); font-weight:700;">₹${totalDisplay.toLocaleString("en-IN")}</span>
              </div>
            </div>
            <span style="color:var(--accent); font-weight:700; font-size:0.8rem;">इतिहास पहा ▸</span>
          </div>
        `;
      })
      .join("");

    // नावावर क्लिक करताच Step-by-Step Back साठी Sub-Step नोंदवा
    container.querySelectorAll("[data-open-hist-bid]").forEach((row) => {
      row.addEventListener("click", () => {
        selectedHistoryBorrowerId = row.getAttribute("data-open-hist-bid");
        if (window.VyajNavStack) {
          window.VyajNavStack.pushSubStep("ic_cust_detail", () => {
            selectedHistoryBorrowerId = null;
            renderInterestContributorsContent();
          });
        }
        renderInterestContributorsContent();
      });
    });
  }

  function openInterestContributorsModal() {
    activeModalTab = "month";
    selectedHistoryBorrowerId = null;
    const modal = ensureInterestContributorsModal();
    updateModalTabs();
    const sInput = document.getElementById("icSearchInput");
    if (sInput) sInput.value = "";
    renderInterestContributorsContent();
    modal.classList.remove("hidden");
  }

  function renderAnalyticsCard() {
    if (!window.HishobBridge) return;
    const appScreen = document.getElementById("appScreen");
    const searchBox = document.getElementById("searchInput");
    if (!appScreen || !searchBox) return;

    const borrowers = window.HishobBridge.getBorrowers() || [];
    const activeYm = (document.getElementById("activeYm") && document.getElementById("activeYm").value) || new Date().toISOString().slice(0, 7);

    let activeCount = 0;
    let totalPrincipal = 0;
    let totalExpected = 0;
    let totalCollected = 0;
    let totalPendingSum = 0;
    let lifetimeInterestProfit = 0;
    let currentMonthInterestSum = 0;

    const highRiskList = [];
    const monthEntries = [];

    const last6 = getLast6Months(activeYm);
    const monthTotals = {};
    last6.forEach((x) => { monthTotals[x.ym] = 0; });

    borrowers
      .filter((b) => !b.isDeleted)
      .forEach((b) => {
        let bHistMonthSum = 0;

        (b.paymentHistory || []).forEach((p, idx) => {
          const amt = Number(p.amount || 0);
          if (amt <= 0) return;

          const pDate = String(p.date || "");
          const pYm = (p.ym && /^\d{4}-\d{2}$/.test(p.ym)) ? p.ym : pDate.slice(0, 7);

          lifetimeInterestProfit += amt;

          if (pYm === activeYm) {
            bHistMonthSum += amt;
            currentMonthInterestSum += amt;
            monthEntries.push({
              borrowerId: b.id, historyIndex: idx,
              name: b.name || "ग्राहक", mobile: b.mobile || "",
              amount: amt, date: pDate, mode: p.mode || "Cash", isLedgerSync: false
            });
          }

          if (Object.prototype.hasOwnProperty.call(monthTotals, pYm)) {
            monthTotals[pYm] += amt;
          }
        });

        if (b.accountStatus === "closed") return;

        activeCount += 1;
        totalPrincipal += Number(b.principal || 0);

        const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
        totalExpected += calc.monthlyInterest;
        totalCollected += calc.collectedInMonth;
        totalPendingSum += Math.max(0, calc.totalPayable);

        if (calc.collectedInMonth > bHistMonthSum) {
          const extraAmt = calc.collectedInMonth - bHistMonthSum;
          currentMonthInterestSum += extraAmt;
          lifetimeInterestProfit += extraAmt;
          if (Object.prototype.hasOwnProperty.call(monthTotals, activeYm)) {
            monthTotals[activeYm] += extraAmt;
          }
          monthEntries.push({
            borrowerId: b.id, historyIndex: -1,
            name: b.name || "ग्राहक", mobile: b.mobile || "",
            amount: extraAmt, date: activeYm, mode: "खातेवही नोंद", isLedgerSync: true
          });
        }

        if (calc.monthlyInterest > 0 && calc.totalPayable >= calc.monthlyInterest * 2) {
          const approxMonths = Math.floor(calc.totalPayable / calc.monthlyInterest);
          highRiskList.push({
            id: b.id, name: b.name || "ग्राहक", mobile: b.mobile || "",
            totalPayable: calc.totalPayable, approxMonths
          });
        }
      });

    monthEntries.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    currentMonthEntries = monthEntries;
    highRiskList.sort((a, b) => b.totalPayable - a.totalPayable);

    updateDashboardTileRings(totalExpected, totalCollected, totalPendingSum);

    const pct = totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 100)) : 0;

    latestSummaryStats = {
      activeCount, totalPrincipal, totalExpected, totalCollected,
      totalPending: totalPendingSum, lifetimeProfit: lifetimeInterestProfit,
      highRiskCount: highRiskList.length, recoveryPct: pct
    };
    window.VyajAnalyticsStats = latestSummaryStats;
    window.openVyajInterestList = openInterestContributorsModal;

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

    const lineChartHtml = buildGlowingLineChartSvg(last6, monthTotals);

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

    const uniqueMonthCust = new Set(monthEntries.map((x) => x.borrowerId)).size;

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
          <div id="openPaidInterestListBtn" class="an-profit-trigger" title="जमा व्याज व संपूर्ण इतिहास पाहण्यासाठी क्लिक करा">
            <div style="font-size:0.74rem; color:var(--muted);">या महिन्याचे जमा व्याज <span style="color:var(--accent-2);">▸ यादी (${uniqueMonthCust})</span></div>
            <div style="font-size:1.12rem; font-weight:900; color:var(--accent-2);">${window.HishobBridge.fmtAmt(currentMonthInterestSum)}</div>
            <div class="muted" style="font-size:0.68rem;">एकूण नफा: ${window.HishobBridge.fmtAmt(lifetimeInterestProfit)}</div>
          </div>
        </div>

        <div class="row" style="gap:6px;">
          <button type="button" id="toggleAnChartBtn" class="primary sm">📈 लाईन चार्ट ${isChartOpen ? "▲" : "▼"}</button>
          <button type="button" id="openProReportsHubBtn" class="primary sm">📊 रिपोर्ट्स हब</button>
          <button type="button" id="toggleAnRiskBtn" class="${highRiskList.length ? "danger" : "success"} sm">
            🔴 Risk (${highRiskList.length})
          </button>
        </div>
      </div>

      <div id="anChartBox" class="${isChartOpen ? "" : "hidden"}">
        <div class="muted" style="font-size:0.76rem; margin-top:8px;">📈 मागील ६ महिन्यांची व्याज वसुली (ग्लोइंग ग्राफ):</div>
        ${lineChartHtml}
      </div>

      <div id="anRiskBox" class="an-risk-box ${isRiskOpen ? "" : "hidden"}">
        <div style="font-weight:700; color:#f07178; font-size:0.84rem; margin-bottom:4px;">🚨 High-Risk थकबाकीदार (२+ महिने व्याज बाकी):</div>
        ${riskRowsHtml}
      </div>
    `;

    document.getElementById("openPaidInterestListBtn")?.addEventListener("click", openInterestContributorsModal);

    document.getElementById("openProReportsHubBtn")?.addEventListener("click", () => {
      if (typeof window.openProReportsHub === "function") window.openProReportsHub();
    });

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
