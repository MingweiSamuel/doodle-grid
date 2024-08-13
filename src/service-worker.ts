import { manifest, version } from '@parcel/service-worker';

const manifestRelative = [
    '.',
    ...manifest.map(file => file.replace(/^\//, '')),
]
console.log('service-worker:', { manifestRelative, version });

async function refreshCache() {
    const cache = await caches.open(version);
    await cache.addAll(manifestRelative);
}

async function cleanCache() {
    const keys = await caches.keys();
    await Promise.all(
        keys.map(key => {
            if (key !== version) {
                console.log('activate: clearing key', key);
                caches.delete(key);
            } else {
                console.log('activate: keeping key', key);
            }
        })
    );
}

async function onFetch(request: Request): Promise<Response> {
    const cacheResponse = await caches.match(request, { ignoreSearch: true });
    console.log('fetch: url', request.url, 'hit', null != cacheResponse);
    if (cacheResponse !== undefined) {
        return cacheResponse;
    } else {
        return await fetch(request);
    }
}

addEventListener('install', e => {
    console.log('install');
    e.waitUntil(refreshCache());
});

addEventListener('activate', e => {
    console.log('activate');
    e.waitUntil(cleanCache());
});

addEventListener('fetch', (e: FetchEvent) => e.respondWith(onFetch(e.request)));

/// https://developer.mozilla.org/en-US/docs/Web/API/PeriodicSyncEvent
type PeriodicSyncEvent = { tag: string } & ExtendableEvent;
addEventListener('periodicsync', (e: PeriodicSyncEvent) => {
    console.log('periodicsync:', e.tag);
    e.waitUntil(refreshCache());
});
