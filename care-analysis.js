/** SOFTM-CARE-ANALYSIS START 날짜:20260911 : 주소 한 번 입력으로 생활권 전체의 선택 근거와 상담 질문을 묶고 입력 변경·취소 후 늦은 응답을 차단 */
import { analyzeInstitutions, radiusBounds } from './care-analysis-engine.js?v=20260911-1';
import { resolveCoordinates } from './care-analysis-data.js?v=20260911-1';
import { escapeHtml as esc, readJson, mapUrl, thumbnail, openComparison } from './care-photos-common.js?v=20260910-1';

const $ = id => document.getElementById(id);
const labels = { daycare: '주·야간보호센터', facility: '요양원·공동생활가정', 'home-care': '방문요양센터', 'home-nursing': '방문간호센터', 'home-bath': '방문목욕기관', 'short-stay': '단기보호센터', 'welfare-equipment': '복지용구사업소', dementia: '치매전담형 기관', 'nursing-hospital': '요양병원' };
const supportedGroups = new Set(['dementia', 'cognitive', 'first', 'respite', 'integrated', 'pilot']);
const validPoint = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
const memory = new Map();
let generation = 0, sdkTask, current = null, limit = 12, view = 'nearby', busy = false;
let storage; try { storage = sessionStorage; } catch {}

function bounded(task, milliseconds = 20000) {
    let timer;
    return Promise.race([task, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('자료 확인 시간이 초과되었습니다.')), milliseconds); })]).finally(() => clearTimeout(timer));
}

function criteriaFor(type) {
    if (type === 'nursing-hospital') return [];
    return [{ id: 'evaluation-ab', kind: 'evaluation', label: '공단 평가 A·B등급' }, ...CareAdvancedSearch.groupsFor(type).filter(group => supportedGroups.has(group.id)).map(group => ({ id: `feature:${group.id}`, kind: 'feature', label: group.id === 'pilot' ? '주야간보호 내 단기보호 시범사업' : group.label, keys: group.options.map(option => option[0]) })), { id: 'photos', kind: 'photos', label: '등록사진 확인' }];
}
function renderCriteria() {
    const type = $('analysisType').value;
    $('analysisCriteria').innerHTML = '<legend class="analysis-sr">희망 조건</legend>' + criteriaFor(type).map(item => `<label><input type="checkbox" value="${esc(item.id)}"><span>${esc(item.label)}</span></label>`).join('');
    $('analysisCriteria').closest('details').hidden = type === 'nursing-hospital';
    $('analysisPreferenceCount').textContent = '선택 안 함';
    $('analysisMap').href = `nationwide-care-services-map.html?type=${encodeURIComponent(type)}`;
}
function setBusy(value) {
    busy = value; $('analysisRun').disabled = value; $('analysisCancel').hidden = !value;
    $('analysisResults').setAttribute('aria-busy', String(value));
    if (!value) $('analysisProgress').hidden = true;
}
function invalidate(message = '입력이 바뀌었습니다. 한 번에 분석을 눌러 새 조건으로 확인해 주세요.') {
    generation++; setBusy(false); $('analysisAddressChoices').hidden = true;
    if (current || ! $('analysisResults').hidden) { current = null; $('analysisResults').hidden = true; }
    $('analysisStatus').textContent = message;
}
function loadSdk() {
    if (window.naver?.maps?.Service?.geocode) return Promise.resolve();
    if (sdkTask) return sdkTask;
    sdkTask = new Promise((resolve, reject) => {
        const script = document.createElement('script'); let poll;
        const finish = error => { clearTimeout(timer); clearInterval(poll); script.onload = script.onerror = null; if (error) { script.remove(); reject(error); } else resolve(); };
        const timer = setTimeout(() => finish(new Error('주소 검색 연결이 지연되고 있습니다. 잠시 후 다시 분석해 주세요.')), 12000);
        script.src = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=etfcybk8vf&submodules=geocoder'; script.async = true;
        script.onerror = () => finish(new Error('주소 검색을 불러오지 못했습니다. 네트워크 연결을 확인하고 다시 분석해 주세요.'));
        script.onload = () => { poll = setInterval(() => { if (window.naver?.maps?.Service?.geocode) finish(); }, 100); };
        document.head.append(script);
    }).catch(error => { sdkTask = null; throw error; });
    return sdkTask;
}
function cachedCoord(row, type) {
    if (memory.has(String(row.i))) return memory.get(String(row.i));
    for (const key of type === 'daycare' ? [`daycareCoord:${row.i}`, `careCoord:${row.i}`] : [`careCoord:${row.i}`]) {
        try { const point = JSON.parse(localStorage.getItem(key) || 'null'); if (validPoint(point)) return point; } catch {}
    }
    return null;
}
function saveCoord(row, point, type) {
    memory.set(String(row.i), point);
    for (const key of type === 'daycare' ? [`daycareCoord:${row.i}`, `careCoord:${row.i}`] : [`careCoord:${row.i}`]) {
        try { localStorage.setItem(key, JSON.stringify(point)); } catch {}
    }
}
async function geocodeInstitution(row) {
    if (!row.a || row.addressMissing) return null;
    const addresses = await NaverGeocoder.searchAddresses(NaverGeocoder.simplifyAddress(row.a));
    // SOFTM-CARE-ANALYSIS 날짜:20260911 : 기관 주소가 여러 위치로 풀리면 임의 선택해 생활권에 넣지 않음
    return addresses.length === 1 ? addresses[0].point : null;
}
async function photoSummaries(type, rows) {
    if (type === 'nursing-hospital') return {};
    const manifest = await readJson('data/care-photos/manifest.json'), meta = manifest[type];
    if (!meta || !/^[\w-]+\.json\.gz$/.test(meta.file)) throw new Error('사진 자료 목록을 확인할 수 없습니다.');
    const summaries = await readJson(`data/care-photos/${meta.file}?v=${encodeURIComponent(meta.revision)}`);
    if (Object.keys(summaries).length !== meta.count || meta.count !== rows.length || rows.some(row => !Object.hasOwn(summaries, row.i))) throw new Error('사진 자료가 갱신 중입니다.');
    return summaries;
}
function draft() {
    const type = $('analysisType').value;
    const selected = new Set([...$('analysisCriteria').querySelectorAll('input:checked')].map(input => input.value));
    return { type, radiusKm: Number($('analysisRadius').value), address: $('analysisAddress').value.trim(), criteria: criteriaFor(type), selected };
}
async function submit(event) {
    event?.preventDefault(); if (!$('analysisForm').reportValidity()) return;
    const input = draft(); if (!input.address) return;
    invalidate('기준 주소를 확인하고 있습니다.'); const token = generation; setBusy(true);
    try {
        await loadSdk(); if (token !== generation) return;
        const addresses = await NaverGeocoder.searchAddresses(input.address); if (token !== generation) return;
        if (!addresses.length) throw new Error('주소를 찾지 못했습니다. 시·군·구와 도로명·건물번호를 입력해 주세요.');
        if (addresses.length === 1) { await run(input, addresses[0], token); return; }
        $('analysisAddressOptions').replaceChildren();
        for (const address of addresses) {
            const button = document.createElement('button'); button.type = 'button'; button.textContent = address.label;
            button.onclick = () => { if (token === generation) { $('analysisAddressChoices').hidden = true; void run(input, address, token); } };
            $('analysisAddressOptions').append(button);
        }
        $('analysisAddressChoices').hidden = false; $('analysisStatus').textContent = '분석할 주소를 선택해 주세요.'; setBusy(false);
        $('analysisAddressOptions button').focus();
    } catch (error) { if (token === generation) { setBusy(false); $('analysisStatus').textContent = error.message || '주소를 확인하지 못했습니다. 다시 분석해 주세요.'; } }
}
async function run(input, address, token) {
    if (token !== generation) return; setBusy(true); $('analysisResults').hidden = true;
    $('analysisStatus').textContent = '기관의 공개정보와 생활권 범위를 확인하고 있습니다.';
    try {
        const [manifest, rows] = await bounded(Promise.all([CareData.manifest(), CareData.category(input.type)]));
        if (token !== generation) return;
        const candidates = MapViewportSearch.select(rows, radiusBounds(address.point, input.radiusKm), row => cachedCoord(row, input.type)).candidates;
        const auxiliary = Promise.allSettled([input.type === 'nursing-hospital' ? Promise.resolve(null) : bounded(CareAdvancedSearch.loadIndex()), bounded(photoSummaries(input.type, rows))]);
        const coordinates = await resolveCoordinates(candidates, {
            cachedCoord: row => cachedCoord(row, input.type), geocode: geocodeInstitution,
            saveCoord: (row, point) => saveCoord(row, point, input.type), isCurrent: () => token === generation,
            onProgress: ({ done, total, failed }) => { $('analysisProgress').hidden = false; $('analysisProgress').max = Math.max(total, 1); $('analysisProgress').value = done; $('analysisStatus').textContent = `생활권에 걸친 기관 위치 확인 ${done.toLocaleString()} / ${total.toLocaleString()}곳${failed ? ` · 위치 미확인 ${failed}곳` : ''}`; }
        });
        const [features, photos] = await auxiliary; if (token !== generation) return;
        const index = features.status === 'fulfilled' ? features.value : null;
        const summaries = photos.status === 'fulfilled' ? photos.value : null;
        const options = { type: input.type, origin: address.point, radiusKm: input.radiusKm, coordFor: row => coordinates.get(String(row.i)), sourceDate: manifest[input.type]?.sourceDate, featureDate: index?.sourceDate, hasFeature: index ? CareAdvancedSearch.createMatcher(index, input.type).hasFeature : null, photoFor: row => summaries?.[row.i]?.count ?? null };
        const report = analyzeInstitutions(candidates, { ...options, criteria: input.criteria });
        const chosen = analyzeInstitutions(candidates, { ...options, criteria: input.criteria.filter(item => input.selected.has(item.id)) });
        current = { input, address, report, chosen, summaries, featureError: features.status === 'rejected', photoError: photos.status === 'rejected', basket: CareMapExperience.createBasket(storage, input.type) };
        view = 'nearby'; limit = 12; render();
        $('analysisStatus').textContent = `분석 완료 · 반경 ${input.radiusKm}km 안 위치 확인 ${report.nearby.length.toLocaleString()}곳${report.unknownLocation.length ? ` · 위치 미확인 ${report.unknownLocation.length}곳은 별도 확인이 필요합니다.` : ''}`;
        $('analysisResults').hidden = false; $('analysisResults').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    } catch (error) { if (token === generation) { current = null; $('analysisStatus').textContent = error.message || '분석을 완료하지 못했습니다. 다시 분석해 주세요.'; } }
    finally { if (token === generation) setBusy(false); }
}
function evaluation(row, type) {
    if (type === 'nursing-hospital') return '심평원 개설현황 · 공단 평가 대상 아님';
    const grade = row.g || row.ev?.grade, year = row.ey || row.ev?.year;
    return /^[A-E]$/.test(grade || '') ? `공단 ${grade}등급 · ${year ? `${year}년 평가` : '평가연도 미확인'}` : '공단 평가 미확인';
}
function questions(entry) {
    const type = current.input.type;
    const selected = entry.conditions.filter(condition => current.input.selected.has(condition.id));
    const generic = type === 'welfare-equipment' ? ['필요한 제품의 대여·구매 가능 여부와 배송 지역은 어떻게 되나요?'] : type === 'nursing-hospital' ? ['필요한 진료와 입원이 가능한가요? 병실·간병 비용은 어떻게 되나요?'] : ['현재 이용 가능한 자리와 이용 시작일을 알려주실 수 있나요?', ['home-care', 'home-nursing', 'home-bath'].includes(type) ? '우리 집까지 방문이 가능한가요? 원하는 요일과 시간을 이용할 수 있나요?' : type === 'daycare' ? '우리 집까지 송영이 가능한가요? 이용시간과 실제 탑승시간은 어떻게 되나요?' : '입소·이용 조건과 가족 방문 시간은 어떻게 되나요?', '이용 조건에 따른 본인부담금과 식비 등 추가 비용은 얼마인가요?'];
    return [...new Set([...selected.filter(item => item.status !== 'confirmed').map(item => item.question), ...generic])];
}
function gradeTable(entries) {
    const years = new Map();
    for (const { row } of entries) {
        const grade = row.g || row.ev?.grade, year = /^[A-E]$/.test(grade || '') ? String(row.ey || row.ev?.year || '연도 미확인') : '평가 미확인';
        if (!years.has(year)) years.set(year, { A: 0, B: 0, C: 0, D: 0, E: 0, unknown: 0 });
        years.get(year)[/^[A-E]$/.test(grade || '') ? grade : 'unknown']++;
    }
    return `<details><summary>평가연도별 분포 보기</summary><div class="analysis-table-wrap"><table class="analysis-table"><caption>평가연도를 나누어 살펴보세요</caption><thead><tr><th scope="col">평가연도</th>${['A', 'B', 'C', 'D', 'E', '미확인'].map(value => `<th scope="col">${value}</th>`).join('')}</tr></thead><tbody>${[...years].sort(([a], [b]) => b.localeCompare(a)).map(([year, counts]) => `<tr><th scope="row">${esc(year)}</th>${Object.values(counts).map(count => `<td>${count}곳</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
function render() {
    const { report, chosen, input, address, featureError, photoError } = current;
    const basketRegion = report.nearby.find(entry => current.basket.has(entry.row.i))?.row || report.nearby[0]?.row;
    const basketLink = `nationwide-care-services-map.html?${new URLSearchParams({ type: input.type, p: basketRegion?.p || '', c: basketRegion?.c || '' })}#careSavedPanel`;
    const size = report.nearby.length, selectedLabels = input.criteria.filter(item => input.selected.has(item.id)).map(item => item.label);
    $('analysisResults').innerHTML = `<section class="analysis-summary"><h2>이 주소에서 시작하는 기관 선택</h2><p>${esc(address.label)} · ${esc(labels[input.type])} · 직선 ${input.radiusKm}km</p><p>${selectedLabels.length ? `희망조건: ${selectedLabels.map(esc).join(' · ')}` : '별도 희망조건 없이 거리와 공개정보를 함께 살펴봤어요.'}</p><div class="analysis-stats"><div><strong>${size.toLocaleString()}곳</strong><span>반경 안 위치 확인</span></div><div><strong>${input.selected.size ? `${chosen.allConfirmed.length.toLocaleString()}곳` : '거리순'}</strong><span>${input.selected.size ? '희망조건 모두 확인' : '가까운 후보부터'}</span></div><div><strong>${report.unknownLocation.length.toLocaleString()}곳</strong><span>위치 추가 확인</span></div></div></section>
        ${featureError || photoError ? `<div class="analysis-warning" role="status">${featureError ? '특화서비스' : ''}${featureError && photoError ? '·' : ''}${photoError ? '사진' : ''} 자료를 불러오지 못했습니다. 해당 항목은 미확인으로 표시했습니다. <button type="button" data-analysis-retry>자료 다시 확인</button></div>` : ''}
        ${!size ? '<p class="analysis-empty">확인된 위치 중 선택한 범위 안의 기관이 없습니다. 주소와 범위를 직접 조정하거나 아래 위치 미확인 기관을 살펴보세요.</p>' : ''}
        ${size && report.counts.length ? `<section class="analysis-section"><h2>주변 기관에서 확인되는 정보</h2><p>같은 기관이 여러 항목에 포함될 수 있어요. 미확인은 서비스 미제공을 뜻하지 않습니다.</p><div class="analysis-bars">${report.counts.map(count => `<article class="analysis-bar"><header><strong>${esc(count.label)}</strong><span>${count.confirmed} / ${size}곳</span></header><meter min="0" max="${size}" value="${count.confirmed}" aria-label="${esc(count.label)} 확인 ${count.confirmed}곳, 전체 ${size}곳"></meter><p>확인 ${count.confirmed}곳 · 조건과 다름 ${count.different}곳 · 미확인 ${count.unknown}곳</p></article>`).join('')}</div></section>` : ''}
        ${input.selected.size > 1 && size ? `<section class="analysis-section"><h2>희망조건을 함께 보면</h2><p>모든 희망조건이 확인된 곳은 ${chosen.allConfirmed.length}곳입니다. 아래는 다른 조건을 유지하고 한 항목만 상담으로 확인할 때 추가로 살펴볼 후보입니다. 반경은 그대로이며 자동으로 조건을 바꾸지 않습니다.</p><ul>${chosen.counts.map(count => { const extra = chosen.nearby.filter(entry => entry.conditions.every(condition => condition.id === count.id || condition.status === 'confirmed') && entry.conditions.find(condition => condition.id === count.id)?.status === 'unknown').length; return `<li>${esc(count.label)}만 미확인: ${extra}곳</li>`; }).join('')}</ul></section>` : ''}
        <section class="analysis-section"><h2>어디부터 알아볼까요?</h2><p>거리순으로 표시합니다. 사진 등록이나 확인된 항목 수는 기관의 품질 순위가 아닙니다.</p><div class="analysis-picks"><button type="button" data-analysis-view="nearby" aria-pressed="true">가까운 후보 ${size}곳</button>${input.selected.size ? `<button type="button" data-analysis-view="confirmed" aria-pressed="false">희망조건 모두 확인 ${chosen.allConfirmed.length}곳</button>` : ''}<a class="analysis-action" href="${esc(basketLink)}" rel="nofollow">담은 기관 비교하러 가기</a></div><div id="analysisCards" class="analysis-cards"></div><button class="analysis-more" id="analysisMore" type="button" hidden>12곳 더 보기</button></section>
        ${report.unknownLocation.length ? `<section class="analysis-section analysis-warning"><h2>위치 확인이 더 필요한 ${report.unknownLocation.length}곳</h2><p>선택한 반경에 걸친 행정지역의 후보입니다. 반경 안인지 아직 알 수 없어 주변 기관 건수에 포함하지 않았습니다.</p><button type="button" data-analysis-retry>미확인 위치 다시 확인</button><details><summary>기관 목록과 주소 보기</summary><ul>${report.unknownLocation.map(row => `<li><a href="${esc(mapUrl(input.type, row))}" rel="nofollow">${esc(row.n)}</a> · ${esc(row.a || '주소 미확인')}</li>`).join('')}</ul></details></section>` : ''}
        <section class="analysis-source">${input.type !== 'nursing-hospital' && size ? gradeTable(report.nearby) : ''}<p>근거: ${input.type === 'nursing-hospital' ? '심평원 개설현황' : '국민건강보험공단 공개 수집 자료'} · 검색 자료 기준일 ${esc(report.sourceDate || '미확인')}${report.featureDate ? ` · 특화서비스 기준일 ${esc(report.featureDate)}` : ''}. 개별 항목의 변경일과 평가연도는 다를 수 있습니다.</p><p>직선거리는 실제 이동시간이나 방문·송영 가능 범위를 뜻하지 않습니다. 공개 정원은 빈자리가 아니며, 등록사진은 현재 시설 상태나 촬영일을 보장하지 않습니다.</p></section>`;
    renderCards();
}
function renderCards() {
    const { report, chosen, input, summaries } = current;
    const confirmed = new Set(chosen.allConfirmed.map(entry => String(entry.row.i)));
    const entries = view === 'confirmed' ? report.nearby.filter(entry => confirmed.has(String(entry.row.i))) : report.nearby;
    const host = $('analysisCards'); host.replaceChildren();
    if (!entries.length) host.innerHTML = '<p class="analysis-empty">이 항목에 해당하는 후보가 없습니다. 가까운 후보에서 공개 근거와 확인할 질문을 살펴보세요.</p>';
    for (const entry of entries.slice(0, limit)) {
        const { row, distance, conditions } = entry;
        const card = document.createElement('article'); card.className = 'analysis-card';
        const photo = summaries?.[row.i];
        if (photo?.representative && photo.count > 0) {
            const figure = thumbnail(photo.representative); const button = figure.querySelector('button'); button.tabIndex = 0; button.dataset.analysisPhotos = row.i; button.setAttribute('aria-label', `${row.n} 등록사진 보기`); card.append(figure);
        }
        const body = document.createElement('div'); body.className = 'analysis-card-body';
        const featureFacts = conditions.filter(condition => condition.status === 'confirmed' && condition.id.startsWith('feature:'));
        const capacity = ['facility', 'daycare', 'short-stay', 'dementia'].includes(input.type) && Number.isFinite(row.z) && row.z > 0 ? `<li>공개 정원 ${row.z}명 · 빈자리 별도 확인</li>` : '';
        body.innerHTML = `<div class="analysis-badges"><span>직선 ${distance.toFixed(1)}km</span>${confirmed.has(String(row.i)) ? '<span>희망조건 모두 확인</span>' : ''}</div><h3>${esc(row.n)}</h3><p class="analysis-card-address">${esc(row.a || '주소 미확인')}</p><ul class="analysis-facts"><li>${esc(evaluation(row, input.type))}</li>${capacity}${featureFacts.map(item => `<li>${esc(item.label)} 확인</li>`).join('')}${input.type !== 'nursing-hospital' ? `<li>${Number.isFinite(photo?.count) ? `등록사진 ${photo.count}장` : '사진 자료 미확인'}</li>` : ''}</ul><details><summary>상담 전에 확인할 질문 ${questions(entry).length}개</summary><ul>${questions(entry).map(question => `<li>${esc(question)}</li>`).join('')}</ul>${conditions.filter(condition => input.selected.has(condition.id)).map(condition => `<p><b>${esc(condition.label)}</b>: ${esc(condition.evidence)}</p>`).join('')}</details><div class="analysis-card-actions"><button type="button" data-analysis-save="${esc(row.i)}" aria-pressed="false">비교에 담기</button><a href="${esc(mapUrl(input.type, row))}" rel="nofollow">기관 상세</a>${photo?.count > 0 ? `<button type="button" data-analysis-photos="${esc(row.i)}">사진 보기</button>` : ''}</div>`;
        card.append(body); host.append(card);
    }
    $('analysisMore').hidden = entries.length <= limit;
    syncBasket();
}
function syncBasket() {
    if (!current) return;
    document.querySelectorAll('[data-analysis-save]').forEach(button => { const saved = current.basket.has(button.dataset.analysisSave); button.setAttribute('aria-pressed', String(saved)); button.textContent = saved ? '✓ 비교에 담음' : '+ 비교에 담기'; });
}
$('analysisType').innerHTML = Object.entries(labels).map(([type, label]) => `<option value="${type}">${label}</option>`).join('');
const initialType = new URLSearchParams(location.search).get('type');
$('analysisType').value = Object.hasOwn(labels, initialType) ? initialType : 'daycare'; renderCriteria();
$('analysisForm').addEventListener('submit', submit);
$('analysisForm').addEventListener('input', () => { if (busy || current || !$('analysisAddressChoices').hidden) invalidate(); });
$('analysisType').addEventListener('change', () => { invalidate(); renderCriteria(); });
$('analysisCriteria').addEventListener('change', () => { const count = $('analysisCriteria').querySelectorAll('input:checked').length; $('analysisPreferenceCount').textContent = count ? `${count}개 선택` : '선택 안 함'; });
$('analysisCancel').onclick = () => invalidate('분석을 취소했습니다. 입력한 조건은 유지됩니다.');
$('analysisResults').addEventListener('click', event => {
    if (!current) return;
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-analysis-retry')) { const { input, address } = current; invalidate('확인되지 않은 자료를 다시 확인합니다.'); void run(input, address, generation); }
    else if (button.dataset.analysisView) { view = button.dataset.analysisView; limit = 12; document.querySelectorAll('[data-analysis-view]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.analysisView === view))); renderCards(); }
    else if (button.id === 'analysisMore') { limit += 12; renderCards(); }
    else if (button.dataset.analysisSave) { current.basket.toggle(button.dataset.analysisSave); syncBasket(); $('analysisStatus').textContent = `비교함에 ${current.basket.ids().length}곳을 담았습니다.`; }
    else if (button.dataset.analysisPhotos) { const row = current.report.nearby.find(entry => String(entry.row.i) === button.dataset.analysisPhotos)?.row; if (row) openComparison({ rows: [row], type: current.input.type, opener: button, title: `${row.n} 등록사진` }); }
});
window.addEventListener('pagehide', () => { generation++; if (busy) { setBusy(false); $('analysisStatus').textContent = '분석이 중단되었습니다. 입력 조건을 확인하고 다시 분석해 주세요.'; } });
window.addEventListener('pageshow', () => { if (current) { current.basket = CareMapExperience.createBasket(storage, current.input.type); syncBasket(); } });
/** SOFTM-CARE-ANALYSIS END */
