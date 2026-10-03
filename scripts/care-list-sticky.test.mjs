/** SOFTM-LIST-STICKY-TEST START 날짜:20260930 : 스크롤 단계가 방향 흔들림에 깜박이거나 보기·상세 복원으로 선택 기관을 가리지 않도록 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../care-list-sticky.js', import.meta.url), 'utf8');
const logic = vm.createContext({});
vm.runInContext(source, logic);
const { createProgression } = logic.CareListSticky;
const dimensions = { locationHeight: 56, filterHeight: 112, summaryHeight: 60 };

test('현재 위치·검색조건을 지난 뒤 읽기 단계로 바뀌고 처음으로 돌아오면 전체를 표시한다', () => {
    const state = createProgression();
    assert.equal(state.update(0, dimensions), 'expanded');
    assert.equal(state.update(50, dimensions), 'expanded');
    assert.equal(state.update(56, dimensions), 'search');
    assert.equal(state.update(200, dimensions), 'search');
    assert.equal(state.update(250, dimensions), 'reading');
    assert.equal(state.update(0, dimensions), 'expanded');
});

test('읽기 중 짧은 방향 흔들림은 유지하고 누적 위스크롤에서 검색을 다시 표시한다', () => {
    const state = createProgression();
    assert.equal(state.update(400, dimensions), 'reading');
    for (const top of [390, 395, 380, 385, 360, 338]) assert.equal(state.update(top, dimensions), 'reading', `scrollTop=${top}`);
    assert.equal(state.update(337, dimensions), 'search');
    assert.equal(state.update(347, dimensions), 'search');
    assert.equal(state.update(369, dimensions), 'reading');
});

test('입력 포커스·상세조건 잠금 중에는 깊게 내려가도 검색을 숨기지 않는다', () => {
    const state = createProgression();
    state.update(400, dimensions);
    assert.equal(state.update(450, { ...dimensions, locked: true }), 'search');
    assert.equal(state.update(800, { ...dimensions, locked: true }), 'search');
    assert.equal(state.update(850, dimensions), 'reading');
});

test('조건 초기화는 이전 스크롤 방향을 지우고 위치줄부터 다시 시작한다', () => {
    const state = createProgression();
    state.update(600, dimensions); state.update(500, dimensions);
    state.reset();
    assert.equal(state.update(0, dimensions), 'expanded');
    assert.equal(state.update(100, dimensions), 'search');
    assert.equal(state.update(260, dimensions), 'reading');
});

test('기관 복원의 큰 좌표 이동은 사용자 위스크롤로 오인하지 않고 이후 방향만 새로 계산한다', () => {
    const state = createProgression();
    state.update(1000, dimensions);
    state.rebase(400, 'reading');
    assert.equal(state.update(400, dimensions), 'reading');
    assert.equal(state.update(380, dimensions), 'reading');
    assert.equal(state.update(352, dimensions), 'search');
    state.rebase(700, 'search');
    assert.equal(state.update(700, dimensions), 'search');
    assert.equal(state.update(731, dimensions), 'search');
    assert.equal(state.update(732, dimensions), 'reading');
});

function environment({ locationInsideFilters = false } = {}) { // SOFTM-LIST-LOCATION-TEST 날짜:20260930 : 위치 도구의 필터 내부·외부 배치를 같은 회귀 환경에서 비교
    let listMode = true, rowHeight = 100, frames = [];
    const classes = new Set(), listeners = new Map();
    function node() {
        const attributes = new Map();
        return { dataset: {}, hidden: false, inert: false, children: [],
            setAttribute(name, value) { attributes.set(name, String(value)); },
            getAttribute(name) { return attributes.get(name) ?? null; },
            removeAttribute(name) { attributes.delete(name); },
            addEventListener(name, callback) { listeners.set(`${name}:${listeners.size}`, callback); },
            append(child) { this.children.push(child); }, before() {},
            contains(value) { return value === this || this.children.some(child => child === value || child.contains?.(value)); }, // SOFTM-LIST-LOCATION-TEST 날짜:20260930 : 중첩된 위치 버튼도 실제 DOM처럼 필터 내부로 판별
            getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0 })
        };
    }
    const body = node(); body.dataset.careMode = 'list';
    body.classList = { contains: value => classes.has(value) };
    body.style = { setProperty() {} };
    const viewport = node(); viewport.scrollTop = 0;
    viewport.getBoundingClientRect = () => ({ top: 120, bottom: 720, height: 600 });
    const filters = node(), input = { tagName: 'INPUT', focus() { document.activeElement = input; } }, head = node(), list = node();
    filters.append(input); // SOFTM-LIST-LOCATION-TEST 날짜:20260930 : 입력과 위치 버튼에 동일한 DOM 포함 관계를 적용
    filters.getBoundingClientRect = () => ({ top: 120, bottom: 232, height: dimensions.filterHeight });
    head.querySelector = selector => selector === '[data-list-search-return]' ? head.children.find(child => 'listSearchReturn' in child.dataset) : null;
    head.getBoundingClientRect = () => {
        const naturalTop = 120 + (locationInsideFilters ? 0 : dimensions.locationHeight) + dimensions.filterHeight - viewport.scrollTop; // SOFTM-LIST-LOCATION-TEST 날짜:20260930 : 필터 내부 위치줄은 필터 높이에 이미 포함
        const stickyTop = body.dataset.careListStage === 'reading' ? 120 : 120 + dimensions.filterHeight;
        const top = Math.max(naturalTop, stickyTop);
        return { top, bottom: top + 56, height: 56 };
    };
    const location = node(), summary = node();
    /** SOFTM-LIST-LOCATION-TEST START 날짜:20260930 : 위치 버튼의 중첩 배치와 키보드·마우스 포커스에 따른 읽기 복귀를 재현 */
    const locationButton = node(); locationButton.tagName = 'BUTTON';
    let focusVisible = false;
    locationButton.focus = ({ keyboard = true } = {}) => { document.activeElement = locationButton; focusVisible = keyboard; };
    locationButton.matches = selector => selector === ':focus-visible' && focusVisible && document.activeElement === locationButton;
    locationButton.blur = () => { if (document.activeElement === locationButton) document.activeElement = null; focusVisible = false; };
    location.append(locationButton);
    if (locationInsideFilters) filters.append(location);
    /** SOFTM-LIST-LOCATION-TEST END */
    location.getBoundingClientRect = () => ({ height: dimensions.locationHeight });
    summary.getBoundingClientRect = () => ({ height: dimensions.summaryHeight });
    const rows = Array.from({ length: 30 }, (_, index) => {
        const row = node(); row.dataset.id = `institution-${index}`;
        row.getBoundingClientRect = () => {
            const top = 120 + (locationInsideFilters ? 0 : dimensions.locationHeight) + dimensions.filterHeight + 56 + dimensions.summaryHeight + index * rowHeight - viewport.scrollTop; // SOFTM-LIST-LOCATION-TEST 날짜:20260930 : 위치 도구를 필터 안으로 옮긴 실제 카드 시작선을 반영
            return { top, bottom: top + rowHeight, height: rowHeight };
        };
        return row;
    });
    const document = { body, activeElement: null, createElement: node,
        querySelector: selector => ({ 'main.wrap': viewport, '.filters': filters, '.results .list-head': head })[selector] || null,
        querySelectorAll: selector => selector === '#list .row' ? rows : [],
        getElementById: id => ({ list, q: input, careListLocation: location, careListSummary: summary })[id] || null
    };
    const context = vm.createContext({ document, CareListMode: { isList: () => listMode },
        requestAnimationFrame(callback) { frames.push(callback); return frames.length; }, addEventListener() {},
        MutationObserver: class { observe() {} }, ResizeObserver: class { observe() {} }
    });
    vm.runInContext(source, context);
    const api = context.CareListSticky;
    return { api, body, filters, viewport, head, list, rows, input, location, locationButton, document, // SOFTM-LIST-LOCATION-TEST 날짜:20260930 : 위치 도구 포함 관계와 키보드 포커스를 직접 검증
        mode(value) { listMode = value; body.dataset.careMode = value ? 'list' : 'map'; },
        scroll(top) { viewport.scrollTop = top; api.sync(); },
        density(value) { rowHeight = value; },
        open(value) { if (value) classes.add('care-mobile-filters-open'); else classes.delete('care-mobile-filters-open'); },
        flush() { const ready = frames; frames = []; for (const callback of ready) callback(); }
    };
}

test('읽기 단계에서는 검색을 포커스 순서에서 빼고 검색조건 버튼으로 맨 위와 입력을 복구한다', () => {
    const env = environment(); env.api.mount(); env.scroll(900);
    const button = env.head.querySelector('[data-list-search-return]');
    assert.equal(env.body.dataset.careListStage, 'reading');
    assert.equal(env.filters.inert, true);
    assert.equal(env.filters.getAttribute('aria-hidden'), 'true');
    assert.equal(button.hidden, false);
    button.onclick();
    assert.equal(env.viewport.scrollTop, 0);
    assert.equal(env.body.dataset.careListStage, 'expanded');
    assert.equal(env.filters.inert, false);
    assert.equal(env.filters.getAttribute('aria-hidden'), 'false');
    assert.equal(button.hidden, true);
    assert.equal(env.document.activeElement, env.input);
});

test('입력 포커스 또는 열린 상세조건은 읽기 위치에서도 검색의 접근성을 유지한다', () => {
    const env = environment(); env.api.mount(); env.scroll(900);
    env.document.activeElement = env.input; env.api.sync();
    assert.equal(env.body.dataset.careListStage, 'search'); assert.equal(env.filters.inert, false);
    env.document.activeElement = null; env.scroll(1000); assert.equal(env.filters.inert, true);
    env.open(true); env.api.sync();
    assert.equal(env.body.dataset.careListStage, 'search'); assert.equal(env.filters.inert, false);
});

/** SOFTM-LIST-LOCATION-TEST START 날짜:20260930 : 위치 도구를 검색 보조줄로 옮겨도 스크롤 임계값과 키보드 접근성이 유지되어야 함 */
test('필터 안의 위치 도구 높이를 읽기 전환 임계값에 이중으로 더하지 않는다', () => {
    const env = environment({ locationInsideFilters: true }); env.api.mount();
    assert.equal(env.filters.contains(env.location), true);
    const readingThreshold = dimensions.filterHeight + dimensions.summaryHeight - 4;
    env.scroll(readingThreshold - 1);
    assert.equal(env.body.dataset.careListStage, 'search');
    assert.equal(env.filters.inert, false);
    env.scroll(readingThreshold);
    assert.equal(env.body.dataset.careListStage, 'reading');
    assert.equal(env.filters.inert, true);
});

test('위치 버튼에 키보드 포커스가 있으면 깊게 스크롤해도 조작 가능하며 해제 후 읽기로 복귀한다', () => {
    const env = environment({ locationInsideFilters: true }); env.api.mount();
    env.locationButton.focus(); env.scroll(900);
    assert.equal(env.body.dataset.careListStage, 'search');
    assert.equal(env.filters.inert, false);
    assert.equal(env.filters.getAttribute('aria-hidden'), 'false');
    assert.equal(env.document.activeElement, env.locationButton);
    env.locationButton.blur(); env.api.sync();
    assert.equal(env.body.dataset.careListStage, 'reading');
    assert.equal(env.filters.inert, true);
    assert.equal(env.filters.getAttribute('aria-hidden'), 'true');
});

test('마우스 클릭 포커스는 상세조건을 닫은 뒤 읽기 전환을 막지 않는다', () => {
    const env = environment({ locationInsideFilters: true }); env.api.mount();
    env.locationButton.focus({ keyboard: false }); env.open(true); env.scroll(900);
    assert.equal(env.body.dataset.careListStage, 'search');
    assert.equal(env.filters.inert, false);
    env.open(false); env.api.sync();
    assert.equal(env.document.activeElement, env.locationButton);
    assert.equal(env.body.dataset.careListStage, 'reading');
    assert.equal(env.filters.inert, true);
    assert.equal(env.filters.getAttribute('aria-hidden'), 'true');
});
/** SOFTM-LIST-LOCATION-TEST END */

test('카드에서 간단형으로 바꿔도 읽던 기관의 고정 헤더 아래 위치와 읽기 단계를 보존한다', () => {
    const env = environment(); env.api.mount(); env.scroll(840);
    const position = env.api.capture();
    assert.equal(position.stage, 'reading');
    assert.ok(position.id);
    env.density(45);
    env.api.restore(position);
    const restored = env.api.capture();
    assert.equal(env.body.dataset.careListStage, 'reading');
    assert.equal(restored.id, position.id);
    assert.equal(restored.offset, position.offset);
    assert.ok(restored.scroll < position.scroll);
});

test('헤더에 일부 가린 카드가 간단형으로 줄어도 같은 기관을 헤더 뒤에 완전히 숨기지 않는다', () => {
    const env = environment(); env.api.mount(); env.scroll(900);
    const position = env.api.capture();
    assert.ok(position.offset < -45);
    env.density(45); env.api.restore(position);
    const restored = env.api.capture();
    assert.equal(restored.id, position.id);
    const row = env.rows.find(item => item.dataset.id === position.id);
    assert.ok(row.getBoundingClientRect().bottom > env.api.visibleTop());
    assert.equal(env.body.dataset.careListStage, 'reading');
});

test('간단형에서 카드형으로 바꿔도 검색 표시 단계를 유지하며 같은 기관으로 복귀한다', () => {
    const env = environment(); env.api.mount(); env.density(45); env.scroll(650); env.scroll(590);
    const position = env.api.capture(); assert.equal(position.stage, 'search');
    env.density(120); env.api.restore(position);
    const restored = env.api.capture();
    assert.equal(env.body.dataset.careListStage, 'search');
    assert.equal(restored.id, position.id); assert.equal(restored.offset, position.offset);
});

test('기관이 재검색으로 사라졌다면 저장한 스크롤 위치만 안전하게 복구한다', () => {
    const env = environment(); env.api.mount(); env.scroll(600);
    env.api.restore({ scroll: 450, id: 'removed-institution', offset: 0, stage: 'reading' });
    assert.equal(env.viewport.scrollTop, 450);
    assert.equal(env.body.dataset.careListStage, 'reading');
});

test('목록 맨 위의 복원은 기관 앵커 때문에 위치줄을 건너뛰지 않는다', () => {
    const env = environment(); env.api.mount();
    const position = env.api.capture(); assert.equal(position.scroll, 0);
    env.scroll(900); env.density(60); env.api.restore(position);
    assert.equal(env.viewport.scrollTop, 0);
    assert.equal(env.body.dataset.careListStage, 'expanded');
});

test('지도 복귀는 숨긴 필터의 접근 제한을 풀고 목록용 검색 복귀 버튼을 숨긴다', () => {
    const env = environment(); env.api.mount(); env.scroll(900);
    const position = env.api.capture();
    env.mode(false); env.api.sync();
    assert.equal(env.filters.inert, false);
    assert.notEqual(env.filters.getAttribute('aria-hidden'), 'true');
    assert.equal(env.body.dataset.careListStage, undefined);
    assert.equal(env.head.querySelector('[data-list-search-return]').hidden, true);
    assert.equal(env.api.scroller(), env.list);
    assert.equal(env.api.capture(), null);
    const top = env.viewport.scrollTop; env.api.restore(position); env.api.reset();
    assert.equal(env.viewport.scrollTop, top);
});

test('스티키 초기화를 반복해도 검색 복귀 버튼을 중복 만들지 않는다', () => {
    const env = environment(); env.api.mount(); env.api.mount();
    assert.equal(env.head.children.length, 2); // SOFTM-LIST-READING 날짜:20261003 : 검색 복귀와 보조 도구 버튼이 각각 한 번만 생성됨을 검증
    assert.equal(env.api.scroller(), env.viewport);
});
/** SOFTM-LIST-STICKY-TEST END */

/** SOFTM-LIST-READING START 날짜:20261003 : 읽기 중 수동 펼침 보존과 모드·방향 전환 복귀를 검증 */
test('읽기 도구는 수동으로 펼치고 같은 방향 스크롤에는 유지하며 검색 복귀 때 초기화한다', () => {
    const env = environment(); env.api.mount();
    const button = env.head.children.find(child => 'listToolsToggle' in child.dataset);
    assert.equal(button.hidden, true);
    env.scroll(900);
    assert.equal(button.hidden, false);
    button.onclick();
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    env.scroll(1000);
    assert.equal(env.body.dataset.careListTools, 'open');
    button.onclick();
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    button.onclick();
    env.scroll(900);
    assert.equal(button.hidden, true);
    assert.equal(env.body.dataset.careListTools, undefined);
    env.scroll(1000);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    env.mode(false); env.api.sync();
    assert.equal(button.hidden, true);
});
/** SOFTM-LIST-READING END */
