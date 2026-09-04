/** SOFTM-SEARCH-READINESS-TEST START 날짜:20260904 : 차단·구버전 배포·브랜드 누락이 성공으로 표시되지 않는지 회귀 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { attributes, inspectPage, publicOrigin } from './check-search-readiness.mjs';

const url = `${publicOrigin}/nationwide-daycare-map.html`;
const html = `<title>주야간보호센터 | 돌봄한눈</title><meta name="robots" content="index,follow"><link rel="canonical" href="${url}"><h1>주야간보호센터</h1>`;
const inspect = (changes = {}) => inspectPage({ url, status: 200, headers: new Headers({ 'content-type': 'text/html' }), html, expectedCanonical: url, ...changes });

test('검색 허용 페이지', () => assert.deepEqual(inspect().issues, []));
test('HTML noindex 차단', () => assert(inspect({ html: html.replace('index,follow', 'noindex,follow') }).issues.some(issue => issue.includes('차단'))));
test('응답 헤더 noindex 차단', () => assert(inspect({ headers: new Headers({ 'content-type': 'text/html', 'x-robots-tag': 'googlebot: noindex' }) }).issues.some(issue => issue.includes('차단'))));
test('Googlebot 전용 차단', () => assert(inspect({ html: html + '<meta name="googlebot" content="none">' }).issues.some(issue => issue.includes('차단'))));
test('주석의 noindex는 실제 지시로 보지 않음', () => assert.deepEqual(inspect({ html: html + '<!-- <meta name="robots" content="noindex"> -->' }).issues, []));
test('제목 브랜드 및 대표 URL 오류', () => {
  const issues = inspect({ html: html.replace('돌봄한눈', '이전 이름').replace(url, `${publicOrigin}/other.html`) }).issues;
  assert(issues.some(issue => issue.includes('사이트명')));
  assert(issues.some(issue => issue.includes('대표 주소')));
});
test('오류 페이지를 정상 배포로 판정하지 않음', () => assert(inspect({ status: 404 }).issues.includes('HTTP 404')));
test('작은따옴표 및 속성 순서 지원', () => assert.deepEqual(attributes("<meta content='index,follow' NAME='robots'>"), { content: 'index,follow', name: 'robots' }));
test('홈페이지 브랜드와 구조화 데이터 확인', () => {
  const home = `${publicOrigin}/`;
  const valid = html.replace(url, home).replace('<h1>주야간보호센터</h1>', '<h1>돌봄한눈</h1>') + `<script type="application/ld+json">{"@type":"WebSite","name":"돌봄한눈","url":"${home}"}</script>`;
  assert.deepEqual(inspect({ url: home, expectedCanonical: home, html: valid }).issues, []);
  assert(inspect({ url: home, expectedCanonical: home, html: valid.replace('"name":"돌봄한눈"', '"name":"다른 이름"') }).issues.some(issue => issue.includes('WebSite')));
});
/** SOFTM-SEARCH-READINESS-TEST END */
