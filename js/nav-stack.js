// व्याज हिशोब वही - ग्लोबल Step-by-Step Back Navigation मॅनेजर (js/nav-stack.js - V14.23)
(function () {
  const stack = [];
  let isInternalChange = false;
  let syncTimer = null;

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
      setTimeout(() => { isInternalChange = false; notifyVisibilityChange(); }, 40);
    }
  }

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
      setTimeout(() => { isInternalChange = false; notifyVisibilityChange(); }, 40);
    }
  }

  function pushDrawer(id, onClose, onRestore) {
    const existingIdx = stack.findIndex((x) => x.id === id && x.type === "drawer");
    if (existingIdx !== -1) stack.splice(existingIdx, 1);
    stack.push({ id, type: "drawer", suspended: false, onClose, onRestore });
    pushBrowserState("drawer:" + id);
    notifyVisibilityChange();
  }

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

  function pushSubStep(id, onBack) {
    const existingIdx = stack.findIndex((x) => x.id === id && x.type === "substep");
    if (existingIdx !== -1) stack.splice(existingIdx, 1);
    stack.push({ id, type: "substep", suspended: false, onBack });
    pushBrowserState("sub:" + id);
  }

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
    }, 60);
  }

  function stepBack() {
    if (stack.length > 0) {
      const top = stack.pop();
      hideEntry(top);

      const prev = stack[stack.length - 1];
      if (prev && prev.suspended) {
        restoreEntry(prev);
      }
      return true;
    }

    const vis = getVisibleModals();
    if (vis.length > 0) {
      isInternalChange = true;
      vis[vis.length - 1].classList.add("hidden");
      setTimeout(() => { isInternalChange = false; notifyVisibilityChange(); }, 40);
      return true;
    }
    return false;
  }

  function popIfTop(id) {
    const top = stack[stack.length - 1];
    if (top && top.id === id) {
      stack.pop();
      const prev = stack[stack.length - 1];
      if (prev && prev.suspended) restoreEntry(prev);
      notifyVisibilityChange();
    }
  }

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
    setTimeout(() => { isInternalChange = false; notifyVisibilityChange(); }, 40);
  }

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

  // सुरक्षित Debounced Observer
  function initNavStack() {
    const obs = new MutationObserver(() => {
      if (isInternalChange) return;
      clearTimeout(syncTimer);
      syncTimer = setTimeout(syncAutoOpenedModals, 50);
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
