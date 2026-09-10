/** SOFTM-CARE-INSIGHTS START 날짜:20260910 : 담은 기관의 공개 근거와 상담 질문을 분리해 자료 누락이나 인원수를 품질 순위로 오인하지 않도록 설명 */
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const format = value => value.toLocaleString('ko-KR');
const staff = [['rn', '간호사'], ['na', '간호조무사'], ['pt', '물리치료사'], ['ot', '작업치료사'], ['cw', '요양보호사']];
const residential = new Set(['facility', 'daycare', 'short-stay', 'dementia']);

export function analyze(rows, { type = 'daycare', sourceDate = '' } = {}) {
    const selected = [...new Map(rows.map(row => [String(row.i), row])).values()];
    const hospital = type === 'nursing-hospital', equipment = type === 'welfare-equipment';
    const evaluated = selected.filter(row => /^[A-E]$/.test(row.g || row.ev?.grade || ''));
    const years = [...new Set(evaluated.map(row => row.ey || row.ev?.year).filter(Boolean))];
    const summary = [];
    if (!selected.length) return { summary: ['기관 찾기에서 관심 있는 기관을 담아 주세요.'], cards: [], sourceDate, source: hospital ? '심평원 개설현황' : '공단 수집 자료' };
    summary.push(selected.length === 1 ? '1곳의 공개정보를 정리했습니다. 다른 기관을 담으면 차이도 확인할 수 있습니다.' : `담은 ${selected.length}곳을 같은 항목으로 살펴봤습니다. 방문 순서대로 표시합니다.`);
    if (!hospital) {
        summary.push(`공단 평가등급 확인 ${evaluated.length}곳 · 미확인 ${selected.length - evaluated.length}곳. 미확인은 낮은 평가를 뜻하지 않습니다.`);
        if (years.length > 1) summary.push(`평가연도가 ${years.sort().join('·')}년으로 다릅니다. 점수의 높고 낮음으로 순위를 정하지 않았습니다.`);
    }
    if (residential.has(type) && selected.length > 1) {
        const capacities = selected.filter(row => number(row.z) && row.z > 0).map(row => row.z);
        const sameService = selected.every(row => row.t && row.t === selected[0].t);
        if (capacities.length === selected.length && sameService) {
            const min = Math.min(...capacities), max = Math.max(...capacities);
            summary.push(min === max ? `공개 정원은 모두 ${format(min)}명입니다. 정원은 현재 이용 가능한 자리가 아닙니다.` : `공개 정원은 ${format(min)}~${format(max)}명입니다. 기관 규모의 차이이며 현재 이용 가능한 자리는 별도 확인이 필요합니다.`);
        } else if (!sameService) summary.push('세부 급여 구성이 달라 정원·인력을 단순한 순위로 비교하지 않았습니다.');
    }
    if (!hospital && !equipment && selected.length > 1 && selected.every(row => row.t && row.t === selected[0].t)) {
        for (const [key, label] of staff.slice(0, 4)) {
            const known = selected.filter(row => !row.staffMissing && number(row[key]));
            const positive = known.filter(row => row[key] > 0);
            if (positive.length && positive.length < known.length) {
                const names = positive.slice(0, 3).map(row => row.n).join(', ');
                summary.push(`${label}가 1명 이상 기록된 곳은 ${names}${positive.length > 3 ? ` 외 ${positive.length - 3}곳` : ''}입니다. 해당 인력 자료 확인 ${known.length}/${selected.length}곳 기준이며 실제 배치와 제공 프로그램은 상담에서 확인하세요.`);
            }
        }
    }
    const cards = selected.map(row => {
        const facts = [], questions = [];
        facts.push(row.a ? `위치: ${row.a}` : '주소: 미확인');
        if (row.tn) facts.push(`제공 급여: ${row.tn}`);
        if (!hospital && !equipment && String(row.t || '').includes(',')) facts.push('복수 급여의 인력은 급여별 수치 합계로 같은 직원이 중복될 수 있습니다. 실제 근무 인원은 기관에 확인하세요.');
        if (!hospital) {
            const grade = row.g || row.ev?.grade, year = row.ey || row.ev?.year;
            facts.push(/^[A-E]$/.test(grade || '') ? `공단 평가: ${grade}등급 · ${year ? `${year}년` : '평가연도 미확인'}${number(row.es) ? ` · ${row.es}점` : ''}` : '공단 평가: 미확인');
            if (!/^[A-E]$/.test(grade || '') || !year) questions.push('최근 공단 평가 결과와 평가연도를 확인할 수 있나요?');
        }
        if (residential.has(type)) facts.push(`공개 정원: ${number(row.z) && row.z > 0 ? `${format(row.z)}명` : '미확인'}`);
        if (!hospital && !equipment) {
            if (row.staffMissing) {
                facts.push('인력: 일부 미확인으로 인원 비교에서 제외했습니다.');
                questions.push('현재 직종별 근무 인원과 이용 시간대의 배치는 어떻게 되나요?');
            } else {
                const confirmed = staff.filter(([key]) => number(row[key]));
                facts.push(confirmed.length ? `공개 인력: ${confirmed.map(([key, label]) => `${label} ${format(row[key])}명`).join(' · ')}` : '인력: 미확인');
                const rehab = ['pt', 'ot'].filter(key => number(row[key]) && row[key] > 0);
                if (rehab.length) questions.push('등록된 치료 인력이 진행하는 프로그램과 실제 이용 가능한 시간은 어떻게 되나요?');
                if (confirmed.length < staff.length) questions.push('자료에서 확인되지 않는 직종의 현재 배치 인원을 알려주실 수 있나요?');
                else questions.push('이용 시간대에 실제 근무하는 인원과 담당 방식은 어떻게 되나요?');
            }
        }
        if (type === 'daycare') questions.push('우리 집까지 송영이 가능한가요? 이용 가능한 요일과 시간은 어떻게 되나요?');
        else if (equipment) questions.push('필요한 품목의 대여·구입 가능 여부와 배송·관리 조건은 어떻게 되나요?');
        else if (hospital) questions.push('필요한 진료와 간병 방식, 현재 입원 가능 여부를 확인할 수 있나요?');
        else if (type.startsWith('home-')) questions.push('우리 주소로 방문 가능한 요일과 시간, 담당 인력은 어떻게 되나요?');
        else questions.push('현재 이용 가능한 자리와 대기 절차는 어떻게 되나요?');
        questions.push(equipment ? '급여 적용 여부와 실제 본인부담금은 얼마인가요?' : '우리 이용조건에서 추가 비용까지 포함한 총비용과 항목별 내역을 받을 수 있나요?');
        return { id: String(row.i), name: row.n || '기관명 미확인', facts, questions };
    });
    return { summary, cards, sourceDate, source: hospital ? '심평원 개설현황' : '공단 수집 자료' };
}

/** SOFTM-BRIEF-READABILITY START 날짜:20260910 : 항목명과 값을 구분해 긴 기관 정보를 빠르게 비교하도록 구성 */
function renderFact(text) {
    const separator = text.indexOf(': ');
    return separator < 0 ? `<div class="care-insight-fact-note"><dt>참고</dt><dd>${escape(text)}</dd></div>` : `<div><dt>${escape(text.slice(0, separator))}</dt><dd>${escape(text.slice(separator + 2))}</dd></div>`;
}
/** SOFTM-BRIEF-READABILITY END */
export function render(rows, config) {
    const report = analyze(rows, config);
    /** SOFTM-BRIEF-READABILITY START 날짜:20260910 : 요약·기관별 정보·상담 질문을 별도 영역으로 나누어 읽는 순서를 명확히 함 */
    // SOFTM-CARE-MATCH 날짜:20260910 : 선택한 중요 조건의 비교 근거를 일반 기관 요약보다 먼저 제공
    return `${config?.match ? renderMatchComparison(rows, { ...config.match, type: config.type, sourceDate: config.sourceDate }) : ''}<div class="care-insight-intro"><h3>선택 전에 살펴볼 차이</h3><ul>${report.summary.map(text => `<li>${escape(text)}</li>`).join('')}</ul></div>
    <div class="care-insight-cards">${report.cards.map((card, index) => `<article class="care-insight-card"><h4><span class="care-insight-number">${index + 1}</span><span>${escape(card.name)}</span></h4><dl class="care-insight-facts">${card.facts.map(renderFact).join('')}</dl><details><summary>방문·전화 상담 질문 ${card.questions.length}개</summary><ol class="care-insight-questions">${card.questions.map(text => `<li>${escape(text)}</li>`).join('')}</ol></details><button type="button" class="care-saved-detail" data-saved-detail="${escape(card.id)}">기관 상세 보기</button></article>`).join('')}</div>
    <p class="care-insight-source">근거: ${escape(report.source)} · 검색 자료 기준일 ${escape(report.sourceDate || '미확인')}. 개별 항목의 변경일과 평가연도는 다를 수 있습니다. 공개 인력은 실제 근무조나 서비스 품질을 뜻하지 않습니다. 거리·비용·실시간 이용 가능 여부는 이 요약에서 추정하지 않습니다.</p>`;
    /** SOFTM-BRIEF-READABILITY END */
}
/** SOFTM-CARE-INSIGHTS END */

/** SOFTM-CARE-MATCH START 날짜:20260910 : 희망 조건을 필터나 추천점수로 바꾸지 않고 공개 근거의 확인 여부와 상담 질문으로 설명 */
const featureGroupIds = new Set(['dementia', 'cognitive', 'respite', 'integrated']);
export function criteriaFor(type, groups = globalThis.CareAdvancedSearch?.groupsFor(type) || []) {
    if (type === 'nursing-hospital') return [];
    const criteria = [{ id: 'evaluation-ab', label: '공단 평가 A·B등급', kind: 'evaluation' }];
    if (type !== 'welfare-equipment') criteria.push({ id: 'nurse', label: '간호사 등록', kind: 'staff', fields: ['rn'] }, { id: 'rehab', label: '물리·작업치료사 등록', kind: 'staff', fields: ['pt', 'ot'] });
    for (const group of groups) if (featureGroupIds.has(group.id)) criteria.push({ id: `feature:${group.id}`, label: group.label, kind: 'feature', keys: group.options.map(option => option[0]) });
    return criteria;
}
export function assess(row, criterion, context = {}) {
    let status = 'unknown', evidence = '', question = '';
    const date = context.sourceDate || '미확인';
    if (criterion.kind === 'evaluation') {
        const grade = row.g || row.ev?.grade, year = row.ey || row.ev?.year;
        status = /^[A-E]$/.test(grade || '') ? (['A', 'B'].includes(grade) ? 'confirmed' : 'different') : 'unknown';
        evidence = status === 'unknown' ? '공단 평가등급이 확인되지 않습니다. 낮은 평가라는 뜻은 아닙니다.' : `공개 평가 ${grade}등급 · ${year ? `${year}년` : '평가연도 미확인'}. 평가연도가 다르면 점수를 직접 비교하기 어렵습니다.`;
        question = '최근 공단 평가 결과와 평가연도를 확인할 수 있나요?';
    } else if (criterion.kind === 'staff') {
        const multiple = String(row.t || '').split(',').filter(Boolean).length > 1;
        const values = criterion.fields.map(key => row[key]);
        if (row.staffMissing || multiple) evidence = multiple ? '복수 급여의 인력이 합산되어 해당 급여의 실제 배치를 따로 확인해야 합니다.' : '인력 자료가 일부 누락되어 등록 여부를 판단하지 않았습니다.';
        else {
            status = values.some(value => number(value) && value > 0) ? 'confirmed' : values.every(number) ? 'different' : 'unknown';
            evidence = criterion.fields.map(key => `${staff.find(([field]) => field === key)?.[1] || key} ${number(row[key]) ? `${format(row[key])}명` : '미확인'}`).join(' · ') + '. 공개 등록 인원이며 근무 시간대별 배치나 프로그램 운영 여부는 별도 확인이 필요합니다.';
        }
        question = criterion.id === 'rehab' ? '물리·작업치료 인력의 실제 근무시간과 이용할 수 있는 프로그램은 무엇인가요?' : '현재 간호사의 실제 근무시간과 이용 시간대의 배치는 어떻게 되나요?';
    } else {
        status = context.hasFeature && criterion.keys.some(key => context.hasFeature(row, key)) ? 'confirmed' : 'unknown';
        evidence = status === 'confirmed' ? '공단 공개 특화서비스 수집 목록에서 제공기관으로 확인됩니다.' : context.featureError ? '특화서비스 자료를 불러오지 못해 확인하지 못했습니다.' : '공단 수집 목록에서 제공 여부가 확인되지 않습니다. 제공하지 않는다는 뜻은 아닙니다.';
        question = `${criterion.label}을 현재 이용할 수 있나요? 대상과 이용 절차를 알려 주세요.`;
    }
    return { id: criterion.id, label: criterion.label, status, evidence, question, source: criterion.kind === 'feature' ? '공단 공개 특화서비스 목록' : '공단 수집 자료', sourceDate: criterion.kind === 'feature' ? context.featureDate || '미확인' : date };
}
export function analyzeMatch(rows, context) {
    const criteria = criteriaFor(context.type).filter(item => (context.preferences || []).includes(item.id));
    const unique = [...new Map(rows.map(row => [String(row.i), row])).values()];
    const cards = unique.map(row => ({ id: String(row.i), name: row.n, conditions: criteria.map(criterion => assess(row, criterion, context)) }));
    const counts = criteria.map(criterion => ({ id: criterion.id, label: criterion.label, confirmed: 0, different: 0, unknown: 0 }));
    for (const card of cards) card.conditions.forEach((condition, index) => counts[index][condition.status]++);
    return { total: unique.length, counts, cards, scope: context.scope || '현재 조회 범위' };
}
const statusLabels = { confirmed: '확인', different: '조건과 다름', unknown: '미확인' };
export function renderConditions(conditions) {
    const item = condition => `<li><strong>${escape(condition.label)}</strong> <span class="care-match-badge ${condition.status}">${statusLabels[condition.status]}</span><p>${escape(condition.evidence)}</p><small>${escape(condition.source)} · 기준일 ${escape(condition.sourceDate)}</small></li>`;
    return `<ul class="care-match-conditions">${conditions.slice(0, 3).map(item).join('')}</ul>${conditions.length > 3 ? `<details class="care-match-more"><summary>나머지 조건 ${conditions.length - 3}개 보기</summary><ul class="care-match-conditions">${conditions.slice(3).map(item).join('')}</ul></details>` : ''}`;
}
export function renderMatchComparison(rows, context) {
    const report = analyzeMatch(rows, context);
    if (!report.counts.length) return '<section class="care-match-comparison"><h3>선택한 중요 조건</h3><p>아직 선택한 조건이 없습니다. ‘내 조건에 맞는 기관 찾기’에서 중요 조건을 정할 수 있습니다.</p></section>';
    return `<section class="care-match-comparison"><h3>중요 조건으로 비교한 ${report.total}곳</h3><ul>${report.counts.map(item => `<li><b>${escape(item.label)}</b>: ${report.total && item.confirmed === report.total ? '담은 기관 모두 확인' : `확인 ${item.confirmed}곳 · 조건과 다름 ${item.different}곳 · 미확인 ${item.unknown}곳`}</li>`).join('')}</ul>${report.cards.map(card => `<article><h4>${escape(card.name)}</h4>${renderConditions(card.conditions)}<details><summary>이 조건으로 상담할 질문</summary><ul>${card.conditions.map(condition => `<li>${escape(condition.question)}</li>`).join('')}</ul></details></article>`).join('')}</section>`;
}
/** SOFTM-CARE-MATCH END */
