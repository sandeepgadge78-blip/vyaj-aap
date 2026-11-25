// व्याज हिशोब वही - VyajKernel Powered Anti-Blink बाकी व्याज विभागणी + Pure White A4 PDF (js/pro/pending-split-bar.js - V15.1)
(function () {
  const RING_CIRC = 113.1;

  let lastRenderSig = "";
  let modalTab = "current"; // current | past
  let modalSearch = "";

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

  function extractSplitFromKernel(kernelReport) {
    const K = window.VyajKernel;
    const r = kernelReport || (K ? K.getMonthReport() : null);
    if (!r) return null;

    const s = r.summary;
    const curList = [];
    const pastList = [];

    (r.rows || []).forEach((row) => {
      if (row.isClosed) return;
      if (row.currentPending > 0) curList.push({ row, amt: row.currentPending });
      if (row.pastDue > 0) pastList.push({ row, amt: row.pastDue });
    });

    curList.sort((a, c) => c.amt - a.amt);
    pastList.sort((a, c) => c.amt - a.amt);

    const curPct = s.expectedInterest > 0 ? Math.min(100, Math.round((s.currentPendingSum / s.expectedInterest) * 100)) : 0;
    const pastPct = s.expectedInterest > 0 ? Math.min(100, Math.round((s.pastPendingSum / s.expectedInterest) * 100)) : 0;

    return {
      activeYm: r.activeYm,
      currentPending: s.currentPendingSum,
      currentCount: s.currentPendingCount,
      pastPending: s.pastPendingSum,
      pastCount: s.pastPendingCount,
      totalPending: s.totalPendingSum,
      curPct,
      pastPct,
      curList,
      pastList
    };
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

  function renderSplitModal(kernelReport) {
    const K = window.VyajKernel;
    const body = document.getElementById("proPendingSplitBody");
    if (!K || !body) return;

    const d = extractSplitFromKernel(kernelReport);
    if (!d) return;

    const isPast = modalTab === "past";
    const baseList = isPast ? d.pastList : d.curList;
    const q = modalSearch.trim().toLowerCase();
    const list = baseList.filter(({ row }) => !q || `${row.name} ${row.mobile} ${row.b?.guarantor || ""}`.toLowerCase().includes(q));

    const cardsHtml = list.length
      ? list.map(({ row, amt }) => {
          const mob = K.cleanMob(row.b?.mobile);
          const hasMob = mob.length >= 10;

          const subLine = isPast
            ? `📅 ${K.esc(row.pastBreakdownText)}`
            : `मासिक व्याज: ${K.fmtInr(row.monthlyInterest)} • जमा: ${K.fmtInr(row.collected)}${row.pastDue > 0 ? ` • मागील बाकी: ${K.fmtInr(row.pastDue)}` : ""}`;

          return `
            <div class="psb-item ${isPast ? "is-past" : ""}" data-pro-bid="${K.esc(row.id)}">
              <div class="psb-item-top">
                <div style="min-width:0;">
                  <div class="psb-item-name">${K.esc(row.name)}</div>
                  <div class="psb-item-meta">${subLine}</div>
                </div>
                <div class="psb-item-amt" style="color:${isPast ? "var(--warn)" : "var(--danger)"};">
                  ${K.fmtInr(amt)}
                  <div style="font-size:0.64rem; color:var(--muted);">एकूण: ${K.fmtInr(row.totalPending)}</div>
                </div>
              </div>
              <div class="psb-acts">
                ${hasMob ? `<a href="tel:${K.esc(mob)}" style="background:#15803d;">📞 Call</a>` : ""}
                ${hasMob ? `<button type="button" style="background:#0f766e;" data-psb-wa="${K.esc(row.id)}">💬 WA</button>` : ""}
                <button type="button" style="background:#6d28d9;" data-psb-qr="${K.esc(row.id)}" data-amt="${row.totalPending}">📱 QR</button>
                <button type="button" style="background:#b45309;" data-psb-pay="${K.esc(row.id)}">⚡ जमा</button>
                <button type="button" class="primary" data-psb-det="${K.esc(row.id)}">📋 Details</button>
              </div>
            </div>
          `;
        }).join("")
      : `<div class="muted" style="text-align:center; padding:18px; font-size:0.8rem;">या विभागात सध्या कोणतीही बाकी नाही.</div>`;

    body.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
        <div>
          <h3 style="margin:0; color:var(--danger);">📊 बाकी व्याज विभागणी (${K.esc(K.fmtYmMr(d.activeYm))})</h3>
          <div class="muted" style="font-size:0.72rem;">एकूण देय बाकी: <strong style="color:var(--danger);">${K.fmtInr(d.totalPending)}</strong></div>
        </div>
        <button type="button" id="psbPrintBtn" class="primary sm">🖨️ PDF</button>
      </div>

      <div class="psb-m-tabs">
        <button type="button" class="psb-m-tab ${modalTab === "current" ? "is-active" : ""}" data-psbtab="current">🔴 चालू महिना (${d.currentCount}) • ${K.fmtInr(d.currentPending)}</button>
        <button type="button" class="psb-m-tab ${modalTab === "past" ? "is-active" : ""}" data-psbtab="past">🟠 मागील महिने (${d.pastCount}) • ${K.fmtInr(d.pastPending)}</button>
      </div>

      <input type="text" id="psbSearchInp" class="search-pill-box" value="${K.esc(modalSearch)}" placeholder="🔍 नाव, मोबाईल किंवा जामीनदार शोधा..." style="margin-bottom:8px;" />
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
        const item = list.find((x) => x.row.id === bid);
        if (!item) return;
        const mob = K.cleanMob(item.row.b?.mobile);
        const target = mob.length === 10 ? "91" + mob : mob;
        const biz = document.getElementById("tBrandTitle")?.textContent?.trim() || "व्याज हिशोब वही";
        const msg = `नमस्कार *${item.row.name}*,\nआपले ${K.fmtYmMr(d.activeYm)} चे एकूण बाकी व्याज *${K.fmtInrPlain(item.row.totalPending)}* आहे.\nकृपया वेळेवर जमा करावे. धन्यवाद!\n— *${biz}*`;
        window.open(`https://wa.me/${target}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
      });
    });

    // Pure White A4 Portrait प्रिंट (० काळे पट्टे, ० कोरी पेजेस)
    document.getElementById("psbPrintBtn")?.addEventListener("click", () => {
      const biz = (document.getElementById("profBizName")?.value || document.getElementById("tBrandTitle")?.textContent || "व्याज हिशोब वही").trim();
      const tabTitle = isPast ? "मागील महिने थकीत यादी" : "चालू महिना बाकी यादी";
      const totalCol = list.reduce((s, x) => s + x.amt, 0);
      const rowsHtml = list.map(({ row, amt }, i) => `
        <tr>
          <td style="text-align:center;">${i + 1}</td>
          <td><strong>${K.esc(row.name)}</strong>${row.mobile !== "-" ? `<span class="pw-mob">${K.esc(row.mobile)}</span>` : ""}</td>
          <td class="pw-num">${K.fmtInrPlain(row.monthlyInterest)}</td>
          <td style="font-size:7.8px;">${K.esc(isPast ? row.pastBreakdownText : `जमा: ${K.fmtInrPlain(row.collected)}`)}</td>
          <td class="pw-num">${K.fmtInrPlain(amt)}</td>
          <td class="pw-num"><strong>${K.fmtInrPlain(row.totalPending)}</strong></td>
        </tr>
      `).join("");

      const html = `
        <div class="pw-head">
          <div><h2 class="pw-title">${K.esc(biz)} — ${tabTitle} (${K.esc(K.fmtYmMr(d.activeYm))})</h2></div>
          <div class="pw-sub">खाती: ${list.length} • रक्कम: ${K.fmtInrPlain(totalCol)}</div>
        </div>
        <table class="pw-tbl">
          <thead>
            <tr>
              <th style="width:20px; text-align:center;">क्र.</th>
              <th>ग्राहक (मोबाईल)</th>
              <th class="pw-num">मासिक व्याज</th>
              <th>तपशील</th>
              <th class="pw-num">विभाग बाकी</th>
              <th class="pw-num">एकूण थकबाकी</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="4">एकूण बेरीज (${list.length} खाती)</td>
              <td class="pw-num">${K.fmtInrPlain(totalCol)}</td>
              <td class="pw-num">${K.fmtInrPlain(list.reduce((s, x) => s + x.row.totalPending, 0))}</td>
            </tr>
          </tfoot>
        </table>
      `;
      K.printPureWhiteA4(html);
    });
  }

  function openPendingSplitModal(tab = "current") {
    modalTab = tab;
    const modal = ensureSplitModal();
    renderSplitModal();
    modal.classList.remove("hidden");
  }

  function renderPendingSplitBar(kernelReport) {
    const K = window.VyajKernel;
    if (!K) return;

    const wrap = ensurePendingBarContainer();
    if (!wrap) return;

    const d = extractSplitFromKernel(kernelReport);
    if (!d) return;

    const isHiddenAmt = document.body.classList.contains("hide-amounts");
    const sig = `${d.activeYm}|${d.currentPending}|${d.currentCount}|${d.pastPending}|${d.pastCount}|${d.totalPending}|${d.curPct}|${d.pastPct}|${isHiddenAmt}`;

    if (sig !== lastRenderSig || !wrap.children.length) {
      lastRenderSig = sig;
      wrap.innerHTML = `
        <div class="psb-bar-head">
          <span>📊 बाकी व्याज विभागणी <span class="dp-tot-badge">एकूण ${K.fmtInr(d.totalPending)}</span></span>
          <span>टॅप करून यादी पहा ▸</span>
        </div>
        <div class="psb-grid">
          <div class="psb-tile psb-cur" id="psbOpenCurTile">
            <div class="psb-tile-info">
              <span class="psb-tile-lbl">🔴 चालू महिना बाकी</span>
              <span class="psb-tile-amt" style="color:var(--danger);">${K.fmtInr(d.currentPending)}</span>
              <span class="psb-tile-sub">${d.currentCount} खाती बाकी ▸</span>
            </div>
            ${buildRingSvg(d.curPct, "#f07178")}
          </div>

          <div class="psb-tile psb-past" id="psbOpenPastTile">
            <div class="psb-tile-info">
              <span class="psb-tile-lbl">🟠 मागील महिने बाकी</span>
              <span class="psb-tile-amt" style="color:var(--warn);">${K.fmtInr(d.pastPending)}</span>
              <span class="psb-tile-sub">${d.pastCount} खाती थकीत ▸</span>
            </div>
            ${buildRingSvg(d.pastPct, "#e5a952")}
          </div>
        </div>
      `;

      document.getElementById("psbOpenCurTile")?.addEventListener("click", () => openPendingSplitModal("current"));
      document.getElementById("psbOpenPastTile")?.addEventListener("click", () => openPendingSplitModal("past"));
    }

    // जर पॉपअप आधीच उघडे असेल तर तेही शांतपणे अपडेट करा
    const modal = document.getElementById("proPendingSplitModal");
    if (modal && !modal.classList.contains("hidden")) {
      renderSplitModal(kernelReport);
    }
  }

  window.openProPendingSplit = openPendingSplitModal;

  function initPendingSplitBar() {
    injectPendingSplitCss();

    // स्वतंत्र MutationObserver ऐवजी फक्त VyajKernel च्या एकाच सिग्नलवर subscribe करा
    if (window.VyajKernel && typeof window.VyajKernel.subscribe === "function") {
      window.VyajKernel.subscribe(renderPendingSplitBar);
    }

    document.addEventListener("click", (ev) => {
      if (ev.target && ev.target.closest("#toggleHideAmtBtn, #setToggleHideBtn")) {
        setTimeout(() => renderPendingSplitBar(), 80);
      }
    });

    renderPendingSplitBar();
    setTimeout(() => renderPendingSplitBar(), 1100);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initPendingSplitBar);
  else initPendingSplitBar();
})();
