/** SOFTM-REGIONAL-SEO START 날짜:20260904 : 지도와 같은 공개자료로 지역별 고유 기관 목록을 제공하고 생성 내용이 달라질 때만 검색 갱신일을 변경 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib'; // SOFTM-DATA-REGIONS 날짜:20260904 : 지도와 지역 목록이 같은 압축 JSON을 읽도록 통일

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REGIONAL_ORIGIN = 'https://homecare.designboard.net';
export const REGIONAL_TYPES = {
  daycare: {
    label: '주간보호센터', landing: 'daycare-map.html', category: '주야간보호센터 찾기',
    scope: '주간보호센터는 낮 동안 돌봄을 제공하는 주야간보호 기관입니다. 이 목록은 공단의 주야간보호 급여 자료에 포함된 기관을 안내합니다.',
    check: '송영 가능 지역, 운영 요일·시간, 식사와 프로그램, 실제 이용 가능 인원은 센터에 확인하세요.',
    staff: ['s', 'rn', 'na', 'pt', 'ot', 'cw'], capacity: true,
  },
  facility: {
    label: '요양원', landing: 'nursing-home-map.html', category: '요양원 찾기',
    scope: '이 목록의 요양원에는 노인요양시설과 노인요양공동생활가정이 포함됩니다. 장기요양 시설급여 기관의 안내이며 의료기관인 요양병원과 구분합니다.',
    check: '입소 가능 여부, 방 구성, 비급여 항목과 실제 비용은 기관에 확인하세요. 정원은 허가된 규모이며 현재 빈자리를 뜻하지 않습니다.',
    staff: ['s', 'rn', 'na', 'pt', 'ot', 'cw'], capacity: true,
  },
  'home-care': {
    label: '방문요양센터', landing: 'home-care-map.html', category: '방문요양센터 찾기',
    scope: '방문요양센터는 요양보호사가 가정을 방문해 신체활동과 일상생활을 지원하는 장기요양기관입니다. 이 목록은 센터의 소재지를 기준으로 묶었습니다.',
    check: '실제 방문 가능 지역과 시간, 필요한 돌봄 내용, 담당 요양보호사 배정 가능 여부는 센터에 확인하세요. 소재지와 방문 서비스 범위는 다를 수 있습니다.',
    staff: ['s', 'cw'], capacity: false,
  },
};
export const REGIONAL_PROVINCES = [
  ['서울특별시', 'seoul'], ['부산광역시', 'busan'], ['대구광역시', 'daegu'],
  ['인천광역시', 'incheon'], ['광주광역시', 'gwangju'], ['대전광역시', 'daejeon'],
  ['울산광역시', 'ulsan'], ['세종특별자치시', 'sejong'], ['경기도', 'gyeonggi'],
  ['강원특별자치도', 'gangwon'], ['충청북도', 'chungbuk'], ['충청남도', 'chungnam'],
  ['전북특별자치도', 'jeonbuk'], ['전라남도', 'jeonnam'], ['경상북도', 'gyeongbuk'],
  ['경상남도', 'gyeongnam'], ['제주특별자치도', 'jeju'],
];
const STAFF_LABELS = { s: '사회복지사', rn: '간호사', na: '간호조무사', pt: '물리치료사', ot: '작업치료사', cw: '요양보호사' };
const GENERATED_MARKER = 'SOFTM-REGIONAL-SEO START';
const FALLBACK_DATE = '2026-09-04';
const html = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const countText = (number) => Number(number).toLocaleString('ko-KR');
const compareText = (left, right) => String(left).localeCompare(String(right), 'ko');
const validGrade = (record) => /^[A-E]$/.test(record.g || '');
const positiveCount = (value) => Number.isFinite(value) && value > 0 ? `${countText(value)}명` : '미확인';
const encodedPath = (file) => file.split('/').map(encodeURIComponent).join('/');
const localDate = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function pageFile(provinceSlug, city, type) {
  const cityPart = city ? `-${city.normalize('NFC').trim().replace(/\s+/g, '-')}` : '';
  if (/[\\/]/.test(cityPart)) throw new Error(`지역명에 경로 구분자가 있습니다: ${city}`);
  return `regions/${provinceSlug}${cityPart}-${type}.html`;
}

function readLastmod(rootDir, file) {
  const target = path.join(rootDir, file);
  if (!existsSync(target)) return FALLBACK_DATE;
  return readFileSync(target, 'utf8').match(/<meta name="dcterms\.modified" content="(\d{4}-\d{2}-\d{2})">/)?.[1] || FALLBACK_DATE;
}

function loadRegionalSource(rootDir) {
  /** SOFTM-DATA-REGIONS START 날짜:20260904 : 폐기한 데이터 JS 대신 수집 자료 기반 검색 인덱스를 사용 */
  const dataDir = path.join(rootDir, 'data/care');
  const manifest = JSON.parse(readFileSync(path.join(dataDir, 'manifest.json'), 'utf8'));
  /** SOFTM-DATA-REGIONS END */
  const rowsByType = {};
  const allowedProvinces = new Set(REGIONAL_PROVINCES.map(([name]) => name));
  for (const type of Object.keys(REGIONAL_TYPES)) {
    const entry = manifest?.[type];
    /** SOFTM-DATA-REGIONS START 날짜:20260904 : 유형별 압축 파일과 수집 기준일을 검증한 뒤 정적 목록 생성 */
    if (entry?.file !== `${type}.json.gz` || !/^\d{4}-\d{2}-\d{2}$/.test(entry.sourceDate)) throw new Error(`지역 페이지 원본 매니페스트 확인 필요: ${type}`);
    const records = JSON.parse(gunzipSync(readFileSync(path.join(dataDir, entry.file))).toString('utf8'));
    /** SOFTM-DATA-REGIONS END */
    if (records.length !== entry.count) throw new Error(`${type}: 매니페스트 ${entry.count}곳과 원본 ${records.length}곳 불일치`);
    const ids = new Set();
    for (const record of records) {
      if (!record.i || ids.has(String(record.i))) throw new Error(`${type}: 기관기호 누락 또는 중복 ${record.i}`);
      if (!allowedProvinces.has(record.p) || !record.c || !record.n) throw new Error(`${type}: 지역·기관명 확인 필요 ${record.i}`);
      ids.add(String(record.i));
    }
    rowsByType[type] = records;
  }
  return { manifest, rowsByType };
}

function makePlan(rootDir) {
  const { manifest, rowsByType } = loadRegionalSource(rootDir);
  const pages = [];
  const byType = Object.fromEntries(Object.keys(REGIONAL_TYPES).map((type) => [type, []]));
  const dataByFile = new Map();
  const paths = new Set();
  for (const type of Object.keys(REGIONAL_TYPES)) {
    for (const [province, provinceSlug] of REGIONAL_PROVINCES) {
      const provinceRows = rowsByType[type].filter((record) => record.p === province);
      const cities = [...new Set(provinceRows.map((record) => record.c))].sort(compareText);
      for (const city of ['', ...cities]) {
        const records = (city ? provinceRows.filter((record) => record.c === city) : provinceRows).slice().sort((a, b) => compareText(a.n, b.n) || compareText(a.i, b.i));
        const file = pageFile(provinceSlug, city, type);
        if (paths.has(file)) throw new Error(`지역 경로 중복: ${file}`);
        paths.add(file);
        const page = {
          file, url: `${REGIONAL_ORIGIN}/${encodedPath(file)}`, type, province, city,
          count: records.length, evaluationCount: records.filter(validGrade).length,
          sourceDate: manifest[type].sourceDate, lastmod: readLastmod(rootDir, file),
        };
        pages.push(page);
        if (!city) byType[type].push(page);
        dataByFile.set(file, { records, provinceSlug });
      }
    }
  }
  return { pages, byType, dataByFile };
}

export function getRegionalSeoPages(rootDir = ROOT) {
  const { pages, byType } = makePlan(rootDir);
  return { pages, byType };
}

function mapLink(page, institution = '') {
  const query = new URLSearchParams({ type: page.type, p: page.province });
  if (page.city) query.set('c', page.city);
  if (institution) query.set('q', institution);
  return `../nationwide-care-services-map.html?${query}`;
}

function scopeName(page) {
  if (page.province === '세종특별자치시' && page.city === '세종시') return page.city;
  return [page.province, page.city].filter(Boolean).join(' ');
}

function fileLink(page) {
  return encodedPath(path.posix.basename(page.file));
}

function breadcrumbs(page, hub) {
  const config = REGIONAL_TYPES[page.type];
  const items = [
    { name: '홈', href: '../index.html', url: `${REGIONAL_ORIGIN}/` },
    { name: config.category, href: `../${config.landing}`, url: `${REGIONAL_ORIGIN}/${config.landing}` },
    { name: `${page.province} ${config.label}`, href: fileLink(hub), url: hub.url },
  ];
  if (page.city) items.push({ name: `${page.city} ${config.label}`, href: fileLink(page), url: page.url });
  return items;
}

function institutionCard(record, page) {
  const config = REGIONAL_TYPES[page.type];
  const grade = validGrade(record) ? `${record.g}등급` : '미확인';
  const year = Number.isInteger(record.ey) && record.ey >= 2000 && record.ey <= 2100 ? `${record.ey}년` : '미확인';
  const fields = [
    `<div><dt>공단 평가등급</dt><dd data-field="g">${html(grade)}</dd></div>`,
    `<div><dt>평가연도</dt><dd data-field="ey">${html(year)}</dd></div>`,
    ...(config.capacity ? [`<div><dt>정원</dt><dd data-field="z">${positiveCount(record.z)}</dd></div>`] : []),
    ...config.staff.map((key) => `<div><dt>${STAFF_LABELS[key]}</dt><dd data-field="${key}">${record.staffMissing ? '일부 미확인' : positiveCount(record[key])}</dd></div>`), // SOFTM-DATA-REGIONS 날짜:20260904 : 일부 급여의 인력만 수집된 값을 전체 인원으로 오인하지 않도록 표시
  ];
  return `        <li class="institution-card" data-institution-id="${html(record.i)}">
          <div class="institution-title"><h3><a href="${html(mapLink(page, record.n))}">${html(record.n)}</a></h3><span class="institution-map-note">지도에서 보기 ↗</span></div>
          <p class="institution-address">${html(record.a || '주소 미확인')}</p>
          <p class="institution-service">${html(record.tn || REGIONAL_TYPES[page.type].label)}</p>
          <dl class="institution-facts">${fields.join('')}</dl>
        </li>`;
}

function evaluationSummary(records) {
  const grades = ['A', 'B', 'C', 'D', 'E'].map((grade) => ({ grade, count: records.filter((record) => record.g === grade).length })).filter((entry) => entry.count > 0);
  const unknown = records.filter((record) => !validGrade(record)).length;
  const years = [...new Set(records.filter((record) => validGrade(record) && Number.isInteger(record.ey)).map((record) => record.ey))].sort((a, b) => a - b);
  const yearText = years.length ? `${years.join('·')}년 공개 평가를 함께 표시합니다. 기관마다 평가연도가 다를 수 있습니다.` : '이 지역 자료에서 평가연도를 확인할 수 없습니다.';
  return `<div class="evaluation-summary"><h3>이 지역 공단 평가정보</h3><ul class="evaluation-counts">${grades.map(({ grade, count }) => `<li>${grade}등급 <strong>${countText(count)}곳</strong></li>`).join('')}<li>미확인 <strong>${countText(unknown)}곳</strong></li></ul><p>${yearText} 등급은 공단의 공개 평가이며 돌봄한눈의 추천 순위가 아닙니다.</p></div>`;
}

function renderPage(page, plan) {
  const config = REGIONAL_TYPES[page.type];
  const { records } = plan.dataByFile.get(page.file);
  const hub = plan.byType[page.type].find((entry) => entry.province === page.province);
  const districtPages = plan.pages.filter((entry) => entry.type === page.type && entry.province === page.province && entry.city);
  const region = scopeName(page);
  const title = `${region} ${config.label} ${countText(page.count)}곳 · ${page.city ? '주소·평가 비교' : '시군구별 찾기'} | 돌봄한눈`;
  const description = page.city
    ? `${region} ${config.label} ${countText(page.count)}곳의 기관명·주소와 공단 평가등급·평가연도를 확인하세요. 평가 확인 ${countText(page.evaluationCount)}곳. ${page.sourceDate} 수집목록을 기준으로 지역 지도와 기관 비교로 연결합니다.`
    : `${page.province} ${config.label} ${countText(page.count)}곳을 ${countText(districtPages.length)}개 시군구별로 찾으세요. 지역별 기관 수와 공단 평가 확인 수, 전체 기관 목록과 지도를 제공합니다. 수집목록 ${page.sourceDate} 기준.`;
  const crumbs = breadcrumbs(page, hub);
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage', '@id': `${page.url}#page`, url: page.url,
        name: title.replace(' | 돌봄한눈', ''), description, inLanguage: 'ko-KR', dateModified: page.lastmod,
        isPartOf: { '@type': 'WebSite', name: '돌봄한눈', url: `${REGIONAL_ORIGIN}/` },
        about: { '@type': 'Thing', name: config.label },
        spatialCoverage: { '@type': 'AdministrativeArea', name: region },
        breadcrumb: { '@id': `${page.url}#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList', '@id': `${page.url}#breadcrumb`,
        itemListElement: crumbs.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.url })),
      },
    ],
  };
  const districtContent = page.city
    ? `    <section aria-labelledby="institutions-title">
      <div class="section-heading"><h2 id="institutions-title">${html(region)} ${html(config.label)} 전체 ${countText(page.count)}곳</h2><p>기관명 가나다순입니다. 기관명을 누르면 해당 지역·기관명으로 검색된 지도로 이동합니다.</p></div>
      ${evaluationSummary(records)}
      <ol class="institution-list">
${records.map((record) => institutionCard(record, page)).join('\n')}
      </ol>
    </section>`
    : `    <section aria-labelledby="districts-title">
      <div class="section-heading"><h2 id="districts-title">${html(page.province)} 시군구별 ${html(config.label)} 찾기</h2><p>각 지역의 기관 수와 평가정보 확인 수를 먼저 살펴보고, 지역을 선택해 전체 기관 목록을 확인하세요.</p></div>
      <ul class="district-list">
${districtPages.map((district) => `        <li data-region-city="${html(district.city)}"><a href="${fileLink(district)}"><h3>${html(district.city)}</h3><span class="district-count">기관수 ${countText(district.count)}곳</span><span class="district-evaluation-count">평가 확인 ${countText(district.evaluationCount)}곳</span><span class="district-action" aria-hidden="true">기관 목록 →</span></a></li>`).join('\n')}
      </ul>
    </section>`;
  const relatedTypes = Object.entries(REGIONAL_TYPES).filter(([type]) => type !== page.type).map(([type, related]) => {
    const relatedPage = plan.pages.find((entry) => entry.type === type && entry.province === page.province && entry.city === page.city) || plan.byType[type].find((entry) => entry.province === page.province);
    return `<li><a href="${fileLink(relatedPage)}">${html(scopeName(relatedPage))} ${related.label} <span>${countText(relatedPage.count)}곳 →</span></a></li>`;
  }).join('');
  const provinceNavigation = page.city
    ? `<p><a class="regional-back" href="${fileLink(hub)}">${html(page.province)} 전체 ${countText(districtPages.length)}개 지역 보기 →</a></p>`
    : `<nav class="province-navigation" aria-label="다른 시도 ${config.label}"><h3>다른 시도의 ${config.label}</h3><ul>${plan.byType[page.type].filter((entry) => entry.province !== page.province).map((entry) => `<li><a href="${fileLink(entry)}">${html(entry.province)}</a></li>`).join('')}</ul></nav>`;
  return `<!doctype html>
<!-- /** ${GENERATED_MARKER} 날짜:20260904 : 실제 지역별 기관 목록과 출처를 검색엔진과 이용자에게 동일하게 제공 */ -->
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${html(title)}</title>
  <meta name="description" content="${html(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta name="dcterms.modified" content="${page.lastmod}">
  <link rel="canonical" href="${page.url}">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="돌봄한눈">
  <meta property="og:title" content="${html(title)}">
  <meta property="og:description" content="${html(description)}">
  <meta property="og:url" content="${page.url}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${html(title)}">
  <meta name="twitter:description" content="${html(description)}">
  <script type="application/ld+json">${json(structuredData)}</script>
  <link rel="stylesheet" href="../seo-landing.css?v=20260904-3">
  <link rel="stylesheet" href="../regional-seo.css?v=20260904-1">
</head>
<body data-region-type="${page.type}" data-region-province="${html(page.province)}" data-region-city="${html(page.city)}">
<a class="skip-link" href="#main">본문으로 바로가기</a>
<header class="site-head"><div class="container site-head-inner"><a class="brand" href="../index.html">돌봄한눈</a><a class="home-link" href="../${config.landing}">전국 ${config.label} 찾기 →</a></div></header>
<main id="main">
  <section class="search-intro" aria-labelledby="page-title"><div class="container">
    <nav class="breadcrumb" aria-label="현재 위치">${crumbs.map((item, index) => `${index ? '<span aria-hidden="true">›</span>' : ''}${index === crumbs.length - 1 ? `<span aria-current="page">${html(item.name)}</span>` : `<a href="${item.href}">${html(item.name)}</a>`}`).join('')}</nav>
    <div class="intro-grid"><div class="intro-copy"><p class="eyebrow">지역별 장기요양기관 찾기</p><h1 id="page-title">${html(region)}<br>${config.label} 찾기</h1><p class="lead">${html(region)} ${config.label} ${countText(page.count)}곳${page.city ? '의 주소와 공단 평가정보를 확인하고, 가까운 기관을 지도에서 비교하세요.' : `을 ${countText(districtPages.length)}개 시군구로 나누어 살펴보세요. 지역을 선택하면 기관별 주소와 평가정보를 볼 수 있습니다.`}</p></div><div class="search-start"><p class="search-label">${html(region)}에서 가까운 기관을 찾으세요</p><a class="primary-button" href="${html(mapLink(page))}">지도에서 ${config.label} 찾기 <span aria-hidden="true">→</span></a><p class="start-note">${html(region)} ${config.label}로 지역·유형을 설정합니다.</p><a class="regional-list-link" href="#${page.city ? 'institutions-title' : 'districts-title'}">${page.city ? '전체 기관 목록' : '시군구 목록'} 먼저 보기 ↓</a></div></div>
    <ul class="data-summary" aria-label="지역 자료 범위"><li data-summary="count">${config.label} <strong>${countText(page.count)}곳</strong></li><li data-summary="evaluationCount">공단 평가 확인 <strong>${countText(page.evaluationCount)}곳</strong></li><li data-summary="sourceDate">수집목록 <time datetime="${page.sourceDate}">${page.sourceDate.replaceAll('-', '.')}</time> 기준</li></ul>
  </div></section>
  <div class="container content">
    <section class="regional-context" aria-labelledby="scope-title"><h2 id="scope-title">${config.label} 자료를 보는 방법</h2><p>${config.scope}</p><p>${config.check}</p></section>
${districtContent}
    <section class="regional-related" aria-labelledby="related-title"><h2 id="related-title">${html(region)}의 다른 돌봄기관</h2><ul>${relatedTypes}</ul>${provinceNavigation}</section>
    <section class="source-section" aria-labelledby="source-title"><h2 id="source-title">자료 출처·기준일과 미확인 정보</h2>
      <!-- SOFTM-DATA-REGIONS START 날짜:20260904 : 수집 날짜를 과거 원본 배포일로 오인하지 않도록 실제 목록·상세 출처를 안내 -->
      <p>기관명·주소${config.capacity ? '·정원' : ''}·직종별 인력은 국민건강보험공단의 <a href="https://www.data.go.kr/data/15059029/openapi.do" target="_blank" rel="noopener">기관 검색 (새 창)</a>·<a href="https://www.data.go.kr/data/15058856/openapi.do" target="_blank" rel="noopener">시설별 상세조회 (새 창)</a>와 공단 공개 상세 페이지에서 수집한 자료입니다. 목록 수집 기준일은 ${page.sourceDate}이며 상세 항목별 수집 시점은 다를 수 있습니다. 지역 구분은 수집 목록의 시도·시군구 값을 따릅니다.</p>
      <p>평가등급과 평가연도는 <a href="https://www.data.go.kr/data/15104801/fileData.do" target="_blank" rel="noopener">국민건강보험공단 장기요양기관 평가결과 (새 창)</a>에서 해당 급여의 기관기호로 연결한 공개 평가입니다. 평가연도는 수집목록 기준일과 다르며 기관마다 평가 시기가 다를 수 있습니다.</p>
      <p>평가 미확인은 이 자료에서 해당 기관의 공개 등급 또는 연도를 확인하지 못했다는 뜻이며 낮은 등급을 뜻하지 않습니다. ${config.capacity ? '정원과 ' : ''}인력은 양수로 확인된 자료값만 표시하고, 0 또는 값이 없는 경우 미확인으로 표시합니다. 일부 급여의 인력 자료가 없으면 일부 미확인으로 표시합니다. 직종별 인력은 현재 근무 인원이나 담당자 배정을 보장하지 않습니다.</p>
      <!-- SOFTM-DATA-REGIONS END -->
      <p>${page.city ? '이 목록은' : '각 지역 페이지는'} 자료에 포함된 기관 전체를 가나다순으로 제공하며 추천 순위가 아닙니다. 변경된 운영현황과 실제 이용 가능 여부는 기관 또는 <a href="https://www.longtermcare.or.kr/npbs/r/a/201/selectLtcoSrch.web" target="_blank" rel="noopener">공단 장기요양기관 찾기 (새 창)</a>에서 확인하세요.</p>
      <p class="service-note">돌봄한눈은 공공기관이 운영하는 서비스가 아닌 공개자료 기반의 검색·비교 정보 서비스입니다. 페이지 내용 갱신 <time datetime="${page.lastmod}">${page.lastmod}</time>.</p>
    </section>
  </div>
</main>
<footer><div class="container"><a href="../index.html">돌봄한눈</a><span>우리 부모님 요양·돌봄기관 찾기</span></div></footer>
</body>
</html>
<!-- /** SOFTM-REGIONAL-SEO END */ -->
`;
}

export function buildRegionalSeo({ rootDir = ROOT, check = false, changeDate = localDate() } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(changeDate)) throw new Error('변경일은 YYYY-MM-DD 형식이어야 합니다.');
  const plan = makePlan(rootDir);
  const mismatches = [];
  let written = 0;
  let unchanged = 0;
  for (const page of plan.pages) {
    const target = path.join(rootDir, page.file);
    const existing = existsSync(target) ? readFileSync(target, 'utf8') : null;
    let rendered = renderPage(page, plan);
    if (existing === rendered) { unchanged += 1; continue; }
    if (check) { mismatches.push(page.file); continue; }
    page.lastmod = changeDate;
    rendered = renderPage(page, plan);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, rendered);
    written += 1;
  }
  const expected = new Set(plan.pages.map((page) => path.posix.basename(page.file)));
  const regionDir = path.join(rootDir, 'regions');
  const removed = [];
  if (existsSync(regionDir)) for (const file of readdirSync(regionDir)) {
    if (!file.endsWith('.html') || expected.has(file)) continue;
    const target = path.join(regionDir, file);
    if (!readFileSync(target, 'utf8').includes(GENERATED_MARKER)) continue;
    if (check) mismatches.push(`regions/${file} (원본에서 사라진 지역)`);
    else { unlinkSync(target); removed.push(`regions/${file}`); }
  }
  if (mismatches.length) throw new Error(`지역 SEO 생성물 불일치 ${mismatches.length}개. node scripts/build-regional-seo.mjs 실행 필요:\n${mismatches.slice(0, 20).join('\n')}`);
  return { pages: plan.pages, byType: plan.byType, written, unchanged, removed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const unsupported = process.argv.slice(2).filter((arg) => arg !== '--check');
    if (unsupported.length) throw new Error(`지원하지 않는 인수: ${unsupported.join(', ')}`);
    const result = buildRegionalSeo({ check: process.argv.includes('--check') });
    console.log(`지역 SEO ${process.argv.includes('--check') ? '검사' : '생성'} 완료: ${result.pages.length}개 · 시도 허브 ${Object.values(result.byType).flat().length}개 · 변경 ${result.written}개 · 유지 ${result.unchanged}개 · 정리 ${result.removed.length}개`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
/** SOFTM-REGIONAL-SEO END */
