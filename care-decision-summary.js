/** SOFTM-DECISION-SUMMARY START 날짜:20260924 : 기관 선택에 필요한 근거만 유형별로 드러내고 등록 현황을 실제 이용 가능성으로 오인하지 않도록 구분 */
(() => {
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
    const count = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
    const date = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value).replaceAll('-', '.') : '미확인';
    function staffText(c, key) {
        const value = count(c[key]);
        return value === null || (c.staffMissing && value === 0) ? '미확인' : `${value}명${c.staffMissing ? ' 확인' : ''}`;
    }
    function render(c, type) {
        const cells = [];
        const add = (label, value, detail = '') => cells.push(`<div class="care-decision-cell"><dt>${escape(label)}</dt><dd>${escape(value)}</dd>${detail ? `<span class="care-decision-context">${escape(detail)}</span>` : ''}</div>`);
        let note = '';
        if (type === 'nursing-hospital') {
            add('기관 구분', '요양병원', '의료기관');
            add('개설일', date(c.d), '심평원 개설현황');
        } else {
            const grade = /^[A-E]$/.test(String(c.g || '')) ? c.g : null;
            const year = /^\d{4}$/.test(String(c.ey || c.ev?.year || '')) ? String(c.ey || c.ev.year) : '';
            add('공단 평가', grade ? `${grade}등급` : '미확인', grade ? (year ? `${year}년 평가` : '평가연도 미확인') : '수집 자료 기준');
            const capacityType = ['facility', 'daycare', 'short-stay'].includes(type) || (type === 'dementia' && String(c.t || '').split(',').some(code => /^(?:[BC]0[34]|A0[1-5]|S41|[GHIM][3-9][1-9])$/.test(code.trim())));
            if (capacityType) {
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
                note = capacityType ? '정원은 잔여 자리가 아닙니다. 실제 이용 가능 여부·근무인원은 기관에 문의하세요.' : '수집 인력 현황입니다. 실제 서비스 가능 여부·근무인원은 기관에 문의하세요.';
            }
        }
        return `<section class="care-decision-summary" aria-label="기관 판단 요약"><dl class="care-decision-grid" style="--care-decision-columns:${cells.length}">${cells.join('')}</dl>${note ? `<p class="care-decision-note">${escape(note)}</p>` : ''}</section>`;
    }
    globalThis.CareDecisionSummary = { render, staffText };
})();
/** SOFTM-DECISION-SUMMARY END */
