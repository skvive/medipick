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
let locationMode = 'default'; // 'default' | 'geo' | 'region' (explicit user action only)
let userLocationMarker = null;
function setLocationStatus(value) { const el = $('#smartLocationStatus'); if (el) el.textContent = value; }
function setPinStatus(value) { const el = $('#smartPinCount'); if (el) el.textContent = value; }
function removeMapMarker(marker) { if (!marker) return; if (typeof marker.setMap === 'function') marker.setMap(null); else marker.map = null; }
function markerPosition(marker) { const pos = marker?.position || marker?.getPosition?.(); return pos?.toJSON ? pos.toJSON() : pos; }
function buildMarker(pos,title,exact,premium=false) { if (google.maps.marker?.AdvancedMarkerElement && google.maps.marker?.PinElement) { const pin = new google.maps.marker.PinElement({background:exact ? (premium ? '#7453ed' : '#1769f8') : '#8391a4', borderColor:'#fff',glyphColor:'#fff',glyph:exact?'✚':'?' ,scale:1.1}); return new google.maps.marker.AdvancedMarkerElement({map,position:pos,title,content:pin.element}); } return new google.maps.Marker({map,position:pos,title,icon:{path:google.maps.SymbolPath.CIRCLE,scale:exact?9:7,fillColor:exact?'#1769f8':'#8391a4',fillOpacity:.92,strokeWeight:2,strokeColor:'#fff'}}); }


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
  locationMode = 'default';
  setLocationStatus('기본 위치: ' + d.label + ' 주변 (현위치 아님)');
  return searchNearby(d.lat, d.lng);
}

function loadMaps(cb) {
  const key = config?.google_maps_browser_key;
  if (!key) { setPinStatus('지도 API 설정 확인 필요 · 주소록 검색 가능'); const box=$('#smartStoreMap'); if(box&&box.classList.contains('mp-smart-map-empty')){const p=box.querySelector('p');if(p)p.textContent='Google 지도 서비스 키가 연결되지 않아 지도가 표시되지 않습니다. 병원 목록에서 Google 지도 주소 확인 링크를 이용하세요.';} return; }
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
    '&language=ko&region=KR&v=weekly&libraries=marker&loading=async&callback=medipickSmartStoreMapReady';
  scr.async = true;
  scr.onerror = () => {
    mapsState = 'error';
    showToast('Google Maps를 불러오지 못했습니다. 병원 주소록은 계속 검색할 수 있습니다.'); setPinStatus('지도 연결 실패 · 주소록 검색 가능');
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
  const link = x.is_premium ? '<p><a href="/clinic-store?id=' + encodeURIComponent(x.id) + '">병원 스마트스토어·Blogger ↗</a></p>' : '';
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
    mapId: config?.google_maps_map_id || 'DEMO_MAP_ID',
  });
  infoWindow = new google.maps.InfoWindow();
  return true;
}

function clearMarkers() {
  for (const m of markerById.values()) removeMapMarker(m);
  markerById.clear();
  if (liveAddressMarker) removeMapMarker(liveAddressMarker);
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
    map.panTo(markerPosition(marker));
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
    map.panTo(markerPosition(liveAddressMarker));
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
    liveAddressMarker = buildMarker(found.geometry.location,'Google 주소 검색 위치(병원 운영 여부 미검증) · '+x.name,true,false);
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
    (pro ? '<a href="/clinic-store?id=' + encodeURIComponent(item.id) + '">입점 병원 스마트스토어 ↗</a>' : '') +
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
    list.innerHTML = '<div class="empty-state">조건에 맞는 병원 주소록이 없습니다. 지역·진료과 검색 조건을 바꿔 보세요. 실제 지도 핀은 검증된 좌표에만 표시됩니다.</div>';
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
        return `<article class="mp-smart-item${pro}" data-id="${x.id}"><button type="button" class="mp-smart-item-main" data-open-id="${x.id}"><small>${safe(badge)}</small><h3>${safe(x.name)}</h3><p>${safe(x.trade_category || '의료기관')} · ${safe(x.region)} ${safe(x.district)}</p><p>${safe(x.address || '주소 정보 없음')}</p><div class="dist">${safe(distLabel)}</div></button><div class="mp-smart-actions">${lookup}${x.is_premium?'<a class="mp-smart-storefront-link" href="/clinic-store?id='+encodeURIComponent(x.id)+'">입점 스마트스토어 ↗</a>':''}</div></article>`;
      },
    )
    .join('');
  list.querySelectorAll('[data-open-id]').forEach((btn) => {
    btn.onclick = () => {
      openStore(+btn.dataset.openId, true);
      if (matchMedia('(max-width:900px)').matches) {
        $('#smartDetail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };
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
    // Null/empty coordinates must never become Number(null) = 0 and create bogus pins.
    if (x.latitude == null || x.longitude == null || x.latitude === '' || x.longitude === '') continue;
    const lat = Number(x.latitude);
    const lng = Number(x.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < 33 || lat > 39.5 || lng < 124 || lng > 132) continue;
    const pos = { lat, lng };
    const precise = x.geocode_status === 'exact';
    if (!precise && !$('#smartEstimated')?.checked) continue;
    const marker = buildMarker(pos, x.name + (precise ? ' · 검증좌표' : ' · 추정 위치 (실주소 아님)'), precise, x.is_premium);
    marker.addListener('click', () => openStore(x.id, false));
    markerById.set(x.id, marker);
    bounds.extend(pos);
  }
  if (center) bounds.extend(center);
  const exactCount = items.filter(x=>x.geocode_status==='exact' && markerById.has(x.id)).length;
  setPinStatus(exactCount+'개 검증 병원 핀' + (markerById.size > exactCount ? ' · 추정 '+(markerById.size-exactCount)+'개' : ''));
  if (locationMode==='geo' && center) {
    removeMapMarker(userLocationMarker);
    userLocationMarker=buildMarker(center,'내 현위치 (브라우저 제공)',true,false);
    if (userLocationMarker.content?.querySelector) { const glyph=userLocationMarker.content.querySelector('.gm-pin-glyph'); if(glyph) glyph.textContent='●'; }
  } else { removeMapMarker(userLocationMarker); userLocationMarker=null; }
  if (markerById.size) map.fitBounds(bounds, 48);
  else if (center) {
    map.setCenter(center);
    map.setZoom(13);
  }
}

async function searchNearby(lat, lng) {
  center = { lat, lng };
  const requestId = ++searchSequence;
  const q = ($('#smartQ')?.value || '').trim();
  const trade = ($('#smartTrade')?.value || '').trim();
  const region = $('#smartRegion')?.value || '';
  const radius = $('#smartRadius')?.value || '3';
  const usingEstimates = Boolean($('#smartEstimated')?.checked);
  const notice = $('#smartNotice');
  if (viewMode === 'partners') {
    const searchParams = new URLSearchParams({ category: trade || '전체' });
    if (q) searchParams.set('q', q);
    if (region) searchParams.set('region', region);
    const res = await api('/api/search?' + searchParams);
    if (requestId !== searchSequence) return;
    items = [];
    partnerItems = Array.isArray(res.items) ? res.items : [];
    renderPartnerList();
    clearMarkers();
    if (map) { map.setCenter(center); map.setZoom(12); }
    if (notice) notice.textContent =
      '※ 기존 메디픽 입점·시연 병원은 공공 주소록과 별도로 관리됩니다. 실제 지도 좌표가 검증되지 않은 기관은 핀으로 표시하지 않습니다. 상세 페이지의 예약 요청은 실제 확정 예약이 아닐 수 있습니다.';
    return;
  }

  partnerItems = [];
  resetDetail();
  // Nearby must work even when estimated pins are OFF; the old condition incorrectly ran nationwide search.
  const radiusMode = locationMode === 'geo' || (locationMode === 'default' && !q);
  const endpoint = radiusMode ? '/api/public-catalog/nearby' : '/api/public-catalog/search';
  const searchParams = radiusMode
    ? new URLSearchParams({ lat, lng, radius, limit: '120', include_estimated: usingEstimates?'1':'0', q, trade })
    : new URLSearchParams({ q, region, trade, limit: '80' });
  const res = await api(endpoint + '?' + searchParams.toString());
  if (requestId !== searchSequence) return;
  items = Array.isArray(res.items) ? res.items : [];
  // Exact nearby records can be empty; never fill a map with unverified proxy coordinates.
  if (radiusMode && items.length === 0) {
    setPinStatus('주변 검증 좌표 0개 · 주소록 목록으로 확인');
    const fall = await api('/api/public-catalog/search?' + new URLSearchParams({ q, region:locationMode==='geo'?'':region, trade, limit:'24' }));
    if (requestId !== searchSequence) return;
    items = Array.isArray(fall.items) ? fall.items : [];
    showToast('반경 내 검증 좌표가 없어 주소록 후보를 표시합니다. 이 목록은 주변 거리순이 아닙니다.');
  }
  if (!radiusMode && items.length === 80) {
    showToast('첫 80건의 병원 주소록 후보입니다. 지역·병원명·진료과를 구체화해 주세요.');
  }
  if (radiusMode && res.capped) {
    showToast('선택하신 추정 범위에서 ' + Number(res.count || 0).toLocaleString() +
      '건 중 ' + items.length + '건을 표시합니다. 실제 병원 위치·거리가 아닙니다.');
  }
  renderList();
  loadMaps(() => renderMapMarkers());
  if (notice) notice.textContent = radiusMode
    ? (usingEstimates ? '주의: 직접 켠 회색 추정핀은 실제 병원 위치가 아닙니다.' : '반경 검색은 검증된 정확좌표만 사용합니다. 주변 검증 병원이 없으면 주소록 후보를 별도로 표시하며 거리를 표시하지 않습니다.')
    : '전국 주소록 검색 결과입니다. 지도 핀은 정확좌표가 검증된 병원만 표시하며 병원 운영·진료 여부를 보증하지 않습니다.';
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
  $('#smartSearchForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const at = center || defaultCenter();
    searchNearby(at.lat, at.lng).catch((error) => showToast(error.message));
  });
  $('#smartLocate')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      searchAtDefault('위치 기능을 지원하지 않아 가락시장역 기준으로 조회합니다.').catch((e) => showToast(e.message));
      return;
    }
    setLocationStatus('현위치 권한을 확인하는 중…');
    navigator.geolocation.getCurrentPosition(
      (pos) => { locationMode='geo'; if($('#smartRegion')) $('#smartRegion').value=''; setLocationStatus('현위치 검색 · 브라우저 제공 위치 (약 '+Number(pos.coords.accuracy||0).toFixed(0)+'m 정확도)'); searchNearby(pos.coords.latitude,pos.coords.longitude).catch(e=>showToast(e.message)); },
      () => searchAtDefault('현위치 권한을 얻지 못해 가락시장역 기준으로 검색합니다.').catch((e) => showToast(e.message)),
      { enableHighAccuracy:true, timeout: 12000, maximumAge: 60000 },
    );
  });
  $('#smartDemo')?.addEventListener('click', () => {
    const at = defaultCenter();
    locationMode='default';setLocationStatus('기본 위치: '+at.label+' 주변 (현위치 아님)');searchNearby(at.lat, at.lng).catch((e) => showToast(e.message));
  });
  const updateMode = () => {
    viewMode = document.querySelector('input[name="smartMode"]:checked')?.value === 'partners'
      ? 'partners' : 'catalog';
    document.querySelectorAll('.mp-smart-modes label').forEach((el) => {
      el.classList.toggle('is-checked', Boolean(el.querySelector('input:checked')));
    });
    const estimateControl = $('#smartEstimated')?.closest('label');
    if (estimateControl) estimateControl.hidden = viewMode === 'partners';
    const region = $('#smartRegion');
    if (region) region.disabled = false;
    const at = center || defaultCenter();
    searchNearby(at.lat, at.lng).catch((e) => showToast(e.message));
  };
  document.querySelectorAll('input[name="smartMode"]').forEach((radio) => {
    radio.addEventListener('change', updateMode);
  });
  ['smartRadius', 'smartEstimated', 'smartRegion'].forEach((id) => {
    $('#' + id)?.addEventListener('change', () => {
      if(id==='smartRegion'){ locationMode='region';setLocationStatus('선택 지역 주소록 검색 · 위치 기반 거리 검색 아님'); }
      const at = center || defaultCenter();
      searchNearby(at.lat, at.lng).catch((e) => showToast(e.message));
    });
  });
  document.querySelectorAll('[data-smart-category]').forEach((button) => {
    button.addEventListener('click', () => {
      const category = button.getAttribute('data-smart-category') || '';
      const input = $('#smartTrade');
      if (input) input.value = input.value === category ? '' : category;
      document.querySelectorAll('[data-smart-category]').forEach((b) => {
        b.classList.toggle('is-active', Boolean(input?.value) && b.getAttribute('data-smart-category') === input?.value);
      });
      const at = center || defaultCenter();
      searchNearby(at.lat, at.lng).catch((e) => showToast(e.message));
    });
  });
  $('[data-smart-clear]')?.addEventListener('click', () => {
    if ($('#smartQ')) $('#smartQ').value = '';
    if ($('#smartTrade')) $('#smartTrade').value = '';
    if ($('#smartRegion')) $('#smartRegion').value = '서울';
    if ($('#smartEstimated')) $('#smartEstimated').checked = false;
    document.querySelectorAll('[data-smart-category]').forEach((b) => b.classList.remove('is-active'));
    const at = center || defaultCenter();
    searchNearby(at.lat, at.lng).catch((e) => showToast(e.message));
  });
}

async function init() {
  try {
    config = await api('/api/config');
    await initStats();
    bindUi();
    loadMaps();
    const params = new URLSearchParams(location.search);
    if (params.get('q') && $('#smartQ')) $('#smartQ').value = params.get('q').slice(0, 80);
    if (params.has('region') && $('#smartRegion')) $('#smartRegion').value = params.get('region');
    if (params.get('mode') === 'partners') {
      const radio = document.querySelector('input[name="smartMode"][value="partners"]');
      if (radio) radio.checked = true;
      viewMode = 'partners';
      document.querySelectorAll('.mp-smart-modes label').forEach((el) => {
        el.classList.toggle('is-checked', Boolean(el.querySelector('input:checked')));
      });
      const estimate = $('#smartEstimated')?.closest('label');
      if (estimate) estimate.hidden = true;
    }
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
