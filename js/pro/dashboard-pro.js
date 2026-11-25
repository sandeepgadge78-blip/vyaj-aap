// व्याज हिशोब वही - VyajKernel Powered Anti-Blink Dashboard Bar (स्वतःचा Observer काढला) (js/pro/dashboard-pro.js - V15.1)
(function () {
  const RING_CIRC = 113.1;
  let lastRenderSig = "";

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

  function renderDashboardPro(kernelReport) {
    const K = window.VyajKernel;
    if (!K) return;

    const wrap = ensureInterestSplitBar();
    if (!wrap) return;

    const report = kernelReport || K.getMonthReport();
    const s = report.summary;
    const isHiddenAmt = document.body.classList.contains("hide-amounts");
    const sig = `${report.activeYm}|${s.activeCount}|${s.expectedInterest}|${s.collectedInterest}|${s.paidAccountsCount}|${s.collectionPct}|${isHiddenAmt}`;

    // Smart Diff: आकडे बदलले नसतील तर DOM पुन्हा पुसून लिहू नका (०% ब्लिंकिंग)
    if (sig !== lastRenderSig || !wrap.children.length) {
      lastRenderSig = sig;
      wrap.innerHTML = `
        <div class="psb-bar-head">
          <span>💰 मासिक व्याज व जमा (${K.esc(K.fmtYmMr(report.activeYm))})</span>
          <span>टॅप करून यादी पहा ▸</span>
        </div>
        <div class="psb-grid">
          <div class="psb-tile dp-tile dp-exp" id="dpOpenExpectedTile">
            <div class="psb-tile-info">
              <span class="psb-tile-lbl">🔵 मासिक व्याज</span>
              <span class="psb-tile-amt" style="color:var(--accent);">${K.fmtInr(s.expectedInterest)}</span>
              <span class="psb-tile-sub">${s.activeCount} सक्रिय खाती ▸</span>
            </div>
            ${buildRingSvg(100, "#7dd3fc")}
          </div>
          <div class="psb-tile dp-tile dp-col" id="dpOpenCollectedTile">
            <div class="psb-tile-info">
              <span class="psb-tile-lbl">🟢 जमा व्याज</span>
              <span class="psb-tile-amt" style="color:var(--accent-2);">${K.fmtInr(s.collectedInterest)}</span>
              <span class="psb-tile-sub">${s.paidAccountsCount} खाती जमा ▸</span>
            </div>
            ${buildRingSvg(s.collectionPct, "#4ade80")}
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

    hideLegacyCollectedSummary();
  }

  function initDashboardPro() {
    injectDashboardProCss();

    // स्वतंत्र MutationObserver ऐवजी फक्त VyajKernel च्या एकाच सिग्नलवर subscribe करा
    if (window.VyajKernel && typeof window.VyajKernel.subscribe === "function") {
      window.VyajKernel.subscribe(renderDashboardPro);
    }

    // Hide/Show रक्कम बदलल्यावर लगेच अपडेट करा
    document.addEventListener("click", (ev) => {
      if (ev.target && ev.target.closest("#toggleHideAmtBtn, #setToggleHideBtn")) {
        setTimeout(() => renderDashboardPro(), 80);
      }
    });

    renderDashboardPro();
    setTimeout(() => renderDashboardPro(), 1100);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initDashboardPro);
  else initDashboardPro();
})();
