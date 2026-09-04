/** SOFTM-CARE-COST-TEST START 날짜:20260904 : 공식 수가의 독립 산식과 한도·자격·비급여 경계를 고정해 잘못된 예산 표시를 방지 */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../care-cost-rates.js';
import '../care-cost-engine.js';
const rates = globalThis.CareCostRates;
const { calculate, normalizeNonCovered, nonCoveredTotal } = globalThis.CareCostEngine;
const facility = { service: 'facility', grade: '3', facilityEligible: true, quantity: 30, burden: 'general' };
const daycare = { service: 'daycare', grade: '3', quantity: 22, daycareBand: '8-10', burden: 'general' };
const home = { service: 'home-care', grade: '3', quantity: 22, minutes: 180, burden: 'general' };
test('복수 급여기관과 저장된 시설유형이 항상 같은 급여·비급여 코드를 선택', () => {
  const resolve = globalThis.CareCostEngine.resolveInstitutionContext;
  for (const [serviceCodes, facilityKind, expected] of [[['A03','A04'],'group','A04'],[['A03','A04'],'nursing','A03'],[['A04'],'nursing','A04'],[['A03'],'group','A03']]) {
    const result = resolve({ service: 'facility', serviceCodes, facilityKind });
    assert.equal(result.serviceCode, expected);
    assert.equal(result.facilityKind, expected === 'A04' ? 'group' : 'nursing');
  }
  assert.deepEqual(resolve({ service: 'daycare', serviceCodes: ['B03','B01'] }).availableCodes, ['B03']);
  assert.equal(resolve({ service: 'daycare', serviceCodes: ['H31'] }).availableCodes.length, 0);
});
test('제44조 30일 시설 예산: 실제 배치 미확인은 두 공식 수가 범위', () => {
  const result = calculate(facility);
  assert.equal(result.low.total, 465240);
  assert.equal(result.high.total, 489240);
  assert.equal(result.isRange, true);
  assert.equal(result.cap, null);
  assert.equal(calculate({ ...facility, facilityKind: 'group' }).low.total, 382800);
});
test('공식 수가×이용량의 독립 예제와 일반·40%감경·60%감경·면제', () => {
  for (const [burden, facilityPercent, homePercent] of [['general',20,15],['reduced40',12,9],['reduced60',8,6],['exempt',0,0]]) {
    assert.equal(calculate({ ...facility, burden }).high.total, Math.round(81540 * 30 * facilityPercent / 100));
    assert.equal(calculate({ ...daycare, burden }).low.total, Math.round(59640 * 22 * homePercent / 100));
    assert.equal(calculate({ ...home, burden }).low.total, Math.round(57020 * 22 * homePercent / 100));
  }
});
test('재가 월 한도 바로 아래·정확한 경계·바로 위, 면제라도 초과분 전액', () => {
  const adjusted = { ...rates, monthlyCaps: { ...rates.monthlyCaps, '3': 57020 * 22 } };
  const equal = calculate(home, adjusted);
  assert.equal(equal.low.excess, 0);
  assert.equal(equal.low.covered, 1254440);
  assert.equal(calculate(home, { ...adjusted, monthlyCaps: { '3': 1254439 } }).low.excess, 1);
  assert.equal(calculate(home, { ...adjusted, monthlyCaps: { '3': 1254441 } }).low.excess, 0);
  const excess = calculate({ ...home, grade: '4', quantity: 31, burden: 'exempt' });
  assert.equal(excess.low.copay, 0);
  assert.equal(excess.low.total, 357920);
});
test('제13조 주야간 15일·8시간 경계와 1~2등급10%,3~5등급20%,인지지원 추가 없음', () => {
  assert.equal(calculate({ ...daycare, quantity: 14 }).extensionPercent, 0);
  assert.equal(calculate({ ...daycare, quantity: 15 }).cap, 1833840);
  assert.equal(calculate({ ...daycare, quantity: 15, daycareBand: '6-8' }).extensionPercent, 0);
  assert.equal(calculate({ ...daycare, grade: '1' }).cap, 2764190);
  assert.equal(calculate({ ...daycare, grade: '2' }).cap, 2564320);
  assert.equal(calculate({ ...daycare, grade: '5' }).cap, 1450680);
  assert.equal(calculate({ ...daycare, grade: 'cognitive' }).cap, 676320);
  assert.equal(calculate({ ...daycare, grade: 'cognitive' }).low.excess, 563600);
});
test('등급 미확인·시설 자격·인지지원·5등급 인지활동형 조건', () => {
  assert.equal(calculate({ ...home, grade: '' }).status, 'grade-required');
  assert.equal(calculate({ ...facility, facilityEligible: false }).status, 'eligibility-required');
  assert.equal(calculate({ ...home, grade: 'cognitive' }).status, 'ineligible');
  assert.equal(calculate({ ...facility, grade: 'cognitive' }).status, 'ineligible');
  assert.equal(calculate({ ...home, grade: '5', minutes: 90 }).status, 'invalid');
  assert.equal(calculate({ ...home, grade: '5', minutes: 120 }).status, 'ok');
  assert.match(calculate({ ...home, grade: '5' }).notes.join(' '), /인지자극활동 60분/);
  assert.equal(calculate({ ...home, minutes: 240 }).status, 'invalid');
  assert.equal(calculate({ ...home, grade: '1', minutes: 240 }).status, 'ok');
});
test('특례·다중서비스·요양병원은 일반 계산에 섞이지 않는다', () => {
  for (const key of ['specialCare','familyCare','combinedServices','nightHoliday']) assert.equal(calculate({ ...daycare, [key]: true }).status, 'unsupported');
  assert.equal(calculate({ ...facility, service: 'nursing-hospital' }).status, 'unsupported');
  for (const quantity of [0, -1, 32, 22.5, NaN, Infinity]) assert.equal(calculate({ ...home, quantity }).status, 'invalid');
});
test('비급여 중복은 한 번, 미공개·단위 미확인·선택하지 않은 비용은 합산하지 않는다', () => {
  const food = { kind: '1', basis: '1식 4,100원', amount: 4100, updatedDate: '2026-08-20' };
  const normalized = normalizeNonCovered([food, food, { ...food, amount: null }]);
  assert.equal(normalized.length, 2);
  const selected = { ...food, selected: true, confirmed: true, unit: 'meal', quantity: 90 };
  assert.equal(nonCoveredTotal([selected, selected]).total, 369000);
  assert.equal(nonCoveredTotal([{ ...selected, selected: false }]).total, 0);
  for (const invalid of [{ unit: '' }, { amount: null }, { confirmed: false }, { quantity: -1 }]) {
    const result = nonCoveredTotal([{ ...selected, ...invalid }]);
    assert.equal(result.total, 0);
    assert.equal(result.unknown.length, 1);
  }
  assert.equal(nonCoveredTotal([{ ...selected, unit: 'day', quantity: 30 }]).total, 123000);
});
test('상급침실의 서로 다른 요금은 별도 확인 전 합산에서 제외', () => {
  const room = { kind: '2', basis: '상급침실', amount: 5000, selected: true, confirmed: true, unit: 'day', quantity: 30 };
  assert.equal(nonCoveredTotal([room, { ...room, amount: 10000 }]).total, 0);
  assert.equal(nonCoveredTotal([room, { ...room, amount: 10000 }], true).total, 450000);
  const result = calculate({ ...facility, burden: 'exempt', nonCovered: [room] });
  assert.equal(result.low.total, 150000);
});
/** SOFTM-CARE-COST-TEST END */
