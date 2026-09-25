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
/** SOFTM-LOCATION-NO-SCROLL START 날짜:20260914 : 모바일 권한 안내가 모든 기기 카드를 쌓아 내부 스크롤로 돌아가지 않도록 검사 */
test('위치 권한 안내는 기기별 한 경로만 표시하고 모달 내부 스크롤을 사용하지 않음', () => {
    const source = readFileSync(new URL('../care-location.js', import.meta.url), 'utf8');
    const styles = readFileSync(new URL('../map-experience.css', import.meta.url), 'utf8');
    assert.match(source, /dataset\.locationHelpTab/);
    assert.match(source, /hidden = !active/);
    assert.match(styles, /dialog\.care-location-notice \{[^}]*overflow:hidden/);
    assert.doesNotMatch(styles, /dialog\.care-location-notice \{[^}]*overflow:auto/);
});
/** SOFTM-LOCATION-NO-SCROLL END */
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
    for (const filename of ['index.html']) {
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
test('통합 지도 현재 위치 성공은 해당 좌표와 주변 조회를 유지하고 전국 범위로 맞추지 않음', async () => {
    const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const start = source.indexOf('async function useCurrentLocation('), baseStart = source.indexOf('function setBase(');
    const code = source.slice(baseStart, source.indexOf('\n', baseStart)) + '\n' + source.slice(start, source.indexOf('/** SOFTM-LOCATION END */', start));
    let searched = 0, requested = 0, fitted = 0, centered = null, zoom = null;
    const button = { disabled: false, setAttribute() {}, removeAttribute() {} };
    class LatLng { constructor(lat, lng) { this.lat = lat; this.lng = lng; } }
    const context = { mapReady: true, DATA: [], baseMarker: null, skipIdleUntil: 0, $: () => button,
        initialLocationViewport: null, refreshTimer: null, careViewportKey: () => 'national', clearTimeout() {}, // SOFTM-LOCATION-PREVIEW 날짜:20260913 : 첫 화면 조회 보류를 포함해 위치 성공 경로를 회귀검사
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

/** SOFTM-LOCATION-STARTUP START 날짜:20260924 : 진입 경로와 무관한 권한 요청·중복 방지·재시도 회귀 검사 */
function startupDevice(state, queryFails = false) {
    let calls = 0, resolve, reject;
    const context = { navigator: { permissions: { query: async () => {
        if (queryFails) throw new Error('unsupported');
        return { state };
    } }, geolocation: { getCurrentPosition(success, failure) { calls++; resolve = success; reject = failure; } } }, isSecureContext: true };
    vm.createContext(context);
    vm.runInContext(readFileSync(new URL('../care-location.js', import.meta.url), 'utf8'), context);
    return { api: context.CareLocation, calls: () => calls, succeed: () => resolve({ coords: { latitude: point.lat, longitude: point.lng } }), deny: () => reject({ code: 1 }) };
}
test('미결정 권한은 페이지 진입 시 요청하며 동시 지도 요청은 하나로 합침', async () => {
    const env = startupDevice('prompt');
    const initial = env.api.requestInitialPermission();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(env.calls(), 1);
    const map = env.api.request();
    assert.equal(env.calls(), 1);
    env.succeed();
    assert.equal((await initial).lat, point.lat);
    assert.equal((await map).lng, point.lng);
});
test('허용·차단 상태는 초기 권한 요청을 추가하지 않음', async () => {
    for (const state of ['granted', 'denied']) {
        const env = startupDevice(state);
        assert.equal(await env.api.requestInitialPermission(), null);
        assert.equal(env.calls(), 0);
    }
});
test('권한 조회 미지원도 위치 요청으로 대체하고 거절 후 수동 재시도 가능', async () => {
    const env = startupDevice(undefined, true);
    const initial = env.api.requestInitialPermission();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(env.calls(), 1);
    env.deny(); await assert.rejects(initial, error => error.reason === 'denied');
    const retry = env.api.request(); assert.equal(env.calls(), 2);
    env.succeed(); await retry;
});
test('두 지도 진입 스크립트는 지도 초기화 분기 밖에서 권한 요청', () => {
    for (const file of ['index.html']) {
        const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
        assert.match(source, /<script defer src="care-location-startup.js\?v=/);
    }
    const source = readFileSync(new URL('../care-location-startup.js', import.meta.url), 'utf8');
    let requests = 0;
    vm.runInNewContext(source, { window: { CareLocation: { requestInitialPermission() { requests++; return Promise.resolve(point); } } } });
    assert.equal(requests, 1);
    assert.doesNotMatch(source, /setCenter|setZoom|useCurrentLocation|location\.search/);
});
/** SOFTM-LOCATION-STARTUP END */

/** SOFTM-LOCATION-FOLLOW START 날짜:20260924 : 권한 응답과 지도 준비 순서가 바뀌어도 허용 좌표를 한 번 전달 */
for (const readyFirst of [true, false]) test(`초기 권한 허용 후 좌표 전달: 지도 준비 우선=${readyFirst}`, async () => {
    const env = startupDevice('prompt');
    const points = [];
    if (readyFirst) env.api.connectInitialPosition(point => points.push(point));
    const pending = env.api.requestInitialPermission();
    await new Promise(resolve => setImmediate(resolve));
    env.succeed(); await pending;
    if (!readyFirst) env.api.connectInitialPosition(point => points.push(point));
    await new Promise(resolve => setImmediate(resolve));
    env.api.connectInitialPosition(point => points.push(point));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(points.length, 1); assert.equal(points[0].lat, point.lat);
    assert.equal(env.calls(), 1);
});
test('거절은 현재 위치 이동을 실행하지 않음', async () => {
    const env = startupDevice('prompt'); let moves = 0;
    env.api.connectInitialPosition(() => { moves++; });
    const pending = env.api.requestInitialPermission();
    await new Promise(resolve => setImmediate(resolve)); env.deny();
    await assert.rejects(pending); assert.equal(moves, 0);
});
/** SOFTM-LOCATION-FOLLOW END */
