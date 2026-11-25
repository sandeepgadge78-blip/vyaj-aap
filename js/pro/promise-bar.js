// व्याज हिशोब वही - VyajKernel Powered Anti-Blink वायदा अलर्ट पट्टी + १००% ऑटो-क्लोज (js/pro/promise-bar.js - V15.1)
(function () {
  let isExpanded = false;
  let activeTab = "today";
  let snoozeOpenId = null;
  let lastRenderSig = "";

  function getLocalIso(offsetDays = 0) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function normalizeIsoDate(raw) {
    if (!raw) return "";
    if (window.VyajSchema && typeof window.VyajSchema.normalizeDate === "function") {
      return window.VyajSchema.normalizeDate(raw);
    }
    const s = String(raw).trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : "";
  }

  function forceCloseDrawer() {
    if (!isExpanded && !snoozeOpenId) return;
    isExpanded = false;
    snoozeOpenId = null;
    lastRenderSig = "";
    renderActivityPanel();
  }

  function injectPromiseBarCss() {
    if (document.getElementById("vyajPromiseActivityCss")) return;
    const st = document.createElement("style");
    st.id = "vyajPromiseActivityCss";
    st.textContent = `
      #todayPromiseAlert, #smartPromiseDashPanel { display: none !important; }
      .pb-wrap {
        margin-bottom: 10px; border-radius: 15px; overflow: hidden;
        background: linear-gradient(145deg, rgba(24, 27, 35, 0.94), rgba(14, 16, 22, 0.96));
        border: 1px solid rgba(255, 255, 255, 0.13); box-shadow: var(--glass-shadow);
      }
      body.light-mode .pb-wrap { background: #fbfaf7; border-color: #d5cfc2; }
      .pb-wrap.has-urgent { border-left: 3px solid var(--danger); }
      .pb-wrap.all-clear { border-left: 3px solid var(--accent-2); }
      .pb-activity-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 11px; cursor: pointer; user-select: none; }
      .pb-activity-bar:active { opacity: 0.88; }
      .pb-bar-left { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
      .pb-pulse { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; background: #f07178; box-shadow: 0 0 8px rgba(240, 113, 120, 0.75); }
      .pb-pulse.calm { background: #4ade80; box-shadow: 0 0 8px rgba(74, 222, 128, 0.65); }
      .pb-pulse.warn { background: #e5a952; box-shadow: 0 0 8px rgba(229, 169, 82, 0.7); }
      .pb-bar-texts { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
      .pb-bar-title { font-size: 0.79rem; font-weight: 800; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pb-bar-sub { font-size: 0.68rem; color: var(--muted); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pb-bar-right { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
      .pb-push-pill { padding: 4px 8px !important; font-size: 0.67rem !important; font-weight: 800 !important; border-radius: 999px !important; }
      .pb-toggle-chip { padding: 4px 9px; border-radius: 999px; font-size: 0.7rem; font-weight: 800; background: rgba(255, 255, 255, 0.08); border: 1px solid var(--border); color: var(--accent); }
      body.light-mode .pb-toggle-chip { background: #eae6dd; }
      .pb-drawer { border-top: 1px solid var(--border); padding: 10px 10px 11px; background: rgba(9, 10, 14, 0.5); }
      body.light-mode .pb-drawer { background: #f4f1ea; }
      .pb-tabs { display: flex; gap: 5px; overflow-x: auto; margin-bottom: 9px; scrollbar-width: none; }
      .pb-tabs::-webkit-scrollbar { display: none; }
      .pb-tab-btn { flex: 1 0 auto; padding: 5px 10px !important; font-size: 0.72rem !important; font-weight: 800 !important; border-radius: 999px !important; background: var(--card-2) !important; color: var(--text) !important; }
      .pb-tab-btn.active { background: #eceff4 !important; color: #090a0d !important; border-color: #eceff4 !important; }
      body.light-mode .pb-tab-btn.active { background: #1f242d !important; color: #fbfaf7 !important; border-color: #1f242d !important; }
      .pb-list { max-height: 360px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
      .pb-card { padding: 10px 11px; border-radius: 12px; background: var(--card-solid); border: 1px solid var(--border); }
      .pb-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
      .pb-cust-name { font-size: 0.88rem; font-weight: 800; color: var(--text); cursor: pointer; }
      .pb-cust-meta { font-size: 0.71rem; color: var(--muted); margin-top: 2px; }
      .pb-amt { font-size: 0.92rem; font-weight: 900; color: var(--gold); white-space: nowrap; }
      .pb-acts { display: flex; flex-wrap: nowrap; gap: 6px; margin-top: 8px; overflow-x: auto; scrollbar-width: none; }
      .pb-acts::-webkit-scrollbar { display: none; }
      .pb-act-btn { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px !important; border-radius: 999px !important; font-size: 0.72rem !important; font-weight: 800 !important; text-decoration: none !important; color: #fff !important; border: 1px solid rgba(255, 255, 255, 0.18) !important; cursor: pointer; }
      .pb-act-btn.pb-call { background: linear-gradient(135deg, #166534, #15803d) !important; }
      .pb-act-btn.pb-call-none { background: #475569 !important; }
      .pb-act-btn.pb-wa { background: linear-gradient(135deg, #0f766e, #0d9488) !important; }
      .pb-act-btn.pb-qr { background: linear-gradient(135deg, #6d28d9, #7c3aed) !important; }
      .pb-act-btn.pb-pay { background: linear-gradient(135deg, #b45309, #d97706) !important; }
      .pb-act-btn.pb-snooze { background: linear-gradient(135deg, #9f1239, #be123c) !important; }
      .pb-snooze-row { margin-top: 8px; padding-top: 7px; border-top: 1px dashed var(--border); display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
      .pb-snooze-row button { padding: 4px 8px !important; font-size: 0.69rem !important; border-radius: 8px !important; }
      .pb-snooze-row input[type="date"] { padding: 4px 6px !important; font-size: 0.71rem !important; }
      #uiProNewBtn { bottom: 64px !important; padding: 7px 12px !important; font-size: 0.76rem !important; }
    `;
    document.head.appendChild(st);
  }

  // VyajKernel च्या तयार rows मधून वायदे काढा (वेगळे गणित न करता)
  function collectPromiseBuckets(kernelReport) {
    const out = { today: [], tomorrow: [], overdue: [] };
    const K = window.VyajKernel;
    if (!K) return out;

    const r = kernelReport || K.getMonthReport();
    const todayStr = getLocalIso(0);
    const tomorrowStr = getLocalIso(1);

    (r.rows || []).forEach((row) => {
      if (row.isClosed || row.totalPending <= 0) return;
      const b = row.b;
      if (!b) return;

      const fields = [
        { field: "promiseDate1", val: normalizeIsoDate(b.promiseDate1 || b.promise1) },
        { field: "promiseDate2", val: normalizeIsoDate(b.promiseDate2 || b.promise2) },
        { field: "promiseDate3", val: normalizeIsoDate(b.promiseDate3 || b.promise3) }
      ];

      // अमर्यादित वायदे (promiseList) सुद्धा तपासा
      if (Array.isArray(b.promiseList)) {
        b.promiseList.forEach((p) => {
          if (p && p.status !== "done" && p.date) {
            fields.push({ field: "promiseDate1", val: normalizeIsoDate(p.date) });
          }
        });
      }

      const validFields = fields.filter((x) => Boolean(x.val));
      if (!validFields.length) return;

      const todayHit = validFields.find((x) => x.val === todayStr);
      const tmrHit = validFields.find((x) => x.val === tomorrowStr);
      const pastHits = validFields.filter((x) => x.val < todayStr).sort((a, c) => c.val.localeCompare(a.val));

      if (todayHit) out.today.push({ b, pending: row.totalPending, date: todayHit.val, field: todayHit.field });
      else if (tmrHit) out.tomorrow.push({ b, pending: row.totalPending, date: tmrHit.val, field: tmrHit.field });
      else if (pastHits.length) out.overdue.push({ b, pending: row.totalPending, date: pastHits[0].val, field: pastHits[0].field });
    });

    out.today.sort((a, c) => c.pending - a.pending);
    out.tomorrow.sort((a, c) => c.pending - a.pending);
    out.overdue.sort((a, c) => c.date.localeCompare(a.date));
    return out;
  }

  async function snoozePromiseDate(borrowerId, fieldName, nextDateIso) {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user || !nextDateIso) return;
    try {
      await firebase.firestore().collection("users").doc(user.uid).collection("borrowers").doc(borrowerId).update({
        [fieldName || "promiseDate1"]: nextDateIso,
        updatedAt: new Date().toISOString()
      });
      snoozeOpenId = null;
      lastRenderSig = "";
      if (window.VyajKernel) window.VyajKernel.refresh();
    } catch (err) {
      alert("तारीख बदलताना एरर आला: " + err.message);
    }
  }

  function jumpToCustomerCard(borrowerId) {
    forceCloseDrawer();
    const area = document.querySelector(`#borrowersList .nc-clickable-area[data-toggle-card="${borrowerId}"]`);
    if (area) {
      area.scrollIntoView({ behavior: "smooth", block: "center" });
      const detailsEl = document.getElementById(`cardDetails_${borrowerId}`);
      if (detailsEl && detailsEl.classList.contains("hidden")) area.click();
    } else if (typeof window.openProCustomerDetails === "function") {
      window.openProCustomerDetails(borrowerId);
    }
  }

  function ensureWrapContainer() {
    const appScreen = document.getElementById("appScreen");
    const heroCard = appScreen?.querySelector(".month-hero-card");
    if (!appScreen || !heroCard) return null;
    let wrap = document.getElementById("proPromiseActivityWrap");
    if (!wrap) {
      wrap = document.createElement("section");
      wrap.id = "proPromiseActivityWrap";
      wrap.className = "pb-wrap";
      appScreen.insertBefore(wrap, heroCard);
    }
    return wrap;
  }

  function renderActivityPanel(kernelReport) {
    const K = window.VyajKernel;
    if (!K) return;

    const wrap = ensureWrapContainer();
    if (!wrap) return;

    const buckets = collectPromiseBuckets(kernelReport);
    const todayCnt = buckets.today.length;
    const tmrCnt = buckets.tomorrow.length;
    const ovCnt = buckets.overdue.length;
    const todaySum = buckets.today.reduce((s, x) => s + x.pending, 0);
    const ovSum = buckets.overdue.reduce((s, x) => s + x.pending, 0);
    const isPushOn = "Notification" in window && Notification.permission === "granted";
    const isHiddenAmt = document.body.classList.contains("hide-amounts");

    // Smart Diff: जर पट्टी बंद असेल आणि आकडे बदलले नसतील तर पुन्हा पुसून लिहू नका (०% ब्लिंकिंग)
    const sig = `${isExpanded}|${activeTab}|${snoozeOpenId || ""}|${todayCnt}|${tmrCnt}|${ovCnt}|${todaySum}|${ovSum}|${isPushOn}|${isHiddenAmt}`;
    if (sig === lastRenderSig && wrap.children.length > 0) return;
    lastRenderSig = sig;

    if (activeTab === "today" && todayCnt === 0) {
      if (ovCnt > 0) activeTab = "overdue";
      else if (tmrCnt > 0) activeTab = "tomorrow";
    }

    let barTitle = "✅ आज कोणताही बाकी वायदा नाही";
    let barSub = tmrCnt || ovCnt ? `उद्या: ${tmrCnt} • थकीत वायदे: ${ovCnt}` : "सर्व वायदे वेळेत आहेत";
    let pulseCls = "calm", wrapCls = "all-clear";

    if (todayCnt > 0) {
      barTitle = `🔔 आजचे ${todayCnt} वायदे • एकूण ${K.fmtInr(todaySum)}`;
      barSub = `उद्या: ${tmrCnt} • थकीत: ${ovCnt} • तपशील पाहण्यासाठी टॅप करा`;
      pulseCls = ""; wrapCls = "has-urgent";
    } else if (ovCnt > 0) {
      barTitle = `⚠️ ${ovCnt} थकीत वायदे • एकूण ${K.fmtInr(ovSum)}`;
      barSub = `आज: 0 • उद्या: ${tmrCnt} • यादी पाहण्यासाठी टॅप करा`;
      pulseCls = "warn"; wrapCls = "has-urgent";
    } else if (tmrCnt > 0) {
      barTitle = `📅 उद्याचे ${tmrCnt} वायदे नियोजित आहेत`;
      barSub = `आज: 0 • यादी पाहण्यासाठी टॅप करा`;
      pulseCls = "warn"; wrapCls = "";
    }

    wrap.className = `pb-wrap ${wrapCls}`;
    const activeItems = buckets[activeTab] || [];
    const activeYm = K.getActiveYm();

    const cardsHtml = activeItems.length
      ? activeItems.map(({ b, pending, date, field }) => {
          const mob = K.cleanMob(b.mobile);
          const hasMob = mob.length >= 10;
          const isSnoozeOpen = snoozeOpenId === b.id;

          const callHtml = hasMob
            ? `<a href="tel:${K.esc(mob)}" class="pb-act-btn pb-call">📞 Call</a>`
            : `<button type="button" class="pb-act-btn pb-call-none" data-pb-addmob="${K.esc(b.id)}">📞 +नंबर</button>`;

          const waHtml = hasMob
            ? `<button type="button" class="pb-act-btn pb-wa" data-pb-wa="${K.esc(mob)}" data-name="${K.esc(b.name)}" data-amt="${pending}" data-dt="${K.esc(K.fmtDateShort(date))}">💬 WA</button>`
            : "";

          const snoozeHtml = isSnoozeOpen
            ? `<div class="pb-snooze-row"><span class="muted" style="font-size:0.69rem; font-weight:700;">पुढे ढकला:</span><button type="button" class="primary" data-pb-setdate="${K.esc(b.id)}" data-field="${K.esc(field)}" data-iso="${getLocalIso(1)}">उद्या</button><button type="button" class="primary" data-pb-setdate="${K.esc(b.id)}" data-field="${K.esc(field)}" data-iso="${getLocalIso(3)}">+३ दिन</button><button type="button" class="primary" data-pb-setdate="${K.esc(b.id)}" data-field="${K.esc(field)}" data-iso="${getLocalIso(7)}">+७ दिन</button><input type="date" value="${K.esc(date)}" data-pb-customdate="${K.esc(b.id)}" data-field="${K.esc(field)}" /></div>`
            : "";

          return `
            <div class="pb-card">
              <div class="pb-card-top">
                <div style="min-width:0;">
                  <div class="pb-cust-name" data-pb-jump="${K.esc(b.id)}">${K.esc(b.name || "ग्राहक")}</div>
                  <div class="pb-cust-meta">📅 ${K.esc(K.fmtDateShort(date))}${hasMob ? ` • 📱 ${K.esc(mob)}` : " • मोबाईल नाही"}</div>
                </div>
                <div class="pb-amt">${K.fmtInr(pending)}</div>
              </div>
              <div class="pb-acts">
                ${callHtml}
                ${waHtml}
                <button type="button" class="pb-act-btn pb-qr" data-pb-qr="${K.esc(b.id)}" data-amt="${pending}">📱 QR</button>
                <button type="button" class="pb-act-btn pb-pay" data-pb-jump="${K.esc(b.id)}">⚡ जमा</button>
                <button type="button" class="pb-act-btn pb-snooze" data-pb-snooze="${K.esc(b.id)}">⏰ ढकला</button>
              </div>
              ${snoozeHtml}
            </div>
          `;
        }).join("")
      : `<div class="muted" style="text-align:center; padding:14px; font-size:0.78rem;">या विभागात सध्या कोणताही बाकी वायदा नाही.</div>`;

    wrap.innerHTML = `
      <div class="pb-activity-bar" id="pbToggleBar">
        <div class="pb-bar-left">
          <span class="pb-pulse ${pulseCls}"></span>
          <div class="pb-bar-texts">
            <div class="pb-bar-title">${K.esc(barTitle)}</div>
            <div class="pb-bar-sub">${K.esc(barSub)}</div>
          </div>
        </div>
        <div class="pb-bar-right">
          <button type="button" id="pbPushStatusBtn" class="pb-push-pill ${isPushOn ? "success" : "warn"}">${isPushOn ? "✓ Auto 10/4/6" : "🔔 10/4/6 चालू करा"}</button>
          <span class="pb-toggle-chip">${isExpanded ? "बंद ▴" : "पहा ▾"}</span>
        </div>
      </div>
      ${isExpanded ? `
        <div class="pb-drawer" id="pbDrawerBody">
          <div class="pb-tabs">
            <button type="button" class="pb-tab-btn ${activeTab === "today" ? "active" : ""}" data-pbtab="today">🔴 आज (${todayCnt})</button>
            <button type="button" class="pb-tab-btn ${activeTab === "tomorrow" ? "active" : ""}" data-pbtab="tomorrow">🟠 उद्या (${tmrCnt})</button>
            <button type="button" class="pb-tab-btn ${activeTab === "overdue" ? "active" : ""}" data-pbtab="overdue">⚠️ थकीत (${ovCnt})</button>
          </div>
          <div class="pb-list">${cardsHtml}</div>
        </div>
      ` : ""}
    `;

    document.getElementById("pbToggleBar")?.addEventListener("click", (ev) => {
      if (ev.target && ev.target.closest("#pbPushStatusBtn")) return;
      isExpanded = !isExpanded;
      if (!isExpanded) snoozeOpenId = null;
      lastRenderSig = "";
      renderActivityPanel();
    });

    if (!isExpanded) return;

    wrap.querySelectorAll("[data-pbtab]").forEach((btn) => btn.addEventListener("click", () => {
      activeTab = btn.getAttribute("data-pbtab"); snoozeOpenId = null; lastRenderSig = ""; renderActivityPanel();
    }));
    wrap.querySelectorAll("[data-pb-addmob]").forEach((btn) => btn.addEventListener("click", () => {
      const bid = btn.getAttribute("data-pb-addmob");
      const mobBtn = document.querySelector(`#borrowersList button[data-action="quick-edit-mobile"][data-id="${bid}"]`);
      if (mobBtn) mobBtn.click(); else jumpToCustomerCard(bid);
    }));
    wrap.querySelectorAll("[data-pb-wa]").forEach((btn) => btn.addEventListener("click", () => {
      const mob = btn.getAttribute("data-pb-wa"), target = mob.length === 10 ? "91" + mob : mob;
      const name = btn.getAttribute("data-name") || "", amt = Number(btn.getAttribute("data-amt") || 0), dt = btn.getAttribute("data-dt") || "";
      const biz = document.getElementById("tBrandTitle")?.textContent?.trim() || "व्याज हिशोब वही";
      const msg = `नमस्कार *${name}*,\nआपला वायदा दिनांक *${dt}* असून एकूण देय रक्कम *${K.fmtInrPlain(amt)}* (${activeYm}) बाकी आहे.\nकृपया वेळेवर जमा करावी. धन्यवाद!\n— *${biz}*`;
      window.open(`https://wa.me/${target}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
    }));
    wrap.querySelectorAll("[data-pb-qr]").forEach((btn) => btn.addEventListener("click", () => {
      const bid = btn.getAttribute("data-pb-qr"), amt = Number(btn.getAttribute("data-amt") || 0);
      forceCloseDrawer();
      if (typeof window.openInvoiceReceipt === "function") window.openInvoiceReceipt(bid);
      else if (typeof window.openUpiQr === "function") window.openUpiQr(bid, amt);
    }));
    wrap.querySelectorAll("[data-pb-jump]").forEach((el) => el.addEventListener("click", () => jumpToCustomerCard(el.getAttribute("data-pb-jump"))));
    wrap.querySelectorAll("[data-pb-snooze]").forEach((btn) => btn.addEventListener("click", () => {
      const bid = btn.getAttribute("data-pb-snooze"); snoozeOpenId = snoozeOpenId === bid ? null : bid; lastRenderSig = ""; renderActivityPanel();
    }));
    wrap.querySelectorAll("[data-pb-setdate]").forEach((btn) => btn.addEventListener("click", () => snoozePromiseDate(btn.getAttribute("data-pb-setdate"), btn.getAttribute("data-field"), btn.getAttribute("data-iso"))));
    wrap.querySelectorAll("[data-pb-customdate]").forEach((inp) => inp.addEventListener("change", () => {
      if (inp.value) snoozePromiseDate(inp.getAttribute("data-pb-customdate"), inp.getAttribute("data-field"), inp.value);
    }));
  }

  function initPromiseBar() {
    injectPromiseBarCss();

    // Master UI Reset Bus: दुसरे कोणतेही ऑप्शन उघडताच 'थकीत वायदे' आपोआप बंद करा
    window.addEventListener("vyaj:resetInlineUI", forceCloseDrawer);
    window.addEventListener("vyaj:closePromiseBar", forceCloseDrawer);

    // स्वतंत्र MutationObserver ऐवजी फक्त VyajKernel च्या एकाच सिग्नलवर subscribe करा
    if (window.VyajKernel && typeof window.VyajKernel.subscribe === "function") {
      window.VyajKernel.subscribe(renderActivityPanel);
    }

    document.addEventListener("click", (ev) => {
      if (ev.target && ev.target.closest("#toggleHideAmtBtn, #setToggleHideBtn")) {
        setTimeout(() => { lastRenderSig = ""; renderActivityPanel(); }, 80);
      }
    });

    renderActivityPanel();
    setTimeout(() => renderActivityPanel(), 1100);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initPromiseBar);
  else initPromiseBar();
})();
