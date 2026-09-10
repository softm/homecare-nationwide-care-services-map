/** SOFTM-PHOTO-EXPLORE START 날짜:20260910 : 기관 사진 탐색과 기존 유형별 비교함을 같은 세션 흐름으로 연결 */
import { escapeHtml, readJson, filterRows, mapUrl, thumbnail, openComparison } from './care-photos-common.js?v=20260910-1';
import { readScope, scopedRows } from './care-photo-scope.js?v=20260910-1';
import { createGallery } from './care-photo-gallery.js?v=20260911-1'; // SOFTM-PHOTO-GALLERY 날짜:20260911 : 기관 사진 요청량을 제한하는 공용 로더 사용
const $ = id => document.getElementById(id);
const labels = { facility: '요양원·공동생활가정', daycare: '주·야간보호센터', 'home-care': '방문요양센터', 'home-nursing': '방문간호센터', 'home-bath': '방문목욕기관', 'short-stay': '단기보호센터', 'welfare-equipment': '복지용구사업소', dementia: '치매전담형 기관', 'nursing-hospital': '요양병원' };
const initial = new URLSearchParams(location.search);
$('photoType').innerHTML = Object.entries(labels).map(([id, label]) => `<option value="${id}">${label}</option>`).join('');
$('photoType').value = labels[initial.get('type')] ? initial.get('type') : 'daycare';
let type, rows = [], summaries = {}, matches = [], limit = 24, basket, generation = 0;
let storage; try { storage = sessionStorage; } catch {}
/** SOFTM-PHOTO-MAP-SCOPE START 날짜:20260910 : 지도에서 전달받은 기관 집합을 기본으로 유지하고 자료가 없어도 전국으로 넓히지 않음 */
let scopeMode = initial.get('scope') === 'all' ? 'all' : 'map';
const scopeToken = initial.get('view');
const mapScope = readScope(storage, scopeToken);
const currentScope = () => mapScope?.type === type ? mapScope : null;
const searchRows = () => scopeMode === 'all' ? rows : scopedRows(rows, currentScope());
function updateScope() {
    const scope = currentScope(), pool = searchRows();
    $('photoType').disabled = scopeMode === 'map';
    $('photoAllScope').hidden = scopeMode === 'all';
    $('photoMapLink').textContent = scopeMode === 'map' ? '지도로 돌아가기' : '지도에서 찾기';
    const withPhotos = pool.filter(row => summaries[row.i]?.count > 0).length;
    const withoutPhotos = pool.filter(row => summaries[row.i]?.count === 0).length;
    const unknown = scope ? scope.ids.length - withPhotos - withoutPhotos : 0;
    $('photoScopeStatus').textContent = scopeMode === 'all' ? '전체 기관에서 사진 찾기' : !scope ? '먼저 지도에서 지역을 찾은 뒤 ‘사진으로 기관 찾기’를 눌러 주세요.' : `지도 표시 ${scope.ids.length.toLocaleString()}곳 기준 · 사진 있는 기관 ${withPhotos.toLocaleString()}곳${withoutPhotos ? ` · 사진 없음 ${withoutPhotos}곳` : ''}${unknown ? ` · 자료 미확인 ${unknown}곳` : ''}`;
}
/** SOFTM-PHOTO-MAP-SCOPE END */
const controls = () => ({ p: $('photoProvince').value, c: $('photoCity').value, q: $('photoQuery').value.trim() });
function options(select, values, label, value = '') {
    select.innerHTML = `<option value="">${label}</option>${[...new Set(values.filter(Boolean))].sort().map(text => `<option>${escapeHtml(text)}</option>`).join('')}`;
    select.value = values.includes(value) ? value : '';
}
function cities(value = '') { options($('photoCity'), searchRows().filter(row => !$('photoProvince').value || row.p === $('photoProvince').value).map(row => row.c), scopeMode === 'map' ? '지도 표시 시·군·구' : '전체', value); }
function syncBasket() {
    if (!basket) return;
    const ids = basket.ids(); $('photoSavedCount').textContent = `${ids.length}곳`;
    $('photoCompare').disabled = !ids.length;
    document.querySelectorAll('[data-photo-save]').forEach(button => {
        const saved = basket.has(button.dataset.photoSave);
        button.setAttribute('aria-pressed', String(saved)); button.textContent = saved ? '✓ 비교에 담음' : '+ 비교에 담기';
    });
}
function writeUrl() {
    const query = new URLSearchParams({ type, scope: scopeMode, mode, ...controls() }); // SOFTM-PHOTO-GALLERY 날짜:20260911 : 범위 토큰과 별개로 보기 모드를 복원
    if (scopeMode === 'map' && scopeToken) query.set('view', scopeToken);
    for (const key of ['p', 'c', 'q']) if (!query.get(key)) query.delete(key);
    history.replaceState(null, '', `?${query}`);
    const mapQuery = new URLSearchParams({ type, ...controls() });
    $('photoMapLink').href = scopeMode === 'map' && currentScope() ? currentScope().source : `nationwide-care-services-map.html?${mapQuery}`;
}
function render({ append = false } = {}) {
    const host = $('photoResults'), start = append ? host.children.length : 0;
    if (!append) host.replaceChildren();
    for (const row of (mode === 'institutions' ? matches.slice(start, limit) : [])) { // SOFTM-PHOTO-GALLERY 날짜:20260911 : 갤러리에서는 불필요한 대표사진 요청을 만들지 않음
        const summary = summaries[row.i], card = document.createElement('article');
        card.className = 'care-photo-card';
        const figure = thumbnail(summary.representative);
        const imageButton = figure.querySelector('.care-photo-image');
        imageButton.tabIndex = 0; imageButton.dataset.photoOpen = row.i; imageButton.setAttribute('aria-label', `${row.n} 사진 보기`);
        const body = document.createElement('div'); body.className = 'care-photo-card-body';
        body.innerHTML = `<h3>${escapeHtml(row.n)}</h3><p>${escapeHtml(row.a)}</p><p class="care-photo-count">등록사진 ${summary.count}장</p><div class="care-photo-card-actions"><button type="button" data-photo-open="${escapeHtml(row.i)}">사진 보기</button><a href="${escapeHtml(mapUrl(type, row))}" rel="nofollow">지도에서 보기</a><button type="button" data-photo-save="${escapeHtml(row.i)}" aria-pressed="false">+ 비교에 담기</button></div>`;
        card.append(figure, body); host.append(card);
    }
    $('photoStatus').textContent = type === 'nursing-hospital' ? '요양병원은 공단 등록사진 제공 대상이 아닙니다.' : matches.length ? `${matches.length.toLocaleString()}곳 중 ${Math.min(limit, matches.length)}곳 표시 · 기관명순` : '조건에 맞는 사진 등록 기관이 없습니다.';
    /** SOFTM-PHOTO-MAP-SCOPE START 날짜:20260910 : 빈 지도·범위 유실·사진 미등록을 전국 검색 결과와 구분 */
    if (scopeMode === 'map' && !currentScope()) $('photoStatus').textContent = '전달된 지도 범위가 없습니다. 지도에서 사진 탐색을 다시 열어 주세요.';
    else if (scopeMode === 'map' && !currentScope().ids.length) $('photoStatus').textContent = '지도에 표시된 기관이 없습니다. 지도에서 마커를 표시해 주세요.';
    updateScope();
    /** SOFTM-PHOTO-MAP-SCOPE END */
    $('photoMore').hidden = limit >= matches.length;
    syncBasket();
}
/** SOFTM-PHOTO-GALLERY START 날짜:20260911 : 레이아웃 전환은 이미 읽은 사진을 재사용하고 검색 변경은 이전 응답을 분리 */
const modeHints = { gallery: '여러 기관의 사진을 모아 봅니다. 사진을 누르면 크게 볼 수 있습니다.', dense: '많은 사진을 한눈에 훑어보세요. 사진을 누르면 원래 비율로 크게 볼 수 있습니다.', large: '공간을 자세히 살펴보세요. 사진의 원래 비율을 유지합니다.', institutions: '기관별 대표사진과 주소를 보고 관심 기관을 담아 보세요.' };
let savedMode; try { savedMode = storage?.getItem('carePhotoView:v1'); } catch {}
let mode = Object.hasOwn(modeHints, initial.get('mode')) ? initial.get('mode') : Object.hasOwn(modeHints, savedMode) ? savedMode : 'gallery';
let gallery = null, galleryBusy = false;
function updateMode() {
    $('photoResults').dataset.mode = mode;
    $('photoResults').toggleAttribute('data-photo-gallery', mode !== 'institutions');
    $('photoResultTitle').textContent = mode === 'institutions' ? '사진이 있는 기관' : '기관 사진 갤러리';
    $('photoModeHint').textContent = modeHints[mode];
    $('photoModes').querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    $('photoGalleryErrors').hidden = mode === 'institutions' || !gallery?.snapshot().failures.length;
}
function renderGallery() {
    if (!gallery || mode === 'institutions') return;
    const state = gallery.snapshot(), host = $('photoResults');
    for (const { row, photo, key } of state.items.slice(host.children.length)) {
        const card = document.createElement('article'); card.className = 'care-photo-card care-photo-tile'; card.dataset.photoKey = key;
        const figure = thumbnail(photo, { viewer: true });
        const trigger = figure.querySelector('button'); trigger.dataset.photoInstitution = row.n;
        trigger.setAttribute('aria-label', `${row.n} · ${photo.title || '등록사진'} 크게 보기`);
        const body = document.createElement('div'); body.className = 'care-photo-card-body';
        body.innerHTML = `<h3>${escapeHtml(row.n)}</h3><div class="care-photo-card-actions"><a href="${escapeHtml(mapUrl(type, row))}" rel="nofollow">지도 보기</a><button type="button" data-photo-save="${escapeHtml(row.i)}" aria-pressed="false">+ 비교에 담기</button></div>`;
        card.append(figure, body); host.append(card);
    }
    const total = matches.reduce((sum, row) => sum + summaries[row.i].count, 0);
    if (matches.length) $('photoStatus').textContent = `${matches.length.toLocaleString()}곳 · 수집 사진 ${total.toLocaleString()}장 중 ${state.items.length.toLocaleString()}장 표시${state.empty ? ` · 빈 사진 자료 ${state.empty}곳` : ''}${galleryBusy ? ' · 불러오는 중…' : ''}`;
    $('photoMore').hidden = !state.more;
    $('photoMore').disabled = galleryBusy;
    $('photoMore').textContent = galleryBusy ? '사진 불러오는 중…' : '사진 더 보기';
    $('photoGalleryErrors').hidden = !state.failures.length;
    $('photoGalleryErrorText').textContent = state.failures.length ? `${state.failures.length}곳의 사진 자료를 불러오지 못했습니다. 이미 불러온 사진은 계속 볼 수 있습니다.` : '';
    $('photoGalleryRetry').disabled = galleryBusy;
    host.setAttribute('aria-busy', String(galleryBusy));
    syncBasket();
}
async function morePhotos(retry = false) {
    if (!gallery || galleryBusy) return;
    const target = gallery; galleryBusy = true; renderGallery();
    await target.next({ retry });
    if (gallery !== target) return;
    galleryBusy = false; renderGallery();
}
function search() {
    if (!basket) return;
    gallery?.cancel(); galleryBusy = false;
    limit = 24; matches = filterRows(searchRows(), summaries, controls());
    gallery = createGallery(matches, id => window.NhisStaticData.photos(id));
    writeUrl(); render(); updateMode();
    if (mode !== 'institutions') { $('photoResults').replaceChildren(); renderGallery(); void morePhotos(); }
    else { $('photoMore').textContent = '24곳 더 보기'; $('photoMore').disabled = false; }
}
$('photoModes').onclick = event => {
    const button = event.target.closest('[data-mode]');
    if (!button || mode === button.dataset.mode) return;
    const previous = mode; mode = button.dataset.mode;
    try { storage?.setItem('carePhotoView:v1', mode); } catch {}
    updateMode();
    if (!basket) return;
    writeUrl();
    if (mode === 'institutions') { render(); $('photoMore').textContent = '24곳 더 보기'; $('photoMore').disabled = false; $('photoResults').setAttribute('aria-busy', 'false'); }
    else { if (previous === 'institutions') $('photoResults').replaceChildren(); renderGallery(); if (!gallery.snapshot().items.length) void morePhotos(); }
};
$('photoGalleryRetry').onclick = () => void morePhotos(true);
updateMode();
/** SOFTM-PHOTO-GALLERY END */
async function load(values = {}) {
    const token = ++generation;
    gallery?.cancel(); gallery = null; galleryBusy = false; $('photoGalleryErrors').hidden = true; // SOFTM-PHOTO-GALLERY 날짜:20260911 : 유형 변경 후 이전 사진 응답을 화면에 반영하지 않음
    type = $('photoType').value; rows = []; summaries = {}; basket = null;
    $('photoResults').replaceChildren(); $('photoResults').setAttribute('aria-busy', 'true');
    $('photoStatus').textContent = '기관과 사진 자료를 불러오고 있습니다.';
    $('photoMore').hidden = true; $('photoRetry').hidden = true; $('photoCompare').disabled = true; $('photoSavedCount').textContent = '0곳';
    $('photoProvince').disabled = true; $('photoCity').disabled = true;
    try {
        const [nextRows, manifest] = await Promise.all([window.CareData.category(type), readJson('data/care-photos/manifest.json')]);
        const config = manifest[type];
        if (!config) throw new Error('사진 자료 목록을 확인할 수 없습니다.');
        const nextSummaries = await readJson(`data/care-photos/${config.file}?v=${encodeURIComponent(config.revision)}`);
        if (token !== generation) return;
        if (Object.keys(nextSummaries).length !== config.count || (config.source === 'nhis' && (config.count !== nextRows.length || nextRows.some(row => !Object.hasOwn(nextSummaries, row.i))))) throw new Error('사진 자료 갱신 중입니다. 잠시 후 다시 시도해 주세요.');
        rows = nextRows; summaries = nextSummaries;
        basket = window.CareMapExperience.createBasket(storage, type); basket.retain(new Set(rows.map(row => row.i)));
        options($('photoProvince'), searchRows().map(row => row.p), scopeMode === 'map' ? '지도 표시 지역 전체' : '전국', values.p); cities(values.c);
        $('photoQuery').value = values.q || ''; search();
    } catch (error) {
        if (token !== generation) return;
        $('photoStatus').textContent = error.message || '자료를 불러오지 못했습니다.'; $('photoRetry').hidden = false;
    } finally {
        if (token === generation) { $('photoResults').setAttribute('aria-busy', String(mode !== 'institutions' && galleryBusy)); $('photoProvince').disabled = !basket; $('photoCity').disabled = !basket; } // SOFTM-PHOTO-GALLERY 날짜:20260911 : 기관 인덱스 완료 후에도 사진 로딩 상태를 유지
    }
}
/** SOFTM-PHOTO-MAP-SCOPE START 날짜:20260910 : 사용자가 전체 탐색을 선택한 경우에만 지도 기관 제한과 유형 잠금을 해제 */
$('photoAllScope').onclick = () => {
    scopeMode = 'all';
    options($('photoProvince'), rows.map(row => row.p), '전국'); cities(); $('photoQuery').value = '';
    updateScope(); search();
};
$('photoMapLink').addEventListener('click', event => {
    if (scopeMode !== 'map' || !currentScope() || !document.referrer) return;
    const source = new URL(currentScope().source, location.href), referrer = new URL(document.referrer);
    if (source.origin === referrer.origin && source.pathname === referrer.pathname && history.length > 1) { event.preventDefault(); history.back(); }
});
updateScope();
/** SOFTM-PHOTO-MAP-SCOPE END */
$('photoType').onchange = () => void load(controls());
$('photoProvince').onchange = () => { cities(); search(); };
$('photoCity').onchange = search;
$('photoSearch').onsubmit = event => { event.preventDefault(); search(); };
$('photoRetry').onclick = () => void load(controls());
$('photoMore').onclick = () => { if (mode !== 'institutions') void morePhotos(); else { limit += 24; render({ append: true }); } }; // SOFTM-PHOTO-GALLERY 날짜:20260911 : 보기 모드에 맞춰 사진 또는 기관을 추가
$('photoCompare').onclick = event => openComparison({ rows: basket.ids().map(id => rows.find(row => row.i === id)).filter(Boolean), type, opener: event.currentTarget });
$('photoResults').onclick = event => {
    const button = event.target.closest('[data-photo-save],[data-photo-open]');
    if (!button || !basket) return;
    const row = rows.find(row => row.i === (button.dataset.photoSave || button.dataset.photoOpen));
    if (!row) return;
    if (button.hasAttribute('data-photo-save')) {
        basket.toggle(row.i); syncBasket();
        $('photoAnnouncement').textContent = `${row.n}, ${basket.has(row.i) ? '담았습니다' : '담은 기관에서 뺐습니다'}. 총 ${basket.ids().length}곳`;
    } else openComparison({ rows: [row], type, opener: button, title: '기관 등록사진' });
};
window.addEventListener('pageshow', event => {
    if (!basket) return;
    basket = window.CareMapExperience.createBasket(storage, type); basket.retain(new Set(rows.map(row => row.i))); syncBasket();
});
void load({ p: initial.get('p'), c: initial.get('c'), q: initial.get('q') }); // SOFTM-PHOTO-MAP-SCOPE 날짜:20260910 : 최초 진입은 전달된 마커 집합 안에서만 추가 검색조건을 적용
/** SOFTM-PHOTO-EXPLORE END */
