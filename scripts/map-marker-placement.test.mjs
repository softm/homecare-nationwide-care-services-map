/** SOFTM-MARKER-PLACEMENT START 날짜:20260930 : 확대해도 위쪽 충돌이나 같은 건물 좌표 때문에 기관명이 불필요하게 사라지지 않도록 대체 배치를 검증 */
import assert from 'node:assert/strict';
import test from 'node:test';
import '../map-marker-placement.js';

const { fit } = globalThis.CareMarkerPlacement;
const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
const bounds = rect(0, 0, 500, 500);
const pin = rect(234, 230, 32, 32);
const name = rect(190, 180, 120, 30);
const topBlock = rect(185, 175, 130, 40);
const rightBlock = rect(272, 220, 130, 40);
const leftBlock = rect(98, 220, 130, 40);

test('위쪽이 비어 있으면 원래 위치를 새 객체로 반환하고 입력은 바꾸지 않는다', () => {
    const frozen = Object.freeze({ ...name });
    const result = fit([frozen], pin, bounds, [pin]);
    assert.equal(result.level, 0);
    assert.equal(result.side, 'top');
    assert.equal(result.dx, 0);
    assert.equal(result.dy, 0);
    assert.notEqual(result.rect, frozen);
    assert.deepEqual(frozen, name);
    assert.deepEqual(result.rect, { x: 190, y: 180, ...name });
});

test('위쪽을 다른 핀이 막으면 오른쪽 공간에 이름을 표시한다', () => {
    const result = fit([name], pin, bounds, [pin, topBlock]);
    assert.equal(result.side, 'right');
    assert.equal(result.rect.left, pin.right + 10);
    assert.equal(result.rect.top + result.rect.height / 2, pin.top + pin.height / 2);
    assert.equal(result.dx, result.rect.left - name.left);
    assert.equal(result.dy, result.rect.top - name.top);
});

test('위·오른쪽이 막히면 왼쪽으로 옮긴다', () => {
    const result = fit([name], pin, bounds, [pin, topBlock, rightBlock]);
    assert.equal(result.side, 'left');
    assert.equal(result.rect.right, pin.left - 10);
    assert.equal(result.rect.top + result.rect.height / 2, pin.top + pin.height / 2);
});

test('위·양옆이 막히면 핀 아래로 옮긴다', () => {
    const result = fit([name], pin, bounds, [pin, topBlock, rightBlock, leftBlock]);
    assert.equal(result.side, 'bottom');
    assert.equal(result.rect.top, pin.bottom + 10);
    assert.equal(result.rect.left + result.rect.width / 2, pin.left + pin.width / 2);
});

test('같은 건물 좌표의 두 기관은 서로 다른 여유 위치를 사용한다', () => {
    const first = fit([name], pin, bounds, [pin, pin]);
    const second = fit([name], pin, bounds, [pin, pin, first.rect]);
    assert.equal(first.side, 'top');
    assert.equal(second.side, 'right');
    assert.ok(second.rect.top >= first.rect.bottom + 6);
});

test('자세한 단계부터 네 방향을 검사하고 모두 막힐 때 이름 단계로 줄인다', () => {
    const detail = rect(140, 40, 220, 170);
    assert.equal(fit([name, detail], pin, bounds, [pin, topBlock]).level, 1);
    const smallBounds = rect(160, 150, 180, 200);
    const result = fit([name, detail], pin, smallBounds, [pin]);
    assert.equal(result.level, 0);
    assert.equal(result.side, 'top');
});

test('지도 가장자리 8px와 조작부를 피해 이름을 배치한다', () => {
    const edgePin = rect(8, 30, 32, 32);
    const edgeName = rect(-36, -20, 120, 30);
    const result = fit([edgeName], edgePin, bounds, [edgePin]);
    assert.equal(result.side, 'right');
    const controls = rect(45, 15, 135, 55);
    assert.equal(fit([edgeName], edgePin, bounds, [edgePin, controls]), null);
    const inset = rect(8, 8, 120, 30);
    assert.equal(fit([inset], pin, bounds, []).side, 'top');
    assert.notEqual(fit([rect(7, 8, 120, 30)], pin, bounds, []).side, 'top');
});

test('6px 간격은 허용하고 그보다 가까운 조작부는 피한다', () => {
    const near = rect(name.right + 6, name.top, 30, name.height);
    assert.equal(fit([name], pin, bounds, [near]).side, 'top');
    near.left--;
    near.width++;
    assert.notEqual(fit([name], pin, bounds, [near]).side, 'top');
});

test('빈 후보와 면적 없는 후보는 표시하지 않고 숨겨진 장애물은 무시한다', () => {
    assert.equal(fit([], pin, bounds, []), null);
    assert.equal(fit([rect(190, 180, 0, 30), rect(190, 180, 120, 0)], pin, bounds, []), null);
    assert.equal(fit([name], rect(0, 0, 0, 0), bounds, []), null);
    assert.equal(fit([name], pin, rect(0, 0, 0, 500), []), null);
    assert.equal(fit([name], pin, bounds, [rect(190, 180, 0, 30)]).side, 'top');
    assert.equal(fit([name], pin, bounds, [bounds]), null);
});

test('스크롤된 지도에서도 화면 좌표와 이동량이 일관된다', () => {
    const move = source => rect(source.left + 300, source.top + 200, source.width, source.height);
    const original = fit([name], pin, bounds, [pin, topBlock]);
    const shifted = fit([move(name)], move(pin), move(bounds), [move(pin), move(topBlock)]);
    assert.equal(shifted.side, original.side);
    assert.equal(shifted.dx, original.dx);
    assert.equal(shifted.dy, original.dy);
    assert.equal(shifted.rect.left, original.rect.left + 300);
    assert.equal(shifted.rect.top, original.rect.top + 200);
});

test('선호 방향을 먼저 유지하고 막히면 나머지 기본 순서로 돌아간다', () => {
    assert.equal(fit([name], pin, bounds, [pin], 'bottom').side, 'bottom');
    const result = fit([name], pin, bounds, [pin, rightBlock], 'right');
    assert.equal(result.side, 'top');
    assert.equal(fit([name], pin, bounds, [pin], 'unknown').side, 'top');
});
/** SOFTM-MARKER-PLACEMENT END */
