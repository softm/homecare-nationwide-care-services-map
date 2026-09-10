/** SOFTM-PHOTO-EXPLORE START 날짜:20260910 : 기관 사진 탐색과 기존 유형별 비교함을 같은 세션 흐름으로 연결 */
import { escapeHtml, readJson, filterRows, mapUrl, thumbnail, openComparison } from './care-photos-common.js?v=20260910-1';
const $ = id => document.getElementById(id);
const labels = { facility: '요양원·공동생활가정', daycare: '주·야간보호센터', 'home-care': '방문요양센터', 'home-nursing': '방문간호센터', 'home-bath': '방문목욕기관', 'short-stay': '단기보호센터', 'welfare-equipment': '복지용구사업소', dementia: '치매전담형 기관', 'nursing-hospital': '요양병원' };
const initial = new URLSearchParams(location.search);
$('photoType').innerHTML = Object.entries(labels).map(([id, label]) => `<option value="${id}">${label}</option>`).join('');
$('photoType').value = labels[initial.get('type')] ? initial.get('type') : 'daycare';
let type, rows = [], summaries = {}, matches = [], limit = 24, basket, generation = 0;
let storage; try { storage = sessionStorage; } catch {}
const controls = () => ({ p: $('photoProvince').value, c: $('photoCity').value, q: $('photoQuery').value.trim() });
function options(select, values, label, value = '') {
    select.innerHTML = `<option value="">${label}</option>${[...new Set(values.filter(Boolean))].sort().map(text => `<option>${escapeHtml(text)}</option>`).join('')}`;
    select.value = values.includes(value) ? value : '';
}
function cities(value = '') { options($('photoCity'), rows.filter(row => !$('photoProvince').value || row.p === $('photoProvince').value).map(row => row.c), '전체', value); }
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
    const query = new URLSearchParams({ type, ...controls() });
    for (const key of ['p', 'c', 'q']) if (!query.get(key)) query.delete(key);
    history.replaceState(null, '', `?${query}`);
    $('photoMapLink').href = `nationwide-care-services-map.html?${query}`;
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
    $('photoMore').hidden = limit >= matches.length;
    syncBasket();
}
function search() { if (!basket) return; limit = 24; matches = filterRows(rows, summaries, controls()); writeUrl(); render(); }
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
        options($('photoProvince'), rows.map(row => row.p), '전국', values.p); cities(values.c);
        $('photoQuery').value = values.q || ''; search();
    } catch (error) {
        if (token !== generation) return;
        $('photoStatus').textContent = error.message || '자료를 불러오지 못했습니다.'; $('photoRetry').hidden = false;
    } finally {
        if (token === generation) { $('photoResults').setAttribute('aria-busy', 'false'); $('photoProvince').disabled = !basket; $('photoCity').disabled = !basket; }
    }
}
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
void load({ p: initial.get('p'), c: initial.get('c'), q: initial.get('q') });
/** SOFTM-PHOTO-EXPLORE END */
