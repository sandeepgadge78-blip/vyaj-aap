// व्याज हिशोब वही - संपूर्ण अ‍ॅपसाठी Master Schema Engine (app.js शी १००% सुसंगत) (js/pro/schema-engine.js - V14.32)
(function () {
  const SYSTEM_KEYS = new Set([
    "id", "uid", "isDeleted", "deletedAt", "createdAt", "updatedAt",
    "paymentHistory", "principalHistory", "monthlyPayments", "monthlyRecords",
    "documents", "versions", "versionHistory", "order", "sortOrder",
    "paidMonths", "partialPayments", "extraPrincipals", "principalReductions",
    "followUps", "customPastDues", "customCashPaid", "extraOut", "extraIn",
    "settlement", "ledger", "history", "importedFromSheet"
  ]);

  // app.js मधील १००% खरी फिल्ड नावे व त्यांची सर्व संभाव्य जुनी/पर्यायी नावे
  const FIELD_ALIASES = {
    name: ["name", "customerName", "borrowerName", "fullName", "partyName", "grahakName", "नाव", "ग्राहकाचे नाव"],
    loanLabel: ["loanLabel", "accountNo", "accountName", "loanNo", "loanTitle", "loanType", "कर्ज खाते", "कर्ज खाते नाव"],
    mobile: ["mobile", "phone", "mobileNo", "phoneNumber", "contact", "contactNo", "mob", "whatsapp", "मोबाईल", "मोबाईल नंबर"],
    principal: ["principal", "currentPrincipal", "loanAmount", "amount", "balancePrincipal", "मुद्दल", "सध्याचे मुद्दल", "एकूण मुद्दल"],
    originalPrincipal: ["originalPrincipal", "initialPrincipal", "totalLoan", "sanctionedAmount", "मूळ मुद्दल"],
    loanDate: ["loanDate", "startDate", "givenDate", "disbursementDate", "date", "मुद्दल तारीख", "कर्ज तारीख"],
    startYm: ["startYm", "startMonth", "beginMonth", "fromMonth", "सुरू महिना", "हिशोब सुरू महिना"],
    rate: ["rate", "interestRate", "monthlyRate", "vyajDar", "percent", "दर", "व्याज दर"],
    fixedMonthlyInterest: ["fixedMonthlyInterest", "fixedInterest", "monthlyInterest", "interestAmount", "vyaj", "मासिक व्याज", "महिन्याचे व्याज"],
    interestType: ["interestType", "calcType", "interestMethod", "method", "व्याज पद्धत"],
    interestDay: ["interestDay", "dueDay", "payDay", "billingDay", "व्याज तारीख", "व्याजाची तारीख"],
    lateFeePerDay: ["lateFeePerDay", "lateFee", "penalty", "dailyPenalty", "fine", "विलंब दंड"],
    customDue: ["customDue", "openingDue", "previousDue", "oldPending", "manualDue", "मागील बाकी"],
    guarantor: ["guarantor", "guarantorName", "mainGuarantor", "jamin", "jamindar", "guarantor1", "जामीनदार", "जमीनदार", "मुख्य जामीनदार"],
    extraGuarantors: ["extraGuarantors", "otherGuarantors", "guarantor2", "guarantorDetails", "अतिरिक्त जामीनदार"],
    jobType: ["jobType", "job", "occupation", "employmentType", "serviceType", "नोकरी", "नोकरीचा प्रकार"],
    companyDept: ["companyDept", "department", "dept", "company", "office", "officeName", "workplace", "employer", "डिपार्टमेंट", "कंपनी", "विभाग"],
    retirementDate: ["retirementDate", "retirement", "retireDate", "retDate", "रिटायरमेंट", "सेवानिवृत्ती"],
    promiseDate1: ["promiseDate1", "promise1", "promiseDate", "vavda1", "वायदा 1", "वायदा १", "वायदा तारीख 1", "वायदा"],
    promiseDate2: ["promiseDate2", "promise2", "vavda2", "वायदा 2", "वायदा २", "वायदा तारीख 2"],
    promiseDate3: ["promiseDate3", "promise3", "vavda3", "वायदा 3", "वायदा ३", "वायदा तारीख 3"],
    address: ["address", "addr", "residence", "village", "city", "पत्ता"],
    note: ["note", "notes", "remark", "remarks", "comment", "description", "info", "टीप", "शेरा"],
    accountStatus: ["accountStatus", "status", "state", "स्थिती", "खाते स्थिती"]
  };

  const FIELD_LABELS_MR = {
    mobile: "मोबाईल",
    jobType: "नोकरी",
    companyDept: "विभाग/कंपनी",
    guarantor: "जामीनदार",
    extraGuarantors: "अतिरिक्त जामीनदार",
    interestDay: "व्याज तारीख",
    fixedMonthlyInterest: "मासिक व्याज",
    lateFeePerDay: "विलंब दंड",
    loanDate: "मुद्दल तारीख",
    startYm: "सुरू महिना",
    retirementDate: "रिटायरमेंट",
    promiseDate1: "वायदा १",
    promiseDate2: "वायदा २",
    promiseDate3: "वायदा ३",
    note: "टीप",
    loanLabel: "कर्ज खाते",
    interestType: "व्याज पद्धत"
  };

  function isNonEmpty(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  }

  function cleanNum(val) {
    if (val === null || val === undefined || val === "") return 0;
    const cleaned = String(val).replace(/[₹,\s%]/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  // भारतीय मोबाईल नंबर स्वच्छ १० अंकी करा (+91 किंवा 0 काढून)
  function normalizeMobile(val) {
    if (!val) return "";
    const digits = String(val).replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
    if (digits.length > 10 && /^[6-9]\d{9}$/.test(digits.slice(-10))) return digits.slice(-10);
    return digits;
  }

  // तारीख अचूक YYYY-MM-DD स्वरूपात रूपांतरित करा (HTML input[type="date"] साठी)
  function normalizeDate(val) {
    if (!val) return "";
    if (typeof val === "object" && typeof val.toDate === "function") {
      try { return val.toDate().toISOString().slice(0, 10); } catch (_) { return ""; }
    }
    if (val instanceof Date) return Number.isNaN(val.getTime()) ? "" : val.toISOString().slice(0, 10);
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

  function normalizeJob(val) {
    const v = String(val || "").toLowerCase().trim();
    if (!v || v === "-" || v === "नाही") return "";
    if (v.includes("gov") || v.includes("सरकारी") || v.includes("bmc") || v.includes("police") || v.includes("sra")) return "govt";
    if (v.includes("pvt") || v.includes("priv") || v.includes("खाजगी")) return "private";
    if (v.includes("bus") || v.includes("व्यवसाय") || v.includes("self") || v.includes("other") || v.includes("इतर")) return "business";
    return v;
  }

  function normalizeInterestType(val) {
    const v = String(val || "").toLowerCase().trim();
    if (!v) return "";
    if (v.includes("flat")) return "flat";
    if (v.includes("red")) return "reducing";
    return "";
  }

  function normalizeInterestDay(val) {
    if (val === null || val === undefined || val === "") return 0;
    const m = String(val).match(/\d{1,2}/);
    if (!m) return 0;
    const n = Number(m[0]);
    return (n >= 1 && n <= 31) ? n : 0;
  }

  function stringifySafe(val) {
    if (val === null || val === undefined) return "";
    if (typeof val === "object" && typeof val.toDate === "function") {
      try { return val.toDate().toISOString().slice(0, 10); } catch (_) { return ""; }
    }
    if (val instanceof Date) return Number.isNaN(val.getTime()) ? "" : val.toISOString().slice(0, 10);
    if (Array.isArray(val)) {
      return val.map((it) => {
        if (it === null || it === undefined) return "";
        if (typeof it === "object") return Object.values(it).filter((x) => typeof x === "string" || typeof x === "number").join(" - ");
        return String(it).trim();
      }).filter(Boolean).join(", ");
    }
    if (typeof val === "object") {
      return Object.entries(val).filter(([, v]) => v !== null && v !== undefined && typeof v !== "object").map(([k, v]) => `${k}: ${v}`).join(" | ");
    }
    const s = String(val).trim();
    if (s.startsWith("data:image/") && s.length > 200) return "[इमेज डॉक्युमेंट]";
    return s;
  }

  function flattenObject(obj) {
    const flat = {};
    if (!obj || typeof obj !== "object") return flat;
    Object.keys(obj).forEach((k) => {
      const val = obj[k];
      if (val === undefined || val === null) return;
      flat[k] = val;
      if (!SYSTEM_KEYS.has(k) && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date) && typeof val.toDate !== "function") {
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

  // कोणत्याही जुन्या/नवीन डॉक्युमेंटला app.js च्या प्रमाणित रकान्यांत उलगडून द्या
  function normalizeBorrower(rawDoc) {
    if (!rawDoc || typeof rawDoc !== "object") return null;

    const flat = flattenObject(rawDoc);
    const lowerKeyMap = new Map();
    Object.keys(flat).forEach((k) => {
      const lk = k.toLowerCase().replace(/[\s_\-]/g, "");
      if (!lowerKeyMap.has(lk)) lowerKeyMap.set(lk, k);
    });

    const usedKeys = new Set();
    const std = { ...rawDoc };

    Object.keys(FIELD_ALIASES).forEach((stdKey) => {
      if (isNonEmpty(rawDoc[stdKey])) {
        usedKeys.add(stdKey);
        return;
      }
      for (const alias of FIELD_ALIASES[stdKey]) {
        const normAlias = alias.toLowerCase().replace(/[\s_\-]/g, "");
        const actualKey = lowerKeyMap.get(normAlias);
        if (actualKey && isNonEmpty(flat[actualKey])) {
          std[stdKey] = typeof flat[actualKey] === "number" ? flat[actualKey] : stringifySafe(flat[actualKey]);
          usedKeys.add(actualKey);
          break;
        }
      }
    });

    // promises[] अ‍ॅरे असल्यास promiseDate1/2/3 मध्ये आणा
    if (Array.isArray(rawDoc.promises) && rawDoc.promises.length) {
      usedKeys.add("promises");
      if (!std.promiseDate1 && rawDoc.promises[0]) std.promiseDate1 = stringifySafe(rawDoc.promises[0]);
      if (!std.promiseDate2 && rawDoc.promises[1]) std.promiseDate2 = stringifySafe(rawDoc.promises[1]);
      if (!std.promiseDate3 && rawDoc.promises[2]) std.promiseDate3 = stringifySafe(rawDoc.promises[2]);
    }

    // guarantors[] अ‍ॅरे असल्यास guarantor व extraGuarantors मध्ये आणा
    if (Array.isArray(rawDoc.guarantors) && rawDoc.guarantors.length) {
      usedKeys.add("guarantors");
      const gClean = rawDoc.guarantors.map(stringifySafe).filter(Boolean);
      if (!std.guarantor && gClean[0]) std.guarantor = gClean[0];
      if (!std.extraGuarantors && gClean.length > 1) std.extraGuarantors = gClean.slice(1).join(", ");
    }

    // प्रमाणित फॉरमॅट लावा
    if (std.mobile) std.mobile = normalizeMobile(std.mobile) || std.mobile;
    if (std.jobType) std.jobType = normalizeJob(std.jobType) || std.jobType;
    if (std.interestType) std.interestType = normalizeInterestType(std.interestType) || std.interestType;
    if (std.interestDay !== undefined && std.interestDay !== "") {
      std.interestDay = normalizeInterestDay(std.interestDay);
    }
    if (std.fixedMonthlyInterest !== undefined && std.fixedMonthlyInterest !== "") {
      std.fixedMonthlyInterest = cleanNum(std.fixedMonthlyInterest);
    }
    if (std.lateFeePerDay !== undefined && std.lateFeePerDay !== "") {
      std.lateFeePerDay = cleanNum(std.lateFeePerDay);
    }
    ["loanDate", "retirementDate", "promiseDate1", "promiseDate2", "promiseDate3"].forEach((dk) => {
      if (std[dk]) {
        const nd = normalizeDate(std[dk]);
        if (nd) std[dk] = nd;
      }
    });

    // अतिरिक्त / कस्टम रकाने गोळा करा (Auto-Catch)
    const allStdKeys = new Set(Object.keys(FIELD_ALIASES));
    const aliasSkip = new Set(["promise1", "promise2", "promise3", "fixedInterest", "lateFee"]);
    const extraFields = [];

    Object.keys(rawDoc).forEach((k) => {
      if (SYSTEM_KEYS.has(k) || allStdKeys.has(k) || usedKeys.has(k) || aliasSkip.has(k)) return;
      const val = rawDoc[k];
      if (!isNonEmpty(val)) return;
      if (typeof val === "object" && !Array.isArray(val) && typeof val.toDate !== "function" && !(val instanceof Date)) {
        Object.keys(val).forEach((subK) => {
          if (SYSTEM_KEYS.has(subK) || usedKeys.has(`${k}.${subK}`) || usedKeys.has(subK)) return;
          const sv = stringifySafe(val[subK]);
          if (sv && sv !== "false" && sv !== "0") extraFields.push({ key: `${k}.${subK}`, label: `${k} (${subK})`, value: sv });
        });
        return;
      }
      const sv = stringifySafe(val);
      if (sv && sv !== "false" && sv !== "0") extraFields.push({ key: k, label: k, value: sv });
    });

    return { std, extraFields, raw: rawDoc };
  }

  // नवीन ग्राहक / Excel Import साठी app.js शी १००% जुळणारे संपूर्ण डॉक्युमेंट तयार करा
  function buildNewBorrowerDoc(rec, fallbackYm, defaultRate) {
    const nowIso = new Date().toISOString();
    const ymNow = fallbackYm || nowIso.slice(0, 7);
    const principal = cleanNum(rec.principal);
    const origPrincipal = cleanNum(rec.originalPrincipal) || principal;
    const rate = (rec.rate !== undefined && rec.rate !== "") ? cleanNum(rec.rate) : Number(defaultRate || 2);
    const fixedMonthlyInterest = cleanNum(rec.fixedMonthlyInterest ?? rec.fixedInterest);
    const loanDate = normalizeDate(rec.loanDate);
    const rawStartYm = String(rec.startYm || "").trim();
    const startYm = /^\d{4}-\d{2}$/.test(rawStartYm) ? rawStartYm : (loanDate ? loanDate.slice(0, 7) : ymNow);
    const customDueAmt = cleanNum(rec.customDue);
    const statusRaw = String(rec.accountStatus || "").toLowerCase();

    return {
      name: String(rec.name || "").trim(),
      loanLabel: String(rec.loanLabel || "").trim(),
      mobile: normalizeMobile(rec.mobile),
      principal,
      originalPrincipal: origPrincipal,
      loanDate: loanDate || `${startYm}-01`,
      startYm,
      rate,
      fixedMonthlyInterest: fixedMonthlyInterest > 0 ? fixedMonthlyInterest : 0,
      interestType: normalizeInterestType(rec.interestType) || "reducing",
      interestDay: normalizeInterestDay(rec.interestDay),
      lateFeePerDay: cleanNum(rec.lateFeePerDay ?? rec.lateFee),
      guarantor: String(rec.guarantor || "").trim(),
      extraGuarantors: String(rec.extraGuarantors || "").trim(),
      jobType: normalizeJob(rec.jobType),
      companyDept: String(rec.companyDept || "").trim(),
      retirementDate: normalizeDate(rec.retirementDate),
      promiseDate1: normalizeDate(rec.promiseDate1 ?? rec.promise1),
      promiseDate2: normalizeDate(rec.promiseDate2 ?? rec.promise2),
      promiseDate3: normalizeDate(rec.promiseDate3 ?? rec.promise3),
      note: String(rec.note || "").trim(),
      accountStatus: (statusRaw.includes("closed") || statusRaw.includes("बंद")) ? "closed" : "active",
      isDeleted: false,
      // app.js साठी आवश्यक असलेले सर्व ८ डिफॉल्ट रकाने
      paidMonths: {},
      partialPayments: {},
      paymentHistory: [],
      extraPrincipals: [],
      principalReductions: [],
      versionHistory: [],
      followUps: [],
      customPastDues: customDueAmt > 0 ? { [startYm]: customDueAmt } : {},
      customCashPaid: {},
      createdAt: nowIso,
      updatedAt: nowIso
    };
  }

  // जुन्या खात्यासाठी app.js च्या खऱ्या नावांमध्ये अचूक Repair Patch तयार करा
  function computeRepairPatch(rawDoc) {
    if (!rawDoc || rawDoc.isDeleted || !rawDoc.id) return null;
    const norm = normalizeBorrower(rawDoc);
    if (!norm || !norm.std) return null;

    const s = norm.std;
    const patch = {};
    const changedLabels = [];

    const checkAndSet = (key, candidateVal, forceFormatMatch) => {
      if (candidateVal === undefined || candidateVal === null) return;
      if (typeof candidateVal === "number" && (Number.isNaN(candidateVal) || candidateVal <= 0)) return;
      const candStr = String(candidateVal).trim();
      if (!candStr) return;

      const curVal = rawDoc[key];
      const curStr = (curVal === undefined || curVal === null) ? "" : String(curVal).trim();

      if (curStr === "" || curStr === "-" || curStr === "नाही" || curStr === "0" || (forceFormatMatch && curStr !== candStr)) {
        if (curVal !== candidateVal) {
          patch[key] = candidateVal;
          changedLabels.push(FIELD_LABELS_MR[key] || key);
        }
      }
    };

    checkAndSet("mobile", normalizeMobile(s.mobile), true);
    checkAndSet("jobType", normalizeJob(s.jobType), true);
    checkAndSet("companyDept", s.companyDept, false);
    checkAndSet("guarantor", s.guarantor, false);
    checkAndSet("extraGuarantors", s.extraGuarantors, false);
    checkAndSet("interestDay", normalizeInterestDay(s.interestDay), true);
    checkAndSet("fixedMonthlyInterest", cleanNum(s.fixedMonthlyInterest), false);
    checkAndSet("lateFeePerDay", cleanNum(s.lateFeePerDay), false);
    checkAndSet("loanDate", normalizeDate(s.loanDate), true);
    checkAndSet("retirementDate", normalizeDate(s.retirementDate), true);
    checkAndSet("promiseDate1", normalizeDate(s.promiseDate1), true);
    checkAndSet("promiseDate2", normalizeDate(s.promiseDate2), true);
    checkAndSet("promiseDate3", normalizeDate(s.promiseDate3), true);
    checkAndSet("loanLabel", s.loanLabel, false);
    checkAndSet("interestType", normalizeInterestType(s.interestType), true);

    const mergedNote = s.note || (s.address ? `पत्ता: ${s.address}` : "");
    checkAndSet("note", mergedNote, false);

    // 'मुद्दल नोंदी' मध्ये तारीख '-' दिसू नये म्हणून startYm वरून loanDate द्या (फक्त दोन्ही रिकामे असतील तर)
    if (!rawDoc.loanDate && !patch.loanDate && !rawDoc.createdAt && s.startYm && /^\d{4}-\d{2}$/.test(String(s.startYm))) {
      checkAndSet("loanDate", `${s.startYm}-01`, false);
    }

    if (!rawDoc.startYm && (patch.loanDate || s.loanDate)) {
      const ymFromDate = String(patch.loanDate || s.loanDate).slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(ymFromDate)) checkAndSet("startYm", ymFromDate, false);
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

  // कार्डवरून app.js च्या data-toggle-card किंवा data-id वरून १००% अचूक ग्राहक ओळखा
  function findBorrowerFromCard(card) {
    if (!card || !window.HishobBridge) return null;
    const all = window.HishobBridge.getBorrowers() || [];
    if (!all.length) return null;

    const directId =
      card.querySelector(".nc-clickable-area[data-toggle-card]")?.getAttribute("data-toggle-card") ||
      card.getAttribute("data-pro-bid") ||
      card.getAttribute("data-id") ||
      card.querySelector("button[data-id]")?.getAttribute("data-id") ||
      card.querySelector("[id^='cardDetails_']")?.id.replace("cardDetails_", "");

    if (directId) {
      const byId = all.find((x) => x.id === directId);
      if (byId) return byId;
    }

    const mobMatch = (card.textContent || "").match(/[6-9]\d{9}/);
    if (mobMatch) {
      const byMob = all.find((x) => normalizeMobile(x.mobile) === mobMatch[0]);
      if (byMob) return byMob;
    }

    const titleEl = card.querySelector(".nc-title span:last-child, strong, h4, h3");
    const rawName = (titleEl?.textContent || "").replace(/^\s*#?\d+[\.\)\-\s]+/, "").trim();
    if (rawName) {
      return all.find((x) => String(x.name || "").trim().toLowerCase() === rawName.toLowerCase()) || null;
    }
    return null;
  }

  window.VyajSchema = {
    SYSTEM_KEYS,
    FIELD_ALIASES,
    FIELD_LABELS_MR,
    isNonEmpty,
    cleanNum,
    normalizeMobile,
    normalizeDate,
    normalizeJob,
    normalizeInterestType,
    normalizeInterestDay,
    stringifySafe,
    normalizeBorrower,
    buildNewBorrowerDoc,
    computeRepairPatch,
    findBorrowerFromCard
  };
})();
