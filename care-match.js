/** SOFTM-CARE-MATCH START 날짜:20260910 : 짧은 질문으로 중요 조건을 받고 기존 검색 결과를 제외하거나 재정렬하지 않은 채 선택 근거를 제공 */
const { criteriaFor, analyzeMatch, renderConditions } = await import(`./care-insights.js?v=20260910-match1&attempt=${new URL(import.meta.url).searchParams.get('attempt') || '0'}`);
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const key = 'careMatch:v1';
const gradeLabels = { A: 'A등급', B: 'B등급', C: 'C등급', D: 'D등급', E: 'E등급', new: '신설', unknown: '미확인' };
const scoreLabels = { high: '90점 이상', mid: '80~90점 미만', low: '70~80점 미만', lowest: '70점 미만', unknown: '점수 미확인' };
const confidenceLabels = { high: '공개 평가 확인', medium: '신설·미평가', low: '평가 미확인' };
const staffLabels = { rehab: '물리·작업치료사 있음', nurse: '간호사 있음', nursing: '간호사·간호조무사 있음', new: '지정 3년 이내' };
export function readPreferences(storage) {
    try {
        const saved = JSON.parse(storage?.getItem(key) || 'null');
        return { active: saved?.active === true, type: typeof saved?.type === 'string' ? saved.type : '', preferences: Array.isArray(saved?.preferences) ? [...new Set(saved.preferences.filter(value => typeof value === 'string'))].slice(0, 20) : [] };
    } catch { return { active: false, type: '', preferences: [] }; }
}
export function relevantPreferences(saved, type) {
    const allowed = new Set(criteriaFor(type).map(item => item.id));
    return { preferences: saved.preferences.filter(id => allowed.has(id)), omitted: saved.preferences.filter(id => !allowed.has(id)) };
}
export function effectiveFilters(filters, type) {
    return { ...filters, capacity: ['facility', 'daycare', 'short-stay', 'dementia'].includes(type) ? filters.capacity : '', staff: ['nursing-hospital', 'welfare-equipment'].includes(type) ? '' : filters.staff, grades: type === 'nursing-hospital' ? [] : filters.grades || [], scores: type === 'nursing-hospital' ? [] : filters.scores || [], confidences: type === 'nursing-hospital' ? [] : filters.confidences || [], advanced: globalThis.CareAdvancedSearch.sanitize(filters.advanced || {}, type) };
}
export function filterLabels(filters, type) {
    const labels = [];
    if (filters.q) labels.push(`검색어: ${filters.q}`);
    if (filters.grades?.length) labels.push(`기관 평가: ${filters.grades.map(value => gradeLabels[value] || value).join(' 또는 ')}`);
    if (filters.scores?.length) labels.push(`공단 점수: ${filters.scores.map(value => scoreLabels[value] || value).join(' 또는 ')}`);
    if (filters.confidences?.length) labels.push(`평가 공개: ${filters.confidences.map(value => confidenceLabels[value] || value).join(' 또는 ')}`);
    if (filters.capacity) labels.push(`기존 정원 조건: ${filters.capacity}`);
    if (filters.staff) labels.push(`기존 인력 조건: ${staffLabels[filters.staff] || filters.staff}`);
    return labels.concat(globalThis.CareAdvancedSearch.describeState(filters.advanced || globalThis.CareAdvancedSearch.emptyState(), type));
}
export function destinationUrl(draft, filters, base) {
    const url = new URL('nationwide-care-services-map.html', base);
    const p = url.searchParams, effective = effectiveFilters(filters, draft.type);
    p.set('type', draft.type); p.set('p', draft.province);
    if (draft.city) p.set('c', draft.city);
    for (const [param, value] of [['q', effective.q], ['cap', effective.capacity], ['staff', effective.staff], ['grades', effective.grades.join(',')], ['scores', effective.scores.join(',')], ['conf', effective.confidences.join(',')]]) if (value) p.set(param, value);
    globalThis.CareAdvancedSearch.writeState(p, effective.advanced);
    return url;
}
/** SOFTM-MATCH-LIST-COMPACT START 날짜:20260910 : 좁은 목록에서는 실제 확인된 특화서비스만 남겨 기관 기본정보를 빠르게 비교하도록 제한 */
export function compactHighlights(conditions, limit = 2) {
    const confirmed = (conditions || []).filter(condition => condition.status === 'confirmed' && String(condition.id).startsWith('feature:'));
    return { items: confirmed.slice(0, limit), remaining: Math.max(0, confirmed.length - limit) };
}
export function selectedCriteriaFor(type, preferences) {
    const selected = new Set(preferences || []);
    return criteriaFor(type).filter(item => selected.has(item.id));
}
function renderCompactHighlights(conditions) {
    const highlights = compactHighlights(conditions);
    if (!highlights.items.length) return '';
    return `<div class="care-match-list-highlights"><strong>확인된 특화</strong>${highlights.items.map(item => `<span>${escape(item.label)}</span>`).join('')}${highlights.remaining ? `<small>외 ${highlights.remaining}개</small>` : ''}</div>`;
}
/** SOFTM-MATCH-LIST-COMPACT END */
export function mount(config) {
    let storage; try { storage = window.sessionStorage; } catch {}
    let saved = readPreferences(storage), manifest = null, featureIndex = null, featureError = false;
    let featureTask, featureRevision = 0, renderFrame = 0, reportCache = null, reportRows = null, reportSignature = '', dialogGeneration = 0, step = 1, draft, regionRows = [], regionType = '', regionLoading = false, submitting = false;
    /** SOFTM-MATCH-PANEL START 날짜:20260910 : 조건 설정과 선택 결과를 같은 패널에 묶어 하나의 기능으로 인식되도록 구성 */
    const panel = document.createElement('section'); panel.className = 'care-match-panel'; panel.setAttribute('aria-label', '내 조건에 맞는 기관 찾기');
    const start = document.createElement('button'); start.type = 'button'; start.className = 'care-match-start'; start.innerHTML = '<span>내 조건에 맞는 기관 찾기</span><small>서비스·지역·중요 조건 설정</small>';
    const results = document.querySelector('.results'), list = document.getElementById('list');
    results.querySelector('.list-head,.result-head').after(panel); panel.append(start);
    /** SOFTM-MATCH-PANEL END */
    let summaryMarkup = ''; const reasonMarkup = new WeakMap();
    const summary = document.createElement('section'); summary.className = 'care-match-summary'; summary.setAttribute('aria-label', '내 조건으로 살펴본 결과');
    const dialog = document.createElement('dialog'); dialog.className = 'care-match-dialog'; dialog.setAttribute('aria-labelledby', 'careMatchTitle');
    dialog.innerHTML = '<header><div><p class="care-match-step"></p><h2 id="careMatchTitle">내 조건에 맞는 기관 찾기</h2></div><button type="button" data-match-close aria-label="질문 닫기">×</button></header><div class="care-match-dialog-body"></div><p class="care-match-status" role="status"></p><footer><button type="button" data-match-back>이전</button><button type="button" data-match-next>다음</button></footer>';
    document.body.append(dialog);
    const body = dialog.querySelector('.care-match-dialog-body'), status = dialog.querySelector('.care-match-status');
    const context = () => {
        const relevant = relevantPreferences(saved, config.type);
        return { type: config.type, preferences: saved.active ? relevant.preferences : [], sourceDate: manifest?.[config.type]?.sourceDate, featureDate: featureIndex?.sourceDate, featureError, hasFeature: featureIndex ? globalThis.CareAdvancedSearch.createMatcher(featureIndex, config.type).hasFeature : null };
    };
    function invalidate() { reportRows = null; config.onChange?.(); refresh(); }
    async function evidence() {
        if (featureTask || featureIndex) return featureTask;
        const revision = ++featureRevision;
        featureTask = globalThis.CareAdvancedSearch.loadIndex().then(index => {
            if (revision === featureRevision) { featureIndex = index; featureError = false; }
        }).catch(() => { if (revision === featureRevision) featureError = true; }).finally(() => {
            if (revision === featureRevision) { featureTask = null; invalidate(); }
        });
        return featureTask;
    }
    function renderResults() {
        renderFrame = 0;
        const snapshot = config.snapshot();
        if (!saved.active) {
            panel.classList.remove('active'); start.innerHTML = '<span>내 조건에 맞는 기관 찾기</span><small>서비스·지역·중요 조건 설정</small>'; summary.remove();
            list.querySelectorAll('.care-match-reasons').forEach(node => node.remove()); return;
        }
        const relevant = relevantPreferences(saved, config.type), ctx = context();
        if (ctx.preferences.some(id => id.startsWith('feature:')) && !featureIndex && !featureError && !featureTask) void evidence();
        const signature = JSON.stringify([ctx.preferences, ctx.sourceDate, ctx.featureDate, ctx.featureError, snapshot.scope, snapshot.pending]);
        if (snapshot.rows !== reportRows || signature !== reportSignature) {
            reportCache = analyzeMatch(snapshot.rows, { ...ctx, scope: snapshot.scope }); reportRows = snapshot.rows; reportSignature = signature;
        }
        const report = reportCache, selectedCriteria = selectedCriteriaFor(config.type, ctx.preferences);
        const filters = filterLabels(snapshot.filters, config.type), scope = snapshot.scope || [snapshot.province, snapshot.city].filter(Boolean).join(' ') || '전국';
        /** SOFTM-MATCH-PANEL START 날짜:20260910 : 선택값을 설정 버튼 바로 아래 칩으로 보여주고 상세 집계는 접어서 목록 흐름을 유지 */
        panel.classList.add('active');
        start.innerHTML = `<span>내 조건에 맞는 기관 찾기</span><small>${selectedCriteria.length ? `${selectedCriteria.length}개 선택 · 수정` : '중요 조건 선택 안 함 · 수정'}</small>`;
        const selectedMarkup = selectedCriteria.length ? selectedCriteria.map(item => `<span class="care-match-selected-chip">${escape(item.label)}</span>`).join('') : '<span class="care-match-selected-empty">중요 조건 선택 안 함</span>';
        const resultMarkup = snapshot.pending || snapshot.error ? (snapshot.error ? '<p role="status">검색을 완료하지 못했습니다. 다시 조회하면 조건별 집계를 확인할 수 있습니다.</p>' : '<p role="status">검색 결과 확인 중입니다.</p>') : `<p class="care-match-result-count">전체 후보 <b>${report.total.toLocaleString()}곳</b></p><details><summary>선택 조건 확인 현황</summary>${report.counts.length ? `<ul>${report.counts.map(item => `<li><b>${escape(item.label)}</b><span>확인 ${item.confirmed}곳 · 조건과 다름 ${item.different}곳 · 미확인 ${item.unknown}곳</span></li>`).join('')}</ul>` : '<p>선택한 중요 조건이 없습니다.</p>'}</details>`;
        const markup = `<div class="care-match-selection"><b>${escape(manifest?.[config.type]?.label || '')} · ${escape(scope)}</b><div class="care-match-selected-list" aria-label="선택한 중요 조건">${selectedMarkup}</div></div>${resultMarkup}<p class="care-match-guidance">선택 조건은 후보를 제외하거나 순위를 바꾸지 않고 공개정보 확인에 사용됩니다.</p>${filters.length ? `<details><summary>적용 중인 기존 검색조건 ${filters.length}개</summary><ul>${filters.map(label => `<li>${escape(label)}</li>`).join('')}</ul></details>` : ''}${relevant.omitted.length ? '<p class="care-match-note">이 카테고리에서 지원하지 않는 중요 조건은 적용하지 않았습니다. 원래 카테고리로 돌아가면 다시 표시됩니다.</p>' : ''}${featureError ? '<p>특화서비스 자료를 불러오지 못했습니다. 검색 결과는 계속 이용할 수 있습니다.</p><button type="button" data-match-retry>설명 자료 다시 불러오기</button>' : ''}${snapshot.filters.capacity ? '<button type="button" data-match-clear="capacity">기존 정원 조건 해제</button>' : ''}${snapshot.filters.staff ? '<button type="button" data-match-clear="staff">기존 인력 조건 해제</button>' : ''}`;
        /** SOFTM-MATCH-PANEL END */
        if (summaryMarkup !== markup) { const expanded = [...summary.querySelectorAll('details')].map(node => node.open); summary.innerHTML = markup; summary.querySelectorAll('details').forEach((node, index) => { node.open = !!expanded[index]; }); summaryMarkup = markup; }
        if (summary.parentElement !== panel) panel.append(summary); // SOFTM-MATCH-PANEL 날짜:20260910 : 선택 결과가 설정 버튼과 떨어져 목록 카드처럼 보이지 않도록 같은 패널에 유지
        const byId = new Map(report.cards.map(card => [card.id, card]));
        list.querySelectorAll('.row').forEach(row => {
            const id = row.dataset.id || row.querySelector('[data-care-basket]')?.dataset.careBasket;
            const conditions = byId.get(String(id))?.conditions || [];
            let host = row.querySelector('.care-match-reasons');
            if (snapshot.pending || snapshot.error || !conditions.length) { host?.remove(); return; }
            /** SOFTM-MATCH-LIST-COMPACT START 날짜:20260910 : 평가·인력·미확인 사유의 카드별 반복을 없애고 확인된 특화 항목만 짧게 노출 */
            const html = renderCompactHighlights(conditions);
            if (!html) { host?.remove(); return; }
            if (!host) { host = document.createElement('section'); host.className = 'care-match-reasons'; host.setAttribute('aria-label', '확인된 특화서비스'); row.querySelector('.care-row-actions').before(host); host.addEventListener('click', event => event.stopPropagation()); host.addEventListener('keydown', event => event.stopPropagation()); }
            if (reasonMarkup.get(host) !== html) { host.innerHTML = html; reasonMarkup.set(host, html); }
            /** SOFTM-MATCH-LIST-COMPACT END */
        });
    }
    function refresh() { if (!renderFrame) renderFrame = requestAnimationFrame(renderResults); }
    summary.addEventListener('click', event => {
        if (event.target.closest('[data-match-clear]')) config.clearLegacy?.(event.target.closest('[data-match-clear]').dataset.matchClear);
        if (event.target.closest('[data-match-edit]')) void open();
        if (event.target.closest('[data-match-retry]')) { featureError = false; void evidence(); refresh(); }
    });
    function close() { dialogGeneration++; submitting = false; dialog.close(); }
    function setStatus(text) { status.textContent = text; }
    function controls() {
        dialog.querySelector('[data-match-back]').hidden = step === 1;
        dialog.querySelector('[data-match-next]').textContent = step === 3 || step === 2 && !criteriaFor(draft.type).length ? '결과 보기' : '다음';
        dialog.querySelector('[data-match-next]').disabled = !manifest || regionLoading || submitting;
        dialog.querySelector('.care-match-step').textContent = `${step} / ${criteriaFor(draft.type).length ? 3 : 2} 단계`;
    }
    function confirmation() {
        const original = config.snapshot(), effective = effectiveFilters(original.filters, draft.type), retained = filterLabels(effective, draft.type);
        const criteria = criteriaFor(draft.type).filter(item => draft.preferences.includes(item.id));
        const before = filterLabels(original.filters, config.type), omitted = before.filter(label => !retained.includes(label));
        return `<section class="care-match-confirm"><h3>이 조건으로 살펴볼게요</h3><p>${escape(manifest[draft.type].label)} · ${escape(draft.province || '시도를 선택해 주세요')}${draft.city ? ` · ${escape(draft.city)}` : ''}</p><p>중요 조건: ${criteria.length ? criteria.map(item => escape(item.label)).join(', ') : '선택 안 함'}</p><h4>유지되는 기존 검색조건</h4>${retained.length ? `<ul>${retained.map(label => `<li>${escape(label)}</li>`).join('')}</ul>` : '<p>추가 조건 없음</p>'}${omitted.length ? `<p>서비스 유형이 달라 적용할 수 없는 기존 조건: ${omitted.map(escape).join(', ')}</p>` : ''}<p>중요 조건은 후보를 제외하지 않습니다. 현재 정렬 기준을 유지합니다.</p></section>`;
    }
    function renderStep() {
        setStatus('');
        if (step === 1) body.innerHTML = `<h3 tabindex="-1">어떤 서비스를 찾으세요?</h3><label for="careMatchType">찾는 서비스</label><select id="careMatchType">${Object.entries(manifest).map(([type, meta]) => `<option value="${escape(type)}" ${type === draft.type ? 'selected' : ''}>${escape(meta.label)}</option>`).join('')}</select><p>서비스 종류는 직접 선택해 주세요. 건강상태로 필요한 서비스를 추정하지 않습니다.</p>`;
        else if (step === 2) {
            const provinces = [...new Set(regionRows.map(row => row.p).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
            body.innerHTML = `<h3 tabindex="-1">어느 지역에서 찾으세요?</h3><label for="careMatchProvince">시도 <span>(필수)</span></label><select id="careMatchProvince" required><option value="">시도 선택</option>${provinces.map(province => `<option ${province === draft.province ? 'selected' : ''}>${escape(province)}</option>`).join('')}</select><label for="careMatchCity">시군구 <span>(선택)</span></label><select id="careMatchCity"></select>${criteriaFor(draft.type).length ? '' : '<p>이 유형은 현재 자료에서 비교 가능한 중요 조건이 없어 지역 선택 후 결과로 진행합니다.</p><div class="care-match-confirm-host"></div>'}`;
            cities(); if (!criteriaFor(draft.type).length) body.querySelector('.care-match-confirm-host').innerHTML = confirmation();
        } else {
            body.innerHTML = `<h3 tabindex="-1">어떤 정보를 중요하게 보세요?</h3><p>여러 개를 선택하거나 선택 없이 결과를 볼 수 있습니다.</p><fieldset class="care-match-choices"><legend>중요하게 보는 조건</legend>${criteriaFor(draft.type).map(item => `<label><input type="checkbox" value="${escape(item.id)}" ${draft.preferences.includes(item.id) ? 'checked' : ''}><span>${escape(item.label)}</span></label>`).join('')}</fieldset><button type="button" data-match-skip>조건 선택 건너뛰기</button><div class="care-match-confirm-host">${confirmation()}</div>`;
        }
        controls(); body.scrollTop = 0; body.querySelector('h3')?.focus({ preventScroll: true });
    }
    function cities() {
        const values = [...new Set(regionRows.filter(row => row.p === draft.province).map(row => row.c).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
        if (!values.includes(draft.city)) draft.city = '';
        body.querySelector('#careMatchCity').innerHTML = '<option value="">전체 시군구</option>' + values.map(city => `<option ${city === draft.city ? 'selected' : ''}>${escape(city)}</option>`).join('');
    }
    async function loadRegions() {
        const generation = ++dialogGeneration, type = draft.type;
        regionLoading = true; controls(); setStatus('지역 목록을 불러오고 있습니다…');
        try {
            const rows = type === config.type ? config.allRows() : await globalThis.CareData.category(type);
            if (generation !== dialogGeneration || !dialog.open) return false;
            regionRows = rows; regionType = type;
            if (!rows.some(row => row.p === draft.province)) { draft.province = ''; draft.city = ''; }
            return true;
        } catch { if (generation === dialogGeneration && dialog.open) setStatus('지역 목록을 불러오지 못했습니다. 다음 버튼을 눌러 다시 시도해 주세요.'); return false; }
        finally { if (generation === dialogGeneration) { regionLoading = false; controls(); } }
    }
    async function open() {
        const snapshot = config.snapshot();
        draft = { type: config.type, province: snapshot.province || '', city: snapshot.city || '', preferences: relevantPreferences(saved, config.type).preferences };
        step = 1; regionLoading = false; submitting = false; dialog.showModal();
        if (!manifest) {
            body.innerHTML = '<p>서비스 목록을 불러오고 있습니다…</p>'; controls();
            const generation = ++dialogGeneration;
            try { const next = await globalThis.CareData.manifest(); if (generation !== dialogGeneration || !dialog.open) return; manifest = next; }
            catch { if (generation === dialogGeneration) { setStatus('서비스 목록을 불러오지 못했습니다. 닫은 뒤 다시 시도해 주세요.'); dialog.querySelector('[data-match-next]').disabled = true; } return; }
        }
        renderStep();
    }
    async function submit() {
        if (!draft.province || regionType !== draft.type || !regionRows.some(row => row.p === draft.province && (!draft.city || row.c === draft.city))) { step = 2; renderStep(); setStatus('조회할 시도를 선택해 주세요.'); return; }
        submitting = true; controls();
        const next = { active: true, type: draft.type, preferences: draft.preferences };
        if (draft.type !== config.type) {
            try { if (!storage) throw new Error('session unavailable'); storage.setItem(key, JSON.stringify(next)); } catch { submitting = false; controls(); setStatus('브라우저 저장소를 사용할 수 없어 다른 서비스로 조건을 전달하지 못했습니다. 현재 서비스에서는 계속 사용할 수 있습니다.'); return; }
            window.location.assign(destinationUrl(draft, config.snapshot().filters, document.baseURI)); return;
        }
        saved = next; try { storage?.setItem(key, JSON.stringify(saved)); } catch {}
        const region = { province: draft.province, city: draft.city }; close(); invalidate();
        try { await config.applyRegion(region); refresh(); } catch { summary.innerHTML = '<p>조회가 완료되지 않았습니다. 기존 조회 버튼으로 다시 시도해 주세요.</p>'; }
    }
    body.addEventListener('change', event => {
        if (event.target.id === 'careMatchType') { dialogGeneration++; regionLoading = false; regionType = ''; draft.type = event.target.value; draft.preferences = relevantPreferences({ preferences: draft.preferences }, draft.type).preferences; controls(); }
        if (event.target.id === 'careMatchProvince') { draft.province = event.target.value; draft.city = ''; cities(); }
        if (event.target.id === 'careMatchCity') draft.city = event.target.value;
        if (event.target.matches('.care-match-choices input')) draft.preferences = [...body.querySelectorAll('.care-match-choices input:checked')].map(input => input.value);
        const confirm = body.querySelector('.care-match-confirm-host'); if (confirm) confirm.innerHTML = confirmation();
    });
    body.addEventListener('click', event => { if (event.target.closest('[data-match-skip]')) { draft.preferences = []; void submit(); } });
    dialog.querySelector('[data-match-next]').addEventListener('click', async () => {
        if (step === 1) { if (await loadRegions()) { step = 2; renderStep(); } }
        else if (step === 2 && !draft.province) { setStatus('조회할 시도를 선택해 주세요.'); body.querySelector('#careMatchProvince').focus(); }
        else if (step === 2 && criteriaFor(draft.type).length) { step = 3; renderStep(); }
        else void submit();
    });
    dialog.querySelector('[data-match-back]').addEventListener('click', () => { dialogGeneration++; regionLoading = false; step = Math.max(1, step - 1); renderStep(); });
    dialog.querySelector('[data-match-close]').addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
    dialog.addEventListener('close', () => start.focus({ preventScroll: true }));
    start.addEventListener('click', () => void open());
    globalThis.CareData.manifest().then(value => { manifest = value; invalidate(); }).catch(() => {});
    refresh();
    return { refresh, context, open };
}
/** SOFTM-CARE-MATCH END */
