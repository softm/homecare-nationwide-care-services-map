/** SOFTM-DECISION-SUMMARY START 날짜:20260924 : 기관 선택에 필요한 근거만 유형별로 드러내고 등록 현황을 실제 이용 가능성으로 오인하지 않도록 구분 */
(() => {
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
    const count = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
    const date = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value).replaceAll('-', '.') : '미확인';
    function staffText(c, key) {
        const value = count(c[key]);
        return value === null || (c.staffMissing && value === 0) ? '미확인' : `${value}명${c.staffMissing ? ' 확인' : ''}`;
    }
    const capacityType = (c, type) => ['facility', 'daycare', 'short-stay'].includes(type) || (type === 'dementia' && String(c.t || '').split(',').some(code => /^(?:[BC]0[34]|A0[1-5]|S41|[GHIM][3-9][1-9])$/.test(code.trim())));
    /** SOFTM-MARKER-INSIGHTS START 날짜:20260930 : 지도와 상세가 같은 유형별 지표와 누락 기준을 사용하도록 요약 근거를 공유 */
    function summary(c, type) {
        const cells = [];
        const add = (label, value, detail = '') => cells.push({ label, value, detail });
        let note = '';
        if (type === 'nursing-hospital') {
            add('기관 구분', '요양병원', '의료기관');
            add('개설일', date(c.d), '심평원 개설현황');
        } else {
            const grade = /^[A-E]$/.test(String(c.g || '')) ? c.g : null;
            const year = /^\d{4}$/.test(String(c.ey || c.ev?.year || '')) ? String(c.ey || c.ev.year) : '';
            add('공단 평가', grade ? `${grade}등급` : '미확인', grade ? (year ? `${year}년 평가` : '평가연도 미확인') : '수집 자료 기준');
            const hasCapacity = capacityType(c, type);
            if (hasCapacity) {
                const capacity = count(c.z);
                add('등록 정원', capacity > 0 ? `${capacity}명` : '미확인');
            }
            if (type !== 'welfare-equipment') {
                const nursing = type === 'home-nursing';
                const first = count(nursing ? c.rn : c.cw);
                const second = nursing ? count(c.na) : 0;
                const partial = !!c.staffMissing || first === null || second === null;
                const total = (first ?? 0) + (second ?? 0);
                add(nursing ? '간호인력' : '요양보호사', partial ? (total > 0 ? `${total}명 확인` : '미확인') : `${total}명`, nursing ? '간호사·간호조무사 합계' : partial ? '일부 자료 미확인' : '수집 인력 기준');
                note = hasCapacity ? '' : '수집 인력 현황입니다. 실제 서비스 가능 여부·근무인원은 기관에 문의하세요.'; // SOFTM-DECISION-NOTE 날짜:20261012 : 상세 팝업 상단에서 정원 주의 문구가 공간을 차지하지 않도록 제거
            }
        }
        return { cells, note };
    }
    /** SOFTM-DETAIL-REVIEW START 날짜:20261118 : 공개자료의 강점·누락과 현재 기관에 물어볼 내용을 단정 없이 분리 */
    function verification(type) {
        if (type === 'daycare') return [
            { label: '송영', detail: '우리 집까지 가능한 범위와 시간' },
            { label: '이용', detail: '가능한 요일·시간과 현재 대기 절차' },
            { label: '비용', detail: '본인부담·비급여를 포함한 예상 총액' }
        ];
        if (['home-care', 'home-bath', 'home-nursing'].includes(type)) return [
            { label: '방문', detail: '우리 주소로 방문 가능한 요일과 시간' },
            { label: '인력', detail: '희망 시간대에 실제 배정 가능한 담당 인력' },
            { label: '비용', detail: '본인부담과 추가 비용을 포함한 예상 금액' }
        ];
        if (type === 'welfare-equipment') return [
            { label: '품목', detail: '현재 재고와 대여·구입 가능 여부' },
            { label: '관리', detail: '배송·설치·회수·A/S 조건' },
            { label: '비용', detail: '급여 적용 여부와 실제 본인부담금' }
        ];
        if (type === 'nursing-hospital') return [
            { label: '입원', detail: '필요한 진료·병실의 현재 가능 여부와 대기' },
            { label: '간병', detail: '간병 방식과 보호자 부담 범위' },
            { label: '비용', detail: '간병·비급여를 포함한 예상 총액' }
        ];
        return [
            { label: '이용', detail: '현재 자리와 대기 절차' },
            { label: '근무', detail: '이용 시간대의 실제 근무 인원과 담당 방식' },
            { label: '비용', detail: '본인부담·비급여를 포함한 예상 총액' }
        ];
    }
    function review(c, type) {
        const confirmed = [], unknown = [], rawGrade = c.g || c.ev?.grade || '', grade = /^[A-E]$/.test(String(rawGrade)) ? String(rawGrade) : '';
        const year = /^\d{4}$/.test(String(c.ey || c.ev?.year || '')) ? String(c.ey || c.ev.year) : '';
        const multipleServices = String(c.t || '').split(',').filter(Boolean).length > 1;
        if (type === 'nursing-hospital') {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.d || ''))) unknown.push({ label: '개설일', detail: '심평원 공개자료에서 미확인' });
        } else {
            if (['A', 'B'].includes(grade)) confirmed.push({ label: '공단 평가', detail: `${grade}등급${year ? ` · ${year}년 평가` : ''}` });
            if (!grade) unknown.push({ label: '공단 평가', detail: '평가등급 미확인' });
            else if (!year) unknown.push({ label: '평가연도', detail: `${grade}등급의 평가연도 미확인` });
            if (capacityType(c, type) && !(count(c.z) > 0)) unknown.push({ label: '등록 정원', detail: '공개자료에서 미확인' });
            if (type !== 'welfare-equipment') {
                const nursing = type === 'home-nursing', primary = count(c[nursing ? 'rn' : 'cw']), secondary = nursing ? count(c.na) : 0;
                if (c.staffMissing || primary === null || secondary === null) unknown.push({ label: nursing ? '간호인력' : '요양보호사', detail: '일부 또는 전체 인원 미확인' });
                if (!multipleServices && !c.staffMissing) {
                    if (count(c.rn) > 0) confirmed.push({ label: '등록 인력', detail: `간호사 ${count(c.rn)}명` });
                    const rehab = (count(c.pt) ?? 0) + (count(c.ot) ?? 0);
                    if (rehab > 0) confirmed.push({ label: '등록 인력', detail: `물리·작업치료사 합계 ${rehab}명` });
                }
            }
        }
        const verify = verification(type);
        if (multipleServices && !['welfare-equipment', 'nursing-hospital'].includes(type)) verify.unshift({ label: '급여별 인력', detail: '복수 급여 합계가 아닌 실제 배치 인원' });
        const note = type === 'nursing-hospital'
            ? '개설일은 현재 입원 가능 여부를 뜻하지 않습니다.'
            : type === 'welfare-equipment'
                ? '공개 등록정보는 현재 품목 재고·대여 가능 여부를 뜻하지 않습니다.'
                : ['home-care', 'home-bath', 'home-nursing'].includes(type)
                    ? '등록 인력은 희망 시간대에 실제 배정 가능한 인력을 뜻하지 않습니다.'
                    : '등록 정원은 빈자리, 등록 인력은 실제 근무조를 뜻하지 않습니다.';
        return { confirmed, verify, unknown, note };
    }
    /** SOFTM-DETAIL-ESSENTIALS START 날짜:20261121 : 반복 평가·빈 상태 상자를 없애고 실제 누락과 펼쳐볼 상담 질문만 표시 */
    function renderReview(c, type, context = {}) {
        const data = review(c, type);
        const item = value => `<li><b>${escape(value.label)}</b><span>${escape(value.detail)}</span></li>`;
        const staff = data.confirmed.filter(value => value.label === '등록 인력').map(value => value.detail);
        const missing = [...new Set(data.unknown.map(value => value.label))];
        const source = context.source || (type === 'nursing-hospital' ? '건강보험심사평가원 요양기관 개설현황' : '국민건강보험공단 공개 수집 자료');
        const sourceDate = context.sourceDate || '미확인';
        return `${render(c, type, { showNote: false })}<section class="care-decision-review" aria-label="추가 확인 정보">${staff.length ? `<p class="care-review-staff"><b>추가 등록 인력</b><span>${staff.map(escape).join(' · ')}</span></p>` : ''}${missing.length ? `<p class="care-review-missing"><b>공개자료 미확인</b><span>${missing.map(escape).join(' · ')}</span></p>` : ''}<details class="care-review-questions"><summary><span>상담할 때 확인하기</span><span class="care-review-count">${data.verify.length}개 항목</span></summary><ul>${data.verify.map(item).join('')}</ul><p class="care-review-note">${escape(data.note)}</p></details><p class="care-review-source">${escape(source)}<span>검색자료 기준 ${escape(sourceDate)}</span></p></section>`;
    }
    /** SOFTM-DETAIL-ESSENTIALS END */
    /** SOFTM-DETAIL-REVIEW END */
    function markerLines(c, type) {
        const { cells } = summary(c, type);
        if (type === 'nursing-hospital') {
            return ['요양병원 · 의료기관', `${cells[1].value === '미확인' ? '개설일 미확인' : `개설 ${cells[1].value}`} · 심평원`];
        }
        const evaluation = cells[0];
        const first = evaluation.value === '미확인' ? '공단 평가 미확인' : `공단 ${evaluation.value} · ${evaluation.detail}`;
        const second = cells.slice(1).map(cell => `${cell.label} ${cell.value}`).join(' · ');
        const year = /^\d{4}-\d{2}-\d{2}$/.test(String(c.d || '')) ? `지정 ${String(c.d).slice(0,4)}년` : '지정연도 미확인';
        return [first, second || `장기요양 복지용구 · ${year}`];
    }
    function render(c, type, { showNote = true } = {}) { // SOFTM-DETAIL-ESSENTIALS 날짜:20261121 : 상세의 자료 해설은 상담 펼침 안에서 한 번만 표시
        const { cells, note } = summary(c, type);
        const html = cells.map(({ label, value, detail }) => `<div class="care-decision-cell"><dt>${escape(label)}</dt><dd>${escape(value)}</dd>${detail ? `<span class="care-decision-context">${escape(detail)}</span>` : ''}</div>`).join('');
        return `<section class="care-decision-summary" aria-label="기관 판단 요약"><dl class="care-decision-grid" style="--care-decision-columns:${cells.length}">${html}</dl>${showNote && note ? `<p class="care-decision-note">${escape(note)}</p>` : ''}</section>`; // SOFTM-DETAIL-ESSENTIALS 날짜:20261121 : 목록의 기존 해설은 유지하고 상세의 중복만 제거
    }
    globalThis.CareDecisionSummary = { summary, render, review, renderReview, staffText, markerLines }; // SOFTM-CANDIDATE-FACTS 날짜:20261121 : 맞춤 후보도 지도 목록과 같은 유형별 지표·누락 판정을 사용
    /** SOFTM-MARKER-INSIGHTS END */
})();
/** SOFTM-DECISION-SUMMARY END */
