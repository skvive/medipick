/* MEDIPICK install: reuse verified v4.3 pattern. No private medical data cached. */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => {});
  });
  const visiblePaths = ['/', '/smart-store', '/consult', '/hospital', '/doctors', '/my-health'];
  if (!visiblePaths.includes(location.pathname)) return;
  let pending = null;
  let button = null;
  const mount = () => {
    if (button || document.getElementById('medipick-install')) return;
    button = document.createElement('button');
    button.id = 'medipick-install';
    button.type = 'button';
    button.setAttribute('aria-label', '메디픽 홈 화면 앱 설치');
    button.textContent = '✚ 메디픽 앱 설치';
    button.addEventListener('click', async () => {
      if (!pending) return;
      const promptEvent = pending;
      pending = null;
      button.style.display = 'none';
      try { await promptEvent.prompt(); await promptEvent.userChoice; } catch (_) {}
    });
    document.body.appendChild(button);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pending = event;
    mount();
    if (button) button.style.display = 'inline-flex';
  });
  window.addEventListener('appinstalled', () => {
    pending = null;
    if (button) button.style.display = 'none';
  });
})();
