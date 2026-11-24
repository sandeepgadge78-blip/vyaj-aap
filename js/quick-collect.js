// व्याज हिशोब वही - फास्ट १-क्लिक वसुली मॉड्यूल (अचूक paidMonths/partialPayments/मागील बाकी अपडेट + VyajHub Sync) (js/quick-collect.js - V14.47)
(function () {
  let sessionCollectedTotal = 0;
  let selectedPayMode = "Cash";

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function getTodayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function getActiveYm() {
    return (document.getElementById("activeYm") && document.getElementById("activeYm").value) || getTodayIso().slice(0, 7);
  }

  function fmtInr(val) {
    const n = Number(val || 0);
    if (window.HishobBridge && typeof window.HishobBridge.fmtAmt === "function") {
      return window.HishobBridge.fmtAmt(n);
    }
    return "₹" + n.toLocaleString("en-IN");
  }

  function closeQuickCollectModal() {
    const modal = document.getElementById("quickCollectModal");
    if (modal) modal.classList.add("hidden");
    if (window.VyajNavStack) window.VyajNavStack.popIfTop("quickCollectModal");
  }

  // फास्ट वसुली पॉपअप (Modal) तयार करा
  function ensureQuickCollectModal() {
    let modal = document.getElementById("quickCollectModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "quickCollectModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `
      <div class="modal-card" style="max-width:600px;">
        <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
          <h3 style="margin:0; color:var(--accent-2);">⚡ फास्ट १-क्लिक वसुली</h3>
          <button type="button" id="closeQuickCollectBtn" class="sm">✕ बंद</button>
        </div>

        <div class="meta-box" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
          <div style="font-weight:800;">
            या सेशनमध्ये जमा: <span id="qcSessionTotalText" style="color:var(--accent-2); font-size:1rem;">₹0</span>
          </div>
          <div class="row" style="gap:6px;">
            <label for="qcModeSelect" class="muted" style="font-size:0.78rem;">माध्यम:</label>
            <select id="qcModeSelect" style="padding:5px 8px; font-size:0.8rem;">
              <option value="Cash">💵 Cash</option>
              <option value="UPI">📱 UPI</option>
              <option value="Bank">🏦 Bank</option>
            </select>
          </div>
        </div>

        <input type="text" id="qcSearchInput" class="search-pill-box" placeholder="🔍 ग्राहकाचे नाव किंवा मोबाईल शोधा..." style="margin-bottom:10px;" />
        <div id="qcListContainer" style="display:flex; flex-direction:column; gap:8px;"></div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeQuickCollectModal();
    });

    document.getElementById("closeQuickCollectBtn")?.addEventListener("click", closeQuickCollectModal);

    document.getElementById("qcModeSelect")?.addEventListener("change", (e) => {
      selectedPayMode = e.target.value || "Cash";
    });

    document.getElementById("qcSearchInput")?.addEventListener("input", () => {
      renderQuickCollectList();
    });

    // जर दुसऱ्या मेन्यूमधून थेट Modal उघडला गेला तर यादी आपोआप लोड करा
    const obs = new MutationObserver(() => {
      if (!modal.classList.contains("hidden")) {
        const listBox = document.getElementById("qcListContainer");
        if (listBox && !listBox.innerHTML.trim()) {
          renderQuickCollectList();
        }
      }
    });
    obs.observe(modal, { attributes: true, attributeFilter: ["class"] });

    return modal;
  }

  // थेट Firebase मध्ये पेमेंट + चालू महिना + मागील बाकी अचूक सेव्ह करा
  async function saveQuickPayment(borrowerId, amount, btnEl, rowEl) {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user) {
      alert("कृपया आधी लॉगिन करा.");
      return;
    }

    const amt = Math.round(Number(amount || 0));
    if (!amt || amt <= 0) {
      alert("कृपया वैध रक्कम टाका.");
      return;
    }

    if (!window.HishobBridge || typeof window.HishobBridge.getBorrowers !== "function") {
      alert("डेटा अद्याप लोड होत आहे, कृपया थोड्या वेळाने प्रयत्न करा.");
      return;
    }

    const borrowers = window.HishobBridge.getBorrowers() || [];
    const borrower = borrowers.find((x) => x.id === borrowerId);
    if (!borrower) {
      alert("हे ग्राहक खाते सापडले नाही.");
      return;
    }

    const activeYm = getActiveYm();
    const nowIso = new Date().toISOString();
    const calc = window.HishobBridge.computeLedgerUpToMonth(borrower, activeYm);
    const FieldValue = firebase.firestore.FieldValue;

    const paymentObj = {
      id: "qc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      amount: amt,
      date: getTodayIso(),
      ym: activeYm,
      mode: selectedPayMode,
      type: "QUICK_COLLECT",
      note: `Fast Collect (${selectedPayMode})`
    };

    const payload = {
      paymentHistory: FieldValue.arrayUnion(paymentObj),
      updatedAt: nowIso
    };

    // १. आधी चालू महिन्याचे (activeYm) व्याज पूर्ण किंवा अर्धवट जमा करा
    const mInt = Number(calc.monthlyInterest || 0);
    const paidCur = Number(calc.paidThisMonth || 0);
    const remCur = Math.max(0, mInt - paidCur);
    let leftAmt = amt;

    if (remCur > 0 && leftAmt > 0) {
      const applyCur = Math.min(remCur, leftAmt);
      const nextPaidCur = paidCur + applyCur;
      leftAmt -= applyCur;

      if (mInt > 0 && nextPaidCur >= mInt) {
        payload[`paidMonths.${activeYm}`] = {
          paidAt: nowIso,
          amount: mInt,
          mode: selectedPayMode
        };
        payload[`partialPayments.${activeYm}`] = FieldValue.delete();
      } else {
        payload[`partialPayments.${activeYm}`] = nextPaidCur;
      }
    }

    // २. चालू महिन्यानंतर रक्कम उरली असल्यास मागील बाकीत (customCashPaid) जमा करा
    if (leftAmt > 0) {
      const prevCustomCash = Number((borrower.customCashPaid && borrower.customCashPaid[activeYm]) || 0);
      payload[`customCashPaid.${activeYm}`] = prevCustomCash + leftAmt;
    }

    const origText = btnEl.textContent;
    btnEl.disabled = true;
    btnEl.textContent = "⏳...";

    try {
      const ref = firebase.firestore().collection("users").doc(user.uid).collection("borrowers").doc(borrowerId);
      await ref.update(payload);

      sessionCollectedTotal += amt;
      const totEl = document.getElementById("qcSessionTotalText");
      if (totEl) totEl.textContent = `₹${sessionCollectedTotal.toLocaleString("en-IN")}`;

      btnEl.className = "success sm";
      btnEl.textContent = "✅ जमा झाले";
      if (rowEl) rowEl.style.opacity = "0.6";

      // डॅशबोर्डवरील सर्व बार्स तात्काळ अपडेट करण्यासाठी मध्यवर्ती Hub ला सिग्नल द्या
      if (window.VyajHub && typeof window.VyajHub.notifyDataUpdated === "function") {
        setTimeout(() => window.VyajHub.notifyDataUpdated("quickCollect"), 250);
      }
    } catch (err) {
      console.error("Quick Collect Error:", err);
      alert("पेमेंट सेव्ह करताना एरर आला: " + err.message);
      btnEl.disabled = false;
      btnEl.textContent = origText;
    }
  }

  // बाकी ग्राहकांची यादी स्क्रीनवर दाखवा
  function renderQuickCollectList() {
    if (!window.HishobBridge) return;
    const container = document.getElementById("qcListContainer");
    if (!container) return;

    const query = (document.getElementById("qcSearchInput")?.value || "").trim().toLowerCase();
    const activeYm = getActiveYm();
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

        // डीफॉल्ट रक्कम: चालू महिन्याची उरलेली बाकी (असेल तर), नाहीतर एकूण बाकी
        const suggestedAmt =
          calc.remainingThisMonth > 0
            ? calc.remainingThisMonth
            : calc.monthlyInterest > 0
              ? Math.min(calc.monthlyInterest, calc.totalPayable)
              : calc.totalPayable;

        pendingItems.push({
          id: b.id,
          name: b.name || "ग्राहक",
          remainingThisMonth: Math.max(0, Number(calc.remainingThisMonth || 0)),
          pastDue: Math.max(0, Number(calc.pastDue || 0)),
          totalPayable: Math.max(0, Number(calc.totalPayable || 0)),
          suggestedAmt
        });
      });

    if (!pendingItems.length) {
      container.innerHTML = `<div class="meta-box" style="text-align:center; color:var(--accent-2); font-weight:700;">✅ या महिन्याचे सर्व बाकी हिशोब पूर्ण जमा झाले आहेत!</div>`;
      return;
    }

    container.innerHTML = pendingItems
      .map((item) => {
        const detailParts = [];
        if (item.remainingThisMonth > 0) detailParts.push(`चालू: ${fmtInr(item.remainingThisMonth)}`);
        if (item.pastDue > 0) detailParts.push(`मागील: ${fmtInr(item.pastDue)}`);
        const subText = detailParts.length ? detailParts.join(" • ") : `एकूण बाकी: ${fmtInr(item.totalPayable)}`;

        return `
          <div class="meta-box" data-qc-row="${esc(item.id)}" style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-top:0;">
            <div style="min-width:0; flex:1;">
              <div style="font-weight:800; font-size:0.88rem; color:var(--text);">${esc(item.name)}</div>
              <div class="muted" style="font-size:0.73rem;">एकूण बाकी: <strong style="color:var(--danger);">${fmtInr(item.totalPayable)}</strong> (${subText})</div>
            </div>
            <div class="row" style="gap:6px; flex-shrink:0;">
              <input type="number" class="qc-amt-input" value="${item.suggestedAmt}" min="1" style="width:92px; padding:6px 8px; font-weight:800;" />
              <button type="button" class="success sm qc-pay-btn" data-id="${esc(item.id)}">✅ जमा</button>
            </div>
          </div>
        `;
      })
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

  function openQuickCollectModal() {
    sessionCollectedTotal = 0;
    const modal = ensureQuickCollectModal();
    const totEl = document.getElementById("qcSessionTotalText");
    if (totEl) totEl.textContent = "₹0";
    const sInput = document.getElementById("qcSearchInput");
    if (sInput) sInput.value = "";
    renderQuickCollectList();
    modal.classList.remove("hidden");

    if (window.VyajNavStack) {
      window.VyajNavStack.pushModal("quickCollectModal");
    } else {
      try { history.pushState({ hishobOverlay: "quickCollectModal" }, ""); } catch (_) {}
    }
  }

  // जुन्या ट्रिगर्ससाठी '⚡ फास्ट वसुली' बटण सुरक्षितपणे जोडून ठेवा
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
    btn.addEventListener("click", openQuickCollectModal);
    linksBar.insertBefore(btn, linksBar.firstChild);
  }

  window.openQuickCollect = openQuickCollectModal;
  window.VyajQuickCollect = { open: openQuickCollectModal };

  function initQuickCollect() {
    ensureQuickCollectModal();
    mountQuickCollectButton();
    setTimeout(mountQuickCollectButton, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initQuickCollect);
  } else {
    initQuickCollect();
  }
})();
