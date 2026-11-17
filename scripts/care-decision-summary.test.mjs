/** SOFTM-DECISION-SUMMARY START 날짜:20260924 : 판단 요약에서 급여에 맞지 않는 지표와 미확인 자료의 단정 표시를 방지 */
import assert from 'node:assert/strict';
import '../care-decision-summary.js';
const { render, review, renderReview } = globalThis.CareDecisionSummary;
const base = { g: 'A', ey: 2023, z: 49, cw: 9, rn: 2, na: 1, d: '2019-09-03' };
const daycare = render(base, 'daycare');
assert.match(daycare, /A등급/);
assert.match(daycare, /2023년 평가/);
assert.match(daycare, /등록 정원/);
assert.doesNotMatch(daycare, /잔여 자리가 아닙니다/); // SOFTM-DECISION-NOTE 날짜:20261012 : 상세 상단에서 정원 주의 문구를 제거한 상태를 검증
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

/** SOFTM-DETAIL-REVIEW START 날짜:20261118 : 공개 강점·기관 확인·실제 누락을 오해 없이 분류하는지 검증 */
const reviewed = review(base, 'daycare');
assert.match(JSON.stringify(reviewed.confirmed), /A등급/);
assert.match(JSON.stringify(reviewed.confirmed), /간호사 2명|물리·작업치료사/);
assert.doesNotMatch(JSON.stringify(reviewed.confirmed), /충분|추천|이용 가능|자리 있음|보장/);
assert.match(JSON.stringify(reviewed.verify), /송영/);
assert.doesNotMatch(JSON.stringify(reviewed.confirmed), /등록 정원/);
assert.equal(review({ ...base, g: 'C' }, 'daycare').confirmed.some(item => item.label === '공단 평가'), false);
assert.match(JSON.stringify(review({ ...base, ey: null }, 'daycare').unknown), /평가연도/);
assert.match(JSON.stringify(review({ ...base, staffMissing: true }, 'daycare').unknown), /요양보호사/);
assert.doesNotMatch(JSON.stringify(review({ ...base, cw: 0, rn: 0, pt: 0, ot: 0 }, 'home-care').unknown), /요양보호사/);
assert.doesNotMatch(JSON.stringify(review({ ...base, t: 'B03,C01' }, 'daycare').confirmed), /등록 인력/);
assert.match(JSON.stringify(review({ ...base, t: 'B03,C01' }, 'daycare').verify), /급여별 인력/);
assert.doesNotMatch(JSON.stringify((({ confirmed, unknown }) => ({ confirmed, unknown }))(review(base, 'welfare-equipment'))), /등록 정원|등록 인력|요양보호사/);
assert.doesNotMatch(JSON.stringify((({ confirmed, unknown }) => ({ confirmed, unknown }))(review(base, 'nursing-hospital'))), /공단 평가|등록 정원|요양보호사/);
assert.match(review(base, 'welfare-equipment').note, /현재 품목 재고/);
assert.match(review(base, 'nursing-hospital').note, /현재 입원 가능 여부/);
assert.match(review(base, 'home-care').note, /실제 배정 가능한 인력/);
assert.match(JSON.stringify(review({ ...base, d: '' }, 'nursing-hospital').unknown), /개설일/);
for (const type of ['facility', 'daycare', 'short-stay', 'dementia', 'home-care', 'home-bath', 'home-nursing', 'welfare-equipment', 'nursing-hospital']) {
    assert.ok(review(base, type).verify.length >= 2, `${type}: 기관 확인 질문 제공`);
}
const reviewHtml = renderReview({ ...base, n: '<img>' }, 'daycare', { source: '<script>', sourceDate: '<2026>' });
for (const title of ['확인된 강점', '기관 확인 필요', '미확인']) assert.equal((reviewHtml.match(new RegExp(`<dt>${title}</dt>`, 'g')) || []).length, 1);
assert.doesNotMatch(reviewHtml, /<script>|<2026>/);
assert.match(reviewHtml, /&lt;script&gt;.*&lt;2026&gt;/s);
console.log('care-decision-summary: 상세 선택 확인 요약 검증 통과');
/** SOFTM-DETAIL-REVIEW END */

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
