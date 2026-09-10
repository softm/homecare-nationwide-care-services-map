/** SOFTM-WORKSPACE-TEST START 날짜:20260905 : 출발지·검색 복귀·방문 순서·늦은 응답이 두 지도에서 같은 결과를 내도록 검사 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import '../map-experience.js';
import '../care-basket-map.js';
const { createBasket, createOrigin } = globalThis.CareMapExperience;
const origin = { label: '선택한 출발지', point: { lat: 37, lng: 127 } };
const row = (i, point = { lat: 37 + Number(i) / 100, lng: 127 }) => ({ i, n: `기관${i}`, point });
const response = (path = [[127, 37], [127, 37.1]]) => ({ ok: true, json: async () => ({ path, summary: { distance: 1000, duration: 120000 } }) });
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness() {
    const original = { markers: ['search'], selected: new Set(['search']), conditions: ['A', 'high'], center: [37, 127], start: { lat: 38, lng: 128 } };
    let saved, markers = ['search'], road = null, captures = 0;
    const states = [], requests = [], fits = [], origins = [];
    const adapter = {
        ready: () => true, capture() { captures++; return original; }, restore(snapshot) { saved = snapshot; markers = snapshot.markers; },
        clear() { markers = []; road = null; }, state: state => states.push(state), origin: value => origins.push(value), fit: points => fits.push(points),
        geocode: async row => row.point, place: item => markers.push([item.row.i, item.rank]), draw: path => { road = path; },
        async fetch(body, signal) { requests.push({ body, signal }); return response(); }
    };
    const mode = globalThis.CareBasketMap.create(adapter);
    return { mode, adapter, original, states, requests, fits, origins, get saved() { return saved; }, get markers() { return markers; }, get route() { return road; }, get captures() { return captures; } };
}
test('비교함 이동·제거를 세션에 유지하고 잘못된 이동은 무시', () => {
    const memory = new Map(), storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
    const basket = createBasket(storage, 'daycare'); ['1', '2', '3'].forEach(id => basket.toggle(id));
    basket.move('3', 0); basket.move('missing', 1); basket.move('1', -1); basket.move('1', 50);
    assert.deepEqual(createBasket(storage, 'daycare').ids(), ['3', '1', '2']);
    basket.toggle('1'); assert.deepEqual(basket.ids(), ['3', '2']);
    assert.deepEqual(createBasket(storage, 'facility').ids(), []);
});
test('담은 기관 표시·상세용 번호가 검색 체크와 무관하고 검색 복귀를 보존', async () => {
    const h = harness(); await h.mode.show([row('3'), row('1'), row('2')], { route: true, origin });
    assert.deepEqual(h.markers, [['3', 1], ['1', 2], ['2', 3]]);
    assert.deepEqual([...h.original.selected], ['search']);
    assert.deepEqual(h.requests[0].body, { start: origin.point, goal: row('2').point, waypoints: [row('3').point, row('1').point], option: 'traoptimal' });
    assert.equal(h.mode.state().phase, 'success'); assert.equal(h.mode.state().result.origin.label, origin.label);
    h.mode.exit(); assert.equal(h.saved, h.original); assert.deepEqual(h.markers, ['search']); assert.deepEqual(h.saved.conditions, ['A', 'high']); assert.equal(h.route, null);
});
test('출발지 미선택·국외 좌표는 과거 지도 기준 위치로 대체하지 않음', async () => {
    const h = harness();
    for (const value of [null, { point: origin.point, label: '' }, { point: { lat: 0, lng: 0 }, label: '국외' }]) {
        await h.mode.show([row('1')], { route: true, origin: value });
        assert.equal(h.mode.state().phase, 'error'); assert.equal(h.mode.state().field, 'origin');
    }
    assert.equal(h.requests.length, 0); assert.equal(h.route, null);
});
test('기관 순서와 출발지 변경 시 경로를 지우고 최초 검색 스냅샷만 보관', async () => {
    const h = harness(); await h.mode.show([row('1'), row('2')], { route: true, origin }); assert.ok(h.route);
    await h.mode.show([row('2'), row('1')], { fit: false, origin: { label: '새 출발', point: { lat: 37.5, lng: 127 } } });
    assert.equal(h.route, null); assert.equal(h.captures, 1); assert.deepEqual(h.markers, [['2', 1], ['1', 2]]); assert.equal(h.mode.state().result, null);
});
test('늦은 위치·경로 응답은 새 방문 순서나 검색 복귀를 덮지 않음', async () => {
    const h = harness(); let resolveCoord;
    h.adapter.geocode = item => item.i === '1' ? new Promise(resolve => { resolveCoord = resolve; }) : Promise.resolve(item.point);
    const first = h.mode.show([row('1')]); await h.mode.show([row('2')]); resolveCoord(row('1').point); await first;
    assert.deepEqual(h.markers, [['2', 1]]);
    let resolveResponse;
    h.adapter.fetch = () => new Promise(resolve => { resolveResponse = resolve; });
    const road = h.mode.show([row('2')], { route: true, origin }); await flush();
    h.mode.exit(); resolveResponse(response()); await road;
    assert.deepEqual(h.markers, ['search']); assert.equal(h.route, null); assert.equal(h.mode.state().phase, 'idle');
});
test('빈 비교함·누락 주소·17곳·통신 실패를 안내하고 1곳과 16곳은 요청 가능', async () => {
    const h = harness();
    for (const list of [[], [row('1'), row('2', null)], Array.from({ length: 17 }, (_, i) => row(String(i)))]) {
        await h.mode.show(list, { route: true, origin }); assert.equal(h.mode.state().phase, 'error'); assert.equal(h.requests.length, 0);
    }
    await h.mode.show([row('1')], { route: true, origin }); assert.equal(h.requests[0].body.waypoints.length, 0);
    await h.mode.show(Array.from({ length: 16 }, (_, i) => row(String(i))), { route: true, origin }); assert.equal(h.requests[1].body.waypoints.length, 15);
    h.adapter.fetch = async () => { throw new Error('route'); };
    await h.mode.show([row('1')], { route: true, origin }); assert.equal(h.route, null); assert.match(h.mode.state().error, /불러오지 못/);
    /** SOFTM-ROUTE-ERROR START 날짜:20260905 : 서버 거부 응답과 브라우저 연결 실패를 서로 다른 안내로 전달 */
    h.adapter.fetch = async () => ({ ok: false, json: async () => ({ error: '허용되지 않은 호출 출처입니다.' }) });
    await h.mode.show([row('1')], { route: true, origin }); assert.equal(h.mode.state().error, '허용되지 않은 호출 출처입니다.');
    h.adapter.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await h.mode.show([row('1')], { route: true, origin }); assert.match(h.mode.state().error, /서버에 연결할 수 없습니다/);
    /** SOFTM-ROUTE-ERROR END */
});
test('도로가 기관 밖으로 돌아가도 출발지·기관·전체 경로를 화면에 포함', async () => {
    const h = harness(), path = [[126.8, 37.2], [128, 38], [127, 37.01]];
    h.adapter.fetch = async () => response(path); await h.mode.show([row('1')], { route: true, origin });
    assert.deepEqual(h.fits.at(-1), [origin.point, row('1').point, ...path.map(([lng, lat]) => ({ lat, lng }))]);
    const fitted = h.fits.at(-1); h.mode.fit(); assert.equal(h.fits.at(-1), fitted);
});
test('서버 실패 사유와 20초 지연을 구조화된 오류로 전달', async t => {
    const h = harness();
    h.adapter.fetch = async () => ({ ok: true, json: async () => ({ error: '출발지와 도착지가 동일합니다.', code: 2 }) });
    await h.mode.show([row('1')], { route: true, origin }); assert.match(h.mode.state().error, /동일/); assert.equal(h.route, null);
    let expire;
    t.mock.method(globalThis, 'setTimeout', (callback, delay) => { assert.equal(delay, 20000); expire = callback; return 0; });
    h.adapter.fetch = (_, signal) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const pending = h.mode.show([row('1')], { route: true, origin }); await flush(); expire(); await pending;
    assert.equal(h.mode.state().phase, 'error'); assert.match(h.mode.state().error, /지연/);
});
test('취소한 경로 완료가 새 경로의 진행 상태를 바꾸지 않음', async () => {
    const h = harness(), responses = []; h.adapter.fetch = () => new Promise(resolve => responses.push(resolve));
    const first = h.mode.show([row('1')], { route: true, origin }); await flush();
    const second = h.mode.show([row('2')], { route: true, origin }); await flush();
    responses[0](response()); await first; assert.equal(h.mode.state().phase, 'routing'); assert.equal(h.route, null);
    responses[1](response()); await second; assert.equal(h.mode.state().phase, 'success'); assert.equal(h.mode.state().result.stops[0].id, '2');
});
test('주소 후보를 직접 선택하기 전에는 출발지가 정해지지 않음', async () => {
    const candidates = [origin, { label: '두 번째 주소', point: { lat: 37.5, lng: 127 } }];
    const draft = createOrigin({ search: async () => candidates }); await draft.search('도로명');
    assert.equal(draft.state().phase, 'choices'); assert.equal(draft.state().origin, null);
    draft.choose(8); assert.equal(draft.state().origin, null); draft.choose(1); assert.equal(draft.state().origin, candidates[1]);
    draft.clear(); assert.equal(draft.state().origin, null);
});
test('현재 위치 허용·권한 거절·주소 검색 실패를 출발지 상태로 안내', async () => {
    const draft = createOrigin({ locate: async () => origin.point, describe: async () => '선택한 동네', search: async () => [] });
    await draft.locate(); assert.equal(draft.state().phase, 'ready'); assert.match(draft.state().origin.label, /현재 위치.*선택한 동네/);
    await draft.search('없는 주소'); assert.equal(draft.state().phase, 'error'); assert.equal(draft.state().origin, null);
    const denied = createOrigin({ locate: async () => { throw new Error('위치 권한이 꺼져 있습니다.'); } });
    await denied.locate(); assert.match(denied.state().error, /위치 권한/); assert.equal(denied.state().origin, null);
});
test('화면 복귀·새 검색 후 늦은 위치나 주소 응답은 적용하지 않음', async () => {
    let finishAddress, finishLocation;
    const draft = createOrigin({ search: () => new Promise(resolve => { finishAddress = resolve; }), locate: () => new Promise(resolve => { finishLocation = resolve; }), describe: async () => '' });
    const first = draft.search('주소'); const second = draft.locate(); finishAddress([origin]); await first;
    assert.equal(draft.state().phase, 'loading'); draft.cancel(); finishLocation(origin.point); await second;
    assert.equal(draft.state().origin, null); assert.equal(draft.state().phase, 'idle');
});
test('SDK 주소 후보의 이름·좌표·중복을 처리하며 첫 후보 자동 선택은 하지 않음', async () => {
    const context = { window: { naver: { maps: { Service: { Status: { OK: 'OK' }, geocode: (_, callback) => callback('OK', { v2: { addresses: [
        { roadAddress: '주소 A', x: '127', y: '37' }, { roadAddress: '주소 A', x: '127', y: '37' }, { jibunAddress: '주소 B', x: '128', y: '38' }, { roadAddress: '좌표 오류', x: 'x', y: '37' }
    ] } }) } } } }, console, setTimeout, clearTimeout };
    vm.runInNewContext(readFileSync(new URL('../naver-geocoder.js', import.meta.url), 'utf8'), context);
    const candidates = await context.window.NaverGeocoder.searchAddresses('주소');
    assert.deepEqual(JSON.parse(JSON.stringify(candidates)), [{ label: '주소 A', point: { lat: 37, lng: 127 } }, { label: '주소 B', point: { lat: 38, lng: 128 } }]);
});
/** SOFTM-WORKSPACE-TEST END */

/** SOFTM-INSTITUTION-ADDRESS-TEST START 날짜:20260905 : 실제 지번 표기 실패의 복구·캐시·기관 동일성·재시도를 검증 */
function institutionHarness({ basic, resolveQuery = () => null, detailError = false } = {}) {
    const queries = [], details = [], storage = new Map();
    const context = { window: {
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        NhisStaticData: { async detail(id) { details.push(id); if (detailError) throw new Error('unavailable'); return { document: { basic } }; } },
        naver: { maps: { Service: { Status: { OK: 'OK' }, geocode({ query }, callback) {
            queries.push(query); const point = resolveQuery(query);
            callback('OK', { v2: { addresses: point ? [{ x: String(point.lng), y: String(point.lat) }] : [] } });
        } } } }
    }, console, setTimeout, clearTimeout };
    vm.runInNewContext(readFileSync(new URL('../naver-geocoder.js', import.meta.url), 'utf8'), context);
    return { api: context.window.NaverGeocoder, queries, details };
}
const oldAddressRow = { i: '21153000292', n: '우리들주야간보호센터', a: '서울특별시 구로구 고척제2동 72번지 7호 문화골든타워 9층' };
const officialBasic = { id: oldAddressRow.i, region: '서울특별시 구로구 고척동', detailAddress: '72번지 7호', address: '서울특별시 구로구 고척제2동[고척동] 72번지 7호 문화골든타워 9층' };
test('행정동 검색 실패를 공식 법정동과 지번으로 복구하고 같은 요청·성공 캐시를 공유', async () => {
    const point = { lat: 37.498, lng: 126.862 }, h = institutionHarness({ basic: officialBasic, resolveQuery: query => query === '서울특별시 구로구 고척동 72-7' ? point : null });
    const [first, second] = await Promise.all([h.api.geocodeInstitution(oldAddressRow), h.api.geocodeInstitution(oldAddressRow)]);
    assert.deepEqual(JSON.parse(JSON.stringify(first)), point); assert.deepEqual(first, second);
    assert.deepEqual(h.details, [oldAddressRow.i]); assert.ok(h.queries.includes('서울특별시 구로구 고척동 72-7'));
    const count = h.queries.length;
    await h.api.geocodeInstitution(oldAddressRow); await h.api.geocodeAddress(oldAddressRow.a);
    assert.equal(h.queries.length, count); assert.equal(h.details.length, 1);
    const route = harness(); route.adapter.geocode = () => h.api.geocodeInstitution(oldAddressRow);
    await route.mode.show([oldAddressRow], { route: true, origin });
    assert.equal(route.mode.state().phase, 'success');
    assert.deepEqual(JSON.parse(JSON.stringify(route.requests[0].body.goal)), point);
});
test('도로명 건물번호·지번 부번·산번지와 법정동 숫자를 보존', () => {
    const { api } = institutionHarness();
    for (const [input, expected] of [
        ['서울특별시 구로구 고척동 72번지 7호 문화골든타워 9층', '서울특별시 구로구 고척동 72-7'],
        ['서울특별시 구로구 고척동 72-7 문화골든타워 9층', '서울특별시 구로구 고척동 72-7'],
        ['경기도 광주시 도척면 진우리 산 12번지 3호 2층', '경기도 광주시 도척면 진우리 산 12-3'],
        ['서울특별시 종로구 종로3가 12번지 4호 3층', '서울특별시 종로구 종로3가 12-4'],
        ['서울특별시 구로구 고척로25길 72 7층', '서울특별시 구로구 고척로25길 72'],
        ['서울특별시 구로구 경인로 373 9층', '서울특별시 구로구 경인로 373']
    ]) assert.equal(api.simplifyAddress(input), expected);
});
test('목록 주소 성공 시 상세를 읽지 않고 다른 기관·주소 누락은 추정하지 않음', async () => {
    const h = institutionHarness({ resolveQuery: () => origin.point });
    assert.ok(await h.api.geocodeInstitution(oldAddressRow)); assert.equal(h.details.length, 0);
    assert.equal(await h.api.geocodeInstitution({ ...oldAddressRow, a: '', addressMissing: true }), null);
    const wrong = institutionHarness({ basic: { ...officialBasic, id: '00000000000' } });
    assert.equal(await wrong.api.geocodeInstitution(oldAddressRow), null);
    assert.equal(wrong.queries.some(query => query.includes('고척동')), false);
});
test('수집된 법정동 표기를 사용하고 상세 누락·전체 검색 실패는 다음 시도에서 재확인', async () => {
    const bracket = institutionHarness({ basic: { id: oldAddressRow.i, address: officialBasic.address }, resolveQuery: query => query === '서울특별시 구로구 고척동 72-7' ? origin.point : null });
    assert.ok(await bracket.api.geocodeInstitution(oldAddressRow));
    for (const detailError of [false, true]) {
        const h = institutionHarness({ basic: officialBasic, detailError });
        assert.equal(await h.api.geocodeInstitution(oldAddressRow), null);
        assert.equal(await h.api.geocodeInstitution(oldAddressRow), null);
        assert.equal(h.details.length, 2);
    }
});
/** SOFTM-INSTITUTION-ADDRESS-TEST END */

/** SOFTM-POPUP-BASKET-TEST START 날짜:20260911 : 두 상세의 비교 버튼이 첫 화면 공통 행동에서 빠지거나 본문 아래로 되돌아가지 않도록 검사 */
function functionSource(source, name, nextName) {
    const start = source.indexOf(`function ${name}(`), end = source.indexOf(`function ${nextName}(`, start + 1);
    assert.notEqual(start, -1, `${name} 함수를 찾을 수 없습니다.`);
    assert.notEqual(end, -1, `${nextName} 함수를 찾을 수 없습니다.`);
    return source.slice(start, end);
}
test('통합 지도 상세는 제목 아래 공통 행동 영역에서 비교함 버튼을 한 번 연결', () => {
    const source = readFileSync(new URL('../nationwide-care-services-map.html', import.meta.url), 'utf8');
    const detailMarkup = source.match(/<section class="detail-sheet"[\s\S]*?<\/section>/)?.[0] || '';
    const openDetail = functionSource(source, 'openDetail', 'closeDetail');
    assert.match(detailMarkup, /detail-head[\s\S]*care-popup-basket-action[\s\S]*detail-body/);
    assert.equal((openDetail.match(/CareMapExperience\.button\(c\)/g) || []).length, 1);
    assert.match(openDetail, /detailBasketAction'\)\.innerHTML=CareMapExperience\.button\(c\)/);
    assert.doesNotMatch(openDetail, /care-row-actions[^\n]*CareMapExperience\.button\(c\)/);
});
test('전국 주간 상세는 PC 정보창과 모바일 시트가 공유하는 제목 아래에서 비교함 버튼을 한 번 연결', () => {
    const source = readFileSync(new URL('../nationwide-daycare-map.html', import.meta.url), 'utf8');
    const popup = functionSource(source, 'popup', 'setMapStatus');
    const openCenter = functionSource(source, 'openCenter', 'displayCenters');
    assert.match(popup, /popup-head[\s\S]*care-popup-basket-action[\s\S]*popup-body/);
    assert.equal((popup.match(/CareMapExperience\.button\(c\)/g) || []).length, 1);
    assert.doesNotMatch(popup, /care-row-actions[^\n]*CareMapExperience\.button\(c\)/);
    assert.equal((openCenter.match(/popup\(c\)/g) || []).length, 2);
    assert.match(openCenter, /mobilePopupContent'\)\.innerHTML=popup\(c\)/);
    assert.match(openCenter, /new naver\.maps\.InfoWindow\(\{content:popup\(c\)/);
});
/** SOFTM-POPUP-BASKET-TEST END */
