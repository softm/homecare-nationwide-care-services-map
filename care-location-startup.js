/** SOFTM-LOCATION-STARTUP START 날짜:20261126 : 첫 화면 권한 팝업 대신 사용자가 내 위치 버튼을 누른 뒤에만 위치를 요청 */
(function () {
    'use strict';
    if (window.document?.documentElement) window.document.documentElement.dataset.careLocationStartup = 'explicit';
})();
/** SOFTM-LOCATION-STARTUP END */
