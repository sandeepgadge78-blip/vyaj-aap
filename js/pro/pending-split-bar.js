// व्याज हिशोब वही - बाकी व्याज २ विभाग (चालू महिना बाकी + मागील महिने बाकी) Dual-Ring Activity Bar व Advance तपशील यादी (js/pro/pending-split-bar.js - V14.35)
(function () {
  const MONTHS_MR = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];
  const RING_CIRC = 113.1; // 2 * Math.PI * 18

  let activeModalTab = "current"; // current | past
  let modalSearch = "";
  let refreshTimer = null;

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

  function cleanMobile(raw) {
    if (window.VyajSchema && typeof window.VyajSchema.normalizeMobile === "function") {
      return window.VyajSchema.normalizeMobile(raw);
    }
    const d = String(raw || "").replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("91")) return d.slice(2);
    if (d.length === 11 && d.startsWith("0")) return d.slice(1);
    return d.slice(-10);
  }

  // चालू महिना बाकी व मागील महिने बाकी यांचे अचूक गणित
  function computeSplitPendingData() {
    const activeYm = getActiveYm();
    const out = {
      activeYm,
      activeCount: 0,
      totalExpected: 0,
      currentList: [],
      pastList: [],
      currentTotal: 0,
      pastTotal: 0,
      currentPct: 0,
      pastPct: 0
    };

    if (!window.HishobBridge || typeof window.HishobBridge.getBorrowers !== "function") return out;

    const borrowers = (window.HishobBridge.getBorrowers() || []).filter((b) => !b.isDeleted && b.accountStatus !== "closed");
    out.activeCount = borrowers.length;

    borrowers.forEach((b) => {
      const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
      const expected = Number(calc.monthlyInterest || 0);
      const curRem = Math.max(0, Number(calc.remainingThisMonth || 0));
      const pastDue = Math.max(0, Number(calc.pastDue || 0));
      const pastMonths = (calc.pastPendingMonths || []).filter((pm) => Number(pm.remaining || 0) > 0);

      out.totalExpected += expected;

      if (curRem > 0) {
        out.currentTotal += curRem;
        out.currentList.push({
          b,
          calc,
          amount: curRem,
          pastDue,
          status: calc.status,
          months: [{ ym: activeYm, remaining: curRem }]
        });
      }

      if (pastDue > 0) {
        out.pastTotal += pastDue;
        out.pastList.push({
          b,
          calc,
          amount: pastDue,
          curRem,
          months: pastMonths.length ? pastMonths : [{ ym: activeYm, remaining: pastDue, isManual: true }]
        });
      }
    });

    out.currentList.sort((a, c) => c.amount - a.amount);
    out.pastList.sort((a, c) => c.amount - a.amount);

    out.currentPct = out.totalExpected > 0 ? Math.min(100, Math.round((out.currentTotal / out.totalExpected) * 100)) : 0;
    out.pastPct = out.activeCount > 0 ? Math.min(100, Math.round((out.pastList.length / out.activeCount) * 100)) : 0;

    return out;
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

  function injectSplitBarCss() {
    if (document.getElementById("vyajPendingSplitBarCss")) return;
    const st = document.createElement("style");
    st.id = "vyajPendingSplitBarCss";
    st.textContent = `
      .psb-bar-wrap {
        margin-bottom: 12px; padding: 8px; border-radius: 16px;
        background: var(--card); border: 1px solid var(--border);
        box-shadow: var(--glass-shadow);
      }
      .psb-bar-head {
        display: flex; justify-content: space-between; align-items: center;
        padding: 0 4px 6px; font-size: 0.72rem; font-weight: 800; color: var(--muted);
      }
      .psb-grid {
        display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
      }
      .psb-tile {
        display: flex; align-items: center; justify-content: space-between; gap: 6px;
        padding: 9px 10px; border-radius: 13px; cursor: pointer;
        background: var(--meta-bg); border: 1px solid var(--border);
        transition: transform 0.14s, border-color 0.18s;
      }
      .psb-tile:active { transform: scale(0.97); }
      .psb-tile.psb-cur { border-left: 3px solid #f07178; }
      .psb-tile.psb-past { border-left: 3px solid #e5a952; }
      body.light-mode .psb-tile { background: #fbfaf7; }

      .psb-tile-info { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .psb-tile-lbl { font-size: 0.7rem; font-weight: 800; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .psb-tile-amt { font-size: 1.02rem; font-weight: 900; line-height: 1.15; }
      .psb-tile-sub { font-size: 0.65rem; font-weight: 700; color: var(--muted); }

      .psb-ring-box { position: relative; width: 42px; height: 42px; flex-shrink: 0; }
      .psb-ring-svg { width: 42px; height: 42px; transform: rotate(-90deg); }
      .psb-ring-track { fill: none; stroke: rgba(148, 163, 184, 0.22); stroke-width: 4; }
      .psb-ring-fill { fill: none; stroke-width: 4; stroke-linecap: round; transition: stroke-dashoffset 0.45s ease; }
      .psb-ring-txt {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        font-size: 0.63rem; font-weight: 900;
      }

      /* Advance Split Pending Modal */
      .psb-tabs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 10px; }
      .psb-tab-btn {
        padding: 8px 6px !important; font-size: 0.76rem !important; font-weight: 800 !important;
        border-radius: 11px !important; background: var(--meta-bg) !important; color: var(--text) !important;
      }
      .psb-tab-btn.is-active {
        background: #eceff4 !important; color: #090a0d !important; border-color: #eceff4 !important;
      }
      body.light-mode .psb-tab-btn.is-active {
        background: #1f242d !important; color: #fbfaf7 !important; border-color: #1f242d !important;
      }

      .psb-item {
        padding: 10px 11px; border-radius: 13px; background: var(--meta-bg);
        border: 1px solid var(--border); margin-bottom: 8px;
      }
      .psb-item-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
      .psb-item-name { font-size: 0.89rem; font-weight: 800; color: var(--text); cursor: pointer; }
      .psb-item-sub { font-size: 0.72rem; color: var(--muted); margin-top: 2px; }
      .psb-item-amt { font-size: 0.96rem; font-weight: 900; white-space: nowrap; }

      .psb-months-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; align-items: center; }
      .psb-m-pill {
        font-size: 0.66rem; font-weight: 800; padding: 2px 7px; border-radius: 999px;
        background: rgba(159, 18, 57, 0.24); border: 1px solid rgba(240, 113, 120, 0.45); color: #fda4af;
      }
      .psb-m-pill.past {
        background: rgba(180, 83, 9, 0.24); border-color: rgba(229, 169, 82, 0.45); color: #fcd34d;
      }
      body.light-mode .psb-m-pill { background: #ffe4e6; color: #be123c; }
      body.light-mode .psb-m-pill.past { background: #fef3c7; color: #b45309; }

      .psb-acts {
        display: flex; flex-wrap: nowrap; gap: 5px; margin-top: 8px; overflow-x: auto; scrollbar-width: none;
      }
      .psb-acts::-webkit-scrollbar { display: none; }
      .psb-act-btn {
        flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px;
        padding: 4px 9px !important; border-radius: 999px !important; font-size: 0.71rem !important;
        font-weight: 800 !important; text-decoration: none !important; color: #fff !important;
        border: 1px solid rgba(255, 255, 255, 0.16) !important; cursor: pointer;
      }
      .psb-act-btn.call { background: #15803d !important; }
      .psb-act-btn.wa { background: #0f766e !important; }
      .psb-act-btn.qr { background: #6d28d9 !important; }
      .psb-act-btn.pay { background: #b45309 !important; }
      .psb-act-btn.det { background: #262a34 !important; }
    `;
    document.head.appendChild(st);
  }

  function ensureBarContainer() {
    const appScreen = document.getElementById("appScreen");
    const grid2x2 = appScreen?.querySelector(".grid-2x2");
    if (!appScreen || !grid2x2) return null;

    let wrap = document.getElementById("proPendingSplitBar");
    if (!wrap) {
      wrap = document.createElement("section");
      wrap.id = "proPendingSplitBar";
      wrap.className = "psb-bar-wrap";
      grid2x2.insertAdjacentElement("afterend", wrap);
    }
    return wrap;
  }

  function renderSplitActivityBar() {
    const wrap = ensureBarContainer();
    if (!wrap) return;
    const d = computeSplitPendingData();

    wrap.innerHTML = `
      <div class="psb-bar-head">
        <span>📊 बाकी व्याज विभागणी (${esc(fmtYmMr(d.activeYm))})</span>
        <span>टॅप करून यादी पहा ▸</span>
      </div>
      <div class="psb-grid">
        <div class="psb-tile psb-cur" id="psbOpenCurrentTile">
          <div class="psb-tile-info">
            <span class="psb-tile-lbl">🔴 चालू महिना बाकी</span>
            <span class="psb-tile-amt" style="color:var(--danger);">${fmtInr(d.currentTotal)}</span>
            <span class="psb-tile-sub">${d.currentList.length} खाती बाकी ▸</span>
          </div>
          ${buildRingSvg(d.currentPct, "#f07178")}
        </div>

        <div class="psb-tile psb-past" id="psbOpenPastTile">
          <div class="psb-tile-info">
            <span class="psb-tile-lbl">🟠 मागील महिने बाकी</span>
            <span class="psb-tile-amt" style="color:var(--warn);">${fmtInr(d.pastTotal)}</span>
            <span class="psb-tile-sub">${d.pastList.length} खाती थकीत ▸</span>
          </div>
          ${buildRingSvg(d.pastPct, "#e5a952")}
        </div>
      </div>
    `;

    document.getElementById("psbOpenCurrentTile")?.addEventListener("click", () => openSplitPendingModal("current"));
    document.getElementById("psbOpenPastTile")?.addEventListener("click", () => openSplitPendingModal("past"));
  }

  function ensureSplitModal() {
    let modal = document.getElementById("proPendingSplitModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "proPendingSplitModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `<div class="modal-card" style="max-width:650px;" id="proPendingSplitBody"></div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("proPendingSplitModal");
      }
    });

    // Refresh State Restore नंतर आपोआप कंटेंट भरा
    const obs = new MutationObserver(() => {
      if (!modal.classList.contains("hidden") && !document.getElementById("proPendingSplitBody")?.innerHTML.trim()) {
        renderSplitModal();
      }
    });
    obs.observe(modal, { attributes: true, attributeFilter: ["class"] });
    return modal;
  }

  function jumpToCardFromModal(borrowerId, openPastMgr) {
    const modal = document.getElementById("proPendingSplitModal");
    if (modal) modal.classList.add("hidden");
    if (window.VyajNavStack) window.VyajNavStack.popIfTop("proPendingSplitModal");

    if (openPastMgr && typeof window.openProPastDuesManager === "function") {
      window.openProPastDuesManager(borrowerId);
      return;
    }

    const area = document.querySelector(`#borrowersList .nc-clickable-area[data-toggle-card="${borrowerId}"]`);
    if (area) {
      area.scrollIntoView({ behavior: "smooth", block: "center" });
      const det = document.getElementById(`cardDetails_${borrowerId}`);
      if (det && det.classList.contains("hidden")) area.click();
    }
  }

  function renderSplitModal() {
    const body = document.getElementById("proPendingSplitBody");
    if (!body) return;

    const d = computeSplitPendingData();
    const rawList = activeModalTab === "current" ? d.currentList : d.pastList;
    const q = modalSearch.trim().toLowerCase();

    const filtered = rawList.filter((item) => {
      if (!q) return true;
      const hay = [item.b.name, item.b.mobile, item.b.guarantor, item.b.companyDept].join(" ").toLowerCase();
      return hay.includes(q);
    });

    const filteredSum = filtered.reduce((s, x) => s + x.amount, 0);
    const isPastTab = activeModalTab === "past";

    const rowsHtml = filtered.length
      ? filtered.map((item, idx) => {
          const b = item.b;
          const mob = cleanMobile(b.mobile);
          const hasMob = mob.length >= 10;

          const monthPills = item.months.map((m) => {
            const label = fmtYmMr(m.ym);
            const amtNote = isPastTab ? ` (${fmtInr(m.remaining)})` : "";
            return `<span class="psb-m-pill ${isPastTab ? "past" : ""}">${esc(label + amtNote)}</span>`;
          }).join("");

          const monthsTextForWa = item.months.map((m) => fmtYmMr(m.ym)).join(", ");
          const subLine = isPastTab
            ? `मागील थकबाकी: ${fmtInr(item.amount)} | चालू बाकी: ${fmtInr(item.curRem)}${b.guarantor ? ` • 🤝 ${b.guarantor}` : ""}`
            : `चालू बाकी: ${fmtInr(item.amount)} | मागील बाकी: ${fmtInr(item.pastDue)}${b.guarantor ? ` • 🤝 ${b.guarantor}` : ""}`;

          return `
            <div class="psb-item">
              <div class="psb-item-top">
                <div style="min-width:0;">
                  <div class="psb-item-name" data-psb-jump="${esc(b.id)}">${idx + 1}. ${esc(b.name || "ग्राहक")}</div>
                  <div class="psb-item-sub">${esc(subLine)}</div>
                </div>
                <div class="psb-item-amt" style="color:${isPastTab ? "var(--warn)" : "var(--danger)"};">${fmtInr(item.amount)}</div>
              </div>

              <div class="psb-months-row">
                <span class="muted" style="font-size:0.68rem; font-weight:700;">बाकी महिने (${item.months.length}):</span>
                ${monthPills}
              </div>

              <div class="psb-acts">
                ${hasMob ? `<a href="tel:${esc(mob)}" class="psb-act-btn call">📞 Call</a>` : ""}
                ${hasMob ? `<button type="button" class="psb-act-btn wa" data-psb-wa="${esc(mob)}" data-name="${esc(b.name)}" data-amt="${item.amount}" data-months="${esc(monthsTextForWa)}">💬 WA</button>` : ""}
                <button type="button" class="psb-act-btn qr" data-psb-qr="${esc(b.id)}" data-amt="${item.amount}">📱 QR</button>
                <button type="button" class="psb-act-btn pay" data-psb-pay="${esc(b.id)}" data-ispast="${isPastTab ? "1" : "0"}">⚡ जमा</button>
                <button type="button" class="psb-act-btn det" data-psb-det="${esc(b.id)}">📋 Details</button>
              </div>
            </div>
          `;
        }).join("")
      : `<div class="ok" style="text-align:center; padding:22px; font-weight:700;">✅ या विभागात कोणतीही बाकी नाही!</div>`;

    body.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
        <h3 style="margin:0; color:var(--accent);">📊 बाकी व्याज तपशील (${esc(fmtYmMr(d.activeYm))})</h3>
        <button type="button" id="psbPrintBtn" class="primary sm">🖨️ प्रिंट / PDF</button>
      </div>

      <div class="psb-tabs">
        <button type="button" class="psb-tab-btn ${activeModalTab === "current" ? "is-active" : ""}" data-psbtab="current">
          🔴 चालू महिना (${d.currentList.length}) • ${d.currentPct}%
        </button>
        <button type="button" class="psb-tab-btn ${activeModalTab === "past" ? "is-active" : ""}" data-psbtab="past">
          🟠 मागील महिने (${d.pastList.length}) • ${d.pastPct}%
        </button>
      </div>

      <div class="meta-box" style="margin-bottom:9px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px; font-weight:800;">
        <span>${isPastTab ? "एकूण मागील बाकी" : "चालू महिना बाकी"}: <strong style="color:${isPastTab ? "var(--warn)" : "var(--danger)"};">${fmtInr(filteredSum)}</strong></span>
        <span class="muted">एकूण खाती: ${filtered.length}</span>
      </div>

      <input type="text" id="psbSearchInput" class="search-pill-box" value="${esc(modalSearch)}" placeholder="🔍 नाव, मोबाईल किंवा जामीनदार शोधा..." style="margin-bottom:9px;" />

      <div style="max-height:56vh; overflow-y:auto;">${rowsHtml}</div>
    `;

    body.querySelectorAll("[data-psbtab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeModalTab = btn.getAttribute("data-psbtab");
        renderSplitModal();
      });
    });

    const sInp = document.getElementById("psbSearchInput");
    sInp?.addEventListener("input", () => {
      modalSearch = sInp.value;
      const pos = sInp.selectionStart || modalSearch.length;
      renderSplitModal();
      const nextInp = document.getElementById("psbSearchInput");
      if (nextInp) { nextInp.focus(); nextInp.setSelectionRange(pos, pos); }
    });

    body.querySelectorAll("[data-psb-wa]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mob = btn.getAttribute("data-psb-wa");
        const target = mob.length === 10 ? "91" + mob : mob;
        const name = btn.getAttribute("data-name") || "";
        const amt = Number(btn.getAttribute("data-amt") || 0);
        const mTxt = btn.getAttribute("data-months") || "";
        const biz = document.getElementById("tBrandTitle")?.textContent?.trim() || "व्याज हिशोब वही";
        const heading = isPastTab ? "मागील महिन्यांचे थकीत व्याज" : "चालू महिन्याचे व्याज";
        const msg = `नमस्कार *${name}*,\nआपले *${heading}* (${mTxt}) रक्कम *₹${amt.toLocaleString("en-IN")}* बाकी आहे.\nकृपया लवकरात लवकर जमा करावे. धन्यवाद!\n— *${biz}*`;
        window.open(`https://wa.me/${target}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
      });
    });

    body.querySelectorAll("[data-psb-qr]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bid = btn.getAttribute("data-psb-qr");
        const amt = Number(btn.getAttribute("data-amt") || 0);
        const openQr = () => {
          if (typeof window.openInvoiceReceipt === "function") window.openInvoiceReceipt(bid);
          else if (typeof window.openUpiQr === "function") window.openUpiQr(bid, amt);
        };
        if (window.VyajNavStack) window.VyajNavStack.navigateFrom("proPendingSplitModal", openQr);
        else { document.getElementById("proPendingSplitModal")?.classList.add("hidden"); openQr(); }
      });
    });

    body.querySelectorAll("[data-psb-det]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bid = btn.getAttribute("data-psb-det");
        const openDet = () => { if (typeof window.openProCustomerDetails === "function") window.openProCustomerDetails(bid); };
        if (window.VyajNavStack) window.VyajNavStack.navigateFrom("proPendingSplitModal", openDet);
        else { document.getElementById("proPendingSplitModal")?.classList.add("hidden"); openDet(); }
      });
    });

    body.querySelectorAll("[data-psb-pay]").forEach((btn) => {
      btn.addEventListener("click", () => {
        jumpToCardFromModal(btn.getAttribute("data-psb-pay"), btn.getAttribute("data-ispast") === "1");
      });
    });

    body.querySelectorAll("[data-psb-jump]").forEach((el) => {
      el.addEventListener("click", () => jumpToCardFromModal(el.getAttribute("data-psb-jump"), false));
    });

    document.getElementById("psbPrintBtn")?.addEventListener("click", () => {
      const printArea = document.getElementById("printArea");
      if (!printArea) return;
      const biz = document.getElementById("tBrandTitle")?.textContent?.trim() || "व्याज हिशोब वही";
      const title = isPastTab ? "मागील महिने थकीत व्याज यादी" : `चालू महिना (${fmtYmMr(d.activeYm)}) बाकी व्याज यादी`;
      const trHtml = filtered.map((item, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(item.b.name || "-")}</td>
          <td>${esc(cleanMobile(item.b.mobile) || "-")}</td>
          <td>${esc(item.months.map((m) => fmtYmMr(m.ym)).join(", "))}</td>
          <td><strong>₹${item.amount.toLocaleString("en-IN")}</strong></td>
        </tr>
      `).join("");
      printArea.innerHTML = `
        <div style="font-family:system-ui,sans-serif;">
          <h2>${esc(biz)} — ${esc(title)}</h2>
          <p>एकूण खाती: ${filtered.length} | एकूण बाकी: <strong>₹${filteredSum.toLocaleString("en-IN")}</strong></p>
          <table>
            <thead><tr><th>क्र.</th><th>ग्राहक</th><th>मोबाईल</th><th>बाकी महिने</th><th>रक्कम</th></tr></thead>
            <tbody>${trHtml}</tbody>
          </table>
        </div>
      `;
      window.print();
    });
  }

  function openSplitPendingModal(tab) {
    activeModalTab = tab === "past" ? "past" : "current";
    modalSearch = "";
    const modal = ensureSplitModal();
    renderSplitModal();
    modal.classList.remove("hidden");
  }

  // जुन्या #tilePending वर क्लिक केल्यासही आपली अचूक २-टॅब यादी उघडा (डुप्लिकेट Call व 'बाकी महिने 0' टाळण्यासाठी)
  function interceptLegacyPendingTile() {
    document.addEventListener("click", (ev) => {
      const tile = ev.target && ev.target.closest ? ev.target.closest("#tilePending") : null;
      if (!tile) return;
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      openSplitPendingModal("current");
    }, true);
  }

  window.openProSplitPending = openSplitPendingModal;

  function initSplitBar() {
    injectSplitBarCss();
    interceptLegacyPendingTile();
    ensureSplitModal();
    renderSplitActivityBar();

    const listEl = document.getElementById("borrowersList");
    if (listEl) {
      const obs = new MutationObserver(() => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(renderSplitActivityBar, 180);
      });
      obs.observe(listEl, { childList: true });
    }
    setTimeout(renderSplitActivityBar, 1300);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initSplitBar);
  else initSplitBar();
})();
