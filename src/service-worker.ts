import { manifest, version } from '@parcel/service-worker';

import { BASE_PATHNAME, EDIT_REGEX } from './path';

const manifestRelative = [
    BASE_PATHNAME,
    ...manifest.map(file => file.replace(/^\//, BASE_PATHNAME)),
]
console.log('service-worker:', { manifestRelative, version });

async function refreshCache() {
    const cache = await caches.open(version);
    await cache.addAll(manifestRelative);
}

async function cleanCache() {
    const keys = await caches.keys();
    await Promise.all(
        keys.map(async key => {
            if (key !== version) {
                console.log('activate: clearing key', key);
                await caches.delete(key);
            } else {
                console.log('activate: keeping key', key);
            }
        })
    );
}

async function onFetch(request: Request): Promise<Response> {
    let url = request.url;
    if (EDIT_REGEX.test(url)) {
        url = BASE_PATHNAME;
    }
    const cacheResponse = await caches.match(url, { ignoreSearch: true });

    console.log('fetch: url', request.url, 'hit', null != cacheResponse);
    if (null != cacheResponse) {
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
addEventListener('periodicsync', e => {
    const event = e as PeriodicSyncEvent;
    console.log('periodicsync:', event.tag);
    event.waitUntil(refreshCache());
});
