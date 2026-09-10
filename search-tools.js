/** SOFTM-SEARCH-TOOLS START 날짜:20260911 : 비동기로 준비되는 탐색 기능을 목록 앞의 한 줄 도구 모음으로 모아 결과 공간 확보 */
export function searchTools(heading) {
    let tools = heading.parentElement.querySelector('.care-search-tools');
    if (!tools) {
        tools = document.createElement('div');
        tools.className = 'care-search-tools';
        tools.setAttribute('role', 'group');
        tools.setAttribute('aria-label', '기관 탐색 도구');
        heading.before(tools);
    }
    return tools;
}
/** SOFTM-SEARCH-TOOLS END */
