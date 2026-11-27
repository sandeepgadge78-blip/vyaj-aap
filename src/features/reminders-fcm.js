// व्याज Infinity X - Auto 10/4/6 IST Push अलर्ट + FCM Token Sync (व्याज + स्वतंत्र उधारी) (src/features/reminders-fcm.js)

import { FIREBASE_VAPID_KEY, getUserPaths, FieldValue } from "../core/firebase.js";
import { getState, getUnifiedMonthReport } from "../core/store.js";
import { getIstParts, getIstTodayIso, fmtYmMr } from "../core/ledger-v16.js";
import { openWhatsApp, openModal, closeModal, showToast, esc } from "../ui/dom-utils.js";

const SENT_SLOTS_KEY = "vyaj_auto_push_sent_slots_v2";
const SCHEDULE_HOURS = [10, 16, 18]; // सकाळी १०, दुपारी ४, संध्याकाळी ६ (IST)
let intervalId = null;

function getSentSlotsToday() {
  try {
    const obj = JSON.parse(localStorage.getItem(SENT_SLOTS_KEY) || "{}");
    const today = getIstTodayIso();
    return obj && obj.date === today && Array.isArray(obj.slots) ? obj.slots : [];
  } catch (_) {
    return [];
  }
}

function markSlotsSent(slots) {
  const today = getIstTodayIso();
  const merged = Array.from(new Set([...getSentSlotsToday(), ...slots]));
  try { localStorage.setItem(SENT_SLOTS_KEY, JSON.stringify({ date: today, slots: merged })); } catch (_) {}
}

export async function showNativeNotification(title, body, tag = "vyaj-alert") {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  const opts = { body, icon: "./icon.png", badge: "./icon.png", tag, renotify: true, vibrate: [200, 100, 200] };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, opts);
        return true;
      }
    }
  } catch (_) {}
  try { new Notification(title, opts); return true; } catch (_) { return false; }
}

// रूटवरील firebase-messaging-sw.js नोंदवून FCM Token Firestore मध्ये सेव्ह करा (बंद अ‍ॅपमध्येही Push येण्यासाठी)
export async function syncFcmTokenToFirestore(uid) {
  if (!uid || !("Notification" in window) || Notification.permission !== "granted") return null;
  if (typeof window.firebase?.messaging !== "function" || !("serviceWorker" in navigator)) return null;

  try {
    const swReg = await navigator.serviceWorker.register("./firebase-messaging-sw.js");
    const messaging = window.firebase.messaging();
    const token = await messaging.getToken({ vapidKey: FIREBASE_VAPID_KEY, serviceWorkerRegistration: swReg });
    if (token) {
      await getUserPaths(uid).root.set(
        { fcmTokens: FieldValue.arrayUnion(token), fcmUpdatedAt: new Date().toISOString() },
        { merge: true }
      );
      return token;
    }
  } catch (err) {
    console.warn("FCM Token Sync Warning:", err?.message);
  }
  return null;
}

export async function enableFcmAndAutoPush(uid) {
  if (!("Notification" in window)) {
    showToast("तुमच्या ब्राउझरमध्ये Notification सुविधा उपलब्ध नाही.", "err");
    return false;
  }
  if (Notification.permission === "denied") {
    alert("⚠️ Notification ब्लॉक आहे. कृपया Chrome Settings → Site Settings → Notifications → Allow करा.");
    return false;
  }

  let perm = Notification.permission;
  if (perm !== "granted") perm = await Notification.requestPermission();
  if (perm !== "granted") return false;

  await syncFcmTokenToFirestore(uid);
  await showNativeNotification(
    "✅ 10 / 4 / 6 Push अलर्ट चालू!",
    "दररोज सकाळी १०, दुपारी ४ आणि संध्याकाळी ६ वाजता व्याज व उधारी वायद्यांचे अलर्ट येतील.",
    "vyaj-push-ready"
  );
  showToast("✅ Auto 10/4/6 Push अलर्ट व FCM सक्रिय झाले!", "ok");
  setTimeout(runIstSlotCheck, 1000);
  return true;
}

// आजचे व थकीत व्याज व स्वतंत्र उधारी वायदे IST वेळेनुसार तपासा
export async function runIstSlotCheck() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const st = getState();
  if (!st.borrowers.length && !st.udhaari.length) return;

  const ist = getIstParts();
  const sent = getSentSlotsToday();
  const dueSlots = SCHEDULE_HOURS.filter((hr) => ist.hour >= hr && !sent.includes(hr));
  if (!dueSlots.length) return;

  const report = getUnifiedMonthReport();
  const todayIso = ist.isoDate;

  const vyajDue = [];
  report.rows.forEach(({ b, ledger }) => {
    if (ledger.isClosed || ledger.totalPayable <= 0) return;
    const dates = [b.promiseDate1, b.promiseDate2, b.promiseDate3]
      .concat(Array.isArray(b.promiseList) ? b.promiseList.filter((p) => p && p.status !== "done").map((p) => p.date) : [])
      .filter(Boolean);
    if (dates.some((dt) => String(dt).slice(0, 10) <= todayIso)) {
      vyajDue.push({ name: b.name || "ग्राहक", pending: ledger.totalPayable });
    }
  });

  const udDue = report.udhaari.rows.filter((u) => !u.isFull && u.promiseDate && u.promiseDate <= todayIso);

  const latest = dueSlots[dueSlots.length - 1];
  const slotLbl = latest === 10 ? "सकाळ १०:००" : latest === 16 ? "दुपार ४:००" : "संध्याकाळ ६:००";

  if (vyajDue.length > 0) {
    const sum = vyajDue.reduce((acc, x) => acc + x.pending, 0);
    await showNativeNotification(
      `🔔 व्याज वायदा अलर्ट (${slotLbl}) • ${vyajDue.length} खाती`,
      `बाकी ₹${sum.toLocaleString("en-IN")} | ${vyajDue.slice(0, 3).map((x) => x.name).join(", ")}`,
      `vyaj-slot-${latest}`
    );
  }
  if (udDue.length > 0) {
    const uSum = udDue.reduce((acc, u) => acc + Number(u.remP) / 100, 0);
    await showNativeNotification(
      `🤝 उधारी वायदा अलर्ट (${slotLbl}) • ${udDue.length} जण`,
      `बाकी ₹${uSum.toLocaleString("en-IN")} | ${udDue.slice(0, 3).map((u) => u.name).join(", ")}`,
      `udhaari-slot-${latest}`
    );
  }

  markSlotsSent(dueSlots);
}

export function initAutoPushScheduler(getUidFn) {
  if (intervalId) clearInterval(intervalId);
  if ("Notification" in window && Notification.permission === "granted") {
    const uid = getUidFn?.();
    if (uid) syncFcmTokenToFirestore(uid);
    setTimeout(runIstSlotCheck, 2500);
  }
  intervalId = setInterval(() => {
    if ("Notification" in window && Notification.permission === "granted") runIstSlotCheck();
  }, 300000);
}

// रिमाइंडर्स व WhatsApp ब्रॉडकास्ट Modal
export function openRemindersModal() {
  const st = getState();
  const report = getUnifiedMonthReport();
  const todayIso = getIstTodayIso();
  const isOn = "Notification" in window && Notification.permission === "granted";
  const selfWa = st.profile?.selfWaNumber || "";

  const dueToday = report.rows.filter(({ b, ledger }) => {
    if (ledger.isClosed || ledger.totalPayable <= 0) return false;
    const dates = [b.promiseDate1, b.promiseDate2, b.promiseDate3]
      .concat(Array.isArray(b.promiseList) ? b.promiseList.filter((p) => p && p.status !== "done").map((p) => p.date) : [])
      .filter(Boolean);
    return dates.some((d) => String(d).slice(0, 10) === todayIso);
  });

  const pendingList = report.rows.filter(({ ledger }) => !ledger.isClosed && ledger.status !== "paid" && ledger.totalPayable > 0);

  openModal("remindersModal", `
    <div class="modal-head">
      <h3>🔔 रिमाइंडर व 10/4/6 Push अलर्ट</h3>
      <button type="button" class="sm" id="rmCloseBtn">✕ बंद</button>
    </div>

    <div class="meta-box" style="margin-bottom:9px;">
      <div class="row-between" style="margin-bottom:7px;">
        <strong>📲 Background 10 / 4 / 6 Push</strong>
        <span class="badge ${isOn ? "paid" : "partial"}">${isOn ? "✅ चालू" : "बंद"}</span>
      </div>
      <div class="row" style="gap:6px;">
        <button type="button" class="primary sm" style="flex:1;" id="rmEnablePushBtn">${isOn ? "🔄 FCM Token ताजे करा" : "🔔 10/4/6 Push चालू करा"}</button>
        <button type="button" class="sm" id="rmTestPushBtn">🧪 Test</button>
      </div>
    </div>

    <div class="meta-box" style="margin-bottom:9px;">
      <strong style="font-size:0.78rem; display:block; margin-bottom:6px;">💬 स्वतःच्या WhatsApp वर यादी पाठवा</strong>
      <div class="row" style="gap:6px;">
        <button type="button" class="success sm" style="flex:1;" id="rmWaTodayBtn">📅 आजचे वायदे (${dueToday.length})</button>
        <button type="button" class="warn sm" style="flex:1;" id="rmWaPendingBtn">⏳ बाकी यादी (${pendingList.length})</button>
      </div>
      ${!selfWa ? `<div class="muted" style="font-size:0.69rem; margin-top:5px;">टीप: प्रोफाईलमध्ये स्वतःचा WhatsApp नंबर सेव्ह केल्यास थेट तुमच्या चॅटवर उघडेल.</div>` : ""}
    </div>

    <strong style="font-size:0.78rem; display:block; margin-bottom:5px;">📅 आजचे वायदे (${dueToday.length})</strong>
    <div style="max-height:30vh; overflow-y:auto;">
      ${dueToday.map(({ b, ledger }) => `<div class="meta-box row-between" style="margin-bottom:5px;"><strong>${esc(b.name)}</strong><strong class="err">₹${ledger.totalPayable.toLocaleString("en-IN")}</strong></div>`).join("") || `<div class="muted">आज कोणताही बाकी वायदा नाही.</div>`}
    </div>
  `, {
    maxWidth: "500px",
    onAfterRender: (card) => {
      card.querySelector("#rmCloseBtn")?.addEventListener("click", () => closeModal("remindersModal"));
      card.querySelector("#rmEnablePushBtn")?.addEventListener("click", async () => {
        await enableFcmAndAutoPush(st.user?.uid);
        openRemindersModal();
      });
      card.querySelector("#rmTestPushBtn")?.addEventListener("click", async () => {
        if (Notification.permission !== "granted") { await enableFcmAndAutoPush(st.user?.uid); return; }
        await showNativeNotification("🧪 Test अलर्ट — व्याज Infinity X", "तुमचे 10 / 4 / 6 Push अलर्ट १००% बरोबर काम करत आहे!", "vyaj-test");
      });
      card.querySelector("#rmWaTodayBtn")?.addEventListener("click", () => {
        if (!dueToday.length) { showToast("आज कोणताही बाकी वायदा नाही.", "info"); return; }
        const txt = `🔔 *आजचे वायदे (${todayIso})*\n\n${dueToday.map(({ b, ledger }, i) => `${i + 1}. ${b.name} — ₹${ledger.totalPayable.toLocaleString("en-IN")}`).join("\n")}`;
        openWhatsApp(selfWa, txt);
      });
      card.querySelector("#rmWaPendingBtn")?.addEventListener("click", () => {
        if (!pendingList.length) { showToast("सर्व खाती पूर्ण जमा आहेत!", "ok"); return; }
        const txt = `📋 *बाकी / अर्धवट यादी (${fmtYmMr(report.ym)})*\n\n${pendingList.map(({ b, ledger }, i) => `${i + 1}. ${b.name} (${ledger.statusLabel}) — ₹${ledger.totalPayable.toLocaleString("en-IN")}`).join("\n")}`;
        openWhatsApp(selfWa, txt);
      });
    }
  });
}
