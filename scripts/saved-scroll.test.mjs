/** SOFTM-SAVED-SCROLL START 날짜:20260910 : 담은 목록의 스크롤·끝 항목·작업 분리·드래그 제외를 실제 이벤트 처리로 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../map-experience.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('    function installSavedScroll()'), source.indexOf('    /** SOFTM-SAVED-SCROLL END */'));
function harness(ownScroll = true) {
    const events = {}, rootEvents = {}, frames = [], focused = [], details = [];
    let dragging = false, offset = 0;
    const cards = ['a', 'b', 'c'].map((id, index) => ({
        dataset: { basketId: id }, isConnected: true, attrs: {}, classes: new Set(),
        classList: { add(value) { cards[index].classes.add(value); }, remove(value) { cards[index].classes.delete(value); } },
        setAttribute(name, value) { this.attrs[name] = value; }, removeAttribute(name) { delete this.attrs[name]; },
        getBoundingClientRect: () => ({ top: 120 + index * 200 - offset, bottom: 320 + index * 200 - offset, height: 200 })
    }));
    const tail = { style: {}, isConnected: false, setAttribute() {}, remove() { this.isConnected = false; } };
    const list = { querySelectorAll: () => cards, append: () => { tail.isConnected = true; } };
    const bar = { scrollTop: 0, scrollHeight: 1100, clientHeight: 600,
        getBoundingClientRect: () => ({ top: ownScroll ? 100 : 0, bottom: ownScroll ? 700 : 1600, left: 0, right: 400 }),
        querySelector: selector => selector === '.care-basket-items' ? list : { getBoundingClientRect: () => ({ height: 60 }) },
        addEventListener: (type, fn) => { events[type] = fn; }
    };
    const ctx = { bar, workspace: 'saved', tabs: { getBoundingClientRect: () => ({ bottom: 100 }) },
        root: { innerWidth: 1200, innerHeight: 800, scrollY: 0, addEventListener: (type, fn) => { rootEvents[type] = fn; } },
        document: { documentElement: { scrollHeight: 1600 }, createElement: () => tail, body: { classList: { contains: () => dragging } }, querySelector: () => ({}) },
        getComputedStyle: () => ({ overflowY: ownScroll ? 'auto' : 'visible', visibility: 'visible' }),
        requestAnimationFrame: fn => { frames.push(fn); return frames.length; }, MutationObserver: class { observe() {} },
        options: { mobileFocus: (...args) => focused.push(args), scrollDetail: id => details.push(id) }
    };
    const flush = () => { while (frames.length) frames.shift()(); };
    vm.runInNewContext(code + '\ninstallSavedScroll();', ctx); flush();
    return { ctx, cards, focused, details, tail, setDragging: value => { dragging = value; },
        scroll(value, end = false) { offset = value; ctx.root.scrollY = end ? 800 : value; bar.scrollTop = end ? 500 : value; (ownScroll ? events : rootEvents).scroll(); flush(); }
    };
}
test('첫 항목은 강조만 하고 스크롤 시 카드·마커·열린 상세를 같은 기관으로 전달한다', () => {
    const h = harness(); assert.deepEqual(h.focused.at(-1), ['a', false, true]); assert.equal(h.details.length, 0);
    h.scroll(220); assert.deepEqual(h.focused.at(-1), ['b', true, true]); assert.equal(h.details.at(-1), 'b');
    assert.equal(h.cards[0].attrs['aria-current'], undefined); assert.equal(h.cards[1].attrs['aria-current'], 'true');
});
test('마지막 기관까지 스크롤하면 마지막 카드가 선택되고 하단 여유가 존재한다', () => {
    const h = harness(); h.scroll(400, true);
    assert.equal(h.focused.at(-1)[0], 'c'); assert.ok(parseFloat(h.tail.style.height) > 0);
});
test('모바일 문서 스크롤도 선택을 갱신한다', () => {
    const h = harness(false); h.scroll(100); // SOFTM-SAVED-SCROLL-EARLY 날짜:20260910 : 카드가 상단에 닿기 전에도 문서 스크롤 선택이 반영되는지 확인
    assert.deepEqual(h.focused.at(-1), ['b', true, true]); assert.equal(h.tail.isConnected, false);
});
/** SOFTM-SAVED-SCROLL-EARLY START 날짜:20260910 : 위쪽 35% 기준의 빠른 선택·역방향 복귀·첫 진입을 실제 스크롤 이벤트로 검증 */
test('다음 카드가 목록 상단에서 충분히 떨어져 있을 때 미리 선택하고 역방향도 복원한다', () => {
    const h = harness(); h.scroll(80);
    assert.ok(h.cards[1].getBoundingClientRect().top > 100 + 55);
    assert.deepEqual(h.focused.at(-1), ['b', true, true]);
    assert.equal(h.cards[1].attrs['aria-current'], 'true');
    h.scroll(20);
    assert.deepEqual(h.focused.at(-1), ['a', true, true]);
    assert.equal(h.cards[1].attrs['aria-current'], undefined);
});
test('모바일 첫 진입과 맨 위 복귀는 첫 기관을 선택한다', () => {
    const h = harness(false);
    assert.deepEqual(h.focused.at(-1), ['a', false, true]);
    h.scroll(100); h.scroll(0);
    assert.deepEqual(h.focused.at(-1), ['a', true, true]);
});
/** SOFTM-SAVED-SCROLL-EARLY END */
test('모바일 페이지 끝에서는 화면에 보이는 마지막 기관을 선택한다', () => {
    const h = harness(false); h.scroll(200, true);
    assert.equal(h.focused.at(-1)[0], 'c');
});
test('검색 작업과 손잡이 드래그 중에는 담은 목록의 선택을 적용하지 않는다', () => {
    const h = harness(); const count = h.focused.length;
    h.ctx.workspace = 'search'; h.scroll(220); assert.equal(h.focused.length, count);
    h.ctx.workspace = 'saved'; h.setDragging(true); h.scroll(400); assert.equal(h.focused.length, count);
});
/** SOFTM-SAVED-SCROLL END */
