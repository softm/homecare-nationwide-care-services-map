/** SOFTM-LOCATION-TEST START 날짜:20260905 : 모바일 권한·시간 초과·재시도·늦은 위치 응답을 실제 지도 연결과 함께 검사 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import '../care-location.js';
import '../map-experience.js';
const api = globalThis.CareLocation;
const point = { lat: 37.48, lng: 126.86 };
function device(outcomes) {
    const calls = [];
    return { calls, isSecureContext: true, navigator: { geolocation: { getCurrentPosition(success, error, options) {
        calls.push(options); const next = outcomes.shift();
        if (typeof next === 'function') next(success, error);
        else if (next?.code) error(next);
        else success({ coords: { latitude: next.lat, longitude: next.lng } });
    } } } };
}
test('일반 정확도로 먼저 확인하고 응답 지연·신호 오류일 때 한 번만 다시 요청', async () => {
    const fast = device([point]); assert.deepEqual(await api.requestPosition(fast), point);
    assert.equal(fast.calls.length, 1); assert.equal(fast.calls[0].enableHighAccuracy, false);
    for (const code of [2, 3]) {
        const env = device([{ code }, point]); assert.deepEqual(await api.requestPosition(env), point);
        assert.equal(env.calls.length, 2); assert.equal(env.calls[1].enableHighAccuracy, true);
        assert.ok(env.calls[1].timeout > env.calls[0].timeout); assert.equal(env.calls[0].maximumAge, 60000);
    }
});
test('권한 거절은 반복 요청하지 않으며 최종 지연·신호 실패와 구분', async () => {
    for (const [code, reason, count] of [[1, 'denied', 1], [2, 'unavailable', 2], [3, 'timeout', 2]]) {
        const env = device([{ code }, { code }]);
        await assert.rejects(api.requestPosition(env), error => error.reason === reason);
        assert.equal(env.calls.length, count);
        assert.equal(api.info({ code }).reason, reason);
        if (code !== 1) assert.doesNotMatch(api.info({ code }).title, /권한|차단/);
    }
});
test('HTTPS·브라우저 미지원·화면 정책 차단은 GPS 요청 전에 구분', async () => {
    const insecure = device([point]); insecure.isSecureContext = false;
    await assert.rejects(api.requestPosition(insecure), error => error.reason === 'insecure'); assert.equal(insecure.calls.length, 0);
    await assert.rejects(api.requestPosition({}), error => error.reason === 'unsupported');
    const policy = device([point]); policy.document = { permissionsPolicy: { allowsFeature: () => false } };
    await assert.rejects(api.requestPosition(policy), error => error.reason === 'policy'); assert.equal(policy.calls.length, 0);
});
test('취소한 검색은 후속 위치 요청을 시작하지 않음', async () => {
    const env = device([{ code: 3 }]);
    await assert.rejects(api.requestPosition(env, { isCurrent: () => false }), error => error.reason === 'timeout');
    assert.equal(env.calls.length, 1);
});
test('방문 출발지 취소와 다시 시도 시 오류·이전 위치를 남기지 않음', async () => {
    let rejectPosition;
    const env = device([(success, error) => { rejectPosition = error; }, point]);
    const origin = globalThis.CareMapExperience.createOrigin({ locate: options => api.requestPosition(env, options), describe: async () => '확인한 출발지' });
    const pending = origin.locate(); origin.cancel(); rejectPosition({ code: 3 }); await pending;
    assert.equal(env.calls.length, 1); assert.equal(origin.state().origin, null);
    await origin.locate(); assert.equal(origin.state().phase, 'ready');
    assert.deepEqual(origin.state().origin.point, point); assert.equal(origin.state().reason, '');
});
test('두 지도가 공용 위치 요청을 연결하고 실패 후 버튼·지도·재시도를 복구', async () => {
    for (const filename of ['nationwide-care-services-map.html', 'nationwide-daycare-map.html']) {
        const source = readFileSync(new URL('../' + filename, import.meta.url), 'utf8');
        assert.match(source, /care-location\.js\?v=/); assert.doesNotMatch(source, /navigator\.geolocation\.getCurrentPosition/);
        const start = source.indexOf('async function useCurrentLocation(');
        const code = source.slice(start, source.indexOf('/** SOFTM-LOCATION END */', start));
        for (const stale of [false, true]) {
            let notice = null, loading = false, resolveRequest;
            const button = { disabled: false, classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute() {} };
            const context = { mapReady: true, $: () => button, console,
                beginCareQuery: () => ({ current: () => !stale }), beginDaycareSearch: () => ({ isCurrent: () => !stale }),
                CareMapExperience: { isBasketMap: () => false },
                CareLocation: { info: api.info, hideNotice() {}, showNotice(error, retry) { notice = { error, retry }; }, request: () => new Promise((resolve, reject) => { resolveRequest = reject; }) },
                showLoading() { loading = true; }, hideLoading() { loading = false; }, showMapProgress() { loading = true; }, hideMapProgress() { loading = false; }, setStatus() {}, setMapStatus() {}
            };
            vm.createContext(context); vm.runInContext(code, context);
            const pending = context.useCurrentLocation(false); assert.equal(button.disabled, true);
            resolveRequest(Object.assign(new Error('timeout'), { reason: 'timeout' })); await pending;
            assert.equal(button.disabled, false);
            if (stale) assert.equal(notice, null);
            else { assert.equal(loading, false); assert.equal(notice.error.reason, 'timeout'); assert.equal(typeof notice.retry, 'function'); }
        }
    }
});
test('전국 주간 현재 위치 성공 후 내부 기준점 갱신이 주변 조회를 취소하지 않음', async () => {
    const source = readFileSync(new URL('../nationwide-daycare-map.html', import.meta.url), 'utf8');
    const start = source.indexOf('async function useCurrentLocation('), baseStart = source.indexOf('function setBasePoint(');
    const code = source.slice(baseStart, source.indexOf('\n', baseStart)) + '\n' + source.slice(start, source.indexOf('/** SOFTM-LOCATION END */', start));
    let generation = 0, searched = 0;
    const button = { disabled: false, classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute() {} };
    const context = { mapReady: true, DATA: [], baseMarker: null, skipIdleUntil: 0, $: () => button,
        CareMapExperience: { isBasketMap: () => false }, CareLocation: { request: async () => point, hideNotice() {} },
        naver: { maps: { LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } }, Marker: class {}, Point: class {} } },
        naverMap: { setCenter() {}, panTo() {} }, setMapStatus() {}, showMapProgress() {},
        beginDaycareSearch() { const token = ++generation; return { isCurrent: () => token === generation }; },
        apply(skip, select, search) { if (!search) generation++; },
        async searchCurrentMap(notify, query) { assert.equal(query.isCurrent(), true); searched++; },
        setTimeout(callback) { callback(); }
    };
    vm.createContext(context); vm.runInContext(code, context); await context.useCurrentLocation(false);
    assert.equal(searched, 1); assert.equal(generation, 1); assert.equal(button.disabled, false);
});
test('통합 지도 현재 위치 성공은 해당 좌표와 주변 조회를 유지하고 전국 범위로 맞추지 않음', async () => {
    const source = readFileSync(new URL('../nationwide-care-services-map.html', import.meta.url), 'utf8');
    const start = source.indexOf('async function useCurrentLocation('), baseStart = source.indexOf('function setBase(');
    const code = source.slice(baseStart, source.indexOf('\n', baseStart)) + '\n' + source.slice(start, source.indexOf('/** SOFTM-LOCATION END */', start));
    let searched = 0, requested = 0, fitted = 0, centered = null, zoom = null;
    const button = { disabled: false, setAttribute() {}, removeAttribute() {} };
    class LatLng { constructor(lat, lng) { this.lat = lat; this.lng = lng; } }
    const context = { mapReady: true, DATA: [], baseMarker: null, skipIdleUntil: 0, $: () => button,
        CareLocation: { request: async options => { requested++; assert.equal(options.isCurrent(), true); return point; }, hideNotice() {} },
        beginCareQuery: () => ({ current: () => true }), hideLoading() {}, showLoading() {}, setStatus() {}, cachedCoord() {}, hav() {},
        window: { naver: { maps: { LatLng, Point: class {}, Marker: class {} } } },
        map: { setCenter(value) { centered = value; }, setZoom(value) { zoom = value; }, fitBounds() { fitted++; } },
        setTimeout(callback) { callback(); }, async refreshFromMap(query) { assert.equal(query.current(), true); searched++; }
    };
    vm.createContext(context); vm.runInContext(code, context); await context.useCurrentLocation(true);
    assert.equal(requested, 1); assert.deepEqual({ lat: centered.lat, lng: centered.lng }, point); assert.equal(zoom, 14);
    assert.equal(searched, 1); assert.equal(fitted, 0); assert.equal(button.disabled, false);
});
/** SOFTM-LOCATION-TEST END */
