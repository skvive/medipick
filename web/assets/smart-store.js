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

function mapReady() {
  return config?.google_maps_browser_key && window.google?.maps;
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
  const dist =
    x.distance_km != null ? `<p><b>약 ${Number(x.distance_km).toFixed(2)} km</b></p>` : '';
  const phone = x.phone ? `<p>☎ ${safe(x.phone)}</p>` : '';
  const link = x.profile_url
    ? `<p><a target="_blank" rel="noopener noreferrer" href="${safe(x.profile_url)}">플랫폼 원문 ↗</a></p>`
    : '';
  const geo =
    x.geocode_status && x.geocode_status !== 'ok'
      ? '<p style="font-size:11px;color:#888">좌표: 구·군 중심 추정</p>'
      : '';
  return `<div class="mp-store-popup"><span class="badge">${safe(x.source_platform || '카탈로그')}</span><h4>${safe(x.name)}</h4><p>${safe(x.address || x.region + ' ' + x.district)}</p>${phone}${dist}${link}${geo}<p style="font-size:11px;color:#888;margin-top:8px">주소록 · 진료 추천 아님</p></div>`;
}

function ensureMap() {
  const box = $('#smartStoreMap');
  if (!box || !mapReady()) return false;
  if (map) return true;
  box.classList.remove('mp-smart-map-empty');
  box.replaceChildren();
  map = new google.maps.Map(box, {
    center: center || { lat: 37.4979, lng: 127.0276 },
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
      (x) =>
        `<button type="button" class="mp-smart-item" data-id="${x.id}"><small>${safe(x.source_platform)}</small><h3>${safe(x.name)}</h3><p>${safe(x.region)} ${safe(x.district)} · ${safe(x.address)}</p><div class="dist">약 ${Number(x.distance_km).toFixed(2)} km</div></button>`
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
        scale: 8,
        fillColor: '#167764',
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
  const radius = $('#smartRadius')?.value || '3';
  const params = new URLSearchParams({ lat, lng, radius, limit: '120' });
  if (q) params.set('q', q);
  if (platform) params.set('platform', platform);
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
      showToast('먼저 현위치 또는 시연 위치를 선택하세요.');
      return;
    }
    searchNearby(center.lat, center.lng).catch((err) => showToast(err.message));
  });
  $('#smartLocate')?.addEventListener('click', () => {
    if (!navigator.geolocation) return showToast('위치 서비스를 지원하지 않습니다.');
    navigator.geolocation.getCurrentPosition(
      (pos) => searchNearby(pos.coords.latitude, pos.coords.longitude).catch((e) => showToast(e.message)),
      () => showToast('위치 접근이 거절되었습니다.'),
      { timeout: 12000, maximumAge: 60000 }
    );
  });
  $('#smartDemo')?.addEventListener('click', () => {
    searchNearby(37.4979, 127.0276).catch((e) => showToast(e.message));
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
    }
  } catch (e) {
    showToast('초기화 실패: ' + e.message);
  }
}

init();
