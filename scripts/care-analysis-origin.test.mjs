/** SOFTM-ANALYSIS-ORIGIN START 날짜:20260911 : 자동 위치 바인딩의 우선순위·잘못된 전달값·수동 입력 경쟁을 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { saveOrigin, readOrigin, createOriginBinding } from '../care-analysis-origin.js';
const point = { lat: 37.48, lng: 126.86 };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
test('지도 위치는 토큰·유형별로 분리하고 만료·잘못된 좌표·저장 실패를 거부한다', () => {
    const items = new Map(), storage = { getItem: key => items.get(key), setItem: (key, value) => items.set(key, value) };
    assert.equal(saveOrigin(storage, { type: 'daycare', point }, 'map-one', 100), 'map-one');
    assert.deepEqual(readOrigin(storage, 'map-one', 'daycare', 200), point);
    assert.equal(readOrigin(storage, 'map-one', 'facility', 200), null);
    assert.equal(readOrigin(storage, 'map-one', 'daycare', 99), null);
    assert.equal(readOrigin(storage, 'map-one', 'daycare', 1800101), null);
    assert.equal(readOrigin(storage, '../map-one', 'daycare', 200), null);
    assert.equal(saveOrigin(storage, { type: 'daycare', point: { lat: 0, lng: 0 } }, 'bad'), null);
    assert.equal(saveOrigin(null, { type: 'daycare', point }), null);
});
test('지도에서 전달한 위치는 GPS 요청 없이 즉시 사용하고 역주소 실패에도 유지한다', async () => {
    let calls = 0;
    const binding = createOriginBinding({ locate: () => { calls++; }, describe: async () => { throw new Error('offline'); }, changed() {} });
    await binding.bind(point);
    assert.equal(calls, 0); assert.deepEqual(binding.state().point, point);
    assert.equal(binding.state().label, '지도에서 보고 있던 위치'); assert.equal(binding.state().phase, 'ready');
});
test('직접 진입의 현재 위치와 주소를 자동 연결하고 출처를 구분한다', async () => {
    const binding = createOriginBinding({ locate: async () => point, describe: async () => '공개 기준 주소', changed() {} });
    await binding.locate();
    assert.equal(binding.state().source, 'location'); assert.equal(binding.state().label, '공개 기준 주소');
});
test('사용자 입력 이후 도착한 GPS·역주소 응답은 기본값을 덮어쓰지 않는다', async () => {
    const gps = deferred(), address = deferred(); let changes = 0;
    const binding = createOriginBinding({ locate: () => gps.promise, describe: () => address.promise, changed() { changes++; } });
    const first = binding.locate(); binding.clear(); const afterInput = changes;
    gps.resolve(point); await first;
    assert.equal(changes, afterInput); assert.equal(binding.state().point, null);
    const second = binding.bind(point); assert.equal(binding.state().phase, 'ready');
    binding.clear(); const afterSecondInput = changes;
    address.resolve('늦게 온 주소'); await second;
    assert.equal(changes, afterSecondInput); assert.equal(binding.state().label, '');
});
test('분석 시작·페이지 이탈은 역주소 갱신을 막고 확인한 좌표는 보존한다', async () => {
    const address = deferred();
    const binding = createOriginBinding({ locate: async () => point, describe: () => address.promise, changed() {} });
    const task = binding.bind(point); binding.cancel(); address.resolve('늦은 주소'); await task;
    assert.deepEqual(binding.state().point, point); assert.equal(binding.state().label, '지도에서 보고 있던 위치');
});
test('위치 권한 거절은 반복 요청하지 않고 수동 입력 가능한 오류 상태로 복구한다', async () => {
    let calls = 0;
    const binding = createOriginBinding({ locate: async () => { calls++; throw new Error('권한 거절'); }, describe() {}, changed() {} });
    await binding.locate(); assert.equal(calls, 1); assert.equal(binding.state().phase, 'error'); assert.equal(binding.state().point, null);
    binding.clear(); assert.equal(binding.state().phase, 'idle');
});
/** SOFTM-ANALYSIS-ORIGIN END */
