importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDFbByzvf5YXqzggmZc3IKeJOsd3KryBpQ",
  authDomain: "ai-studio-applet-webapp-ed52d.firebaseapp.com",
  projectId: "ai-studio-applet-webapp-ed52d",
  storageBucket: "ai-studio-applet-webapp-ed52d.firebasestorage.app",
  messagingSenderId: "774174668964",
  appId: "1:774174668964:web:b4a2c6b9f3acd71dbd8e31"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title || 'Novo Alerta';
  const notificationOptions = {
    body: payload.notification?.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.data?.tag || 'point-reminder',
    data: payload.data,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        let client = windowClients[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

self.addEventListener("install", (event) => {
  console.log("Service Worker instalado");
});

self.addEventListener("fetch", (event) => {
  // Ignora requisições de APIs externas para evitar erros de rede no Firebase
  if (event.request.url.includes("googleapis.com")) {
    return;
  }
  event.respondWith(fetch(event.request));
});

