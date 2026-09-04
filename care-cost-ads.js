/** SOFTM-COST-ADS START 날짜:20260904 : 계산을 가리지 않고 하단에 접근할 때 한 번만 광고를 요청하며 미노출 시 문의 동선을 유지 */
(() => {
    'use strict';
    const config = window.CARE_COST_AD_CONFIG || {};
    const zone = document.getElementById('costAdZone');
    const host = document.getElementById('costAdHost');
    if (!zone || !host) return;
    if (config.enabled === false || config.mode === 'off') {
        zone.hidden = true;
        return;
    }
    const fallback = host.querySelector('.partner-banner');
    const desktop = matchMedia('(min-width:800px)');
    host.dataset.state = 'direct';

    function requestAd() {
        const slot = desktop.matches ? config.kakao?.desktop : config.kakao?.mobile;
        const expected = desktop.matches ? [728, 90] : [320, 100];
        const unit = String(slot?.unit || '').trim();
        if (config.mode === 'direct' || !/^DAN-[A-Za-z0-9]+$/.test(unit)) return;
        if (slot.width !== expected[0] || slot.height !== expected[1] || host.clientWidth < slot.width) return;
        const mount = document.createElement('div');
        mount.className = 'content-ad-mount';
        mount.style.width = `${slot.width}px`;
        mount.style.minHeight = `${slot.height}px`;
        const ad = document.createElement('ins');
        ad.className = 'kakao_ad_area';
        ad.style.display = 'none';
        ad.dataset.adUnit = unit;
        ad.dataset.adWidth = String(slot.width);
        ad.dataset.adHeight = String(slot.height);
        ad.dataset.adOnfail = 'careCostAdFailed';
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
        window.careCostAdFailed = failedAd => { if (failedAd === ad) showFallback(); };
        desktop.addEventListener('change', showFallback);
        window.addEventListener('resize', () => { if (host.clientWidth < slot.width) showFallback(); }, { passive: true }); // SOFTM-AD-FIT 날짜:20260904 : 모바일 안에서 더 좁아진 경우에도 광고를 자르지 않도록 제휴 카드로 전환
        const script = document.createElement('script');
        script.id = 'careCostAdFit';
        script.async = true;
        script.charset = 'utf-8';
        script.src = config.kakao.script;
        script.onerror = showFallback;
        timeout = setTimeout(() => { if (!mount.querySelector('iframe')) showFallback(); }, 10000);
        document.body.appendChild(script);
    }

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
            if (!entries.some(entry => entry.isIntersecting)) return;
            observer.disconnect();
            requestAd();
        }, { rootMargin: '200px' });
        observer.observe(zone);
    } else requestAd();
})();
/** SOFTM-COST-ADS END */
