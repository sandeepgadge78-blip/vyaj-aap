// व्याज हिशोब वही - ब्रँडेड WhatsApp पावती कार्ड + मागील बाकी महिन्यांची नावे (js/receipt-card.js - V14.13)
(function () {
  const MARATHI_MONTHS = [
    "जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून",
    "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"
  ];

  const MARATHI_SHORT_MONTHS = [
    "जाने", "फेब्रु", "मार्च", "एप्रि", "मे", "जून",
    "जुलै", "ऑग", "सप्टें", "ऑक्टो", "नोव्हें", "डिसें"
  ];

  let lastGeneratedBlob = null;
  let lastGeneratedFileName = "vyaj-pavati.png";

  function formatMonthMr(ym, short = false) {
    if (!ym || !String(ym).includes("-")) return String(ym || "");
    const [y, m] = String(ym).split("-");
    const idx = parseInt(m, 10) - 1;
    const arr = short ? MARATHI_SHORT_MONTHS : MARATHI_MONTHS;
    return `${arr[idx] || m} ${y}`;
  }

  function formatRs(val) {
    return `₹${Number(val || 0).toLocaleString("en-IN")}`;
  }

  function getTodayFormatted() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  }

  function getBizProfile() {
    try {
      const p = JSON.parse(localStorage.getItem("hishob_biz_profile") || "{}");
      return {
        bizName: (p.bizName || "").trim() || "व्याज हिशोब वही",
        ownerName: (p.ownerName || "").trim(),
        mobile: (p.mobile || "").trim()
      };
    } catch (_) {
      return { bizName: "व्याज हिशोब वही", ownerName: "", mobile: "" };
    }
  }

  // मागील बाकी महिन्यांची यादी काढा (extract pending past month names before activeYm)
  function getPastPendingMonthNames(borrower, calc, activeYm) {
    if (!calc || Number(calc.pastDue || 0) <= 0) return [];

    // १. जर calc ऑब्जेक्टमध्ये आधीच बाकी महिन्यांची यादी असेल तर ती वापरा
    const rawList =
      calc.pastPendingMonths ||
      calc.pendingPastMonths ||
      calc.unpaidMonths ||
      calc.pendingMonths ||
      null;

    if (Array.isArray(rawList) && rawList.length > 0) {
      const names = rawList
        .map((item) => {
          if (typeof item === "string") return item < activeYm ? formatMonthMr(item, true) : null;
          if (item && item.ym && item.ym < activeYm) return formatMonthMr(item.ym, true);
          return null;
        })
        .filter(Boolean);
      if (names.length > 0) return names;
    }

    // २. नसेल तर activeYm च्या आधीच्या महिन्यांचा अंदाज काढा (fallback calculation)
    const monthlyInt = Number(calc.monthlyInterest || 0);
    const pastDue = Number(calc.pastDue || 0);
    if (monthlyInt <= 0 || !activeYm || !activeYm.includes("-")) return [];

    const approxCount = Math.min(12, Math.max(1, Math.ceil(pastDue / monthlyInt)));
    let [y, m] = activeYm.split("-").map(Number);
    const startYm = borrower && borrower.startYm ? String(borrower.startYm) : "";
    const result = [];

    for (let i = 0; i < approxCount; i++) {
      m -= 1;
      if (m <= 0) {
        m = 12;
        y -= 1;
      }
      const ymStr = `${y}-${String(m).padStart(2, "0")}`;
      if (startYm && ymStr < startYm) break;
      result.unshift(formatMonthMr(ymStr, true));
    }
    return result;
  }

  // गोल कोपऱ्याचा चौकोन काढण्यासाठी मदत (helper to draw rounded rect on canvas)
  function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Canvas वर प्रोफेशनल ब्रँडेड पावती तयार करा (generate HD branded receipt PNG)
  function generateReceiptCanvas(borrower, calc, activeYm) {
    const pastMonthNames = getPastPendingMonthNames(borrower, calc, activeYm);
    const hasPastNames = pastMonthNames.length > 0;

    const canvas = document.createElement("canvas");
    const W = 800;
    const H = hasPastNames ? 1040 : 980;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    const prof = getBizProfile();
    const monthLabel = formatMonthMr(activeYm);
    const todayStr = getTodayFormatted();
    const receiptNo = `VH-${String(Date.now()).slice(-6)}`;

    // १. पार्श्वभूमी (Clean Premium Off-White Paper Background)
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, W, H);

    // बाहेरील बॉर्डर (Outer Card Frame)
    ctx.fillStyle = "#ffffff";
    drawRoundRect(ctx, 28, 28, W - 56, H - 56, 24);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#cbd5e1";
    ctx.stroke();

    // २. वरचा ब्रँडेड हेडर (Navy-Teal Gradient Header)
    const grad = ctx.createLinearGradient(28, 28, W - 28, 220);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(0.6, "#1e293b");
    grad.addColorStop(1, "#0369a1");
    ctx.fillStyle = grad;
    drawRoundRect(ctx, 28, 28, W - 56, 195, 24);
    ctx.fill();
    ctx.fillRect(28, 195, W - 56, 28);

    // व्यवसायाचे नाव (Auto-Branding)
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 40px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(prof.bizName, W / 2, 102);

    // मालकाचे नाव व मोबाईल
    const subLine = [prof.ownerName, prof.mobile ? `📞 ${prof.mobile}` : ""].filter(Boolean).join("  •  ");
    if (subLine) {
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "600 22px system-ui, -apple-system, sans-serif";
      ctx.fillText(subLine, W / 2, 142);
    }

    // पावती टायटल पिल (Official Receipt Pill)
    ctx.fillStyle = "rgba(56, 189, 248, 0.22)";
    drawRoundRect(ctx, W / 2 - 190, 162, 380, 42, 21);
    ctx.fill();
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 21px system-ui, -apple-system, sans-serif";
    ctx.fillText("🧾 अधिकृत व्याज पावती (RECEIPT)", W / 2, 190);

    // ३. पावती क्रमांक व दिनांक (Receipt No & Date)
    ctx.textAlign = "left";
    ctx.fillStyle = "#475569";
    ctx.font = "600 22px system-ui, -apple-system, sans-serif";
    ctx.fillText(`पावती क्र.: ${receiptNo}`, 62, 268);

    ctx.textAlign = "right";
    ctx.fillText(`दिनांक: ${todayStr}`, W - 62, 268);

    // विभाजक रेषा
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 290);
    ctx.lineTo(W - 60, 290);
    ctx.stroke();

    // ४. ग्राहकाचा तपशील बॉक्स (Customer Info Box)
    ctx.fillStyle = "#f1f5f9";
    drawRoundRect(ctx, 60, 312, W - 120, 128, 16);
    ctx.fill();

    ctx.textAlign = "left";
    ctx.fillStyle = "#64748b";
    ctx.font = "600 20px system-ui, -apple-system, sans-serif";
    ctx.fillText("ग्राहकाचे नाव:", 86, 350);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 32px system-ui, -apple-system, sans-serif";
    ctx.fillText(String(borrower.name || "ग्राहक").slice(0, 32), 86, 392);

    ctx.fillStyle = "#475569";
    ctx.font = "600 21px system-ui, -apple-system, sans-serif";
    ctx.fillText(`मोबाईल: ${borrower.mobile || "-"}`, 86, 426);

    ctx.textAlign = "right";
    ctx.fillStyle = "#0284c7";
    ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
    ctx.fillText(`महिना: ${monthLabel}`, W - 86, 426);

    // ५. आर्थिक तपशील तक्ता (Financial Summary Table)
    const rows = [
      { label: "एकूण मुद्दल (Principal)", val: formatRs(calc.principal), color: "#0f172a" },
      { label: `मासिक व्याज (${Number(borrower.rate || 0)}% दराने)`, val: formatRs(calc.monthlyInterest), color: "#0369a1" },
      { label: `${monthLabel} — जमा रक्कम`, val: formatRs(calc.paidThisMonth), color: "#059669", bold: true },
      { label: "मागील बाकी व्याज", val: formatRs(calc.pastDue), color: calc.pastDue > 0 ? "#dc2626" : "#475569", isPastRow: true }
    ];

    let yPos = 476;
    rows.forEach((row) => {
      const boxH = row.isPastRow && hasPastNames ? 96 : 62;

      ctx.fillStyle = row.isPastRow && hasPastNames ? "#fff1f2" : "#ffffff";
      drawRoundRect(ctx, 60, yPos, W - 120, boxH, 12);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = row.isPastRow && hasPastNames ? "#fecdd3" : "#e2e8f0";
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "#334155";
      ctx.font = "600 23px system-ui, -apple-system, sans-serif";
      ctx.fillText(row.label, 84, yPos + 39);

      ctx.textAlign = "right";
      ctx.fillStyle = row.color;
      ctx.font = `${row.bold ? "900" : "bold"} 26px system-ui, -apple-system, sans-serif`;
      ctx.fillText(row.val, W - 84, yPos + 40);

      // मागील बाकी महिन्यांची नावे दाखवा (show pending past month names)
      if (row.isPastRow && hasPastNames) {
        const monthsText = `बाकी महिने: ${pastMonthNames.join(", ")}`;
        const trimmed = monthsText.length > 58 ? monthsText.slice(0, 55) + "..." : monthsText;
        ctx.textAlign = "left";
        ctx.fillStyle = "#be123c";
        ctx.font = "600 19px system-ui, -apple-system, sans-serif";
        ctx.fillText(trimmed, 84, yPos + 74);
      }

      yPos += boxH + 12;
    });

    // ६. एकूण बाकी / स्थिती हायलाईट बॉक्स (Total Pending & Status Box)
    const isPaid = calc.totalPayable <= 0;
    ctx.fillStyle = isPaid ? "#dcfce7" : "#fee2e2";
    drawRoundRect(ctx, 60, yPos + 8, W - 120, 88, 16);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = isPaid ? "#16a34a" : "#ef4444";
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = isPaid ? "#166534" : "#991b1b";
    ctx.font = "bold 25px system-ui, -apple-system, sans-serif";
    ctx.fillText(isPaid ? "✅ स्थिती: संपूर्ण हिशोब जमा" : "⚠️ एकूण देय बाकी रक्कम:", 86, yPos + 61);

    ctx.textAlign = "right";
    ctx.font = "900 34px system-ui, -apple-system, sans-serif";
    ctx.fillText(isPaid ? "₹0" : formatRs(calc.totalPayable), W - 86, yPos + 63);

    // ७. फूटर (Thank You & Digital Verification Footer)
    ctx.textAlign = "center";
    ctx.fillStyle = "#64748b";
    ctx.font = "600 20px system-ui, -apple-system, sans-serif";
    ctx.fillText("वेळेवर सहकार्य केल्याबद्दल धन्यवाद!", W / 2, H - 82);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 17px system-ui, -apple-system, sans-serif";
    ctx.fillText(`ही संगणकीकृत डिजिटल पावती आहे • ${prof.bizName}`, W / 2, H - 50);

    return canvas;
  }

  // पावती प्रीव्ह्यू पॉपअप तयार करा (create Receipt Preview Modal)
  function ensureReceiptModal() {
    let modal = document.getElementById("brandedReceiptModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "brandedReceiptModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `
      <div class="modal-card" style="max-width:520px; text-align:center;">
        <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
          <h3 style="margin:0; color:var(--accent);">🧾 ब्रँडेड पावती कार्ड</h3>
          <button type="button" id="closeBrandedReceiptBtn" class="danger sm">✕ बंद</button>
        </div>
        <div style="background:var(--meta-bg); padding:10px; border-radius:12px; border:1px solid var(--border);">
          <img id="brandedReceiptPreviewImg" alt="पावती फोटो" style="width:100%; max-width:420px; border-radius:10px; box-shadow:0 6px 20px rgba(0,0,0,0.4);" />
        </div>
        <div class="row" style="margin-top:12px; justify-content:center; gap:8px;">
          <button type="button" id="shareBrandedReceiptBtn" class="success" style="flex:1; min-width:160px;">📲 WhatsApp / Share करा</button>
          <button type="button" id="downloadBrandedReceiptBtn" class="primary" style="flex:1; min-width:140px;">⬇️ फोटो सेव्ह करा</button>
        </div>
        <div id="brandedReceiptStatus" class="muted" style="margin-top:8px; font-size:0.8rem;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });

    document.getElementById("closeBrandedReceiptBtn").addEventListener("click", () => {
      modal.classList.add("hidden");
    });

    // फोटो डाउनलोड करा (download PNG)
    document.getElementById("downloadBrandedReceiptBtn").addEventListener("click", () => {
      if (!lastGeneratedBlob) return;
      const url = URL.createObjectURL(lastGeneratedBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = lastGeneratedFileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      const st = document.getElementById("brandedReceiptStatus");
      if (st) st.textContent = "✅ पावती फोटो तुमच्या फोनमध्ये सेव्ह झाला!";
    });

    // थेट WhatsApp / Mobile Share करा (Web Share API with file)
    document.getElementById("shareBrandedReceiptBtn").addEventListener("click", async () => {
      const st = document.getElementById("brandedReceiptStatus");
      if (!lastGeneratedBlob) return;
      try {
        const file = new File([lastGeneratedBlob], lastGeneratedFileName, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: "अधिकृत व्याज पावती",
            text: "आपली व्याज हिशोब पावती पहा.",
            files: [file]
          });
          if (st) st.textContent = "✅ पावती शेअर केली!";
          return;
        }
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
      document.getElementById("downloadBrandedReceiptBtn").click();
      if (st) st.textContent = "फोटो सेव्ह झाला आहे — आता तो WhatsApp वर पाठवा.";
    });

    return modal;
  }

  // पावती तयार करून पॉपअपमध्ये दाखवा (open receipt preview for borrower)
  function openBrandedReceipt(borrowerId) {
    if (!window.HishobBridge) return;
    const borrowers = window.HishobBridge.getBorrowers() || [];
    const borrower = borrowers.find((x) => x.id === borrowerId);
    if (!borrower) return;

    const activeYm = (document.getElementById("activeYm") && document.getElementById("activeYm").value) || new Date().toISOString().slice(0, 7);
    const calc = window.HishobBridge.computeLedgerUpToMonth(borrower, activeYm);

    const canvas = generateReceiptCanvas(borrower, calc, activeYm);
    const modal = ensureReceiptModal();
    const imgEl = document.getElementById("brandedReceiptPreviewImg");
    const st = document.getElementById("brandedReceiptStatus");
    if (st) st.textContent = "";

    const safeName = String(borrower.name || "customer").replace(/[^a-zA-Z0-9\u0900-\u097F]+/g, "_").slice(0, 24);
    lastGeneratedFileName = `pavati_${safeName}_${activeYm}.png`;

    imgEl.src = canvas.toDataURL("image/png");
    canvas.toBlob((blob) => {
      lastGeneratedBlob = blob;
    }, "image/png");

    modal.classList.remove("hidden");
    try { history.pushState({ hishobOverlay: "brandedReceiptModal" }, ""); } catch (_) {}
  }

  // प्रत्येक ग्राहकाच्या कार्डमध्ये '💬 ग्राहक WA' शेजारी '🧾 पावती फोटो' बटण जोडा
  function injectReceiptButtons() {
    const waBtns = document.querySelectorAll('#borrowersList button[data-action="wa-receipt"]');
    waBtns.forEach((waBtn) => {
      const parent = waBtn.parentElement;
      if (!parent || parent.querySelector('button[data-branded-receipt]')) return;

      const bId = waBtn.getAttribute("data-id");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sc-btn-teal sm";
      btn.setAttribute("data-branded-receipt", bId);
      btn.textContent = "🧾 पावती फोटो";
      btn.style.marginLeft = "5px";

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openBrandedReceipt(bId);
      });

      waBtn.insertAdjacentElement("afterend", btn);
    });
  }

  window.openBrandedReceiptCard = openBrandedReceipt;

  function initReceiptCard() {
    const listEl = document.getElementById("borrowersList");
    if (listEl) {
      const obs = new MutationObserver(() => injectReceiptButtons());
      obs.observe(listEl, { childList: true, subtree: true });
    }
    setTimeout(injectReceiptButtons, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initReceiptCard);
  } else {
    initReceiptCard();
  }
})();
