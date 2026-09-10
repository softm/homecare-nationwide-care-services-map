/** SOFTM-PHOTO-MAP START 날짜:20260910 : 두 지도의 현재 검색조건과 담은 기관 순서를 공용 사진 탐색·비교에 전달 */
import { openComparison } from './care-photos-common.js?v=20260910-1';
function mount() {
    const actions = document.querySelector('.care-saved-actions');
    if (!actions || !window.CareMapExperience) return false;
    const type = location.pathname.endsWith('nationwide-daycare-map.html') ? 'daycare' : new URLSearchParams(location.search).get('type') || 'daycare';
    const link = document.createElement('a'); link.className = 'care-photo-map-entry'; link.textContent = '사진으로 기관 찾기 →';
    const updateLink = () => {
        const query = new URLSearchParams({ type });
        for (const [key, id] of [['p', 'province'], ['c', 'city'], ['q', 'q']]) {
            const value = document.getElementById(id)?.value.trim(); if (value) query.set(key, value);
        }
        link.href = `care-photos.html?${query}`;
    };
    updateLink(); link.addEventListener('click', updateLink);
    link.addEventListener('pointerdown', updateLink);
    document.addEventListener('change', updateLink);
    document.addEventListener('input', updateLink);
    const heading = document.querySelector('.results .list-head,.results .result-head');
    if (heading) heading.after(link);
    else document.querySelector('.results').prepend(link);
    const button = document.createElement('button'); button.type = 'button'; button.textContent = '사진 비교';
    button.dataset.photoCompare = '';
    button.addEventListener('click', () => openComparison({ rows: window.CareMapExperience.rows(), type, opener: button }));
    actions.append(button);
    return true;
}
if (!mount()) {
    const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
}
/** SOFTM-PHOTO-MAP END */
