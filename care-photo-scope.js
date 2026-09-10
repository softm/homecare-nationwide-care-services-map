/** SOFTM-PHOTO-MAP-SCOPE START 날짜:20260910 : 지도에 실제로 보이는 마커의 기관 집합을 별도 전체검색으로 넓히지 않고 사진에 전달 */
const prefix = 'carePhotoScope:v1:';
const sources = ['nationwide-care-services-map.html', 'nationwide-daycare-map.html'];
export function visibleMarkerIds(map, entries) {
    if (!map) return [];
    const bounds = map.getBounds();
    return [...new Set(entries.filter(([, marker]) => marker.getMap() === map && bounds.hasLatLng(marker.getPosition())).map(([id]) => String(id)))];
}
export function saveScope(storage, { type, ids, source }, token = crypto.randomUUID()) {
    if (!storage) throw new Error('지도 범위를 저장할 수 없습니다. 브라우저의 사이트 저장 설정을 확인해 주세요.');
    const snapshot = { version: 1, type, ids: [...new Set(ids.map(String))], source };
    storage.setItem(prefix + token, JSON.stringify(snapshot));
    return token;
}
export function readScope(storage, token) {
    if (!storage || !/^[a-zA-Z0-9-]{1,80}$/.test(token || '')) return null;
    try {
        const snapshot = JSON.parse(storage.getItem(prefix + token));
        if (snapshot?.version !== 1 || typeof snapshot.type !== 'string' || !Array.isArray(snapshot.ids) || snapshot.ids.some(id => typeof id !== 'string')) return null;
        if (typeof snapshot.source !== 'string' || !sources.some(name => snapshot.source === name || snapshot.source.startsWith(name + '?'))) return null;
        return { ...snapshot, ids: [...new Set(snapshot.ids)] };
    } catch { return null; }
}
export function scopedRows(rows, snapshot) {
    const ids = new Set(snapshot?.ids || []);
    return rows.filter(row => ids.has(String(row.i)));
}
/** SOFTM-PHOTO-MAP-SCOPE END */
