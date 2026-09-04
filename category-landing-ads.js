/** SOFTM-LANDING-ADS START 날짜:20260904 : 광고키 발급 전과 광고 미노출 때도 같은 위치에서 제휴 안내를 제공하고 지도 검색을 가리지 않도록 구성 */
(() => {
    'use strict';
    const config = window.CATEGORY_LANDING_AD_CONFIG || {};
    const zone = document.getElementById('categoryAdZone');
    const host = document.getElementById('categoryAdHost');
    if (!zone || !host) return;
    if (config.enabled === false || config.mode === 'off') {
        zone.hidden = true;
        return;
    }

    const fallback = host.querySelector('.landing-house');
    const desktop = window.matchMedia('(min-width:800px)');
    const slot = desktop.matches ? config.kakao?.desktop : config.kakao?.mobile;
    const expected = desktop.matches ? [728, 90] : [320, 100];
    const unit = String(slot?.unit || '').trim();
    host.dataset.state = 'direct';
    if (document.documentElement.clientWidth < 320) return;
    if (config.mode === 'direct' || !/^DAN-[A-Za-z0-9]+$/.test(unit)) return;
    if (slot.width !== expected[0] || slot.height !== expected[1]) return;

    const mount = document.createElement('div');
    mount.className = 'landing-ad-mount';
    const ad = document.createElement('ins');
    ad.className = 'kakao_ad_area';
    ad.style.display = 'none';
    ad.dataset.adUnit = unit;
    ad.dataset.adWidth = String(slot.width);
    ad.dataset.adHeight = String(slot.height);
    ad.dataset.adOnfail = 'categoryLandingAdFailed';
    mount.appendChild(ad);
    host.appendChild(mount);
    fallback.hidden = true;
    host.dataset.state = 'adfit';

    let timeout;
    const showFallback = () => {
        clearTimeout(timeout);
        mount.hidden = true;
        fallback.hidden = false;
        host.dataset.state = 'direct';
    };
    window.categoryLandingAdFailed = failedAd => {
        if (failedAd === ad) showFallback();
    };
    const script = document.createElement('script');
    script.id = 'categoryLandingAdFit';
    script.async = true;
    script.charset = 'utf-8';
    script.src = config.kakao.script;
    script.onerror = showFallback;
    document.body.appendChild(script);
    timeout = setTimeout(() => {
        if (!mount.querySelector('iframe')) showFallback();
    }, 10000);

    // SOFTM-LANDING-ADS 날짜:20260904 : 화면 회전 때 이미 요청한 광고를 축소하거나 중복 요청하지 않고 제휴 안내로 전환
    desktop.addEventListener('change', showFallback);
})();
/** SOFTM-LANDING-ADS END */
