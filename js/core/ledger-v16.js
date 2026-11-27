// व्याज हिशोब वही - बँकिंग-लेव्हल BigInt पैसे गणित, 3 दर कालावधी, IST घड्याळ, Historical Locks, Compound, Advance Wallet व EMI इंजिन (js/core/ledger-v16.js - V16.0)
(function () {
  const RATE_SCALE = 10000n;       // व्याज दरासाठी ४ दशांश अचूकता (उदा. 1.13 -> 11300n)
  const PCT_DENOM = 1000000n;      // 100% * RATE_SCALE
  const YEAR_DENOM = 365000000n;   // Actual/365 * 100% * RATE_SCALE
  const FP_SCALE = 1000000000000000000n; // 10^18 Fixed-Point (BigInt Reducing EMI साठी)

  // =========================================================================
  // १. अचूक BigInt पैसे रूपांतरण व Half-Up Rounding (शून्य फ्लोटिंग-पॉईंट चूक)
  // =========================================================================
  function divRoundHalfUp(num, den) {
    if (den === 0n) return 0n;
    const neg = (num < 0n) !== (den < 0n);
    const a = num < 0n ? -num : num;
    const b = den < 0n ? -den : den;
    // अर्धा पैसा किंवा जास्त उरल्यास अचूक वरच्या पूर्णांकावर राउंड करा
    const q = (a * 2n + b) / (b * 2n);
    return neg ? -q : q;
  }

  // रुपये (String किंवा Number) -> पूर्णांक पैसे (BigInt)
  function toPaise(val) {
    if (typeof val === "bigint") return val;
    if (val === null || val === undefined || val === "") return 0n;
    const raw = String(val).replace(/[,₹\s]/g, "").trim();
    if (!raw || raw === "-" || raw === "+") return 0n;
    if (!/^[+-]?\d*(\.\d*)?$/.test(raw)) {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return 0n;
      return toPaise(parsed.toFixed(4));
    }

    const neg = raw.startsWith("-");
    const clean = raw.replace(/^[+-]/, "");
    const parts = clean.split(".");
    const intPart = parts[0] ? BigInt(parts[0]) : 0n;
    const fracRaw = parts[1] || "";

    let paise = intPart * 100n;
    if (fracRaw.length > 0) {
      const twoDigits = (fracRaw + "00").slice(0, 2);
      paise += BigInt(twoDigits);
      // तिसरा अंक >= 5 असल्यास अर्ध्या पैशाचे Half-Up Rounding
      if (fracRaw.length >= 3 && parseInt(fracRaw[2], 10) >= 5) {
        paise += 1n;
      }
    }
    return neg ? -paise : paise;
  }

  // व्याज दर (उदा. 1.13) -> Scaled BigInt (11300n)
  function rateToScaled(rateVal) {
    if (typeof rateVal === "bigint") return rateVal;
    if (rateVal === null || rateVal === undefined || rateVal === "") return 0n;
    const raw = String(rateVal).replace(/[%\s,]/g, "").trim();
    if (!/^[+-]?\d*(\.\d*)?$/.test(raw)) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) return 0n;
      return rateToScaled(n.toFixed(4));
    }
    const clean = raw.replace(/^[+-]/, "");
    const [intStr = "0", fracStr = ""] = clean.split(".");
    const intPart = intStr ? BigInt(intStr) : 0n;
    const frac4 = (fracStr + "0000").slice(0, 4);
    let scaled = intPart * RATE_SCALE + BigInt(frac4);
    if (fracStr.length >= 5 && parseInt(fracStr[4], 10) >= 5) scaled += 1n;
    return raw.startsWith("-") ? -scaled : scaled;
  }

  // BigInt पैसे -> JavaScript Number रुपये (उदा. 1187n -> 11.87)
  function paiseToRupeesNum(paise) {
    const p = toPaise(paise);
    return Number(p) / 100;
  }

  // BigInt पैसे -> भारतीय कॉमा फॉरमॅट (₹11.87 किंवा ₹6,500)
  function formatPaiseInr(paise, forceDecimals = false) {
    const p = toPaise(paise);
    const neg = p < 0n;
    const absP = neg ? -p : p;
    const rup = absP / 100n;
    const rem = absP % 100n;
    const rupStr = Number(rup).toLocaleString("en-IN");
    const sign = neg ? "-" : "";
    if (!forceDecimals && rem === 0n) return `${sign}₹${rupStr}`;
    return `${sign}₹${rupStr}.${String(rem).padStart(2, "0")}`;
  }

  // =========================================================================
  // २. भारतीय प्रमाणवेळ (IST - Asia/Kolkata) व Strict Calendar Validator
  // =========================================================================
  function isLeapYear(year) {
    const y = Number(year);
    return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  }

  function daysInMonth(year, month) {
    const y = Number(year);
    const m = Number(month);
    if (m === 2) return isLeapYear(y) ? 29 : 28;
    if ([4, 6, 9, 11].includes(m)) return 30;
    if (m >= 1 && m <= 12) return 31;
    return 0;
  }

  // फक्त Asia/Kolkata वेळेनुसार आजची तारीख, महिना व वेळ काढा
  function getIstParts(dateObj) {
    const d = dateObj instanceof Date ? dateObj : new Date();
    try {
      const fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
      const parts = {};
      fmt.formatToParts(d).forEach((p) => { parts[p.type] = p.value; });
      const year = parseInt(parts.year, 10);
      const month = parseInt(parts.month, 10);
      const day = parseInt(parts.day, 10);
      const hour = parseInt(parts.hour, 10) % 24;
      const minute = parseInt(parts.minute, 10);
      const second = parseInt(parts.second, 10);
      return {
        year, month, day, hour, minute, second,
        isoDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        ym: `${year}-${String(month).padStart(2, "0")}`
      };
    } catch (_) {
      // सुरक्षित Fallback: UTC + 5:30 तास
      const istMs = d.getTime() + 19800000;
      const x = new Date(istMs);
      const year = x.getUTCFullYear();
      const month = x.getUTCMonth() + 1;
      const day = x.getUTCDate();
      return {
        year, month, day,
        hour: x.getUTCHours(),
        minute: x.getUTCMinutes(),
        second: x.getUTCSeconds(),
        isoDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        ym: `${year}-${String(month).padStart(2, "0")}`
      };
    }
  }

  function getIstTodayIso() {
    return getIstParts().isoDate;
  }

  function getIstCurrentYm() {
    return getIstParts().ym;
  }

  // चुकीच्या तारखा (उदा. 30 फेब्रुवारी, 31 एप्रिल, 29 फेब्रुवारी 2025) आपोआप नाकारणारा Strict Validator
  function parseStrictDate(input) {
    if (!input) return { valid: false, error: "कृपया तारीख टाका." };
    const s = String(input).trim();
    let y = 0, m = 0, d = 0;

    const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);

    if (isoMatch) {
      y = parseInt(isoMatch[1], 10);
      m = parseInt(isoMatch[2], 10);
      d = parseInt(isoMatch[3], 10);
    } else if (dmyMatch) {
      d = parseInt(dmyMatch[1], 10);
      m = parseInt(dmyMatch[2], 10);
      y = parseInt(dmyMatch[3], 10);
    } else {
      return { valid: false, error: "तारीख अयोग्य फॉरमॅटमध्ये आहे (YYYY-MM-DD किंवा DD/MM/YYYY वापरा)." };
    }

    if (y < 1900 || y > 2199) return { valid: false, error: `वर्ष (${y}) वैध मर्यादेत नाही.` };
    if (m < 1 || m > 12) return { valid: false, error: `महिना (${m}) १ ते १२ दरम्यान असावा.` };

    const maxDays = daysInMonth(y, m);
    if (d < 1 || d > maxDays) {
      return {
        valid: false,
        error: `चुकीची तारीख: ${d}/${m}/${y} अस्तित्वात नाही (या महिन्यात कमाल ${maxDays} दिवस आहेत).`
      };
    }

    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return { valid: true, year: y, month: m, day: d, iso, isLeap: isLeapYear(y), utcMs: Date.UTC(y, m - 1, d) };
  }

  function diffDaysStrict(startInput, endInput) {
    const st = parseStrictDate(startInput);
    if (!st.valid) return { valid: false, error: `सुरू तारीख — ${st.error}` };
    const en = parseStrictDate(endInput);
    if (!en.valid) return { valid: false, error: `शेवट तारीख — ${en.error}` };
    if (en.utcMs < st.utcMs) {
      return { valid: false, error: "शेवटची तारीख सुरू तारखेपेक्षा आधीची असू शकत नाही." };
    }
    const days = Math.round((en.utcMs - st.utcMs) / 86400000);
    return { valid: true, days, start: st, end: en };
  }

  // IST वेळेनुसार विलंब दिवस व विलंब दंड (BigInt पैसे)
  function computeLateFeeIstPaise(b, targetYm) {
    const feePerDayPaise = toPaise(b.lateFee || 0);
    const dueDay = parseInt(b.interestDay || 0, 10);
    if (feePerDayPaise <= 0n || dueDay < 1 || dueDay > 31) return { daysLate: 0, feePaise: 0n };

    const ist = getIstParts();
    const [yStr, mStr] = String(targetYm || ist.ym).split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    if (!y || !m) return { daysLate: 0, feePaise: 0n };

    const clampedDay = Math.min(dueDay, daysInMonth(y, m));
    const dueIso = `${y}-${String(m).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
    if (ist.isoDate <= dueIso) return { daysLate: 0, feePaise: 0n };

    const diff = diffDaysStrict(dueIso, ist.isoDate);
    if (!diff.valid || diff.days <= 0) return { daysLate: 0, feePaise: 0n };
    return { daysLate: diff.days, feePaise: feePerDayPaise * BigInt(diff.days) };
  }

  // =========================================================================
  // ३. मुख्य BigInt व्याज गणना (Monthly / Daily / Yearly Actual/365)
  // =========================================================================
  function calcInterestPaise({ principalPaise, rate, ratePeriod = "monthly", days = 1, months = 1 }) {
    const P = toPaise(principalPaise);
    const R = rateToScaled(rate);
    if (P <= 0n || R <= 0n) return 0n;

    const period = String(ratePeriod || "monthly").toLowerCase();
    if (period === "daily") {
      const d = BigInt(Math.max(0, Math.round(Number(days || 0))));
      return divRoundHalfUp(P * R * d, PCT_DENOM);
    }
    if (period === "yearly") {
      // Actual/365 बँकिंग मानक (लीप वर्षात फेब्रुवारीचे २९ दिवस अचूक धरून)
      const d = BigInt(Math.max(0, Math.round(Number(days || 0))));
      return divRoundHalfUp(P * R * d, YEAR_DENOM);
    }
    // Monthly
    const m = BigInt(Math.max(0, Math.round(Number(months || 1))));
    return divRoundHalfUp(P * R * m, PCT_DENOM);
  }

  // =========================================================================
  // ४. ऐतिहासिक दर व मुद्दल लॉक (v16Terms, v16InterestLocks, v17OpeningPrincipal)
  // =========================================================================
  function getOpeningPrincipalPaise(b) {
    if (!b) return 0n;
    if (b.v17OpeningPrincipal !== undefined && b.v17OpeningPrincipal !== null && b.v17OpeningPrincipal !== "") {
      return toPaise(b.v17OpeningPrincipal);
    }
    if (b.originalPrincipal !== undefined && b.originalPrincipal !== null && b.originalPrincipal !== "") {
      return toPaise(b.originalPrincipal);
    }
    return toPaise(b.principal || 0);
  }

  // दिलेल्या महिन्यासाठी लागू असलेले दर, पद्धत व मुद्दल शोधा (पुढचे बदल मागील महिन्यांना स्पर्श करत नाहीत)
  function resolveTermsForMonth(b, ym) {
    const base = {
      effectiveYm: String(b?.startYm || "").slice(0, 7) || "2000-01",
      principalPaise: toPaise(b?.principal || 0),
      rate: Number(b?.rate || 0),
      ratePeriod: String(b?.ratePeriod || "monthly").toLowerCase(),
      interestType: String(b?.interestType || "reducing").toLowerCase(),
      fixedInterestPaise: toPaise(b?.fixedInterest || 0)
    };

    const terms = Array.isArray(b?.v16Terms) ? b.v16Terms : [];
    if (!terms.length || !ym) return base;

    const sorted = terms
      .filter((t) => t && t.effectiveYm)
      .slice()
      .sort((a, c) => String(a.effectiveYm).localeCompare(String(c.effectiveYm)));

    let matched = null;
    for (let i = 0; i < sorted.length; i++) {
      if (String(sorted[i].effectiveYm) <= String(ym)) matched = sorted[i];
      else break;
    }

    if (!matched) {
      // जर निवडलेला महिना पहिल्या टर्मच्या आधीचा असेल तर पहिला लॉक किंवा मूळ मुद्दल वापरा
      return {
        ...base,
        principalPaise: getOpeningPrincipalPaise(b)
      };
    }

    return {
      effectiveYm: String(matched.effectiveYm),
      principalPaise: matched.principal !== undefined ? toPaise(matched.principal) : base.principalPaise,
      rate: matched.rate !== undefined ? Number(matched.rate) : base.rate,
      ratePeriod: String(matched.ratePeriod || base.ratePeriod).toLowerCase(),
      interestType: String(matched.interestType || base.interestType).toLowerCase(),
      fixedInterestPaise: matched.fixedInterest !== undefined ? toPaise(matched.fixedInterest) : base.fixedInterestPaise
    };
  }

  // दिलेल्या महिन्याचे व्याज काढा (लॉक असल्यास थेट लॉक केलेला आकडा द्या)
  function computeMonthInterestDetails(b, ym) {
    const targetYm = String(ym || getIstCurrentYm()).slice(0, 7);
    const [yStr, mStr] = targetYm.split("-");
    const year = parseInt(yStr, 10) || getIstParts().year;
    const month = parseInt(mStr, 10) || getIstParts().month;
    const mDays = daysInMonth(year, month);

    const terms = resolveTermsForMonth(b, targetYm);
    const openingPaise = getOpeningPrincipalPaise(b);
    const locks = b && b.v16InterestLocks && typeof b.v16InterestLocks === "object" ? b.v16InterestLocks : null;

    if (locks && locks[targetYm] !== undefined && locks[targetYm] !== null) {
      const entry = locks[targetYm];
      const lockedPaise = typeof entry === "object"
        ? (entry.interestPaise !== undefined ? BigInt(String(entry.interestPaise)) : toPaise(entry.interest || 0))
        : toPaise(entry);
      return {
        ym: targetYm,
        daysInMonth: mDays,
        isLocked: true,
        interestPaise: lockedPaise,
        interestRupees: paiseToRupeesNum(lockedPaise),
        basePrincipalPaise: terms.interestType === "flat" ? openingPaise : terms.principalPaise,
        openingPrincipalPaise: openingPaise,
        terms
      };
    }

    const basePrincipalPaise = terms.interestType === "flat" ? openingPaise : terms.principalPaise;
    let interestPaise = 0n;

    if (terms.fixedInterestPaise > 0n) {
      interestPaise = terms.fixedInterestPaise;
    } else {
      interestPaise = calcInterestPaise({
        principalPaise: basePrincipalPaise,
        rate: terms.rate,
        ratePeriod: terms.ratePeriod,
        days: mDays,
        months: 1
      });
    }

    return {
      ym: targetYm,
      daysInMonth: mDays,
      isLocked: false,
      interestPaise,
      interestRupees: paiseToRupeesNum(interestPaise),
      basePrincipalPaise,
      openingPrincipalPaise: openingPaise,
      terms
    };
  }

  // पुढील महिन्याचा YYYY-MM काढा (नवीन दर/मुद्दल बदल पुढील महिन्यापासून लागू करण्यासाठी)
  function getNextYm(ym) {
    const base = String(ym || getIstCurrentYm()).slice(0, 7);
    let [y, m] = base.split("-").map((x) => parseInt(x, 10));
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  // ऐतिहासिक दर/मुद्दल बदल सेव्ह करण्यासाठी सुरक्षित Firestore पेलोड बनवा
  function buildHistoricalTermUpdate(b, newTerms, currentYm) {
    const curYm = String(currentYm || getIstCurrentYm()).slice(0, 7);
    const effectiveYm = String(newTerms.effectiveYm || getNextYm(curYm)).slice(0, 7);
    const openingPaise = getOpeningPrincipalPaise(b);

    // चालू महिन्याचे जुने व्याज आधी लॉक करा म्हणजे मागील हिशोब कधीच बदलणार नाही
    const curDet = computeMonthInterestDetails(b, curYm);
    const nextLocks = { ...(b.v16InterestLocks || {}) };
    if (!nextLocks[curYm]) {
      nextLocks[curYm] = {
        interestPaise: curDet.interestPaise.toString(),
        interest: curDet.interestRupees,
        lockedAt: new Date().toISOString()
      };
    }

    // आधीच्या टर्म्स सुरक्षित ठेवून नवीन effectiveYm जोडा
    const existingTerms = Array.isArray(b.v16Terms) ? b.v16Terms.slice() : [];
    if (!existingTerms.length) {
      existingTerms.push({
        effectiveYm: String(b.startYm || curYm).slice(0, 7),
        principal: Number(b.principal || 0),
        rate: Number(b.rate || 0),
        ratePeriod: String(b.ratePeriod || "monthly").toLowerCase(),
        interestType: String(b.interestType || "reducing").toLowerCase(),
        fixedInterest: Number(b.fixedInterest || 0)
      });
    }

    const filtered = existingTerms.filter((t) => String(t.effectiveYm) !== effectiveYm);
    filtered.push({
      effectiveYm,
      principal: newTerms.principal !== undefined ? Number(newTerms.principal) : Number(b.principal || 0),
      rate: newTerms.rate !== undefined ? Number(newTerms.rate) : Number(b.rate || 0),
      ratePeriod: String(newTerms.ratePeriod || b.ratePeriod || "monthly").toLowerCase(),
      interestType: String(newTerms.interestType || b.interestType || "reducing").toLowerCase(),
      fixedInterest: newTerms.fixedInterest !== undefined ? Number(newTerms.fixedInterest) : Number(b.fixedInterest || 0),
      updatedAt: new Date().toISOString()
    });
    filtered.sort((a, c) => String(a.effectiveYm).localeCompare(String(c.effectiveYm)));

    return {
      v17OpeningPrincipal: paiseToRupeesNum(openingPaise),
      v16Terms: filtered,
      v16InterestLocks: nextLocks,
      ratePeriod: String(newTerms.ratePeriod || b.ratePeriod || "monthly").toLowerCase(),
      updatedAt: new Date().toISOString()
    };
  }

  // =========================================================================
  // ५. ऑप्ट-इन ऑटोमॅटिक चक्रवाढ व्याज (v18Compound — महिन्यातून फक्त एकदाच)
  // =========================================================================
  function evaluateCompound(b, activeYm, pastDueRupees) {
    const cfg = b && b.v18Compound && typeof b.v18Compound === "object" ? b.v18Compound : null;
    if (!cfg || cfg.enabled !== true) {
      return { eligible: false, reason: "disabled" };
    }

    const ym = String(activeYm || getIstCurrentYm()).slice(0, 7);
    const history = Array.isArray(cfg.history) ? cfg.history : [];
    const alreadyDone =
      (cfg.lastCompoundedYm && String(cfg.lastCompoundedYm) >= ym) ||
      history.some((h) => h && String(h.ym) === ym);

    if (alreadyDone) {
      return { eligible: false, reason: "already_compounded_this_month" };
    }

    const pastPaise = toPaise(pastDueRupees || 0);
    if (pastPaise <= 0n) {
      return { eligible: false, reason: "no_past_due" };
    }

    const curPrincipalPaise = toPaise(b.principal || 0);
    const nextPrincipalPaise = curPrincipalPaise + pastPaise;

    return {
      eligible: true,
      ym,
      addedInterestPaise: pastPaise,
      addedInterestRupees: paiseToRupeesNum(pastPaise),
      oldPrincipalPaise: curPrincipalPaise,
      newPrincipalPaise: nextPrincipalPaise,
      newPrincipalRupees: paiseToRupeesNum(nextPrincipalPaise),
      entryType: "compound_capitalization" // रोख जमा (Cash) नाही हे स्पष्ट ओळखण्यासाठी
    };
  }

  // =========================================================================
  // ६. स्वतंत्र अ‍ॅडव्हान्स वॉलेट (v16AdvanceWallet — तुम्ही Apply करेपर्यंत वेगळे)
  // =========================================================================
  function getAdvanceWalletBalancePaise(b) {
    const w = b && b.v16AdvanceWallet && typeof b.v16AdvanceWallet === "object" ? b.v16AdvanceWallet : null;
    if (!w) return 0n;
    if (w.balancePaise !== undefined && w.balancePaise !== null) {
      try { return BigInt(String(w.balancePaise)); } catch (_) {}
    }
    return toPaise(w.balance || 0);
  }

  function buildWalletTransaction(b, type, amountRupees, ym, note) {
    const curBal = getAdvanceWalletBalancePaise(b);
    const amtPaise = toPaise(amountRupees || 0);
    if (amtPaise <= 0n) return { error: "रक्कम शून्यापेक्षा जास्त असावी." };

    let nextBal = curBal;
    if (type === "credit") {
      nextBal = curBal + amtPaise;
    } else if (type === "apply") {
      if (amtPaise > curBal) return { error: "अ‍ॅडव्हान्स वॉलेटमध्ये पुरेशी शिल्लक नाही." };
      nextBal = curBal - amtPaise;
    } else {
      return { error: "अयोग्य वॉलेट व्यवहार." };
    }

    const prevTx = Array.isArray(b?.v16AdvanceWallet?.transactions) ? b.v16AdvanceWallet.transactions.slice(-49) : [];
    const tx = {
      id: "wtx_" + Date.now(),
      type,
      amountPaise: amtPaise.toString(),
      amount: paiseToRupeesNum(amtPaise),
      ym: String(ym || getIstCurrentYm()).slice(0, 7),
      date: getIstTodayIso(),
      note: String(note || (type === "credit" ? "अ‍ॅडव्हान्स वॉलेटमध्ये जमा" : "वॉलेटमधून व्याजात लागू")),
      ts: new Date().toISOString()
    };

    return {
      v16AdvanceWallet: {
        balancePaise: nextBal.toString(),
        balance: paiseToRupeesNum(nextBal),
        updatedAt: new Date().toISOString(),
        transactions: [...prevTx, tx]
      },
      tx
    };
  }

  // =========================================================================
  // ७. BigInt EMI इंजिन (Flat व Reducing — शेवटच्या हप्त्यापर्यंत पैशा-पैशाचा हिशोब)
  // =========================================================================
  function mulFp(a, b) {
    return divRoundHalfUp(a * b, FP_SCALE);
  }

  function powFp(base, exp) {
    let result = FP_SCALE;
    let b = base;
    let e = BigInt(exp);
    while (e > 0n) {
      if (e & 1n) result = mulFp(result, b);
      b = mulFp(b, b);
      e >>= 1n;
    }
    return result;
  }

  function calculateEmiBigInt({ principal, monthlyRate, months, type = "reducing" }) {
    const P = toPaise(principal);
    const n = Math.max(1, Math.round(Number(months || 1)));
    const nBig = BigInt(n);
    const rScaled = rateToScaled(monthlyRate);
    const mode = String(type || "reducing").toLowerCase();

    if (P <= 0n) return { valid: false, error: "कृपया वैध मुद्दल रक्कम टाका." };

    // शून्य व्याज दर असल्यास सरळ समान हप्ते
    if (rScaled <= 0n) {
      const baseEmi = divRoundHalfUp(P, nBig);
      const lastEmi = P - baseEmi * (nBig - 1n);
      return {
        valid: true,
        type: mode,
        principalPaise: P,
        months: n,
        emiPaise: baseEmi,
        lastEmiPaise: lastEmi,
        totalInterestPaise: 0n,
        totalPayablePaise: P,
        schedule: []
      };
    }

    if (mode === "flat") {
      const totalInterestPaise = divRoundHalfUp(P * rScaled * nBig, PCT_DENOM);
      const totalPayablePaise = P + totalInterestPaise;
      const emiPaise = divRoundHalfUp(totalPayablePaise, nBig);
      const lastEmiPaise = totalPayablePaise - emiPaise * (nBig - 1n);
      const monthlyIntPaise = divRoundHalfUp(totalInterestPaise, nBig);

      const schedule = [];
      let bal = P;
      for (let i = 1; i <= n; i++) {
        const isLast = i === n;
        const pay = isLast ? lastEmiPaise : emiPaise;
        const intPart = isLast ? (totalInterestPaise - monthlyIntPaise * (nBig - 1n)) : monthlyIntPaise;
        const prinPart = isLast ? bal : (pay - intPart);
        bal = bal > prinPart ? bal - prinPart : 0n;
        schedule.push({ month: i, emiPaise: pay, interestPaise: intPart, principalPaise: prinPart, balancePaise: bal });
      }

      return {
        valid: true,
        type: "flat",
        principalPaise: P,
        months: n,
        emiPaise,
        lastEmiPaise,
        totalInterestPaise,
        totalPayablePaise,
        schedule
      };
    }

    // Reducing Balance (BigInt Fixed-Point 10^18 अचूकता)
    // r = rScaled / 10^6 -> rFp = rScaled * 10^12
    const rFp = rScaled * 1000000000000n;
    const onePlusR = FP_SCALE + rFp;
    const powN = powFp(onePlusR, n);
    const denomFp = powN - FP_SCALE;
    const emiPaise = divRoundHalfUp(P * rFp * powN, denomFp * FP_SCALE);

    const schedule = [];
    let bal = P;
    let totalInterestPaise = 0n;
    let totalPayablePaise = 0n;
    let lastEmiPaise = emiPaise;

    for (let i = 1; i <= n; i++) {
      const intPart = divRoundHalfUp(bal * rScaled, PCT_DENOM);
      let prinPart = emiPaise - intPart;
      let pay = emiPaise;

      if (i === n || prinPart >= bal) {
        prinPart = bal;
        pay = prinPart + intPart;
        lastEmiPaise = pay;
      }

      bal -= prinPart;
      totalInterestPaise += intPart;
      totalPayablePaise += pay;
      schedule.push({ month: i, emiPaise: pay, interestPaise: intPart, principalPaise: prinPart, balancePaise: bal });
      if (bal <= 0n) break;
    }

    return {
      valid: true,
      type: "reducing",
      principalPaise: P,
      months: schedule.length,
      emiPaise,
      lastEmiPaise,
      totalInterestPaise,
      totalPayablePaise,
      schedule
    };
  }

  // =========================================================================
  // ८. स्वयंचलित बँकिंग अचूकता चाचणी (Self-Verification Suite)
  // =========================================================================
  function runSelfTests() {
    const results = [];
    const assertEq = (name, actual, expected) => {
      const ok = actual === expected;
      results.push({ name, ok, actual: String(actual), expected: String(expected) });
    };

    // चाचणी १: अर्ध्या पैशाचे Half-Up Rounding (₹1,050 * 1.13% = ₹11.87)
    const t1 = calcInterestPaise({ principalPaise: toPaise(1050), rate: 1.13, ratePeriod: "monthly", months: 1 });
    assertEq("Half-Up Rounding (₹1050 @ 1.13%)", t1, 1187n);

    // चाचणी २: लीप वर्ष फेब्रुवारी (2024 = 29 दिवस, 2026 = 28 दिवस)
    assertEq("Leap Year Feb 2024 Days", daysInMonth(2024, 2), 29);
    assertEq("Non-Leap Year Feb 2026 Days", daysInMonth(2026, 2), 28);

    // चाचणी ३: चुकीची तारीख (30 फेब्रुवारी व 29 फेब्रुवारी 2025) नाकारणे
    assertEq("Reject 2026-02-30", parseStrictDate("2026-02-30").valid, false);
    assertEq("Reject 2025-02-29", parseStrictDate("2025-02-29").valid, false);
    assertEq("Accept 2024-02-29", parseStrictDate("2024-02-29").valid, true);

    // चाचणी ४: Yearly Actual/365 गणना (₹1,00,000 @ 12% साठी 365 दिवस = ₹12,000)
    const t4 = calcInterestPaise({ principalPaise: toPaise(100000), rate: 12, ratePeriod: "yearly", days: 365 });
    assertEq("Yearly Actual/365 (365 days)", t4, 1200000n);

    // चाचणी ५: BigInt Reducing EMI शिल्लक शेवटी शून्य पैसे
    const emi = calculateEmiBigInt({ principal: 100000, monthlyRate: 2, months: 12, type: "reducing" });
    const finalBal = emi.schedule.length ? emi.schedule[emi.schedule.length - 1].balancePaise : -1n;
    assertEq("BigInt Reducing EMI Zero Final Balance", finalBal, 0n);

    const passed = results.filter((r) => r.ok).length;
    return { allPassed: passed === results.length, passed, total: results.length, results };
  }

  window.VyajLedgerV16 = {
    version: "16.0",
    divRoundHalfUp,
    toPaise,
    rateToScaled,
    paiseToRupeesNum,
    formatPaiseInr,
    isLeapYear,
    daysInMonth,
    getIstParts,
    getIstTodayIso,
    getIstCurrentYm,
    parseStrictDate,
    diffDaysStrict,
    computeLateFeeIstPaise,
    calcInterestPaise,
    getOpeningPrincipalPaise,
    resolveTermsForMonth,
    computeMonthInterestDetails,
    getNextYm,
    buildHistoricalTermUpdate,
    evaluateCompound,
    getAdvanceWalletBalancePaise,
    buildWalletTransaction,
    calculateEmiBigInt,
    runSelfTests
  };
})();
