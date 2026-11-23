// व्याज हिशोब वही - १००% संपूर्ण ग्राहक प्रोफाईल (All Details) + स्मार्ट कार्ड टॅग्स + ५ Advance फीचर्स (js/customer-details.js - V14.27)
(function () {
  const MARATHI_MONTHS = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];
  let currentDetailBorrower = null;
  let cardEnhanceTimer = null;

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function fmtInr(val) {
    const n = Number(val || 0);
    if (window.HishobBridge && typeof window.HishobBridge.fmtAmt === "function") {
      return window.HishobBridge.fmtAmt(n);
    }
    return "₹" + n.toLocaleString("en-IN");
  }

  function fmtDate(raw) {
    if (!raw) return "";
    const s = String(raw).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    if (/^\d{4}-\d{2}$/.test(s)) return fmtMonthMr(s);
    return s;
  }

  function fmtMonthMr(ym) {
    if (!ym || !String(ym).includes("-")) return String(ym || "");
    const [y, m] = String(ym).split("-");
    return `${MARATHI_MONTHS[parseInt(m, 10) - 1] || m} ${y}`;
  }

  function jobLabel(val) {
    const v = String(val || "").toLowerCase().trim();
    if (v === "govt" || v.includes("सरकारी")) return "सरकारी नोकरी (Govt)";
    if (v === "private" || v.includes("खाजगी")) return "खाजगी नोकरी (Pvt)";
    if (v === "business" || v.includes("व्यवसाय")) return "व्यवसाय / इतर";
    return val ? String(val) : "";
  }

  function interestTypeLabel(val) {
    const v = String(val || "").toLowerCase().trim();
    if (v === "flat") return "Flat Interest (मूळ मुद्दलावर)";
    if (v === "reducing") return "Reducing Balance (उरलेल्या मुद्दलावर)";
    return val ? String(val) : "Reducing Balance";
  }

  // मजकुरातून १० अंकी भारतीय मोबाईल नंबर शोधा (जामीनदार Call / WA साठी)
  function extractPhoneNumbers(text) {
    if (!text) return [];
    const matches = String(text).match(/(?:\+?91[\s-]?)?[6-9]\d{9}/g) || [];
    const cleaned = matches.map((n) => n.replace(/\D/g, "").slice(-10));
    return Array.from(new Set(cleaned));
  }

  // रिटायरमेंट तारीख पुढच्या ६ महिन्यांत (किंवा उलटून गेली) आहे का ते तपासा
  function getRetirementWarning(retDateStr) {
    if (!retDateStr) return null;
    const d = new Date(retDateStr);
    if (Number.isNaN(d.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return { level: "past", text: `⚠️ रिटायरमेंट तारीख (${fmtDate(retDateStr)}) पूर्ण झाली आहे!` };
    }
    if (diffDays <= 180) {
      const approxMonths = Math.max(1, Math.round(diffDays / 30));
      return { level: "soon", text: `⚠️ रिटायरमेंट अलर्ट: अंदाजे ${approxMonths} महिन्यांत (${fmtDate(retDateStr)}) रिटायरमेंट आहे.` };
    }
    return null;
  }

  // ग्राहकाचा पेमेंट स्कोर / ट्रस्ट बॅज मोजा
  function computeTrustBadge(b, calc) {
    if (b.accountStatus === "closed") {
      return { cls: "cd-trust-closed", text: "⚪ बंद खाते (Closed)" };
    }
    const monthly = Number(calc.monthlyInterest || 0);
    const pending = Math.max(0, Number(calc.totalPayable || 0));
    if (monthly > 0 && pending >= monthly * 2) {
      return { cls: "cd-trust-risk", text: "🔴 High-Risk (२+ महिने बाकी)" };
    }
    if (pending <= 0) {
      return { cls: "cd-trust-good", text: "⭐ नियमित ग्राहक" };
    }
    return { cls: "cd-trust-mid", text: "🟡 मध्यम (चालू बाकी)" };
  }

  // हलकी CSS एकदाच जोडा
  function injectCustomerDetailsCss() {
    if (document.getElementById("vyajCustomerDetailsCss")) return;
    const st = document.createElement("style");
    st.id = "vyajCustomerDetailsCss";
    st.textContent = `
      .cd-smart-tags {
        display: flex; flex-wrap: wrap; gap: 5px; margin: 6px 0 4px;
      }
      .cd-tag {
        font-size: 0.69rem; font-weight: 700; padding: 2px 8px; border-radius: 999px;
        background: rgba(255, 255, 255, 0.06); border: 1px solid var(--border);
        color: var(--muted); white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis;
      }
      body.light-mode .cd-tag { background: #eae6dd; color: #334155; }
      .cd-tag.cd-tag-warn { background: rgba(190, 18, 60, 0.16); border-color: rgba(240, 113, 120, 0.45); color: var(--danger); }

      .cd-header-top {
        display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
        padding-bottom: 10px; border-bottom: 1px solid var(--border); margin-bottom: 10px;
      }
      .cd-cust-title { font-size: 1.08rem; font-weight: 900; color: var(--text); margin: 0; }
      .cd-trust-badge {
        font-size: 0.7rem; font-weight: 800; padding: 3px 9px; border-radius: 999px; white-space: nowrap; flex-shrink: 0;
      }
      .cd-trust-good { background: rgba(22, 101, 52, 0.25); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.45); }
      .cd-trust-mid { background: rgba(180, 83, 9, 0.25); color: #e5a952; border: 1px solid rgba(229, 169, 82, 0.45); }
      .cd-trust-risk { background: rgba(159, 18, 57, 0.28); color: #f07178; border: 1px solid rgba(240, 113, 120, 0.5); }
      .cd-trust-closed { background: rgba(100, 116, 139, 0.25); color: var(--muted); border: 1px solid var(--border); }
      body.light-mode .cd-trust-good { background: #dcfce7; color: #15803d; }
      body.light-mode .cd-trust-mid { background: #fef3c7; color: #b45309; }
      body.light-mode .cd-trust-risk { background: #ffe4e6; color: #be123c; }

      .cd-ret-alert {
        padding: 8px 11px; border-radius: 11px; margin-bottom: 10px; font-size: 0.79rem; font-weight: 800;
        background: rgba(190, 18, 60, 0.18); border: 1px solid rgba(240, 113, 120, 0.55); color: #f07178;
      }
      body.light-mode .cd-ret-alert { background: #ffe4e6; color: #be123c; }

      .cd-action-strip {
        display: flex; flex-wrap: nowrap; overflow-x: auto; gap: 6px; padding-bottom: 6px; margin-bottom: 10px;
        -webkit-overflow-scrolling: touch; scrollbar-width: none;
      }
      .cd-action-strip::-webkit-scrollbar { display: none; }
      .cd-action-strip button {
        flex: 0 0 auto; white-space: nowrap; border-radius: 999px; padding: 6px 11px; font-size: 0.75rem; font-weight: 700;
      }

      .cd-sec-card {
        background: var(--meta-bg); border: 1px solid var(--border); border-radius: 13px;
        padding: 10px 12px; margin-bottom: 10px;
      }
      .cd-sec-title {
        font-size: 0.78rem; font-weight: 800; color: var(--accent); margin-bottom: 8px;
        padding-bottom: 4px; border-bottom: 1px dashed var(--border);
      }
      .cd-kv-grid {
        display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 10px;
      }
      @media (max-width: 420px) {
        .cd-kv-grid { grid-template-columns: 1fr; }
      }
      .cd-kv-item { display: flex; flex-direction: column; gap: 2px; }
      .cd-kv-lbl { font-size: 0.7rem; color: var(--muted); font-weight: 600; }
      .cd-kv-val { font-size: 0.85rem; font-weight: 700; color: var(--text); word-break: break-word; }
      .cd-guar-row {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        padding: 6px 8px; border-radius: 9px; background: rgba(255, 255, 255, 0.04);
        border: 1px solid var(--border); margin-top: 6px;
      }
      body.light-mode .cd-guar-row { background: #fbfaf7; }
      .cd-summary-foot { display: flex; gap: 8px; margin-top: 10px; }
      .cd-summary-foot button { flex: 1; font-size: 0.8rem; }
    `;
    document.head.appendChild(st);
  }

  // विशिष्ट ग्राहक कार्डवरून त्याचा borrower ऑब्जेक्ट मिळवा
  function findBorrowerForCard(card) {
    if (!window.HishobBridge) return null;
    const borrowers = window.HishobBridge.getBorrowers() || [];
    const attrId = card.getAttribute("data-id") || card.getAttribute("data-bid") || card.getAttribute("data-borrower-id");
    if (attrId) {
      const byId = borrowers.find((x) => x.id === attrId);
      if (byId) return byId;
    }
    const nameEl = card.querySelector("strong, h4, h3");
    const rawName = (nameEl?.textContent || "").trim();
    if (!rawName) return null;
    return borrowers.find((x) => String(x.name || "").trim() === rawName) ||
      borrowers.find((x) => rawName.includes(String(x.name || "").trim()) && String(x.name || "").trim().length > 2) ||
      null;
  }

  // ग्राहकाच्या कार्डवरील मूळ बटण (Passbook / Docs / Edit) सुरक्षितपणे ट्रिगर करा
  function triggerCardAction(borrowerId, keywords) {
    const listEl = document.getElementById("borrowersList");
    if (!listEl) return false;
    const cards = Array.from(listEl.querySelectorAll(".borrower-item"));
    for (const card of cards) {
      const b = findBorrowerForCard(card);
      if (!b || b.id !== borrowerId) continue;
      const btns = Array.from(card.querySelectorAll("button"));
      for (const btn of btns) {
        if (btn.hasAttribute("data-pro-details-btn") || btn.hasAttribute("data-pro-invoice-btn")) continue;
        const t = (btn.textContent || "").trim().toLowerCase();
        if (keywords.some((k) => t.includes(k))) {
          btn.click();
          return true;
        }
      }
    }
    return false;
  }

  // All Details पॉपअप तयार करा
  function ensureDetailsModal() {
    let modal = document.getElementById("proCustomerDetailsModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "proCustomerDetailsModal";
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `<div class="modal-card" style="max-width:640px;" id="proCustomerDetailsBody"></div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
        if (window.VyajNavStack) window.VyajNavStack.popIfTop("proCustomerDetailsModal");
      }
    });
    return modal;
  }

  function kvRow(label, value, colorCss) {
    if (value === undefined || value === null || String(value).trim() === "") return "";
    const style = colorCss ? ` style="color:${colorCss};"` : "";
    return `
      <div class="cd-kv-item">
        <span class="cd-kv-lbl">${esc(label)}</span>
        <span class="cd-kv-val"${style}>${esc(value)}</span>
      </div>
    `;
  }

  // संपूर्ण ग्राहक प्रोफाईल (All Details) उघडा
  function openProCustomerDetails(borrowerId) {
    if (!window.HishobBridge) return false;
    const borrowers = window.HishobBridge.getBorrowers() || [];
    const b = borrowers.find((x) => x.id === borrowerId);
    if (!b) return false;

    currentDetailBorrower = b;
    window.vyajLastDetailBorrowerId = b.id;

    const activeYm = document.getElementById("activeYm")?.value || new Date().toISOString().slice(0, 7);
    const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
    const trust = computeTrustBadge(b, calc);
    const retWarn = getRetirementWarning(b.retirementDate || b.retirement);

    const hist = Array.isArray(b.paymentHistory) ? b.paymentHistory : [];
    const totalPaidAllTime = Math.max(
      hist.reduce((s, p) => s + Number(p.amount || 0), 0),
      Number(calc.collectedInMonth || 0)
    );
    const pendingAmt = Math.max(0, Number(calc.totalPayable || 0));
    const cleanMob = String(b.mobile || b.phone || "").replace(/\D/g, "");

    // विभाग १: वैयक्तिक व नोकरी तपशील
    const sec1Rows = [
      kvRow("पूर्ण नाव", b.name),
      kvRow("कर्ज खाते नाव / क्र.", b.loanLabel || b.accountNo),
      kvRow("मोबाईल नंबर", b.mobile || b.phone),
      kvRow("नोकरीचा प्रकार", jobLabel(b.jobType || b.job)),
      kvRow("कंपनी / डिपार्टमेंट", b.companyDept || b.department || b.company),
      kvRow("Retirement Date", fmtDate(b.retirementDate || b.retirement)),
      kvRow("खाते स्थिती", b.accountStatus === "closed" ? "बंद (Closed)" : "सक्रिय (Active)")
    ].filter(Boolean).join("");

    // विभाग २: संपूर्ण कर्ज व व्याज हिशोब
    const sec2Rows = [
      kvRow("मूळ मुद्दल (Original)", fmtInr(b.originalPrincipal || b.principal || 0)),
      kvRow("सध्याचे मुद्दल (Current)", fmtInr(b.principal || 0), "var(--gold)"),
      kvRow("मुद्दल दिल्याची तारीख", fmtDate(b.loanDate || b.startDate)),
      kvRow("हिशोब सुरू महिना", fmtMonthMr(b.startYm)),
      kvRow("मासिक व्याज दर", (b.rate !== undefined && b.rate !== "") ? `${b.rate}%` : ""),
      kvRow("मासिक व्याज (₹)", fmtInr(calc.monthlyInterest || b.fixedInterest || 0), "var(--accent)"),
      kvRow("व्याज पद्धत", interestTypeLabel(b.interestType)),
      kvRow("दरमहा व्याज तारीख", b.interestDay ? `दरमहा ${b.interestDay} तारीख` : ""),
      kvRow("दररोजचा विलंब दंड", Number(b.lateFee || 0) > 0 ? `${fmtInr(b.lateFee)} / दिवस` : ""),
      kvRow("सुरुवातीची मागील बाकी", Number(b.customDue || 0) > 0 ? fmtInr(b.customDue) : ""),
      kvRow(`चालू महिना (${fmtMonthMr(activeYm)}) जमा`, fmtInr(calc.collectedInMonth || 0), "var(--accent-2)"),
      kvRow("आजपर्यंत एकूण जमा व्याज", fmtInr(totalPaidAllTime), "var(--accent-2)"),
      kvRow("सध्याची एकूण बाकी", fmtInr(pendingAmt), pendingAmt > 0 ? "var(--danger)" : "var(--accent-2)")
    ].filter(Boolean).join("");

    // विभाग ३: जामीनदार माहिती + थेट Call / WA
    const guarList = [];
    if (b.guarantor) guarList.push({ role: "मुख्य जामीनदार", text: String(b.guarantor).trim() });
    const extraRaw = b.extraGuarantors || b.guarantors || "";
    if (Array.isArray(extraRaw)) {
      extraRaw.forEach((g, i) => { if (g) guarList.push({ role: `अतिरिक्त जामीनदार ${i + 1}`, text: String(g).trim() }); });
    } else if (String(extraRaw).trim()) {
      String(extraRaw).split(",").forEach((g, i) => {
        if (g.trim()) guarList.push({ role: `अतिरिक्त जामीनदार ${i + 1}`, text: g.trim() });
      });
    }

    const guarHtml = guarList.length
      ? guarList.map((g) => {
          const nums = extractPhoneNumbers(g.text);
          const phoneBtns = nums.length
            ? `<div class="row" style="gap:5px; flex-shrink:0;">
                 <button type="button" class="success sm" data-cd-call="${esc(nums[0])}">📞 Call</button>
                 <button type="button" class="primary sm" data-cd-gwa="${esc(nums[0])}" data-gname="${esc(g.text)}">💬 WA</button>
               </div>`
            : "";
          return `
            <div class="cd-guar-row">
              <div>
                <div class="cd-kv-lbl">${esc(g.role)}</div>
                <div class="cd-kv-val">${esc(g.text)}</div>
              </div>
              ${phoneBtns}
            </div>
          `;
        }).join("")
      : `<div class="muted" style="font-size:0.8rem;">जामीनदार माहिती नोंदवलेली नाही.</div>`;

    // विभाग ४: वायदा तारखा व टीप
    const promises = [
      b.promise1 || (Array.isArray(b.promises) ? b.promises[0] : ""),
      b.promise2 || (Array.isArray(b.promises) ? b.promises[1] : ""),
      b.promise3 || (Array.isArray(b.promises) ? b.promises[2] : "")
    ].map((p, idx) => p ? kvRow(`वायदा तारीख ${idx + 1}`, fmtDate(p), "var(--warn)") : "").filter(Boolean).join("");

    const noteText = String(b.note || b.notes || b.remark || "").trim();

    // विभाग ५: Auto-Catch (CSV Import किंवा इतर कोणतीही अतिरिक्त फील्ड्स गहाळ न होण्यासाठी)
    const KNOWN_KEYS = new Set([
      "id", "uid", "name", "loanLabel", "accountNo", "mobile", "phone", "jobType", "job",
      "companyDept", "department", "company", "retirementDate", "retirement", "accountStatus",
      "principal", "originalPrincipal", "loanDate", "startDate", "startYm", "rate", "fixedInterest",
      "interestType", "interestDay", "lateFee", "customDue", "guarantor", "extraGuarantors", "guarantors",
      "promise1", "promise2", "promise3", "promises", "note", "notes", "remark",
      "isDeleted", "deletedAt", "createdAt", "updatedAt", "paymentHistory", "principalHistory",
      "monthlyPayments", "monthlyRecords", "documents", "versions", "order", "sortOrder"
    ]);

    const extraCatchRows = Object.keys(b)
      .filter((k) => !KNOWN_KEYS.has(k))
      .map((k) => {
        const v = b[k];
        if (v === null || v === undefined || typeof v === "object") return "";
        const s = String(v).trim();
        if (!s || s === "false" || s === "0") return "";
        return kvRow(k, s);
      })
      .filter(Boolean)
      .join("");

    const modal = ensureDetailsModal();
    const body = document.getElementById("proCustomerDetailsBody");
    if (body) {
      body.innerHTML = `
        <div class="cd-header-top">
          <div style="min-width:0;">
            <h3 class="cd-cust-title">📋 ${esc(b.name || "ग्राहक तपशील")}</h3>
            <div class="muted" style="font-size:0.74rem; margin-top:2px;">संपूर्ण खातेवही प्रोफाईल • ${esc(fmtMonthMr(activeYm))}</div>
          </div>
          <span class="cd-trust-badge ${trust.cls}">${esc(trust.text)}</span>
        </div>

        ${retWarn ? `<div class="cd-ret-alert">${esc(retWarn.text)}</div>` : ""}

        <!-- 1-Tap Action Strip -->
        <div class="cd-action-strip">
          ${cleanMob.length >= 10 ? `<button type="button" class="success" id="cdActCall">📞 Call</button>` : ""}
          ${cleanMob.length >= 10 ? `<button type="button" class="primary" id="cdActWa">💬 WhatsApp</button>` : ""}
          <button type="button" class="primary" id="cdActInvoice">🧾 पावती (QR)</button>
          <button type="button" class="primary" id="cdActPassbook">📖 Passbook</button>
          <button type="button" class="primary" id="cdActDocs">📎 Docs</button>
          <button type="button" class="warn" id="cdActEdit">✏️ Edit</button>
        </div>

        <div class="cd-sec-card">
          <div class="cd-sec-title">👤 १. वैयक्तिक व नोकरी तपशील</div>
          <div class="cd-kv-grid">${sec1Rows}</div>
        </div>

        <div class="cd-sec-card">
          <div class="cd-sec-title">💰 २. संपूर्ण कर्ज व व्याज हिशोब</div>
          <div class="cd-kv-grid">${sec2Rows}</div>
        </div>

        <div class="cd-sec-card">
          <div class="cd-sec-title">🤝 ३. जामीनदार माहिती</div>
          ${guarHtml}
        </div>

        <div class="cd-sec-card">
          <div class="cd-sec-title">📅 ४. वायदा तारखा व खात्याची टीप</div>
          ${promises ? `<div class="cd-kv-grid" style="margin-bottom:${noteText ? "8px" : "0"};">${promises}</div>` : ""}
          ${noteText ? `<div class="cd-kv-item"><span class="cd-kv-lbl">टीप (Note)</span><span class="cd-kv-val" style="white-space:pre-wrap;">${esc(noteText)}</span></div>` : ""}
          ${!promises && !noteText ? `<div class="muted" style="font-size:0.8rem;">कोणतीही वायदा तारीख किंवा टीप नाही.</div>` : ""}
        </div>

        ${extraCatchRows ? `
          <div class="cd-sec-card">
            <div class="cd-sec-title">📦 ५. इतर सेव्ह माहिती (Auto-Catch)</div>
            <div class="cd-kv-grid">${extraCatchRows}</div>
          </div>
        ` : ""}

        <!-- १-क्लिक Summary Export -->
        <div class="cd-summary-foot">
          <button type="button" class="primary" id="cdPrintSummaryBtn">🖨️ PDF / प्रिंट Summary</button>
          <button type="button" class="success" id="cdWaSummaryBtn">📤 WhatsApp Summary</button>
        </div>
      `;

      // Action Strip इव्हेंट्स
      document.getElementById("cdActCall")?.addEventListener("click", () => {
        window.location.href = `tel:${cleanMob}`;
      });
      document.getElementById("cdActWa")?.addEventListener("click", () => {
        const target = cleanMob.length === 10 ? "91" + cleanMob : cleanMob;
        const msg = `नमस्कार *${b.name}*,\nआपले ${fmtMonthMr(activeYm)} चे मासिक व्याज ₹${Number(calc.monthlyInterest || 0).toLocaleString("en-IN")} व एकूण बाकी *₹${pendingAmt.toLocaleString("en-IN")}* आहे.`;
        window.open(`https://wa.me/${target}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
      });

      const stepFromDetails = (fn) => {
        if (window.VyajNavStack) window.VyajNavStack.navigateFrom("proCustomerDetailsModal", fn);
        else { modal.classList.add("hidden"); fn(); }
      };

      document.getElementById("cdActInvoice")?.addEventListener("click", () => {
        stepFromDetails(() => { if (typeof window.openInvoiceReceipt === "function") window.openInvoiceReceipt(b.id); });
      });
      document.getElementById("cdActPassbook")?.addEventListener("click", () => {
        stepFromDetails(() => triggerCardAction(b.id, ["passbook", "पासबुक", "लेजर"]));
      });
      document.getElementById("cdActDocs")?.addEventListener("click", () => {
        stepFromDetails(() => triggerCardAction(b.id, ["doc", "डॉक्युमेंट", "कागदपत्र", "📎"]));
      });
      document.getElementById("cdActEdit")?.addEventListener("click", () => {
        stepFromDetails(() => triggerCardAction(b.id, ["edit", "एडिट", "बदला", "✏️"]));
      });

      // जामीनदार Call / WA
      body.querySelectorAll("[data-cd-call]").forEach((btn) => {
        btn.addEventListener("click", () => { window.location.href = `tel:${btn.getAttribute("data-cd-call")}`; });
      });
      body.querySelectorAll("[data-cd-gwa]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const num = btn.getAttribute("data-cd-gwa");
          const msg = `नमस्कार,\nग्राहक *${b.name}* (मुद्दल: ₹${Number(b.principal || 0).toLocaleString("en-IN")}, बाकी व्याज: ₹${pendingAmt.toLocaleString("en-IN")}) यांच्या खात्यासंदर्भात आपणाशी संपर्क साधत आहोत.`;
          window.open(`https://wa.me/91${num}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
        });
      });

      // १-क्लिक PDF / Print Summary
      document.getElementById("cdPrintSummaryBtn")?.addEventListener("click", () => {
        const printArea = document.getElementById("printArea");
        if (!printArea) return;
        const biz = document.getElementById("profBizName")?.value?.trim() || localStorage.getItem("vyaj_biz_name") || "व्याज हिशोब वही";
        printArea.innerHTML = `
          <div style="font-family:system-ui,sans-serif; max-width:680px; margin:0 auto;">
            <h2 style="margin:0 0 4px;">${esc(biz)} — ग्राहक संपूर्ण तपशील</h2>
            <div style="font-size:12px; color:#555; margin-bottom:12px;">महिना: ${esc(fmtMonthMr(activeYm))} • स्थिती: ${esc(trust.text)}</div>
            <table>
              <tr><th>ग्राहकाचे नाव</th><td>${esc(b.name || "-")}</td><th>मोबाईल</th><td>${esc(b.mobile || "-")}</td></tr>
              <tr><th>नोकरी / विभाग</th><td>${esc(jobLabel(b.jobType) || "-")} ${esc(b.companyDept || "")}</td><th>रिटायरमेंट तारीख</th><td>${esc(fmtDate(b.retirementDate) || "-")}</td></tr>
              <tr><th>मूळ मुद्दल</th><td>₹${Number(b.originalPrincipal || b.principal || 0).toLocaleString("en-IN")}</td><th>सध्याचे मुद्दल</th><td>₹${Number(b.principal || 0).toLocaleString("en-IN")}</td></tr>
              <tr><th>व्याज दर / पद्धत</th><td>${esc(b.rate || "-")}% (${esc(interestTypeLabel(b.interestType))})</td><th>मासिक व्याज</th><td>₹${Number(calc.monthlyInterest || 0).toLocaleString("en-IN")}</td></tr>
              <tr><th>एकूण जमा व्याज</th><td>₹${totalPaidAllTime.toLocaleString("en-IN")}</td><th>सध्याची एकूण बाकी</th><td><strong>₹${pendingAmt.toLocaleString("en-IN")}</strong></td></tr>
              <tr><th>जामीनदार</th><td colspan="3">${esc([b.guarantor, b.extraGuarantors].filter(Boolean).join(", ") || "-")}</td></tr>
              <tr><th>वायदा तारखा</th><td colspan="3">${esc([fmtDate(b.promise1), fmtDate(b.promise2), fmtDate(b.promise3)].filter(Boolean).join(" | ") || "-")}</td></tr>
              <tr><th>टीप (Note)</th><td colspan="3">${esc(noteText || "-")}</td></tr>
            </table>
          </div>
        `;
        window.print();
      });

      // १-क्लिक WhatsApp Summary
      document.getElementById("cdWaSummaryBtn")?.addEventListener("click", () => {
        const biz = document.getElementById("profBizName")?.value?.trim() || localStorage.getItem("vyaj_biz_name") || "व्याज हिशोब वही";
        const lines = [
          `*${biz}* — ग्राहक प्रोफाईल Summary`,
          `👤 नाव: *${b.name}*`,
          b.mobile ? `📞 मोबाईल: ${b.mobile}` : "",
          (b.jobType || b.companyDept) ? `💼 नोकरी: ${[jobLabel(b.jobType), b.companyDept].filter(Boolean).join(" - ")}` : "",
          b.retirementDate ? `📅 रिटायरमेंट: ${fmtDate(b.retirementDate)}` : "",
          `-------------------------`,
          `💰 सध्याचे मुद्दल: ₹${Number(b.principal || 0).toLocaleString("en-IN")}`,
          `📊 मासिक व्याज: ₹${Number(calc.monthlyInterest || 0).toLocaleString("en-IN")} (${b.rate || 0}%)`,
          `💚 एकूण जमा व्याज: ₹${totalPaidAllTime.toLocaleString("en-IN")}`,
          `🔴 सध्याची एकूण बाकी: *₹${pendingAmt.toLocaleString("en-IN")}*`,
          b.guarantor ? `🤝 जामीनदार: ${[b.guarantor, b.extraGuarantors].filter(Boolean).join(", ")}` : "",
          (b.promise1 || b.promise2 || b.promise3) ? `⏰ वायदा: ${[fmtDate(b.promise1), fmtDate(b.promise2), fmtDate(b.promise3)].filter(Boolean).join(", ")}` : "",
          noteText ? `📝 टीप: ${noteText}` : ""
        ].filter(Boolean).join("\n");
        window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, "_blank", "noopener,noreferrer");
      });
    }

    modal.classList.remove("hidden");
    return true;
  }

  // प्रत्येक ग्राहक कार्डवर छोटे स्मार्ट टॅग्स आणि '📋 All Details' बटण जोडा
  function enhanceCardsWithDetails() {
    if (!window.HishobBridge) return;
    const listEl = document.getElementById("borrowersList");
    if (!listEl) return;

    listEl.querySelectorAll(".borrower-item").forEach((card) => {
      const b = findBorrowerForCard(card);
      if (!b) return;
      if (!card.getAttribute("data-pro-bid")) card.setAttribute("data-pro-bid", b.id);

      // १. कार्डवर १ सुटसुटीत ओळीत स्मार्ट टॅग्स जोडा
      if (!card.querySelector("[data-pro-smart-tags]")) {
        const tags = [];
        if (b.mobile) tags.push(`<span class="cd-tag">📱 ${esc(b.mobile)}</span>`);
        if (b.jobType || b.companyDept) {
          const jt = b.jobType === "govt" ? "Govt" : b.jobType === "private" ? "Pvt" : (b.jobType || "");
          tags.push(`<span class="cd-tag">💼 ${esc([jt, b.companyDept].filter(Boolean).join(" • "))}</span>`);
        }
        if (b.guarantor) tags.push(`<span class="cd-tag">🤝 ${esc(b.guarantor)}</span>`);
        const nextPromise = b.promise1 || b.promise2 || b.promise3;
        if (nextPromise) tags.push(`<span class="cd-tag">📅 वायदा: ${esc(fmtDate(nextPromise))}</span>`);
        const rw = getRetirementWarning(b.retirementDate);
        if (rw) tags.push(`<span class="cd-tag cd-tag-warn">⚠️ रिटायरमेंट: ${esc(fmtDate(b.retirementDate))}</span>`);

        if (tags.length) {
          const tagWrap = document.createElement("div");
          tagWrap.className = "cd-smart-tags";
          tagWrap.setAttribute("data-pro-smart-tags", "1");
          tagWrap.innerHTML = tags.join("");

          const firstMeta = card.querySelector(".meta-box");
          if (firstMeta) firstMeta.insertAdjacentElement("beforebegin", tagWrap);
          else card.appendChild(tagWrap);
        }
      }

      // २. '📋 All Details' बटण जोडा (सिंगल-लाईन अ‍ॅक्शन स्ट्रिपमध्ये)
      if (!card.querySelector("[data-pro-details-btn]")) {
        const strip = card.querySelector(".pro-action-strip") || card.querySelector(".row:last-of-type");
        if (strip) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "primary sm";
          btn.setAttribute("data-pro-details-btn", b.id);
          btn.textContent = "📋 All Details";
          btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            openProCustomerDetails(b.id);
          });
          strip.appendChild(btn);
        }
      }
    });
  }

  // जुन्या कार्डवरील कोणत्याही 'All Details' / 'संपूर्ण माहिती' बटनावर क्लिक झाल्यासही आपले १००% पूर्ण प्रोफाईल उघडा
  function interceptLegacyAllDetailsClicks() {
    document.addEventListener("click", (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest("button") : null;
      if (!btn || btn.hasAttribute("data-pro-details-btn")) return;
      const card = btn.closest(".borrower-item");
      if (!card) return;
      const txt = (btn.textContent || "").trim().toLowerCase();
      if (txt.includes("all detail") || txt.includes("संपूर्ण माहिती") || txt === "details" || txt === "तपशील") {
        const b = findBorrowerForCard(card);
        if (b) {
          ev.preventDefault();
          ev.stopPropagation();
          ev.stopImmediatePropagation();
          openProCustomerDetails(b.id);
        }
      }
    }, true);
  }

  window.openProCustomerDetails = openProCustomerDetails;

  function initCustomerDetails() {
    injectCustomerDetailsCss();
    interceptLegacyAllDetailsClicks();

    const listEl = document.getElementById("borrowersList");
    if (listEl) {
      const obs = new MutationObserver(() => {
        clearTimeout(cardEnhanceTimer);
        cardEnhanceTimer = setTimeout(enhanceCardsWithDetails, 80);
      });
      obs.observe(listEl, { childList: true });
    }
    setTimeout(enhanceCardsWithDetails, 1200);
    setTimeout(enhanceCardsWithDetails, 2600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCustomerDetails);
  } else {
    initCustomerDetails();
  }
})();
