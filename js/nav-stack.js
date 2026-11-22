// व्याज हिशोब वही - ग्लोबल Step-by-Step Back Navigation मॅनेजर (js/nav-stack.js - V14.22)
(function () {
  const stack = [];
  let isInternalChange = false;

  // सध्या उघडे असलेले सर्व Modals शोधा
  function getVisibleModals() {
    return Array.from(document.querySelectorAll(".modal-backdrop")).filter(
      (m) => !m.classList.contains("hidden") && window.getComputedStyle(m).display !== "none"
    );
  }

  function isDrawerVisible(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    return !el.classList.contains("hidden") && el.classList.contains("open");
  }

  function notifyVisibilityChange() {
    if (typeof window.updateVyajNewBtnVisibility === "function") {
      window.updateVyajNewBtnVisibility();
    }
  }

  function pushBrowserState(tag) {
    try {
      history.pushState({ vyajNavStep: tag || "step", ts: Date.now() }, "");
    } catch (_) {}
  }

  // एखादे Modal/Drawer एलिमेंट बंद करा
  function hideEntry(entry) {
    if (!entry) return;
    isInternalChange = true;
    try {
      if (entry.type === "substep") {
        if (typeof entry.onBack === "function") entry.onBack();
      } else if (entry.type === "drawer") {
        if (typeof entry.onClose === "function") entry.onClose();
        else {
          const el = document.getElementById(entry.id);
          if (el) { el.classList.remove("open"); el.classList.add("hidden"); }
        }
      } else if (entry.type === "modal") {
        const el = document.getElementById(entry.id);
        if (el) el.classList.add("hidden");
      }
    } finally {
      setTimeout(() => { isInternalChange = false; notifyVisibilityChange(); }, 30);
    }
  }

  // मागील Suspended Modal/Drawer पुन्हा उघडा (Step-by-Step मागे येण्यासाठी)
  function restoreEntry(entry) {
    if (!entry) return;
    isInternalChange = true;
    try {
      entry.suspended = false;
      if (entry.type === "drawer") {
        if (typeof entry.onRestore === "function") entry.onRestore();
        else {
          const el = document.getElementById(entry.id);
          if (el) { el.classList.remove("hidden"); el.classList.add("open"); }
        }
      } else if (entry.type === "modal") {
        const el = document.getElementById(entry.id);
        if (el) el.classList.remove("hidden");
      }
    } finally {
      setTimeout(() => { isInternalChange = false; notifyVisibilityChange(); }, 30);
    }
  }

  // नवीन Drawer स्टॅकवर जोडा
  function pushDrawer(id, onClose, onRestore) {
    const existingIdx = stack.findIndex((x) => x.id === id && x.type === "drawer");
    if (existingIdx !== -1) stack.splice(existingIdx, 1);
    stack.push({ id, type: "drawer", suspended: false, onClose, onRestore });
    pushBrowserState("drawer:" + id);
    notifyVisibilityChange();
  }

  // नवीन Modal स्टॅकवर जोडा
  function pushModal(id) {
    if (!id) return;
    const top = stack[stack.length - 1];
    if (top && top.type === "modal" && top.id === id && !top.suspended) return;

    const existingIdx = stack.findIndex((x) => x.id === id && x.type === "modal");
    if (existingIdx !== -1) stack.splice(existingIdx, 1);

    stack.push({ id, type: "modal", suspended: false });
    pushBrowserState("modal:" + id);
    notifyVisibilityChange();
  }

  // एकाच पॉपअपमधील अंतर्गत पायरी जोडा (उदा. यादी → ग्राहकाचा इतिहास)
  function pushSubStep(id, onBack) {
    const existingIdx = stack.findIndex((x) => x.id === id && x.type === "substep");
    if (existingIdx !== -1) stack.splice(existingIdx, 1);
    stack.push({ id, type: "substep", suspended: false, onBack });
    pushBrowserState("sub:" + id);
  }

  // एका स्क्रीन/पॉपअपमधून पुढचे पॉपअप उघडा (मागील स्क्रीन लपवून सुरक्षित ठेवा)
  function navigateFrom(currentId, openNextFn) {
    isInternalChange = true;
    try {
      const idx = stack.findIndex((x) => x.id === currentId);
      if (idx !== -1) {
        const cur = stack[idx];
        cur.suspended = true;
        if (cur.type === "drawer" && typeof cur.onClose === "function") {
          cur.onClose(true);
        } else {
          const el = document.getElementById(cur.id);
          if (el) { el.classList.remove("open"); el.classList.add("hidden"); }
        }
      } else if (currentId) {
        const el = document.getElementById(currentId);
        if (el) {
          const isDrw = el.id === "proUnifiedDrawer";
          stack.push({ id: currentId, type: isDrw ? "drawer" : "modal", suspended: true });
          el.classList.remove("open");
          el.classList.add("hidden");
        }
      }
    } finally {
      isInternalChange = false;
    }

    if (typeof openNextFn === "function") {
      openNextFn();
    }
    setTimeout(() => {
      syncAutoOpenedModals();
      notifyVisibilityChange();
    }, 50);
  }

  // एक पायरी मागे जा (Mobile Back बटण दाबल्यावर)
  function stepBack() {
    if (stack.length > 0) {
      const top = stack.pop();
      hideEntry(top);

      // जर त्याखाली एखादी Suspended स्क्रीन असेल तर ती पुन्हा उघडा
      const prev = stack[stack.length - 1];
      if (prev && prev.suspended) {
        restoreEntry(prev);
      }
      return true;
    }

    // Fallback: स्टॅक रिकामा असला तरी कोणतेही Modal उघडे असल्यास ते बंद करा
    const vis = getVisibleModals();
    if (vis.length > 0) {
      isInternalChange = true;
      vis[vis.length - 1].classList.add("hidden");
      setTimeout(() => { isInternalChange = false; notifyVisibilityChange(); }, 30);
      return true;
    }
    return false;
  }

  // बाहेर क्लिक करून सर्वात वरचे पॉपअप बंद केले असल्यास स्टॅक सिंक करा
  function popIfTop(id) {
    const top = stack[stack.length - 1];
    if (top && top.id === id) {
      stack.pop();
      const prev = stack[stack.length - 1];
      if (prev && prev.suspended) restoreEntry(prev);
      notifyVisibilityChange();
    }
  }

  // संपूर्ण स्टॅक रिकामा करा (उदा. Home वर क्लिक केल्यावर)
  function clearAll() {
    isInternalChange = true;
    while (stack.length > 0) {
      const item = stack.pop();
      if (item.type === "drawer" && typeof item.onClose === "function") item.onClose();
      else if (item.type === "modal") {
        const el = document.getElementById(item.id);
        if (el) el.classList.add("hidden");
      }
    }
    setTimeout(() => { isInternalChange = false; notifyVisibilityChange(); }, 30);
  }

  // app.js किंवा कोणत्याही मॉड्यूलने उघडलेले Modal आपोआप स्टॅकमध्ये नोंदवा
  function syncAutoOpenedModals() {
    if (isInternalChange) return;
    const visible = getVisibleModals();
    visible.forEach((m) => {
      if (!m.id) return;
      const exists = stack.some((x) => x.id === m.id && x.type === "modal" && !x.suspended);
      if (!exists) {
        pushModal(m.id);
      }
    });

    // जर एखादे Modal बाहेरून बंद झाले असेल तर ते स्टॅकमधून काढा
    for (let i = stack.length - 1; i >= 0; i--) {
      const item = stack[i];
      if (item.type === "modal" && !item.suspended) {
        const el = document.getElementById(item.id);
        if (!el || el.classList.contains("hidden")) {
          stack.splice(i, 1);
          const prev = stack[stack.length - 1];
          if (prev && prev.suspended) restoreEntry(prev);
        }
      }
    }
    notifyVisibilityChange();
  }

  function hasActiveOverlay() {
    if (getVisibleModals().length > 0) return true;
    if (isDrawerVisible("proUnifiedDrawer")) return true;
    const otherDrawer = document.querySelector(".drawer.open, .sidebar.open, #sideDrawer:not(.hidden), #mobileDrawer.open");
    return Boolean(otherDrawer);
  }

  window.addEventListener("popstate", () => {
    stepBack();
  });

  function initNavStack() {
    const obs = new MutationObserver(() => {
      if (isInternalChange) return;
      syncAutoOpenedModals();
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  window.VyajNavStack = {
    pushDrawer,
    pushModal,
    pushSubStep,
    navigateFrom,
    stepBack,
    popIfTop,
    clearAll,
    hasActiveOverlay,
    isInternal: () => isInternalChange
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNavStack);
  } else {
    initNavStack();
  }
})();
