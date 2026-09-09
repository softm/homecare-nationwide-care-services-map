/** SOFTM-CARE-INSIGHTS START 날짜:20260910 : 누락 자료·서로 다른 평가연도·급여와 병원 자료가 잘못된 선택 근거로 표시되지 않도록 회귀검사 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, render } from '../care-insights.js';
const a = { i: '1', n: '가센터', a: '서울', t: 'B03', z: 30, g: 'A', ey: 2023, es: 91, rn: 1, na: 0, pt: 1, ot: 0, cw: 5 };
const b = { ...a, i: '2', n: '나센터', z: 50, g: 'B', ey: 2024 };
test('빈 비교함과 단일 기관은 비교 순위를 만들지 않는다', () => {
    assert.equal(analyze([]).cards.length, 0);
    assert.match(analyze([a]).summary.join(' '), /1곳의 공개정보/);
});
test('기관을 중복 제거하고 담은 순서를 보존하며 입력을 변경하지 않는다', () => {
    const input = [b, a, b]; const before = JSON.stringify(input);
    assert.deepEqual(analyze(input).cards.map(c => c.id), ['2', '1']);
    assert.equal(JSON.stringify(input), before);
});
test('서로 다른 평가연도는 순위 없이 안내하고 같은 급여의 정원 범위만 설명한다', () => {
    const summary = analyze([a,b]).summary.join(' ');
    assert.match(summary, /2023·2024/); assert.match(summary, /30~50명/);
    assert.match(summary, /현재 이용 가능한 자리/);
    assert.doesNotMatch(analyze([a,{...b,t:'H31'}]).summary.join(' '), /30~50명/);
});
test('미확인 평가를 저평가로 처리하지 않으며 null 인원을 0명으로 만들지 않는다', () => {
    const report = analyze([{i:'3',n:'미확인',rn:null,na:'',pt:NaN}]);
    assert.match(report.summary.join(' '), /미확인은 낮은 평가를 뜻하지 않습니다/);
    assert.match(report.cards[0].facts.join(' '), /인력: 미확인/);
    assert.doesNotMatch(report.cards[0].facts.join(' '), /0명/);
});
test('일부 인력 누락은 합계를 설명하지 않으며 실제 프로그램을 단정하지 않는다', () => {
    const card = analyze([{...a,staffMissing:true}]).cards[0];
    assert.match(card.facts.join(' '), /인원 비교에서 제외/);
    assert.doesNotMatch(card.facts.join(' '), /간호사 1명/);
    assert.match(analyze([a]).cards[0].questions.join(' '), /실제 이용 가능한 시간/);
});
test('병원에는 공단평가·요양 인력·정원을 적용하지 않고 복지용구도 인력·정원을 제외한다', () => {
    const hospital = analyze([a],{type:'nursing-hospital'});
    assert.equal(hospital.source,'심평원 개설현황');
    assert.doesNotMatch(hospital.cards[0].facts.join(' '), /공단 평가|공개 정원|공개 인력/);
    assert.doesNotMatch(analyze([a],{type:'welfare-equipment'}).cards[0].facts.join(' '), /공개 정원|공개 인력/);
});
test('기관명·주소·기관기호를 HTML로 실행하지 않고 자료 기준일을 표시한다', () => {
    const html = render([{...a,i:'" onclick="alert(1)',n:'<img src=x onerror=alert(1)>',a:'<script>x</script>'}],{sourceDate:'2026-09-08'});
    assert.doesNotMatch(html, /<img|<script|data-saved-detail="" onclick/);
    assert.match(html, /&lt;img/); assert.match(html, /2026-09-08/);
});
test('인력 차이는 같은 급여의 확인 자료에서만 설명하고 누락·복수 급여를 구분한다', () => {
    assert.match(analyze([a,{...b,rn:0}]).summary.join(' '), /간호사가 1명 이상 기록된 곳은 가센터/);
    assert.doesNotMatch(analyze([a,{...b,rn:0,staffMissing:true}]).summary.join(' '), /간호사가 1명 이상/);
    assert.match(analyze([{...a,t:'B03,H31'}]).cards[0].facts.join(' '), /같은 직원이 중복/);
});
/** SOFTM-CARE-INSIGHTS END */
