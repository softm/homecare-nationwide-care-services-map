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
