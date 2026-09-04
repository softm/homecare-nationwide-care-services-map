/** SOFTM-BRAND-IDENTITY START 날짜:20260904 : 보이는 소개·출처·페이지 연결을 검사해 메타 태그만 남는 회귀를 방지 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inspectPage, publicOrigin } from './check-search-readiness.mjs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const visibleSource = html => html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
const structured = html => [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match => JSON.parse(match[1]));
const home = read('index.html');
const about = read('about.html');
const sitemap = read('sitemap.xml');
const siteId = `${publicOrigin}/#website`;

test('홈페이지가 독립 서비스 성격과 소개 링크를 본문에 제공', () => {
  const body = visibleSource(home).split(/<body\b[^>]*>/i)[1];
  assert(body.includes('돌봄한눈'));
  assert(body.includes('독립 정보 서비스'));
  assert(body.includes('공식 서비스가 아닙니다'));
  assert.match(body, /<a\b[^>]*href="about\.html"/);
  assert.match(body, /aria-labelledby="serviceIdentityTitle"/);
});

test('홈페이지와 소개 문서가 같은 사이트 식별자를 사용', () => {
  const sites = structured(home).filter(item => item['@type'] === 'WebSite');
  assert.equal(sites.length, 1);
  assert.equal(sites[0]['@id'], siteId);
  assert.equal(sites[0].name, '돌봄한눈');
  assert.equal(sites[0].url, `${publicOrigin}/`);
  const page = structured(about).find(item => ['AboutPage', 'WebPage'].includes(item['@type']));
  assert(page, '서비스 소개의 구조화 데이터 누락');
  assert.equal(page.isPartOf?.['@id'], siteId);
});

test('소개 페이지는 검색 허용·자기 대표 주소와 실제 출처를 제공', () => {
  const url = `${publicOrigin}/about.html`;
  assert.deepEqual(inspectPage({ url, status: 200, headers: new Headers({ 'content-type': 'text/html' }), html: about, expectedCanonical: url }).issues, []);
  const body = visibleSource(about).split(/<body\b[^>]*>/i)[1];
  assert(body.includes('독립 정보 서비스'));
  assert(body.includes('국민건강보험공단'));
  assert(body.includes('건강보험심사평가원'));
  assert.match(body, /기준일/);
  assert.match(body, /href="https:\/\/(?:www\.)?(?:data\.go\.kr|longtermcare\.or\.kr)\//);
  assert.match(body, /href="https:\/\/(?:www\.|opendata\.)?hira\.or\.kr\//); // SOFTM-BRAND-IDENTITY 날짜:20260904 : 심평원 공식 공공데이터 출처도 검증 대상에 포함
});

test('서비스 소개가 단일 사이트맵에 한 번 포함되고 각 유형에서 연결됨', () => {
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]));
  assert.equal(urls.filter(url => url.href === `${publicOrigin}/about.html`).length, 1);
  for (const url of urls.filter(url => /-map\.html$/.test(url.pathname))) {
    assert.match(visibleSource(read(url.pathname.slice(1))), /<a\b[^>]*href="about\.html"/, `${url.pathname}: 소개 연결 누락`);
  }
});

test('소개 문서의 로컬 링크와 스타일 파일이 실제 존재', () => {
  for (const match of visibleSource(about).matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    if (/^(?:https?:|mailto:|#)/.test(match[1])) continue;
    const local = match[1].split(/[?#]/)[0].replace(/^\//, '') || 'index.html';
    assert(fs.existsSync(new URL(`../${local}`, import.meta.url)), `소개 문서 참조 누락: ${local}`);
  }
});
/** SOFTM-BRAND-IDENTITY END */
