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
  /** SOFTM-AD-IDS START 날짜:20260925 : AdFit 관리 화면에서 확인한 통합 지도 전용 단위를 실제 노출 위치에 연결 */
  kakao: {
    script: 'https://t1.daumcdn.net/kas/static/ba.min.js',
    desktop: {
      unit: 'DAN-Nl4JIjiK6awUoGyC',
      width: 728,
      height: 90
    },
    mobile: {
      unit: 'DAN-yRxnKVmJVHCCSGTw',
      width: 320,
      height: 100
    },
    listUnits: [
      { unit: 'DAN-57vDaXi3Kup3n4HQ', width: 320, height: 100 }
    ],
    /** SOFTM-AD-EXPANSION START 날짜:20260926 : 위치별 발급 단위를 재사용하지 않아 광고 수익을 분리 집계 */
    welcome: { mobile: { unit: 'DAN-SyVDAgtVMBjcCQ17', width: 320, height: 100 } },
    listTop: {
      desktop: { unit: 'DAN-lKa6CMgGkWgFxfAk', width: 728, height: 90 },
      mobile: { unit: 'DAN-AIFs0ju8mxAVNfZY', width: 320, height: 100 }
    },
    listPositions: {
      12: { desktop: { unit: 'DAN-k3POD1TfIZJZ5c4U', width: 728, height: 90 }, mobile: { unit: 'DAN-bF5K4pIdZxsus3qZ', width: 320, height: 100 } },
      18: { desktop: { unit: 'DAN-COZ9JNKLUJRpUk0g', width: 728, height: 90 }, mobile: { unit: 'DAN-r5MyEeCv1YddRkib', width: 320, height: 100 } },
      24: { desktop: { unit: 'DAN-booaMB0yD61U26kz', width: 728, height: 90 }, mobile: { unit: 'DAN-W9haKZ2SKZEBxO4A', width: 320, height: 100 } }
    },
    compare: {
      desktop: { unit: 'DAN-goDJUjfP5E9hjnWX', width: 728, height: 90 },
      mobile: { unit: 'DAN-kj9FFJNTBu6m2m7Y', width: 320, height: 100 }
    },
    route: {
      desktop: { unit: 'DAN-KkESBTehog2OA2S1', width: 728, height: 90 },
      mobile: { unit: 'DAN-JUgio3Vi8nZUE9yZ', width: 320, height: 100 }
    },
    regional: {
      desktop: { unit: 'DAN-zbA77hQsDTg7RE4P', width: 728, height: 90 },
      mobile: { unit: 'DAN-jH4H4pIxgcFJ3J66', width: 320, height: 100 }
    }
    /** SOFTM-AD-EXPANSION END */
  },
  /** SOFTM-AD-IDS END */
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
        action: 'partner-inquiry', // SOFTM-PARTNER-CTA 날짜:20260904 : 지도 안에서 Web3Forms 제휴 문의를 접수
        url: 'mailto:softm@nate.com?subject=%EC%A0%84%EA%B5%AD%20%EC%9A%94%EC%96%91%EA%B8%B0%EA%B4%80%EC%B0%BE%EA%B8%B0%20%EA%B4%91%EA%B3%A0%C2%B7%EC%A0%9C%ED%9C%B4%20%EB%AC%B8%EC%9D%98'
      }
    ]
  },
  operator: {
    queryKey: 'ad-settings',
    storageKey: 'care-services-map-ad-overrides-v1'
  }
};
