// व्याज हिशोब वही - डुप्लिकेट UI स्वच्छता व परफॉर्मन्स ऑप्टिमायझेशन (js/pro/cleanup-pro.js - V14.37)
(function () {
  // Pure CSS द्वारे डुप्लिकेट घटक लपवा (अतिरिक्त MutationObserver न लावता ०% लोड)
  function injectCleanupCss() {
    if (document.getElementById("vyajCleanupProCss")) return;
    const st = document.createElement("style");
    st.id = "vyajCleanupProCss";
    st.textContent = `
      /* १. कार्डच्या 'साधने' टॅबमधील डुप्लिकेट 'Timeline' व जुना साधा 'QR' लपवा */
      .pc-tools-grid button[data-action="timeline"],
      .pc-tools-grid button[data-action="upi-qr"] {
        display: none !important;
      }

      /* २. महिना कार्डवरील डुप्लिकेट 'Backup' बटण लपवा (डॅशबोर्डवर Live Backup पट्टी आहे) */
      #heroBackupLink {
        display: none !important;
      }

      /* ३. डॅशबोर्ड अधिक कॉम्पॅक्ट व स्वच्छ ठेवण्यासाठी अचूक अंतर */
      .month-hero-card { margin-bottom: 9px !important; padding: 12px 8px !important; }
      .lb-bar { margin-bottom: 9px !important; }
      .grid-2x2 { gap: 8px !important; margin-bottom: 9px !important; }
      .psb-bar-wrap { margin-bottom: 9px !important; }
      .sr-strip { margin-bottom: 8px !important; }
      .pill-strip { margin-bottom: 9px !important; }

      .cp-upi-note {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        padding: 7px 10px; border-radius: 10px; margin-bottom: 10px;
        background: var(--meta-bg); border: 1px dashed var(--border); font-size: 0.76rem;
      }
    `;
    document.head.appendChild(st);
  }

  // Backup स्क्रीनमधील जुने डुप्लिकेट CSV व Sheet Import बॉक्स लपवा
  function cleanBackupSection() {
    const csvInput = document.getElementById("importCsvFile");
    if (csvInput && csvInput.closest(".row")) {
      csvInput.closest(".row").style.display = "none";
    }
    const sheetInput = document.getElementById("sheetUrlInput");
    if (sheetInput && sheetInput.closest(".row")) {
      sheetInput.closest(".row").style.display = "none";
    }
  }

  // रिमाइंडर्स स्क्रीनमधील डुप्लिकेट UPI ID बॉक्स लपवून प्रोफाईलचा शॉर्टकट द्या
  function cleanRemindersUpiRow() {
    const upiInput = document.getElementById("selfUpiId");
    const row = upiInput ? upiInput.closest(".row") : null;
    if (!row || row.dataset.cpCleaned === "1") return;

    row.dataset.cpCleaned = "1";
    row.style.display = "none";

    const note = document.createElement("div");
    note.className = "cp-upi-note";
    note.innerHTML = `
      <span class="muted">💳 UPI ID आता <strong>बिझनेस प्रोफाईल</strong> मधून सेव्ह होतो.</span>
      <button type="button" class="primary sm" id="cpOpenProfileUpiBtn" style="padding:4px 9px; font-size:0.71rem;">👤 प्रोफाईल उघडा</button>
    `;
    row.insertAdjacentElement("afterend", note);

    document.getElementById("cpOpenProfileUpiBtn")?.addEventListener("click", () => {
      document.getElementById("toolSectionModal")?.classList.add("hidden");
      const profModal = document.getElementById("profileModal");
      if (profModal) {
        profModal.classList.remove("hidden");
        setTimeout(() => document.getElementById("profUpiId")?.focus(), 120);
      }
    });
  }

  // महिना कार्डवरील डुप्लिकेट 'फास्ट वसुली' व 'कॅशबुक' बटणे लपवा (तळाच्या बारवर आधीच आहेत)
  function cleanHeroDuplicateButtons() {
    const heroLinks = document.querySelector(".month-hero-links");
    if (!heroLinks) return;

    heroLinks.querySelectorAll("button").forEach((btn) => {
      if (btn.id === "heroPdfLink" || btn.id === "heroExcelLink") return;
      const txt = (btn.textContent || "").trim();
      if (txt.includes("फास्ट वसुली") || txt.includes("कॅशबुक") || txt.includes("Backup")) {
        btn.style.display = "none";
      }
    });
  }

  function runCleanupPass() {
    injectCleanupCss();
    cleanBackupSection();
    cleanRemindersUpiRow();
    cleanHeroDuplicateButtons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      runCleanupPass();
      setTimeout(runCleanupPass, 900);
      setTimeout(runCleanupPass, 2000);
    });
  } else {
    runCleanupPass();
    setTimeout(runCleanupPass, 900);
    setTimeout(runCleanupPass, 2000);
  }
})();
