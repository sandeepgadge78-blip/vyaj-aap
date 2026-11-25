// व्याज हिशोब वही - Anti-Blink Smart Diff Dashboard + Single Ledger Cache Engine (js/pro/dashboard-pro.js - V14.43)
(function () {
  const MONTHS_MR = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];
  const RING_CIRC = 113.1;

  let renderTimer = null;
  let lastRenderSig = "";
  let lastPendingBadgeText = "";
  let cachedLedgerKey = "";
  let cachedLedgerTs = 0;
  let cachedLedgerData = null;

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function fmtInr(val) {
    const n = Number(val || 0);
    if (window.HishobBridge && typeof window.HishobBridge.fmtAmt === "function") {
      return window.HishobBridge.fmtAmt(n);
    }
    return "₹" + n.toLocaleString("en-IN");
  }

  function fmtYmMr(ym) {
    if (!ym || !String(ym).includes("-")) return String(ym || "");
    const [y, m] = String(ym).split("-");
    return `${MONTHS_MR[parseInt(m, 10) - 1] || m} ${y}`;
  }

  function getActiveYm() {
    return document.getElementById("activeYm")?.value || new Date().toISOString().slice(0, 7);
  }

  // =========================================================================
  // Single Ledger Cache (संपूर्ण अ‍ॅपसाठी ६ वेळा होणारी गणिते फक्त १ वेळा मोजा)
  // =========================================================================
  function getLedgerSnapshot(forceYm) {
    const activeYm = forceYm || getActiveYm();
    const empty = {
      activeYm, activeCount: 0, expected: 0, collected: 0, paidAccounts: 0,
      currentPending: 0, currentPendingCount: 0, pastPending: 0, pastPendingCount: 0,
      totalPending: 0, pct: 0, rows: []
    };
    if (!window.HishobBridge || typeof window.HishobBridge.getBorrowers !== "function") return empty;

    const all = window.HishobBridge.getBorrowers() || [];
    let pSum = 0, payCnt = 0, updMax = "";
    for (let i = 0; i < all.length; i++) {
      const b = all[i];
      pSum += Number(b.principal || 0);
      payCnt += Array.isArray(b.paymentHistory) ? b.paymentHistory.length : 0;
      const u = String(b.updatedAt || "");
      if (u > updMax) updMax = u;
    }

    const key = `${activeYm}|${all.length}|${pSum}|${payCnt}|${updMax}`;
    const now = Date.now();
    if (cachedLedgerData && cachedLedgerKey === key && now - cachedLedgerTs < 500) {
      return cachedLedgerData;
    }

    const out = { ...empty, rows: [] };
    for (let i = 0; i < all.length; i++) {
      const b = all[i];
      if (b.isDeleted || b.accountStatus === "closed") continue;
      const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
      out.activeCount += 1;
      out.expected += Number(calc.monthlyInterest || 0);
      const col = Number(calc.collectedInMonth || 0);
      out.collected += col;
      if (col > 0 || calc.status === "paid") out.paidAccounts += 1;

      const curRem = Math.max(0, Number(calc.remainingThisMonth || 0));
      const pastDue = Math.max(0, Number(calc.pastDue || 0));
      if (curRem > 0) { out.currentPending += curRem; out.currentPendingCount += 1; }
      if (pastDue > 0) { out.pastPending += pastDue; out.pastPendingCount += 1; }
      out.totalPending += Math.max(0, Number(calc.totalPayable || 0));
      out.rows.push({ b, calc });
    }

    out.pct = out.expected > 0 ? Math.min(100, Math.round((out.collected / out.expected) * 100)) : 0;
    cachedLedgerKey = key;
    cachedLedgerTs = now;
    cachedLedgerData = out;
    return out;
  }

  window.VyajLedgerCache = { getSnapshot: getLedgerSnapshot };

  function buildRingSvg(pct, colorHex) {
    const clamped = Math.max(0, Math.min(100, Number(pct || 0)));
    const offset = (RING_CIRC * (1 - clamped / 100)).toFixed(1);
    return `
      <div class="psb-ring-box">
        <svg viewBox="0 0 44 44" class="psb-ring-svg">
          <circle cx="22" cy="22" r="18" class="psb-ring-track"></circle>
          <circle cx="22" cy="22" r="18" class="psb-ring-fill"
            style="stroke:${colorHex}; stroke-dasharray:${RING_CIRC}; stroke-dashoffset:${offset};"></circle>
        </svg>
        <span class="psb-ring-txt" style="color:${colorHex};">${clamped}%</span>
      </div>
    `;
  }

  function injectDashboardProCss() {
    if (document.getElementById("vyajDashboardProCss")) return;
    const st = document.createElement("style");
    st.id = "vyajDashboardProCss";
    st.textContent = `
      #tileInterest, #tilePending { display: none !important; }
      .dp-tile.dp-exp { border-left: 3px solid #7dd3fc; }
      .dp-tile.dp-col { border-left: 3px solid #4ade80; }
      .dp-tot-badge {
        display: inline-block; margin-left: 5px; padding: 1px 7px; border-radius: 999px;
        font-size: 0.67rem; font-weight: 800;
        background: rgba(240, 113, 120, 0.16); border: 1px solid rgba(240, 113, 120, 0.4);
        color: var(--danger);
      }
      body.light-mode .dp-tot-badge { background: #ffe4e6; }
    `;
    document.head.appendChild(st);
  }

  function hideLegacyCollectedSummary() {
    const appScreen = document.getElementById("appScreen");
    if (!appScreen) return;
    const allDivs = appScreen.querySelectorAll("div, section");
    for (const el of allDivs) {
      if (el.style.display === "none") continue;
      if (el.id === "proInterestSplitBar" || el.closest("#proInterestSplitBar")) continue;
      if (el.children.length > 0 && el.children.length <= 4) {
        const txt = (el.textContent || "").trim();
        if (
          txt.includes("या महिन्याचे जमा व्याज") &&
          !txt.includes("लाईन चार्ट") &&
          !txt.includes("रिपोर्ट्स हब") &&
          el.offsetHeight < 140
        ) {
          el.style.display = "none";
          break;
        }
      }
    }
  }

  function ensureInterestSplitBar() {
    const appScreen = document.getElementById("appScreen");
    const grid2x2 = appScreen?.querySelector(".grid-2x2");
    if (!appScreen || !grid2x2) return null;

    let wrap = document.getElementById("proInterestSplitBar");
    if (!wrap) {
      wrap = document.createElement("section");
      wrap.id = "proInterestSplitBar";
      wrap.className = "psb-bar-wrap";
      grid2x2.insertAdjacentElement("afterend", wrap);
    }
    return wrap;
  }

  function renderDashboardPro() {
    const wrap = ensureInterestSplitBar();
    if (!wrap) return;

    const s = getLedgerSnapshot();
    const isHiddenAmt = document.body.classList.contains("hide-amounts");
    const sig = `${s.activeYm}|${s.activeCount}|${s.expected}|${s.collected}|${s.paidAccounts}|${s.pct}|${isHiddenAmt}`;

    // Smart Diff: आकडे बदलले नसतील तर बॉक्स पुन्हा पुसून लिहू नका (०% ब्लिंकिंग)
    if (sig !== lastRenderSig || !wrap.children.length) {
      lastRenderSig = sig;
      wrap.innerHTML = `
        <div class="psb-bar-head">
          <span>💰 मासिक व्याज व जमा (${esc(fmtYmMr(s.activeYm))})</span>
          <span>टॅप करून यादी पहा ▸</span>
        </div>
        <div class="psb-grid">
          <div class="psb-tile dp-tile dp-exp" id="dpOpenExpectedTile">
            <div class="psb-tile-info">
              <span class="psb-tile-lbl">🔵 मासिक व्याज</span>
              <span class="psb-tile-amt" style="color:var(--accent);">${fmtInr(s.expected)}</span>
              <span class="psb-tile-sub">${s.activeCount} सक्रिय खाती ▸</span>
            </div>
            ${buildRingSvg(100, "#7dd3fc")}
          </div>
          <div class="psb-tile dp-tile dp-col" id="dpOpenCollectedTile">
            <div class="psb-tile-info">
              <span class="psb-tile-lbl">🟢 जमा व्याज</span>
              <span class="psb-tile-amt" style="color:var(--accent-2);">${fmtInr(s.collected)}</span>
              <span class="psb-tile-sub">${s.paidAccounts} खाती जमा ▸</span>
            </div>
            ${buildRingSvg(s.pct, "#4ade80")}
          </div>
        </div>
      `;

      document.getElementById("dpOpenExpectedTile")?.addEventListener("click", () => {
        document.getElementById("tileInterest")?.click();
      });
      document.getElementById("dpOpenCollectedTile")?.addEventListener("click", () => {
        if (typeof window.openVyajInterestList === "function") window.openVyajInterestList();
        else document.getElementById("tileInterest")?.click();
      });
    }

    // बाकी व्याज विभागणीच्या हेडरमध्ये 'एकूण बाकी' फक्त बदल झाला तरच अपडेट करा
    const pendingBar = document.getElementById("proPendingSplitBar");
    if (pendingBar) {
      const headSpan = pendingBar.querySelector(".psb-bar-head span:first-child");
      const badgeVal = fmtInr(s.totalPending);
      if (headSpan && (badgeVal !== lastPendingBadgeText || !headSpan.querySelector(".dp-tot-badge"))) {
        lastPendingBadgeText = badgeVal;
        headSpan.innerHTML = `📊 बाकी व्याज विभागणी <span class="dp-tot-badge">एकूण ${badgeVal}</span>`;
      }
    }

    hideLegacyCollectedSummary();
  }

  function initDashboardPro() {
    injectDashboardProCss();
    renderDashboardPro();

    const listEl = document.getElementById("borrowersList");
    if (listEl) {
      const obs = new MutationObserver(() => {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(renderDashboardPro, 240);
      });
      obs.observe(listEl, { childList: true });
    }
    document.getElementById("activeYm")?.addEventListener("change", () => setTimeout(renderDashboardPro, 120));
    setTimeout(renderDashboardPro, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initDashboardPro);
  else initDashboardPro();
})();
