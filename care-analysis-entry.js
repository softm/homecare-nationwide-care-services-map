/** SOFTM-CARE-ANALYSIS START 날짜:20260911 : 두 지도에서 같은 생활권 분석 도구를 열되 집 주소를 지도 중심으로 추정하지 않음 */
const heading = document.querySelector('.results .list-head,.results .result-head');
if (heading && !document.querySelector('.care-analysis-entry')) {
    const type = location.pathname.endsWith('nationwide-daycare-map.html') ? 'daycare' : new URLSearchParams(location.search).get('type') || 'daycare';
    const link = document.createElement('a'); link.className = 'care-analysis-entry';
    link.href = `care-analysis.html?type=${encodeURIComponent(type)}`;
    link.textContent = '집 주변 한 번에 분석 →';
    heading.after(link);
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
