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
