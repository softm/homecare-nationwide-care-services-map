/** SOFTM-CARE-COST-RATES START 날짜:20260904 : 기관 검색자료와 분리한 공식 수가표로 적용 연도와 근거를 추적 */
(function (root) {
  'use strict';
  root.CareCostRates = {
    year: 2026,
    effectiveFrom: '2026-01-01',
    verifiedAt: '2026-09-04',
    notice: '보건복지부 고시 제2025-247호',
    source: 'https://www.nhis.or.kr/lm/lmxsrv/law/lawFullContent.do?SEQ=1637&SEQ_HISTORY=594054',
    legalSource: 'https://law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000271110&chrClsCd=010201',
    burdenSource: 'https://www.mohw.go.kr/menu.es?mid=a10712030100',
    monthlyCaps: { '1': 2512900, '2': 2331200, '3': 1528200, '4': 1409700, '5': 1208900, cognitive: 676320 },
    copayPercent: {
      facility: { general: 20, reduced40: 12, reduced60: 8, exempt: 0 },
      home: { general: 15, reduced40: 9, reduced60: 6, exempt: 0 }
    },
    facility: {
      nursing: { low: [88520, 82120, 77540], high: [93070, 86340, 81540] },
      group: { low: [74590, 69210, 63800], high: [74590, 69210, 63800] }
    },
    daycare: {
      '3-6': [41820, 38720, 35740, 34120, 32490, 32490],
      '6-8': [56060, 51930, 47940, 46300, 44650, 44650],
      '8-10': [69730, 64590, 59640, 58010, 56360, 56360],
      '10-13': [76820, 71160, 65750, 64090, 62460, 56360],
      '13-plus': [82370, 76310, 70500, 68860, 67240, 56360]
    },
    homeCare: { 30: 17450, 60: 25320, 90: 34120, 120: 43430, 150: 50640, 180: 57020, 210: 63530, 240: 70080 },
    daycareExtension: { minimumDays: 15, bands: ['8-10', '10-13', '13-plus'], percent: { '1': 10, '2': 10, '3': 20, '4': 20, '5': 20, cognitive: 0 } }
  };
})(typeof window !== 'undefined' ? window : globalThis);
/** SOFTM-CARE-COST-RATES END */
