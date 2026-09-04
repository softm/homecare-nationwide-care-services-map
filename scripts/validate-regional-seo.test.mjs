/** SOFTM-REGIONAL-VALIDATION-TEST START 날짜:20260904 : 특수문자 기관명·한글 주소·누락 평가가 정상 정보나 잘못된 지도 연결로 바뀌는 위험을 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodeHtml, inspectRegionalPage, localLinkPath } from './validate-regional-seo.mjs';

const origin = 'https://homecare.designboard.net';
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function fixture(t) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'regional-seo-test-'));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  for (const file of ['index.html', 'daycare-map.html', 'nationwide-care-services-map.html', 'regional-seo.css', 'regions/gyeonggi-daycare.html', 'regions/gyeonggi-광명시-daycare.html']) {
    fs.mkdirSync(path.dirname(path.join(rootDir, file)), { recursive: true });
    fs.writeFileSync(path.join(rootDir, file), 'fixture');
  }
  const meta = { file: 'regions/gyeonggi-광명시-daycare.html', url: `${origin}/regions/gyeonggi-${encodeURIComponent('광명시')}-daycare.html`, type: 'daycare', province: '경기도', city: '광명시', count: 2, evaluationCount: 1, sourceDate: '2026-06-10' };
  const province = { ...meta, file: 'regions/gyeonggi-daycare.html', url: `${origin}/regions/gyeonggi-daycare.html`, city: '' };
  const rows = [
    { i: '001', n: '행복 & <케어> "센터"', a: "경기도 광명시 빛로 1 <2층> & '상가'", p: '경기도', c: '광명시', g: 'A', ey: 2023 },
    { i: '002', n: '새봄 주간보호센터', a: '경기도 광명시 빛로 2', p: '경기도', c: '광명시', g: null, ey: null }
  ];
  const mapLink = row => `../nationwide-care-services-map.html?${new URLSearchParams({ type: 'daycare', p: '경기도', c: '광명시', ...(row ? { q: row.n } : {}) })}`;
  const cards = rows.map(row => `<li class="institution-card" data-institution-id="${row.i}"><h3><a href="${escape(mapLink(row))}">${escape(row.n)}</a></h3><p class="institution-address">${escape(row.a)}</p><dl><dt>공단 평가등급</dt><dd data-field="g">${row.g ? row.g + '등급' : '미확인'}</dd><dt>평가연도</dt><dd data-field="ey">${row.ey ? row.ey + '년' : '미확인'}</dd></dl></li>`).join('');
  const jsonLd = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'CollectionPage', name: '광명시 주간보호센터', url: meta.url },
    { '@type': 'BreadcrumbList', itemListElement: [`${origin}/`, `${origin}/daycare-map.html`, province.url, meta.url].map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: ['홈', '주간보호센터', '경기도', '광명시'][index], item })) }
  ] };
  const html = `<!doctype html><html lang="ko"><head><title>경기도 광명시 주간보호센터 | 돌봄한눈</title><meta name="description" content="경기도 광명시의 주간보호센터 2곳과 공단 공개 평가정보를 확인합니다."><meta name="robots" content="index,follow"><link rel="canonical" href="${meta.url}"><meta property="og:url" content="${meta.url}"><meta property="og:site_name" content="돌봄한눈"><meta property="og:title" content="광명시 주간보호센터"><meta property="og:description" content="광명시의 기관과 평가정보"><link rel="stylesheet" href="../regional-seo.css?v=1"><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body data-region-type="daycare" data-region-province="경기도" data-region-city="광명시"><h1>경기도 광명시 주간보호센터</h1><ul><li data-summary="count">전체 기관 2곳</li><li data-summary="evaluationCount">평가 확인 1곳</li><li data-summary="sourceDate">시설현황 2026.06.10 기준</li></ul><a href="${escape(mapLink())}">광명시 지도에서 찾기</a><ol class="institution-list">${cards}</ol></body></html>`;
  return { html, meta, rows, rootDir, sitemapUrls: [meta.url], pageByIdentity: new Map([['daycare|경기도|', province], ['daycare|경기도|광명시', meta]]) };
}

test('특수문자 기관명·주소와 한글 URL이 원본 그대로 표시되고 평가 누락은 미확인으로 남는다', t => {
  const input = fixture(t);
  assert.deepEqual(inspectRegionalPage(input).issues, []);
  assert.equal(localLinkPath(input.meta.url, input.meta.url, input.rootDir), path.join(input.rootDir, input.meta.file));
  assert.equal(decodeHtml('&#x1f469; &amp; &#39; &quot; &lt; &#0;'), '👩 & \' " < \ufffd');
});

test('평가연도 누락을 0년 또는 임의 최신 연도로 바꾸면 실패한다', t => {
  const input = fixture(t);
  for (const replacement of ['0년', '2026년', 'null']) {
    const html = input.html.replace('<dd data-field="ey">미확인</dd>', `<dd data-field="ey">${replacement}</dd>`);
    assert.ok(inspectRegionalPage({ ...input, html }).issues.some(issue => issue.includes('평가연도')));
  }
});

test('주소 미확인과 병원 건물의 실제 주소를 허위 병원평가 주장으로 오인하지 않는다', t => {
  const input = fixture(t);
  const rows = input.rows.map(row => ({ ...row }));
  rows[0].a = '경기도 광명시 빛로 1 미래요양병원';
  rows[1].a = null;
  const html = input.html.replace(escape(input.rows[0].a), rows[0].a).replace(escape(input.rows[1].a), '주소 미확인');
  assert.deepEqual(inspectRegionalPage({ ...input, html, rows }).issues, []);
  const falseClaim = html.replace('</body>', '<p>요양병원의 공단 평가등급을 제공합니다.</p></body>');
  assert.ok(inspectRegionalPage({ ...input, html: falseClaim, rows }).issues.some(issue => issue.includes('병원평가')));
});

test('기관이 삭제·중복되거나 JS에서만 노출되면 전체 정적 목록 검사가 실패한다', t => {
  const input = fixture(t);
  const hidden = input.html.replace('class="institution-card" data-institution-id="001"', 'class="institution-card" hidden data-institution-id="001"');
  assert.ok(inspectRegionalPage({ ...input, html: hidden }).issues.some(issue => issue.includes('기관명')));
  const duplicated = input.html.replace('data-institution-id="002"', 'data-institution-id="001"');
  assert.ok(inspectRegionalPage({ ...input, html: duplicated }).issues.some(issue => issue.includes('중복')));
  const scriptOnly = input.html.replace(/<ol class="institution-list">[\s\S]*?<\/ol>/, '<script>document.write("기관 목록")</script>');
  assert.ok(inspectRegionalPage({ ...input, html: scriptOnly }).issues.some(issue => issue.includes('전체 기관 목록')));
});

test('기관명 검색어의 ampersand 또는 지역 필터가 잘못 연결되면 실패한다', t => {
  const input = fixture(t);
  for (const [before, after] of [['type=daycare', 'type=facility'], ['c=%EA%B4%91%EB%AA%85%EC%8B%9C', 'c=%EB%B6%80%EC%B2%9C%EC%8B%9C'], ['%26', '%2526']]) {
    const html = input.html.replaceAll(before, after);
    assert.ok(inspectRegionalPage({ ...input, html }).issues.some(issue => issue.includes('필터')));
  }
});

test('없는 CSS·중복 사이트맵·잘못된 breadcrumb와 허위 별점은 통과하지 않는다', t => {
  const input = fixture(t);
  fs.unlinkSync(path.join(input.rootDir, 'regional-seo.css'));
  assert.ok(inspectRegionalPage(input).issues.some(issue => issue.includes('없는 내부 링크')));
  assert.ok(inspectRegionalPage({ ...input, sitemapUrls: [input.meta.url, input.meta.url] }).issues.some(issue => issue.includes('사이트맵')));
  const html = input.html.replace('"position":3', '"position":9').replace('"@type":"CollectionPage"', '"aggregateRating":{"@type":"AggregateRating","ratingValue":5},"@type":"CollectionPage"');
  const issues = inspectRegionalPage({ ...input, html }).issues;
  assert.ok(issues.some(issue => issue.includes('BreadcrumbList')));
  assert.ok(issues.some(issue => issue.includes('별점')));
});

test('인코딩한 상위 디렉터리나 실행형 링크를 내부 파일로 허용하지 않는다', t => {
  const input = fixture(t);
  assert.throws(() => localLinkPath('/%2e%2e%2f%2e%2e%2fetc/passwd', input.meta.url, input.rootDir), /저장소 밖/);
  assert.throws(() => localLinkPath('javascript:alert(1)', input.meta.url, input.rootDir), /실행형/);
  assert.equal(localLinkPath('https://www.longtermcare.or.kr/', input.meta.url, input.rootDir), null);
});
/** SOFTM-REGIONAL-VALIDATION-TEST END */
