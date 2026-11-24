// व्याज हिशोब वही - Compact Activity पट्टी + 10/4/6 FCM Push अलर्ट इंजिन + Fixed Slot व VyajHub Sync (js/pro/promise-bar.js - V14.48)
(function () {
  // तुमची Firebase Web Push Certificate (VAPID Key)
  const FIREBASE_VAPID_KEY = "BD38I1uOSqyA6lfr11cE3WQkwJGXONEKQi4DiALA0ObadWcmwWGgA1pvm2ZgGwllZ4FvhzD7Dfe9g3pS42npV_M";
  const FCM_TOKEN_KEY = "vyaj_fcm_token_saved_v2";
  const FCM_SW_SCOPE = "./firebase-cloud-messaging-push-scope";

  let isExpanded = false;
  let activeTab = "today";
  let snoozeOpenId = null;
  let isPushBusy = false;

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

  function cleanMobile(raw) {
    if (window.VyajSchema && typeof window.VyajSchema.normalizeMobile === "function") {
      return window.VyajSchema.normalizeMobile(raw);
    }
    const d = String(raw || "").replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("91")) return d.slice(2);
    if (d.length === 11 && d.startsWith("0")) return d.slice(1);
    return d.slice(-10);
  }

  function forceCloseDrawer() {
    if (!isExpanded && !snoozeOpenId) return;
    isExpanded = false;
    snoozeOpenId = null;
    renderActivityPanel();
  }

  function isFcmPushActive() {
    return (
      "Notification" in window &&
      Notification.permission === "granted" &&
      Boolean(localStorage.getItem(FCM_TOKEN_KEY))
    );
  }

  function setNotifMsg(text, isErr) {
    const el = document.getElementById("notifStatusMsg");
    if (!el) return;
    el.textContent = text || "";
    el.style.color = isErr ? "var(--danger)" : "var(--accent-2)";
  }

  // Service Worker पूर्णपणे अ‍ॅक्टिव्ह होण्याची सुरक्षित वाट पहा (no active Service Worker एरर टाळण्यासाठी)
  function waitForActiveSw(reg) {
    return new Promise((resolve, reject) => {
      if (reg && reg.active) return resolve(reg);
      const sw = reg && (reg.installing || reg.waiting);
      if (!sw) return resolve(reg);
      const timer = setTimeout(() => resolve(reg), 6000);
      sw.addEventListener("statechange", () => {
        if (sw.state === "activated" || reg.active) {
          clearTimeout(timer);
          resolve(reg);
        } else if (sw.state === "redundant") {
          clearTimeout(timer);
          reject(new Error("Service Worker सुरू होताना थांबले. कृपया अ‍ॅप रिफ्रेश करून पुन्हा प्रयत्न करा."));
        }
      });
    });
  }

  // १००% खात्रीशीर 10/4/6 FCM Push Notification चालू करण्याचे इंजिन
  async function enable1046PushAlerts() {
    if (isPushBusy) return;

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      const msg = "या ब्राउझर किंवा डिव्हाइसमध्ये Push Notification सपोर्ट उपलब्ध नाही.";
      setNotifMsg("❌ " + msg, true);
      alert(msg);
      return;
    }

    if (Notification.permission === "denied") {
      const deniedMsg =
        "मोबाईलने या अ‍ॅपचे Notification ब्लॉक केले आहे.\n\n" +
        "कृपया मोबाईलच्या Settings → Apps → हिशोब वही → Notifications मध्ये जाऊन 'Allow notifications' चालू करा आणि अ‍ॅप पुन्हा उघडा.";
      setNotifMsg("❌ Notification परवानगी मोबाईल Settings मधून ब्लॉक आहे.", true);
      alert(deniedMsg);
      return;
    }

    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user) {
      alert("कृपया आधी Gmail / Password ने लॉगिन करा.");
      return;
    }

    isPushBusy = true;
    renderActivityPanel();
    setNotifMsg("⏳ 10/4/6 Push अलर्ट चालू करत आहे...", false);

    try {
      // १. Notification परवानगी घ्या
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();

      if (permission !== "granted") {
        const denyMsg = "Notification ची परवानगी दिली गेली नाही. कृपया 'Allow' वर क्लिक करा.";
        setNotifMsg("❌ " + denyMsg, true);
        alert(denyMsg);
        return;
      }

      // २. sw.js शी संघर्ष होऊ नये म्हणून वेगळ्या Scope वर firebase-messaging-sw.js रजिस्टर करा
      const swReg = await navigator.serviceWorker.register("./firebase-messaging-sw.js", {
        scope: FCM_SW_SCOPE
      });
      await waitForActiveSw(swReg);

      // ३. Firebase Messaging टोकन मिळवा
      if (!firebase.messaging || (firebase.messaging.isSupported && !firebase.messaging.isSupported())) {
        throw new Error("या ब्राउझरमध्ये Firebase Push Messaging सपोर्ट नाही (कृपया Chrome वापरा).");
      }

      const messaging = firebase.messaging();
      const token = await messaging.getToken({
        vapidKey: FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: swReg
      });

      if (!token) {
        throw new Error("Push टोकन तयार होऊ शकला नाही. कृपया इंटरनेट तपासून पुन्हा प्रयत्न करा.");
      }

      // ४. Firestore मध्ये fcmTokens सेव्ह करा (GitHub Actions 10 AM / 4 PM / 6 PM साठी)
      await firebase.firestore().collection("users").doc(user.uid).set(
        {
          fcmTokens: firebase.firestore.FieldValue.arrayUnion(token),
          fcmUpdatedAt: new Date().toISOString()
        },
        { merge: true }
      );

      localStorage.setItem("vyaj_fcm_enabled", "true");
      localStorage.setItem(FCM_TOKEN_KEY, token);

      setNotifMsg("✅ 10/4/6 Push अलर्ट यशस्वीरीत्या चालू झाले!", false);

      // ५. खात्रीसाठी तात्काळ टेस्ट नोटिफिकेशन दाखवा
      try {
        await swReg.showNotification("✅ 10/4/6 Push अलर्ट चालू झाले!", {
          body: "आता सकाळी १०, दुपारी ४ आणि संध्याकाळी ६ वाजता वायद्याचे अलर्ट मिळतील.",
          icon: "./icon.png",
          badge: "./icon.png",
          vibrate: [200, 100, 200]
        });
      } catch (_) {}

      alert("✅ 10/4/6 Push अलर्ट यशस्वीरीत्या चालू झाले! आता सकाळी १०, दुपारी ४ आणि संध्याकाळी ६ वाजता अलर्ट येतील.");
    } catch (err) {
      console.error("10/4/6 Push Enable Error:", err);
      const errText = err && err.message ? err.message : String(err);
      setNotifMsg("❌ Push एरर: " + errText, true);
      alert("Push अलर्ट चालू करताना एरर आला:\n" + errText);
    } finally {
      isPushBusy = false;
      renderActivityPanel();
    }
  }

  // Test Notification बटनासाठी तात्काळ तपासणी
  async function sendTestPushNotification() {
    if (!("Notification" in window)) {
      alert("या डिव्हाइसवर Notification सपोर्ट नाही.");
      return;
    }
    if (Notification.permission !== "granted") {
      await enable1046PushAlerts();
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration(FCM_SW_SCOPE) || await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification("🧪 टेस्ट अलर्ट — व्याज हिशोब वही", {
          body: "तुमचे 10/4/6 Push Notification व्यवस्थित काम करत आहे!",
          icon: "./icon.png",
          vibrate: [250, 120, 250]
        });
        setNotifMsg("✅ टेस्ट नोटिफिकेशन पाठवले आहे!", false);
      } else {
        new Notification("🧪 टेस्ट अलर्ट — व्याज हिशोब वही", {
          body: "तुमचे 10/4/6 Push Notification व्यवस्थित काम करत आहे!",
          icon: "./icon.png"
        });
      }
    } catch (err) {
      alert("टेस्ट नोटिफिकेशन एरर: " + err.message);
    }
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
        border: 1px solid rgba(255, 255, 255, 0.13);
        box-shadow: var(--glass-shadow);
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
      .pb-push-pill.is-on { background: rgba(22, 101, 52, 0.35) !important; border-color: rgba(74, 222, 128, 0.55) !important; color: #4ade80 !important; }
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

  function collectPromiseBuckets() {
    const out = { today: [], tomorrow: [], overdue: [] };
    if (!window.HishobBridge || typeof window.HishobBridge.getBorrowers !== "function") return out;
    const borrowers = (window.HishobBridge.getBorrowers() || []).filter(
      (b) => !b.isDeleted && b.accountStatus !== "closed"
    );
    const activeYm = document.getElementById("activeYm")?.value || getLocalIso(0).slice(0, 7);
    const todayStr = getLocalIso(0);
    const tomorrowStr = getLocalIso(1);

    borrowers.forEach((b) => {
      const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
      const pending = Math.max(0, Number(calc.totalPayable || 0));
      if (pending <= 0) return;

      const normFn = (v) => (window.VyajSchema ? window.VyajSchema.normalizeDate(v) : String(v || "").trim());
      const fields = [
        { field: "promiseDate1", val: normFn(b.promiseDate1 || b.promise1) },
        { field: "promiseDate2", val: normFn(b.promiseDate2 || b.promise2) },
        { field: "promiseDate3", val: normFn(b.promiseDate3 || b.promise3) }
      ].filter((x) => Boolean(x.val));

      if (!fields.length) return;
      const todayHit = fields.find((x) => x.val === todayStr);
      const tmrHit = fields.find((x) => x.val === tomorrowStr);
      const pastHits = fields.filter((x) => x.val < todayStr).sort((a, c) => c.val.localeCompare(a.val));

      if (todayHit) out.today.push({ b, calc, pending, date: todayHit.val, field: todayHit.field });
      else if (tmrHit) out.tomorrow.push({ b, calc, pending, date: tmrHit.val, field: tmrHit.field });
      else if (pastHits.length) out.overdue.push({ b, calc, pending, date: pastHits[0].val, field: pastHits[0].field });
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
      setTimeout(renderActivityPanel, 250);
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
    if (!appScreen) return null;

    let wrap = document.getElementById("proPromiseActivityWrap");
    if (!wrap) {
      wrap = document.createElement("section");
      wrap.id = "proPromiseActivityWrap";
      wrap.className = "pb-wrap";
    }

    // कायमस्वरूपी Fixed Slot (#slot-promise-bar) मध्ये बसवा
    if (window.VyajHub && typeof window.VyajHub.mountToSlot === "function") {
      window.VyajHub.mountToSlot("slot-promise-bar", wrap, (el) => {
        const heroCard = appScreen.querySelector(".month-hero-card");
        if (heroCard) appScreen.insertBefore(el, heroCard);
      });
    } else if (!wrap.parentElement) {
      const heroCard = appScreen.querySelector(".month-hero-card");
      if (heroCard) appScreen.insertBefore(wrap, heroCard);
    }
    return wrap;
  }

  function renderActivityPanel() {
    const wrap = ensureWrapContainer();
    if (!wrap) return;

    const buckets = collectPromiseBuckets();
    const todayCnt = buckets.today.length;
    const tmrCnt = buckets.tomorrow.length;
    const ovCnt = buckets.overdue.length;
    const todaySum = buckets.today.reduce((s, x) => s + x.pending, 0);
    const ovSum = buckets.overdue.reduce((s, x) => s + x.pending, 0);
    const isPushOn = isFcmPushActive();

    if (activeTab === "today" && todayCnt === 0) {
      if (ovCnt > 0) activeTab = "overdue";
      else if (tmrCnt > 0) activeTab = "tomorrow";
    }

    let barTitle = "✅ आज कोणताही बाकी वायदा नाही";
    let barSub = tmrCnt || ovCnt ? `उद्या: ${tmrCnt} • थकीत वायदे: ${ovCnt}` : "सर्व वायदे वेळेत आहेत";
    let pulseCls = "calm", wrapCls = "all-clear";

    if (todayCnt > 0) {
      barTitle = `🔔 आजचे ${todayCnt} वायदे • एकूण ${fmtInr(todaySum)}`;
      barSub = `उद्या: ${tmrCnt} • थकीत: ${ovCnt} • तपशील पाहण्यासाठी टॅप करा`;
      pulseCls = "";
      wrapCls = "has-urgent";
    } else if (ovCnt > 0) {
      barTitle = `⚠️ ${ovCnt} थकीत वायदे • एकूण ${fmtInr(ovSum)}`;
      barSub = `आज: 0 • उद्या: ${tmrCnt} • यादी पाहण्यासाठी टॅप करा`;
      pulseCls = "warn";
      wrapCls = "has-urgent";
    } else if (tmrCnt > 0) {
      barTitle = `⏳ उद्याचे ${tmrCnt} वायदे नियोजित आहेत`;
      barSub = `आज: 0 • यादी पाहण्यासाठी टॅप करा`;
      pulseCls = "warn";
      wrapCls = "";
    }

    wrap.className = `pb-wrap ${wrapCls}`;
    const activeItems = buckets[activeTab] || [];
    const activeYm = document.getElementById("activeYm")?.value || getLocalIso(0).slice(0, 7);

    const pushBtnLabel = isPushBusy
      ? "⏳ चालू..."
      : isPushOn
        ? "✓ 10/4/6"
        : "🔔 10/4/6";

    const cardsHtml = activeItems.length
      ? activeItems.map(({ b, pending, date, field }) => {
          const mob = cleanMobile(b.mobile);
          const hasMob = mob.length >= 10;
          const isSnoozeOpen = snoozeOpenId === b.id;
          const callHtml = hasMob
            ? `<a class="pb-act-btn pb-call" href="tel:${esc(mob)}" data-mobile="${esc(mob)}">📞 Call</a>`
            : `<button type="button" class="pb-act-btn pb-call-none" data-pb-addmob="${esc(b.id)}">📞 +नंबर</button>`;
          const waHtml = hasMob
            ? `<button type="button" class="pb-act-btn pb-wa" data-pb-wa="${esc(mob)}" data-name="${esc(b.name || "")}" data-amt="${pending}" data-dt="${esc(fmtDateShort(date))}">💬 WA</button>`
            : "";
          const snoozeHtml = isSnoozeOpen
            ? `
              <div class="pb-snooze-row">
                <span class="muted" style="font-size:0.7rem;">पुढे ढकला:</span>
                <button type="button" data-pb-setdate="${esc(b.id)}" data-field="${esc(field)}" data-iso="${getLocalIso(1)}">उद्या</button>
                <button type="button" data-pb-setdate="${esc(b.id)}" data-field="${esc(field)}" data-iso="${getLocalIso(3)}">+३ दिन</button>
                <button type="button" data-pb-setdate="${esc(b.id)}" data-field="${esc(field)}" data-iso="${getLocalIso(7)}">+७ दिन</button>
                <input type="date" data-pb-customdate="${esc(b.id)}" data-field="${esc(field)}" value="${esc(date)}" />
              </div>
            `
            : "";

          return `
            <div class="pb-card">
              <div class="pb-card-top">
                <div style="min-width:0;">
                  <div class="pb-cust-name" data-pb-jump="${esc(b.id)}">${esc(b.name || "ग्राहक")}</div>
                  <div class="pb-cust-meta">📅 ${esc(fmtDateShort(date))}${hasMob ? ` • 📱 ${esc(mob)}` : " • मोबाईल नाही"}</div>
                </div>
                <div class="pb-amt">${fmtInr(pending)}</div>
              </div>
              <div class="pb-acts">
                ${callHtml}
                ${waHtml}
                <button type="button" class="pb-act-btn pb-qr" data-pb-qr="${esc(b.id)}" data-amt="${pending}">📱 QR</button>
                <button type="button" class="pb-act-btn pb-pay" data-pb-jump="${esc(b.id)}">⚡ जमा</button>
                <button type="button" class="pb-act-btn pb-snooze" data-pb-snooze="${esc(b.id)}">⏰ ढकला</button>
              </div>
              ${snoozeHtml}
            </div>
          `;
        }).join("")
      : `<div class="meta-box" style="text-align:center;">या विभागात सध्या कोणताही बाकी वायदा नाही.</div>`;

    wrap.innerHTML = `
      <div class="pb-activity-bar" id="pbToggleBar">
        <div class="pb-bar-left">
          <span class="pb-pulse ${pulseCls}"></span>
          <div class="pb-bar-texts">
            <div class="pb-bar-title">${esc(barTitle)}</div>
            <div class="pb-bar-sub">${esc(barSub)}</div>
          </div>
        </div>
        <div class="pb-bar-right">
          <button type="button" id="pbPushStatusBtn" class="pb-push-pill ${isPushOn ? "is-on" : ""}" title="10 AM / 4 PM / 6 PM Push अलर्ट चालू करा">${pushBtnLabel}</button>
          <span class="pb-toggle-chip">${isExpanded ? "बंद ▴" : "पहा ▾"}</span>
        </div>
      </div>
      ${isExpanded ? `
        <div class="pb-drawer">
          <div class="pb-tabs">
            <button type="button" class="pb-tab-btn ${activeTab === "today" ? "active" : ""}" data-pbtab="today">🔴 आज (${todayCnt})</button>
            <button type="button" class="pb-tab-btn ${activeTab === "tomorrow" ? "active" : ""}" data-pbtab="tomorrow">🟡 उद्या (${tmrCnt})</button>
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
      renderActivityPanel();
    });

    document.getElementById("pbPushStatusBtn")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      enable1046PushAlerts();
    });

    if (!isExpanded) return;

    wrap.querySelectorAll("[data-pbtab]").forEach((btn) =>
      btn.addEventListener("click", () => {
        activeTab = btn.getAttribute("data-pbtab");
        snoozeOpenId = null;
        renderActivityPanel();
      })
    );

    wrap.querySelectorAll("[data-pb-addmob]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const bid = btn.getAttribute("data-pb-addmob");
        const mobBtn = document.querySelector(`#borrowersList button[data-action="quick-edit-mobile"][data-id="${bid}"]`);
        if (mobBtn) mobBtn.click();
        else jumpToCustomerCard(bid);
      })
    );

    wrap.querySelectorAll("[data-pb-wa]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const mob = btn.getAttribute("data-pb-wa");
        const target = mob.length === 10 ? "91" + mob : mob;
        const name = btn.getAttribute("data-name") || "";
        const amt = Number(btn.getAttribute("data-amt") || 0);
        const dt = btn.getAttribute("data-dt") || "";
        const biz = document.getElementById("tBrandTitle")?.textContent?.trim() || "व्याज हिशोब वही";
        const msg = `नमस्कार *${name}*,\nआपला वायदा दिनांक *${dt}* असून एकूण देय रक्कम *₹${amt.toLocaleString("en-IN")}* (${activeYm}) बाकी आहे.\nकृपया वेळेवर जमा करावी. धन्यवाद!\n— *${biz}*`;
        window.open(`https://wa.me/${target}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
      })
    );

    wrap.querySelectorAll("[data-pb-qr]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const bid = btn.getAttribute("data-pb-qr");
        const amt = Number(btn.getAttribute("data-amt") || 0);
        forceCloseDrawer();
        if (typeof window.openInvoiceReceipt === "function") window.openInvoiceReceipt(bid);
        else if (typeof window.openUpiQr === "function") window.openUpiQr(bid, amt);
      })
    );

    wrap.querySelectorAll("[data-pb-jump]").forEach((el) =>
      el.addEventListener("click", () => jumpToCustomerCard(el.getAttribute("data-pb-jump")))
    );

    wrap.querySelectorAll("[data-pb-snooze]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const bid = btn.getAttribute("data-pb-snooze");
        snoozeOpenId = snoozeOpenId === bid ? null : bid;
        renderActivityPanel();
      })
    );

    wrap.querySelectorAll("[data-pb-setdate]").forEach((btn) =>
      btn.addEventListener("click", () =>
        snoozePromiseDate(btn.getAttribute("data-pb-setdate"), btn.getAttribute("data-field"), btn.getAttribute("data-iso"))
      )
    );

    wrap.querySelectorAll("[data-pb-customdate]").forEach((inp) =>
      inp.addEventListener("change", () => {
        if (inp.value) snoozePromiseDate(inp.getAttribute("data-pb-customdate"), inp.getAttribute("data-field"), inp.value);
      })
    );
  }

  // रिमाइंडर्स पॉपअपमधील '🔔 सकाळचे Notification' आणि '🧪 Test' बटनांनाही थेट 10/4/6 FCM इंजिनशी जोडा
  function bindReminderModalButtons() {
    document.addEventListener("click", (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest("#enableNotifBtn, #testNotifBtn") : null;
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      if (btn.id === "enableNotifBtn") enable1046PushAlerts();
      else if (btn.id === "testNotifBtn") sendTestPushNotification();
    }, true);
  }

  // ग्लोबल अ‍ॅक्सेस
  window.enableVyaj1046Push = enable1046PushAlerts;

  function initPromiseBar() {
    injectPromiseBarCss();
    bindReminderModalButtons();

    // Master UI Reset Bus: दुसरे कोणतेही ऑप्शन उघडताच 'थकीत वायदे' आपोआप बंद करा
    window.addEventListener("vyaj:resetInlineUI", forceCloseDrawer);
    window.addEventListener("vyaj:closePromiseBar", forceCloseDrawer);

    if (window.VyajHub && typeof window.VyajHub.register === "function") {
      window.VyajHub.register("promise-bar", renderActivityPanel);
    } else {
      renderActivityPanel();
      setTimeout(renderActivityPanel, 1300);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPromiseBar);
  } else {
    initPromiseBar();
  }
})();
