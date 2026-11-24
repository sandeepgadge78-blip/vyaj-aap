// व्याज हिशोब वही - Professional Advance Dashboard (मासिक व्याज + जमा Dual-Ring बॉक्स, Fixed Slot व Zero-Load VyajHub Sync) (js/pro/dashboard-pro.js - V14.46)
(function () {
  const MONTHS_MR = [
    "जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून",
    "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"
  ];
  const RING_CIRC = 113.1; // 2 * Math.PI * 18

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
        <svg class="psb-ring-svg" viewBox="0 0 42 42">
          <circle class="psb-ring-track" cx="21" cy="21" r="18"></circle>
          <circle class="psb-ring-fill" cx="21" cy="21" r="18" stroke="${colorHex}" stroke-dasharray="${RING_CIRC}" stroke-dashoffset="${offset}"></circle>
        </svg>
        <div class="psb-ring-txt" style="color:${colorHex};">${clamped}%</div>
      </div>
    `;
  }

  function injectDashboardProCss() {
    if (document.getElementById("vyajDashboardProCss")) return;
    const st = document.createElement("style");
    st.id = "vyajDashboardProCss";
    st.textContent = `
      /* १. वरच्या ग्रिडमधून डुप्लिकेट 'मासिक व्याज' आणि 'बाकी व्याज' काढून स्वच्छ २-कार्ड टॉप रो ठेवा */
      #tileInterest, #tilePending { display: none !important; }

      /* २. मासिक व्याज + जमा व्याज Dual-Ring बॉक्सची सुरक्षित स्टाईल */
      .dp-tile.dp-exp { border-left: 3px solid #7dd3fc; }
      .dp-tile.dp-col { border-left: 3px solid #4ade80; }

      /* ३. एकूण बाकी बॅज */
      .dp-tot-badge {
        display: inline-block; margin-left: 5px; padding: 1px 7px; border-radius: 999px;
        font-size: 0.67rem; font-weight: 800;
        background: rgba(240, 113, 120, 0.16);
        border: 1px solid rgba(240, 113, 120, 0.4);
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

    const borrowers = (window.HishobBridge.getBorrowers() || []).filter(
      (b) => !b.isDeleted && b.accountStatus !== "closed"
    );
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

  // जुन्या analytics कार्डमधील फक्त डुप्लिकेट 'या महिन्याचे जमा व्याज' हीच लहान पट्टी लपवा (बटणे कधीही लपू नयेत म्हणून सुरक्षित तपासणी)
  function hideLegacyCollectedSummary() {
    const appScreen = document.getElementById("appScreen");
    if (!appScreen || appScreen.classList.contains("hidden")) return;

    const candidates = appScreen.querySelectorAll(".an-card > div, .card > div");
    for (const el of candidates) {
      if (el.id === "proInterestSplitBar" || el.closest("#proInterestSplitBar") || el.closest(".vyaj-fixed-slot")) {
        continue;
      }
      // ज्या बॉक्समध्ये कोणतेही बटण (लाईन चार्ट / रिपोर्ट्स हब / Risk / उधारी) असेल त्याला कधीही हात लावू नका
      if (el.querySelector("button")) continue;

      const txt = (el.textContent || "").trim();
      if (txt.includes("या महिन्याचे जमा व्याज") && txt.length < 180) {
        el.style.display = "none";
      }
    }
  }

  function ensureInterestSplitBar() {
    const appScreen = document.getElementById("appScreen");
    if (!appScreen) return null;

    let wrap = document.getElementById("proInterestSplitBar");
    if (!wrap) {
      wrap = document.createElement("section");
      wrap.id = "proInterestSplitBar";
      wrap.className = "psb-bar-wrap";
    }

    // कायमस्वरूपी Fixed Slot (#slot-interest-bar) मध्ये बसवा
    if (window.VyajHub && typeof window.VyajHub.mountToSlot === "function") {
      window.VyajHub.mountToSlot("slot-interest-bar", wrap, (el) => {
        const grid2x2 = appScreen.querySelector(".grid-2x2");
        if (grid2x2) grid2x2.insertAdjacentElement("afterend", el);
      });
    } else if (!wrap.parentElement) {
      const grid2x2 = appScreen.querySelector(".grid-2x2");
      if (grid2x2) grid2x2.insertAdjacentElement("afterend", wrap);
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
            <span class="psb-tile-lbl">📘 मासिक व्याज</span>
            <span class="psb-tile-amt" style="color:var(--accent);">${fmtInr(s.expected)}</span>
            <span class="psb-tile-sub">${s.activeCount} सक्रिय खाती ▸</span>
          </div>
          ${buildRingSvg(100, "#7dd3fc")}
        </div>
        <div class="psb-tile dp-tile dp-col" id="dpOpenCollectedTile">
          <div class="psb-tile-info">
            <span class="psb-tile-lbl">✅ जमा व्याज</span>
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

    hideLegacyCollectedSummary();
  }

  function initDashboardPro() {
    injectDashboardProCss();
    if (window.VyajHub && typeof window.VyajHub.register === "function") {
      window.VyajHub.register("dashboard-pro", renderDashboardPro);
    } else {
      renderDashboardPro();
      setTimeout(renderDashboardPro, 1000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDashboardPro);
  } else {
    initDashboardPro();
  }
})();
