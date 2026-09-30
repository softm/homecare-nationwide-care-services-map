/** SOFTM-LIST-MODE START 날짜:20260930 : 지도 범위와 독립된 목록 탐색과 전체 결과 요약을 제공 */
(function (root) {
    'use strict';
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const resolveMode = value => new URL(value).searchParams.get('mode') === 'list' ? 'list' : 'map';
    let mode = root.location ? resolveMode(root.location.href) : 'map', options = {}, mounted = false, transition = 0;
    const isList = () => mode === 'list';
    if (root.document) root.document.body.dataset.careMode = mode;

    function summarize(rows, type) {
        const unique = [...new Map(rows.map(row => [String(row.i), row])).values()];
        const grades = { A: 0, B: 0, C: 0, D: 0, E: 0, unknown: 0 }, years = new Set();
        for (const row of unique) {
            const grade = row.g || row.ev?.grade;
            grades[/^[A-E]$/.test(grade || '') ? grade : 'unknown']++;
            if (/^[A-E]$/.test(grade || '') && (row.ey || row.ev?.year)) years.add(String(row.ey || row.ev.year));
        }
        return { total: unique.length, regions: new Set(unique.filter(row => row.p && row.c).map(row => `${row.p} ${row.c}`)).size,
            evaluated: unique.length - grades.unknown, grades, years: [...years].sort(), hospital: type === 'nursing-hospital' };
    }

    function renderSummary(rows, { type, scope, sourceDate } = {}) {
        const host = root.document?.getElementById('careListSummary');
        if (!host) return;
        host.hidden = !isList();
        if (!isList()) return;
        const report = summarize(rows, type), fmt = count => count.toLocaleString('ko-KR');
        /** SOFTM-SUMMARY-COMPACT START 날짜:20260930 : 결과 탐색 공간을 확보하고 기준일·평가 해설은 필요할 때만 펼쳐 확인 */
        host.innerHTML = `<summary class="care-list-summary-heading"><strong>검색 결과 분석</strong><span class="care-list-scope">${escape(scope || '전국')} · 전체 ${fmt(report.total)}곳</span></summary>
            <div class="care-list-summary-grid"><article><strong>${fmt(report.total)}곳</strong><span>검색 결과</span></article><article><strong>${fmt(report.regions)}개</strong><span>시·군·구</span></article>${report.hospital ? '' : `<article><strong>${fmt(report.evaluated)}곳</strong><span>공단 평가 확인</span></article><article><strong>${fmt(report.grades.unknown)}곳</strong><span>평가 미확인</span></article>`}</div>
            <div class="care-list-summary-meta">
                ${report.hospital ? '' : `<div class="care-list-grade-summary" aria-label="등급별 기관 수">${['A', 'B', 'C', 'D', 'E'].map(grade => `<span aria-label="${grade}등급 ${fmt(report.grades[grade])}곳"><b>${grade}</b> ${fmt(report.grades[grade])}</span>`).join('')}</div>`}
                <details class="care-list-data-info"><summary>${report.hospital ? '자료 안내' : '평가·자료 안내'}</summary><div>
                    <p>${report.hospital ? '심평원 의료기관 개설현황 · 공단 장기요양 평가 대상이 아닙니다.' : `평가연도 ${escape(report.years.join('·') || '미확인')} · 미확인은 낮은 평가를 뜻하지 않습니다.`}</p>
                    <p>자료 기준일 ${escape(sourceDate || '미확인')} · <a href="data-status.html" target="_blank" rel="noopener">자료 갱신 현황</a></p>
                </div></details>
            </div>`;
        /** SOFTM-SUMMARY-COMPACT END */
    }

    function sync() {
        root.document.body.dataset.careMode = mode;
        root.document.querySelectorAll('[data-care-mode-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.careModeChoice === mode)));
        const summary = root.document.getElementById('careListSummary');
        if (summary) summary.hidden = !isList();
        root.CareMapExperience?.syncMode?.();
    }

    async function setMode(value) {
        const next = value === 'list' ? 'list' : 'map';
        if (next === mode || !mounted) return;
        const previous = mode;
        const revision = ++transition, current = () => revision === transition;
        options.beforeChange?.(next, previous);
        mode = next;
        const url = new URL(root.location.href);
        if (isList()) url.searchParams.set('mode', 'list'); else url.searchParams.delete('mode');
        root.history.replaceState(root.history.state, '', url);
        sync();
        try { await options.change?.(mode, previous, { current }); }
        catch (error) { if (current()) options.error?.(error); }
    }

    function mount(config) {
        if (mounted) return;
        mounted = true; options = config;
        const toggle = root.document.createElement('div'); toggle.className = 'care-mode-toggle';
        toggle.setAttribute('role', 'group'); toggle.setAttribute('aria-label', '기관 탐색 모드');
        /** SOFTM-MODE-ICONS START 날짜:20260930 : 짧은 이름과 서로 다른 아이콘으로 모드를 빠르게 구분하고 접근성 이름은 유지 */
        toggle.innerHTML = `<button type="button" data-care-mode-choice="list" aria-label="목록모드" title="목록모드로 보기"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg><span>목록</span></button>
            <button type="button" data-care-mode-choice="map" aria-label="지도모드" title="지도모드로 보기"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15"/></svg><span>지도</span></button>`;
        /** SOFTM-MODE-ICONS END */
        toggle.addEventListener('click', event => { const button = event.target.closest('[data-care-mode-choice]'); if (button) void setMode(button.dataset.careModeChoice); });
        root.document.body.append(toggle);
        const list = root.document.getElementById('list'), summary = root.document.createElement('details');
        summary.id = 'careListSummary'; summary.setAttribute('aria-label', '검색 결과 분석'); summary.hidden = true; list?.before(summary);
        const shortScreen = root.matchMedia?.('(max-height:740px)'); // SOFTM-LIST-LOCATION 날짜:20260930 : 위치 안내가 추가된 낮은 화면에서도 기관 목록을 먼저 볼 수 있도록 요약을 접음
        summary.open = !shortScreen?.matches;
        shortScreen?.addEventListener('change', event => { summary.open = !event.matches; });
        const filters = root.document.querySelector('.filters');
        if (filters && root.ResizeObserver) new root.ResizeObserver(() => {
            if (isList() && !root.document.body.classList.contains('care-mobile-filters-open')) root.document.body.style.setProperty('--care-list-filter-height', `${filters.getBoundingClientRect().height}px`);
        }).observe(filters);
        sync();
    }
    root.CareListMode = Object.freeze({ resolveMode, summarize, isList, setMode, mount, renderSummary });
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-LIST-MODE END */
