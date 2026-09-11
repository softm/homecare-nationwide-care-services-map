/** SOFTM-PHOTO-BACK START 날짜:20260911 : 탐색 전 화면의 상태를 복원하고 직접 진입도 막다른 화면이 되지 않게 함 */
(() => {
    const heading = document.querySelector('.care-photo-intro h1');
    if (!heading) return;
    const row = document.createElement('div');
    row.className = 'care-photo-title-row';
    const back = document.createElement('a');
    back.className = 'care-photo-back';
    back.href = document.getElementById('photoMapLink').href;
    back.setAttribute('aria-label', '이전 화면으로 돌아가기');
    back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg><span>이전</span>';
    back.addEventListener('click', event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const canGoBack = window.navigation ? window.navigation.canGoBack : history.length > 1;
        if (canGoBack) history.back();
        else location.assign(document.getElementById('photoMapLink').href);
    });
    heading.before(row);
    row.append(back, heading);
})();
/** SOFTM-PHOTO-BACK END */
