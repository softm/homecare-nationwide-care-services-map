/** SOFTM-VIEWPORT-REGIONS START 날짜:20260904 : 실제 경계·기관자료와 두 지도 호출 경로로 수도권 누락 및 후보 절단의 재발을 검증 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const context = vm.createContext({ window: {} });
for (const file of ['region-bounds.js', 'viewport-regions.js', 'nationwide-care-manifest.js']) vm.runInContext(read(file), context);
const api = context.window.MapViewportSearch;
const data = {};
for (const [type, config] of Object.entries(context.window.NATIONAL_CARE_MANIFEST)) {
    context.window.NATIONAL_CARE_DATA = [];
    for (const file of config.files) vm.runInContext(read(file), context);
    data[type] = context.window.NATIONAL_CARE_DATA;
}
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

test('두 지도에서 기존 필터를 유지한 후보 함수가 공통 경계를 사용', () => {
    for (const file of ['nationwide-care-services-map.html', 'nationwide-daycare-map.html']) {
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
    class Marker { constructor(options) { this.options = options; } }
    const sandbox = vm.createContext({
        window: { naver: { maps: { LatLng, LatLngBounds, Marker, Event: { addListener() {} } } } },
        mapReady: true, refreshToken: 0, clearMarkers() {}, map: { getBounds: () => ({ hasLatLng: () => true }), getCenter: () => point(37.45, 126.8), getZoom: () => 10 },
        cachedCoord: row => row._coord, hav: () => 0, PAGE_LIMIT: 90, MAP_CANDIDATE_LIMIT: 300,
        geocode: async row => row._coord, basePoint: null, showLoading() {}, hideLoading() {},
        $: () => node, areaRows: [], selected: new Set(), sortRows() {}, markers: placed,
        markerIcon() {}, renderList() {}, setStatus() {}, rows
    });
    vm.runInContext(declaration, sandbox);
    await vm.runInContext('loadMarkers(rows)', sandbox);
    assert.equal(placed.size, 351);
    assert.equal(sandbox.areaRows.length, 351);
});

test('전용 지도도 축소 화면에서 800번째 이후 기관까지 최종 좌표 확인에 전달', async () => {
    const html = read('nationwide-daycare-map.html');
    const declaration = html.slice(html.indexOf('async function searchCurrentMap('), html.indexOf('function clearMapSearch('));
    const rows = Array.from({ length: 1001 }, (_, i) => ({ i: String(i), p: '경기도', c: '광명시' }));
    let receivedLimit = 0;
    const sandbox = vm.createContext({
        mapReady: true, clearTimeout() {}, boundsTimer: null, skipIdleUntil: 0, closeMapPopup() {},
        naverMap: { getBounds: () => viewport, getZoom: () => 10 }, setMapStatus() {}, showMapProgress() {},
        viewportCandidates: b => api.select(rows, b), MAP_AREA_LIMIT: 800,
        async displayCenters(candidates, open, route, fit, b, limit) {
            assert.equal(b, viewport);
            assert.equal(fit, false);
            receivedLimit = limit;
            sandbox.mapMarkers = candidates.slice(0, limit).map(row => ({ centerId: row.i }));
        },
        mapMarkers: [], mapSearchIds: null, $: () => ({ style: {} }), page: 1,
        apply() {}, filtered: rows, hideMapProgress() {}, showToast() {}
    });
    vm.runInContext(declaration, sandbox);
    await vm.runInContext('searchCurrentMap(false)', sandbox);
    assert.equal(receivedLimit, 1001);
    assert.equal(sandbox.mapSearchIds.size, 1001);
});
/** SOFTM-VIEWPORT-REGIONS END */
