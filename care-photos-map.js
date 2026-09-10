/** SOFTM-PHOTO-MAP START 날짜:20260910 : 두 지도의 현재 검색조건과 담은 기관 순서를 공용 사진 탐색·비교에 전달 */
import { openComparison } from './care-photos-common.js?v=20260910-1';
import { saveScope, visibleMarkerIds } from './care-photo-scope.js?v=20260910-1';
function mount() {
    const actions = document.querySelector('.care-saved-actions');
    if (!actions || !window.CareMapExperience) return false;
    const type = location.pathname.endsWith('nationwide-daycare-map.html') ? 'daycare' : new URLSearchParams(location.search).get('type') || 'daycare';
    const link = document.createElement('a'); link.className = 'care-photo-map-entry'; link.textContent = '사진으로 기관 찾기 →';
    /** SOFTM-PHOTO-MAP-SCOPE START 날짜:20260910 : 지역명 재검색 대신 클릭 시점의 표시 마커를 세션으로 넘겨 긴 URL과 범위 확대를 방지 */
    link.href = `care-photos.html?${new URLSearchParams({ type, scope: 'map' })}`;
    const status = document.createElement('span'); status.className = 'care-photo-map-status'; status.setAttribute('role', 'status');
    let storage; try { storage = sessionStorage; } catch {}
    const updateLink = event => {
        try {
            const current = window.CarePhotoMapScope?.();
            if (!current?.ready || !current.map) throw new Error('지도를 불러온 뒤 사진으로 찾기를 눌러 주세요.');
            const ids = visibleMarkerIds(current.map, current.entries);
            const source = new URL(current.source || location.href);
            source.searchParams.delete('institution');
            const center = current.map.getCenter();
            source.searchParams.set('lat', center.lat()); source.searchParams.set('lng', center.lng()); source.searchParams.set('z', current.map.getZoom());
            if (source.pathname.endsWith('nationwide-daycare-map.html')) source.searchParams.set('share', '1');
            const token = saveScope(storage, { type: current.type, ids, source: source.pathname.split('/').pop() + source.search });
            link.href = `care-photos.html?${new URLSearchParams({ type: current.type, scope: 'map', view: token })}`;
            status.textContent = '';
        } catch (error) {
            event?.preventDefault();
            link.href = `care-photos.html?${new URLSearchParams({ type, scope: 'map' })}`;
            status.textContent = error.message || '지도 범위를 전달하지 못했습니다. 다시 시도해 주세요.';
        }
    };
    link.addEventListener('click', updateLink);
    link.addEventListener('pointerdown', updateLink);
    link.addEventListener('contextmenu', updateLink);
    /** SOFTM-PHOTO-MAP-SCOPE END */
    const heading = document.querySelector('.results .list-head,.results .result-head');
    if (heading) heading.after(link);
    else document.querySelector('.results').prepend(link);
    link.after(status);
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
