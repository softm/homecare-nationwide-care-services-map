/** SOFTM-REGION-SPACING START 날짜:20260904 : 외곽 때문에 축소되는 지역과 전체 위치 복귀에서 기관 누락·과확대를 방지 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../nationwide-care-services-map.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('function regionFocusPositions('), html.indexOf('function markerIcon('));
class LatLng {
    constructor(lat, lng) { this.latitude = lat; this.longitude = lng; }
    lat() { return this.latitude; }
    lng() { return this.longitude; }
}
class LatLngBounds {
    points = [];
    extend(point) { this.points.push(point); }
}
function harness(zoom = 13) {
    const fits = [], zooms = [], cleared = [], messages = [];
    const context = vm.createContext({
        window: { naver: { maps: { LatLng, LatLngBounds } } },
        mapReady: true, markers: new Map(), selected: new Set(), skipIdleUntil: 0,
        refreshTimer: 7, closeDetail() {}, clearTimeout: timer => cleared.push(timer),
        toast: text => messages.push(text), cachedCoord: row => row.coord,
        map: {
            fitBounds: (bounds, padding) => fits.push({ bounds, padding }),
            getZoom: () => zoom, setZoom: value => zooms.push(value),
        },
    });
    vm.runInContext(source, context);
    return { context, fits, zooms, cleared, messages };
}
const point = (lat, lng) => new LatLng(lat, lng);

test('도심 80%가 모여 있고 소수 외곽이 멀면 도심 범위를 사용하며 원본 좌표는 보존한다', () => {
    const { context } = harness();
    const city = Array.from({ length: 8 }, (_, i) => point(37.87 + i * .001, 127.74 + i * .001));
    const all = [...city, point(37.77, 127.64), point(37.94, 127.78)];
    const before = all.slice();
    assert.deepEqual(Array.from(context.regionFocusPositions(all)).sort((a, b) => a.lat() - b.lat()), city);
    assert.deepEqual(all, before);
});

test('넓게 고르게 분포하거나 8곳 미만인 지역은 일부를 잘라내지 않는다', () => {
    const { context } = harness();
    const ring = Array.from({ length: 20 }, (_, i) => point(37 + Math.sin(i * Math.PI / 10) * .1, 127 + Math.cos(i * Math.PI / 10) * .1));
    assert.equal(context.regionFocusPositions(ring), ring);
    const few = ring.slice(0, 7);
    assert.equal(context.regionFocusPositions(few), few);
    assert.deepEqual(Array.from(context.regionFocusPositions([])), []);
});

test('동일 건물의 기관과 단일 기관은 최대 16배율로 제한하고 입력 목록을 변경하지 않는다', () => {
    const { context, fits, zooms } = harness(19);
    const rows = Array.from({ length: 10 }, (_, i) => ({ i, coord: { lat: 37.87, lng: 127.74 } }));
    context.fitRegionMarkers(rows);
    assert.equal(fits[0].bounds.points.length, 10);
    assert.deepEqual(zooms, [16]);
    assert.equal(rows.length, 10);
    context.fitRegionMarkers(rows.slice(0, 1));
    assert.equal(fits[1].bounds.points.length, 1);
});

test('좁은 모바일에서도 밀집 지역은 최소 13배율로 시작한다', () => {
    const { context, zooms } = harness(11);
    const rows = Array.from({ length: 8 }, (_, i) => ({ coord: { lat: 37.87 + i * .001, lng: 127.74 } }));
    rows.push({ coord: { lat: 37.77, lng: 127.64 } }, { coord: { lat: 37.94, lng: 127.78 } });
    context.fitRegionMarkers(rows);
    assert.deepEqual(zooms, [13]);
});

test('전체 위치는 체크된 모든 외곽 마커를 포함하고 선택 집합을 유지한다', () => {
    const { context, fits, cleared } = harness();
    const center = point(37.87, 127.74), outer = point(37.77, 127.64), hidden = point(38, 128);
    context.markers = new Map([['center', center], ['outer', outer], ['hidden', hidden]].map(([id, p]) => [id, { getPosition: () => p }]));
    context.selected = new Set(['center', 'outer']);
    context.showAllMarkerLocations();
    assert.deepEqual(fits[0].bounds.points, [center, outer]);
    assert.deepEqual([...context.selected], ['center', 'outer']);
    assert.equal(context.markers.size, 3);
    assert.deepEqual(cleared, [7]);
    assert.ok(context.skipIdleUntil > Date.now(), '내부 범위 이동으로 자동 재검색하지 않음');
});

test('전체 선택 해제와 지도 준비 전에는 빈 범위로 지도를 이동하지 않는다', () => {
    const { context, fits, messages } = harness();
    context.showAllMarkerLocations();
    assert.equal(fits.length, 0);
    assert.equal(messages.length, 1);
    context.mapReady = false;
    context.showAllMarkerLocations();
    assert.equal(messages.length, 1);
});
/** SOFTM-REGION-SPACING END */
