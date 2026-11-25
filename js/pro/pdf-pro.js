// व्याज हिशोब वही - Master PDF Pro (नवीन टॅग, अति. मुद्दल, एक्स्ट्रा शेरा, मागील ३ महिने + जुनी बाकी, तळाशी स्वतंत्र उधारी) (js/pro/pdf-pro.js - V14.44)
(function () {
  const MONTHS_MR = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];
  const MONTHS_SHORT = ["जाने", "फेब्रु", "मार्च", "एप्रि", "मे", "जून", "जुलै", "ऑग", "सप्टें", "ऑक्टो", "नोव्हें", "डिसें"];

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function fmtNum(val) {
    return Number(val || 0).toLocaleString("en-IN");
  }

  function fmtInr(val) {
    return "₹" + fmtNum(val);
  }

  function fmtYmMr(ym) {
    if (!ym || !String(ym).includes("-")) return String(ym || "");
    const [y, m] = String(ym).split("-");
    return `${MONTHS_MR[parseInt(m, 10) - 1] || m} ${y}`;
  }

  function fmtYmShort(ym) {
    if (!ym || !String(ym).includes("-")) return String(ym || "");
    const [y, m] = String(ym).split("-");
    return `${MONTHS_SHORT[parseInt(m, 10) - 1] || m} ${String(y).slice(-2)}`;
  }

  function fmtDateShort(iso) {
    if (!iso) return "-";
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
  }

  function getPrevYm(ym) {
    if (!ym || !String(ym).includes("-")) return "";
    let [y, m] = String(ym).split("-").map((x) => parseInt(x, 10));
    m -= 1;
    if (m <= 0) { m = 12; y -= 1; }
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  function getActiveYm() {
    return document.getElementById("activeYm")?.value || new Date().toISOString().slice(0, 7);
  }

  function cleanMob(raw) {
    const d = String(raw || "").replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("91")) return d.slice(2);
    if (d.length === 11 && d.startsWith("0")) return d.slice(1);
    return d.slice(-10);
  }

  // निवडलेल्या महिन्यात नवीन खाते जोडले गेले का ते तपासा
  function isNewInMonth(b, activeYm) {
    const loanYm = String(b.loanDate || "").slice(0, 7);
    const startYm = String(b.startYm || "").slice(0, 7);
    if (loanYm) return loanYm === activeYm;
    return startYm === activeYm;
  }

  // निवडलेल्या महिन्यातील अतिरिक्त मुद्दल (+) किंवा परत मुद्दल (-) काढा
  function getPrincipalEventsInMonth(b, activeYm) {
    const lists = [];
    if (Array.isArray(b.principalHistory)) lists.push(...b.principalHistory);
    if (Array.isArray(b.principalLogs)) lists.push(...b.principalLogs);
    if (Array.isArray(b.principalTransactions)) lists.push(...b.principalTransactions);

    const seen = new Set();
    let added = 0;
    let reduced = 0;
    const items = [];

    lists.forEach((ev) => {
      if (!ev) return;
      const evYm = String(ev.ym || ev.month || ev.date || ev.ts || "").slice(0, 7);
      if (evYm !== activeYm) return;

      const typeStr = String(ev.type || ev.action || "").toLowerCase();
      const noteStr = String(ev.note || ev.reason || "").toLowerCase();
      // सुरुवातीचे मूळ मुद्दल अतिरिक्त मुद्दलात पुन्हा मोजू नका
      if (typeStr === "initial" || typeStr === "opening" || noteStr.includes("मूळ मुद्दल") || noteStr.includes("initial")) return;

      const rawAmt = Number(ev.delta !== undefined ? ev.delta : (ev.amount || ev.change || 0));
      if (!rawAmt) return;

      const sig = `${ev.date || evYm}|${rawAmt}|${typeStr}|${ev.note || ""}`;
      if (seen.has(sig)) return;
      seen.add(sig);

      const isReduce =
        rawAmt < 0 ||
        typeStr.includes("reduce") ||
        typeStr.includes("sub") ||
        typeStr.includes("return") ||
        typeStr.includes("deduct") ||
        typeStr.includes("minus") ||
        typeStr.includes("paid");

      const absAmt = Math.abs(rawAmt);
      if (isReduce) {
        reduced += absAmt;
        items.push({ kind: "reduce", amount: absAmt, date: ev.date || "", note: ev.note || ev.reason || "" });
      } else {
        added += absAmt;
        items.push({ kind: "add", amount: absAmt, date: ev.date || "", note: ev.note || ev.reason || "" });
      }
    });

    return { added, reduced, items };
  }

  // एक्स्ट्रा जमा रक्कम मागील बाकीतून वजा झाली की पुढील महिन्यात अ‍ॅडव्हान्स गेली ते मोजा
  function getExtraPaymentNote(b, calc, activeYm) {
    const monthlyInt = Number(calc.monthlyInterest || 0);
    const collected = Number(calc.collectedInMonth || 0);
    const extraAmt = Math.max(0, collected - monthlyInt);
    if (extraAmt <= 0) return { extraAmt: 0, text: "-" };

    let prevPending = 0;
    const prevYm = getPrevYm(activeYm);
    const startYm = String(b.startYm || "").slice(0, 7);
    if (prevYm && (!startYm || prevYm >= startYm) && window.HishobBridge && typeof window.HishobBridge.computeLedgerUpToMonth === "function") {
      try {
        const prevCalc = window.HishobBridge.computeLedgerUpToMonth(b, prevYm);
        prevPending = Math.max(0, Number(prevCalc.totalPayable || 0));
      } catch (_) {}
    }

    if (prevPending > 0) {
      const cutPast = Math.min(extraAmt, prevPending);
      const toAdv = Math.max(0, extraAmt - cutPast);
      if (cutPast > 0 && toAdv > 0) {
        return { extraAmt, text: `+${fmtInr(cutPast)} (मागील बाकीत वजा), +${fmtInr(toAdv)} (पुढील अ‍ॅडव्हान्स)` };
      }
      return { extraAmt, text: `+${fmtInr(cutPast)} (मागील बाकीतून वजा)` };
    }
    return { extraAmt, text: `+${fmtInr(extraAmt)} (पुढील महिन्यात अ‍ॅडव्हान्स)` };
  }

  // मागील बाकी विभागणी: शेवटचे ३ महिने नावासह + त्याआधीची बाकी वेगळी
  function formatPastDueBreakdown(calc) {
    const pastTotal = Math.max(0, Number(calc.pastDue || 0));
    if (pastTotal <= 0) return "-";

    const months = (Array.isArray(calc.pastPendingMonths) ? calc.pastPendingMonths : [])
      .filter((pm) => Number(pm.remaining || 0) > 0)
      .sort((a, b) => String(a.ym || "").localeCompare(String(b.ym || "")));

    if (!months.length) {
      return `मागील बाकी: ${fmtInr(pastTotal)}`;
    }

    const last3 = months.slice(-3);
    const olderMonths = months.slice(0, -3);
    const itemizedSum = months.reduce((s, pm) => s + Number(pm.remaining || 0), 0);
    const unitemized = Math.max(0, pastTotal - itemizedSum);
    const olderSum = olderMonths.reduce((s, pm) => s + Number(pm.remaining || 0), 0) + unitemized;

    const parts = last3.map((pm) => `${fmtYmShort(pm.ym)}: ${fmtInr(pm.remaining)}`);
    if (olderSum > 0) {
      parts.push(`त्याआधीची बाकी: ${fmtInr(olderSum)}`);
    }
    return parts.join(" | ");
  }

  // निवडलेल्या महिन्यातील स्वतंत्र उधारी यादी (रोलओव्हर + परतफेड)
  function getUdhaariForPdf(activeYm) {
    const rawList = typeof window.getProUdhaariList === "function" ? (window.getProUdhaariList() || []) : [];
    const rows = [];
    let totAmt = 0, totPaid = 0, totRem = 0;

    rawList.forEach((u) => {
      if (!u || u.isDeleted) return;
      const givenYm = u.givenYm || String(u.givenDate || "").slice(0, 7) || activeYm;
      if (givenYm > activeYm) return;

      const amt = Number(u.amount || 0);
      const paidAmt = Number(u.paidAmount || 0);
      const remAmt = Math.max(0, amt - paidAmt);
      const isFull = remAmt <= 0 || u.status === "paid";
      const retYm = u.returnedYm || "";

      if (isFull && retYm && retYm < activeYm) return;

      totAmt += amt;
      totPaid += paidAmt;
      totRem += remAmt;
      rows.push({ ...u, givenYm, amt, paidAmt, remAmt, isFull, retYm });
    });

    rows.sort((a, b) => Number(a.isFull) - Number(b.isFull));
    return { rows, totAmt, totPaid, totRem };
  }

  function injectMasterPdfPrintCss() {
    if (document.getElementById("vyajMasterPdfCss")) return;
    const st = document.createElement("style");
    st.id = "vyajMasterPdfCss";
    st.textContent = `
      @media print {
        @page { size: A4 landscape; margin: 8mm; }
        #printArea {
          font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif !important;
          color: #111 !important;
          background: #fff !important;
          padding: 0 !important;
        }
        #printArea .mpdf-head { border-bottom: 2px solid #111; padding-bottom: 5px; margin-bottom: 7px; display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; }
        #printArea .mpdf-title { font-size: 15px; font-weight: 900; margin: 0; }
        #printArea .mpdf-sub { font-size: 10px; color: #333; margin-top: 2px; }
        #printArea .mpdf-kpi {
          display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 10.5px; font-weight: 700;
          padding: 5px 8px; margin-bottom: 7px; border: 1px solid #333; background: #f3f4f6 !important;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        #printArea table.mpdf-tbl { width: 100%; border-collapse: collapse; font-size: 9.5px; margin-bottom: 10px; }
        #printArea table.mpdf-tbl thead { display: table-header-group; }
        #printArea table.mpdf-tbl tr { page-break-inside: avoid; break-inside: avoid; }
        #printArea table.mpdf-tbl th, #printArea table.mpdf-tbl td { border: 1px solid #444; padding: 3px 4px; vertical-align: top; }
        #printArea table.mpdf-tbl th { background: #e5e7eb !important; font-weight: 800; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        #printArea table.mpdf-tbl tfoot td { background: #e5e7eb !important; font-weight: 900; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        #printArea .mpdf-num { text-align: right; white-space: nowrap; }
        #printArea .mpdf-new-tag {
          display: inline-block; padding: 0 4px; margin-left: 3px; border-radius: 3px;
          font-size: 8px; font-weight: 900; border: 1px solid #111; background: #fef08a !important;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        #printArea .mpdf-ud-box {
          margin-top: 12px; padding-top: 8px; border-top: 2px dashed #111;
          page-break-inside: avoid; break-inside: avoid;
        }
        #printArea .mpdf-ud-title { font-size: 12.5px; font-weight: 900; margin: 0 0 5px; }
      }
    `;
    document.head.appendChild(st);
  }

  function generateMasterMonthlyPdf() {
    if (!window.HishobBridge || typeof window.HishobBridge.getBorrowers !== "function") {
      alert("डेटा अजून लोड झालेला नाही. कृपया थोड्या वेळाने प्रयत्न करा.");
      return;
    }

    injectMasterPdfPrintCss();
    const activeYm = getActiveYm();
    const allBorrowers = (window.HishobBridge.getBorrowers() || []).filter((b) => !b.isDeleted);

    const bizName = (document.getElementById("profBizName")?.value || document.getElementById("tBrandTitle")?.textContent || "व्याज हिशोब वही").trim();
    const ownerName = (document.getElementById("profOwnerName")?.value || "").trim();
    const ownerMob = (document.getElementById("profMobile")?.value || "").trim();
    const ownerLine = [ownerName, ownerMob].filter(Boolean).join(" • ");

    let totPrincipal = 0, totExtraAdded = 0, totExtraReduced = 0, totInterest = 0, totCollected = 0, totPending = 0, newCount = 0;

    const activeRows = [];
    allBorrowers.forEach((b) => {
      const pe = getPrincipalEventsInMonth(b, activeYm);
      const isNew = isNewInMonth(b, activeYm);
      // बंद खात्यात जर या महिन्यात कोणतीच हालचाल नसेल तर वगळा
      if (b.accountStatus === "closed" && !isNew && pe.added === 0 && pe.reduced === 0) return;

      const calc = window.HishobBridge.computeLedgerUpToMonth(b, activeYm);
      if (b.accountStatus === "closed" && Number(calc.collectedInMonth || 0) <= 0 && !isNew && pe.added === 0 && pe.reduced === 0) return;

      const principal = Number(b.principal || 0);
      const monthlyInt = Number(calc.monthlyInterest || 0);
      const collected = Number(calc.collectedInMonth || 0);
      const pending = Math.max(0, Number(calc.totalPayable || 0));
      const extraInfo = getExtraPaymentNote(b, calc, activeYm);
      const pastText = formatPastDueBreakdown(calc);

      totPrincipal += principal;
      totExtraAdded += pe.added;
      totExtraReduced += pe.reduced;
      totInterest += monthlyInt;
      totCollected += collected;
      totPending += pending;
      if (isNew) newCount += 1;

      let statusTxt = "बाकी";
      if (b.accountStatus === "closed") statusTxt = "बंद";
      else if (calc.status === "paid" || (monthlyInt > 0 && collected >= monthlyInt)) statusTxt = "पूर्ण जमा";
      else if (collected > 0) statusTxt = "अर्धवट";

      const extraPrinParts = [];
      if (pe.added > 0) extraPrinParts.push(`+${fmtInr(pe.added)}`);
      if (pe.reduced > 0) extraPrinParts.push(`-${fmtInr(pe.reduced)}`);

      activeRows.push({
        name: b.name || "ग्राहक",
        mobile: cleanMob(b.mobile) || "-",
        isNew,
        principal,
        extraPrinTxt: extraPrinParts.length ? extraPrinParts.join(" / ") : "-",
        monthlyInt,
        collected,
        pastText,
        pending,
        extraPayTxt: extraInfo.text,
        statusTxt
      });
    });

    const mainRowsHtml = activeRows.map((r, i) => `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td><strong>${esc(r.name)}</strong>${r.isNew ? `<span class="mpdf-new-tag">नवीन</span>` : ""}</td>
        <td>${esc(r.mobile)}</td>
        <td class="mpdf-num">${fmtInr(r.principal)}</td>
        <td class="mpdf-num">${esc(r.extraPrinTxt)}</td>
        <td class="mpdf-num">${fmtInr(r.monthlyInt)}</td>
        <td class="mpdf-num">${fmtInr(r.collected)}</td>
        <td style="font-size:8.5px;">${esc(r.pastText)}</td>
        <td class="mpdf-num"><strong>${fmtInr(r.pending)}</strong></td>
        <td style="font-size:8.5px;">${esc(r.extraPayTxt)}</td>
        <td style="white-space:nowrap;">${esc(r.statusTxt)}</td>
      </tr>
    `).join("");

    // विभाग २: तळाशी १००% स्वतंत्र उधारी अहवाल
    const ud = getUdhaariForPdf(activeYm);
    const udRowsHtml = ud.rows.length
      ? ud.rows.map((u, i) => {
          const stText = u.isFull
            ? `जमा (घेतले: ${fmtYmShort(u.givenYm)} → परत: ${fmtYmShort(u.retYm || activeYm)})`
            : (u.givenYm < activeYm ? `बाकी (मागील: ${fmtYmShort(u.givenYm)})` : "बाकी");
          return `
            <tr>
              <td style="text-align:center;">${i + 1}</td>
              <td><strong>${esc(u.name || "")}</strong>${u.note ? ` <span style="font-size:8.5px;">(${esc(u.note)})</span>` : ""}</td>
              <td>${esc(cleanMob(u.mobile) || "-")}</td>
              <td>${esc(fmtDateShort(u.givenDate))}</td>
              <td>${esc(fmtDateShort(u.promiseDate))}</td>
              <td class="mpdf-num">${fmtInr(u.amt)}</td>
              <td class="mpdf-num">${fmtInr(u.paidAmt)}</td>
              <td class="mpdf-num"><strong>${fmtInr(u.remAmt)}</strong></td>
              <td style="font-size:8.5px;">${esc(stText)}</td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="9" style="text-align:center; padding:8px;">या महिन्यात कोणतीही उधारी नोंद नाही.</td></tr>`;

    const printArea = document.getElementById("printArea");
    if (!printArea) return;

    const todayStr = fmtDateShort(new Date().toISOString().slice(0, 10));
    printArea.innerHTML = `
      <div class="mpdf-head">
        <div>
          <h2 class="mpdf-title">${esc(bizName)} — मासिक व्याज अहवाल (${esc(fmtYmMr(activeYm))})</h2>
          ${ownerLine ? `<div class="mpdf-sub">${esc(ownerLine)}</div>` : ""}
        </div>
        <div class="mpdf-sub">प्रिंट दिनांक: ${esc(todayStr)} • एकूण खाती: ${activeRows.length}</div>
      </div>

      <div class="mpdf-kpi">
        <span>एकूण मुद्दल: ${fmtInr(totPrincipal)}</span>
        <span>🆕 नवीन खाती: ${newCount}</span>
        <span>➕ अति. मुद्दल दिले: ${fmtInr(totExtraAdded)}${totExtraReduced > 0 ? ` | परत: ${fmtInr(totExtraReduced)}` : ""}</span>
        <span>अपेक्षित व्याज: ${fmtInr(totInterest)}</span>
        <span>या महिन्यात जमा: ${fmtInr(totCollected)}</span>
        <span>एकूण थकबाकी: ${fmtInr(totPending)}</span>
      </div>

      <table class="mpdf-tbl">
        <thead>
          <tr>
            <th style="width:24px;">क्र.</th>
            <th>ग्राहक नाव</th>
            <th>मोबाईल</th>
            <th>मुद्दल</th>
            <th>अति. मुद्दल</th>
            <th>व्याज</th>
            <th>जमा</th>
            <th>मागील बाकी (शेवटचे ३ म. + जुनी)</th>
            <th>एकूण बाकी</th>
            <th>एक्स्ट्रा जमा / शेरा</th>
            <th>स्थिती</th>
          </tr>
        </thead>
        <tbody>${mainRowsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="3">एकूण बेरीज (Grand Total — फक्त व्याज खाती)</td>
            <td class="mpdf-num">${fmtInr(totPrincipal)}</td>
            <td class="mpdf-num">+${fmtInr(totExtraAdded)}${totExtraReduced > 0 ? ` / -${fmtInr(totExtraReduced)}` : ""}</td>
            <td class="mpdf-num">${fmtInr(totInterest)}</td>
            <td class="mpdf-num">${fmtInr(totCollected)}</td>
            <td></td>
            <td class="mpdf-num">${fmtInr(totPending)}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>

      <div class="mpdf-ud-box">
        <div class="mpdf-ud-title">🤝 स्वतंत्र उधारी अहवाल (${esc(fmtYmMr(activeYm))}) — व्याजाच्या हिशोबापेक्षा १००% वेगळे</div>
        <table class="mpdf-tbl">
          <thead>
            <tr>
              <th style="width:24px;">क्र.</th>
              <th>व्यक्तीचे नाव</th>
              <th>मोबाईल</th>
              <th>दिलेली तारीख</th>
              <th>वायदा तारीख</th>
              <th>एकूण उधारी</th>
              <th>परत मिळाली</th>
              <th>येणे बाकी</th>
              <th>स्थिती / महिना तपशील</th>
            </tr>
          </thead>
          <tbody>${udRowsHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="5">एकूण उधारी बेरीज (${ud.rows.length} नोंदी)</td>
              <td class="mpdf-num">${fmtInr(ud.totAmt)}</td>
              <td class="mpdf-num">${fmtInr(ud.totPaid)}</td>
              <td class="mpdf-num">${fmtInr(ud.totRem)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    window.print();
  }

  function bindMasterPdfButtons() {
    // जुन्या PDF हँडलरच्या आधी क्लिक पकडून नवीन Master PDF उघडा (०% लोड)
    document.addEventListener("click", (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest("#heroPdfLink, #printMonthlyPdfBtn") : null;
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      generateMasterMonthlyPdf();
    }, true);
  }

  window.openVyajMasterPdf = generateMasterMonthlyPdf;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindMasterPdfButtons);
  else bindMasterPdfButtons();
})();
