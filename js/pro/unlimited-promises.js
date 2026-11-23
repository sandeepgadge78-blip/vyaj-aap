// व्याज हिशोब वही - अमर्यादित (Unlimited) डायनॅमिक वायदे मॅनेजर + जुन्या promiseDate1-3 शी १००% ऑटो-सिंक (js/pro/unlimited-promises.js - V14.35)
(function () {
  let scanTimer = null;

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
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

  function normDate(raw) {
    if (window.VyajSchema && typeof window.VyajSchema.normalizeDate === "function") {
      return window.VyajSchema.normalizeDate(raw);
    }
    const s = String(raw || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function getBorrowerById(id) {
    if (!window.HishobBridge || typeof window.HishobBridge.getBorrowers !== "function") return null;
    return (window.HishobBridge.getBorrowers() || []).find((x) => x.id === id) || null;
  }

  // जुने promiseDate1-3 व नवीन promiseList[] सुरक्षितपणे एकत्र करा (एकही जुना वायदा गहाळ होऊ नये म्हणून)
  function getUnifiedPromises(b) {
    if (!b) return [];
    const list = Array.isArray(b.promiseList)
      ? b.promiseList
          .filter((p) => p && normDate(p.date))
          .map((p, idx) => ({
            id: p.id || `pr_${idx}_${p.date}`,
            date: normDate(p.date),
            amount: Number(p.amount || 0),
            note: String(p.note || "").trim(),
            status: p.status === "done" ? "done" : "pending",
            createdAt: p.createdAt || ""
          }))
      : [];

    const existingDates = new Set(list.map((p) => p.date));
    [b.promiseDate1, b.promiseDate2, b.promiseDate3].forEach((rawD, i) => {
      const nd = normDate(rawD);
      if (nd && !existingDates.has(nd)) {
        existingDates.add(nd);
        list.push({
          id: `leg_${i + 1}_${nd}`,
          date: nd,
          amount: 0,
          note: "",
          status: "pending",
          createdAt: ""
        });
      }
    });

    // आधी सक्रिय (pending) वायदे तारखेनुसार, मग पूर्ण झालेले (done)
    list.sort((a, c) => {
      if (a.status !== c.status) return a.status === "pending" ? -1 : 1;
      return a.date.localeCompare(c.date);
    });
    return list;
  }

  // Firestore मध्ये promiseList[] सेव्ह करा + जवळच्या ३ सक्रिय तारखा promiseDate1/2/3 मध्ये ऑटो-सिंक करा
  async function saveUnifiedPromises(borrowerId, nextList) {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user) { alert("कृपया आधी लॉगिन करा."); return false; }

    const cleanList = nextList
      .filter((p) => p && normDate(p.date))
      .map((p) => ({
        id: p.id || `pr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        date: normDate(p.date),
        amount: Number(p.amount || 0),
        note: String(p.note || "").trim(),
        status: p.status === "done" ? "done" : "pending",
        createdAt: p.createdAt || new Date().toISOString()
      }));

    // app.js, promise-bar.js व smart-radar.js साठी सर्वात जवळच्या ३ सक्रिय तारखा ऑटो-सिंक करा
    const activeUniqueDates = Array.from(
      new Set(cleanList.filter((p) => p.status !== "done").map((p) => p.date).sort())
    );

    const payload = {
      promiseList: cleanList,
      promiseDate1: activeUniqueDates[0] || "",
      promiseDate2: activeUniqueDates[1] || "",
      promiseDate3: activeUniqueDates[2] || "",
      updatedAt: new Date().toISOString()
    };

    try {
      await firebase.firestore().collection("users").doc(user.uid).collection("borrowers").doc(borrowerId).update(payload);
      return true;
    } catch (err) {
      alert("वायदा सेव्ह करताना एरर: " + err.message);
      return false;
    }
  }

  function getPromiseStatusBadge(p, todayStr, tmrStr) {
    if (p.status === "done") return `<span class="up-pill done">✅ पूर्ण</span>`;
    if (p.date === todayStr) return `<span class="up-pill today">🔴 आज</span>`;
    if (p.date === tmrStr) return `<span class="up-pill tmr">🟠 उद्या</span>`;
    if (p.date < todayStr) return `<span class="up-pill late">⚠️ उलटला</span>`;
    return `<span class="up-pill soon">⏳ येणारा</span>`;
  }

  function injectUnlimitedPromisesCss() {
    if (document.getElementById("vyajUnlimitedPromisesCss")) return;
    const st = document.createElement("style");
    st.id = "vyajUnlimitedPromisesCss";
    st.textContent = `
      .up-wrap { display: flex; flex-direction: column; gap: 7px; }
      .up-top-bar { display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap; }
      .up-add-btn {
        padding: 4px 10px !important; font-size: 0.72rem !important; font-weight: 800 !important;
        border-radius: 999px !important;
      }

      .up-form {
        padding: 8px 9px; border-radius: 10px;
        background: rgba(125, 211, 252, 0.08); border: 1px dashed rgba(125, 211, 252, 0.4);
        display: flex; flex-direction: column; gap: 6px;
      }
      body.light-mode .up-form { background: #eef6f5; border-color: #5eead4; }
      .up-form-row { display: grid; grid-template-columns: 1.2fr 1fr; gap: 6px; }
      .up-form input { padding: 5px 8px !important; font-size: 0.76rem !important; border-radius: 8px !important; width: 100%; }
      .up-form-acts { display: flex; gap: 6px; justify-content: flex-end; }
      .up-form-acts button { padding: 4px 10px !important; font-size: 0.71rem !important; border-radius: 8px !important; }

      .up-list { display: flex; flex-direction: column; gap: 5px; }
      .up-row {
        display: flex; align-items: center; justify-content: space-between; gap: 6px;
        padding: 6px 8px; border-radius: 9px;
        background: var(--meta-bg); border: 1px solid var(--border);
      }
      .up-row.is-done { opacity: 0.62; }
      .up-row-left { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .up-date-line { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; font-size: 0.77rem; font-weight: 800; color: var(--text); }
      .up-note-line { font-size: 0.69rem; color: var(--muted); }

      .up-pill { font-size: 0.62rem; font-weight: 800; padding: 1px 6px; border-radius: 999px; }
      .up-pill.today { background: rgba(190, 18, 60, 0.25); color: #fda4af; border: 1px solid rgba(240, 113, 120, 0.5); }
      .up-pill.tmr { background: rgba(180, 83, 9, 0.25); color: #fcd34d; border: 1px solid rgba(229, 169, 82, 0.5); }
      .up-pill.late { background: rgba(159, 18, 57, 0.22); color: #f07178; border: 1px solid rgba(240, 113, 120, 0.45); }
      .up-pill.soon { background: rgba(14, 165, 233, 0.16); color: var(--accent); border: 1px solid rgba(125, 211, 252, 0.35); }
      .up-pill.done { background: rgba(22, 101, 52, 0.25); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.4); }
      body.light-mode .up-pill.today, body.light-mode .up-pill.late { background: #ffe4e6; color: #be123c; }
      body.light-mode .up-pill.tmr { background: #fef3c7; color: #b45309; }
      body.light-mode .up-pill.done { background: #dcfce7; color: #15803d; }

      .up-row-acts { display: flex; gap: 4px; flex-shrink: 0; }
      .up-ic-btn {
        padding: 3px 6px !important; font-size: 0.69rem !important; border-radius: 7px !important;
        min-width: 26px; text-align: center;
      }
    `;
    document.head.appendChild(st);
  }

  function renderWidgetInside(widgetEl, bId, showForm) {
    const b = getBorrowerById(bId);
    if (!b) return;

    const list = getUnifiedPromises(b);
    const todayStr = getLocalIso(0);
    const tmrStr = getLocalIso(1);
    const activeCnt = list.filter((p) => p.status !== "done").length;

    const rowsHtml = list.length
      ? list.map((p) => `
          <div class="up-row ${p.status === "done" ? "is-done" : ""}">
            <div class="up-row-left">
              <div class="up-date-line">
                <span>📅 ${esc(fmtDateShort(p.date))}</span>
                ${getPromiseStatusBadge(p, todayStr, tmrStr)}
                ${p.amount > 0 ? `<span style="color:var(--gold);">₹${Number(p.amount).toLocaleString("en-IN")}</span>` : ""}
              </div>
              ${p.note ? `<div class="up-note-line">📝 ${esc(p.note)}</div>` : ""}
            </div>
            <div class="up-row-acts">
              <button type="button" class="up-ic-btn ${p.status === "done" ? "primary" : "success"}" data-up-toggle="${esc(p.id)}" title="${p.status === "done" ? "पुन्हा सक्रिय करा" : "पूर्ण झाले"}">${p.status === "done" ? "↺" : "✓"}</button>
              <button type="button" class="up-ic-btn primary" data-up-edit="${esc(p.id)}" title="तारीख बदला">✏️</button>
              <button type="button" class="up-ic-btn danger" data-up-del="${esc(p.id)}" title="काढा">🗑️</button>
            </div>
          </div>
        `).join("")
      : `<div class="muted" style="font-size:0.74rem; padding:4px 2px;">कोणताही वायदा नोंदवलेला नाही — वर '+ नवीन वायदा' दाबा.</div>`;

    widgetEl.innerHTML = `
      <div class="up-top-bar">
        <span class="muted" style="font-size:0.72rem; font-weight:700;">सक्रिय वायदे: <strong style="color:var(--accent);">${activeCnt}</strong> (एकूण ${list.length})</span>
        <button type="button" class="primary up-add-btn" data-up-openform="1">${showForm ? "✕ बंद" : "+ नवीन वायदा"}</button>
      </div>

      ${showForm ? `
        <div class="up-form">
          <div class="up-form-row">
            <input type="date" data-up-fdate="1" value="${getLocalIso(0)}" />
            <input type="number" data-up-famt="1" min="0" placeholder="रक्कम ₹ (पर्यायी)" />
          </div>
          <input type="text" data-up-fnote="1" placeholder="छोटी टीप (उदा. पगार झाल्यावर, संध्याकाळी)..." />
          <div class="up-form-acts">
            <button type="button" data-up-cancel="1">रद्द</button>
            <button type="button" class="success" data-up-save="1">💾 वायदा सेव्ह करा</button>
          </div>
        </div>
      ` : ""}

      <div class="up-list">${rowsHtml}</div>
    `;

    widgetEl.querySelector("[data-up-openform]")?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      renderWidgetInside(widgetEl, bId, !showForm);
    });

    widgetEl.querySelector("[data-up-cancel]")?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      renderWidgetInside(widgetEl, bId, false);
    });

    widgetEl.querySelector("[data-up-save]")?.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const dt = widgetEl.querySelector("[data-up-fdate]")?.value || "";
      const amt = Number(widgetEl.querySelector("[data-up-famt]")?.value || 0);
      const note = (widgetEl.querySelector("[data-up-fnote]")?.value || "").trim();
      if (!dt) { alert("कृपया वायद्याची तारीख निवडा."); return; }

      const nextList = [
        ...getUnifiedPromises(getBorrowerById(bId)),
        { id: `pr_${Date.now()}`, date: dt, amount: amt, note, status: "pending", createdAt: new Date().toISOString() }
      ];
      await saveUnifiedPromises(bId, nextList);
    });

    widgetEl.querySelectorAll("[data-up-toggle]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const pid = btn.getAttribute("data-up-toggle");
        const nextList = getUnifiedPromises(getBorrowerById(bId)).map((p) =>
          p.id === pid ? { ...p, status: p.status === "done" ? "pending" : "done" } : p
        );
        await saveUnifiedPromises(bId, nextList);
      });
    });

    widgetEl.querySelectorAll("[data-up-edit]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const pid = btn.getAttribute("data-up-edit");
        const curList = getUnifiedPromises(getBorrowerById(bId));
        const target = curList.find((p) => p.id === pid);
        if (!target) return;
        const newDt = prompt("नवीन वायदा तारीख टाका (YYYY-MM-DD):", target.date);
        if (!newDt || !/^\d{4}-\d{2}-\d{2}$/.test(newDt.trim())) return;
        const nextList = curList.map((p) => (p.id === pid ? { ...p, date: newDt.trim(), status: "pending" } : p));
        await saveUnifiedPromises(bId, nextList);
      });
    });

    widgetEl.querySelectorAll("[data-up-del]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const pid = btn.getAttribute("data-up-del");
        if (!confirm("हा वायदा काढून टाकायचा का?")) return;
        const nextList = getUnifiedPromises(getBorrowerById(bId)).filter((p) => p.id !== pid);
        await saveUnifiedPromises(bId, nextList);
      });
    });
  }

  // फक्त उघडलेल्या ग्राहक कार्डमधील जुना ३-बॉक्स ग्रिड बदलून अमर्यादित वायदे मॅनेजर बसवा (On-Demand)
  function upgradeVisiblePromiseSections() {
    const visibleDetails = document.querySelectorAll('#borrowersList [id^="cardDetails_"]:not(.hidden)');
    visibleDetails.forEach((detWrap) => {
      const bId = detWrap.id.replace("cardDetails_", "");
      const oldGrid = detWrap.querySelector(".sc-promise-grid");
      if (!oldGrid || oldGrid.dataset.upReplaced === "1") return;
      oldGrid.dataset.upReplaced = "1";

      // डुप्लिकेट '8) वायद्याच्या ३ तारखा:' शीर्षक लपवा (WA रिमाइंडर बटण स्वच्छ ठेवून)
      const sec = oldGrid.closest(".sc-sec");
      if (sec) {
        const strongHeading = sec.querySelector("strong");
        if (strongHeading && (strongHeading.textContent || "").includes("वायद्याच्या")) {
          strongHeading.style.display = "none";
        }
      }

      const widget = document.createElement("div");
      widget.className = "up-wrap";
      widget.setAttribute("data-up-widget", bId);
      oldGrid.replaceWith(widget);
      renderWidgetInside(widget, bId, false);
    });
  }

  function initUnlimitedPromises() {
    injectUnlimitedPromisesCss();

    const listEl = document.getElementById("borrowersList");
    if (listEl) {
      const obs = new MutationObserver(() => {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(upgradeVisiblePromiseSections, 70);
      });
      obs.observe(listEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

      listEl.addEventListener("click", () => {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(upgradeVisiblePromiseSections, 70);
      });
    }
    setTimeout(upgradeVisiblePromiseSections, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUnlimitedPromises);
  else initUnlimitedPromises();
})();
