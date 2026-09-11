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
    function address(c, point) {
        const route = links(c, point);
        return `<div class="care-detail-address"><span class="care-detail-label">주소</span><div class="care-detail-address-content"><span>${escape(c.a || '주소 미공개')}</span><div class="care-detail-address-actions"><button type="button" data-care-address="${escape(c.a || '')}" aria-label="주소 복사" title="주소 복사" ${c.a?'':'disabled'}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></svg></button><a href="${escape(route.href)}" data-care-nav data-web-fallback="${escape(route.web)}" aria-label="${route.label}" title="${route.label}" ${route.href.startsWith('https:')?'target="_blank" rel="noopener"':''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 3-7 18-3-8-8-3Z"/></svg></a></div></div><span class="care-detail-address-status" role="status"></span></div>`;
    }
    document.addEventListener('click', async event => {
        const button = event.target.closest('[data-care-address]');
        if (button) {
            event.stopPropagation();
            const status = button.closest('.care-detail-address').querySelector('[role="status"]');
            try { await navigator.clipboard.writeText(button.dataset.careAddress); status.textContent = '주소를 복사했습니다.'; }
            catch { status.textContent = '복사하지 못했습니다. 주소를 길게 눌러 복사해 주세요.'; }
        }
        const nav = event.target.closest('[data-care-nav]');
        if (nav?.getAttribute('href').startsWith('nmap:')) {
            const status = nav.closest('.care-detail-address').querySelector('[role="status"]');
            status.replaceChildren(document.createTextNode('앱이 열리지 않으면 '));
            const fallback = document.createElement('a'); fallback.href = nav.dataset.webFallback;
            fallback.target = '_blank'; fallback.rel = 'noopener'; fallback.textContent = '웹 길안내'; status.append(fallback);
        }
    });
    window.CareDetailLayout = {address, links, externalMaps}; // SOFTM-MAP-LINK 날짜:20260911 : 두 지도 하단 외부 지도 링크의 검색 기준 공유
})();
/** SOFTM-DETAIL-LAYOUT END */
