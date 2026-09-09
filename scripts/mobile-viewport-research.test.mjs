/** SOFTM-VIEWPORT-RESEARCH START 날짜:20260909 : 짧은 광고 목록과 내부 이동 직후 사용자 확대의 누락·중복을 회귀 검사 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../map-experience.js';
function setup() {
    let job, searches = 0, preparations = 0, enabled = true;
    const clock = { setTimeout(fn) { job = fn; return 1; }, clearTimeout() { job = null; } };
    const controller = CareMapExperience.createZoomResearch({ enabled: () => enabled, prepare: () => preparations++, search: () => searches++ }, clock);
    return { controller, flush() { const fn = job; job = null; fn?.(); }, counts: () => ({ searches, preparations }), disable() { enabled = false; } };
}
test('내부 확대에는 검색하지 않고 바로 뒤 사용자 확대는 대기 중이어도 조회한다', () => {
    const s = setup(); s.controller.zoom(); s.flush(); assert.equal(s.counts().searches, 0);
    s.controller.gesture(); s.controller.zoom(); assert.equal(s.controller.pending(), true);
    s.controller.idle(); s.flush(); assert.equal(s.counts().searches, 1); assert.equal(s.controller.pending(), false);
});
test('연속 확대와 idle은 마지막 범위 한 번만 조회하고 취소·담은 기관 전환은 중단한다', () => {
    const s = setup(); s.controller.gesture();
    for (let i = 0; i < 5; i++) { s.controller.zoom(); s.controller.idle(); }
    s.flush(); assert.equal(s.counts().searches, 1);
    s.controller.zoom(); s.controller.cancel(); s.flush(); assert.equal(s.counts().searches, 1);
    s.controller.gesture(); s.controller.zoom(); s.disable(); s.flush(); assert.equal(s.counts().searches, 1);
});
test('핀치 중 dragstart가 섞여도 확대 의도를 보존해 마지막 영역을 조회한다', () => {
    const s = setup(); s.controller.gesture(); s.controller.drag(); s.controller.zoom();
    s.controller.idle(); s.flush(); assert.equal(s.counts().searches, 1);
});
test('이 지역 재검색은 사용자 줌 없이 즉시 실행하고 예약된 조회를 대체한다', () => {
    const s = setup(); s.controller.research(); assert.equal(s.counts().searches, 1);
    s.controller.gesture(); s.controller.zoom(); s.controller.research(); s.flush(); assert.equal(s.counts().searches, 2);
});
for (const name of ['nationwide-care-services-map.html', 'nationwide-daycare-map.html']) {
    test(`${name}: 1~5건은 끝에 한 광고, 6·12·18건은 기존 슬롯 유지`, () => {
        const html = fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
        const start = html.indexOf('function listAdHtml('), end = html.indexOf('/** SOFTM-LIST-AD-RESTORE END */', start);
        const config = { placements: { listNative: true, listAfter: 6, listRepeat: 6 }, kakao: { list: { unit: 'unit', width: 320, height: 100 } } };
        let mode = 'hybrid';
        const context = { AD_CONFIG: config, careAdConfig: () => config, careAdMode: () => mode, adMode: () => mode, configuredListAds: () => [config.kakao.list], kakaoIns: () => 'KAKAO', esc: x => x, activeDirectAd: () => ({}), directAds: () => [{}], directAdHtml: () => 'DIRECT', page: 1 };
        vm.createContext(context); vm.runInContext(html.slice(start, end), context);
        for (const total of [1, 2, 3, 4, 5, 6, 12, 18]) {
            const slots = Array.from({ length: total }, (_, i) => context.listAdHtml(i, total)).map((ad, i) => ad ? i + 1 : 0).filter(Boolean);
            assert.deepEqual(slots, total < 6 ? [total] : Array.from({ length: Math.floor(total / 6) }, (_, i) => (i + 1) * 6));
        }
        mode = 'off'; assert.equal(context.listAdHtml(2, 3), '');
        mode = 'kakao'; assert.equal(context.listAdHtml(11, 12), '');
        mode = 'direct'; assert.equal(context.listAdHtml(2, 3), 'DIRECT');
    });
}
/** SOFTM-VIEWPORT-RESEARCH END */
/** SOFTM-SHORT-LIST-AD START 날짜:20260909 : 이미 표시된 광고와 교체된 이전 목록을 건드리지 않고 미노출 슬롯만 대체 */
test('광고 미노출만 제휴 배너로 대체하고 표시 광고·이전 목록은 유지한다', () => {
    const code = fs.readFileSync(new URL('../map-experience.js', import.meta.url), 'utf8');
    const jobs = [], context = { root: { setTimeout(fn) { jobs.push(fn); } } };
    vm.createContext(context); vm.runInContext(code.slice(code.indexOf('    function ensureListAdFallback'), code.indexOf('    function createZoomResearch')), context);
    const empty = { isConnected: true, querySelector: () => null, innerHTML: 'empty' };
    const shown = { isConnected: true, querySelector: () => ({}), innerHTML: 'ad' };
    const detached = { isConnected: false, querySelector: () => null, innerHTML: 'old' };
    context.ensureListAdFallback({ querySelectorAll: () => [empty, shown, detached] }, () => 'partner');
    jobs.forEach(fn => fn());
    assert.deepEqual([empty.innerHTML, shown.innerHTML, detached.innerHTML], ['partner', 'ad', 'old']);
});
/** SOFTM-SHORT-LIST-AD END */
