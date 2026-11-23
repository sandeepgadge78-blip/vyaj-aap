// व्याज हिशोब वही - Professional Advance Dashboard (मासिक व्याज + जमा Dual-Ring बॉक्स, डुप्लिकेट बाकी व्याज काढणे) (js/pro/dashboard-pro.js - V14.38)
(function () {
  const MONTHS_MR = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];
  const RING_CIRC = 113.1; // 2 * Math.PI * 18
  let renderTimer = null;

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
      /* १. वरच्या ग्रिडमधून डुप्लिकेट 'मासिक व्याज' आणि 'बाकी व्याज' काढून स्वच्छ २-कार्ड टॉप रो ठेवा */
      #tileInterest,
      #tilePending {
        display: none !important;
      }

      /* २. मासिक व्याज + जमा व्याज Dual-Ring बॉक्सची स्टाईल */
      .dp-tile.dp-exp { border-left: 3px solid #7dd3fc; }
      .dp-tile.dp-col { border-left: 3px solid #4ade80; }

      /* ३. एकूण बाकी बॅज (बाकी व्याज विभागणी हेडरमध्ये) */
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

  function computeInterestSummary() {
    const activeYm = getActiveYm();
    const out = { activeYm, activeCount: 0, expected: 0, collected: 0, paidAccounts: 0, totalPending: 0, pct: 0 };
    if (!window.HishobBridge || typeof window.HishobBridge.getBorrowers !== "function") return out;

    const borrowers = (window.HishobBridge.getBorrowers() || []).filter((b) => !b.isDeleted && b.accountStatus !== "closed");
    out.activeCount = borrowers.length;

    borrowers.forEach((b) => {
      const c = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
      out.expected += Number(c.monthlyInterest || 0);
      const col = Number(c.collectedInMonth || 0);
      out.collected += col;
      if (col > 0 || c.status === "paid") out.paidAccounts += 1;
      out.totalPending += Math.max(0, Number(c.totalPayable || 0));
    });

    out.pct = out.expected > 0 ? Math.min(100, Math.round((out.collected / out.expected) * 100)) : 0;
    return out;
  }

  // जुन्या analytics कार्डमधील फक्त डुप्लिकेट 'या महिन्याचे जमा व्याज' हा वरचा भाग लपवा (लाईन चार्ट / रिपोर्ट्स हब / Risk सुरक्षित ठेवून)
  function hideLegacyCollectedSummary() {
    const appScreen = document.getElementById("appScreen");
    if (!appScreen) return;
    const allDivs = appScreen.querySelectorAll("div, section");
    for (const el of allDivs) {
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

    const s = computeInterestSummary();

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

    // डाव्या बॉक्सवर क्लिक -> मासिक व्याज यादी उघडा
    document.getElementById("dpOpenExpectedTile")?.addEventListener("click", () => {
      document.getElementById("tileInterest")?.click();
    });

    // उजव्या बॉक्सवर क्लिक -> या महिन्याचे जमा व्याज यादी उघडा
    document.getElementById("dpOpenCollectedTile")?.addEventListener("click", () => {
      if (typeof window.openVyajInterestList === "function") {
        window.openVyajInterestList();
      } else {
        document.getElementById("tileInterest")?.click();
      }
    });

    // बाकी व्याज विभागणीच्या हेडरमध्ये 'एकूण बाकी ₹...' बॅज जोडा
    const pendingBar = document.getElementById("proPendingSplitBar");
    if (pendingBar) {
      const headSpan = pendingBar.querySelector(".psb-bar-head span:first-child");
      if (headSpan) {
        headSpan.innerHTML = `📊 बाकी व्याज विभागणी <span class="dp-tot-badge">एकूण ${fmtInr(s.totalPending)}</span>`;
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
        renderTimer = setTimeout(renderDashboardPro, 200);
      });
      obs.observe(listEl, { childList: true });
    }

    setTimeout(renderDashboardPro, 1000);
    setTimeout(renderDashboardPro, 2200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initDashboardPro);
  else initDashboardPro();
})();
