/**
 * 전국 요양기관찾기 광고 운영 설정
 *
 * PC·모바일 상단 배너와 목록 중간 배너를 각각 전용 광고단위로 사용합니다.
 * 광고가 일시적으로 채워지지 않으면 직접 제휴 안내로 대체합니다.
 */
window.CARE_AD_CONFIG = {
  enabled: true,
  mode: 'hybrid',
  fallbackToDirect: true,
  placements: {
    banner: true,
    listNative: true,
    listAfter: 6,
    listRepeat: 6
  },
  kakao: {
    script: 'https://t1.daumcdn.net/kas/static/ba.min.js',
    desktop: {
      unit: 'DAN-2wkGTRT6hBm8AoE1',
      width: 728,
      height: 90
    },
    mobile: {
      unit: 'DAN-IH5HmaPdVapZYF0x',
      width: 320,
      height: 100
    },
    listUnits: [
      {
        unit: 'DAN-FQMjWsPJLpaM7tdG',
        width: 320,
        height: 100
      }
    ]
  },
  direct: {
    disclosure: '기관 검색순위와 공단평가에는 영향을 주지 않는 별도 광고입니다.',
    items: [
      {
        id: 'care-partner-recruit',
        active: true,
        label: '광고·제휴',
        eyebrow: '요양·돌봄 서비스 사업자',
        title: '요양기관을 찾는 이용자에게 서비스를 알리세요',
        description: '요양시설, 주야간보호, 방문요양, 복지용구와 돌봄 서비스의 지역별 제휴 광고를 모집합니다.',
        cta: '제휴 문의',
        url: 'mailto:softm@nate.com?subject=%EC%A0%84%EA%B5%AD%20%EC%9A%94%EC%96%91%EA%B8%B0%EA%B4%80%EC%B0%BE%EA%B8%B0%20%EA%B4%91%EA%B3%A0%C2%B7%EC%A0%9C%ED%9C%B4%20%EB%AC%B8%EC%9D%98'
      }
    ]
  },
  operator: {
    queryKey: 'ad-settings',
    storageKey: 'care-services-map-ad-overrides-v1'
  }
};
