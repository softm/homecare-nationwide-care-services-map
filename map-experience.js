/** SOFTM-MAP-EXPERIENCE START 날짜:20260904 : 검색과 비교를 보호자의 선택 흐름에 맞추고 두 지도 사이에서 관심기관을 유지 */
(function (root) {
    'use strict';
    const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
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
            publish({ phase: 'loading', origin: null, candidates: [], error: '' });
            try {
                if (kind === 'address') {
                    const candidates = await provider.search(query);
                    if (token !== generation) return state;
                    publish({ phase: candidates.length ? 'choices' : 'error', candidates, error: candidates.length ? '' : '검색한 주소가 없습니다. 도로명과 건물번호를 확인해 주세요.' });
                } else {
                    const point = await provider.locate();
                    if (token !== generation) return state;
                    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || point.lat < 32 || point.lat > 40 || point.lng < 123 || point.lng > 133) throw new Error('국내에서 이용할 출발지를 주소로 입력해 주세요.');
                    let label = `현재 위치 (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`;
                    try { const address = await provider.describe(point); if (address) label = `현재 위치 · ${address}`; } catch {}
                    if (token !== generation) return state;
                    publish({ phase: 'ready', origin: { point, label }, candidates: [] });
                }
            } catch (error) { if (token === generation) publish({ phase: 'error', error: error.message || '출발지를 확인하지 못했습니다. 다시 선택해 주세요.' }); }
            return state;
        }
        return { state: () => state, search: query => run('address', query), locate: () => run('location'),
            choose(index) { const candidate = state.candidates[index]; if (state.phase !== 'choices' || !candidate) return; generation++; publish({ phase: 'ready', origin: candidate, candidates: [], error: '' }); },
            clear() { generation++; publish({ phase: 'idle', origin: null, candidates: [], error: '' }); },
            cancel() { generation++; if (state.phase === 'loading') publish({ phase: 'idle', error: '' }); }
        };
    }
    let options, basket, bar, media, detailOrigin, view = 'list', workspace = 'search', routePanel = false;
    let rowById = new Map(), restoreGeneration = 0, routeRevision = 0, readyTimer = null;
    let basketMap, routeOutput, originController, tabs, dock, lastItems = '', cancelBasketDrag = () => {};
    let routeState = { phase: 'idle', missing: [] }, originState = { phase: 'idle', origin: null, candidates: [] };
    const workspacePositions = { search: null, saved: null }, workspaceViews = { search: 'list', saved: 'list' };
    const positions = { search: { list: null, map: null }, saved: { list: null, map: null } };
    const allRows = () => options?.rows() || [];
    const rows = () => (basket?.ids() || []).map(id => rowById.get(id)).filter(Boolean);
    const busy = () => routeState.phase === 'routing' || routeState.phase === 'locating';
    function button(row) {
        const active = basket?.has(row.i) || false;
        return `<button type="button" class="care-basket-button" data-care-basket="${escape(row.i)}" aria-pressed="${active}" aria-label="${escape(row.n)} ${active ? '비교함에서 빼기' : '비교에 담기'}">${active ? '✓ 비교에 담음' : '+ 비교에 담기'}</button>`;
    }
    function evaluationLabel(row) { const grade = row.g || row.ev?.grade; return ['A', 'B', 'C', 'D', 'E'].includes(grade) ? `기관 평가 ${grade}등급` : grade === 'N' ? '신설·미평가' : '기관 평가 미확인'; }
    function refresh() {
        if (!basket || !bar) return;
        const selected = rows();
        tabs.querySelector('[data-saved-count]').textContent = selected.length;
        bar.querySelector('.care-basket-count').textContent = `${selected.length}곳`;
        bar.querySelector('[data-basket-open]').disabled = !selected.length;
        bar.querySelector('[data-route-edit]').disabled = !selected.length;
        bar.querySelector('[data-basket-clear]').hidden = !selected.length;
        bar.querySelector('.care-saved-empty').hidden = !!selected.length;
        bar.querySelector('.care-saved-actions').hidden = routePanel || !selected.length;
        bar.querySelector('.care-route-actions').hidden = !routePanel;
        bar.querySelector('[data-route-run]').disabled = !selected.length || selected.length > 16 || !originState.origin || originState.phase === 'loading' || busy();
        bar.querySelector('[data-route-run]').textContent = busy() ? '탐색 중…' : '경로탐색';
        bar.querySelector('[data-route-run]').setAttribute('aria-busy', String(busy()));
        const missing = new Set((routeState.missing || []).map(item => item.id));
        const markup = selected.map((row, index) => `<li class="care-basket-item" data-basket-id="${escape(row.i)}"><button type="button" class="care-drag-handle" data-basket-drag="${escape(row.i)}" aria-label="${escape(row.n)} 순서 끌어서 이동" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" aria-describedby="careBasketDragHelp">⠿</button><div class="care-basket-name"><button type="button" class="care-saved-title" data-saved-detail="${escape(row.i)}"><b>${index + 1}.</b> ${escape(row.n)}</button><p>${escape(row.a || '주소 확인 필요')}</p><small>${escape(evaluationLabel(row))}${missing.has(String(row.i)) ? ' · 위치 확인 필요' : ''}</small><button type="button" class="care-saved-detail" data-saved-detail="${escape(row.i)}">상세 보기</button></div><button type="button" class="care-saved-remove" data-care-basket="${escape(row.i)}" aria-label="${escape(row.n)} 비교함에서 빼기">×</button></li>`).join('');
        if (markup !== lastItems) { cancelBasketDrag(); bar.querySelector('.care-basket-items').innerHTML = markup; lastItems = markup; }
        dock.textContent = `담은 기관 ${selected.length}곳 보기 →`;
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
    function syncView() {
        document.body.dataset.careView = view;
        document.body.dataset.careWorkspace = workspace;
        document.body.dataset.carePanel = routePanel ? 'route' : 'saved';
        document.body.classList.toggle('care-basket-map', workspace === 'saved');
        document.body.style.setProperty('--care-nav-height', `${document.querySelector('.category-nav')?.getBoundingClientRect().height || 0}px`);
        const compact = media.matches, saved = workspace === 'saved';
        const map = document.querySelector('.map-card'), results = document.querySelector('.results');
        results.hidden = saved; results.inert = saved || compact && view !== 'list';
        bar.hidden = !saved; bar.inert = !saved || compact && view !== 'list';
        map.inert = compact && view !== 'map';
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
        workspacePositions[workspace] = remember(); workspaceViews[workspace] = view;
        options.closeDetail?.(); cancelDetail(); cancelBasketDrag(); originController.cancel(); routeRevision++;
        clearTimeout(readyTimer); workspace = next; routePanel = false; view = workspaceViews[next];
        syncView(); options.resizeMap?.();
        if (next === 'saved') showSaved(); else basketMap.exit();
        if (restoreScroll && workspacePositions[next]) restore(workspacePositions[next]);
        else if (restoreScroll) document.querySelector(next === 'search' ? '.care-workspace-tabs' : media.matches ? '.care-view-switch' : '.layout')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
    function beginDetail(showMap = true) {
        restoreGeneration++;
        if (!detailOrigin) detailOrigin = { workspace, view, position: remember(), focus: document.activeElement };
        if (showMap && media?.matches) setView('map', false);
    }
    function finishDetail() {
        const previous = detailOrigin; detailOrigin = null;
        if (!previous || previous.workspace !== workspace) return;
        if (media?.matches) { view = previous.view; syncView(); options.resizeMap?.(); }
        restore(previous.position);
        if (previous.focus?.isConnected) previous.focus.focus({ preventScroll: true });
    }
    function cancelDetail() { detailOrigin = null; restoreGeneration++; }
    function changed(message = '') {
        routeRevision++; refresh();
        if (workspace === 'saved') void showSaved({ fit: false });
        bar.querySelector('.care-order-status').textContent = message || (routePanel ? '방문 기관이 변경되었습니다. 경로를 다시 탐색해 주세요.' : '');
    }
    function renderOrigin() {
        bar.querySelector('.care-origin-selection').textContent = originState.origin ? `출발: ${originState.origin.label}` : '출발지를 선택해 주세요.';
        bar.querySelector('.care-origin-status').textContent = originState.phase === 'loading' ? '출발지를 확인하고 있습니다…' : originState.error || '';
        bar.querySelector('.care-origin-candidates').innerHTML = originState.candidates.map((item, index) => `<li><button type="button" data-origin-choice="${index}">${escape(item.label)}<span>출발지로 선택</span></button></li>`).join('');
        bar.querySelector('[data-origin-locate]').disabled = originState.phase === 'loading';
        bar.querySelector('[data-origin-search]').disabled = originState.phase === 'loading';
        refresh();
    }
    function renderRoute(state) {
        routeState = state;
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
    function editRoute(open = true) {
        if (workspace !== 'saved') setWorkspace('saved');
        originController.cancel(); routeRevision++; routePanel = open;
        syncView(); setView('list', false); showSaved({ fit: false }); renderOrigin();
        bar.querySelector(open ? '.care-route-editor h2' : '.care-saved-heading h2')?.focus({ preventScroll: true });
    }
    async function routeBasket() {
        if (!routePanel) { editRoute(); return; }
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
    function prepareFilters() {
        const filters = document.querySelector('.filters'), main = document.querySelector('main.wrap');
        if (!filters || !main) return;
        main.prepend(filters);
        const heading = document.createElement('div');
        heading.className = 'care-search-heading';
        heading.innerHTML = '<div><h2>어느 지역에서 찾으세요?</h2><p>지역이나 기관명을 입력하고, 마음에 드는 기관을 비교에 담아 보세요.</p></div><a href="care-cost.html">월 예상 비용 알아보기 →</a>';
        filters.prepend(heading);
        const advanced = document.createElement('details');
        advanced.className = 'care-extra-filters';
        advanced.innerHTML = '<summary>상세조건 <span>인력 · 제공 서비스</span></summary><p class="care-grade-help">기관 평가 A~E는 공단의 기관 평가입니다. 이용자의 장기요양등급 1~5등급·인지지원등급과 다릅니다.</p><div class="care-extra-basic"></div>'; // SOFTM-BASIC-FILTER 날짜:20260904 : 평가 관련 기본 조건은 접지 않고 검색창 아래에서 바로 조작
        if (options.type === 'nursing-hospital') {
            advanced.querySelector('summary span').textContent = '상세 주소';
            advanced.querySelector('.care-grade-help').remove();
        }
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
    function init(config) {
        if (options) return;
        options = config; rowById = new Map(allRows().map(row => [String(row.i), row]));
        let storage; try { storage = root.sessionStorage; } catch {}
        basket = createBasket(storage, options.type); basket.retain(new Set(rowById.keys()));
        document.body.classList.add('care-map-page'); prepareFilters();
        media = root.matchMedia('(max-width: 1000px)');
        const layout = document.querySelector('.layout'), results = document.querySelector('.results');
        results.id = 'careSearchResults';
        tabs = document.createElement('nav'); tabs.className = 'care-workspace-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '기관 찾기와 담은 기관');
        tabs.innerHTML = '<button type="button" id="careSearchTab" role="tab" data-workspace="search" aria-selected="true" aria-controls="careSearchResults">기관 찾기</button><button type="button" id="careSavedTab" role="tab" data-workspace="saved" aria-selected="false" aria-controls="careSavedPanel" tabindex="-1">담은 기관 <span data-saved-count>0</span></button>';
        document.querySelector('main.wrap').prepend(tabs);
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
        layout.prepend(bar); layout.prepend(results);
        dock = document.createElement('button'); dock.type = 'button'; dock.className = 'care-saved-dock'; dock.dataset.workspace = 'saved'; document.body.append(dock);
        routeOutput = document.createElement('section'); routeOutput.className = 'care-route-output'; routeOutput.setAttribute('aria-label', '경로탐색 결과');
        routeOutput.innerHTML = '<p role="status"></p><div class="care-route-summary"></div><details class="care-route-itinerary" hidden></details>';
        bar.querySelector('.care-saved-footer').before(routeOutput);
        const mapTools = document.createElement('div'); mapTools.className = 'care-saved-map-tools'; mapTools.innerHTML = '<strong>담은 기관</strong><button type="button" data-saved-fit>전체 위치</button><button type="button" data-care-view="list">목록 보기</button>'; document.querySelector('.map-card .map-wrap').before(mapTools);
        basketMap = root.CareBasketMap.create({ ...options.basketMap, state: renderRoute });
        originController = createOrigin({
            search: query => root.NaverGeocoder.searchAddresses(query),
            describe: async point => (await root.NaverGeocoder.reverseGeocode(point.lat, point.lng)).address,
            locate: () => new Promise((resolve, reject) => {
                if (!root.navigator.geolocation) { reject(new Error('현재 위치를 지원하지 않습니다. 주소를 입력해 주세요.')); return; }
                root.navigator.geolocation.getCurrentPosition(position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }), error => reject(new Error(error.code === 1 ? '위치 권한이 꺼져 있습니다. 주소를 입력하거나 브라우저에서 위치 권한을 허용해 주세요.' : '현재 위치를 확인하지 못했습니다. 다시 시도하거나 주소를 입력해 주세요.')), { timeout: 10000, maximumAge: 60000 });
            })
        }, state => {
            const previous = originState.origin; originState = state;
            if (previous !== state.origin) { routeRevision++; if (workspace === 'saved' && routePanel) showSaved({ fit: false }); }
            renderOrigin();
        });
        function move(id, index) { const row = rowById.get(id); basket.move(id, index); changed(`${row?.n || '기관'}을 ${index + 1}번째로 옮겼습니다.${routePanel ? ' 경로를 다시 탐색해 주세요.' : ''}`); bar.querySelector(`[data-basket-drag="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); }
        cancelBasketDrag = installBasketDrag(bar, move);
        tabs.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 'search' : event.key === 'End' ? 'saved' : workspace === 'search' ? 'saved' : 'search'; setWorkspace(next); tabs.querySelector(`[data-workspace="${next}"]`).focus({ preventScroll: true }); });
        media.addEventListener('change', () => { syncView(); options.resizeMap?.(); if (workspace === 'saved') requestAnimationFrame(() => basketMap.fit()); });
        document.addEventListener('click', event => {
            const node = event.target.closest('[data-care-basket], [data-workspace], [data-basket-open], [data-basket-clear], [data-route-edit], [data-route-back], [data-route-run], [data-origin-locate], [data-origin-choice], [data-saved-detail], [data-saved-fit], button[data-care-view]');
            if (!node || node.disabled) return;
            event.stopPropagation();
            if (node.hasAttribute('data-care-basket')) { if (rowById.has(node.dataset.careBasket)) basket.toggle(node.dataset.careBasket); changed(); }
            else if (node.hasAttribute('data-workspace')) setWorkspace(node.dataset.workspace);
            else if (node.hasAttribute('data-basket-open')) options.compare();
            else if (node.hasAttribute('data-basket-clear')) { basket.clear(); changed(); }
            else if (node.hasAttribute('data-route-edit')) editRoute();
            else if (node.hasAttribute('data-route-back')) editRoute(false);
            else if (node.hasAttribute('data-route-run')) void routeBasket();
            else if (node.hasAttribute('data-origin-locate')) void originController.locate();
            else if (node.hasAttribute('data-origin-choice')) originController.choose(Number(node.dataset.originChoice));
            else if (node.hasAttribute('data-saved-detail')) options.detail(node.dataset.savedDetail);
            else if (node.hasAttribute('data-saved-fit')) basketMap.fit();
            else setView(node.dataset.careView);
        }, true);
        bar.querySelector('.care-origin-form').addEventListener('submit', event => { event.preventDefault(); const input = bar.querySelector('#careOriginAddress'); if (!input.value.trim()) { input.focus(); return; } void originController.search(input.value.trim()); });
        bar.querySelector('#careOriginAddress').addEventListener('input', () => { if (originState.phase !== 'idle') originController.clear(); });
        document.addEventListener('toggle', event => {
            const details = event.target;
            if (!details.matches?.('details[data-cost-service]') || !details.open || details.dataset.costMounted) return;
            const row = rowById.get(details.dataset.costInstitution); if (!row || !root.CareCostUI) return;
            details.dataset.costMounted = 'true'; root.CareCostUI.mount(details.querySelector('.care-map-cost-host'), { service: details.dataset.costService, institution: { id: row.i, name: row.n, serviceCodes: String(row.t || '').split(',').filter(Boolean) } });
        }, true);
        root.addEventListener('pageshow', () => { const before = basket.ids().join(','); if (storage) { basket = createBasket(storage, options.type); basket.retain(new Set(rowById.keys())); } if (before !== basket.ids().join(',')) changed(); else refresh(); });
        syncView(); renderOrigin(); renderRoute(routeState);
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
    root.CareMapExperience = Object.freeze({ init, button, rows, refresh, beginDetail, finishDetail, cancelDetail, costCard, showDaycareComparison, createBasket, createOrigin, routeBasket, isBasketMap, exitBasketMap, contains });
    /** SOFTM-WORKSPACE END */
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-MAP-EXPERIENCE END */
