/** SOFTM-VIEWPORT-CANDIDATES START 날짜:20260914 : 실제 시군구·읍면동 경계와 완료순 좌표 처리로 누락 없는 후보 축소를 검증 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib'; // SOFTM-DATA-UNIFIED 날짜:20260904 : 새 기관을 포함한 수집 기반 검색 자료로 화면영역 회귀검사
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const context = vm.createContext({ window: {}, setTimeout }); // SOFTM-QUERY-YIELD 날짜:20260916 : 입력 처리 양보를 실제 타이머로 검증
/** SOFTM-DATA-UNIFIED START 날짜:20260904 : 폐기한 JS 대신 실제 지도와 같은 data/care 자료를 사용 */
for (const file of ['region-bounds.js', 'viewport-regions.js']) vm.runInContext(read(file), context);
const api = context.window.MapViewportSearch;
const data = {};
for (const [type, config] of Object.entries(JSON.parse(read('data/care/manifest.json')))) {
    data[type] = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'data/care', config.file))));
}
/** SOFTM-DATA-UNIFIED END */
const point = (lat, lng) => ({ lat: () => lat, lng: () => lng });
const bounds = (west, south, east, north) => ({ getSW: () => point(south, west), getNE: () => point(north, east) });
const viewport = bounds(126.550704, 37.2821996, 127.029296, 37.6473545);

test('모든 유형의 원본 지역명이 시군구 인덱스에 직접 연결됨', () => {
    for (const row of Object.values(data).flat()) {
        const key = api.regionKey(row.p, row.c);
        assert.ok(context.window.NATIONAL_REGION_BOUNDS.regions[key], `미등록 지역: ${key}`);
    }
});

test('수도권 화면에서 9점 사이에 있던 인천·부천·광명 지역을 모두 포함', () => {
    const selected = api.select(data.daycare, viewport);
    const ids = new Set(selected.candidates.map(row => row.i));
    for (const [province, city] of [
        ['인천광역시', '부평구'], ['인천광역시', '계양구'], ['인천광역시', '남동구'],
        ['인천광역시', '미추홀구'], ['인천광역시', '연수구'],
        ['경기도', '부천시 소사구'], ['경기도', '부천시 원미구'], ['경기도', '부천시 오정구'], ['경기도', '광명시'],
        ['서울특별시', '구로구'], ['서울특별시', '양천구']
    ]) {
        const expected = data.daycare.filter(row => row.p === province && row.c === city);
        assert.ok(expected.length > 0);
        assert.ok(expected.every(row => ids.has(row.i)), `${province} ${city} 누락`);
    }
    assert.ok(!selected.candidates.some(row => row.p === '부산광역시'));
});

test('지역 경계 후보와 실제 좌표 판정을 구분하며 저장된 화면 안 좌표를 우선함', () => {
    const rows = [
        { i: 'inside', p: '부산광역시', c: '남구', _coord: { lat: 37.45, lng: 126.8 } },
        { i: 'outside', p: '경기도', c: '광명시', _coord: { lat: 35.1, lng: 129.1 } },
        { i: 'edge', p: '경기도', c: '광명시', _coord: { lat: 37.2821996, lng: 126.550704 } },
        { i: 'unknown', p: '경기도', c: '새로운구' }
    ];
    const selected = api.select(rows, viewport, row => row._coord);
    assert.deepEqual(Array.from(selected.candidates, row => row.i), ['inside', 'edge', 'unknown']);
});

test('바다만 보이는 화면은 빈 결과이며 역주소 API가 필요하지 않음', () => {
    assert.equal(api.select(data.daycare, bounds(120, 30, 121, 31)).candidates.length, 0);
});

/** SOFTM-VIEWPORT-CANDIDATES START 날짜:20260914 : 연결되는 읍면동만 줄이고 모르는 주소는 시군구 후보에 보존 */
test('좁은 화면은 읍면동 경계로 좌표 후보를 줄이고 미연결 주소는 제외하지 않음', () => {
    const box = context.window.NATIONAL_REGION_BOUNDS.neighborhoods['서울특별시|종로구|사직동'];
    assert.ok(box);
    const view = bounds((box[0] + box[2]) / 2 - .001, (box[1] + box[3]) / 2 - .001, (box[0] + box[2]) / 2 + .001, (box[1] + box[3]) / 2 + .001);
    const rows = [
        { i: 'inside', p: '서울특별시', c: '종로구', a: '서울특별시 종로구 사직로 1 (사직동, 건물 101동)' },
        { i: 'outside', p: '서울특별시', c: '종로구', a: '서울특별시 종로구 평창길 1 (평창동)' },
        { i: 'unmatched', p: '서울특별시', c: '종로구', a: '주소 확인 필요' }
    ];
    assert.deepEqual(Array.from(api.select(rows, view).candidates, row => row.i), ['inside', 'unmatched']);
    assert.equal(api.rowNeighborhood(rows[0]), '사직동');
});

test('공식 관할 관계로 이름이 다른 행정동을 합치고 저장 좌표 주변 기관을 누락하지 않음', () => {
    assert.ok(context.window.NATIONAL_REGION_BOUNDS.neighborhoods['서울특별시|관악구|신림동']);
    assert.equal(context.window.NATIONAL_REGION_BOUNDS.neighborhoods['서울특별시|관악구|서원동'], undefined);
    const rowsById = new Map(Object.values(data).flat().map(row => [row.i, row]));
    for (const file of ['nationwide-care-services-map.html']) {
        const html = read(file), start = html.indexOf('const PRESET_COORDS='), end = html.indexOf('\n};', start) + 3;
        const presetContext = vm.createContext({});
        vm.runInContext(`${html.slice(start, end)};globalThis.presets=PRESET_COORDS`, presetContext);
        for (const [id, [lat, lng]] of Object.entries(presetContext.presets)) {
            const row = rowsById.get(id);
            if (!row || !context.window.NATIONAL_REGION_BOUNDS.neighborhoods[`${api.regionKey(row.p, row.c)}|${api.rowNeighborhood(row)}`]) continue;
            assert.equal(api.select([row], bounds(lng - .00001, lat - .00001, lng + .00001, lat + .00001)).candidates.length, 1, `${file} ${id} 누락`);
        }
    }
});
/** SOFTM-VIEWPORT-CANDIDATES END */

/** SOFTM-VIEWPORT-RESOLVE START 날짜:20260914 : 먼저 끝난 주소가 다음 후보 처리를 즉시 이어가는지 검증 */
test('좌표 확인은 느린 고정 묶음을 기다리지 않고 제한된 동시성으로 다음 후보를 처리', async () => {
    let active = 0, maximum = 0;
    const events = [];
    const result = await api.resolve([0, 1, 2, 3], async value => {
        active += 1; maximum = Math.max(maximum, active); events.push(`start-${value}`);
        await new Promise(resolve => setTimeout(resolve, value === 0 ? 25 : 2));
        events.push(`end-${value}`); active -= 1; return value * 10;
    }, { concurrency: 2, onResult: row => events.push(`result-${row}`) });
    assert.equal(maximum, 2);
    assert.ok(events.indexOf('start-2') < events.indexOf('end-0'), '빠른 작업 완료 후 다음 후보가 즉시 시작됨');
    assert.deepEqual(Array.from(result.results, item => item.value), [0, 10, 20, 30]);
});
/** SOFTM-VIEWPORT-RESOLVE END */

test('두 지도에서 기존 필터를 유지한 후보 함수가 공통 경계를 사용', () => {
    for (const file of ['nationwide-care-services-map.html']) {
        const html = read(file);
        assert.ok(html.includes('src="region-bounds.js?'));
        assert.ok(html.includes('src="viewport-regions.js?'));
        const declaration = html.match(/^function viewportCandidates\([^\n]+/m)?.[0];
        assert.ok(declaration);
        const filtered = data.daycare.filter(row => row.g === 'A');
        const sandbox = vm.createContext({
            MapViewportSearch: api, DATA: data.daycare, map: { getBounds: () => viewport },
            applyFilters: ignoreRegion => { assert.equal(ignoreRegion, true); return filtered; },
            matchesActiveNonSpatialFilters: row => row.g === 'A', cachedCoord: () => null, coordFor: () => null
        });
        vm.runInContext(declaration, sandbox);
        const result = vm.runInContext('viewportCandidates(map.getBounds())', sandbox);
        assert.ok(result.candidates.length > 0);
        assert.ok(result.candidates.every(row => row.g === 'A'));
        assert.ok(result.candidates.some(row => row.p === '인천광역시' && row.c === '부평구'));
    }
});

test('통합 지도는 축소 화면에서도 300번째 이후의 화면 안 기관을 표시', async () => {
    const html = read('nationwide-care-services-map.html');
    const declaration = html.slice(html.indexOf('async function loadMarkers('), html.indexOf('async function searchByControls('));
    const placed = new Map();
    const node = {};
    const rows = Array.from({ length: 351 }, (_, i) => ({ i: String(i), n: String(i), _coord: { lat: 37.45, lng: 126.8 } }));
    class LatLng { constructor(lat, lng) { this.lat = () => lat; this.lng = () => lng; } }
    class LatLngBounds { extend() {} }
    class Marker {getIcon(){return this.icon}getMap(){return this.options.map}setMap(map){this.options.map=map}setIcon(icon){this.icon=icon} /* SOFTM-MARKER-DIFF 날짜:20260917 : 마커 재사용에 필요한 실제 지도 API 계약을 제공 */ constructor(options) { this.options = options; } }
    const sandbox = vm.createContext({
        window: { naver: { maps: { LatLng, LatLngBounds, Marker, Event: { addListener() {} } } } }, MapViewportSearch: api,
        mobileActiveMarker: null, mobileActiveIcon: null, mapReady: true, refreshToken: 0, clearMarkers() {}, clearQueryMarkers() {}, map: { getBounds: () => ({ hasLatLng: () => true }), getCenter: () => point(37.45, 126.8), getZoom: () => 10 },
        cachedCoord: row => row._coord, hav: () => 0, PAGE_LIMIT: 90, MAP_CANDIDATE_LIMIT: 300,
        geocode: async row => row._coord, basePoint: null, showLoading() {}, hideLoading() {},
        careMatchPending: false, careMatchRows: [], CareMapExperience: { refreshMatch() {} }, // SOFTM-CARE-MATCH 날짜:20260910 : 실제 조회 전체 결과를 설명에도 전달하는 계약을 제공
        $: () => node, areaRows: [], selected: new Set(), sortRows() {}, markers: placed,
        /** SOFTM-SEARCH-FEEDBACK START 날짜:20260904 : 조회 완료 계약을 제공하면서 기존 전체 화면 후보 검증을 유지 */
        markerIcon() {}, renderList() {}, setStatus() {}, updateAreaLocation() {}, rows, resultCount: 0, // SOFTM-LOCATION-ROW 날짜:20260909 : 지도 후보 검사는 별도 위치줄 표시를 모의 처리
        beginCareQuery: () => ({ current: () => true }), publishCareResult: (query, outcome) => outcome
        /** SOFTM-SEARCH-FEEDBACK END */
    });
    vm.runInContext(declaration, sandbox);
    await vm.runInContext('loadMarkers(rows)', sandbox);
    assert.equal(placed.size, 351);
    assert.equal(sandbox.areaRows.length, 351);
    assert.equal(sandbox.careMatchRows.length, 351); // SOFTM-CARE-MATCH 날짜:20260910 : 표시 제한을 넘는 후보도 설명 집계에서 누락되지 않게 검증
});

/** SOFTM-VIEWPORT-CANDIDATES END */

/** SOFTM-QUERY-YIELD START 날짜:20260916 : 대량 캐시 조회 도중 실제 이벤트 루프의 필터 변경이 처리되고 이전 결과가 멈추는지 검증 */
test('캐시 좌표 5000개를 처리하는 중 입력 이벤트가 실행되고 이전 조회를 취소함', async () => {
    let current = true, drawn = 0, inputAt = -1;
    const input = new Promise(resolve => setTimeout(() => { inputAt = drawn; current = false; resolve(); }, 0));
    const result = await api.resolve(Array.from({length:5000}, (_, i) => i), value => Promise.resolve(value), {
        current: () => current, onResult: () => drawn++
    });
    await input;
    assert.ok(inputAt > 0 && inputAt < 5000);
    assert.equal(result.cancelled, true);
    assert.equal(drawn, inputAt, '조건 변경 뒤 이전 조회의 마커가 추가되면 안 됨');
});
test('입력 처리 시간을 양보해도 전체 후보의 결과·진행 건수를 빠짐없이 유지함', async () => {
    const seen = [], rows = Array.from({length:257}, (_, i) => i);
    const result = await api.resolve(rows, value => value, {onResult: value => seen.push(value)});
    assert.equal(result.cancelled, false);
    assert.equal(result.done, rows.length);
    assert.deepEqual(seen.sort((a,b) => a-b), rows);
});
/** SOFTM-QUERY-YIELD END */
