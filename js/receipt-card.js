// व्याज हिशोब वही - Business Pro Invoice पावती + ऑटो UPI QR कोड + PNG/PDF/WhatsApp (js/receipt-card.js - V14.22)
(function () {
  const MARATHI_MONTHS = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];
  let currentReceiptCtx = null;

  function esc(str) {
    return String(str || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function formatMonthMr(ym) {
    if (!ym || !String(ym).includes("-")) return String(ym || "");
    const [y, m] = String(ym).split("-");
    return `${MARATHI_MONTHS[parseInt(m, 10) - 1] || m} ${y}`;
  }

  function todayFormatted() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }

  function getBizBranding() {
    const bizName = document.getElementById("profBizName")?.value?.trim() || localStorage.getItem("vyaj_biz_name") || "व्याज हिशोब वही";
    const ownerName = document.getElementById("profOwnerName")?.value?.trim() || localStorage.getItem("vyaj_owner_name") || "";
    const bizMobile = document.getElementById("profMobile")?.value?.trim() || localStorage.getItem("vyaj_biz_mobile") || "";
    const upiId = document.getElementById("profUpiId")?.value?.trim() ||
      document.getElementById("selfUpiId")?.value?.trim() ||
      localStorage.getItem("vyaj_upi_id") || "";
    return { bizName, ownerName, bizMobile, upiId };
  }

  function buildUpiQrUrl(upiId, bizName, amount, note) {
    if (!upiId) return "";
    const amtParam = Number(amount || 0) > 0 ? `&am=${Math.round(Number(amount))}` : "";
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(bizName || "Vyaj Hishob")}${amtParam}&cu=INR&tn=${encodeURIComponent(note || "Interest Payment")}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=6&data=${encodeURIComponent(upiUri)}`;
  }

  // Invoice पावती Modal तयार करा
  function ensureInvoiceModal() {
    let modal = document.getElementById("proInvoiceModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "proInvoiceModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `
      <div class="modal-card" style="max-width:470px; padding:14px;">
        <div class="row" style="justify-content:space-between; margin-bottom:10px;">
          <h3 style="margin:0; font-size:0.96rem; color:var(--text);">🧾 डिजिटल Invoice पावती</h3>
          <span class="badge paid">QR Ready</span>
        </div>

        <div id="proInvoicePaper" class="inv-paper"></div>

        <div class="row" style="margin-top:12px; gap:8px;">
          <button type="button" id="invDownloadPngBtn" class="primary" style="flex:1;">📥 फोटो (PNG)</button>
          <button type="button" id="invPrintPdfBtn" class="success" style="flex:1;">🖨️ PDF / प्रिंट</button>
          <button type="button" id="invShareWaBtn" class="warn" style="flex:1;">💬 WhatsApp</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("proInvoiceModal");
      }
    });

    document.getElementById("invDownloadPngBtn")?.addEventListener("click", downloadInvoicePng);
    document.getElementById("invPrintPdfBtn")?.addEventListener("click", printInvoicePdf);
    document.getElementById("invShareWaBtn")?.addEventListener("click", shareInvoiceWhatsApp);

    return modal;
  }

  // विशिष्ट ग्राहकाची Invoice पावती उघडा
  function openInvoiceReceipt(borrowerId) {
    if (!window.HishobBridge) return;
    const borrowers = window.HishobBridge.getBorrowers() || [];
    const b = borrowers.find((x) => x.id === borrowerId);
    if (!b) return;

    const activeYm = document.getElementById("activeYm")?.value || new Date().toISOString().slice(0, 7);
    const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
    const brand = getBizBranding();

    const principal = Number(b.principal || 0);
    const monthlyInt = Number(calc.monthlyInterest || 0);
    const paidThisMonth = Number(calc.collectedInMonth || 0);
    const pendingAmt = Math.max(0, Number(calc.totalPayable || 0));

    let statusText = "PENDING (बाकी)";
    let statusClass = "inv-stamp-pending";
    if (pendingAmt <= 0 && paidThisMonth > 0) {
      statusText = "PAID (पूर्ण जमा)";
      statusClass = "inv-stamp-paid";
    } else if (paidThisMonth > 0 && pendingAmt > 0) {
      statusText = "PARTIAL (अर्धवट)";
      statusClass = "inv-stamp-partial";
    }

    const invNo = `INV-${activeYm.replace("-", "")}-${String(b.id || "001").slice(-4).toUpperCase()}`;
    const qrAmount = pendingAmt > 0 ? pendingAmt : monthlyInt;
    const qrUrl = buildUpiQrUrl(brand.upiId, brand.bizName, qrAmount, `${b.name} ${activeYm}`);

    currentReceiptCtx = {
      b, calc, brand, activeYm, principal, monthlyInt, paidThisMonth, pendingAmt,
      statusText, statusClass, invNo, qrAmount, qrUrl, dateStr: todayFormatted()
    };

    const modal = ensureInvoiceModal();
    const paper = document.getElementById("proInvoicePaper");
    if (paper) {
      paper.innerHTML = `
        <div class="inv-head">
          <div>
            <div class="inv-biz">${esc(brand.bizName)}</div>
            ${brand.ownerName ? `<div class="inv-owner">${esc(brand.ownerName)}${brand.bizMobile ? " • " + esc(brand.bizMobile) : ""}</div>` : ""}
          </div>
          <div style="text-align:right;">
            <div class="inv-no">#${esc(invNo)}</div>
            <div class="inv-dt">${esc(currentReceiptCtx.dateStr)}</div>
          </div>
        </div>

        <div class="inv-cust-row">
          <div>
            <div class="inv-lbl">ग्राहक नाव</div>
            <div class="inv-cust-name">${esc(b.name)}</div>
            ${b.mobile ? `<div class="inv-sub">📞 ${esc(b.mobile)}</div>` : ""}
          </div>
          <div style="text-align:right;">
            <div class="inv-lbl">खातेवही महिना</div>
            <div class="inv-cust-name">${esc(formatMonthMr(activeYm))}</div>
          </div>
        </div>

        <table class="inv-table">
          <thead>
            <tr><th>तपशील</th><th style="text-align:right;">रक्कम (₹)</th></tr>
          </thead>
          <tbody>
            <tr><td>चालू मुद्दल (Principal)</td><td style="text-align:right; font-weight:700;">₹${principal.toLocaleString("en-IN")}</td></tr>
            <tr><td>मासिक व्याज (Monthly Interest)</td><td style="text-align:right; font-weight:700;">₹${monthlyInt.toLocaleString("en-IN")}</td></tr>
            <tr><td>या महिन्यात जमा व्याज</td><td style="text-align:right; font-weight:800; color:#15803d;">₹${paidThisMonth.toLocaleString("en-IN")}</td></tr>
            <tr class="inv-total-row">
              <td>एकूण बाकी रक्कम (Pending)</td>
              <td style="text-align:right; color:${pendingAmt > 0 ? "#be123c" : "#15803d"};">₹${pendingAmt.toLocaleString("en-IN")}</td>
            </tr>
          </tbody>
        </table>

        <div class="inv-foot">
          <div class="inv-qr-box">
            ${qrUrl
              ? `<img src="${esc(qrUrl)}" alt="UPI QR" crossorigin="anonymous" /><div class="inv-upi-txt">UPI: ${esc(brand.upiId)}</div>`
              : `<div class="inv-no-upi">UPI QR साठी प्रोफाईलमध्ये<br/>UPI ID सेव्ह करा</div>`}
          </div>
          <div class="inv-stamp-col">
            <div class="inv-stamp ${statusClass}">${esc(statusText)}</div>
            <div class="inv-sign-note">डिजिटल पावती • व्याज हिशोब वही</div>
          </div>
        </div>
      `;
    }

    modal.classList.remove("hidden");
  }

  // Canvas वरून PNG फोटो तयार करून डाउनलोड करा
  async function downloadInvoicePng() {
    if (!currentReceiptCtx) return;
    const c = currentReceiptCtx;
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 960;
    const ctx = canvas.getContext("2d");

    // पांढरा स्वच्छ बॅकग्राउंड
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // वरची गडद पट्टी
    ctx.fillStyle = "#181b22";
    ctx.fillRect(0, 0, canvas.width, 150);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px system-ui, sans-serif";
    ctx.fillText(c.brand.bizName, 36, 68);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "18px system-ui, sans-serif";
    const ownerLine = [c.brand.ownerName, c.brand.bizMobile].filter(Boolean).join(" • ");
    if (ownerLine) ctx.fillText(ownerLine, 36, 104);

    ctx.textAlign = "right";
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 18px system-ui, sans-serif";
    ctx.fillText("#" + c.invNo, 684, 66);
    ctx.fillText("तारीख: " + c.dateStr, 684, 102);
    ctx.textAlign = "left";

    // ग्राहक माहिती
    ctx.fillStyle = "#64748b";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("ग्राहक नाव:", 36, 200);
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.fillText(c.b.name || "-", 36, 236);

    ctx.textAlign = "right";
    ctx.fillStyle = "#64748b";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("महिना:", 684, 200);
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 24px system-ui, sans-serif";
    ctx.fillText(formatMonthMr(c.activeYm), 684, 236);
    ctx.textAlign = "left";

    // तक्ता
    const rows = [
      ["चालू मुद्दल (Principal)", `₹${c.principal.toLocaleString("en-IN")}`, "#0f172a"],
      ["मासिक व्याज (Monthly Interest)", `₹${c.monthlyInt.toLocaleString("en-IN")}`, "#0f172a"],
      ["या महिन्यात जमा व्याज", `₹${c.paidThisMonth.toLocaleString("en-IN")}`, "#15803d"],
      ["एकूण बाकी रक्कम (Pending)", `₹${c.pendingAmt.toLocaleString("en-IN")}`, c.pendingAmt > 0 ? "#be123c" : "#15803d"]
    ];

    let y = 300;
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    rows.forEach(([lbl, val, col], idx) => {
      if (idx === 3) {
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(36, y - 34, 648, 56);
      }
      ctx.fillStyle = "#334155";
      ctx.font = idx === 3 ? "bold 23px system-ui, sans-serif" : "21px system-ui, sans-serif";
      ctx.fillText(lbl, 48, y);

      ctx.textAlign = "right";
      ctx.fillStyle = col;
      ctx.font = "bold 25px system-ui, sans-serif";
      ctx.fillText(val, 672, y);
      ctx.textAlign = "left";

      ctx.beginPath();
      ctx.moveTo(36, y + 22);
      ctx.lineTo(684, y + 22);
      ctx.stroke();
      y += 74;
    });

    // स्टेटस शिक्का
    const stampCol = c.pendingAmt <= 0 && c.paidThisMonth > 0 ? "#15803d" : c.paidThisMonth > 0 ? "#b45309" : "#be123c";
    ctx.strokeStyle = stampCol;
    ctx.lineWidth = 3;
    ctx.strokeRect(400, 660, 280, 62);
    ctx.fillStyle = stampCol;
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(c.statusText, 540, 699);

    ctx.fillStyle = "#64748b";
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillText("डिजिटल पावती • व्याज हिशोब वही", 540, 756);
    ctx.textAlign = "left";

    // QR इमेज काढण्याचा प्रयत्न करा
    const finishDownload = () => {
      try {
        const a = document.createElement("a");
        a.download = `Pavati_${(c.b.name || "Customer").replace(/\s+/g, "_")}_${c.activeYm}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
      } catch (_) {
        alert("PNG सेव्ह करताना अडचण आली; कृपया '🖨️ PDF / प्रिंट' वापरा.");
      }
    };

    if (c.qrUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.drawImage(img, 48, 635, 190, 190);
        ctx.fillStyle = "#334155";
        ctx.font = "bold 16px system-ui, sans-serif";
        ctx.fillText("UPI: " + c.brand.upiId, 48, 852);
        finishDownload();
      };
      img.onerror = () => finishDownload();
      img.src = c.qrUrl;
    } else {
      finishDownload();
    }
  }

  function printInvoicePdf() {
    const paper = document.getElementById("proInvoicePaper");
    const printArea = document.getElementById("printArea");
    if (!paper || !printArea) return;
    printArea.innerHTML = `<div style="max-width:540px; margin:0 auto; font-family:system-ui,sans-serif;">${paper.innerHTML}</div>`;
    window.print();
  }

  function shareInvoiceWhatsApp() {
    if (!currentReceiptCtx) return;
    const c = currentReceiptCtx;
    const clean = String(c.b.mobile || "").replace(/\D/g, "");
    const target = clean.length === 10 ? "91" + clean : clean;
    const lines = [
      `*${c.brand.bizName}* — डिजिटल पावती`,
      `पावती क्र.: #${c.invNo} | तारीख: ${c.dateStr}`,
      `ग्राहक: *${c.b.name}*`,
      `महिना: ${formatMonthMr(c.activeYm)}`,
      `-------------------------`,
      `मुद्दल: ₹${c.principal.toLocaleString("en-IN")}`,
      `मासिक व्याज: ₹${c.monthlyInt.toLocaleString("en-IN")}`,
      `जमा व्याज: ₹${c.paidThisMonth.toLocaleString("en-IN")}`,
      `एकूण बाकी: *₹${c.pendingAmt.toLocaleString("en-IN")}*`,
      `स्थिती: ${c.statusText}`,
      c.brand.upiId ? `UPI ID: ${c.brand.upiId}` : "",
      `धन्यवाद!`
    ].filter(Boolean).join("\n");

    const url = target.length >= 10
      ? `https://wa.me/${target}?text=${encodeURIComponent(lines)}`
      : `https://wa.me/?text=${encodeURIComponent(lines)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // प्रत्येक ग्राहक कार्डवर '🧾 पावती' बटण जोडा (सिंगल-लाईन अ‍ॅक्शन स्ट्रिपमध्ये)
  function injectReceiptButtons() {
    if (!window.HishobBridge) return;
    const listEl = document.getElementById("borrowersList");
    if (!listEl) return;

    const borrowers = window.HishobBridge.getBorrowers() || [];
    listEl.querySelectorAll(".borrower-item").forEach((card) => {
      if (card.querySelector("[data-pro-invoice-btn]")) return;

      const bId = card.getAttribute("data-id") || card.getAttribute("data-bid") || (() => {
        const nameEl = card.querySelector("strong, h4, h3");
        const nm = (nameEl?.textContent || "").trim();
        const found = borrowers.find((x) => String(x.name || "").trim() === nm);
        return found ? found.id : "";
      })();
      if (!bId) return;

      const strip = card.querySelector(".pro-action-strip") || card.querySelector(".row:last-of-type");
      if (!strip) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "primary sm";
      btn.setAttribute("data-pro-invoice-btn", bId);
      btn.textContent = "🧾 पावती";
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openInvoiceReceipt(bId);
      });
      strip.appendChild(btn);
    });
  }

  window.openInvoiceReceipt = openInvoiceReceipt;
  window.openReceiptCard = openInvoiceReceipt;

  // जर reminders.js ने openUpiQr मागितले आणि ते नसेल, तर Invoice QR उघडा
  if (typeof window.openUpiQr !== "function") {
    window.openUpiQr = function (bId) {
      openInvoiceReceipt(bId);
    };
  }

  function initReceipts() {
    const listEl = document.getElementById("borrowersList");
    if (listEl) {
      const obs = new MutationObserver(() => setTimeout(injectReceiptButtons, 40));
      obs.observe(listEl, { childList: true, subtree: true });
    }
    setTimeout(injectReceiptButtons, 1700);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initReceipts);
  } else {
    initReceipts();
  }
})();
