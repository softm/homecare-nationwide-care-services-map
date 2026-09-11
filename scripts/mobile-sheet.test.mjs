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

/** SOFTM-RESULT-SHEET START 날짜:20260911 : 검색 전체 건수와 시트 단계별 행동 문구가 함께 바뀌는지 검증 */
test('지도와 목록을 함께 볼 때 검색 전체 건수와 전체 목록 행동을 안내한다', () => {
    assert.deepEqual(CareMapExperience.createSheetSummary('3곳', 'split'), {
        count: '3곳', action: '전체 목록 보기', expanded: false, label: '검색 결과 3곳. 전체 목록 보기'
    });
});
test('전체 목록에서는 지도 복귀 행동을 안내하고 로딩 건수도 구분한다', () => {
    assert.deepEqual(CareMapExperience.createSheetSummary('31,734곳', 'list'), {
        count: '31,734곳', action: '지도와 함께 보기', expanded: true, label: '검색 결과 31,734곳. 지도와 함께 보기'
    });
    assert.equal(CareMapExperience.createSheetSummary('-', 'split').count, '확인 중');
    assert.equal(CareMapExperience.createSheetSummary('0곳', 'split').count, '0곳');
});
/** SOFTM-RESULT-SHEET END */
