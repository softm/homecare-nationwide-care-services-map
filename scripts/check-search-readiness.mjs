/** SOFTM-SEARCH-READINESS START 날짜:20260904 : 로컬 수정만으로 검색 준비가 끝났다고 오인하지 않도록 실제 배포 응답을 별도로 검사 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const publicOrigin = 'https://homecare.designboard.net';
const root = new URL('../', import.meta.url);
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'");

export function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3])]));
}

export function inspectPage({ url, status, headers, html, expectedCanonical }) {
  const issues = [];
  const source = html.replace(/<!--[\s\S]*?-->/g, '');
  const metas = [...source.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
  const links = [...source.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0]));
  const title = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
  const robots = metas.filter(meta => ['robots', 'googlebot', 'yeti'].includes(meta.name?.toLowerCase()));
  const directives = [...robots.map(meta => meta.content || ''), headers.get('x-robots-tag') || ''].join(',').toLowerCase();
  const canonical = links.find(link => link.rel?.toLowerCase() === 'canonical')?.href;
  if (status !== 200) issues.push(`HTTP ${status}`);
  if (!headers.get('content-type')?.includes('text/html')) issues.push('HTML 응답 형식이 아님');
  if (/(?:^|[\s,:])(noindex|none)(?:[\s,;]|$)/.test(directives)) issues.push('검색 등록 차단: noindex 또는 none');
  if (!robots.some(meta => meta.name?.toLowerCase() === 'robots' && /(?:^|,)\s*index\s*(?:,|$)/i.test(meta.content || ''))) issues.push('명시적인 index 메타 누락');
  if (!title.includes('돌봄한눈')) issues.push('제목에 사이트명 누락');
  if (canonical !== expectedCanonical) issues.push(`대표 주소 불일치: ${canonical || '없음'}`);
  if (!source.match(/<h1\b[^>]*>[\s\S]*?\S[\s\S]*?<\/h1>/i)) issues.push('대표 제목 h1 누락');
  if (url === `${publicOrigin}/`) {
    if (!source.match(/<h1\b[^>]*>[\s\S]*?돌봄한눈[\s\S]*?<\/h1>/i)) issues.push('홈페이지 대표 제목에 브랜드 누락');
    try {
      const structured = [...source.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match => JSON.parse(match[1]));
      if (!structured.some(item => item['@type'] === 'WebSite' && item.name === '돌봄한눈' && item.url === `${publicOrigin}/`)) issues.push('홈페이지 WebSite 이름·주소 불일치');
    } catch { issues.push('구조화 데이터 해석 실패'); }
  }
  return { url, status, title, canonical, issues };
}

export async function auditSite(origin = publicOrigin) {
  const requestedOrigin = new URL(origin);
  if (!['https:', 'http:'].includes(requestedOrigin.protocol) || requestedOrigin.pathname !== '/' || requestedOrigin.search || requestedOrigin.hash || requestedOrigin.username || requestedOrigin.password) throw new Error('검사 주소는 경로나 인증정보 없는 HTTP(S) Origin이어야 합니다.');
  const results = [];
  const fetchPath = async pathname => {
    const url = new URL(pathname, requestedOrigin);
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error', headers: { 'User-Agent': 'DolbomHannun-ReadinessCheck/1.0' } });
    return { status: response.status, headers: response.headers, html: await response.text() };
  };
  const localSitemap = fs.readFileSync(new URL('sitemap.xml', root), 'utf8');
  const urls = [...localSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
  if (!urls.length || urls.some(url => new URL(url).origin !== publicOrigin)) throw new Error('사이트맵에 공개 도메인 외 주소가 포함되었거나 URL이 없습니다.');
  for (const pathname of ['/robots.txt', '/sitemap.xml']) {
    try {
      const response = await fetchPath(pathname);
      const issues = [];
      if (response.status !== 200) issues.push(`HTTP ${response.status}`);
      if (pathname === '/robots.txt') {
        const rules = response.html.replace(/#.*$/gm, '');
        if (!/^User-agent:\s*\*\s*$/im.test(rules) || !/^Allow:\s*\/\s*$/im.test(rules)) issues.push('전체 수집 허용 규칙 누락');
        if (/^Disallow:\s*\/\s*$/im.test(rules)) issues.push('전체 수집 차단 규칙 감지');
        if (!rules.includes(`Sitemap: ${publicOrigin}/sitemap.xml`)) issues.push('공식 사이트맵 안내 누락');
      } else {
        const liveUrls = [...response.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
        if (new Set(liveUrls).size !== liveUrls.length || liveUrls.length !== urls.length || urls.some(url => !liveUrls.includes(url))) issues.push('배포 사이트맵과 제출 대상 목록 불일치');
        if (response.html !== localSitemap) issues.push('배포 사이트맵이 현재 수정본과 다름');
      }
      results.push({ url: `${publicOrigin}${pathname}`, status: response.status, issues });
    } catch (error) { results.push({ url: `${publicOrigin}${pathname}`, issues: [error.message] }); }
  }
  const pages = [...urls.map(url => [url, url]), ...['nationwide-care-services-map.html', 'nationwide-daycare-map.html'].map(page => [`${publicOrigin}/${page}`, `${publicOrigin}/daycare-map.html`])]; // SOFTM-DAYCARE-LANDING 날짜:20260904 : 두 지도와 주야간보호 안내의 검색 대표 연결을 같이 검사
  for (const [url, expectedCanonical] of pages) {
    try { results.push(inspectPage({ url, expectedCanonical, ...await fetchPath(new URL(url).pathname) })); }
    catch (error) { results.push({ url, issues: [error.message] }); }
  }
  return {
    checkedAt: new Date().toISOString(),
    inspectedOrigin: requestedOrigin.origin,
    passed: results.every(result => !result.issues.length),
    scope: 'HTTP·HTML 검색 허용·브랜드·대표 주소·사이트맵 검사. 실제 색인·검색 순위·방문 유입은 별도 확인 필요.',
    results
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  try {
    const report = await auditSite(process.argv[2] || publicOrigin);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.passed ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
/** SOFTM-SEARCH-READINESS END */
