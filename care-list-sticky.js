/** SOFTM-LIST-STICKY START 날짜:20260930 : 목록 전체를 한 번에 스크롤하고 읽는 방향에 맞춰 필요한 검색 조작만 고정 */
(function (root) {
    'use strict';
    let viewport, filters, head, spacer, mounted = false, frame = 0, filterHeight = 0, viewportSize = '';
    const isList = () => Boolean(root.CareListMode?.isList());
    const scroller = () => isList() ? root.document?.querySelector('main.wrap') : root.document?.getElementById('list');
    function createProgression() {
        let top = 0, travel = 0, stage = 'expanded';
        return {
            update(next, { locationHeight = 0, filterHeight = 0, summaryHeight = 0, locked = false } = {}) {
                next = Math.max(0, Number(next) || 0);
                const delta = next - top;
                travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta || travel;
                const threshold = locationHeight + filterHeight + summaryHeight;
                if (next < Math.max(1, locationHeight - 4)) stage = 'expanded';
                else if (locked || next < threshold - 4 || travel <= -48) stage = 'search';
                else if (travel >= 32 || stage === 'expanded') stage = 'reading';
                top = next;
                return stage;
            },
            rebase(next, nextStage) { top = Math.max(0, Number(next) || 0); travel = 0; stage = ['expanded', 'search', 'reading'].includes(nextStage) ? nextStage : stage; },
            reset() { top = 0; travel = 0; stage = 'expanded'; }
        };
    }
    const progression = createProgression();
    function visibleTop() {
        const wrap = scroller();
        if (!wrap) return 0;
        const top = wrap.getBoundingClientRect().top, bottom = wrap.getBoundingClientRect().bottom;
        const toolbar = root.document.querySelector('.results .list-head')?.getBoundingClientRect();
        return toolbar && toolbar.top < bottom && toolbar.bottom > top ? Math.min(toolbar.bottom, bottom) : top;
    }
    function capture() {
        if (!isList()) return null;
        const wrap = scroller(), top = visibleTop();
        if (!wrap) return null;
        const row = [...root.document.querySelectorAll('#list .row')].find(node => node.getBoundingClientRect().bottom > top);
        return { scroll: wrap.scrollTop, id: row?.dataset.id, offset: row ? row.getBoundingClientRect().top - top : 0, stage: root.document.body.dataset.careListStage };
    }
    function restore(position) {
        if (!position || !isList()) return;
        const wrap = scroller();
        if (!wrap) return;
        const body = root.document.body;
        body.dataset.careListRestoring = 'true';
        try {
            wrap.scrollTop = position.scroll;
            progression.rebase(wrap.scrollTop, position.stage);
            sync();
            const row = position.id && [...root.document.querySelectorAll('#list .row')].find(node => node.dataset.id === position.id);
            if (row && position.scroll > 0) {
                const box = row.getBoundingClientRect(), offset = position.offset <= -box.height + 24 ? 0 : position.offset;
                wrap.scrollTop += box.top - visibleTop() - offset;
            }
            progression.rebase(wrap.scrollTop, position.stage);
            sync();
        } finally { delete body.dataset.careListRestoring; }
    }
    function sync() {
        if (!mounted) return;
        if (!isList()) { delete root.document.body.dataset.careListStage; filters.inert = false; filters.removeAttribute('aria-hidden'); head.querySelector('[data-list-search-return]').hidden = true; root.CareListAds?.setReading?.(false); return; }
        const body = root.document.body, open = body.classList.contains('care-mobile-filters-open');
        const size = `${viewport.clientWidth}:${viewport.clientHeight}`;
        if (viewportSize && size !== viewportSize) progression.rebase(viewport.scrollTop, body.dataset.careListStage);
        viewportSize = size;
        if (!open && filters.getBoundingClientRect().height) filterHeight = filters.getBoundingClientRect().height;
        body.style.setProperty('--care-sticky-filter-height', `${filterHeight}px`);
        /** SOFTM-LOCATION-TOOLBAR START 날짜:20260930 : 검색 안으로 옮긴 위치 도구를 높이에 중복 계산하거나 키보드 조작 중 숨기지 않음 */
        const location = root.document.getElementById('careListLocation');
        const locationHeight = location && !filters.contains(location) ? location.getBoundingClientRect().height : 0;
        const summaryHeight = root.document.getElementById('careListSummary')?.getBoundingClientRect().height || 0;
        const active = root.document.activeElement;
        const focused = filters.contains(active) && (/^(INPUT|SELECT|TEXTAREA)$/.test(active?.tagName || '') || active?.tagName === 'BUTTON' && active.matches(':focus-visible'));
        /** SOFTM-LOCATION-TOOLBAR END */
        const stage = progression.update(viewport.scrollTop, { locationHeight, filterHeight, summaryHeight, locked: open || focused });
        if (body.dataset.careListStage !== stage) body.dataset.careListStage = stage;
        root.CareListAds?.setReading?.((stage === 'reading' || root.innerHeight <= 700) && body.dataset.careWorkspace !== 'saved');
        const hidden = stage === 'reading' && !open;
        filters.inert = hidden;
        filters.setAttribute('aria-hidden', String(hidden));
        head.querySelector('[data-list-search-return]').hidden = stage !== 'reading';
    }
    function schedule() {
        if (!frame) frame = root.requestAnimationFrame(() => { frame = 0; sync(); });
    }
    function reset() {
        if (!isList()) return;
        progression.reset();
        const wrap = scroller();
        if (wrap) wrap.scrollTop = 0;
        sync();
    }
    function mount() {
        if (mounted) return;
        viewport = root.document.querySelector('main.wrap'); filters = root.document.querySelector('.filters'); head = root.document.querySelector('.results .list-head');
        if (!viewport || !filters || !head) return;
        mounted = true;
        spacer = root.document.createElement('div'); spacer.className = 'care-sticky-filter-spacer'; spacer.setAttribute('aria-hidden', 'true'); filters.before(spacer);
        const button = root.document.createElement('button'); button.type = 'button'; button.dataset.listSearchReturn = ''; button.textContent = '검색조건'; button.hidden = true;
        button.onclick = () => { reset(); root.document.getElementById('q')?.focus({ preventScroll: true }); };
        head.append(button);
        viewport.addEventListener('scroll', schedule, { passive: true });
        filters.addEventListener('focusin', schedule); filters.addEventListener('focusout', schedule);
        root.addEventListener('resize', schedule, { passive: true });
        new root.MutationObserver(schedule).observe(root.document.body, { attributes: true, attributeFilter: ['class', 'data-care-mode', 'data-care-workspace'] });
        if (root.ResizeObserver) {
            const observer = new root.ResizeObserver(schedule);
            for (const node of [viewport, filters, head, root.document.getElementById('careListSummary'), root.document.getElementById('careListLocation')]) if (node) observer.observe(node);
        }
        sync();
    }
    root.CareListSticky = Object.freeze({ createProgression, scroller, visibleTop, capture, restore, reset, mount, sync });
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-LIST-STICKY END */
