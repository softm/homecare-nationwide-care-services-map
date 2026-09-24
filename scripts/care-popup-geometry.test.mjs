/** SOFTM-POPUP-GEOMETRY-TEST START 날짜:20260924 : 가로·세로 팝업과 화면 일부 교차에서도 선택 위치 보정 방향과 유효 영역을 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../care-popup-geometry.js';

const { visibleRect, focusCenter } = globalThis.CarePopupGeometry;
const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
const noInsets = { top: 0, right: 0, bottom: 0, left: 0, gap: 0 };

test('패널이 없거나 지도 밖이면 안전여백만 제외한다', () => {
    const map = box(100, 80, 800, 600), expected = box(124, 152, 752, 504);
    assert.deepEqual(visibleRect(map, null), expected);
    assert.deepEqual(visibleRect(map, box(950, 0, 300, 600)), expected);
});

test('세로 하단 상세는 상단 지도를 남긴다', () => {
    assert.deepEqual(visibleRect(box(0, 56, 390, 724), box(0, 360, 390, 420)), box(24, 128, 342, 208));
});

test('가로 오른쪽 상세는 왼쪽 지도를 남긴다', () => {
    assert.deepEqual(visibleRect(box(0, 0, 844, 390), box(460, 0, 384, 390)), box(24, 72, 412, 294));
});

test('PC 일부 교차에서는 남은 네 방향 중 면적이 가장 큰 곳을 선택한다', () => {
    assert.deepEqual(visibleRect(box(100, 100, 1000, 700), box(850, 500, 400, 400)), box(124, 172, 702, 604));
});

test('상단과 왼쪽 패널도 각각 반대쪽 공간을 선택한다', () => {
    assert.deepEqual(visibleRect(box(0, 0, 400, 600), box(0, 0, 400, 200), noInsets), box(0, 200, 400, 400));
    assert.deepEqual(visibleRect(box(0, 0, 600, 400), box(0, 0, 200, 400), noInsets), box(200, 0, 400, 400));
});

test('넓지만 너무 얇은 띠보다 최소 48px 이상인 유효 영역을 우선한다', () => {
    assert.deepEqual(visibleRect(box(0, 0, 1000, 100), box(0, 40, 940, 60), noInsets), box(940, 0, 60, 100));
});

test('선택 기관을 하단 패널 위쪽 중앙에 놓는 중심 좌표를 계산한다', () => {
    const result = focusCenter({ lat: 37, lng: 127 }, { north: 38, south: 36, east: 128, west: 126 }, box(0, 0, 400, 800), box(0, 400, 400, 400), noInsets);
    assert.deepEqual(result, { lat: 36.5, lng: 127 });
});

test('오른쪽 패널에서는 경도를 보정하고 지도 원점 이동에 영향을 받지 않는다', () => {
    const result = focusCenter({ lat: 37, lng: 127 }, { north: 38, south: 36, east: 128, west: 126 }, box(100, 200, 800, 400), box(500, 200, 400, 400), noInsets);
    assert.deepEqual(result, { lat: 37, lng: 127.5 });
});

test('작거나 완전히 가린 지도는 음수 크기나 잘못된 이동을 만들지 않는다', () => {
    const tiny = visibleRect(box(0, 0, 10, 10), null);
    assert.ok(tiny.width >= 0 && tiny.height >= 0);
    const position = { lat: 37, lng: 127 };
    assert.deepEqual(focusCenter(position, { north: 38, south: 36, east: 128, west: 126 }, box(0, 0, 400, 800), box(-10, -10, 420, 820)), position);
    assert.deepEqual(visibleRect(null, null), box(0, 0, 0, 0));
});
/** SOFTM-POPUP-GEOMETRY-TEST END */
