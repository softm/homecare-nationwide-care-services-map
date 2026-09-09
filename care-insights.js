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

export function render(rows, config) {
    const report = analyze(rows, config);
    return `<div class="care-insight-intro"><h3>선택 전에 살펴볼 차이</h3><ul>${report.summary.map(text => `<li>${escape(text)}</li>`).join('')}</ul></div>
    <div class="care-insight-cards">${report.cards.map((card, index) => `<article class="care-insight-card"><h4>${index + 1}. ${escape(card.name)}</h4><ul>${card.facts.map(text => `<li>${escape(text)}</li>`).join('')}</ul><details><summary>방문·전화 상담 질문 ${card.questions.length}개</summary><ul>${card.questions.map(text => `<li>${escape(text)}</li>`).join('')}</ul></details><button type="button" class="care-saved-detail" data-saved-detail="${escape(card.id)}">기관 상세 보기</button></article>`).join('')}</div>
    <p class="care-insight-source">근거: ${escape(report.source)} · 검색 자료 기준일 ${escape(report.sourceDate || '미확인')}. 개별 항목의 변경일과 평가연도는 다를 수 있습니다. 공개 인력은 실제 근무조나 서비스 품질을 뜻하지 않습니다. 거리·비용·실시간 이용 가능 여부는 이 요약에서 추정하지 않습니다.</p>`;
}
/** SOFTM-CARE-INSIGHTS END */
