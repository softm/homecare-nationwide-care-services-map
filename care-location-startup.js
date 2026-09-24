/** SOFTM-LOCATION-STARTUP START 날짜:20260924 : 권한 요청을 지도 이동에서 분리해 공유 위치와 검색조건을 보존 */
(function () {
    'use strict';
    // 브라우저 권한 요청만 시작하며 허용·거절 결과로 지도 중심이나 검색을 변경하지 않습니다.
    window.CareLocation.requestInitialPermission().catch(() => {});
})();
/** SOFTM-LOCATION-STARTUP END */
