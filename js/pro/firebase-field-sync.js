// व्याज हिशोब वही - Firebase Raw Cache + १-क्लिक Master Data Repair/Sync + Undo + Data Health Checker + Edit Auto-Fill (js/pro/firebase-field-sync.js - V14.31)
(function () {
  const UNDO_REPAIR_KEY = "vyaj_undo_master_repair_v1";
  const rawDocsById = new Map();
  let loadedForUid = "";
  let isFetching = false;
  let editModalObserverBound = false;
  let pendingRepairPlan = [];

  const SYSTEM_KEYS = new Set([
    "id", "uid", "isDeleted", "deletedAt", "createdAt", "updatedAt",
    "paymentHistory", "principalHistory", "monthlyPayments", "monthlyRecords",
    "documents", "versions", "order", "sortOrder", "paidMonths", "ledger", "history"
  ]);

  // प्रमाणित रकाने आणि त्यांची संभाव्य जुनी / पर्यायी नावे
  const FIELD_ALIASES = {
    name: ["name", "customerName", "borrowerName", "fullName", "partyName", "grahakName", "नाव", "ग्राहकाचे नाव"],
    loanLabel: ["loanLabel", "accountNo", "accountName", "loanNo", "loanTitle", "loanType", "कर्ज खाते"],
    mobile: ["mobile", "phone", "mobileNo", "phoneNumber", "contact", "contactNo", "mob", "whatsapp", "मोबाईल"],
    principal: ["principal", "currentPrincipal", "loanAmount", "amount", "balancePrincipal", "मुद्दल"],
    originalPrincipal: ["originalPrincipal", "initialPrincipal", "totalLoan", "sanctionedAmount", "मूळ मुद्दल"],
    loanDate: ["loanDate", "startDate", "givenDate", "disbursementDate", "date", "मुद्दल तारीख"],
    startYm: ["startYm", "startMonth", "beginMonth", "fromMonth", "सुरू महिना"],
    rate: ["rate", "interestRate", "monthlyRate", "vyajDar", "percent", "दर"],
    fixedInterest: ["fixedInterest", "monthlyInterest", "interestAmount", "vyaj", "मासिक व्याज"],
    interestType: ["interestType", "calcType", "interestMethod", "method", "व्याज पद्धत"],
    interestDay: ["interestDay", "dueDay", "payDay", "billingDay", "व्याज तारीख"],
    lateFee: ["lateFee", "penalty", "dailyPenalty", "fine", "विलंब दंड"],
    customDue: ["customDue", "openingDue", "previousDue", "oldPending", "manualDue", "मागील बाकी"],
    guarantor: ["guarantor", "guarantorName", "mainGuarantor", "jamin", "jamindar", "guarantor1", "जामीनदार", "मुख्य जामीनदार"],
    extraGuarantors: ["extraGuarantors", "otherGuarantors", "guarantor2", "guarantorDetails", "अतिरिक्त जामीनदार"],
    jobType: ["jobType", "job", "occupation", "employmentType", "serviceType", "नोकरी"],
    companyDept: ["companyDept", "department", "dept", "company", "office", "officeName", "workplace", "employer", "डिपार्टमेंट", "कंपनी"],
    retirementDate: ["retirementDate", "retirement", "retireDate", "retDate", "रिटायरमेंट"],
    promise1: ["promise1", "promiseDate1", "promiseDate", "vavda1", "वायदा 1"],
    promise2: ["promise2", "promiseDate2", "vavda2", "वायदा 2"],
    promise3: ["promise3", "promiseDate3", "vavda3", "वायदा 3"],
    address: ["address", "addr", "residence", "village", "city", "पत्ता"],
    note: ["note", "notes", "remark", "remarks", "comment", "description", "info", "टीप"],
    accountStatus: ["accountStatus", "status", "state", "स्थिती"]
  };

  const FIELD_LABELS_MR = {
    mobile: "मोबाईल",
    jobType: "नोकरी",
    companyDept: "विभाग/कंपनी",
    guarantor: "जामीनदार",
    extraGuarantors: "अतिरिक्त जामीनदार",
    interestDay: "व्याज तारीख",
    loanDate: "मुद्दल तारीख",
    startYm: "सुरू महिना",
    retirementDate: "रिटायरमेंट",
    promise1: "वायदा १",
    promise2: "वायदा २",
    promise3: "वायदा ३",
    note: "टीप",
    loanLabel: "कर्ज खाते",
    interestType: "व्याज पद्धत"
  };

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function isNonEmpty(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  }

  // ===== प्रमाणित फॉरमॅट रूपांतरक (Auto-Format Normalizers) =====

  // भारतीय मोबाईल नंबर स्वच्छ १० अंकी करा (उदा. +919920151794 → 9920151794)
  function normalizeMobileStrict(val) {
    if (!val) return "";
    const digits = String(val).replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
    if (digits.length > 10 && digits.slice(-10).match(/^[6-9]\d{9}$/)) return digits.slice(-10);
    return digits;
  }

  // तारीख HTML date-input साठी अचूक YYYY-MM-DD मध्ये करा (उदा. 15/11/2026 → 2026-11-15)
  function normalizeDateStrict(val) {
    if (!val) return "";
    if (typeof val === "object" && typeof val.toDate === "function") {
      try { return val.toDate().toISOString().slice(0, 10); } catch (_) { return ""; }
    }
    if (val instanceof Date) {
      return Number.isNaN(val.getTime()) ? "" : val.toISOString().slice(0, 10);
    }
    if (typeof val === "number" && val > 25000 && val < 80000) {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    }
    const s = String(val).trim();
    if (!s || s === "-" || s.toLowerCase() === "na" || s === "नाही") return "";
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    const ymdSlash = s.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})/);
    if (ymdSlash) return `${ymdSlash[1]}-${ymdSlash[2].padStart(2, "0")}-${ymdSlash[3].padStart(2, "0")}`;
    const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    return "";
  }

  // नोकरीचा प्रकार अ‍ॅपच्या प्रमाणित मूल्यांमध्ये (govt / private / business) करा
  function normalizeJobStrict(val) {
    const v = String(val || "").toLowerCase().trim();
    if (!v || v === "-" || v === "नाही") return "";
    if (v.includes("gov") || v.includes("सरकारी") || v.includes("bmc") || v.includes("police")) return "govt";
    if (v.includes("pvt") || v.includes("priv") || v.includes("खाजगी")) return "private";
    if (v.includes("bus") || v.includes("व्यवसाय") || v.includes("self") || v.includes("other") || v.includes("इतर")) return "business";
    return v;
  }

  function normalizeInterestTypeStrict(val) {
    const v = String(val || "").toLowerCase().trim();
    if (!v) return "";
    if (v.includes("flat")) return "flat";
    if (v.includes("red")) return "reducing";
    return "";
  }

  function normalizeInterestDayStrict(val) {
    if (val === null || val === undefined || val === "") return "";
    const m = String(val).match(/\d{1,2}/);
    if (!m) return "";
    const n = Number(m[0]);
    return (n >= 1 && n <= 31) ? n : "";
  }

  function flattenObject(obj) {
    const flat = {};
    if (!obj || typeof obj !== "object") return flat;
    Object.keys(obj).forEach((k) => {
      const val = obj[k];
      if (val === undefined || val === null) return;
      flat[k] = val;
      if (
        !SYSTEM_KEYS.has(k) &&
        typeof val === "object" &&
        !Array.isArray(val) &&
        !(val instanceof Date) &&
        typeof val.toDate !== "function"
      ) {
        Object.keys(val).forEach((subK) => {
          const subV = val[subK];
          if (subV === undefined || subV === null) return;
          if (!(subK in flat)) flat[subK] = subV;
          flat[`${k}.${subK}`] = subV;
        });
      }
    });
    return flat;
  }

  function stringifySafeValue(val) {
    if (val === null || val === undefined) return "";
    if (typeof val === "object" && typeof val.toDate === "function") {
      try { return val.toDate().toISOString().slice(0, 10); } catch (_) { return ""; }
    }
    if (val instanceof Date) return Number.isNaN(val.getTime()) ? "" : val.toISOString().slice(0, 10);
    if (Array.isArray(val)) {
      return val
        .map((item) => {
          if (item === null || item === undefined) return "";
          if (typeof item === "object") {
            return Object.values(item).filter((x) => typeof x === "string" || typeof x === "number").join(" - ");
          }
          return String(item).trim();
        })
        .filter(Boolean)
        .join(", ");
    }
    if (typeof val === "object") {
      return Object.entries(val)
        .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
        .map(([k, v]) => `${k}: ${v}`)
        .join(" | ");
    }
    const str = String(val).trim();
    if (str.startsWith("data:image/") && str.length > 200) return "[इमेज डॉक्युमेंट]";
    return str;
  }

  // Firestore मधून सर्व ग्राहकांचे मूळ डॉक्युमेंट्स फक्त एकदाच (Single Read) RAM Cache मध्ये घ्या
  async function loadRawCacheOnce(forceRefresh) {
    if (isFetching) return false;
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user || !firebase.firestore) return false;
    if (!forceRefresh && loadedForUid === user.uid && rawDocsById.size > 0) return true;

    isFetching = true;
    try {
      const snap = await firebase.firestore().collection("users").doc(user.uid).collection("borrowers").get();
      rawDocsById.clear();
      snap.forEach((doc) => {
        rawDocsById.set(doc.id, { id: doc.id, ...(doc.data() || {}) });
      });
      loadedForUid = user.uid;
      window.dispatchEvent(new CustomEvent("vyaj:rawCacheReady", { detail: { count: rawDocsById.size } }));
      return true;
    } catch (err) {
      console.warn("Firebase Raw Cache Read Warning:", err);
      return false;
    } finally {
      isFetching = false;
    }
  }

  async function refreshSingleDoc(docId) {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user || !docId || !firebase.firestore) return;
    try {
      const doc = await firebase.firestore().collection("users").doc(user.uid).collection("borrowers").doc(docId).get();
      if (doc.exists) {
        rawDocsById.set(doc.id, { id: doc.id, ...(doc.data() || {}) });
        window.dispatchEvent(new CustomEvent("vyaj:rawCacheReady", { detail: { count: rawDocsById.size, id: doc.id } }));
      }
    } catch (_) {}
  }

  function getMergedBorrower(idOrObj) {
    const liveList = (window.HishobBridge && typeof window.HishobBridge.getBorrowers === "function")
      ? (window.HishobBridge.getBorrowers() || [])
      : [];

    let id = "";
    let passedObj = null;
    if (typeof idOrObj === "string") id = idOrObj;
    else if (idOrObj && typeof idOrObj === "object") { passedObj = idOrObj; id = idOrObj.id || ""; }

    const rawDoc = id ? rawDocsById.get(id) : null;
    const liveDoc = (id ? liveList.find((x) => x.id === id) : null) || passedObj;

    if (!rawDoc && !liveDoc) return null;
    if (!rawDoc) return { ...liveDoc };
    if (!liveDoc) return { ...rawDoc };

    const merged = { ...rawDoc };
    Object.keys(liveDoc).forEach((k) => {
      const lv = liveDoc[k];
      if (lv !== undefined && lv !== null && lv !== "") merged[k] = lv;
    });
    merged.id = id || merged.id;
    return merged;
  }

  function getAllMergedBorrowers() {
    const liveList = (window.HishobBridge && typeof window.HishobBridge.getBorrowers === "function")
      ? (window.HishobBridge.getBorrowers() || [])
      : [];
    const seen = new Set();
    const result = [];
    liveList.forEach((b) => {
      if (b && b.id) { seen.add(b.id); result.push(getMergedBorrower(b)); }
    });
    rawDocsById.forEach((doc, id) => {
      if (!seen.has(id)) result.push({ ...doc });
    });
    return result;
  }

  // Deep Field Normalizer: सर्व पर्यायी नावे, Arrays व फॉरमॅट्स प्रमाणित रूपात आणा
  function getNormalizedBorrower(idOrObj) {
    const merged = getMergedBorrower(idOrObj);
    if (!merged) return null;

    const flat = flattenObject(merged);
    const lowerKeyMap = new Map();
    Object.keys(flat).forEach((k) => {
      const lk = k.toLowerCase().replace(/[\s_\-]/g, "");
      if (!lowerKeyMap.has(lk)) lowerKeyMap.set(lk, k);
    });

    const usedOriginalKeys = new Set();
    const std = { ...merged };

    Object.keys(FIELD_ALIASES).forEach((stdKey) => {
      if (isNonEmpty(merged[stdKey])) {
        usedOriginalKeys.add(stdKey);
        return;
      }
      for (const alias of FIELD_ALIASES[stdKey]) {
        const normAlias = alias.toLowerCase().replace(/[\s_\-]/g, "");
        const actualKey = lowerKeyMap.get(normAlias);
        if (actualKey && isNonEmpty(flat[actualKey])) {
          std[stdKey] = typeof flat[actualKey] === "number" ? flat[actualKey] : stringifySafeValue(flat[actualKey]);
          usedOriginalKeys.add(actualKey);
          break;
        }
      }
    });

    if (Array.isArray(merged.promises) && merged.promises.length) {
      usedOriginalKeys.add("promises");
      if (!std.promise1 && merged.promises[0]) std.promise1 = stringifySafeValue(merged.promises[0]);
      if (!std.promise2 && merged.promises[1]) std.promise2 = stringifySafeValue(merged.promises[1]);
      if (!std.promise3 && merged.promises[2]) std.promise3 = stringifySafeValue(merged.promises[2]);
    }

    if (Array.isArray(merged.guarantors) && merged.guarantors.length) {
      usedOriginalKeys.add("guarantors");
      const gClean = merged.guarantors.map(stringifySafeValue).filter(Boolean);
      if (!std.guarantor && gClean[0]) std.guarantor = gClean[0];
      if (!std.extraGuarantors && gClean.length > 1) std.extraGuarantors = gClean.slice(1).join(", ");
    }

    // प्रमाणित फॉरमॅट लावा
    if (std.mobile) std.mobile = normalizeMobileStrict(std.mobile) || std.mobile;
    if (std.jobType) std.jobType = normalizeJobStrict(std.jobType) || std.jobType;
    if (std.interestType) std.interestType = normalizeInterestTypeStrict(std.interestType) || std.interestType;
    if (std.interestDay) std.interestDay = normalizeInterestDayStrict(std.interestDay) || std.interestDay;
    ["loanDate", "retirementDate", "promise1", "promise2", "promise3"].forEach((dk) => {
      if (std[dk]) {
        const nd = normalizeDateStrict(std[dk]);
        if (nd) std[dk] = nd;
      }
    });

    // इतर कोणतेही अतिरिक्त/कस्टम रकाने (Auto-Catch)
    const allStdKeySet = new Set(Object.keys(FIELD_ALIASES));
    const extraFields = [];
    Object.keys(merged).forEach((k) => {
      if (SYSTEM_KEYS.has(k) || allStdKeySet.has(k) || usedOriginalKeys.has(k)) return;
      const val = merged[k];
      if (!isNonEmpty(val)) return;
      if (typeof val === "object" && !Array.isArray(val) && typeof val.toDate !== "function" && !(val instanceof Date)) {
        Object.keys(val).forEach((subK) => {
          if (SYSTEM_KEYS.has(subK) || usedOriginalKeys.has(`${k}.${subK}`) || usedOriginalKeys.has(subK)) return;
          const strVal = stringifySafeValue(val[subK]);
          if (strVal && strVal !== "false" && strVal !== "0") {
            extraFields.push({ key: `${k}.${subK}`, label: `${k} (${subK})`, value: strVal });
          }
        });
        return;
      }
      const strVal = stringifySafeValue(val);
      if (strVal && strVal !== "false" && strVal !== "0") {
        extraFields.push({ key: k, label: k, value: strVal });
      }
    });

    return { std, extraFields, raw: merged };
  }

  // प्रत्येक ग्राहकासाठी सुरक्षित Repair Patch तयार करा (फक्त रिकामे किंवा चुकीच्या फॉरमॅटचे रकानेच सुधारेल)
  function computeRepairPatchForDoc(rawDoc) {
    if (!rawDoc || rawDoc.isDeleted) return null;
    const norm = getNormalizedBorrower(rawDoc);
    if (!norm || !norm.std) return null;

    const s = norm.std;
    const patch = {};
    const changedLabels = [];

    const checkAndSet = (key, candidateVal, forceFormatMatch) => {
      if (!isNonEmpty(candidateVal)) return;
      const curVal = rawDoc[key];
      const curStr = curVal === undefined || curVal === null ? "" : String(curVal).trim();
      const candStr = String(candidateVal).trim();
      if (!candStr) return;

      // जर मूळ रकाना रिकामा असेल किंवा फॉरमॅट दुरुस्त करणे गरजेचे असेल तरच Patch मध्ये घ्या
      if (curStr === "" || curStr === "-" || curStr === "नाही" || (forceFormatMatch && curStr !== candStr)) {
        patch[key] = candidateVal;
        changedLabels.push(FIELD_LABELS_MR[key] || key);
      }
    };

    checkAndSet("mobile", normalizeMobileStrict(s.mobile), true);
    checkAndSet("jobType", normalizeJobStrict(s.jobType), true);
    checkAndSet("companyDept", s.companyDept, false);
    checkAndSet("guarantor", s.guarantor, false);
    checkAndSet("extraGuarantors", s.extraGuarantors, false);
    checkAndSet("interestDay", normalizeInterestDayStrict(s.interestDay), true);
    checkAndSet("loanDate", normalizeDateStrict(s.loanDate), true);
    checkAndSet("retirementDate", normalizeDateStrict(s.retirementDate), true);
    checkAndSet("promise1", normalizeDateStrict(s.promise1), true);
    checkAndSet("promise2", normalizeDateStrict(s.promise2), true);
    checkAndSet("promise3", normalizeDateStrict(s.promise3), true);
    checkAndSet("loanLabel", s.loanLabel, false);
    checkAndSet("interestType", normalizeInterestTypeStrict(s.interestType), true);

    const mergedNote = s.note || (s.address ? `पत्ता: ${s.address}` : "");
    checkAndSet("note", mergedNote, false);

    if (!s.startYm && patch.loanDate) {
      checkAndSet("startYm", String(patch.loanDate).slice(0, 7), false);
    } else if (s.startYm && /^\d{4}-\d{2}$/.test(String(s.startYm))) {
      checkAndSet("startYm", String(s.startYm), false);
    }

    if (!Object.keys(patch).length) return null;
    return {
      id: rawDoc.id,
      name: rawDoc.name || s.name || "ग्राहक",
      patch,
      changedLabels,
      beforeValues: Object.keys(patch).reduce((acc, k) => {
        acc[k] = rawDoc[k] === undefined ? null : rawDoc[k];
        return acc;
      }, {})
    };
  }

  // ===== १-क्लिक Master Sync व Data Health Checker UI =====

  function injectRepairCss() {
    if (document.getElementById("vyajMasterRepairCss")) return;
    const st = document.createElement("style");
    st.id = "vyajMasterRepairCss";
    st.textContent = `
      .mr-box {
        background: rgba(180, 83, 9, 0.14); border: 1px solid rgba(234, 182, 118, 0.4);
        border-radius: 14px; padding: 12px; margin-bottom: 12px;
      }
      body.light-mode .mr-box { background: #fdf6e7; border-color: #fcd34d; }
      .mr-title { font-size: 0.88rem; font-weight: 800; color: var(--gold); margin: 0 0 4px; }
      .mr-sub { font-size: 0.74rem; color: var(--muted); margin-bottom: 8px; line-height: 1.45; }
      .mr-row { display: flex; flex-wrap: wrap; gap: 6px; }
      .mr-msg { font-size: 0.77rem; font-weight: 700; margin-top: 7px; }
      .mr-item {
        padding: 9px 10px; border-radius: 11px; background: var(--meta-bg);
        border: 1px solid var(--border); margin-bottom: 7px;
      }
      .mr-chip {
        display: inline-block; font-size: 0.67rem; font-weight: 700; padding: 2px 7px;
        border-radius: 999px; background: rgba(74, 222, 128, 0.14); color: var(--accent-2);
        border: 1px solid rgba(74, 222, 128, 0.35); margin: 2px 3px 0 0;
      }
      .mr-miss-chip {
        display: inline-block; font-size: 0.67rem; font-weight: 700; padding: 2px 7px;
        border-radius: 999px; background: rgba(240, 113, 120, 0.15); color: var(--danger);
        border: 1px solid rgba(240, 113, 120, 0.38); margin: 2px 3px 0 0;
      }
    `;
    document.head.appendChild(st);
  }

  function ensureRepairModal() {
    let modal = document.getElementById("proMasterRepairModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "proMasterRepairModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `<div class="modal-card" style="max-width:650px;" id="proMasterRepairBody"></div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("proMasterRepairModal");
      }
    });
    return modal;
  }

  function setPanelMsg(msg, isErr) {
    const el = document.getElementById("mrPanelMsg");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = isErr ? "var(--danger)" : "var(--accent-2)";
  }

  // १. स्कॅन करून Repair Preview दाखवा
  async function openMasterRepairPreview() {
    setPanelMsg("⏳ Firebase मधील सर्व खात्यांची तपासणी होत आहे...", false);
    await loadRawCacheOnce(true);

    const allDocs = getAllMergedBorrowers().filter((b) => !b.isDeleted);
    pendingRepairPlan = allDocs.map(computeRepairPatchForDoc).filter(Boolean);
    setPanelMsg("", false);

    const modal = ensureRepairModal();
    const body = document.getElementById("proMasterRepairBody");
    if (!body) return;

    const totalFieldsToFix = pendingRepairPlan.reduce((s, x) => s + Object.keys(x.patch).length, 0);

    const listHtml = pendingRepairPlan.length
      ? pendingRepairPlan.map((item) => {
          const previewPairs = Object.entries(item.patch)
            .map(([k, v]) => `<span class="mr-chip">${esc(FIELD_LABELS_MR[k] || k)}: ${esc(String(v).slice(0, 26))}</span>`)
            .join("");
          return `
            <div class="mr-item">
              <strong style="font-size:0.88rem;">${esc(item.name)}</strong>
              <div style="margin-top:4px;">${previewPairs}</div>
            </div>
          `;
        }).join("")
      : `<div class="ok" style="text-align:center; padding:18px; font-weight:700;">✅ छान! तुमची सर्व ${allDocs.length} खाती आधीपासूनच अ‍ॅपच्या योग्य जागेवर व प्रमाणित फॉरमॅटमध्ये सेव्ह आहेत.</div>`;

    body.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
        <h3 style="margin:0; color:var(--gold);">🛠️ Firebase Master Data Sync Preview</h3>
        <span class="badge ${pendingRepairPlan.length ? "partial" : "paid"}">${pendingRepairPlan.length} खाती सापडली</span>
      </div>

      <div class="meta-box" style="margin-bottom:10px; font-size:0.8rem;">
        एकूण तपासलेली खाती: <strong>${allDocs.length}</strong> • दुरुस्त होणारे रकाने: <strong style="color:var(--accent-2);">${totalFieldsToFix}</strong><br/>
        <span class="muted">सुरक्षा हमी: तुमचा जुना पेमेंट इतिहास, मुद्दल हिशोब किंवा कागदपत्रे यांना अजिबात हात लागणार नाही.</span>
      </div>

      <div style="max-height:52vh; overflow-y:auto; margin-bottom:10px;">${listHtml}</div>
      <div id="mrExecStatus" class="muted" style="text-align:center; margin-bottom:8px;"></div>

      ${pendingRepairPlan.length ? `
        <button type="button" id="mrConfirmSyncBtn" class="success" style="width:100%;">
          ✅ सर्व ${pendingRepairPlan.length} खाती योग्य जागेवर Sync करा (१ क्लिक)
        </button>
      ` : ""}
    `;

    document.getElementById("mrConfirmSyncBtn")?.addEventListener("click", executeMasterRepairSync);
    modal.classList.remove("hidden");
  }

  // २. एकाच Firestore Batch Write ने सर्व खाती प्रमाणित जागी सेव्ह करा + Undo Snapshot ठेवा
  async function executeMasterRepairSync() {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user) { alert("कृपया आधी लॉगिन करा."); return; }
    if (!pendingRepairPlan.length) return;

    const btn = document.getElementById("mrConfirmSyncBtn");
    const statusEl = document.getElementById("mrExecStatus");
    if (btn) { btn.disabled = true; btn.textContent = "⏳ सुरक्षित बॅकअप व Sync चालू आहे..."; }
    if (statusEl) statusEl.textContent = "कृपया थांबा...";

    try {
      // आधी Live Backup Snapshot सेव्ह करा
      if (typeof window.triggerVyajLiveBackup === "function") {
        await window.triggerVyajLiveBackup("pre_master_sync").catch(() => {});
      }

      const db = firebase.firestore();
      const colRef = db.collection("users").doc(user.uid).collection("borrowers");
      const nowIso = new Date().toISOString();

      for (let i = 0; i < pendingRepairPlan.length; i += 400) {
        const batch = db.batch();
        pendingRepairPlan.slice(i, i + 400).forEach((item) => {
          batch.update(colRef.doc(item.id), { ...item.patch, updatedAt: nowIso });
        });
        await batch.commit();
      }

      // Undo साठी आधीची स्थिती जतन करा
      try {
        localStorage.setItem(UNDO_REPAIR_KEY, JSON.stringify({
          ts: Date.now(),
          count: pendingRepairPlan.length,
          items: pendingRepairPlan.map((x) => ({ id: x.id, beforeValues: x.beforeValues }))
        }));
      } catch (_) {}

      const fixedCount = pendingRepairPlan.length;
      pendingRepairPlan = [];
      await loadRawCacheOnce(true);
      updateRepairUndoBtn();

      document.getElementById("proMasterRepairModal")?.classList.add("hidden");
      setPanelMsg(`✅ ${fixedCount} खात्यांचे सर्व तपशील त्यांच्या योग्य जागेवर कायमचे Sync झाले! (पेज अपडेट होत आहे...)`, false);
    } catch (err) {
      console.error("Master Repair Error:", err);
      if (statusEl) statusEl.textContent = "❌ Sync एरर: " + err.message;
      if (btn) { btn.disabled = false; btn.textContent = "✅ पुन्हा प्रयत्न करा"; }
    }
  }

  // ३. शेवटचा Master Sync रद्द करा (↩️ Undo)
  async function undoLastMasterRepair() {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user) { alert("कृपया आधी लॉगिन करा."); return; }

    let snap = null;
    try { snap = JSON.parse(localStorage.getItem(UNDO_REPAIR_KEY) || "null"); } catch (_) {}
    if (!snap || !Array.isArray(snap.items) || !snap.items.length) {
      setPanelMsg("रद्द करण्यासाठी कोणताही Master Sync रेकॉर्ड उपलब्ध नाही.", true);
      return;
    }

    if (!confirm(`शेवटचा Master Sync (${snap.count} खाती) रद्द करून पूर्वीसारखे करायचे का?`)) return;

    setPanelMsg("⏳ Master Sync रद्द करत आहे...", false);
    try {
      const db = firebase.firestore();
      const colRef = db.collection("users").doc(user.uid).collection("borrowers");
      const FieldValue = firebase.firestore.FieldValue;

      for (let i = 0; i < snap.items.length; i += 400) {
        const batch = db.batch();
        snap.items.slice(i, i + 400).forEach((it) => {
          const revertPatch = {};
          Object.entries(it.beforeValues || {}).forEach(([k, v]) => {
            revertPatch[k] = v === null ? FieldValue.delete() : v;
          });
          batch.update(colRef.doc(it.id), revertPatch);
        });
        await batch.commit();
      }

      localStorage.removeItem(UNDO_REPAIR_KEY);
      await loadRawCacheOnce(true);
      updateRepairUndoBtn();
      setPanelMsg("✅ Master Sync यशस्वीरित्या रद्द झाला!", false);
    } catch (err) {
      setPanelMsg("❌ Undo एरर: " + err.message, true);
    }
  }

  function updateRepairUndoBtn() {
    const btn = document.getElementById("mrUndoRepairBtn");
    if (!btn) return;
    let has = false;
    try {
      const s = JSON.parse(localStorage.getItem(UNDO_REPAIR_KEY) || "null");
      has = Boolean(s && Array.isArray(s.items) && s.items.length);
    } catch (_) {}
    btn.classList.toggle("hidden", !has);
  }

  // ४. 🩺 Data Health Checker (कोणत्या खात्यांत माहिती खरोखरच रिकामी आहे ते दाखवा + १-क्लिक Edit)
  async function openDataHealthChecker() {
    await loadRawCacheOnce(false);
    const active = getAllMergedBorrowers().filter((b) => !b.isDeleted && b.accountStatus !== "closed");

    const incomplete = [];
    active.forEach((b) => {
      const missing = [];
      if (!normalizeMobileStrict(b.mobile)) missing.push("मोबाईल नाही");
      if (!String(b.guarantor || "").trim()) missing.push("जामीनदार नाही");
      if (!normalizeInterestDayStrict(b.interestDay)) missing.push("व्याज तारीख नाही");
      if (!normalizeJobStrict(b.jobType) && !String(b.companyDept || "").trim()) missing.push("नोकरी/विभाग नाही");
      if (missing.length) incomplete.push({ b, missing });
    });

    incomplete.sort((a, b) => b.missing.length - a.missing.length);

    const modal = ensureRepairModal();
    const body = document.getElementById("proMasterRepairBody");
    if (!body) return;

    const rowsHtml = incomplete.length
      ? incomplete.map(({ b, missing }) => `
          <div class="mr-item row" style="justify-content:space-between;">
            <div style="min-width:0; flex:1;">
              <strong style="font-size:0.88rem;">${esc(b.name || "ग्राहक")}</strong>
              <div style="margin-top:3px;">${missing.map((m) => `<span class="mr-miss-chip">${esc(m)}</span>`).join("")}</div>
            </div>
            <button type="button" class="warn sm" data-hc-edit="${esc(b.id)}">✏️ भरा</button>
          </div>
        `).join("")
      : `<div class="ok" style="text-align:center; padding:18px; font-weight:700;">🎉 अप्रतिम! सर्व ${active.length} सक्रिय खात्यांची मुख्य माहिती १००% पूर्ण आहे.</div>`;

    body.innerHTML = `
      <div class="row" style="justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
        <h3 style="margin:0; color:var(--accent);">🩺 Data Health Checker</h3>
        <span class="badge ${incomplete.length ? "pending" : "paid"}">अपूर्ण: ${incomplete.length} / ${active.length}</span>
      </div>
      <p class="muted" style="margin-top:0; font-size:0.78rem;">ज्या खात्यांत मोबाईल, जामीनदार, व्याज तारीख किंवा नोकरीची माहिती रिकामी आहे त्यांची यादी:</p>
      <div style="max-height:60vh; overflow-y:auto;">${rowsHtml}</div>
    `;

    body.querySelectorAll("[data-hc-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bid = btn.getAttribute("data-hc-edit");
        const stepEdit = () => {
          const listEl = document.getElementById("borrowersList");
          if (!listEl) return;
          for (const card of Array.from(listEl.querySelectorAll(".borrower-item"))) {
            const matched = findBorrowerFromCard(card);
            if (!matched || matched.id !== bid) continue;
            const editBtn = Array.from(card.querySelectorAll("button")).find((x) => {
              const t = (x.textContent || "").toLowerCase();
              return t.includes("एडिट") || t.includes("edit") || t.includes("सर्व एडिट");
            });
            if (editBtn) { editBtn.click(); return; }
          }
        };
        if (window.VyajNavStack) window.VyajNavStack.navigateFrom("proMasterRepairModal", stepEdit);
        else { modal.classList.add("hidden"); stepEdit(); }
      });
    });

    modal.classList.remove("hidden");
  }

  // Backup स्क्रीनमध्ये (#reportsSection) Master Repair पॅनेल जोडा
  function injectMasterRepairPanel() {
    const sec = document.getElementById("reportsSection");
    if (!sec || document.getElementById("proMasterRepairBox")) return;

    const box = document.createElement("div");
    box.id = "proMasterRepairBox";
    box.className = "mr-box";
    box.innerHTML = `
      <div class="mr-title">🛠️ Firebase जुना डेटा योग्य जागेवर Sync करा (१-क्लिक Repair)</div>
      <div class="mr-sub">वेगळ्या नावात किंवा फॉरमॅटमध्ये अडकलेला मोबाईल, नोकरी, जामीनदार, वायदा तारखा व टीप अ‍ॅपच्या सर्व मूळ जागी कायमची आणा.</div>
      <div class="mr-row">
        <button type="button" id="mrScanBtn" class="warn sm">🔍 स्कॅन व Preview पहा</button>
        <button type="button" id="mrHealthBtn" class="primary sm">🩺 Data Health Checker</button>
        <button type="button" id="mrUndoRepairBtn" class="danger sm hidden">↩️ Sync रद्द करा</button>
      </div>
      <div id="mrPanelMsg" class="mr-msg"></div>
    `;

    const importBox = document.getElementById("proSmartImportBox");
    if (importBox) importBox.insertAdjacentElement("afterend", box);
    else sec.prepend(box);

    document.getElementById("mrScanBtn")?.addEventListener("click", openMasterRepairPreview);
    document.getElementById("mrHealthBtn")?.addEventListener("click", openDataHealthChecker);
    document.getElementById("mrUndoRepairBtn")?.addEventListener("click", undoLastMasterRepair);
    updateRepairUndoBtn();
  }

  // ग्राहक कार्डवरून अचूक ग्राहक ओळखा
  function findBorrowerFromCard(card) {
    if (!card) return null;
    const all = getAllMergedBorrowers();
    if (!all.length) return null;

    const directId =
      card.getAttribute("data-pro-bid") ||
      card.getAttribute("data-id") ||
      card.getAttribute("data-bid") ||
      card.getAttribute("data-borrower-id") ||
      card.querySelector("[data-pro-invoice-btn]")?.getAttribute("data-pro-invoice-btn") ||
      card.querySelector("[data-pro-details-btn]")?.getAttribute("data-pro-details-btn") ||
      card.querySelector("[data-id]")?.getAttribute("data-id") ||
      card.querySelector("[data-bid]")?.getAttribute("data-bid");

    if (directId) {
      const foundById = all.find((x) => x.id === directId);
      if (foundById) return foundById;
    }

    const mobMatch = (card.textContent || "").match(/[6-9]\d{9}/);
    if (mobMatch) {
      const byMob = all.find((x) => normalizeMobileStrict(x.mobile || x.phone) === mobMatch[0]);
      if (byMob) return byMob;
    }

    const nameEl = card.querySelector("strong, h4, h3");
    const rawName = (nameEl?.textContent || "").replace(/^\s*#?\d+[\.\)\-\s]+/, "").trim();
    if (rawName) {
      const exact = all.find((x) => String(x.name || "").trim() === rawName);
      if (exact) return exact;
      const lowerRaw = rawName.toLowerCase();
      const ciExact = all.find((x) => String(x.name || "").trim().toLowerCase() === lowerRaw);
      if (ciExact) return ciExact;
      const partials = all
        .filter((x) => {
          const nm = String(x.name || "").trim().toLowerCase();
          return nm.length >= 3 && (lowerRaw.includes(nm) || nm.includes(lowerRaw));
        })
        .sort((a, b) => String(b.name || "").length - String(a.name || "").length);
      if (partials.length) return partials[0];
    }
    return null;
  }

  // Edit Modal (#editModal) उघडताच रिकामे राहिलेले जुने रकाने Auto-Fill करा
  function autoFillEditModal() {
    const modal = document.getElementById("editModal");
    if (!modal || modal.classList.contains("hidden")) return;
    const bId = (document.getElementById("eId")?.value || "").trim();
    if (!bId) return;

    const norm = getNormalizedBorrower(bId);
    if (!norm || !norm.std) return;
    const s = norm.std;

    const fieldMap = [
      ["eName", s.name],
      ["eLoanLabel", s.loanLabel],
      ["eMobile", s.mobile],
      ["ePrincipal", s.principal],
      ["eOriginalPrincipal", s.originalPrincipal],
      ["eLoanDate", s.loanDate],
      ["eStartYm", s.startYm],
      ["eRate", s.rate],
      ["eFixedInterest", s.fixedInterest],
      ["eInterestType", s.interestType],
      ["eInterestDay", s.interestDay],
      ["eLateFee", s.lateFee],
      ["eGuarantor", s.guarantor],
      ["eExtraGuarantors", s.extraGuarantors],
      ["eJobType", s.jobType],
      ["eCompanyDept", s.companyDept],
      ["eRetirementDate", s.retirementDate],
      ["ePromise1", s.promise1],
      ["ePromise2", s.promise2],
      ["ePromise3", s.promise3],
      ["eNote", s.note || (s.address ? `पत्ता: ${s.address}` : "")]
    ];

    let filledCount = 0;
    fieldMap.forEach(([elId, val]) => {
      const el = document.getElementById(elId);
      if (!el || !isNonEmpty(val)) return;
      const curVal = String(el.value || "").trim();
      if (curVal === "" || (el.type === "number" && curVal === "0" && Number(val) > 0)) {
        el.value = String(val);
        filledCount += 1;
      }
    });

    let noteBanner = document.getElementById("proEditAutoFillNote");
    if (filledCount > 0) {
      if (!noteBanner) {
        noteBanner = document.createElement("div");
        noteBanner.id = "proEditAutoFillNote";
        noteBanner.className = "meta-box";
        noteBanner.style.color = "var(--accent-2)";
        noteBanner.style.marginBottom = "10px";
        noteBanner.style.fontWeight = "700";
        const firstGrid = modal.querySelector(".modal-card .grid-3");
        if (firstGrid) firstGrid.insertAdjacentElement("beforebegin", noteBanner);
      }
      noteBanner.textContent = `✨ Firebase मधून ${filledCount} रिकामे रकाने आपोआप भरले आहेत — कायमचे सेव्ह करण्यासाठी 'बदल सेव्ह करा' दाबा.`;
      noteBanner.classList.remove("hidden");
    } else if (noteBanner) {
      noteBanner.classList.add("hidden");
    }
  }

  function bindEditModalSync() {
    if (editModalObserverBound) return;
    const editModal = document.getElementById("editModal");
    if (!editModal) return;
    editModalObserverBound = true;

    const obs = new MutationObserver(() => {
      if (!editModal.classList.contains("hidden")) setTimeout(autoFillEditModal, 120);
    });
    obs.observe(editModal, { attributes: true, attributeFilter: ["class"] });

    document.getElementById("saveEditBtn")?.addEventListener("click", () => {
      const editedId = (document.getElementById("eId")?.value || "").trim();
      if (editedId) setTimeout(() => refreshSingleDoc(editedId), 1400);
    });
  }

  function initAuthListener() {
    if (typeof firebase !== "undefined" && firebase.auth) {
      firebase.auth().onAuthStateChanged((user) => {
        if (user) setTimeout(() => loadRawCacheOnce(false), 700);
        else { rawDocsById.clear(); loadedForUid = ""; }
      });
    } else {
      setTimeout(initAuthListener, 800);
    }
  }

  window.VyajFieldSync = {
    loadRawCacheOnce,
    refreshSingleDoc,
    getMergedBorrower,
    getAllMergedBorrowers,
    getNormalizedBorrower,
    findBorrowerFromCard,
    stringifySafeValue,
    normalizeMobileStrict,
    normalizeDateStrict,
    normalizeJobStrict,
    openMasterRepairPreview,
    openDataHealthChecker,
    isReady: () => rawDocsById.size > 0
  };

  function initFieldSync() {
    injectRepairCss();
    bindEditModalSync();
    injectMasterRepairPanel();
    initAuthListener();
    setTimeout(injectMasterRepairPanel, 1400);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFieldSync);
  } else {
    initFieldSync();
  }
})();
