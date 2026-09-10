/** SOFTM-MOBILE-PULL-REFRESH START 날짜:20260910 : 내부 스크롤을 쓰는 모바일 지도에서도 사용자가 명시적으로 최신 화면을 다시 불러올 수 있도록 제공 */
(function (root) {
    'use strict';

    function createPullState({ threshold = 76, maximum = 140 } = {}) {
        let tracking = false;
        let startX = 0;
        let startY = 0;
        let ready = false;

        const inactive = () => ({ active: false, ready: false, distance: 0 });
        const reset = () => { tracking = false; ready = false; startX = 0; startY = 0; };

        return {
            begin({ x = 0, y = 0, scrollTop = 0, allowed = true } = {}) {
                reset();
                if (!allowed || scrollTop > 0) return false;
                tracking = true; startX = x; startY = y;
                return true;
            },
            move({ x = 0, y = 0, scrollTop = 0 } = {}) {
                if (!tracking || scrollTop > 0) { reset(); return inactive(); }
                const horizontal = x - startX;
                const vertical = y - startY;
                if (vertical <= 0 || (Math.abs(horizontal) > Math.abs(vertical) && Math.abs(horizontal) > 8)) { reset(); return inactive(); }
                const rawDistance = Math.min(maximum, vertical);
                ready = rawDistance >= threshold;
                return { active: rawDistance > 4, ready, distance: Math.min(56, rawDistance * .55) };
            },
            end() { const refresh = tracking && ready; reset(); return refresh; },
            cancel() { reset(); },
            tracking: () => tracking
        };
    }

    function install({ document: doc = root.document, reload = () => root.location.reload() } = {}) {
        if (!doc?.body || !root.matchMedia) return null;
        const media = root.matchMedia('(max-width: 1000px)');
        const state = createPullState();
        const indicator = doc.createElement('div');
        indicator.className = 'care-pull-refresh';
        indicator.setAttribute('role', 'status');
        indicator.setAttribute('aria-live', 'polite');
        indicator.setAttribute('aria-hidden', 'true');
        indicator.innerHTML = '<span class="care-pull-refresh-icon" aria-hidden="true">↻</span><span class="care-pull-refresh-label">당겨서 새로고침</span>';
        doc.body.append(indicator);
        const label = indicator.querySelector('.care-pull-refresh-label');
        let scroller = null;
        let settleTimer = 0;
        let reloading = false;

        const overlayOpen = () => doc.body.classList.contains('mobile-popup-open')
            || doc.body.classList.contains('care-mobile-filters-open')
            || !!doc.querySelector('dialog[open],.compare-modal:not([hidden]),.detail-sheet:not([hidden]),.mobile-popup-layer:not([hidden])');
        const interactive = target => !!target.closest('button,a,input,select,textarea,[role="button"],[draggable="true"],.care-drag-handle,.care-sheet-handle,.map-wrap');
        const hide = () => {
            root.clearTimeout(settleTimer);
            indicator.classList.remove('is-visible', 'is-ready', 'is-refreshing');
            indicator.style.removeProperty('--care-pull-distance');
            indicator.setAttribute('aria-hidden', 'true');
            label.textContent = '당겨서 새로고침';
        };
        const settle = () => {
            indicator.classList.remove('is-ready');
            indicator.style.setProperty('--care-pull-distance', '0px');
            settleTimer = root.setTimeout(hide, 180);
        };
        const point = touch => ({ x: touch?.clientX || 0, y: touch?.clientY || 0 });

        const onStart = event => {
            if (reloading || !media.matches || event.touches.length !== 1) return;
            const target = event.target;
            const candidate = target.closest('#list,.care-saved-panel');
            const allowed = !!candidate && candidate.scrollTop <= 0 && !interactive(target) && !overlayOpen();
            if (!allowed) return;
            hide();
            scroller = candidate;
            state.begin({ ...point(event.touches[0]), scrollTop: candidate.scrollTop, allowed: true });
        };
        const onMove = event => {
            if (!scroller || event.touches.length !== 1 || !state.tracking()) return;
            const result = state.move({ ...point(event.touches[0]), scrollTop: scroller.scrollTop });
            if (!result.active) return;
            event.preventDefault();
            indicator.classList.add('is-visible');
            indicator.classList.toggle('is-ready', result.ready);
            indicator.style.setProperty('--care-pull-distance', `${Math.round(result.distance)}px`);
            indicator.setAttribute('aria-hidden', 'false');
            label.textContent = result.ready ? '놓으면 새로고침' : '당겨서 새로고침';
        };
        const onEnd = () => {
            if (!scroller) return;
            scroller = null;
            if (!state.end()) { settle(); return; }
            reloading = true;
            indicator.classList.add('is-visible', 'is-ready', 'is-refreshing');
            indicator.style.setProperty('--care-pull-distance', '48px');
            indicator.setAttribute('aria-hidden', 'false');
            label.textContent = '새로고침 중';
            root.setTimeout(reload, 140);
        };
        const onCancel = () => { scroller = null; state.cancel(); settle(); };

        doc.addEventListener('touchstart', onStart, { passive: true, capture: true });
        doc.addEventListener('touchmove', onMove, { passive: false, capture: true });
        doc.addEventListener('touchend', onEnd, { passive: true, capture: true });
        doc.addEventListener('touchcancel', onCancel, { passive: true, capture: true });
        media.addEventListener?.('change', event => { if (!event.matches) onCancel(); });
        return { destroy() { onCancel(); indicator.remove(); doc.removeEventListener('touchstart', onStart, true); doc.removeEventListener('touchmove', onMove, true); doc.removeEventListener('touchend', onEnd, true); doc.removeEventListener('touchcancel', onCancel, true); } };
    }

    root.CareMobilePullRefresh = Object.freeze({ createPullState, install });
    if (root.document) {
        const ready = () => install();
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', ready, { once: true });
        else ready();
    }
})(globalThis);
/** SOFTM-MOBILE-PULL-REFRESH END */
