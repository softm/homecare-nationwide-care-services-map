/** SOFTM-MARKER-LEVEL-TEST START 날짜:20260930 : 가까이 확대해도 정보가 겹치거나 잘리지 않고 읽을 수 있는 단계로 내려가는지 검증 */
import assert from 'node:assert/strict';
import test from 'node:test';
import '../map-marker-labels.js';

const { detailLevel, fitLevel } = globalThis.CareMarkerLabels;
const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
const bounds = rect(0, 0, 400, 400);
const levels = [rect(100, 170, 250, 200), rect(100, 140, 250, 200), rect(100, 110, 250, 200)];

test('이름은 낮은 배율에서도 허용하고 16·18부터 평가·핵심정보 후보를 추가한다', () => {
    for (const zoom of [7, 12, 13, 15, 15.99]) assert.equal(detailLevel(zoom), 0);
    for (const zoom of [16, 17, 17.99]) assert.equal(detailLevel(zoom), 1);
    for (const zoom of [18, 19]) assert.equal(detailLevel(zoom), 2);
});

test('여유 공간이 있으면 제공된 가장 자세한 정보를 선택한다', () => {
    assert.equal(fitLevel(levels, bounds, []), 2);
    assert.equal(fitLevel(levels.slice(0, 2), bounds, []), 1);
    assert.equal(fitLevel(levels.slice(0, 1), bounds, []), 0);
});

test('정보카드가 겹치면 이름만 보이는 단계까지 내린다', () => {
    assert.equal(fitLevel(levels, bounds, [rect(90, 105, 260, 152)]), 0);
});

test('핵심정보만 겹치면 평가줄은 유지한다', () => {
    assert.equal(fitLevel(levels, bounds, [rect(90, 85, 260, 120)]), 1);
});

test('지도 가장자리에서 잘리는 상세카드 대신 들어가는 이름을 선택한다', () => {
    const edgeLevels = [rect(10, 170, 150, 200), rect(5, 140, 155, 200), rect(0, 110, 160, 200)];
    assert.equal(fitLevel(edgeLevels, bounds, []), 0);
    assert.equal(fitLevel([rect(8, 8, 392, 392)], bounds, []), 0);
    for (const clipped of [rect(7, 10, 100, 50), rect(10, 7, 100, 50), rect(300, 10, 393, 50), rect(10, 350, 100, 393)]) {
        assert.equal(fitLevel([clipped], bounds, []), -1);
    }
});

test('이름도 들어갈 공간이 없으면 표시하지 않는다', () => {
    assert.equal(fitLevel(levels, bounds, [rect(90, 160, 260, 205)]), -1);
    assert.equal(fitLevel([], bounds, []), -1);
    assert.equal(fitLevel([rect(20, 20, 20, 50)], bounds, []), -1);
    assert.equal(fitLevel([rect(20, 20, 50, 20)], bounds, []), -1);
});

test('이웃 정보카드와 가로·세로 6px 간격을 확보한다', () => {
    const card = [rect(100, 100, 200, 150)];
    assert.equal(fitLevel(card, bounds, [rect(206, 100, 250, 150)]), 0);
    assert.equal(fitLevel(card, bounds, [rect(205, 100, 250, 150)]), -1);
    assert.equal(fitLevel(card, bounds, [rect(40, 100, 94, 150)]), 0);
    assert.equal(fitLevel(card, bounds, [rect(40, 100, 95, 150)]), -1);
    assert.equal(fitLevel(card, bounds, [rect(100, 156, 200, 200)]), 0);
    assert.equal(fitLevel(card, bounds, [rect(100, 155, 200, 200)]), -1);
    assert.equal(fitLevel(card, bounds, [rect(100, 40, 200, 94)]), 0);
    assert.equal(fitLevel(card, bounds, [rect(100, 40, 200, 95)]), -1);
});

test('스크롤 위치가 있는 지도에서도 화면 좌표 기준으로 충돌을 판정한다', () => {
    const shiftedBounds = rect(300, 200, 700, 600);
    assert.equal(fitLevel([rect(308, 208, 500, 300)], shiftedBounds, []), 0);
    assert.equal(fitLevel([rect(307, 208, 500, 300)], shiftedBounds, []), -1);
    assert.equal(fitLevel([rect(308, 208, 500, 300)], shiftedBounds, [rect(450, 250, 550, 350)]), -1);
});
/** SOFTM-MARKER-LEVEL-TEST END */

/** SOFTM-MARKER-SCALE START 날짜:20261005 : 배율 경계에서 위치점·핀·이름·상세가 올바르게 전환되는지 검증 */
test('지도 배율 14·16·18 경계에서 마커 표시 수준을 전환한다', () => {
    for (const [zoom, expected] of [[7,'dot'],[13.99,'dot'],[14,'pin'],[15.99,'pin'],[16,'name'],[17.99,'name'],[18,'detail'],[19,'detail']]) {
        assert.equal(CareMarkerLabels.markerScale(zoom), expected);
    }
});
/** SOFTM-MARKER-SCALE END */

/** SOFTM-LABEL-DENSITY START 날짜:20261005 : 기본·축소 배율에서 기관명을 전부 숨기는 회귀를 방지 */
test('모든 배율에서 이름을 허용하고 확대할수록 표시 한도를 늘린다', () => {
    const budgets = [7,12,14,16,18].map(zoom => CareMarkerLabels.labelBudget(zoom,390,844));
    assert.ok(budgets.every(value => value > 0));
    assert.ok(budgets.every((value,index) => !index || value >= budgets[index-1]));
    assert.equal(CareMarkerLabels.labelBudget(12,0,844),0);
    assert.ok(CareMarkerLabels.labelBudget(12,1920,1080) <= 12);
});
/** SOFTM-LABEL-DENSITY END */

/** SOFTM-LABEL-STABLE START 날짜:20261007 : 표시 후보 입력 순서가 바뀌어도 선택·기존 이름의 우선순위와 동률 순서를 보존 */
test('재검색 순서와 무관하게 선택·기존 표시·기관기호 순으로 이름을 배치한다', () => {
 const rows=[{key:'c',selected:false},{key:'a',selected:false},{key:'b',selected:false},{key:'z',selected:true}];
 const retained=new Map([['b','left']]);
 const ordered=values=>values.sort((a,b)=>CareMarkerLabels.compareLabels(a,b,retained)).map(row=>row.key);
 assert.deepEqual(ordered([...rows]),['z','b','a','c']);
 assert.deepEqual(ordered([...rows].reverse()),['z','b','a','c']);
});
/** SOFTM-LABEL-STABLE END */
