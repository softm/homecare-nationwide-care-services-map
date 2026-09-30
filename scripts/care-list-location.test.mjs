/** SOFTM-LIST-LOCATION-TEST START 날짜:20260930 : 위치 표시·검색의 분리와 지연 응답, 지역명 차이 때문에 기존 검색이 잘못 바뀌는 회귀를 방지 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import '../care-list-location.js';

const { createController, resolveRegion } = globalThis.CareListLocation;
const viewportContext = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../viewport-regions.js', import.meta.url), 'utf8'), viewportContext);
const { regionKey } = viewportContext.window.MapViewportSearch;
const point = { lat: 37.4801, lng: 126.8602 };
const address = { province: '경기도', city: '광명시', neighborhood: '철산동' };
const bounds = Object.fromEntries(['경기도', '서울특별시', '강원특별자치도', '전북특별자치도', '제주특별자치도', '인천광역시', '세종특별자치시', '대전광역시'].map(province => [`${province}|`, [0, 0, 1, 1]]));
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const settle = () => new Promise(resolve => setImmediate(resolve));

function controller(overrides = {}) {
    const rendered = [], applied = [], requests = [];
    let enabled = true, signature = 'original';
    const options = {
        enabled: () => enabled,
        signature: () => signature,
        locate: async config => { requests.push(config); return point; },
        describe: async () => address,
        apply: async value => { applied.push(value); return { scope: '경기도 광명시', count: 1234 }; },
        errorInfo: error => ({ title: '현재 위치 접근이 차단되어 있습니다', message: error.message, reason: error.reason }),
        render: state => rendered.push({ ...state }),
        ...overrides
    };
    const api = createController(options);
    return { api, rendered, applied, requests, setEnabled(value) { enabled = value; }, setSignature(value) { signature = value; } };
}

test('목록 진입은 현재 위치를 한 번 표시하고 기존 검색조건에는 적용하지 않는다', async () => {
    const env = controller();
    env.api.sync();
    assert.equal(env.api.state().phase, 'loading');
    await settle();
    assert.equal(env.api.state().phase, 'ready');
    assert.equal(env.api.state().label, '경기도 광명시 철산동');
    assert.equal(env.applied.length, 0);
    assert.equal(env.requests.length, 1);
    env.api.sync(); await settle();
    assert.equal(env.requests.length, 1);
    assert.equal(env.applied.length, 0);
});

test('현재 위치에서 찾기는 확인한 주소를 적용하고 완료 범위·전체 건수를 표시한다', async () => {
    const env = controller();
    const outcome = await env.api.locate(true);
    assert.deepEqual(env.applied, [address]);
    assert.equal(outcome.count, 1234);
    assert.equal(env.requests[0].isCurrent(), true);
    assert.equal(env.api.state().phase, 'ready');
    assert.match(env.api.state().message, /경기도 광명시 · 1,234곳 검색 완료/);
    assert.ok(env.rendered.some(state => state.phase === 'searching'));
});

test('권한 거절은 검색을 보존하고 반복 자동 요청 없이 오류와 수동 재시도를 제공한다', async () => {
    let calls = 0;
    const denied = Object.assign(new Error('브라우저 위치 권한을 허용해 주세요.'), { reason: 'denied' });
    const env = controller({ locate: async () => { if (++calls === 1) throw denied; return point; } });
    const outcome = await env.api.locate(true);
    assert.equal(outcome.error, denied);
    assert.equal(env.api.state().reason, 'denied');
    assert.equal(env.api.state().phase, 'error');
    assert.equal(env.applied.length, 0);
    env.api.sync(); await settle(); assert.equal(calls, 1);
    await env.api.locate(true);
    assert.equal(calls, 2);
    assert.equal(env.api.state().reason, '');
    assert.equal(env.api.state().phase, 'ready');
    assert.equal(env.applied.length, 1);
});

test('역주소 실패는 확인한 좌표를 남기고 재시도 성공 전에는 지역 검색을 실행하지 않는다', async () => {
    let calls = 0;
    const env = controller({ describe: async () => { if (++calls === 1) throw new Error('주소 서비스 연결 실패'); return address; } });
    await env.api.locate(true);
    assert.equal(env.api.state().phase, 'error');
    assert.match(env.api.state().label, /37\.4801, 126\.8602/);
    assert.equal(env.api.state().message, '주소 서비스 연결 실패');
    assert.equal(env.api.state().reason, '');
    assert.equal(env.applied.length, 0);
    await env.api.locate(true);
    assert.equal(env.api.state().phase, 'ready');
    assert.equal(env.applied.length, 1);
});

test('역주소가 빈 결과면 전국 검색으로 대체하지 않고 오류를 표시한다', async () => {
    const env = controller({ describe: async () => ({}) });
    const result = await env.api.locate(true);
    assert.ok(result.error);
    assert.equal(env.api.state().phase, 'error');
    assert.equal(env.applied.length, 0);
});

for (const phase of ['gps', 'address']) test(`${phase} 응답 대기 중 바뀐 검색조건을 위치 검색이 덮지 않는다`, async () => {
    const wait = deferred();
    const env = controller(phase === 'gps' ? { locate: () => wait.promise } : { describe: () => wait.promise });
    const pending = env.api.locate(true);
    await settle(); env.setSignature('manual-search');
    wait.resolve(phase === 'gps' ? point : address);
    const outcome = await pending;
    assert.equal(outcome.cancelled, true);
    assert.equal(env.applied.length, 0);
    assert.equal(env.api.state().label, '경기도 광명시 철산동');
    assert.match(env.api.state().message, /검색조건이 바뀌어/);
});

for (const phase of ['gps', 'address', 'search']) test(`${phase} 대기 중 지도모드로 바꾸면 늦은 상태·검색 완료를 반영하지 않는다`, async () => {
    const wait = deferred();
    const options = phase === 'gps' ? { locate: () => wait.promise } : phase === 'address' ? { describe: () => wait.promise } : { apply: () => wait.promise };
    const env = controller(options), pending = env.api.locate(true);
    await settle(); env.setEnabled(false); env.api.sync();
    const renders = env.rendered.length;
    wait.resolve(phase === 'gps' ? point : phase === 'address' ? address : { scope: '경기도 광명시', count: 1 });
    assert.equal((await pending).cancelled, true);
    assert.equal(env.rendered.length, renders);
    assert.equal(env.api.state().phase, 'idle');
    assert.equal(env.applied.length, 0);
});

test('오래된 위치 응답이 새 요청의 주소와 완료 상태를 덮지 않는다', async () => {
    const older = deferred(); let calls = 0;
    const env = controller({ locate: () => ++calls === 1 ? older.promise : Promise.resolve(point) });
    const first = env.api.locate(true);
    await env.api.locate(true);
    const renders = env.rendered.length;
    older.resolve({ lat: 0, lng: 0 });
    assert.equal((await first).cancelled, true);
    assert.equal(env.rendered.length, renders);
    assert.equal(env.applied.length, 1);
    assert.equal(env.api.state().label, '경기도 광명시 철산동');
});

test('실제 검색이 취소되면 완료 건수 대신 취소 상태를 표시한다', async () => {
    const env = controller({ apply: async () => ({ cancelled: true }) });
    assert.equal((await env.api.locate(true)).cancelled, true);
    assert.equal(env.api.state().phase, 'ready');
    assert.match(env.api.state().message, /취소/);
    assert.doesNotMatch(env.api.state().message, /검색 완료/);
});

/** SOFTM-LOCATION-TOOLBAR-TEST START 날짜:20260930 : 실제 위치 도구의 버튼 연결이 권한 요청 반복이나 의도하지 않은 지역 검색을 만들지 않도록 검증 */
function mountedLocation({ denied = false } = {}) {
    const requests = [], applied = [], notices = [];
    const conditions = { province: '서울특별시', city: '종로구', query: '기존 기관명' };
    function element(tagName = 'span') {
        const nodes = new Map(), attributes = new Map(), listeners = new Map();
        return { tagName: tagName.toUpperCase(), dataset: {}, children: [], open: false,
            querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, element(selector === 'h2' ? 'h2' : 'button')); return nodes.get(selector); },
            setAttribute(name, value) { attributes.set(name, String(value)); },
            getAttribute(name) { return attributes.get(name) ?? null; },
            append(child) { this.children.push(child); }, insertBefore(child) { this.append(child); },
            addEventListener(name, callback) { listeners.set(name, callback); },
            focus() { document.activeElement = this; },
            showModal() { this.open = true; }, close() { this.open = false; listeners.get('close')?.(); }
        };
    }
    const toolbar = element('div'), document = { body: element('body'), activeElement: null,
        createElement: element, querySelector: selector => selector === '.stitch-filter-toolbar' ? toolbar : null
    };
    const context = vm.createContext({ document, CareLocation: {
        async request(config) { requests.push(config); if (denied) throw Object.assign(new Error('위치 권한 차단'), { reason: 'denied' }); return point; },
        info: error => ({ title: '현재 위치 접근이 차단되어 있습니다', message: error.message, reason: error.reason }),
        showNotice(error, retry) { notices.push({ error, retry }); }, hideNotice() {}
    } });
    vm.runInContext(readFileSync(new URL('../care-list-location.js', import.meta.url), 'utf8'), context);
    const api = context.CareListLocation.mount({ enabled: () => true, signature: () => JSON.stringify(conditions),
        describe: async () => address,
        async apply(value) { applied.push(value); Object.assign(conditions, { province: value.province, city: value.city, query: '' }); return { scope: '경기도 광명시', count: 1234 }; }
    });
    const host = toolbar.children[0];
    return { api, requests, applied, notices, conditions, document, host,
        main: host.querySelector('[data-list-locate]'), help: host.querySelector('[data-list-location-help]') };
}

test('권한이 차단된 위치 찾기 버튼은 재요청 대신 권한 안내를 열고 기존 검색을 유지한다', async () => {
    const env = mountedLocation({ denied: true }); env.api.sync(); await settle();
    assert.equal(env.api.state().phase, 'error');
    const original = { ...env.conditions };
    env.main.onclick(); env.main.onclick(); await settle();
    assert.equal(env.requests.length, 1);
    assert.equal(env.notices.length, 2);
    assert.equal(env.notices[0].error.reason, 'denied');
    assert.equal(typeof env.notices[0].retry, 'function');
    assert.equal(env.applied.length, 0);
    assert.deepEqual(env.conditions, original);
});

test('상세 안내의 위치 다시 확인은 주소만 갱신하고 검색 버튼을 눌러야 지역 검색을 적용한다', async () => {
    const env = mountedLocation(); env.api.sync(); await settle();
    const original = { ...env.conditions };
    env.help.onclick();
    const dialog = env.document.body.children.find(node => node.tagName === 'DIALOG');
    assert.equal(dialog.open, true);
    dialog.querySelector('[data-location-detail-retry]').onclick(); await settle();
    assert.equal(dialog.open, false);
    assert.equal(env.document.activeElement, env.help);
    assert.equal(env.requests.length, 2);
    assert.equal(env.api.state().phase, 'ready');
    assert.equal(env.applied.length, 0);
    assert.deepEqual(env.conditions, original);
    env.main.onclick(); await settle();
    assert.equal(env.requests.length, 3);
    assert.deepEqual(env.applied, [address]);
    assert.deepEqual(env.conditions, { province: '경기도', city: '광명시', query: '' });
});
/** SOFTM-LOCATION-TOOLBAR-TEST END */

test('시·구 공백 차이를 데이터의 실제 지역명으로 연결한다', () => {
    assert.deepEqual(resolveRegion({ province: '경기도', city: '부천시소사구' }, [{ p: '경기도', c: '부천시 소사구' }], regionKey, bounds), { province: '경기도', city: '부천시 소사구' });
});

for (const [oldName, currentName, city] of [['강원도', '강원특별자치도', '춘천시'], ['전라북도', '전북특별자치도', '전주시 완산구'], ['제주도', '제주특별자치도', '제주시']]) test(`${oldName} 역주소를 ${currentName} 수집명과 연결한다`, () => {
    assert.deepEqual(resolveRegion({ province: oldName, city }, [{ p: currentName, c: city }], regionKey, bounds), { province: currentName, city });
});

test('인천 남구의 이전 명칭은 미추홀구와 연결한다', () => {
    assert.deepEqual(resolveRegion({ province: '인천광역시', city: '남구' }, [{ p: '인천광역시', c: '미추홀구' }], regionKey, bounds), { province: '인천광역시', city: '미추홀구' });
});

test('세종은 역주소에 시군구가 없어도 읍면동을 시군구로 사용하지 않는다', () => {
    for (const city of ['', '반곡동', '조치원읍']) {
        assert.deepEqual(resolveRegion({ province: '세종특별자치시', city }, [], regionKey, bounds), { province: '세종특별자치시', city: '세종시' });
    }
});

test('수집기관이 없는 지역도 해당 시군구를 유지해 전국 결과로 넓히지 않는다', () => {
    assert.deepEqual(resolveRegion({ province: '대전광역시', city: '유성구' }, [{ p: '경기도', c: '광명시' }], regionKey, bounds), { province: '대전광역시', city: '유성구' });
});

test('상위 시 단위로 수집한 유형은 같은 시 전체를 명시하고 다른 구를 추정하지 않는다', () => {
    const current = { province: '경기도', city: '화성시 동탄구' };
    assert.deepEqual(resolveRegion(current, [{ p: '경기도', c: '화성시' }], regionKey, bounds), { province: '경기도', city: '화성시' });
    assert.deepEqual(resolveRegion(current, [{ p: '경기도', c: '화성시 만세구' }], regionKey, bounds), current);
});

test('국내 시도 또는 시군구를 확인할 수 없으면 필터 적용 전에 실패한다', () => {
    for (const value of [{ province: 'Tokyo', city: 'Shinjuku' }, { province: '서울특별시', city: '' }, {}]) {
        assert.throws(() => resolveRegion(value, [], regionKey, bounds), /국내 시·군·구/);
    }
});

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sdkSource = html.slice(html.indexOf('let careNaverSdkPromise='), html.indexOf('/** SOFTM-LIST-LOCATION END */', html.indexOf('let careNaverSdkPromise=')));
function sdkEnvironment() {
    let now = 0, timerId = 0, initialized = 0;
    const timers = new Map(), scripts = [];
    const context = vm.createContext({ window: {}, Date: { now: () => now },
        document: { createElement: () => ({ remove() { this.removed = true; } }), head: { appendChild(script) { scripts.push(script); } } },
        setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); },
        initNaver() { initialized++; }, CareListMode: { isList: () => true }, hideLoading() {}, setStatus() {}
    });
    vm.runInContext(sdkSource, context);
    return { context, scripts, initialized: () => initialized, tick(elapsed = 100) { now += elapsed; const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); } };
}

test('목록 역주소와 지도 전환은 SDK 요청 하나를 공유하고 준비만으로 지도를 생성하지 않는다', async () => {
    const env = sdkEnvironment();
    const first = env.context.ensureCareNaverSdk(), second = env.context.ensureCareNaverSdk();
    assert.equal(first, second);
    assert.equal(env.scripts.length, 1);
    assert.match(env.scripts[0].src, /ncpKeyId=etfcybk8vf&submodules=geocoder/);
    env.context.window.naver = { maps: { Service: {} } }; env.tick();
    await Promise.all([first, second]);
    assert.equal(env.initialized(), 0);
    env.context.loadNaver(); await settle();
    assert.equal(env.scripts.length, 1);
    assert.equal(env.initialized(), 1);
});

for (const failure of ['network', 'timeout']) test(`SDK ${failure} 실패 뒤 재시도는 새 요청으로 정상 준비된다`, async () => {
    const env = sdkEnvironment(), pending = env.context.ensureCareNaverSdk();
    const rejected = assert.rejects(pending, /지역명을 불러오지 못했습니다/);
    if (failure === 'network') env.scripts[0].onerror(); else env.tick(12000);
    await rejected;
    assert.equal(env.scripts[0].removed, true);
    const retry = env.context.ensureCareNaverSdk();
    assert.equal(env.scripts.length, 2);
    env.context.window.naver = { maps: { Service: {} } }; env.tick(); await retry;
    assert.equal(env.initialized(), 0);
});

test('실제 필터 적용은 없는 지역 옵션을 추가해 0곳을 보존하고 기존 상세조건을 유지한다', async () => {
    const rows = [{ p: '경기도', c: '광명시' }], selected = {};
    function select(initial) {
        let value = initial;
        return { options: [{ value: '' }, { value: initial }], add(option) { this.options.push(option); }, get value() { return value; }, set value(next) { value = this.options.some(option => option.value === next) ? next : ''; } };
    }
    const nodes = { province: select('경기도'), city: select('광명시'), q: { value: '기존 기관명' } };
    const gradeFilters = new Set(['A']), scoreFilters = new Set(['high']), features = new Set(['green']), messages = [];
    const context = vm.createContext({ careListLocation: null, CareListLocation: { resolveRegion, mount: options => options }, TYPE: 'short-stay', DATA: rows,
        gradeFilters, scoreFilters, advancedSearch: { state: () => ({ features: [...features] }), reset() { features.clear(); } },
        MapViewportSearch: { regionKey }, NATIONAL_REGION_BOUNDS: { regions: bounds }, $: id => nodes[id],
        Option: function (text, value) { this.text = text; this.value = value; },
        updateCities() { nodes.city.options = [{ value: '' }, ...rows.filter(row => row.p === nodes.province.value).map(row => ({ value: row.c }))]; nodes.city.value = ''; },
        async refreshCareList() { Object.assign(selected, { province: nodes.province.value, city: nodes.city.value, q: nodes.q.value }); return { scope: `${nodes.province.value} ${nodes.city.value}`, count: rows.filter(row => row.p === nodes.province.value && row.c === nodes.city.value).length }; },
        toast: value => messages.push(value)
    });
    const start = html.indexOf('careListLocation=CareListLocation.mount(');
    vm.runInContext(html.slice(start, html.indexOf('\n careListLocation.sync();', start)), context);
    const result = await context.careListLocation.apply({ province: '대전광역시', city: '유성구' });
    assert.deepEqual(selected, { province: '대전광역시', city: '유성구', q: '' });
    assert.equal(result.count, 0);
    assert.equal(result.scope, '대전광역시 유성구');
    assert.deepEqual([...gradeFilters], ['A']);
    assert.deepEqual([...scoreFilters], ['high']);
    assert.deepEqual([...features], ['green']);
    assert.match(messages[0], /대전광역시 유성구 · 0곳 검색 완료/);
});

/** SOFTM-LIST-LOCATION-RESTORE START 날짜:20260930 : 현재 위치에서 찾은 0곳 지역을 공유하거나 새로고침해도 전국 결과로 잘못 확장하지 않도록 확인 */
function restoredLocation({ province, city, mode = 'list' }) {
    const rows = [{ p: '경기도', c: '광명시' }];
    function select(values) {
        let value = '';
        return { options: values.map(item => ({ value: item })), add(option) { this.options.push(option); },
            get value() { return value; }, set value(next) { value = this.options.some(option => option.value === next) ? next : ''; } };
    }
    const nodes = { q: { value: '' }, province: select(['', '경기도']), city: select(['', '광명시']) };
    const params = new URLSearchParams({ mode, p: province, c: city, q: '선택한 기관', grades: 'A,B,invalid', scores: 'high', conf: 'medium' });
    const context = vm.createContext({ params, CONFIG: { source: 'nhis' }, CareListMode: { isList: () => mode === 'list' },
        NATIONAL_REGION_BOUNDS: { regions: { ...bounds, '세종특별자치시|세종시': [0, 0, 1, 1] } }, MapViewportSearch: { regionKey },
        $: id => nodes[id], Option: function (text, value) { this.text = text; this.value = value; },
        updateCities() { nodes.city.options = [{ value: '' }, ...rows.filter(row => row.p === nodes.province.value).map(row => ({ value: row.c }))]; nodes.city.value = ''; },
        syncMultiFilterButtons() {}
    });
    const start = html.indexOf('function restoreState()');
    vm.runInContext(html.slice(start, html.indexOf('/** SOFTM-LIST-LOCATION END */', start)), context);
    context.restoreState();
    return { nodes, context, rows };
}

for (const [province, city] of [['대전광역시', '유성구'], ['세종특별자치시', '세종시'], ['경기도', '파주시']]) test(`0곳인 ${province} ${city} 목록 공유·새로고침은 해당 지역과 다른 조건을 복원한다`, () => {
    const { nodes, context, rows } = restoredLocation({ province, city });
    assert.equal(nodes.province.value, province);
    assert.equal(nodes.city.value, city);
    assert.equal(nodes.q.value, '선택한 기관');
    assert.deepEqual([...context.gradeFilters], ['A', 'B']);
    assert.deepEqual([...context.scoreFilters], ['high']);
    assert.deepEqual([...context.confidenceFilters], ['medium']);
    assert.equal(rows.filter(row => (!nodes.province.value || row.p === nodes.province.value) && (!nodes.city.value || row.c === nodes.city.value)).length, 0);
});

test('기존 지역의 목록 URL은 옵션을 중복 추가하지 않고 그대로 복원한다', () => {
    const { nodes } = restoredLocation({ province: '경기도', city: '광명시' });
    assert.equal(nodes.province.value, '경기도');
    assert.equal(nodes.city.value, '광명시');
    assert.equal(nodes.province.options.filter(option => option.value === '경기도').length, 1);
    assert.equal(nodes.city.options.filter(option => option.value === '광명시').length, 1);
});

test('알 수 없는 시도와 지도모드 URL에는 목록 전용 지역 옵션을 추가하지 않는다', () => {
    for (const config of [{ province: '알 수 없는 시도', city: '알 수 없는 시군구' }, { province: '대전광역시', city: '유성구', mode: 'map' }]) {
        const { nodes } = restoredLocation(config);
        assert.equal(nodes.province.value, '');
        assert.equal(nodes.city.value, '');
        assert.equal(nodes.province.options.some(option => option.value === config.province), false);
        assert.equal(nodes.city.options.some(option => option.value === config.city), false);
    }
});
/** SOFTM-LIST-LOCATION-RESTORE END */
/** SOFTM-LIST-LOCATION-TEST END */
