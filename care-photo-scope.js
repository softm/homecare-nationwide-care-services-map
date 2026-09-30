/** SOFTM-PHOTO-SCOPE START 날짜:20260930 : 목록·지도에서 선택한 기관 집합과 복귀 주소를 사진 검색에 그대로 전달 */
const prefix = 'carePhotoScope:v1:';
const sources = ['index.html']; // SOFTM-DAYCARE-REDIRECT 날짜:20260924 : 사진 탐색 범위를 통합 지도 공유 주소로만 제한
export function visibleMarkerIds(map, entries) {
    if (!map) return [];
    const bounds = map.getBounds();
    return [...new Set(entries.filter(([, marker]) => marker.getMap() === map && bounds.hasLatLng(marker.getPosition())).map(([id]) => String(id)))];
}
/** SOFTM-PHOTO-DIRECT START 날짜:20260930 : 목록은 좌표·마커 없이 전체 검색 결과를 전달하고 지도만 현재 표시 범위를 사용 */
export function captureScope(current) {
    if (!current?.ready || !current.type) return null;
    const fromMap = current.kind === 'map' && current.map;
    const ids = fromMap ? visibleMarkerIds(current.map, current.entries || []) : [...new Set((current.rows || []).map(row => String(row.i)))];
    const source = new URL(current.source || 'index.html', 'https://homecare.designboard.net/');
    source.searchParams.delete('institution');
    if (fromMap) {
        const center = current.map.getCenter();
        source.searchParams.set('lat', center.lat()); source.searchParams.set('lng', center.lng()); source.searchParams.set('z', current.map.getZoom());
    }
    return { type: current.type, kind: fromMap ? 'map' : 'search', ids, source: (source.pathname.split('/').pop() || 'index.html') + source.search };
}
export function saveScope(storage, { type, ids, source, kind = 'map' }, token = crypto.randomUUID()) {
    if (!storage) throw new Error('검색 범위를 저장할 수 없습니다. 브라우저의 사이트 저장 설정을 확인해 주세요.');
    const snapshot = { version: 1, type, kind, ids: [...new Set(ids.map(String))], source };
    storage.setItem(prefix + token, JSON.stringify(snapshot));
    return token;
}
export function readScope(storage, token) {
    if (!storage || !/^[a-zA-Z0-9-]{1,80}$/.test(token || '')) return null;
    try {
        const snapshot = JSON.parse(storage.getItem(prefix + token));
        if (snapshot?.version !== 1 || typeof snapshot.type !== 'string' || !Array.isArray(snapshot.ids) || snapshot.ids.some(id => typeof id !== 'string')) return null;
        if (typeof snapshot.source !== 'string' || !sources.some(name => snapshot.source === name || snapshot.source.startsWith(name + '?'))) return null;
        const kind = Object.hasOwn(snapshot, 'kind') ? snapshot.kind : 'map';
        if (!['map', 'search'].includes(kind)) return null;
        return { ...snapshot, kind, ids: [...new Set(snapshot.ids)] };
    } catch { return null; }
}
/** SOFTM-PHOTO-DIRECT END */
export function scopedRows(rows, snapshot) {
    const ids = new Set(snapshot?.ids || []);
    return rows.filter(row => ids.has(String(row.i)));
}
/** SOFTM-PHOTO-SCOPE END */
