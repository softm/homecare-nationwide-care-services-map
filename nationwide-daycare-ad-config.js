/**
 * 전국 주야간보호센터 지도 광고 운영 설정
 *
 * mode
 * - hybrid: 카카오 AdFit 배너 + 목록 직접광고
 * - kakao: 카카오 AdFit 배너만
 * - direct: 직접광고만
 * - off: 광고 전체 중지
 *
 * 운영자가 브라우저에서 시험하려면 지도 주소 뒤에 ?ad-settings=1 을 붙입니다.
 * 이때 저장한 값은 해당 브라우저에만 적용됩니다. 전체 이용자 기본값은 이 파일을 수정합니다.
 */
window.DAYCARE_AD_CONFIG = {
  enabled: true,
  mode: 'hybrid',
  fallbackToDirect: true,
  placements: {
    banner: true,
    listNative: true,
    listAfter: 6
  },
  kakao: {
    script: 'https://t1.daumcdn.net/kas/static/ba.min.js',
    desktop: {
      unit: 'DAN-fDUWOBpqrfscdNlK',
      width: 728,
      height: 90
    },
    mobile: {
      unit: 'DAN-hgrhcmULAyovFfmV',
      width: 320,
      height: 100
    },
    list: {
      unit: 'DAN-QoNUKnQ9iNLRJxYm',
      width: 320,
      height: 100
    }
  },
  direct: {
    disclosure: '센터 검색순위와 공단평가에는 영향을 주지 않는 별도 광고입니다.',
    items: [
      {
        id: 'partner-recruit',
        active: true,
        label: '광고·제휴',
        eyebrow: '센터·실버케어 사업자',
        title: '부모님 돌봄을 찾는 이용자에게 알리세요',
        description: '주야간보호센터, 복지용구, 이동·식사·간병 서비스의 지역별 제휴 광고를 모집합니다.',
        cta: '제휴 문의',
        url: 'mailto:softm@nate.com?subject=%EC%A0%84%EA%B5%AD%20%EC%A3%BC%EC%95%BC%EA%B0%84%EB%B3%B4%ED%98%B8%EC%84%BC%ED%84%B0%20%EC%A7%80%EB%8F%84%20%EA%B4%91%EA%B3%A0%C2%B7%EC%A0%9C%ED%9C%B4%20%EB%AC%B8%EC%9D%98'
      }
      // 네이버 쇼핑 커넥트·쿠팡 파트너스 등 승인 후 아래 형식으로 추가합니다.
      // { id:'care-supplies', active:true, label:'제휴광고', eyebrow:'복지용구',
      //   title:'광고 제목', description:'광고 설명', cta:'자세히 보기', url:'https://제휴링크' }
    ]
  },
  operator: {
    queryKey: 'ad-settings',
    storageKey: 'daycare-map-ad-overrides-v2'
  }
};
