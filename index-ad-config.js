/** SOFTM-INDEX-AD-UNIT START 날짜:20260903 : 인덱스 승인 광고가 전국 요양 광고 단위와 섞이지 않도록 전용 PC·모바일 단위로 분리 */
window.INDEX_AD_CONFIG = {
  enabled: true,
  mode: 'hybrid',
  fallbackToDirect: true,
  placements: {
    banner: true
  },
  kakao: {
    script: 'https://t1.daumcdn.net/kas/static/ba.min.js',
    desktop: {
      unit: 'DAN-q4nR1JpPnBFtotbe',
      width: 728,
      height: 90
    },
    mobile: {
      unit: 'DAN-fmQS1GFVu1j2yBow',
      width: 320,
      height: 100
    }
  },
  direct: {
    items: [
      {
        id: 'index-partner-recruit',
        active: true,
        eyebrow: '요양·돌봄 서비스 사업자',
        title: '돌봄기관을 찾는 이용자에게 서비스를 알리세요',
        description: '요양시설, 주야간보호, 방문요양과 돌봄 서비스의 지역별 제휴 광고를 모집합니다.',
        cta: '제휴 문의',
        url: 'mailto:softm@nate.com?subject=%EC%A0%84%EA%B5%AD%20%EB%85%B8%EC%9D%B8%EB%8F%8C%EB%B4%84%20%EA%B8%B0%EA%B4%80%20%EC%A7%80%EB%8F%84%20%EA%B4%91%EA%B3%A0%C2%B7%EC%A0%9C%ED%9C%B4%20%EB%AC%B8%EC%9D%98'
      }
    ]
  }
};
/** SOFTM-INDEX-AD-UNIT END */
