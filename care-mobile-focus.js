/** SOFTM-MOBILE-FOCUS START 날짜:20261003 : 전체 지도에서 검색·목록·담은 기관을 재생성하지 않고 떠 있는 조작부로 연결 */
(function (root) {
    'use strict';
    function mount({ card, config, enter: enterFocus, leave }) {
        const media = root.matchMedia('(max-width:1000px)');
        const body = document.body;
        const ui = document.createElement('div');
        ui.className = 'care-mobile-focus';
        ui.hidden = true;
        const icons = {
            /* SOFTM-MAP-STYLE START 날짜:20261005 : 기능을 글자뿐 아니라 색상 아이콘으로 구분 */
            type: '<path d="M12 20s-8-5-8-11a4 4 0 0 1 8-2 4 4 0 0 1 8 2c0 6-8 11-8 11Z"/><path d="M9 11h6M12 8v6"/>',
            facility: '<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/>',
            daycare: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
            bath: '<path d="M12 2s-7 8-7 13a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/>',
            bed: '<path d="M3 5v16M3 16h18v5M3 9h6v7M9 10h10a2 2 0 0 1 2 2v4"/>',
            equipment: '<circle cx="10" cy="4" r="2"/><path d="M10 7v7h7l3 6M10 10h6M7 10a6 6 0 1 0 7 9"/>',
            medical: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
            filter: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
            /* SOFTM-MAP-STYLE END */
            back: '<path d="m15 5-7 7 7 7"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
            close: '<path d="M6 6l12 12M18 6 6 18"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
            voice: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
            share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.2M8.7 13.3l6.6 4.2"/>', // SOFTM-MAP-SHARE 날짜:20261007 : 현재 지도의 공유 행동을 아이콘으로 구분
            fullscreen: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/><path d="M9 9 3 3M15 9l6-6M9 15l-6 6M15 15l6 6"/>',
            minimize: '<path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6"/><path d="M3 9l6-6M21 9l-6-6M3 15l6 6M21 15l-6 6"/>',
            layers: '<path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5"/>',
            list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
            saved: '<path d="M6 3h12v18l-6-4-6 4Z"/>', more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
        };
        const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
        /** SOFTM-MOBILE-SEARCH-MENU START 날짜:20261027 : 검색창과 도구를 접어도 입력한 검색어의 존재와 복귀 경로를 잃지 않음 */
        ui.innerHTML = `<div class="care-mobile-focus-top">
            <div class="care-mobile-focus-chips" role="toolbar" aria-label="지도 검색 도구">
                <button type="button" data-mobile-focus="type" aria-haspopup="dialog">${svg('type')}<span data-focus-type>유형 선택 ▾</span></button>
                <button type="button" data-mobile-focus="filter" aria-expanded="false">${svg('filter')}<span data-focus-filter>필터</span></button>
                <button type="button" data-mobile-focus="search" aria-expanded="false" aria-controls="careMobileFocusSearch">${svg('search')}<span data-focus-search>검색</span></button>
                <button type="button" data-mobile-focus="close" aria-label="지도 도구 숨기기" title="지도 도구 숨기기">${svg('close')}</button>
            </div>
            <form id="careMobileFocusSearch" class="care-mobile-focus-search" role="search" aria-label="전체 지도 검색" aria-hidden="true" hidden>
                <button type="button" data-mobile-focus="exit" aria-label="전체 지도 닫기">${svg('back')}</button>
                <input type="search" aria-label="지도에서 지역·기관 검색" placeholder="지역·기관명 검색" autocomplete="off">
                <button type="button" data-mobile-focus="voice" aria-label="음성검색">${svg('voice')}</button>
                <button type="submit" aria-label="검색">${svg('search')}</button>
            </form>
        </div>
        <button type="button" class="care-mobile-focus-menu" data-mobile-focus="menu" aria-label="지도 메뉴 열기" title="지도 메뉴 열기" hidden>${svg('menu')}</button>
        <button type="button" class="care-mobile-focus-query-status" data-mobile-focus="query-status" aria-controls="careMobileFocusSearch" hidden>${svg('search')}<span data-focus-query-status></span></button>
        <div class="care-mobile-focus-side"><button type="button" data-mobile-focus="layers" aria-label="일반지도 보기" aria-pressed="true">${svg('layers')}</button><!-- SOFTM-MOBILE-IMMERSIVE 날짜:20261010 : 지도변경 바로 아래에 확장·축소를 두어 카카오맵식 조작 흐름을 맞춤 --><button type="button" data-mobile-focus="fullscreen" aria-label="지도만 크게 보기" aria-pressed="false" title="지도만 크게 보기">${svg('fullscreen')}</button><button type="button" data-mobile-focus="share" aria-label="현재 지도 공유" title="현재 지도 공유">${svg('share')}</button></div><nav class="care-mobile-focus-dock" aria-label="전체 지도 도구"><button type="button" data-mobile-focus="list" aria-expanded="false">${svg('list')}<span>목록 <b data-focus-count>0</b></span></button><button type="button" data-mobile-focus="saved" aria-expanded="false">${svg('saved')}<span>담은 기관 <b data-focus-saved>0</b></span></button><button type="button" data-mobile-focus="more" aria-haspopup="dialog">${svg('more')}<span>더보기</span></button></nav>`;
        /** SOFTM-MOBILE-SEARCH-MENU END */
        document.body.append(ui); // SOFTM-DOCK-OVERLAY 날짜:20261005 : 지도 겹침 영역 밖에 두어 메뉴가 목록 위에 실제로 떠 있게 함
        const searchForm = ui.querySelector('.care-mobile-focus-search');
        const searchToggle = ui.querySelector('[data-mobile-focus="search"]');
        const menuButton = ui.querySelector('[data-mobile-focus="menu"]');
        const queryStatus = ui.querySelector('[data-mobile-focus="query-status"]'); // SOFTM-MOBILE-QUERY-STATE 날짜:20261027 : 전체 도구가 접혀도 검색어 상태를 지도 위에 남김
        const input = searchForm.querySelector('input');
        const original = document.getElementById('q');
        const results = document.querySelector('.results');
        const saved = document.getElementById('careSavedPanel');
        const savedClose = document.createElement('button');
        savedClose.type = 'button'; savedClose.className = 'care-focus-saved-close'; savedClose.textContent = '지도 계속 보기 ↓';
        saved.prepend(savedClose);
        /** SOFTM-SAVED-FULL START 날짜:20261007 : 기관 목록을 먼저 읽도록 보조 행동과 브리핑을 더보기로 모음 */
        const savedMore = document.createElement('details');
        savedMore.className = 'care-saved-more';
        savedMore.innerHTML = '<summary>더보기</summary><div class="care-saved-more-content"><div class="care-saved-more-actions"><button type="button" data-saved-extra="photo">사진 비교</button><button type="button" data-saved-extra="share">공유</button><button type="button" data-saved-extra="clear">비우기</button></div></div>';
        saved.querySelector('.care-saved-heading').after(savedMore);
        const insights = saved.querySelector('.care-insights');
        const insightsAnchor = document.createComment('saved insights position');
        insights.before(insightsAnchor);
        savedMore.addEventListener('click', event => {
            const action = event.target.closest('[data-saved-extra]')?.dataset.savedExtra;
            const selector = {photo:'[data-photo-compare]',share:'[data-basket-share]',clear:'[data-basket-clear]'}[action];
            if (!selector) return;
            saved.querySelector(selector)?.click();
        });
        function arrangeSaved(active) {
            savedMore.open = false;
            savedClose.textContent = active ? '← 지도' : '지도 계속 보기 ↓';
            if (active) savedMore.querySelector('.care-saved-more-content').append(insights);
            else insightsAnchor.after(insights);
        }
        /** SOFTM-SAVED-FULL END */
        const types = document.createElement('dialog');
        types.className = 'care-focus-types';
        types.setAttribute('aria-label', '돌봄 유형 선택');
        types.innerHTML = '<header><strong>돌봄 유형 선택</strong><button type="button" aria-label="유형 선택 닫기">×</button></header><div></div>';
        document.body.append(types);
        types.querySelector('header button').onclick = () => types.close();
        types.addEventListener('click', event => { if (event.target === types) types.close(); });
        let enabled = false, drag = null, filterWasOpen = false, voiceFromMobileSearch = false;
        /** SOFTM-MOBILE-SEARCH-MENU START 날짜:20261026 : 검색 포커스와 전체 도구 접힘을 서로 독립된 명시 상태로 관리 */
        function setSearchOpen(active, { focus = false, returnFocus = false } = {}) {
            const open = Boolean(active) && enabled && !body.classList.contains('care-mobile-map-menu-collapsed');
            searchForm.hidden = !open;
            searchForm.setAttribute('aria-hidden', String(!open));
            searchToggle.setAttribute('aria-expanded', String(open));
            body.classList.toggle('care-mobile-search-open', open);
            if (open) input.value = original.value;
            if (open && focus) root.setTimeout(() => input.focus({ preventScroll:true }), 0);
            else if (!open && returnFocus && enabled) root.setTimeout(() => searchToggle.focus({ preventScroll:true }), 0);
        }
        function setMenuCollapsed(active) {
            const collapsed = Boolean(active) && enabled;
            setSearchOpen(false);
            body.classList.toggle('care-mobile-map-menu-collapsed', collapsed);
            menuButton.hidden = !collapsed;
            if (collapsed) closeSheet();
            update(); // SOFTM-MOBILE-QUERY-STATE 날짜:20261027 : 접힘 전환 즉시 검색어 표식의 노출 상태를 동기화
            root.setTimeout(() => {
                config.resize();
                (collapsed ? menuButton : ui.querySelector('[data-mobile-focus="type"]')).focus({ preventScroll:true });
            }, 0);
        }
        searchForm.addEventListener('focusout', event => {
            if (event.relatedTarget && searchForm.contains(event.relatedTarget)) return;
            root.setTimeout(() => {
                if (!searchForm.hidden && !searchForm.contains(document.activeElement) && !document.querySelector('.care-voice-dialog[open]')) setSearchOpen(false);
            }, 0);
        });
        searchForm.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setSearchOpen(false, { returnFocus:true });
        });
        document.addEventListener('pointerdown', event => {
            if (enabled && !searchForm.hidden && !searchForm.contains(event.target) && !searchToggle.contains(event.target)) setSearchOpen(false);
        }, true);
        /** SOFTM-MOBILE-SEARCH-MENU END */
        /** SOFTM-MOBILE-IMMERSIVE START 날짜:20261010 : 지도만 볼 때 검색·목록 등 주변 오버레이를 접고 토글 하나로 복귀 */
        const fullscreenButton = ui.querySelector('[data-mobile-focus="fullscreen"]');
        function setImmersive(active) {
            body.classList.toggle('care-mobile-map-immersive', active);
            fullscreenButton.setAttribute('aria-pressed', String(active));
            fullscreenButton.setAttribute('aria-label', active ? '전체 지도 도구 보이기' : '지도만 크게 보기');
            fullscreenButton.title = fullscreenButton.getAttribute('aria-label');
            fullscreenButton.innerHTML = svg(active ? 'minimize' : 'fullscreen');
            if (active) closeSheet();
            root.setTimeout(config.resize, 0);
        }
        /** SOFTM-MOBILE-IMMERSIVE END */
        function closeSheet() {
            /** SOFTM-ROUTE-MAP START 날짜:20261007 : Esc도 완료 경로를 지우지 않고 먼저 경로 목록으로 복귀 */
            if (body.dataset.careWorkspace === 'saved' && body.dataset.carePanel === 'route' && body.dataset.careView === 'map') {
                document.querySelector('.care-view-switch [data-care-view="list"]').click();
                return;
            }
            /** SOFTM-ROUTE-MAP END */
            const wasSaved = body.dataset.careWorkspace === 'saved';
            if (wasSaved) config.results();
            body.classList.remove('care-focus-list', 'care-focus-saved');
            update();
        }
        /** SOFTM-ROUTE-MAP START 날짜:20261007 : 완료된 경로를 지우지 않고 지도와 경로 편집 목록을 왕복 */
        const routeNav = document.createElement('nav');
        routeNav.className = 'care-mobile-route-nav';
        routeNav.setAttribute('aria-label', '경로 지도 도구');
        routeNav.innerHTML = '<button type="button" data-care-view="list">← 담은 기관</button><strong>방문 경로</strong><button type="button" data-saved-fit>전체 경로</button>';
        document.body.append(routeNav);
        savedClose.onclick = () => {
            if (body.dataset.carePanel === 'route' && document.querySelector('.care-route-output')?.dataset.phase === 'success') {
                document.querySelector('.care-view-switch [data-care-view="map"]').click();
            } else closeSheet();
        };
        /** SOFTM-ROUTE-MAP END */
        let previousRoutePanel = false; // SOFTM-ROUTE-MAP 날짜:20261007 : 경로 편집 첫 진입에서 출발지 입력을 즉시 노출
        function update() {
            if (!enabled) return;
            const isSaved = body.dataset.careWorkspace === 'saved';
            if (body.classList.contains('care-focus-saved') !== isSaved) body.classList.toggle('care-focus-saved', isSaved);
            if (isSaved) { if (body.classList.contains('care-focus-list')) body.classList.remove('care-focus-list'); saved.inert = false; }
            /** SOFTM-ROUTE-MAP START 날짜:20261007 : 지도 보기 상태를 전체 목록 가림과 구분하고 경로 복귀 행동을 명시 */
            const editingRoute = isSaved && body.dataset.carePanel === 'route';
            if (editingRoute && !previousRoutePanel) saved.scrollTop = 0;
            previousRoutePanel = editingRoute;
            const routeMap = isSaved && body.dataset.carePanel === 'route' && body.dataset.careView === 'map';
            saved.inert = routeMap || !isSaved;
            const closeLabel = editingRoute && document.querySelector('.care-route-output')?.dataset.phase === 'success' ? '경로 지도' : '← 지도';
            if (savedClose.textContent !== closeLabel) savedClose.textContent = closeLabel;
            /** SOFTM-ROUTE-MAP END */
            const listOpen = body.classList.contains('care-focus-list');
            ui.querySelector('[data-mobile-focus="list"]').setAttribute('aria-expanded', String(listOpen));
            ui.querySelector('[data-mobile-focus="saved"]').setAttribute('aria-expanded', String(isSaved));
            const loading = body.classList.contains('care-map-loading'); // SOFTM-INITIAL-LOADING 날짜:20261026 : 첫 조회의 0건을 확정 결과처럼 표시하지 않음
            const count = loading ? '확인 중' : document.querySelector('#areaCount,#filteredCount')?.textContent.trim() || '0곳'; // SOFTM-INITIAL-LOADING 날짜:20261026 : 지도 진행 표시와 하단 목록 상태를 같은 시점에 전환
            const setText = (selector, value) => { const node = ui.querySelector(selector); if (node.textContent !== value) node.textContent = value; };
            /** SOFTM-MOBILE-QUERY-STATE START 날짜:20261027 : 닫힌 검색 버튼과 전체 도구 접힘 상태에서도 현재 입력어를 명시 */
            const query = original.value.trim();
            const hasQuery = Boolean(query);
            const collapsed = body.classList.contains('care-mobile-map-menu-collapsed');
            searchToggle.classList.toggle('has-active-query', hasQuery);
            setText('[data-focus-search]', hasQuery ? '검색 중' : '검색');
            const searchLabel = hasQuery ? `검색어 ${query} 입력됨. 검색창 열기` : '검색창 열기';
            searchToggle.setAttribute('aria-label', searchLabel);
            searchToggle.title = searchLabel;
            menuButton.classList.toggle('has-active-query', hasQuery);
            menuButton.setAttribute('aria-label', hasQuery ? '지도 메뉴 열기, 검색어 입력됨' : '지도 메뉴 열기');
            menuButton.title = menuButton.getAttribute('aria-label');
            queryStatus.hidden = !(hasQuery && collapsed);
            if (hasQuery) {
                setText('[data-focus-query-status]', `검색어 · ${query}`);
                queryStatus.setAttribute('aria-label', `검색어 ${query}. 검색창 열기`);
                queryStatus.title = `검색어 ${query}`;
            }
            /** SOFTM-MOBILE-QUERY-STATE END */
            setText('[data-focus-count]', loading ? count : count.replace(/\s*곳$/, '')); // SOFTM-INITIAL-LOADING 날짜:20261026 : 조회 중에는 숫자 대신 명확한 진행 문구를 유지
            ui.querySelector('[data-mobile-focus="list"]').setAttribute('aria-label', loading ? '검색 결과 확인 중' : `검색 결과 ${count} 목록`); // SOFTM-INITIAL-LOADING 날짜:20261026 : 보조기기에도 미완료 상태를 0건과 구분
            setText('[data-focus-saved]', String(root.CareMapExperience?.rows().length || 0));
            /* SOFTM-MAP-STYLE START 날짜:20261005 : 조건 갱신으로 아이콘이 사라지지 않도록 문구만 변경 */
            setText('[data-focus-type]', (document.querySelector('.care-type-menu-item[aria-current="true"]')?.textContent || '유형 선택') + ' ▾');
            const filtered = document.querySelector('.care-mobile-filter-toggle')?.classList.contains('has-active-filters');
            const filterCount = document.querySelector('.care-mobile-filter-toggle')?.dataset.filterCount;
            setText('[data-focus-filter]', filtered ? `필터 · ${filterCount || '설정됨'}` : '필터'); // SOFTM-MOBILE-CHIPS 날짜:20261010 : 모바일 칩 문구를 짧게 줄여 지도 가림을 줄임
            /* SOFTM-MAP-STYLE END */
            const filterOpen = body.classList.contains('care-mobile-filters-open');
            ui.querySelector('[data-mobile-focus="filter"]').setAttribute('aria-expanded', String(filterOpen));
            if (filterWasOpen && !filterOpen) { input.value = original.value; ui.querySelector('[data-mobile-focus="filter"]').focus({ preventScroll:true }); }
            filterWasOpen = filterOpen;
        }
        input.addEventListener('input', () => { original.value = input.value; original.dispatchEvent(new Event('input', { bubbles: true })); });
        const syncQuery = () => { if (enabled && document.activeElement !== input) input.value = original.value; update(); }; // SOFTM-MOBILE-QUERY-STATE 날짜:20261027 : 입력·삭제 즉시 닫힌 상태의 검색어 표식도 갱신
        original.addEventListener('input', syncQuery);
        document.getElementById('careNavigationMenu')?.addEventListener('close', () => { if (enabled && !document.querySelector('dialog[open]')) ui.querySelector('[data-mobile-focus="more"]').focus({ preventScroll:true }); });
        document.querySelector('.care-voice-dialog')?.addEventListener('close', () => {
            syncQuery();
            if (voiceFromMobileSearch && enabled) setSearchOpen(true, { focus:true });
            voiceFromMobileSearch = false;
        }); // SOFTM-MOBILE-SEARCH-MENU 날짜:20261026 : 음성검색을 마친 경우에만 접었던 모바일 검색창으로 복귀
        searchForm.onsubmit = event => {
            event.preventDefault(); original.value = input.value; input.blur(); setSearchOpen(false);
            if (body.dataset.careWorkspace === 'saved') closeSheet();
            config.search(input.value, document.getElementById('province').value, document.getElementById('city').value);
        };
        ui.addEventListener('click', event => {
            const button = event.target.closest('[data-mobile-focus]');
            if (!button) return;
            const action = button.dataset.mobileFocus;
            if (action === 'exit') leave();
            else if (action === 'search') setSearchOpen(searchForm.hidden, { focus:searchForm.hidden, returnFocus:!searchForm.hidden });
            else if (action === 'close') setMenuCollapsed(true);
            else if (action === 'menu') setMenuCollapsed(false);
            else if (action === 'query-status') { setMenuCollapsed(false); setSearchOpen(true, { focus:true }); } // SOFTM-MOBILE-QUERY-STATE 날짜:20261027 : 접힌 검색어 표식에서 바로 입력창으로 복귀
            else if (action === 'list') { if (body.classList.contains('care-focus-list')) closeSheet(); else { config.results(); body.classList.add('care-focus-list'); update(); } }
            else if (action === 'saved') { if (body.dataset.careWorkspace === 'saved') closeSheet(); else { config.saved(); update(); } }
            else if (action === 'voice') { voiceFromMobileSearch = true; document.querySelector('.care-voice-trigger')?.click(); }
            else if (action === 'share') document.getElementById('shareBtn')?.click(); // SOFTM-MAP-SHARE 날짜:20261007 : 기존 위치·배율·조건 공유 처리를 재사용
            else if (action === 'more') document.querySelector('.care-menu-trigger')?.click();
            else if (action === 'fullscreen') setImmersive(!body.classList.contains('care-mobile-map-immersive'));
            else if (action === 'filter') {
                if (body.dataset.careWorkspace === 'saved') closeSheet();
                document.querySelector('.care-mobile-filter-toggle')?.click();
                document.querySelector('.care-filter-panel-close')?.focus({ preventScroll:true });
            } else if (action === 'layers') {
                const satellite = config.layers(); button.setAttribute('aria-pressed', String(satellite));
                button.setAttribute('aria-label', satellite ? '일반지도 보기' : '위성지도 보기');
            } else if (action === 'type') {
                const choices = [...document.querySelectorAll('.care-type-menu-item')].map(source => {
                    /** SOFTM-MAP-STYLE START 날짜:20261005 : 기관 유형을 집·햇살·방문돌봄 등 의미 있는 그림으로 구분 */
                    const choice = document.createElement('button'); choice.type = 'button';
                    const typeIcons = {facility:'facility',daycare:'daycare','home-care':'type','home-nursing':'medical','home-bath':'bath','short-stay':'bed','welfare-equipment':'equipment',dementia:'type','nursing-hospital':'medical'};
                    choice.innerHTML = svg(typeIcons[source.dataset.typeMenu] || 'type');
                    const label = document.createElement('span'); label.textContent = source.textContent; choice.append(label);
                    /** SOFTM-MAP-STYLE END */
                    choice.setAttribute('aria-pressed', String(source.getAttribute('aria-current') === 'true'));
                    choice.onclick = () => {
                        types.close();
                        if (source.getAttribute('aria-current') !== 'true') {
                            try { root.sessionStorage.setItem('careMobileFocus:resume:v1', JSON.stringify({ type:source.dataset.typeMenu, time:Date.now() })); } catch {}
                        }
                        source.click();
                    }; return choice;
                });
                types.querySelector('div').replaceChildren(...choices); types.showModal();
            }
        });
        // 목록의 기존 단계 전환은 유지하고 드래그 중인 높이만 실제 하단 시트에 반영한다.
        const handle = document.querySelector('.care-sheet-handle');
        handle.addEventListener('pointerdown', event => { if (enabled && event.button === 0) drag = { id:event.pointerId, y:event.clientY, height:results.getBoundingClientRect().height }; });
        handle.addEventListener('pointermove', event => {
            if (!drag || event.pointerId !== drag.id) return;
            const bottom = parseFloat(getComputedStyle(results).bottom) || 0;
            results.style.setProperty('--care-focus-drag-size', `${Math.max(64, Math.min(root.innerHeight - bottom - 130, drag.height - event.clientY + drag.y))}px`);
        });
        for (const name of ['pointerup','pointercancel','lostpointercapture']) handle.addEventListener(name, () => { drag = null; results.style.removeProperty('--care-focus-drag-size'); });
        new MutationObserver(update).observe(body, { attributes:true, attributeFilter:['data-care-workspace','data-care-view','data-care-panel','class','data-care-sheet'] });
        for (const node of [document.querySelector('#areaCount,#filteredCount'), document.querySelector('#careSavedTab [data-saved-count]'), document.querySelector('.care-filter-state-badge')]) {
            if (node) new MutationObserver(update).observe(node, { childList:true, characterData:true, subtree:true, attributes:true });
        }
        function enter() {
            enabled = media.matches;
            ui.hidden = !enabled;
            body.classList.toggle('care-mobile-focus-active', enabled);
            root.CareListAds?.setFocus(enabled);
            arrangeSaved(enabled); // SOFTM-SAVED-FULL 날짜:20261007 : 모바일 진입에서만 보조 정보를 더보기로 이동
            if (enabled) {
                body.classList.remove('care-mobile-map-menu-collapsed');
                menuButton.hidden = true;
                setSearchOpen(false);
                input.value = original.value; update();
                ui.querySelector('[data-mobile-focus="type"]').focus({ preventScroll:true });
            } // SOFTM-MOBILE-SEARCH-MENU 날짜:20261026 : 지도 진입은 검색창을 접은 도구 한 행에서 시작
        }
        function exit() {
            arrangeSaved(false); // SOFTM-SAVED-FULL 날짜:20261007 : PC 복귀 시 기존 브리핑 위치를 보존
            enabled = false; filterWasOpen = false; voiceFromMobileSearch = false; ui.hidden = true; types.close();
            searchForm.hidden = true; searchForm.setAttribute('aria-hidden', 'true'); searchToggle.setAttribute('aria-expanded', 'false'); menuButton.hidden = true;
            body.classList.remove('care-mobile-focus-active','care-focus-saved','care-mobile-map-immersive','care-mobile-search-open','care-mobile-map-menu-collapsed'); // SOFTM-MOBILE-SEARCH-MENU 날짜:20261026 : 전체지도 종료 뒤 접힘 상태가 다음 진입에 남지 않도록 초기화
            root.CareListAds?.setFocus(false);
            document.querySelector('.care-mobile-filters-open .care-filter-panel-close')?.click();
        }
        media.addEventListener('change', () => { if (body.classList.contains('care-map-focus')) { exit(); enter(); config.resize(); } });
        try {
            const pending = JSON.parse(root.sessionStorage.getItem('careMobileFocus:resume:v1') || 'null');
            root.sessionStorage.removeItem('careMobileFocus:resume:v1');
            if (media.matches && pending?.type === new URL(root.location.href).searchParams.get('type') && Date.now() - pending.time < 60000) root.setTimeout(enterFocus, 0);
        } catch {}
        return { enter, exit, active:() => enabled, closeSheet };
    }
    root.CareMobileFocus = { mount };
})(globalThis);
/** SOFTM-MOBILE-FOCUS END */
