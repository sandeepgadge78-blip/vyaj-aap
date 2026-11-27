// व्याज Infinity X - Shared UI Utilities, Zero-Observer Modal/Back Stack, Pure White Print व Marathi Phonetic Search (src/ui/dom-utils.js)

import { getIstParts } from "../core/ledger-v16.js";

const overlayStack = []; // सध्या उघडे असलेले Modals/Drawers चा स्वच्छ क्रम

// =========================================================================
// १. HTML Escaping व Date/Mobile Helpers
// =========================================================================
export function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

export function cleanMobile(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  if (d.length === 11 && d.startsWith("0")) return d.slice(1);
  return d.length >= 10 ? d.slice(-10) : d;
}

export function fmtDateShort(val) {
  if (!val) return "-";
  if (typeof val === "object" && typeof val.toDate === "function") {
    return fmtDateShort(getIstParts(val.toDate()).isoDate);
  }
  const s = String(val).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return s || "-";
}

// =========================================================================
// २. Marathi Phonetic Search (इंग्रजी स्पेलिंगवरून मराठी नाव अचूक शोधणे)
// =========================================================================
function marathiToRomanSkeleton(str) {
  if (!str) return "";
  const map = {
    "अ":"a","आ":"a","इ":"i","ई":"i","उ":"u","ऊ":"u","ए":"e","ऐ":"ai","ओ":"o","औ":"au",
    "क":"k","ख":"kh","ग":"g","घ":"gh","च":"ch","छ":"chh","ज":"j","झ":"jh","ट":"t","ठ":"th",
    "ड":"d","ढ":"dh","ण":"n","त":"t","थ":"th","द":"d","ध":"dh","न":"n","प":"p","फ":"ph",
    "ब":"b","भ":"bh","म":"m","य":"y","र":"r","ल":"l","व":"v","श":"sh","ष":"sh","स":"s",
    "ह":"h","ळ":"l","क्ष":"ksh","ज्ञ":"dny","ा":"a","ि":"i","ी":"i","ु":"u","ू":"u",
    "े":"e","ै":"ai","ो":"o","ौ":"au","ं":"n","्":""
  };
  let out = "";
  for (const ch of String(str).toLowerCase()) out += map[ch] !== undefined ? map[ch] : ch;
  return out.replace(/[aeiou]/g, "");
}

export function matchesSmartSearch(b, query) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return true;
  const hay = [b.name, b.loanLabel, b.mobile, b.companyDept, b.guarantor, b.extraGuarantors, b.note]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");
  if (hay.includes(q)) return true;
  const qSkel = q.replace(/f/g, "ph").replace(/w/g, "v").replace(/[aeiou\s]/g, "");
  const hSkel = marathiToRomanSkeleton(hay).replace(/\s+/g, "");
  return qSkel.length > 0 && hSkel.includes(qSkel);
}

// =========================================================================
// ३. Toast संदेश, Call आणि WhatsApp Helpers
// =========================================================================
export function showToast(msg, type = "info", durationMs = 2600) {
  let host = document.getElementById("vyajToastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "vyajToastHost";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = `vyaj-toast ${type === "err" ? "err" : type === "ok" ? "ok" : ""}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), durationMs);
}

export function triggerCall(mobile) {
  const num = cleanMobile(mobile);
  if (num.length < 10) {
    showToast("या खात्याचा वैध १० अंकी मोबाईल नंबर सेव्ह नाही.", "err");
    return;
  }
  const a = document.createElement("a");
  a.href = `tel:${num}`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 250);
}

export function openWhatsApp(mobile, text) {
  const num = cleanMobile(mobile);
  const target = num.length === 10 ? `91${num}` : num;
  const url = target.length >= 10
    ? `https://wa.me/${target}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

// =========================================================================
// ४. Zero-Observer Single Modal & Step-by-Step Back Stack
// =========================================================================
export function openModal(modalId, htmlContent, { maxWidth = "660px", onAfterRender } = {}) {
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement("div");
    modal.id = modalId;
    modal.className = "modal-backdrop hidden";
    modal.innerHTML = `<div class="modal-card" style="max-width:${maxWidth};"></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (ev) => {
      if (ev.target === modal) closeModal(modalId);
    });
  }

  // आधीचे इतर मोडल लपवून स्टॅकवर नवे उघडा (एका वेळी एकच ओव्हरले)
  overlayStack.forEach((id) => {
    if (id !== modalId) document.getElementById(id)?.classList.add("hidden");
  });

  const card = modal.querySelector(".modal-card");
  if (card && htmlContent !== undefined) {
    card.style.maxWidth = maxWidth;
    card.innerHTML = htmlContent;
  }
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  const idx = overlayStack.indexOf(modalId);
  if (idx !== -1) overlayStack.splice(idx, 1);
  overlayStack.push(modalId);

  try { history.pushState({ vyajModal: modalId, ts: Date.now() }, ""); } catch (_) {}
  if (typeof onAfterRender === "function") onAfterRender(card, modal);
  return modal;
}

export function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add("hidden");
  const idx = overlayStack.indexOf(modalId);
  if (idx !== -1) overlayStack.splice(idx, 1);

  const topId = overlayStack[overlayStack.length - 1];
  if (topId) {
    document.getElementById(topId)?.classList.remove("hidden");
  } else {
    document.body.style.overflow = "";
  }
}

export function closeAllModals() {
  while (overlayStack.length > 0) {
    const id = overlayStack.pop();
    document.getElementById(id)?.classList.add("hidden");
  }
  document.querySelectorAll(".modal-backdrop").forEach((m) => m.classList.add("hidden"));
  document.body.style.overflow = "";
}

// मोबाईलचे Back बटण दाबल्यावर पायरी-पायरीने एक-एक मोडल बंद करा
window.addEventListener("popstate", () => {
  if (overlayStack.length > 0) {
    const topId = overlayStack[overlayStack.length - 1];
    closeModal(topId);
  }
});

// =========================================================================
// ५. Pure White A4 Portrait Print Engine (Dark Mode मध्येही ० काळे पट्टे)
// =========================================================================
export function printPureWhiteA4(htmlContent) {
  let printArea = document.getElementById("printArea");
  if (!printArea) {
    printArea = document.createElement("div");
    printArea.id = "printArea";
    document.body.appendChild(printArea);
  }
  printArea.innerHTML = htmlContent;

  const wasLight = document.body.classList.contains("light-mode");
  document.documentElement.style.colorScheme = "light";
  if (!wasLight) document.body.classList.add("light-mode");

  let restored = false;
  const restoreTheme = () => {
    if (restored) return;
    restored = true;
    document.documentElement.style.colorScheme = "";
    if (!wasLight) document.body.classList.remove("light-mode");
  };

  window.addEventListener("afterprint", restoreTheme, { once: true });
  setTimeout(() => {
    window.print();
    setTimeout(restoreTheme, 1800);
  }, 60);
}

// =========================================================================
// ६. SVG Progress Ring Helper (Dual-Ring Split Bar साठी)
// =========================================================================
const RING_CIRC = 113.1;
export function buildRingSvg(pct, colorHex) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(pct || 0))));
  const offset = (RING_CIRC * (1 - clamped / 100)).toFixed(1);
  return `
    <div class="ring-box">
      <svg viewBox="0 0 44 44" class="ring-svg">
        <circle cx="22" cy="22" r="18" class="ring-track"></circle>
        <circle cx="22" cy="22" r="18" class="ring-fill"
          style="stroke:${colorHex}; stroke-dasharray:${RING_CIRC}; stroke-dashoffset:${offset};"></circle>
      </svg>
      <span class="ring-txt" style="color:${colorHex};">${clamped}%</span>
    </div>
  `;
}
