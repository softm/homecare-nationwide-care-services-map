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
            back: '<path d="m15 5-7 7 7 7"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
            voice: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
            layers: '<path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5"/>',
            list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
            saved: '<path d="M6 3h12v18l-6-4-6 4Z"/>', more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
        };
        const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
        ui.innerHTML = `<div class="care-mobile-focus-top"><form class="care-mobile-focus-search" role="search" aria-label="전체 지도 검색"><button type="button" data-mobile-focus="exit" aria-label="전체 지도 닫기">${svg('back')}</button><input type="search" aria-label="지도에서 지역·기관 검색" placeholder="지역·기관명 검색" autocomplete="off"><button type="button" data-mobile-focus="voice" aria-label="음성검색">${svg('voice')}</button><button type="submit" aria-label="검색">${svg('search')}</button></form><div class="care-mobile-focus-chips"><button type="button" data-mobile-focus="type" aria-haspopup="dialog">유형 선택 ▾</button><button type="button" data-mobile-focus="filter" aria-expanded="false">상세필터</button></div></div><div class="care-mobile-focus-side"><button type="button" data-mobile-focus="layers" aria-label="위성지도 보기" aria-pressed="false">${svg('layers')}</button></div><nav class="care-mobile-focus-dock" aria-label="전체 지도 도구"><button type="button" data-mobile-focus="list" aria-expanded="false">${svg('list')}<span>목록 <b data-focus-count>0</b></span></button><button type="button" data-mobile-focus="saved" aria-expanded="false">${svg('saved')}<span>담은 기관 <b data-focus-saved>0</b></span></button><button type="button" data-mobile-focus="more" aria-haspopup="dialog">${svg('more')}<span>더보기</span></button></nav>`;
        card.querySelector('.map-wrap').append(ui);
        const input = ui.querySelector('input');
        const original = document.getElementById('q');
        const results = document.querySelector('.results');
        const saved = document.getElementById('careSavedPanel');
        const savedClose = document.createElement('button');
        savedClose.type = 'button'; savedClose.className = 'care-focus-saved-close'; savedClose.textContent = '지도 계속 보기 ↓';
        saved.prepend(savedClose);
        const types = document.createElement('dialog');
        types.className = 'care-focus-types';
        types.setAttribute('aria-label', '돌봄 유형 선택');
        types.innerHTML = '<header><strong>돌봄 유형 선택</strong><button type="button" aria-label="유형 선택 닫기">×</button></header><div></div>';
        document.body.append(types);
        types.querySelector('header button').onclick = () => types.close();
        types.addEventListener('click', event => { if (event.target === types) types.close(); });
        let enabled = false, drag = null, filterWasOpen = false;
        function closeSheet() {
            const wasSaved = body.dataset.careWorkspace === 'saved';
            if (wasSaved) config.results();
            body.classList.remove('care-focus-list', 'care-focus-saved');
            update();
        }
        savedClose.onclick = closeSheet;
        function update() {
            if (!enabled) return;
            const isSaved = body.dataset.careWorkspace === 'saved';
            if (body.classList.contains('care-focus-saved') !== isSaved) body.classList.toggle('care-focus-saved', isSaved);
            if (isSaved) { if (body.classList.contains('care-focus-list')) body.classList.remove('care-focus-list'); saved.inert = false; }
            const listOpen = body.classList.contains('care-focus-list');
            ui.querySelector('[data-mobile-focus="list"]').setAttribute('aria-expanded', String(listOpen));
            ui.querySelector('[data-mobile-focus="saved"]').setAttribute('aria-expanded', String(isSaved));
            const count = document.querySelector('#areaCount,#filteredCount')?.textContent.trim() || '0곳';
            const setText = (selector, value) => { const node = ui.querySelector(selector); if (node.textContent !== value) node.textContent = value; };
            setText('[data-focus-count]', count.replace(/\s*곳$/, ''));
            ui.querySelector('[data-mobile-focus="list"]').setAttribute('aria-label', `검색 결과 ${count} 목록`);
            setText('[data-focus-saved]', String(root.CareMapExperience?.rows().length || 0));
            setText('[data-mobile-focus="type"]', (document.querySelector('.care-type-menu-item[aria-current="true"]')?.textContent || '유형 선택') + ' ▾');
            const filtered = document.querySelector('.care-mobile-filter-toggle')?.classList.contains('has-active-filters');
            const filterCount = document.querySelector('.care-mobile-filter-toggle')?.dataset.filterCount;
            setText('[data-mobile-focus="filter"]', filtered ? `상세필터 · ${filterCount || '설정됨'}` : '상세필터');
            const filterOpen = body.classList.contains('care-mobile-filters-open');
            ui.querySelector('[data-mobile-focus="filter"]').setAttribute('aria-expanded', String(filterOpen));
            if (filterWasOpen && !filterOpen) { input.value = original.value; ui.querySelector('[data-mobile-focus="filter"]').focus({ preventScroll:true }); }
            filterWasOpen = filterOpen;
        }
        input.addEventListener('input', () => { original.value = input.value; original.dispatchEvent(new Event('input', { bubbles: true })); });
        const syncQuery = () => { if (enabled && document.activeElement !== input) input.value = original.value; };
        original.addEventListener('input', syncQuery);
        document.getElementById('careNavigationMenu')?.addEventListener('close', () => { if (enabled && !document.querySelector('dialog[open]')) ui.querySelector('[data-mobile-focus="more"]').focus({ preventScroll:true }); });
        document.querySelector('.care-voice-dialog')?.addEventListener('close', () => { syncQuery(); if (enabled) input.focus({ preventScroll:true }); });
        ui.querySelector('form').onsubmit = event => {
            event.preventDefault(); original.value = input.value; input.blur();
            if (body.dataset.careWorkspace === 'saved') closeSheet();
            config.search(input.value, document.getElementById('province').value, document.getElementById('city').value);
        };
        ui.addEventListener('click', event => {
            const button = event.target.closest('[data-mobile-focus]');
            if (!button) return;
            const action = button.dataset.mobileFocus;
            if (action === 'exit') leave();
            else if (action === 'list') { if (body.classList.contains('care-focus-list')) closeSheet(); else { config.results(); body.classList.add('care-focus-list'); update(); } }
            else if (action === 'saved') { if (body.dataset.careWorkspace === 'saved') closeSheet(); else { config.saved(); update(); } }
            else if (action === 'voice') document.querySelector('.care-voice-trigger')?.click();
            else if (action === 'more') document.querySelector('.care-menu-trigger')?.click();
            else if (action === 'filter') {
                if (body.dataset.careWorkspace === 'saved') closeSheet();
                document.querySelector('.care-mobile-filter-toggle')?.click();
                document.querySelector('.care-filter-panel-close')?.focus({ preventScroll:true });
            } else if (action === 'layers') {
                const satellite = config.layers(); button.setAttribute('aria-pressed', String(satellite));
                button.setAttribute('aria-label', satellite ? '일반지도 보기' : '위성지도 보기');
            } else if (action === 'type') {
                const choices = [...document.querySelectorAll('.care-type-menu-item')].map(source => {
                    const choice = document.createElement('button'); choice.type = 'button'; choice.textContent = source.textContent;
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
            if (enabled) { input.value = original.value; update(); ui.querySelector('button').focus({ preventScroll:true }); }
        }
        function exit() {
            enabled = false; filterWasOpen = false; ui.hidden = true; types.close();
            body.classList.remove('care-mobile-focus-active','care-focus-saved');
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
