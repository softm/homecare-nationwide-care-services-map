/** SOFTM-LIST-ANCHOR-ADS START 날짜:20260930 : 접을 수 있는 목록 전용 광고가 기관 목록을 가리지 않고 실제 펼침에만 한 번 요청되도록 관리 */
(function (root) {
    'use strict';
    const storageKey = 'careListAd:collapsed:v1';
    let options = {}, config, zone, handle, panel, host, fallback, mountElement, ad, timeout, desktop;
    let expanded = true, attempted = false, failed = false, requestedDesktop, slotWidth = 0;

    function element(tag, className, text) {
        const node = root.document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function syncSpace() {
        const height = zone && !zone.hidden ? Math.ceil(zone.getBoundingClientRect().height) : 0;
        const value = `${height}px`;
        if (root.document.body.style.getPropertyValue('--care-list-ad-space') !== value) {
            root.document.body.style.setProperty('--care-list-ad-space', value);
        }
    }

    function showFallback() {
        root.clearTimeout(timeout);
        failed = true;
        if (mountElement) mountElement.remove();
        fallback.hidden = false;
        host.dataset.state = 'direct';
        syncSpace();
    }

    function requestAd() {
        if (attempted || zone.hidden || !expanded || root.document.hidden || config.mode === 'direct') return;
        const slot = desktop.matches ? config.kakao?.desktop : config.kakao?.mobile;
        const expected = desktop.matches ? [728, 90] : [320, 100];
        const unit = String(slot?.unit || '').trim();
        if (!/^DAN-[A-Za-z0-9]+$/.test(unit) || slot.width !== expected[0] || slot.height !== expected[1]) return;
        if (host.clientWidth < slot.width) return;
        attempted = true;
        requestedDesktop = desktop.matches;
        slotWidth = slot.width;
        mountElement = element('div', 'care-list-ad-mount');
        mountElement.style.width = `${slot.width}px`;
        mountElement.style.height = `${slot.height}px`;
        ad = element('ins', 'kakao_ad_area');
        ad.style.display = 'none';
        ad.dataset.adUnit = unit;
        ad.dataset.adWidth = String(slot.width);
        ad.dataset.adHeight = String(slot.height);
        ad.dataset.adOnfail = 'careListAnchorAdFailed';
        ad.dataset.adfitReady = '1';
        mountElement.appendChild(ad);
        host.appendChild(mountElement);
        fallback.hidden = true;
        host.dataset.state = 'adfit';
        root.careListAnchorAdFailed = failedAd => { if (failedAd === ad) showFallback(); };
        const script = element('script');
        script.id = 'careListAnchorAdFit';
        script.async = true;
        script.charset = 'utf-8';
        script.src = config.kakao.script;
        script.onerror = showFallback;
        timeout = root.setTimeout(() => { if (!mountElement.querySelector('iframe')) showFallback(); }, 10000);
        root.document.body.appendChild(script);
    }

    function sync() {
        if (!zone) return;
        const isList = options.isList ? options.isList() : root.document.body.dataset.careMode === 'list';
        zone.hidden = !isList || config.enabled === false || config.mode === 'off';
        panel.hidden = !expanded;
        zone.dataset.expanded = String(expanded);
        handle.setAttribute('aria-expanded', String(expanded));
        handle.textContent = expanded ? '광고 접기' : '광고 펼치기';
        if (!zone.hidden && expanded && attempted && !failed && (desktop.matches !== requestedDesktop || host.clientWidth < slotWidth)) {
            showFallback();
        }
        syncSpace();
        requestAd();
    }

    function setExpanded(value) {
        expanded = Boolean(value);
        try { root.sessionStorage.setItem(storageKey, expanded ? '0' : '1'); } catch {}
        sync();
    }

    function mount(settings = {}) {
        if (zone || !root.document) return;
        options = settings;
        config = root.CARE_LIST_AD_CONFIG || {};
        try { expanded = root.sessionStorage.getItem(storageKey) !== '1'; } catch {}
        desktop = root.matchMedia('(min-width:800px)');
        zone = element('aside', 'care-list-ad-zone');
        zone.id = 'careListAdZone';
        zone.setAttribute('aria-label', '목록 하단 광고');
        zone.hidden = true;
        handle = element('button', 'care-list-ad-toggle');
        handle.type = 'button';
        handle.setAttribute('aria-controls', 'careListAdPanel');
        handle.addEventListener('click', () => setExpanded(!expanded));
        panel = element('div', 'care-list-ad-panel');
        panel.id = 'careListAdPanel';
        host = element('div', 'care-list-ad-host');
        host.id = 'careListAdHost';
        host.dataset.state = 'direct';
        fallback = element('div', 'care-list-ad-house');
        const copy = element('div', 'care-list-ad-copy');
        copy.appendChild(element('strong', '', '돌봄 서비스를 알려보세요'));
        copy.appendChild(element('span', '', '요양·돌봄 사업자를 위한 광고·제휴 안내'));
        const inquiry = element('button', 'care-list-ad-inquiry', '제휴 문의');
        inquiry.type = 'button';
        inquiry.dataset.partnerInquiry = '';
        inquiry.dataset.partnerPlacement = '목록모드 하단 고정';
        inquiry.setAttribute('aria-haspopup', 'dialog');
        fallback.appendChild(copy);
        fallback.appendChild(inquiry);
        host.appendChild(fallback);
        panel.appendChild(host);
        zone.appendChild(handle);
        zone.appendChild(panel);
        root.document.body.appendChild(zone);
        desktop.addEventListener('change', sync);
        root.addEventListener('resize', sync, { passive: true });
        root.document.addEventListener('visibilitychange', sync);
        if (root.ResizeObserver) new root.ResizeObserver(syncSpace).observe(zone);
        sync();
    }

    root.CareListAds = Object.freeze({ mount, sync, setExpanded });
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-LIST-ANCHOR-ADS END */
