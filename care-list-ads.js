/** SOFTM-LIST-ANCHOR-ADS START 날짜:20260930 : 접을 수 있는 목록·지도 공용 광고가 기관 목록을 가리지 않고 실제 펼침에만 한 번 요청되도록 관리 */
(function (root) {
    'use strict';
    const storageKey = 'careListAd:collapsed:v1';
    let options = {}, config, zone, handle, panel, host, fallback, mountElement, ad, timeout, desktop, inquiry; // SOFTM-MAP-ANCHOR-ADS 날짜:20260930 : 모드별 문의 위치를 같은 광고에서 갱신
    let expanded = true, attempted = false, failed = false, requestedDesktop, slotWidth = 0;
    /** SOFTM-LIST-AD-READING START 날짜:20260930 : 목록 읽기 중 임시 접힘이 사용자의 세션 선택을 바꾸지 않도록 분리 */
    let reading = false, readingExpanded = false;
    let focus = false, focusExpanded = false; // SOFTM-MOBILE-FOCUS 날짜:20261003 : 전체 지도에서만 임시로 접고 원래 광고 선택은 보존

    function isExpanded() {
        if (focus) return focusExpanded; // SOFTM-MOBILE-FOCUS 날짜:20261003 : 전체 지도 수동 펼침은 이번 진입 동안 유지
        return reading && (options.isList ? options.isList() : root.document.body.dataset.careMode === 'list') ? readingExpanded : expanded; // SOFTM-MAP-ANCHOR-ADS 날짜:20260930 : 목록의 임시 접힘이 지도 광고 선택을 덮지 않도록 구분
    }
    /** SOFTM-LIST-AD-READING END */

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

    /** SOFTM-ANCHOR-REAL-AD START 날짜:20261007 : 광고 전용 지면에서 미노출을 제휴 안내로 바꾸지 않고 사용 공간을 반환 */
    function showFallback() {
        root.clearTimeout(timeout);
        failed = true;
        if (mountElement) mountElement.remove();
        fallback.hidden = config.mode === 'kakao';
        host.dataset.state = fallback.hidden ? 'empty' : 'direct';
        if (fallback.hidden) zone.hidden = true;
        syncSpace();
    }
    /** SOFTM-ANCHOR-REAL-AD END */

    function requestAd() {
        if (attempted || zone.hidden || !isExpanded() || root.document.hidden || config.mode === 'direct') return; // SOFTM-LIST-AD-READING 날짜:20260930 : 자동 접힌 동안에는 광고를 새로 요청하지 않음
        const slot = desktop.matches ? config.kakao?.desktop : config.kakao?.mobile;
        const expected = desktop.matches ? [728, 90] : [320, 100];
        const unit = String(slot?.unit || '').trim();
        /** SOFTM-ANCHOR-REAL-AD START 날짜:20261007 : 유효하지 않은 실제 광고 영역을 빈 배너로 남기지 않음 */
        if (!/^DAN-[A-Za-z0-9]+$/.test(unit) || slot.width !== expected[0] || slot.height !== expected[1] || host.clientWidth < slot.width) {
            if (config.mode === 'kakao') showFallback();
            return;
        }
        /** SOFTM-ANCHOR-REAL-AD END */
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
        ad.dataset.adOnload = 'careListAnchorAdLoaded'; // SOFTM-ANCHOR-AD-LOAD 날짜:20261007 : 정상 수신한 광고는 대기 시간과 무관하게 유지
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
        /** SOFTM-ANCHOR-AD-LOAD START 날짜:20261007 : 느린 SDK 다운로드를 광고 응답 시간에 포함해 조기에 광고를 제거하지 않음 */
        let loaded = false;
        root.careListAnchorAdLoaded = loadedAd => {
            if (loadedAd !== ad || failed) return;
            loaded = true;
            root.clearTimeout(timeout);
        };
        const waitForAd = () => {
            root.clearTimeout(timeout);
            if (loaded || failed) return;
            timeout = root.setTimeout(() => { if (!mountElement.querySelector('iframe')) showFallback(); }, 30000);
        };
        script.onload = waitForAd;
        waitForAd();
        /** SOFTM-ANCHOR-AD-LOAD END */
        root.document.body.appendChild(script);
    }

    function sync() {
        if (!zone) return;
        const isList = options.isList ? options.isList() : root.document.body.dataset.careMode === 'list';
        /** SOFTM-MAP-ANCHOR-ADS START 날짜:20260930 : 두 모드에서 단일 광고와 접힘 선택을 공유하고 실제 문의 위치를 전달 */
        zone.hidden = config.enabled === false || config.mode === 'off' || (config.mode === 'kakao' && failed); // SOFTM-ANCHOR-REAL-AD 날짜:20261007 : 모드 전환이 미노출 지면을 다시 펼치지 않도록 유지
        zone.setAttribute('aria-label', isList ? '목록 하단 광고' : '지도 하단 광고');
        inquiry.dataset.partnerPlacement = isList ? '목록모드 하단 고정' : '지도모드 하단 고정';
        /** SOFTM-MAP-ANCHOR-ADS END */
        /** SOFTM-LIST-AD-READING START 날짜:20260930 : 표시 상태와 접근성·예약 공간을 실제 읽기 단계의 펼침 상태로 일치 */
        const visibleExpanded = isExpanded();
        panel.hidden = !visibleExpanded;
        zone.dataset.expanded = String(visibleExpanded);
        handle.setAttribute('aria-expanded', String(visibleExpanded));
        handle.textContent = visibleExpanded ? '광고 접기' : '광고 펼치기';
        if (!zone.hidden && visibleExpanded && attempted && !failed && (desktop.matches !== requestedDesktop || host.clientWidth < slotWidth)) {
            showFallback();
        }
        /** SOFTM-LIST-AD-READING END */
        syncSpace();
        requestAd();
    }

    function setExpanded(value) {
        if (focus) { focusExpanded = Boolean(value); sync(); return; } // SOFTM-MOBILE-FOCUS 날짜:20261003 : 임시 지도 선택으로 세션의 광고 선호를 덮지 않음
        /** SOFTM-LIST-AD-READING START 날짜:20260930 : 읽기 중 수동 선택은 현재 단계에만 적용하고 원래 광고 선택은 보존 */
        if (reading && (options.isList ? options.isList() : root.document.body.dataset.careMode === 'list')) { // SOFTM-MAP-ANCHOR-ADS 날짜:20260930 : 지도에서 수동 선택한 접힘은 세션에 보존
            readingExpanded = Boolean(value);
        } else {
            expanded = Boolean(value);
            try { root.sessionStorage.setItem(storageKey, expanded ? '0' : '1'); } catch {}
        }
        /** SOFTM-LIST-AD-READING END */
        sync();
    }

    /** SOFTM-LIST-AD-READING START 날짜:20260930 : 반복 스크롤 갱신이 수동 펼침을 덮지 않고 읽기 단계 진입 때만 자동 접힘 */
    function setReading(value) {
        const next = Boolean(value);
        if (next === reading) return;
        reading = next;
        readingExpanded = false;
        sync();
    }
    /** SOFTM-LIST-AD-READING END */

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
        handle.addEventListener('click', () => setExpanded(!isExpanded())); // SOFTM-LIST-AD-READING 날짜:20260930 : 자동 접힘 상태에서도 한 번의 클릭으로 광고를 펼침
        panel = element('div', 'care-list-ad-panel');
        panel.id = 'careListAdPanel';
        host = element('div', 'care-list-ad-host');
        host.id = 'careListAdHost';
        host.dataset.state = config.mode === 'kakao' ? 'loading' : 'direct'; // SOFTM-ANCHOR-REAL-AD 날짜:20261007 : 요청 전에도 제휴 안내가 잠깐 보이지 않도록 상태 분리
        fallback = element('div', 'care-list-ad-house');
        fallback.hidden = config.mode === 'kakao'; // SOFTM-ANCHOR-REAL-AD 날짜:20261007 : 하단 광고 전용 설정은 대체 배너를 표시하지 않음
        const copy = element('div', 'care-list-ad-copy');
        copy.appendChild(element('strong', '', '돌봄 서비스를 알려보세요'));
        copy.appendChild(element('span', '', '요양·돌봄 사업자를 위한 광고·제휴 안내'));
        inquiry = element('button', 'care-list-ad-inquiry', '제휴 문의'); // SOFTM-MAP-ANCHOR-ADS 날짜:20260930 : 모드 전환 시 문의 출처를 갱신
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

    /** SOFTM-MOBILE-FOCUS START 날짜:20261003 : 전체 지도 진입 때만 접고 반복 상태 갱신은 수동 펼침을 유지 */
    function setFocus(value) {
        const next = Boolean(value);
        if (next === focus) return;
        focus = next; focusExpanded = false; sync();
    }
    /** SOFTM-MOBILE-FOCUS END */
    root.CareListAds = Object.freeze({ mount, sync, setExpanded, setReading, setFocus }); // SOFTM-MOBILE-FOCUS 날짜:20261003 : 목록 읽기와 전체 지도 임시 접힘을 별도 진입점으로 연결
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-LIST-ANCHOR-ADS END */
