// व्याज हिशोब वही - डेटा बॅकअप, रिस्टोर आणि सुरक्षितता मॉड्यूल (V14.5 - Clean UI)
(function () {
  const SNAPSHOT_KEY = "vyaj_aap_auto_snapshot_v1";

  // सध्याचा डेटा सुरक्षितपणे वाचण्यासाठी फंक्शन (read current app data safely)
  function collectAppData() {
    const snapshot = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || key === SNAPSHOT_KEY) continue;
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

    // जुन्या कीज सापडल्या नाहीत तर सर्व localStorage घ्या (fallback to all localStorage)
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
        savedAt: new Date().toLocaleString("mr-IN"),
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
      if (Object.keys(data).length === 0) {
        alert("बॅकअप घेण्यासाठी सध्या कोणताही स्थानिक डेटा आढळला नाही.");
        return;
      }

      const backupPackage = {
        app: "व्याज हिशोब वही (vyaj-aap)",
        version: "v14.5-safety",
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
        const targetData =
          parsed && parsed.data && typeof parsed.data === "object"
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

  // रिपोर्ट्स विभागात स्वच्छ बॅकअप पॅनेल जोडा (mount clean safety box inside #reportsSection)
  function mountSafetyPanel() {
    if (document.getElementById("vyaj-safety-panel")) return;

    const reportsSection = document.getElementById("reportsSection");
    if (!reportsSection) return;

    const box = document.createElement("div");
    box.id = "vyaj-safety-panel";
    box.className = "meta-box";
    box.style.marginTop = "12px";

    const title = document.createElement("div");
    title.style.fontWeight = "700";
    title.style.marginBottom = "8px";
    title.style.color = "var(--accent)";
    title.textContent = "🛡️ झटपट JSON बॅकअप व ऑटो-स्नॅपशॉट (Safety Module)";

    const btnRow = document.createElement("div");
    btnRow.className = "row";

    const backupBtn = document.createElement("button");
    backupBtn.type = "button";
    backupBtn.className = "success sm";
    backupBtn.textContent = "💾 JSON बॅकअप";
    backupBtn.onclick = exportJsonBackup;

    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.className = "primary sm";
    restoreBtn.textContent = "♻️ JSON रिस्टोर";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.className = "hidden";
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
    undoBtn.className = "warn sm";
    undoBtn.textContent = "⏪ ऑटो-स्नॅपशॉट";
    undoBtn.onclick = restoreAutoSnapshot;

    btnRow.appendChild(backupBtn);
    btnRow.appendChild(restoreBtn);
    btnRow.appendChild(undoBtn);
    btnRow.appendChild(fileInput);

    box.appendChild(title);
    box.appendChild(btnRow);
    reportsSection.appendChild(box);
  }

  window.VyajSafety = {
    exportJsonBackup,
    restoreFromJsonFile,
    restoreAutoSnapshot,
    saveAutoSnapshot
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountSafetyPanel);
  } else {
    mountSafetyPanel();
  }
})();
