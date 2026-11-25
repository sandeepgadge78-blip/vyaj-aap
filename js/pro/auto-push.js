// व्याज हिशोब वही - पूर्णपणे ऑटोमॅटिक 10 AM / 4 PM / 6 PM Push अलर्ट (व्याज + स्वतंत्र उधारी) (js/pro/auto-push.js - V14.43)
(function () {
  const AUTO_ENABLED_KEY = "vyaj_auto_push_enabled_v1";
  const SENT_SLOTS_KEY = "vyaj_auto_push_sent_slots_v1";
  const SCHEDULE_HOURS = [10, 16, 18]; // सकाळी १०, दुपारी ४, संध्याकाळी ६
  let checkTimer = null;

  function getLocalIso(offsetDays = 0) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function getActiveYm() {
    return document.getElementById("activeYm")?.value || getLocalIso(0).slice(0, 7);
  }

  function getSentSlots() {
    try {
      const obj = JSON.parse(localStorage.getItem(SENT_SLOTS_KEY) || "{}");
      const today = getLocalIso(0);
      return obj && obj.date === today && Array.isArray(obj.slots) ? obj.slots : [];
    } catch (_) {
      return [];
    }
  }

  function markSlotsSent(slotsToAdd) {
    const today = getLocalIso(0);
    const merged = Array.from(new Set([...getSentSlots(), ...slotsToAdd]));
    try {
      localStorage.setItem(SENT_SLOTS_KEY, JSON.stringify({ date: today, slots: merged }));
    } catch (_) {}
  }

  // Android PWA व Chrome मध्ये १००% चालणारे Service Worker Notification
  async function showNativeNotification(title, body, tag) {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    const options = {
      body,
      icon: "./icon.png",
      badge: "./icon.png",
      tag: tag || "vyaj-alert",
      renotify: true,
      vibrate: [180, 90, 180]
    };

    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && typeof reg.showNotification === "function") {
          await reg.showNotification(title, options);
          return true;
        }
      }
    } catch (_) {}

    try {
      new Notification(title, options);
      return true;
    } catch (_) {
      return false;
    }
  }

  // आजचे व थकीत व्याज वायदे मोजा
  function collectVyajDueItems() {
    if (!window.HishobBridge || typeof window.HishobBridge.getBorrowers !== "function") return null;
    const allBorrowers = window.HishobBridge.getBorrowers() || [];
    if (!allBorrowers.length) return null; // डेटा अजून लोड झालेला नाही

    const todayStr = getLocalIso(0);
    const activeYm = getActiveYm();
    const dueList = [];

    allBorrowers.forEach((b) => {
      if (b.isDeleted || b.accountStatus === "closed") return;
      const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
      const pending = Math.max(0, Number(calc.totalPayable || 0));
      if (pending <= 0) return;

      const dates = [b.promiseDate1, b.promiseDate2, b.promiseDate3]
        .concat(Array.isArray(b.promiseList) ? b.promiseList.filter((p) => p && p.status !== "done").map((p) => p.date) : [])
        .filter(Boolean);

      if (dates.some((dt) => String(dt).slice(0, 10) <= todayStr)) {
        dueList.push({ name: b.name || "ग्राहक", pending });
      }
    });
    return dueList;
  }

  // आजचे व थकीत स्वतंत्र उधारी वायदे मोजा (व्याजापेक्षा १००% वेगळे)
  function collectUdhaariDueItems() {
    if (typeof window.getProUdhaariList !== "function") return [];
    const list = window.getProUdhaariList() || [];
    const todayStr = getLocalIso(0);
    const out = [];

    list.forEach((u) => {
      if (!u || u.isDeleted || u.status === "paid") return;
      const rem = Math.max(0, Number(u.amount || 0) - Number(u.paidAmount || 0));
      if (rem <= 0) return;
      if (u.promiseDate && String(u.promiseDate).slice(0, 10) <= todayStr) {
        out.push({ name: u.name || "व्यक्ती", rem });
      }
    });
    return out;
  }

  // 10 AM / 4 PM / 6 PM ऑटो-चेक व Catch-up अलर्ट
  async function runScheduledPushCheck() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    // एकदा परवानगी असली की Auto-ON कायमचे चालू ठेवा
    localStorage.setItem(AUTO_ENABLED_KEY, "1");

    const nowHr = new Date().getHours();
    const sent = getSentSlots();
    const dueSlots = SCHEDULE_HOURS.filter((hr) => nowHr >= hr && !sent.includes(hr));
    if (!dueSlots.length) return;

    const vyajDue = collectVyajDueItems();
    const udhaariDue = collectUdhaariDueItems();

    // जर व्याज डेटा अजून लोड झाला नसेल तर स्लॉट मार्क करू नका (थोड्या वेळाने पुन्हा तपासेल)
    if (vyajDue === null && !udhaariDue.length) return;

    const latestSlot = dueSlots[dueSlots.length - 1];
    const slotLabel = latestSlot === 10 ? "सकाळ १०:००" : latestSlot === 16 ? "दुपार ४:००" : "संध्याकाळ ६:००";

    // १. व्याज वायदे नोटिफिकेशन
    if (Array.isArray(vyajDue) && vyajDue.length > 0) {
      const sum = vyajDue.reduce((s, x) => s + x.pending, 0);
      const topNames = vyajDue.slice(0, 3).map((x) => `${x.name} (₹${x.pending.toLocaleString("en-IN")})`).join(", ");
      await showNativeNotification(
        `🔔 व्याज वायदा अलर्ट (${slotLabel}) • ${vyajDue.length} खाती`,
        `एकूण बाकी ₹${sum.toLocaleString("en-IN")} | ${topNames}`,
        `vyaj-slot-${latestSlot}`
      );
    }

    // २. १००% स्वतंत्र उधारी वायदे नोटिफिकेशन
    if (udhaariDue.length > 0) {
      const udSum = udhaariDue.reduce((s, x) => s + x.rem, 0);
      const udNames = udhaariDue.slice(0, 3).map((x) => `${x.name} (₹${x.rem.toLocaleString("en-IN")})`).join(", ");
      await showNativeNotification(
        `🤝 उधारी अलर्ट (व्याजापेक्षा वेगळे • ${slotLabel})`,
        `बाकी उधारी ₹${udSum.toLocaleString("en-IN")} | ${udNames}`,
        `udhaari-slot-${latestSlot}`
      );
    }

    // आजचे झालेले सर्व स्लॉट्स सेव्ह करा म्हणजे पुन्हा स्पॅम होणार नाही
    markSlotsSent(dueSlots);
  }

  function updatePushButtonsUi() {
    const perm = "Notification" in window ? Notification.permission : "unsupported";
    const isOn = perm === "granted";

    const msgEl = document.getElementById("notifStatusMsg");
    if (msgEl) {
      if (isOn) msgEl.innerHTML = `<span class="ok">✅ ऑटो 10 / 4 / 6 Push अलर्ट कायमचे चालू आहे!</span>`;
      else if (perm === "denied") msgEl.innerHTML = `<span class="err">⚠️ ब्राउझरमध्ये Notification ब्लॉक आहे. Chrome Settings → Site Settings → Notifications → Allow करा.</span>`;
      else msgEl.textContent = "🔔 एकदा Allow दाबल्यावर रोज १०, ४ व ६ वाजता आपोआप अलर्ट येईल.";
    }

    const pbBtn = document.getElementById("pbPushStatusBtn");
    if (pbBtn) {
      pbBtn.textContent = isOn ? "✓ Auto 10/4/6" : "🔔 10/4/6 चालू करा";
      pbBtn.classList.toggle("success", isOn);
      pbBtn.classList.toggle("warn", !isOn);
    }

    const enBtn = document.getElementById("enableNotifBtn");
    if (enBtn) {
      enBtn.textContent = isOn ? "✅ Auto 10/4/6 चालू" : "🔔 10/4/6 Push चालू करा";
    }
  }

  async function requestAutoPushEnable() {
    if (!("Notification" in window)) {
      alert("तुमच्या ब्राउझरमध्ये Notification सुविधा उपलब्ध नाही.");
      return;
    }

    if (Notification.permission === "denied") {
      alert("⚠️ Notification ब्लॉक आहे.\nकृपया Chrome च्या वरच्या कुलूप (🔒) आयकॉनवर किंवा App Info → Notifications मध्ये जाऊन 'Allow' करा.");
      updatePushButtonsUi();
      return;
    }

    let perm = Notification.permission;
    if (perm !== "granted") {
      perm = await Notification.requestPermission();
    }

    if (perm === "granted") {
      localStorage.setItem(AUTO_ENABLED_KEY, "1");
      updatePushButtonsUi();
      await showNativeNotification(
        "✅ ऑटो 10 / 4 / 6 Push अलर्ट चालू!",
        "आता दररोज सकाळी १०, दुपारी ४ आणि संध्याकाळी ६ वाजता व्याज व उधारी वायद्यांचे अलर्ट आपोआप येतील.",
        "vyaj-push-ready"
      );
      setTimeout(runScheduledPushCheck, 1200);
    } else {
      updatePushButtonsUi();
    }
  }

  function bindPushControls() {
    document.addEventListener("click", (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest("#pbPushStatusBtn, #enableNotifBtn, #enableProPushBtn, #testNotifBtn") : null;
      if (!btn) return;

      if (btn.id === "testNotifBtn") {
        ev.preventDefault();
        ev.stopPropagation();
        if (Notification.permission !== "granted") {
          requestAutoPushEnable();
        } else {
          showNativeNotification(
            "🧪 Test अलर्ट — व्याज हिशोब वही",
            "तुमचे ऑटोमॅटिक 10 / 4 / 6 Push अलर्ट १००% बरोबर काम करत आहे!",
            "vyaj-test-alert"
          );
        }
        return;
      }

      ev.preventDefault();
      ev.stopPropagation();
      requestAutoPushEnable();
    }, true);
  }

  function initAutoPush() {
    bindPushControls();
    updatePushButtonsUi();

    // परवानगी आधीच दिलेली असेल तर कोणताही क्लिक न करता लगेच ऑटो-मोड चालू करा
    if ("Notification" in window && Notification.permission === "granted") {
      localStorage.setItem(AUTO_ENABLED_KEY, "1");
      setTimeout(runScheduledPushCheck, 2800);
      setTimeout(runScheduledPushCheck, 7000);
    }

    // दर ५ मिनिटांनी शांतपणे वेळ तपासा (०% लोड)
    clearInterval(checkTimer);
    checkTimer = setInterval(() => {
      if (Notification.permission === "granted") runScheduledPushCheck();
    }, 300000);

    // अ‍ॅप बॅकग्राउंडमधून पुन्हा उघडताच स्लॉट तपासा
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && "Notification" in window && Notification.permission === "granted") {
        setTimeout(runScheduledPushCheck, 900);
        updatePushButtonsUi();
      }
    });
  }

  window.VyajAutoPush = { enable: requestAutoPushEnable, checkNow: runScheduledPushCheck };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAutoPush);
  else initAutoPush();
})();
