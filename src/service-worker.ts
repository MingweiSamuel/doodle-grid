import { manifest, version } from '@parcel/service-worker';
console.log('service-worker:', { manifest, version, href: location.href });

async function onInstall() {
    const manifestRelative = manifest.map(file => file.replace(/^\//, ''));
    console.log('install: caching manifest', manifestRelative);
    const cache = await caches.open(version);
    await cache.addAll(manifestRelative);
}
addEventListener('install', e => e.waitUntil(onInstall()));

async function onActivate() {
    console.log('activate: clearing old cache keys');
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
addEventListener('activate', e => e.waitUntil(onActivate()));

async function onFetch(event: FetchEvent): Promise<Response> {
    const cacheResponse = await caches.match(event.request, { ignoreSearch: true });
    console.log('fetch: url', event.request.url, 'hit', null != cacheResponse);
    if (cacheResponse !== undefined) {
        return cacheResponse;
    } else {
        return await fetch(event.request);
    }
}
self.addEventListener('fetch', (e: FetchEvent) => e.respondWith(onFetch(e)));
