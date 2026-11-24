// व्याज हिशोब वही - Background Push Notification Service Worker (Root - V14.46)
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDYpC1Pdm9jDtmNlT2J6BOPzk88QvBo8ds",
  authDomain: "hishob-4b548.firebaseapp.com",
  projectId: "hishob-4b548",
  storageBucket: "hishob-4b548.firebasestorage.app",
  messagingSenderId: "528801714157",
  appId: "1:528801714157:web:c7e43ad3b05203b87be1e4"
});

const messaging = firebase.messaging();

// अ‍ॅप पूर्ण बंद असताना Push Notification आल्यास रिंग व व्हायब्रेशनसह दाखवा
messaging.onBackgroundMessage((payload) => {
  const title =
    (payload.notification && payload.notification.title) ||
    "🔔 व्याज हिशोब वायदा अलर्ट";
  const options = {
    body:
      (payload.notification && payload.notification.body) ||
      "आजचा वायदा तपासा.",
    icon: "./icon.png",
    badge: "./icon.png",
    vibrate: [300, 150, 300, 150, 400],
    requireInteraction: true
  };
  self.registration.showNotification(title, options);
});

// नोटिफिकेशनवर क्लिक करताच थेट अ‍ॅप उघडा
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("./index.html");
    })
  );
});
