import { setCacheNameDetails } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { appConfig } from '../app.config.js';
import { storageScope } from './lib/storage.js';

// Scope path is part of cache ownership. Never remove caches by a generic prefix.
setCacheNameDetails({
  prefix: storageScope({ appId: appConfig.appId, basePath: new URL(self.registration.scope).pathname,
    namespace: 'shell', version: 1 }),
  suffix: 'shell',
});
self.__WB_DISABLE_DEV_LOGS = true;
// Exact build assets only: no API, navigation fallback, runtime cache, or third-party cache.
precacheAndRoute(self.__WB_MANIFEST, {
  cleanURLs: false,
  directoryIndex: 'index.html',
  ignoreURLParametersMatching: [],
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
// Take control on first install and after an explicitly accepted update.
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
