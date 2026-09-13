/** SOFTM-LOCATION-STATE START 날짜:20260914 : 위치 권한과 조회 진행을 분리해 오류 상태가 조회 완료 뒤에도 유지되도록 제공 */
(function () {
    'use strict';
    const wrap = document.querySelector('.map-card .map-wrap');
    if (!wrap) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'care-location-state'; button.hidden = true;
    button.setAttribute('aria-live', 'polite');
    wrap.append(button);
    let reason = '', revision = 0;
    function update(next) {
        reason = next;
        document.body.classList.toggle('care-location-unavailable', !!reason);
        button.hidden = !reason;
        const denied = reason === 'denied' || reason === 'policy';
        button.textContent = denied ? '위치 권한 꺼짐 · 설정 안내' : '현재 위치 확인 불가 · 도움말';
        const locate = document.getElementById('locateBtn');
        locate?.setAttribute('title', reason ? button.textContent : '내 주변 기관 찾기');
        locate?.setAttribute('aria-label', reason ? `${button.textContent}, 내 위치 다시 찾기` : '내 주변 기관 찾기');
    }
    button.onclick = () => window.CareLocation.showNotice({ reason }, () => {
        window.CareLocation.hideNotice(); document.getElementById('locateBtn')?.click();
    });
    window.addEventListener('care-location-state', event => { revision++; update(event.detail.reason); });
    // 권한 조회는 위치 요청을 발생시키지 않으며 공유 주소로 진입해도 차단 상태를 표시한다.
    const started = revision;
    navigator.permissions?.query({ name: 'geolocation' }).then(permission => {
        const sync = () => update(permission.state === 'denied' ? 'denied' : '');
        if (revision === started && permission.state === 'denied') sync();
        permission.addEventListener('change', () => { revision++; sync(); });
    }).catch(() => {});
})();
/** SOFTM-LOCATION-STATE END */
