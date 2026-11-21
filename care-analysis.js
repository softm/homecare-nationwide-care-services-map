/** SOFTM-CARE-ANALYSIS START 날짜:20260911 : 주소 한 번 입력으로 생활권 전체의 선택 근거와 상담 질문을 묶고 입력 변경·취소 후 늦은 응답을 차단 */
import { analyzeInstitutions, radiusBounds } from './care-analysis-engine.js?v=20260911-1';
import { resolveCoordinates } from './care-analysis-data.js?v=20260911-1';
import { readOrigin, createOriginBinding } from './care-analysis-origin.js?v=20260911-binding1'; // SOFTM-ANALYSIS-ORIGIN 날짜:20260911 : 지도 위치와 현재 위치를 같은 취소 가능한 기본값으로 연결
import { escapeHtml as esc, readJson, mapUrl, thumbnail, openComparison } from './care-photos-common.js?v=20260910-1';
/** SOFTM-CANDIDATE-FACTS START 날짜:20261121 : 지도 목록과 맞춤 후보의 지표·비용 계산을 공유해 같은 기관의 값이 달라지지 않도록 연결 */
import './care-decision-summary.js?v=20261121-candidates1';
import './care-cost-rates.js?v=20261121-personal-cost1';
import './care-cost-engine.js?v=20260904-1';
import './care-cost-preview.js?v=20261118-1';
/** SOFTM-CANDIDATE-FACTS END */

import { conditions as sharedConditions, saveConditions, ensureRecord, records as consultationRecords, saveRecord, questionId } from './care-workspace.mjs'; // SOFTM-MEMBERS 날짜:20261120 : 기존 조건·체크를 회원 작업공간과 연결
import './care-shell.mjs';
import {recipientContext,recipientSummary,mountGuardianContact} from './care-recipient.mjs'; // SOFTM-GUARDIAN 날짜:20261120 : 대상자 조건과 보호자 연락처를 같은 상담 흐름에 연결
import {recipientMatching} from './care-recipient-model.mjs';

const $ = id => document.getElementById(id);
const labels = { daycare: '주·야간보호센터', facility: '요양원·공동생활가정', 'home-care': '방문요양센터', 'home-nursing': '방문간호센터', 'home-bath': '방문목욕기관', 'short-stay': '단기보호센터', 'welfare-equipment': '복지용구사업소', dementia: '치매전담형 기관', 'nursing-hospital': '요양병원' };
/** SOFTM-ANALYSIS-TYPES START 날짜:20261121 : 이름만으로 판단하기 어려운 돌봄 유형을 이용 상황과 함께 선택 */
const typeDescriptions = {daycare:'낮 동안 센터에서 돌봄',facility:'시설에 입소해 생활하며 돌봄','home-care':'집으로 방문해 일상생활 도움','home-nursing':'집으로 방문하는 간호','home-bath':'집에서 받는 목욕 지원','short-stay':'일정 기간만 시설에서 돌봄','welfare-equipment':'보행기·휠체어 등 보조용품',dementia:'치매전담 서비스를 제공하는 기관','nursing-hospital':'입원하며 진료와 치료'};
function syncTypeChoices() {
    $('analysisTypeChoices').querySelectorAll('input').forEach(input => { input.checked = input.value === $('analysisType').value; });
}
function renderTypeChoices() {
    $('analysisTypeChoices').innerHTML = Object.entries(labels).map(([type,label]) => `<label class="analysis-type-choice"><input type="radio" name="careTypeChoice" value="${type}" aria-describedby="analysis-type-${type}"><span><strong>${label}</strong><small id="analysis-type-${type}">${typeDescriptions[type]}</small></span></label>`).join('');
    syncTypeChoices();
    $('analysisTypeChoices').addEventListener('input', event => {
        const input = event.target.closest('input[name="careTypeChoice"]'); if (!input) return;
        $('analysisType').value = input.value;
        $('analysisType').dispatchEvent(new Event('change', {bubbles:true}));
    });
}
/** SOFTM-ANALYSIS-TYPES END */
const supportedGroups = new Set(['dementia', 'cognitive', 'first', 'respite', 'integrated', 'pilot']);
const validPoint = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
const memory = new Map();
let generation = 0, sdkTask, current = null, limit = 12, view = 'nearby', busy = false, currentStep = 'conditions', comparisonSelection; // SOFTM-GUIDED-COMPARE 날짜:20261119 : 분석 결과를 후보·세 곳 비교·상담 준비 단계로 나누어 같은 세션에서 이동
let storage; try { storage = sessionStorage; } catch {}
let originController; // SOFTM-ANALYSIS-ORIGIN 날짜:20260911 : 주소를 직접 고치면 자동 위치 응답을 폐기

/** SOFTM-GUARDIAN START 날짜:20261120 : 대상자 원문은 현재 화면에만 두고 명시적으로 적용한 공개 조건과 일반 질문을 연결 */
let recipientProfile=null,recipientApplied=false,recipientOwner=null,recipientGeneration=0;
function renderRecipient() {
    const host=$('analysisRecipient');
    if(!recipientProfile){host.innerHTML='<div><span class="analysis-optional">선택 사항</span><strong>저장한 대상자 정보로 더 쉽게 찾아요</strong><p>관계·성별·돌봄 상태를 조건과 상담 질문에 적용해요. 입력 없이도 찾을 수 있어요.</p></div><a class="analysis-recipient-button" href="care-account.html?return=care-account.html%23careRecipient#careRecipient">돌봄 대상자 정보 입력 <span aria-hidden="true">→</span></a>';host.classList.remove('active');return;} // SOFTM-ANALYSIS-GUIDE 날짜:20261121 : 선택 입력을 분명히 알리고 실제 대상자 편집으로 이어지는 버튼 강조
    const matching=recipientMatching(recipientProfile,$('analysisType').value),available=criteriaFor($('analysisType').value);
    const applied=available.filter(item=>matching.criteria.includes(item.id));
    host.classList.toggle('active',recipientApplied);
    host.innerHTML=`<strong>저장한 돌봄 대상자</strong><p>${esc(recipientSummary(recipientProfile))}</p><p>공개 조건: ${esc(applied.map(item=>item.label).join(' · ')||'현재 유형에서 자동 적용할 공개 조건이 없어요.')}</p><p>이동·재활·간호 지원과 성별별 이용 가능 여부는 상담 질문으로 확인합니다.</p><div class="hc-actions"><button type="button" id="applyRecipient" class="analysis-recipient-button" aria-pressed="${recipientApplied}">${recipientApplied?'대상자 조건 적용 중 · 해제':'대상자 조건 적용'}</button><a class="analysis-recipient-button secondary" href="care-account.html#careRecipient">대상자 정보 수정 →</a></div><p class="hc-help">대상자 원문과 보호자 연락처는 가족 공유 링크에 포함하지 않습니다. 상담 기록에 저장한 일반 질문은 공유 항목에 포함될 수 있습니다.</p>`; // SOFTM-ANALYSIS-GUIDE 날짜:20261121 : 저장된 대상자의 적용·수정도 명확한 버튼으로 제공
    $('applyRecipient').onclick=()=>{recipientApplied=!recipientApplied;invalidate(recipientApplied?'대상자 조건을 적용했습니다. 추천 후보 보기를 눌러 주세요.':'대상자 조건 적용을 해제했습니다.');renderRecipient();updateConditionSummary();};
}
async function loadRecipient() {
    const generation=++recipientGeneration;
    try{const context=await recipientContext();if(generation!==recipientGeneration)return;if(recipientApplied&&JSON.stringify(recipientProfile)!==JSON.stringify(context?.profile||null)){recipientApplied=false;invalidate('대상자 정보가 변경되었습니다. 다시 적용해 주세요.');}recipientProfile=context?.profile||null;recipientOwner=context?.guardian.userId||null;renderRecipient();updateConditionSummary();}
    catch(error){if(generation!==recipientGeneration)return;if(recipientApplied){recipientApplied=false;invalidate('대상자 정보를 다시 확인한 뒤 적용해 주세요.');}recipientProfile=null;updateConditionSummary();$('analysisRecipient').innerHTML=`<strong>대상자 정보를 불러오지 못했어요</strong><p>${esc(error.message)}</p><button type="button" id="retryRecipient">다시 불러오기</button>`;$('retryRecipient').onclick=()=>void loadRecipient();}
}
window.addEventListener('care:session',event=>{if(recipientOwner&&event.detail?.user?.id!==recipientOwner){recipientGeneration++;recipientProfile=null;recipientOwner=null;recipientApplied=false;invalidate('계정이 변경되었습니다. 조건을 다시 확인해 주세요.');renderRecipient();}});
/** SOFTM-GUARDIAN END */

/** SOFTM-GUIDED-COMPARE START 날짜:20261119 : URL에 주소·돌봄 조건을 남기지 않고 브라우저 기록과 화면 초점만 단계별로 관리 */
const analysisSteps = ['conditions', 'candidates', 'compare', 'prepare'];
function basketRows() {
    if (!current) return [];
    return current.basket.ids().map(id => {
        const row = current.rowById.get(String(id)); if (!row) return null;
        const entry = current.report.nearby.find(item => String(item.row.i) === String(id));
        return { ...row, _distance: entry?.distance };
    }).filter(Boolean);
}
function activeRows() {
    if (!current || !comparisonSelection) return [];
    const rows = basketRows(), byId = new Map(rows.map(row => [String(row.i), row]));
    comparisonSelection.sync(rows, false);
    return comparisonSelection.ids().map(id => byId.get(String(id))).filter(Boolean);
}
function setStep(next, { push = false, focus = true } = {}) {
    if (!analysisSteps.includes(next)) next = 'conditions';
    if (next !== 'conditions' && !current) next = 'conditions';
    const selected = activeRows();
    if (next === 'compare' && selected.length < 2) {
        $('analysisStatus').textContent = '비교할 시설을 2곳 이상 선택해 주세요.';
        next = current ? 'candidates' : 'conditions';
    }
    if (next === 'prepare' && !selected.length) {
        $('analysisStatus').textContent = '상담을 준비할 시설을 먼저 선택해 주세요.';
        next = current ? 'candidates' : 'conditions';
    }
    currentStep = next; document.body.dataset.analysisStep = next;
    /** SOFTM-ANALYSIS-GUIDE START 날짜:20261121 : 단계와 선택 수에 맞춰 바로 다음 행동을 안내 */
    const nextAction = {conditions:'아래에서 돌봄 유형을 고르고 위치·조건을 확인한 뒤, ‘추천 후보 보기’를 누르세요.',candidates:selected.length<2?'후보에서 비교할 기관을 2곳 이상 담아주세요. 한 번에 최대 3곳을 비교할 수 있어요.':`비교할 기관을 골랐어요. 아래 ‘${selected.length}곳 비교하기’ 버튼으로 차이를 확인하세요.`,compare:'기관별 차이와 확인할 항목을 살펴본 뒤, ‘상담 질문 준비’를 누르세요.',prepare:'질문을 확인하고 기관별 ‘답변·방문 기록 이어가기’를 눌러 기록하세요. 저장한 기록은 가족과 공유할 수 있어요.'};
    $('analysisNextAction').querySelector('span').textContent = nextAction[next];
    /** SOFTM-ANALYSIS-GUIDE END */
    document.querySelectorAll('button[data-analysis-step]').forEach(button => {
        const step = button.dataset.analysisStep;
        button.disabled = step === 'candidates' ? !current : step === 'compare' ? !current || selected.length < 2 : step === 'prepare' ? !current || !selected.length : false;
        if (step === next) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-analysis-panel]').forEach(panel => { panel.hidden = panel.dataset.analysisPanel !== next; });
    if (next === 'compare') renderComparison();
    if (next === 'prepare') renderConsultation();
    if (push && history.state?.analysisStep !== next) history.pushState({ ...history.state, analysisStep: next }, '', location.href);
    if (focus) requestAnimationFrame(() => (next === 'conditions' ? $('analysisConditionTitle') : document.querySelector(`[data-analysis-panel="${next}"] h2`))?.focus({ preventScroll: true })); // SOFTM-STEP-FOCUS 날짜:20261120 : 단계 이동 시 문서 앞쪽 조건 제목이 아니라 실제로 열린 단계 제목에 초점을 전달
}
function updateConditionSummary() {
    const type = $('analysisType').value, selected = [...$('analysisCriteria').querySelectorAll('input:checked')].map(input => input.nextElementSibling?.textContent || input.value);
    $('analysisPreferenceCount').textContent = type === 'nursing-hospital' ? '위치로 확인' : selected.length ? `${selected.length}개 선택` : '선택 안 함'; // SOFTM-ANALYSIS-GUIDE 날짜:20261121 : 저장 조건 복원 시에도 펼친 조건의 실제 선택 개수를 표시
    if(recipientApplied)selected.push(...criteriaFor(type).filter(item=>recipientMatching(recipientProfile,type).criteria.includes(item.id)).map(item=>`${item.label} (대상자)`)); // SOFTM-GUARDIAN 날짜:20261120 : 자동 연결된 조건도 요약에서 숨기지 않음
    $('analysisSummaryRegion').textContent = $('analysisAddress').value.trim() || '주소 확인 전';
    $('analysisSummaryType').textContent = labels[type] || '시설 유형 확인 전';
    $('analysisSummaryRadius').textContent = $('analysisRadius').selectedOptions[0]?.textContent || '거리 확인 전';
    $('analysisSummaryCriteria').textContent = selected.length ? selected.join(' · ') : '선택 안 함';
    $('analysisSummaryCandidates').textContent = current?.input.type === type ? `${current.report.nearby.length.toLocaleString()}곳` : '분석 전';
}
/** SOFTM-GUIDED-COMPARE END */

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
    /** SOFTM-ANALYSIS-GUIDE START 날짜:20261121 : 유형을 바꾸면 관련 조건을 펼치고 자료가 없는 유형도 이유를 안내 */
    $('analysisCriteria').closest('details').open = true;
    $('analysisPreferencesHelp').textContent = type === 'nursing-hospital' ? '요양병원에는 아래 돌봄기관 조건을 적용하지 않아요. 위치로 후보를 확인하고 진료과·간병·비용은 병원에 문의해 주세요.' : '함께 확인하고 싶은 조건을 여러 개 선택할 수 있어요. 선택하지 않아도 후보를 볼 수 있습니다.';
    syncTypeChoices();
    /** SOFTM-ANALYSIS-GUIDE END */
    $('analysisPreferenceCount').textContent = type === 'nursing-hospital' ? '위치로 확인' : '선택 안 함'; // SOFTM-ANALYSIS-GUIDE 날짜:20261121 : 추가 조건이 없는 유형의 상태를 구분
    $('analysisMap').href = `index.html?type=${encodeURIComponent(type)}`;
    updateConditionSummary(); // SOFTM-GUIDED-COMPARE 날짜:20261119 : 유형 변경 즉시 오른쪽 조건 요약을 같은 값으로 갱신
}
function setBusy(value) {
    busy = value; $('analysisRun').disabled = value || originController?.state().phase === 'loading'; $('analysisCancel').hidden = !value; // SOFTM-ANALYSIS-ORIGIN 날짜:20260911 : 위치 확인 중 빈 주소로 분석을 시작하지 않음
    $('analysisResults').setAttribute('aria-busy', String(value));
    if (!value) $('analysisProgress').hidden = true;
    if (!value) scheduleAnalysisMore(); // SOFTM-ANALYSIS-AUTOLOAD 날짜:20260911 : 분석이 끝난 뒤 화면에 드러난 목록 끝부터 추가 표시
}
/** SOFTM-ANALYSIS-AUTOLOAD START 날짜:20260911 : 목록 끝 접근 때만 다음 기관 사진을 붙이고 확대창·취소·중복 호출을 차단 */
let autoMoreObserver, autoMoreFrame = 0;
function scheduleAnalysisMore() {
    if (autoMoreFrame) return;
    autoMoreFrame = requestAnimationFrame(() => {
        autoMoreFrame = 0;
        const end = $('analysisMore');
        if (busy || !current || $('analysisResults').hidden || document.hidden || document.querySelector('dialog[open]') || !end || end.hidden) return;
        const rect = end.getBoundingClientRect();
        if (rect.top > innerHeight + 240 || rect.bottom < 0) return;
        showMoreCards();
    });
}
function observeAnalysisEnd() {
    autoMoreObserver?.disconnect();
    if ('IntersectionObserver' in window) {
        autoMoreObserver = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) scheduleAnalysisMore();
        }, { rootMargin: '0px 0px 240px 0px' });
        autoMoreObserver.observe($('analysisMore'));
    }
}
function showMoreCards() {
    if (!current || busy || $('analysisMore')?.hidden) return;
    limit += 12; renderCards({ append: true });
}
document.addEventListener('visibilitychange', scheduleAnalysisMore);
document.addEventListener('close', scheduleAnalysisMore, true);
/** SOFTM-ANALYSIS-AUTOLOAD END */
function invalidate(message = '입력이 바뀌었습니다. 추천 후보 보기를 눌러 새 조건으로 확인해 주세요.') {
    generation++; setBusy(false); $('analysisAddressChoices').hidden = true;
    if (current || ! $('analysisResults').hidden) { current = null; $('analysisResults').hidden = true; }
    comparisonSelection = null; setStep('conditions', { focus: false }); updateConditionSummary(); // SOFTM-GUIDED-COMPARE 날짜:20261119 : 조건을 바꾸면 이전 후보 화면을 숨기고 입력 단계로 안전하게 복귀
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
    /** SOFTM-GUARDIAN START 날짜:20261120 : 대상자에서 유도된 조건을 일반 검색 저장본에 자동 복제하지 않음 */
    const manualSelected = new Set([...$('analysisCriteria').querySelectorAll('input:checked')].map(input => input.value));
    const matching=recipientApplied?recipientMatching(recipientProfile,type):{criteria:[],questions:[]},criteria=criteriaFor(type);
    const selected=new Set([...manualSelected,...matching.criteria.filter(id=>criteria.some(item=>item.id===id))]);
    return { type, radiusKm: Number($('analysisRadius').value), address: $('analysisAddress').value.trim(), criteria, selected,manualSelected,recipientQuestions:matching.questions };
    /** SOFTM-GUARDIAN END */
}
/** SOFTM-EMPTY-CONDITIONS START 날짜:20261121 : 유효한 검색 입력에서 조건이 비어 있을 때만 확인하고 취소하면 선택 위치로 복귀 */
let confirmingEmptyConditions = false;
function confirmWithoutConditions() {
    const dialog = $('analysisNoConditions');
    dialog.returnValue = 'edit';
    return new Promise(resolve => {
        dialog.addEventListener('close', () => {
            const proceed = dialog.returnValue === 'search';
            if (!proceed) {
                const criteria = $('analysisCriteria');
                criteria.closest('details').open = true;
                criteria.querySelector('input')?.focus({ preventScroll: true });
                criteria.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
            }
            resolve(proceed);
        }, { once: true });
        dialog.showModal();
    });
}
async function submit(event) {
    event?.preventDefault();
    if (busy || confirmingEmptyConditions || !$('analysisForm').reportValidity()) return;
    const input = draft(); if (!input.address) return;
    if (input.criteria.length && !input.selected.size) {
        confirmingEmptyConditions = true;
        try { if (!await confirmWithoutConditions()) return; }
        finally { confirmingEmptyConditions = false; }
    }
    originController?.cancel(); // SOFTM-EMPTY-CONDITIONS 날짜:20261121 : 검색 진행을 선택한 뒤에만 주소 처리를 확정
    /** SOFTM-EMPTY-CONDITIONS END */
    saveConditions({type:input.type,address:input.address,radius:input.radiusKm,preferences:[...input.manualSelected]});
    invalidate('기준 주소를 확인하고 있습니다.'); const token = generation; setBusy(true);
    try {
        await loadSdk(); if (token !== generation) return;
        /** SOFTM-ANALYSIS-ORIGIN START 날짜:20260911 : 자동 연결한 좌표는 주소를 다시 검색하지 않고 그대로 분석 */
        const bound = originController.state();
        if (bound.point && input.address === bound.label) { await run(input, { point: bound.point, label: bound.label }, token); return; }
        /** SOFTM-ANALYSIS-ORIGIN END */
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
        const basket = CareMapExperience.createBasket(storage, input.type); basket.retain(new Set(rows.map(row => String(row.i))));
        comparisonSelection = CareComparisonWorkspace.createSelection(storage, input.type, 3); comparisonSelection.sync(basket.ids(), true);
        current = { input, address, report, chosen, summaries, rows, rowById: new Map(rows.map(row => [String(row.i), row])), featureError: features.status === 'rejected', photoError: photos.status === 'rejected', basket };
        view = 'nearby'; limit = 12; render();
        $('analysisStatus').textContent = `분석 완료 · 반경 ${input.radiusKm}km 안 위치 확인 ${report.nearby.length.toLocaleString()}곳${report.unknownLocation.length ? ` · 위치 미확인 ${report.unknownLocation.length}곳은 별도 확인이 필요합니다.` : ''}`;
        $('analysisResults').hidden = false; updateConditionSummary(); setStep('candidates', { push: true, focus: false }); $('analysisResults').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); // SOFTM-GUIDED-COMPARE 날짜:20261119 : 분석이 끝나면 주소를 URL에 남기지 않고 후보 검토 단계로 이동
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
    return [...new Set([...selected.filter(item => item.status !== 'confirmed').map(item => item.question), ...generic,...(current.input.recipientQuestions||[])])]; // SOFTM-GUARDIAN 날짜:20261120 : 개인 원문 대신 시설에 확인할 일반 질문만 상담 기록으로 전달
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
/** SOFTM-GUIDED-COMPARE START 날짜:20261119 : 후보 카드에서 확인 근거와 기관 질문을 분리하고 같은 선택으로 비교·상담 화면을 생성 */
function mapBasketLink() {
    const region = current.report.nearby.find(entry => current.basket.has(entry.row.i))?.row || current.report.nearby[0]?.row;
    return `index.html?${new URLSearchParams({ type: current.input.type, p: region?.p || '', c: region?.c || '' })}#careSavedPanel`;
}
function render() {
    const { report, chosen, input, address, featureError, photoError } = current;
    const size = report.nearby.length, selectedLabels = input.criteria.filter(item => input.selected.has(item.id)).map(item => item.label);
    $('analysisResults').innerHTML = `<section class="analysis-stage-panel" data-analysis-panel="candidates"><header class="analysis-stage-heading"><div><span>시설 찾기 · 2단계</span><h2 tabindex="-1">조건에 맞춰 살펴볼 후보입니다</h2><p>거리순으로 표시하며 확인된 항목 수는 기관의 품질 순위가 아닙니다.</p></div><button type="button" data-analysis-go="conditions">조건 수정</button></header>
        <section class="analysis-summary"><div class="analysis-summary-main"><h2>이 주소에서 시작하는 기관 선택</h2><p>${esc(address.label)} · ${esc(labels[input.type])} · 직선 ${input.radiusKm}km</p><p>${selectedLabels.length ? `확인 조건: ${selectedLabels.map(esc).join(' · ')}` : '별도 희망조건 없이 거리와 공개정보를 함께 확인합니다.'}</p></div><div class="analysis-summary-stat"><span>위치 확인 후보</span><strong>${size.toLocaleString()}곳</strong><small>선택 반경 안</small></div><div class="analysis-summary-stat"><span>${input.selected.size ? '모든 조건 확인' : '표시 기준'}</span><strong>${input.selected.size ? `${chosen.allConfirmed.length.toLocaleString()}곳` : '거리순'}</strong><small>${input.selected.size ? '공개정보 기준' : '가까운 곳부터'}</small></div><div class="analysis-summary-stat"><span>위치 추가 확인</span><strong>${report.unknownLocation.length.toLocaleString()}곳</strong><small>반경 포함 여부 미확인</small></div></section>
        ${featureError || photoError ? `<div class="analysis-warning" role="status">${featureError ? '특화서비스' : ''}${featureError && photoError ? '·' : ''}${photoError ? '사진' : ''} 자료를 불러오지 못해 해당 항목을 미확인으로 표시했습니다. <button type="button" data-analysis-retry>자료 다시 확인</button></div>` : ''}
        ${!size ? '<p class="analysis-empty">확인된 위치 중 선택한 범위 안의 기관이 없습니다. 조건 수정에서 범위를 넓히거나 아래 위치 미확인 기관을 살펴보세요.</p>' : ''}
        ${size && report.counts.length ? `<details class="analysis-full-data"><summary>주변 기관의 공개정보 확인 현황</summary><div><p>미확인은 서비스 미제공을 뜻하지 않으며 같은 기관이 여러 항목에 포함될 수 있습니다.</p><div class="analysis-bars">${report.counts.map(count => `<article class="analysis-bar"><header><strong>${esc(count.label)}</strong><span>${count.confirmed} / ${size}곳</span></header><meter min="0" max="${size}" value="${count.confirmed}" aria-label="${esc(count.label)} 확인 ${count.confirmed}곳, 전체 ${size}곳"></meter><p>확인 ${count.confirmed}곳 · 조건과 다름 ${count.different}곳 · 미확인 ${count.unknown}곳</p></article>`).join('')}</div></div></details>` : ''}
        <section class="analysis-section"><div class="analysis-section-head"><div><h3>시설 후보</h3><p>보관할 후보는 여러 곳, 한 번의 비교는 최대 3곳까지 선택합니다.</p></div><div class="analysis-picks"><button type="button" data-analysis-view="nearby" aria-pressed="true">가까운 후보 ${size}곳</button>${input.selected.size ? `<button type="button" data-analysis-view="confirmed" aria-pressed="false">조건 모두 확인 ${chosen.allConfirmed.length}곳</button>` : ''}</div></div><div id="analysisCards" class="analysis-cards"></div><button class="analysis-more" id="analysisMore" type="button" hidden>후보 12곳 더 보기</button></section>
        ${report.unknownLocation.length ? `<section class="analysis-section analysis-warning"><h3>위치 확인이 더 필요한 ${report.unknownLocation.length}곳</h3><p>선택한 반경에 걸친 행정지역의 후보이며 반경 안인지 아직 확인되지 않았습니다.</p><button type="button" data-analysis-retry>미확인 위치 다시 확인</button><details><summary>기관 목록과 주소 보기</summary><ul>${report.unknownLocation.map(row => `<li><a href="${esc(mapUrl(input.type, row))}" rel="nofollow">${esc(row.n)}</a> · ${esc(row.a || '주소 미확인')}</li>`).join('')}</ul></details></section>` : ''}
        <section class="analysis-source">${input.type !== 'nursing-hospital' && size ? gradeTable(report.nearby) : ''}<p>근거: ${input.type === 'nursing-hospital' ? '심평원 개설현황' : '국민건강보험공단 공개 수집 자료'} · 검색 자료 기준일 ${esc(report.sourceDate || '미확인')}${report.featureDate ? ` · 특화서비스 기준일 ${esc(report.featureDate)}` : ''}. 개별 항목의 변경일과 평가연도는 다를 수 있습니다.</p><p>직선거리는 실제 이동시간이나 방문·송영 범위를 뜻하지 않습니다. 공개 정원은 빈자리가 아니며 등록사진은 현재 시설 상태나 촬영일을 보장하지 않습니다.</p></section></section>
        <section class="analysis-stage-panel analysis-compare-panel" data-analysis-panel="compare" hidden></section><section class="analysis-stage-panel" data-analysis-panel="prepare" hidden></section><aside class="analysis-compare-tray" id="analysisCompareTray" aria-label="보관한 비교 후보"></aside>`;
    renderCards(); renderTray(); observeAnalysisEnd();
}
/** SOFTM-CANDIDATE-FACTS START 날짜:20261121 : 비교할 수치를 일정한 위치에 크게 표시하고 긴 질문은 필요할 때 펼쳐 읽도록 분리 */
function candidateFacts(row, type, distance) {
    const cells = [...CareDecisionSummary.summary(row, type).cells];
    if (type === 'dementia' && !cells.some(cell => cell.label === '등록 정원')) {
        cells.splice(1, 0, { label: '등록 정원', value: '유형별 확인', detail: '입소·방문 유형에 따라 다름' });
    }
    cells.unshift({ label: '기준지 거리', value: `${distance.toFixed(1)}km`, detail: '직선거리 기준' });
    return `<dl class="analysis-key-facts" style="--analysis-fact-columns:${cells.length}">${cells.map(cell => `<div><dt>${esc(cell.label)}</dt><dd${cell.value === '미확인' ? ' class="is-unknown"' : ''}>${esc(cell.value)}</dd><small>${esc(cell.detail || (cell.label === '등록 정원' ? '현재 빈자리와 다름' : ''))}</small></div>`).join('')}</dl>`;
}
function candidateCost(row, type) {
    const cost = CareCostPreview.build(type, row);
    if (!cost) return '<section class="analysis-candidate-cost is-unavailable" aria-label="비용 안내"><div><strong>이용 비용</strong><p>이용 내용·기간에 따라 달라요. 기관 상담에서 확인해 주세요.</p></div><b>기관 확인 필요</b></section>';
    return `<section class="analysis-candidate-cost" aria-label="월 예상 본인부담"><div><strong>월 예상 본인부담 <span>공통 조건 예시</span></strong><p>${esc(cost.conditions)}</p></div><b>약 <span>${esc(cost.amount)}</span></b><p class="analysis-cost-note">${esc(cost.year)}년 수가 · ${esc(cost.note)} · 기관별 견적이 아닙니다.</p></section>`;
}
function renderCards({ append = false } = {}) {
    const { report, chosen, input, summaries } = current;
    const confirmed = new Set(chosen.allConfirmed.map(entry => String(entry.row.i)));
    const entries = view === 'confirmed' ? report.nearby.filter(entry => confirmed.has(String(entry.row.i))) : report.nearby;
    const host = $('analysisCards'), start = append ? host.children.length : 0; if (!append) host.replaceChildren();
    if (!entries.length) host.innerHTML = '<p class="analysis-empty">이 항목에 해당하는 후보가 없습니다. 가까운 후보에서 공개 근거와 확인할 질문을 살펴보세요.</p>';
    for (const entry of entries.slice(start, limit)) {
        const { row, distance, conditions } = entry, photo = summaries?.[row.i];
        const card = document.createElement('article'); card.className = 'analysis-card'; card.dataset.institutionId = row.i;
        const heading = document.createElement('header'); heading.className = 'analysis-card-heading';
        if (photo?.representative && photo.count > 0) {
            const figure = thumbnail(photo.representative), button = figure.querySelector('button'); button.tabIndex = 0; button.dataset.analysisPhotos = row.i; button.setAttribute('aria-label', `${row.n} 등록사진 보기`); heading.append(figure);
        } else {
            const placeholder = document.createElement('div'); placeholder.className = 'analysis-card-placeholder'; placeholder.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 21V5l8-3 8 3v16M2 21h20M9 21v-5h6v5M8 7h2m4 0h2M8 11h2m4 0h2"/></svg><span>등록사진 미확인</span>'; heading.append(placeholder);
        }
        const body = document.createElement('div'); body.className = 'analysis-card-body';
        const selectedConditions = conditions.filter(condition => input.selected.has(condition.id)), selectedConfirmed = selectedConditions.filter(condition => condition.status === 'confirmed');
        const verify = questions(entry), badge = selectedConditions.length ? `선택 조건 ${selectedConfirmed.length}/${selectedConditions.length} 확인` : '가까운 거리순';
        heading.insertAdjacentHTML('beforeend', `<div class="analysis-card-identity"><p class="analysis-card-type">${esc(row.tn || labels[input.type])}</p><h3>${esc(row.n)}</h3><p class="analysis-card-address">${esc(row.a || '주소 미확인')}</p></div><div class="analysis-badges"><span>${esc(badge)}</span>${selectedConditions.length && confirmed.has(String(row.i)) ? '<span>희망조건 모두 확인</span>' : ''}</div>`);
        const statusLabels = { confirmed: '✓ 확인', different: '조건과 다름', unknown: '확인 필요' };
        const matching = selectedConditions.length ? `<section class="analysis-condition-matches" aria-label="선택한 조건 확인"><strong>내가 선택한 조건</strong><ul>${selectedConditions.map(condition => `<li data-status="${esc(condition.status)}" title="${esc(condition.evidence)}"><span>${esc(condition.label)}</span><b>${statusLabels[condition.status]}</b></li>`).join('')}</ul></section>` : '';
        body.innerHTML = `${candidateFacts(row, input.type, distance)}${candidateCost(row, input.type)}${matching}<p class="analysis-card-source">${input.type === 'nursing-hospital' ? '심평원 개설현황' : '국민건강보험공단 공개자료'} · 검색자료 기준 ${esc(report.sourceDate || '미확인')}</p><details class="analysis-card-questions"><summary>기관에 확인할 질문 <b>${verify.length}개</b><span aria-hidden="true">⌄</span></summary><p>${esc(CareDecisionSummary.review(row, input.type).note)}</p><ul>${verify.map(question => `<li>${esc(question)}</li>`).join('')}</ul></details><div class="analysis-card-actions"><button type="button" data-analysis-save="${esc(row.i)}" aria-pressed="false">비교 후보에 담기</button><a href="${esc(mapUrl(input.type, row))}" rel="nofollow">기관 상세</a>${photo?.count > 0 ? `<button type="button" data-analysis-photos="${esc(row.i)}">사진 보기</button>` : ''}</div>`;
        card.append(heading, body); host.append(card);
    }
    $('analysisMore').hidden = entries.length <= limit;
    syncBasket(); scheduleAnalysisMore();
}
/** SOFTM-CANDIDATE-FACTS END */
function renderTray() {
    const host = $('analysisCompareTray'); if (!host || !current) return;
    const rows = basketRows(), active = new Set(activeRows().map(row => String(row.i)));
    host.innerHTML = `<div class="analysis-compare-tray-copy"><strong>비교 후보 ${rows.length}곳</strong><span>${rows.length ? `최대 3곳 선택 · 현재 ${active.size}곳` : '후보 카드에서 시설을 보관해 주세요.'}</span></div><div class="analysis-compare-tray-list">${rows.map(row => `<button type="button" data-analysis-active="${esc(row.i)}" aria-pressed="${active.has(String(row.i))}" title="${esc(row.n)}">${esc(row.n)}</button>`).join('')}</div><button type="button" class="analysis-primary" data-analysis-go="compare" ${active.size < 2 ? 'disabled' : ''}>${active.size < 2 ? '2곳 이상 선택' : `${active.size}곳 비교하기`}</button>`;
}
function renderFullDataTable(rows) {
    if (rows.length < 2) return '';
    return `<div class="analysis-table-wrap"><table class="analysis-table"><caption>선택한 시설의 공개자료 전체 보기</caption><thead><tr><th scope="col">시설명</th><th scope="col">기관 평가</th><th scope="col">정원</th><th scope="col">간호 인력</th><th scope="col">요양보호사</th><th scope="col">지정·개설일</th><th scope="col">주소</th></tr></thead><tbody>${rows.map(row => { const nursingKnown = [row.rn, row.na].some(value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))); return `<tr><th scope="row">${esc(row.n)}</th><td>${esc(evaluation(row, current.input.type))}</td><td>${Number(row.z) > 0 ? `${Number(row.z)}명` : '미확인'}</td><td>${row.staffMissing ? '일부 미확인' : nursingKnown ? `${(Number(row.rn) || 0) + (Number(row.na) || 0)}명` : '미확인'}</td><td>${row.staffMissing || row.cw === null || row.cw === undefined || row.cw === '' || !Number.isFinite(Number(row.cw)) ? '미확인' : `${Number(row.cw)}명`}</td><td>${esc(row.d || '미확인')}</td><td>${esc(row.a || '미확인')}</td></tr>`; }).join('')}</tbody></table></div>`; // SOFTM-STAFF-UNKNOWN 날짜:20261120 : 두 간호 인력 항목이 모두 비어 있으면 0명 대신 미확인으로 표시
}
function renderComparison() {
    const host = document.querySelector('[data-analysis-panel="compare"]'); if (!host || !current) return;
    const rows = activeRows(), allRows = basketRows(), selectedCriteria = current.input.criteria.filter(item => current.input.selected.has(item.id)).map(item => item.label);
    host.innerHTML = `<header class="analysis-stage-heading"><div><span>시설 찾기 · 3단계</span><h2 tabindex="-1">선택한 시설을 같은 기준으로 비교합니다</h2><p>평가연도와 미확인 상태를 함께 읽고 실제 이용 가능 여부는 상담에서 확인하세요.</p></div><button type="button" data-analysis-go="candidates">후보 다시 보기</button></header>${CareComparisonWorkspace.render({ rows, allRows, activeIds: rows.map(row => row.i), type: current.input.type, source: current.input.type === 'nursing-hospital' ? 'hira' : 'nhis', sourceDate: current.report.sourceDate, selectedCriteria })}<details class="analysis-full-data"><summary>전체 공개자료 표 보기</summary><div>${renderFullDataTable(rows)}<p><a href="${esc(mapBasketLink())}" rel="nofollow">지도 비교함에서 정렬·엑셀 다운로드 이용</a></p></div></details><div class="analysis-compare-actions"><button type="button" data-analysis-go="candidates">후보 추가·교체</button><button type="button" class="analysis-primary" data-analysis-go="prepare" ${rows.length ? '' : 'disabled'}>상담 질문 준비</button></div>`;
    void CareComparisonWorkspace.mountCosts(host,{type:current.input.type,rows}); // SOFTM-PERSONAL-COST 날짜:20261121 : 맞춤 비교표에 공식 급여 계산과 개인 등급 연결
}
function consultationKey() { return `careConsultation:v1:${current.input.type}`; }
function readConsultation() { try { const value = JSON.parse(storage?.getItem(consultationKey()) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } }
function writeConsultation(value) { try { storage?.setItem(consultationKey(), JSON.stringify(value)); } catch {} }
function renderConsultation() {
    const host = document.querySelector('[data-analysis-panel="prepare"]'); if (!host || !current) return;
    const rows = activeRows(), checked = readConsultation();
    const cards = rows.map(row => {
        const entry = current.report.nearby.find(item => String(item.row.i) === String(row.i)) || { row, conditions: [] }, items = questions(entry);
        const previous = consultationRecords().find(record => record.key === `${current.input.type}:${row.i}`);
        const record = ensureRecord(current.input.type, row, items);
        if (!previous && Array.isArray(checked[row.i])) {
            const legacy = new Set(checked[row.i].map(String));
            items.forEach((question, index) => { const saved = record.questions.find(q => q.id === questionId(question)); if (saved && (legacy.has(String(index)) || legacy.has(saved.id))) saved.checked = true; });
            saveRecord(record);
        }
        const completed = new Set(record.questions.filter(question => question.checked).map(question => question.id));
        return `<article class="analysis-consultation-card"><header><h3>${esc(row.n)}</h3><span>${items.filter(question => completed.has(questionId(question))).length} / ${items.length} 확인</span></header><div class="analysis-question-list">${items.map((question, index) => `<label><input type="checkbox" data-consult-check="${esc(row.i)}" value="${esc(questionId(question))}" ${completed.has(questionId(question)) ? 'checked' : ''}><span>${esc(question)}</span></label>`).join('')}</div><a href="care-record.html?key=${encodeURIComponent(record.key)}">답변·방문 기록 이어가기 →</a></article>`;
    }).join('');
    host.innerHTML = `<header class="analysis-stage-heading"><div><span>시설 찾기 · 4단계</span><h2 tabindex="-1">전화와 방문 전에 질문을 준비하세요</h2><p>체크 상태는 상담 기록과 연결됩니다. 계정 저장과 기록 공유는 직접 선택할 수 있습니다.</p></div><button type="button" data-analysis-go="compare">비교표로 돌아가기</button></header><div class="analysis-consultation-layout"><div class="analysis-consultation-list">${cards || '<p class="analysis-empty">상담을 준비할 시설을 먼저 선택해 주세요.</p>'}</div><aside class="analysis-consultation-side"><section id="analysisGuardianContact"></section><section><h3>가족과 후보 공유</h3><p>공개 기관기호만 담긴 링크로 같은 시설을 다시 확인할 수 있습니다.</p><button type="button" class="analysis-primary" data-analysis-share>비교 시설 공유</button><p id="analysisShareStatus" role="status" aria-live="polite"></p></section><section><h3>방문용 확인표</h3><p>주소와 개인 조건 없이 현재 질문표만 인쇄합니다.</p><button type="button" data-analysis-print>질문표 인쇄</button></section><section><h3>지도에서 이어보기</h3><p>보관한 전체 후보의 위치·상세정보·경로를 확인합니다.</p><a class="analysis-action" href="${esc(mapBasketLink())}" rel="nofollow">담은 기관 지도 보기</a></section><section class="analysis-session-note"><strong>다른 기기에서도 이어보기</strong><p>상담 기록에서 답변을 작성하고 계정에 저장할 수 있습니다.</p><a class="analysis-action" href="care-records.html">상담 기록 열기</a></section></aside></div>`;
    void mountGuardianContact($('analysisGuardianContact')); // SOFTM-GUARDIAN 날짜:20261120 : 상담 회신을 받을 계정 소유자 표시

}
function syncBasket() {
    if (!current) return;
    comparisonSelection?.sync(basketRows(), false);
    document.querySelectorAll('[data-analysis-save]').forEach(button => { const saved = current.basket.has(button.dataset.analysisSave); button.setAttribute('aria-pressed', String(saved)); button.textContent = saved ? '후보 보관됨' : '비교 후보에 담기'; button.closest('.analysis-card')?.classList.toggle('is-saved', saved); }); // SOFTM-CANDIDATE-FACTS 날짜:20261121 : 담은 기관은 버튼과 카드 테두리에서 함께 구분
    renderTray(); setStep(currentStep, { focus: false });
}
async function shareComparison() {
    const status = $('analysisShareStatus'), ids = activeRows().map(row => String(row.i)); if (!status) return;
    if (!ids.length) { status.textContent = '공유할 시설을 먼저 선택해 주세요.'; return; }
    let url;
    try { url = CareBasketShare.createUrl(location.href, current.input.type, ids); }
    catch (error) { status.textContent = error.message; return; }
    if (navigator.share) {
        const result = await CareBasketShare.shareLink({ title: `돌봄한눈 · 비교 시설 ${ids.length}곳`, url });
        if (result === 'cancelled') return;
        if (result === 'shared') { status.textContent = '가족에게 공유했습니다.'; return; }
    }
    if (await CareBasketShare.copyLink(url)) { status.textContent = '비교 시설 공유 링크를 복사했습니다.'; return; }
    status.replaceChildren(); const link = document.createElement('a'); link.href = url; link.textContent = '공유 링크 열기'; link.rel = 'nofollow'; status.append('자동 복사가 제한됐습니다. ', link);
}
/** SOFTM-GUIDED-COMPARE END */
$('analysisType').innerHTML = Object.entries(labels).map(([type, label]) => `<option value="${type}">${label}</option>`).join('');
renderTypeChoices(); // SOFTM-ANALYSIS-TYPES 날짜:20261121 : 기존 URL·저장 조건 복원 전에 접근 가능한 9개 유형 카드 생성
const initialType = new URLSearchParams(location.search).get('type');
$('analysisType').value = Object.hasOwn(labels, initialType) ? initialType : 'daycare'; renderCriteria();
const savedConditions = sharedConditions();
if(savedConditions && (!initialType || savedConditions.type === initialType)) {
    $('analysisType').value = savedConditions.type; renderCriteria();
    $('analysisAddress').value = savedConditions.address || [savedConditions.province,savedConditions.city].filter(Boolean).join(' ');
    $('analysisRadius').value = savedConditions.radius || 3;
    $('analysisCriteria').querySelectorAll('input').forEach(input => input.checked = savedConditions.preferences?.includes(input.value));
    updateConditionSummary();
} // SOFTM-MEMBERS 날짜:20261120 : 재진입에서도 같은 조건을 사용

/** SOFTM-ANALYSIS-ORIGIN START 날짜:20260911 : 지도에서 온 위치를 우선하고 직접 진입은 현재 위치로 채우며 수동 입력을 보존 */
originController = createOriginBinding({
    locate: options => bounded(CareLocation.request(options), 36000),
    describe: async point => { await loadSdk(); const address = await bounded(NaverGeocoder.reverseGeocode(point.lat, point.lng), 10000); return address?.fullAddress || address?.address || ''; },
    changed: state => {
        $('analysisLocate').disabled = state.phase === 'loading';
        $('analysisRun').disabled = busy || state.phase === 'loading';
        if (state.phase === 'ready') {
            $('analysisAddress').value = state.label; updateConditionSummary(); // SOFTM-GUIDED-COMPARE 날짜:20261119 : 자동 위치 주소도 조건 요약에 즉시 반영
            $('analysisOriginStatus').textContent = `${state.source === 'map' ? '지도에서 보고 있던 위치' : '현재 위치'}가 기본 적용됐습니다. 다른 곳을 원하면 주소를 바꿔 주세요.`;
            if (!busy && !current) $('analysisStatus').textContent = '기준 위치가 준비됐습니다. 추천 후보 보기를 눌러 주세요.'; // SOFTM-ANALYSIS-ORIGIN 날짜:20260911 : 기본값이 채워진 뒤 주소 재입력을 요구하는 안내를 남기지 않음
        } else if (state.phase === 'loading') $('analysisOriginStatus').textContent = '기준 위치를 자동으로 확인하고 있습니다. 주소를 직접 입력해도 됩니다.';
        else if (state.phase === 'error') $('analysisOriginStatus').textContent = `${state.error} 주소를 직접 입력하거나 현재 위치를 다시 눌러 주세요.`;
        else $('analysisOriginStatus').textContent = '입력한 주소를 기준으로 분석합니다.';
    }
});
$('analysisAddress').addEventListener('input', () => { originController.clear(); updateConditionSummary(); });
$('analysisLocate').onclick = () => { invalidate('현재 위치를 기준으로 분석할 준비를 합니다.'); $('analysisAddress').value = ''; void originController.locate(); };
const savedPoint = readOrigin(storage, new URLSearchParams(location.search).get('origin'), $('analysisType').value);
if (savedPoint) void originController.bind(savedPoint);
else if (!$('analysisAddress').value.trim()) void originController.locate();
/** SOFTM-ANALYSIS-ORIGIN END */
$('analysisForm').addEventListener('submit', submit);
$('analysisForm').addEventListener('input', () => { const input = draft(); saveConditions({type:input.type,address:input.address,radius:input.radiusKm,preferences:[...input.manualSelected]}); updateConditionSummary(); if (busy || current || !$('analysisAddressChoices').hidden) invalidate(); });
$('analysisType').addEventListener('change', () => { invalidate(); renderCriteria(); renderRecipient(); });
$('analysisCriteria').addEventListener('change', () => { const count = $('analysisCriteria').querySelectorAll('input:checked').length; $('analysisPreferenceCount').textContent = count ? `${count}개 선택` : '선택 안 함'; updateConditionSummary(); });
$('analysisCancel').onclick = () => invalidate('분석을 취소했습니다. 입력한 조건은 유지됩니다.');
$('analysisRadius').addEventListener('change', updateConditionSummary); // SOFTM-GUIDED-COMPARE 날짜:20261119 : 거리 선택과 요약 카드 문구를 즉시 일치
document.querySelector('.analysis-stepper').addEventListener('click', event => { const button = event.target.closest('[data-analysis-step]'); if (button && !button.disabled) setStep(button.dataset.analysisStep, { push: true }); });
$('analysisResults').addEventListener('click', event => {
    if (!current) return;
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-analysis-retry')) { const { input, address } = current; invalidate('확인되지 않은 자료를 다시 확인합니다.'); void run(input, address, generation); }
    else if (button.dataset.analysisView) { view = button.dataset.analysisView; limit = 12; document.querySelectorAll('[data-analysis-view]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.analysisView === view))); renderCards(); }
    else if (button.id === 'analysisMore') showMoreCards(); // SOFTM-ANALYSIS-AUTOLOAD 날짜:20260911 : 자동 로드 미지원 환경의 수동 더보기도 같은 추가 방식으로 처리
    else if (button.dataset.analysisSave) {
        const id = button.dataset.analysisSave, wasSaved = current.basket.has(id); current.basket.toggle(id);
        const rows = basketRows(); comparisonSelection.sync(rows, false);
        if (!wasSaved && comparisonSelection.ids().length < 3) comparisonSelection.toggle(id, rows);
        syncBasket(); $('analysisStatus').textContent = wasSaved ? `비교 후보에서 뺐습니다. 현재 ${current.basket.ids().length}곳을 보관 중입니다.` : `비교 후보에 담았습니다. 현재 ${current.basket.ids().length}곳을 보관 중입니다.`;
    }
    else if (button.dataset.analysisActive || button.dataset.comparisonSelect) {
        const id = button.dataset.analysisActive || button.dataset.comparisonSelect, result = comparisonSelection.toggle(id, basketRows());
        if (result.reason === 'limit') $('analysisStatus').textContent = '한 번에 최대 3곳까지 비교할 수 있습니다. 선택한 시설 하나를 먼저 해제해 주세요.';
        else $('analysisStatus').textContent = `비교할 시설 ${result.ids.length}곳을 선택했습니다.`;
        renderTray(); if (currentStep === 'compare') renderComparison(); setStep(currentStep, { focus: false });
    }
    else if (button.dataset.analysisGo) setStep(button.dataset.analysisGo, { push: true });
    else if (button.dataset.comparisonDetail) { const row = current.rowById.get(String(button.dataset.comparisonDetail)); if (row) location.href = mapUrl(current.input.type, row); }
    else if (button.hasAttribute('data-analysis-share')) void shareComparison();
    else if (button.hasAttribute('data-analysis-print')) window.print();
    else if (button.dataset.analysisPhotos) { const row = current.report.nearby.find(entry => String(entry.row.i) === button.dataset.analysisPhotos)?.row; if (row) openComparison({ rows: [row], type: current.input.type, opener: button, title: `${row.n} 등록사진` }); }
});
$('analysisResults').addEventListener('change', event => {
    const input = event.target.closest('[data-consult-check]'); if (!input || !current) return;
    const state = readConsultation(), id = input.dataset.consultCheck;
    state[id] = [...document.querySelectorAll(`[data-consult-check="${CSS.escape(id)}"]:checked`)].map(item => item.value); writeConsultation(state);
    const record = consultationRecords().find(record => record.key === `${current.input.type}:${id}`);
    if (record) { const question = record.questions.find(question => question.id === input.value); if (question) { question.checked = input.checked; saveRecord(record); } }
    const card = input.closest('.analysis-consultation-card'), total = card.querySelectorAll('[data-consult-check]').length, completed = card.querySelectorAll('[data-consult-check]:checked').length;
    card.querySelector('header span').textContent = `${completed} / ${total} 확인`;
});
window.addEventListener('pagehide', () => { generation++; originController.cancel(); if (busy) { setBusy(false); $('analysisStatus').textContent = '분석이 중단되었습니다. 입력 조건을 확인하고 다시 분석해 주세요.'; } }); // SOFTM-ANALYSIS-ORIGIN 날짜:20260911 : 화면 이탈 뒤 자동 위치 응답도 차단
window.addEventListener('pageshow', () => { if (current) { current.basket = CareMapExperience.createBasket(storage, current.input.type); current.basket.retain(new Set(current.rows.map(row => String(row.i)))); comparisonSelection = CareComparisonWorkspace.createSelection(storage, current.input.type, 3); comparisonSelection.sync(basketRows(), true); syncBasket(); } });
window.addEventListener('popstate', event => setStep(event.state?.analysisStep || (current ? 'candidates' : 'conditions'), { focus: false }));
history.replaceState({ ...history.state, analysisStep: 'conditions' }, '', location.href); updateConditionSummary(); // SOFTM-GUIDED-COMPARE 날짜:20261119 : 새로고침 주소에 돌봄 조건을 노출하지 않고 단계 기록만 브라우저 상태로 보존
/** SOFTM-CARE-ANALYSIS END */

void loadRecipient(); // SOFTM-GUARDIAN 날짜:20261120 : 검색 UI를 막지 않고 개인 대상자 정보를 별도로 불러옴
window.addEventListener('pageshow',event=>{if(event.persisted)void loadRecipient();}); // SOFTM-GUARDIAN 날짜:20261120 : 뒤로가기로 복원한 대상자도 현재 계정과 저장 상태를 다시 확인
