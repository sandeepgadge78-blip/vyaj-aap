// व्याज हिशोब वही - रोजचा कॅशबुक व मासिक Excel/CSV रिपोर्ट मॉड्यूल (js/cashbook.js - V14.8)
(function () {
  const CASHBOOK_KEY = "vyaj_aap_cashbook_v1";

  // आजची तारीख YYYY-MM-DD स्वरूपात मिळवा (get today's date)
  function getTodayDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // चालू महिना YYYY-MM स्वरूपात मिळवा (get current month)
  function getCurrentYm() {
    return getTodayDate().slice(0, 7);
  }

  // स्थानिक (localStorage) मधून कॅशबुक नोंदी वाचा (load entries from localStorage)
  function loadEntries() {
    try {
      const raw = localStorage.getItem(CASHBOOK_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  // स्थानिक (localStorage) मध्ये नोंदी सेव्ह करा (save entries to localStorage)
  function saveEntriesLocal(entries) {
    try {
      localStorage.setItem(CASHBOOK_KEY, JSON.stringify(entries));
    } catch (err) {
      console.error("Cashbook local save error:", err);
    }
  }

  // Firebase क्लाउडमध्ये कॅशबुक लाईव्ह सिंक करा (sync cashbook live to Firebase Firestore)
  async function syncToCloud(entries) {
    try {
      if (typeof firebase === "undefined" || !firebase.auth || !firebase.firestore) return;
      const user = firebase.auth().currentUser;
      if (!user) return;

      await firebase
        .firestore()
        .collection("users")
        .doc(user.uid)
        .collection("meta")
        .doc("cashbook")
        .set({
          entries: entries,
          updatedAt: Date.now()
        }, { merge: true });
    } catch (err) {
      console.warn("Cashbook cloud sync skipped:", err.message);
    }
  }

  // Firebase क्लाउडमधून ताज्या नोंदी आणा (pull latest cashbook from Firebase)
  async function pullFromCloud() {
    try {
      if (typeof firebase === "undefined" || !firebase.auth || !firebase.firestore) return;
      const user = firebase.auth().currentUser;
      if (!user) return;

      const snap = await firebase
        .firestore()
        .collection("users")
        .doc(user.uid)
        .collection("meta")
        .doc("cashbook")
        .get();

      if (snap.exists) {
        const data = snap.data();
        if (Array.isArray(data.entries)) {
          const local = loadEntries();
          // क्लाउडमध्ये जास्त किंवा ताज्या नोंदी असतील तर अपडेट करा (update if cloud has entries)
          if (data.entries.length >= local.length) {
            saveEntriesLocal(data.entries);
            renderCashbookList();
          }
        }
      }
    } catch (err) {
      console.warn("Cashbook cloud pull skipped:", err.message);
    }
  }

  // सुरक्षित HTML टेक्स्ट (escape HTML safely)
  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // कॅशबुक पॉपअप (Modal) तयार करा (build cashbook modal UI)
  function createCashbookModal() {
    if (document.getElementById("vyajCashbookModal")) return;

    const modal = document.createElement("div");
    modal.id = "vyajCashbookModal";
    modal.className = "modal-backdrop hidden";

    modal.innerHTML = `
      <div class="modal-card" style="max-width:680px;">
        <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
          <h3 style="margin:0; color:var(--accent);">📒 रोजचा कॅशबुक (Cashbook & P&L)</h3>
          <button type="button" id="closeCashbookModalBtn" class="danger sm">✕ बंद</button>
        </div>

        <!-- महिना निवड आणि Excel डाउनलोड -->
        <div class="row" style="justify-content:space-between; margin-bottom:10px;">
          <div class="row">
            <label class="muted" for="cbMonthFilter">महिना:</label>
            <input type="month" id="cbMonthFilter" value="${getCurrentYm()}" />
          </div>
          <button type="button" id="cbExportExcelBtn" class="success sm">📊 Excel / CSV डाउनलोड</button>
        </div>

        <!-- ३ सारांश कार्ड्स -->
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:12px;">
          <div class="meta-box" style="text-align:center; margin-top:0;">
            <div class="muted" style="font-size:0.74rem;">एकूण जमा (In)</div>
            <div id="cbSumIn" style="font-size:1.1rem; font-weight:800; color:var(--accent-2);">₹0</div>
          </div>
          <div class="meta-box" style="text-align:center; margin-top:0;">
            <div class="muted" style="font-size:0.74rem;">एकूण खर्च (Out)</div>
            <div id="cbSumOut" style="font-size:1.1rem; font-weight:800; color:var(--danger);">₹0</div>
          </div>
          <div class="meta-box" style="text-align:center; margin-top:0;">
            <div class="muted" style="font-size:0.74rem;">निव्वळ शिल्लक</div>
            <div id="cbSumNet" style="font-size:1.1rem; font-weight:800; color:var(--gold);">₹0</div>
          </div>
        </div>

        <!-- नवीन नोंद फॉर्म -->
        <div class="meta-box" style="margin-bottom:12px;">
          <div style="font-weight:700; margin-bottom:8px; color:var(--accent);">+ नवीन जमा / खर्च नोंद</div>
          <div class="grid-3">
            <div class="field">
              <label>तारीख</label>
              <input type="date" id="cbDateInput" value="${getTodayDate()}" />
            </div>
            <div class="field">
              <label>प्रकार</label>
              <select id="cbTypeInput">
                <option value="in">🟢 जमा (वसुली / उत्पन्न)</option>
                <option value="out">🔴 खर्च / कर्ज वाटप</option>
              </select>
            </div>
            <div class="field">
              <label>रक्कम (₹) *</label>
              <input type="number" id="cbAmountInput" min="1" placeholder="उदा. 5000" />
            </div>
            <div class="field">
              <label>पेमेंट पद्धत</label>
              <select id="cbModeInput">
                <option value="Cash">💵 रोख (Cash)</option>
                <option value="UPI">📱 UPI / PhonePe</option>
                <option value="Bank">🏦 बँक (Bank)</option>
              </select>
            </div>
            <div class="field" style="grid-column: span 2;">
              <label>तपशील / कारण *</label>
              <input type="text" id="cbNoteInput" placeholder="उदा. व्याज वसुली / नवीन कर्ज / ऑफिस खर्च" />
            </div>
          </div>
          <button type="button" id="cbAddEntryBtn" class="primary" style="width:100%; margin-top:10px;">💾 कॅशबुकमध्ये नोंद सेव्ह करा</button>
        </div>

        <!-- नोंदींची यादी -->
        <div id="cbEntriesList" style="max-height:300px; overflow-y:auto;"></div>
      </div>
    `;

    document.body.appendChild(modal);

    // बंद बटण आणि बाहेर क्लिक केल्यावर बंद करा (close handlers)
    document.getElementById("closeCashbookModalBtn").addEventListener("click", () => {
      modal.classList.add("hidden");
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });

    // महिना बदलल्यावर यादी अपडेट करा (re-render on month change)
    document.getElementById("cbMonthFilter").addEventListener("change", renderCashbookList);

    // नवीन नोंद सेव्ह करा (add new entry)
    document.getElementById("cbAddEntryBtn").addEventListener("click", async () => {
      const dateVal = document.getElementById("cbDateInput").value || getTodayDate();
      const typeVal = document.getElementById("cbTypeInput").value;
      const amtVal = parseFloat(document.getElementById("cbAmountInput").value);
      const modeVal = document.getElementById("cbModeInput").value;
      const noteVal = (document.getElementById("cbNoteInput").value || "").trim();

      if (isNaN(amtVal) || amtVal <= 0) {
        alert("कृपया योग्य रक्कम (₹) टाका.");
        return;
      }
      if (!noteVal) {
        alert("कृपया तपशील किंवा कारण लिहा.");
        return;
      }

      const entries = loadEntries();
      entries.unshift({
        id: "cb_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        date: dateVal,
        ym: dateVal.slice(0, 7),
        type: typeVal,
        amount: amtVal,
        mode: modeVal,
        note: noteVal,
        createdAt: Date.now()
      });

      saveEntriesLocal(entries);
      await syncToCloud(entries);

      document.getElementById("cbAmountInput").value = "";
      document.getElementById("cbNoteInput").value = "";
      document.getElementById("cbMonthFilter").value = dateVal.slice(0, 7);
      renderCashbookList();
    });

    // Excel/CSV डाउनलोड (export selected month to CSV with UTF-8 BOM)
    document.getElementById("cbExportExcelBtn").addEventListener("click", exportCashbookCsv);
  }

  // निवडलेल्या महिन्याच्या नोंदी स्क्रीनवर दाखवा (render entries for selected month)
  function renderCashbookList() {
    const listEl = document.getElementById("cbEntriesList");
    const monthEl = document.getElementById("cbMonthFilter");
    if (!listEl || !monthEl) return;

    const selectedYm = monthEl.value || getCurrentYm();
    const allEntries = loadEntries();
    const filtered = allEntries
      .filter((e) => (e.ym || (e.date || "").slice(0, 7)) === selectedYm)
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));

    let totalIn = 0;
    let totalOut = 0;

    filtered.forEach((e) => {
      if (e.type === "in") totalIn += Number(e.amount) || 0;
      else totalOut += Number(e.amount) || 0;
    });

    const net = totalIn - totalOut;
    document.getElementById("cbSumIn").textContent = "₹" + totalIn.toLocaleString("en-IN");
    document.getElementById("cbSumOut").textContent = "₹" + totalOut.toLocaleString("en-IN");
    document.getElementById("cbSumNet").textContent = "₹" + net.toLocaleString("en-IN");

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="muted" style="text-align:center; padding:16px;">या महिन्यासाठी (${esc(selectedYm)}) अद्याप कोणतीही कॅशबुक नोंद नाही.</div>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((e) => {
        const isIn = e.type === "in";
        const color = isIn ? "var(--accent-2)" : "var(--danger)";
        const sign = isIn ? "+" : "-";
        const badge = isIn ? "जमा" : "खर्च";

        return `
          <div class="meta-box" style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px;">
            <div>
              <div style="font-weight:700;">${esc(e.note)}</div>
              <div class="muted" style="font-size:0.75rem;">📅 ${esc(e.date)} • ${esc(e.mode)} • ${badge}</div>
            </div>
            <div class="row" style="gap:8px; flex-wrap:nowrap;">
              <strong style="color:${color}; font-size:0.95rem;">${sign}₹${Number(e.amount).toLocaleString("en-IN")}</strong>
              <button type="button" class="danger sm" data-cbdel="${esc(e.id)}" title="डिलीट करा">🗑️</button>
            </div>
          </div>
        `;
      })
      .join("");

    // डिलीट बटण जोडा (bind delete buttons)
    listEl.querySelectorAll("[data-cbdel]").forEach((btn) => {
      btn.addEventListener("click", async function () {
        const id = this.getAttribute("data-cbdel");
        if (!confirm("ही कॅशबुक नोंद डिलीट करायची का?")) return;
        const updated = loadEntries().filter((item) => item.id !== id);
        saveEntriesLocal(updated);
        await syncToCloud(updated);
        renderCashbookList();
      });
    });
  }

  // निवडलेल्या महिन्याची Excel/CSV फाईल डाउनलोड करा (export monthly CSV with UTF-8 BOM)
  function exportCashbookCsv() {
    const monthEl = document.getElementById("cbMonthFilter");
    const selectedYm = monthEl ? monthEl.value : getCurrentYm();
    const filtered = loadEntries().filter(
      (e) => (e.ym || (e.date || "").slice(0, 7)) === selectedYm
    );

    if (filtered.length === 0) {
      alert("डाउनलोड करण्यासाठी या महिन्यात कोणतीही नोंद नाही.");
      return;
    }

    let totalIn = 0;
    let totalOut = 0;
    const rows = [["तारीख", "प्रकार", "पेमेंट पद्धत", "तपशील", "जमा (₹)", "खर्च (₹)"]];

    filtered.forEach((e) => {
      const amt = Number(e.amount) || 0;
      if (e.type === "in") {
        totalIn += amt;
        rows.push([e.date, "जमा", e.mode, e.note, amt, 0]);
      } else {
        totalOut += amt;
        rows.push([e.date, "खर्च", e.mode, e.note, 0, amt]);
      }
    });

    rows.push([]);
    rows.push(["एकूण", "", "", "", totalIn, totalOut]);
    rows.push(["निव्वळ शिल्लक (Net)", "", "", "", totalIn - totalOut, ""]);

    const csvContent =
      "\uFEFF" +
      rows
        .map((r) =>
          r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
        )
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vyaj-cashbook-${selectedYm}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // मुख्य स्क्रीनवर '📒 कॅशबुक' बटण जोडा (mount Cashbook button in month-hero-links)
  function mountCashbookButton() {
    if (document.getElementById("heroCashbookLink")) return;
    const heroLinks = document.querySelector(".month-hero-links");
    if (!heroLinks) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "heroCashbookLink";
    btn.textContent = "📒 कॅशबुक";
    btn.addEventListener("click", () => {
      createCashbookModal();
      const modal = document.getElementById("vyajCashbookModal");
      if (modal) {
        modal.classList.remove("hidden");
        renderCashbookList();
      }
    });

    heroLinks.appendChild(btn);
  }

  window.VyajCashbook = {
    open: function () {
      createCashbookModal();
      const modal = document.getElementById("vyajCashbookModal");
      if (modal) {
        modal.classList.remove("hidden");
        renderCashbookList();
      }
    }
  };

  function init() {
    mountCashbookButton();
    if (typeof firebase !== "undefined" && firebase.auth) {
      firebase.auth().onAuthStateChanged((user) => {
        if (user) pullFromCloud();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
