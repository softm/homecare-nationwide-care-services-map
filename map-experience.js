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
    let basketMap, draggedId = null, touchTarget = null, lastItems = ''; // SOFTM-BASKET-ORDER 날짜:20260904 : 비교함 조작 중 검색 목록 갱신이 드래그 요소를 교체하지 않도록 유지
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
        bar.querySelector('[data-basket-map]').disabled = !selected.length && !basketMap?.active();
        bar.querySelector('[data-basket-map]').textContent = basketMap?.active() ? '검색 결과 지도' : '담은 기관만 지도';
        bar.querySelector('[data-basket-map]').setAttribute('aria-pressed', String(basketMap?.active() || false));
        bar.querySelector('[data-basket-route]').disabled = !selected.length;
        bar.querySelector('[data-basket-edit]').hidden = !selected.length;
        const markup = selected.map((row, index) => `<li class="care-basket-item" data-basket-id="${escape(row.i)}"><button type="button" class="care-drag-handle" data-basket-drag="${escape(row.i)}" aria-label="${escape(row.n)} 순서 끌어서 이동">⠿</button><span class="care-basket-name"><b>${index + 1}.</b> ${escape(row.n)}</span><span class="care-basket-item-actions"><button type="button" data-basket-move="${escape(row.i)}" data-offset="-1" ${index === 0 ? 'disabled' : ''} aria-label="${escape(row.n)} 앞으로 이동">↑</button><button type="button" data-basket-move="${escape(row.i)}" data-offset="1" ${index === selected.length - 1 ? 'disabled' : ''} aria-label="${escape(row.n)} 뒤로 이동">↓</button><button type="button" data-care-basket="${escape(row.i)}" aria-label="${escape(row.n)} 비교함에서 빼기">×</button></span></li>`).join('');
        if (markup !== lastItems) { bar.querySelector('.care-basket-items').innerHTML = markup; lastItems = markup; }
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
        bar.innerHTML = '<div class="care-basket-summary"><strong>비교함 <span class="care-basket-count" aria-live="polite">0곳</span></strong><span class="care-basket-hint">드래그나 화살표로 방문 순서를 바꿀 수 있어요.</span><button type="button" data-basket-edit aria-expanded="false" hidden>순서 조정</button><button type="button" data-basket-clear hidden>비우기</button></div><div class="care-basket-actions"><button type="button" data-basket-map disabled aria-pressed="false">담은 기관만 지도</button><button type="button" data-basket-route disabled>담은 순서로 경로</button><button type="button" data-basket-open disabled>담은 기관 비교</button></div><ol class="care-basket-items" aria-label="방문 순서"></ol><p class="care-basket-status" role="status"></p>'; // SOFTM-BASKET-ORDER 날짜:20260904 : 비교함과 지도·경로의 대상 및 순서를 명확히 연결
        layout.before(bar);
        /** SOFTM-BASKET-MAP START 날짜:20260904 : 두 지도에 같은 비교함 전용 보기와 검색 복귀 동작을 연결 */
        basketMap = root.CareBasketMap.create({ ...options.basketMap, mode(active) { document.body.classList.toggle('care-basket-map', active); if (!active) bar.querySelector('.care-basket-status').textContent = '검색 결과 지도로 돌아왔습니다. 조회 조건과 비교함 순서는 유지됩니다.'; refresh(); }, status(message) { bar.querySelector('.care-basket-status').textContent = message; options.basketMap.status(message); } });
        if (root.ResizeObserver) new ResizeObserver(() => document.body.style.setProperty('--care-basket-height', `${bar.getBoundingClientRect().height + 28}px`)).observe(bar);
        function changed(message) { refresh(); if (basketMap.active()) void basketMap.show(rows(), { fit: false }); if (message) bar.querySelector('.care-basket-status').textContent = message; }
        function move(id, index) { const row = rowById.get(id); basket.move(id, index); changed(`${row?.n || '기관'}을 ${index + 1}번째로 옮겼습니다. 변경한 순서로 경로를 다시 계산할 수 있습니다.`); bar.querySelector(`[data-basket-drag="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); }
        function endDrag() { draggedId = null; touchTarget = null; bar.querySelectorAll('.care-drop-target').forEach(node => node.classList.remove('care-drop-target')); }
        bar.addEventListener('pointerdown', event => { const handle = event.target.closest('[data-basket-drag]'); if (!handle || event.button !== 0) return; event.preventDefault(); handle.focus({ preventScroll: true }); draggedId = handle.dataset.basketDrag; handle.setPointerCapture(event.pointerId); });
        bar.addEventListener('pointermove', event => { if (!draggedId) return; const item = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-basket-id]'); touchTarget = item?.dataset.basketId || null; bar.querySelectorAll('.care-drop-target').forEach(node => node.classList.remove('care-drop-target')); item?.classList.add('care-drop-target'); });
        bar.addEventListener('pointerup', () => { if (draggedId && touchTarget && draggedId !== touchTarget) move(draggedId, basket.ids().indexOf(touchTarget)); endDrag(); });
        bar.addEventListener('pointercancel', endDrag);
        /** SOFTM-BASKET-MAP END */
        media = root.matchMedia('(max-width: 1000px)');
        media.addEventListener('change', () => { syncView(); options.resizeMap?.(); });
        document.addEventListener('click', event => {
            const node = event.target.closest('[data-care-basket], [data-basket-open], [data-basket-clear], [data-basket-move], [data-basket-edit], [data-basket-map], [data-basket-route], button[data-care-view]'); // SOFTM-BASKET-MAP 날짜:20260904 : 비교함 조작이 기관 상세 클릭으로 전달되지 않도록 처리
            if (!node) return;
            event.stopPropagation();
            if (node.hasAttribute('data-care-basket')) { if (rowById.has(node.dataset.careBasket)) basket.toggle(node.dataset.careBasket); changed(); } // SOFTM-BASKET-MAP 날짜:20260904 : 담기·제거 시 이전 방문 경로를 지우고 현재 비교함만 표시
            else if (node.hasAttribute('data-basket-open')) options.compare();
            /** SOFTM-BASKET-ORDER START 날짜:20260904 : 모바일 순서 조정과 지도 복귀도 같은 비교함 상태로 처리 */
            else if (node.hasAttribute('data-basket-clear')) { basket.clear(); changed(); }
            else if (node.hasAttribute('data-basket-move')) move(node.dataset.basketMove, basket.ids().indexOf(node.dataset.basketMove) + Number(node.dataset.offset));
            else if (node.hasAttribute('data-basket-edit')) { const expanded = bar.classList.toggle('care-basket-editing'); node.setAttribute('aria-expanded', String(expanded)); }
            else if (node.hasAttribute('data-basket-map')) { if (basketMap.active()) basketMap.exit(); else { setView('map', false); void basketMap.show(rows()); } }
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
    function routeBasket() { setView('map', false); return basketMap?.show(rows(), { route: true }); }
    function isBasketMap() { return basketMap?.active() || false; }
    function exitBasketMap() { basketMap?.exit(); }
    function contains(id) { return basketMap?.has(id) || false; }
    root.CareMapExperience = Object.freeze({ init, button, rows, refresh, beginDetail, finishDetail, cancelDetail, costCard, showDaycareComparison, createBasket, routeBasket, isBasketMap, exitBasketMap, contains });
    /** SOFTM-BASKET-MAP END */
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-MAP-EXPERIENCE END */
