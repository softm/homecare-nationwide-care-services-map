/** SOFTM-DEMENTIA-LINK START 날짜:20261001 : 현재 지도·지역만 치매안심에 전달하며 기존 돌봄 검색을 수정하지 않는다. */
(function () {
    'use strict';
    function mount() {
    const nav = document.querySelector('#careNavigationMenu nav');
    if (!nav) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'dementiaServiceLink';
    button.innerHTML = '<span class="care-menu-icon" aria-hidden="true">✳</span><span><strong>가까운 치매안심센터</strong><small>치매안심에서 검사·상담·가족지원 정보를 찾아요</small></span><span aria-hidden="true">↗</span>';
    button.addEventListener('click', function () {
        const url = new URL('https://dementia.designboard.net/');
        const scope = window.CarePhotoSearchScope?.();
        if (scope?.map) {
            const center = scope.map.getCenter();
            url.searchParams.set('lat', center.lat().toFixed(6));
            url.searchParams.set('lng', center.lng().toFixed(6));
            url.searchParams.set('z', String(Math.min(19, Math.max(7, scope.map.getZoom()))));
        } else {
            const province = document.getElementById('province')?.value;
            const city = document.getElementById('city')?.value;
            if (province) url.searchParams.set('p', province);
            if (city) url.searchParams.set('c', city);
        }
        window.open(url.href, '_blank', 'noopener');
    });
    nav.append(button);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
})();
/** SOFTM-DEMENTIA-LINK END */
