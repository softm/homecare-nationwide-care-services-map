/** SOFTM-CARE-COST-ENGINE START 날짜:20260904 : 화면과 계산을 분리해 급여 조건·한도 초과·비급여 누락을 독립 검증 */
(function (root) {
  'use strict';
  const units = ['meal', 'day', 'month', 'visit'];
  const validMoney = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const fingerprint = row => JSON.stringify([String(row.kind || ''), String(row.basis || '').trim(), row.amount]);
  function resolveInstitutionContext({ service, facilityKind = 'nursing', serviceCodes = [] }) {
    const supported = { facility: ['A01', 'A02', 'A03', 'A04', 'A05'], daycare: ['B03', 'C03'], 'home-care': ['B01', 'C01'] };
    const codes = (Array.isArray(serviceCodes) ? serviceCodes : String(serviceCodes).split(',')).map(code => String(code).trim().toUpperCase());
    const availableCodes = [...new Set(codes)].filter(code => supported[service]?.includes(code));
    const serviceCode = (service === 'facility' && availableCodes.find(code => (code === 'A04') === (facilityKind === 'group'))) || availableCodes[0] || '';
    return { availableCodes, serviceCode, facilityKind: service === 'facility' ? serviceCode === 'A04' ? 'group' : 'nursing' : facilityKind };
  }
  function normalizeNonCovered(rows) {
    const records = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const key = fingerprint(row);
      const normalized = { key, kind: String(row.kind || ''), basis: String(row.basis || '').trim(), amount: validMoney(row.amount) ? row.amount : null, updatedDate: String(row.updatedDate || '') };
      if (!records.has(key) || normalized.updatedDate > records.get(key).updatedDate) records.set(key, normalized);
    }
    return [...records.values()];
  }
  function nonCoveredTotal(rows, alternativesConfirmed) {
    let total = 0;
    const confirmedRows = [];
    const unknown = [], seen = new Set(), kinds = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row.selected) continue;
      const key = fingerprint(row);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!validMoney(row.amount) || !units.includes(row.unit) || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 999 || !row.confirmed) {
        unknown.push(row.basis || '금액·단위 확인이 필요한 항목');
        continue;
      }
      if (row.kind) kinds.set(row.kind, (kinds.get(row.kind) || 0) + 1);
      confirmedRows.push(row);
    }
    if ([...kinds.values()].some(count => count > 1) && !alternativesConfirmed) unknown.push('같은 종류의 복수 요금: 서로 다른 적용 항목인지 확인해 주세요.');
    for (const row of confirmedRows) if (alternativesConfirmed || !row.kind || kinds.get(row.kind) === 1) total += row.amount * row.quantity;
    return { total, unknown };
  }
  function calculate(input, rates = root.CareCostRates) {
    const issues = [], notes = [];
    const { service, grade, burden = 'general', facilityKind = 'nursing' } = input;
    const base = { year: rates.year, effectiveFrom: rates.effectiveFrom, source: rates.source, issues, notes, unknown: [] };
    if (!['facility', 'daycare', 'home-care'].includes(service)) return { ...base, status: 'unsupported', issues: ['이 계산은 요양원·공동생활가정, 주야간보호, 방문요양을 지원합니다.'] };
    if (!Object.hasOwn(rates.monthlyCaps, grade)) return { ...base, status: 'grade-required', issues: ['이용자의 장기요양등급을 확인하거나 명시적인 예시를 선택해 주세요.'] };
    if (input.specialCare || input.familyCare || input.combinedServices || input.nightHoliday) return { ...base, status: 'unsupported', issues: ['치매전담 수가·가족요양·복수 서비스·야간 및 휴일 가산은 기관에서 별도 계산이 필요합니다.'] };
    if (grade === 'cognitive' && service !== 'daycare') return { ...base, status: 'ineligible', issues: ['인지지원등급은 이 계산의 시설급여·일반 방문요양을 이용할 수 없습니다. 주야간보호를 선택해 주세요.'] };
    if (service === 'facility' && Number(grade) >= 3 && !input.facilityEligible) return { ...base, status: 'eligibility-required', issues: ['3~5등급의 시설 이용은 장기요양인정서에 시설급여가 포함된 경우에 가능합니다.'] };
    const percent = rates.copayPercent[service === 'facility' ? 'facility' : 'home'][burden];
    if (!Number.isFinite(percent)) issues.push('본인부담 유형을 확인해 주세요.');
    const quantity = input.quantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 31) issues.push('이용량은 한 달 1~31일(방문요양은 1일 1회)로 입력해 주세요.');
    let unitLow, unitHigh, extensionPercent = 0, cap = null;
    if (service === 'facility') {
      const table = rates.facility[facilityKind], index = Math.min(Number(grade), 3) - 1;
      if (!table) issues.push('시설 유형을 선택해 주세요.');
      else { unitLow = table.low[index]; unitHigh = table.high[index]; }
      if (facilityKind === 'nursing') notes.push('요양보호사 배치에 따른 제44조 두 수가의 범위입니다. 실제 적용 수가는 기관에 확인해 주세요.');
    } else if (service === 'daycare') {
      const table = rates.daycare[input.daycareBand];
      const index = grade === 'cognitive' ? 5 : Number(grade) - 1;
      if (!table) issues.push('하루 이용시간을 선택해 주세요.');
      else unitLow = unitHigh = table[index];
      if (quantity >= rates.daycareExtension.minimumDays && rates.daycareExtension.bands.includes(input.daycareBand)) extensionPercent = rates.daycareExtension.percent[grade];
      cap = Math.round(rates.monthlyCaps[grade] * (100 + extensionPercent) / 100);
      if (['5', 'cognitive'].includes(grade)) notes.push('5등급·인지지원등급은 인지활동형 프로그램 제공 조건을 기관과 확인해 주세요.');
    } else {
      const minutes = Number(input.minutes);
      if (!Object.hasOwn(rates.homeCare, minutes)) issues.push('회당 이용시간을 선택해 주세요.');
      else unitLow = unitHigh = rates.homeCare[minutes];
      if (Number(grade) >= 3 && minutes > 180) issues.push('3~5등급의 일반 계산은 회당 180분까지 지원합니다. 장시간 이용의 별도 조건은 기관에 확인해 주세요.');
      if (grade === '5' && ![120, 150, 180].includes(minutes)) issues.push('5등급 인지활동형 방문요양은 120~180분을 선택해 주세요.');
      if (grade === '5') notes.push('5등급은 인지활동형 방문요양(인지자극활동 60분 포함), 1일 1회 제공 조건입니다. 일반 방문요양 예산으로 보지 마세요.');
      cap = rates.monthlyCaps[grade];
    }
    if (issues.length) return { ...base, status: 'invalid' };
    const extras = nonCoveredTotal(input.nonCovered, input.alternativesConfirmed);
    const amount = unitRate => {
      const benefitTotal = unitRate * quantity;
      const covered = cap === null ? benefitTotal : Math.min(benefitTotal, cap);
      const excess = cap === null ? 0 : Math.max(0, benefitTotal - cap);
      const copay = Math.round(covered * percent / 100);
      return { unitRate, benefitTotal, covered, copay, excess, nonCovered: extras.total, total: copay + excess + extras.total };
    };
    return { ...base, status: extras.unknown.length ? 'needs-confirmation' : 'ok', unknown: extras.unknown, percent, cap, baseCap: service === 'facility' ? null : rates.monthlyCaps[grade], extensionPercent, low: amount(unitLow), high: amount(unitHigh), isRange: unitLow !== unitHigh };
  }
  root.CareCostEngine = { calculate, normalizeNonCovered, nonCoveredTotal, resolveInstitutionContext };
})(typeof window !== 'undefined' ? window : globalThis);
/** SOFTM-CARE-COST-ENGINE END */
