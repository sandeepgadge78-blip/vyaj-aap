// व्याज हिशोब वही - स्वतंत्र व्याज अंदाज कॅल्क्युलेटर (Strict Date Validation + Daily/Monthly/Yearly Actual/365 + Zero DB Writes) (js/pro/interest-preview.js - V16.0)
(function () {
  function injectPreviewCss() {
    if (document.getElementById("vyajInterestPreviewCss")) return;
    const st = document.createElement("style");
    st.id = "vyajInterestPreviewCss";
    st.textContent = `
      .ip-hero-btn {
        background: linear-gradient(135deg, #0f766e, #0d9488) !important;
        border: 1px solid rgba(94, 234, 212, 0.45) !important;
        color: #fff !important;
        font-weight: 800 !important;
      }
      .ip-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 10px; }
      @media (max-width: 440px) { .ip-grid { grid-template-columns: 1fr; } }
      .ip-mode-tabs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 10px; }
      .ip-mode-btn {
        padding: 7px 6px !important; font-size: 0.74rem !important; font-weight: 800 !important;
        border-radius: 10px !important; background: var(--meta-bg) !important; color: var(--text) !important;
      }
      .ip-mode-btn.is-active { background: #eceff4 !important; color: #090a0d !important; border-color: #eceff4 !important; }
      body.light-mode .ip-mode-btn.is-active { background: #1f242d !important; color: #fbfaf7 !important; }
      .ip-result-box {
        padding: 11px; border-radius: 12px; margin-top: 10px;
        background: var(--meta-bg); border: 1px solid rgba(125, 211, 252, 0.35);
      }
      .ip-res-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 0.84rem; border-bottom: 1px dashed var(--border); }
      .ip-res-row:last-child { border-bottom: none; }
      .ip-err-box {
        padding: 9px 10px; border-radius: 10px; margin-top: 9px;
        background: rgba(159, 18, 57, 0.22); border: 1px solid var(--danger); color: #fecdd3; font-size: 0.8rem; font-weight: 700;
      }
      body.light-mode .ip-err-box { color: #9f1239; background: #ffe4e6; }
    `;
    document.head.appendChild(st);
  }

  function ensurePreviewModal() {
    let modal = document.getElementById("proInterestPreviewModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "proInterestPreviewModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `<div class="modal-card" style="max-width:560px;" id="proInterestPreviewBody"></div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("proInterestPreviewModal");
      }
    });
    return modal;
  }

  let calcMode = "dates"; // dates | duration
  let lastQuoteText = "";

  function renderPreviewModal() {
    const body = document.getElementById("proInterestPreviewBody");
    const L = window.VyajLedgerV16;
    if (!body || !L) return;

    const todayIso = L.getIstTodayIso();
    const parts = L.getIstParts();
    const nextMonthY = parts.month === 12 ? parts.year + 1 : parts.year;
    const nextMonthM = parts.month === 12 ? 1 : parts.month + 1;
    const nextMonthD = Math.min(parts.day, L.daysInMonth(nextMonthY, nextMonthM));
    const defaultEndIso = `${nextMonthY}-${String(nextMonthM).padStart(2, "0")}-${String(nextMonthD).padStart(2, "0")}`;

    body.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
        <div>
          <h3 style="margin:0; color:var(--accent);">🧮 स्वतंत्र व्याज अंदाज कॅल्क्युलेटर</h3>
          <div class="muted" style="font-size:0.71rem;">खात्यात नोंद न करता अचूक BigInt कोटेशन (IST • लीप वर्ष अचूक)</div>
        </div>
        <span class="badge paid">BigInt V16</span>
      </div>

      <div class="ip-mode-tabs">
        <button type="button" class="ip-mode-btn ${calcMode === "dates" ? "is-active" : ""}" data-ipmode="dates">📅 तारखांनुसार (Daily / Yearly)</button>
        <button type="button" class="ip-mode-btn ${calcMode === "duration" ? "is-active" : ""}" data-ipmode="duration">⏱️ महिने / दिवसांनुसार</button>
      </div>

      <div class="ip-grid">
        <div class="field">
          <label>मुद्दल रक्कम (₹) *</label>
          <input type="number" id="ipPrincipal" value="50000" min="1" step="0.01" placeholder="उदा. 50000" />
        </div>
        <div class="field">
          <label>व्याज दर (%) *</label>
          <input type="number" id="ipRate" value="2" min="0" step="0.01" placeholder="उदा. 1.13 किंवा 12" />
        </div>
        <div class="field">
          <label>दर कालावधी (Rate Period)</label>
          <select id="ipRatePeriod">
            <option value="monthly">मासिक (Monthly %)</option>
            <option value="daily">दैनिक (Daily %)</option>
            <option value="yearly" ${calcMode === "dates" ? "selected" : ""}>वार्षिक (Yearly % • Actual/365)</option>
          </select>
        </div>
        <div class="field">
          <label>कालावधी प्रकार / माहिती</label>
          <select id="ipMethod">
            <option value="simple">सरळ व्याज (Exact BigInt)</option>
            <option value="compound_monthly">मासिक चक्रवाढ अंदाज (Compound)</option>
          </select>
        </div>

        ${calcMode === "dates" ? `
          <div class="field">
            <label>सुरू तारीख (YYYY-MM-DD किंवा DD/MM/YYYY)</label>
            <input type="text" id="ipStartDate" value="${todayIso}" placeholder="उदा. 2026-02-01" />
          </div>
          <div class="field">
            <label>शेवट तारीख (चुकीची तारीख उदा. 30 फेब्रु. नाकारली जाईल)</label>
            <input type="text" id="ipEndDate" value="${defaultEndIso}" placeholder="उदा. 2026-03-01" />
          </div>
        ` : `
          <div class="field">
            <label id="ipCountLabel">कालावधी (महिने / दिवस)</label>
            <input type="number" id="ipCountVal" value="1" min="1" step="1" />
          </div>
          <div class="field">
            <label>एकक (Unit)</label>
            <select id="ipCountUnit">
              <option value="months">महिने (Months)</option>
              <option value="days">दिवस (Days)</option>
            </select>
          </div>
        `}
      </div>

      <div class="row" style="gap:6px;">
        <button type="button" id="ipCalculateBtn" class="primary" style="flex:1;">⚡ अचूक व्याज काढा</button>
        <button type="button" id="ipShareWaBtn" class="success hidden">💬 WA कोटेशन</button>
      </div>

      <div id="ipOutputArea"></div>
    `;

    body.querySelectorAll("[data-ipmode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        calcMode = btn.getAttribute("data-ipmode");
        renderPreviewModal();
      });
    });

    document.getElementById("ipCalculateBtn")?.addEventListener("click", runPreviewCalculation);
    document.getElementById("ipShareWaBtn")?.addEventListener("click", () => {
      if (!lastQuoteText) return;
      window.open(`https://wa.me/?text=${encodeURIComponent(lastQuoteText)}`, "_blank", "noopener,noreferrer");
    });

    // उघडताच त्वरित पहिला अंदाज दाखवा
    runPreviewCalculation();
  }

  function runPreviewCalculation() {
    const L = window.VyajLedgerV16;
    const outEl = document.getElementById("ipOutputArea");
    const waBtn = document.getElementById("ipShareWaBtn");
    if (!L || !outEl) return;

    const pRaw = document.getElementById("ipPrincipal")?.value;
    const rRaw = document.getElementById("ipRate")?.value;
    const period = document.getElementById("ipRatePeriod")?.value || "monthly";
    const method = document.getElementById("ipMethod")?.value || "simple";

    const principalPaise = L.toPaise(pRaw);
    const rateNum = Number(rRaw || 0);
    if (principalPaise <= 0n) {
      outEl.innerHTML = `<div class="ip-err-box">⚠️ कृपया शून्यापेक्षा जास्त मुद्दल रक्कम (₹) टाका.</div>`;
      waBtn?.classList.add("hidden");
      return;
    }
    if (!Number.isFinite(rateNum) || rateNum < 0) {
      outEl.innerHTML = `<div class="ip-err-box">⚠️ कृपया वैध व्याज दर (%) टाका.</div>`;
      waBtn?.classList.add("hidden");
      return;
    }

    let days = 0;
    let months = 1;
    let periodDesc = "";

    if (calcMode === "dates") {
      const startStr = document.getElementById("ipStartDate")?.value || "";
      const endStr = document.getElementById("ipEndDate")?.value || "";
      const diff = L.diffDaysStrict(startStr, endStr);
      if (!diff.valid) {
        outEl.innerHTML = `<div class="ip-err-box">🚫 ${diff.error}</div>`;
        waBtn?.classList.add("hidden");
        return;
      }
      days = diff.days;
      periodDesc = `${diff.start.iso} ते ${diff.end.iso} (${days} दिवस${diff.start.isLeap || diff.end.isLeap ? " • लीप वर्ष" : ""})`;
    } else {
      const cnt = Math.max(1, Math.round(Number(document.getElementById("ipCountVal")?.value || 1)));
      const unit = document.getElementById("ipCountUnit")?.value || "months";
      if (unit === "days") {
        days = cnt;
        months = Math.max(1, Math.round(cnt / 30));
        periodDesc = `${days} दिवस`;
      } else {
        months = cnt;
        days = cnt * 30;
        periodDesc = `${months} महिने`;
      }
    }

    let interestPaise = 0n;
    let formulaNote = "";

    if (method === "compound_monthly" && period === "monthly") {
      const effMonths = calcMode === "dates" ? Math.max(1, Math.floor(days / 30)) : months;
      let curP = principalPaise;
      for (let i = 0; i < effMonths; i++) {
        const mInt = L.calcInterestPaise({ principalPaise: curP, rate: rateNum, ratePeriod: "monthly", months: 1 });
        curP += mInt;
      }
      interestPaise = curP - principalPaise;
      formulaNote = `मासिक चक्रवाढ (${effMonths} पूर्ण महिने)`;
    } else if (period === "monthly") {
      if (calcMode === "dates") {
        // तारखांनुसार मासिक दर -> Actual/30 प्रपोर्शनल अचूक BigInt
        const oneMonthInt = L.calcInterestPaise({ principalPaise, rate: rateNum, ratePeriod: "monthly", months: 1 });
        interestPaise = L.divRoundHalfUp(oneMonthInt * BigInt(days), 30n);
        formulaNote = `मासिक ${rateNum}% दराने ${days} दिवसांचे प्रमाणशीर व्याज`;
      } else {
        interestPaise = L.calcInterestPaise({ principalPaise, rate: rateNum, ratePeriod: "monthly", months });
        formulaNote = `मासिक ${rateNum}% × ${months} महिने (Half-Up BigInt)`;
      }
    } else if (period === "daily") {
      interestPaise = L.calcInterestPaise({ principalPaise, rate: rateNum, ratePeriod: "daily", days });
      formulaNote = `दैनिक ${rateNum}% × ${days} दिवस (Half-Up BigInt)`;
    } else {
      interestPaise = L.calcInterestPaise({ principalPaise, rate: rateNum, ratePeriod: "yearly", days });
      formulaNote = `वार्षिक ${rateNum}% (Actual/365) × ${days} दिवस`;
    }

    const totalPaise = principalPaise + interestPaise;
    const perDayPaise = days > 0 ? L.divRoundHalfUp(interestPaise, BigInt(days)) : 0n;

    outEl.innerHTML = `
      <div class="ip-result-box">
        <div class="ip-res-row"><span class="muted">कालावधी</span><strong>${periodDesc}</strong></div>
        <div class="ip-res-row"><span class="muted">हिशोब पद्धत</span><strong style="font-size:0.76rem;">${formulaNote}</strong></div>
        <div class="ip-res-row"><span class="muted">मूळ मुद्दल</span><strong style="color:var(--gold);">${L.formatPaiseInr(principalPaise, true)}</strong></div>
        <div class="ip-res-row"><span class="muted">अचूक व्याज</span><strong style="color:var(--accent); font-size:1.05rem;">${L.formatPaiseInr(interestPaise, true)}</strong></div>
        ${days > 0 ? `<div class="ip-res-row"><span class="muted">सरासरी दररोज व्याज</span><span>${L.formatPaiseInr(perDayPaise, true)} / दिवस</span></div>` : ""}
        <div class="ip-res-row" style="margin-top:4px; padding-top:6px; border-top:1px solid var(--border);">
          <span style="font-weight:800;">एकूण परतफेड रक्कम</span>
          <strong style="color:var(--accent-2); font-size:1.1rem;">${L.formatPaiseInr(totalPaise, true)}</strong>
        </div>
      </div>
    `;

    const biz = (document.getElementById("profBizName")?.value || document.getElementById("tBrandTitle")?.textContent || "व्याज हिशोब वही").trim();
    lastQuoteText = `*व्याज अंदाज कोटेशन — ${biz}*\nमुद्दल: ${L.formatPaiseInr(principalPaise, true)}\nदर: ${rateNum}% (${period})\nकालावधी: ${periodDesc}\nएकूण व्याज: *${L.formatPaiseInr(interestPaise, true)}*\nएकूण परतफेड: *${L.formatPaiseInr(totalPaise, true)}*\n_(टीप: हा फक्त अंदाज असून खात्यात नोंद केलेली नाही.)_`;
    waBtn?.classList.remove("hidden");
  }

  function openInterestPreview() {
    const modal = ensurePreviewModal();
    renderPreviewModal();
    modal.classList.remove("hidden");
  }

  function injectPreviewButton() {
    const anchor = document.getElementById("heroMonthActivityBtn") || document.getElementById("heroBackupLink");
    if (!anchor || document.getElementById("heroInterestPreviewBtn")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "heroInterestPreviewBtn";
    btn.className = "ip-hero-btn";
    btn.textContent = "🧮 व्याज अंदाज";
    btn.title = "खात्यात नोंद न करता Daily / Monthly / Yearly व्याज कोटेशन पहा";
    btn.addEventListener("click", openInterestPreview);

    anchor.insertAdjacentElement("afterend", btn);
  }

  window.openVyajInterestPreview = openInterestPreview;

  function initInterestPreview() {
    injectPreviewCss();
    injectPreviewButton();
    setTimeout(injectPreviewButton, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initInterestPreview);
  else initInterestPreview();
})();
