import { searchTools } from './search-tools.js?v=20260911-mapfirst1'; // SOFTM-SEARCH-TOOLS 날짜:20260911 : 검색 보조 기능의 배치 위치를 공유
/** SOFTM-CARE-ANALYSIS START 날짜:20260911 : 두 지도의 현재 중심을 분석 기본값으로 연결하고 위치의 출처를 구분 */
import { saveOrigin } from './care-analysis-origin.js?v=20260911-binding1';
const heading = document.querySelector('.results .list-head,.results .result-head');
if (heading && !document.querySelector('.care-analysis-entry')) {
    const type = new URLSearchParams(location.search).get('type') || 'daycare'; // SOFTM-DAYCARE-REDIRECT 날짜:20260924 : 전용 지도 제거 후 통합 지도 유형만 분석 화면에 전달
    const link = document.createElement('a'); link.className = 'care-analysis-entry';
    link.href = `care-analysis.html?type=${encodeURIComponent(type)}`;
    link.textContent = '맞춤 비교 시작'; // SOFTM-GUIDED-COMPARE 날짜:20261119 : 지도 검색 이용자가 조건·후보·세 곳 비교 흐름을 바로 이해하도록 진입 목적을 표시
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
