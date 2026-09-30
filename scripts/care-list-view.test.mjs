/** SOFTM-LIST-VIEW-TEST START 날짜:20260930 : 보기 변경 중 기관·광고·초점과 탐색 위치가 유지되는지 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../care-list-view.js', import.meta.url), 'utf8');
const storageKey = 'careListView:v1';
const supportedViews = ['cards', 'rows', 'compact'];

function setup({ saved, mode = 'list', storageError = false, propertyError = false } = {}) {
    const values = new Map(saved === undefined ? [] : [[storageKey, saved]]), writes = [], frames = [];
    let document;
    const dataKey = name => name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

    class Element {
        constructor(tag) {
            this.tagName = tag.toUpperCase(); this.dataset = {}; this.attributes = {};
            this.children = []; this.parentElement = null; this.listeners = new Map();
            this.hidden = false; this.className = ''; this.id = ''; this.scrollTop = 0;
            this.style = { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } };
            this.classList = {
                contains: name => this.className.split(/\s+/).includes(name),
                add: name => { if (!this.classList.contains(name)) this.className += ` ${name}`; },
                remove: name => { this.className = this.className.split(/\s+/).filter(item => item !== name).join(' '); },
                toggle: (name, active) => active ? this.classList.add(name) : this.classList.remove(name)
            };
        }
        get childNodes() { return this.children; }
        get parentNode() { return this.parentElement; }
        get firstElementChild() { return this.children[0] || null; }
        get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
        setAttribute(name, value) {
            this.attributes[name] = String(value);
            if (name.startsWith('data-')) this.dataset[dataKey(name)] = String(value);
            if (name === 'id') this.id = String(value);
            if (name === 'class') this.className = String(value);
        }
        getAttribute(name) { return this.attributes[name] ?? null; }
        addEventListener(name, handler) {
            if (!this.listeners.has(name)) this.listeners.set(name, []);
            this.listeners.get(name).push(handler);
        }
        dispatchEvent(event) {
            if (!event.target) event.target = this;
            for (const handler of this.listeners.get(event.type) || []) handler(event);
            if (event.bubbles) this.parentElement?.dispatchEvent(event);
            return true;
        }
        click() { this.dispatchEvent({ type: 'click', target: this, bubbles: true, preventDefault() {} }); }
        focus() { document.activeElement = this; }
        append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
        appendChild(node) { this.append(node); return node; }
        prepend(node) { node.parentElement = this; this.children.unshift(node); }
        insertBefore(node, reference) {
            const index = this.children.indexOf(reference);
            if (index < 0) this.append(node); else { node.parentElement = this; this.children.splice(index, 0, node); }
            return node;
        }
        before(node) { this.parentElement.insertBefore(node, this); }
        after(node) {
            const parent = this.parentElement, index = parent.children.indexOf(this);
            node.parentElement = parent; parent.children.splice(index + 1, 0, node);
        }
        contains(node) { return node === this || this.children.some(child => child.contains(node)); }
        matches(selector) {
            const attribute = selector.match(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/);
            if (attribute) {
                const value = attribute[1].startsWith('data-') ? this.dataset[dataKey(attribute[1])] : this.getAttribute(attribute[1]);
                if (value == null || (attribute[2] !== undefined && value !== attribute[2])) return false;
                selector = selector.replace(attribute[0], '');
            }
            if (!selector) return true;
            if (selector.startsWith('#')) return this.id === selector.slice(1);
            if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
            return this.tagName.toLowerCase() === selector.toLowerCase();
        }
        closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
        querySelectorAll(selector) {
            const selectors = selector.split(',').map(item => item.trim());
            const matches = (node, entry) => {
                const parts = entry.split(/\s+/), last = parts.pop();
                if (!node.matches(last)) return false;
                let ancestor = node.parentElement;
                for (let index = parts.length - 1; index >= 0; index--) {
                    while (ancestor && !ancestor.matches(parts[index])) ancestor = ancestor.parentElement;
                    if (!ancestor) return false;
                    ancestor = ancestor.parentElement;
                }
                return true;
            };
            return this.children.flatMap(child => [...(selectors.some(item => matches(child, item)) ? [child] : []), ...child.querySelectorAll(selector)]);
        }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        set innerHTML(value) {
            this.html = value; this.children = [];
            for (const match of value.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
                const button = new Element('button');
                for (const attribute of match[1].matchAll(/([\w-]+)=["']([^"']*)["']/g)) button.setAttribute(attribute[1], attribute[2]);
                button.textContent = match[2].replace(/<[^>]+>/g, ''); this.append(button);
            }
        }
        get innerHTML() { return this.html || ''; }
        getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, width: 0, height: 0 }; }
    }

    const body = new Element('body'), results = new Element('aside'), head = new Element('div'), list = new Element('div');
    body.dataset.careMode = mode; results.className = 'results'; head.className = 'list-head'; list.id = 'list';
    body.append(results); results.append(head, list); list.scrollTop = 210;
    list.clientHeight = 400; list.getBoundingClientRect = () => ({ top: 100, bottom: 500, height: 400 });
    const rows = [0, 1, 2, 3].map(index => {
        const row = new Element('article'); row.className = 'row'; row.dataset.id = `institution-${index}`;
        row.getBoundingClientRect = () => {
            const height = { cards: 200, rows: 120, compact: 70 }[body.dataset.careListView || 'cards'];
            const top = 100 + index * height - list.scrollTop;
            return { top, bottom: top + height, height };
        };
        return row;
    });
    const advertisement = new Element('aside'), frame = new Element('iframe'), action = new Element('button');
    advertisement.className = 'ad-row'; advertisement.append(frame); rows[1].append(action);
    list.append(rows[0], rows[1], advertisement, rows[2], rows[3]);
    document = {
        body, activeElement: action, readyState: 'complete', documentElement: { clientHeight: 800 },
        createElement: tag => new Element(tag),
        getElementById: id => body.querySelector(`#${id}`),
        querySelector: selector => body.querySelector(selector),
        querySelectorAll: selector => body.querySelectorAll(selector),
        addEventListener() {}
    };
    const location = { href: 'https://homecare.designboard.net/index.html?type=facility&mode=list&p=서울&basket=one#saved' };
    const sessionStorage = {
        getItem(key) { if (storageError) throw Error('storage denied'); return values.get(key) ?? null; },
        setItem(key, value) { if (storageError) throw Error('storage denied'); writes.push([key, value]); values.set(key, value); }
    };
    const window = {
        document, location, innerHeight: 800,
        CareListMode: { isList: () => body.dataset.careMode === 'list' },
        history: { replaceState() { assert.fail('보기 변경은 공유 주소를 다시 쓰면 안 됩니다.'); } },
        fetch() { assert.fail('보기 변경은 검색 자료를 다시 요청하면 안 됩니다.'); },
        renderList() { assert.fail('보기 변경은 기관과 광고 DOM을 다시 만들면 안 됩니다.'); },
        addEventListener() {},
        requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
        setTimeout(callback) { frames.push(callback); return frames.length; },
        clearTimeout() {}, cancelAnimationFrame() {}
    };
    if (propertyError) Object.defineProperty(window, 'sessionStorage', { get() { throw Error('storage unavailable'); } });
    else window.sessionStorage = sessionStorage;
    vm.runInNewContext(source, { ...window, window, document, URL, console });
    const flush = () => { for (let count = 0; frames.length && count < 10; count++) for (const callback of frames.splice(0)) callback(); assert.equal(frames.length, 0); };
    return { api: window.CareListView, body, head, list, rows, action, advertisement, frame, document, location, values, writes, flush,
        toolbar: () => document.getElementById('careListViewToolbar'),
        changeMode(next) { body.dataset.careMode = next; window.CareListView.sync(); flush(); }
    };
}

test('지원하는 세 가지 보기만 허용하고 잘못된 값은 카드형으로 복구한다', () => {
    const s = setup();
    for (const value of supportedViews) assert.equal(s.api.resolveView(value), value);
    for (const value of [undefined, null, '', 'table', 'ROWS', {}, []]) assert.equal(s.api.resolveView(value), 'cards');
    assert.equal(s.api.getView(), 'cards');
});

test('세션에 저장한 보기를 복원하고 새 선택은 다른 유형에서도 이어진다', () => {
    for (const view of supportedViews) {
        const s = setup({ saved: view }); s.api.mount(); s.flush();
        assert.equal(s.api.getView(), view); assert.equal(s.body.dataset.careListView, view);
    }
    const s = setup({ saved: 'invalid' }); s.api.mount(); s.api.setView('compact'); s.flush();
    assert.equal(s.values.get(storageKey), 'compact');
    assert.equal(setup({ saved: s.values.get(storageKey) }).api.getView(), 'compact');
});

test('세션 저장소 접근과 쓰기가 거부되어도 목록 보기를 선택할 수 있다', () => {
    for (const options of [{ storageError: true }, { propertyError: true }]) {
        const s = setup(options);
        assert.doesNotThrow(() => { s.api.mount(); s.api.setView('rows'); s.flush(); });
        assert.equal(s.api.getView(), 'rows'); assert.equal(s.body.dataset.careListView, 'rows');
    }
});

test('보기 도구는 목록 모드에서만 보이며 지도 왕복 후 선택이 유지된다', () => {
    const s = setup({ mode: 'map', saved: 'compact' }); s.api.mount(); s.flush();
    assert.equal(s.toolbar().hidden, true);
    s.changeMode('list'); assert.equal(s.toolbar().hidden, false);
    assert.equal(s.api.getView(), 'compact');
    s.changeMode('map'); assert.equal(s.toolbar().hidden, true);
    s.changeMode('list'); assert.equal(s.body.dataset.careListView, 'compact');
});

test('반복 초기화·선택은 도구와 버튼을 중복 생성하지 않는다', () => {
    const s = setup();
    for (let index = 0; index < 3; index++) { s.api.mount(); s.api.setView('rows'); s.api.sync(); }
    s.flush();
    assert.equal(s.document.querySelectorAll('#careListViewToolbar').length, 1);
    const buttons = s.toolbar().querySelectorAll('button');
    assert.equal(buttons.length, 3);
    assert.equal(buttons.filter(button => button.getAttribute('aria-pressed') === 'true').length, 1);
    assert.ok(buttons.every(button => button.textContent?.trim()), '보기 버튼에 식별 가능한 이름이 있어야 합니다.');
    assert.ok(buttons.every(button => button.getAttribute('aria-controls') === 'list'));
    buttons.find(button => button.dataset.listView === 'compact').click(); s.flush();
    assert.equal(s.api.getView(), 'compact');
    assert.equal(buttons.find(button => button.getAttribute('aria-pressed') === 'true').dataset.listView, 'compact');
});

test('보기 변경은 기관·광고 iframe·초점·공유 주소를 그대로 유지한다', () => {
    const s = setup(); s.api.mount(); s.flush();
    const children = [...s.list.children], href = s.location.href;
    for (const view of supportedViews) {
        s.api.setView(view); s.flush();
        assert.deepEqual(s.list.children, children);
        assert.equal(s.advertisement.children[0], s.frame);
        assert.equal(s.document.activeElement, s.action);
        assert.equal(s.location.href, href);
    }
});

test('첫 화면에 걸친 기관의 위치를 보존해 보기 변경 후 읽던 곳에서 이어간다', () => {
    const s = setup(); s.api.mount(); s.flush();
    const anchor = s.rows[1], top = anchor.getBoundingClientRect().top;
    assert.ok(s.rows[0].getBoundingClientRect().bottom <= s.list.getBoundingClientRect().top);
    assert.ok(anchor.getBoundingClientRect().bottom > s.list.getBoundingClientRect().top);
    for (const view of ['rows', 'compact', 'cards']) {
        s.api.setView(view); s.flush();
        assert.equal(anchor.getBoundingClientRect().top, top);
    }
});

test('한 프레임 안에서 보기를 연속 선택해도 최초의 읽던 위치를 유지한다', () => {
    const s = setup(); s.api.mount(); s.flush();
    const anchor = s.rows[1], top = anchor.getBoundingClientRect().top;
    s.api.setView('rows'); s.api.setView('compact'); s.flush();
    assert.equal(s.api.getView(), 'compact');
    assert.equal(anchor.getBoundingClientRect().top, top);
});

test('잘못된 선택은 현재 보기와 저장한 선호를 변경하지 않는다', () => {
    const s = setup({ saved: 'rows' }); s.api.mount(); s.flush();
    const scroll = s.list.scrollTop;
    for (const value of [undefined, null, '', 'table']) s.api.setView(value);
    s.flush();
    assert.equal(s.api.getView(), 'rows');
    assert.equal(s.values.get(storageKey), 'rows');
    assert.equal(s.list.scrollTop, scroll);
});

test('보기 변경 뒤 지도 모드로 떠나면 늦은 스크롤 복원을 적용하지 않는다', () => {
    const s = setup(); s.api.mount(); s.flush();
    s.api.setView('rows');
    const scroll = s.list.scrollTop;
    s.changeMode('map');
    assert.equal(s.list.scrollTop, scroll);
    assert.equal(s.toolbar().hidden, true);
    assert.equal(s.api.getView(), 'rows');
});

test('검색 결과가 교체되면 제거된 기관의 늦은 위치 복원이 새 결과에 적용되지 않는다', () => {
    const s = setup(); s.api.mount(); s.flush();
    s.api.setView('compact');
    const scroll = s.list.scrollTop;
    for (const child of s.list.children) child.parentElement = null;
    s.list.children = [];
    s.flush();
    assert.equal(s.list.scrollTop, scroll);
    assert.doesNotThrow(() => { s.api.setView('rows'); s.flush(); });
});
/** SOFTM-LIST-VIEW-TEST END */
