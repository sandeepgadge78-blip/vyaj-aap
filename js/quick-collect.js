// व्याज हिशोब वही - फास्ट १-क्लिक वसुली स्क्रीन मॉड्यूल (js/quick-collect.js - V14.14)
(function () {
  let sessionCollectedTotal = 0;
  let selectedPayMode = "Cash";

  function esc(str) {
    return String(str || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function getTodayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // फास्ट वसुली पॉपअप तयार करा (create Quick Collect Modal)
  function ensureQuickCollectModal() {
    let modal = document.getElementById("quickCollectModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "quickCollectModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `
      <div class="modal-card" style="max-width:640px;">
        <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
          <h3 style="margin:0; color:var(--accent);">⚡ फास्ट १-क्लिक वसुली</h3>
          <button type="button" id="closeQuickCollectBtn" class="danger sm">✕ बंद</button>
        </div>

        <div class="meta-box row" style="justify-content:space-between; margin-bottom:10px;">
          <div>
            <span class="muted">या सेशनमध्ये जमा:</span>
            <strong id="qcSessionTotalText" style="color:var(--accent-2); font-size:1.05rem; margin-left:4px;">₹0</strong>
          </div>
          <div class="row" style="gap:5px;">
            <span class="muted" style="font-size:0.78rem;">माध्यम:</span>
            <select id="qcModeSelect" style="padding:4px 8px; font-size:0.8rem;">
              <option value="Cash">💵 Cash</option>
              <option value="UPI">📱 UPI</option>
              <option value="Bank">🏦 Bank</option>
            </select>
          </div>
        </div>

        <input type="text" id="qcSearchInput" class="search-pill-box" placeholder="🔍 बाकी ग्राहकाचे नाव शोधा..." style="margin-bottom:10px;" />

        <div id="qcListContainer" style="max-height:58vh; overflow-y:auto;"></div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });

    document.getElementById("closeQuickCollectBtn").addEventListener("click", () => {
      modal.classList.add("hidden");
    });

    document.getElementById("qcModeSelect").addEventListener("change", (e) => {
      selectedPayMode = e.target.value || "Cash";
    });

    document.getElementById("qcSearchInput").addEventListener("input", () => {
      renderQuickCollectList();
    });

    return modal;
  }

  // थेट Firebase मध्ये पेमेंट सेव्ह करा (save payment directly to Firestore)
  async function saveQuickPayment(borrowerId, amount, btnEl, rowEl) {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user) {
      alert("कृपया आधी लॉगिन करा.");
      return;
    }

    const amt = Number(amount || 0);
    if (!amt || amt <= 0) {
      alert("कृपया वैध रक्कम टाका.");
      return;
    }

    const activeYm = (document.getElementById("activeYm") && document.getElementById("activeYm").value) || getTodayIso().slice(0, 7);
    const paymentObj = {
      id: "qc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      amount: amt,
      date: getTodayIso(),
      ym: activeYm,
      mode: selectedPayMode,
      note: "Fast Collect"
    };

    const origText = btnEl.textContent;
    btnEl.disabled = true;
    btnEl.textContent = "⏳...";

    try {
      const ref = firebase.firestore().collection("users").doc(user.uid).collection("borrowers").doc(borrowerId);
      await ref.update({
        paymentHistory: firebase.firestore.FieldValue.arrayUnion(paymentObj),
        updatedAt: new Date().toISOString()
      });

      sessionCollectedTotal += amt;
      const totEl = document.getElementById("qcSessionTotalText");
      if (totEl) totEl.textContent = `₹${sessionCollectedTotal.toLocaleString("en-IN")}`;

      btnEl.className = "success sm";
      btnEl.textContent = "✅ जमा झाले";
      if (rowEl) rowEl.style.opacity = "0.6";
    } catch (err) {
      console.error("Quick Collect Error:", err);
      alert("पेमेंट सेव्ह करताना एरर आला: " + err.message);
      btnEl.disabled = false;
      btnEl.textContent = origText;
    }
  }

  // बाकी ग्राहकांची यादी दाखवा (render pending borrowers list)
  function renderQuickCollectList() {
    if (!window.HishobBridge) return;
    const container = document.getElementById("qcListContainer");
    if (!container) return;

    const query = (document.getElementById("qcSearchInput")?.value || "").trim().toLowerCase();
    const activeYm = (document.getElementById("activeYm") && document.getElementById("activeYm").value) || getTodayIso().slice(0, 7);
    const borrowers = window.HishobBridge.getBorrowers() || [];

    const pendingItems = [];
    borrowers
      .filter((b) => !b.isDeleted && b.accountStatus !== "closed")
      .forEach((b) => {
        const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
        if (calc.totalPayable <= 0) return;

        const nameStr = String(b.name || "").toLowerCase();
        const mobStr = String(b.mobile || "").toLowerCase();
        if (query && !nameStr.includes(query) && !mobStr.includes(query)) return;

        // डीफॉल्ट रक्कम: महिन्याचे व्याज किंवा एकूण बाकी (जे कमी असेल ते)
        const suggestedAmt = calc.monthlyInterest > 0
          ? Math.min(calc.monthlyInterest, calc.totalPayable)
          : calc.totalPayable;

        pendingItems.push({
          id: b.id,
          name: b.name || "ग्राहक",
          totalPayable: calc.totalPayable,
          suggestedAmt
        });
      });

    if (!pendingItems.length) {
      container.innerHTML = `<div class="ok" style="text-align:center; padding:18px; font-weight:700;">✅ या महिन्याचे सर्व बाकी हिशोब पूर्ण जमा झाले आहेत!</div>`;
      return;
    }

    container.innerHTML = pendingItems
      .map((item) => `
        <div class="meta-box row" data-qc-row="${esc(item.id)}" style="justify-content:space-between; margin-bottom:8px; gap:8px;">
          <div style="flex:1; min-width:140px;">
            <strong style="font-size:0.92rem;">${esc(item.name)}</strong>
            <div class="err" style="font-size:0.78rem; font-weight:700;">एकूण बाकी: ${window.HishobBridge.fmtAmt(item.totalPayable)}</div>
          </div>
          <div class="row" style="gap:6px; flex-wrap:nowrap;">
            <input type="number" class="qc-amt-input" value="${item.suggestedAmt}" min="1" style="width:92px; padding:6px 8px; font-weight:700; text-align:right;" />
            <button type="button" class="success sm qc-pay-btn" data-id="${esc(item.id)}">✅ जमा</button>
          </div>
        </div>
      `)
      .join("");

    container.querySelectorAll(".qc-pay-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bId = btn.getAttribute("data-id");
        const rowEl = btn.closest("[data-qc-row]");
        const inputEl = rowEl ? rowEl.querySelector(".qc-amt-input") : null;
        const amt = inputEl ? Number(inputEl.value || 0) : 0;
        saveQuickPayment(bId, amt, btn, rowEl);
      });
    });
  }

  // डॅशबोर्डवर '⚡ फास्ट वसुली' बटण जोडा (mount button in month hero card)
  function mountQuickCollectButton() {
    if (document.getElementById("heroQuickCollectBtn")) return;
    const linksBar = document.querySelector(".month-hero-links");
    if (!linksBar) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "heroQuickCollectBtn";
    btn.textContent = "⚡ फास्ट वसुली";
    btn.style.borderColor = "rgba(16, 185, 129, 0.55)";
    btn.style.color = "#34d399";

    btn.addEventListener("click", () => {
      sessionCollectedTotal = 0;
      const modal = ensureQuickCollectModal();
      const totEl = document.getElementById("qcSessionTotalText");
      if (totEl) totEl.textContent = "₹0";
      const sInput = document.getElementById("qcSearchInput");
      if (sInput) sInput.value = "";
      renderQuickCollectList();
      modal.classList.remove("hidden");
      try { history.pushState({ hishobOverlay: "quickCollectModal" }, ""); } catch (_) {}
    });

    linksBar.insertBefore(btn, linksBar.firstChild);
  }

  function initQuickCollect() {
    mountQuickCollectButton();
    setTimeout(mountQuickCollectButton, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initQuickCollect);
  } else {
    initQuickCollect();
  }
})();
