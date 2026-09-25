/** SOFTM-DETAIL-LAYOUT START 날짜:20260911 : 주소 복사와 실제 목적지 내비 연결을 두 지도에서 일관되게 제공 */
(() => {
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    /** SOFTM-MAP-LINK START 날짜:20260911 : 기관명과 주소를 합친 과도한 검색조건 대신 주소 또는 정확한 좌표를 전달 */
    function externalMaps(c, point) {
        const query = String(c.a || '').trim() || String(c.n || '').trim();
        const valid = point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && point.lat >= 31.43 && point.lat <= 44.35 && point.lng >= 122.37 && point.lng <= 132;
        return {
            naver: `https://map.naver.com/p/search/${encodeURIComponent(query)}`,
            kakao: valid ? `https://map.kakao.com/link/map/${encodeURIComponent(c.n || query)},${point.lat},${point.lng}` : `https://map.kakao.com/link/search/${encodeURIComponent(query)}`
        };
    }
    /** SOFTM-MAP-LINK END */
    function links(c, point, ua = navigator.userAgent) {
        const valid = point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && point.lat >= 31.43 && point.lat <= 44.35 && point.lng >= 122.37 && point.lng <= 132;
        const web = valid ? `https://map.kakao.com/link/to/${encodeURIComponent(c.n)},${point.lat},${point.lng}` : `https://map.naver.com/p/search/${encodeURIComponent(c.a || c.n)}`;
        if (!valid) return { href: web, web, label: '주소로 지도 검색' };
        const query = new URLSearchParams({dlat:point.lat, dlng:point.lng, dname:c.n, appname:'https://homecare.designboard.net'}).toString();
        if (/Android/i.test(ua)) return {href:`intent://navigation?${query}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;S.browser_fallback_url=${encodeURIComponent(web)};end`, web, label:'네이버 내비 길안내'};
        if (/iPhone|iPad|iPod/i.test(ua)) return {href:`nmap://navigation?${query}`, web, label:'네이버 내비 길안내'};
        return {href:web, web, label:'길안내'};
    }
    /** SOFTM-INFO-SHEET START 날짜:20260917 : 주소와 관련된 길안내·복사·공유를 정보 바로 아래에 모아 헤더를 간결하게 유지 */
    function address(c, point, type = 'daycare') {
        return `<div class="care-detail-address"><span class="care-detail-label">주소</span><div class="care-detail-address-content"><span>${escape(c.a || '주소 미공개')}</span></div><div class="care-address-toolbar">${popupButton(c,point)}<button type="button" data-care-address="${escape(c.a || '')}" aria-label="주소 복사" ${c.a?'':'disabled'}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></svg><span>주소 복사</span></button>${shareButton(c,type)}</div><span class="care-detail-address-status" role="status"></span></div>`;
    }
    /** SOFTM-INFO-SHEET END */
    /** SOFTM-LIST-NAVIGATION START 날짜:20260911 : 목록에서 목적지 행동을 아이콘과 문구가 함께 있는 버튼으로 바로 인식하도록 제공 */
    function listButton(c, point) {
        const route = links(c, point);
        const external = route.href.startsWith('https:') ? 'target="_blank" rel="noopener"' : '';
        return `<a class="care-list-navigation" href="${escape(route.href)}" data-care-nav data-web-fallback="${escape(route.web)}" aria-label="${escape(c.n)} ${route.label}" title="${route.label}" onclick="event.stopPropagation()" ${external}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 3-7 18-3-8-8-3Z"/></svg><span>길안내</span></a>`;
    }
    /** SOFTM-LIST-NAVIGATION END */
    /** SOFTM-POPUP-NAVIGATION START 날짜:20260914 : 아이콘과 문구를 함께 표시해 팝업에서도 길안내 행동을 명확히 식별 */
    function popupButton(c, point) {
        const route = links(c, point);
        const external = route.href.startsWith('https:') ? 'target="_blank" rel="noopener"' : '';
        return `<a class="care-popup-navigation" href="${escape(route.href)}" data-care-nav data-web-fallback="${escape(route.web)}" aria-label="${escape(c.n)} ${route.label}" title="${route.label}" onclick="event.stopPropagation()" ${external}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 3-7 18-3-8-8-3Z"/></svg><span>길안내</span></a>`;
    }
    /** SOFTM-POPUP-NAVIGATION END */
    /** SOFTM-INSTITUTION-SHARE START 날짜:20260914 : 검색조건이나 사용자 위치 없이 선택한 기관 상세를 바로 여는 공개 링크만 공유 */
    function institutionUrl(c, type) {
        return `https://homecare.designboard.net/index.html?${new URLSearchParams({type, institution:String(c.i)})}`;
    }
    function shareButton(c, type) {
        return `<button type="button" class="care-popup-share" data-institution-share="${escape(institutionUrl(c,type))}" data-share-name="${escape(c.n)}" data-share-address="${escape(c.a || '')}" aria-label="${escape(c.n)} 기관 정보 공유"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.2M8.7 13.3l6.6 4.2"/></svg><span aria-live="polite">공유</span></button>`;
    }
    async function shareInstitution(button) {
        if (button.disabled) return;
        button.disabled = true;
        const label=button.querySelector('span');
        const data={title:button.dataset.shareName,url:button.dataset.institutionShare}; // SOFTM-POPUP-SHARE 날짜:20260916 : 공유 앱이 기관명·주소를 URL 뒤에 합쳐 기관기호를 손상하지 않도록 본문 제외
        try {
            if (navigator.share) {
                try { await navigator.share(data); label.textContent='공유 완료'; return; }
                catch(error) { if(error?.name==='AbortError') return; }
            }
            await navigator.clipboard.writeText(data.url);
            label.textContent='복사됨';
        } catch { label.textContent='재시도'; }
        finally { button.disabled=false; setTimeout(()=>{if(button.isConnected)label.textContent='공유';},2500); }
    }
    /** SOFTM-INSTITUTION-SHARE END */
    /** SOFTM-POPUP-SHARE START 날짜:20260916 : 팝업을 보는 중 지도 공유를 눌러도 현재 기관의 직접 링크를 전달 */
    document.addEventListener('click', event => {
        if (!event.target.closest('#shareBtn,.map-share-icon')) return;
        const share = [...document.querySelectorAll('[data-institution-share]')].find(button => button.getClientRects().length && getComputedStyle(button).visibility !== 'hidden');
        if (!share) return;
        event.preventDefault(); event.stopImmediatePropagation();
        void shareInstitution(share);
    }, true);
    /** SOFTM-POPUP-SHARE END */
    document.addEventListener('click', async event => {
        /** SOFTM-INSTITUTION-SHARE START 날짜:20260914 : 공유 조작이 기관 선택이나 팝업 닫기로 전파되지 않도록 처리 */
        const share = event.target.closest('[data-institution-share]');
        if (share) { event.preventDefault(); event.stopPropagation(); await shareInstitution(share); return; }
        /** SOFTM-INSTITUTION-SHARE END */
        const button = event.target.closest('[data-care-address]');
        if (button) {
            event.stopPropagation();
            const status = button.closest('.care-detail-address').querySelector('[role="status"]');
            try { await navigator.clipboard.writeText(button.dataset.careAddress); status.textContent = '주소를 복사했습니다.'; }
            catch { status.textContent = '복사하지 못했습니다. 주소를 길게 눌러 복사해 주세요.'; }
        }
        const nav = event.target.closest('[data-care-nav]');
        if (nav?.getAttribute('href').startsWith('nmap:')) {
            const status = nav.closest('.care-detail-address')?.querySelector('[role="status"]'); // SOFTM-LIST-NAVIGATION 날짜:20260911 : 목록 버튼에는 상세 주소 상태 영역이 없어도 내비 연결을 중단하지 않음
            if (status) {
                status.replaceChildren(document.createTextNode('앱이 열리지 않으면 '));
                const fallback = document.createElement('a'); fallback.href = nav.dataset.webFallback;
                fallback.target = '_blank'; fallback.rel = 'noopener'; fallback.textContent = '웹 길안내'; status.append(fallback);
            }
        }
    });
    /** SOFTM-DETAIL-NAV START 날짜:20260924 : 기관 이동을 유지하면서 첫 화면 아래에 판단 자료가 더 있음을 안내 */
    let detailNavigation = null;
    function navigation(c, rows, open) {
        const index = rows.findIndex(row => row.i === c.i);
        detailNavigation = { id: c.i, previous: index > 0 ? rows[index - 1] : null, next: index >= 0 ? rows[index + 1] : null, open };
        const button = (direction, label) => {
            const target = detailNavigation[direction];
            return `<button type="button" data-care-detail-step="${direction}" aria-label="${label}" ${target ? `title="${escape(target.n)}"` : 'disabled'}>${direction === 'previous' ? '‹ 이전' : '다음 ›'}</button>`; // SOFTM-POPUP-COMPACT 날짜:20260917 : 기관 이동은 접근성 이름을 유지한 짧은 화살표로 표시
        };
        return `<nav class="care-detail-navigation" data-care-detail-current="${escape(c.i)}" aria-label="기관 이동">${button('previous', '← 이전 기관')}<span aria-live="polite">${index >= 0 ? `${(index + 1).toLocaleString()} / ${rows.length.toLocaleString()}` : '목록 외 기관'}<small class="care-detail-scroll-hint">정보 더 보기 · 스크롤 ↓</small></span>${button('next', '다음 기관 →')}</nav>`;
    }
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-care-detail-step]');
        if (!button) return;
        event.stopPropagation();
        const state = detailNavigation;
        if (button.disabled || !state || button.closest('[data-care-detail-current]')?.dataset.careDetailCurrent !== state.id) return;
        const target = state[button.dataset.careDetailStep];
        if (target) state.open(target.i);
    }, true);
    /** SOFTM-DETAIL-NAV END */
    /** SOFTM-POPUP-CONTEXT START 날짜:20260924 : 화면 크기와 무관하게 닫기·탭을 찾고 긴 제목 아래 판단 정보를 이어서 읽도록 구성 */
    const sheets = new Map();
    function scroller(node) {
        return node?.closest('.care-detail-scroll') || node?.querySelector('.care-detail-scroll') || node;
    }
    function refresh(sheet) {
        const state = sheets.get(sheet);
        if (!state) return;
        const host = sheet.id === 'detailSheet' ? sheet : sheet.querySelector('.popup');
        if (!host || host.querySelector('.care-detail-scroll')) return;
        const head = host.querySelector('.care-compact-head');
        const body = host.querySelector('.detail-body,.popup-body');
        if (!head || !body) return;
        const scroll = document.createElement('div');
        scroll.className = 'care-detail-scroll';
        host.insertBefore(scroll, head);
        scroll.append(head, body);
        state.savedScroll = null;
        sheet.dataset.detailAtTop = 'true';
        const title = head.querySelector('h3');
        if (title) {
            if (!title.id) title.id = 'careDaycareDetailName';
            sheet.setAttribute('aria-labelledby', title.id);
        }
        scroll.addEventListener('scroll', () => {
            const pastTitle = scroll.scrollTop > head.offsetHeight;
            state.label.textContent = pastTitle ? title?.textContent || '핵심 정보' : '핵심 정보';
            sheet.dataset.detailAtTop = String(scroll.scrollTop < 12);
            state.label.title = title?.textContent || '기관 정보';
        }, { passive: true });
        for (const name of ['wheel', 'touchstart', 'pointerdown', 'keydown']) scroll.addEventListener(name, () => { state.savedScroll = null; }, { passive: true });
    }
    function beginInstitution(sheet) {
        const state = sheets.get(sheet);
        if (!state) return;
        state.savedScroll = null;
        sheet.dataset.detailAtTop = 'true';
        if (scroller(sheet)) scroller(sheet).scrollTop = 0;
        state.label.textContent = '핵심 정보';
    }
    function reset(sheet) {
        beginInstitution(sheet);
        sheets.get(sheet)?.setExpanded(false);
    }
    function focus(sheet) {
        const state = sheets.get(sheet);
        if (state && !document.querySelector('dialog[open]')) state.close.focus({ preventScroll: true });
    }
    function installDetailResize() {
        for (const [selector, closeSelector, contentId] of [
            ['#detailSheet', '#detailClose', 'detailBody'],
            ['.mobile-popup-sheet', '#mobilePopupDismiss', 'mobilePopupContent']
        ]) {
            const sheet = document.querySelector(selector);
            const close = document.querySelector(closeSelector);
            if (!sheet || !close) continue;
            const bar = document.createElement('div');
            bar.className = 'care-detail-toolbar';
            bar.setAttribute('role', 'group');
            bar.setAttribute('aria-label', '기관 상세 화면 조작');
            const label = document.createElement('span');
            label.className = 'care-detail-context';
            label.textContent = '핵심 정보';
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'care-detail-resize';
            toggle.setAttribute('aria-controls', contentId);
            const state = { label, close, savedScroll: null, setExpanded(expanded) {
                sheet.dataset.detailExpanded = String(expanded);
                toggle.setAttribute('aria-expanded', String(expanded));
                toggle.textContent = expanded ? '지도 넓게' : '상세 크게';
            } };
            sheets.set(sheet, state);
            toggle.addEventListener('click', event => {
                event.stopPropagation();
                const scroll = scroller(sheet);
                const expanded = sheet.dataset.detailExpanded !== 'true';
                const before = scroll?.scrollTop || 0;
                if (expanded) state.savedScroll = before;
                state.setExpanded(expanded);
                if (scroll) scroll.scrollTop = expanded ? before : state.savedScroll ?? before;
                if (!expanded) state.savedScroll = null;
            });
            bar.append(label, toggle, close);
            sheet.prepend(bar);
            sheet.setAttribute('role', 'dialog');
            sheet.setAttribute('aria-modal', 'false');
            state.setExpanded(false);
            refresh(sheet);
            if (sheet.id !== 'detailSheet') new MutationObserver(() => refresh(sheet)).observe(document.getElementById(contentId), { childList: true });
        }
    }
    document.addEventListener('keydown', event => {
        if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
        const tab = event.target.closest('[data-detail-view],[data-daycare-tab]');
        if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const tabs = [...tab.parentElement.querySelectorAll('button')];
        const index = tabs.indexOf(tab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        tabs[next].click();
        tabs[next].focus({ preventScroll: true });
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installDetailResize, { once: true });
    else installDetailResize();
    /** SOFTM-POPUP-CONTEXT END */
    window.CareDetailLayout = {scroller, refresh, reset, focus, beginInstitution, navigation, address, listButton, popupButton, shareButton, institutionUrl, links, externalMaps}; // SOFTM-POPUP-CONTEXT 날짜:20260924 : 두 지도에서 상세 조작·스크롤·복귀를 같은 경로로 처리
})();
/** SOFTM-DETAIL-LAYOUT END */
