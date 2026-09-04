/** SOFTM-SEO-ENTRYPOINTS START 날짜:20260904 : 지역별 실제 목록이 홈·유형 안내와 단일 사이트맵에서 함께 발견되도록 생성 결과를 연결 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRegionalSeoPages } from './build-regional-seo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://homecare.designboard.net';
const CONFIG = {
  daycare: { file: 'daycare-map.html', label: '주간보호센터', intro: '주간보호센터는 공단 자료에서 주야간보호로 분류됩니다. 지역별 기관 목록에서 주소와 공개 평가연도를 확인하고, 지도로 이동해 위치·정원·인력을 비교하세요.', compare: '송영 가능 지역과 이용 시간을 확인하세요', detail: '지역 목록에는 공개자료의 기관 주소가 표시됩니다. 실제 송영 범위·이용 시간·현재 이용 가능 여부는 센터에 확인하세요.' },
  facility: { file: 'nursing-home-map.html', label: '요양원', intro: '지역별 요양원 목록에서 기관 주소와 공단 공개 평가연도를 확인하세요. 해당 시설 자료에 포함된 노인요양공동생활가정도 함께 안내하며 기관별 실제 유형을 표시합니다.', compare: '평가연도와 실제 시설 유형을 함께 확인하세요', detail: '공단 평가등급은 공개된 평가의 결과입니다. 기관마다 평가연도가 다르므로 주소·정원·인력과 함께 비교하고, 입소 가능 여부는 기관에 확인하세요.' },
  'home-care': { file: 'home-care-map.html', label: '방문요양센터', intro: '방문요양센터·방문요양기관을 시도와 시군구별로 찾아보세요. 지역 목록에서 기관 주소와 공단 공개 평가를 확인한 뒤 지도에서 위치와 기관정보를 비교할 수 있습니다.', compare: '기관 소재지와 방문 가능 지역을 구분하세요', detail: '목록의 지역은 기관 주소 기준입니다. 실제 방문 서비스 제공 지역·시간·현재 이용 가능 여부는 해당 방문요양센터에 확인하세요.' }
};
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const count = value => Number(value).toLocaleString('ko-KR');
const localUrl = url => new URL(url).pathname.slice(1);
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());

function replaceBlock(html, key, block, marker) {
  const expression = new RegExp(`<!-- SOFTM-${key} START[\\s\\S]*?<!-- SOFTM-${key} END -->`);
  if (expression.test(html)) return html.replace(expression, () => block);
  if (!html.includes(marker)) throw new Error(`${key}: 삽입 위치가 없습니다.`);
  return html.replace(marker, () => `${block}\n${marker}`);
}

function connectStyles(html) {
  if (html.includes('href="seo-entrypoints.css')) return html;
  return html.replace('</head>', '<link rel="stylesheet" href="seo-entrypoints.css?v=20260904-1"> <!-- SOFTM-SEO-ENTRYPOINTS 날짜:20260904 : 지역 탐색 링크를 작은 화면에서도 읽고 선택할 수 있도록 전용 서식을 연결 -->\n</head>');
}

function regionSection(type, hubs) {
  const config = CONFIG[type];
  return `<!-- SOFTM-SEO-REGIONS START 날짜:20260904 : 방문자가 검색한 지역의 실제 기관 목록을 지도 실행 전에도 확인하도록 제공 -->
    <section class="seo-regions" id="regions" aria-labelledby="regions-title">
      <div class="section-heading"><h2 id="regions-title">지역별 ${config.label} 찾기</h2><p>${config.intro}</p></div>
      <nav class="seo-region-grid" aria-label="${config.label} 시도별 목록">
${hubs.map(hub => `        <a href="${esc(localUrl(hub.url))}"><strong>${esc(hub.province)} ${config.label}</strong><span>${count(hub.count)}곳 · 평가정보 ${count(hub.evaluationCount)}곳</span></a>`).join('\n')}
      </nav>
      <div class="seo-comparison-note"><h3>${config.compare}</h3><p>${config.detail}</p><p>평가정보가 없다는 표시는 낮은 등급을 뜻하지 않습니다. 공개자료에 연결된 평가가 없는 기관은 미확인으로 구분합니다.</p></div>
    </section>
<!-- SOFTM-SEO-REGIONS END -->`;
}

function homeSection() {
  return `<!-- SOFTM-SEO-HOME START 날짜:20260904 : 기관 유형 선택 다음에 지역별 실제 목록을 탐색할 수 있는 경로를 제공 -->
    <section class="seo-home-content" aria-labelledby="regional-title">
      <h2 id="regional-title">우리 동네 돌봄기관을 찾으세요</h2>
      <p>요양원·주간보호센터·방문요양센터를 지역별 목록에서 살펴보세요. 기관 주소와 공단 평가연도를 확인한 뒤 지도에서 비교할 수 있습니다.</p>
      <nav class="seo-region-grid" aria-label="지역별 기관 목록 바로가기">
        <a href="daycare-map.html#regions"><strong>지역별 주간보호센터</strong><span>주야간보호센터 주소·평가 확인</span></a>
        <a href="nursing-home-map.html#regions"><strong>지역별 요양원</strong><span>공개 평가·정원·시설 유형 확인</span></a>
        <a href="home-care-map.html#regions"><strong>지역별 방문요양센터</strong><span>기관 소재지·공개 평가 확인</span></a>
      </nav>
      <p class="seo-service-note">돌봄한눈은 공단·심평원 공개자료를 바탕으로 정보를 제공하는 독립 검색·비교 서비스입니다. 장기요양기관은 공개 평가정보가 있는 경우에만 평가를 표시하며, 요양병원은 심평원 개설현황과 위치를 안내합니다.</p>
    </section>
<!-- SOFTM-SEO-HOME END -->`;
}

export function syncSeoEntrypoints({ rootDir = ROOT, check = false } = {}) {
  const { pages, byType } = getRegionalSeoPages(rootDir);
  const updates = new Map();
  for (const [type, config] of Object.entries(CONFIG)) {
    const original = fs.readFileSync(path.join(rootDir, config.file), 'utf8');
    let html = connectStyles(original);
    html = replaceBlock(html, 'SEO-REGIONS', regionSection(type, byType[type]), '    <section class="guide-section"');
    updates.set(config.file, html);
  }
  const home = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  updates.set('index.html', replaceBlock(connectStyles(home), 'SEO-HOME', homeSection(), '  </main>'));
  const oldSitemap = fs.readFileSync(path.join(rootDir, 'sitemap.xml'), 'utf8');
  const mainEntries = [...oldSitemap.matchAll(/<url>[\s\S]*?<\/url>/g)].map(match => match[0]).filter(entry => !entry.includes(`${ORIGIN}/regions/`));
  if (!mainEntries.length) throw new Error('기존 유형별 검색 대표 사이트맵이 없습니다.');
  const entries = mainEntries.map(entry => {
    const url = entry.match(/<loc>([^<]+)<\/loc>/)?.[1];
    const file = new URL(url).pathname.slice(1) || 'index.html';
    if (updates.has(file) && updates.get(file) !== fs.readFileSync(path.join(rootDir, file), 'utf8')) {
      return entry.replace(/<lastmod>[^<]+<\/lastmod>/, `<lastmod>${today()}</lastmod>`);
    }
    return entry;
  });
  entries.push(...pages.map(page => `<url><loc>${esc(page.url)}</loc><lastmod>${page.lastmod}</lastmod></url>`));
  updates.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <!-- SOFTM-SEO-SITEMAP START 날짜:20260904 : 기존 검색 대표와 실기관을 제공하는 지역 목록만 단일 사이트맵으로 제출 -->\n${entries.map(entry => `  ${entry}`).join('\n')}\n  <!-- SOFTM-SEO-SITEMAP END -->\n</urlset>\n`);
  const changed = [...updates].filter(([file, html]) => fs.readFileSync(path.join(rootDir, file), 'utf8') !== html);
  if (check && changed.length) throw new Error(`검색 진입·사이트맵 재생성 필요: ${changed.map(([file]) => file).join(', ')}`);
  if (!check) for (const [file, html] of changed) fs.writeFileSync(path.join(rootDir, file), html);
  return { checked: updates.size, changed: changed.map(([file]) => file), regionalPages: pages.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(syncSeoEntrypoints({ check: process.argv.includes('--check') })));
}
/** SOFTM-SEO-ENTRYPOINTS END */
