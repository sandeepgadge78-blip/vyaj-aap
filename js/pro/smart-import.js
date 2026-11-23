// व्याज हिशोब वही - Universal Smart Import (CSV, Excel, Google Sheet, PDF, JSON) + Auto-Format Guard + Duplicate Guard + Undo (js/pro/smart-import.js - V14.31)
(function () {
  const UNDO_SNAP_KEY = "vyaj_undo_import_snap_v1";
  const XLSX_CDN = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  let parsedRawHeaders = [];
  let parsedRawRows = [];
  let activeMapping = {};
  let activeSourceLabel = "";

  const FIELD_DEFS = [
    { key: "name", label: "ग्राहकाचे नाव *", aliases: ["name", "customer", "borrower", "ग्राहक", "नाव", "customer name", "borrower name", "ग्राहकाचे नाव", "full name", "party"] },
    { key: "mobile", label: "मोबाईल नंबर", aliases: ["mobile", "phone", "contact", "mob", "मोबाईल", "फोन", "नंबर", "mobile number", "phone number", "मोबाईल नंबर"] },
    { key: "principal", label: "सध्याचे मुद्दल (₹) *", aliases: ["principal", "amount", "loan", "loan amount", "मुद्दल", "सध्याचे मुद्दल", "एकूण मुद्दल", "current principal", "रक्कम"] },
    { key: "originalPrincipal", label: "मूळ मुद्दल (₹)", aliases: ["originalprincipal", "original principal", "मूळ मुद्दल", "initial principal"] },
    { key: "rate", label: "व्याज दर (%)", aliases: ["rate", "interest rate", "vyaj dar", "दर", "व्याज दर", "percent", "%", "rate %"] },
    { key: "fixedInterest", label: "मासिक व्याज (₹)", aliases: ["fixedinterest", "monthly interest", "interest", "मासिक व्याज", "महिन्याचे व्याज", "व्याज", "vyaj"] },
    { key: "loanDate", label: "मुद्दल तारीख", aliases: ["loandate", "loan date", "date", "start date", "तारीख", "मुद्दल तारीख", "कर्ज तारीख"] },
    { key: "startYm", label: "सुरू महिना (YYYY-MM)", aliases: ["startym", "start month", "हिशोब सुरू महिना", "सुरू महिना", "month"] },
    { key: "interestType", label: "व्याज पद्धत", aliases: ["interesttype", "interest type", "व्याज पद्धत", "method", "type"] },
    { key: "interestDay", label: "व्याज तारीख (1-31)", aliases: ["interestday", "interest day", "due day", "व्याज तारीख", "दरमहा तारीख"] },
    { key: "lateFee", label: "विलंब दंड (₹/दिन)", aliases: ["latefee", "late fee", "penalty", "दंड", "विलंब दंड"] },
    { key: "customDue", label: "मागील बाकी (₹)", aliases: ["customdue", "previous due", "pending", "old due", "मागील बाकी", "बाकी"] },
    { key: "loanLabel", label: "कर्ज खाते नाव", aliases: ["loanlabel", "loan label", "account", "कर्ज खाते", "खाते नाव"] },
    { key: "guarantor", label: "मुख्य जामीनदार", aliases: ["guarantor", "jamin", "jamindar", "जामीनदार", "जमीनदार", "मुख्य जामीनदार"] },
    { key: "extraGuarantors", label: "अतिरिक्त जामीनदार", aliases: ["extraguarantors", "extra guarantors", "अतिरिक्त जामीनदार"] },
    { key: "jobType", label: "नोकरीचा प्रकार", aliases: ["jobtype", "job", "नोकरी", "नोकरीचा प्रकार", "occupation"] },
    { key: "companyDept", label: "डिपार्टमेंट / कंपनी", aliases: ["companydept", "department", "company", "dept", "कंपनी", "डिपार्टमेंट", "विभाग"] },
    { key: "retirementDate", label: "Retirement Date", aliases: ["retirementdate", "retirement", "रिटायरमेंट", "सेवानिवृत्ती"] },
    { key: "promise1", label: "वायदा तारीख १", aliases: ["promise1", "promise 1", "वायदा 1", "वायदा १", "वायदा तारीख 1", "वायदा"] },
    { key: "promise2", label: "वायदा तारीख २", aliases: ["promise2", "promise 2", "वायदा 2", "वायदा २"] },
    { key: "promise3", label: "वायदा तारीख ३", aliases: ["promise3", "promise 3", "वायदा 3", "वायदा ३"] },
    { key: "note", label: "टीप (Note)", aliases: ["note", "notes", "remark", "remarks", "टीप", "शेरा"] },
    { key: "accountStatus", label: "खाते स्थिती", aliases: ["accountstatus", "status", "स्थिती", "खाते स्थिती"] }
  ];

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function loadScriptOnce(src, globalCheck) {
    return new Promise((resolve, reject) => {
      if (globalCheck()) return resolve();
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("लायब्ररी लोड होऊ शकली नाही.")));
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.crossOrigin = "anonymous";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("इंटरनेट किंवा CDN अडचणीमुळे लायब्ररी लोड झाली नाही."));
      document.head.appendChild(s);
    });
  }

  function injectSmartImportCss() {
    if (document.getElementById("vyajSmartImportCss")) return;
    const st = document.createElement("style");
    st.id = "vyajSmartImportCss";
    st.textContent = `
      .si-box {
        background: rgba(15, 118, 110, 0.14); border: 1px solid rgba(45, 212, 191, 0.35);
        border-radius: 14px; padding: 12px; margin-bottom: 12px;
      }
      body.light-mode .si-box { background: #e8f5f3; border-color: #5eead4; }
      .si-title { font-size: 0.9rem; font-weight: 800; color: var(--accent); margin: 0 0 4px; }
      .si-sub { font-size: 0.74rem; color: var(--muted); margin-bottom: 8px; line-height: 1.45; }
      .si-file-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px; }
      .si-file-row input[type="file"] { flex: 1; min-width: 180px; padding: 6px 8px; font-size: 0.78rem; }
      .si-sheet-row { display: flex; gap: 6px; margin-bottom: 8px; }
      .si-sheet-row input { flex: 1; min-width: 0; font-size: 0.8rem; }
      .si-tools-row { display: flex; flex-wrap: wrap; gap: 6px; }
      .si-msg { font-size: 0.78rem; font-weight: 700; margin-top: 7px; }
      .si-stat-bar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; text-align: center; }
      .si-stat-pill { padding: 8px 6px; border-radius: 10px; background: var(--meta-bg); border: 1px solid var(--border); }
      .si-stat-num { font-size: 1.05rem; font-weight: 900; }
      .si-stat-lbl { font-size: 0.68rem; color: var(--muted); font-weight: 700; }
      .si-map-grid {
        display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px;
        max-height: 200px; overflow-y: auto; padding: 8px; border-radius: 10px;
        background: var(--meta-bg); border: 1px solid var(--border); margin-bottom: 10px;
      }
      @media (max-width: 480px) { .si-map-grid { grid-template-columns: 1fr; } }
      .si-map-item { display: flex; flex-direction: column; gap: 3px; }
      .si-map-item label { font-size: 0.7rem; color: var(--muted); font-weight: 700; }
      .si-map-item select { padding: 5px 7px; font-size: 0.76rem; }
      .si-table-wrap { max-height: 210px; overflow: auto; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 10px; }
      .si-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
      .si-table th, .si-table td { border-bottom: 1px solid var(--border); padding: 6px 7px; text-align: left; white-space: nowrap; }
      .si-table th { background: var(--card-2); color: var(--accent); position: sticky; top: 0; }
    `;
    document.head.appendChild(st);
  }

  function setStatus(msg, isErr) {
    const el = document.getElementById("siStatusMsg");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = isErr ? "var(--danger)" : "var(--accent-2)";
  }

  function parseCsvText(text) {
    const clean = String(text || "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      const next = clean[i + 1];
      if (inQuotes) {
        if (ch === '"' && next === '"') { field += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else field += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ",") { row.push(field.trim()); field = ""; }
        else if (ch === "\r" && next === "\n") {
          row.push(field.trim());
          if (row.some((c) => c !== "")) rows.push(row);
          row = []; field = ""; i++;
        } else if (ch === "\n" || ch === "\r") {
          row.push(field.trim());
          if (row.some((c) => c !== "")) rows.push(row);
          row = []; field = "";
        } else {
          field += ch;
        }
      }
    }
    row.push(field.trim());
    if (row.some((c) => c !== "")) rows.push(row);
    return rows;
  }

  function cleanNum(val) {
    if (val === null || val === undefined || val === "") return 0;
    const cleaned = String(val).replace(/[₹,\s%]/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  // Auto-Format Guard: प्रत्येक फाईलमधून डेटा नेहमी अ‍ॅपच्या प्रमाणित फॉरमॅटमध्ये सेव्ह होईल
  function cleanMobileGuard(val) {
    if (window.VyajFieldSync?.normalizeMobileStrict) return window.VyajFieldSync.normalizeMobileStrict(val);
    const d = String(val || "").replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("91")) return d.slice(2);
    if (d.length === 11 && d.startsWith("0")) return d.slice(1);
    return d.slice(-10);
  }

  function normalizeDateGuard(val) {
    if (window.VyajFieldSync?.normalizeDateStrict) return window.VyajFieldSync.normalizeDateStrict(val);
    if (!val) return "";
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    return "";
  }

  function normalizeJobGuard(val) {
    if (window.VyajFieldSync?.normalizeJobStrict) return window.VyajFieldSync.normalizeJobStrict(val);
    const v = String(val || "").toLowerCase().trim();
    if (v.includes("gov") || v.includes("सरकारी")) return "govt";
    if (v.includes("pvt") || v.includes("priv") || v.includes("खाजगी")) return "private";
    if (v.includes("bus") || v.includes("व्यवसाय")) return "business";
    return v;
  }

  function normalizeInterestType(val) {
    const v = String(val || "").toLowerCase().trim();
    return v.includes("flat") ? "flat" : "reducing";
  }

  function autoDetectMapping(headers) {
    const map = {};
    const usedIdx = new Set();
    const normHeaders = headers.map((h) => String(h || "").toLowerCase().replace(/[_\-\(\)\[\]]/g, " ").trim());

    FIELD_DEFS.forEach((def) => {
      let matched = -1;
      for (let i = 0; i < normHeaders.length; i++) {
        if (usedIdx.has(i)) continue;
        if (def.aliases.some((a) => normHeaders[i] === a.toLowerCase())) { matched = i; break; }
      }
      if (matched === -1) {
        for (let i = 0; i < normHeaders.length; i++) {
          if (usedIdx.has(i)) continue;
          if (def.aliases.some((a) => a.length >= 3 && normHeaders[i].includes(a.toLowerCase()))) { matched = i; break; }
        }
      }
      map[def.key] = matched;
      if (matched !== -1) usedIdx.add(matched);
    });
    return map;
  }

  function buildMappedRecords() {
    const curYm = document.getElementById("activeYm")?.value || new Date().toISOString().slice(0, 7);
    const defaultRate = Number(document.getElementById("setDefaultRate")?.value || 2);
    const records = [];

    parsedRawRows.forEach((row) => {
      const getVal = (key) => {
        const idx = activeMapping[key];
        return idx !== undefined && idx >= 0 ? row[idx] : "";
      };

      const name = String(getVal("name") || "").trim();
      if (!name || name.length < 2) return;

      const principal = cleanNum(getVal("principal"));
      const origPrincipal = cleanNum(getVal("originalPrincipal")) || principal;
      const rateRaw = getVal("rate");
      const rate = rateRaw !== "" && rateRaw !== undefined ? cleanNum(rateRaw) : defaultRate;
      const fixedInt = cleanNum(getVal("fixedInterest"));
      const mobile = cleanMobileGuard(getVal("mobile"));
      const loanDate = normalizeDateGuard(getVal("loanDate"));
      const rawStartYm = String(getVal("startYm") || "").trim();
      const startYm = /^\d{4}-\d{2}$/.test(rawStartYm) ? rawStartYm : (loanDate ? loanDate.slice(0, 7) : curYm);
      const statusRaw = String(getVal("accountStatus") || "").toLowerCase();
      const rawDay = cleanNum(getVal("interestDay"));

      records.push({
        name,
        mobile,
        principal,
        originalPrincipal: origPrincipal,
        rate,
        fixedInterest: fixedInt > 0 ? fixedInt : Math.round((principal * rate) / 100),
        loanDate,
        startYm,
        interestType: normalizeInterestType(getVal("interestType")),
        interestDay: (rawDay >= 1 && rawDay <= 31) ? rawDay : "",
        lateFee: cleanNum(getVal("lateFee")),
        customDue: cleanNum(getVal("customDue")),
        loanLabel: String(getVal("loanLabel") || "").trim(),
        guarantor: String(getVal("guarantor") || "").trim(),
        extraGuarantors: String(getVal("extraGuarantors") || "").trim(),
        jobType: normalizeJobGuard(getVal("jobType")),
        companyDept: String(getVal("companyDept") || "").trim(),
        retirementDate: normalizeDateGuard(getVal("retirementDate")),
        promise1: normalizeDateGuard(getVal("promise1")),
        promise2: normalizeDateGuard(getVal("promise2")),
        promise3: normalizeDateGuard(getVal("promise3")),
        note: String(getVal("note") || "").trim(),
        accountStatus: statusRaw.includes("closed") || statusRaw.includes("बंद") ? "closed" : "active"
      });
    });
    return records;
  }

  function classifyRecords(records) {
    const existing = (window.HishobBridge && window.HishobBridge.getBorrowers ? window.HishobBridge.getBorrowers() : [])
      .filter((b) => !b.isDeleted);

    const byMob = new Map();
    const byName = new Map();
    existing.forEach((b) => {
      const m = cleanMobileGuard(b.mobile);
      if (m.length === 10) byMob.set(m, b);
      const n = String(b.name || "").trim().toLowerCase();
      if (n) byName.set(n, b);
    });

    const fresh = [];
    const duplicates = [];
    records.forEach((rec) => {
      const m = cleanMobileGuard(rec.mobile);
      const n = String(rec.name || "").trim().toLowerCase();
      const match = (m.length === 10 && byMob.get(m)) || byName.get(n) || null;
      if (match) duplicates.push({ rec, existing: match });
      else fresh.push(rec);
    });
    return { fresh, duplicates };
  }

  function ensurePreviewModal() {
    let modal = document.getElementById("proSmartImportModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "proSmartImportModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `
      <div class="modal-card" style="max-width:740px;">
        <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
          <h3 style="margin:0; color:var(--accent);">📥 स्मार्ट इम्पोर्ट Preview व तपासणी</h3>
          <span class="badge paid" id="siSourceBadge">File</span>
        </div>

        <div class="si-stat-bar">
          <div class="si-stat-pill"><div class="si-stat-num" id="siTotCnt">0</div><div class="si-stat-lbl">एकूण नोंदी</div></div>
          <div class="si-stat-pill"><div class="si-stat-num" style="color:var(--accent-2);" id="siNewCnt">0</div><div class="si-stat-lbl">नवीन खाती</div></div>
          <div class="si-stat-pill"><div class="si-stat-num" style="color:var(--warn);" id="siDupCnt">0</div><div class="si-stat-lbl">आधीचे (Duplicate)</div></div>
        </div>

        <details style="margin-bottom:10px;">
          <summary style="cursor:pointer; font-size:0.8rem; font-weight:800; color:var(--accent); margin-bottom:6px;">
            ⚙️ कॉलम मॅचिंग तपासा / बदला (Column Mapper)
          </summary>
          <div class="si-map-grid" id="siMapGrid"></div>
        </details>

        <div style="margin-bottom:10px;">
          <label style="font-size:0.78rem; color:var(--muted); display:block; margin-bottom:4px;">Duplicate खात्यांसाठी काय करायचे?</label>
          <select id="siDupMode" style="width:100%;">
            <option value="skip">🛡️ फक्त नवीन खाती जोडा (जुन्या खात्यांना हात लावू नका — सुरक्षित)</option>
            <option value="update">🔄 जुन्या खात्यांची माहिती अपडेट करा (पेमेंट इतिहास सुरक्षित राहील)</option>
          </select>
        </div>

        <div class="si-table-wrap">
          <table class="si-table">
            <thead>
              <tr><th>स्थिती</th><th>नाव</th><th>मोबाईल</th><th>मुद्दल (₹)</th><th>दर (%)</th><th>जामीनदार</th></tr>
            </thead>
            <tbody id="siPreviewBody"></tbody>
          </table>
        </div>

        <div id="siModalStatus" class="muted" style="text-align:center; margin-bottom:8px;"></div>

        <div class="row" style="gap:8px;">
          <button type="button" id="siCancelBtn" class="sm" style="flex:1;">रद्द करा</button>
          <button type="button" id="siConfirmImportBtn" class="success" style="flex:2;">✅ अ‍ॅपमध्ये सेव्ह करा</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("proSmartImportModal");
      }
    });
    document.getElementById("siCancelBtn")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      if (window.VyajNavStack) window.VyajNavStack.popIfTop("proSmartImportModal");
    });
    document.getElementById("siConfirmImportBtn")?.addEventListener("click", executeSmartImport);
    return modal;
  }

  function renderPreviewContents() {
    const mapGrid = document.getElementById("siMapGrid");
    if (mapGrid && !mapGrid.dataset.renderedForSource) {
      mapGrid.innerHTML = FIELD_DEFS.map((def) => {
        const opts = `<option value="-1">-- सोडा (None) --</option>` +
          parsedRawHeaders.map((h, i) => `<option value="${i}" ${activeMapping[def.key] === i ? "selected" : ""}>${esc(h || ("Col " + (i + 1)))}</option>`).join("");
        return `
          <div class="si-map-item">
            <label>${esc(def.label)}</label>
            <select data-map-key="${def.key}">${opts}</select>
          </div>
        `;
      }).join("");
      mapGrid.dataset.renderedForSource = "1";

      mapGrid.querySelectorAll("select[data-map-key]").forEach((sel) => {
        sel.addEventListener("change", () => {
          activeMapping[sel.getAttribute("data-map-key")] = Number(sel.value);
          updatePreviewStatsAndTable();
        });
      });
    }
    updatePreviewStatsAndTable();
  }

  function updatePreviewStatsAndTable() {
    const records = buildMappedRecords();
    const { fresh, duplicates } = classifyRecords(records);

    const setT = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setT("siTotCnt", records.length);
    setT("siNewCnt", fresh.length);
    setT("siDupCnt", duplicates.length);

    const tbody = document.getElementById("siPreviewBody");
    if (!tbody) return;

    const previewItems = [
      ...fresh.map((r) => ({ isDup: false, rec: r })),
      ...duplicates.map((d) => ({ isDup: true, rec: d.rec }))
    ].slice(0, 40);

    if (!previewItems.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:12px; color:var(--danger);">एकही वैध ग्राहक नाव सापडले नाही. वर 'कॉलम मॅचिंग' तपासा.</td></tr>`;
      return;
    }

    tbody.innerHTML = previewItems.map(({ isDup, rec }) => `
      <tr>
        <td><span class="badge ${isDup ? "partial" : "paid"}">${isDup ? "Duplicate" : "नवीन"}</span></td>
        <td><strong>${esc(rec.name)}</strong></td>
        <td>${esc(rec.mobile || "-")}</td>
        <td>₹${Number(rec.principal || 0).toLocaleString("en-IN")}</td>
        <td>${esc(rec.rate)}%</td>
        <td>${esc(rec.guarantor || "-")}</td>
      </tr>
    `).join("");
  }

  function openPreviewWithMatrix(headers, rows, sourceLabel) {
    if (!rows.length) { setStatus("❌ या फाईलमध्ये ग्राहकांचा डेटा सापडला नाही.", true); return; }
    parsedRawHeaders = headers;
    parsedRawRows = rows;
    activeMapping = autoDetectMapping(headers);
    activeSourceLabel = sourceLabel;

    const modal = ensurePreviewModal();
    const badge = document.getElementById("siSourceBadge");
    if (badge) badge.textContent = sourceLabel;
    const mapGrid = document.getElementById("siMapGrid");
    if (mapGrid) delete mapGrid.dataset.renderedForSource;
    const mStat = document.getElementById("siModalStatus");
    if (mStat) mStat.textContent = "";

    renderPreviewContents();
    modal.classList.remove("hidden");
  }

  async function executeSmartImport() {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user) { alert("कृपया आधी लॉगिन करा."); return; }

    const records = buildMappedRecords();
    const { fresh, duplicates } = classifyRecords(records);
    const dupMode = document.getElementById("siDupMode")?.value || "skip";
    const statusEl = document.getElementById("siModalStatus");
    const confirmBtn = document.getElementById("siConfirmImportBtn");

    const toAdd = fresh;
    const toUpdate = dupMode === "update" ? duplicates : [];

    if (!toAdd.length && !toUpdate.length) {
      if (statusEl) statusEl.textContent = "सेव्ह करण्यासाठी कोणतेही नवीन खाते नाही (सर्व आधीपासून अ‍ॅपमध्ये आहेत).";
      return;
    }

    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "⏳ सेव्ह होत आहे..."; }
    if (statusEl) statusEl.textContent = `कृपया थांबा... (${toAdd.length} नवीन, ${toUpdate.length} अपडेट)`;

    try {
      const db = firebase.firestore();
      const colRef = db.collection("users").doc(user.uid).collection("borrowers");
      const nowIso = new Date().toISOString();

      const addedIds = [];
      const prevSnapshots = [];
      const ops = [];

      toAdd.forEach((rec) => {
        const docRef = colRef.doc();
        addedIds.push(docRef.id);
        ops.push({
          type: "set",
          ref: docRef,
          data: { ...rec, isDeleted: false, paymentHistory: [], principalHistory: [], createdAt: nowIso, updatedAt: nowIso }
        });
      });

      toUpdate.forEach(({ rec, existing }) => {
        const docRef = colRef.doc(existing.id);
        prevSnapshots.push({ id: existing.id, data: { ...existing } });
        const patch = { updatedAt: nowIso };
        Object.keys(rec).forEach((k) => {
          const v = rec[k];
          if (v !== "" && v !== null && v !== undefined && !(k === "principal" && v === 0)) patch[k] = v;
        });
        ops.push({ type: "update", ref: docRef, data: patch });
      });

      for (let i = 0; i < ops.length; i += 400) {
        const batch = db.batch();
        ops.slice(i, i + 400).forEach((op) => {
          if (op.type === "set") batch.set(op.ref, op.data);
          else batch.update(op.ref, op.data);
        });
        await batch.commit();
      }

      try {
        localStorage.setItem(UNDO_SNAP_KEY, JSON.stringify({ ts: Date.now(), source: activeSourceLabel, addedIds, prevSnapshots }));
      } catch (_) {}

      updateUndoButtonState();
      document.getElementById("proSmartImportModal")?.classList.add("hidden");
      setStatus(`✅ इम्पोर्ट पूर्ण! ${toAdd.length} नवीन खाती जोडली आणि ${toUpdate.length} अपडेट झाली.`, false);

      if (window.VyajFieldSync?.loadRawCacheOnce) setTimeout(() => window.VyajFieldSync.loadRawCacheOnce(true), 1200);
      if (typeof window.triggerVyajLiveBackup === "function") setTimeout(() => window.triggerVyajLiveBackup("auto_import"), 1800);
    } catch (err) {
      console.error("Smart Import Error:", err);
      if (statusEl) statusEl.textContent = "❌ सेव्ह करताना एरर आला: " + err.message;
    } finally {
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = "✅ अ‍ॅपमध्ये सेव्ह करा"; }
    }
  }

  async function undoLastImport() {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user) { alert("कृपया आधी लॉगिन करा."); return; }

    let snap = null;
    try { snap = JSON.parse(localStorage.getItem(UNDO_SNAP_KEY) || "null"); } catch (_) {}
    if (!snap || (!snap.addedIds?.length && !snap.prevSnapshots?.length)) {
      setStatus("रद्द करण्यासाठी कोणताही अलीकडील Import उपलब्ध नाही.", true);
      return;
    }

    if (!confirm(`शेवटचा Import (${snap.source || "File"}) रद्द करायचा का?`)) return;

    setStatus("⏳ शेवटचा Import रद्द करत आहे...", false);
    try {
      const db = firebase.firestore();
      const colRef = db.collection("users").doc(user.uid).collection("borrowers");
      const ops = [];
      (snap.addedIds || []).forEach((id) => ops.push({ type: "delete", ref: colRef.doc(id) }));
      (snap.prevSnapshots || []).forEach((item) => {
        const cleanData = { ...item.data };
        delete cleanData.id;
        ops.push({ type: "set", ref: colRef.doc(item.id), data: cleanData });
      });

      for (let i = 0; i < ops.length; i += 400) {
        const batch = db.batch();
        ops.slice(i, i + 400).forEach((op) => {
          if (op.type === "delete") batch.delete(op.ref);
          else batch.set(op.ref, op.data);
        });
        await batch.commit();
      }

      localStorage.removeItem(UNDO_SNAP_KEY);
      updateUndoButtonState();
      setStatus("✅ शेवटचा Import यशस्वीरित्या रद्द झाला!", false);
    } catch (err) {
      setStatus("❌ Undo करताना एरर आला: " + err.message, true);
    }
  }

  function updateUndoButtonState() {
    const btn = document.getElementById("siUndoBtn");
    if (!btn) return;
    let hasSnap = false;
    try {
      const s = JSON.parse(localStorage.getItem(UNDO_SNAP_KEY) || "null");
      hasSnap = Boolean(s && ((s.addedIds && s.addedIds.length) || (s.prevSnapshots && s.prevSnapshots.length)));
    } catch (_) {}
    btn.classList.toggle("hidden", !hasSnap);
  }

  async function handleUniversalFile(file) {
    if (!file) return;
    const name = file.name || "";
    const ext = name.split(".").pop().toLowerCase();
    setStatus(`⏳ "${name}" वाचत आहे...`, false);

    try {
      if (ext === "csv" || ext === "txt") {
        const text = await file.text();
        const matrix = parseCsvText(text);
        if (matrix.length < 2) { setStatus("❌ CSV फाईल रिकामी आहे किंवा हेडर नाही.", true); return; }
        openPreviewWithMatrix(matrix[0], matrix.slice(1), "CSV");
        setStatus("", false);
        return;
      }

      if (ext === "xlsx" || ext === "xls") {
        setStatus("⏳ Excel लायब्ररी लोड होत आहे...", false);
        await loadScriptOnce(XLSX_CDN, () => typeof window.XLSX !== "undefined");
        const buf = await file.arrayBuffer();
        const wb = window.XLSX.read(buf, { type: "array" });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const matrix = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" })
          .filter((r) => Array.isArray(r) && r.some((c) => String(c || "").trim() !== ""));
        if (matrix.length < 2) { setStatus("❌ Excel शीटमध्ये वैध डेटा सापडला नाही.", true); return; }
        openPreviewWithMatrix(matrix[0].map(String), matrix.slice(1), "Excel");
        setStatus("", false);
        return;
      }

      if (ext === "json") {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.borrowers) ? parsed.borrowers : null);
        if (arr && arr.length) {
          const headers = FIELD_DEFS.map((d) => d.key);
          const rows = arr.map((item) => headers.map((k) => item[k] ?? ""));
          openPreviewWithMatrix(headers, rows, "JSON");
          setStatus("", false);
          return;
        }
        const origInput = document.getElementById("importEncFile");
        const passInput = document.getElementById("backupPasskey");
        if (origInput && typeof DataTransfer !== "undefined") {
          const dt = new DataTransfer();
          dt.items.add(file);
          origInput.files = dt.files;
          if (passInput && !passInput.value.trim()) {
            passInput.focus();
            setStatus("🔐 ही Encrypted JSON फाईल आहे! खालील बॉक्समध्ये Passkey टाकून '🔓 Restore' दाबा.", false);
          } else {
            document.getElementById("importEncBtn")?.click();
            setStatus("🔐 Encrypted फाईल Restore साठी पाठवली आहे.", false);
          }
          return;
        }
        setStatus("❌ या JSON फाईलमध्ये ग्राहक यादी सापडली नाही.", true);
        return;
      }

      if (ext === "pdf") {
        setStatus("⏳ PDF वाचक लोड होत आहे...", false);
        await loadScriptOnce(PDFJS_CDN, () => typeof window.pdfjsLib !== "undefined");
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

        const buf = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
        const lines = [];
        for (let p = 1; p <= Math.min(pdf.numPages, 25); p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          const rowMap = new Map();
          content.items.forEach((it) => {
            const txt = String(it.str || "").trim();
            if (!txt) return;
            const yKey = Math.round((it.transform[5] || 0) / 5) * 5;
            if (!rowMap.has(yKey)) rowMap.set(yKey, []);
            rowMap.get(yKey).push({ x: it.transform[4] || 0, txt });
          });
          Array.from(rowMap.entries()).sort((a, b) => b[0] - a[0]).forEach(([, items]) => {
            items.sort((a, b) => a.x - b.x);
            lines.push(items.map((x) => x.txt));
          });
        }

        const extractedRows = [];
        lines.forEach((cells) => {
          const fullLine = cells.join(" ");
          const nums = fullLine.match(/\d[\d,]{2,}/g) || [];
          const mobMatch = fullLine.match(/[6-9]\d{9}/);
          if (!nums.length) return;
          const mob = mobMatch ? mobMatch[0] : "";
          const amtCandidate = nums.find((n) => n.replace(/,/g, "") !== mob) || "";
          const principalVal = cleanNum(amtCandidate);
          const namePart = cells.find((c) => /[a-zA-Z\u0900-\u097F]{2,}/.test(c) && !/^(total|एकूण|मुद्दल|व्याज|sr|क्र)/i.test(c)) || "";
          if (namePart && principalVal >= 100) extractedRows.push([namePart, mob, principalVal]);
        });

        if (!extractedRows.length) {
          setStatus("⚠️ या PDF मधून टेक्स्ट वाचता आले नाही. (स्कॅन/फोटो PDF असल्यास कृपया Excel/CSV वापरा.)", true);
          return;
        }
        openPreviewWithMatrix(["name", "mobile", "principal"], extractedRows, "PDF");
        setStatus("", false);
        return;
      }

      setStatus("❌ फक्त .CSV, .XLSX, .XLS, .PDF किंवा .JSON फाईल निवडा.", true);
    } catch (err) {
      setStatus("❌ फाईल वाचताना एरर आला: " + err.message, true);
    }
  }

  async function handleGoogleSheetImport() {
    const raw = (document.getElementById("siSheetUrlInput")?.value || "").trim();
    if (!raw) { setStatus("कृपया Google Sheet ची लिंक किंवा ID टाका.", true); return; }
    const idMatch = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const sheetId = idMatch ? idMatch[1] : raw;
    if (sheetId.length < 15) { setStatus("❌ वैध Google Sheet लिंक किंवा ID टाका.", true); return; }

    setStatus("⏳ Google Sheet मधून डेटा आणत आहे...", false);
    try {
      const resp = await fetch(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv`);
      if (!resp.ok) throw new Error("शीट उघडता आली नाही. 'Anyone with the link → Viewer' परवानगी द्या.");
      const text = await resp.text();
      if (text.trim().startsWith("<!DOCTYPE") || text.includes("accounts.google.com")) {
        throw new Error("ही शीट Private आहे! कृपया Share मध्ये 'Anyone with the link → Viewer' चालू करा.");
      }
      const matrix = parseCsvText(text);
      if (matrix.length < 2) throw new Error("या Google Sheet मध्ये वैध डेटा सापडला नाही.");
      openPreviewWithMatrix(matrix[0], matrix.slice(1), "Google Sheet");
      setStatus("", false);
    } catch (err) {
      setStatus("❌ " + err.message, true);
    }
  }

  function downloadSampleTemplate() {
    const headers = ["ग्राहकाचे नाव", "मोबाईल नंबर", "सध्याचे मुद्दल", "व्याज दर", "मासिक व्याज", "मुद्दल तारीख", "व्याज तारीख", "मुख्य जामीनदार", "नोकरीचा प्रकार", "डिपार्टमेंट", "Retirement Date", "वायदा 1", "टीप"];
    const sampleRow = ["रमेश पाटील", "9876543210", "50000", "2", "1000", "2026-11-01", "5", "सुरेश पवार (9822001122)", "govt", "BMC", "2032-05-31", "2026-12-05", "नमुना नोंद"];
    const csvContent = "\uFEFF" + [headers, sampleRow].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Vyaj_Hishob_Sample_Template.csv";
    a.click();
    setStatus("✅ नमुना फाईल डाउनलोड झाली!", false);
  }

  function injectSmartImportPanel() {
    const sec = document.getElementById("reportsSection");
    if (!sec || document.getElementById("proSmartImportBox")) return;

    const box = document.createElement("div");
    box.id = "proSmartImportBox";
    box.className = "si-box";
    box.innerHTML = `
      <div class="si-title">✨ स्मार्ट युनिव्हर्सल इम्पोर्ट (CSV / Excel / Google Sheet / PDF / JSON)</div>
      <div class="si-sub">Auto-Format Guard सह: कोणतीही फाईल अपलोड करताना डेटा आपोआप अ‍ॅपच्या अचूक फॉरमॅटमध्येच सेव्ह होईल.</div>

      <div class="si-file-row">
        <input type="file" id="siUniversalFile" accept=".csv,.xlsx,.xls,.pdf,.json,text/csv,application/pdf,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" />
        <button type="button" id="siLoadFileBtn" class="success sm">📥 फाईल लोड करा</button>
      </div>

      <div class="si-sheet-row">
        <input type="text" id="siSheetUrlInput" placeholder="Google Sheet लिंक किंवा ID पेस्ट करा..." />
        <button type="button" id="siSheetFetchBtn" class="primary sm">🌐 Sheet आणा</button>
      </div>

      <div class="si-tools-row">
        <button type="button" id="siSampleBtn" class="sm">📄 नमुना Excel फाईल</button>
        <button type="button" id="siUndoBtn" class="danger sm hidden">↩️ शेवटचा Import रद्द करा</button>
      </div>
      <div id="siStatusMsg" class="si-msg"></div>
    `;
    sec.prepend(box);

    const fileInput = document.getElementById("siUniversalFile");
    fileInput?.addEventListener("change", () => { if (fileInput.files && fileInput.files[0]) handleUniversalFile(fileInput.files[0]); });
    document.getElementById("siLoadFileBtn")?.addEventListener("click", () => {
      if (fileInput?.files && fileInput.files[0]) handleUniversalFile(fileInput.files[0]);
      else setStatus("कृपया आधी वर फाईल निवडा.", true);
    });
    document.getElementById("siSheetFetchBtn")?.addEventListener("click", handleGoogleSheetImport);
    document.getElementById("siSampleBtn")?.addEventListener("click", downloadSampleTemplate);
    document.getElementById("siUndoBtn")?.addEventListener("click", undoLastImport);
    updateUndoButtonState();
  }

  function initSmartImport() {
    injectSmartImportCss();
    injectSmartImportPanel();
    setTimeout(injectSmartImportPanel, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSmartImport);
  } else {
    initSmartImport();
  }
})();
