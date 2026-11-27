// GitHub Actions साठी अपग्रेडेड ऑटोमॅटिक वायदा रिमाइंडर स्क्रिप्ट (व्याज promiseList + स्वतंत्र उधारी • 10 AM / 4 PM / 6 PM IST) (scripts/send-reminders.js)
const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!serviceAccount.project_id) {
  console.error("FIREBASE_SERVICE_ACCOUNT Secret सापडले नाही.");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// भारतीय प्रमाणवेळेनुसार (IST) तारीख काढा
function getIstDate(offsetDays = 0) {
  const istTime = new Date(Date.now() + 5.5 * 60 * 60 * 1000 + offsetDays * 86400000);
  const y = istTime.getUTCFullYear();
  const m = String(istTime.getUTCMonth() + 1).padStart(2, "0");
  const d = String(istTime.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function run() {
  const todayStr = getIstDate(0);
  const tomorrowStr = getIstDate(1);
  const istHour = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCHours();

  const usersSnap = await db.collection("users").get();

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data() || {};
    const tokens = Array.isArray(userData.fcmTokens) ? Array.from(new Set(userData.fcmTokens.filter(Boolean))) : [];
    if (!tokens.length) continue;

    // १. व्याज खात्यांचे आजचे व उद्याचे वायदे (promiseDate1-3 + नवीन promiseList)
    const borrowersSnap = await userDoc.ref.collection("borrowers").get();
    const todayNames = [];
    const tomorrowNames = [];

    borrowersSnap.forEach((bDoc) => {
      const b = bDoc.data() || {};
      if (b.isDeleted || b.accountStatus === "closed") return;

      const dates = [b.promiseDate1, b.promiseDate2, b.promiseDate3]
        .concat(Array.isArray(b.promiseList) ? b.promiseList.filter((p) => p && p.status !== "done").map((p) => p.date) : [])
        .map((d) => String(d || "").slice(0, 10))
        .filter(Boolean);

      if (dates.includes(todayStr)) todayNames.push(b.name || "ग्राहक");
      if (dates.includes(tomorrowStr)) tomorrowNames.push(b.name || "ग्राहक");
    });

    if (todayNames.length > 0) {
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: `🔔 आजचे व्याज वायदे (${todayNames.length}) — व्याज हिशोब वही`,
          body: `आज वायदा: ${todayNames.slice(0, 4).join(", ")}${todayNames.length > 4 ? " व इतर" : ""}`
        },
        android: { priority: "high", notification: { sound: "default" } }
      });
    }

    // २. १००% स्वतंत्र उधारी वायदे (व्याजापेक्षा वेगळे)
    const udhaariSnap = await userDoc.ref.collection("udhaari").get();
    const udTodayNames = [];

    udhaariSnap.forEach((uDoc) => {
      const u = uDoc.data() || {};
      if (u.isDeleted || u.status === "paid") return;
      const rem = Math.max(0, Number(u.amount || 0) - Number(u.paidAmount || 0));
      if (rem <= 0) return;
      const pDate = String(u.promiseDate || "").slice(0, 10);
      if (pDate && pDate <= todayStr) {
        udTodayNames.push(`${u.name || "व्यक्ती"} (₹${rem.toLocaleString("en-IN")})`);
      }
    });

    if (udTodayNames.length > 0) {
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: `🤝 उधारी वायदा अलर्ट (${udTodayNames.length})`,
          body: `येणे बाकी: ${udTodayNames.slice(0, 3).join(", ")}${udTodayNames.length > 3 ? " व इतर" : ""}`
        },
        android: { priority: "high", notification: { sound: "default" } }
      });
    }

    // संध्याकाळी ६ वाजता उद्याच्या वायद्यांची झलक पाठवा
    if (istHour >= 17 && tomorrowNames.length > 0) {
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: `📅 उद्याचे व्याज वायदे (${tomorrowNames.length})`,
          body: `उद्या वायदा: ${tomorrowNames.slice(0, 4).join(", ")}`
        },
        android: { priority: "high", notification: { sound: "default" } }
      });
    }
  }

  console.log("Reminder check completed for IST date:", todayStr);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
