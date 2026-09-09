/** SOFTM-LOCATION START 날짜:20260905 : 모바일 위치 지연과 권한 차단을 구분하고 검색·출발지에서 같은 복구 안내를 사용 */
(function (root) {
    'use strict';
    const messages = {
        denied: ['현재 위치 접근이 차단되어 있습니다', '사이트와 사용 중인 브라우저의 위치 권한을 허용해 주세요.'],
        unavailable: ['현재 위치 신호를 확인하지 못했습니다', '휴대폰의 위치 기능과 Wi-Fi 또는 모바일 데이터를 켠 뒤 다시 시도해 주세요.'],
        timeout: ['현재 위치 확인이 지연되고 있습니다', '신호가 잘 잡히는 곳에서 다시 시도하거나 지역·주소를 입력해 주세요.'],
        insecure: ['보안 연결에서 현재 위치를 사용할 수 있습니다', 'https://homecare.designboard.net으로 접속하거나 지역·주소를 입력해 주세요.'],
        policy: ['이 화면에서는 위치 접근이 제한되어 있습니다', 'Chrome 또는 Safari에서 사이트를 직접 열거나 지역·주소를 입력해 주세요.'],
        unsupported: ['이 브라우저에서는 현재 위치를 사용할 수 없습니다', 'Chrome 또는 Safari에서 다시 열거나 지역·주소를 입력해 주세요.']
    };
    const reasonFor = error => error?.reason || ({ 1: 'denied', 2: 'unavailable', 3: 'timeout' }[error?.code]) || 'unavailable';
    function info(error) {
        const reason = reasonFor(error), [title, message] = messages[reason] || messages.unavailable;
        return { reason, title, message };
    }
    function failure(reason) {
        const detail = info({ reason }), error = new Error(`${detail.title}. ${detail.message}`);
        error.reason = reason; return error;
    }
    function requestPosition(env = root, { isCurrent = () => true } = {}) {
        if (env.isSecureContext === false) return Promise.reject(failure('insecure'));
        const policy = env.document?.permissionsPolicy || env.document?.featurePolicy;
        if (policy?.allowsFeature && !policy.allowsFeature('geolocation')) return Promise.reject(failure('policy'));
        if (!env.navigator?.geolocation) return Promise.reject(failure('unsupported'));
        const attempt = enableHighAccuracy => new Promise((resolve, reject) => {
            try {
                env.navigator.geolocation.getCurrentPosition(position => {
                    const point = { lat: position.coords.latitude, lng: position.coords.longitude };
                    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) reject(failure('unavailable'));
                    else resolve(point);
                }, error => reject(failure(reasonFor(error))), { enableHighAccuracy, timeout: enableHighAccuracy ? 20000 : 15000, maximumAge: 60000 });
            } catch (error) { reject(failure(error.name === 'SecurityError' ? 'denied' : 'unavailable')); }
        });
        return attempt(false).catch(error => {
            if (!isCurrent() || !['timeout', 'unavailable'].includes(error.reason)) throw error;
            return attempt(true);
        });
    }
    /** SOFTM-LOCATION-DIALOG START 날짜:20260909 : 위치 실패 안내를 설정 방법과 복구 동작이 있는 모달로 제공 */
    const permissionHelp = '이미 차단된 권한은 사이트에서 강제로 다시 요청할 수 없습니다. iPhone: 설정 → 개인정보 보호 및 보안 → 위치 서비스 및 Safari 웹사이트 권한을 확인하세요. Chrome: 주소창 왼쪽 사이트 설정 → 권한 → 위치를 허용해 주세요. 휴대폰 설정에서도 위치 기능과 사용 중인 브라우저의 위치 권한을 확인해 주세요.';
    let notice, noticeFocus; // SOFTM-LOCATION-DIALOG 날짜:20260909 : 권한 안내를 닫으면 원래 조작 위치로 복귀
    function hideNotice() { if (notice) { notice.close(); notice.hidden = true; noticeFocus?.focus?.({ preventScroll: true }); } } // SOFTM-LOCATION-DIALOG 날짜:20260909 : 차단 안내가 결과 탐색을 계속 가리지 않도록 닫기 지원
    function showNotice(error, retry) {
        if (!root.document) return;
        const target = root.document.querySelector('.map-card .map-wrap');
        if (!target) return;
        if (!notice) {
            notice = root.document.createElement('dialog'); notice.className = 'care-location-notice';
            notice.setAttribute('aria-label', '현재 위치 안내');
            notice.innerHTML = '<div role="status"><strong></strong><p></p></div><details><summary>위치 권한 설정 방법</summary><p></p></details><div class="care-location-actions"><button type="button" data-location-retry>현재 위치 다시 시도</button><button type="button" data-location-search>지역·기관명 검색</button><button type="button" data-location-dismiss aria-label="현재 위치 안내 닫기">닫기</button></div>';
            root.document.body.append(notice); // SOFTM-LOCATION-DIALOG 날짜:20260909 : 지도 아래에 묻히는 권한 안내를 최상단 팝업으로 제공
            notice.addEventListener('cancel', event => { event.preventDefault(); hideNotice(); });
            notice.querySelector('details p').textContent = permissionHelp;
            notice.querySelector('[data-location-dismiss]').onclick = hideNotice;
            notice.querySelector('[data-location-search]').onclick = () => {
                hideNotice(); root.CareMapExperience?.exitBasketMap();
                const input = root.document.getElementById('q'); input?.focus(); input?.scrollIntoView({ block: 'center', behavior: 'instant' });
            };
        }
        const detail = info(error);
        noticeFocus = root.document.activeElement;
        notice.hidden = false; if (!notice.open) notice.showModal(); // SOFTM-LOCATION-DIALOG 날짜:20260909 : 위치 실패를 놓치지 않도록 설정·재시도를 즉시 표시
        notice.dataset.reason = detail.reason;
        notice.querySelector('strong').textContent = detail.title;
        notice.querySelector('[role="status"] p').textContent = detail.message;
        notice.querySelector('details').hidden = detail.reason !== 'denied';
        notice.querySelector('details').open = detail.reason === 'denied'; // SOFTM-LOCATION-DIALOG 날짜:20260909 : 이미 차단한 권한은 브라우저 설정 변경이 필요하므로 안내를 펼침
        notice.querySelector('[data-location-retry]').onclick = retry;
    }
    /** SOFTM-LOCATION-DIALOG END */
    root.CareLocation = Object.freeze({ request: options => requestPosition(root, options), requestPosition, info, permissionHelp, showNotice, hideNotice });
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-LOCATION END */
