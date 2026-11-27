// व्याज Infinity X - १००% स्वतंत्र उधारी मॅनेजर (व्याजापेक्षा वेगळे + ऑफलाइन परतफेड + Pure White A4 PDF) (src/features/udhaari.js)

import { getState, getUnifiedMonthReport } from "../core/store.js";
import {
  formatPaiseInr, formatRupeesInr, fmtYmMr, getIstTodayIso, paiseToRupees
} from "../core/ledger-v16.js";
import { addUdhaari, collectUdhaariReturn, deleteUdhaari } from "../data/udhaari-repo.js";
import {
  esc, cleanMobile, fmtDateShort, triggerCall, openWhatsApp,
  openModal, closeModal, printPureWhiteA4, showToast
} from "../ui/dom-utils.js";

let activeTab = "pending"; // pending | due | paid
let showAddForm = false;
let searchQuery = "";

export function openUdhaariModal(initialTab = "pending") {
  activeTab = initialTab;

  const renderInner = () => {
    const st = getState();
    const report = getUnifiedMonthReport();
    const ud = report.udhaari;
    const hide = st.ui.hideAmounts;
    const todayIso = getIstTodayIso(0);

    const pendingItems = ud.rows.filter((u) => !u.isFull).sort((a, b) => String(a.promiseDate || "9999").localeCompare(String(b.promiseDate || "9999")));
    const dueItems = pendingItems.filter((u) => u.promiseDate && u.promiseDate <= todayIso);
    const paidItems = ud.rows.filter((u) => u.isFull);

    const base = activeTab === "pending" ? pendingItems : activeTab === "due" ? dueItems : paidItems;
    const q = searchQuery.trim().toLowerCase();
    const list = base.filter((u) => !q || `${u.name || ""} ${u.mobile || ""} ${u.note || ""}`.toLowerCase().includes(q));

    const cardsHtml = list.length
      ? list.map((u) => {
          const mob = cleanMobile(u.mobile);
          const isDue = !u.isFull && u.promiseDate && u.promiseDate <= todayIso;
          const borderCol = u.isFull ? "var(--accent-2)" : isDue ? "var(--danger)" : "var(--purple)";
          const timeline = u.isFull
            ? `✅ घेतले: ${esc(fmtYmMr(u.givenYm))} → परत: ${esc(fmtYmMr(u.retYm || report.ym))}`
            : `📅 दिले: ${esc(fmtDateShort(u.givenDate))}${u.promiseDate ? ` • ⏰ वायदा: ${esc(fmtDateShort(u.promiseDate))}` : ""}`;

          return `
            <div class="meta-box" style="margin-bottom:7px; border-left:3px solid ${borderCol};">
              <div class="row-between">
                <div style="min-width:0;">
                  <div style="font-weight:800; font-size:0.87rem;">${esc(u.name)} ${u.givenYm < report.ym && !u.isFull ? `<span class="badge partial">मागील महिना</span>` : ""}</div>
                  <div class="muted" style="font-size:0.71rem; margin-top:2px;">${timeline}</div>
                  ${u.paidP > 0n && !u.isFull ? `<div class="ok" style="font-size:0.71rem;">अर्धवट जमा: ${formatPaiseInr(u.paidP)} / ${formatPaiseInr(u.amtP)}</div>` : ""}
                  ${u.note ? `<div class="muted" style="font-size:0.71rem;">📝 ${esc(u.note)}</div>` : ""}
                </div>
                <div style="text-align:right; white-space:nowrap;">
                  <strong style="color:${u.isFull ? "var(--accent-2)" : "var(--purple)"}; font-size:0.94rem;">${hide ? "₹••••" : formatPaiseInr(u.isFull ? u.amtP : u.remP)}</strong>
                  <div class="muted" style="font-size:0.64rem;">${u.isFull ? "परत मिळाले" : "येणे बाकी"}</div>
                </div>
              </div>
              <div class="row" style="margin-top:7px; gap:5px;">
                ${!u.isFull ? `<button type="button" class="success xs" data-ud-pay="${esc(u.id)}">💰 जमा करा</button>` : ""}
                ${mob.length >= 10 ? `<button type="button" class="teal xs" data-ud-call="${esc(mob)}">📞 Call</button>` : ""}
                ${mob.length >= 10 ? `<button type="button" class="primary xs" data-ud-wa="${esc(u.id)}">💬 WA</button>` : ""}
                <button type="button" class="danger xs" data-ud-del="${esc(u.id)}">🗑️</button>
              </div>
            </div>
          `;
        }).join("")
      : `<div class="muted" style="text-align:center; padding:18px;">या विभागात कोणतीही उधारी नोंद नाही.</div>`;

    const html = `
      <div class="modal-head">
        <div>
          <h3 style="color:var(--purple);">🤝 उधारी हिशोब (${esc(fmtYmMr(report.ym))})</h3>
          <div class="muted" style="font-size:0.7rem;">व्याजाच्या हिशोबापेक्षा १००% स्वतंत्र</div>
        </div>
        <div class="row" style="gap:5px;">
          <button type="button" class="success xs" id="udToggleFormBtn">${showAddForm ? "✕ बंद" : "+ नवीन"}</button>
          <button type="button" class="primary xs" id="udPrintBtn">🖨️ PDF</button>
          <button type="button" class="xs" id="udCloseBtn">✕</button>
        </div>
      </div>

      <div class="grid-3" style="margin-bottom:9px;">
        <div class="meta-box" style="text-align:center;"><div class="muted" style="font-size:0.66rem;">एकूण उधारी</div><strong class="gold-text">${formatRupeesInr(ud.totalGiven, hide)}</strong></div>
        <div class="meta-box" style="text-align:center;"><div class="muted" style="font-size:0.66rem;">परत मिळाली</div><strong class="ok">${formatRupeesInr(ud.totalReturned, hide)}</strong></div>
        <div class="meta-box" style="text-align:center;"><div class="muted" style="font-size:0.66rem;">येणे बाकी</div><strong class="purple-text">${formatRupeesInr(ud.totalRemaining, hide)}</strong></div>
      </div>

      ${showAddForm ? `
        <div class="meta-box" style="margin-bottom:9px; border-style:dashed; border-color:var(--purple);">
          <div class="grid-2" style="gap:6px;">
            <div class="field"><label>व्यक्तीचे नाव *</label><input type="text" id="udInName" placeholder="पूर्ण नाव" /></div>
            <div class="field"><label>मोबाईल</label><input type="tel" id="udInMob" placeholder="10 अंकी नंबर" /></div>
            <div class="field"><label>रक्कम (₹) *</label><input type="number" id="udInAmt" min="1" placeholder="5000" /></div>
            <div class="field"><label>दिल्याची तारीख</label><input type="date" id="udInDate" value="${todayIso}" /></div>
            <div class="field"><label>वायदा तारीख</label><input type="date" id="udInProm" /></div>
            <div class="field"><label>टीप</label><input type="text" id="udInNote" placeholder="कारण" /></div>
          </div>
          <button type="button" class="success sm" style="width:100%; margin-top:8px;" id="udSaveBtn">💾 उधारी सेव्ह करा</button>
        </div>
      ` : ""}

      <div class="tab-row-3">
        <button type="button" class="seg-btn ${activeTab === "pending" ? "is-active" : ""}" data-udtab="pending">⏳ बाकी (${pendingItems.length})</button>
        <button type="button" class="seg-btn ${activeTab === "due" ? "is-active" : ""}" data-udtab="due">🔔 वायदे (${dueItems.length})</button>
        <button type="button" class="seg-btn ${activeTab === "paid" ? "is-active" : ""}" data-udtab="paid">✅ जमा (${paidItems.length})</button>
      </div>

      <input type="text" id="udSearchInp" class="search-input" value="${esc(searchQuery)}" placeholder="🔍 उधारी यादीत नाव शोधा..." />
      <div style="max-height:48vh; overflow-y:auto;">${cardsHtml}</div>
    `;

    openModal("udhaariModal", html, {
      onAfterRender: (card) => {
        card.querySelector("#udCloseBtn")?.addEventListener("click", () => closeModal("udhaariModal"));
        card.querySelector("#udToggleFormBtn")?.addEventListener("click", () => { showAddForm = !showAddForm; renderInner(); });
        card.querySelectorAll("[data-udtab]").forEach((btn) => {
          btn.addEventListener("click", () => { activeTab = btn.getAttribute("data-udtab"); renderInner(); });
        });

        const sInp = card.querySelector("#udSearchInp");
        sInp?.addEventListener("input", () => {
          searchQuery = sInp.value;
          const pos = sInp.selectionStart || searchQuery.length;
          renderInner();
          const next = document.getElementById("udSearchInp");
          if (next) { next.focus(); next.setSelectionRange(pos, pos); }
        });

        card.querySelector("#udSaveBtn")?.addEventListener("click", async () => {
          const curSt = getState();
          if (!curSt.user) return;
          try {
            await addUdhaari(curSt.user.uid, {
              name: card.querySelector("#udInName").value,
              mobile: card.querySelector("#udInMob").value,
              amount: card.querySelector("#udInAmt").value,
              givenDate: card.querySelector("#udInDate").value,
              promiseDate: card.querySelector("#udInProm").value,
              note: card.querySelector("#udInNote").value
            }, curSt.user.email);
            showAddForm = false;
            showToast("✅ उधारी नोंद सेव्ह झाली!", "ok");
            setTimeout(renderInner, 220);
          } catch (err) {
            showToast("❌ " + err.message, "err");
          }
        });

        card.querySelectorAll("[data-ud-call]").forEach((b) => b.addEventListener("click", () => triggerCall(b.getAttribute("data-ud-call"))));
        card.querySelectorAll("[data-ud-wa]").forEach((b) => {
          b.addEventListener("click", () => {
            const u = list.find((x) => x.id === b.getAttribute("data-ud-wa"));
            if (!u) return;
            const biz = st.profile?.bizName || "व्याज हिशोब वही";
            const msg = u.isFull
              ? `नमस्कार *${u.name}*,\nतुमची उधारी *${formatPaiseInr(u.amtP)}* पूर्ण परत मिळाली आहे. धन्यवाद!\n— *${biz}*`
              : `नमस्कार *${u.name}*,\nआपणास *${fmtDateShort(u.givenDate)}* रोजी दिलेली उधारी *${formatPaiseInr(u.remP)}* येणे बाकी आहे.${u.promiseDate ? `\nवायदा: *${fmtDateShort(u.promiseDate)}*` : ""}\nकृपया वेळेवर परत करावी. धन्यवाद!\n— *${biz}*`;
            openWhatsApp(u.mobile, msg);
          });
        });

        card.querySelectorAll("[data-ud-pay]").forEach((b) => {
          b.addEventListener("click", async () => {
            const u = list.find((x) => x.id === b.getAttribute("data-ud-pay"));
            const curSt = getState();
            if (!u || !curSt.user) return;
            const remRup = paiseToRupees(u.remP);
            const amt = Number(prompt(`'${u.name}' यांच्या बाकी उधारी (₹${remRup}) मधून किती परत मिळाले?`, String(remRup)) || 0);
            if (amt <= 0) return;
            try {
              const res = await collectUdhaariReturn(curSt.user.uid, u, amt, report.ym, { userEmail: curSt.user.email });
              showToast(res.status === "queued_offline" ? "📴 ऑफलाइन रांगेत जतन!" : `✅ ₹${amt} उधारी परतफेड जमा!`, "ok");
              setTimeout(renderInner, 220);
            } catch (err) {
              showToast("❌ " + err.message, "err");
            }
          });
        });

        card.querySelectorAll("[data-ud-del]").forEach((b) => {
          b.addEventListener("click", async () => {
            const u = list.find((x) => x.id === b.getAttribute("data-ud-del"));
            const curSt = getState();
            if (!u || !curSt.user || !confirm(`'${u.name}' यांची उधारी कायमची डिलीट करायची का?`)) return;
            await deleteUdhaari(curSt.user.uid, u, curSt.user.email);
            showToast("🗑️ उधारी डिलीट झाली.", "ok");
            setTimeout(renderInner, 220);
          });
        });

        card.querySelector("#udPrintBtn")?.addEventListener("click", () => {
          const biz = st.profile?.bizName || "व्याज हिशोब वही";
          const rowsHtml = list.map((u, i) => `
            <tr>
              <td style="text-align:center;">${i + 1}</td>
              <td><strong>${esc(u.name)}</strong>${cleanMobile(u.mobile) ? `<span class="pw-mob">${esc(cleanMobile(u.mobile))}</span>` : ""}</td>
              <td>${esc(fmtDateShort(u.givenDate))}</td>
              <td>${esc(fmtDateShort(u.promiseDate))}</td>
              <td class="pw-num">${formatPaiseInr(u.amtP)}</td>
              <td class="pw-num">${formatPaiseInr(u.paidP)}</td>
              <td class="pw-num"><strong>${formatPaiseInr(u.remP)}</strong></td>
              <td>${u.isFull ? `जमा (${esc(fmtYmMr(u.retYm || report.ym))})` : "बाकी"}</td>
            </tr>
          `).join("") || `<tr><td colspan="8" style="text-align:center;">नोंद नाही</td></tr>`;

          printPureWhiteA4(`
            <div class="pw-head">
              <div><h2 class="pw-title">${esc(biz)} — स्वतंत्र उधारी अहवाल (${esc(fmtYmMr(report.ym))})</h2></div>
              <div class="pw-sub">दिनांक: ${esc(fmtDateShort(todayIso))} • नोंदी: ${list.length}</div>
            </div>
            <div class="pw-kpi">
              <span>एकूण उधारी: ${formatRupeesInr(ud.totalGiven)}</span>
              <span>परत मिळाली: ${formatRupeesInr(ud.totalReturned)}</span>
              <span>येणे बाकी: ${formatRupeesInr(ud.totalRemaining)}</span>
            </div>
            <table class="pw-tbl">
              <thead><tr><th>क्र.</th><th>व्यक्ती</th><th>दिलेली तारीख</th><th>वायदा</th><th class="pw-num">एकूण</th><th class="pw-num">परत</th><th class="pw-num">बाकी</th><th>स्थिती</th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          `);
        });
      }
    });
  };

  renderInner();
}
