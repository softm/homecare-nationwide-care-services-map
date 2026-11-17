/** SOFTM-COMPARE-EVIDENCE START 날짜:20261118 : 출처·평가연도 불일치가 점수 순위로 다시 노출되지 않도록 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../care-compare-evidence.js';

const { build, render } = globalThis.CareCompareEvidence;
const row = (i, year, grade = 'A', score = 90) => ({ i, n: `${i}기관`, ey: year, g: grade, es: score });
const indexHtml=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const mapExperience=readFileSync(new URL('../map-experience.js',import.meta.url),'utf8');

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
/** SOFTM-COMPARE-EVIDENCE END */
