/** SOFTM-STITCH-CONTROLS START 날짜:20260915 : 시안의 필터 해제·전화·비교 요약을 기존 상태와 정적 자료에 연결 */
(function (root) {
    'use strict';
    function mount(options) {
        if (document.querySelector('.stitch-compare-tray')) return;
        const filters = document.querySelector('.filters');
        const summary = document.createElement('div');
        summary.className = 'stitch-filter-summary';
        summary.setAttribute('aria-label', '적용 중인 검색조건');
        filters.append(summary);
        /** SOFTM-FILTER-DESIGN START 날짜:20260916 : 기본 검색과 상세조건을 분리하고 실제 조건 묶음 수·태그·초기화를 같은 상태에서 표시 */
        const toggle = filters.querySelector('.care-mobile-filter-toggle');
        const grid = filters.querySelector('.filter-grid');
        const toolbar = document.createElement('div'); toolbar.className = 'stitch-filter-toolbar';
        const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'stitch-reset'; reset.textContent = '↻ 조건 초기화';
        toolbar.append(reset); summary.before(toolbar);
        const icon = document.createElement('span'); icon.className = 'stitch-filter-icon'; icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6"/></svg>';
        toggle.prepend(icon);
        const desktop = matchMedia('(min-width:1001px)');
        const placeToggle = () => { if (desktop.matches) toolbar.prepend(toggle); else grid.append(toggle); };
        desktop.addEventListener('change', placeToggle); placeToggle();
        reset.onclick = () => {
            const groups = new Set([...filters.querySelectorAll('[data-filter].active:not([data-value="all"])')].map(node => node.dataset.filter));
            for (const key of groups) filters.querySelector(`[data-filter="${key}"][data-value="all"]`)?.click();
            if (filters.querySelector('.advanced-selected [data-remove]')) filters.querySelector('.advanced-reset')?.click();
        };
        const syncFilters = () => {
            summary.replaceChildren();
            const groups = new Map();
            for (const source of filters.querySelectorAll('[data-filter].active:not([data-value="all"])')) {
                const key = source.dataset.filter;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(source);
            }
            const conditions = [...groups].map(([key, sources]) => ({
                label: sources.map(node => node.textContent.trim()).join(' / '),
                remove: () => filters.querySelector(`[data-filter="${key}"][data-value="all"]`)?.click()
            }));
            for (const source of filters.querySelectorAll('.advanced-selected [data-remove]')) {
                conditions.push({label: source.textContent.trim().replace(/×$/, '').trim(), remove: () => source.click()});
            }
            for (const condition of conditions) {
                const chip = document.createElement('button'); chip.type = 'button';
                chip.textContent = condition.label + ' ×'; chip.setAttribute('aria-label', condition.label + ' 조건 해제');
                chip.onclick = condition.remove; summary.append(chip);
            }
            toggle.dataset.filterCount = String(conditions.length);
            toggle.dispatchEvent(new Event('care-filter-count'));
            reset.disabled = !conditions.length;
            summary.hidden = !conditions.length;
            document.body.style.setProperty('--stitch-filter-summary-height', `${summary.hidden ? 0 : summary.getBoundingClientRect().height}px`);
        };
        const resize = new ResizeObserver(() => document.body.style.setProperty('--stitch-filter-summary-height', `${summary.hidden ? 0 : summary.getBoundingClientRect().height}px`));
        resize.observe(summary);
        new MutationObserver(syncFilters).observe(document.getElementById('filterLines'), {subtree:true, attributes:true, attributeFilter:['class']});
        new MutationObserver(syncFilters).observe(document.getElementById('advancedSearch'), {subtree:true, childList:true});
        syncFilters();
        /** SOFTM-FILTER-DESIGN END */
        const tray = document.createElement('section'); tray.className = 'stitch-compare-tray'; tray.setAttribute('aria-label', '비교함 요약');
        tray.innerHTML = '<span class="stitch-tray-icon" aria-hidden="true">⚖</span><div class="stitch-tray-copy"><strong></strong><p></p></div><button type="button" data-basket-open>선택기관 비교표 보기</button><button type="button" data-basket-clear>비우기</button>';
        document.body.append(tray);
        const shortcut = document.createElement('button'); shortcut.type = 'button'; shortcut.className = 'stitch-saved-shortcut'; shortcut.dataset.workspace = 'saved';
        document.querySelector('.select-tools').append(shortcut);
        const syncBasket = () => {
            const rows = root.CareMapExperience.rows();
            tray.hidden = !rows.length || document.body.dataset.careWorkspace !== 'search';
            tray.querySelector('strong').textContent = `비교함에 ${rows.length}개 기관이 담겼습니다`;
            tray.querySelector('p').textContent = rows.map((row, i) => `${i+1}. ${row.n}`).join(' · ');
            tray.querySelector('[data-basket-open]').textContent = `선택기관 비교표 보기 (${rows.length}) ›`;
            shortcut.textContent = `담은 비교함 ${rows.length}곳 보기 ›`;
        };
        new MutationObserver(syncBasket).observe(document.querySelector('#careSavedTab [data-saved-count]'), {childList:true, subtree:true, characterData:true});
        new MutationObserver(syncBasket).observe(document.body, {attributes:true, attributeFilter:['data-care-workspace']});
        syncBasket();
        document.getElementById('list').addEventListener('click', async event => {
            const button = event.target.closest('[data-stitch-phone]');
            if (!button || button.disabled) return;
            const output = button.closest('.row').querySelector('[data-phone-result]');
            output.hidden = false; output.textContent = '전화번호 확인 중…'; button.disabled = true;
            try {
                const phone = String(await options.phone(button.dataset.stitchPhone) || '');
                if (!output.isConnected) return;
                output.replaceChildren();
                const number = phone.replace(/[^0-9+]/g, '');
                if (number.length >= 8) {
                    const link = document.createElement('a'); link.href = `tel:${number}`; link.textContent = `${phone} · 전화 걸기`; output.append(link);
                } else output.textContent = '공개된 전화번호가 없습니다. 상세정보에서 공단 원문을 확인해 주세요.';
            } catch (_) { output.textContent = '전화번호를 불러오지 못했습니다. 전화 버튼을 눌러 다시 확인해 주세요.'; }
            finally { button.disabled = false; }
        });
    }
    root.StitchControls = Object.freeze({mount});
})(globalThis);
/** SOFTM-STITCH-CONTROLS END */
