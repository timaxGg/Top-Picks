/* Offline-Speicher nur für die Hülle der Top-Aktien-App. Kurse kommen immer frisch. */
const V="top-v9",SHELL=["./","./index.html","./style.css","./app.js","./manifest.webmanifest","./icon-192.png","./icon-512.png","./icon-maskable.png","./apple-touch-icon.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith("top-")&&x!==V).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(u.origin!==location.origin||!u.href.startsWith(self.registration.scope))return;
 e.respondWith(fetch(e.request,{cache:"no-cache"}).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)))});
