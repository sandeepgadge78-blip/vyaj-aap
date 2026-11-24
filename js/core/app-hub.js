// व्याज हिशोब वही - मध्यवर्ती App Hub, Event Bus व Zero-Load Slot Guardian (js/core/app-hub.js - V14.46)
(function () {
  if (window.VyajHub) return;

  const modules = new Map();       // सध्याच्या आणि भविष्यातील सर्व फीचर्सची यादी
  const listeners = new Map();     // Event Bus साठी listeners
  let rafId = null;
  let lastSyncTs = 0;
  let listObserverBound = false;

  // डॅशबोर्डवरील प्रत्येक मुख्य भागाची फिक्स जागा (Fixed Slot Map)
  const FIXED_SLOT_MAP = [
    { elId: "proUdhaariAlertStrip", slotId: "slot-udhaari-alert" },
    { elId: "proPromiseActivityWrap", slotId: "slot-promise-bar" },
    { elId: "vyajLiveBackupBar", slotId: "slot-live-backup" },
    { elId: "proInterestSplitBar", slotId: "slot-interest-bar" },
    { elId: "proPendingSplitBar", slotId: "slot-pending-bar" },
    { elId: "vyajSmartProStrip", slotId: "slot-radar-strip" }
  ];

  // १. Event Bus: कोणतेही मॉड्यूल इव्हेंट ऐकू किंवा पाठवू शकते
  function on(eventName, handler) {
    if (!eventName || typeof handler !== "function") return;
    if (!listeners.has(eventName)) listeners.set(eventName, new Set());
    listeners.get(eventName).add(handler);
  }

  function off(eventName, handler) {
    const set = listeners.get(eventName);
    if (set) set.delete(handler);
  }

  function emit(eventName, detail) {
    const set = listeners.get(eventName);
    if (!set || !set.size) return;
    set.forEach((fn) => {
      try {
        fn(detail);
      } catch (err) {
        console.warn("VyajHub Event Error:", eventName, err);
      }
    });
  }

  // २. सुरक्षित Slot मध्ये कोणताही घटक बसवण्यासाठी (इतर फाईल्सचे बटण न पुसता)
  function mountToSlot(slotId, element, fallbackFn) {
    if (!element) return false;
    const slot = slotId ? document.getElementById(slotId) : null;
    if (slot) {
      if (element.parentElement !== slot) {
        slot.appendChild(element);
      }
      return true;
    }
    if (typeof fallbackFn === "function") {
      fallbackFn(element);
      return true;
    }
    return false;
  }

  // ३. डॅशबोर्डवरील सर्व बार्स त्यांच्या फिक्स जागेवर आहेत का ते तपासणे (०% अतिरिक्त लोड)
  function enforceSlots() {
    const appScreen = document.getElementById("appScreen");
    if (!appScreen || appScreen.classList.contains("hidden")) return;

    FIXED_SLOT_MAP.forEach(({ elId, slotId }) => {
      const slot = document.getElementById(slotId);
      const el = document.getElementById(elId);
      if (slot && el && el.parentElement !== slot) {
        slot.appendChild(el);
      }
    });
  }

  // ४. सर्व Registered फीचर्सना 60fps वेगाने एकाच फ्रेममध्ये अपडेट करणे
  function runSyncPass(reason) {
    const now = Date.now();
    if (now - lastSyncTs < 60) return;
    lastSyncTs = now;

    enforceSlots();

    modules.forEach((renderFn, name) => {
      try {
        renderFn(reason);
      } catch (err) {
        console.warn("VyajHub Module Error:", name, err);
      }
    });

    emit("ui:synced", { reason, ts: now });
  }

  function notifyDataUpdated(reason) {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = null;
      emit("data:updated", { reason: reason || "update" });
      runSyncPass(reason || "update");
    });
  }

  // ५. सध्याच्या व भविष्यातील कोणत्याही नवीन फाईलची नोंदणी (Future-Proof API)
  function register(name, renderFn) {
    if (!name || typeof renderFn !== "function") return;
    modules.set(name, renderFn);
    if (document.readyState !== "loading") {
      requestAnimationFrame(() => {
        try {
          renderFn("register");
          enforceSlots();
        } catch (err) {
          console.warn("VyajHub Register Init Error:", name, err);
        }
      });
    }
  }

  // ६. संपूर्ण अ‍ॅपसाठी फक्त १ हलका Observer (फक्त #borrowersList वर — document.body वर नाही)
  function bindCoreWatchers() {
    const listEl = document.getElementById("borrowersList");
    if (listEl && !listObserverBound) {
      listObserverBound = true;
      const obs = new MutationObserver(() => {
        notifyDataUpdated("borrowersList");
      });
      obs.observe(listEl, { childList: true });
    }

    const activeYmEl = document.getElementById("activeYm");
    if (activeYmEl && !activeYmEl.dataset.vhBound) {
      activeYmEl.dataset.vhBound = "1";
      activeYmEl.addEventListener("change", () => notifyDataUpdated("monthChange"));
    }
  }

  // पेज लोड होताच किंवा APK बॅकग्राउंडमधून पुन्हा उघडताच स्वच्छ सिंक करा
  function initHub() {
    bindCoreWatchers();
    notifyDataUpdated("domReady");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHub);
  } else {
    initHub();
  }

  window.addEventListener("load", () => {
    bindCoreWatchers();
    notifyDataUpdated("windowLoad");
    setTimeout(() => notifyDataUpdated("postLoad"), 900);
  });

  window.addEventListener("pageshow", () => {
    notifyDataUpdated("pageShow");
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) notifyDataUpdated("resume");
  });

  window.VyajHub = {
    version: "14.46",
    register,
    on,
    off,
    emit,
    mountToSlot,
    enforceSlots,
    notifyDataUpdated
  };
})();
