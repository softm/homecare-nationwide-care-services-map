/** SOFTM-LANDING-ADS-TEST START 날짜:20260904 : 실제 광고 요청 없이 단위 선택·미발급·실패·화면 회전 시 제휴 안내 복귀를 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../category-landing-ads.js', import.meta.url), 'utf8');
class Element {
    constructor(tag) {
        this.tag = tag;
        this.children = [];
        this.dataset = {};
        this.style = {};
        this.hidden = false;
    }
    appendChild(child) { this.children.push(child); return child; }
    querySelector(selector) {
        for (const child of this.children) {
            if (selector === child.tag || selector === `.${child.className}`) return child;
            const found = child.querySelector(selector);
            if (found) return found;
        }
        return null;
    }
}
function setup(width = 1440, overrides = {}) {
    const zone = new Element('aside');
    const host = new Element('div');
    const fallback = new Element('div');
    fallback.className = 'landing-house';
    host.appendChild(fallback);
    const body = new Element('body');
    const timers = new Map();
    const media = { matches: width >= 800, addEventListener: (event, handler) => { media.change = handler; } };
    const config = { enabled: true, mode: 'hybrid', kakao: { script: 'https://example.invalid/sdk.js', desktop: { unit: 'DAN-PCtest', width: 728, height: 90 }, mobile: { unit: 'DAN-Mobiletest', width: 320, height: 100 } }, ...overrides };
    const window = { CATEGORY_LANDING_AD_CONFIG: config, matchMedia: () => media };
    const document = { body, documentElement: { clientWidth: width }, getElementById: id => ({ categoryAdZone: zone, categoryAdHost: host })[id], createElement: tag => new Element(tag) };
    vm.runInNewContext(source, { window, document, setTimeout: handler => { timers.set(1, handler); return 1; }, clearTimeout: id => timers.delete(id) });
    return { window, zone, host, fallback, body, media, timers, ad: host.querySelector('ins'), mount: host.querySelector('.landing-ad-mount') };
}

test('미발급·잘못된 단위는 광고 요청 없이 제휴 안내 유지', () => {
    for (const unit of ['', 'invalid"unit']) {
        const state = setup(390, { kakao: { mobile: { unit, width: 320, height: 100 } } });
        assert.equal(state.body.children.length, 0);
        assert.equal(state.fallback.hidden, false);
        assert.equal(state.host.dataset.state, 'direct');
    }
});
test('기기별 발급 규격 그대로 단일 SDK와 광고를 선택', () => {
    for (const [width, unit, adWidth, adHeight] of [[1440, 'DAN-PCtest', '728', '90'], [390, 'DAN-Mobiletest', '320', '100']]) {
        const state = setup(width);
        assert.equal(state.ad.dataset.adUnit, unit);
        assert.equal(state.ad.dataset.adWidth, adWidth);
        assert.equal(state.ad.dataset.adHeight, adHeight);
        assert.equal(state.body.children.length, 1);
        assert.equal(state.fallback.hidden, true);
    }
});
test('비활성·직접광고·규격 불일치에서는 외부 요청 생략', () => {
    for (const config of [{ enabled: false }, { mode: 'off' }, { mode: 'direct' }, { kakao: { desktop: { unit: 'DAN-PCtest', width: 320, height: 100 } } }]) {
        const state = setup(1440, config);
        assert.equal(state.body.children.length, 0);
        if (config.enabled === false || config.mode === 'off') assert.equal(state.zone.hidden, true);
        else assert.equal(state.fallback.hidden, false);
    }
});
test('NO-AD는 해당 광고만 제휴 안내로 돌리고 타이머 정리', () => {
    const state = setup();
    state.window.categoryLandingAdFailed(new Element('ins'));
    assert.equal(state.fallback.hidden, true);
    state.window.categoryLandingAdFailed(state.ad);
    assert.equal(state.fallback.hidden, false);
    assert.equal(state.mount.hidden, true);
    assert.equal(state.timers.size, 0);
});
test('네트워크 오류·미로딩에는 복귀하고 완료된 iframe은 유지', () => {
    const failed = setup();
    failed.body.children[0].onerror();
    assert.equal(failed.fallback.hidden, false);
    const pending = setup();
    pending.timers.get(1)();
    assert.equal(pending.fallback.hidden, false);
    const loaded = setup();
    loaded.ad.appendChild(new Element('iframe'));
    loaded.timers.get(1)();
    assert.equal(loaded.fallback.hidden, true);
});
test('화면 회전 시 광고 축소·중복 요청 없이 제휴 안내로 복귀', () => {
    const state = setup();
    state.media.change();
    assert.equal(state.fallback.hidden, false);
    assert.equal(state.mount.hidden, true);
    assert.equal(state.body.children.length, 1);
});
/** SOFTM-LANDING-ADS-TEST END */
