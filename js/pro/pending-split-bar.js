// व्याज हिशोब वही - Anti-Blink Smart Diff बाकी व्याज विभागणी Dual-Ring Bar + संपूर्ण यादी पॉपअप (js/pro/pending-split-bar.js - V14.43)
(function () {
  const MONTHS_MR = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];
  const RING_CIRC = 113.1; // 2 * Math.PI * 18

  let renderTimer = null;
  let lastRenderSig = "";
  let modalTab = "current"; // current | past
  let modalSearch = "";

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

  function fmtYmShort(ym) {
    if (!ym || !String(ym).includes("-")) return String(ym || "");
    const [y, m] = String(ym).split("-");
    const mName = MONTHS_MR[parseInt(m, 10) - 1] || m;
    return `${mName.slice(0, 4)} ${String(y).slice(-2)}`;
  }

  function fmtYmMr(ym) {
    if (!ym || !String(ym).includes("-")) return String(ym || "");
    const [y, m] = String(ym).split("-");
    return `${MONTHS_MR[parseInt(m, 10) - 1] || m} ${y}`;
  }

  function getActiveYm() {
    return document.getElementById("activeYm")?.value || new Date().toISOString().slice(0, 7);
  }

  function cleanMob(raw) {
    const d = String(raw || "").replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("91")) return d.slice(2);
    if (d.length === 11 && d.startsWith("0")) return d.slice(1);
    return d.slice(-10);
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

  function injectPendingSplitCss() {
    if (document.getElementById("vyajPendingSplitProCss")) return;
    const st = document.createElement("style");
    st.id = "vyajPendingSplitProCss";
    st.textContent = `
      .psb-bar-wrap {
        margin-bottom: 10px; padding: 10px; border-radius: 16px;
        background: var(--card); border: 1px solid var(--border);
        box-shadow: var(--glass-shadow);
      }
      .psb-bar-head {
        display: flex; align-items: center; justify-content: space-between; gap: 6px;
        font-size: 0.74rem; font-weight: 800; color: var(--muted);
        margin-bottom: 8px;
      }
      .psb-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .psb-tile {
        display: flex; align-items: center; justify-content: space-between; gap: 6px;
        padding: 9px 9px; border-radius: 13px; cursor: pointer;
        background: var(--meta-bg); border: 1px solid var(--border);
        min-width: 0;
      }
      .psb-tile:active { transform: scale(0.98); }
      .psb-tile.psb-cur { border-left: 3px solid #f07178; }
      .psb-tile.psb-past { border-left: 3px solid #e5a952; }
      .psb-tile-info { display: flex; flex-direction: column; min-width: 0; }
      .psb-tile-lbl { font-size: 0.7rem; font-weight: 800; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .psb-tile-amt { font-size: 1.02rem; font-weight: 900; margin-top: 2px; white-space: nowrap; }
      .psb-tile-sub { font-size: 0.66rem; color: var(--muted); font-weight: 700; margin-top: 2px; white-space: nowrap; }

      .psb-ring-box { position: relative; width: 42px; height: 42px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
      .psb-ring-svg { width: 42px; height: 42px; transform: rotate(-90deg); }
      .psb-ring-track { fill: none; stroke: rgba(148, 163, 184, 0.22); stroke-width: 4; }
      .psb-ring-fill { fill: none; stroke-width: 4; stroke-linecap: round; }
      .psb-ring-txt { position: absolute; font-size: 0.61rem; font-weight: 900; }

      /* तपशील पॉपअप मधील यादी स्टाईल */
      .psb-m-tabs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 9px; }
      .psb-m-tab {
        padding: 7px 6px !important; font-size: 0.74rem !important; font-weight: 800 !important;
        border-radius: 10px !important; background: var(--meta-bg) !important; color: var(--text) !important;
      }
      .psb-m-tab.is-active { background: #eceff4 !important; color: #090a0d !important; border-color: #eceff4 !important; }
      body.light-mode .psb-m-tab.is-active { background: #1f242d !important; color: #fbfaf7 !important; }

      .psb-item {
        padding: 9px 10px; border-radius: 12px; margin-bottom: 8px;
        background: var(--meta-bg); border: 1px solid var(--border);
        border-left: 3px solid var(--danger);
      }
      .psb-item.is-past { border-left-color: var(--warn); }
      .psb-item-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
      .psb-item-name { font-size: 0.87rem; font-weight: 800; color: var(--text); }
      .psb-item-meta { font-size: 0.71rem; color: var(--muted); margin-top: 2px; line-height: 1.4; }
      .psb-item-amt { font-size: 0.94rem; font-weight: 900; white-space: nowrap; text-align: right; }

      .psb-acts { display: flex; flex-wrap: nowrap; gap: 5px; margin-top: 7px; overflow-x: auto; scrollbar-width: none; }
      .psb-acts::-webkit-scrollbar { display: none; }
      .psb-acts button, .psb-acts a {
        flex: 0 0 auto; display: inline-flex; align-items: center; gap: 3px;
        padding: 4px 8px !important; border-radius: 999px !important; font-size: 0.69rem !important;
        font-weight: 800 !important; text-decoration: none !important; color: #fff !important;
        border: 1px solid rgba(255, 255, 255, 0.16) !important; cursor: pointer;
      }
    `;
    document.head.appendChild(st);
  }

  // Single Ledger Cache मधून डेटा घ्या (वारंवार गणित टाळण्यासाठी)
  function getPendingSplitData() {
    if (window.VyajLedgerCache && typeof window.VyajLedgerCache.getSnapshot === "function") {
      const snap = window.VyajLedgerCache.getSnapshot();
      const curList = [];
      const pastList = [];
      (snap.rows || []).forEach(({ b, calc }) => {
        const curRem = Math.max(0, Number(calc.remainingThisMonth || 0));
        const pastDue = Math.max(0, Number(calc.pastDue || 0));
        if (curRem > 0) curList.push({ b, calc, amt: curRem });
        if (pastDue > 0) pastList.push({ b, calc, amt: pastDue });
      });
      curList.sort((a, c) => c.amt - a.amt);
      pastList.sort((a, c) => c.amt - a.amt);

      const curPct = snap.expected > 0 ? Math.min(100, Math.round((snap.currentPending / snap.expected) * 100)) : 0;
      const pastPct = snap.expected > 0 ? Math.min(100, Math.round((snap.pastPending / snap.expected) * 100)) : 0;

      return {
        activeYm: snap.activeYm,
        expected: snap.expected,
        currentPending: snap.currentPending,
        currentCount: snap.currentPendingCount,
        pastPending: snap.pastPending,
        pastCount: snap.pastPendingCount,
        totalPending: snap.totalPending,
        curPct,
        pastPct,
        curList,
        pastList
      };
    }

    // सुरक्षित Fallback
    const activeYm = getActiveYm();
    const out = {
      activeYm, expected: 0, currentPending: 0, currentCount: 0,
      pastPending: 0, pastCount: 0, totalPending: 0, curPct: 0, pastPct: 0,
      curList: [], pastList: []
    };
    if (!window.HishobBridge || typeof window.HishobBridge.getBorrowers !== "function") return out;

    const list = (window.HishobBridge.getBorrowers() || []).filter((b) => !b.isDeleted && b.accountStatus !== "closed");
    list.forEach((b) => {
      const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
      out.expected += Number(calc.monthlyInterest || 0);
      const curRem = Math.max(0, Number(calc.remainingThisMonth || 0));
      const pastDue = Math.max(0, Number(calc.pastDue || 0));
      if (curRem > 0) { out.currentPending += curRem; out.currentCount += 1; out.curList.push({ b, calc, amt: curRem }); }
      if (pastDue > 0) { out.pastPending += pastDue; out.pastCount += 1; out.pastList.push({ b, calc, amt: pastDue }); }
      out.totalPending += Math.max(0, Number(calc.totalPayable || 0));
    });
    out.curList.sort((a, c) => c.amt - a.amt);
    out.pastList.sort((a, c) => c.amt - a.amt);
    out.curPct = out.expected > 0 ? Math.min(100, Math.round((out.currentPending / out.expected) * 100)) : 0;
    out.pastPct = out.expected > 0 ? Math.min(100, Math.round((out.pastPending / out.expected) * 100)) : 0;
    return out;
  }

  function ensurePendingBarContainer() {
    const appScreen = document.getElementById("appScreen");
    if (!appScreen) return null;

    let wrap = document.getElementById("proPendingSplitBar");
    const anchor = document.getElementById("proInterestSplitBar") || appScreen.querySelector(".grid-2x2");
    if (!anchor) return null;

    if (!wrap) {
      wrap = document.createElement("section");
      wrap.id = "proPendingSplitBar";
      wrap.className = "psb-bar-wrap";
      anchor.insertAdjacentElement("afterend", wrap);
    } else if (anchor.nextElementSibling !== wrap) {
      anchor.insertAdjacentElement("afterend", wrap);
    }
    return wrap;
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
    return modal;
  }

  function jumpToCustomerCard(borrowerId) {
    document.getElementById("proPendingSplitModal")?.classList.add("hidden");
    const area = document.querySelector(`#borrowersList .nc-clickable-area[data-toggle-card="${borrowerId}"]`);
    if (area) {
      area.scrollIntoView({ behavior: "smooth", block: "center" });
      const detailsEl = document.getElementById(`cardDetails_${borrowerId}`);
      if (detailsEl && detailsEl.classList.contains("hidden")) area.click();
    } else if (typeof window.openProCustomerDetails === "function") {
      window.openProCustomerDetails(borrowerId);
    }
  }

  function renderSplitModal() {
    const body = document.getElementById("proPendingSplitBody");
    if (!body) return;

    const d = getPendingSplitData();
    const isPast = modalTab === "past";
    const baseList = isPast ? d.pastList : d.curList;
    const q = modalSearch.trim().toLowerCase();
    const list = baseList.filter(({ b }) => !q || `${b.name || ""} ${b.mobile || ""} ${b.guarantor || ""}`.toLowerCase().includes(q));

    const cardsHtml = list.length
      ? list.map(({ b, calc, amt }) => {
          const mob = cleanMob(b.mobile);
          const hasMob = mob.length >= 10;
          const pastMonths = (calc.pastPendingMonths || [])
            .filter((pm) => Number(pm.remaining || 0) > 0)
            .map((pm) => `${fmtYmShort(pm.ym)}: ${fmtInr(pm.remaining)}`)
            .slice(-4)
            .join(", ");

          const subLine = isPast
            ? (pastMonths ? `📅 थकीत महिने: ${esc(pastMonths)}` : `📅 मागील थकबाकी: ${fmtInr(amt)}`)
            : `मासिक व्याज: ${fmtInr(calc.monthlyInterest)} • जमा: ${fmtInr(calc.collectedInMonth)}${calc.pastDue > 0 ? ` • मागील बाकी: ${fmtInr(calc.pastDue)}` : ""}`;

          return `
            <div class="psb-item ${isPast ? "is-past" : ""}" data-pro-bid="${esc(b.id)}">
              <div class="psb-item-top">
                <div style="min-width:0;">
                  <div class="psb-item-name">${esc(b.name || "ग्राहक")}</div>
                  <div class="psb-item-meta">${subLine}</div>
                </div>
                <div class="psb-item-amt" style="color:${isPast ? "var(--warn)" : "var(--danger)"};">
                  ${fmtInr(amt)}
                  <div style="font-size:0.64rem; color:var(--muted);">एकूण: ${fmtInr(calc.totalPayable)}</div>
                </div>
              </div>
              <div class="psb-acts">
                ${hasMob ? `<a href="tel:${esc(mob)}" style="background:#15803d;">📞 Call</a>` : ""}
                ${hasMob ? `<button type="button" style="background:#0f766e;" data-psb-wa="${esc(b.id)}" data-amt="${calc.totalPayable}">💬 WA</button>` : ""}
                <button type="button" style="background:#6d28d9;" data-psb-qr="${esc(b.id)}" data-amt="${calc.totalPayable}">📱 QR</button>
                <button type="button" style="background:#b45309;" data-psb-pay="${esc(b.id)}">⚡ जमा</button>
                <button type="button" class="primary" data-psb-det="${esc(b.id)}">📋 Details</button>
              </div>
            </div>
          `;
        }).join("")
      : `<div class="muted" style="text-align:center; padding:18px; font-size:0.8rem;">या विभागात सध्या कोणतीही बाकी नाही.</div>`;

    body.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
        <div>
          <h3 style="margin:0; color:var(--danger);">📊 बाकी व्याज विभागणी (${esc(fmtYmMr(d.activeYm))})</h3>
          <div class="muted" style="font-size:0.72rem;">एकूण देय बाकी: <strong style="color:var(--danger);">${fmtInr(d.totalPending)}</strong></div>
        </div>
        <button type="button" id="psbPrintBtn" class="primary sm">🖨️ PDF</button>
      </div>

      <div class="psb-m-tabs">
        <button type="button" class="psb-m-tab ${modalTab === "current" ? "is-active" : ""}" data-psbtab="current">🔴 चालू महिना (${d.currentCount}) • ${fmtInr(d.currentPending)}</button>
        <button type="button" class="psb-m-tab ${modalTab === "past" ? "is-active" : ""}" data-psbtab="past">🟠 मागील महिने (${d.pastCount}) • ${fmtInr(d.pastPending)}</button>
      </div>

      <input type="text" id="psbSearchInp" class="search-pill-box" value="${esc(modalSearch)}" placeholder="🔍 नाव, मोबाईल किंवा जामीनदार शोधा..." style="margin-bottom:8px;" />
      <div style="max-height:54vh; overflow-y:auto;">${cardsHtml}</div>
    `;

    body.querySelectorAll("[data-psbtab]").forEach((btn) => {
      btn.addEventListener("click", () => { modalTab = btn.getAttribute("data-psbtab"); renderSplitModal(); });
    });

    const sInp = document.getElementById("psbSearchInp");
    sInp?.addEventListener("input", () => {
      modalSearch = sInp.value;
      const pos = sInp.selectionStart || modalSearch.length;
      renderSplitModal();
      const next = document.getElementById("psbSearchInp");
      if (next) { next.focus(); next.setSelectionRange(pos, pos); }
    });

    body.querySelectorAll("[data-psb-pay]").forEach((btn) => {
      btn.addEventListener("click", () => jumpToCustomerCard(btn.getAttribute("data-psb-pay")));
    });

    body.querySelectorAll("[data-psb-det]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bid = btn.getAttribute("data-psb-det");
        document.getElementById("proPendingSplitModal")?.classList.add("hidden");
        if (typeof window.openProCustomerDetails === "function") window.openProCustomerDetails(bid);
        else jumpToCustomerCard(bid);
      });
    });

    body.querySelectorAll("[data-psb-qr]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bid = btn.getAttribute("data-psb-qr");
        const amt = Number(btn.getAttribute("data-amt") || 0);
        if (typeof window.openInvoiceReceipt === "function") window.openInvoiceReceipt(bid);
        else if (typeof window.openUpiQr === "function") window.openUpiQr(bid, amt);
      });
    });

    body.querySelectorAll("[data-psb-wa]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bid = btn.getAttribute("data-psb-wa");
        const item = list.find((x) => x.b.id === bid);
        if (!item) return;
        const mob = cleanMob(item.b.mobile);
        const target = mob.length === 10 ? "91" + mob : mob;
        const biz = document.getElementById("tBrandTitle")?.textContent?.trim() || "व्याज हिशोब वही";
        const msg = `नमस्कार *${item.b.name}*,\nआपले ${fmtYmMr(d.activeYm)} चे एकूण बाकी व्याज *₹${Number(item.calc.totalPayable || 0).toLocaleString("en-IN")}* आहे.\nकृपया वेळेवर जमा करावे. धन्यवाद!\n— *${biz}*`;
        window.open(`https://wa.me/${target}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
      });
    });

    document.getElementById("psbPrintBtn")?.addEventListener("click", () => {
      const printArea = document.getElementById("printArea");
      if (!printArea) return;
      const biz = document.getElementById("tBrandTitle")?.textContent?.trim() || "व्याज हिशोब वही";
      const tabTitle = isPast ? "मागील महिने थकीत यादी" : "चालू महिना बाकी यादी";
      const rows = list.map(({ b, calc, amt }, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(b.name || "")}</td>
          <td>${esc(cleanMob(b.mobile) || "-")}</td>
          <td>₹${Number(calc.monthlyInterest || 0).toLocaleString("en-IN")}</td>
          <td>₹${Number(amt || 0).toLocaleString("en-IN")}</td>
          <td>₹${Number(calc.totalPayable || 0).toLocaleString("en-IN")}</td>
        </tr>
      `).join("");
      printArea.innerHTML = `<div style="font-family:system-ui,sans-serif;"><h2>${esc(biz)} — ${tabTitle} (${esc(fmtYmMr(d.activeYm))})</h2><p>एकूण खाती: ${list.length} | एकूण रक्कम: <strong>₹${list.reduce((s, x) => s + x.amt, 0).toLocaleString("en-IN")}</strong></p><table><thead><tr><th>क्र.</th><th>नाव</th><th>मोबाईल</th><th>मासिक व्याज</th><th>या विभागातील बाकी</th><th>एकूण थकबाकी</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      window.print();
    });
  }

  function openPendingSplitModal(tab = "current") {
    modalTab = tab;
    const modal = ensureSplitModal();
    renderSplitModal();
    modal.classList.remove("hidden");
  }

  function renderPendingSplitBar() {
    const wrap = ensurePendingBarContainer();
    if (!wrap) return;

    const d = getPendingSplitData();
    const isHiddenAmt = document.body.classList.contains("hide-amounts");
    const sig = `${d.activeYm}|${d.currentPending}|${d.currentCount}|${d.pastPending}|${d.pastCount}|${d.totalPending}|${d.curPct}|${d.pastPct}|${isHiddenAmt}`;

    // Smart Diff: आकडे बदलले नसतील तर पुन्हा पुसून लिहू नका (०% ब्लिंकिंग)
    if (sig === lastRenderSig && wrap.children.length > 0) return;
    lastRenderSig = sig;

    wrap.innerHTML = `
      <div class="psb-bar-head">
        <span>📊 बाकी व्याज विभागणी <span class="dp-tot-badge">एकूण ${fmtInr(d.totalPending)}</span></span>
        <span>टॅप करून यादी पहा ▸</span>
      </div>
      <div class="psb-grid">
        <div class="psb-tile psb-cur" id="psbOpenCurTile">
          <div class="psb-tile-info">
            <span class="psb-tile-lbl">🔴 चालू महिना बाकी</span>
            <span class="psb-tile-amt" style="color:var(--danger);">${fmtInr(d.currentPending)}</span>
            <span class="psb-tile-sub">${d.currentCount} खाती बाकी ▸</span>
          </div>
          ${buildRingSvg(d.curPct, "#f07178")}
        </div>

        <div class="psb-tile psb-past" id="psbOpenPastTile">
          <div class="psb-tile-info">
            <span class="psb-tile-lbl">🟠 मागील महिने बाकी</span>
            <span class="psb-tile-amt" style="color:var(--warn);">${fmtInr(d.pastPending)}</span>
            <span class="psb-tile-sub">${d.pastCount} खाती थकीत ▸</span>
          </div>
          ${buildRingSvg(d.pastPct, "#e5a952")}
        </div>
      </div>
    `;

    document.getElementById("psbOpenCurTile")?.addEventListener("click", () => openPendingSplitModal("current"));
    document.getElementById("psbOpenPastTile")?.addEventListener("click", () => openPendingSplitModal("past"));
  }

  window.openProPendingSplit = openPendingSplitModal;

  function initPendingSplitBar() {
    injectPendingSplitCss();
    renderPendingSplitBar();

    const listEl = document.getElementById("borrowersList");
    if (listEl) {
      const obs = new MutationObserver(() => {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(renderPendingSplitBar, 240);
      });
      obs.observe(listEl, { childList: true });
    }
    document.getElementById("activeYm")?.addEventListener("change", () => setTimeout(renderPendingSplitBar, 120));
    setTimeout(renderPendingSplitBar, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initPendingSplitBar);
  else initPendingSplitBar();
})();
