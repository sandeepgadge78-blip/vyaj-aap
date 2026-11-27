// व्याज Infinity X - Tools Suite: व्याज अंदाज कॅल्क्युलेटर, BigInt EMI, कॅशबुक व System Guardian Center (src/features/tools-suite.js)

import { getState } from "../core/store.js";
import { isFeatureEnabled } from "../core/feature-flags.js";
import {
  toPaise, divRoundHalfUp, calcInterestPaise, formatPaiseInr, formatRupeesInr,
  getIstTodayIso, getIstParts, getIstCurrentYm, daysInMonth, diffDaysStrict,
  calculateEmiBigInt, fmtYmMr
} from "../core/ledger-v16.js";
import { addCashbookEntry, deleteCashbookEntry } from "../data/cashbook-repo.js";
import { getPendingTxList, syncPendingQueue } from "../data/offline-queue.js";
import { runFinancialErrorScan } from "../guardian/error-detector.js";
import { inspectPortfolioAtDate } from "../guardian/time-machine.js";
import { captureVersionBaseline, compareWithBaseline } from "../guardian/version-compare.js";
import { runAllFinancialSelfTests } from "../guardian/self-tests.js";
import { esc, fmtDateShort, openModal, closeModal, openWhatsApp, showToast } from "../ui/dom-utils.js";

// =========================================================================
// १. स्वतंत्र व्याज अंदाज कॅल्क्युलेटर (Zero DB Writes + Strict Date Check)
// =========================================================================
let previewMode = "dates"; // dates | duration
let lastQuoteMsg = "";

export function openInterestPreviewModal() {
  const renderInner = () => {
    const todayIso = getIstTodayIso();
    const parts = getIstParts();
    const ny = parts.month === 12 ? parts.year + 1 : parts.year;
    const nm = parts.month === 12 ? 1 : parts.month + 1;
    const nd = Math.min(parts.day, daysInMonth(ny, nm));
    const nextMonthIso = `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;

    const html = `
      <div class="modal-head">
        <div>
          <h3>🧮 स्वतंत्र व्याज अंदाज कॅल्क्युलेटर</h3>
          <div class="muted" style="font-size:0.7rem;">खात्यात नोंद न करता अचूक BigInt कोटेशन (IST • लीप वर्ष अचूक)</div>
        </div>
        <button type="button" class="sm" id="ipCloseBtn">✕ बंद</button>
      </div>

      <div class="tab-row-2">
        <button type="button" class="seg-btn ${previewMode === "dates" ? "is-active" : ""}" data-ipm="dates">📅 तारखांनुसार (Daily/Yearly)</button>
        <button type="button" class="seg-btn ${previewMode === "duration" ? "is-active" : ""}" data-ipm="duration">⏱️ महिने / दिवसांनुसार</button>
      </div>

      <div class="grid-2 stack-sm" style="margin-bottom:9px;">
        <div class="field"><label>मुद्दल रक्कम (₹) *</label><input type="number" id="ipPrin" value="50000" min="1" step="0.01" /></div>
        <div class="field"><label>व्याज दर (%) *</label><input type="number" id="ipRate" value="2" min="0" step="0.01" /></div>
        <div class="field">
          <label>दर कालावधी (Rate Period)</label>
          <select id="ipPeriod">
            <option value="monthly" ${previewMode === "duration" ? "selected" : ""}>मासिक (Monthly %)</option>
            <option value="daily">दैनिक (Daily %)</option>
            <option value="yearly" ${previewMode === "dates" ? "selected" : ""}>वार्षिक (Actual/365)</option>
          </select>
        </div>
        <div class="field">
          <label>हिशोब पद्धत</label>
          <select id="ipMethod">
            <option value="simple">सरळ व्याज (Exact BigInt)</option>
            <option value="compound_monthly">मासिक चक्रवाढ अंदाज</option>
          </select>
        </div>
        ${previewMode === "dates" ? `
          <div class="field"><label>सुरू तारीख (YYYY-MM-DD / DD/MM/YYYY)</label><input type="text" id="ipStart" value="${todayIso}" /></div>
          <div class="field"><label>शेवट तारीख (उदा. 30 फेब्रु. नाकारले जाईल)</label><input type="text" id="ipEnd" value="${nextMonthIso}" /></div>
        ` : `
          <div class="field"><label>कालावधी संख्या</label><input type="number" id="ipCount" value="1" min="1" /></div>
          <div class="field"><label>एकक</label><select id="ipUnit"><option value="months">महिने</option><option value="days">दिवस</option></select></div>
        `}
      </div>

      <div class="row" style="gap:6px; margin-bottom:9px;">
        <button type="button" class="primary sm" style="flex:1;" id="ipCalcBtn">⚡ अचूक व्याज काढा</button>
        <button type="button" class="success sm hidden" id="ipWaBtn">💬 WA कोटेशन</button>
      </div>
      <div id="ipOutBox"></div>
    `;

    openModal("interestPreviewModal", html, {
      maxWidth: "560px",
      onAfterRender: (card) => {
        card.querySelector("#ipCloseBtn")?.addEventListener("click", () => closeModal("interestPreviewModal"));
        card.querySelectorAll("[data-ipm]").forEach((btn) => {
          btn.addEventListener("click", () => { previewMode = btn.getAttribute("data-ipm"); renderInner(); });
        });

        const runCalc = () => {
          const out = card.querySelector("#ipOutBox");
          const waBtn = card.querySelector("#ipWaBtn");
          const pPaise = toPaise(card.querySelector("#ipPrin")?.value || 0);
          const rate = Number(card.querySelector("#ipRate")?.value || 0);
          const period = card.querySelector("#ipPeriod")?.value || "monthly";
          const method = card.querySelector("#ipMethod")?.value || "simple";

          if (pPaise <= 0n || !Number.isFinite(rate) || rate < 0) {
            out.innerHTML = `<div class="meta-box err" style="border-color:var(--danger);">⚠️ कृपया वैध मुद्दल व व्याज दर टाका.</div>`;
            waBtn?.classList.add("hidden");
            return;
          }

          let days = 0, months = 1, desc = "";
          if (previewMode === "dates") {
            const diff = diffDaysStrict(card.querySelector("#ipStart")?.value, card.querySelector("#ipEnd")?.value);
            if (!diff.valid) {
              out.innerHTML = `<div class="meta-box err" style="border-color:var(--danger);">🚫 ${esc(diff.error)}</div>`;
              waBtn?.classList.add("hidden");
              return;
            }
            days = diff.days;
            desc = `${diff.start.iso} ते ${diff.end.iso} (${days} दिवस${diff.start.isLeap || diff.end.isLeap ? " • लीप वर्ष" : ""})`;
          } else {
            const cnt = Math.max(1, Math.round(Number(card.querySelector("#ipCount")?.value || 1)));
            const unit = card.querySelector("#ipUnit")?.value || "months";
            if (unit === "days") { days = cnt; months = Math.max(1, Math.round(cnt / 30)); desc = `${days} दिवस`; }
            else { months = cnt; days = cnt * 30; desc = `${months} महिने`; }
          }

          let intPaise = 0n;
          let note = "";
          if (method === "compound_monthly" && period === "monthly") {
            const mCnt = previewMode === "dates" ? Math.max(1, Math.floor(days / 30)) : months;
            let cur = pPaise;
            for (let i = 0; i < mCnt; i++) cur += calcInterestPaise({ principalPaise: cur, rate, ratePeriod: "monthly", months: 1 });
            intPaise = cur - pPaise;
            note = `मासिक चक्रवाढ (${mCnt} महिने)`;
          } else if (period === "monthly") {
            if (previewMode === "dates") {
              const oneM = calcInterestPaise({ principalPaise: pPaise, rate, ratePeriod: "monthly", months: 1 });
              intPaise = divRoundHalfUp(oneM * BigInt(days), 30n);
              note = `मासिक ${rate}% प्रमाणशीर (${days} दिवस)`;
            } else {
              intPaise = calcInterestPaise({ principalPaise: pPaise, rate, ratePeriod: "monthly", months });
              note = `मासिक ${rate}% × ${months} महिने (Half-Up BigInt)`;
            }
          } else if (period === "daily") {
            intPaise = calcInterestPaise({ principalPaise: pPaise, rate, ratePeriod: "daily", days });
            note = `दैनिक ${rate}% × ${days} दिवस`;
          } else {
            intPaise = calcInterestPaise({ principalPaise: pPaise, rate, ratePeriod: "yearly", days });
            note = `वार्षिक ${rate}% (Actual/365) × ${days} दिवस`;
          }

          const totalP = pPaise + intPaise;
          const perDayP = days > 0 ? divRoundHalfUp(intPaise, BigInt(days)) : 0n;
          out.innerHTML = `
            <div class="meta-box" style="border-color:rgba(125,211,252,0.45);">
              <div class="row-between" style="padding:3px 0;"><span class="muted">कालावधी</span><strong>${esc(desc)}</strong></div>
              <div class="row-between" style="padding:3px 0;"><span class="muted">सूत्र</span><span style="font-size:0.74rem;">${esc(note)}</span></div>
              <div class="row-between" style="padding:3px 0;"><span class="muted">मुद्दल</span><strong class="gold-text">${formatPaiseInr(pPaise, true)}</strong></div>
              <div class="row-between" style="padding:3px 0;"><span class="muted">अचूक व्याज</span><strong style="color:var(--accent); font-size:1rem;">${formatPaiseInr(intPaise, true)}</strong></div>
              ${days > 0 ? `<div class="row-between" style="padding:3px 0;"><span class="muted">दररोज सरासरी</span><span>${formatPaiseInr(perDayP, true)} / दिवस</span></div>` : ""}
              <div class="row-between" style="padding-top:6px; margin-top:4px; border-top:1px dashed var(--border);">
                <strong>एकूण परतफेड</strong><strong class="ok" style="font-size:1.06rem;">${formatPaiseInr(totalP, true)}</strong>
              </div>
            </div>
          `;

          const biz = getState().profile?.bizName || "व्याज हिशोब वही";
          lastQuoteMsg = `*व्याज अंदाज कोटेशन — ${biz}*\nमुद्दल: ${formatPaiseInr(pPaise, true)}\nदर: ${rate}% (${period})\nकालावधी: ${desc}\nव्याज: *${formatPaiseInr(intPaise, true)}*\nएकूण परतफेड: *${formatPaiseInr(totalP, true)}*`;
          waBtn?.classList.remove("hidden");
        };

        card.querySelector("#ipCalcBtn")?.addEventListener("click", runCalc);
        card.querySelector("#ipWaBtn")?.addEventListener("click", () => { if (lastQuoteMsg) openWhatsApp("", lastQuoteMsg); });
        runCalc();
      }
    });
  };
  renderInner();
}

// =========================================================================
// २. BigInt EMI कॅल्क्युलेटर (Flat व Reducing + हप्ता वेळापत्रक)
// =========================================================================
export function openEmiModal() {
  const html = `
    <div class="modal-head">
      <div><h3>📊 BigInt EMI कॅल्क्युलेटर</h3><div class="muted" style="font-size:0.7rem;">१ पैसा अचूकता • शेवटच्या हप्त्यापर्यंत अचूक वेळापत्रक</div></div>
      <button type="button" class="sm" id="emiCloseBtn">✕ बंद</button>
    </div>
    <div class="grid-2" style="margin-bottom:9px;">
      <div class="field"><label>मुद्दल (₹)</label><input type="number" id="emiP" value="100000" min="1" /></div>
      <div class="field"><label>मासिक व्याज दर (%)</label><input type="number" id="emiR" value="2" step="0.05" min="0" /></div>
      <div class="field"><label>महिने</label><input type="number" id="emiM" value="12" min="1" max="360" /></div>
      <div class="field"><label>पद्धत</label><select id="emiT"><option value="reducing">Reducing Balance</option><option value="flat">Flat Interest</option></select></div>
    </div>
    <button type="button" class="primary sm" style="width:100%; margin-bottom:10px;" id="emiCalcBtn">⚡ EMI मोजा (BigInt)</button>
    <div id="emiOutBox"></div>
  `;

  openModal("emiModal", html, {
    maxWidth: "580px",
    onAfterRender: (card) => {
      card.querySelector("#emiCloseBtn")?.addEventListener("click", () => closeModal("emiModal"));
      const runEmi = () => {
        const res = calculateEmiBigInt({
          principal: card.querySelector("#emiP").value,
          monthlyRate: card.querySelector("#emiR").value,
          months: card.querySelector("#emiM").value,
          type: card.querySelector("#emiT").value
        });
        const box = card.querySelector("#emiOutBox");
        if (!res.valid) { box.innerHTML = `<div class="meta-box err">⚠️ ${esc(res.error)}</div>`; return; }

        const rows = res.schedule.slice(0, 36).map((r) => `
          <tr>
            <td>${r.month}</td>
            <td>${formatPaiseInr(r.emiPaise, true)}</td>
            <td>${formatPaiseInr(r.principalPaise, true)}</td>
            <td>${formatPaiseInr(r.interestPaise, true)}</td>
            <td>${formatPaiseInr(r.balancePaise, true)}</td>
          </tr>
        `).join("");

        box.innerHTML = `
          <div class="meta-box">
            <div class="grid-2" style="gap:6px; font-size:0.82rem;">
              <div>मासिक हप्ता: <strong class="ok">${formatPaiseInr(res.emiPaise, true)}</strong></div>
              <div>शेवटचा हप्ता: <strong>${formatPaiseInr(res.lastEmiPaise, true)}</strong></div>
              <div>एकूण व्याज: <strong class="gold-text">${formatPaiseInr(res.totalInterestPaise, true)}</strong></div>
              <div>एकूण परतफेड: <strong style="color:var(--accent);">${formatPaiseInr(res.totalPayablePaise, true)}</strong></div>
            </div>
            ${rows ? `
              <details style="margin-top:8px;">
                <summary style="cursor:pointer; font-size:0.75rem; color:var(--accent); font-weight:800;">📋 हप्ता वेळापत्रक पहा (पहिले ${Math.min(36, res.schedule.length)} महिने)</summary>
                <div style="max-height:220px; overflow-y:auto;">
                  <table class="data-tbl"><thead><tr><th>म.</th><th>हप्ता</th><th>मुद्दल</th><th>व्याज</th><th>शिल्लक</th></tr></thead><tbody>${rows}</tbody></table>
                </div>
              </details>
            ` : ""}
          </div>
        `;
      };
      card.querySelector("#emiCalcBtn")?.addEventListener("click", runEmi);
      runEmi();
    }
  });
}

// =========================================================================
// ३. रोजचा कॅशबुक (Cashbook & Daily Cashflow)
// =========================================================================
let cbMonth = getIstCurrentYm();

export function openCashbookModal() {
  const renderInner = () => {
    const st = getState();
    const entries = (st.cashbook || [])
      .filter((e) => (e.ym || String(e.date || "").slice(0, 7)) === cbMonth)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || Number(b.createdAt || 0) - Number(a.createdAt || 0));

    let inP = 0n, outP = 0n;
    entries.forEach((e) => {
      if (e.type === "in") inP += toPaise(e.amount || 0);
      else outP += toPaise(e.amount || 0);
    });
    const netP = inP - outP;

    const listHtml = entries.length
      ? entries.map((e) => `
          <div class="meta-box row-between" style="margin-bottom:6px; border-left:3px solid ${e.type === "in" ? "var(--accent-2)" : "var(--danger)"};">
            <div>
              <strong>${esc(e.note)}</strong>
              <div class="muted" style="font-size:0.7rem;">📅 ${esc(fmtDateShort(e.date))} • ${esc(e.mode || "Cash")}</div>
            </div>
            <div class="row" style="gap:6px;">
              <strong class="${e.type === "in" ? "ok" : "err"}">${e.type === "in" ? "+" : "-"}${formatRupeesInr(e.amount)}</strong>
              <button type="button" class="danger xs" data-cb-del="${esc(e.id)}">🗑️</button>
            </div>
          </div>
        `).join("")
      : `<div class="muted" style="text-align:center; padding:16px;">${esc(fmtYmMr(cbMonth))} मध्ये कोणतीही कॅशबुक नोंद नाही.</div>`;

    openModal("cashbookModal", `
      <div class="modal-head">
        <h3>📒 रोजचा कॅशबुक (Cashbook)</h3>
        <div class="row" style="gap:5px;">
          <button type="button" class="success xs" id="cbCsvBtn">📊 CSV</button>
          <button type="button" class="xs" id="cbCloseBtn">✕</button>
        </div>
      </div>

      <div class="row-between" style="margin-bottom:8px;">
        <span class="muted">महिना निवडा:</span>
        <input type="month" id="cbMonthInp" value="${esc(cbMonth)}" />
      </div>

      <div class="grid-3" style="margin-bottom:9px;">
        <div class="meta-box" style="text-align:center;"><div class="muted" style="font-size:0.66rem;">एकूण जमा (In)</div><strong class="ok">${formatPaiseInr(inP)}</strong></div>
        <div class="meta-box" style="text-align:center;"><div class="muted" style="font-size:0.66rem;">एकूण खर्च (Out)</div><strong class="err">${formatPaiseInr(outP)}</strong></div>
        <div class="meta-box" style="text-align:center;"><div class="muted" style="font-size:0.66rem;">निव्वळ शिल्लक</div><strong style="color:var(--accent);">${formatPaiseInr(netP)}</strong></div>
      </div>

      <div class="meta-box" style="margin-bottom:9px;">
        <div class="grid-2" style="gap:6px;">
          <div class="field"><label>तारीख</label><input type="date" id="cbDate" value="${getIstTodayIso()}" /></div>
          <div class="field"><label>प्रकार</label><select id="cbType"><option value="in">🟢 जमा (In)</option><option value="out">🔴 खर्च (Out)</option></select></div>
          <div class="field"><label>रक्कम (₹) *</label><input type="number" id="cbAmt" min="1" placeholder="रक्कम" /></div>
          <div class="field"><label>माध्यम</label><select id="cbMode"><option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Bank">Bank</option></select></div>
        </div>
        <div class="field" style="margin-top:6px;"><label>तपशील / कारण *</label><input type="text" id="cbNote" placeholder="उदा. ऑफिस खर्च / रोख जमा" /></div>
        <button type="button" class="success sm" style="width:100%; margin-top:7px;" id="cbAddBtn">💾 नोंद सेव्ह करा</button>
      </div>

      <div style="max-height:36vh; overflow-y:auto;">${listHtml}</div>
    `, {
      onAfterRender: (card) => {
        card.querySelector("#cbCloseBtn")?.addEventListener("click", () => closeModal("cashbookModal"));
        card.querySelector("#cbMonthInp")?.addEventListener("change", (ev) => { cbMonth = ev.target.value || getIstCurrentYm(); renderInner(); });
        card.querySelector("#cbAddBtn")?.addEventListener("click", async () => {
          const cur = getState();
          try {
            await addCashbookEntry(cur.user?.uid, {
              date: card.querySelector("#cbDate").value,
              type: card.querySelector("#cbType").value,
              amount: card.querySelector("#cbAmt").value,
              mode: card.querySelector("#cbMode").value,
              note: card.querySelector("#cbNote").value
            });
            showToast("✅ कॅशबुक नोंद सेव्ह झाली!", "ok");
            renderInner();
          } catch (err) {
            showToast("❌ " + err.message, "err");
          }
        });
        card.querySelectorAll("[data-cb-del]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            if (!confirm("ही नोंद डिलीट करायची का?")) return;
            await deleteCashbookEntry(getState().user?.uid, btn.getAttribute("data-cb-del"));
            renderInner();
          });
        });
        card.querySelector("#cbCsvBtn")?.addEventListener("click", () => {
          if (!entries.length) { showToast("या महिन्यात नोंद नाही.", "err"); return; }
          const rows = [["तारीख", "प्रकार", "माध्यम", "तपशील", "जमा", "खर्च"]];
          entries.forEach((e) => rows.push([e.date, e.type === "in" ? "जमा" : "खर्च", e.mode, e.note, e.type === "in" ? e.amount : 0, e.type === "out" ? e.amount : 0]));
          const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
          a.download = `vyaj-cashbook-${cbMonth}.csv`;
          a.click();
        });
      }
    });
  };
  renderInner();
}

// =========================================================================
// ४. System Guardian Control Center (Error Detector, Time Machine, Version Compare, Self-Tests & Offline Queue)
// =========================================================================
let guardianTab = "errors"; // errors | timemachine | compare | tests
let tmSelectedDate = getIstTodayIso(-30);

export function openSystemGuardianModal(onJumpBorrower) {
  const renderInner = async () => {
    const st = getState();
    const uid = st.user?.uid;
    let bodyHtml = "";

    if (guardianTab === "errors") {
      const scan = runFinancialErrorScan();
      const scoreCol = scan.score >= 85 ? "var(--accent-2)" : scan.score >= 60 ? "var(--warn)" : "var(--danger)";
      const listHtml = scan.issues.length
        ? scan.issues.map((it) => {
            const bCol = it.severity === "critical" ? "var(--danger)" : it.severity === "warning" ? "var(--warn)" : "var(--accent)";
            return `
              <div class="meta-box" style="margin-bottom:6px; border-left:3px solid ${bCol};">
                <div class="row-between">
                  <strong style="font-size:0.82rem;">${esc(it.title)}</strong>
                  ${it.borrowerId ? `<button type="button" class="primary xs" data-gd-jump="${esc(it.borrowerId)}">पहा ▸</button>` : ""}
                </div>
                <div class="muted" style="font-size:0.71rem; margin-top:2px;">${esc(it.detail)}</div>
              </div>
            `;
          }).join("")
        : `<div class="meta-box ok" style="text-align:center; padding:18px;">🎉 अप्रतिम! एकही आर्थिक त्रुटी किंवा Ledger Mismatch आढळला नाही.</div>`;

      bodyHtml = `
        <div class="meta-box row-between" style="margin-bottom:9px;">
          <div>
            <div class="muted" style="font-size:0.7rem;">System Health Score (${esc(fmtYmMr(scan.ym))})</div>
            <div style="font-size:1.35rem; font-weight:900; color:${scoreCol};">${scan.score} / 100</div>
          </div>
          <div style="text-align:right; font-size:0.72rem;">
            <div class="err">Critical: ${scan.criticalCount}</div>
            <div class="warn-text">Warning: ${scan.warningCount}</div>
            <div class="muted">Info: ${scan.infoCount}</div>
          </div>
        </div>
        <div style="max-height:46vh; overflow-y:auto;">${listHtml}</div>
      `;
    } else if (guardianTab === "timemachine") {
      const enabled = isFeatureEnabled("timeMachine");
      if (!enabled) {
        bodyHtml = `<div class="meta-box" style="text-align:center; padding:18px;">⏳ <strong>Financial Time Machine</strong> वापरण्यासाठी डॅशबोर्डवर वरून <strong>Ultra Mode</strong> निवडा.</div>`;
      } else {
        const snap = inspectPortfolioAtDate(tmSelectedDate);
        bodyHtml = `
          <div class="row-between meta-box" style="margin-bottom:9px;">
            <span class="muted">कोणत्या जुन्या तारखेचा हिशोब पाहायचा?</span>
            <input type="date" id="tmDateInp" value="${esc(tmSelectedDate)}" />
          </div>
          ${!snap.valid ? `<div class="meta-box err">🚫 ${esc(snap.error)}</div>` : `
            <div class="grid-2" style="margin-bottom:8px;">
              <div class="meta-box"><div class="muted" style="font-size:0.68rem;">त्या दिवशी सक्रिय खाती</div><strong class="purple-text">${snap.activeCount}</strong> (बंद: ${snap.closedCount})</div>
              <div class="meta-box"><div class="muted" style="font-size:0.68rem;">त्या दिवशी एकूण मुद्दल</div><strong class="gold-text">${formatRupeesInr(snap.totalPrincipal)}</strong></div>
              <div class="meta-box"><div class="muted" style="font-size:0.68rem;">त्या दिवसापर्यंत जमा व्याज</div><strong class="ok">${formatRupeesInr(snap.totalInterestCollectedTillDate)}</strong></div>
              <div class="meta-box"><div class="muted" style="font-size:0.68rem;">त्या दिवशी स्वतंत्र उधारी बाकी</div><strong class="purple-text">${formatRupeesInr(snap.udhaari.totalRemaining)}</strong></div>
            </div>
            <div style="max-height:36vh; overflow-y:auto;">
              ${snap.accounts.map((a) => `
                <div class="meta-box row-between" style="margin-bottom:5px; font-size:0.76rem;">
                  <div><strong>${esc(a.name)}</strong>${a.wasClosed ? ` <span class="badge">बंद</span>` : ""}</div>
                  <div style="text-align:right;">मुद्दल: <strong class="gold-text">${formatRupeesInr(a.principal)}</strong> • जमा: <span class="ok">${formatRupeesInr(a.interestPaidTillDate)}</span></div>
                </div>
              `).join("") || `<div class="muted" style="text-align:center;">त्या तारखेला कोणतेही खाते नव्हते.</div>`}
            </div>
          `}
        `;
      }
    } else if (guardianTab === "compare") {
      const cmp = compareWithBaseline();
      bodyHtml = `
        <div class="row" style="margin-bottom:9px;">
          <button type="button" class="primary sm" style="flex:1;" id="vcCaptureBtn">📌 आत्ताचा Baseline जतन करा</button>
        </div>
        ${!cmp.hasBaseline ? `<div class="meta-box muted" style="text-align:center; padding:16px;">${esc(cmp.message)}</div>` : `
          <div class="meta-box" style="margin-bottom:8px; border-color:${cmp.allMatched ? "var(--accent-2)" : "var(--warn)"};">
            <strong>${cmp.allMatched ? "✅ सर्व आकडे १००% जुळले!" : "⚠️ खालील आकड्यांत फरक आढळला:"}</strong>
            <div class="muted" style="font-size:0.69rem;">Baseline: ${esc(fmtDateShort(cmp.baselineSavedAt))} (${esc(fmtYmMr(cmp.ym))})</div>
          </div>
          <table class="data-tbl">
            <thead><tr><th>तपशील</th><th>आधी</th><th>आता</th><th>फरक</th></tr></thead>
            <tbody>
              ${cmp.metrics.map((m) => `
                <tr>
                  <td>${esc(m.labelMr)}</td>
                  <td>${m.isMoney ? formatRupeesInr(m.before) : m.before}</td>
                  <td>${m.isMoney ? formatRupeesInr(m.after) : m.after}</td>
                  <td class="${m.matched ? "ok" : "err"}">${m.matched ? "✓ 0" : (m.delta > 0 ? "+" : "") + (m.isMoney ? formatRupeesInr(m.delta) : m.delta)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          ${cmp.changedAccounts.length ? `
            <div style="margin-top:8px; max-height:24vh; overflow-y:auto;">
              ${cmp.changedAccounts.map((c) => `<div class="meta-box" style="margin-bottom:5px; font-size:0.74rem;"><strong>${esc(c.name)}</strong>: ${esc(c.change)}</div>`).join("")}
            </div>
          ` : ""}
        `}
      `;
    } else {
      const tests = runAllFinancialSelfTests();
      const pendingTx = await getPendingTxList(uid);
      bodyHtml = `
        <div class="meta-box row-between" style="margin-bottom:8px; border-color:${tests.allPassed ? "var(--accent-2)" : "var(--danger)"};">
          <div>
            <strong>🧪 BigInt बँकिंग चाचण्या: ${tests.passed} / ${tests.total} पास</strong>
            <div class="muted" style="font-size:0.7rem;">IST दिनांक: ${esc(tests.istDate)} (${esc(tests.istYm)})</div>
          </div>
          <span class="badge ${tests.allPassed ? "paid" : "pending"}">${tests.allPassed ? "ALL PASS" : "CHECK"}</span>
        </div>
        <div style="max-height:24vh; overflow-y:auto; margin-bottom:9px;">
          ${tests.results.map((r) => `<div style="font-size:0.74rem; padding:3px 0; border-bottom:1px dashed var(--border);">${r.ok ? "✅" : "❌"} ${esc(r.name)}</div>`).join("")}
        </div>
        <div class="meta-box">
          <div class="row-between">
            <strong>📴 Offline Encrypted Queue (${pendingTx.length} प्रलंबित)</strong>
            <button type="button" class="success xs" id="gdSyncQueueBtn" ${pendingTx.length ? "" : "disabled style='opacity:0.5;'"}>🔄 आत्ता Sync करा</button>
          </div>
          <div class="muted" style="font-size:0.7rem; margin-top:4px;">
            ${pendingTx.length ? pendingTx.map((t) => `• ${esc(t.action)} (${esc(t.txId)})`).join("<br/>") : "कोणताही ऑफलाइन व्यवहार प्रलंबित नाही."}
          </div>
        </div>
      `;
    }

    openModal("systemGuardianModal", `
      <div class="modal-head">
        <div><h3>🛡️ System Guardian Control Center</h3><div class="muted" style="font-size:0.7rem;">त्रुटी शोध, Time Machine, तुलना व स्वयंचलित चाचण्या</div></div>
        <button type="button" class="sm" id="gdCloseBtn">✕ बंद</button>
      </div>
      <div class="tab-row-2">
        <button type="button" class="seg-btn ${guardianTab === "errors" ? "is-active" : ""}" data-gdtab="errors">🔍 Error Detector</button>
        <button type="button" class="seg-btn ${guardianTab === "timemachine" ? "is-active" : ""}" data-gdtab="timemachine">⏳ Time Machine</button>
        <button type="button" class="seg-btn ${guardianTab === "compare" ? "is-active" : ""}" data-gdtab="compare">⚖️ Version Compare</button>
        <button type="button" class="seg-btn ${guardianTab === "tests" ? "is-active" : ""}" data-gdtab="tests">🧪 Tests & Queue</button>
      </div>
      <div>${bodyHtml}</div>
    `, {
      onAfterRender: (card) => {
        card.querySelector("#gdCloseBtn")?.addEventListener("click", () => closeModal("systemGuardianModal"));
        card.querySelectorAll("[data-gdtab]").forEach((btn) => {
          btn.addEventListener("click", () => { guardianTab = btn.getAttribute("data-gdtab"); renderInner(); });
        });
        card.querySelectorAll("[data-gd-jump]").forEach((btn) => {
          btn.addEventListener("click", () => {
            closeModal("systemGuardianModal");
            onJumpBorrower?.(btn.getAttribute("data-gd-jump"));
          });
        });
        card.querySelector("#tmDateInp")?.addEventListener("change", (ev) => {
          if (ev.target.value) { tmSelectedDate = ev.target.value; renderInner(); }
        });
        card.querySelector("#vcCaptureBtn")?.addEventListener("click", () => {
          captureVersionBaseline("मॅन्युअल Snapshot");
          showToast("📌 Baseline Snapshot सेव्ह झाला!", "ok");
          renderInner();
        });
        card.querySelector("#gdSyncQueueBtn")?.addEventListener("click", async () => {
          if (!uid) return;
          const res = await syncPendingQueue(uid);
          showToast(`🔄 Sync पूर्ण: ${res.synced} यशस्वी, ${res.failed} अयशस्वी`, res.failed ? "err" : "ok");
          renderInner();
        });
      }
    });
  };

  renderInner();
}
