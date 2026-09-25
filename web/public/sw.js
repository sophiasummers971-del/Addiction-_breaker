'use strict';
const CACHE='addiction-breaker-shell-v7';
const ASSETS=['/','/index.html','/styles.css','/ambience.js','/thin-ice.webp','/app.js','/sync.js','/journeys.js','/start/','/dashboard/','/check-in/','/pause/','/journal/','/mirror/','/support/','/account/','/journeys/','/journeys/gambling/','/journeys/alcohol/','/journeys/smoking/','/journeys/drugs/','/journeys/behaviours/','/analysis-worker.js','/journal.js','/store.js','/icon.svg','/manifest.webmanifest','/sample.csv'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('addiction-breaker-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!ASSETS.includes(url.pathname))return;
 event.respondWith(fetch(event.request).catch(()=>caches.match(url.pathname)));
});
