/* SIGA EDUCA — Service Worker exclusivo do Portal do Aluno.
   Não intercepta o painel administrativo nem a Gestão de Lotação. */
var CACHE = "siga-portal-aluno-v1";
var PRECACHE = [
  "/portal-aluno.html",
  "/css/portal-aluno.css",
  "/js/portal-aluno-app.js",
  "/portal/icon-192.png",
  "/portal-aluno.webmanifest"
];

function isPortalPath(pathname) {
  return (
    pathname === "/portal-aluno.html" ||
    pathname.indexOf("/app/app") === 0 ||
    pathname.indexOf("/app/topo") === 0 ||
    pathname.indexOf("/app/detalhe") === 0 ||
    pathname.indexOf("/css/portal-aluno") === 0 ||
    pathname.indexOf("/js/portal-") === 0 ||
    pathname.indexOf("/portal-aluno") === 0
  );
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE).catch(function () { return null; });
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
          return caches.delete(k);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (!isPortalPath(url.pathname)) return;

  event.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(req, copy);
          });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (cached) {
          return cached || caches.match("/portal-aluno.html");
        });
      })
  );
});
