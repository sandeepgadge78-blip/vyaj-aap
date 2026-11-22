// व्याज हिशोब वही - लाईव्ह सेटिंग्ज सेव्ह, क्लाउड सिंक व Auto-Lock मॉड्यूल (js/settings-sync.js - V14.7)
(function () {
  const SETTINGS_KEY = "vyaj_aap_settings_v1";
  const DEFAULT_SETTINGS = {
    autoLockMs: 300000, // ५ मिनिटे (5 Min)
    defaultRate: 2,     // २% मासिक
    updatedAt: 0
  };

  let inactivityTimer = null;

  // स्थानिक (localStorage) मधून सेटिंग्ज वाचा (load settings from localStorage)
  function loadLocalSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      return {
        autoLockMs: Number(parsed.autoLockMs) || DEFAULT_SETTINGS.autoLockMs,
        defaultRate:
          parsed.defaultRate !== undefined && parsed.defaultRate !== ""
            ? Number(parsed.defaultRate)
            : DEFAULT_SETTINGS.defaultRate,
        updatedAt: Number(parsed.updatedAt) || 0
      };
    } catch (err) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  // स्थानिक (localStorage) मध्ये सेटिंग्ज सेव्ह करा (save settings to localStorage)
  function saveLocalSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      console.error("Settings local save error:", err);
    }
  }

  // Firebase क्लाउडमध्ये सेटिंग्ज लाईव्ह सिंक करा (sync settings live to Firebase Firestore)
  async function saveCloudSettings(settings) {
    try {
      if (typeof firebase === "undefined" || !firebase.auth || !firebase.firestore) return;
      const user = firebase.auth().currentUser;
      if (!user) return;
      await firebase
        .firestore()
        .collection("users")
        .doc(user.uid)
        .collection("meta")
        .doc("appSettings")
        .set(settings, { merge: true });
    } catch (err) {
      // क्लाउड नियम वेगळे असल्यास स्थानिक सेव्ह चालूच राहील (fallback silently to local)
      console.warn("Cloud settings sync skipped:", err.message);
    }
  }

  // Firebase क्लाउडमधून ताज्या सेटिंग्ज आणा (fetch latest settings from Firebase)
  async function pullCloudSettings() {
    try {
      if (typeof firebase === "undefined" || !firebase.auth || !firebase.firestore) return;
      const user = firebase.auth().currentUser;
      if (!user) return;

      const docSnap = await firebase
        .firestore()
        .collection("users")
        .doc(user.uid)
        .collection("meta")
        .doc("appSettings")
        .get();

      if (docSnap.exists) {
        const cloudData = docSnap.data();
        const localData = loadLocalSettings();
        if ((cloudData.updatedAt || 0) > (localData.updatedAt || 0)) {
          const merged = {
            autoLockMs: Number(cloudData.autoLockMs) || DEFAULT_SETTINGS.autoLockMs,
            defaultRate:
              cloudData.defaultRate !== undefined
                ? Number(cloudData.defaultRate)
                : DEFAULT_SETTINGS.defaultRate,
            updatedAt: Number(cloudData.updatedAt) || Date.now()
          };
          saveLocalSettings(merged);
          applySettingsToUI(merged);
        }
      }
    } catch (err) {
      console.warn("Cloud settings pull skipped:", err.message);
    }
  }

  // सर्व इनपुट बॉक्समध्ये सेव्ह केलेल्या सेटिंग्ज लागू करा (apply saved settings to UI inputs)
  function applySettingsToUI(settings) {
    const setAutoLock = document.getElementById("setAutoLockSelect");
    const hiddenAutoLock = document.getElementById("autoLockSelect");
    const setDefaultRate = document.getElementById("setDefaultRate");
    const newBorrowerRate = document.getElementById("bRate");

    if (setAutoLock) {
      setAutoLock.value = String(settings.autoLockMs);
    }
    if (hiddenAutoLock) {
      hiddenAutoLock.value = String(settings.autoLockMs);
      hiddenAutoLock.dispatchEvent(new Event("change"));
    }
    if (setDefaultRate) {
      setDefaultRate.value = String(settings.defaultRate);
    }
    if (newBorrowerRate) {
      newBorrowerRate.value = String(settings.defaultRate);
    }

    resetAutoLockTimer(settings.autoLockMs);
  }

  // अ‍ॅप न वापरल्यास निवडलेल्या वेळेनुसार ऑटो-लॉक करा (real inactivity auto-lock timer)
  function resetAutoLockTimer(ms) {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    const delay = Number(ms) || loadLocalSettings().autoLockMs;
    if (delay < 60000) return;

    inactivityTimer = setTimeout(() => {
      if (window.VyajSecurity && window.VyajSecurity.isPinEnabled()) {
        window.VyajSecurity.showLockScreen();
      }
    }, delay);
  }

  // युजरची हालचाल झाल्यावर टाईमर रीसेट करा (reset timer on user activity)
  function bindActivityListeners() {
    ["click", "touchstart", "keydown", "scroll"].forEach((evt) => {
      window.addEventListener(
        evt,
        () => {
          resetAutoLockTimer();
        },
        { passive: true }
      );
    });
  }

  // सेव्ह बटण व सेटिंग्ज पॉपअप जोडा (bind save button and modal observer)
  function initSettingsSync() {
    const current = loadLocalSettings();
    applySettingsToUI(current);
    bindActivityListeners();

    const saveBtn = document.getElementById("saveSettingsBtn");
    const setAutoLock = document.getElementById("setAutoLockSelect");
    const setDefaultRate = document.getElementById("setDefaultRate");
    const statusMsg = document.getElementById("setStatusMsg");

    if (saveBtn) {
      saveBtn.addEventListener("click", async function () {
        const autoLockMs = setAutoLock ? Number(setAutoLock.value) : DEFAULT_SETTINGS.autoLockMs;
        const rateVal = setDefaultRate ? parseFloat(setDefaultRate.value) : DEFAULT_SETTINGS.defaultRate;

        if (isNaN(rateVal) || rateVal < 0) {
          if (statusMsg) {
            statusMsg.textContent = "❌ कृपया योग्य व्याज दर (%) टाका.";
            statusMsg.style.color = "var(--danger)";
          }
          return;
        }

        const updated = {
          autoLockMs: autoLockMs || 300000,
          defaultRate: rateVal,
          updatedAt: Date.now()
        };

        saveLocalSettings(updated);
        applySettingsToUI(updated);
        await saveCloudSettings(updated);

        if (statusMsg) {
          statusMsg.textContent = `✅ सेटिंग्ज सेव्ह झाल्या! (Auto-Lock: ${updated.autoLockMs / 60000} मिनिटे, व्याज दर: ${updated.defaultRate}%)`;
          statusMsg.style.color = "var(--accent-2)";
        }
      });
    }

    // जेव्हा सेटिंग्ज पॉपअप उघडेल, तेव्हा सेव्ह केलेल्याच किमती दाखवा (restore saved values whenever modal opens)
    const settingsModal = document.getElementById("settingsModal");
    if (settingsModal) {
      const observer = new MutationObserver(() => {
        if (!settingsModal.classList.contains("hidden")) {
          applySettingsToUI(loadLocalSettings());
        }
      });
      observer.observe(settingsModal, { attributes: true, attributeFilter: ["class"] });
    }

    // नवीन ग्राहक फॉर्म उघडल्यावर सेव्ह केलेला Default व्याज दर भरा (apply default rate when add borrower opens)
    const addSec = document.getElementById("addBorrowerSection");
    if (addSec) {
      const addObserver = new MutationObserver(() => {
        if (!addSec.classList.contains("hidden")) {
          const bRate = document.getElementById("bRate");
          if (bRate) bRate.value = String(loadLocalSettings().defaultRate);
        }
      });
      addObserver.observe(addSec, { attributes: true, attributeFilter: ["class"] });
    }

    // Firebase लॉगिन झाल्यावर क्लाउडमधील सेटिंग्ज सिंक करा (sync with cloud on Firebase login)
    if (typeof firebase !== "undefined" && firebase.auth) {
      firebase.auth().onAuthStateChanged((user) => {
        if (user) pullCloudSettings();
      });
    }
  }

  window.VyajSettingsSync = {
    loadLocalSettings,
    applySettingsToUI
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSettingsSync);
  } else {
    initSettingsSync();
  }
})();
