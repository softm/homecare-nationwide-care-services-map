/** SOFTM-MAP-ENTRY-LOCATION START 날짜:20260930 : 위치를 허용했는데 첫 지도 전환이 기본 지도에 머무르거나 늦은 응답이 새 탐색을 덮는 회귀를 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const currentLocation = html.slice(html.indexOf('async function useCurrentLocation('), html.indexOf('/** SOFTM-LOCATION END */'));
const modeStart = html.indexOf('function initCareListMode(');
const modeEntry = html.slice(modeStart, html.indexOf('\n CareListView.mount();', modeStart)) + '\n}';
const point = { lat: 37.4712481, lng: 126.8096277 };

function setup({ search = '', province = '', ready = false, deferMap = false } = {}) {
    let config, listMode = true, locationResolve, locationReject, activeTransition = true;
    const calls = [], elements = {
        q: { value: search }, province: { value: province }, city: { value: '' },
        list: { innerHTML: '', scrollTop: 0 }, sort: { value: 'rating' },
        locateBtn: { disabled: false, setAttribute() {}, removeAttribute() {} }
    };
    const context = {
        TYPE: 'facility', mapReady: ready, careListMapStarting: false, careListMapState: null,
        careMapFocus: null, careListLocation: null, careViewportResearch: null, advancedSearch: null,
        refreshTimer: null, refreshToken: 0, careListVersion: 0, initialLocationViewport: null,
        skipIdleUntil: 0, setTimeout: callback => { callback(); }, clearTimeout() {},
        $: id => elements[id], closeDetail() {}, hideLoading() {}, showLoading() {}, setStatus() {}, toast() {},
        clearMapOnlyCareAds() {}, initCareAds() {}, initExpandedCareAds() {}, syncCareListSort() {}, renderNav() {},
        CareListView: { sync() {} }, CareListAds: { sync() {} },
        CareListMode: { isList: () => listMode, mount(value) { config = value; } },
        CareMapExperience: { suspendModeMap() {}, resumeModeMap() { calls.push('resume'); } },
        loadNaver() { calls.push('sdk'); if (!deferMap) context.mapReady = true; },
        careViewportKey: () => 'initial-map',
        beginCareQuery() { const token = ++context.refreshToken; return { current: () => token === context.refreshToken }; },
        CareLocation: {
            hideNotice() {}, info: () => ({ title: '위치 실패', message: '다시 확인해 주세요.' }),
            showNotice() { calls.push('notice'); },
            request(options) {
                calls.push('location');
                assert.equal(options.isCurrent(), true);
                return new Promise((resolve, reject) => { locationResolve = resolve; locationReject = reject; });
            }
        },
        setBase(value, label, pan, current) { calls.push(['center', value, label, pan, current]); },
        async refreshFromMap(query) { assert.equal(query.current(), true); calls.push('nearby'); return { count: 4 }; },
        async restoreCareRecentRegion(query) { assert.equal(query.current(), true); calls.push('fallback'); },
        async searchByControls(...args) { calls.push(['search', ...args]); }
    };
    vm.createContext(context);
    vm.runInContext(currentLocation + '\n' + modeEntry, context);
    context.initCareListMode();
    return {
        context, calls, elements,
        enter() {
            config.beforeChange('map'); listMode = false;
            return config.change('map', 'list', { current: () => activeTransition });
        },
        succeed() { locationResolve(point); }, fail() { locationReject({ reason: 'denied' }); },
        cancelToList() { activeTransition = false; listMode = true; context.refreshToken++; },
        newSearch() { context.refreshToken++; }
    };
}

test('목록에서 첫 지도 진입은 현재 위치를 요청하고 그 좌표의 주변 조회까지 기다린다', async () => {
    const s = setup(), pending = s.enter();
    assert.deepEqual(s.calls, ['sdk', 'location']);
    assert.equal(s.elements.locateBtn.disabled, true);
    s.succeed(); await pending;
    assert.deepEqual(s.calls, ['sdk', 'location', ['center', point, '현재 위치', true, true], 'nearby', 'resume']);
    assert.equal(s.elements.locateBtn.disabled, false);
    assert.equal(s.context.careListMapStarting, false);
});

test('목록에서 직접 정한 지역·기관 검색은 첫 지도에서도 유지한다', async () => {
    for (const options of [{ search: '아이러브요양원' }, { province: '경기도' }]) {
        const s = setup(options); await s.enter();
        assert.deepEqual(s.calls, ['sdk', ['search', false, false], 'resume']);
    }
});

test('첫 지도 위치 거절은 기존 최근 지역·기본 지도 복구 경로를 사용한다', async () => {
    const s = setup(), pending = s.enter(); s.fail(); await pending;
    assert.deepEqual(s.calls, ['sdk', 'location', 'fallback', 'resume']);
    assert.equal(s.elements.locateBtn.disabled, false);
});

test('위치 응답 전 목록 복귀와 새 검색은 늦은 현재 위치 이동·조회·오류를 취소한다', async () => {
    for (const cancel of ['cancelToList', 'newSearch']) {
        for (const complete of ['succeed', 'fail']) {
            const s = setup(), pending = s.enter(); s[cancel](); s[complete](); await pending;
            assert.equal(s.calls.some(call => Array.isArray(call) && call[0] === 'center'), false);
            assert.equal(s.calls.includes('nearby'), false);
            assert.equal(s.calls.includes('fallback'), false);
            assert.equal(s.calls.includes('notice'), false);
            assert.equal(s.elements.locateBtn.disabled, false);
        }
    }
});

test('지도 준비 전에 목록으로 돌아가면 위치 요청을 시작하지 않는다', async () => {
    const s = setup({ deferMap: true });
    s.context.setTimeout = callback => { s.cancelToList(); callback(); };
    await s.enter();
    assert.deepEqual(s.calls, ['sdk']);
});

const unselectedStart = html.indexOf('async function locateUnselectedCareMap(');
const unselectedEntry = html.slice(unselectedStart, html.indexOf('/** SOFTM-MAP-ENTRY-LOCATION END */', unselectedStart));
function setupUnselected() {
    let resolve, reject, view = 'initial', list = false;
    const moved = [], context = {
        TYPE: '', refreshToken: 0, neutralViewportChosen: false,
        careViewportKey: () => view, CareListMode: { isList: () => list },
        CareLocation: { request: () => new Promise((done, fail) => { resolve = done; reject = fail; }) },
        followInitialCareLocation(value) { context.neutralViewportChosen = true; moved.push(value); }
    };
    vm.createContext(context); vm.runInContext(unselectedEntry, context);
    return { context, moved, succeed: () => resolve(point), fail: () => reject({ reason: 'denied' }),
        move: () => { view = 'user-map'; }, list: () => { list = true; } };
}

test('유형 미선택 지도도 위치 허용 상태에서 현재 위치를 지도에 전달한다', async () => {
    const s = setupUnselected(), pending = s.context.locateUnselectedCareMap();
    s.succeed(); await pending; assert.deepEqual(s.moved, [point]);
    assert.match(html, /void locateUnselectedCareMap\(\);return;/);
});

test('유형 미선택의 공유 위치·직접 이동·모드 변경·위치 실패는 기존 지도를 보존한다', async () => {
    const shared = setupUnselected(); shared.context.neutralViewportChosen = true;
    shared.context.CareLocation.request = () => assert.fail('명시한 지도 위치를 다시 조회하면 안 됩니다.');
    await shared.context.locateUnselectedCareMap();
    for (const cancel of ['move', 'list', 'fail']) {
        const s = setupUnselected(), pending = s.context.locateUnselectedCareMap();
        s[cancel](); if (cancel !== 'fail') s.succeed(); await pending;
        assert.deepEqual(s.moved, []);
    }
});
test('미결정 권한의 초기 전달과 지도 요청이 겹쳐도 한 번만 이동하고 직접 탐색 뒤에는 이동하지 않는다', async () => {
    const followStart = html.indexOf('function followInitialCareLocation(');
    const follow = html.slice(followStart, html.indexOf('/** SOFTM-LOCATION-FOLLOW END */', followStart));
    for (const [shared, movedByUser] of [[false, false], [false, true], [true, false], [true, true]]) {
        let success, view = 'initial';
        const moved = [], context = {
            TYPE: '', refreshToken: 0, neutralViewportChosen: shared, neutralInitialView: {token: 0, view: 'initial'},
            isSecureContext: true, careViewportKey: () => view,
            CareListMode: { isList: () => false },
            navigator: { permissions: { query: async () => ({ state: 'prompt' }) },
                geolocation: { getCurrentPosition(resolve) { success = resolve; } } },
            setBase(value) { moved.push(value); }, setStatus() {}
        };
        vm.createContext(context);
        vm.runInContext(readFileSync(new URL('../care-location.js', import.meta.url), 'utf8') + '\n' + follow + '\n' + unselectedEntry, context);
        const startup = context.CareLocation.requestInitialPermission();
        await new Promise(resolve => setImmediate(resolve));
        context.CareLocation.connectInitialPosition(context.followInitialCareLocation);
        const entry = context.locateUnselectedCareMap();
        if (movedByUser) { context.neutralViewportChosen = true; view = 'user-map'; }
        success({ coords: { latitude: point.lat, longitude: point.lng } });
        await Promise.all([startup, entry]);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(moved.length, movedByUser ? 0 : 1);
    }
});
/** SOFTM-MAP-ENTRY-LOCATION END */
