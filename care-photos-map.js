import { searchTools } from './search-tools.js?v=20260911-mapfirst1'; // SOFTM-SEARCH-TOOLS 날짜:20260911 : 검색 보조 기능의 배치 위치를 공유
/** SOFTM-PHOTO-MAP START 날짜:20260910 : 두 지도의 현재 검색조건과 담은 기관 순서를 공용 사진 탐색·비교에 전달 */
import { openComparison } from './care-photos-common.js?v=20260910-1';
import { saveScope, captureScope } from './care-photo-scope.js?v=20260930-direct1'; // SOFTM-PHOTO-DIRECT 날짜:20260930 : 지도와 목록의 사진 범위 전달을 공용 처리
function mount() {
    const actions = document.querySelector('.care-saved-actions');
    if (!actions || !window.CareMapExperience) return false;
    const type = new URLSearchParams(location.search).get('type') || 'daycare'; // SOFTM-DAYCARE-REDIRECT 날짜:20260924 : 전용 지도 제거 후 통합 지도 유형을 사진 탐색에 사용
    /** SOFTM-PHOTO-ENTRY-BUTTON START 날짜:20260910 : 텍스트 링크로 놓치던 사진 탐색을 아이콘과 설명을 갖춘 주요 행동으로 표시 */
    const link = document.createElement('a'); link.className = 'care-photo-map-entry';
    link.setAttribute('aria-labelledby', 'carePhotoEntryTitle');
    link.setAttribute('aria-describedby', 'carePhotoEntryHint');
    link.innerHTML = `<span class="care-photo-entry-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/></svg></span><span class="care-photo-entry-copy"><strong id="carePhotoEntryTitle">사진으로 찾기</strong><span id="carePhotoEntryHint">기관 사진을 살펴보고 비교하세요</span></span><span class="care-photo-entry-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></span>`; // SOFTM-PHOTO-DIRECT 날짜:20260930 : 목록에서도 바로 사용할 수 있는 사진 탐색으로 안내
    /** SOFTM-PHOTO-ENTRY-BUTTON END */
    /** SOFTM-PHOTO-DIRECT START 날짜:20260930 : 지도 준비를 요구하지 않고 현재 검색 결과 또는 사진의 독립 검색으로 연결 */
    const directHref = `care-photos.html?${new URLSearchParams({ type, scope: 'all' })}`;
    link.href = directHref;
    const status = document.createElement('span'); status.className = 'care-photo-map-status'; status.setAttribute('role', 'status');
    let storage; try { storage = sessionStorage; } catch {}
    const updateLink = event => {
        try {
            const snapshot = captureScope(window.CarePhotoSearchScope?.());
            if (snapshot) {
                const token = saveScope(storage, snapshot);
                link.href = `care-photos.html?${new URLSearchParams({ type: snapshot.type, scope: snapshot.kind, view: token })}`;
            } else link.href = directHref;
            status.textContent = '';
        } catch (error) {
            event?.preventDefault();
            link.href = directHref;
            status.textContent = error.message || '검색 범위를 전달하지 못했습니다. 다시 시도해 주세요.';
        }
    };
    link.addEventListener('click', updateLink);
    link.addEventListener('pointerdown', updateLink);
    link.addEventListener('contextmenu', updateLink);
    /** SOFTM-PHOTO-DIRECT END */
    const heading = document.querySelector('.results .list-head,.results .result-head');
    if (heading) searchTools(heading).append(link); // SOFTM-SEARCH-TOOLS 날짜:20260911 : 사진 찾기를 목록을 가리지 않는 공용 도구로 이동
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
