/** SOFTM-LIST-MODE START 날짜:20260930 : 전체 목록 집계와 모드 전환이 데이터 범위·기존 공유 조건을 보존하는지 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../care-list-mode.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function createElement() {
    return {
        dataset: {}, attributes: {}, children: [], listeners: {}, hidden: false, innerHTML: '',
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, handler) { this.listeners[name] = handler; },
        append(node) { this.children.push(node); }
    };
}

function setup(href = 'https://homecare.designboard.net/index.html?type=facility') {
    const body = createElement(), nodes = new Map(), replacements = [];
    const buttons = ['list', 'map'].map(mode => ({ ...createElement(), dataset: { careModeChoice: mode } }));
    const list = { before(node) { nodes.set(node.id, node); } };
    body.classList = { contains: () => false };
    body.style = { setProperty() {} };
    nodes.set('list', list);
    let synced = 0;
    const location = { href }, historyState = { retained: 'history state' };
    const context = {
        URL, location,
        document: {
            body, createElement,
            getElementById: id => nodes.get(id) || null,
            querySelector: () => null,
            querySelectorAll: selector => selector === '[data-care-mode-choice]' ? buttons : []
        },
        history: {
            state: historyState,
            replaceState(state, title, url) { replacements.push({ state, title, url: String(url) }); location.href = String(url); }
        },
        CareMapExperience: { syncMode() { synced++; } }
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    return { api: context.CareListMode, body, buttons, nodes, location, historyState, replacements, synced: () => synced };
}

test('URL의 명시적 목록모드만 복원하고 기존 주소와 잘못된 모드는 지도모드로 연다', () => {
    const { api } = setup();
    assert.equal(api.resolveMode('https://homecare.designboard.net/?mode=list&type=daycare'), 'list');
    for (const query of ['', '?mode=map', '?mode=LIST', '?mode=unknown', '?type=list']) {
        assert.equal(api.resolveMode(`https://homecare.designboard.net/${query}`), 'map');
    }
    assert.equal(setup('https://homecare.designboard.net/?mode=list').body.dataset.careMode, 'list');
});

test('90개를 넘는 전체 기관을 기관기호로 집계하고 동일 명칭의 별도 등록과 지역을 구분한다', () => {
    const { api } = setup();
    const rows = Array.from({ length: 135 }, (_, index) => ({
        i: `id-${index}`, n: '같은 기관명', p: index < 100 ? '서울특별시' : '경기도',
        c: index < 100 ? '중구' : '수원시', g: index < 100 ? 'A' : '', ey: index < 100 ? 2025 : ''
    }));
    rows.push({ ...rows[0] }, { ...rows[134] });
    const report = plain(api.summarize(rows, 'facility'));
    assert.equal(report.total, 135);
    assert.equal(report.regions, 2);
    assert.equal(report.evaluated, 100);
    assert.deepEqual(report.grades, { A: 100, B: 0, C: 0, D: 0, E: 0, unknown: 35 });
    assert.deepEqual(report.years, ['2025']);
});

test('평가 미확인을 낮은 등급과 구분하며 빈 결과와 평가연도 누락을 처리한다', () => {
    const { api } = setup();
    const report = plain(api.summarize([
        { i: '1', ev: { grade: 'B', year: 2024 } },
        { i: '2', g: 'E', ey: 2025 },
        { i: '3', g: '미평가', ey: 2026 },
        { i: '4', g: 'C' },
        { i: '5' }
    ], 'facility'));
    assert.equal(report.evaluated, 3);
    assert.equal(report.grades.E, 1);
    assert.equal(report.grades.unknown, 2);
    assert.deepEqual(report.years, ['2024', '2025']);
    assert.equal(api.summarize([], 'facility').total, 0);
    assert.equal(api.summarize([], 'facility').regions, 0);
});

test('요양병원 요약에는 공단 평가 수치나 등급을 표시하지 않고 심평원 출처를 구분한다', () => {
    const { api, nodes } = setup('https://homecare.designboard.net/?mode=list&type=nursing-hospital');
    api.mount({});
    api.renderSummary([{ i: 'hospital', p: '서울특별시', c: '중구', g: 'A', ey: 2025 }], { type: 'nursing-hospital', scope: '서울', sourceDate: '2026-09-30' });
    const summary = nodes.get('careListSummary');
    assert.equal(summary.hidden, false);
    assert.match(summary.innerHTML, /심평원 의료기관 개설현황/);
    assert.match(summary.innerHTML, /공단 장기요양 평가 대상이 아닙니다/);
    assert.doesNotMatch(summary.innerHTML, /공단 평가 확인|평가 미확인|A등급|평가연도/);
    assert.equal(api.summarize([], 'nursing-hospital').hospital, true);
});

test('목록 요약의 지역명과 자료 기준일은 HTML로 해석하지 않으며 빈 평가 상태를 표시한다', () => {
    const { api, nodes } = setup('https://homecare.designboard.net/?mode=list');
    api.mount({});
    api.renderSummary([], { type: 'facility', scope: '<img src=x>', sourceDate: '<b>기준일</b>' });
    const html = nodes.get('careListSummary').innerHTML;
    assert.match(html, /&lt;img src=x&gt;/);
    assert.match(html, /&lt;b&gt;기준일&lt;\/b&gt;/);
    assert.match(html, /평가연도 미확인/);
    assert.match(html, /미확인은 낮은 평가를 뜻하지 않습니다/);
});

test('모드 전환은 기존 검색·공유 쿼리와 해시·history state를 보존하고 반복 선택은 재실행하지 않는다', async () => {
    const initial = 'https://homecare.designboard.net/index.html?type=facility&q=%EC%9A%94%EC%96%91&p=%EC%84%9C%EC%9A%B8&basket=one%2Ctwo#institution';
    const s = setup(initial), events = [];
    s.api.mount({
        beforeChange: (next, previous) => events.push(`before:${previous}:${next}`),
        change: async (next, previous) => events.push(`change:${previous}:${next}`)
    });
    s.api.mount({ change: () => assert.fail('중복 mount는 기존 설정을 교체하면 안 됩니다.') });
    assert.equal(s.body.children.length, 1);
    await s.api.setMode('list');
    assert.equal(s.api.isList(), true);
    assert.equal(s.body.dataset.careMode, 'list');
    assert.equal(s.nodes.get('careListSummary').hidden, false);
    assert.equal(s.buttons[0].attributes['aria-pressed'], 'true');
    assert.equal(s.buttons[1].attributes['aria-pressed'], 'false');
    const listUrl = new URL(s.location.href), initialUrl = new URL(initial);
    assert.equal(listUrl.searchParams.get('mode'), 'list');
    listUrl.searchParams.delete('mode');
    assert.equal(listUrl.href, initialUrl.href);
    assert.equal(s.replacements[0].state, s.historyState);
    await s.api.setMode('list');
    assert.equal(s.replacements.length, 1);
    await s.api.setMode('map');
    await s.api.setMode('map');
    assert.equal(s.location.href, initial);
    assert.equal(s.body.dataset.careMode, 'map');
    assert.equal(s.nodes.get('careListSummary').hidden, true);
    assert.equal(s.buttons[0].attributes['aria-pressed'], 'false');
    assert.equal(s.buttons[1].attributes['aria-pressed'], 'true');
    assert.equal(s.replacements.length, 2);
    assert.equal(s.synced(), 3);
    assert.deepEqual(events, ['before:map:list', 'change:map:list', 'before:list:map', 'change:list:map']);
});

test('지도 전환의 반환 Promise는 실제 준비 완료까지 기다리고 실패는 연결된 오류 처리기로 전달한다', async () => {
    const s = setup('https://homecare.designboard.net/?mode=list');
    let finish, settled = false;
    s.api.mount({ change: () => new Promise(resolve => { finish = resolve; }) });
    const pending = s.api.setMode('map').then(() => { settled = true; });
    await Promise.resolve();
    assert.equal(s.body.dataset.careMode, 'map');
    assert.equal(settled, false);
    finish();
    await pending;
    assert.equal(settled, true);
    const failed = setup(), expected = new Error('준비 실패'), received = [];
    failed.api.mount({ change: async () => { throw expected; }, error: error => received.push(error) });
    await failed.api.setMode('list');
    assert.deepEqual(received, [expected]);
});

/** SOFTM-LIST-MODE-RACE START 날짜:20260930 : 빠른 왕복 전환에서 이전 완료가 최신 지도 복원을 해제하거나 오래된 오류를 노출하지 않도록 검증 */
test('빠른 목록·지도·목록 전환에서는 마지막 전환만 현재 상태를 완료하고 이전 오류를 무시한다', async () => {
    const s = setup(), transitions = [], resumed = [], errors = [];
    s.api.mount({
        async change(next, previous, transition) {
            let resolve, reject;
            const pending = new Promise((finish, fail) => { resolve = finish; reject = fail; });
            transitions.push({ next, previous, current: transition.current, resolve, reject });
            try { await pending; }
            finally { if (transition.current()) resumed.push(next); }
        },
        error: error => errors.push(error)
    });
    const first = s.api.setMode('list');
    assert.equal(transitions[0].current(), true);
    const second = s.api.setMode('map');
    assert.equal(transitions[0].current(), false);
    assert.equal(transitions[1].current(), true);
    const latest = s.api.setMode('list');
    assert.deepEqual(transitions.map(item => item.current()), [false, false, true]);
    transitions[0].resolve();
    transitions[1].reject(new Error('이전 지도 준비 실패'));
    await Promise.all([first, second]);
    assert.deepEqual(resumed, [], '오래된 finally는 진행 중인 최신 전환을 해제하면 안 됩니다.');
    assert.deepEqual(errors, []);
    assert.equal(transitions[2].current(), true);
    transitions[2].resolve();
    await latest;
    assert.deepEqual(resumed, ['list']);
    assert.equal(s.api.isList(), true);
    assert.equal(s.body.dataset.careMode, 'list');
    assert.equal(new URL(s.location.href).searchParams.get('mode'), 'list');
    assert.equal(s.buttons[0].attributes['aria-pressed'], 'true');
    assert.equal(s.buttons[1].attributes['aria-pressed'], 'false');
});
/** SOFTM-LIST-MODE-RACE END */

function setupListQuery() {
    const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const querySource = html.slice(html.indexOf('async function refreshCareList('), html.indexOf('function initCareListMode('));
    const timers = [], summaries = [], published = [], rendered = [], elements = {
        q: { value: ' 기관 ' }, province: { value: '서울특별시' }, city: { value: '중구' },
        list: { scrollTop: 500 }, routeNote: { textContent: '' }
    };
    let revision = 0, listMode = true, filtersApplied = 0, renderGate;
    const context = {
        URL, TYPE: 'facility', CONFIG: { sourceDate: '2026-09-30' }, refreshTimer: 0,
        filtered: [], areaRows: [], careMatchRows: [], resultCount: 0, careUnresolvedCount: 0,
        location: { href: 'https://homecare.designboard.net/?type=facility&mode=list&basket=one#saved' },
        history: { state: { retained: true }, replaceState(state, title, url) { context.location.href = String(url); } },
        $: id => elements[id],
        beginCareQuery() { const id = ++revision; return { current: () => id === revision }; },
        clearTimeout() {}, setTimeout(callback) { timers.push(callback); },
        careViewportResearch: { cancel() {} }, closeDetail() {},
        CareListMode: { isList: () => listMode, renderSummary(rows, meta) { summaries.push({ ids: rows.map(row => row.i), meta }); } },
        applyFilters() { filtersApplied++; },
        async renderList(query) {
            const ids = context.areaRows.map(row => row.i), gate = renderGate;
            renderGate = null;
            if (gate) await gate;
            if (query.current()) rendered.push(ids);
        },
        publishCareResult(query, result) { assert.equal(query.current(), true); published.push(result); return result; },
        geocode() { assert.fail('목록 조회에서 좌표 변환을 호출하면 안 됩니다.'); },
        map: new Proxy({}, { get() { assert.fail('목록 조회에서 지도 상태를 읽으면 안 됩니다.'); } })
    };
    vm.createContext(context); vm.runInContext(querySource, context);
    return {
        context, elements, summaries, published, rendered,
        flush() { for (const callback of timers.splice(0)) callback(); },
        filtersApplied: () => filtersApplied,
        leaveList() { listMode = false; revision++; },
        deferRender() { let release; renderGate = new Promise(resolve => { release = resolve; }); return release; }
    };
}

test('실제 목록 조회는 지도·좌표 변환 없이 전체 135개 결과를 목록과 요약에 전달한다', async () => {
    const s = setupListQuery();
    s.context.filtered = Array.from({ length: 135 }, (_, index) => ({ i: String(index) }));
    const pending = s.context.refreshCareList(); s.flush();
    const result = await pending;
    assert.equal(s.context.areaRows.length, 135);
    assert.equal(s.context.careMatchRows.length, 135);
    assert.equal(s.summaries[0].ids.length, 135);
    assert.equal(s.rendered[0].length, 135);
    assert.equal(s.context.resultCount, 135);
    assert.equal(s.elements.list.scrollTop, 0);
    assert.deepEqual(plain(result), { count: 135, markerCount: 0, mapReady: false, scope: '서울특별시 중구' });
    const url = new URL(s.context.location.href);
    assert.equal(url.searchParams.get('q'), '기관');
    assert.equal(url.searchParams.get('p'), '서울특별시');
    assert.equal(url.searchParams.get('mode'), 'list');
    assert.equal(url.searchParams.get('basket'), 'one');
    assert.equal(url.hash, '#saved');
});

test('대기 중 취소한 목록 조회는 필터·목록·완료 알림을 변경하지 않는다', async () => {
    const s = setupListQuery();
    s.context.filtered = [{ i: 'old' }];
    const pending = s.context.refreshCareList(); s.leaveList(); s.flush();
    assert.equal((await pending).cancelled, true);
    assert.equal(s.filtersApplied(), 0);
    assert.equal(s.summaries.length, 0);
    assert.equal(s.rendered.length, 0);
    assert.equal(s.published.length, 0);
    assert.equal(s.elements.list.scrollTop, 500);
});

test('늦게 끝난 이전 목록 조회는 새 조건의 결과와 완료 알림을 덮지 않는다', async () => {
    const s = setupListQuery();
    s.context.filtered = [{ i: 'old' }];
    const release = s.deferRender(), previous = s.context.refreshCareList();
    s.flush(); await Promise.resolve();
    s.context.filtered = [{ i: 'new-1' }, { i: 'new-2' }];
    const current = s.context.refreshCareList(); s.flush();
    assert.equal((await current).count, 2);
    release();
    assert.equal((await previous).cancelled, true);
    assert.deepEqual(plain(s.context.areaRows), [{ i: 'new-1' }, { i: 'new-2' }]);
    assert.deepEqual(plain(s.rendered), [['new-1', 'new-2']]);
    assert.equal(s.published.length, 1);
    assert.equal(s.published[0].count, 2);
});

function setupModeWorkspace() {
    const code = fs.readFileSync(new URL('../map-experience.js', import.meta.url), 'utf8');
    const lifecycle = code.slice(code.indexOf('    let modeMapSuspended = false;'), code.indexOf('    function setView('));
    const focus = code.slice(code.indexOf('    function focusSearchMap('), code.indexOf('    /** SOFTM-SEARCH-MAP-SCROLL END */'));
    const saved = code.slice(code.indexOf('    function showSaved('), code.indexOf('    function setWorkspace('));
    const exit = code.match(/^    function exitBasketMap\([^\n]+/m)?.[0];
    assert.ok(lifecycle && focus && saved && exit, '모드 복원 및 담은 기관 함수가 있어야 합니다.');
    const events = [];
    let listMode = false, active = true;
    const context = {
        workspace: 'saved', view: 'map', bar: {}, readyTimer: 1, routeRevision: 0,
        routePanel: false, originState: { origin: null }, originController: { cancel() { events.push('cancel-origin'); } },
        isListMode: () => listMode, clearTimeout() {}, setTimeout() { assert.fail('준비된 지도의 재시도는 필요하지 않습니다.'); },
        syncView() { events.push(`sync:${context.workspace}`); }, rows: () => [{ i: 'saved-1' }],
        options: { resizeMap() { events.push('resize'); }, basketMap: { ready: () => true } },
        basketMap: {
            active: () => active,
            exit() { active = false; events.push('exit-map'); },
            async show(rows) { active = true; events.push(`show:${rows[0].i}`); return { phase: 'ready' }; }
        },
        setWorkspace(next) { context.workspace = next; events.push(`workspace:${next}`); }
    };
    vm.createContext(context); vm.runInContext(lifecycle + focus + saved + exit, context);
    return { context, events, setList(value) { listMode = value; } };
}

test('담은 기관 탭에서 모드를 바꿔도 내부 검색은 탭을 변경하지 않고 검색 복원 뒤 담은 지도를 표시한다', async () => {
    const s = setupModeWorkspace(), c = s.context;
    c.suspendModeMap(); s.setList(true); c.syncMode();
    c.exitBasketMap(); c.focusSearchMap(); c.resumeModeMap();
    assert.equal(c.workspace, 'saved');
    assert.equal(s.events.some(event => event.startsWith('show:')), false);
    c.suspendModeMap(); s.setList(false); c.syncMode();
    c.exitBasketMap(); c.focusSearchMap();
    assert.equal(c.workspace, 'saved');
    assert.equal(s.events.some(event => event.startsWith('show:')), false);
    s.events.push('search-restored');
    await c.resumeModeMap();
    assert.equal(c.workspace, 'saved');
    assert.equal(s.events.filter(event => event === 'show:saved-1').length, 1);
    assert.ok(s.events.indexOf('search-restored') < s.events.indexOf('show:saved-1'));
    assert.equal(s.events.some(event => event.startsWith('workspace:')), false);
    c.exitBasketMap();
    assert.equal(c.workspace, 'search', '전환이 끝난 뒤 명시적인 새 검색의 기존 탭 전환은 유지합니다.');
});

test('목록에서 직접 선택한 검색 탭은 지도 복귀 때 이전 담은 기관 탭으로 되돌리지 않는다', async () => {
    const s = setupModeWorkspace(), c = s.context;
    c.suspendModeMap(); s.setList(true); c.syncMode(); c.resumeModeMap();
    c.setWorkspace('search');
    c.suspendModeMap(); s.setList(false); c.syncMode(); await c.resumeModeMap();
    assert.equal(c.workspace, 'search');
    assert.equal(s.events.some(event => event.startsWith('show:')), false);
});

test('모드 전환으로 중단한 실제 담은 기관 지도는 늦은 좌표 응답으로 마커를 다시 만들지 않는다', async () => {
    const s = setupModeWorkspace(), c = s.context;
    vm.runInContext(fs.readFileSync(new URL('../care-basket-map.js', import.meta.url), 'utf8'), c);
    let resolvePosition, placed = 0, restored = 0;
    c.basketMap = c.CareBasketMap.create({
        ready: () => true, capture: () => ({ search: true }), clear() {}, restore() { restored++; },
        geocode: () => new Promise(resolve => { resolvePosition = resolve; }),
        place() { placed++; }, fit() {}
    });
    const previous = c.showSaved();
    await Promise.resolve();
    assert.equal(typeof resolvePosition, 'function');
    c.suspendModeMap(); s.setList(true); c.syncMode(); c.resumeModeMap();
    resolvePosition({ lat: 37.5, lng: 127 }); await previous;
    assert.equal(c.workspace, 'saved');
    assert.equal(placed, 0);
    assert.equal(restored, 1);
    assert.equal(c.basketMap.active(), false);
});
/** SOFTM-LIST-MODE END */
