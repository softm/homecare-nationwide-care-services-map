/** SOFTM-SEARCH-TOOLS START 날짜:20260911 : 비동기로 준비되는 탐색 기능을 목록 앞의 한 줄 도구 모음으로 모아 결과 공간 확보 */
export function searchTools(heading) {
    let tools = heading.parentElement.querySelector('.care-search-tools');
    if (!tools) {
        tools = document.createElement('div');
        tools.className = 'care-search-tools';
        tools.setAttribute('role', 'group');
        tools.setAttribute('aria-label', '기관 탐색 도구');
        /** SOFTM-MAP-FIRST START 날짜:20260911 : 첫 화면에는 지도와 기관을 보여주고 보조 도구는 사용자가 펼칠 때 노출 */
        const disclosure = document.createElement('details');
        disclosure.className = 'care-search-disclosure';
        const summary = document.createElement('summary');
        summary.textContent = '맞춤 조건 · 사진 찾기 · 주변 분석';
        disclosure.append(summary, tools); heading.before(disclosure);
        /** SOFTM-MAP-FIRST END */
    }
    return tools;
}
/** SOFTM-SEARCH-TOOLS END */
