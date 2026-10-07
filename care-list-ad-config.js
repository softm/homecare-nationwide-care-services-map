/** SOFTM-LIST-ANCHOR-ADS START 날짜:20260930 : 실제 발급한 하단 전용 광고로 연결하고 기존 지도·목록 상단과 성과를 분리해 집계 */
window.CARE_LIST_AD_CONFIG = {
    enabled: true,
    mode: 'kakao', // SOFTM-ANCHOR-REAL-AD 날짜:20261007 : 하단은 실제 광고만 제공하고 제휴 안내로 대체하지 않음
    kakao: {
        script: 'https://t1.kakaocdn.net/kas/static/ba.min.js',
        desktop: { unit: 'DAN-u93PIUlMdcBVxmBT', width: 728, height: 90 },
        mobile: { unit: 'DAN-pvxgpyPRxWaG5Z56', width: 320, height: 100 }
    }
};
/** SOFTM-LIST-ANCHOR-ADS END */
