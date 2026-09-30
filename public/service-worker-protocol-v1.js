/* Immutable PTracker update protocol v1. Create v2 instead of modifying this file after production release. */
const RELEASE = self.__PTRACKER_RELEASE__;
const CACHE_PREFIX = 'ptracker-app-';
const STAGING_PREFIX = 'ptracker-staging-';
const CURRENT_CACHE = `${CACHE_PREFIX}${RELEASE.version}`;
const SCOPE_URL = new URL(self.registration.scope);

function scopedUrl(value) {
  const url = new URL(value, SCOPE_URL);
  if (url.origin !== SCOPE_URL.origin || !url.pathname.startsWith(SCOPE_URL.pathname)) throw new Error('Release asset is outside the PTracker scope.');
  return url.href;
}

async function loadManifest(manifestUrl, version) {
  const response = await fetch(scopedUrl(manifestUrl), { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Release manifest returned HTTP ${response.status}.`);
  const manifest = await response.json();
  if (manifest?.application !== 'poker-tracker' || manifest?.version !== version || !Array.isArray(manifest.assets) || !manifest.assets.length) throw new Error('Release manifest is invalid.');
  return manifest.assets.map(scopedUrl);
}

async function prepareRelease(version, manifestUrl) {
  const finalName = `${CACHE_PREFIX}${version}`;
  const stagingName = `${STAGING_PREFIX}${version}`;
  const markerUrl = scopedUrl(`.release-${encodeURIComponent(version)}`);
  const existing = await caches.open(finalName);
  const marker = await existing.match(markerUrl);
  if (marker) {
    try {
      const saved = await marker.json();
      if (saved.version === version && Array.isArray(saved.assets) && (await Promise.all(saved.assets.map((asset) => existing.match(asset)))).every(Boolean)) return;
    } catch { /* An invalid marker is replaced by a fresh download. */ }
  }
  await caches.delete(stagingName);
  const staging = await caches.open(stagingName);
  try {
    const assets = await loadManifest(manifestUrl, version);
    for (const asset of assets) {
      const response = await fetch(asset, { cache: 'reload' });
      if (!response.ok) throw new Error(`Could not download ${new URL(asset).pathname}.`);
      await staging.put(asset, response);
    }
    const stored = await staging.keys();
    if (stored.length !== assets.length) throw new Error('The downloaded release is incomplete.');
    await caches.delete(finalName);
    const target = await caches.open(finalName);
    for (const request of stored) {
      const response = await staging.match(request);
      if (!response) throw new Error('A downloaded release asset is missing.');
      await target.put(request, response);
    }
    await target.put(markerUrl, new Response(JSON.stringify({ version, assets }), { headers: { 'Content-Type': 'application/json' } }));
    await caches.delete(stagingName);
  } catch (error) {
    await Promise.all([caches.delete(stagingName), version === RELEASE.version ? Promise.resolve(false) : caches.delete(finalName)]);
    throw error;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(prepareRelease(RELEASE.version, RELEASE.manifestUrl));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.type === 'PREPARE_UPDATE') {
    event.waitUntil(prepareRelease(message.version, message.manifestUrl)
      .then(() => event.ports[0]?.postMessage({ type: 'PREPARE_COMPLETE', version: message.version }))
      .catch((error) => event.ports[0]?.postMessage({ type: 'PREPARE_FAILED', error: error instanceof Error ? error.message : 'Update preparation failed.' })));
  }
  if (message?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
  if (message?.type === 'UPDATE_CONFIRMED' && message.version === RELEASE.version) {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => (key.startsWith(CACHE_PREFIX) && key !== CURRENT_CACHE) || key.startsWith(STAGING_PREFIX)).map((key) => caches.delete(key)))));
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== SCOPE_URL.origin || !url.pathname.startsWith(SCOPE_URL.pathname)) return;
  if (url.pathname === `${SCOPE_URL.pathname}version.json` || url.pathname === `${SCOPE_URL.pathname}release-manifest.json`) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CURRENT_CACHE).then((cache) => cache.match(`${SCOPE_URL.href}index.html`)).then((cached) => cached || fetch(event.request)));
    return;
  }
  event.respondWith(caches.open(CURRENT_CACHE).then((cache) => cache.match(event.request)).then((cached) => cached || fetch(event.request)));
});
