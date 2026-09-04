/** SOFTM-COST-ADS-TEST START 날짜:20260904 : 실제 광고 요청의 시점·규격과 실패 복귀를 검사해 계산 도중 중복 요청이나 빈칸을 방지 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../care-cost-ads.js', import.meta.url), 'utf8');
function setup({ desktop = true, width = desktop ? 1000 : 320, unit = 'DAN-testCostUnit', mode = 'hybrid', height = desktop ? 90 : 100 } = {}) {
    const callbacks = {}, timers = [], scripts = [];
    const element = () => ({ dataset: {}, style: {}, children: [], hidden: false,
        appendChild(child) { this.children.push(child); },
        querySelector(selector) { return selector === 'iframe' ? this.iframe : null; }
    });
    const fallback = element(), host = element(), zone = element();
    host.clientWidth = width;
    host.querySelector = selector => selector === '.partner-banner' ? fallback : null;
    const media = { matches: desktop, addEventListener(event, callback) { callbacks.media = callback; } };
    const scope = {
        CARE_COST_AD_CONFIG: { mode, kakao: {
            desktop: { unit, width: 728, height }, mobile: { unit, width: 320, height }, script: 'https://example.invalid/ad.js'
        } },
        document: {
            getElementById: id => id === 'costAdZone' ? zone : host,
            createElement: element,
            body: { appendChild: script => scripts.push(script) }
        },
        matchMedia: () => media,
        addEventListener: (event, callback) => { callbacks[event] = callback; },
        setTimeout: callback => { timers.push(callback); return callback; },
        clearTimeout: callback => { const i = timers.indexOf(callback); if (i >= 0) timers.splice(i, 1); },
        IntersectionObserver: class {
            constructor(callback) { this.callback = callback; callbacks.intersection = this; }
            observe() { this.active = true; }
            disconnect() { this.active = false; }
        }
    };
    scope.window = scope;
    vm.runInNewContext(source, scope);
    const enter = () => {
        const observer = callbacks.intersection;
        if (observer?.active) observer.callback([{ isIntersecting: true }]);
    };
    return { scope, host, fallback, zone, scripts, callbacks, timers, enter };
}

test('ID 미발급·직접 안내·잘못된 규격에는 광고 요청 없이 제휴 문의를 유지한다', () => {
    for (const options of [{ unit: '' }, { unit: 'invalid' }, { mode: 'direct' }, { height: 250 }, { width: 280, desktop: false }]) {
        const state = setup(options);
        state.enter();
        assert.equal(state.scripts.length, 0);
        assert.equal(state.fallback.hidden, false);
        assert.equal(state.host.dataset.state, 'direct');
    }
    const off = setup({ mode: 'off' });
    assert.equal(off.zone.hidden, true);
    assert.equal(off.scripts.length, 0);
});

test('화면에 접근한 뒤에만 PC 728×90·모바일 320×100 광고를 각각 한 번 요청한다', () => {
    for (const desktop of [true, false]) {
        const state = setup({ desktop });
        assert.equal(state.scripts.length, 0);
        state.enter();
        state.enter();
        assert.equal(state.scripts.length, 1);
        const ad = state.host.children[0].children[0];
        assert.equal(ad.dataset.adWidth, desktop ? '728' : '320');
        assert.equal(ad.dataset.adHeight, desktop ? '90' : '100');
        assert.equal(ad.dataset.adUnit, 'DAN-testCostUnit');
        assert.equal(state.fallback.hidden, true);
    }
});

test('NOAD는 해당 광고만 복귀시키며 스크립트 실패·미로딩도 문의 배너를 복원한다', () => {
    const noAd = setup();
    noAd.enter();
    noAd.scope.careCostAdFailed({});
    assert.equal(noAd.fallback.hidden, true);
    noAd.scope.careCostAdFailed(noAd.host.children[0].children[0]);
    assert.equal(noAd.fallback.hidden, false);
    assert.equal(noAd.host.children[0].hidden, true);
    for (const failure of ['script', 'timeout']) {
        const state = setup();
        state.enter();
        if (failure === 'script') state.scripts[0].onerror();
        else state.timers[0]();
        assert.equal(state.fallback.hidden, false);
        assert.equal(state.host.dataset.state, 'direct');
    }
});

test('정상 광고는 시간 경과로 숨기지 않으며 화면 회전·폭 부족은 중복 요청 없이 복귀한다', () => {
    const state = setup();
    state.enter();
    state.host.children[0].iframe = {};
    state.timers[0]();
    assert.equal(state.fallback.hidden, true);
    state.callbacks.media();
    assert.equal(state.fallback.hidden, false);
    assert.equal(state.scripts.length, 1);
    const narrow = setup({ desktop: false });
    narrow.enter();
    narrow.host.clientWidth = 280;
    narrow.callbacks.resize();
    assert.equal(narrow.fallback.hidden, false);
    assert.equal(narrow.scripts.length, 1);
});
/** SOFTM-COST-ADS-TEST END */
