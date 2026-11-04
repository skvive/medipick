/* MEDIPICK PWA v5: Never cache API, medical records, login, appointments, or private content. */
'use strict';
const VERSION = 'medipick-public-shell-v5-20261105';
const OFFLINE = '/offline.html';
const SHELL = [OFFLINE, '/assets/favicon.svg', '/assets/pwa/icon-192.png', '/assets/pwa/icon-512.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key.startsWith('medipick-public-shell-') && key !== VERSION)
      .map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') ||
      url.pathname.startsWith('/account') || url.pathname.startsWith('/admin')) return;
  if (request.mode === 'navigate') {
    // Always ask the server for current HTML, including map and healthcare data.
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }
  // Only public static assets have a network-first fallback, never medical API data.
  if (url.pathname.startsWith('/assets/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(fetch(request).catch(() => caches.match(request).then((cached) => cached || Response.error())));
  }
});
