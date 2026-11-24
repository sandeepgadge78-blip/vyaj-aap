// व्याज हिशोब वही - १००% स्वतंत्र उधारी मॅनेजर + VyajHub Self-Healing बटण + Fixed Slot + Backup Bridge (js/pro/udhaari-pro.js - V14.46)
(function () {
  const MONTHS_MR = [
    "जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून",
    "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"
  ];
  const NOTIF_SEEN_KEY = "vyaj_aap_settings_udhaari_notif_date_v1";

  let udhaariList = [];
  let unsubUdhaari = null;
  let activeTab = "pending";
  let showAddForm = false;
  let searchQuery = "";

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

  function getLocalIso(offsetDays = 0) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function fmtDateShort(iso) {
    if (!iso) return "-";
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
  }

  function fmtYmMr(ym) {
    if (!ym || !String(ym).includes("-")) return String(ym || "");
    const [y, m] = String(ym).split("-");
    return `${MONTHS_MR[parseInt(m, 10) - 1] || m} ${y}`;
  }

  function getActiveYm() {
    return document.getElementById("activeYm")?.value || getLocalIso(0).slice(0, 7);
  }

  function cleanMob(raw) {
    const d = String(raw || "").replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("91")) return d.slice(2);
    if (d.length === 11 && d.startsWith("0")) return d.slice(1);
    return d.slice(-10);
  }

  function injectUdhaariCss() {
    if (document.getElementById("vyajUdhaariProCss")) return;
    const st = document.createElement("style");
    st.id = "vyajUdhaariProCss";
    st.textContent = `
      .ud-entry-btn {
        background: linear-gradient(135deg, #4c1d95, #6d28d9) !important;
        border: 1px solid rgba(196, 181, 253, 0.45) !important;
        color: #fff !important;
        padding: 6px 10px !important;
        font-size: 0.74rem !important;
        font-weight: 800 !important;
        border-radius: 999px !important;
        white-space: nowrap;
      }
      .ud-alert-strip {
        margin-bottom: 9px; padding: 8px 11px; border-radius: 14px; cursor: pointer;
        background: linear-gradient(135deg, rgba(76, 29, 149, 0.32), rgba(30, 27, 75, 0.72));
        border: 1px solid rgba(196, 181, 253, 0.48);
        border-left: 3px solid #c4b5fd;
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
      }
      body.light-mode .ud-alert-strip { background: #f3e8ff; border-color: #a855f7; }
      .ud-alert-strip.hidden { display: none !important; }
      .ud-kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-bottom: 10px; }
      .ud-kpi { padding: 8px 6px; border-radius: 11px; text-align: center; background: var(--meta-bg); border: 1px solid var(--border); }
      .ud-kpi-lbl { font-size: 0.65rem; color: var(--muted); font-weight: 700; }
      .ud-kpi-val { font-size: 0.92rem; font-weight: 900; margin-top: 2px; }
      .ud-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-bottom: 9px; }
      .ud-tab-btn { padding: 6px 4px !important; font-size: 0.72rem !important; font-weight: 800 !important; border-radius: 10px !important; background: var(--meta-bg) !important; color: var(--text) !important; }
      .ud-tab-btn.is-active { background: #eceff4 !important; color: #090a0d !important; border-color: #eceff4 !important; }
      body.light-mode .ud-tab-btn.is-active { background: #1f242d !important; color: #fbfaf7 !important; }
      .ud-form { padding: 10px; border-radius: 12px; margin-bottom: 10px; background: rgba(109, 40, 217, 0.12); border: 1px dashed rgba(196, 181, 253, 0.45); display: flex; flex-direction: column; gap: 7px; }
      .ud-form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; }
      @media (max-width: 420px) { .ud-form-grid { grid-template-columns: 1fr; } }
      .ud-card { padding: 9px 10px; border-radius: 12px; margin-bottom: 8px; background: var(--meta-bg); border: 1px solid var(--border); border-left: 3px solid #c4b5fd; }
      .ud-card.is-paid { border-left-color: #4ade80; opacity: 0.88; }
      .ud-card.is-due { border-left-color: #f07178; }
      .ud-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
      .ud-name { font-size: 0.88rem; font-weight: 800; color: var(--text); }
      .ud-meta { font-size: 0.71rem; color: var(--muted); margin-top: 2px; line-height: 1.4; }
      .ud-amt { font-size: 0.94rem; font-weight: 900; white-space: nowrap; text-align: right; }
      .ud-acts { display: flex; flex-wrap: nowrap; gap: 5px; margin-top: 7px; overflow-x: auto; scrollbar-width: none; }
      .ud-acts::-webkit-scrollbar { display: none; }
      .ud-acts button, .ud-acts a { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 3px; padding: 4px 8px !important; border-radius: 999px !important; font-size: 0.69rem !important; font-weight: 800 !important; text-decoration: none !important; color: #fff !important; border: 1px solid rgba(255, 255, 255, 0.16) !important; cursor: pointer; }
    `;
    document.head.appendChild(st);
  }

  function getUdhaariForMonth(activeYm) {
    const todayStr = getLocalIso(0);
    const pendingItems = [], paidInMonthItems = [], dueAlertItems = [];
    let totGiven = 0, totReturned = 0, totRemaining = 0;

    udhaariList.forEach((u) => {
      if (u.isDeleted) return;
      const givenYm = u.givenYm || String(u.givenDate || "").slice(0, 7) || activeYm;
      if (givenYm > activeYm) return;

      const amt = Number(u.amount || 0);
      const paidAmt = Number(u.paidAmount || 0);
      const remAmt = Math.max(0, amt - paidAmt);
      const isFullyPaid = remAmt <= 0 || u.status === "paid";
      const retYm = u.returnedYm || "";
      if (isFullyPaid && retYm && retYm < activeYm) return;

      totGiven += amt;
      totReturned += paidAmt;
      totRemaining += remAmt;
      const enriched = { ...u, givenYm, amt, paidAmt, remAmt, isFullyPaid };

      if (!isFullyPaid) {
        pendingItems.push(enriched);
        if (u.promiseDate && u.promiseDate <= todayStr) dueAlertItems.push(enriched);
      } else if (retYm === activeYm || !retYm) {
        paidInMonthItems.push(enriched);
      }
    });

    pendingItems.sort((a, b) => String(a.promiseDate || "9999").localeCompare(String(b.promiseDate || "9999")));
    paidInMonthItems.sort((a, b) => String(b.returnedDate || "").localeCompare(String(a.returnedDate || "")));
    return { activeYm, pendingItems, paidInMonthItems, dueAlertItems, totGiven, totReturned, totRemaining };
  }

  // Self-Healing: Analytics कार्ड पुन्हा रेंडर झाले तरी '🤝 उधारी' बटण तात्काळ मूळ रांगेतच टिकून राहील
  function ensureUdhaariDashboardButton() {
    const appScreen = document.getElementById("appScreen");
    if (!appScreen) return;
    const data = getUdhaariForMonth(getActiveYm());
    const pendingCnt = data.pendingItems.length;

    const allBtns = Array.from(appScreen.querySelectorAll("button"));
    const anchorBtn = allBtns.find((b) => {
      if (b.id === "proOpenUdhaariBtn") return false;
      const t = (b.textContent || "").trim();
      return t.includes("रिपोर्ट्स हब") || t.includes("Risk") || t.includes("लाईन चार्ट");
    });

    let btn = document.getElementById("proOpenUdhaariBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = "proOpenUdhaariBtn";
      btn.className = "ud-entry-btn";
      btn.addEventListener("click", () => openUdhaariModal("pending"));
    }

    if (anchorBtn && anchorBtn.parentElement) {
      if (btn.parentElement !== anchorBtn.parentElement) {
        anchorBtn.parentElement.appendChild(btn);
      }
    } else if (!btn.parentElement) {
      const radarStrip = document.getElementById("vyajSmartProStrip");
      const futureSlot = document.getElementById("slot-custom-future");
      if (radarStrip) radarStrip.appendChild(btn);
      else if (futureSlot) futureSlot.appendChild(btn);
    }

    btn.textContent = `🤝 उधारी${pendingCnt > 0 ? ` (${pendingCnt})` : ""}`;
  }

  function updateUdhaariAlertBanner() {
    const appScreen = document.getElementById("appScreen");
    if (!appScreen) return;
    const data = getUdhaariForMonth(getActiveYm());
    const dueList = data.dueAlertItems;

    let strip = document.getElementById("proUdhaariAlertStrip");
    if (!strip) {
      strip = document.createElement("div");
      strip.id = "proUdhaariAlertStrip";
      strip.className = "ud-alert-strip hidden";
      strip.addEventListener("click", () => openUdhaariModal("due"));
    }

    // कायमस्वरूपी Fixed Slot (#slot-udhaari-alert) मध्ये बसवा
    if (window.VyajHub && typeof window.VyajHub.mountToSlot === "function") {
      window.VyajHub.mountToSlot("slot-udhaari-alert", strip, (el) => {
        const heroCard = appScreen.querySelector(".month-hero-card");
        if (heroCard) heroCard.insertAdjacentElement("beforebegin", el);
      });
    } else if (!strip.parentElement) {
      const heroCard = appScreen.querySelector(".month-hero-card");
      if (heroCard) heroCard.insertAdjacentElement("beforebegin", strip);
    }

    if (!dueList.length) {
      strip.classList.add("hidden");
      return;
    }

    const dueSum = dueList.reduce((s, x) => s + x.remAmt, 0);
    strip.innerHTML = `
      <div style="min-width:0;">
        <div style="font-size:0.78rem; font-weight:800; color:var(--purple);">🤝 उधारी वायदा अलर्ट (व्याजापेक्षा वेगळे) • ${dueList.length} जण</div>
        <div style="font-size:0.7rem; color:var(--muted);">येणे बाकी: <strong>${fmtInr(dueSum)}</strong> • ${esc(dueList.slice(0, 2).map((x) => x.name).join(", "))}</div>
      </div>
      <span class="badge" style="color:var(--purple);">पहा ▸</span>
    `;
    strip.classList.remove("hidden");

    const todayStr = getLocalIso(0);
    if ("Notification" in window && Notification.permission === "granted" && localStorage.getItem(NOTIF_SEEN_KEY) !== todayStr) {
      try {
        new Notification(`🤝 उधारी वायदा अलर्ट (${dueList.length})`, {
          body: `[उधारी — व्याजापेक्षा वेगळे] ${dueList.map((x) => `${x.name} (₹${x.remAmt})`).slice(0, 3).join(", ")}`
        });
        localStorage.setItem(NOTIF_SEEN_KEY, todayStr);
      } catch (_) {}
    }
  }

  function ensureUdhaariModal() {
    let modal = document.getElementById("proUdhaariModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "proUdhaariModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `<div class="modal-card"><div id="proUdhaariBody"></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("proUdhaariModal");
      }
    });
    return modal;
  }

  function getUdhaariCol() {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user || !firebase.firestore) return null;
    return firebase.firestore().collection("users").doc(user.uid).collection("udhaari");
  }

  async function addNewUdhaari(data) {
    const col = getUdhaariCol();
    if (!col) {
      alert("कृपया आधी लॉगिन करा.");
      return false;
    }
    const nowIso = new Date().toISOString();
    const givenDate = data.givenDate || getLocalIso(0);
    await col.add({
      name: data.name.trim(),
      mobile: cleanMob(data.mobile),
      amount: Number(data.amount),
      paidAmount: 0,
      givenDate,
      givenYm: givenDate.slice(0, 7),
      promiseDate: data.promiseDate || "",
      note: (data.note || "").trim(),
      status: "pending",
      returnedDate: "",
      returnedYm: "",
      payments: [],
      isDeleted: false,
      createdAt: nowIso,
      updatedAt: nowIso
    });
    return true;
  }

  async function collectUdhaariReturn(u) {
    const col = getUdhaariCol();
    if (!col) return;
    const payStr = prompt(`'${u.name}' यांच्या बाकी उधारी (₹${u.remAmt}) मधून किती रक्कम परत मिळाली?`, String(u.remAmt));
    if (payStr === null) return;
    const payAmt = Number(payStr || 0);
    if (!payAmt || payAmt <= 0) return;

    const nextPaid = Math.min(u.amt, u.paidAmt + payAmt);
    const isNowFull = nextPaid >= u.amt;
    const todayStr = getLocalIso(0);
    const activeYm = getActiveYm();
    const nowIso = new Date().toISOString();

    await col.doc(u.id).update({
      paidAmount: nextPaid,
      status: isNowFull ? "paid" : "partial",
      returnedDate: isNowFull ? todayStr : (u.returnedDate || ""),
      returnedYm: isNowFull ? activeYm : (u.returnedYm || ""),
      payments: [
        ...(Array.isArray(u.payments) ? u.payments : []),
        { amount: payAmt, date: todayStr, ym: activeYm, ts: nowIso }
      ],
      updatedAt: nowIso
    });
  }

  async function deleteUdhaari(u) {
    const col = getUdhaariCol();
    if (!col || !confirm(`'${u.name}' यांची ₹${u.amt} ची उधारी नोंद कायमची डिलीट करायची का?`)) return;
    await col.doc(u.id).delete();
  }

  function renderUdhaariModal() {
    const body = document.getElementById("proUdhaariBody");
    if (!body) return;
    const d = getUdhaariForMonth(getActiveYm());
    const todayStr = getLocalIso(0);
    const baseList = activeTab === "pending" ? d.pendingItems : activeTab === "paid" ? d.paidInMonthItems : d.dueAlertItems;
    const q = searchQuery.trim().toLowerCase();
    const list = baseList.filter((u) => !q || `${u.name} ${u.mobile} ${u.note}`.toLowerCase().includes(q));

    const cardsHtml = list.length
      ? list.map((u) => {
          const mob = cleanMob(u.mobile);
          const hasMob = mob.length >= 10;
          const isDue = !u.isFullyPaid && u.promiseDate && u.promiseDate <= todayStr;
          const rollNote = u.givenYm < d.activeYm ? `<span class="badge warn-text" style="font-size:0.62rem;">मागील महिन्याची उधारी</span>` : "";
          const timelineLine = u.isFullyPaid
            ? `✅ घेतले: ${esc(fmtYmMr(u.givenYm))} (${esc(fmtDateShort(u.givenDate))}) → परत दिले: ${esc(fmtYmMr(u.returnedYm || d.activeYm))} (${esc(fmtDateShort(u.returnedDate))})`
            : `📅 दिले: ${esc(fmtYmMr(u.givenYm))} (${esc(fmtDateShort(u.givenDate))})${u.promiseDate ? ` • ⏰ वायदा: ${esc(fmtDateShort(u.promiseDate))}` : ""}`;

          return `
            <div class="ud-card ${u.isFullyPaid ? "is-paid" : isDue ? "is-due" : ""}">
              <div class="ud-card-top">
                <div style="min-width:0;">
                  <div class="ud-name">${esc(u.name)} ${rollNote}</div>
                  <div class="ud-meta">${timelineLine}</div>
                  ${u.paidAmt > 0 && !u.isFullyPaid ? `<div class="ud-meta" style="color:var(--accent-2);">अर्धवट जमा: ${fmtInr(u.paidAmt)} / एकूण ${fmtInr(u.amt)}</div>` : ""}
                  ${u.note ? `<div class="ud-meta">📝 ${esc(u.note)}</div>` : ""}
                </div>
                <div class="ud-amt" style="color:${u.isFullyPaid ? "var(--accent-2)" : "var(--purple)"};">
                  <div>${u.isFullyPaid ? fmtInr(u.amt) : fmtInr(u.remAmt)}</div>
                  <div style="font-size:0.65rem; color:var(--muted); font-weight:700;">${u.isFullyPaid ? "परत मिळाले" : "येणे बाकी"}</div>
                </div>
              </div>
              <div class="ud-acts">
                ${!u.isFullyPaid ? `<button type="button" style="background:#15803d !important;" data-ud-pay="${esc(u.id)}">💰 जमा करा</button>` : ""}
                ${hasMob ? `<a style="background:#0f766e !important;" href="tel:${esc(mob)}" data-mobile="${esc(mob)}">📞 Call</a>` : ""}
                ${hasMob ? `<button type="button" style="background:#0d9488 !important;" data-ud-wa="${esc(u.id)}">💬 WA</button>` : ""}
                <button type="button" style="background:#6d28d9 !important;" data-ud-qr="${esc(u.id)}">📱 QR</button>
                <button type="button" style="background:#be123c !important;" data-ud-del="${esc(u.id)}">🗑️</button>
              </div>
            </div>
          `;
        }).join("")
      : `<div class="meta-box" style="text-align:center;">या विभागात सध्या कोणतीही उधारी नोंद नाही.</div>`;

    body.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
        <div>
          <h3 style="margin:0; color:var(--purple);">🤝 उधारी हिशोब (${esc(fmtYmMr(d.activeYm))})</h3>
          <div class="muted" style="font-size:0.72rem;">व्याजाच्या हिशोबापेक्षा १००% स्वतंत्र</div>
        </div>
        <div class="row" style="gap:5px;">
          <button type="button" id="udToggleAddBtn" class="success sm">${showAddForm ? "✕ बंद" : "+ नवीन उधारी"}</button>
          <button type="button" id="udPrintPdfBtn" class="primary sm">🖨️ PDF</button>
        </div>
      </div>

      <div class="ud-kpi-row">
        <div class="ud-kpi"><div class="ud-kpi-lbl">एकूण उधारी</div><div class="ud-kpi-val" style="color:var(--gold);">${fmtInr(d.totGiven)}</div></div>
        <div class="ud-kpi"><div class="ud-kpi-lbl">परत मिळाली</div><div class="ud-kpi-val" style="color:var(--accent-2);">${fmtInr(d.totReturned)}</div></div>
        <div class="ud-kpi"><div class="ud-kpi-lbl">येणे बाकी</div><div class="ud-kpi-val" style="color:var(--purple);">${fmtInr(d.totRemaining)}</div></div>
      </div>

      ${showAddForm ? `
        <div class="ud-form">
          <div class="ud-form-grid">
            <div class="field"><label>व्यक्तीचे नाव *</label><input type="text" id="udFName" placeholder="पूर्ण नाव" /></div>
            <div class="field"><label>मोबाईल नंबर</label><input type="tel" id="udFMob" placeholder="10 अंकी नंबर" /></div>
            <div class="field"><label>उधारी रक्कम (₹) *</label><input type="number" id="udFAmt" min="1" placeholder="उदा. 5000" /></div>
            <div class="field"><label>दिल्याची तारीख</label><input type="date" id="udFDate" value="${getLocalIso(0)}" /></div>
            <div class="field"><label>परतफेडीचा वायदा</label><input type="date" id="udFPromise" /></div>
            <div class="field"><label>टीप (पर्यायी)</label><input type="text" id="udFNote" placeholder="कारण / तपशील" /></div>
          </div>
          <button type="button" id="udFSaveBtn" class="success" style="width:100%;">💾 उधारी सेव्ह करा</button>
        </div>
      ` : ""}

      <div class="ud-tabs">
        <button type="button" class="ud-tab-btn ${activeTab === "pending" ? "is-active" : ""}" data-udtab="pending">⏳ बाकी (${d.pendingItems.length})</button>
        <button type="button" class="ud-tab-btn ${activeTab === "due" ? "is-active" : ""}" data-udtab="due">🔔 वायदे (${d.dueAlertItems.length})</button>
        <button type="button" class="ud-tab-btn ${activeTab === "paid" ? "is-active" : ""}" data-udtab="paid">✅ जमा (${d.paidInMonthItems.length})</button>
      </div>

      <input type="text" id="udSearchInp" class="search-pill-box" value="${esc(searchQuery)}" placeholder="🔍 उधारी यादीत नाव किंवा मोबाईल शोधा..." style="margin-bottom:9px;" />
      <div>${cardsHtml}</div>
    `;

    document.getElementById("udToggleAddBtn")?.addEventListener("click", () => {
      showAddForm = !showAddForm;
      renderUdhaariModal();
    });

    document.getElementById("udFSaveBtn")?.addEventListener("click", async () => {
      const name = (document.getElementById("udFName")?.value || "").trim();
      const amount = Number(document.getElementById("udFAmt")?.value || 0);
      if (!name || amount <= 0) {
        alert("कृपया व्यक्तीचे नाव आणि उधारीची रक्कम (₹) टाका.");
        return;
      }
      const ok = await addNewUdhaari({
        name,
        mobile: document.getElementById("udFMob")?.value || "",
        amount,
        givenDate: document.getElementById("udFDate")?.value || getLocalIso(0),
        promiseDate: document.getElementById("udFPromise")?.value || "",
        note: document.getElementById("udFNote")?.value || ""
      });
      if (ok) showAddForm = false;
    });

    body.querySelectorAll("[data-udtab]").forEach((btn) =>
      btn.addEventListener("click", () => {
        activeTab = btn.getAttribute("data-udtab");
        renderUdhaariModal();
      })
    );

    const sInp = document.getElementById("udSearchInp");
    sInp?.addEventListener("input", () => {
      searchQuery = sInp.value;
      const pos = sInp.selectionStart || searchQuery.length;
      renderUdhaariModal();
      const next = document.getElementById("udSearchInp");
      if (next) {
        next.focus();
        next.setSelectionRange(pos, pos);
      }
    });

    const findById = (id) => list.find((x) => x.id === id);

    body.querySelectorAll("[data-ud-pay]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const u = findById(btn.getAttribute("data-ud-pay"));
        if (u) collectUdhaariReturn(u);
      })
    );

    body.querySelectorAll("[data-ud-del]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const u = findById(btn.getAttribute("data-ud-del"));
        if (u) deleteUdhaari(u);
      })
    );

    body.querySelectorAll("[data-ud-wa]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const u = findById(btn.getAttribute("data-ud-wa"));
        if (!u) return;
        const mob = cleanMob(u.mobile);
        const target = mob.length === 10 ? "91" + mob : mob;
        const biz = document.getElementById("tBrandTitle")?.textContent?.trim() || "व्याज हिशोब वही";
        const msg = u.isFullyPaid
          ? `नमस्कार *${u.name}*,\nतुमची उधारी *₹${u.amt.toLocaleString("en-IN")}* पूर्ण परत मिळाली आहे. धन्यवाद!\n— *${biz}*`
          : `नमस्कार *${u.name}*,\nआपणास *${fmtDateShort(u.givenDate)}* रोजी दिलेली उधारी रक्कम *₹${u.remAmt.toLocaleString("en-IN")}* येणे बाकी आहे.${u.promiseDate ? `\nपरतफेडीचा वायदा: *${fmtDateShort(u.promiseDate)}*` : ""}\nकृपया वेळेवर परत करावी. धन्यवाद!\n— *${biz}*`;
        window.open(`https://wa.me/${target}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
      })
    );

    body.querySelectorAll("[data-ud-qr]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const u = findById(btn.getAttribute("data-ud-qr"));
        if (!u) return;
        const upi = (document.getElementById("profUpiId")?.value || localStorage.getItem("hishob_self_upi") || "").trim();
        if (!upi || !upi.includes("@")) {
          alert("कृपया आधी बिझनेस प्रोफाईलमध्ये UPI ID सेव्ह करा.");
          return;
        }
        const amt = u.isFullyPaid ? u.amt : u.remAmt;
        const biz = document.getElementById("tBrandTitle")?.textContent?.trim() || "व्याज हिशोब वही";
        const upiStr = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(biz)}&am=${amt}&cu=INR&tn=${encodeURIComponent("Udhaari " + u.name)}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiStr)}`;
        document.getElementById("smartInfoTitle").textContent = `📱 उधारी UPI QR — ${u.name}`;
        document.getElementById("smartInfoBody").innerHTML = `
          <div style="text-align:center; padding:10px;">
            <img src="${qrUrl}" alt="UPI QR" style="width:210px; height:210px; border-radius:12px; background:#fff; padding:8px;" />
            <div style="margin-top:8px; font-weight:800;">UPI ID: ${esc(upi)}</div>
            <div style="margin-top:4px; font-size:1.05rem; font-weight:900; color:var(--accent-2);">उधारी रक्कम: ₹${amt.toLocaleString("en-IN")}</div>
          </div>
        `;
        document.getElementById("smartInfoModal")?.classList.remove("hidden");
      })
    );

    document.getElementById("udPrintPdfBtn")?.addEventListener("click", () => {
      const printArea = document.getElementById("printArea");
      if (!printArea) return;
      const biz = document.getElementById("tBrandTitle")?.textContent?.trim() || "व्याज हिशोब वही";
      const rows = list.map((u, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(u.name)}</td>
          <td>${esc(fmtDateShort(u.givenDate))}</td>
          <td>${esc(fmtDateShort(u.promiseDate))}</td>
          <td>₹${u.amt.toLocaleString("en-IN")}</td>
          <td>₹${u.remAmt.toLocaleString("en-IN")}</td>
          <td>${u.isFullyPaid ? `परत (${esc(fmtYmMr(u.returnedYm))})` : "बाकी"}</td>
        </tr>
      `).join("");
      printArea.innerHTML = `
        <h2>${esc(biz)} — उधारी अहवाल (${esc(fmtYmMr(d.activeYm))})</h2>
        <p>एकूण उधारी: ₹${d.totGiven.toLocaleString("en-IN")} | परत मिळाली: ₹${d.totReturned.toLocaleString("en-IN")} | येणे बाकी: ₹${d.totRemaining.toLocaleString("en-IN")}</p>
        <table>
          <thead><tr><th>क्र.</th><th>नाव</th><th>दिलेली तारीख</th><th>वायदा</th><th>एकूण</th><th>बाकी</th><th>स्थिती</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      window.print();
    });
  }

  function openUdhaariModal(tab = "pending") {
    activeTab = tab;
    const modal = ensureUdhaariModal();
    renderUdhaariModal();
    modal.classList.remove("hidden");
  }

  function syncUdhaariDashboard() {
    ensureUdhaariDashboardButton();
    updateUdhaariAlertBanner();
  }

  function bindAuthUdhaariSync() {
    if (typeof firebase === "undefined" || !firebase.auth) {
      setTimeout(bindAuthUdhaariSync, 600);
      return;
    }
    firebase.auth().onAuthStateChanged((user) => {
      if (typeof unsubUdhaari === "function") {
        unsubUdhaari();
        unsubUdhaari = null;
      }
      if (!user) {
        udhaariList = [];
        return;
      }
      unsubUdhaari = firebase.firestore().collection("users").doc(user.uid).collection("udhaari").onSnapshot(
        (snap) => {
          udhaariList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          syncUdhaariDashboard();
          const modal = document.getElementById("proUdhaariModal");
          if (modal && !modal.classList.contains("hidden")) renderUdhaariModal();
        },
        (err) => console.warn("Udhaari Sync Warning:", err)
      );
    });
  }

  // Self-Healing: लाईन चार्ट किंवा कोणत्याही डॅशबोर्ड बटनावर क्लिक होताच उधारी बटण तपासा
  function bindSelfHealingTrigger() {
    document.addEventListener("click", (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest("#appScreen button") : null;
      if (!btn) return;
      const t = (btn.textContent || "").trim();
      if (t.includes("लाईन चार्ट") || t.includes("रिपोर्ट्स हब") || t.includes("Risk")) {
        requestAnimationFrame(ensureUdhaariDashboardButton);
        setTimeout(ensureUdhaariDashboardButton, 180);
      }
    }, true);
  }

  // Backup Bridge (live-backup.js साठी)
  window.getProUdhaariList = () => udhaariList;
  window.openProUdhaari = openUdhaariModal;

  function initUdhaariPro() {
    injectUdhaariCss();
    ensureUdhaariModal();
    bindAuthUdhaariSync();
    bindSelfHealingTrigger();

    if (window.VyajHub && typeof window.VyajHub.register === "function") {
      window.VyajHub.register("udhaari-pro", syncUdhaariDashboard);
    } else {
      syncUdhaariDashboard();
    }
    // Analytics उशिरा लोड झाल्यास एकच हलकी खात्रीशीर तपासणी
    setTimeout(syncUdhaariDashboard, 1600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUdhaariPro);
  } else {
    initUdhaariPro();
  }
})();
