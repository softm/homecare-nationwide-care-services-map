/** SOFTM-MAP-EXPERIENCE START 날짜:20260904 : 검색과 비교를 보호자의 선택 흐름에 맞추고 두 지도 사이에서 관심기관을 유지 */
(function (root) {
    'use strict';
    const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    /** SOFTM-VIEWPORT-RESEARCH START 날짜:20260909 : 사용자 확대·축소만 재조회하고 내부 지도 이동과 별도 수동 재검색을 구분 */
    function ensureListAdFallback(host, fallback) {
        host.querySelectorAll('.list-ad-slot,.daycare-list-ad-slot').forEach(slot => {
            root.setTimeout(() => {
                if (!slot.isConnected || slot.querySelector('iframe')) return;
                const html = fallback(); if (html) slot.innerHTML = html;
            }, 5200);
        });
    }
    /** SOFTM-SEARCH-LIST-SCROLL START 날짜:20260910 : 목록 끝 광고까지 빠르게 이동해도 강조가 이전 기관에 남지 않도록 가시 기관과 스크롤 끝을 함께 판정 */
    function pickSearchScrollRow(rows, listRect, scrollState) {
        if (!rows.length) return null;
        const visible = rows.filter(node => {
            const rect = node.getBoundingClientRect();
            return rect.bottom > listRect.top && rect.top < listRect.bottom;
        });
        const atStart = scrollState.scrollTop <= 2;
        const atEnd = scrollState.scrollHeight > scrollState.clientHeight
            && scrollState.scrollTop + scrollState.clientHeight >= scrollState.scrollHeight - 2;
        if (atStart) return visible[0] || rows[0];
        if (atEnd) return visible.at(-1) || rows.at(-1);
        return visible.find(node => node.getBoundingClientRect().bottom > listRect.top + 55) || visible.at(-1) || null;
    }
    /** SOFTM-SEARCH-LIST-SCROLL END */
    function createZoomResearch({ enabled, prepare, search }, clock = root) {
        let userUntil = 0, pending = false, timer;
        const clear = () => { clock.clearTimeout(timer); timer = null; };
        const run = () => { clear(); pending = false; userUntil = 0; if (!enabled()) return; prepare(); return search(); };
        const schedule = () => { clear(); timer = clock.setTimeout(run, 650); };
        return {
            gesture() { userUntil = Date.now() + 2000; },
            zoom() { if (!enabled() || Date.now() > userUntil) return; prepare(); pending = true; schedule(); },
            idle() { if (pending) schedule(); },
            drag() { clear(); pending = false; },
            research: run,
            pending: () => pending,
            cancel() { clear(); pending = false; userUntil = 0; }
        };
    }
    function bindViewportResearch(config) {
        const host = document.querySelector('.map-wrap');
        const controller = createZoomResearch(config);
        const zoomControl = target => target.closest?.('#zoomInBtn,#zoomOutBtn,[title*="확대"],[title*="축소"],[aria-label*="확대"],[aria-label*="축소"],a:has(img[alt*="지도 확대"]),a:has(img[alt*="지도 축소"])');
        host.addEventListener('wheel', () => controller.gesture(), { passive: true, capture: true });
        host.addEventListener('touchstart', event => { if (event.touches.length > 1) controller.gesture(); }, { passive: true, capture: true });
        host.addEventListener('dblclick', () => controller.gesture(), { capture: true });
        for (const name of ['pointerdown', 'keydown', 'click']) host.addEventListener(name, event => { if (zoomControl(event.target)) controller.gesture(); }, { capture: true });
        config.events.addListener(config.map, 'zoom_changed', () => controller.zoom());
        config.events.addListener(config.map, 'idle', () => controller.idle());
        config.events.addListener(config.map, 'dragstart', () => controller.drag());
        let button = host.querySelector('.map-search');
        if (!button) { button = document.createElement('button'); button.type = 'button'; host.append(button); }
        button.classList.add('care-region-research'); button.textContent = '↻ 이 지역 재검색';
        button.setAttribute('aria-label', '현재 지도 영역에서 이 지역 재검색');
        button.onclick = () => controller.research();
        /** SOFTM-VIEWPORT-RESIZE START 날짜:20260910 : 목록을 접거나 회전해 늘어난 지도 영역도 수동 재검색과 같은 범위로 조회 */
        let resizeTimer, width = host.clientWidth, height = host.clientHeight;
        const resizeObserver = new ResizeObserver(() => {
            const nextWidth = host.clientWidth, nextHeight = host.clientHeight;
            if (nextWidth === width && nextHeight === height) return;
            width = nextWidth; height = nextHeight;
            clearTimeout(resizeTimer);
            if (!width || !height || workspace !== 'search' || detailOrigin) return;
            resizeTimer = setTimeout(() => {
                if (!host.clientWidth || !host.clientHeight || workspace !== 'search' || detailOrigin || !config.enabled()) return;
                options.resizeMap?.();
                requestAnimationFrame(() => {
                    if (workspace === 'search' && !detailOrigin && host.clientWidth && host.clientHeight && config.enabled()) void controller.research();
                });
            }, 400);
        });
        resizeObserver.observe(host);
        /** SOFTM-VIEWPORT-RESIZE END */
        return controller;
    }
    /** SOFTM-VIEWPORT-RESEARCH END */
    function createBasket(storage, type) {
        const key = `careCompare:v1:${type}`;
        let ids = [];
        try { const saved = JSON.parse(storage?.getItem(key) || '[]'); if (Array.isArray(saved)) ids = [...new Set(saved.filter(id => typeof id === 'string'))]; } catch {}
        const save = () => { try { storage?.setItem(key, JSON.stringify(ids)); } catch {} };
        return {
            has: id => ids.includes(String(id)),
            ids: () => [...ids],
            toggle(id) { id = String(id); ids = ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]; save(); },
            clear() { ids = []; save(); },
            replace(values) { ids = [...new Set(values.map(String))]; save(); }, // SOFTM-BASKET-SHARE 날짜:20260911 : 확인한 공유 목록을 방문 순서대로 한 번에 저장
            /** SOFTM-BASKET-ORDER START 날짜:20260904 : 사용자가 정한 방문 순서를 세션에 보존하고 없는 기관이나 범위를 벗어난 이동을 차단 */
            move(id, index) { id = String(id); const from = ids.indexOf(id); if (from < 0 || !Number.isInteger(index) || index < 0 || index >= ids.length) return; ids.splice(from, 1); ids.splice(index, 0, id); save(); },
            /** SOFTM-BASKET-ORDER END */
            retain(valid) { ids = ids.filter(id => valid.has(id)); save(); }
        };
    }
    /** SOFTM-WORKSPACE START 날짜:20260905 : 검색·담은 기관·방문 계획을 독립 상태로 관리해 목록과 지도의 대상을 일치 */
    function createOrigin(provider, change = () => {}) {
        let generation = 0, state = { phase: 'idle', origin: null, candidates: [], error: '' };
        const publish = values => { state = { ...state, ...values }; change(state); return state; };
        async function run(kind, query) {
            const token = ++generation;
            publish({ phase: 'loading', origin: null, candidates: [], error: '', reason: '' }); // SOFTM-LOCATION 날짜:20260905 : 재시도에서 이전 권한 오류 안내를 제거
            try {
                if (kind === 'address') {
                    const candidates = await provider.search(query);
                    if (token !== generation) return state;
                    publish({ phase: candidates.length ? 'choices' : 'error', candidates, error: candidates.length ? '' : '검색한 주소가 없습니다. 도로명과 건물번호를 확인해 주세요.' });
                } else {
                    const point = await provider.locate({ isCurrent: () => token === generation }); // SOFTM-LOCATION 날짜:20260905 : 화면을 떠난 뒤 위치 자동 재시도를 시작하지 않도록 보호
                    if (token !== generation) return state;
                    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || point.lat < 32 || point.lat > 40 || point.lng < 123 || point.lng > 133) throw new Error('국내에서 이용할 출발지를 주소로 입력해 주세요.');
                    let label = `현재 위치 (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`;
                    try { const address = await provider.describe(point); if (address) label = `현재 위치 · ${address}`; } catch {}
                    if (token !== generation) return state;
                    publish({ phase: 'ready', origin: { point, label }, candidates: [] });
                }
            } catch (error) { if (token === generation) publish({ phase: 'error', error: error.message || '출발지를 확인하지 못했습니다. 다시 선택해 주세요.', reason: error.reason || '' }); } // SOFTM-LOCATION 날짜:20260905 : 실제 위치 차단일 때만 설정 안내를 함께 표시
            return state;
        }
        return { state: () => state, search: query => run('address', query), locate: () => run('location'),
            choose(index) { const candidate = state.candidates[index]; if (state.phase !== 'choices' || !candidate) return; generation++; publish({ phase: 'ready', origin: candidate, candidates: [], error: '' }); },
            clear() { generation++; publish({ phase: 'idle', origin: null, candidates: [], error: '' }); },
            cancel() { generation++; if (state.phase === 'loading') publish({ phase: 'idle', error: '' }); }
        };
    }
    let matchController = null; // SOFTM-CARE-MATCH 날짜:20260910 : 질문 안내와 검색·비교함의 중요 조건을 같은 인스턴스로 연결
    let routeStartRevision = 0; // SOFTM-ROUTE-DIRECT 날짜:20260910 : 출발지 대기 중 취소된 즉시 탐색을 다시 실행하지 않음
    let options, basket, bar, media, detailOrigin, view = 'list', workspace = 'search', routePanel = false;
    let rowById = new Map(), restoreGeneration = 0, routeRevision = 0, readyTimer = null, searchMapFocusTimer = null;
    let basketMap, routeOutput, originController, tabs, dock, lastItems = '', cancelBasketDrag = () => {};
    let routeState = { phase: 'idle', missing: [] }, originState = { phase: 'idle', origin: null, candidates: [] };
    const workspacePositions = { search: null, saved: null }, workspaceViews = { search: 'list', saved: 'list' };
    const positions = { search: { list: null, map: null }, saved: { list: null, map: null } };
    /** SOFTM-WORKSPACE-EXPAND START 날짜:20260907 : 지도와 목록을 화면 가득 확인한 뒤 원래 위치와 크기로 돌아갈 수 있도록 확대 상태를 별도로 보존 */
    let workspaceExpanded = false, expandedOrigin = null, expandPointerOrigin = null;
    /** SOFTM-WORKSPACE-EXPAND END */
    const allRows = () => options?.rows() || [];
    const rows = () => (basket?.ids() || []).map(id => rowById.get(id)).filter(Boolean);
    const busy = () => routeState.phase === 'routing' || routeState.phase === 'locating';
    /** SOFTM-TAB-FEEDBACK START 날짜:20260905 : 담기 결과를 숫자와 탭에 연결하고 반복 클릭·동작 줄이기 설정에서도 정확히 안내 */
    let basketFeedbackTimer, basketAnnouncement, basketFeedbackAnimations = [];
    function showBasketFeedback(row, added) {
        clearTimeout(basketFeedbackTimer);
        basketFeedbackAnimations.forEach(animation => animation.cancel());
        basketFeedbackAnimations = [];
        const savedTab = tabs.querySelector('#careSavedTab'), hint = savedTab.querySelector('.care-tab-hint');
        const targets = [savedTab, dock];
        const reset = () => {
            targets.forEach(node => { node.classList.remove('care-just-added'); node.querySelector('.care-count-feedback').hidden = true; });
            hint.textContent = '비교 · 경로탐색';
        };
        reset();
        basketAnnouncement.textContent = `${row.n}, ${added ? '담기 완료' : '담은 기관에서 제거 완료'}. 담은 기관은 총 ${rows().length}곳입니다.`;
        if (!added) return;
        hint.textContent = '✓ 담았어요';
        const reducedMotion = root.matchMedia('(prefers-reduced-motion: reduce)').matches;
        targets.forEach(node => {
            node.classList.add('care-just-added');
            const badge = node.querySelector('[data-saved-count]'), plus = node.querySelector('.care-count-feedback');
            plus.hidden = false;
            if (reducedMotion || !badge.animate) return;
            basketFeedbackAnimations.push(badge.animate([
                { transform: 'scale(1)' }, { transform: 'translateY(-3px) scale(1.35)', offset: .35 },
                { transform: 'scale(.95)', offset: .7 }, { transform: 'scale(1)' }
            ], { duration: 650, easing: 'ease-out' }));
            basketFeedbackAnimations.push(plus.animate([
                { opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(-3px)', offset: .25 },
                { opacity: 1, transform: 'translateY(-3px)', offset: .8 }, { opacity: 0, transform: 'translateY(-8px)' }
            ], { duration: 1300, easing: 'ease-out', fill: 'forwards' }));
        });
        basketFeedbackTimer = setTimeout(() => { reset(); basketFeedbackAnimations.forEach(animation => animation.cancel()); basketFeedbackAnimations = []; }, 1400);
    }
    /** SOFTM-TAB-FEEDBACK END */
    function button(row) {
        const active = basket?.has(row.i) || false;
        return `<button type="button" class="care-basket-button" data-care-basket="${escape(row.i)}" aria-pressed="${active}" aria-label="${escape(row.n)} ${active ? '비교함에서 빼기' : '비교에 담기'}">${active ? '✓ 비교에 담음' : '+ 비교에 담기'}</button>`;
    }
    function evaluationLabel(row) { const grade = row.g || row.ev?.grade; return ['A', 'B', 'C', 'D', 'E'].includes(grade) ? `기관 평가 ${grade}등급` : grade === 'N' ? '신설·미평가' : '기관 평가 미확인'; }
    function refresh() {
        if (!basket || !bar) return;
        matchController?.refresh(); // SOFTM-CARE-MATCH 날짜:20260910 : 목록 재렌더와 페이지 변경에도 선택 근거를 다시 연결
        const selected = rows();
        tabs.querySelector('[data-saved-count]').textContent = selected.length;
        bar.querySelector('.care-basket-count').textContent = `${selected.length}곳`;
        bar.querySelector('[data-basket-open]').disabled = !selected.length;
        bar.querySelector('[data-route-edit]').disabled = !selected.length;
        bar.querySelector('[data-basket-clear]').hidden = !selected.length;
        bar.querySelector('.care-saved-empty').hidden = !!selected.length;
        bar.querySelector('.care-saved-actions').hidden = routePanel || !selected.length;
        if (bar.querySelector('.care-insights')) bar.querySelector('.care-insights').hidden = routePanel || !selected.length; // SOFTM-CARE-INSIGHTS 날짜:20260910 : 빈 비교함과 경로 편집에서는 설명 영역을 감춤
        bar.querySelector('.care-route-actions').hidden = !routePanel;
        bar.querySelector('[data-route-run]').disabled = !selected.length || selected.length > 16 || !originState.origin || originState.phase === 'loading' || busy();
        bar.querySelector('[data-route-run]').textContent = busy() ? '탐색 중…' : '경로탐색';
        bar.querySelector('[data-route-run]').setAttribute('aria-busy', String(busy()));
        const missing = new Set((routeState.missing || []).map(item => item.id));
        const markup = selected.map((row, index) => `<li class="care-basket-item" data-basket-id="${escape(row.i)}"><button type="button" class="care-drag-handle" data-basket-drag="${escape(row.i)}" aria-label="${escape(row.n)} 순서 끌어서 이동" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" aria-describedby="careBasketDragHelp">⠿</button><div class="care-basket-name"><button type="button" class="care-saved-title" data-saved-detail="${escape(row.i)}"><b>${index + 1}.</b> ${escape(row.n)}</button><p>${escape(row.a || '주소 확인 필요')}</p><small>${escape(evaluationLabel(row))}${missing.has(String(row.i)) ? ' · 위치 확인 필요' : ''}</small><button type="button" class="care-saved-detail" data-saved-detail="${escape(row.i)}">상세 보기</button></div><button type="button" class="care-saved-remove" data-care-basket="${escape(row.i)}" aria-label="${escape(row.n)} 비교함에서 빼기">×</button></li>`).join('');
        if (markup !== lastItems) { cancelBasketDrag(); bar.querySelector('.care-basket-items').innerHTML = markup; lastItems = markup; }
        dock.querySelector('[data-saved-count]').textContent = selected.length; // SOFTM-TAB-FEEDBACK 날짜:20260905 : 반복 갱신에서도 숫자 강조 요소를 유지
        dock.hidden = !selected.length || workspace !== 'search';
        document.body.classList.toggle('has-care-dock', !!selected.length && workspace === 'search');
        document.querySelectorAll('.care-basket-button[data-care-basket]').forEach(node => {
            const active = basket.has(node.dataset.careBasket), row = rowById.get(node.dataset.careBasket);
            node.setAttribute('aria-pressed', String(active));
            node.setAttribute('aria-label', `${row?.n || '기관'} ${active ? '비교함에서 빼기' : '비교에 담기'}`);
            node.textContent = active ? '✓ 비교에 담음' : '+ 비교에 담기';
        });
    }
    function remember() { return { top: root.scrollY, list: document.getElementById('list')?.scrollTop || 0, saved: bar?.scrollTop || 0 }; }
    function restore(position) {
        if (!position) return;
        const generation = ++restoreGeneration;
        requestAnimationFrame(() => { if (generation !== restoreGeneration) return; const list = document.getElementById('list'); if (list) list.scrollTop = position.list; if (bar) bar.scrollTop = position.saved; root.scrollTo({ top: position.top, behavior: 'instant' }); });
    }
    /** SOFTM-WORKSPACE-EXPAND START 날짜:20260907 : 작업영역 확대 전의 페이지·목록 위치를 저장하고 버튼이나 Esc로 같은 위치에 복귀 */
    function setWorkspaceExpanded(next) {
        next = Boolean(next);
        if (next === workspaceExpanded) return;
        const previous = expandedOrigin;
        if (next) expandedOrigin = expandPointerOrigin || { position: remember(), focus: document.activeElement };
        else expandedOrigin = null;
        expandPointerOrigin = null; // SOFTM-WORKSPACE-EXPAND 날짜:20260907 : 한 번 누를 때 저장한 확대 전 위치가 다음 조작에 재사용되지 않도록 정리
        workspaceExpanded = next;
        document.body.classList.toggle('care-workspace-expanded', next);
        const toggle = tabs?.querySelector('[data-layout-expand]'), label = toggle?.querySelector('[data-layout-label]');
        if (toggle) {
            toggle.setAttribute('aria-pressed', String(next));
            toggle.setAttribute('aria-label', next ? '지도와 목록 원래 크기로 복구' : '지도와 목록 크게 보기');
            toggle.title = next ? '원래 화면으로 돌아가기 (Esc)' : '지도와 목록 크게 보기';
        }
        if (label) label.textContent = next ? '원래대로' : '크게 보기';
        syncView();
        requestAnimationFrame(() => {
            options.resizeMap?.();
            if (workspace === 'saved') basketMap?.fit();
            if (!next && previous) {
                restore(previous.position);
                requestAnimationFrame(() => { if (previous.focus?.isConnected) previous.focus.focus({ preventScroll: true }); });
            }
        });
    }
    /** SOFTM-WORKSPACE-EXPAND END */
    function syncView() {
        document.body.dataset.careView = view;
        document.body.dataset.careWorkspace = workspace;
        document.body.dataset.carePanel = routePanel ? 'route' : 'saved';
        document.body.classList.toggle('care-basket-map', workspace === 'saved');
        document.body.style.setProperty('--care-nav-height', `${document.querySelector('.category-nav')?.getBoundingClientRect().height || 0}px`);
        const compact = media.matches && workspace === 'saved', saved = workspace === 'saved'; // SOFTM-MOBILE-MAP 날짜:20260909 : 검색 화면에서는 지도와 목록을 동시에 조작할 수 있도록 inert 제한을 해제
        const map = document.querySelector('.map-card'), results = document.querySelector('.results');
        results.hidden = saved; results.inert = saved || compact && view !== 'list';
        bar.hidden = !saved; bar.inert = !saved || compact && view !== 'list';
        map.inert = compact && view !== 'map';
        if (!saved) mobileSheet?.sync(); // SOFTM-MOBILE-SHEET 날짜:20260909 : 담은 기관에서 돌아와도 전체 목록의 지도 접근 상태를 유지
        document.querySelectorAll('main.wrap > .filters, main.wrap > .stats, main.wrap > .care-data-note').forEach(node => { node.hidden = saved; });
        tabs.querySelectorAll('[data-workspace]').forEach(node => { const active = node.dataset.workspace === workspace; node.setAttribute('aria-selected', String(active)); node.tabIndex = active ? 0 : -1; });
        document.querySelectorAll('button[data-care-view]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.careView === view)));
        bar.querySelector('.care-route-editor').hidden = !routePanel;
        bar.querySelector('.care-saved-heading').hidden = routePanel;
        if (saved && routePanel && compact && view === 'map') document.querySelector('.map-card .map-wrap').before(routeOutput);
        else bar.querySelector('.care-saved-footer').before(routeOutput);
        routeOutput.hidden = !saved || !routePanel;
        document.querySelector('.care-saved-map-tools').hidden = !saved;
        refresh();
    }
    function setView(next, preserveScroll = true) {
        if (!media?.matches) return;
        positions[workspace][view] = remember();
        view = next === 'map' ? 'map' : 'list'; workspaceViews[workspace] = view;
        syncView(); options.resizeMap?.();
        if (preserveScroll && positions[workspace][view]) restore(positions[workspace][view]);
        else document.querySelector('.care-view-switch')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
    /** SOFTM-SEARCH-MAP-SCROLL START 날짜:20260907 : 명시적 조회가 끝나면 결과 지도와 조회 완료 상태를 바로 확인할 수 있도록 이동 */
    function focusSearchMap() {
        if (workspace !== 'search') setWorkspace('search', false);
        if (media?.matches) setView('map', false);
        const card = document.querySelector('.map-card');
        if (!card) return;
        clearTimeout(searchMapFocusTimer); card.classList.remove('care-search-map-focus');
        requestAnimationFrame(() => {
            const reducedMotion = root.matchMedia('(prefers-reduced-motion: reduce)').matches;
            card.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
            card.classList.add('care-search-map-focus');
            searchMapFocusTimer = setTimeout(() => card.classList.remove('care-search-map-focus'), 1500);
        });
    }
    /** SOFTM-SEARCH-MAP-SCROLL END */
    function showSaved({ fit = true } = {}) {
        clearTimeout(readyTimer);
        if (workspace !== 'saved') return;
        const pending = basketMap.show(rows(), { fit, origin: routePanel ? originState.origin : null });
        if (!options.basketMap.ready()) readyTimer = setTimeout(() => showSaved({ fit }), 500);
        return pending;
    }
    function setWorkspace(next, restoreScroll = true) {
        next = next === 'saved' ? 'saved' : 'search';
        if (next === workspace) return;
        showRouteError(); // SOFTM-ROUTE-ERROR-ALERT 날짜:20260909 : 다른 작업으로 이동하면 이전 경로 오류 알림을 닫음
        workspacePositions[workspace] = remember(); workspaceViews[workspace] = view;
        options.closeDetail?.(); cancelDetail(); cancelBasketDrag(); originController.cancel(); routeRevision++; routeStartRevision++; // SOFTM-ROUTE-DIRECT 날짜:20260910 : 작업 전환 후 대기 중 경로가 실행되지 않도록 취소
        clearTimeout(readyTimer); workspace = next; routePanel = false; view = workspaceViews[next];
        syncView(); options.resizeMap?.();
        if (next === 'saved') showSaved(); else basketMap.exit();
        if (restoreScroll && workspacePositions[next]) restore(workspacePositions[next]);
        else if (restoreScroll) document.querySelector(next === 'search' ? '.care-workspace-tabs' : media.matches ? '.care-view-switch' : '.layout')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
    function beginDetail(showMap = true) {
        restoreGeneration++;
        if (!detailOrigin) detailOrigin = { workspace, view, position: remember(), focus: document.activeElement, sheet: mobileSheet?.state() };
        if (showMap && media?.matches && workspace === 'search' && mobileSheet?.state() === 'list') mobileSheet.set('split', false); // SOFTM-MOBILE-SHEET 날짜:20260909 : 전체 목록에서 상세를 열 때 지도를 함께 보여주고 이전 단계를 기억
        if (showMap && media?.matches) setView('map', false);
    }
    function finishDetail() {
        const previous = detailOrigin; detailOrigin = null;
        if (!previous || previous.workspace !== workspace) return;
        if (media?.matches) { view = previous.view; if (previous.sheet) mobileSheet?.set(previous.sheet, false); syncView(); options.resizeMap?.(); } // SOFTM-MOBILE-SHEET 날짜:20260909 : 상세를 닫으면 목록 확대 단계까지 복원
        restore(previous.position);
        if (previous.focus?.isConnected) previous.focus.focus({ preventScroll: true });
    }
    function cancelDetail() { detailOrigin = null; restoreGeneration++; }
    /** SOFTM-CARE-INSIGHTS START 날짜:20260910 : 설명을 요청한 경우에만 자료를 읽고 변경된 비교함에 이전 결과가 남지 않게 갱신 */
    let insightRevision = 0, insightAttempt = 0, insightTask;
    function loadInsights() {
        // SOFTM-CARE-MATCH 날짜:20260910 : 중요 조건 판정과 비교 설명이 같은 엔진 버전을 사용
        if (!insightTask) insightTask = import(`./care-insights.js?v=20260910-match1${insightAttempt ? `&retry=${insightAttempt}` : ''}`).catch(error => {
            insightTask = null; insightAttempt++; throw error;
        });
        return insightTask;
    }
    async function updateInsights() {
        const panel = bar?.querySelector('.care-insights');
        const revision = ++insightRevision;
        if (!panel?.open) return;
        const host = panel.querySelector('.care-insight-content');
        host.setAttribute('aria-busy', 'true');
        host.textContent = '담은 기관의 공개정보를 확인하고 있습니다…';
        try {
            const [insights, manifest] = await Promise.all([loadInsights(), root.CareData.manifest()]);
            if (revision !== insightRevision || !panel.open) return;
            host.innerHTML = insights.render(rows(), { type: options.type, sourceDate: manifest[options.type]?.sourceDate, match: matchController?.context() }); // SOFTM-CARE-MATCH 날짜:20260910 : 담기·삭제 때 현재 중요 조건으로 비교 근거를 갱신
        } catch {
            if (revision !== insightRevision || !panel.open) return;
            host.innerHTML = '<p>기관 설명을 불러오지 못했습니다. 기존 비교표는 계속 이용할 수 있습니다.</p><button type="button" data-insight-retry>다시 시도</button>';
            host.querySelector('button').addEventListener('click', updateInsights);
        } finally {
            if (revision === insightRevision) host.setAttribute('aria-busy', 'false');
        }
    }
    /** SOFTM-CARE-INSIGHTS END */
    function changed(message = '') {
        routeStartRevision++; routeRevision++; refresh(); // SOFTM-ROUTE-DIRECT 날짜:20260910 : 기관 구성이 바뀌면 대기 중 탐색을 취소
        void updateInsights(); // SOFTM-CARE-INSIGHTS 날짜:20260910 : 담기·삭제·순서 변경 후 같은 구성으로 설명을 갱신
        if (workspace === 'saved') void showSaved({ fit: false });
        bar.querySelector('.care-order-status').textContent = message || (routePanel ? '방문 기관이 변경되었습니다. 경로를 다시 탐색해 주세요.' : '');
    }
    function renderOrigin() {
        bar.querySelector('.care-origin-selection').textContent = originState.origin ? `출발: ${originState.origin.label}` : '출발지를 선택해 주세요.';
        bar.querySelector('.care-origin-status').textContent = originState.phase === 'loading' ? '출발지를 확인하고 있습니다…' : [originState.error, originState.reason === 'denied' ? root.CareLocation.permissionHelp : ''].filter(Boolean).join(' '); // SOFTM-LOCATION 날짜:20260905 : 출발지도 지도 현재 위치와 같은 오류별 안내를 제공
        bar.querySelector('.care-origin-candidates').innerHTML = originState.candidates.map((item, index) => `<li><button type="button" data-origin-choice="${index}">${escape(item.label)}<span>출발지로 선택</span></button></li>`).join('');
        bar.querySelector('[data-origin-locate]').disabled = originState.phase === 'loading';
        bar.querySelector('[data-origin-search]').disabled = originState.phase === 'loading';
        refresh();
    }
    /** SOFTM-ROUTE-ERROR-ALERT START 날짜:20260909 : 목록 아래 오류를 놓치지 않도록 스크롤과 무관한 닫기 가능한 알림을 유지 */
    function showRouteError(message = '') {
        let notice = document.querySelector('.care-route-error-alert');
        if (!notice && message) {
            notice = document.createElement('section');
            notice.className = 'care-route-error-alert';
            notice.innerHTML = '<div role="alert" aria-atomic="true"><strong>경로를 탐색하지 못했습니다</strong><p></p></div><button type="button" aria-label="경로탐색 오류 알림 닫기">×</button>';
            notice.querySelector('button').addEventListener('click', () => { notice.hidden = true; });
            document.body.append(notice);
        }
        if (!notice) return;
        notice.hidden = !message;
        notice.querySelector('p').textContent = message;
    }
    /** SOFTM-ROUTE-ERROR-ALERT END */
    let routeSimulation; // SOFTM-ROUTE-SIMULATION 날짜:20260910 : 경로 결과 수명에 모의주행을 연결
    function renderRoute(state) {
        routeSimulation?.set(state.phase === 'success' ? state.result : null); // SOFTM-ROUTE-SIMULATION 날짜:20260910 : 기관·출발지 변경과 재탐색 시 이전 주행을 즉시 제거
        routeState = state;
        showRouteError(state.phase === 'error' ? state.error || '잠시 후 다시 탐색해 주세요.' : ''); // SOFTM-ROUTE-ERROR-ALERT 날짜:20260909 : 실패를 즉시 알리고 재탐색 시작 시 이전 오류를 제거
        const result = state.result, status = routeOutput.querySelector('[role="status"]');
        const messages = { locating: '기관 위치를 확인하고 있습니다…', routing: '담은 순서대로 도로 경로를 탐색하고 있습니다…', waiting: '지도를 연결하고 있습니다…' };
        status.textContent = state.error || messages[state.phase] || (state.phase === 'success' ? '경로탐색 완료' : rows().length > 16 ? '방문 경로는 16곳까지 탐색할 수 있습니다.' : originState.origin ? '출발지와 방문 순서를 확인한 뒤 경로탐색을 눌러 주세요.' : '출발지를 먼저 선택해 주세요.');
        routeOutput.dataset.phase = state.phase;
        routeOutput.querySelector('.care-route-summary').innerHTML = result ? `<strong>${(result.distance / 1000).toFixed(1)}<small> km</small></strong><strong>약 ${Math.round(result.duration / 60000)}<small> 분</small></strong><span>${result.stops.length}곳 방문 · 자동차 경로</span>` : '';
        routeOutput.querySelector('.care-route-itinerary').innerHTML = result ? `<summary>출발지와 방문 순서</summary><p>${escape(result.origin.label)}</p><ol>${result.stops.map(stop => `<li>${escape(stop.name)}</li>`).join('')}</ol>` : '';
        routeOutput.querySelector('.care-route-itinerary').hidden = !result;
        document.querySelector('.care-saved-map-tools strong').textContent = routePanel ? '방문 경로' : `담은 기관 ${rows().length}곳`;
        refresh();
    }
    /** SOFTM-ROUTE-DIRECT START 날짜:20260910 : 경로탐색 한 번으로 출발지 확인과 도로 계산까지 이어서 실행 */
    function editRoute(open = true, locate = true) {
        if (workspace !== 'saved') setWorkspace('saved');
        originController.cancel(); routeRevision++; routeStartRevision++; routePanel = open;
        syncView(); setView('list', false);
        const pending = showSaved({ fit: false });
        renderOrigin();
        bar.querySelector(open ? '.care-route-editor h2' : '.care-saved-heading h2')?.focus({ preventScroll: true });
        if (open && locate && !originState.origin) void originController.locate();
        return pending;
    }
    async function routeBasket() {
        if (!routePanel) {
            const pending = editRoute(true, false), intent = routeStartRevision;
            await pending;
            if (intent !== routeStartRevision || workspace !== 'saved' || !routePanel) return;
            if (!originState.origin) await originController.locate();
            if (intent !== routeStartRevision || workspace !== 'saved' || !routePanel || !originState.origin) return;
            await showSaved({ fit: false });
            if (intent !== routeStartRevision || workspace !== 'saved' || !routePanel) return;
        }
        /** SOFTM-ROUTE-DIRECT END */
        if (busy()) return;
        const revision = ++routeRevision;
        bar.querySelector('.care-order-status').textContent = '';
        const result = await basketMap.show(rows(), { route: true, origin: originState.origin });
        if (revision !== routeRevision || workspace !== 'saved' || !routePanel || result.phase !== 'success') return;
        setView('map', false);
        document.querySelector('.map-card').scrollIntoView({ behavior: 'instant', block: 'start' });
        requestAnimationFrame(() => basketMap.fit());
    }
    /** SOFTM-WORKSPACE END */
    function costCard(row, service = options?.type) {
        if (!['facility', 'daycare', 'home-care'].includes(service)) return '';
        return `<details class="care-map-cost" data-cost-service="${escape(service)}" data-cost-institution="${escape(row.i)}"><summary>월 예상 비용 알아보기</summary><div class="care-map-cost-host"></div></details>`;
    }
    /** SOFTM-MOBILE-MAP START 날짜:20260909 : 조건 입력보다 현재 결과를 먼저 보여주고 보이는 기관만 사진·마커와 연결 */
    /** SOFTM-MOBILE-SHEET START 날짜:20260909 : 지도·목록 DOM을 유지한 채 핸들로 세 단계 전환하고 이전 상태로 복귀 */
    let mobileSheet;
    function createSheetState() {
        const states = ['map', 'split', 'list'];
        let state = 'split', previous = 'split';
        return {
            state: () => state,
            set(next, remember = true) { if (states.includes(next) && next !== state) { if (remember) previous = state; state = next; } return state; },
            drag(delta) { if (Math.abs(delta) < 45) return state; return this.set(states[Math.max(0, Math.min(2, states.indexOf(state) + (delta < 0 ? 1 : -1)))]); },
            back() { const next = previous; previous = state; state = next; return state; }
        };
    }
    function installMobileSheet() {
        const state = createSheetState(), layout = document.querySelector('.layout'), results = document.querySelector('.results');
        const map = document.querySelector('.map-card'), list = document.getElementById('list');
        const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'care-sheet-handle';
        handle.innerHTML = '<span aria-hidden="true"></span><small aria-hidden="true">목록 보기</small>';
        handle.setAttribute('aria-label', '목록 높이 조절: 위로 올려 펼치기, 아래로 내려 지도 크게 보기'); results.prepend(handle);
        const back = document.createElement('button'); back.type = 'button'; back.className = 'care-sheet-back';
        back.textContent = '‹'; back.setAttribute('aria-label', '이전 지도와 목록 화면으로 돌아가기'); document.querySelector('.filter-grid').prepend(back);
        const mapButton = document.createElement('button'); mapButton.type = 'button'; mapButton.className = 'care-sheet-map-button'; mapButton.textContent = '지도보기'; document.body.append(mapButton);
        let drag = null, ignoreClick = false, storedScroll = 0, revision = 0;
        const landscape = root.matchMedia('(max-width:1000px) and (orientation:landscape)'); // SOFTM-LANDSCAPE 날짜:20260909 : 가로 화면에서는 세로 핸들 대신 좌우 탐색을 사용
        const active = () => media.matches && !landscape.matches && workspace === 'search';
        const sync = () => {
            document.body.dataset.careSheet = landscape.matches ? 'split' : state.state(); // SOFTM-LANDSCAPE 날짜:20260909 : 세로에서 선택한 목록 단계를 보존한 채 가로에서는 지도와 목록을 함께 표시
            back.hidden = !active() || state.state() !== 'list'; mapButton.hidden = !active() || state.state() !== 'list';
            handle.setAttribute('aria-expanded', String(state.state() === 'list'));
            if (workspace === 'search') map.inert = active() && state.state() === 'list';
        };
        const transition = (action, restoreTop) => {
            if (!active()) return;
            const before = state.state(), top = restoreTop ?? (before === 'map' ? storedScroll : list.scrollTop);
            storedScroll = top;
            layout.style.setProperty('--care-sheet-hidden-map-height', `${map.clientHeight}px`);
            action(); sync(); const current = ++revision;
            if (state.state() !== 'list') options.resizeMap?.();
            requestAnimationFrame(() => {
                if (current !== revision) return;
                if (state.state() !== 'map') list.scrollTop = top;
            });
        };
        const goBack = () => transition(() => state.back());
        back.onclick = goBack; mapButton.onclick = goBack;
        handle.onclick = () => {
            if (ignoreClick) { ignoreClick = false; return; }
            transition(() => state.set(state.state() === 'list' ? 'split' : 'list'));
        };
        handle.addEventListener('keydown', event => {
            if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault(); transition(() => event.key === 'Home' ? state.set('list') : event.key === 'End' ? state.set('map') : state.drag(event.key === 'ArrowUp' ? -100 : 100));
        });
        handle.addEventListener('pointerdown', event => {
            if (!active() || event.button !== 0) return;
            ignoreClick = false;
            drag = { id: event.pointerId, y: event.clientY, delta: 0, scrollTop: state.state() === 'map' ? storedScroll : list.scrollTop, mapHeight: state.state() === 'list' ? 0 : map.clientHeight };
            handle.setPointerCapture(event.pointerId);
        });
        handle.addEventListener('pointermove', event => {
            if (!drag || drag.id !== event.pointerId) return;
            drag.delta = event.clientY - drag.y;
            if (Math.abs(drag.delta) < 5) return;
            document.body.classList.add('care-sheet-dragging');
            layout.style.setProperty('--care-sheet-drag-height', `${Math.max(0, Math.min(layout.clientHeight - 38, drag.mapHeight + drag.delta))}px`);
        });
        const finishDrag = (event, cancelled = false) => {
            if (!drag || drag.id !== event.pointerId) return;
            const current = drag; drag = null; ignoreClick = Math.abs(current.delta) >= 5;
            document.body.classList.remove('care-sheet-dragging'); layout.style.removeProperty('--care-sheet-drag-height');
            if (!cancelled) transition(() => state.drag(current.delta), current.scrollTop);
        };
        handle.addEventListener('pointerup', event => finishDrag(event));
        handle.addEventListener('pointercancel', event => finishDrag(event, true));
        handle.addEventListener('lostpointercapture', event => finishDrag(event, true));
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || event.defaultPrevented || !active() || detailOrigin || document.querySelector('dialog[open]') || state.state() !== 'list') return;
            event.preventDefault(); goBack();
        });
        landscape.addEventListener('change', () => { const top = list.scrollTop; sync(); options.resizeMap?.(); requestAnimationFrame(() => { list.scrollTop = top; }); }); // SOFTM-LANDSCAPE 날짜:20260909 : 회전 시 지도 크기만 갱신하고 목록 위치를 유지
        media.addEventListener('change', sync); sync();
        return { state: state.state, set: (next, remember = true) => transition(() => state.set(next, remember)), sync };
    }
    /** SOFTM-MOBILE-SHEET END */
    function installMobileSearch() {
        const filters = document.querySelector('.filters'), list = document.getElementById('list');
        if (!document.getElementById('searchBtn')) {
            const search = document.createElement('button'); search.type = 'button'; search.id = 'searchBtn';
            search.className = 'search-btn care-mobile-search'; search.textContent = '조회';
            search.onclick = () => options.mobileSearch?.(); filters.querySelector('.filter-grid').append(search);
        }
        /** SOFTM-FILTER-CLOSE START 날짜:20260910 : 닫기를 조회와 같은 실행 버튼으로 오인하지 않도록 패널 상단과 바깥 영역에 닫기 동작을 분리 */
        const toggle = document.createElement('button');
        toggle.type = 'button'; toggle.className = 'care-mobile-filter-toggle';
        toggle.textContent = '검색조건'; toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', '검색조건 열기');
        filters.id ||= 'careMobileFilters'; toggle.setAttribute('aria-controls', filters.id);
        filters.querySelector('.filter-grid').append(toggle);
        const panelHead = document.createElement('div'); panelHead.className = 'care-filter-panel-head';
        const panelTitle = document.createElement('strong'); panelTitle.textContent = '검색조건';
        const close = document.createElement('button'); close.type = 'button'; close.className = 'care-filter-panel-close'; close.textContent = '×'; close.setAttribute('aria-label', '검색조건 닫기');
        panelHead.append(panelTitle, close); filters.prepend(panelHead);
        const backdrop = document.createElement('button'); backdrop.type = 'button'; backdrop.className = 'care-filter-backdrop'; backdrop.hidden = true; backdrop.setAttribute('aria-label', '검색조건 닫기');
        document.body.append(backdrop);
        const setOpen = (open, restoreFocus = false) => {
            document.body.classList.toggle('care-mobile-filters-open', open);
            toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? '검색조건 열림' : '검색조건 열기');
            backdrop.hidden = !open;
            if (!open && restoreFocus) toggle.focus({ preventScroll: true });
        };
        toggle.onclick = () => { const open = document.body.classList.contains('care-mobile-filters-open'); setOpen(!open, open); };
        close.onclick = () => setOpen(false, true);
        backdrop.onclick = () => setOpen(false, true);
        document.getElementById('q').addEventListener('keydown', e => { if (e.key === 'Enter') setOpen(false); });
        document.getElementById('searchBtn')?.addEventListener('click', () => setOpen(false));
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape' || !document.body.classList.contains('care-mobile-filters-open')) return;
            e.preventDefault(); e.stopImmediatePropagation(); setOpen(false, true);
        }, true);
        /** SOFTM-FILTER-CLOSE END */
        let active = null, frame = 0, scrollRequested = false; // SOFTM-VIEWPORT-RESEARCH 날짜:20260909 : 실제 목록 스크롤만 지도 이동을 허용
        /** SOFTM-LIST-SCROLL-END START 날짜:20260910 : 마지막 기관도 상단 선택 기준선까지 올려 자동 선택할 수 있도록 목록 끝 여유를 계산 */
        const scrollTail = document.createElement('div');
        scrollTail.className = 'care-list-scroll-tail'; scrollTail.setAttribute('aria-hidden', 'true');
        function updateScrollTail() {
            const rows = [...list.querySelectorAll('.row')], last = rows.at(-1);
            if (!last || rows.length < 2 || !list.clientHeight) { scrollTail.style.height = '0px'; return; }
            if (!scrollTail.isConnected) list.append(scrollTail);
            const lastBottom = last.offsetTop + last.offsetHeight;
            const trailingHeight = [...list.children].filter(node => node !== scrollTail).reduce((height, node) => Math.max(height, node.offsetTop + node.offsetHeight - lastBottom), 0);
            scrollTail.style.height = `${Math.max(0, list.clientHeight - last.offsetHeight - 52 - trailingHeight)}px`;
        }
        /** SOFTM-LIST-SCROLL-END END */
        const photoCache = new Map();
        const photoObserver = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue; // SOFTM-DESKTOP-LIST-PHOTO 날짜:20260910 : PC에서도 화면에 들어온 기관 카드부터 대표사진을 불러와 초기 부하를 제한
                const row = entry.target; photoObserver.unobserve(row);
                const id = row.dataset.id || row.querySelector('[data-care-basket]')?.dataset.careBasket;
                if (!id || options.type === 'nursing-hospital') continue;
                const figure = document.createElement('span'); figure.className = 'care-result-photo';
                figure.textContent = '공단 사진 확인 중'; row.prepend(figure);
                if (!photoCache.has(id)) photoCache.set(id, root.NhisStaticData.photos(id));
                photoCache.get(id).then(data => {
                    const photo = data.photos?.find(item => item.isRepresentative === true) || data.photos?.[0];
                    if (!photo) { figure.textContent = '등록사진 없음'; return; }
                    const url = new URL(photo.thumbnailUrl || photo.url, location.href);
                    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('사진 주소');
                    const img = document.createElement('img'); img.alt = photo.title || photo.alt || '공단 등록사진';
                    img.loading = 'lazy'; img.decoding = 'async'; img.src = url.href;
                    img.onerror = () => { figure.textContent = '사진 로딩 실패'; };
                    figure.replaceChildren(img);
                }).catch(() => { figure.textContent = '사진 정보 없음'; photoCache.delete(id); });
            }
        }, { root: list, rootMargin: '120px' });
        const sync = () => {
            frame = 0;
            if (workspace !== 'search') return; // SOFTM-DESKTOP-MAP 날짜:20260909 : PC 목록 스크롤도 모바일과 같은 마커 선택을 사용
            /** SOFTM-SEARCH-LIST-SCROLL START 날짜:20260910 : 광고가 선택 기준선을 지난 상태에서도 현재 보이는 기관으로 강조를 갱신 */
            const requested = scrollRequested;
            scrollRequested = false;
            const listRect = list.getBoundingClientRect();
            const rows = [...list.querySelectorAll('.row')];
            const row = pickSearchScrollRow(rows, listRect, list);
            /** SOFTM-SEARCH-LIST-SCROLL END */
            if (!row) return;
            const id = row.dataset.id || row.querySelector('[data-care-basket]')?.dataset.careBasket;
            if (active !== row) {
                active?.classList.remove('care-scroll-active'); active?.removeAttribute('aria-current');
                active = row; row.classList.add('care-scroll-active'); row.setAttribute('aria-current', 'true');
            }
            if (requested) options.scrollDetail?.(id); // SOFTM-SCROLL-DETAIL 날짜:20260909 : 사용자가 목록을 스크롤할 때만 열린 상세를 현재 기관으로 갱신
            options.mobileFocus?.(id, requested && (!media.matches || root.matchMedia('(orientation:landscape)').matches || mobileSheet?.state() !== 'list')); // SOFTM-SEARCH-LIST-SCROLL 날짜:20260910 : 기관이 없는 광고 구간에서도 지난 스크롤 의도를 다음 화면 갱신에 남기지 않음
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
        const observe = () => { photoObserver.disconnect(); updateScrollTail(); list.querySelectorAll('.row:not(:has(.care-result-photo))').forEach(row => photoObserver.observe(row)); schedule(); }; // SOFTM-LIST-SCROLL-END 날짜:20260910 : 목록이 다시 그려질 때 끝 스크롤 여유도 새 높이로 갱신
        new MutationObserver(observe).observe(list, { childList: true });
        if (root.ResizeObserver) new root.ResizeObserver(() => { updateScrollTail(); schedule(); }).observe(list); // SOFTM-LIST-SCROLL-END 날짜:20260910 : 확대·회전으로 목록 높이가 달라져도 마지막 기관 선택 위치를 유지
        list.addEventListener('scroll', () => { scrollRequested = true; schedule(); }, { passive: true }); // SOFTM-VIEWPORT-RESEARCH 날짜:20260909 : 사용자 스크롤에서만 선택 기관 위치를 따라감
        new MutationObserver(schedule).observe(document.querySelector('.map-wrap'), { childList: true, subtree: true }); // SOFTM-MOBILE-MAP 날짜:20260909 : 비동기로 생성된 첫 마커에도 현재 목록 선택을 연결
        media.addEventListener('change', () => { setOpen(false); if (!media.matches) options.mobileFocus?.(null); observe(); });
        observe();
    }
    /** SOFTM-MOBILE-MAP END */
    /** SOFTM-SAVED-SCROLL START 날짜:20260910 : 담은 기관의 스크롤 위치를 카드·마커·열린 상세에 같은 기준으로 반영 */
    function installSavedScroll() {
        const list = bar.querySelector('.care-basket-items');
        const tail = document.createElement('li');
        tail.className = 'care-saved-scroll-tail'; tail.setAttribute('aria-hidden', 'true');
        let active = null, frame = 0, follow = false;
        function sync() {
            frame = 0;
            const requested = follow; follow = false;
            if (workspace !== 'saved' || document.body.classList.contains('care-basket-dragging')) return;
            const rect = bar.getBoundingClientRect();
            if (rect.right <= 0 || rect.left >= root.innerWidth || getComputedStyle(bar).visibility === 'hidden') return;
            const cards = [...list.querySelectorAll('[data-basket-id]')];
            if (!cards.length) { active = null; tail.remove(); return; }
            const ownScroll = /auto|scroll/.test(getComputedStyle(bar).overflowY);
            const top = Math.max(0, rect.top, tabs.getBoundingClientRect().bottom);
            const bottom = Math.min(root.innerHeight, rect.bottom);
            const footerHeight = bar.querySelector('.care-saved-footer').getBoundingClientRect().height;
            /** SOFTM-SAVED-SCROLL-EARLY START 날짜:20260910 : 카드를 맨 위까지 밀지 않아도 읽는 위치에서 선택되도록 가시 목록의 위쪽 35%를 기준으로 사용 */
            const visibleBottom = bottom - footerHeight;
            if (visibleBottom <= top) return;
            const selectionOffset = (visibleBottom - top) * 0.35;
            const selectionLine = top + selectionOffset;
            if (ownScroll) {
                if (!tail.isConnected) list.append(tail);
                const height = Math.max(0, visibleBottom - top - cards.at(-1).getBoundingClientRect().height - selectionOffset);
                tail.style.height = `${cards.length > 1 ? height : 0}px`;
            } else tail.remove();
            const visible = cards.filter(card => { const r = card.getBoundingClientRect(); return r.bottom > top && r.top < visibleBottom; });
            const atStart = (ownScroll ? bar.scrollTop : root.scrollY) <= 2;
            const atEnd = ownScroll
                ? bar.scrollHeight > bar.clientHeight && bar.scrollTop + bar.clientHeight >= bar.scrollHeight - 2
                : document.documentElement.scrollHeight > root.innerHeight && root.scrollY + root.innerHeight >= document.documentElement.scrollHeight - 2;
            const card = atEnd ? visible.at(-1) : atStart ? visible[0] : visible.find(node => node.getBoundingClientRect().bottom > selectionLine) || visible.at(-1);
            /** SOFTM-SAVED-SCROLL-EARLY END */
            if (!card) return;
            if (active !== card) {
                active?.classList.remove('care-scroll-active'); active?.removeAttribute('aria-current');
                active = card; card.classList.add('care-scroll-active'); card.setAttribute('aria-current', 'true');
            }
            const id = card.dataset.basketId;
            if (requested) options.scrollDetail?.(id);
            options.mobileFocus?.(id, requested, true);
        }
        const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
        const onScroll = () => { if (workspace === 'saved') { follow = true; schedule(); } };
        bar.addEventListener('scroll', onScroll, { passive: true });
        root.addEventListener('scroll', onScroll, { passive: true });
        root.addEventListener('resize', schedule);
        new MutationObserver(schedule).observe(list, { childList: true });
        new MutationObserver(schedule).observe(document.querySelector('.map-wrap'), { childList: true, subtree: true });
        new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['data-care-workspace', 'data-care-view', 'data-care-panel', 'class'] });
        if (root.ResizeObserver) new root.ResizeObserver(schedule).observe(bar);
        schedule();
    }
    /** SOFTM-SAVED-SCROLL END */
    function prepareFilters() {
        const filters = document.querySelector('.filters'), main = document.querySelector('main.wrap');
        if (!filters || !main) return;
        main.prepend(filters);
        const heading = document.createElement('div');
        heading.className = 'care-search-heading';
        heading.innerHTML = '<div><h2>어느 지역에서 찾으세요?</h2><p>지역이나 기관명을 입력하고, 마음에 드는 기관을 비교에 담아 보세요.</p></div><a href="care-cost.html">월 예상 비용 알아보기 →</a>';
        filters.prepend(heading);
        /** SOFTM-FILTER-HIERARCHY START 날짜:20260910 : 기본조건 아래의 상세조건을 독립된 다음 단계로 인식할 수 있도록 제목과 펼침 상태를 구조화 */
        const advanced = document.createElement('details');
        advanced.className = 'care-extra-filters';
        advanced.innerHTML = '<summary><span class="care-extra-icon" aria-hidden="true"></span><span class="care-extra-copy"><strong>상세조건</strong><small>설립주체 · 인력 · 제공 서비스</small></span><span class="care-extra-action" aria-hidden="true"></span></summary><p class="care-grade-help">기관 평가 A~E는 공단의 기관 평가입니다. 이용자의 장기요양등급 1~5등급·인지지원등급과 다릅니다.</p><div class="care-extra-basic"></div>';
        if (options.type === 'nursing-hospital') {
            advanced.querySelector('.care-extra-copy small').textContent = '읍·면·동 · 도로명 주소';
            advanced.querySelector('.care-grade-help').remove();
        }
        /** SOFTM-FILTER-HIERARCHY END */
        filters.append(advanced);
        for (const id of ['capacity', 'staff']) { const node = document.getElementById(id); if (node) advanced.querySelector('.care-extra-basic').append(node); }
        for (const node of filters.querySelectorAll('#advancedSearch, .filter-note')) advanced.append(node); // SOFTM-WORKSPACE 날짜:20260905 : 중첩된 상세검색도 한 영역에 모으고 평가 기본조건은 펼쳐 유지
        const nested = advanced.querySelector('.advanced-search');
        if (nested) { nested.open = true; nested.classList.add('care-nested-advanced'); }
        if (advanced.querySelector('.advanced-count')?.textContent.trim()) advanced.open = true; // SOFTM-BASIC-FILTER 날짜:20260904 : 기본 조건 선택 때문에 별도 상세검색까지 펼치지 않도록 구분
        const stats = document.querySelector('.stats');
        if (stats) filters.after(stats);
        const source = document.querySelector('#sourceNote, #dataSourceNote');
        if (source) {
            const wrapper = document.createElement('details');
            wrapper.className = 'care-data-note';
            wrapper.innerHTML = '<summary>자료 출처와 확인 기준</summary>';
            if (stats) stats.after(wrapper); else filters.after(wrapper);
            wrapper.append(source);
        }
        const statusLabel = document.getElementById('selectedCount')?.previousElementSibling;
        if (statusLabel) statusLabel.textContent = '지도에 표시';
    }
    /** SOFTM-DRAG-FEEDBACK START 날짜:20260904 : 집어 든 카드·빈 자리·주변 카드 이동으로 놓을 순서를 보여주고 놓기 전 취소는 기존 순서로 복원 */
    function installBasketDrag(host, onMove) {
        const list = host.querySelector('.care-basket-items');
        let drag = null, frame = 0;
        const items = () => [...list.querySelectorAll('[data-basket-id]')];
        const reducedMotion = root.matchMedia('(prefers-reduced-motion: reduce)');
        function animateMove(before) {
            if (reducedMotion.matches) return;
            items().forEach(item => {
                if (item === drag?.source) return;
                const old = before.get(item), now = item.getBoundingClientRect();
                if (old && (old.left !== now.left || old.top !== now.top)) item.animate([{ transform: `translate(${old.left - now.left}px,${old.top - now.top}px)` }, { transform: 'none' }], { duration: 170, easing: 'ease-out' });
            });
        }
        function updateTarget() {
            if (!drag) return;
            const target = document.elementFromPoint(drag.x, drag.y)?.closest('[data-basket-id]');
            if (!target || !list.contains(target) || target === drag.source) return;
            const ordered = items(), from = ordered.indexOf(drag.source), to = ordered.indexOf(target);
            const targetRect = target.getBoundingClientRect(), sourceRect = drag.source.getBoundingClientRect();
            const sameRow = Math.abs(targetRect.top - sourceRect.top) < Math.min(targetRect.height, sourceRect.height) / 2;
            const after = from < to, crossed = sameRow ? drag.x > targetRect.left + targetRect.width / 2 : drag.y > targetRect.top + targetRect.height / 2;
            if (after !== crossed) return;
            ordered.forEach(item => item.getAnimations().forEach(animation => animation.cancel()));
            const before = new Map(ordered.map(item => [item, item.getBoundingClientRect()]));
            list.insertBefore(drag.source, after ? target.nextSibling : target);
            const index = items().indexOf(drag.source);
            drag.source.dataset.dropLabel = `${index + 1}번째에 놓기`;
            drag.preview.querySelector('.care-drag-position').textContent = `${index + 1}번째로 이동`;
            animateMove(before);
        }
        function paint(autoScroll = true) {
            if (!drag) return;
            const left = Math.max(8, Math.min(root.innerWidth - drag.width - 8, drag.x - drag.offsetX));
            const top = Math.max(8, Math.min(root.innerHeight - drag.height - 8, drag.y - drag.offsetY));
            drag.preview.style.transform = `translate3d(${left}px,${top}px,0)${reducedMotion.matches ? '' : ' rotate(-1deg) scale(1.02)'}`;
            if (autoScroll) {
                const rect = host.getBoundingClientRect(), scrollHost = host.scrollHeight > host.clientHeight + 2 ? host : getComputedStyle(host).position === 'fixed' ? null : root;
                const topEdge = scrollHost === root ? 48 : Math.max(rect.top, 0) + 48, bottomEdge = scrollHost === root ? root.innerHeight - 48 : Math.min(rect.bottom, root.innerHeight) - 48;
                if (scrollHost && drag.x >= rect.left && drag.x <= rect.right) {
                    const step = drag.y < topEdge ? -9 : drag.y > bottomEdge ? 9 : 0;
                    if (step) scrollHost.scrollBy({ top: step, behavior: 'instant' });
                }
            }
            updateTarget();
        }
        function tick() { paint(); if (drag) frame = requestAnimationFrame(tick); }
        function finish(commit = false) {
            if (!drag) return;
            const current = drag, rect = list.getBoundingClientRect(), hostRect = host.getBoundingClientRect();
            const inside = current.x >= rect.left && current.x <= rect.right && current.y >= Math.max(rect.top, hostRect.top) && current.y <= Math.min(rect.bottom, hostRect.bottom);
            const next = items().indexOf(current.source), changed = commit && inside && next !== current.originalIndex;
            drag = null; cancelAnimationFrame(frame);
            current.preview.remove(); current.source.classList.remove('care-drag-placeholder'); delete current.source.dataset.dropLabel;
            document.body.classList.remove('care-basket-dragging');
            items().forEach(item => item.getAnimations().forEach(animation => animation.cancel()));
            if (host.hasPointerCapture(current.pointerId)) host.releasePointerCapture(current.pointerId);
            if (changed) {
                onMove(current.id, next);
                const placed = list.querySelector(`[data-basket-id="${CSS.escape(current.id)}"]`);
                if (placed && !reducedMotion.matches) placed.animate([{ backgroundColor: '#d9eaff', boxShadow: '0 0 0 3px #175cb566' }, { backgroundColor: '#f6f9fd', boxShadow: '0 0 0 0 transparent' }], { duration: 650, easing: 'ease-out' });
            } else {
                const byId = new Map(items().map(item => [item.dataset.basketId, item]));
                basket.ids().forEach(id => { const item = byId.get(id); if (item) list.append(item); });
                current.handle.focus({ preventScroll: true });
            }
        }
        host.addEventListener('pointerdown', event => {
            const handle = event.target.closest('[data-basket-drag]');
            if (!handle || event.button !== 0 || drag || basket.ids().length < 2) return;
            event.preventDefault(); handle.focus({ preventScroll: true });
            const source = handle.closest('[data-basket-id]'), rect = source.getBoundingClientRect(), id = handle.dataset.basketDrag, index = basket.ids().indexOf(id);
            const preview = document.createElement('div');
            preview.className = 'care-drag-preview'; preview.setAttribute('aria-hidden', 'true'); preview.inert = true;
            preview.style.width = `${rect.width}px`; preview.style.minHeight = `${rect.height}px`;
            preview.innerHTML = `<span class="care-drag-grip">⠿</span><span><strong>${escape(rowById.get(id)?.n)}</strong><small class="care-drag-position">${index + 1}번째로 이동</small></span>`;
            document.body.append(preview);
            drag = { id, source, handle, preview, pointerId: event.pointerId, originalIndex: index, x: event.clientX, y: event.clientY, width: rect.width, height: preview.getBoundingClientRect().height, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
            source.dataset.dropLabel = `${index + 1}번째에 놓기`; source.classList.add('care-drag-placeholder'); document.body.classList.add('care-basket-dragging');
            host.setPointerCapture(event.pointerId); paint(false); frame = requestAnimationFrame(tick);
        });
        host.addEventListener('pointermove', event => { if (!drag || event.pointerId !== drag.pointerId) return; drag.x = event.clientX; drag.y = event.clientY; paint(false); });
        host.addEventListener('pointerup', event => { if (!drag || event.pointerId !== drag.pointerId) return; drag.x = event.clientX; drag.y = event.clientY; paint(false); finish(true); });
        host.addEventListener('pointercancel', () => finish());
        host.addEventListener('lostpointercapture', () => finish());
        root.addEventListener('blur', () => finish());
        document.addEventListener('keydown', event => { if (drag && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(); } }, true);
        host.addEventListener('keydown', event => {
            const handle = event.target.closest('[data-basket-drag]'), offset = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key];
            if (!handle || !offset || drag) return;
            event.preventDefault(); event.stopPropagation();
            const index = basket.ids().indexOf(handle.dataset.basketDrag) + offset;
            if (index >= 0 && index < basket.ids().length) onMove(handle.dataset.basketDrag, index);
        });
        return () => finish();
    }
    /** SOFTM-DRAG-FEEDBACK END */
    /** SOFTM-WORKSPACE START 날짜:20260905 : 같은 지도 DOM을 유지하면서 기관 찾기와 담은 기관의 입력·목록만 전환 */
    /** SOFTM-WORKSPACE-BACK-ICON START 날짜:20260910 : 좁은 하단에서도 문구가 깨지지 않는 아이콘 복귀 동작을 유지 */
    function goBack() {
        if (detailOrigin) { options.closeDetail?.(); return; }
        if (routePanel) { editRoute(false); return; }
        if (workspace === 'saved') { setWorkspace('search'); return; }
        if (document.body.classList.contains('care-mobile-filters-open')) { document.querySelector('.care-mobile-filter-toggle')?.click(); return; }
        if (media.matches && mobileSheet?.state() === 'list') { mobileSheet.set('split'); return; }
        if (workspaceExpanded) { setWorkspaceExpanded(false); return; }
        if (root.history.length > 1) root.history.back();
        else root.location.assign('index.html');
    }
    /** SOFTM-WORKSPACE-BACK-ICON END */
    function init(config) {
        if (options) return;
        options = config; rowById = new Map(allRows().map(row => [String(row.i), row]));
        /** SOFTM-CARE-MATCH START 날짜:20260910 : 공용 질문 흐름이 준비되지 않아도 기존 지도는 계속 사용할 수 있게 독립 초기화 */
        if (options.match) {
            const connect = (attempt = 0) => import(`./care-match.js?v=20260910-match-panel1&attempt=${attempt}`).then(module => { // SOFTM-MATCH-PANEL 날짜:20260910 : 조건 설정과 선택값을 묶은 패널을 이전 캐시 없이 적용
                matchController = module.mount({ ...options.match, type: options.type, allRows, onChange: updateInsights });
            }).catch(() => {
                if (document.querySelector('.care-match-load-retry')) return;
                const retry = document.createElement('button'); retry.className = 'care-match-start care-match-load-retry'; retry.type = 'button'; retry.textContent = '내 조건에 맞는 기관 찾기 · 다시 불러오기';
                retry.onclick = () => { retry.remove(); void connect(attempt + 1); };
                document.querySelector('.results .list-head,.results .result-head').after(retry);
            });
            void connect();
        }
        /** SOFTM-CARE-MATCH END */
        let storage; try { storage = root.sessionStorage; } catch {}
        basket = createBasket(storage, options.type); basket.retain(new Set(rowById.keys()));
        document.body.classList.add('care-map-page'); prepareFilters();
        media = root.matchMedia('(max-width: 1000px)');
        const layout = document.querySelector('.layout'), results = document.querySelector('.results');
        results.id = 'careSearchResults';
        tabs = document.createElement('nav'); tabs.className = 'care-workspace-tabs'; tabs.setAttribute('aria-label', '이전 및 기관 찾기와 담은 기관'); // SOFTM-WORKSPACE-BACK-ICON 날짜:20260910 : 이전 문구 없이도 보조기기에는 복귀 목적을 전달
        /** SOFTM-WORKSPACE-EXPAND START 날짜:20260907 : 작업 탭 옆에서 지도·목록 확대와 원상복구를 한 버튼으로 전환 */
        tabs.innerHTML = `<div class="care-workspace-tab-list" role="tablist" aria-label="기관 찾기와 담은 기관"><button type="button" id="careSearchTab" role="tab" data-workspace="search" aria-selected="true" aria-controls="careSearchResults"><svg class="care-tab-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 5 5"></path></svg><span class="care-tab-copy"><span class="care-tab-title">기관 찾기</span><span class="care-tab-hint" aria-hidden="true">지역 · 조건으로 검색</span></span></button><button type="button" id="careSavedTab" role="tab" data-workspace="saved" aria-selected="false" aria-controls="careSavedPanel" tabindex="-1"><svg class="care-tab-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4Z"></path></svg><span class="care-tab-copy"><span class="care-tab-title">담은 기관 <span class="care-count-wrap"><span data-saved-count>0</span><span class="care-count-feedback" aria-hidden="true" hidden>+1</span></span></span><span class="care-tab-hint" aria-hidden="true">비교 · 경로탐색</span></span></button></div><button type="button" class="care-layout-toggle" data-layout-expand aria-pressed="false" aria-label="지도와 목록 크게 보기" title="지도와 목록 크게 보기"><svg class="care-layout-toggle-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"></path><path class="care-layout-restore-path" d="M9 9H5V5M15 9h4V5M9 15H5v4M15 15h4v4"></path></svg><span data-layout-label>크게 보기</span></button>`;
        /** SOFTM-WORKSPACE-EXPAND END */
        document.querySelector('main.wrap').prepend(tabs);
        tabs.querySelector('[data-layout-expand]').addEventListener('pointerdown', event => {
            if (!workspaceExpanded) expandPointerOrigin = { position: remember(), focus: event.currentTarget };
        }); // SOFTM-WORKSPACE-EXPAND 날짜:20260907 : 고정 버튼 포커스로 문서가 먼저 이동하기 전에 실제 보고 있던 위치를 저장
        /** SOFTM-TAB-FEEDBACK START 날짜:20260905 : 담기 결과를 음성으로도 알리고 확대된 탭이 아래 영역을 가리지 않도록 실제 높이를 공유 */
        basketAnnouncement = document.createElement('p'); basketAnnouncement.className = 'care-basket-announcement'; basketAnnouncement.setAttribute('role', 'status'); basketAnnouncement.setAttribute('aria-atomic', 'true'); tabs.after(basketAnnouncement);
        const measureTabs = () => document.body.style.setProperty('--care-tabs-height', `${tabs.getBoundingClientRect().height}px`);
        measureTabs();
        if (root.ResizeObserver) new root.ResizeObserver(measureTabs).observe(tabs);
        /** SOFTM-TAB-FEEDBACK END */
        results.setAttribute('role', 'tabpanel'); results.setAttribute('aria-labelledby', 'careSearchTab');
        const switcher = document.createElement('div'); switcher.className = 'care-view-switch'; switcher.setAttribute('role', 'group'); switcher.setAttribute('aria-label', '기관 표시 방식');
        switcher.innerHTML = '<button type="button" data-care-view="list" aria-pressed="true">목록</button><button type="button" data-care-view="map" aria-pressed="false">지도</button>';
        layout.before(switcher);
        bar = document.createElement('section'); bar.className = 'card care-basket care-saved-panel'; bar.id = 'careSavedPanel'; bar.setAttribute('role', 'tabpanel'); bar.setAttribute('aria-labelledby', 'careSavedTab');
        bar.innerHTML = `<div class="care-saved-heading"><div><h2 tabindex="-1">담은 기관 <span class="care-basket-count">0곳</span></h2><p>관심 있는 기관을 비교하고 방문을 준비하세요.</p></div><button type="button" class="care-text-button" data-basket-clear>비우기</button></div>
        <div class="care-route-editor" hidden><button type="button" class="care-text-button" data-route-back>← 담은 기관으로 돌아가기</button><h2 tabindex="-1">방문 경로</h2><p>출발지를 정하고 방문할 순서대로 놓아 주세요.</p><fieldset class="care-origin"><legend>출발지</legend><button type="button" data-origin-locate>현재 위치 사용</button><form class="care-origin-form"><label for="careOriginAddress">주소 입력</label><div><input id="careOriginAddress" name="origin" type="search" placeholder="도로명과 건물번호" autocomplete="street-address"><button type="submit" data-origin-search>주소 검색</button></div></form><p class="care-origin-status" role="status"></p><ul class="care-origin-candidates"></ul><p class="care-origin-selection">출발지를 선택해 주세요.</p></fieldset></div>
        <div class="care-saved-empty"><span aria-hidden="true">♡</span><h3>관심 있는 기관을 먼저 담아 주세요</h3><p>기관 찾기에서 ‘비교에 담기’를 누르면 여기에 모입니다.</p><button type="button" data-workspace="search">기관 찾기</button></div>
        <p class="care-order-help">⠿ 손잡이를 끌어 방문 순서를 바꿀 수 있습니다.</p><span class="care-drag-help" id="careBasketDragHelp">손잡이를 끌거나 방향키로 순서를 바꿉니다. Esc를 누르면 이동을 취소합니다.</span><ol class="care-basket-items" aria-label="담은 기관 방문 순서"></ol><p class="care-order-status" role="status"></p>
        <div class="care-saved-footer"><div class="care-saved-actions"><button type="button" class="care-primary" data-basket-open>비교하기</button><button type="button" data-route-edit>경로탐색</button></div><div class="care-route-actions" hidden><button type="button" class="care-primary" data-route-run>경로탐색</button></div></div>`;
        /** SOFTM-CARE-INSIGHTS START 날짜:20260910 : 두 지도의 담은 기관에서 설명과 상담 질문으로 바로 진입 */
        const insightsPanel = document.createElement('details');
        insightsPanel.className = 'care-insights';
        insightsPanel.innerHTML = '<summary>기관 비교 브리핑<span>공개정보 요약 · 방문 전 질문</span></summary><div class="care-insight-content" aria-busy="false"></div>'; // SOFTM-INSIGHT-NAME 날짜:20260910 : 담은 기관의 비교 요약이라는 의미가 드러나도록 사용자 지정 명칭 적용
        insightsPanel.addEventListener('toggle', updateInsights);
        bar.querySelector('.care-order-help').before(insightsPanel);
        /** SOFTM-CARE-INSIGHTS END */
        layout.prepend(bar); layout.prepend(results);
        dock = document.createElement('button'); dock.type = 'button'; dock.className = 'care-saved-dock'; dock.dataset.workspace = 'saved'; document.body.append(dock);
        dock.innerHTML = '담은 기관 <span class="care-count-wrap"><span data-saved-count>0</span><span class="care-count-feedback" aria-hidden="true" hidden>+1</span></span>곳 보기 <span aria-hidden="true">→</span>'; // SOFTM-TAB-FEEDBACK 날짜:20260905 : 상단 탭이 보이지 않을 때도 담긴 개수의 변화를 즉시 전달
        /** SOFTM-WORKSPACE-BACK-ICON START 날짜:20260910 : 시각 문구는 빼고 화살표와 접근성 이름으로 복귀 조작을 유지 */
        const back = document.createElement('button');
        back.type = 'button'; back.className = 'care-workspace-back';
        back.setAttribute('aria-label', '이전 화면으로 돌아가기'); back.title = '이전 화면으로 돌아가기';
        back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"></path></svg>';
        back.addEventListener('click', goBack); tabs.prepend(back);
        /** SOFTM-WORKSPACE-BACK-ICON END */
        routeOutput = document.createElement('section'); routeOutput.className = 'care-route-output'; routeOutput.setAttribute('aria-label', '경로탐색 결과');
        routeOutput.innerHTML = '<p role="status"></p><div class="care-route-summary"></div><details class="care-route-itinerary" hidden></details>';
        bar.querySelector('.care-saved-footer').before(routeOutput);
        const mapTools = document.createElement('div'); mapTools.className = 'care-saved-map-tools'; mapTools.innerHTML = '<strong>담은 기관</strong><button type="button" data-saved-fit>전체 위치</button><button type="button" data-care-view="list">목록 보기</button>'; document.querySelector('.map-card .map-wrap').before(mapTools);
        routeSimulation = root.CareRouteSimulation.mount(document.querySelector('.map-card .map-wrap'), options.basketMap.simulationMap); // SOFTM-ROUTE-SIMULATION 날짜:20260910 : 두 지도의 경로 재생 조작을 공용 지도 영역에 연결
        basketMap = root.CareBasketMap.create({ ...options.basketMap, state: renderRoute });
        originController = createOrigin({
            search: query => root.NaverGeocoder.searchAddresses(query),
            describe: async point => (await root.NaverGeocoder.reverseGeocode(point.lat, point.lng)).address,
            locate: options => root.CareLocation.request(options) // SOFTM-LOCATION 날짜:20260905 : 위치 재시도와 오류 구분을 두 지도의 출발지에 공유
        }, state => {
            const previous = originState.origin; originState = state;
            if (previous !== state.origin) { routeRevision++; if (workspace === 'saved' && routePanel) showSaved({ fit: false }); }
            renderOrigin();
        });
        function move(id, index) { const row = rowById.get(id); basket.move(id, index); changed(`${row?.n || '기관'}을 ${index + 1}번째로 옮겼습니다.${routePanel ? ' 경로를 다시 탐색해 주세요.' : ''}`); bar.querySelector(`[data-basket-drag="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); }
        cancelBasketDrag = installBasketDrag(bar, move);
        tabs.addEventListener('keydown', event => { if (!event.target.closest('[data-workspace]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 'search' : event.key === 'End' ? 'saved' : workspace === 'search' ? 'saved' : 'search'; setWorkspace(next); tabs.querySelector(`[data-workspace="${next}"]`).focus({ preventScroll: true }); }); // SOFTM-WORKSPACE-EXPAND 날짜:20260907 : 확대 버튼의 방향키가 작업 탭을 바꾸지 않도록 탭 키보드 범위를 제한
        media.addEventListener('change', () => { syncView(); options.resizeMap?.(); if (workspace === 'saved') requestAnimationFrame(() => basketMap.fit()); });
        document.addEventListener('click', event => {
            /** SOFTM-SAVED-CARD START 날짜:20260910 : 카드의 주소·평가·여백도 상세로 연결하되 삭제와 순서 조작은 분리 */
            const savedCard = event.target.closest('.care-basket-items [data-basket-id]');
            if (savedCard && !event.target.closest('button, a, input, select, textarea') && !document.body.classList.contains('care-basket-dragging')) {
                event.stopPropagation();
                savedCard.querySelector('[data-saved-detail]')?.focus({ preventScroll: true });
                options.detail(savedCard.dataset.basketId);
                return;
            }
            /** SOFTM-SAVED-CARD END */
            const node = event.target.closest('[data-care-basket], [data-workspace], [data-layout-expand], [data-basket-open], [data-basket-clear], [data-route-edit], [data-route-back], [data-route-run], [data-origin-locate], [data-origin-choice], [data-saved-detail], [data-saved-fit], button[data-care-view]'); // SOFTM-WORKSPACE-EXPAND 날짜:20260907 : 공용 클릭 흐름에서 확대 토글을 처리
            if (!node || node.disabled) return;
            event.stopPropagation();
            /** SOFTM-TAB-FEEDBACK START 날짜:20260905 : 실제 추가 클릭에만 반응하고 삭제·순서 변경·세션 복원은 담기 효과에서 제외 */
            if (node.hasAttribute('data-care-basket')) {
                const row = rowById.get(node.dataset.careBasket);
                if (row) { const added = !basket.has(row.i); basket.toggle(row.i); changed(); showBasketFeedback(row, added); }
            }
            /** SOFTM-TAB-FEEDBACK END */
            else if (node.hasAttribute('data-workspace')) setWorkspace(node.dataset.workspace);
            else if (node.hasAttribute('data-layout-expand')) setWorkspaceExpanded(!workspaceExpanded); // SOFTM-WORKSPACE-EXPAND 날짜:20260907 : 같은 버튼으로 확대와 원상복구를 전환
            else if (node.hasAttribute('data-basket-open')) options.compare();
            else if (node.hasAttribute('data-basket-clear')) { basket.clear(); changed(); }
            else if (node.hasAttribute('data-route-edit')) void routeBasket(); // SOFTM-ROUTE-DIRECT 날짜:20260910 : 편집창 진입에 멈추지 않고 바로 탐색
            else if (node.hasAttribute('data-route-back')) editRoute(false);
            else if (node.hasAttribute('data-route-run')) void routeBasket();
            else if (node.hasAttribute('data-origin-locate')) void originController.locate();
            else if (node.hasAttribute('data-origin-choice')) originController.choose(Number(node.dataset.originChoice));
            else if (node.hasAttribute('data-saved-detail')) options.detail(node.dataset.savedDetail);
            else if (node.hasAttribute('data-saved-fit')) basketMap.fit();
            else setView(node.dataset.careView);
        }, true);
        /** SOFTM-WORKSPACE-EXPAND START 날짜:20260907 : 상세·사진·문의창의 Esc 처리가 없을 때만 확대 작업영역을 원상복구 */
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || event.defaultPrevented || !workspaceExpanded) return;
            event.preventDefault();
            setWorkspaceExpanded(false);
        });
        /** SOFTM-WORKSPACE-EXPAND END */
        bar.querySelector('.care-origin-form').addEventListener('submit', event => { event.preventDefault(); const input = bar.querySelector('#careOriginAddress'); if (!input.value.trim()) { input.focus(); return; } void originController.search(input.value.trim()); });
        bar.querySelector('#careOriginAddress').addEventListener('input', () => { if (originState.phase !== 'idle') originController.clear(); });
        document.addEventListener('toggle', event => {
            const details = event.target;
            if (!details.matches?.('details[data-cost-service]') || !details.open || details.dataset.costMounted) return;
            const row = rowById.get(details.dataset.costInstitution); if (!row || !root.CareCostUI) return;
            details.dataset.costMounted = 'true'; root.CareCostUI.mount(details.querySelector('.care-map-cost-host'), { service: details.dataset.costService, institution: { id: row.i, name: row.n, serviceCodes: String(row.t || '').split(',').filter(Boolean) } });
        }, true);
        root.addEventListener('pageshow', () => { const before = basket.ids().join(','); if (storage) { basket = createBasket(storage, options.type); basket.retain(new Set(rowById.keys())); } if (before !== basket.ids().join(',')) changed(); else refresh(); });
        mobileSheet = installMobileSheet(); // SOFTM-MOBILE-SHEET 날짜:20260909 : 두 지도의 모바일 목록 확대·접기와 복귀 동작을 연결
        installSavedScroll(); // SOFTM-SAVED-SCROLL 날짜:20260910 : 담은 기관·방문 경로의 목록 선택을 같은 마커 처리에 연결
        installMobileSearch(); // SOFTM-MOBILE-MAP 날짜:20260909 : 첫 화면에서 지도와 목록을 함께 탐색하도록 모바일 조작 연결
        root.CareVoiceSearch?.mount({ input: document.getElementById("q"), search: () => { if (media.matches && mobileSheet?.state() === "list") mobileSheet.set("split"); document.getElementById("searchBtn").click(); } }); // SOFTM-VOICE-SEARCH 날짜:20260909 : 확인한 음성 검색어를 기존 조회 동작에 연결
        syncView(); renderOrigin(); renderRoute(routeState);
        /** SOFTM-BASKET-SHARE START 날짜:20260911 : 두 지도의 담은 목록 공유와 명시적 교체를 같은 상태 갱신에 연결 */
        root.CareBasketShare.mount({ host: bar, type: options.type, ids: () => basket.ids(), rows: allRows,
            replace: (ids, message) => { basket.replace(ids); changed(message); void showSaved(); },
            open: () => setWorkspace('saved') });
        /** SOFTM-BASKET-SHARE END */
    }
    /** SOFTM-WORKSPACE END */
    function showDaycareComparison() {
        const selected = rows();
        if (!selected.length) return;
        const columns = [
            ['기관명', row => row.n], ['주소', row => row.a], ['평가연도', row => row.ev?.year], ['기관 평가', row => row.ev?.grade],
            ['공단 평가점수', row => row.ev?.score], ['기관운영', row => row.ev?.operation], ['환경·안전', row => row.ev?.safety],
            ['권리보장', row => row.ev?.rights], ['제공과정', row => row.ev?.process], ['제공결과', row => row.ev?.result],
            ['정원', row => row.z], ['간호인력', row => row.staffMissing ? null : Number(row.rn || 0) + Number(row.na || 0)],
            ['재활인력', row => row.staffMissing ? null : Number(row.pt || 0) + Number(row.ot || 0)], ['요양보호사', row => row.staffMissing ? null : row.cw],
            ['기준지 거리(km)', row => row._distance]
        ];
        let sort = 4, ascending = false;
        const missing = value => value === null || value === undefined || value === '' || typeof value === 'number' && !Number.isFinite(value);
        const sorted = () => [...selected].sort((a, b) => {
            const av = columns[sort][1](a), bv = columns[sort][1](b);
            if (missing(av) !== missing(bv)) return missing(av) ? 1 : -1;
            if (missing(av)) return String(a.n).localeCompare(String(b.n), 'ko');
            const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'ko', { numeric: true });
            return result * (ascending ? 1 : -1);
        });
        const host = document.getElementById('compareBody');
        function render() {
            host.innerHTML = `<div class="care-compare-toolbar"><p>비교함에 담은 ${selected.length}곳 · 항목 제목을 눌러 정렬하세요.</p><button type="button" data-daycare-excel>엑셀 다운로드</button></div><div class="care-compare-scroll"><table class="compare-table"><thead><tr>${columns.map((col, index) => `<th scope="col" aria-sort="${index === sort ? ascending ? 'ascending' : 'descending' : 'none'}"><button type="button" data-daycare-sort="${index}">${escape(col[0])}${index === sort ? ascending ? ' ↑' : ' ↓' : ''}</button></th>`).join('')}</tr></thead><tbody>${sorted().map(row => `<tr>${columns.map(col => { const value = col[1](row); return `<td>${missing(value) ? '미확인' : escape(typeof value === 'number' ? Math.round(value * 100) / 100 : value)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div><p>기관 평가는 공단 공개자료입니다. 이용자의 장기요양등급과 다릅니다.</p>`;
            host.querySelectorAll('[data-daycare-sort]').forEach(node => node.onclick = () => { const next = Number(node.dataset.daycareSort); ascending = next === sort ? !ascending : true; sort = next; render(); });
            host.querySelector('[data-daycare-excel]').onclick = () => {
                if (!root.XLSX) { host.querySelector('.care-compare-toolbar p').textContent = '엑셀 기능을 불러오는 중입니다. 잠시 후 다시 눌러 주세요.'; return; }
                const sheet = root.XLSX.utils.aoa_to_sheet([columns.map(col => col[0]), ...sorted().map(row => columns.map(col => { const value = col[1](row); return missing(value) ? '미확인' : value; }))]);
                sheet['!autofilter'] = { ref: sheet['!ref'] };
                sheet['!cols'] = columns.map((_, index) => ({ wch: index < 2 ? 32 : 16 }));
                const book = root.XLSX.utils.book_new();
                root.XLSX.utils.book_append_sheet(book, sheet, '관심기관 비교');
                const now = new Date(), stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
                root.XLSX.writeFileXLSX(book, `돌봄한눈_주야간보호_비교_${stamp}.xlsx`, { compression: true });
            };
        }
        render();
        document.getElementById('compareLayer').hidden = false;
        document.getElementById('compareLayer').querySelector('[aria-label="비교표 닫기"]')?.focus();
    }
    /** SOFTM-WORKSPACE START 날짜:20260905 : 기존 검색·상세 진입점은 유지하면서 담은 기관 상태를 검색 선택과 분리 */
    function isBasketMap() { return workspace === 'saved'; }
    function exitBasketMap() { if (basketMap?.active()) setWorkspace('search', false); }
    function contains(id) { return basket?.has(id) || false; }
    function refreshMatch() { matchController?.refresh(); } // SOFTM-CARE-MATCH 날짜:20260910 : 전체 조회 완료와 진행 상태를 공용 설명에 전달
    root.CareMapExperience = Object.freeze({ refreshMatch, init, createSheetState, ensureListAdFallback, createZoomResearch, bindViewportResearch, button, rows, refresh, beginDetail, finishDetail, cancelDetail, costCard, showDaycareComparison, createBasket, createOrigin, routeBasket, isBasketMap, exitBasketMap, contains, focusSearchMap }); // SOFTM-SEARCH-MAP-SCROLL 날짜:20260907 : 조회 화면에서 공용 지도 이동 효과를 호출할 수 있도록 공개
    /** SOFTM-WORKSPACE END */
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-MAP-EXPERIENCE END */
