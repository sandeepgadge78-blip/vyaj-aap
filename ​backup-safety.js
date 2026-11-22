// व्याज हिशोब वही - डेटा बॅकअप, रिस्टोर आणि सुरक्षितता मॉड्यूल
(function () {
  const SNAPSHOT_KEY = "vyaj_aap_auto_snapshot_v1";

  // सध्याचा डेटा सुरक्षितपणे वाचण्यासाठी फंक्शन (read current app data safely)
  function collectAppData() {
    const snapshot = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      // स्वतःचा स्नॅपशॉट पुन्हा सेव्ह होऊ नये म्हणून वगळा (skip self snapshot key)
      if (key === SNAPSHOT_KEY) continue;
      if (
        key.toLowerCase().includes("vyaj") ||
        key.toLowerCase().includes("hishob") ||
        key.toLowerCase().includes("loan") ||
        key.toLowerCase().includes("customer") ||
        key.toLowerCase().includes("ledger") ||
        key.toLowerCase().includes("cash") ||
        key.toLowerCase().includes("firebase")
      ) {
        snapshot[key] = localStorage.getItem(key);
      }
    }

    // कोणतीही जुनी की सापडली नाही तर सर्व localStorage घ्या (fallback to all localStorage)
    if (Object.keys(snapshot).length === 0) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key !== SNAPSHOT_KEY) {
          snapshot[key] = localStorage.getItem(key);
        }
      }
    }
    return snapshot;
  }

  // बदल करण्यापूर्वी ऑटो-स्नॅपशॉट सेव्ह करा (save automatic snapshot before restore)
  function saveAutoSnapshot() {
    try {
      const payload = {
        savedAt: new Date().toISOString(),
        data: collectAppData()
      };
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(payload));
      return true;
    } catch (err) {
      console.error("Snapshot save error:", err);
      return false;
    }
  }

  // JSON बॅकअप फाईल डाउनलोड करा (download JSON backup file)
  function exportJsonBackup() {
    try {
      const data = collectAppData();
      const keysCount = Object.keys(data).length;
      if (keysCount === 0) {
        alert("बॅकअप घेण्यासाठी सध्या कोणताही डेटा आढळला नाही.");
        return;
      }

      const backupPackage = {
        app: "व्याज हिशोब वही (vyaj-aap)",
        version: "v14.3-safety",
        exportedAt: new Date().toISOString(),
        data: data
      };

      const jsonStr = JSON.stringify(backupPackage, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      const datePart = new Date().toISOString().slice(0, 10);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vyaj-hishob-backup-${datePart}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert("JSON बॅकअप यशस्वीरीत्या डाउनलोड झाला आहे.");
    } catch (err) {
      console.error("Backup export error:", err);
      alert("बॅकअप तयार करताना अडचण आली.");
    }
  }

  // JSON फाईलमधून डेटा रिस्टोर करा (restore data from JSON file with validation)
  function restoreFromJsonFile(file) {
    if (!file) return;
    const reader = new FileReader();

    reader.onload = function (event) {
      try {
        const parsed = JSON.parse(event.target.result);
        const targetData = parsed && parsed.data && typeof parsed.data === "object"
          ? parsed.data
          : parsed;

        if (!targetData || typeof targetData !== "object" || Array.isArray(targetData)) {
          alert("ही बॅकअप फाईल योग्य स्वरूपात नाही.");
          return;
        }

        const entries = Object.entries(targetData);
        if (entries.length === 0) {
          alert("बॅकअप फाईलमध्ये कोणताही डेटा नाही.");
          return;
        }

        const ok = confirm(
          "हा बॅकअप रिस्टोर केल्यास सध्याचा डेटा बदलू शकतो. आधी ऑटो-स्नॅपशॉट सेव्ह केला जाईल. पुढे जायचे का?"
        );
        if (!ok) return;

        // रिस्टोर करण्यापूर्वी सुरक्षित स्नॅपशॉट जपा (keep safety snapshot first)
        saveAutoSnapshot();

        let restoredCount = 0;
        for (const [key, value] of entries) {
          if (typeof key === "string" && key.trim() !== "" && key !== SNAPSHOT_KEY) {
            const finalVal = typeof value === "string" ? value : JSON.stringify(value);
            localStorage.setItem(key, finalVal);
            restoredCount++;
          }
        }

        alert(`रिस्टोर पूर्ण झाले (${restoredCount} नोंदी). अ‍ॅप आता रीलोड होईल.`);
        window.location.reload();
      } catch (err) {
        console.error("Restore parse error:", err);
        alert("JSON फाईल वाचताना एरर आला. फाईल खराब असू शकते.");
      }
    };

    reader.readAsText(file);
  }

  // ऑटो-स्नॅपशॉटवरून मागे जाण्यासाठी फंक्शन (restore from automatic snapshot)
  function restoreAutoSnapshot() {
    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      if (!raw) {
        alert("कोणताही ऑटो-स्नॅपशॉट उपलब्ध नाही.");
        return;
      }
      const snap = JSON.parse(raw);
      if (!snap || !snap.data || typeof snap.data !== "object") {
        alert("स्नॅपशॉट डेटा वाचता आला नाही.");
        return;
      }

      const ok = confirm(
        `तुम्ही ${snap.savedAt || "मागील"} वेळच्या ऑटो-स्नॅपशॉटवर परत जाऊ इच्छिता का?`
      );
      if (!ok) return;

      for (const [key, value] of Object.entries(snap.data)) {
        if (key !== SNAPSHOT_KEY) {
          localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
        }
      }

      alert("ऑटो-स्नॅपशॉट यशस्वीरीत्या रिस्टोर झाला. अ‍ॅप आता रीलोड होईल.");
      window.location.reload();
    } catch (err) {
      console.error("Snapshot restore error:", err);
      alert("स्नॅपशॉट रिस्टोर करताना एरर आला.");
    }
  }

  // लहान फ्लोटिंग बॅकअप पॅनेल तयार करा (render compact floating safety bar)
  function mountSafetyBar() {
    if (document.getElementById("vyaj-safety-bar")) return;

    const bar = document.createElement("div");
    bar.id = "vyaj-safety-bar";
    bar.style.cssText = [
      "position:fixed",
      "bottom:12px",
      "right:12px",
      "z-index:9999",
      "display:flex",
      "gap:6px",
      "background:#0c1120",
      "border:1px solid #2b3a67",
      "padding:6px 8px",
      "border-radius:10px",
      "box-shadow:0 6px 18px rgba(0,0,0,0.45)",
      "font-family:sans-serif",
      "font-size:12px"
    ].join(";");

    const btnStyle =
      "background:#162238;color:#e8eefc;border:1px solid #35507a;border-radius:7px;padding:5px 8px;cursor:pointer;";

    const backupBtn = document.createElement("button");
    backupBtn.type = "button";
    backupBtn.textContent = "💾 बॅकअप";
    backupBtn.style.cssText = btnStyle;
    backupBtn.onclick = exportJsonBackup;

    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.textContent = "♻️ रिस्टोर";
    restoreBtn.style.cssText = btnStyle;

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.style.display = "none";
    fileInput.onchange = function (e) {
      if (e.target.files && e.target.files[0]) {
        restoreFromJsonFile(e.target.files[0]);
        e.target.value = "";
      }
    };

    restoreBtn.onclick = function () {
      fileInput.click();
    };

    const undoBtn = document.createElement("button");
    undoBtn.type = "button";
    undoBtn.textContent = "⏪ स्नॅपशॉट";
    undoBtn.style.cssText = btnStyle;
    undoBtn.onclick = restoreAutoSnapshot;

    bar.appendChild(backupBtn);
    bar.appendChild(restoreBtn);
    bar.appendChild(undoBtn);
    bar.appendChild(fileInput);
    document.body.appendChild(bar);
  }

  window.VyajSafety = {
    exportJsonBackup,
    restoreFromJsonFile,
    restoreAutoSnapshot,
    saveAutoSnapshot
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountSafetyBar);
  } else {
    mountSafetyBar();
  }
})();
