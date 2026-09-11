import { searchTools } from './search-tools.js?v=20260911-mapfirst1'; // SOFTM-SEARCH-TOOLS 날짜:20260911 : 검색 보조 기능의 배치 위치를 공유
/** SOFTM-CARE-ANALYSIS START 날짜:20260911 : 두 지도의 현재 중심을 분석 기본값으로 연결하고 위치의 출처를 구분 */
import { saveOrigin } from './care-analysis-origin.js?v=20260911-binding1';
const heading = document.querySelector('.results .list-head,.results .result-head');
if (heading && !document.querySelector('.care-analysis-entry')) {
    const type = location.pathname.endsWith('nationwide-daycare-map.html') ? 'daycare' : new URLSearchParams(location.search).get('type') || 'daycare';
    const link = document.createElement('a'); link.className = 'care-analysis-entry';
    link.href = `care-analysis.html?type=${encodeURIComponent(type)}`;
    link.textContent = '주변 분석'; // SOFTM-SEARCH-TOOLS 날짜:20260911 : 짧은 기능명으로 탐색 도구를 같은 크기로 표시
    /** SOFTM-ANALYSIS-ORIGIN START 날짜:20260911 : 클릭 시점의 실제 지도 중심을 주소 입력 없이 분석할 수 있도록 전달 */
    const bindLocation = () => {
        const url = new URL('care-analysis.html', location.href); url.searchParams.set('type', type);
        try {
            const scope = window.CarePhotoMapScope?.(), center = scope?.ready ? scope.map?.getCenter() : null;
            if (center) {
                const token = saveOrigin(sessionStorage, { type, point: { lat: center.lat(), lng: center.lng() } });
                if (token) url.searchParams.set('origin', token);
            }
        } catch {}
        link.href = url.href;
    };
    for (const name of ['click', 'auxclick', 'contextmenu']) link.addEventListener(name, bindLocation);
    /** SOFTM-ANALYSIS-ORIGIN END */
    searchTools(heading).append(link); // SOFTM-SEARCH-TOOLS 날짜:20260911 : 주변 분석을 검색 도구 모음으로 이동
}
// SOFTM-CARE-ANALYSIS 날짜:20260911 : 분석에서 비교하러 온 경우 기존 비교함 탭으로 바로 연결
if (location.hash === '#careSavedPanel') {
    let timer, observer;
    const openSaved = () => {
        const tab = document.getElementById('careSavedTab');
        if (!tab || !document.getElementById('careSavedPanel')) return;
        observer?.disconnect(); clearTimeout(timer);
        requestAnimationFrame(() => tab.click());
    };
    observer = new MutationObserver(openSaved);
    observer.observe(document.body, { childList: true, subtree: true });
    timer = setTimeout(() => observer.disconnect(), 15000);
    openSaved();
}
/** SOFTM-CARE-ANALYSIS END */
