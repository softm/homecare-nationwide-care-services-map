/** SOFTM-LIST-COST START 날짜:20261118 : 목록에서 공식 수가 기준의 보수적인 월 부담을 즉시 비교하되 확인하지 않은 비급여를 합산하지 않음 */
(function (root) {
  'use strict';
  const assumptions = {
    facility: { grade: '3', burden: 'general', quantity: 30, facilityEligible: true },
    daycare: { grade: '3', burden: 'general', quantity: 22, daycareBand: '8-10' },
    'home-care': { grade: '3', burden: 'general', quantity: 22, minutes: 180 }
  };
  const conditions = {
    facility: '3등급 · 일반 20% · 30일',
    daycare: '3등급 · 일반 15% · 22일 · 하루 8~10시간',
    'home-care': '3등급 · 일반 15% · 월 22회 · 회당 180분'
  };
  const floorManwon = value => Math.max(0, Math.floor(Number(value || 0) / 10000));
  function amountLabel(calculated) {
    const low = floorManwon(calculated.low.total), high = floorManwon(calculated.high.total);
    return calculated.isRange && low !== high ? `${low}만~${high}만원` : `${high}만원`;
  }
  function build(service, row = {}) {
    const input = assumptions[service];
    if (!input || !root.CareCostEngine || !root.CareCostRates) return null;
    let facilityKind = 'nursing';
    if (service === 'facility') {
      const codes = String(row.t || '').split(',').filter(Boolean);
      facilityKind = root.CareCostEngine.resolveInstitutionContext({ service, serviceCodes: codes }).facilityKind;
    }
    const calculated = root.CareCostEngine.calculate({ service, facilityKind, ...input, nonCovered: [] });
    if (!calculated.low || !calculated.high) return null;
    return {
      amount: amountLabel(calculated),
      conditions: conditions[service],
      year: calculated.year,
      note: '급여 본인부담만 · 식비 등 비급여 별도',
      low: calculated.low.total,
      high: calculated.high.total,
      isRange: calculated.isRange
    };
  }
  function render(service, row) {
    const preview = build(service, row);
    if (!preview) return '';
    return `<section class="care-list-cost" aria-label="월 예상 본인부담 ${preview.amount}. ${preview.conditions}. ${preview.note}"><div class="care-list-cost-copy"><span>월 예상 본인부담</span><small>${preview.conditions}</small></div><strong>약 <b>${preview.amount}</b></strong><p>${preview.note}</p></section>`;
  }
  root.CareCostPreview = Object.freeze({ build, render });
})(typeof window !== 'undefined' ? window : globalThis);
/** SOFTM-LIST-COST END */
