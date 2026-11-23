// व्याज हिशोब वही - Single-Read Firebase Raw Cache + Deep Field Normalizer + Edit Modal Auto-Fill (js/pro/firebase-field-sync.js - V14.30)
(function () {
  const rawDocsById = new Map();
  let loadedForUid = "";
  let isFetching = false;
  let editModalObserverBound = false;

  // सिस्टीम किंवा खूप मोठे तांत्रिक रकाने (Auto-Catch मधून वगळण्यासाठी)
  const SYSTEM_KEYS = new Set([
    "id", "uid", "isDeleted", "deletedAt", "createdAt", "updatedAt",
    "paymentHistory", "principalHistory", "monthlyPayments", "monthlyRecords",
    "documents", "versions", "order", "sortOrder", "paidMonths", "ledger", "history"
  ]);

  // प्रमाणित रकाने आणि त्यांची संभाव्य जुनी / पर्यायी नावे (Case-insensitive)
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

  function isNonEmpty(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  }

  // Nested Object असल्यास (उदा. details, profile, extra, meta) ते सुरक्षितपणे सपाट (Flatten) करा
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

  // Firestore Timestamp किंवा Date मूल्य स्वच्छ स्ट्रिंगमध्ये बदला
  function stringifySafeValue(val) {
    if (val === null || val === undefined) return "";
    if (typeof val === "object" && typeof val.toDate === "function") {
      try { return val.toDate().toISOString().slice(0, 10); } catch (_) { return ""; }
    }
    if (val instanceof Date) {
      return Number.isNaN(val.getTime()) ? "" : val.toISOString().slice(0, 10);
    }
    if (Array.isArray(val)) {
      const parts = val
        .map((item) => {
          if (item === null || item === undefined) return "";
          if (typeof item === "object") {
            const vals = Object.values(item).filter((x) => typeof x === "string" || typeof x === "number");
            return vals.join(" - ");
          }
          return String(item).trim();
        })
        .filter(Boolean);
      return parts.join(", ");
    }
    if (typeof val === "object") {
      const pairs = Object.entries(val)
        .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
        .map(([k, v]) => `${k}: ${v}`);
      return pairs.join(" | ");
    }
    const str = String(val).trim();
    // चुकून मोठा base64 फोटो डेटा असल्यास तो मजकूर म्हणून दाखवू नका
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
      const snap = await firebase
        .firestore()
        .collection("users")
        .doc(user.uid)
        .collection("borrowers")
        .get();

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

  // एखादे विशिष्ट डॉक्युमेंट Edit केल्यानंतर फक्त तेच १ डॉक्युमेंट कॅशमध्ये ताजे करा
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

  // Raw Firestore डेटा + Live HishobBridge डेटा एकत्र करा (कोणताही तपशील गहाळ होऊ नये म्हणून)
  function getMergedBorrower(idOrObj) {
    const liveList = (window.HishobBridge && typeof window.HishobBridge.getBorrowers === "function")
      ? (window.HishobBridge.getBorrowers() || [])
      : [];

    let id = "";
    let passedObj = null;
    if (typeof idOrObj === "string") {
      id = idOrObj;
    } else if (idOrObj && typeof idOrObj === "object") {
      passedObj = idOrObj;
      id = idOrObj.id || "";
    }

    const rawDoc = id ? rawDocsById.get(id) : null;
    const liveDoc = (id ? liveList.find((x) => x.id === id) : null) || passedObj;

    if (!rawDoc && !liveDoc) return null;
    if (!rawDoc) return { ...liveDoc };
    if (!liveDoc) return { ...rawDoc };

    // आधी Raw डॉक्युमेंटचे सर्व रकाने घ्या, मग Live मधील रिकामे नसलेले रकाने त्यावर ओव्हरले करा
    const merged = { ...rawDoc };
    Object.keys(liveDoc).forEach((k) => {
      const lv = liveDoc[k];
      if (lv !== undefined && lv !== null && lv !== "") {
        merged[k] = lv;
      }
    });
    merged.id = id || merged.id;
    return merged;
  }

  // सर्व ग्राहकांची एकत्रित यादी मिळवा
  function getAllMergedBorrowers() {
    const liveList = (window.HishobBridge && typeof window.HishobBridge.getBorrowers === "function")
      ? (window.HishobBridge.getBorrowers() || [])
      : [];

    const seen = new Set();
    const result = [];

    liveList.forEach((b) => {
      if (b && b.id) {
        seen.add(b.id);
        result.push(getMergedBorrower(b));
      }
    });

    rawDocsById.forEach((doc, id) => {
      if (!seen.has(id)) result.push({ ...doc });
    });

    return result;
  }

  // Deep Field Normalizer: सर्व जुनी/नवीन नावे, Arrays आणि Nested Objects स्वच्छ रूपात काढा
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
      // आधी थेट प्रमाणित की तपासा
      if (isNonEmpty(merged[stdKey])) {
        usedOriginalKeys.add(stdKey);
        return;
      }
      // पर्यायी नावे तपासा
      const aliases = FIELD_ALIASES[stdKey];
      for (const alias of aliases) {
        const normAlias = alias.toLowerCase().replace(/[\s_\-]/g, "");
        const actualKey = lowerKeyMap.get(normAlias);
        if (actualKey && isNonEmpty(flat[actualKey])) {
          std[stdKey] = typeof flat[actualKey] === "number" ? flat[actualKey] : stringifySafeValue(flat[actualKey]);
          usedOriginalKeys.add(actualKey);
          break;
        }
      }
    });

    // विशेष Array हाताळणी: promises[] → promise1, promise2, promise3
    if (Array.isArray(merged.promises) && merged.promises.length) {
      usedOriginalKeys.add("promises");
      if (!std.promise1 && merged.promises[0]) std.promise1 = stringifySafeValue(merged.promises[0]);
      if (!std.promise2 && merged.promises[1]) std.promise2 = stringifySafeValue(merged.promises[1]);
      if (!std.promise3 && merged.promises[2]) std.promise3 = stringifySafeValue(merged.promises[2]);
    }

    // विशेष Array हाताळणी: guarantors[] → guarantor + extraGuarantors
    if (Array.isArray(merged.guarantors) && merged.guarantors.length) {
      usedOriginalKeys.add("guarantors");
      const gClean = merged.guarantors.map(stringifySafeValue).filter(Boolean);
      if (!std.guarantor && gClean[0]) std.guarantor = gClean[0];
      if (!std.extraGuarantors && gClean.length > 1) std.extraGuarantors = gClean.slice(1).join(", ");
    }

    // इतर कोणतेही अतिरिक्त/कस्टम रकाने (Auto-Catch) गोळा करा — एकही डेटा सुटू नये म्हणून
    const allStdKeySet = new Set(Object.keys(FIELD_ALIASES));
    const extraFields = [];

    Object.keys(merged).forEach((k) => {
      if (SYSTEM_KEYS.has(k) || allStdKeySet.has(k) || usedOriginalKeys.has(k)) return;
      const val = merged[k];
      if (!isNonEmpty(val)) return;

      // जर एखादा Nested Object असेल तर त्यातील प्रत्येक उप-रकाना वेगळा दाखवा
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

  // ग्राहक कार्डवरून १००% अचूक ग्राहक ओळखा (ID → बटण डेटा → मोबाईल नंबर → स्वच्छ नाव)
  function findBorrowerFromCard(card) {
    if (!card) return null;
    const all = getAllMergedBorrowers();
    if (!all.length) return null;

    // १. कार्डवरील किंवा आतील बटणांवरील थेट ID तपासा
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

    // २. कार्डवरील मोबाईल नंबरवरून अचूक जुळणी करा
    const cardText = card.textContent || "";
    const mobMatch = cardText.match(/[6-9]\d{9}/);
    if (mobMatch) {
      const mob10 = mobMatch[0];
      const byMob = all.find((x) => String(x.mobile || x.phone || "").replace(/\D/g, "").slice(-10) === mob10);
      if (byMob) return byMob;
    }

    // ३. कार्डवरील नावावरून स्वच्छ जुळणी करा (सुरुवातीचे क्रमांक/बॅज वगळून)
    const nameEl = card.querySelector("strong, h4, h3");
    const rawName = (nameEl?.textContent || "")
      .replace(/^\s*\d+[\.\)\-]\s*/, "")
      .trim();

    if (rawName) {
      const exact = all.find((x) => String(x.name || "").trim() === rawName);
      if (exact) return exact;

      const lowerRaw = rawName.toLowerCase();
      const ciExact = all.find((x) => String(x.name || "").trim().toLowerCase() === lowerRaw);
      if (ciExact) return ciExact;

      // सर्वात लांब जुळणारे नाव निवडा (चुकीची जुळणी टाळण्यासाठी)
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

  // =========================================================================
  // Edit Modal (#editModal) उघडताच रिकामे राहिलेले जुने Firebase रकाने Auto-Fill करा
  // =========================================================================
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

    // जर रिकामे रकाने आपोआप भरले गेले असतील तर छोटा संदेश दाखवा
    let noteBanner = document.getElementById("proEditAutoFillNote");
    if (filledCount > 0) {
      if (!noteBanner) {
        noteBanner = document.createElement("div");
        noteBanner.id = "proEditAutoFillNote";
        noteBanner.className = "meta-box";
        noteBanner.style.color = "var(--accent-2)";
        noteBanner.style.marginBottom = "10px";
        noteBanner.style.fontWeight = "700";
        const card = modal.querySelector(".modal-card");
        const firstGrid = card?.querySelector(".grid-3");
        if (firstGrid) firstGrid.insertAdjacentElement("beforebegin", noteBanner);
      }
      noteBanner.textContent = `✨ Firebase मधील जुन्या नोंदीतून ${filledCount} रिकामे रकाने आपोआप भरले आहेत — कायमचे सिंक करण्यासाठी 'बदल सेव्ह करा' दाबा.`;
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
      if (!editModal.classList.contains("hidden")) {
        setTimeout(autoFillEditModal, 120);
      }
    });
    obs.observe(editModal, { attributes: true, attributeFilter: ["class"] });

    // 'बदल सेव्ह करा' दाबल्यानंतर त्या एकाच ग्राहकाचा कॅश ताजा करा
    document.getElementById("saveEditBtn")?.addEventListener("click", () => {
      const editedId = (document.getElementById("eId")?.value || "").trim();
      if (editedId) {
        setTimeout(() => refreshSingleDoc(editedId), 1400);
      }
    });
  }

  // Firebase Auth स्टेटवरून लॉगिन होताच एकदाच Raw Cache लोड करा
  function initAuthListener() {
    if (typeof firebase !== "undefined" && firebase.auth) {
      firebase.auth().onAuthStateChanged((user) => {
        if (user) {
          setTimeout(() => loadRawCacheOnce(false), 700);
        } else {
          rawDocsById.clear();
          loadedForUid = "";
        }
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
    isReady: () => rawDocsById.size > 0
  };

  function initFieldSync() {
    bindEditModalSync();
    initAuthListener();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFieldSync);
  } else {
    initFieldSync();
  }
})();
