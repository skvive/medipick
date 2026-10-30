'use strict';
const $ = (s) => document.querySelector(s);
const safe = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const showToast = (msg) => {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3600);
};
async function api(url) {
  const r = await fetch(url);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || '요청 실패');
  return data;
}

let config = null;
let mapsState = 'idle';
let map = null;
let infoWindow = null;
const markerById = new Map();
let items = [];
let center = null;
let activeId = null;

function defaultCenter() {
  const d = config?.default_map_center;
  return {
    lat: Number(d?.lat) || 37.492422,
    lng: Number(d?.lng) || 127.118234,
    label: d?.label || '가락시장역',
  };
}

function mapReady() {
  return config?.google_maps_browser_key && window.google?.maps;
}

function searchAtDefault(reason) {
  const d = defaultCenter();
  if (reason) showToast(reason);
  return searchNearby(d.lat, d.lng);
}

function loadMaps(cb) {
  const key = config?.google_maps_browser_key;
  if (!key) return;
  if (window.google?.maps) {
    mapsState = 'ready';
    cb?.();
    return;
  }
  if (mapsState === 'loading') {
    window.medipickSmartStoreMapReady = () => {
      mapsState = 'ready';
      cb?.();
    };
    return;
  }
  mapsState = 'loading';
  window.medipickSmartStoreMapReady = () => {
    mapsState = 'ready';
    cb?.();
  };
  const scr = document.createElement('script');
  scr.src =
    'https://maps.googleapis.com/maps/api/js?key=' +
    encodeURIComponent(key) +
    '&loading=async&callback=medipickSmartStoreMapReady';
  scr.async = true;
  scr.onerror = () => {
    mapsState = 'error';
    showToast('Google Maps를 불러오지 못했습니다.');
  };
  document.head.appendChild(scr);
}

function popupHtml(x) {
  const ui = x.ui || {};
  const trade = x.trade_category ? `<p><b>공종</b> ${safe(x.trade_category)}</p>` : '';
  const dist =
    x.distance_km != null ? `<p><b>약 ${Number(x.distance_km).toFixed(2)} km</b></p>` : '';
  const phone = x.phone ? `<p>☎ ${safe(x.phone)}</p>` : '';
  const summary = x.summary
    ? `<p style="margin:8px 0;color:#486b57">${safe(String(x.summary).slice(0, 160))}${String(x.summary).length > 160 ? '…' : ''}</p>`
    : '';
  const link = x.profile_url
    ? `<p><a target="_blank" rel="noopener noreferrer" href="${safe(x.profile_url)}">플랫폼 원문 ↗</a></p>`
    : '';
  if (ui.variant === 'premium' || x.is_premium) {
    const img = ui.hero_image
      ? `<img src="${safe(ui.hero_image)}" alt="" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;margin-bottom:8px">`
      : '';
    const vid = ui.video_url
      ? `<p><a target="_blank" rel="noopener noreferrer" href="${safe(ui.video_url)}">▶ 소개 영상 ↗</a></p>`
      : '';
    const blogs = [
      ui.google_blog_url
        ? `<a target="_blank" rel="noopener noreferrer" href="${safe(ui.google_blog_url)}">Google 블로그 ↗</a>`
        : '',
      ui.naver_blog_url
        ? `<a target="_blank" rel="noopener noreferrer" href="${safe(ui.naver_blog_url)}">네이버 블로그 ↗</a>`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const blogLine = blogs ? `<p>${blogs}</p>` : '';
    return `<div class="mp-store-popup mp-store-popup--pro"><span class="badge" style="background:#fff0f5;color:#ff2d6a">${safe(ui.badge || '월구독 PRO')}</span>${img}<h4>${safe(x.name)}</h4>${trade}<p>${safe(x.address || x.region + ' ' + x.district)}</p>${phone}${dist}${summary}${vid}${blogLine}${link}<p style="font-size:11px;color:#888">${safe(ui.disclosure || '')}</p></div>`;
  }
  return `<div class="mp-store-popup mp-store-popup--free"><span class="badge">${safe(ui.badge || '공공 주소록 · 무료')}</span><h4>${safe(x.name)}</h4>${trade}<p>${safe(x.address || x.region + ' ' + x.district)}</p>${phone}${dist}${summary || '<p style="color:#6b857a;font-size:12px">기본 정보 샘플 화면 — 텍스트·연락처만 표시됩니다.</p>'}${link}<p style="font-size:11px;color:#888;margin-top:8px">${safe(ui.disclosure || '진료·광고 추천 아님')}</p><p style="font-size:11px"><a href="/admin">월 구독으로 PRO 업그레이드 ↗</a></p></div>`;
}

function ensureMap() {
  const box = $('#smartStoreMap');
  if (!box || !mapReady()) return false;
  if (map) return true;
  box.classList.remove('mp-smart-map-empty');
  box.replaceChildren();
  map = new google.maps.Map(box, {
    center: center || defaultCenter(),
    zoom: 14,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: true,
  });
  infoWindow = new google.maps.InfoWindow();
  return true;
}

function clearMarkers() {
  for (const m of markerById.values()) m.setMap(null);
  markerById.clear();
}

function openStore(id, pan = true) {
  activeId = id;
  $$listActive();
  const x = items.find((i) => i.id === id);
  const marker = markerById.get(id);
  if (!x || !marker || !map) return;
  if (pan) {
    map.panTo(marker.getPosition());
    map.setZoom(Math.max(map.getZoom(), 14));
  }
  infoWindow.setContent(popupHtml(x));
  infoWindow.open({ map, anchor: marker });
}

function $$listActive() {
  document.querySelectorAll('.mp-smart-item').forEach((el) => {
    el.classList.toggle('active', +el.dataset.id === activeId);
  });
}

function renderList() {
  const list = $('#smartList');
  const meta = $('#smartListMeta');
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">조건에 맞는 카탈로그가 없습니다. 반경·검색어를 바꿔 보세요.</div>';
    if (meta) meta.textContent = '0건';
    return;
  }
  if (meta) meta.textContent = items.length + '건 표시';
  list.innerHTML = items
    .map(
      (x) => {
        const pro = x.is_premium ? ' mp-smart-item--pro' : '';
        const badge = x.ui?.badge || x.source_platform;
        return `<button type="button" class="mp-smart-item${pro}" data-id="${x.id}"><small>${safe(badge)}</small><h3>${safe(x.name)}</h3><p>${safe(x.trade_category || '의료기관')} · ${safe(x.region)} ${safe(x.district)}</p><p>${safe(x.address)}</p><div class="dist">약 ${Number(x.distance_km).toFixed(2)} km</div></button>`;
      },
    )
    .join('');
  list.querySelectorAll('.mp-smart-item').forEach((btn) => {
    btn.onclick = () => openStore(+btn.dataset.id, true);
  });
}

function renderMapMarkers() {
  if (!ensureMap()) return;
  clearMarkers();
  const bounds = new google.maps.LatLngBounds();
  for (const x of items) {
    const lat = Number(x.latitude);
    const lng = Number(x.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const pos = { lat, lng };
    const marker = new google.maps.Marker({
      map,
      position: pos,
      title: x.name,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: x.is_premium ? 9 : 8,
        fillColor: x.is_premium ? '#ff2d6a' : '#167764',
        fillOpacity: 0.92,
        strokeWeight: 2,
        strokeColor: '#fff',
      },
    });
    marker.addListener('click', () => openStore(x.id, false));
    markerById.set(x.id, marker);
    bounds.extend(pos);
  }
  if (center) bounds.extend(center);
  if (items.length) map.fitBounds(bounds, 48);
  else if (center) {
    map.setCenter(center);
    map.setZoom(13);
  }
}

async function searchNearby(lat, lng) {
  center = { lat, lng };
  const q = ($('#smartQ')?.value || '').trim();
  const platform = $('#smartPlatform')?.value || '';
  const trade = ($('#smartTrade')?.value || '').trim();
  const radius = $('#smartRadius')?.value || '3';
  const params = new URLSearchParams({ lat, lng, radius, limit: '120' });
  if (q) params.set('q', q);
  if (platform) params.set('platform', platform);
  if (trade) params.set('trade', trade);
  const res = await api('/api/public-catalog/nearby?' + params.toString());
  items = res.items || [];
  if (res.capped) showToast(`반경 내 ${res.count}건 중 ${res.shown || items.length}건만 지도에 표시합니다.`);
  renderList();
  loadMaps(() => {
    renderMapMarkers();
    if (items[0]) openStore(items[0].id, false);
  });
  const notice = $('#smartNotice');
  if (notice && res.notice) notice.textContent = '※ ' + res.notice;
}

async function initStats() {
  const stats = await api('/api/public-catalog/stats');
  const el = $('#smartStats');
  if (el) {
    el.innerHTML =
      `<span>전체 ${stats.total.toLocaleString()}건</span>` +
      `<span>지도 좌표 ${stats.mappable.toLocaleString()}건</span>` +
      (stats.sources || [])
        .slice(0, 4)
        .map((s) => `<span>${safe(s.source_platform)} ${s.n.toLocaleString()}</span>`)
        .join('');
  }
  const sel = $('#smartPlatform');
  if (sel && stats.sources) {
    for (const s of stats.sources) {
      const o = document.createElement('option');
      o.value = s.source_platform;
      o.textContent = `${s.source_platform} (${s.n.toLocaleString()})`;
      sel.appendChild(o);
    }
  }
}

function bindUi() {
  $('#smartSearchForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!center) {
      searchAtDefault('위치 미설정 · ' + defaultCenter().label + ' 기준으로 검색합니다.');
      return;
    }
    searchNearby(center.lat, center.lng).catch((err) => showToast(err.message));
  });
  $('#smartLocate')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      searchAtDefault('위치를 알 수 없어 ' + defaultCenter().label + ' 기준으로 표시합니다.').catch((e) =>
        showToast(e.message),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => searchNearby(pos.coords.latitude, pos.coords.longitude).catch((e) => showToast(e.message)),
      () =>
        searchAtDefault('위치 접근이 거절되어 ' + defaultCenter().label + ' 기준으로 표시합니다.').catch((e) =>
          showToast(e.message),
        ),
      { timeout: 12000, maximumAge: 60000 },
    );
  });
  $('#smartDemo')?.addEventListener('click', () => {
    const d = defaultCenter();
    searchNearby(d.lat, d.lng).catch((e) => showToast(e.message));
  });
  ['smartPlatform', 'smartRadius'].forEach((id) => {
    $('#' + id)?.addEventListener('change', () => {
      if (center) searchNearby(center.lat, center.lng).catch((e) => showToast(e.message));
    });
  });
}

async function init() {
  try {
    config = await api('/api/config');
    await initStats();
    bindUi();
    loadMaps();
    const params = new URLSearchParams(location.search);
    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lng'));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      await searchNearby(lat, lng);
    } else {
      await searchAtDefault();
    }
  } catch (e) {
    showToast('초기화 실패: ' + e.message);
  }
}

init();
