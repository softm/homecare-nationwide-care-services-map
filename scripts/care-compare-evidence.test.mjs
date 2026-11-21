/** SOFTM-COMPARE-EVIDENCE START 날짜:20261118 : 출처·평가연도 불일치가 점수 순위로 다시 노출되지 않도록 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../care-compare-evidence.js';
import '../care-comparison-workspace.js'; // SOFTM-GUIDED-COMPARE 날짜:20261119 : 공통 세 곳 비교 모델의 선택 한도와 유형별 지표를 함께 회귀검사

const { build, render } = globalThis.CareCompareEvidence;
const row = (i, year, grade = 'A', score = 90) => ({ i, n: `${i}기관`, ey: year, g: grade, es: score });
const indexHtml=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const mapExperience=readFileSync(new URL('../map-experience.js',import.meta.url),'utf8');
const analysisHtml=readFileSync(new URL('../care-analysis.html',import.meta.url),'utf8');
const analysisJs=readFileSync(new URL('../care-analysis.js',import.meta.url),'utf8');

test('같은 평가연도 두 곳만 등급·총점 정렬을 허용한다', () => {
    const policy = build([row('1', 2025), row('2', 2025, 'B', 85)], { source: 'nhis', sourceDate: '2026-11-18' });
    assert.equal(policy.canRankEvaluation, true);
    assert.deepEqual(policy.defaultSort, { key: 'score', dir: 'desc' });
    assert.equal(policy.allowsSort('score'), true);
    assert.match(policy.message, /2025년 평가/);
});

test('혼합 평가연도는 점수·등급 정렬을 막고 기관명순으로 시작한다', () => {
    const policy = build([row('1', 2023), row('2', 2024)], { source: 'nhis' });
    assert.equal(policy.mixedYears, true);
    assert.equal(policy.canRankEvaluation, false);
    assert.equal(policy.allowsSort('score'), false);
    assert.equal(policy.allowsSort('grade'), false);
    assert.equal(policy.allowsSort('year'), true);
    assert.deepEqual(policy.defaultSort, { key: 'name', dir: 'asc' });
    assert.match(policy.message, /2023년·2024년/);
});

test('평가값은 있으나 연도가 누락된 기관을 순위에서 제외한다', () => {
    const policy = build([row('1', 2025), row('2', null, 'B', 82)], { source: 'nhis' });
    assert.equal(policy.missingYearCount, 1);
    assert.equal(policy.canRankEvaluation, false);
    assert.match(policy.message, /1곳.*평가연도/);
});

test('미평가·미확인은 낮은 점수로 만들지 않는다', () => {
    const policy = build([{ i: '1', g: '', es: null }, { i: '2', g: 'N' }], { source: 'nhis' });
    assert.equal(policy.evaluatedCount, 0);
    assert.equal(policy.canRankEvaluation, false);
    assert.match(policy.message, /낮은 평가를 뜻하지 않습니다/);
});

test('심평원 자료는 공단 평가 순위를 만들지 않고 출처를 구분한다', () => {
    const policy = build([row('1', 2025), row('2', 2025)], { source: 'hira', sourceDate: '2026-10-01' });
    assert.equal(policy.canRankEvaluation, false);
    assert.match(policy.sourceLabel, /건강보험심사평가원/);
    assert.doesNotMatch(policy.sourceLabel, /국민건강보험공단/);
    assert.match(policy.message, /다른 의료기관 자료/);
});

test('검색자료 기준일을 그대로 표시하고 입력을 변경하지 않는다', () => {
    const rows = [row('1', 2025), row('2', 2025)];
    const before = structuredClone(rows);
    const policy = build(rows, { sourceDate: '<2026-11-18>' });
    assert.deepEqual(rows, before);
    assert.equal(policy.sourceDate, '<2026-11-18>');
    assert.match(render(policy), /&lt;2026-11-18&gt;/);
    assert.doesNotMatch(render(policy), /<2026-11-18>/);
});

test('실제 비교표·엑셀·상세 화면이 공통 근거 정책을 사용한다',()=>{
    assert.match(indexHtml,/id="compareEvidence"[^>]+role="note"/);
    assert.match(indexHtml,/compareSort=\{\.\.\.compareEvidencePolicy\(\)\.defaultSort\}/);
    assert.match(indexHtml,/policy\.allowsSort\(key\)/);
    assert.match(indexHtml,/TYPE!=='nursing-hospital'\|\|!\['grade','score','year','confidence'\]/);
    assert.match(indexHtml,/book_append_sheet\(wb,info,'비교 안내'\)/);
    assert.match(indexHtml,/CareDecisionSummary\.renderReview\(c,TYPE/);
    assert.match(indexHtml,/care-compare-evidence\.js\?v=20261118-policy1/);
    assert.match(mapExperience,/CareCompareEvidence\.build\(selected/);
    assert.match(mapExperience,/evaluationColumns\.has\(next\)&&!policy\.canRankEvaluation/);
});

/** SOFTM-GUIDED-COMPARE START 날짜:20261119 : 후보 보관과 세 곳 비교를 분리하고 미확인 실시간 정보를 추정하지 않는지 검증 */
test('보관 후보는 여러 곳이어도 실제 비교 선택은 세 곳으로 제한한다',()=>{
    const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
    const selection=globalThis.CareComparisonWorkspace.createSelection(storage,'daycare',3);
    assert.deepEqual(selection.sync(['1','2','3','4']),['1','2','3']);
    assert.equal(selection.toggle('4',['1','2','3','4']).reason,'limit');
    assert.equal(selection.toggle('2',['1','2','3','4']).changed,true);
    assert.deepEqual(selection.toggle('4',['1','2','3','4']).ids,['1','3','4']);
    assert.deepEqual(selection.sync(['3','4'],false),['3','4']);
});

test('유형별 비교 지표는 병원 평가와 복지용구 시설 인력을 만들지 않는다',()=>{
    const hospital=globalThis.CareComparisonWorkspace.metricsFor('nursing-hospital','hira').map(item=>item.key);
    const equipment=globalThis.CareComparisonWorkspace.metricsFor('welfare-equipment','nhis').map(item=>item.key);
    assert.equal(hospital.includes('evaluation'),false);assert.equal(hospital.includes('caregiver'),false);
    assert.equal(equipment.includes('nursing'),false);assert.equal(equipment.includes('capacity'),false);
    assert.equal(equipment.includes('availability'),true);
});

test('비교 화면은 빈자리를 기관 확인으로 남기고 비용 조건 입력을 안내하며 HTML을 실행하지 않는다',()=>{
    const html=globalThis.CareComparisonWorkspace.render({type:'daycare',source:'nhis',sourceDate:'2026-11-19',allRows:[{i:'1',n:'<img>',a:'주소'}],activeIds:['1'],rows:[{i:'1',n:'<img>',a:'주소'},{i:'2',n:'둘',a:'주소'}]});
    assert.match(html,/기관 확인 필요/);assert.match(html,/월 예상 본인부담금/);assert.match(html,/장기요양등급·이용량에 따른 예상액/); // SOFTM-PERSONAL-COST 날짜:20261121 : 미확인 값 안내와 개인 조건 계산의 역할 구분
    assert.match(html,/&lt;img&gt;/);assert.doesNotMatch(html,/<img>/);
    assert.ok(html.indexOf('data-compare-metric="distance"') < html.indexOf('data-service-facts-key="schedule"'));
    assert.ok(html.indexOf('data-compare-metric="designated"') < html.indexOf('data-compare-metric="cost"')); // SOFTM-COMPARE-CORE-FIRST 날짜:20261122 : 거리·평가·정원·인력·지정일을 운영정보와 비용보다 먼저 표시
});

test('간호 인력 두 항목이 모두 비어 있으면 0명으로 추정하지 않는다',()=>{
    const metric=globalThis.CareComparisonWorkspace.metricsFor('daycare').find(item=>item.key==='nursing');
    const result=globalThis.CareComparisonWorkspace.metricValue({rn:null,na:undefined},metric,{type:'daycare',source:'nhis'});
    assert.equal(result.value,'미확인');assert.match(result.note,/현재 배치 확인/);
}); // SOFTM-STAFF-UNKNOWN 날짜:20261120 : 누락 인력을 실제 0명으로 표시하는 회귀 방지

test('맞춤분석은 네 단계와 세 곳 비교·세션 상담 준비를 제공한다',()=>{
    assert.match(analysisHtml,/data-analysis-step="conditions"/);assert.match(analysisHtml,/data-analysis-step="candidates"/);assert.match(analysisHtml,/data-analysis-step="compare"/);assert.match(analysisHtml,/data-analysis-step="prepare"/);
    assert.match(analysisJs,/CareComparisonWorkspace\.createSelection\(storage, input\.type, 3\)/);
    assert.match(analysisJs,/careConsultation:v1:/);assert.match(analysisJs,/CareBasketShare\.createUrl/);
    assert.doesNotMatch(analysisJs,/추천\s*[1-9]위/);
    assert.match(indexHtml,/CareComparisonWorkspace\.render/);assert.match(indexHtml,/compareCandidates\.length<2/);
    assert.match(indexHtml,/compareFullOpen=.*\.care-full-compare/); // SOFTM-COMPARE-TABLE-OPEN 날짜:20261120 : 정렬 뒤 전체 표 펼침 상태를 유지하는 회귀 방지
});
/** SOFTM-GUIDED-COMPARE END */
/** SOFTM-COMPARE-EVIDENCE END */
