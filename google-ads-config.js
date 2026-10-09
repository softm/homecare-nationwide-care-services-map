/** SOFTM-GOOGLE-ADS START 날짜:20261010 : AdSense 승인 ID를 받은 뒤 전면광고 포함 Auto ads를 전역 활성화할 수 있도록 단일 설정으로 분리 */
window.GOOGLE_ADS_CONFIG = {
  enabled: true,
  publisherId: '',
  autoAds: {
    enabled: true,
    /** Vignette/Anchor 같은 오버레이 형식은 AdSense 관리화면의 Auto ads 설정에서 켭니다. */
    overlayFormatsManagedInAdsense: true
  },
  display: {
    enabled: true
  }
};
/** SOFTM-GOOGLE-ADS END */
