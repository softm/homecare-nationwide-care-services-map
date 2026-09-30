/** SOFTM-DECISION-SUMMARY START 날짜:20260924 : 판단 요약에서 급여에 맞지 않는 지표와 미확인 자료의 단정 표시를 방지 */
import assert from 'node:assert/strict';
import '../care-decision-summary.js';
const { render } = globalThis.CareDecisionSummary;
const base = { g: 'A', ey: 2023, z: 49, cw: 9, rn: 2, na: 1, d: '2019-09-03' };
const daycare = render(base, 'daycare');
assert.match(daycare, /A등급/);
assert.match(daycare, /2023년 평가/);
assert.match(daycare, /등록 정원/);
assert.match(daycare, /잔여 자리가 아닙니다/);
assert.doesNotMatch(render(base, 'home-care'), /등록 정원/);
assert.match(render({ ...base, staffMissing: true }, 'home-care'), /9명 확인/);
assert.match(render({ staffMissing: true }, 'daycare'), /미확인/);
const nursing = render(base, 'home-nursing');
assert.match(nursing, /3명/);
assert.match(nursing, /간호사·간호조무사 합계/);
assert.doesNotMatch(nursing, /요양보호사|등록 정원/);
assert.doesNotMatch(render(base, 'welfare-equipment'), /정원|요양보호사|근무인원/);
const hospital = render(base, 'nursing-hospital');
assert.match(hospital, /심평원 개설현황/);
assert.match(hospital, /2019.09.03/);
assert.doesNotMatch(hospital, /공단 평가|정원|요양보호사/);
assert.doesNotMatch(render({ g: '<img src=x>', ey: '<script>', d: '<img>' }, 'daycare'), /<img|<script>/);
assert.match(render({ g: 'B', ev: { year: 2024 } }, 'home-care'), /2024년 평가/);
assert.doesNotMatch(render({ ...base, t: 'C01' }, 'dementia'), /등록 정원/);
assert.match(render({ ...base, t: 'B03,H31' }, 'dementia'), /등록 정원/);
assert.equal(globalThis.CareDecisionSummary.staffText({cw:0}, 'cw'), '0명');
assert.equal(globalThis.CareDecisionSummary.staffText({cw:0,staffMissing:true}, 'cw'), '미확인');
assert.equal(globalThis.CareDecisionSummary.staffText({}, 'cw'), '미확인');
console.log('care-decision-summary: 유형별 판단 요약 검증 통과');
/** SOFTM-DECISION-SUMMARY END */

/** SOFTM-MARKER-INSIGHT-TEST START 날짜:20260930 : 근접 지도에서 유형에 맞는 판단 근거와 수집 누락을 일관되게 안내하도록 검증 */
const { markerLines } = globalThis.CareDecisionSummary;
const near = { ...base, ey: 2024 };
for (const type of ['facility', 'daycare', 'short-stay']) {
    assert.deepEqual(markerLines(near, type), [
        '공단 A등급 · 2024년 평가',
        '등록 정원 49명 · 요양보호사 9명'
    ], `${type}: 정원은 잔여 자리가 아닌 등록 정원으로 표시`);
}
for (const type of ['home-care', 'home-bath']) {
    assert.deepEqual(markerLines(near, type), ['공단 A등급 · 2024년 평가', '요양보호사 9명']);
    assert.deepEqual(markerLines({ ...near, staffMissing: true }, type), ['공단 A등급 · 2024년 평가', '요양보호사 9명 확인']);
    assert.match(markerLines({ ...near, cw: 0, staffMissing: true }, type)[1], /요양보호사 미확인/);
    assert.match(markerLines({ ...near, cw: null }, type)[1], /요양보호사 미확인/);
    assert.match(markerLines({ ...near, cw: 0 }, type)[1], /요양보호사 0명/);
    assert.doesNotMatch(markerLines(near, type).join(' '), /정원|잔여|이용 가능/);
}
assert.deepEqual(markerLines(near, 'home-nursing'), ['공단 A등급 · 2024년 평가', '간호인력 3명']);
assert.equal(markerLines({ ...near, staffMissing: true }, 'home-nursing')[1], '간호인력 3명 확인');
assert.equal(markerLines({ ...near, rn: null }, 'home-nursing')[1], '간호인력 1명 확인');
assert.equal(markerLines({ ...near, rn: 0, na: 0, staffMissing: true }, 'home-nursing')[1], '간호인력 미확인');
assert.doesNotMatch(markerLines(near, 'home-nursing').join(' '), /요양보호사|정원/);
assert.deepEqual(markerLines(near, 'welfare-equipment'), ['공단 A등급 · 2024년 평가', '장기요양 복지용구 · 지정 2019년']);
assert.equal(markerLines({ ...near, d: '' }, 'welfare-equipment')[1], '장기요양 복지용구 · 지정연도 미확인');
assert.doesNotMatch(markerLines(near, 'welfare-equipment').join(' '), /정원|인력|요양보호사/);
assert.deepEqual(markerLines(near, 'nursing-hospital'), ['요양병원 · 의료기관', '개설 2019.09.03 · 심평원']);
assert.deepEqual(markerLines({ ...near, d: '', z: 0, cw: 0, rn: 0, na: 0 }, 'nursing-hospital'), ['요양병원 · 의료기관', '개설일 미확인 · 심평원']);
assert.doesNotMatch(markerLines(near, 'nursing-hospital').join(' '), /공단|등급|평가|정원|인력|요양보호사|0명/);
assert.equal(markerLines({ ...near, t: 'B03,H31' }, 'dementia')[1], '등록 정원 49명 · 요양보호사 9명');
assert.equal(markerLines({ ...near, t: 'C01' }, 'dementia')[1], '요양보호사 9명');
assert.equal(markerLines({ ...near, g: '' }, 'daycare')[0], '공단 평가 미확인');
assert.equal(markerLines({ g: 'B', ev: { year: 2025 } }, 'home-care')[0], '공단 B등급 · 2025년 평가');
assert.match(markerLines({ staffMissing: true }, 'daycare')[1], /등록 정원 미확인.*요양보호사 미확인/);
assert.doesNotMatch(markerLines({ staffMissing: true }, 'daycare').join(' '), /0명|undefined|null|NaN/);
console.log('care-decision-summary: 9개 유형 근접 마커 판단정보 검증 통과');
/** SOFTM-MARKER-INSIGHT-TEST END */
