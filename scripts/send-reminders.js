// GitHub Actions साठी ऑटोमॅटिक वायदा रिमाइंडर स्क्रिप्ट (scripts/send-reminders.js)
const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!serviceAccount.project_id) {
  console.error("FIREBASE_SERVICE_ACCOUNT Secret सापडले नाही.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// भारतीय वेळेनुसार (IST) आजची तारीख मिळवा
function getIstDate(offsetDays = 0) {
  const now = new Date();
  const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  istTime.setUTCDate(istTime.getUTCDate() + offsetDays);
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
    const tokens = Array.isArray(userData.fcmTokens) ? userData.fcmTokens : [];
    if (!tokens.length) continue;

    const borrowersSnap = await userDoc.ref.collection("borrowers").get();
    const todayNames = [];
    const tomorrowNames = [];

    borrowersSnap.forEach((bDoc) => {
      const b = bDoc.data() || {};
      if (b.isDeleted || b.accountStatus === "closed") return;
      const dates = [b.promiseDate1, b.promiseDate2, b.promiseDate3].filter(Boolean);
      if (dates.includes(todayStr)) todayNames.push(b.name || "ग्राहक");
      if (dates.includes(tomorrowStr)) tomorrowNames.push(b.name || "ग्राहक");
    });

    if (todayNames.length > 0) {
      const title = `🔔 आजचे वायदे (${todayNames.length}) — व्याज हिशोब वही`;
      const body = `आज वायदा असलेले ग्राहक: ${todayNames.slice(0, 4).join(", ")}${todayNames.length > 4 ? " व इतर" : ""}`;
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        android: { priority: "high", notification: { sound: "default" } }
      });
    }

    // संध्याकाळी ६ वाजता उद्याच्या वायद्यांची झलक पाठवा
    if (istHour >= 17 && tomorrowNames.length > 0) {
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title: `🌙 उद्याचे वायदे (${tomorrowNames.length})`,
          body: `उद्या वायदा: ${tomorrowNames.slice(0, 4).join(", ")}`
        },
        android: { priority: "high", notification: { sound: "default" } }
      });
    }
  }
  console.log("Reminder check completed for:", todayStr);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

