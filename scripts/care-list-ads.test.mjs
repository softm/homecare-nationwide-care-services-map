/** SOFTM-LIST-ANCHOR-ADS-TEST START 날짜:20260930 : 숨긴 광고의 불필요한 요청과 모드·규격 전환 때 중복 로딩 및 목록 가림을 방지 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../care-list-ads.js', import.meta.url), 'utf8');
function setup({ list = true, collapsed = false, desktop = true, unit = 'DAN-testAnchorUnit', mode = 'hybrid', width = desktop ? 1000 : 360, wrongSize = false, enabled = true, hidden = false } = {}) {
    const listeners = {}, timers = new Set(), storage = new Map([['careListAd:collapsed:v1', collapsed ? '1' : '0']]);
    function element(tag = 'div') {
        const styles = new Map();
        return { tagName: tag, dataset: {}, attributes: {}, children: [], hidden: false, clientWidth: width,
            style: { setProperty(name, value) { styles.set(name, value); }, getPropertyValue(name) { return styles.get(name) || ''; } },
            appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
            remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); },
            setAttribute(name, value) { this.attributes[name] = value; },
            addEventListener(name, callback) { this[name] = callback; },
            getBoundingClientRect() { return { height: this.hidden ? 0 : this.dataset.expanded === 'true' ? desktop ? 143 : 153 : 28 }; },
            querySelector(selector) {
                for (const child of this.children) {
                    if (selector === child.tagName || selector === `#${child.id}` || selector === `.${child.className}`) return child;
                    const descendant = child.querySelector(selector);
                    if (descendant) return descendant;
                }
                return null;
            }
        };
    }
    const body = element('body');
    body.dataset.careMode = list ? 'list' : 'map';
    const media = { matches: desktop, addEventListener(name, callback) { listeners.media = callback; } };
    const scope = { CARE_LIST_AD_CONFIG: { mode, enabled, kakao: {
        script: 'https://example.invalid/ad.js', desktop: { unit, width: 728, height: wrongSize ? 250 : 90 }, mobile: { unit, width: 320, height: wrongSize ? 250 : 100 }
    } }, document: { body, hidden, createElement: element, addEventListener(name, callback) { listeners[name] = callback; } },
    matchMedia: () => media, addEventListener(name, callback) { listeners[name] = callback; },
    setTimeout(callback) { timers.add(callback); return callback; }, clearTimeout(callback) { timers.delete(callback); },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }
    };
    scope.window = scope;
    vm.runInNewContext(source, scope);
    scope.CareListAds.mount();
    const zone = body.querySelector('#careListAdZone'), host = body.querySelector('#careListAdHost');
    const scripts = () => body.children.filter(child => child.tagName === 'script');
    return { scope, body, zone, host, media, listeners, timers, storage, scripts, element,
        fallback: host.querySelector('.care-list-ad-house'), handle: zone.querySelector('.care-list-ad-toggle'),
        mode(value) { body.dataset.careMode = value; scope.CareListAds.sync(); } };
}

test('목록·지도에서 접힘·비활성 탭은 요청하지 않고 첫 실제 펼침에서만 요청한다', () => {
    const state = setup({ list: false, collapsed: true });
    assert.equal(state.scripts().length, 0);
    assert.equal(state.zone.hidden, false); // SOFTM-MAP-ANCHOR-ADS 날짜:20260930 : 지도에서도 접힌 손잡이는 유지
    assert.equal(state.body.style.getPropertyValue('--care-list-ad-space'), '28px');
    state.mode('list');
    assert.equal(state.scripts().length, 0);
    assert.equal(state.body.style.getPropertyValue('--care-list-ad-space'), '28px');
    state.handle.click();
    assert.equal(state.scripts().length, 1);
    assert.equal(state.handle.attributes['aria-expanded'], 'true');
    assert.equal(state.body.style.getPropertyValue('--care-list-ad-space'), '143px');
    state.scope.CareListAds.mount();
    state.handle.click();
    state.handle.click();
    state.mode('map');
    state.mode('list');
    state.listeners.resize();
    assert.equal(state.scripts().length, 1);
    assert.equal(state.body.children.filter(child => child.id === 'careListAdZone').length, 1);
    const inactive = setup({ hidden: true });
    assert.equal(inactive.scripts().length, 0);
    inactive.scope.document.hidden = false;
    inactive.listeners.visibilitychange();
    assert.equal(inactive.scripts().length, 1);
});

test('접힘 상태는 세션에 남고 빈 ID·잘못된 규격·좁은 폭·직접 안내는 광고 없이 문의를 제공한다', () => {
    const state = setup({ collapsed: true });
    assert.equal(state.handle.attributes['aria-expanded'], 'false');
    state.handle.click();
    assert.equal(state.storage.get('careListAd:collapsed:v1'), '0');
    state.handle.click();
    assert.equal(state.storage.get('careListAd:collapsed:v1'), '1');
    for (const options of [{ unit: '' }, { unit: 'invalid' }, { wrongSize: true }, { desktop: false, width: 280 }, { mode: 'direct' }]) {
        const candidate = setup(options);
        assert.equal(candidate.scripts().length, 0);
        assert.equal(candidate.fallback.hidden, false);
        assert.equal(candidate.host.dataset.state, 'direct');
    }
    for (const options of [{ mode: 'off' }, { enabled: false }]) {
        const candidate = setup(options);
        assert.equal(candidate.zone.hidden, true);
        assert.equal(candidate.scripts().length, 0);
        assert.equal(candidate.body.style.getPropertyValue('--care-list-ad-space'), '0px');
    }
});

test('PC·모바일 원래 규격과 공용 요청 큐 중복 방지 표시를 사용한다', () => {
    for (const desktop of [true, false]) {
        const state = setup({ desktop });
        const ad = state.host.querySelector('ins');
        assert.equal(ad.dataset.adWidth, desktop ? '728' : '320');
        assert.equal(ad.dataset.adHeight, desktop ? '90' : '100');
        assert.equal(ad.dataset.adUnit, 'DAN-testAnchorUnit');
        assert.equal(ad.dataset.adfitReady, '1');
        assert.equal(state.fallback.hidden, true);
        assert.equal(state.body.style.getPropertyValue('--care-list-ad-space'), desktop ? '143px' : '153px');
    }
});

test('NOAD·스크립트 오류·미로딩은 해당 광고를 정리하고 재요청 없이 문의로 복귀한다', () => {
    for (const failure of ['noad', 'script', 'timeout']) {
        const state = setup();
        const ad = state.host.querySelector('ins');
        state.scope.careListAnchorAdFailed({});
        assert.equal(state.fallback.hidden, true);
        if (failure === 'noad') state.scope.careListAnchorAdFailed(ad);
        if (failure === 'script') state.scripts()[0].onerror();
        if (failure === 'timeout') [...state.timers][0]();
        assert.equal(state.fallback.hidden, false);
        assert.equal(state.host.querySelector('ins'), null);
        state.scope.CareListAds.sync();
        state.handle.click();
        state.handle.click();
        assert.equal(state.scripts().length, 1);
    }
});

test('정상 iframe은 유지하고 화면 회전·폭 부족 때에는 축소나 중복 요청 없이 문의로 돌아간다', () => {
    const state = setup();
    state.host.querySelector('.care-list-ad-mount').appendChild(state.element('iframe'));
    [...state.timers][0]();
    assert.equal(state.fallback.hidden, true);
    state.media.matches = false;
    state.listeners.media();
    assert.equal(state.fallback.hidden, false);
    assert.equal(state.scripts().length, 1);
    const narrow = setup({ desktop: false });
    narrow.host.clientWidth = 280;
    narrow.listeners.resize();
    assert.equal(narrow.fallback.hidden, false);
    assert.equal(narrow.scripts().length, 1);
});
/** SOFTM-LIST-AD-READING-TEST START 날짜:20260930 : 읽기 단계의 임시 접힘·수동 선택·원래 세션 복원을 실제 표시와 광고 요청으로 검증 */
test('읽기 진입은 광고를 접어 공간을 반환하고 복귀할 때 원래 사용자 선택을 복원한다', () => {
    for (const desktop of [true, false]) {
        for (const collapsed of [true, false]) {
            const state = setup({ desktop, collapsed });
            const panel = state.zone.querySelector('#careListAdPanel');
            const previousStorage = state.storage.get('careListAd:collapsed:v1');
            const previousRequests = state.scripts().length;
            state.scope.CareListAds.setReading(true);
            assert.equal(panel.hidden, true);
            assert.equal(state.zone.dataset.expanded, 'false');
            assert.equal(state.handle.attributes['aria-expanded'], 'false');
            assert.equal(state.handle.textContent, '광고 펼치기');
            assert.equal(state.body.style.getPropertyValue('--care-list-ad-space'), '28px');
            assert.equal(state.storage.get('careListAd:collapsed:v1'), previousStorage);
            state.scope.CareListAds.setReading(false);
            assert.equal(panel.hidden, collapsed);
            assert.equal(state.handle.attributes['aria-expanded'], String(!collapsed));
            assert.equal(state.handle.textContent, collapsed ? '광고 펼치기' : '광고 접기');
            assert.equal(state.body.style.getPropertyValue('--care-list-ad-space'), collapsed ? '28px' : desktop ? '143px' : '153px');
            assert.equal(state.storage.get('careListAd:collapsed:v1'), previousStorage);
            assert.equal(state.scripts().length, previousRequests);
        }
    }
});

test('읽기 중 수동 펼침은 반복 스크롤·화면 갱신에도 유지되고 다음 읽기 진입은 다시 접힌다', () => {
    const state = setup({ collapsed: true, desktop: false });
    state.scope.CareListAds.setReading(true);
    state.handle.click();
    assert.equal(state.handle.attributes['aria-expanded'], 'true');
    assert.equal(state.body.style.getPropertyValue('--care-list-ad-space'), '153px');
    assert.equal(state.scripts().length, 1);
    state.scope.CareListAds.setReading(true);
    state.listeners.resize();
    state.scope.CareListAds.sync();
    assert.equal(state.handle.attributes['aria-expanded'], 'true');
    assert.equal(state.storage.get('careListAd:collapsed:v1'), '1');
    state.handle.click();
    state.scope.CareListAds.setReading(true);
    assert.equal(state.handle.attributes['aria-expanded'], 'false');
    state.handle.click();
    state.scope.CareListAds.setReading(false);
    assert.equal(state.handle.attributes['aria-expanded'], 'false', '읽기 임시 펼침 후에도 원래 접힘 선택으로 복귀한다');
    state.scope.CareListAds.setExpanded(true);
    state.scope.CareListAds.setReading(true);
    assert.equal(state.handle.attributes['aria-expanded'], 'false');
    assert.equal(state.storage.get('careListAd:collapsed:v1'), '0');
    assert.equal(state.scripts().length, 1, '같은 광고를 다시 요청하지 않는다');
});

test('읽기 단계에서 숨은 페이지가 활성화되어도 요청하지 않고 지도 전환 후 기존 선택을 복원한다', () => {
    const state = setup({ hidden: true });
    state.scope.CareListAds.setReading(true);
    state.scope.document.hidden = false;
    state.listeners.visibilitychange();
    assert.equal(state.scripts().length, 0);
    state.mode('map');
    state.scope.CareListAds.setReading(false);
    assert.equal(state.body.style.getPropertyValue('--care-list-ad-space'), '143px'); // SOFTM-MAP-ANCHOR-ADS 날짜:20260930 : 지도 복귀는 원래 펼침으로 요청
    assert.equal(state.scripts().length, 1);
    state.mode('list');
    assert.equal(state.handle.attributes['aria-expanded'], 'true');
    assert.equal(state.body.style.getPropertyValue('--care-list-ad-space'), '143px');
    assert.equal(state.scripts().length, 1);
});
/** SOFTM-LIST-AD-READING-TEST END */
/** SOFTM-LIST-ANCHOR-PAGE-TEST START 날짜:20260930 : 실제 페이지의 광고 생성·정리를 실행해 목록 전환 중 숨은 광고와 반복 단위가 남는 회귀를 방지 */
const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const adStart = page.indexOf('function careAdConfig()');
const adEnd = page.indexOf('async function loadCategoryData()', adStart);
assert.ok(adStart >= 0 && adEnd > adStart, '페이지 광고 함수 영역을 찾을 수 있어야 한다');
const pageAdSource = page.slice(adStart, adEnd);
const configSource = fs.readFileSync(new URL('../nationwide-care-ad-config.js', import.meta.url), 'utf8');

function setupPage({ list = true, desktop = true } = {}) {
    const hosts = new Map(), destroyed = [], clearedTimers = [], timers = [];
    let queued = 0;
    function host() {
        let html = '', ads = [];
        const paragraph = { textContent: '' };
        return { hidden: false, open: false, textContent: '',
            get innerHTML() { return html; },
            set innerHTML(value) {
                html = value;
                ads = [...value.matchAll(/<ins\b[^>]*data-ad-unit="([^"]+)"[^>]*>/g)].map(match => ({ dataset: { adUnit: match[1] }, removed: false }));
            },
            querySelectorAll(selector) {
                if (selector === 'ins.kakao_ad_area') return ads.filter(ad => !ad.removed);
                if (selector === '.list-ad-slot') return ads.filter(ad => !ad.removed).map(ad => ({ remove() { ad.removed = true; } }));
                return [];
            },
            querySelector(selector) { return selector === 'p' ? paragraph : null; },
            replaceChildren() { this.innerHTML = ''; },
            showModal() { this.open = true; }, close() { this.open = false; },
            addEventListener(name, callback) { this[name] = callback; }
        };
    }
    for (const id of ['list', 'careAdBanner', 'careAdBannerHost', 'careListTopAd', 'careListTopAdHost', 'welcomeAdHost', 'welcomeAdDialog', 'welcomeAdClose', 'careCompareAdHost', 'careRouteAdHost']) hosts.set(id, host());
    const scope = { $: id => hosts.get(id), esc: value => String(value || ''),
        CareListMode: { isList: () => list }, matchMedia: query => ({ matches: query.includes('max-width') ? !desktop : desktop }),
        location: { href: 'https://example.invalid/index.html' }, URL,
        setTimeout(callback) { timers.push(callback); return callback; }, clearTimeout(value) { clearedTimers.push(value); },
        adRefreshTimer: 'pending-ad-refresh', adfit: { destroy: unit => destroyed.push(unit) },
        sessionStorage: { getItem: () => null, setItem() {} }
    };
    scope.window = scope;
    vm.runInNewContext(configSource + '\n' + pageAdSource, scope);
    scope.queueCareAdFit = () => { queued++; };
    return { scope, hosts, destroyed, clearedTimers, timers, queued: () => queued,
        mode(value) { list = value === 'list'; }, units: id => hosts.get(id).querySelectorAll('ins.kakao_ad_area').map(ad => ad.dataset.adUnit) };
}

test('실제 목록 광고는 6번째만 AdFit을 유지하고 12·18·24번째는 제휴 안내로 제한한다', () => {
    for (const desktop of [true, false]) {
        const state = setupPage({ desktop });
        const first = state.scope.listAdHtml(5, 30);
        assert.match(first, /class="kakao_ad_area"/);
        assert.ok(first.includes(state.scope.CARE_AD_CONFIG.kakao.listUnits[0].unit));
        for (const position of [12, 18, 24]) {
            const html = state.scope.listAdHtml(position - 1, 30);
            assert.match(html, /class="partner-list-ad"/);
            assert.doesNotMatch(html, /kakao_ad_area|data-ad-unit/);
        }
        const html = Array.from({ length: 30 }, (_, index) => state.scope.listAdHtml(index, 30)).join('');
        assert.equal((html.match(/class="kakao_ad_area"/g) || []).length, 1);
        assert.match(state.scope.listAdHtml(2, 3), /class="kakao_ad_area"/, '짧은 목록은 마지막 기관 뒤 기존 광고를 유지한다');
    }
});

test('실제 지도 목록은 기존 6·12·18·24번째의 화면별 발급 단위를 유지한다', () => {
    for (const desktop of [true, false]) {
        const state = setupPage({ list: false, desktop });
        const config = state.scope.CARE_AD_CONFIG.kakao;
        assert.ok(state.scope.listAdHtml(5, 30).includes(config.listUnits[0].unit));
        for (const position of [12, 18, 24]) {
            const html = state.scope.listAdHtml(position - 1, 30);
            assert.ok(html.includes(config.listPositions[position][desktop ? 'desktop' : 'mobile'].unit));
            assert.match(html, /class="partner-list-ad"/);
        }
    }
});

test('실제 초기화는 목록에서 숨은 상단·환영 광고 요청을 생략하고 지도에서는 다시 연결한다', () => {
    const state = setupPage();
    state.scope.initCareAds();
    state.scope.initExpandedCareAds();
    state.scope.initWelcomeAd();
    assert.equal(state.queued(), 0);
    assert.equal(state.hosts.get('careAdBanner').hidden, true);
    assert.equal(state.hosts.get('careListTopAd').hidden, true);
    assert.equal(state.hosts.get('welcomeAdDialog').open, true, '광고 없이도 환영 안내는 유지한다');
    assert.equal(state.hosts.get('welcomeAdClose').textContent, '목록에서 시작하기');
    state.mode('map');
    state.scope.initCareAds();
    state.scope.initExpandedCareAds();
    state.scope.initWelcomeAd();
    assert.equal(state.queued(), 3);
    const config = state.scope.CARE_AD_CONFIG.kakao;
    assert.deepEqual(state.units('careAdBannerHost'), [config.desktop.unit]);
    assert.deepEqual(state.units('careListTopAdHost'), [config.listTop.desktop.unit]);
    assert.deepEqual(state.units('welcomeAdHost'), [config.welcome.mobile.unit]);
});

test('실제 모드 정리는 이전 목록·숨은 호스트를 파괴하되 비교·경로는 보존하고 늦은 fallback도 차단한다', () => {
    const state = setupPage({ list: false });
    state.scope.initCareAds();
    state.scope.initExpandedCareAds();
    state.scope.initWelcomeAd();
    state.scope.renderConfiguredAd(state.hosts.get('careCompareAdHost'), 'compare');
    state.scope.renderConfiguredAd(state.hosts.get('careRouteAdHost'), 'route');
    state.hosts.get('list').innerHTML = [6, 12, 18, 24].map(position => state.scope.listAdHtml(position - 1, 30)).join('');
    const config = state.scope.CARE_AD_CONFIG.kakao;
    state.mode('list');
    state.scope.clearMapOnlyCareAds();
    assert.ok(state.clearedTimers.includes('pending-ad-refresh'));
    assert.equal(state.destroyed.length, 7);
    assert.equal(new Set(state.destroyed).size, 7);
    for (const id of ['list', 'careAdBannerHost', 'careListTopAdHost', 'welcomeAdHost']) assert.deepEqual(state.units(id), []);
    assert.deepEqual(state.units('careCompareAdHost'), [config.compare.desktop.unit]);
    assert.deepEqual(state.units('careRouteAdHost'), [config.route.desktop.unit]);
    assert.equal(state.hosts.get('careAdBanner').hidden, true);
    assert.equal(state.hosts.get('careListTopAd').hidden, true);
    state.timers.forEach(callback => callback());
    assert.equal(state.hosts.get('careAdBannerHost').innerHTML, '', '이전 지도 fallback이 정리한 상단을 복원하지 않는다');
    state.hosts.get('list').innerHTML = Array.from({ length: 30 }, (_, index) => state.scope.listAdHtml(index, 30)).join('');
    assert.equal(state.units('list').length + state.units('careCompareAdHost').length + state.units('careRouteAdHost').length + 1, 4, '하단 광고 한 자리를 포함해 최대 네 개다');
});
test('빠른 지도 왕복과 배너 재연결은 이전 미노출 타이머를 취소해 새 광고를 덮지 않는다', () => {
    const state = setupPage({ list: false });
    state.scope.initCareAds();
    const previous = state.timers.at(-1);
    state.mode('list');
    state.scope.clearMapOnlyCareAds();
    assert.ok(state.clearedTimers.includes(previous));
    state.mode('map');
    state.scope.initCareAds();
    const next = state.timers.at(-1);
    assert.notEqual(next, previous);
    state.scope.initCareAds();
    assert.ok(state.clearedTimers.includes(next));
    assert.equal(state.units('careAdBannerHost').length, 1);
});
/** SOFTM-LIST-ANCHOR-PAGE-TEST END */
/** SOFTM-LIST-ANCHOR-ADS-TEST END */

/** SOFTM-MAP-ANCHOR-ADS-TEST START 날짜:20260930 : 지도 직접 진입·모드 왕복·문의 출처와 목록 임시 접힘의 분리를 검증 */
test('PC·모바일 지도 광고는 접기·펼치기·목록 왕복에도 한 개만 요청하고 문의 출처를 갱신한다', () => {
    for (const desktop of [true, false]) {
        const state = setup({ list: false, desktop });
        const inquiry = state.host.querySelector('.care-list-ad-inquiry');
        assert.equal(state.zone.hidden, false);
        assert.equal(state.scripts().length, 1);
        assert.equal(inquiry.dataset.partnerPlacement, '지도모드 하단 고정');
        state.handle.click();
        assert.equal(state.body.style.getPropertyValue('--care-list-ad-space'), '28px');
        state.mode('list');
        assert.equal(state.handle.attributes['aria-expanded'], 'false');
        assert.equal(inquiry.dataset.partnerPlacement, '목록모드 하단 고정');
        state.handle.click();
        state.scope.CareListAds.setReading(true);
        state.mode('map');
        assert.equal(state.handle.attributes['aria-expanded'], 'true');
        state.handle.click();
        assert.equal(state.storage.get('careListAd:collapsed:v1'), '1');
        state.handle.click();
        assert.equal(state.storage.get('careListAd:collapsed:v1'), '0');
        assert.equal(state.scripts().length, 1);
    }
});
/** SOFTM-MAP-ANCHOR-ADS-TEST END */
