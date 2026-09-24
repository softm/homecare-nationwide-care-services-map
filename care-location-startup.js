/** SOFTM-LOCATION-STARTUP START 날짜:20260924 : 권한 획득 결과를 등록된 지도에 전달해 현재 위치 주변 조회로 연결 */
(function () {
    'use strict';
    // 지도 준비가 늦어도 공용 로더가 허용된 좌표를 보관하고 준비된 지도에서 주변을 조회합니다.
    window.CareLocation.requestInitialPermission().catch(() => {});
})();
/** SOFTM-LOCATION-STARTUP END */
