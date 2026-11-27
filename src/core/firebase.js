// व्याज Infinity X - केंद्रीय Firebase कनेक्शन व Firestore पाथ मॅप (src/core/firebase.js)
// टीप: विद्यमान hishob-4b548 डेटाबेसशी १००% सुसंगत — एकाही जुन्या रकान्याचा डेटा बदलणार नाही.

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDYpC1Pdm9jDtmNlT2J6BOPzk88QvBo8ds",
  authDomain: "hishob-4b548.firebaseapp.com",
  projectId: "hishob-4b548",
  storageBucket: "hishob-4b548.firebasestorage.app",
  messagingSenderId: "528801714157",
  appId: "1:528801714157:web:c7e43ad3b05203b87be1e4",
  measurementId: "G-RH91B88LZB"
};

export const FIREBASE_VAPID_KEY =
  "BD38I1uOSqyA6lfr11cE3WQkwJGXONEKQi4DiALA0ObadWcmwWGgA1pvm2ZgGwllZ4FvhzD7Dfe9g3pS42npV_M";

if (typeof window.firebase === "undefined") {
  throw new Error("Firebase SDK लोड झालेले नाही. index.html मधील स्क्रिप्ट्स तपासा.");
}

if (!window.firebase.apps.length) {
  window.firebase.initializeApp(FIREBASE_CONFIG);
}

export const firebaseApp = window.firebase.app();
export const auth = window.firebase.auth();
export const db = window.firebase.firestore();
export const FieldValue = window.firebase.firestore.FieldValue;

let persistenceEnabled = false;

// ऑफलाइन मोडसाठी Firestore स्थानिक कॅश सुरक्षितपणे सुरू करा
export async function initOfflinePersistence() {
  if (persistenceEnabled) return true;
  try {
    await db.enablePersistence({ synchronizeTabs: true });
    persistenceEnabled = true;
    return true;
  } catch (err) {
    // एकापेक्षा जास्त टॅब किंवा ब्राउझर मर्यादा असल्यास शांतपणे पुढे जा
    console.warn("Firestore Persistence Note:", err?.code || err?.message);
    return false;
  }
}

export function isPersistenceReady() {
  return persistenceEnabled;
}

// सर्व विद्यमान Firestore Collections चे अचूक पत्ते (जुना डेटा जसाच्या तसा वाचण्यासाठी)
export function getUserPaths(uid) {
  if (!uid) throw new Error("लॉगिन आवश्यक आहे (UID उपलब्ध नाही).");
  const root = db.collection("users").doc(uid);
  return {
    root,
    borrowers: root.collection("borrowers"),
    borrowerDoc: (id) => root.collection("borrowers").doc(id),
    borrowerDocs: (id) => root.collection("borrowers").doc(id).collection("documents"),
    udhaari: root.collection("udhaari"),
    udhaariDoc: (id) => root.collection("udhaari").doc(id),
    auditLogs: root.collection("auditLogs"),
    cloudBackups: root.collection("cloudBackups"),
    monthlyArchives: root.collection("monthlyArchives"),
    latestProBackup: root.collection("proBackups").doc("latest"),
    appSettings: root.collection("meta").doc("appSettings"),
    cashbook: root.collection("meta").doc("cashbook")
  };
}
