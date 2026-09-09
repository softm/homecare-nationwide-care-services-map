/** SOFTM-MOBILE-SHEET START 날짜:20260909 : 세 단계 전환·취소 임계값·상세 복귀 후 뒤로가기 대상을 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../map-experience.js';
test('위로 끌면 전체 목록, 뒤로가기는 이전 기본 화면', () => {
    const sheet = CareMapExperience.createSheetState();
    assert.equal(sheet.state(), 'split'); assert.equal(sheet.drag(-100), 'list');
    assert.equal(sheet.back(), 'split');
});
test('아래로 끌면 큰 지도, 위로 끌면 기본 화면을 거쳐 목록으로 전환', () => {
    const sheet = CareMapExperience.createSheetState();
    assert.equal(sheet.drag(100), 'map'); assert.equal(sheet.drag(100), 'map');
    assert.equal(sheet.drag(-100), 'split'); assert.equal(sheet.drag(-100), 'list');
    assert.equal(sheet.drag(-100), 'list');
});
test('작은 흔들림과 잘못된 단계는 상태를 바꾸지 않는다', () => {
    const sheet = CareMapExperience.createSheetState();
    assert.equal(sheet.drag(30), 'split'); assert.equal(sheet.drag(-30), 'split');
    assert.equal(sheet.set('invalid'), 'split');
});
test('큰 지도에서 전체 목록을 열어도 뒤로가기는 큰 지도로 복귀한다', () => {
    const sheet = CareMapExperience.createSheetState();
    sheet.set('map'); sheet.set('list'); assert.equal(sheet.back(), 'map');
});
test('상세 때문에 잠시 지도를 보여도 원래 목록의 뒤로가기 대상을 보존한다', () => {
    const sheet = CareMapExperience.createSheetState();
    sheet.set('map'); sheet.set('list'); sheet.set('split', false); sheet.set('list', false);
    assert.equal(sheet.back(), 'map');
});
/** SOFTM-MOBILE-SHEET END */
