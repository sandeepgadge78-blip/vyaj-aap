// व्याज हिशोब वही - Master Business A4 Portrait PDF (VyajKernel Powered • ० काळे पट्टे • ० कोरी पेजेस) (js/pro/pdf-pro.js - V15.0)
(function () {
  function generateMasterMonthlyPdf() {
    if (!window.VyajKernel || typeof window.VyajKernel.getMonthReport !== "function") {
      alert("केंद्रीय इंजिन लोड होत आहे, कृपया २ सेकंदांनी पुन्हा प्रयत्न करा.");
      return;
    }

    const K = window.VyajKernel;
    const report = K.getMonthReport();
    const s = report.summary;
    const ud = report.udhaari;

    const bizName = (document.getElementById("profBizName")?.value || document.getElementById("tBrandTitle")?.textContent || "व्याज हिशोब वही").trim();
    const ownerName = (document.getElementById("profOwnerName")?.value || "").trim();
    const ownerMob = (document.getElementById("profMobile")?.value || "").trim();
    const ownerLine = [ownerName, ownerMob].filter(Boolean).join(" • ");
    const todayStr = K.fmtDateShort(new Date().toISOString().slice(0, 10));

    const mainRowsHtml = report.rows.map((r, i) => {
      const extraPrinParts = [];
      if (r.extraPrincipalAdded > 0) extraPrinParts.push(`+${K.fmtInrPlain(r.extraPrincipalAdded)}`);
      if (r.extraPrincipalReduced > 0) extraPrinParts.push(`-${K.fmtInrPlain(r.extraPrincipalReduced)}`);
      const extraPrinTxt = extraPrinParts.length ? extraPrinParts.join(" / ") : "-";

      const statusAndExtra = r.extraPaid > 0
        ? `<strong>${K.esc(r.statusLabel)}</strong><br/><span style="font-size:7.6px;">${K.esc(r.extraNote)}</span>`
        : `<strong>${K.esc(r.statusLabel)}</strong>`;

      return `
        <tr>
          <td style="text-align:center;">${i + 1}</td>
          <td>
            <strong>${K.esc(r.name)}</strong>${r.isNew ? `<span class="pw-tag">नवीन</span>` : ""}
            ${r.mobile && r.mobile !== "-" ? `<span class="pw-mob">${K.esc(r.mobile)}</span>` : ""}
          </td>
          <td class="pw-num">${K.fmtInrPlain(r.principal)}</td>
          <td class="pw-num">${K.esc(extraPrinTxt)}</td>
          <td class="pw-num">${K.fmtInrPlain(r.monthlyInterest)}</td>
          <td class="pw-num">${K.fmtInrPlain(r.collected)}</td>
          <td style="font-size:7.8px;">${K.esc(r.pastBreakdownText)}</td>
          <td class="pw-num"><strong>${K.fmtInrPlain(r.totalPending)}</strong></td>
          <td style="font-size:8px;">${statusAndExtra}</td>
        </tr>
      `;
    }).join("");

    const udRowsHtml = ud.rows.length
      ? ud.rows.map((u, i) => {
          const stText = u.isFull
            ? `जमा (${K.fmtYmShort(u.givenYm)} → ${K.fmtYmShort(u.retYm || report.activeYm)})`
            : (u.givenYm < report.activeYm ? `बाकी (मागील: ${K.fmtYmShort(u.givenYm)})` : "बाकी");
          return `
            <tr>
              <td style="text-align:center;">${i + 1}</td>
              <td>
                <strong>${K.esc(u.name || "")}</strong>
                ${K.cleanMob(u.mobile) ? `<span class="pw-mob">${K.esc(K.cleanMob(u.mobile))}</span>` : ""}
                ${u.note ? `<span class="pw-mob">${K.esc(u.note)}</span>` : ""}
              </td>
              <td>${K.esc(K.fmtDateShort(u.givenDate))}</td>
              <td>${K.esc(K.fmtDateShort(u.promiseDate))}</td>
              <td class="pw-num">${K.fmtInrPlain(u.amt)}</td>
              <td class="pw-num">${K.fmtInrPlain(u.paidAmt)}</td>
              <td class="pw-num"><strong>${K.fmtInrPlain(u.remAmt)}</strong></td>
              <td style="font-size:8px;">${K.esc(stText)}</td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="8" style="text-align:center; padding:6px;">या महिन्यात कोणतीही उधारी नोंद नाही.</td></tr>`;

    const html = `
      <div class="pw-head">
        <div>
          <h2 class="pw-title">${K.esc(bizName)} — मासिक व्याज अहवाल (${K.esc(K.fmtYmMr(report.activeYm))})</h2>
          ${ownerLine ? `<div class="pw-sub">${K.esc(ownerLine)}</div>` : ""}
        </div>
        <div class="pw-sub">दिनांक: ${K.esc(todayStr)} • एकूण खाती: ${report.rows.length}</div>
      </div>

      <div class="pw-kpi">
        <span>एकूण मुद्दल: ${K.fmtInrPlain(s.totalPrincipal)}</span>
        <span>नवीन खाती: ${s.newCount}</span>
        <span>अति. मुद्दल दिले: ${K.fmtInrPlain(s.extraPrincipalAddedSum)}${s.extraPrincipalReducedSum > 0 ? ` | परत: ${K.fmtInrPlain(s.extraPrincipalReducedSum)}` : ""}</span>
        <span>अपेक्षित व्याज: ${K.fmtInrPlain(s.expectedInterest)}</span>
        <span>जमा: ${K.fmtInrPlain(s.collectedInterest)}</span>
        <span>एकूण थकबाकी: ${K.fmtInrPlain(s.totalPendingSum)}</span>
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
            <th>स्थिती / एक्स्ट्रा शेरा</th>
          </tr>
        </thead>
        <tbody>${mainRowsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="2">एकूण बेरीज (फक्त व्याज खाती)</td>
            <td class="pw-num">${K.fmtInrPlain(s.totalPrincipal)}</td>
            <td class="pw-num">+${K.fmtInrPlain(s.extraPrincipalAddedSum)}${s.extraPrincipalReducedSum > 0 ? ` / -${K.fmtInrPlain(s.extraPrincipalReducedSum)}` : ""}</td>
            <td class="pw-num">${K.fmtInrPlain(s.expectedInterest)}</td>
            <td class="pw-num">${K.fmtInrPlain(s.collectedInterest)}</td>
            <td></td>
            <td class="pw-num">${K.fmtInrPlain(s.totalPendingSum)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <div class="pw-sec-title">स्वतंत्र उधारी अहवाल (${K.esc(K.fmtYmMr(report.activeYm))}) — व्याजाच्या हिशोबापेक्षा १००% वेगळे</div>
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
            <td class="pw-num">${K.fmtInrPlain(ud.totAmt)}</td>
            <td class="pw-num">${K.fmtInrPlain(ud.totPaid)}</td>
            <td class="pw-num">${K.fmtInrPlain(ud.totRem)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    `;

    K.printPureWhiteA4(html);
  }

  function bindMasterPdfButtons() {
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
