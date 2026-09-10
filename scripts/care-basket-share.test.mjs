/** SOFTM-BASKET-SHARE START 날짜:20260911 : 유형·순서 복원과 누락 자료·클립보드 실패·공유 취소의 회귀를 검사 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = { URL, URLSearchParams, Set };
vm.runInNewContext(readFileSync(new URL('../care-basket-share.js', import.meta.url), 'utf8'), context);
const { createUrl, readLink, copyLink, shareLink } = context.CareBasketShare;
const ids = ['24119001267', '11110000001', '24119001267'];
const base = 'https://homecare.designboard.net/nationwide-daycare-map.html?q=개인검색&lat=37&lng=127&institution=old#old';
const plain = value => JSON.parse(JSON.stringify(value));
test('공유는 유형과 담은 방문 순서만 전달하며 검색·좌표·과거 선택을 제외', () => {
 const url = new URL(createUrl(base, 'daycare', ids));
 assert.equal(url.pathname, '/nationwide-care-services-map.html'); assert.equal(url.search, '?type=daycare');
 assert.equal(url.searchParams.has('lat'), false); assert.equal(url.hash.includes('old'), false);
 assert.deepEqual(plain(readLink(url.href, 'daycare', new Set(ids))), { ids: ids.slice(0, 2), missing: 0, total: 2 });
});
test('요양병원의 긴 기관기호도 그대로 복원하고 현재 유형에 없는 기관만 누락 안내', () => {
 const hospital = 'JDQ4MTYyMiM1MSMkMSMkNCMkOTkkNTgxMzUxIzExIyQxIyQzIyQ2MiQ0NjEwMDIjNDEjJDEjJDgjJDgz';
 const url = createUrl(base, 'nursing-hospital', [hospital, 'missing']);
 assert.deepEqual(plain(readLink(url, 'nursing-hospital', new Set([hospital]))), { ids: [hospital], missing: 1, total: 2 });
 assert.ok(readLink(url, 'daycare', new Set([hospital])).error);
});
test('잘못된 버전·빈 값·코드 삽입·과도한 길이는 거부하며 일반 공유는 변경하지 않음', () => {
 for (const hash of ['basket=v2.123', 'basket=v1.', 'basket=v1.%3Cscript%3E', `basket=v1.${'a'.repeat(24001)}`]) assert.ok(readLink(`${base.split('#')[0]}#${hash}`, 'daycare', new Set()).error);
 assert.equal(readLink(base, 'daycare', new Set()), null);
 assert.throws(() => createUrl(base, 'daycare', []));
 assert.throws(() => createUrl(base, 'unknown', ['123']));
 assert.throws(() => createUrl(base, 'daycare', Array.from({length: 1000}, (_, i) => 'A'.repeat(100) + i)));
});
test('복사는 실제 성공만 완료로 처리하고 미지원·권한 거절은 수동 복사로 넘김', async () => {
 let copied;
 assert.equal(await copyLink('link', { clipboard: { writeText: async text => { copied = text; } } }), true);
 assert.equal(copied, 'link');
 assert.equal(await copyLink('link', {}), false);
 assert.equal(await copyLink('link', { clipboard: { writeText: async () => { throw Error(); } } }), false);
});
test('기기 공유 취소와 실패를 성공으로 표시하지 않음', async () => {
 assert.equal(await shareLink({}, { share: async () => {} }), 'shared');
 assert.equal(await shareLink({}, { share: async () => { throw { name: 'AbortError' }; } }), 'cancelled');
 assert.equal(await shareLink({}, { share: async () => { throw Error(); } }), 'failed');
});
/** SOFTM-BASKET-SHARE END */
