// व्याज Infinity X - Master Pure White A4 Portrait PDF व Excel CSV Exporter (src/features/pdf-reports.js)

import { getState } from "../core/store.js";
import {
  fmtYmMr, fmtYmShortMr, formatPaiseInr, formatRupeesInr, getIstTodayIso
} from "../core/ledger-v16.js";
import { esc, cleanMobile, fmtDateShort, printPureWhiteA4, showToast } from "../ui/dom-utils.js";
import { analyzeMonthlyActivity } from "./month-activity.js";

// =========================================================================
// १. Master Business A4 Portrait PDF (० काळे पट्टे • ० कोरी पेजेस • स्वतंत्र उधारी)
// =========================================================================
export function generateMasterMonthlyPdf(forceYm) {
  const { profile } = getState();
  const data = analyzeMonthlyActivity(forceYm);
  const { report, ym, enrichedRows, newAccounts } = data;
  const s = report.summary;
  const ud = report.udhaari;

  const bizName = (profile?.bizName || "व्याज हिशोब वही").trim();
  const ownerLine = [profile?.ownerName, profile?.mobile].filter(Boolean).join(" • ");
  const todayStr = fmtDateShort(getIstTodayIso());

  const mainRowsHtml = enrichedRows.map(({ b, ledger, isNew, extraInfo }, i) => {
    const pe = ledger.principalEvents;
    const epParts = [];
    if (pe.added > 0) epParts.push(`+${formatRupeesInr(pe.added)}`);
    if (pe.reduced > 0) epParts.push(`-${formatRupeesInr(pe.reduced)}`);
    if (pe.compounded > 0) epParts.push(`चक्रवाढ +${formatRupeesInr(pe.compounded)}`);
    const extraPrinTxt = epParts.length ? epParts.join(" / ") : "-";

    const remarks = [`<strong>${esc(ledger.statusLabel)}</strong>`];
    if (extraInfo.extraPaise > 0n && extraInfo.note !== "-") {
      remarks.push(`<span style="font-size:7.4px;">${esc(extraInfo.note)}</span>`);
    }
    if (ledger.walletBalance > 0) {
      remarks.push(`<span style="font-size:7.4px;">वॉलेट: ${formatRupeesInr(ledger.walletBalance)}</span>`);
    }

    const periodTag = ledger.ratePeriod !== "monthly"
      ? `<span class="pw-tag">${ledger.ratePeriod === "daily" ? "दैनिक" : "वार्षिक"}</span>`
      : "";
    const mob = cleanMobile(b.mobile);

    return `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td>
          <strong>${esc(b.name || "ग्राहक")}</strong>${isNew ? `<span class="pw-tag">नवीन</span>` : ""}${periodTag}
          ${mob ? `<span class="pw-mob">${esc(mob)}</span>` : ""}
        </td>
        <td class="pw-num">${formatRupeesInr(ledger.principal)}</td>
        <td class="pw-num" style="font-size:7.6px;">${esc(extraPrinTxt)}</td>
        <td class="pw-num">${formatRupeesInr(ledger.monthlyInterest)}</td>
        <td class="pw-num">${formatRupeesInr(ledger.collectedInMonth)}</td>
        <td style="font-size:7.6px;">${esc(ledger.pastBreakdownText)}</td>
        <td class="pw-num"><strong>${formatRupeesInr(ledger.totalPayable)}</strong></td>
        <td style="font-size:7.8px;">${remarks.join("<br/>")}</td>
      </tr>
    `;
  }).join("");

  const udRowsHtml = ud.rows.length
    ? ud.rows.map((u, i) => {
        const mob = cleanMobile(u.mobile);
        const stText = u.isFull
          ? `जमा (${fmtYmShortMr(u.givenYm)} → ${fmtYmShortMr(u.retYm || ym)})`
          : (u.givenYm < ym ? `बाकी (मागील: ${fmtYmShortMr(u.givenYm)})` : "बाकी");
        return `
          <tr>
            <td style="text-align:center;">${i + 1}</td>
            <td><strong>${esc(u.name || "")}</strong>${mob ? `<span class="pw-mob">${esc(mob)}</span>` : ""}${u.note ? `<span class="pw-mob">${esc(u.note)}</span>` : ""}</td>
            <td>${esc(fmtDateShort(u.givenDate))}</td>
            <td>${esc(fmtDateShort(u.promiseDate))}</td>
            <td class="pw-num">${formatPaiseInr(u.amtP)}</td>
            <td class="pw-num">${formatPaiseInr(u.paidP)}</td>
            <td class="pw-num"><strong>${formatPaiseInr(u.remP)}</strong></td>
            <td style="font-size:7.8px;">${esc(stText)}</td>
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="8" style="text-align:center; padding:6px;">या महिन्यात कोणतीही उधारी नोंद नाही.</td></tr>`;

  printPureWhiteA4(`
    <div class="pw-head">
      <div>
        <h2 class="pw-title">${esc(bizName)} — मासिक व्याज अहवाल (${esc(fmtYmMr(ym))})</h2>
        ${ownerLine ? `<div class="pw-sub">${esc(ownerLine)}</div>` : ""}
      </div>
      <div class="pw-sub">दिनांक (IST): ${esc(todayStr)} • एकूण खाती: ${enrichedRows.length}</div>
    </div>

    <div class="pw-kpi">
      <span>एकूण मुद्दल: ${formatRupeesInr(s.totalPrincipal)}</span>
      <span>नवीन खाती: ${newAccounts.length}</span>
      <span>अति. मुद्दल (रोख): +${formatRupeesInr(s.extraPrincipalAdded)}${s.extraPrincipalReduced > 0 ? ` | परत: -${formatRupeesInr(s.extraPrincipalReduced)}` : ""}</span>
      ${s.compoundedPrincipal > 0 ? `<span>चक्रवाढ मुद्दल (रोख नाही): +${formatRupeesInr(s.compoundedPrincipal)}</span>` : ""}
      <span>अपेक्षित व्याज: ${formatRupeesInr(s.expectedInterest)}</span>
      <span>रोख जमा: ${formatRupeesInr(s.collectedInterest)}</span>
      <span>एकूण थकबाकी: ${formatRupeesInr(s.totalPending)}</span>
      ${s.advanceWalletTotal > 0 ? `<span>अ‍ॅडव्हान्स वॉलेट: ${formatRupeesInr(s.advanceWalletTotal)}</span>` : ""}
    </div>

    <table class="pw-tbl">
      <thead>
        <tr>
          <th style="width:20px; text-align:center;">क्र.</th>
          <th>ग्राहक (मोबाईल)</th>
          <th class="pw-num">मुद्दल</th>
          <th class="pw-num">अति. मुद्दल</th>
          <th class="pw-num">व्याज</th>
          <th class="pw-num">जमा</th>
          <th>मागील बाकी (३ म. + जुनी)</th>
          <th class="pw-num">एकूण बाकी</th>
          <th>स्थिती / शेरा / वॉलेट</th>
        </tr>
      </thead>
      <tbody>${mainRowsHtml}</tbody>
      <tfoot>
        <tr>
          <td colspan="2">एकूण बेरीज (फक्त व्याज खाती)</td>
          <td class="pw-num">${formatRupeesInr(s.totalPrincipal)}</td>
          <td class="pw-num">+${formatRupeesInr(s.extraPrincipalAdded)}${s.extraPrincipalReduced > 0 ? ` / -${formatRupeesInr(s.extraPrincipalReduced)}` : ""}</td>
          <td class="pw-num">${formatRupeesInr(s.expectedInterest)}</td>
          <td class="pw-num">${formatRupeesInr(s.collectedInterest)}</td>
          <td></td>
          <td class="pw-num">${formatRupeesInr(s.totalPending)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>

    <div class="pw-sec-title">स्वतंत्र उधारी अहवाल (${esc(fmtYmMr(ym))}) — व्याजाच्या हिशोबापेक्षा १००% वेगळे</div>
    <table class="pw-tbl">
      <thead>
        <tr>
          <th style="width:20px; text-align:center;">क्र.</th>
          <th>व्यक्ती (मोबाईल)</th>
          <th>दिलेली तारीख</th>
          <th>वायदा</th>
          <th class="pw-num">एकूण उधारी</th>
          <th class="pw-num">परत मिळाली</th>
          <th class="pw-num">येणे बाकी</th>
          <th>स्थिती</th>
        </tr>
      </thead>
      <tbody>${udRowsHtml}</tbody>
      <tfoot>
        <tr>
          <td colspan="4">एकूण उधारी बेरीज (${ud.rows.length} नोंदी)</td>
          <td class="pw-num">${formatRupeesInr(ud.totalGiven)}</td>
          <td class="pw-num">${formatRupeesInr(ud.totalReturned)}</td>
          <td class="pw-num">${formatRupeesInr(ud.totalRemaining)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  `);
}

// =========================================================================
// २. Excel-Ready UTF-8 BOM Monthly CSV Export (व्याज + स्वतंत्र उधारी)
// =========================================================================
function csvCell(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

export function exportMonthlyExcelCsv(forceYm) {
  const data = analyzeMonthlyActivity(forceYm);
  const { report, ym, enrichedRows } = data;
  const ud = report.udhaari;

  const lines = [
    ["क्र.", "ग्राहक नाव", "नवीन", "मोबाईल", "मुद्दल", "दर (%)", "मासिक व्याज", "जमा", "मागील बाकी", "एकूण थकबाकी", "वॉलेट", "स्थिती", "शेरा"].map(csvCell).join(",")
  ];

  enrichedRows.forEach(({ b, ledger, isNew, extraInfo }, i) => {
    lines.push([
      i + 1, b.name || "", isNew ? "होय" : "", cleanMobile(b.mobile),
      ledger.principal, b.rate || 0, ledger.monthlyInterest, ledger.collectedInMonth,
      ledger.pastDue, ledger.totalPayable, ledger.walletBalance, ledger.statusLabel,
      extraInfo.note === "-" ? "" : extraInfo.note
    ].map(csvCell).join(","));
  });

  if (ud.rows.length) {
    lines.push("");
    lines.push(["स्वतंत्र उधारी अहवाल", fmtYmMr(ym)].map(csvCell).join(","));
    lines.push(["क्र.", "व्यक्तीचे नाव", "मोबाईल", "दिलेली तारीख", "वायदा", "एकूण उधारी", "परत मिळाली", "येणे बाकी", "स्थिती"].map(csvCell).join(","));
    ud.rows.forEach((u, i) => {
      lines.push([
        i + 1, u.name || "", cleanMobile(u.mobile), u.givenDate || "", u.promiseDate || "",
        Number(u.amtP) / 100, Number(u.paidP) / 100, Number(u.remP) / 100, u.isFull ? "जमा" : "बाकी"
      ].map(csvCell).join(","));
    });
  }

  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vyaj-hishob-${ym}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`📊 ${fmtYmMr(ym)} ची Excel/CSV फाईल डाउनलोड झाली!`, "ok");
}
