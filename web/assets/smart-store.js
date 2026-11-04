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
let liveAddressMarker = null;
let liveAddressId = null;
let addressSearchSequence = 0;
let viewMode = 'catalog';
let partnerItems = [];
let searchSequence = 0;

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
    '&language=ko&region=KR&loading=async&callback=medipickSmartStoreMapReady';
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
  const precise = x.geocode_status === 'exact';
  const dist = x.distance_km != null
    ? `<p><b>${precise ? '직선거리' : '지도상 추정거리'} 약 ${Number(x.distance_km).toFixed(2)} km</b></p>`
    : '';
  const accuracy = precise
    ? '<p style="color:#167764">주소 기반 검증 좌표</p>'
    : '<p style="color:#a15f15;font-weight:700">주의: 실제 병원 위치가 아닌 시·도 기준 추정 좌표입니다.</p>';
  const googleQuery = encodeURIComponent([x.name, x.address].filter(Boolean).join(' '));
  const mapsLink = x.address
    ? `<p><a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${googleQuery}">Google 지도에서 주소 확인 ↗</a></p>`
    : '';
  const phone = x.phone ? `<p>☎ ${safe(x.phone)}</p>` : '';
  const summary = x.summary
    ? `<p style="margin:8px 0;color:#486b57">${safe(String(x.summary).slice(0, 160))}${String(x.summary).length > 160 ? '…' : ''}</p>`
    : '';
  const link = '';
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
    return `<div class="mp-store-popup mp-store-popup--pro"><span class="badge" style="background:#fff0f5;color:#ff2d6a">${safe(ui.badge || '월구독 PRO')}</span>${img}<h4>${safe(x.name)}</h4>${trade}<p>${safe(x.address || x.region + ' ' + x.district)}</p>${phone}${dist}${accuracy}${mapsLink}${summary}${vid}${blogLine}${link}<p style="font-size:11px;color:#888">${safe(ui.disclosure || '')}</p></div>`;
  }
  return `<div class="mp-store-popup mp-store-popup--free"><span class="badge">${safe(ui.badge || '공공 주소록 · 무료')}</span><h4>${safe(x.name)}</h4>${trade}<p>${safe(x.address || x.region + ' ' + x.district)}</p>${phone}${dist}${accuracy}${mapsLink}${summary || '<p style="color:#6b857a;font-size:12px">기본 정보 샘플 화면 — 텍스트·연락처만 표시됩니다.</p>'}${link}<p style="font-size:11px;color:#888;margin-top:8px">${safe(ui.disclosure || '진료·광고 추천 아님')}</p><p style="font-size:11px"><a href="/admin">월 구독으로 PRO 업그레이드 ↗</a></p></div>`;
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
  if (liveAddressMarker) liveAddressMarker.setMap(null);
  liveAddressMarker = null;
  liveAddressId = null;
  addressSearchSequence += 1;
}

function openStore(id, pan = true) {
  activeId = id;
  $$listActive();
  const x = items.find((i) => i.id === id);
  const marker = markerById.get(id);
  if (!x) return;
  showCatalogDetail(x);
  if (!map || !marker) return;
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


/**
 * User-initiated Google Maps address lookup only (never bulk-geocode on page load).
 * A Google street address is NOT proof that a hospital currently operates there.
 * Results remain in browser memory only; Google Maps content is not persisted.
 */
function streetKey(value) {
  const match = String(value || '').match(/([가-힣0-9·-]+(?:대로|로|길))\s*(\d+(?:-\d+)?)/);
  return match ? match[1] + ' ' + match[2] : '';
}
function isPlausibleKoreanAddress(x, r) {
  if (!r || r.partial_match || r.geometry?.location_type !== 'ROOFTOP') return false;
  const country = (r.address_components || []).find((part) => part.types?.includes('country'));
  const originalRoad = streetKey(x.address);
  return country?.short_name === 'KR' &&
    Boolean(originalRoad) &&
    originalRoad === streetKey(r.formatted_address) &&
    Boolean(x.district) &&
    String(r.formatted_address).includes(x.district);
}
async function locateStoreAddress(id) {
  const x = items.find((item) => item.id === id);
  if (!x || !x.address || !x.district) {
    showToast('주소 정보가 없어 위치를 확인할 수 없습니다.');
    return;
  }
  if (!ensureMap() || typeof google.maps.Geocoder !== 'function') {
    showToast('Google 주소 조회를 사용할 수 없습니다. 지도 주소 검색 링크를 이용하세요.');
    return;
  }
  if (liveAddressId === id && liveAddressMarker) {
    map.panTo(liveAddressMarker.getPosition());
    map.setZoom(16);
    return;
  }
  const requestSequence = ++addressSearchSequence;
  showToast('Google 지도에서 주소를 확인하고 있습니다. 병원 영업 여부는 별도 확인이 필요합니다.');
  try {
    const response = await new google.maps.Geocoder().geocode({ address: x.address, region: 'KR' });
    if (requestSequence !== addressSearchSequence) return;
    const found = (response.results || []).find((result) => isPlausibleKoreanAddress(x, result));
    if (!found) {
      showToast('정밀 주소 일치 확인 실패. 기존 회색 핀은 추정 위치이며 실제 병원 위치가 아닙니다.');
      return;
    }
    if (liveAddressMarker) liveAddressMarker.setMap(null);
    liveAddressMarker = new google.maps.Marker({
      map,
      position: found.geometry.location,
      title: x.name + ' · Google 주소 검색 위치(병원 운영 여부 미검증)',
      icon: {
        path: google.maps.SymbolPath.CIRCLE, scale: 11,
        fillColor: '#2563eb', fillOpacity: 0.95,
        strokeWeight: 2, strokeColor: '#fff',
      },
    });
    liveAddressId = id;
    const popup = '<div class="mp-store-popup"><strong>' + safe(x.name) + '</strong>' +
      '<p>Google 주소 검색 결과: 도로명·건물번호 일치</p>' +
      '<p>' + safe(x.address) + '</p>' +
      '<p style="color:#a15f15">임시 주소 위치입니다. 병원 실재·현재 운영·상호 동일성은 확인되지 않았습니다.</p>' +
      '<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(x.name + ' ' + x.address) + '">Google 지도에서 병원 확인 ↗</a></div>';
    liveAddressMarker.addListener('click', () => {
      infoWindow.setContent(popup);
      infoWindow.open({ map, anchor: liveAddressMarker });
    });
    map.panTo(found.geometry.location);
    map.setZoom(16);
    infoWindow.setContent(popup);
    infoWindow.open({ map, anchor: liveAddressMarker });
    showToast('주소 위치 핀을 표시했습니다. 병원 동일성은 추가 검증이 필요합니다.');
  } catch {
    if (requestSequence === addressSearchSequence) {
      showToast('주소 조회 실패: Geocoding API 사용 설정·결제·키 제한을 확인해 주세요.');
    }
  }
}

function resetDetail() {
  const detail = $('#smartDetail');
  if (!detail) return;
  detail.hidden = true;
  detail.replaceChildren();
}

function showCatalogDetail(item) {
  const detail = $('#smartDetail');
  if (!detail || !item || viewMode !== 'catalog') return;
  detail.hidden = false;
  const address = String(item.address || '').trim();
  const mapQuery = encodeURIComponent([item.name, address].filter(Boolean).join(' '));
  const phone = String(item.phone || '').trim();
  const hasAddress = Boolean(address && item.district);
  const pro = Boolean(item.is_premium);
  const disclosure = item.ui?.disclosure || '등록 주소록: 기관 실재·운영 상태·주소는 방문 전 별도 확인이 필요합니다.';
  detail.innerHTML =
    '<div class="mp-smart-detail-top"><span class="mp-smart-detail-kicker">선택한 병원 정보</span>' +
    '<button type="button" class="mp-smart-detail-close" aria-label="상세정보 닫기">×</button></div>' +
    '<h3>' + safe(item.name) + '</h3><p class="mp-smart-detail-category">' +
    safe(item.trade_category || '의료기관') + ' · ' + safe(item.region) + ' ' + safe(item.district) + '</p>' +
    '<p class="mp-smart-detail-address">' + safe(address || '주소 정보 미등록') + '</p>' +
    (phone ? '<p>☎ ' + safe(phone) + '</p>' : '') +
    '<div class="mp-smart-detail-actions">' +
    (hasAddress ? '<button type="button" class="mp-smart-detail-geocode">◎ Google 주소 위치 조회</button>' : '') +
    (address ? '<a href="https://www.google.com/maps/search/?api=1&query=' + mapQuery +
      '" rel="noopener noreferrer" target="_blank">Google 지도에서 확인 ↗</a>' : '') +
    '</div>' +
    (pro ? '<p class="mp-smart-paid">유료 구독 정보창 · 진료 품질 또는 실력 순위가 아닙니다.</p>' : '') +
    '<p class="mp-smart-detail-note">' + safe(disclosure) + '</p>';
  detail.querySelector('.mp-smart-detail-close')?.addEventListener('click', resetDetail);
  detail.querySelector('.mp-smart-detail-geocode')?.addEventListener('click', () => locateStoreAddress(item.id));
  // Reuse the existing detailed catalog API on explicit user selection.
  const selectedId = item.id;
  api('/api/public-catalog/store/' + encodeURIComponent(selectedId)).then((full) => {
    if (activeId !== selectedId || detail.hidden || viewMode !== 'catalog') return;
    const ui = full.ui || {};
    const valid = (url) => /^https:\/\//i.test(String(url || ''));
    const refs = [
      ['소개 영상', ui.video_url],
      ['의료정보 블로그', ui.google_blog_url],
      ['블로그 콘텐츠', ui.naver_blog_url],
    ].filter(([,url]) => valid(url));
    if (!refs.length) return;
    const group = document.createElement('div');
    group.className = 'mp-smart-detail-related';
    for (const [label,url] of refs) {
      const a = document.createElement('a');
      a.href = String(url);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = label + ' ↗';
      group.appendChild(a);
    }
    detail.appendChild(group);
  }).catch(() => { /* summary card is still useful if detail API is unavailable */ });
}

function renderPartnerList() {
  const list = $('#smartList');
  const meta = $('#smartListMeta');
  if (!list) return;
  resetDetail();
  const title = $('#smartListTitle');
  if (title) title.textContent = '메디픽 등록·입점 의료기관';
  if (meta) meta.textContent = partnerItems.length + '건 · 시연 정보 포함';
  if (!partnerItems.length) {
    list.innerHTML = '<div class="empty-state">검색 조건과 일치하는 메디픽 등록 병원이 없습니다. 전국 주소록으로 전환해 검색할 수 있습니다.</div>';
    return;
  }
  list.innerHTML = partnerItems.map((p) => {
    const id = Number(p.id);
    const isDemo = /^demo-/i.test(String(p.external_key || '')) || /데모|시연/.test(String(p.name || ''));
    const category = safe(p.category || '의료기관');
    const label = isDemo ? '시연용 의료기관 · 실제 예약 아님' : '등록 의료기관 · 검증 여부 확인';
    return '<article class="mp-smart-partner">' +
      '<span class="mp-smart-partner-label">' + label + '</span>' +
      '<h3>' + safe(p.name) + '</h3>' +
      '<p>' + category + ' · ' + safe(p.region || '') + ' ' + safe(p.district || '') + '</p>' +
      '<p>' + safe(p.description || '병원 상세 페이지에서 정보를 확인할 수 있습니다.') + '</p>' +
      (Number.isInteger(id) && id > 0
        ? '<a class="mp-smart-partner-link" href="/hospital?id=' + encodeURIComponent(id) +
        '">메디픽 병원 상세·예약 요청 ↗</a>' : '') +
      '</article>';
  }).join('');
}

function renderList() {
  const list = $('#smartList');
  const meta = $('#smartListMeta');
  if (!list) return;
  const title = $('#smartListTitle');
  if (title) title.textContent = '전국 병원 주소록 · 개별 확인 필요';
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">검증된 주변 병원 좌표가 없습니다. 전국 병원명을 검색한 뒤 개별 병원의 Google 주소 위치 조회로 임시 핀을 확인할 수 있습니다. 추정핀은 별도로 선택한 경우에만 표시됩니다.</div>';
    if (meta) meta.textContent = '검증된 핀 0건';
    return;
  }
  if (meta) meta.textContent = items.length + '건 지역 주소록 · ' + items.filter((item) => item.geocode_status === 'exact').length + '건 검증된 좌표';
  list.innerHTML = items
    .map(
      (x) => {
        const pro = x.is_premium ? ' mp-smart-item--pro' : '';
        const badge = x.ui?.badge || '병원 정보';
        const distLabel = x.distance_km == null ? '전국 목록 검색 · 거리 미산정' :
          (x.geocode_status === 'exact' ? '직선거리' : '좌표상 추정거리(실거리 아님)') + ' 약 ' + Number(x.distance_km).toFixed(2) + ' km';
        const lookup = x.address && x.district
          ? `<button type="button" class="mp-smart-geocode" data-geocode-id="${x.id}">◎ Google 주소 위치 조회 · 임시 핀</button>`
          : '<span class="mp-smart-no-address">주소 미등록 · 위치 조회 불가</span>';
        return `<article class="mp-smart-item${pro}" data-id="${x.id}"><button type="button" class="mp-smart-item-main" data-open-id="${x.id}"><small>${safe(badge)}</small><h3>${safe(x.name)}</h3><p>${safe(x.trade_category || '의료기관')} · ${safe(x.region)} ${safe(x.district)}</p><p>${safe(x.address || '주소 정보 없음')}</p><div class="dist">${safe(distLabel)}</div></button><div class="mp-smart-actions">${lookup}</div></article>`;
      },
    )
    .join('');
  list.querySelectorAll('[data-open-id]').forEach((btn) => {
    btn.onclick = () => openStore(+btn.dataset.openId, true);
  });
  list.querySelectorAll('[data-geocode-id]').forEach((btn) => {
    btn.onclick = () => locateStoreAddress(+btn.dataset.geocodeId);
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
    const precise = x.geocode_status === 'exact';
    if (!precise && !$('#smartEstimated')?.checked) continue;
    const marker = new google.maps.Marker({
      map,
      position: pos,
      title: x.name + (precise ? '' : ' · 추정 위치'),
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: x.is_premium ? 9 : 8,
        fillColor: precise ? (x.is_premium ? '#ff2d6a' : '#167764') : '#7d8c9b',
        fillOpacity: precise ? 0.92 : 0.62,
        strokeWeight: precise ? 2 : 1,
        strokeColor: '#fff',
      },
    });
    marker.addListener('click', () => openStore(x.id, false));
    markerById.set(x.id, marker);
    bounds.extend(pos);
  }
  if (center) bounds.extend(center);
  if (markerById.size) map.fitBounds(bounds, 48);
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
  const radius = $('#smartRadius')?.value || '20';
  const params = new URLSearchParams({ lat, lng, radius, limit: '120' });
  if ($('#smartEstimated')?.checked) params.set('include_estimated', '1');
  if (q) params.set('q', q);
  if (platform) params.set('platform', platform);
  if (trade) params.set('trade', trade);
  const directorySearch = Boolean(q);
  const endpoint = directorySearch ? '/api/public-catalog/search' : '/api/public-catalog/nearby';
  const requestParams = directorySearch
    ? new URLSearchParams({ q, platform, trade, limit: '100' })
    : params;
  const res = await api(endpoint + '?' + requestParams.toString());
  items = res.items || [];
  if (directorySearch && items.length === 100) showToast('병원 주소록 후보 첫 100건입니다. 검색어를 구체화해 주세요.');
  if (!directorySearch && res.capped) showToast(`좌표상 추정 검색 결과 ${res.count}건 중 ${res.shown || items.length}건만 표시합니다.`);
  renderList();
  loadMaps(() => {
    renderMapMarkers();
  });
  const notice = $('#smartNotice');
  if (notice) notice.textContent = directorySearch
    ? '※ 전국 병원명 검색 결과입니다. 추정 좌표는 실제 병원 위치와 다릅니다. 주소 위치 조회는 클릭 시에만 실행되며, 결과는 서버에 저장하지 않습니다.'
    : '※ ' + (res.notice || '추정 좌표는 실제 병원 위치가 아닙니다.');
}

async function initStats() {
  const stats = await api('/api/public-catalog/stats');
  const el = $('#smartStats');
  if (el) {
    el.innerHTML =
      `<span>병원 주소록 후보 ${stats.total.toLocaleString()}건</span>` +
      `<span>검색결과 페이지 ${Number(stats.excluded_search_pages || 0).toLocaleString()}건 제외</span>` +
      `<span>지도 좌표 ${stats.mappable.toLocaleString()}건 (추정 포함)</span>` +
      `<span>정확 위치 검증 ${Number(stats.exact_mappable || 0).toLocaleString()}건</span>` +
      `<span>주소 미등록 ${Number(stats.missing_address || 0).toLocaleString()}건</span>` +
      '';
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
  ['smartPlatform', 'smartRadius', 'smartEstimated'].forEach((id) => {
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
    const hasCoordinates = ['lat', 'lng'].every((key) => params.has(key) && params.get(key)?.trim() !== '');
    const lat = hasCoordinates ? Number(params.get('lat')) : NaN;
    const lng = hasCoordinates ? Number(params.get('lng')) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      await searchNearby(lat, lng);
    } else {
      await searchAtDefault();
    }
  } catch (e) {
    showToast('초기화 실패: ' + e.message);
  }
}

init();
