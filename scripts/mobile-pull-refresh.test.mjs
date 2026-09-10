/** SOFTM-MOBILE-PULL-REFRESH START 날짜:20260910 : 짧은 스크롤·가로 이동은 유지하고 목록 맨 위의 충분한 당김만 새로고침하는지 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../mobile-pull-refresh.js';

test('목록 맨 위에서 충분히 아래로 당긴 경우에만 새로고침한다', () => {
    const pull = CareMobilePullRefresh.createPullState();
    assert.equal(pull.begin({ x: 20, y: 100, scrollTop: 0 }), true);
    assert.equal(pull.move({ x: 22, y: 150, scrollTop: 0 }).ready, false);
    assert.equal(pull.end(), false);
    pull.begin({ x: 20, y: 100, scrollTop: 0 });
    assert.equal(pull.move({ x: 21, y: 180, scrollTop: 0 }).ready, true);
    assert.equal(pull.end(), true);
});

test('스크롤 중이거나 가로로 미는 동작은 새로고침으로 바꾸지 않는다', () => {
    const pull = CareMobilePullRefresh.createPullState();
    assert.equal(pull.begin({ x: 20, y: 100, scrollTop: 1 }), false);
    assert.equal(pull.end(), false);
    pull.begin({ x: 20, y: 100, scrollTop: 0 });
    assert.equal(pull.move({ x: 90, y: 110, scrollTop: 0 }).active, false);
    assert.equal(pull.end(), false);
});

test('당기는 중 목록이 이동하면 새로고침을 취소한다', () => {
    const pull = CareMobilePullRefresh.createPullState();
    pull.begin({ x: 20, y: 100, scrollTop: 0 });
    assert.equal(pull.move({ x: 20, y: 190, scrollTop: 4 }).active, false);
    assert.equal(pull.end(), false);
});

test('두 지도는 공용 당겨서 새로고침 화면과 동작을 함께 읽는다', () => {
    for (const path of ['nationwide-daycare-map.html', 'nationwide-care-services-map.html']) {
        const html = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
        assert.match(html, /mobile-pull-refresh\.css\?v=20260910-1/);
        assert.match(html, /mobile-pull-refresh\.js\?v=20260910-1/);
    }
});
/** SOFTM-MOBILE-PULL-REFRESH END */
