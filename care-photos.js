/** SOFTM-PHOTO-EXPLORE START 날짜:20260910 : 기관 사진 탐색과 기존 유형별 비교함을 같은 세션 흐름으로 연결 */
import { escapeHtml, readJson, filterRows, mapUrl, thumbnail, openComparison } from './care-photos-common.js?v=20260910-1';
import { readScope, scopedRows } from './care-photo-scope.js?v=20260910-1';
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
    const query = new URLSearchParams({ type, scope: scopeMode, ...controls() });
    if (scopeMode === 'map' && scopeToken) query.set('view', scopeToken);
    for (const key of ['p', 'c', 'q']) if (!query.get(key)) query.delete(key);
    history.replaceState(null, '', `?${query}`);
    const mapQuery = new URLSearchParams({ type, ...controls() });
    $('photoMapLink').href = scopeMode === 'map' && currentScope() ? currentScope().source : `nationwide-care-services-map.html?${mapQuery}`;
}
function render({ append = false } = {}) {
    const host = $('photoResults'), start = append ? host.children.length : 0;
    if (!append) host.replaceChildren();
    for (const row of matches.slice(start, limit)) {
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
function search() { if (!basket) return; limit = 24; matches = filterRows(searchRows(), summaries, controls()); writeUrl(); render(); }
async function load(values = {}) {
    const token = ++generation;
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
        if (token === generation) { $('photoResults').setAttribute('aria-busy', 'false'); $('photoProvince').disabled = !basket; $('photoCity').disabled = !basket; }
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
$('photoMore').onclick = () => { limit += 24; render({ append: true }); };
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
