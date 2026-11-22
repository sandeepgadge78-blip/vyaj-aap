// व्याज हिशोब वही - स्मार्ट वायदा डॅशबोर्ड + जवळचे वायदे सर्वात वर + 1-Click QR + FCM (js/reminders.js - V14.16)
(function () {
  // तुमची Firebase Web Push Certificate (VAPID Key)
  const FIREBASE_VAPID_KEY = "BD38I1uOSqyA6lfr11cE3WQkwJGXONEKQi4DiALA0ObadWcmwWGgA1pvm2ZgGwllZ4FvhzD7Dfe9g3pS42npV_M";
  const LOCAL_SLOT_KEY = "vyaj_rem_slot_fired_v1";

  function getIsoDate(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function formatCleanDate(raw) {
    if (!raw) return "-";
    const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(raw);
  }

  function esc(str) {
    return String(str || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function buildCalendarAlarmUrl(name, amount, dateIso) {
    const ymd = String(dateIso || getIsoDate(0)).replace(/-/g, "");
    const title = encodeURIComponent(`💰 व्याज वायदा: ${name} (₹${amount})`);
    const details = encodeURIComponent(`ग्राहक: ${name}\nबाकी रक्कम: ₹${amount}\nव्याज हिशोब वही रिमाइंडर`);
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${ymd}T100000/${ymd}T101500&details=${details}`;
  }

  function openWaPromiseMsg(name, mobile, amount, dateIso) {
    const clean = String(mobile || "").replace(/\D/g, "");
    if (clean.length < 10) {
      alert("या ग्राहकाचा वैध मोबाईल नंबर सेव्ह नाही.");
      return;
    }
    const target = clean.length === 10 ? "91" + clean : clean;
    const msg = `नमस्कार *${name}*,\nआपली व्याज/बाकी रक्कम *₹${amount}* देण्याची वायदा तारीख (${formatCleanDate(dateIso)}) आहे.\nकृपया आज रक्कम जमा करावी. धन्यवाद!`;
    window.open(`https://wa.me/${target}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  }

  async function enableFcmPushNotifications() {
    if (!("Notification" in window)) {
      alert("तुमच्या ब्राउझरमध्ये Notification सपोर्ट नाही.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        alert("कृपया Notification ची परवानगी (Allow) द्या.");
        return;
      }

      const swReg = await navigator.serviceWorker.register("./firebase-messaging-sw.js");
      const messaging = firebase.messaging();
      const token = await messaging.getToken({
        vapidKey: FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: swReg
      });

      if (token && firebase.auth().currentUser) {
        const uid = firebase.auth().currentUser.uid;
        await firebase.firestore().collection("users").doc(uid).set(
          {
            fcmTokens: firebase.firestore.FieldValue.arrayUnion(token),
            fcmUpdatedAt: new Date().toISOString()
          },
          { merge: true }
        );
        localStorage.setItem("vyaj_fcm_enabled", "true");
        alert("✅ Instagram सारखे Push Notification (सकाळी १०, दुपारी ४, संध्याकाळी ६) यशस्वीरीत्या चालू झाले!");
        renderPromiseDashboard();
      }
    } catch (err) {
      console.error("FCM error:", err);
      alert("Push Notification सेट करताना एरर आला: " + err.message);
    }
  }

  function checkLocalTimeSlotAlert(todayList) {
    if (!todayList.length) return;
    const now = new Date();
    const hr = now.getHours();
    const todayStr = getIsoDate(0);

    let slot = "";
    if (hr === 10) slot = "10AM";
    else if (hr === 16) slot = "4PM";
    else if (hr === 18) slot = "6PM";
    if (!slot) return;

    const slotId = `${todayStr}_${slot}`;
    if (localStorage.getItem(LOCAL_SLOT_KEY) === slotId) return;

    localStorage.setItem(LOCAL_SLOT_KEY, slotId);
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 400]);

    if ("Notification" in window && Notification.permission === "granted") {
      const names = todayList.map((x) => `${x.name} (₹${x.amount})`).slice(0, 3).join(", ");
      new Notification(`🔔 आजचे वायदे (${slot})`, {
        body: `${todayList.length} ग्राहकांचे वायदे आहेत: ${names}`,
        icon: "./icon.png",
        vibrate: [300, 150, 300]
      });
    }
  }

  function renderPromiseDashboard() {
    if (!window.HishobBridge) return;
    const appScreen = document.getElementById("appScreen");
    if (!appScreen) return;

    const borrowers = window.HishobBridge.getBorrowers() || [];
    const activeYm = (document.getElementById("activeYm") && document.getElementById("activeYm").value) || getIsoDate(0).slice(0, 7);
    const todayStr = getIsoDate(0);
    const tomorrowStr = getIsoDate(1);
    const dayAfterStr = getIsoDate(2);

    const missedList = [];
    const todayList = [];
    const upcomingList = [];

    borrowers
      .filter((b) => !b.isDeleted && b.accountStatus !== "closed")
      .forEach((b) => {
        const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
        if (calc.totalPayable <= 0) return;

        const dates = [b.promiseDate1, b.promiseDate2, b.promiseDate3].filter(Boolean).sort();
        if (!dates.length) return;

        if (dates.includes(todayStr)) {
          todayList.push({ id: b.id, name: b.name, mobile: b.mobile, amount: calc.totalPayable, date: todayStr });
        } else {
          // पुढील १-२ दिवसांत येणारी वायदा तारीख असल्यास 'जवळचे वायदे' मध्ये सर्वात वर दाखवा
          const nearDate = dates.find((dt) => dt > todayStr && dt <= dayAfterStr);
          if (nearDate) {
            upcomingList.push({ id: b.id, name: b.name, mobile: b.mobile, amount: calc.totalPayable, date: nearDate });
          } else {
            const latest = dates[dates.length - 1];
            if (latest < todayStr) {
              missedList.push({ id: b.id, name: b.name, mobile: b.mobile, amount: calc.totalPayable, date: latest });
            }
          }
        }
      });

    upcomingList.sort((a, b) => a.date.localeCompare(b.date));
    checkLocalTimeSlotAlert(todayList);

    let panel = document.getElementById("smartPromiseDashPanel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "smartPromiseDashPanel";
      panel.className = "card";
      panel.style.borderLeft = "4px solid #f43f5e";
      const heroCard = appScreen.querySelector(".month-hero-card");
      if (heroCard) appScreen.insertBefore(panel, heroCard);
      else appScreen.prepend(panel);
    }

    const isPushOn = localStorage.getItem("vyaj_fcm_enabled") === "true" && Notification.permission === "granted";

    if (!todayList.length && !upcomingList.length && !missedList.length) {
      panel.innerHTML = `
        <div class="row" style="justify-content:space-between;">
          <span class="muted">📅 आज किंवा पुढील २ दिवसांत कोणताही वायदा नाही.</span>
          <button type="button" id="enableProPushBtn" class="${isPushOn ? "success" : "primary"} sm">
            ${isPushOn ? "✅ Push अलर्ट चालू" : "🔔 10/4/6 Push अलर्ट चालू करा"}
          </button>
        </div>
      `;
      document.getElementById("enableProPushBtn")?.addEventListener("click", enableFcmPushNotifications);
      return;
    }

    const buildRows = (list, badgeColor) =>
      list
        .map((item) => {
          const cleanMob = String(item.mobile || "").replace(/\D/g, "");
          const calUrl = buildCalendarAlarmUrl(item.name, item.amount, item.date);
          const dayTag = item.date === tomorrowStr ? " (उद्या)" : item.date === dayAfterStr ? " (परवा)" : "";
          return `
            <div class="meta-box row" style="justify-content:space-between; margin-top:6px;">
              <div>
                <strong>${esc(item.name)}</strong>
                <span style="color:${badgeColor}; font-weight:800; margin-left:6px;">${window.HishobBridge.fmtAmt(item.amount)}</span>
                <div class="muted" style="font-size:0.74rem;">तारीख: ${esc(formatCleanDate(item.date))}${dayTag}</div>
              </div>
              <div class="row" style="gap:5px;">
                ${cleanMob.length >= 10 ? `<button type="button" class="success sm" onclick="window.location.href='tel:${esc(cleanMob)}'">📞</button>` : ""}
                <button type="button" class="primary sm" data-rem-wa="${esc(item.id)}" data-name="${esc(item.name)}" data-mob="${esc(item.mobile || "")}" data-amt="${item.amount}" data-dt="${esc(item.date)}">💬 WA</button>
                <button type="button" class="sc-btn-purple sm" data-rem-qr="${esc(item.id)}" data-amt="${item.amount}" title="UPI QR दाखवा">📱 QR</button>
                <a href="${calUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
                  <button type="button" class="warn sm" title="फोन कॅलेंडर अलार्म">⏰</button>
                </a>
              </div>
            </div>
          `;
        })
        .join("");

    // आजचे वायदे आणि जवळचे वायदे सर्वात वर दाखवा
    panel.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:8px;">
        <strong style="color:var(--accent); font-size:0.95rem;">🔔 वायदा अलर्ट डॅशबोर्ड</strong>
        <button type="button" id="enableProPushBtn" class="${isPushOn ? "success" : "primary"} sm">
          ${isPushOn ? "✅ Push चालू" : "🔔 10/4/6 Push चालू करा"}
        </button>
      </div>
      ${todayList.length ? `<div style="margin-bottom:8px;"><strong style="color:#38bdf8;">📅 आजचे वायदे (${todayList.length}):</strong>${buildRows(todayList, "#38bdf8")}</div>` : ""}
      ${upcomingList.length ? `<div style="margin-bottom:8px;"><strong style="color:#fbbf24;">⏳ जवळचे वायदे (${upcomingList.length}):</strong>${buildRows(upcomingList, "#fbbf24")}</div>` : ""}
      ${missedList.length ? `<div><strong style="color:#f43f5e;">🔴 चुकलेले वायदे (${missedList.length}):</strong>${buildRows(missedList, "#f43f5e")}</div>` : ""}
    `;

    document.getElementById("enableProPushBtn")?.addEventListener("click", enableFcmPushNotifications);

    panel.querySelectorAll("[data-rem-wa]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openWaPromiseMsg(
          btn.getAttribute("data-name"),
          btn.getAttribute("data-mob"),
          btn.getAttribute("data-amt"),
          btn.getAttribute("data-dt")
        );
      });
    });

    panel.querySelectorAll("[data-rem-qr]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bId = btn.getAttribute("data-rem-qr");
        const amt = Number(btn.getAttribute("data-amt") || 0);
        if (typeof window.openUpiQr === "function") {
          window.openUpiQr(bId, amt);
        } else {
          alert("QR मॉड्यूल लोड झालेले नाही.");
        }
      });
    });
  }

  function initReminders() {
    const listEl = document.getElementById("borrowersList");
    if (listEl) {
      const obs = new MutationObserver(() => renderPromiseDashboard());
      obs.observe(listEl, { childList: true });
    }
    setTimeout(renderPromiseDashboard, 1500);
    setInterval(renderPromiseDashboard, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initReminders);
  } else {
    initReminders();
  }
})();
