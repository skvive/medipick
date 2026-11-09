(function () {
  'use strict';

  var path = (location.pathname || '/').replace(/\/$/, '') || '/';

  function pathToKey(p) {
    if (p === '/' || p === '/index.html') return 'home';
    var seg = p.split('/').filter(Boolean)[0] || 'home';
    return seg.replace('.html', '');
  }

  var pageKey = document.body.getAttribute('data-mp-page') || pathToKey(path);

  function active(key) {
    return pageKey === key ? ' is-active' : '';
  }

  var NAV = [
    { key: 'home', href: '/', label: '홈' },
    { key: 'smart-store', href: '/smart-store', label: '병원 지도' },
    { key: 'clinic-store', href: '/clinic-store', label: '병원 스마트스토어' },
    { key: 'portal', href: '/portal', label: '전체 서비스' },
    { key: 'explore', href: '/?nav=explore', label: '병원 찾기', homeNav: true },
    { key: 'health-content', href: '/health-content', label: '건강정보·영상' },
    { key: 'insurance-claims', href: '/insurance-claims', label: '보험·약제비' },
    { key: 'pharmacy', href: '/?nav=pharmacy', label: '심야약국', homeNav: true },
    { key: 'consult', href: '/consult', label: 'AI 상담' },
    { key: 'my-health', href: '/my-health', label: '건강노트' },
    { key: 'doctors', href: '/doctors', label: '의사 입점' },
  ];

  var B2B = [
    { key: 'doctor-finance', href: '/doctor-finance', label: '병원 경영' },
    { key: 'clinic-ops', href: '/clinic-ops', label: '예약 운영' },
    { key: 'integrations', href: '/integrations', label: '연동' },
    { key: 'admin', href: '/admin', label: '관리' },
    { key: 'premium-admin', href: '/premium-admin', label: '입점 운영' },
  ];

  var B2B_PAGES = [
    'doctor-finance',
    'clinic-ops',
    'integrations',
    'admin',
    'clinic-access',
    'marketing-console',
    'premium-admin',
  ];

  function navHtml(items, useHomeNav) {
    return items
      .map(function (item) {
        var href = item.href;
        if (useHomeNav && item.homeNav) href = item.href;
        return (
          '<a class="mp-nav-link' +
          active(item.key) +
          '" href="' +
          href +
          '">' +
          item.label +
          '</a>'
        );
      })
      .join('');
  }

  function shellHeader(includeB2b) {
    return (
      '<header class="mp-site-header" role="banner">' +
      '<div class="mp-site-header__inner">' +
      '<a class="mp-brand" href="/" aria-label="MEDIPICK 홈">' +
      '<img class="mp-brand__logo mp-brand__logo--full" src="/assets/logo-full.svg" alt="내 근처 병원찾기, 메디픽" width="184" height="42" decoding="async">' +
      '</a>' +
      '<nav class="mp-site-nav mp-site-nav--desktop" aria-label="주 메뉴">' +
      navHtml(NAV, false) +
      (includeB2b ? navHtml(B2B, false) : '') +
      '</nav>' +
      '<div class="mp-site-actions">' +
      '<a class="mp-btn-ghost" href="/auth/sign-in">로그인</a>' +
      '<a class="mp-btn-pink" href="/admin">입점</a>' +
      '<button type="button" class="mp-menu-toggle" id="mpMenuToggle" aria-label="메뉴 열기" aria-expanded="false" aria-controls="mpNavDrawer">☰</button>' +
      '</div></div></header>'
    );
  }

  function drawerHtml(includeB2b) {
    var primary = NAV.map(function (item) {
      return (
        '<a class="mp-drawer-link' +
        active(item.key) +
        '" href="' +
        item.href +
        '">' +
        item.label +
        '</a>'
      );
    }).join('');
    var b2b = includeB2b
      ? '<div class="mp-drawer-section">사업자</div>' +
        B2B.map(function (item) {
          return (
            '<a class="mp-drawer-link' +
            active(item.key) +
            '" href="' +
            item.href +
            '">' +
            item.label +
            '</a>'
          );
        }).join('')
      : '';
    return (
      '<div class="mp-nav-drawer" id="mpNavDrawer" role="dialog" aria-label="전체 메뉴" aria-modal="true" hidden>' +
      '<div class="mp-nav-drawer__backdrop" id="mpNavBackdrop" aria-hidden="true"></div>' +
      '<nav class="mp-nav-drawer__panel" aria-label="전체 메뉴">' +
      '<div class="mp-drawer-head"><span>MEDIPICK</span><button type="button" id="mpMenuClose" aria-label="메뉴 닫기">×</button></div>' +
      primary +
      b2b +
      '<a class="mp-drawer-link" href="/auth/sign-in">로그인</a>' +
      '<a class="mp-drawer-link mp-drawer-cta" href="/admin">입점 문의</a>' +
      '</nav></div>'
    );
  }

  function ensureDrawer(includeB2b) {
    if (document.getElementById('mpNavDrawer')) return;
    document.body.insertAdjacentHTML('beforeend', drawerHtml(includeB2b));
    wireDrawer();
  }

  var lastDrawerFocus = null;

  function setDrawerOpen(open) {
    var drawer = document.getElementById('mpNavDrawer');
    var toggle = document.getElementById('mpMenuToggle') || document.getElementById('menuToggle');
    if (!drawer) return;
    if (open && !document.body.classList.contains('mp-nav-open')) {
      lastDrawerFocus = document.activeElement;
    }
    drawer.hidden = !open;
    drawer.classList.toggle('is-open', open);
    document.body.classList.toggle('mp-nav-open', open);
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      var close = document.getElementById('mpMenuClose');
      if (close) close.focus();
    } else if (lastDrawerFocus && typeof lastDrawerFocus.focus === 'function') {
      lastDrawerFocus.focus();
      lastDrawerFocus = null;
    }
  }

  function wireDrawer() {
    var toggle = document.getElementById('mpMenuToggle') || document.getElementById('menuToggle');
    var closeBtn = document.getElementById('mpMenuClose');
    var backdrop = document.getElementById('mpNavBackdrop');
    var drawer = document.getElementById('mpNavDrawer');
    if (toggle && !toggle.dataset.mpDrawerBound) {
      toggle.dataset.mpDrawerBound = '1';
      toggle.addEventListener('click', function () {
        setDrawerOpen(!document.body.classList.contains('mp-nav-open'));
      });
    }
    if (closeBtn) closeBtn.onclick = function () {
      setDrawerOpen(false);
    };
    if (backdrop) backdrop.onclick = function () {
      setDrawerOpen(false);
    };
    if (drawer && !drawer.dataset.mpKeyboardBound) {
      drawer.dataset.mpKeyboardBound = '1';
      drawer.addEventListener('click', function (event) {
        if (event.target.closest('a[href]')) setDrawerOpen(false);
      });
      document.addEventListener('keydown', function (event) {
        if (!document.body.classList.contains('mp-nav-open')) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          setDrawerOpen(false);
        } else if (event.key === 'Tab') {
          var items = Array.from(drawer.querySelectorAll('button:not([disabled]),a[href]'));
          if (!items.length) return;
          var first = items[0];
          var last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      });
    }
  }

  function upgradeHomeHeader() {
    if (!document.body.classList.contains('mp-home')) return;
    var toggle = document.getElementById('menuToggle');
    if (toggle) toggle.id = 'mpMenuToggle';
    ensureDrawer(true);
    wireDrawer();
  }

  function upgradeMast() {
    if (document.body.classList.contains('mp-home')) return;
    var mast = document.querySelector('header.mast');
    if (!mast) return;
    mast.outerHTML = shellHeader(B2B_PAGES.indexOf(pageKey) >= 0);
    ensureDrawer(B2B_PAGES.indexOf(pageKey) >= 0);
  }

  function upgradeIntegrationBrand() {
    var lockup = document.querySelector('.brand-lockup');
    if (!lockup) return;
    lockup.innerHTML =
      '<img class="mp-brand__logo mp-brand__logo--full" src="/assets/logo-full.svg" alt="내 근처 병원찾기, 메디픽" width="184" height="42"> <small>사업자 연동 센터</small>';
  }

  function upgradeAdvertiserHeader() {
    var wrap = document.querySelector('.advertiser-header .wrap');
    if (!wrap) return;
    var logo = wrap.querySelector('.logo');
    if (logo) {
      logo.innerHTML =
        '<img class="mp-brand__logo mp-brand__logo--full" src="/assets/logo-full.svg" alt="MEDIPICK" width="148" height="32"><small>ADVERTISER</small>';
    }
  }

  function upgradePremiumHeader() {
    if (pageKey !== 'premium-admin') return;
    var h = document.querySelector('body > header.header');
    if (!h) return;
    h.className = 'mp-site-header';
    h.innerHTML =
      '<div class="mp-site-header__inner">' +
      '<a class="mp-brand" href="/"><img class="mp-brand__logo mp-brand__logo--full" src="/assets/logo-full.svg" alt="내 근처 병원찾기, 메디픽" width="184" height="42"></a>' +
      '<div class="mp-site-actions" style="margin-left:auto">' +
      '<a class="mp-btn-ghost" href="/admin">← 관리자</a>' +
      '<button type="button" class="mp-menu-toggle" id="mpMenuToggle" aria-label="메뉴">☰</button></div></div>';
    ensureDrawer(true);
  }

  function upgradeDoctorsHeader() {
    if (pageKey !== 'doctors') return;
    var h = document.querySelector('header.header');
    if (!h) return;
    h.outerHTML = shellHeader(false);
    ensureDrawer(false);
  }

  function ensurePwaInstall() {
    // Existing 13 HTML pages reuse one app manifest, one install helper and shared logo.
    if (!document.querySelector('link[rel="manifest"]')) {
      var manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = '/manifest.webmanifest';
      document.head.appendChild(manifest);
    }
    if (!document.querySelector('link[href="/assets/pwa/install.css"]')) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/assets/pwa/install.css';
      document.head.appendChild(css);
    }
    if (!document.querySelector('script[src="/assets/pwa/install.js"]')) {
      var script = document.createElement('script');
      script.src = '/assets/pwa/install.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensurePwaInstall();
    upgradeMast();
    upgradeHomeHeader();
    upgradeIntegrationBrand();
    upgradeAdvertiserHeader();
    upgradePremiumHeader();
    upgradeDoctorsHeader();
  });
})();
