/** SOFTM-REGIONAL-VALIDATION START 날짜:20260904 : 생성 성공만으로 검색 품질을 판단하지 않도록 원본 기관자료와 실제 노출 HTML을 독립 대조 */
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib'; // SOFTM-DATA-REGIONS 날짜:20260904 : 지도와 지역 목록이 같은 압축 JSON을 읽도록 통일
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://homecare.designboard.net';
const TYPES = { daycare: 'daycare-map.html', facility: 'nursing-home-map.html', 'home-care': 'home-care-map.html' };
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

export function decodeHtml(value) {
  return String(value).replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (whole, entity) => {
    if (entity[0] !== '#') return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[entity.toLowerCase()];
    const code = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\ufffd';
  });
}

function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [], hidden: false };
  const stack = [root];
  const nodes = [];
  const source = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  for (const token of source.match(/<[^>"']*(?:"[^"]*"[^>"']*|'[^']*'[^>"']*)*>|[^<]+/g) || []) {
    const closing = token.match(/^<\/([\w:-]+)/);
    if (closing) {
      const index = stack.findLastIndex(node => node.tag === closing[1].toLowerCase());
      if (index > 0) stack.length = index;
      continue;
    }
    const opening = token.match(/^<([\w:-]+)\b([\s\S]*?)\/?>$/);
    if (opening) {
      const attrs = {};
      for (const attr of opening[2].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[attr[1].toLowerCase()] = decodeHtml(attr[2] ?? attr[3] ?? attr[4] ?? '');
      const parent = stack.at(-1);
      const node = { tag: opening[1].toLowerCase(), attrs, children: [], parent, hidden: parent.hidden || Object.hasOwn(attrs, 'hidden') || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attrs.style || '') };
      parent.children.push(node);
      nodes.push(node);
      if (!VOID.has(node.tag) && !/\/>$/.test(token)) stack.push(node);
    } else if (!token.startsWith('<!')) stack.at(-1).children.push(decodeHtml(token));
  }
  return nodes;
}

const textOf = node => !node || node.hidden ? '' : node.children.map(child => typeof child === 'string' ? child : textOf(child)).join(' ').replace(/\s+/g, ' ').trim();
const hasClass = (node, value) => (node.attrs.class || '').split(/\s+/).includes(value);
const descendants = node => node.children.filter(child => typeof child !== 'string').flatMap(child => [child, ...descendants(child)]);
const sameNumber = (node, expected) => Number(textOf(node).replaceAll(',', '').match(/\d+/)?.[0]) === expected;
const identity = meta => [meta.type, meta.province, meta.city || ''].join('|');

export function localLinkPath(href, pageUrl, rootDir) {
  const url = new URL(href, pageUrl);
  if (['javascript:', 'data:', 'vbscript:'].includes(url.protocol)) throw new Error('실행형 링크가 포함되어 있습니다.');
  if (url.origin !== ORIGIN) return null;
  const decoded = decodeURIComponent(url.pathname);
  const resolved = path.resolve(rootDir, `.${decoded === '/' ? '/index.html' : decoded}`);
  if (resolved !== rootDir && !resolved.startsWith(`${path.resolve(rootDir)}${path.sep}`)) throw new Error('링크가 저장소 밖을 가리킵니다.');
  return resolved;
}

function structuredData(html) {
  const result = [];
  function collect(value) {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') {
      if (value['@type']) result.push(value);
      Object.values(value).filter(item => item && typeof item === 'object').forEach(collect);
    }
  }
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) collect(JSON.parse(match[1]));
  return result;
}

export function inspectRegionalPage({ html, meta, rows, sitemapUrls, rootDir = ROOT, pageByIdentity = new Map() }) {
  const issues = [];
  const check = (condition, message) => { if (!condition) issues.push(message); };
  const nodes = parseHtml(html);
  const find = (tag, attr, value) => nodes.find(node => node.tag === tag && (!attr || node.attrs[attr] === value));
  const body = find('body');
  const bodyNodes = body ? descendants(body) : [];
  const titles = nodes.filter(node => node.tag === 'title');
  const title = textOf(titles[0]);
  const description = find('meta', 'name', 'description')?.attrs.content || '';
  const expectedUrl = `${ORIGIN}/${meta.file.split('/').map(encodeURIComponent).join('/')}`;
  check(meta.url === expectedUrl, '페이지 메타 URL이 실제 한글 파일 경로의 공개 주소와 다릅니다.');
  const h1 = bodyNodes.filter(node => node.tag === 'h1' && !node.hidden);
  check(titles.length === 1 && title.includes('돌봄한눈'), '고유 title 또는 브랜드가 없습니다.');
  check(description.length > 10 && !/\b(?:undefined|null|NaN)\b/.test(description), '페이지 설명이 비어 있거나 누락값을 표시합니다.');
  check(h1.length === 1 && textOf(h1[0]).length > 0, '자바스크립트 없이 읽는 h1이 정확히 한 개여야 합니다.');
  if (meta.city) check(title.includes(meta.city) && textOf(h1[0]).includes(meta.city), '제목에 실제 시군구가 없습니다.');
  const canonicals = nodes.filter(node => node.tag === 'link' && node.attrs.rel === 'canonical');
  check(canonicals.length === 1 && canonicals[0].attrs.href === meta.url, 'canonical이 해당 지역의 단일 자기 주소와 다릅니다.');
  check(find('meta', 'property', 'og:url')?.attrs.content === meta.url, 'OG URL이 canonical과 다릅니다.');
  check(find('meta', 'property', 'og:site_name')?.attrs.content === '돌봄한눈', 'OG 브랜드가 다릅니다.');
  check(Boolean(find('meta', 'property', 'og:title')?.attrs.content) && Boolean(find('meta', 'property', 'og:description')?.attrs.content), 'OG 제목 또는 설명이 없습니다.');
  const robots = find('meta', 'name', 'robots')?.attrs.content || '';
  check(/(?:^|,)\s*index\s*(?:,|$)/i.test(robots) && !/\b(?:noindex|nofollow|none)\b/i.test(robots), '지역 페이지 검색 수집을 허용해야 합니다.');
  check(sitemapUrls.filter(url => url === meta.url).length === 1, '사이트맵에 해당 지역 URL이 정확히 한 번 있어야 합니다.');
  check(body?.attrs['data-region-type'] === meta.type && body?.attrs['data-region-province'] === meta.province && (body?.attrs['data-region-city'] || '') === (meta.city || ''), '본문의 지역 범위가 페이지 주소와 다릅니다.');
  const evaluated = rows.filter(row => /^[A-E]$/.test(row.g || '')).length;
  check(rows.length === meta.count && evaluated === meta.evaluationCount, '페이지 메타의 기관 수 또는 평가 확인 수가 원본과 다릅니다.');
  const summary = key => bodyNodes.find(node => node.attrs['data-summary'] === key);
  check(sameNumber(summary('count'), rows.length), '보이는 전체 기관 수가 원본과 다릅니다.');
  check(sameNumber(summary('evaluationCount'), evaluated), '보이는 평가 확인 수가 원본과 다릅니다.');
  check(textOf(summary('sourceDate')).replace(/\D/g, '').includes(meta.sourceDate.replace(/\D/g, '')), '시설현황 원본 기준일이 없습니다.');
  const expectedRows = new Map(rows.map(row => [String(row.i), row]));
  const cards = bodyNodes.filter(node => hasClass(node, 'institution-card'));
  const seen = new Set();
  for (const card of cards) {
    const id = card.attrs['data-institution-id'];
    const row = expectedRows.get(id);
    check(Boolean(row) && !seen.has(id), `원본에 없거나 중복된 기관: ${id}`);
    seen.add(id);
    if (!row) continue;
    const children = descendants(card);
    const heading = children.find(node => node.tag === 'h3');
    const nameLink = heading && descendants(heading).find(node => node.tag === 'a');
    check(textOf(nameLink) === String(row.n).replace(/\s+/g, ' ').trim(), `${id}: 기관명 내용 또는 HTML 이스케이프가 다릅니다.`);
    check(textOf(children.find(node => hasClass(node, 'institution-address'))) === String(row.a || '주소 미확인').replace(/\s+/g, ' ').trim(), `${id}: 주소 내용 또는 HTML 이스케이프가 다릅니다.`);
    for (const field of ['g', 'ey']) {
      const value = textOf(children.find(node => node.attrs['data-field'] === field));
      const expected = field === 'g' ? (/^[A-E]$/.test(row.g || '') ? `${row.g}등급` : '미확인') : (Number.isInteger(row.ey) && row.ey >= 2000 && row.ey <= 2100 ? `${row.ey}년` : '미확인');
      check(value === expected, `${id}: ${field === 'g' ? '평가등급' : '평가연도'}가 원본 또는 미확인 표시와 다릅니다.`);
    }
    check(meta.type !== 'home-care' || !children.some(node => node.attrs['data-field'] === 'z'), `${id}: 방문요양에 입소 정원을 표시했습니다.`);
    for (const field of children.filter(node => node.attrs['data-field'] && ['z', 's', 'rn', 'na', 'pt', 'ot', 'cw'].includes(node.attrs['data-field']))) {
      const value = row[field.attrs['data-field']];
      const expected = field.attrs['data-field'] !== 'z' && row.staffMissing ? '일부 미확인' : Number.isFinite(value) && value > 0 ? `${value.toLocaleString('ko-KR')}명` : '미확인'; // SOFTM-DATA-REGIONS 날짜:20260904 : 급여별 인력 수집 누락이 확정 인원으로 노출되는 회귀를 검사
      check(textOf(field) === expected, `${id}: 정원 또는 인력이 원본 또는 미확인 표시와 다릅니다.`);
    }
    try {
      const link = new URL(nameLink?.attrs.href || '', meta.url);
      check(link.origin === ORIGIN && link.pathname === '/nationwide-care-services-map.html' && link.searchParams.get('type') === meta.type && link.searchParams.get('p') === row.p && link.searchParams.get('c') === row.c && link.searchParams.get('q') === row.n, `${id}: 기관 지도 링크가 실제 기관 필터와 다릅니다.`);
    } catch { issues.push(`${id}: 기관 지도 링크가 유효하지 않습니다.`); }
  }
  if (meta.city) check(cards.length === rows.length && seen.size === rows.length, '시군구의 전체 기관 목록이 정적 HTML에 없습니다.');
  else {
    check(cards.length === 0, '시도 허브에 시군구 전체 목록을 중복 노출했습니다.');
    const districts = bodyNodes.filter(node => node.tag === 'li' && Object.hasOwn(node.attrs, 'data-region-city'));
    const cities = [...new Set(rows.map(row => row.c))];
    check(districts.length === cities.length && new Set(districts.map(node => node.attrs['data-region-city'])).size === cities.length, '시도 허브의 시군구 목록이 누락되거나 중복되었습니다.');
    for (const district of districts) {
      const city = district.attrs['data-region-city'];
      const subset = rows.filter(row => row.c === city);
      const children = descendants(district);
      const target = pageByIdentity.get([meta.type, meta.province, city].join('|'));
      check(subset.length > 0 && sameNumber(children.find(node => hasClass(node, 'district-count')), subset.length), `${city}: 시군구 기관 수가 다릅니다.`);
      check(sameNumber(children.find(node => hasClass(node, 'district-evaluation-count')), subset.filter(row => /^[A-E]$/.test(row.g || '')).length), `${city}: 시군구 평가 확인 수가 다릅니다.`);
      check(Boolean(target) && new URL(children.find(node => node.tag === 'a')?.attrs.href || '', meta.url).href === target.url, `${city}: 시군구 정적 페이지 연결이 다릅니다.`);
    }
  }
  for (const node of nodes) {
    const href = node.attrs.href || (['script', 'img'].includes(node.tag) ? node.attrs.src : '');
    if (!href) continue;
    try {
      const local = localLinkPath(href, meta.url, rootDir);
      check(!local || fs.existsSync(local), `없는 내부 링크 또는 파일: ${href}`);
      const url = new URL(href, meta.url);
      if (url.origin === ORIGIN && url.pathname === '/nationwide-care-services-map.html') {
        check(url.searchParams.get('type') === meta.type && url.searchParams.get('p') === meta.province && (!meta.city || url.searchParams.get('c') === meta.city), `지도 링크의 지역 필터가 다릅니다: ${href}`);
        check(['type', 'p', 'c', 'q'].every(key => url.searchParams.getAll(key).length <= 1), `지도 링크에 중복 필터가 있습니다: ${href}`);
      }
    } catch (error) { issues.push(`내부 링크 해석 실패: ${href} (${error.message})`); }
  }
  try {
    const data = structuredData(html);
    const collections = data.filter(item => item['@type'] === 'CollectionPage');
    check(collections.length === 1 && collections[0].url === meta.url && Boolean(collections[0].name), 'CollectionPage의 이름 또는 자기 주소가 다릅니다.');
    const crumbs = data.filter(item => item['@type'] === 'BreadcrumbList');
    const trail = crumbs[0]?.itemListElement || [];
    const provincePage = pageByIdentity.get([meta.type, meta.province, ''].join('|'));
    const expected = [`${ORIGIN}/`, `${ORIGIN}/${TYPES[meta.type]}`, ...(meta.city ? [provincePage?.url] : []), meta.url];
    check(crumbs.length === 1 && trail.length === expected.length && trail.every((item, index) => item.position === index + 1 && item.name && (typeof item.item === 'string' ? item.item : item.item?.['@id']) === expected[index]), 'BreadcrumbList가 홈·유형·시도·시군구 경로와 다릅니다.');
    check(!data.some(item => [].concat(item['@type']).some(type => ['AggregateRating', 'Review'].includes(type)) || Object.hasOwn(item, 'aggregateRating') || Object.hasOwn(item, 'reviewRating')), '공단 평가를 이용자 별점 또는 후기 구조화 데이터로 표시했습니다.');
  } catch (error) { issues.push(`JSON-LD 해석 실패: ${error.message}`); }
  const editorialText = bodyNodes.filter(node => ['p', 'h1', 'h2'].includes(node.tag)).filter(node => {
    for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) if (hasClass(ancestor, 'institution-card')) return false;
    return true;
  }).map(textOf).join('\n');
  check(!/(?:요양병원|심평원).{0,20}(?:공단 평가|평가등급).{0,20}(?:제공합니다|비교합니다|확인하세요)|(?:★★★★★|★\s*[1-5]|별점\s*[:：]?\s*[1-5])/.test(editorialText), '지역 목록에 무관한 병원평가 또는 허위 별점 문구가 있습니다.');
  check(!/\b(?:undefined|null|NaN)\b/.test(textOf(body)), '정적 본문에 누락값이 그대로 표시되었습니다.');
  return { file: meta.file, title, description, count: cards.length, issues };
}

function sourceData(rootDir, type) {
  /** SOFTM-DATA-REGIONS START 날짜:20260904 : 생성기와 별도로 압축 JSON을 읽어 기관 목록의 누락과 표시값을 대조 */
  const dataDir = path.join(rootDir, 'data/care');
  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8'))[type];
  if (manifest?.file !== `${type}.json.gz`) throw new Error(`지역 검증 자료 경로 확인 필요: ${type}`);
  const rows = JSON.parse(gunzipSync(fs.readFileSync(path.join(dataDir, manifest.file))).toString('utf8'));
  return { manifest, rows };
  /** SOFTM-DATA-REGIONS END */
}

export async function auditRegionalSeo(rootDir = ROOT) {
  const { getRegionalSeoPages } = await import(pathToFileURL(path.join(rootDir, 'scripts/build-regional-seo.mjs')).href);
  const { pages } = getRegionalSeoPages(rootDir);
  const pageByIdentity = new Map(pages.map(meta => [identity(meta), meta]));
  const sitemapUrls = [...fs.readFileSync(path.join(rootDir, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decodeHtml(match[1]));
  const issues = [];
  const results = [];
  const expectedKeys = new Set();
  for (const type of Object.keys(TYPES)) {
    const { manifest, rows } = sourceData(rootDir, type);
    for (const row of rows) {
      expectedKeys.add([type, row.p, ''].join('|'));
      expectedKeys.add([type, row.p, row.c].join('|'));
    }
    for (const meta of pages.filter(page => page.type === type)) {
      const selected = rows.filter(row => row.p === meta.province && (!meta.city || row.c === meta.city));
      if (meta.sourceDate !== manifest.sourceDate) issues.push(`${meta.file}: 원본 매니페스트 기준일이 다릅니다.`);
      try {
        results.push(inspectRegionalPage({ html: fs.readFileSync(path.join(rootDir, meta.file), 'utf8'), meta, rows: selected, sitemapUrls, rootDir, pageByIdentity }));
      } catch (error) { issues.push(`${meta.file}: ${error.message}`); }
    }
  }
  if (pages.length !== pageByIdentity.size || expectedKeys.size !== pageByIdentity.size || [...expectedKeys].some(key => !pageByIdentity.has(key))) issues.push('실제 기관이 있는 시도·시군구별 3개 유형 페이지가 누락되거나 중복되었습니다.');
  const generatedFiles = fs.readdirSync(path.join(rootDir, 'regions')).filter(file => file.endsWith('.html')).map(file => `regions/${file}`);
  if (generatedFiles.length !== pages.length || generatedFiles.some(file => !pages.some(meta => meta.file === file))) issues.push('regions 폴더에 메타 목록과 다른 HTML이 있습니다.');
  for (const property of ['title', 'description']) if (new Set(results.map(result => result[property])).size !== results.length) issues.push(`지역별 ${property}가 중복되었습니다.`);
  return { pageCount: pages.length, institutionCount: results.reduce((total, result) => total + result.count, 0), issues: [...issues, ...results.flatMap(result => result.issues.map(issue => `${result.file}: ${issue}`))] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await auditRegionalSeo();
    if (report.issues.length) throw new Error(`지역 SEO 오류 ${report.issues.length}개:\n${report.issues.slice(0, 25).join('\n')}${report.issues.length > 25 ? '\n(처음 25개 표시)' : ''}`);
    console.log(`지역 SEO 검사 완료: ${report.pageCount.toLocaleString()}페이지 · 정적 기관 목록 ${report.institutionCount.toLocaleString()}곳 · 원본·검색주소·링크 일치`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
/** SOFTM-REGIONAL-VALIDATION END */
