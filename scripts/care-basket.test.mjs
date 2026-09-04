/** SOFTM-BASKET-TEST START 날짜:20260904 : 검색 복귀·방문 순서·비동기 경로 취소가 서로 다른 지도에서도 같은 결과를 내도록 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../map-experience.js';
import '../care-basket-map.js';
const { createBasket } = globalThis.CareMapExperience;
const row = (i, point = { lat: 37 + Number(i) / 100, lng: 127 }) => ({ i, n: `기관${i}`, point });
function harness() {
    const original = { markers: ['search'], selected: ['search'], conditions: ['A', 'high'], center: [37, 127], start: { lat: 37, lng: 127 } };
    let saved, markers = ['search'], route = null, captures = 0;
    const messages = [], requests = [];
    const adapter = {
        ready: () => true,
        capture() { captures++; return original; },
        restore(snapshot) { saved = snapshot; markers = snapshot.markers; },
        clear() { markers = []; route = null; },
        mode() {}, select() {}, fit() {},
        status: text => messages.push(text),
        geocode: async row => row.point,
        place: item => markers.push([item.row.i, item.rank]),
        draw: path => { route = path; },
        async fetch(body, signal) { requests.push({ body, signal }); return { ok: true, json: async () => ({ path: [[127, 37], [127, 37.1]], summary: { distance: 1000, duration: 120000 } }) }; }
    };
    const mode = globalThis.CareBasketMap.create(adapter);
    return { mode, adapter, original, messages, requests, get saved() { return saved; }, get markers() { return markers; }, get route() { return route; }, get captures() { return captures; } };
}
test('비교함 드래그 순서와 제거는 세션에 유지하고 잘못된 이동은 무시', () => {
    const memory = new Map(), storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
    const basket = createBasket(storage, 'daycare');
    ['1', '2', '3'].forEach(id => basket.toggle(id));
    basket.move('3', 0); basket.move('missing', 1); basket.move('1', -1); basket.move('1', 50);
    assert.deepEqual(createBasket(storage, 'daycare').ids(), ['3', '1', '2']);
    basket.toggle('1'); assert.deepEqual(basket.ids(), ['3', '2']);
    assert.deepEqual(createBasket(storage, 'facility').ids(), []);
});
test('조회 조건 밖의 비교 기관도 지도에 표시하고 순서대로 경로를 요청', async () => {
    const h = harness();
    await h.mode.show([row('3'), row('1'), row('2')], { route: true });
    assert.deepEqual(h.markers, [['3', 1], ['1', 2], ['2', 3]]);
    assert.deepEqual(h.requests[0].body.waypoints, [row('3').point, row('1').point]);
    assert.deepEqual(h.requests[0].body.goal, row('2').point);
    assert.deepEqual(h.requests[0].body.start, h.original.start);
    h.mode.exit();
    assert.equal(h.saved, h.original);
    assert.deepEqual(h.markers, ['search']);
    assert.deepEqual(h.saved.conditions, ['A', 'high']);
    assert.equal(h.route, null);
});
test('순서를 바꾸면 이전 경로를 제거하고 원래 검색 스냅샷은 한 번만 보관', async () => {
    const h = harness();
    await h.mode.show([row('1'), row('2')], { route: true });
    assert.ok(h.route);
    await h.mode.show([row('2'), row('1')], { fit: false });
    assert.equal(h.route, null); assert.equal(h.captures, 1);
    assert.deepEqual(h.markers, [['2', 1], ['1', 2]]);
});
test('늦은 주소와 도로 응답이 변경한 비교함이나 검색 복귀를 덮지 않음', async () => {
    const h = harness(); let resolveCoord;
    h.adapter.geocode = item => item.i === '1' ? new Promise(resolve => { resolveCoord = resolve; }) : Promise.resolve(item.point);
    const first = h.mode.show([row('1')]);
    await h.mode.show([row('2')]); resolveCoord(row('1').point); await first;
    assert.deepEqual(h.markers, [['2', 1]]);
    let resolveResponse;
    h.adapter.fetch = () => new Promise(resolve => { resolveResponse = resolve; });
    const road = h.mode.show([row('2')], { route: true });
    await new Promise(resolve => setImmediate(resolve));
    h.mode.exit(); resolveResponse({ ok: true, json: async () => ({ path: [[127, 37], [127, 38]], summary: { distance: 1, duration: 1 } }) }); await road;
    assert.deepEqual(h.markers, ['search']); assert.equal(h.route, null);
});
test('빈 비교함·주소 누락·도로 실패·최대 경유지를 거짓 경로 없이 안내', async () => {
    const h = harness();
    await h.mode.show([row('1'), row('2', null)], { route: true });
    assert.equal(h.requests.length, 0); assert.match(h.messages.at(-1), /기관2/);
    await h.mode.show([]); assert.deepEqual(h.markers, []); assert.equal(h.mode.active(), true);
    await h.mode.show(Array.from({ length: 17 }, (_, i) => row(String(i))), { route: true });
    assert.equal(h.requests.length, 0); assert.match(h.messages.at(-1), /1~16/);
    h.adapter.fetch = async () => { throw new Error('network'); };
    await h.mode.show([row('1')], { route: true });
    assert.equal(h.route, null); assert.match(h.messages.at(-1), /불러오지 못/);
});
/** SOFTM-BASKET-TEST END */

/** SOFTM-ROUTE-VIEW START 날짜:20260905 : 기관 좌표만 맞춰 경로가 잘리거나 취소된 요청이 최신 진행 상태를 덮는 문제를 검증 */
test('경로 전체와 출발지를 포함해 화면 범위를 다시 맞춤', async () => {
    const h = harness(), fitted = [], path = [[126.8, 37.2], [128, 38], [127, 37.01]];
    h.adapter.fit = points => fitted.push(points);
    h.adapter.fetch = async () => ({ ok: true, json: async () => ({ path, summary: { distance: 5000, duration: 600000 } }) });
    await h.mode.show([row('1')], { route: true });
    assert.deepEqual(fitted.at(-1), [h.original.start, row('1').point, ...path.map(([lng, lat]) => ({ lat, lng }))]);
    assert.match(h.messages.at(-1), /경로탐색 완료.*5.0km.*10분/);
});
test('서버의 경로 실패 사유를 표시하고 진행 상태를 해제', async () => {
    const h = harness(), busy = [];
    h.adapter.busy = value => busy.push(value);
    h.adapter.fetch = async () => ({ ok: true, json: async () => ({ error: '출발지와 도착지가 동일합니다.', code: 2 }) });
    await h.mode.show([row('1')], { route: true });
    assert.equal(h.route, null);
    assert.match(h.messages.at(-1), /출발지와 도착지가 동일/);
    assert.ok(busy.includes(true)); assert.equal(busy.at(-1), false);
});
test('이전 응답 완료가 새 경로의 진행 상태와 화면 범위를 바꾸지 않음', async () => {
    const h = harness(), busy = [], fitted = [], responses = [];
    h.adapter.busy = value => busy.push(value);
    h.adapter.fit = points => fitted.push(points);
    h.adapter.fetch = () => new Promise(resolve => responses.push(resolve));
    const first = h.mode.show([row('1')], { route: true });
    await new Promise(resolve => setImmediate(resolve));
    const second = h.mode.show([row('2')], { route: true });
    await new Promise(resolve => setImmediate(resolve));
    const result = { ok: true, json: async () => ({ path: [[127, 37], [127, 38]], summary: { distance: 1, duration: 1 } }) };
    const count = fitted.length;
    responses[0](result); await first;
    assert.equal(busy.at(-1), true); assert.equal(fitted.length, count);
    responses[1](result); await second;
    assert.equal(busy.at(-1), false); assert.match(h.messages.at(-1), /기관2/);
});
test('20초가 지나면 지연을 안내하고 재탐색 가능 상태로 복귀', async t => {
    let expire;
    t.mock.method(globalThis, 'setTimeout', (callback, delay) => { assert.equal(delay, 20000); expire = callback; return 0; });
    const h = harness(), busy = [];
    h.adapter.busy = value => busy.push(value);
    h.adapter.fetch = (_, signal) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const pending = h.mode.show([row('1')], { route: true });
    await new Promise(resolve => setImmediate(resolve));
    expire(); await pending;
    assert.match(h.messages.at(-1), /응답이 지연/);
    assert.equal(busy.at(-1), false); assert.equal(h.route, null);
});
/** SOFTM-ROUTE-VIEW END */
