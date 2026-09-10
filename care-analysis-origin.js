/** SOFTM-ANALYSIS-ORIGIN START 날짜:20260911 : 지도 진입 위치를 기본값으로 전달하고 늦은 자동 위치 응답이 수동 주소를 덮지 않도록 보호 */
const prefix = 'careAnalysisOrigin:v1:';
const valid = point => point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && point.lat >= 32 && point.lat <= 40 && point.lng >= 123 && point.lng <= 133;
const validToken = token => /^[a-zA-Z0-9-]{1,80}$/.test(token || '');
export function saveOrigin(storage, { type, point }, token = crypto.randomUUID(), now = Date.now()) {
    if (!valid(point) || !validToken(token) || typeof type !== 'string') return null;
    try { storage.setItem(prefix + token, JSON.stringify({ type, point: { lat: point.lat, lng: point.lng }, savedAt: now })); return token; } catch { return null; }
}
export function readOrigin(storage, token, type, now = Date.now()) {
    if (!validToken(token)) return null;
    try {
        const value = JSON.parse(storage.getItem(prefix + token));
        if (!valid(value?.point) || value.type !== type || !Number.isFinite(value.savedAt) || now < value.savedAt || now - value.savedAt > 30 * 60 * 1000) return null;
        return { lat: value.point.lat, lng: value.point.lng };
    } catch { return null; }
}
export function createOriginBinding({ locate, describe, changed }) {
    let revision = 0, state = { phase: 'idle', point: null, label: '', source: '', error: '' };
    const publish = next => { state = { ...state, ...next }; changed(state); };
    async function resolve(source, point) {
        const token = ++revision, isCurrent = () => token === revision;
        publish({ phase: 'loading', point: null, label: '', source, error: '' });
        try {
            const value = point || await locate({ isCurrent });
            if (!isCurrent()) return;
            if (!valid(value)) throw new Error('국내 위치를 확인하지 못했습니다. 기준 주소를 입력해 주세요.');
            const fallback = source === 'map' ? '지도에서 보고 있던 위치' : '현재 위치';
            publish({ phase: 'ready', point: value, label: fallback, source, error: '' });
            let address; try { address = await describe(value); } catch {}
            if (isCurrent() && address) publish({ label: address });
        } catch (error) { if (isCurrent()) publish({ phase: 'error', point: null, label: '', error: error.message || '위치를 확인하지 못했습니다. 주소를 입력해 주세요.' }); }
    }
    return {
        state: () => state,
        bind: point => resolve('map', point),
        locate: () => resolve('location'),
        cancel() { revision++; if (state.phase === 'loading') publish({ phase: 'idle', error: '' }); },
        clear() { revision++; publish({ phase: 'idle', point: null, label: '', source: '', error: '' }); }
    };
}
/** SOFTM-ANALYSIS-ORIGIN END */
