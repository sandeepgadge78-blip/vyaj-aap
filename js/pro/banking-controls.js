// व्याज हिशोब वही - बँकिंग V16 कंट्रोल्स (Historical Rate/Principal Lock, Opt-in Compound, Advance Wallet, IST Late Fee, BigInt EMI & Self-Test) (js/pro/banking-controls.js - V16.0)
(function () {
  const openDrawerState = new Set(); // कोणत्या ग्राहकाचे V16 पॅनेल उघडे आहे

  function L16() {
    return window.VyajLedgerV16 || null;
  }

  function K16() {
    return window.VyajKernel || null;
  }

  function getBorrowerDocRef(bId) {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user || !firebase.firestore || !bId) return null;
    return firebase.firestore().collection("users").doc(user.uid).collection("borrowers").doc(bId);
  }

  function injectBankingControlsCss() {
    if (document.getElementById("vyajBankingControlsCss")) return;
    const st = document.createElement("style");
    st.id = "vyajBankingControlsCss";
    st.textContent = `
      .bc-wrap {
        margin-top: 10px;
        border-radius: 12px;
        background: rgba(15, 19, 28, 0.88);
        border: 1px solid rgba(125, 211, 252, 0.28);
        overflow: hidden;
      }
      body.light-mode .bc-wrap { background: #f4f1ea; border-color: #cbd5e1; }
      .bc-head {
        display: flex; align-items: center; justify-content: space-between; gap: 6px;
        padding: 8px 10px; cursor: pointer; user-select: none;
        background: rgba(125, 211, 252, 0.08);
      }
      .bc-head-title { font-size: 0.76rem; font-weight: 800; color: var(--accent); display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
      .bc-pill {
        font-size: 0.64rem; font-weight: 800; padding: 1px 6px; border-radius: 999px;
        border: 1px solid var(--border); background: var(--card-2); color: var(--text);
      }
      .bc-pill.wallet { color: #c4b5fd; border-color: rgba(196, 181, 253, 0.45); }
      .bc-pill.comp { color: #fbbf24; border-color: rgba(251, 191, 36, 0.45); }
      .bc-pill.late { color: #f07178; border-color: rgba(240, 113, 120, 0.5); }
      .bc-body { padding: 9px 10px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 9px; }
      .bc-sec {
        padding: 8px 9px; border-radius: 10px;
        background: var(--meta-bg); border: 1px solid var(--border);
      }
      .bc-sec-title { font-size: 0.74rem; font-weight: 800; color: var(--text); margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; gap: 6px; }
      .bc-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
      @media (max-width: 400px) { .bc-grid { grid-template-columns: 1fr; } }
      .bc-sec input, .bc-sec select { padding: 6px 8px !important; font-size: 0.78rem !important; width: 100%; }
      .bc-sec label { font-size: 0.68rem; color: var(--muted); display: block; margin-bottom: 2px; }
      .bc-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .bc-row button { padding: 5px 9px !important; font-size: 0.72rem !important; border-radius: 8px !important; }
      .bc-note { font-size: 0.69rem; color: var(--muted); line-height: 1.4; margin-top: 4px; }
      .bc-emi-tbl { width: 100%; border-collapse: collapse; font-size: 0.72rem; margin-top: 8px; }
      .bc-emi-tbl th, .bc-emi-tbl td { border: 1px solid var(--border); padding: 4px 5px; text-align: right; }
      .bc-emi-tbl th:first-child, .bc-emi-tbl td:first-child { text-align: center; }
      .bc-emi-tbl th { background: var(--card-2); color: var(--accent); }
    `;
    document.head.appendChild(st);
  }

  function getPeriodLabel(p) {
    const v = String(p || "monthly").toLowerCase();
    if (v === "daily") return "दैनिक (Daily)";
    if (v === "yearly") return "वार्षिक (Actual/365)";
    return "मासिक (Monthly)";
  }

  // =========================================================================
  // १. ग्राहक कार्डमध्ये V16 बँकिंग पॅनेल दाखवा (Smart Diff • ०% ब्लिंकिंग)
  // =========================================================================
  function renderCardBankingPanel(bId) {
    const L = L16();
    const K = K16();
    if (!L || !K || !bId) return;

    const detailsEl = document.getElementById(`cardDetails_${bId}`);
    if (!detailsEl || detailsEl.classList.contains("hidden")) return;

    const report = K.getMonthReport();
    const row = (report.rows || []).find((x) => x.id === bId);
    if (!row || !row.b) return;

    const b = row.b;
    const v16 = row.v16 || {};
    const activeYm = report.activeYm;
    const isOpen = openDrawerState.has(bId);
    const compEval = L.evaluateCompound(b, activeYm, row.pastDue);
    const nextYm = L.getNextYm(activeYm);

    let host = document.getElementById(`bcV16Panel_${bId}`);
    if (!host) {
      host = document.createElement("div");
      host.id = `bcV16Panel_${bId}`;
      host.className = "bc-wrap";
      detailsEl.appendChild(host);
    }

    const sig = `${activeYm}|${isOpen}|${v16.ratePeriod}|${v16.interestType}|${v16.isLocked}|${v16.walletBalance}|${v16.compoundEnabled}|${v16.lastCompoundedYm}|${v16.daysLateIst}|${row.principal}|${row.pastDue}|${b.rate}`;
    if (host.dataset.bcSig === sig) return;
    host.dataset.bcSig = sig;

    const walletStr = L.formatPaiseInr(v16.walletBalancePaise || 0n, false);
    const openingStr = L.formatPaiseInr(L.toPaise(v16.openingPrincipal || row.principal), false);

    host.innerHTML = `
      <div class="bc-head" data-bc-toggle="${K.esc(bId)}">
        <div class="bc-head-title">
          <span>🏦 बँकिंग V16</span>
          <span class="bc-pill">${K.esc(getPeriodLabel(v16.ratePeriod))}</span>
          ${v16.isLocked ? `<span class="bc-pill">🔒 लॉक</span>` : ""}
          ${v16.walletBalance > 0 ? `<span class="bc-pill wallet">💼 ${K.esc(walletStr)}</span>` : ""}
          ${v16.compoundEnabled ? `<span class="bc-pill comp">🔁 चक्रवाढ ON</span>` : ""}
          ${v16.daysLateIst > 0 ? `<span class="bc-pill late">⏰ ${v16.daysLateIst}d दंड ${K.fmtInrPlain(v16.lateFeeIst)}</span>` : ""}
        </div>
        <span style="font-size:0.7rem; color:var(--muted); font-weight:800;">${isOpen ? "बंद ▴" : "सेटिंग्ज ▾"}</span>
      </div>

      ${isOpen ? `
        <div class="bc-body">
          <!-- अ) स्वतंत्र अ‍ॅडव्हान्स वॉलेट (v16AdvanceWallet) -->
          <div class="bc-sec">
            <div class="bc-sec-title">
              <span>💼 स्वतंत्र अ‍ॅडव्हान्स वॉलेट</span>
              <strong style="color:#c4b5fd;">शिल्लक: ${K.esc(walletStr)}</strong>
            </div>
            <div class="bc-row">
              <button type="button" class="primary" data-bc-wallet-add="${K.esc(bId)}">+ वॉलेटमध्ये जमा</button>
              <button type="button" class="success" data-bc-wallet-apply="${K.esc(bId)}" ${v16.walletBalance > 0 ? "" : "disabled style='opacity:0.5;'"}>⚡ व्याजात लागू करा (Apply)</button>
            </div>
            <div class="bc-note">वॉलेटमधील रक्कम वेगळी सुरक्षित राहते; तुम्ही स्वतः Apply करेपर्यंत चालू महिन्याचे व्याज जमा मानले जात नाही.</div>
          </div>

          <!-- ब) ऑप्ट-इन चक्रवाढ व्याज (v18Compound) -->
          <div class="bc-sec">
            <div class="bc-sec-title">
              <span>🔁 चक्रवाढ व्याज (Opt-in Compound)</span>
              <span class="badge ${v16.compoundEnabled ? "partial" : ""}">${v16.compoundEnabled ? "चालू (ON)" : "बंद (OFF)"}</span>
            </div>
            <div class="bc-row">
              <button type="button" class="${v16.compoundEnabled ? "warn" : "primary"}" data-bc-comp-toggle="${K.esc(bId)}">
                ${v16.compoundEnabled ? "⏸️ चक्रवाढ बंद करा" : "✅ चक्रवाढ चालू करा"}
              </button>
              ${v16.compoundEnabled && compEval.eligible ? `
                <button type="button" class="danger" data-bc-comp-run="${K.esc(bId)}">
                  🔁 थकीत ${K.fmtInrPlain(compEval.addedInterestRupees)} मुद्दलात जोडा
                </button>
              ` : ""}
            </div>
            <div class="bc-note">
              ${v16.lastCompoundedYm === activeYm
                ? `✅ या महिन्याचे (${K.esc(K.fmtYmMr(activeYm))}) चक्रवाढ आधीच पूर्ण झाले आहे (महिन्यातून एकदाच).`
                : `मूळ मुद्दल लॉक: <strong>${K.esc(openingStr)}</strong> • चक्रवाढ मुद्दलात जोडलेले व्याज कधीही रोख जमा म्हणून मोजले जात नाही.`}
            </div>
          </div>

          <!-- क) ऐतिहासिक दर व मुद्दल लॉक (v16Terms + v16InterestLocks + v17OpeningPrincipal) -->
          <div class="bc-sec">
            <div class="bc-sec-title">
              <span>🔒 ऐतिहासिक दर व मुद्दल लॉक</span>
              <span class="muted" style="font-size:0.66rem;">मूळ मुद्दल: ${K.esc(openingStr)}</span>
            </div>
            <div class="bc-grid">
              <div>
                <label>दर कालावधी (Rate Period)</label>
                <select id="bcPeriod_${K.esc(bId)}">
                  <option value="monthly" ${v16.ratePeriod === "monthly" ? "selected" : ""}>मासिक (Monthly)</option>
                  <option value="daily" ${v16.ratePeriod === "daily" ? "selected" : ""}>दैनिक (Daily)</option>
                  <option value="yearly" ${v16.ratePeriod === "yearly" ? "selected" : ""}>वार्षिक (Actual/365)</option>
                </select>
              </div>
              <div>
                <label>व्याज पद्धत (Method)</label>
                <select id="bcType_${K.esc(bId)}">
                  <option value="reducing" ${v16.interestType === "reducing" ? "selected" : ""}>Reducing Balance</option>
                  <option value="flat" ${v16.interestType === "flat" ? "selected" : ""}>Flat (मूळ मुद्दलावर)</option>
                </select>
              </div>
              <div>
                <label>नवीन व्याज दर (%)</label>
                <input type="number" step="0.01" min="0" id="bcRate_${K.esc(bId)}" value="${K.esc(b.rate || 0)}" />
              </div>
              <div>
                <label>नवीन मुद्दल (₹)</label>
                <input type="number" step="1" min="0" id="bcPrin_${K.esc(bId)}" value="${K.esc(row.principal || 0)}" />
              </div>
              <div style="grid-column: 1 / -1;">
                <label>लागू महिना (Effective Month — जुने महिने बदलणार नाहीत)</label>
                <input type="month" id="bcEffYm_${K.esc(bId)}" value="${K.esc(nextYm)}" />
              </div>
            </div>
            <div class="bc-row" style="margin-top:7px;">
              <button type="button" class="success" style="width:100%;" data-bc-save-lock="${K.esc(bId)}">🔒 ऐतिहासिक लॉकसह सेव्ह करा</button>
            </div>
            <div class="bc-note">जुन्या महिन्यांचा हिशोब गोठवून (Lock) नवीन दर/मुद्दल फक्त निवडलेल्या महिन्यापासून लागू होईल.</div>
          </div>
        </div>
      ` : ""}
    `;
  }

  // =========================================================================
  // २. वॉलेट, चक्रवाढ व ऐतिहासिक लॉकच्या प्रत्यक्ष Firestore क्रिया
  // =========================================================================
  async function handleWalletAdd(bId) {
    const L = L16(), K = K16();
    const ref = getBorrowerDocRef(bId);
    const row = (K?.getMonthReport()?.rows || []).find((x) => x.id === bId);
    if (!L || !ref || !row) return;

    const raw = prompt(`'${row.name}' यांच्या स्वतंत्र अ‍ॅडव्हान्स वॉलेटमध्ये किती रक्कम (₹) जमा करायची?`, "");
    if (raw === null) return;
    const amt = Number(String(raw).replace(/[,₹\s]/g, ""));
    if (!Number.isFinite(amt) || amt <= 0) { alert("कृपया वैध रक्कम टाका."); return; }

    const res = L.buildWalletTransaction(row.b, "credit", amt, K.getActiveYm(), "अ‍ॅडव्हान्स वॉलेटमध्ये जमा");
    if (res.error) { alert(res.error); return; }

    try {
      await ref.update({ v16AdvanceWallet: res.v16AdvanceWallet, updatedAt: new Date().toISOString() });
      alert(`✅ ${L.formatPaiseInr(L.toPaise(amt), false)} स्वतंत्र अ‍ॅडव्हान्स वॉलेटमध्ये सेव्ह झाले! (चालू व्याजात आपोआप जमा झालेले नाही.)`);
    } catch (err) {
      alert("वॉलेट सेव्ह एरर: " + err.message);
    }
  }

  async function handleWalletApply(bId) {
    const L = L16(), K = K16();
    const ref = getBorrowerDocRef(bId);
    const row = (K?.getMonthReport()?.rows || []).find((x) => x.id === bId);
    if (!L || !ref || !row) return;

    const bal = row.walletBalance || 0;
    if (bal <= 0) { alert("वॉलेटमध्ये शिल्लक नाही."); return; }

    const suggested = row.totalPending > 0 ? Math.min(bal, row.totalPending) : bal;
    const raw = prompt(`वॉलेट शिल्लक ₹${bal} मधून चालू महिन्याच्या व्याजात किती रक्कम लागू (Apply) करायची?`, String(suggested));
    if (raw === null) return;
    const amt = Number(String(raw).replace(/[,₹\s]/g, ""));
    if (!Number.isFinite(amt) || amt <= 0 || amt > bal) {
      alert(`कृपया ₹1 ते ₹${bal} दरम्यान वैध रक्कम टाका.`);
      return;
    }

    const activeYm = K.getActiveYm();
    const res = L.buildWalletTransaction(row.b, "apply", amt, activeYm, `वॉलेटमधून ${activeYm} व्याजात लागू`);
    if (res.error) { alert(res.error); return; }

    try {
      // १. आधी वॉलेटमधून रक्कम वजा करा
      await ref.update({ v16AdvanceWallet: res.v16AdvanceWallet, updatedAt: new Date().toISOString() });

      // २. कार्डमधील मूळ 'जमा करा' बटनाद्वारे app.js च्या अचूक पद्धतीने जमा नोंद करा
      setTimeout(() => {
        const detailsEl = document.getElementById(`cardDetails_${bId}`);
        const collectBtn = detailsEl?.querySelector('button[data-action="smart-collect"]');
        const amtInput = collectBtn?.parentElement?.querySelector('input[type="number"], input[type="text"]');
        if (collectBtn && amtInput) {
          amtInput.value = String(amt);
          amtInput.dispatchEvent(new Event("input", { bubbles: true }));
          delete collectBtn.dataset.vyajBusy;
          collectBtn.click();
        } else {
          alert(`✅ वॉलेटमधून ₹${amt} वजा झाले आहेत. कृपया कार्डमधील 'जमा करा' मध्ये ₹${amt} नोंदवा.`);
        }
      }, 280);
    } catch (err) {
      alert("वॉलेट Apply एरर: " + err.message);
    }
  }

  async function handleCompoundToggle(bId) {
    const K = K16();
    const ref = getBorrowerDocRef(bId);
    const row = (K?.getMonthReport()?.rows || []).find((x) => x.id === bId);
    if (!ref || !row) return;

    const prev = row.b.v18Compound && typeof row.b.v18Compound === "object" ? row.b.v18Compound : {};
    const nextEnabled = !prev.enabled;

    try {
      await ref.update({
        v18Compound: {
          ...prev,
          enabled: nextEnabled,
          updatedAt: new Date().toISOString()
        },
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      alert("चक्रवाढ सेटिंग एरर: " + err.message);
    }
  }

  async function handleCompoundRun(bId) {
    const L = L16(), K = K16();
    const ref = getBorrowerDocRef(bId);
    const row = (K?.getMonthReport()?.rows || []).find((x) => x.id === bId);
    if (!L || !ref || !row) return;

    const activeYm = K.getActiveYm();
    const ev = L.evaluateCompound(row.b, activeYm, row.pastDue);
    if (!ev.eligible) {
      alert(ev.reason === "already_compounded_this_month"
        ? "या महिन्याचे चक्रवाढ आधीच लागू झाले आहे (महिन्यातून एकदाच चालते)."
        : "चक्रवाढ लागू करण्यासाठी थकीत व्याज शिल्लक नाही.");
      return;
    }

    if (!confirm(
      `'${row.name}' यांचे थकीत व्याज ${K.fmtInrPlain(ev.addedInterestRupees)} मुद्दलात जोडायचे का?\n` +
      `नवीन मुद्दल: ${K.fmtInrPlain(ev.newPrincipalRupees)}\n` +
      `(टीप: हे रोख जमा म्हणून मोजले जाणार नाही आणि या महिन्यात पुन्हा चालणार नाही.)`
    )) return;

    const nowIso = new Date().toISOString();
    const todayIst = L.getIstTodayIso();
    const prevComp = row.b.v18Compound || {};
    const prevHist = Array.isArray(prevComp.history) ? prevComp.history : [];
    const prevPrinHist = Array.isArray(row.b.principalHistory) ? row.b.principalHistory : [];

    // ऐतिहासिक लॉक जपून नवीन मुद्दल सेव्ह करा (रोख जमा नाही!)
    const lockPayload = L.buildHistoricalTermUpdate(row.b, {
      effectiveYm: activeYm,
      principal: ev.newPrincipalRupees,
      rate: row.b.rate,
      ratePeriod: row.v16?.ratePeriod || "monthly",
      interestType: row.v16?.interestType || "reducing",
      fixedInterest: row.b.fixedInterest || 0
    }, activeYm);

    try {
      await ref.update({
        ...lockPayload,
        principal: ev.newPrincipalRupees,
        principalHistory: [
          ...prevPrinHist,
          {
            type: "compound_capitalization",
            isCompound: true,
            amount: ev.addedInterestRupees,
            delta: ev.addedInterestRupees,
            oldPrincipal: L.paiseToRupeesNum(ev.oldPrincipalPaise),
            newPrincipal: ev.newPrincipalRupees,
            ym: activeYm,
            date: todayIst,
            note: `चक्रवाढ थकीत व्याज मुद्दलात जोडले (${activeYm})`,
            ts: nowIso
          }
        ],
        v18Compound: {
          ...prevComp,
          enabled: true,
          lastCompoundedYm: activeYm,
          history: [
            ...prevHist,
            {
              ym: activeYm,
              date: todayIst,
              addedInterest: ev.addedInterestRupees,
              oldPrincipal: L.paiseToRupeesNum(ev.oldPrincipalPaise),
              newPrincipal: ev.newPrincipalRupees,
              ts: nowIso
            }
          ]
        },
        updatedAt: nowIso
      });
      alert(`✅ चक्रवाढ पूर्ण! थकीत व्याज ${K.fmtInrPlain(ev.addedInterestRupees)} मुद्दलात जोडले (नवीन मुद्दल: ${K.fmtInrPlain(ev.newPrincipalRupees)}).`);
    } catch (err) {
      alert("चक्रवाढ सेव्ह एरर: " + err.message);
    }
  }

  async function handleSaveHistoricalLock(bId) {
    const L = L16(), K = K16();
    const ref = getBorrowerDocRef(bId);
    const row = (K?.getMonthReport()?.rows || []).find((x) => x.id === bId);
    if (!L || !ref || !row) return;

    const ratePeriod = document.getElementById(`bcPeriod_${bId}`)?.value || "monthly";
    const interestType = document.getElementById(`bcType_${bId}`)?.value || "reducing";
    const rate = Number(document.getElementById(`bcRate_${bId}`)?.value || 0);
    const principal = Number(document.getElementById(`bcPrin_${bId}`)?.value || 0);
    const effectiveYm = document.getElementById(`bcEffYm_${bId}`)?.value || L.getNextYm(K.getActiveYm());

    if (principal < 0 || rate < 0) { alert("दर आणि मुद्दल शून्य किंवा त्यापेक्षा जास्त असावे."); return; }

    const activeYm = K.getActiveYm();
    const payload = L.buildHistoricalTermUpdate(row.b, {
      effectiveYm,
      principal,
      rate,
      ratePeriod,
      interestType,
      fixedInterest: 0
    }, activeYm);

    // जर चालू महिन्यापासूनच बदल लागू केला असेल तर मुख्य रकानेही अद्ययावत करा
    if (effectiveYm <= activeYm) {
      payload.rate = rate;
      payload.interestType = interestType;
    }

    try {
      await ref.update(payload);
      alert(`🔒 सेव्ह झाले! जुन्या महिन्यांचा हिशोब लॉक राहून नवीन दर (${rate}% • ${getPeriodLabel(ratePeriod)}) व मुद्दल (${K.fmtInrPlain(principal)}) ${K.fmtYmMr(effectiveYm)} पासून लागू होईल.`);
    } catch (err) {
      alert("ऐतिहासिक लॉक सेव्ह एरर: " + err.message);
    }
  }

  // =========================================================================
  // ३. अ‍ॅपमधील EMI Simulator ला BigInt इंजिनवर अपग्रेड करा
  // =========================================================================
  function bindBigIntEmiSimulator() {
    document.addEventListener("click", (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest("#calcEmiBtn") : null;
      if (!btn) return;
      const L = L16();
      if (!L) return;

      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();

      const principal = document.getElementById("emiPrincipal")?.value || 0;
      const monthlyRate = document.getElementById("emiMonthlyRate")?.value || 0;
      const months = document.getElementById("emiMonths")?.value || 1;
      const type = document.getElementById("emiType")?.value || "reducing";
      const resEl = document.getElementById("emiResult");
      if (!resEl) return;

      const emi = L.calculateEmiBigInt({ principal, monthlyRate, months, type });
      if (!emi.valid) {
        resEl.innerHTML = `<span class="err">⚠️ ${emi.error}</span>`;
        return;
      }

      const previewRows = emi.schedule.slice(0, 24).map((r) => `
        <tr>
          <td>${r.month}</td>
          <td>${L.formatPaiseInr(r.emiPaise, true)}</td>
          <td>${L.formatPaiseInr(r.principalPaise, true)}</td>
          <td>${L.formatPaiseInr(r.interestPaise, true)}</td>
          <td>${L.formatPaiseInr(r.balancePaise, true)}</td>
        </tr>
      `).join("");

      resEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <strong style="color:var(--accent);">🏦 BigInt EMI निकाल (${type === "flat" ? "Flat" : "Reducing"})</strong>
          <span class="badge paid">१ पैसा अचूकता</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:6px; font-size:0.82rem;">
          <div>मासिक हप्ता (EMI): <strong style="color:var(--accent-2);">${L.formatPaiseInr(emi.emiPaise, true)}</strong></div>
          <div>शेवटचा हप्ता: <strong>${L.formatPaiseInr(emi.lastEmiPaise, true)}</strong></div>
          <div>एकूण व्याज: <strong style="color:var(--gold);">${L.formatPaiseInr(emi.totalInterestPaise, true)}</strong></div>
          <div>एकूण परतफेड: <strong style="color:var(--accent);">${L.formatPaiseInr(emi.totalPayablePaise, true)}</strong></div>
        </div>
        ${previewRows ? `
          <details style="margin-top:8px;">
            <summary style="cursor:pointer; font-size:0.76rem; color:var(--accent); font-weight:700;">📋 हप्ता वेळापत्रक पहा (पहिले ${Math.min(24, emi.schedule.length)} महिने)</summary>
            <div style="max-height:220px; overflow-y:auto;">
              <table class="bc-emi-tbl">
                <thead><tr><th>म.</th><th>हप्ता</th><th>मुद्दल</th><th>व्याज</th><th>शिल्लक</th></tr></thead>
                <tbody>${previewRows}</tbody>
              </table>
            </div>
          </details>
        ` : ""}
      `;
    }, true);
  }

  // =========================================================================
  // ४. Settings मध्ये BigInt V16 स्वयंचलित चाचणी (Self-Test) बटण
  // =========================================================================
  function injectSelfTestInSettings() {
    const anchor = document.getElementById("proSafeCacheCleanBtn") || document.getElementById("setResetPassBtn");
    if (!anchor || document.getElementById("proBigIntSelfTestBtn")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "proBigIntSelfTestBtn";
    btn.className = "sm";
    btn.style.width = "100%";
    btn.textContent = "🧪 BigInt V16 बँकिंग अचूकता तपासा (Self-Test)";
    btn.addEventListener("click", () => {
      const L = L16();
      if (!L) return;
      const report = L.runSelfTests();
      const lines = report.results.map((r) => `${r.ok ? "✅" : "❌"} ${r.name}`).join("\n");
      alert(`🏦 VyajOS V16 Self-Test: ${report.passed}/${report.total} पास\nIST वेळ: ${L.getIstTodayIso()} (${L.getIstCurrentYm()})\n\n${lines}`);
    });
    anchor.insertAdjacentElement("beforebegin", btn);
  }

  // =========================================================================
  // ५. इव्हेंट बाइंडिंग (शून्य MutationObserver लोड)
  // =========================================================================
  function refreshAllOpenCards() {
    document.querySelectorAll('#borrowersList [id^="cardDetails_"]:not(.hidden)').forEach((el) => {
      const bId = el.id.replace("cardDetails_", "");
      renderCardBankingPanel(bId);
    });
  }

  function bindBankingEvents() {
    document.addEventListener("click", (ev) => {
      const target = ev.target && ev.target.closest ? ev.target.closest("[data-bc-toggle], [data-bc-wallet-add], [data-bc-wallet-apply], [data-bc-comp-toggle], [data-bc-comp-run], [data-bc-save-lock], .nc-clickable-area") : null;
      if (!target) return;

      if (target.classList.contains("nc-clickable-area")) {
        const bId = target.getAttribute("data-toggle-card");
        if (bId) setTimeout(() => renderCardBankingPanel(bId), 90);
        return;
      }

      if (target.hasAttribute("data-bc-toggle")) {
        const bId = target.getAttribute("data-bc-toggle");
        if (openDrawerState.has(bId)) openDrawerState.delete(bId);
        else openDrawerState.add(bId);
        renderCardBankingPanel(bId);
        return;
      }
      if (target.hasAttribute("data-bc-wallet-add")) { handleWalletAdd(target.getAttribute("data-bc-wallet-add")); return; }
      if (target.hasAttribute("data-bc-wallet-apply")) { handleWalletApply(target.getAttribute("data-bc-wallet-apply")); return; }
      if (target.hasAttribute("data-bc-comp-toggle")) { handleCompoundToggle(target.getAttribute("data-bc-comp-toggle")); return; }
      if (target.hasAttribute("data-bc-comp-run")) { handleCompoundRun(target.getAttribute("data-bc-comp-run")); return; }
      if (target.hasAttribute("data-bc-save-lock")) { handleSaveHistoricalLock(target.getAttribute("data-bc-save-lock")); return; }
    });
  }

  function initBankingControls() {
    injectBankingControlsCss();
    bindBankingEvents();
    bindBigIntEmiSimulator();
    setTimeout(injectSelfTestInSettings, 900);

    if (window.VyajKernel && typeof window.VyajKernel.subscribe === "function") {
      window.VyajKernel.subscribe(() => {
        refreshAllOpenCards();
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initBankingControls);
  else initBankingControls();
})();
