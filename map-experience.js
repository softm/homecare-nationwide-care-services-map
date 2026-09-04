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
    let options, basket, bar, media, detailOrigin, view = 'list';
    let rowById = new Map(), restoreGeneration = 0;
    let basketMap, mapFeedback, routeBusy = false, lastItems = '', cancelBasketDrag = () => {}; // SOFTM-ROUTE-VIEW 날짜:20260905 : 지도 결과와 경로 진행 상태를 두 화면에서 동일하게 표시
    const positions = { list: null, map: null };
    const allRows = () => options?.rows() || [];
    const rows = () => (basket?.ids() || []).map(id => rowById.get(id)).filter(Boolean);
    function button(row) {
        const active = basket?.has(row.i) || false;
        return `<button type="button" class="care-basket-button" data-care-basket="${escape(row.i)}" aria-pressed="${active}" aria-label="${escape(row.n)} ${active ? '비교함에서 빼기' : '비교에 담기'}">${active ? '✓ 비교에 담음' : '+ 비교에 담기'}</button>`;
    }
    function refresh() {
        if (!basket || !bar) return;
        const selected = rows();
        bar.classList.toggle('has-items', selected.length > 0 || basketMap?.active()); // SOFTM-BASKET-MAP 날짜:20260904 : 비운 비교함 지도에서도 검색 복귀 버튼을 유지
        document.body.classList.toggle('has-care-basket', selected.length > 0 || basketMap?.active()); // SOFTM-BASKET-MAP 날짜:20260904 : 고정 비교함이 마지막 목록을 가리지 않도록 여백 유지
        bar.querySelector('.care-basket-count').textContent = `${selected.length}곳`;
        bar.querySelector('[data-basket-open]').disabled = !selected.length;
        bar.querySelector('[data-basket-clear]').hidden = !selected.length;
        /** SOFTM-BASKET-ORDER START 날짜:20260904 : 드래그·키보드·터치에서 같은 방문 순서와 지도 전환 동작을 제공 */
        /** SOFTM-ROUTE-VIEW START 날짜:20260905 : 현재 선택이 바뀌어도 버튼 이름은 유지해 지도에 보이는 기관을 분명하게 구분 */
        const basketActive = basketMap?.active() || false;
        bar.querySelectorAll('[data-basket-map]').forEach(node => {
            const savedOnly = node.dataset.basketMap === 'saved';
            node.disabled = savedOnly && !selected.length && !basketActive;
            node.setAttribute('aria-pressed', String(savedOnly === basketActive));
        });
        bar.querySelector('[data-basket-map="saved"] span').textContent = `${selected.length}곳`;
        document.querySelectorAll('[data-basket-route], #routeBtn, [data-basket-route-shortcut]').forEach(node => {
            node.disabled = !selected.length || routeBusy;
            node.textContent = routeBusy ? '탐색 중…' : '경로탐색';
            node.setAttribute('aria-busy', String(routeBusy));
        });
        /** SOFTM-ROUTE-VIEW END */
        bar.querySelector('[data-basket-edit]').hidden = !selected.length;
        /** SOFTM-DRAG-FEEDBACK START 날짜:20260904 : 위아래 버튼을 없애고 손잡이로 순서를 조정하며 키보드 접근은 방향키로 유지 */
        const markup = selected.map((row, index) => `<li class="care-basket-item" data-basket-id="${escape(row.i)}"><button type="button" class="care-drag-handle" data-basket-drag="${escape(row.i)}" aria-label="${escape(row.n)} 순서 끌어서 이동" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" aria-describedby="careBasketDragHelp">⠿</button><span class="care-basket-name"><b>${index + 1}.</b> ${escape(row.n)}</span><span class="care-basket-item-actions"><button type="button" data-care-basket="${escape(row.i)}" aria-label="${escape(row.n)} 비교함에서 빼기">×</button></span></li>`).join('');
        if (markup !== lastItems) { cancelBasketDrag(); bar.querySelector('.care-basket-items').innerHTML = markup; lastItems = markup; }
        /** SOFTM-DRAG-FEEDBACK END */
        document.querySelectorAll('#list input[type="checkbox"], #selectAll, #selectAllResults').forEach(node => { node.disabled = basketMap?.active() || false; });
        /** SOFTM-BASKET-ORDER END */
        document.querySelectorAll('.care-basket-button[data-care-basket]').forEach(node => {
            const active = basket.has(node.dataset.careBasket);
            const row = rowById.get(node.dataset.careBasket);
            node.setAttribute('aria-pressed', String(active));
            node.setAttribute('aria-label', `${row?.n || '기관'} ${active ? '비교함에서 빼기' : '비교에 담기'}`);
            node.textContent = active ? '✓ 비교에 담음' : '+ 비교에 담기';
        });
    }
    function remember() { return { top: root.scrollY, list: document.getElementById('list')?.scrollTop || 0 }; }
    function restore(position) {
        if (!position) return;
        const generation = ++restoreGeneration;
        requestAnimationFrame(() => { if (generation !== restoreGeneration) return; const list = document.getElementById('list'); if (list) list.scrollTop = position.list; root.scrollTo({ top: position.top, behavior: 'instant' }); });
    }
    function syncView() {
        document.body.dataset.careView = view;
        const compact = media.matches;
        const map = document.querySelector('.map-card'), results = document.querySelector('.results');
        if (map) map.inert = compact && view !== 'map';
        if (results) results.inert = compact && view !== 'list';
        document.querySelectorAll('button[data-care-view]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.careView === view)));
    }
    function setView(next, preserveScroll = true) {
        if (!media?.matches) return;
        restoreGeneration++;
        positions[view] = remember();
        view = next === 'map' ? 'map' : 'list';
        syncView();
        options?.resizeMap?.();
        if (preserveScroll && positions[view]) restore(positions[view]);
        else document.querySelector('.care-view-switch')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
    function beginDetail(showMap = true) {
        restoreGeneration++;
        if (!detailOrigin) detailOrigin = { view, position: remember(), focus: document.activeElement };
        if (showMap && media?.matches) setView('map', false);
    }
    function finishDetail() {
        const previous = detailOrigin;
        detailOrigin = null;
        if (!previous) return;
        if (media?.matches) { view = previous.view; syncView(); options?.resizeMap?.(); }
        restore(previous.position);
        if (previous.focus?.isConnected) previous.focus.focus({ preventScroll: true });
    }
    /** SOFTM-MAP-RESTORE START 날짜:20260904 : 직접 지도 이동 뒤에는 과거 상세의 목록 위치로 되돌리지 않도록 복귀 예약도 해제 */
    function cancelDetail() { detailOrigin = null; restoreGeneration++; }
    /** SOFTM-MAP-RESTORE END */
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
        for (const node of [...filters.children]) if (node.matches('#advancedSearch, .filter-note')) advanced.append(node); // SOFTM-BASIC-FILTER 날짜:20260904 : 사용자가 유지 요청한 세 가지 기본 조회 조건을 항상 표시
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
    function init(config) {
        if (options) return;
        options = config;
        rowById = new Map(allRows().map(row => [String(row.i), row]));
        let storage;
        try { storage = root.sessionStorage; } catch {}
        basket = createBasket(storage, options.type);
        basket.retain(new Set(rowById.keys()));
        document.body.classList.add('care-map-page');
        prepareFilters();
        const layout = document.querySelector('.layout');
        const switcher = document.createElement('div');
        switcher.className = 'care-view-switch';
        switcher.setAttribute('role', 'group');
        switcher.setAttribute('aria-label', '기관 보기 방식');
        switcher.innerHTML = '<button type="button" data-care-view="list" aria-pressed="true">목록으로 보기</button><button type="button" data-care-view="map" aria-pressed="false">지도로 보기</button>';
        layout.before(switcher);
        bar = document.createElement('section');
        bar.className = 'care-basket';
        bar.setAttribute('aria-label', '관심 기관 비교함');
        bar.innerHTML = '<div class="care-basket-summary"><strong>비교함 <span class="care-basket-count" aria-live="polite">0곳</span></strong><span class="care-basket-hint">⠿ 손잡이를 잡고 끌어 방문 순서를 바꾸세요.</span><button type="button" data-basket-edit aria-expanded="false" hidden>순서 조정</button><button type="button" data-basket-clear hidden>비우기</button></div><div class="care-map-choice" role="group" aria-label="지도에 표시할 기관"><span class="care-map-choice-label">지도에 표시</span><div class="care-map-options"><button type="button" data-basket-map="search" aria-pressed="true">검색 결과</button><button type="button" data-basket-map="saved" disabled aria-pressed="false">비교함에 담은 기관 <span>0곳</span></button></div></div><div class="care-basket-actions"><button type="button" data-basket-route disabled>경로탐색</button><button type="button" data-basket-open disabled>담은 기관 비교</button></div><span class="care-drag-help" id="careBasketDragHelp">손잡이를 끌어 순서를 바꿉니다. 손잡이에 초점을 두고 방향키로도 조정할 수 있습니다.</span><ol class="care-basket-items" aria-label="방문 순서"></ol><p class="care-basket-status" role="status"></p>'; // SOFTM-ROUTE-VIEW 날짜:20260905 : 지도 표시 대상 두 가지를 나란히 두고 경로 실행을 별도 행동으로 구분
        layout.before(bar);
        /** SOFTM-BASKET-MAP START 날짜:20260904 : 두 지도에 같은 비교함 전용 보기와 검색 복귀 동작을 연결 */
        /** SOFTM-ROUTE-VIEW START 날짜:20260905 : 경로 결과가 화면 아래에서 숨지 않도록 지도 바로 위에도 표시 */
        mapFeedback = document.createElement('p');
        mapFeedback.className = 'care-map-feedback';
        mapFeedback.hidden = true;
        document.querySelector('.map-card .map-wrap').before(mapFeedback);
        basketMap = root.CareBasketMap.create({ ...options.basketMap,
            mode(active) {
                document.body.classList.toggle('care-basket-map', active);
                mapFeedback.hidden = !active;
                if (!active) bar.querySelector('.care-basket-status').textContent = '검색 결과 지도로 돌아왔습니다. 조회 조건과 비교함 순서는 유지됩니다.';
                refresh(); options.resizeMap?.();
            },
            busy(value) { routeBusy = value; refresh(); },
            status(message) {
                bar.querySelector('.care-basket-status').textContent = message;
                mapFeedback.textContent = message.split(' · 출발:')[0];
                options.basketMap.status(message);
            }
        });
        /** SOFTM-ROUTE-VIEW END */
        if (root.ResizeObserver) new ResizeObserver(() => document.body.style.setProperty('--care-basket-height', `${bar.getBoundingClientRect().height + 28}px`)).observe(bar);
        function changed(message) { refresh(); if (basketMap.active()) void basketMap.show(rows(), { fit: false }); if (message) bar.querySelector('.care-basket-status').textContent = message; }
        function move(id, index) { const row = rowById.get(id); basket.move(id, index); changed(`${row?.n || '기관'}을 ${index + 1}번째로 옮겼습니다. 변경한 순서로 경로를 다시 계산할 수 있습니다.`); bar.querySelector(`[data-basket-drag="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); }
        cancelBasketDrag = installBasketDrag(bar, move); // SOFTM-DRAG-FEEDBACK 날짜:20260904 : 두 지도에서 동일한 카드 이동·놓기 표시와 취소 동작을 사용
        /** SOFTM-BASKET-MAP END */
        media = root.matchMedia('(max-width: 1000px)');
        media.addEventListener('change', () => { syncView(); options.resizeMap?.(); });
        document.addEventListener('click', event => {
            const node = event.target.closest('[data-care-basket], [data-basket-open], [data-basket-clear], [data-basket-edit], [data-basket-map], [data-basket-route], button[data-care-view]'); // SOFTM-DRAG-FEEDBACK 날짜:20260904 : 제거한 위아래 버튼 분기를 없애고 드래그 손잡이의 입력을 유지
            if (!node) return;
            event.stopPropagation();
            if (node.hasAttribute('data-care-basket')) { if (rowById.has(node.dataset.careBasket)) basket.toggle(node.dataset.careBasket); changed(); } // SOFTM-BASKET-MAP 날짜:20260904 : 담기·제거 시 이전 방문 경로를 지우고 현재 비교함만 표시
            else if (node.hasAttribute('data-basket-open')) options.compare();
            /** SOFTM-BASKET-ORDER START 날짜:20260904 : 모바일 순서 조정과 지도 복귀도 같은 비교함 상태로 처리 */
            else if (node.hasAttribute('data-basket-clear')) { basket.clear(); changed(); }
            else if (node.hasAttribute('data-basket-edit')) { const expanded = bar.classList.toggle('care-basket-editing'); node.setAttribute('aria-expanded', String(expanded)); }
            /** SOFTM-ROUTE-VIEW START 날짜:20260905 : 선택된 모드를 다시 눌러도 경로를 지우거나 반대 모드로 전환하지 않음 */
            else if (node.hasAttribute('data-basket-map')) {
                if (node.dataset.basketMap === 'search') basketMap.exit();
                else if (!basketMap.active()) void basketMap.show(rows());
                revealMap();
            }
            /** SOFTM-ROUTE-VIEW END */
            else if (node.hasAttribute('data-basket-route')) routeBasket();
            /** SOFTM-BASKET-ORDER END */
            else setView(node.dataset.careView);
        }, true);
        document.addEventListener('toggle', event => {
            const details = event.target;
            if (!details.matches?.('details[data-cost-service]') || !details.open || details.dataset.costMounted) return;
            const row = rowById.get(details.dataset.costInstitution);
            if (!row || !root.CareCostUI) return;
            details.dataset.costMounted = 'true';
            root.CareCostUI.mount(details.querySelector('.care-map-cost-host'), { service: details.dataset.costService, institution: { id: row.i, name: row.n, serviceCodes: String(row.t || '').split(',').filter(Boolean) } });
        }, true);
        root.addEventListener('pageshow', () => {
            try { if (storage) { storage.getItem(`careCompare:v1:${options.type}`); basket = createBasket(storage, options.type); basket.retain(new Set(rowById.keys())); } } catch {}
            changed(); // SOFTM-BASKET-ORDER 날짜:20260904 : 같은 세션의 다른 지도에서 바꾼 순서도 복귀 시 반영
        });
        syncView();
        refresh();
    }
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
    /** SOFTM-BASKET-MAP START 날짜:20260904 : 지도 자동검색과 비교함 전용 보기를 구분하는 공통 진입점 */
/** SOFTM-ROUTE-VIEW START 날짜:20260905 : 버튼 실행 즉시 지도로 이동하고 중복 경로 요청으로 앞선 응답을 취소하지 않음 */
    function revealMap() {
        bar?.classList.remove('care-basket-editing');
        bar?.querySelector('[data-basket-edit]')?.setAttribute('aria-expanded', 'false');
        setView('map', false);
        document.querySelector('.map-card')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
    function routeBasket() {
        if (routeBusy) return;
        const pending = basketMap?.show(rows(), { route: true });
        revealMap();
        return pending;
    }
    /** SOFTM-ROUTE-VIEW END */
    function isBasketMap() { return basketMap?.active() || false; }
    function exitBasketMap() { basketMap?.exit(); }
    function contains(id) { return basketMap?.has(id) || false; }
    root.CareMapExperience = Object.freeze({ init, button, rows, refresh, beginDetail, finishDetail, cancelDetail, costCard, showDaycareComparison, createBasket, routeBasket, isBasketMap, exitBasketMap, contains });
    /** SOFTM-BASKET-MAP END */
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-MAP-EXPERIENCE END */
