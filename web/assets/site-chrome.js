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
    { key: 'consult', href: '/consult', label: 'AI 상담' },
    { key: 'my-health', href: '/my-health', label: '건강노트' },
    { key: 'doctors', href: '/doctors', label: '의사 입점' },
  ];

  var B2B = [
    { key: 'doctor-finance', href: '/doctor-finance', label: '병원 경영' },
    { key: 'clinic-ops', href: '/clinic-ops', label: '예약 운영' },
    { key: 'integrations', href: '/integrations', label: '연동' },
    { key: 'admin', href: '/admin', label: '관리' },
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

  function navHtml(items) {
    return items
      .map(function (item) {
        return (
          '<a class="mp-nav-link' +
          active(item.key) +
          '" href="' +
          item.href +
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
      '<img class="mp-brand__logo mp-brand__logo--full" src="/assets/logo-full.svg" alt="MEDIPICK 메디픽" width="168" height="36" decoding="async">' +
      '</a>' +
      '<nav class="mp-site-nav" aria-label="주 메뉴">' +
      navHtml(NAV) +
      (includeB2b ? navHtml(B2B) : '') +
      '</nav>' +
      '<div class="mp-site-actions">' +
      '<a class="mp-btn-ghost" href="/auth/sign-in">로그인</a>' +
      '<a class="mp-btn-pink" href="/admin">입점</a>' +
      '</div></div></header>'
    );
  }

  function upgradeMast() {
    if (document.body.classList.contains('mp-home')) return;
    var mast = document.querySelector('header.mast');
    if (!mast) return;
    mast.outerHTML = shellHeader(B2B_PAGES.indexOf(pageKey) >= 0);
  }

  function upgradeIntegrationBrand() {
    var lockup = document.querySelector('.brand-lockup');
    if (!lockup) return;
    lockup.innerHTML =
      '<img class="mp-brand__logo mp-brand__logo--full" src="/assets/logo-full.svg" alt="MEDIPICK" width="168" height="36"> <small>사업자 연동 센터</small>';
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
      '<a class="mp-brand" href="/"><img class="mp-brand__logo mp-brand__logo--full" src="/assets/logo-full.svg" alt="MEDIPICK" width="168" height="36"></a>' +
      '<div class="mp-site-actions" style="margin-left:auto"><a class="mp-btn-ghost" href="/admin">← 관리자</a></div></div>';
  }

  function upgradeDoctorsHeader() {
    if (pageKey !== 'doctors') return;
    var h = document.querySelector('header.header');
    if (!h) return;
    h.outerHTML = shellHeader(false);
  }

  document.addEventListener('DOMContentLoaded', function () {
    upgradeMast();
    upgradeIntegrationBrand();
    upgradeAdvertiserHeader();
    upgradePremiumHeader();
    upgradeDoctorsHeader();
  });
})();
