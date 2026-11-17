/** SOFTM-COMPARE-EVIDENCE START 날짜:20261118 : 서로 다른 평가연도와 출처를 같은 순위처럼 보이지 않도록 비교 정책을 한곳에서 관리 */
(() => {
    'use strict';
    const evaluationSortKeys = new Set(['grade', 'score']);
    const validGrade = value => /^[A-E]$/.test(String(value || ''));
    const validYear = value => /^\d{4}$/.test(String(value || '')) ? String(value) : '';
    const validScore = value => typeof value === 'number' && Number.isFinite(value);
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

    function evaluation(row) {
        const grade = row?.g || row?.ev?.grade || '';
        const score = validScore(row?.es) ? row.es : validScore(row?.ev?.score) ? row.ev.score : null;
        const year = validYear(row?.ey || row?.ev?.year);
        return { evaluated: validGrade(grade) || score !== null, grade, score, year };
    }

    function build(rows = [], { source = 'nhis', sourceDate = '' } = {}) {
        const selected = [...new Map((Array.isArray(rows) ? rows : []).map((row, index) => [String(row?.i || `row-${index}`), row])).values()];
        const isHira = source === 'hira';
        const evaluations = selected.map(evaluation).filter(item => item.evaluated);
        const years = [...new Set(evaluations.map(item => item.year).filter(Boolean))].sort();
        const missingYearCount = evaluations.filter(item => !item.year).length;
        const mixedYears = years.length > 1;
        const canRankEvaluation = !isHira && evaluations.length >= 2 && missingYearCount === 0 && years.length === 1;
        const sourceLabel = isHira ? '건강보험심사평가원 요양기관 개설현황' : '국민건강보험공단 공개 수집 자료';
        let message;
        if (isHira) message = '요양병원은 장기요양기관 공단 평가와 다른 의료기관 자료이므로 등급·총점 순위를 제공하지 않습니다.';
        else if (mixedYears) message = `${years.map(year => `${year}년`).join('·')} 평가가 함께 있어 등급·총점 순위를 제공하지 않습니다. 각 기관의 평가연도를 함께 확인하세요.`;
        else if (missingYearCount) message = `평가값이 있는 기관 중 ${missingYearCount}곳은 평가연도가 미확인이라 등급·총점 순위에서 제외합니다.`;
        else if (canRankEvaluation) message = `${years[0]}년 평가가 확인된 ${evaluations.length}곳은 같은 평가연도 안에서 등급·총점을 정렬할 수 있습니다.`;
        else message = '같은 평가연도로 확인된 기관이 2곳 미만이라 등급·총점 순위를 제공하지 않습니다. 평가 미확인은 낮은 평가를 뜻하지 않습니다.';
        const yearLabel = years.length ? years.map(year => `${year}년`).join('·') : '평가연도 미확인';
        return Object.freeze({
            source: isHira ? 'hira' : 'nhis',
            sourceLabel,
            sourceDate: String(sourceDate || '미확인'),
            knownYears: Object.freeze(years),
            yearLabel,
            missingYearCount,
            evaluatedCount: evaluations.length,
            selectedCount: selected.length,
            mixedYears,
            canRankEvaluation,
            message,
            tone: canRankEvaluation ? 'aligned' : 'caution',
            defaultSort: Object.freeze(canRankEvaluation ? { key: 'score', dir: 'desc' } : { key: 'name', dir: 'asc' }),
            allowsSort: key => !evaluationSortKeys.has(String(key)) || canRankEvaluation
        });
    }

    function render(policy) {
        const data = policy || build([]);
        return `<div class="compare-evidence-heading"><strong id="compareEvidenceTitle">비교 근거</strong><span>${escape(data.sourceLabel)} · 검색자료 기준일 ${escape(data.sourceDate)}</span></div><p>${escape(data.message)}</p>`;
    }

    globalThis.CareCompareEvidence = Object.freeze({ build, render, evaluation });
})();
/** SOFTM-COMPARE-EVIDENCE END */
