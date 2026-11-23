/** SOFTM-CARE-GAP-MAP START 날짜:20261123 : 수요·공급 스펙트럼, 기관 수 버블, 지역 상세와 기존 기관 탐색을 연결 */
import {
    HEAT_COLORS, HEAT_LABELS, METRICS, buildHeatScale, formatDecimal, formatNumber,
    guidedSearchUrl, institutionSearchUrl, institutionsPerThousand, recognitionRange, sortByPressure
} from './care-gap-engine.js?v=20261123-1';

const DATA_URL = 'data/care-gap/regions.json?v=09321a379e9df86d';
const NAVER_SDK = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=etfcybk8vf';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
let collection, features = [], heat = new Map(), map = null, tooltip = null;
let metric = ['supply', 'elderly', 'recognition'].includes(params.get('metric')) ? params.get('metric') : 'supply';
let type = params.get('type') || 'all', selectedId = params.get('region') || '', visibleLimit = 16;
let mapFeatures = new Map(), markers = new Map();

function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function typeLabel() {
    return collection?.meta?.types?.[type] || collection?.meta?.types?.all || '전체 장기요양기관';
}

function featureById(id) {
    return features.find(feature => feature.properties.id === id) || null;
}

function updateUrl() {
    const url = new URL(location.href);
    if (type === 'all') url.searchParams.delete('type'); else url.searchParams.set('type', type);
    if (metric === 'supply') url.searchParams.delete('metric'); else url.searchParams.set('metric', metric);
    if (selectedId) url.searchParams.set('region', selectedId); else url.searchParams.delete('region');
    history.replaceState(history.state, '', url);
}

function loadNaver() {
    if (globalThis.naver?.maps) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-care-gap-naver]');
        if (existing) { existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', reject, { once: true }); return; }
        const script = document.createElement('script');
        script.dataset.careGapNaver = 'true'; script.src = NAVER_SDK; script.async = true;
        script.onload = resolve; script.onerror = () => reject(new Error('지도 SDK를 불러오지 못했습니다.'));
        document.head.append(script);
    });
}

function summary() {
    const totals = features.reduce((result, feature) => {
        const p = feature.properties;
        result.population += p.population; result.elderly += p.elderly; result.recognized += p.recognized;
        result.recognizedMin += p.recognizedMin; result.recognizedMax += p.recognizedMax;
        result.institutions += p.counts[type] || 0;
        return result;
    }, { population: 0, elderly: 0, recognized: 0, recognizedMin: 0, recognizedMax: 0, institutions: 0 });
    $('gapElderlyTotal').textContent = `${formatNumber(totals.elderly)}명`;
    $('gapElderlyRate').textContent = `전체 인구의 ${formatDecimal(totals.elderly / totals.population * 100)}%`;
    $('gapRecognizedTotal').textContent = `약 ${formatNumber(totals.recognized)}명`;
    $('gapRecognizedRate').textContent = `65세 이상 인구의 ${formatDecimal(totals.recognized / totals.elderly * 100)}% · ${formatNumber(totals.recognizedMin)}~${formatNumber(totals.recognizedMax)}명`;
    $('gapInstitutionLabel').textContent = typeLabel();
    $('gapInstitutionTotal').textContent = `${formatNumber(totals.institutions)}곳`;
    $('gapRegionTotal').textContent = `${features.length.toLocaleString('ko-KR')}개`;
}

function renderLegend() {
    const labels = metric === 'supply' ? HEAT_LABELS : ['낮은 편', '조금 낮음', '중간', '조금 높음', '높은 편'];
    $('gapLegend').innerHTML = labels.map((label, index) => `<span style="--legend-color:${HEAT_COLORS[index]}">${esc(label)}</span>`).join('');
}

function rankingValue(properties) {
    if (metric === 'elderly') return [`${formatDecimal(properties.elderlyRate)}%`, `${formatNumber(properties.elderly)}명`];
    if (metric === 'recognition') return [`${formatDecimal(properties.recognizedRate)}%`, `인정자 약 ${formatNumber(properties.recognized)}명`];
    const count = properties.counts[type] || 0;
    return count ? [`${formatNumber(count)}곳`, `기관 1곳당 약 ${formatNumber(properties.recognized / count)}명`] : ['기관 0곳', '공급 압력 최고'];
}

function filteredRanking() {
    return sortByPressure(features, heat, $('gapProvince').value, $('gapSearch').value);
}

function renderRanking() {
    const rows = filteredRanking(), visible = rows.slice(0, visibleLimit);
    $('gapRankingCount').textContent = `${rows.length.toLocaleString('ko-KR')}개 지역`;
    $('gapRanking').innerHTML = visible.map((feature, index) => {
        const p = feature.properties, info = heat.get(p.id), [value, note] = rankingValue(p);
        return `<li><button type="button" data-region-id="${esc(p.id)}" ${p.id === selectedId ? 'aria-current="true"' : ''}><span class="gap-ranking-index" style="--rank-color:${info.color}">${index + 1}</span><span class="gap-ranking-copy"><strong>${esc(p.label)}</strong><small>${esc(info.label)} · 인정자 약 ${formatNumber(p.recognized)}명</small></span><span class="gap-ranking-value"><strong>${esc(value)}</strong><small>${esc(note)}</small></span></button></li>`;
    }).join('') || '<li><p class="gap-empty">조건에 맞는 지역이 없습니다.</p></li>';
    $('gapMore').hidden = visible.length >= rows.length;
    $('gapMore').onclick = () => { visibleLimit += 16; renderRanking(); };
    $('gapRanking').querySelectorAll('[data-region-id]').forEach(button => button.onclick = () => selectRegion(button.dataset.regionId, true));
}

function selectedPanel() {
    const feature = featureById(selectedId), host = $('gapSelected');
    if (!feature) { host.innerHTML = '<p>지도나 목록에서 지역을 선택해 주세요.</p>'; return; }
    const p = feature.properties, info = heat.get(p.id), count = p.counts[type] || 0;
    const perThousand = institutionsPerThousand(p, type), perInstitution = count ? p.recognized / count : 0;
    const rateRange = p.recognizedRateMin === p.recognizedRateMax ? `${formatDecimal(p.recognizedRate)}%` : `${formatDecimal(p.recognizedRateMin)}~${formatDecimal(p.recognizedRateMax)}%`;
    const formula = count
        ? `장기요양 인정자 약 ${formatNumber(p.recognized)}명 ÷ ${typeLabel()} ${formatNumber(count)}곳 = 기관 1곳당 약 ${formatNumber(perInstitution)}명`
        : `${typeLabel()} 0곳으로 집계되어 공급 압력을 가장 높은 단계로 표시했습니다.`; // SOFTM-CARE-GAP-ZERO 날짜:20261123 : 기관 0곳 안내에서 유형명에 따라 어색해지는 조사를 제거
    const incheonNotice = p.province === '인천광역시' && ['검단구', '서해구', '영종구', '제물포구'].includes(p.region)
        ? '<p class="gap-selected-note">공단 기관 목록 주소가 2026년 인천 구 개편 전 명칭을 사용해 기관 지도는 더 넓은 이전 구 또는 인천 전체 범위로 열릴 수 있습니다.</p>' : '';
    host.innerHTML = `<header><h3>${esc(p.label)}</h3><span class="gap-pressure-badge" style="--badge-color:${info.color}33">${esc(info.label)}</span></header><div class="gap-selected-grid"><div><span>65세 이상 인구</span><strong>${formatNumber(p.elderly)}명</strong><small>전체의 ${formatDecimal(p.elderlyRate)}%</small></div><div><span>장기요양 인정자</span><strong>${recognitionRange(p)}</strong><small>65세 이상 중 ${rateRange}</small></div><div><span>${esc(typeLabel())}</span><strong>${formatNumber(count)}곳</strong><small>기관기호 중복 제거</small></div><div><span>인정자 1,000명당 기관</span><strong>${formatDecimal(perThousand)}곳</strong><small>지역 상대 비교용</small></div></div><p class="gap-selected-formula">${esc(formula)}</p><div class="gap-selected-actions"><a href="${esc(institutionSearchUrl(p, type))}">${p.province === '인천광역시' && ['검단구', '서해구', '영종구', '제물포구'].includes(p.region) ? '넓은 범위 기관 지도 열기' : '이 지역 기관 지도 열기'}</a><a href="${esc(guidedSearchUrl(p, type))}">내 조건으로 기관 찾기</a></div>${incheonNotice}`;
}

function styleFeature(feature) {
    const id = feature.getProperty('id'), info = heat.get(id) || { color: '#8da2aa' }, selected = id === selectedId;
    return { fillColor: info.color, fillOpacity: selected ? .82 : .64, strokeColor: selected ? '#102f3b' : '#ffffff', strokeOpacity: selected ? 1 : .78, strokeWeight: selected ? 3 : .7, clickable: true, zIndex: selected ? 20 : 1 };
}

function markerHtml(properties) {
    const info = heat.get(properties.id) || { color: '#123f54', percentile: 0 }, count = properties.counts[type] || 0;
    const classes = ['gap-institution-marker'];
    if (properties.id === selectedId) classes.push('is-selected');
    if (info.percentile >= .8) classes.push('is-priority');
    return `<div class="${classes.join(' ')}" data-count="${count}" style="background:${info.color}" aria-label="${esc(properties.label)} ${esc(typeLabel())} ${count}곳">${formatNumber(count)}</div>`;
}

function updateMarker(marker, feature) {
    const p = feature.properties;
    marker.setIcon({ content: markerHtml(p), anchor: new naver.maps.Point(0, 0) });
    marker.setTitle(`${p.label} · ${typeLabel()} ${p.counts[type] || 0}곳`);
    marker.setZIndex(p.id === selectedId ? 5000 : 1000 + Math.round((heat.get(p.id)?.percentile || 0) * 100));
}

function updateMarkers() {
    if (!map) return;
    const zoom = map.getZoom(), bounds = map.getBounds();
    let candidates = features.filter(feature => {
        const [lng, lat] = feature.properties.centroid;
        return zoom <= 8 || bounds.hasLatLng(new naver.maps.LatLng(lat, lng));
    });
    if (zoom <= 8) candidates = candidates.sort((a, b) => (heat.get(b.properties.id)?.percentile || 0) - (heat.get(a.properties.id)?.percentile || 0)).slice(0, 38);
    else if (candidates.length > 90) candidates = candidates.sort((a, b) => (heat.get(b.properties.id)?.percentile || 0) - (heat.get(a.properties.id)?.percentile || 0)).slice(0, 90);
    const shown = new Set(candidates.map(feature => feature.properties.id));
    if (selectedId) shown.add(selectedId);
    for (const feature of features) {
        const marker = markers.get(feature.properties.id);
        if (!marker) continue;
        updateMarker(marker, feature); marker.setMap(shown.has(feature.properties.id) ? map : null);
    }
}

function selectRegion(id, fit = false) {
    const feature = featureById(id); if (!feature) return;
    selectedId = id; updateUrl(); selectedPanel(); renderRanking();
    if (map) {
        map.data.setStyle(styleFeature); updateMarkers();
        if (fit) {
            const mapFeature = mapFeatures.get(id), bounds = mapFeature?.getBounds?.();
            if (bounds) map.panToBounds(bounds, { top: 70, right: 70, bottom: 70, left: 70 });
            else { const [lng, lat] = feature.properties.centroid; map.setCenter(new naver.maps.LatLng(lat, lng)); map.setZoom(Math.max(map.getZoom(), 10)); }
        }
    }
}

function renderSources() {
    $('gapSources').innerHTML = collection.meta.sources.map(source => `<li><a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.label)}</a> · ${esc(source.date)} 기준</li>`).join('');
}

function updateView() {
    heat = buildHeatScale(features, type, metric); visibleLimit = 16;
    $('gapMapTitle').textContent = METRICS[metric].label;
    $('gapMetricHelp').textContent = METRICS[metric].help;
    $('gapRankingTitle').textContent = metric === 'supply' ? '공급 압력이 높은 지역' : `${METRICS[metric].label}이 높은 지역`;
    summary(); renderLegend(); renderRanking(); selectedPanel(); updateUrl();
    if (map) { map.data.setStyle(styleFeature); updateMarkers(); }
}

function bindControls() {
    const typeSelect = $('gapType');
    typeSelect.innerHTML = Object.entries(collection.meta.types).map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
    if (!collection.meta.types[type]) type = 'all'; typeSelect.value = type;
    typeSelect.onchange = () => { type = typeSelect.value; updateView(); };
    $('gapMetricTabs').querySelectorAll('[data-metric]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.metric === metric));
        button.onclick = () => { metric = button.dataset.metric; $('gapMetricTabs').querySelectorAll('[data-metric]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); updateView(); };
    });
    const provinces = [...new Set(features.map(feature => feature.properties.province))].sort((a, b) => a.localeCompare(b, 'ko'));
    $('gapProvince').insertAdjacentHTML('beforeend', provinces.map(value => `<option>${esc(value)}</option>`).join(''));
    $('gapProvince').onchange = () => { visibleLimit = 16; renderRanking(); };
    $('gapSearch').oninput = () => { visibleLimit = 16; renderRanking(); };
    $('gapResetMap').onclick = () => { if (map) { map.setCenter(new naver.maps.LatLng(36.35, 127.8)); map.setZoom(7); } };
}

function initMap() {
    map = new naver.maps.Map('careGapMap', { center: new naver.maps.LatLng(36.35, 127.8), zoom: 7, minZoom: 6, maxZoom: 15, mapTypeId: naver.maps.MapTypeId.NORMAL, zoomControl: true, zoomControlOptions: { position: naver.maps.Position.RIGHT_BOTTOM }, scrollWheel: true, pinchZoom: true, draggable: true });
    const added = map.data.addGeoJson(collection);
    for (const feature of added) mapFeatures.set(feature.getProperty('id'), feature);
    map.data.setStyle(styleFeature);
    tooltip = new naver.maps.InfoWindow({ borderWidth: 0, backgroundColor: 'transparent', anchorSize: new naver.maps.Size(0, 0), pixelOffset: new naver.maps.Point(0, -8), disableAnchor: true });
    map.data.addListener('click', event => { tooltip.close(); selectRegion(event.feature.getProperty('id'), false); });
    map.data.addListener('mouseover', event => {
        map.data.overrideStyle(event.feature, { strokeColor: '#102f3b', strokeWeight: 3, fillOpacity: .82 });
        const p = featureById(event.feature.getProperty('id'))?.properties; if (!p || !event.coord) return;
        tooltip.setContent(`<div class="gap-map-tooltip"><strong>${esc(p.label)}</strong><span>${esc(typeLabel())} ${formatNumber(p.counts[type] || 0)}곳 · 인정자 약 ${formatNumber(p.recognized)}명</span></div>`);
        tooltip.setPosition(event.coord); tooltip.open(map);
    });
    map.data.addListener('mouseout', () => { map.data.revertStyle(); tooltip.close(); });
    for (const feature of features) {
        const p = feature.properties, [lng, lat] = p.centroid;
        const marker = new naver.maps.Marker({ position: new naver.maps.LatLng(lat, lng), map: null, icon: { content: markerHtml(p), anchor: new naver.maps.Point(0, 0) }, title: p.label });
        naver.maps.Event.addListener(marker, 'click', () => selectRegion(p.id, true)); markers.set(p.id, marker);
    }
    naver.maps.Event.addListener(map, 'idle', updateMarkers); updateMarkers();
    $('gapMapLoading').hidden = true;
    if (selectedId && params.get('region')) selectRegion(selectedId, true);
}

async function init() {
    try {
        const response = await fetch(DATA_URL); if (!response.ok) throw new Error(`지역 데이터 요청 실패 (${response.status})`);
        collection = await response.json(); features = collection.features;
        bindControls(); renderSources();
        heat = buildHeatScale(features, type, metric);
        if (!featureById(selectedId)) selectedId = sortByPressure(features, heat)[0]?.properties.id || '';
        updateView();
        await loadNaver(); initMap();
    } catch (error) {
        $('gapMapLoading').hidden = true; $('gapMapMessage').hidden = false;
        $('gapMapMessage').textContent = `${error.message} 지역 목록은 계속 확인할 수 있습니다.`;
        console.error(error);
    }
}

void init();
/** SOFTM-CARE-GAP-MAP END */
