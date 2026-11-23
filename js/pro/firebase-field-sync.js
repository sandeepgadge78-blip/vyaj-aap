// व्याज हिशोब वही - झिरो-रीड Master Data Sync (२५-खाती सुरक्षित Batch + Live Progress + Lock-Safe Undo + Data Health Checker) (js/pro/firebase-field-sync.js - V14.32)
(function () {
  // app.js च्या Lock/Logout मध्ये पुसल्या जाऊ नयेत अशा सुरक्षित कीज
  const UNDO_REPAIR_KEY = "vyaj_aap_auto_snapshot_undo_repair_v2";
  const PRE_REPAIR_BACKUP_KEY = "vyaj_aap_auto_snapshot_pre_repair_v2";

  let editModalObserverBound = false;
  let pendingRepairPlan = [];

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function getLiveBorrowers() {
    if (window.HishobBridge && typeof window.HishobBridge.getBorrowers === "function") {
      return window.HishobBridge.getBorrowers() || [];
    }
    return [];
  }

  function getNormalizedBorrower(idOrObj) {
    const S = window.VyajSchema;
    if (!S) return null;
    const rawDoc = typeof idOrObj === "string"
      ? getLiveBorrowers().find((x) => x.id === idOrObj)
      : idOrObj;
    return rawDoc ? S.normalizeBorrower(rawDoc) : null;
  }

  function injectRepairCss() {
    if (document.getElementById("vyajMasterRepairCss")) return;
    const st = document.createElement("style");
    st.id = "vyajMasterRepairCss";
    st.textContent = `
      .mr-box {
        background: rgba(180, 83, 9, 0.14); border: 1px solid rgba(234, 182, 118, 0.4);
        border-radius: 14px; padding: 12px; margin-bottom: 12px;
      }
      body.light-mode .mr-box { background: #fdf6e7; border-color: #fcd34d; }
      .mr-title { font-size: 0.88rem; font-weight: 800; color: var(--gold); margin: 0 0 4px; }
      .mr-sub { font-size: 0.74rem; color: var(--muted); margin-bottom: 8px; line-height: 1.45; }
      .mr-row { display: flex; flex-wrap: wrap; gap: 6px; }
      .mr-msg { font-size: 0.77rem; font-weight: 700; margin-top: 7px; line-height: 1.45; }
      .mr-item {
        padding: 9px 10px; border-radius: 11px; background: var(--meta-bg);
        border: 1px solid var(--border); margin-bottom: 7px;
      }
      .mr-chip {
        display: inline-block; font-size: 0.67rem; font-weight: 700; padding: 2px 7px;
        border-radius: 999px; background: rgba(74, 222, 128, 0.14); color: var(--accent-2);
        border: 1px solid rgba(74, 222, 128, 0.35); margin: 2px 3px 0 0;
      }
      .mr-miss-chip {
        display: inline-block; font-size: 0.67rem; font-weight: 700; padding: 2px 7px;
        border-radius: 999px; background: rgba(240, 113, 120, 0.15); color: var(--danger);
        border: 1px solid rgba(240, 113, 120, 0.38); margin: 2px 3px 0 0;
      }
    `;
    document.head.appendChild(st);
  }

  function ensureRepairModal() {
    let modal = document.getElementById("proMasterRepairModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "proMasterRepairModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `<div class="modal-card" style="max-width:650px;" id="proMasterRepairBody"></div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("proMasterRepairModal");
      }
    });
    return modal;
  }

  function setPanelMsg(msg, isErr) {
    const el = document.getElementById("mrPanelMsg");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = isErr ? "var(--danger)" : "var(--accent-2)";
  }

  // १. थेट app.js च्या Live डेटावरून स्कॅन करा (० अतिरिक्त Firebase Read)
  function openMasterRepairPreview() {
    const S = window.VyajSchema;
    if (!S) { setPanelMsg("❌ Schema Engine लोड झाले नाही.", true); return; }

    const allDocs = getLiveBorrowers().filter((b) => !b.isDeleted);
    pendingRepairPlan = allDocs.map((d) => S.computeRepairPatch(d)).filter(Boolean);
    setPanelMsg("", false);

    const modal = ensureRepairModal();
    const body = document.getElementById("proMasterRepairBody");
    if (!body) return;

    const totalFields = pendingRepairPlan.reduce((sum, x) => sum + Object.keys(x.patch).length, 0);

    const listHtml = pendingRepairPlan.length
      ? pendingRepairPlan.map((item) => {
          const chips = Object.entries(item.patch)
            .map(([k, v]) => `<span class="mr-chip">${esc(S.FIELD_LABELS_MR[k] || k)}: ${esc(String(v).slice(0, 26))}</span>`)
            .join("");
          return `
            <div class="mr-item">
              <strong style="font-size:0.88rem;">${esc(item.name)}</strong>
              <div style="margin-top:4px;">${chips}</div>
            </div>
          `;
        }).join("")
      : `<div class="ok" style="text-align:center; padding:18px; font-weight:700;">✅ अप्रतिम! तुमची सर्व ${allDocs.length} खाती आधीपासूनच app.js च्या योग्य जागी व अचूक फॉरमॅटमध्ये आहेत.</div>`;

    body.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
        <h3 style="margin:0; color:var(--gold);">🛠️ Firebase Master Data Sync (V14.32)</h3>
        <span class="badge ${pendingRepairPlan.length ? "partial" : "paid"}">${pendingRepairPlan.length} खाती सापडली</span>
      </div>

      <div class="meta-box" style="margin-bottom:10px; font-size:0.8rem;">
        एकूण खाती: <strong>${allDocs.length}</strong> • योग्य जागी बसणारे रकाने: <strong style="color:var(--accent-2);">${totalFields}</strong><br/>
        <span class="muted">१००% सुरक्षा: तुमचा पेमेंट इतिहास, मुद्दल हिशोब व डॉक्युमेंट्स अजिबात बदलणार नाहीत.</span>
      </div>

      <div style="max-height:50vh; overflow-y:auto; margin-bottom:10px;">${listHtml}</div>
      <div id="mrExecStatus" class="muted" style="text-align:center; margin-bottom:8px; font-weight:700;"></div>

      ${pendingRepairPlan.length ? `
        <button type="button" id="mrConfirmSyncBtn" class="success" style="width:100%;">
          ✅ सर्व ${pendingRepairPlan.length} खाती योग्य जागेवर Sync करा (१ क्लिक)
        </button>
      ` : ""}
    `;

    document.getElementById("mrConfirmSyncBtn")?.addEventListener("click", executeMasterRepairSync);
    modal.classList.remove("hidden");
  }

  // २. २५-२५ च्या छोट्या सुरक्षित बॅचमध्ये set(..., { merge: true }) ने थेट Firestore मध्ये लिहा
  async function executeMasterRepairSync() {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user) { alert("कृपया आधी लॉगिन करा."); return; }
    if (!pendingRepairPlan.length) return;

    const btn = document.getElementById("mrConfirmSyncBtn");
    const statusEl = document.getElementById("mrExecStatus");
    if (btn) { btn.disabled = true; btn.textContent = "⏳ सेफ्टी कॉपी व Sync चालू आहे..."; }

    // झटपट लोकल सेफ्टी कॉपी जतन करा (कोणत्याही Cloud कॉलवर न अडकता)
    try {
      const lightCopy = getLiveBorrowers().map((b) => {
        const c = { ...b };
        if (Array.isArray(c.documents)) c.documents = [];
        return c;
      });
      localStorage.setItem(PRE_REPAIR_BACKUP_KEY, JSON.stringify({ ts: Date.now(), borrowers: lightCopy }));
    } catch (_) {}

    try {
      const db = firebase.firestore();
      const colRef = db.collection("users").doc(user.uid).collection("borrowers");
      const nowIso = new Date().toISOString();
      const total = pendingRepairPlan.length;
      const BATCH_SIZE = 25;
      let completed = 0;

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const chunk = pendingRepairPlan.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        chunk.forEach((item) => {
          // undefined मूल्य टाळण्यासाठी स्वच्छ ऑब्जेक्ट तयार करा
          const cleanPatch = { updatedAt: nowIso };
          Object.entries(item.patch).forEach(([k, v]) => {
            if (v !== undefined && v !== null) cleanPatch[k] = v;
          });
          batch.set(colRef.doc(item.id), cleanPatch, { merge: true });
        });
        await batch.commit();
        completed += chunk.length;
        if (statusEl) {
          statusEl.style.color = "var(--accent)";
          statusEl.textContent = `⏳ Sync सुरू आहे: ${completed} / ${total} खाती पूर्ण...`;
        }
      }

      // Lock-Safe Undo रेकॉर्ड जतन करा
      try {
        localStorage.setItem(UNDO_REPAIR_KEY, JSON.stringify({
          ts: Date.now(),
          count: total,
          items: pendingRepairPlan.map((x) => ({ id: x.id, beforeValues: x.beforeValues }))
        }));
      } catch (_) {}

      pendingRepairPlan = [];
      updateRepairUndoBtn();

      if (statusEl) {
        statusEl.style.color = "var(--accent-2)";
        statusEl.textContent = `✅ सर्व ${total} खाती यशस्वीरित्या Firestore मध्ये Sync झाली!`;
      }
      setPanelMsg(`✅ ${total} खात्यांचा डेटा app.js च्या सर्व मूळ जागी (+नंबर, 6) मोबाईल, 7) व्याज तारीख, 8) वायदा १-३, नोकरी) कायमचा Sync झाला!`, false);

      setTimeout(() => {
        document.getElementById("proMasterRepairModal")?.classList.add("hidden");
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("proMasterRepairModal");
      }, 900);
    } catch (err) {
      console.error("Master Sync Error:", err);
      if (statusEl) {
        statusEl.style.color = "var(--danger)";
        statusEl.textContent = `❌ Sync अयशस्वी: ${err.code || ""} ${err.message || err}`;
      }
      if (btn) { btn.disabled = false; btn.textContent = "🔄 पुन्हा प्रयत्न करा"; }
    }
  }

  // ३. शेवटचा Master Sync रद्द करा (↩️ Undo)
  async function undoLastMasterRepair() {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user) { alert("कृपया आधी लॉगिन करा."); return; }

    let snap = null;
    try { snap = JSON.parse(localStorage.getItem(UNDO_REPAIR_KEY) || "null"); } catch (_) {}
    if (!snap || !Array.isArray(snap.items) || !snap.items.length) {
      setPanelMsg("रद्द करण्यासाठी कोणताही Master Sync रेकॉर्ड उपलब्ध नाही.", true);
      return;
    }

    if (!confirm(`शेवटचा Master Sync (${snap.count} खाती) रद्द करून पूर्वीसारखे करायचे का?`)) return;

    setPanelMsg("⏳ Master Sync रद्द करत आहे...", false);
    try {
      const db = firebase.firestore();
      const colRef = db.collection("users").doc(user.uid).collection("borrowers");
      const FieldValue = firebase.firestore.FieldValue;

      for (let i = 0; i < snap.items.length; i += 25) {
        const batch = db.batch();
        snap.items.slice(i, i + 25).forEach((it) => {
          const revertPatch = {};
          Object.entries(it.beforeValues || {}).forEach(([k, v]) => {
            revertPatch[k] = v === null ? FieldValue.delete() : v;
          });
          batch.update(colRef.doc(it.id), revertPatch);
        });
        await batch.commit();
      }

      localStorage.removeItem(UNDO_REPAIR_KEY);
      updateRepairUndoBtn();
      setPanelMsg("✅ Master Sync यशस्वीरित्या रद्द झाला!", false);
    } catch (err) {
      setPanelMsg(`❌ Undo एरर: ${err.message}`, true);
    }
  }

  function updateRepairUndoBtn() {
    const btn = document.getElementById("mrUndoRepairBtn");
    if (!btn) return;
    let has = false;
    try {
      const s = JSON.parse(localStorage.getItem(UNDO_REPAIR_KEY) || "null");
      has = Boolean(s && Array.isArray(s.items) && s.items.length);
    } catch (_) {}
    btn.classList.toggle("hidden", !has);
  }

  // ४. 🩺 Data Health Checker (खरोखर अपूर्ण माहिती असलेली खाती + १-क्लिक Edit)
  function openDataHealthChecker() {
    const S = window.VyajSchema;
    if (!S) return;
    const active = getLiveBorrowers().filter((b) => !b.isDeleted && b.accountStatus !== "closed");

    const incomplete = [];
    active.forEach((b) => {
      const missing = [];
      if (!S.normalizeMobile(b.mobile)) missing.push("मोबाईल नाही");
      if (!String(b.guarantor || "").trim()) missing.push("जामीनदार नाही");
      if (!S.normalizeInterestDay(b.interestDay)) missing.push("व्याज तारीख नाही");
      if (!S.normalizeJob(b.jobType) && !String(b.companyDept || "").trim()) missing.push("नोकरी/विभाग नाही");
      if (missing.length) incomplete.push({ b, missing });
    });

    incomplete.sort((a, b) => b.missing.length - a.missing.length);

    const modal = ensureRepairModal();
    const body = document.getElementById("proMasterRepairBody");
    if (!body) return;

    const rowsHtml = incomplete.length
      ? incomplete.map(({ b, missing }) => `
          <div class="mr-item row" style="justify-content:space-between;">
            <div style="min-width:0; flex:1;">
              <strong style="font-size:0.88rem;">${esc(b.name || "ग्राहक")}</strong>
              <div style="margin-top:3px;">${missing.map((m) => `<span class="mr-miss-chip">${esc(m)}</span>`).join("")}</div>
            </div>
            <button type="button" class="warn sm" data-hc-edit="${esc(b.id)}">✏️ भरा</button>
          </div>
        `).join("")
      : `<div class="ok" style="text-align:center; padding:18px; font-weight:700;">🎉 अप्रतिम! सर्व ${active.length} सक्रिय खात्यांची मुख्य माहिती १००% पूर्ण आहे.</div>`;

    body.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
        <h3 style="margin:0; color:var(--accent);">🩺 Data Health Checker</h3>
        <span class="badge ${incomplete.length ? "pending" : "paid"}">अपूर्ण: ${incomplete.length} / ${active.length}</span>
      </div>
      <p class="muted" style="margin-top:0; font-size:0.78rem;">ज्या खात्यांत मोबाईल, जामीनदार, व्याज तारीख किंवा नोकरी माहिती अजून रिकामी आहे त्यांची यादी:</p>
      <div style="max-height:60vh; overflow-y:auto;">${rowsHtml}</div>
    `;

    body.querySelectorAll("[data-hc-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bid = btn.getAttribute("data-hc-edit");
        const stepEdit = () => {
          const editBtn = document.querySelector(`#borrowersList button[data-action="full-edit"][data-id="${bid}"]`);
          if (editBtn) editBtn.click();
        };
        if (window.VyajNavStack) window.VyajNavStack.navigateFrom("proMasterRepairModal", stepEdit);
        else { modal.classList.add("hidden"); stepEdit(); }
      });
    });

    modal.classList.remove("hidden");
  }

  function injectMasterRepairPanel() {
    const sec = document.getElementById("reportsSection");
    if (!sec || document.getElementById("proMasterRepairBox")) return;

    const box = document.createElement("div");
    box.id = "proMasterRepairBox";
    box.className = "mr-box";
    box.innerHTML = `
      <div class="mr-title">🛠️ Firebase जुना डेटा योग्य जागेवर Sync करा (१-क्लिक Repair)</div>
      <div class="mr-sub">मोबाईल, नोकरी, जामीनदार, व्याज तारीख, वायदा १–३ व मुद्दल तारीख app.js च्या सर्व मूळ जागी कायमची आणा.</div>
      <div class="mr-row">
        <button type="button" id="mrScanBtn" class="warn sm">🔍 स्कॅन व Preview पहा</button>
        <button type="button" id="mrHealthBtn" class="primary sm">🩺 Data Health Checker</button>
        <button type="button" id="mrUndoRepairBtn" class="danger sm hidden">↩️ Sync रद्द करा</button>
      </div>
      <div id="mrPanelMsg" class="mr-msg"></div>
    `;

    const importBox = document.getElementById("proSmartImportBox");
    if (importBox) importBox.insertAdjacentElement("afterend", box);
    else sec.prepend(box);

    document.getElementById("mrScanBtn")?.addEventListener("click", openMasterRepairPreview);
    document.getElementById("mrHealthBtn")?.addEventListener("click", openDataHealthChecker);
    document.getElementById("mrUndoRepairBtn")?.addEventListener("click", undoLastMasterRepair);
    updateRepairUndoBtn();
  }

  // Edit Modal उघडताच रिकामे राहिलेले जुने रकाने app.js च्या खऱ्या मूल्यांवरून Auto-Fill करा
  function autoFillEditModal() {
    const modal = document.getElementById("editModal");
    if (!modal || modal.classList.contains("hidden")) return;
    const bId = (document.getElementById("eId")?.value || "").trim();
    if (!bId) return;

    const norm = getNormalizedBorrower(bId);
    if (!norm || !norm.std) return;
    const s = norm.std;
    const S = window.VyajSchema;

    const fieldMap = [
      ["eName", s.name],
      ["eLoanLabel", s.loanLabel],
      ["eMobile", s.mobile],
      ["ePrincipal", s.principal],
      ["eOriginalPrincipal", s.originalPrincipal],
      ["eLoanDate", s.loanDate],
      ["eStartYm", s.startYm],
      ["eRate", s.rate],
      ["eFixedInterest", s.fixedMonthlyInterest],
      ["eInterestType", s.interestType],
      ["eInterestDay", s.interestDay],
      ["eLateFee", s.lateFeePerDay],
      ["eGuarantor", s.guarantor],
      ["eExtraGuarantors", s.extraGuarantors],
      ["eJobType", s.jobType],
      ["eCompanyDept", s.companyDept],
      ["eRetirementDate", s.retirementDate],
      ["ePromise1", s.promiseDate1],
      ["ePromise2", s.promiseDate2],
      ["ePromise3", s.promiseDate3],
      ["eNote", s.note || (s.address ? `पत्ता: ${s.address}` : "")]
    ];

    let filledCount = 0;
    fieldMap.forEach(([elId, val]) => {
      const el = document.getElementById(elId);
      if (!el || !S.isNonEmpty(val)) return;
      const curVal = String(el.value || "").trim();
      if (curVal === "" || (el.type === "number" && curVal === "0" && Number(val) > 0)) {
        el.value = String(val);
        filledCount += 1;
      }
    });

    let noteBanner = document.getElementById("proEditAutoFillNote");
    if (filledCount > 0) {
      if (!noteBanner) {
        noteBanner = document.createElement("div");
        noteBanner.id = "proEditAutoFillNote";
        noteBanner.className = "meta-box";
        noteBanner.style.color = "var(--accent-2)";
        noteBanner.style.marginBottom = "10px";
        noteBanner.style.fontWeight = "700";
        const firstGrid = modal.querySelector(".modal-card .grid-3");
        if (firstGrid) firstGrid.insertAdjacentElement("beforebegin", noteBanner);
      }
      noteBanner.textContent = `✨ Firebase मधून ${filledCount} रिकामे रकाने आपोआप भरले आहेत — कायमचे सेव्ह करण्यासाठी 'बदल सेव्ह करा' दाबा.`;
      noteBanner.classList.remove("hidden");
    } else if (noteBanner) {
      noteBanner.classList.add("hidden");
    }
  }

  function bindEditModalSync() {
    if (editModalObserverBound) return;
    const editModal = document.getElementById("editModal");
    if (!editModal) return;
    editModalObserverBound = true;

    const obs = new MutationObserver(() => {
      if (!editModal.classList.contains("hidden")) setTimeout(autoFillEditModal, 100);
    });
    obs.observe(editModal, { attributes: true, attributeFilter: ["class"] });
  }

  window.VyajFieldSync = {
    getNormalizedBorrower,
    findBorrowerFromCard: (card) => window.VyajSchema ? window.VyajSchema.findBorrowerFromCard(card) : null,
    stringifySafeValue: (v) => window.VyajSchema ? window.VyajSchema.stringifySafe(v) : String(v ?? ""),
    openMasterRepairPreview,
    openDataHealthChecker
  };

  function initFieldSync() {
    injectRepairCss();
    bindEditModalSync();
    injectMasterRepairPanel();
    setTimeout(injectMasterRepairPanel, 1300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFieldSync);
  } else {
    initFieldSync();
  }
})();
