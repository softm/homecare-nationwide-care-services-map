/** SOFTM-ROOT-MAP START 날짜:20260911 : 사이트 루트 방문을 안내 카드가 아닌 지도로 연결하고 뒤로 가기 반복 진입을 방지 */
(function () {
    const destination = new URL('nationwide-care-services-map.html', window.location.href);
    destination.search = window.location.search;
    destination.hash = window.location.hash;
    window.location.replace(destination.href);
})();
/** SOFTM-ROOT-MAP END */
