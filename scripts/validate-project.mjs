import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getRegionalSeoPages } from './build-regional-seo.mjs'; // SOFTM-SEO-REGIONAL-CHECK 날짜:20260904 : 실제 데이터로 생성한 지역 목록만 검색 대표에 포함하도록 검사

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = message => { throw new Error(message); };
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));
execFileSync(process.execPath, ['--test', path.join(root, 'scripts/viewport-regions.test.mjs')], { stdio: 'inherit' }); // SOFTM-VIEWPORT-REGIONS 날짜:20260904 : 정기 검사에서 모든 기관 지역 연결과 화면영역 누락 회귀를 함께 확인

function localScripts(htmlFile) {
  const html = read(htmlFile);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    const attrs = match[1] || '';
    const src = (attrs.match(/\bsrc=["']([^"']+)["']/i) || [])[1];
    if (src && !/^(?:https?:)?\/\//i.test(src)) {
      const relative = src.split(/[?#]/)[0];
      if (!exists(relative)) fail(`${htmlFile}: 로컬 스크립트 누락 ${relative}`);
    }
    const type = (attrs.match(/\btype=["']([^"']+)["']/i) || [])[1] || '';
    if (!src && !/json/i.test(type) && match[2].trim()) new vm.Script(match[2], { filename: htmlFile });
  }
}

function runFiles(files, initial = {}) {
  const context = vm.createContext({ window: { ...initial } });
  for (const file of files) new vm.Script(read(file), { filename: file }).runInContext(context);
  return context.window;
}

/** SOFTM-SEO-LANDING START 날짜:20260903 : 검색 대표 페이지와 실제 지도 유형의 연결 관계를 한 곳에서 검증 */
const categoryLandingPages = {
  facility: 'nursing-home-map.html',
  daycare: 'daycare-map.html', // SOFTM-DAYCARE-LANDING 날짜:20260904 : 주야간보호도 공통 안내를 거치는 진입 경로를 검증
  'home-care': 'home-care-map.html',
  'home-nursing': 'home-nursing-map.html',
  'home-bath': 'home-bath-map.html',
  'short-stay': 'short-stay-care-map.html',
  'welfare-equipment': 'welfare-equipment-map.html', // SOFTM-CARE-CATEGORIES 날짜:20260904 : 복지용구도 안내·지도·사이트맵·광고 공통 경로를 검증
  dementia: 'dementia-care-map.html',
  'nursing-hospital': 'nursing-hospital-map.html'
};
const indexCategories = Object.keys(categoryLandingPages);
const landingPages = [...new Set(Object.values(categoryLandingPages))];
/** SOFTM-SEO-LANDING END */

for (const html of ['index.html', 'nationwide-daycare-map.html', 'nationwide-care-services-map.html', 'gwangmyeong-daycare-center-map.html', ...landingPages]) localScripts(html); // SOFTM-DAYCARE-LANDING 날짜:20260904 : 안내와 분리된 기존 전용 지도의 스크립트 검사도 유지

/** SOFTM-INDEX-ENTRY-CHECK START 날짜:20260903 : 인덱스 광고 크기와 모든 요양 카테고리 직행 링크가 함께 유지되도록 자동 검사 */
const indexSource = read('index.html');
for (const category of indexCategories) {
  const landingPage = categoryLandingPages[category];
  /** SOFTM-INDEX-UNIFIED START 날짜:20260904 : 홈에서 특정 유형이 중복 노출되거나 지도 진입이 누락되는 회귀를 방지 */
  const entryLinks = [...indexSource.matchAll(/<a\b[^>]*href="([^"]+)"/g)].filter(match => match[1] === landingPage);
  if (entryLinks.length !== 1) fail(`index.html: ${category} 안내 링크는 정확히 한 개여야 합니다.`);
  /** SOFTM-INDEX-UNIFIED END */
  /** SOFTM-DAYCARE-LANDING START 날짜:20260904 : 안내 페이지가 각 유형의 실제 지도와 광고 영역으로 이어지는지 함께 검증 */
  const mapPage = `nationwide-care-services-map.html?type=${category}`; // SOFTM-DAYCARE-UNIFIED 날짜:20260904 : 주야간보호에도 다른 유형과 같은 통합 지도 연결을 검증
  const landing = read(landingPage);
  if (!landing.includes(`href="${mapPage}"`) || landing.includes('href="nationwide-daycare-map.html"')) fail(`${landingPage}: ${category} 통합 지도 연결 불일치`); // SOFTM-DAYCARE-UNIFIED 날짜:20260904 : 안내에서 이전 전용 지도로 다시 분기되지 않도록 검사
  if (!landing.includes(`data-care-category="${category}"`)) fail(`${landingPage}: 제휴 문의 기관 유형 누락`);
  if ((landing.match(/id="categoryAdZone"/g) || []).length !== 1 || !landing.includes('category-landing-ads.js') || !landing.includes('category-landing-ad-config.js')) fail(`${landingPage}: 2단계 전용 광고 영역·설정 누락`);
  if (category !== 'daycare' && (!landing.includes('href="daycare-map.html"') || landing.includes('href="nationwide-daycare-map.html"'))) fail(`${landingPage}: 주야간보호 안내 진입 누락`);
  /** SOFTM-DAYCARE-LANDING END */
}
if (!indexSource.includes('index-ad-config.js') || !indexSource.includes('initIndexAds()')) fail('index.html: 인덱스 전용 광고 초기화 누락'); // SOFTM-INDEX-AD-UNIT 날짜:20260903 : 요양 광고 설정을 잘못 재사용하지 않도록 전용 설정 파일을 검사
const indexAdConfig = runFiles(['index-ad-config.js']).INDEX_AD_CONFIG; // SOFTM-INDEX-AD-UNIT 날짜:20260903 : 승인된 인덱스 광고 크기와 단위를 독립 검증
if (indexAdConfig?.kakao?.desktop?.width !== 728 || indexAdConfig?.kakao?.desktop?.height !== 90) fail('인덱스 PC 광고는 728×90 배너여야 합니다.');
if (indexAdConfig?.kakao?.mobile?.width !== 320 || indexAdConfig?.kakao?.mobile?.height !== 100) fail('인덱스 모바일 광고는 320×100 배너여야 합니다.');
if (indexAdConfig?.kakao?.desktop?.unit !== 'DAN-q4nR1JpPnBFtotbe') fail('인덱스 PC 광고 단위가 승인값과 다릅니다.'); // SOFTM-INDEX-AD-UNIT 날짜:20260903 : 광고 화면별 집계가 섞이지 않도록 승인 단위를 고정
if (indexAdConfig?.kakao?.mobile?.unit !== 'DAN-fmQS1GFVu1j2yBow') fail('인덱스 모바일 광고 단위가 승인값과 다릅니다.'); // SOFTM-INDEX-AD-UNIT 날짜:20260903 : 모바일 인덱스의 승인 단위가 유지되는지 확인
/** SOFTM-INDEX-ENTRY-CHECK END */

/** SOFTM-LANDING-ADS START 날짜:20260904 : 안내 광고가 기존 수익 슬롯을 재사용하거나 잘못된 크기로 요청되지 않도록 검증 */
if (indexSource.includes('href="nationwide-daycare-map.html"')) fail('index.html: 주야간보호는 안내 페이지를 거쳐야 합니다.');
const landingAdConfig = runFiles(['category-landing-ad-config.js']).CATEGORY_LANDING_AD_CONFIG;
const existingAdUnits = ['index-ad-config.js', 'nationwide-care-ad-config.js', 'nationwide-daycare-ad-config.js'].flatMap(file => [...read(file).matchAll(/unit:\s*['"]([^'"]+)['"]/g)].map(match => match[1]));
for (const [device, width, height] of [['desktop', 728, 90], ['mobile', 320, 100]]) {
  const slot = landingAdConfig.kakao[device];
  if (slot.width !== width || slot.height !== height) fail(`안내 ${device} 광고 크기 불일치`);
  if (slot.unit && existingAdUnits.includes(slot.unit)) fail(`안내 ${device} 광고에 인덱스·지도 광고 단위 재사용`);
}
/** SOFTM-LANDING-ADS END */

/** SOFTM-SEO-LANDING-CHECK START 날짜:20260903 : 공개 도메인·브랜드·검색 대표 페이지와 지도 도구의 색인 경계가 다시 섞이지 않도록 자동 검증 */
const publicOrigin = 'https://homecare.designboard.net';
if (read('CNAME').trim() !== new URL(publicOrigin).hostname) fail('CNAME과 검색 대표 Origin이 다릅니다.');
const robotsSource = read('robots.txt');
const sitemapDirectives = [...robotsSource.matchAll(/^Sitemap:\s*(\S+)/gim)].map(match => match[1]);
if (sitemapDirectives.length !== 1 || sitemapDirectives[0] !== `${publicOrigin}/sitemap.xml`) fail('robots.txt는 공개 도메인의 단일 sitemap.xml만 안내해야 합니다.');
const sitemapSource = read('sitemap.xml');
const sitemapUrls = [...sitemapSource.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].replaceAll('&amp;', '&'));
const expectedSitemapUrls = [
  `${publicOrigin}/`,
  ...landingPages.map(page => `${publicOrigin}/${page}`),
  ...getRegionalSeoPages(root).pages.map(page => page.url) // SOFTM-SEO-REGIONAL-CHECK 날짜:20260904 : 지역별 실기관 페이지의 누락과 임의 주소 추가를 함께 차단
];
if (sitemapUrls.length !== expectedSitemapUrls.length || expectedSitemapUrls.some(url => !sitemapUrls.includes(url))) fail('sitemap.xml 공개 페이지 목록이 누락되거나 불필요한 URL을 포함합니다.');
const indexablePages = [['index.html', `${publicOrigin}/`], ...landingPages.map(page => [page, `${publicOrigin}/${page}`])];
for (const [htmlFile, canonical] of indexablePages) {
  const source = read(htmlFile);
  if (!source.includes('<meta name="robots" content="index,follow')) fail(`${htmlFile}: 검색 허용 robots 메타 누락`);
  if (!source.includes('rel="canonical"') || !source.includes(`href="${canonical}"`)) fail(`${htmlFile}: 공개 도메인 canonical 누락`);
  if (!source.includes(`content="${canonical}"`)) fail(`${htmlFile}: 공개 도메인 OG URL 누락`);
  if (!source.includes('property="og:site_name" content="돌봄한눈"')) fail(`${htmlFile}: 돌봄한눈 사이트명 누락`);
  const jsonLdBlocks = [...source.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (!jsonLdBlocks.length) fail(`${htmlFile}: JSON-LD 구조화 데이터 누락`);
  for (const block of jsonLdBlocks) JSON.parse(block[1]);
}
const careMapSource = read('nationwide-care-services-map.html');
if (!careMapSource.includes('<meta name="robots" content="index,follow')) fail('전국 요양 지도는 검색 등록을 허용하는 index,follow 메타를 유지해야 합니다.'); // SOFTM-SEO-INDEX 날짜:20260904 : 지도 검색 등록을 차단했던 noindex 설정이 다시 적용되지 않도록 검사
if (!careMapSource.includes('const LANDING_URLS=') || !careMapSource.includes('canonicalUrl=new URL(LANDING_URLS[TYPE]')) fail('전국 요양 지도와 검색 대표 페이지의 유형별 canonical 연결 누락');
for (const [category, landingPage] of Object.entries(categoryLandingPages)) {
  if (!careMapSource.includes(`${category}:'${landingPage}'`) && !careMapSource.includes(`'${category}':'${landingPage}'`)) fail(`전국 요양 지도: ${category} 검색 대표 페이지 연결 누락`);
}
const directionsSource = read('services/vercel-api/api/directions.js');
if (!directionsSource.includes(`"${publicOrigin}"`)) fail('길찾기 API의 공식 공개 Origin 허용 누락');
if (['index.html', 'nationwide-care-services-map.html', ...landingPages, 'robots.txt', 'sitemap.xml'].some(file => read(file).includes('https://softm.github.io'))) fail('검색 설정에 예전 GitHub Pages 대표 주소가 남아 있습니다.');
/** SOFTM-SEO-LANDING-CHECK END */

/** SOFTM-GEOCODER-CHECK START 날짜:20260902 : 서버 주소 API 재유입과 SDK·캐시 응답 형식 회귀를 자동 검증 */
for (const html of ['nationwide-daycare-map.html', 'nationwide-care-services-map.html']) {
  const source = read(html);
  if (/\/api\/(?:geocode|reverse-geocode)\b/.test(source)) fail(`${html}: 제거한 주소 변환 서버 API 호출이 남아 있습니다.`);
  if (!source.includes('naver-geocoder.js')) fail(`${html}: 공용 주소 변환 모듈 누락`);
  const sdkUrls = source.match(/https:\/\/oapi\.map\.naver\.com\/openapi\/v3\/maps\.js\?[^'"\s]+/g) || [];
  if (sdkUrls.length !== 1) fail(`${html}: 네이버 Maps JavaScript SDK는 한 번만 로드해야 합니다.`);
  const sdkUrl = sdkUrls[0] || '';
  if (!/[?&]ncpKeyId=etfcybk8vf(?:&|$)/.test(sdkUrl)) fail(`${html}: Geocoding 권한이 연결된 네이버 Maps API Key ID가 아닙니다.`); // SOFTM-MAPS-KEY 날짜:20260902 : 잘못된 구형 Client ID가 다시 배포되지 않도록 신규 Key ID를 고정 검증
  if (!/[?&]submodules=[^&]*\bgeocoder\b/.test(sdkUrl)) fail(`${html}: 네이버 SDK geocoder 서브모듈 누락`);
}
if (exists('services/vercel-api/api/geocode.js') || exists('services/vercel-api/api/reverse-geocode.js')) fail('삭제 대상 주소 변환 서버 API 파일이 남아 있습니다.');

/** SOFTM-NHIS-DETAIL-FALLBACK-CHECK START 날짜:20260903 : 상세 수집 진행 중에도 두 지도에서 공단 기준자료가 오류 대신 표시되도록 검사 */
const careSource = read('nationwide-care-services-map.html');
const daycareSource = read('nationwide-daycare-map.html');
const nhisLoaderSource = read('nhis-static-data.js');
if (!careSource.includes('officialSummaryTabData') || !careSource.includes('공단 기준자료 우선 표시')) fail('전국 요양 공단 상세 기준자료 대체 표시 누락');
if (!daycareSource.includes('daycareSummaryDetailHtml') || !daycareSource.includes('daycareOfficialType(center)')) fail('전국 주간 공단 상세 구현 또는 실제 급여코드 조회 누락');
if (/NhisStaticData\.detail\(id\s*,\s*['"]B03['"]\)/.test(daycareSource)) fail('전국 주간 공단 상세 급여코드 B03 고정 호출이 남아 있습니다.');
if (!nhisLoaderSource.includes("collected('detail'") || !nhisLoaderSource.includes('code?(details[code]||null)')) fail('공단 상세 수집목록 검사 또는 급여코드 오조회 방지 누락');
if (!nhisLoaderSource.includes('.json.gz') || !nhisLoaderSource.includes("new DecompressionStream('gzip')")) fail('공단 상세 gzip 경로 또는 브라우저 압축 해제 로직 누락'); // SOFTM-NHIS-GZIP 날짜:20260903 : 비압축 상세가 다시 배포되어 GitHub Pages 용량을 초과하지 않도록 검사
/** SOFTM-NHIS-DETAIL-FALLBACK-CHECK END */

async function verifyGeocoderModule() {
  const storage = new Map();
  let geocodeCalls = 0;
  let reverseCalls = 0;
  class LatLng {
    constructor(lat, lng) { this.latitude = lat; this.longitude = lng; }
    lat() { return this.latitude; }
    lng() { return this.longitude; }
  }
  const service = {
    Status: { OK: 'OK' },
    OrderType: { ROAD_ADDR: 'roadaddr', ADDR: 'addr' },
    geocode({ query }, callback) {
      geocodeCalls += 1;
      callback('OK', { v2: { addresses: query.includes('광명시') ? [{ x: '126.848121', y: '37.481552' }] : [] } });
    },
    reverseGeocode({ coords, orders }, callback) {
      reverseCalls += 1;
      if (orders !== 'roadaddr,addr') fail('공용 역주소 변환 orders 오류');
      const wardBoundary = coords.lng() < 126.8;
      const region = wardBoundary
        ? { area1: { name: '경기도' }, area2: { name: '부천시' }, area3: { name: '소사구' }, area4: { name: '소사본동' } }
        : { area1: { name: '경기도' }, area2: { name: '광명시' }, area3: { name: '광명동' }, area4: { name: '' } };
      callback('OK', { v2: { results: [
        { name: 'roadaddr', region, land: { name: wardBoundary ? '경인로' : '오리로', number1: '1034', number2: '1' } },
        { name: 'addr', region, land: { name: '', number1: '158', number2: '123' } }
      ] } });
    }
  };
  const browserWindow = {
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); }
    },
    naver: { maps: { Service: service, LatLng } }
  };
  const context = vm.createContext({ window: browserWindow, console });
  new vm.Script(read('naver-geocoder.js'), { filename: 'naver-geocoder.js' }).runInContext(context);
  const api = browserWindow.NaverGeocoder;
  const [first, duplicate] = await Promise.all([
    api.geocodeAddress('경기도 광명시 오리로 1034-1'),
    api.geocodeAddress('  경기도  광명시  오리로  1034-1  ')
  ]);
  if (!first || first.lat !== 37.481552 || first.lng !== 126.848121) fail('공용 주소 변환 x/y 숫자 변환 오류');
  if (duplicate.lat !== first.lat || duplicate.lng !== first.lng || geocodeCalls !== 1) fail('공용 주소 변환 캐시·중복 요청 제거 오류');
  const gwangmyeong = await api.reverseGeocode(first.lat, first.lng);
  if (gwangmyeong.province !== '경기도' || gwangmyeong.city !== '광명시' || gwangmyeong.district !== '광명동') fail('광명시 역주소 지역 추출 오류');
  if (gwangmyeong.roadAddress !== '경기도 광명시 오리로 1034-1' || !gwangmyeong.jibunAddress) fail('도로명·지번주소 구성 오류');
  const cachedReverse = await api.reverseGeocode(first.lat + 0.000001, first.lng + 0.000001);
  if (cachedReverse.city !== '광명시' || reverseCalls !== 1) fail('역주소 반올림 캐시 오류');
  const sosa = await api.reverseGeocode(37.48, 126.79);
  if (sosa.city !== '부천시 소사구' || sosa.district !== '소사본동') fail('소사구 경계지역 정규화 오류');
}
await verifyGeocoderModule();
/** SOFTM-GEOCODER-CHECK END */

const daycareFiles = fs.readdirSync(root).filter(name => /^nationwide-daycare-data-.*\.js$/.test(name)).sort();
const daycare = runFiles(daycareFiles).NATIONAL_DAYCARE_DATA || [];
if (daycare.length !== 5757) fail(`전국 주간 기관 수 오류: ${daycare.length}`); // SOFTM-CARE-CATEGORIES 날짜:20260904 : 일반 급여 코드가 없는 치매전담 주야간보호 6곳의 누락을 방지
if (new Set(daycare.map(row => row.i)).size !== daycare.length) fail('전국 주간 기관기호 중복');

const evaluations = runFiles(['nationwide-daycare-evaluations.js']).NATIONAL_DAYCARE_EVALUATIONS || {};
if (Object.keys(evaluations).length !== 3355) fail(`전국 주간 평가 수 오류: ${Object.keys(evaluations).length}`); // SOFTM-CARE-CATEGORIES 날짜:20260904 : 추가 기관의 공식 평가도 함께 연결되었는지 확인

const manifest = runFiles(['nationwide-care-manifest.js']).NATIONAL_CARE_MANIFEST;
if (!manifest) fail('전국 요양 매니페스트 누락');
let careDaycare = [];
const categoryRows = {}; // SOFTM-CARE-CATEGORIES 날짜:20260904 : 특화기관이 해당 기본 급여에도 포함되는지 교차 검증
for (const [category, meta] of Object.entries(manifest)) {
  for (const file of meta.files) if (!exists(file)) fail(`${category}: 데이터 파일 누락 ${file}`);
  const rows = runFiles(meta.files).NATIONAL_CARE_DATA || [];
  categoryRows[category] = rows; // SOFTM-CARE-CATEGORIES 날짜:20260904 : 실제 배포 데이터로 분류 누락을 확인
  if (rows.length !== meta.count) fail(`${category}: ${rows.length}곳, 매니페스트 ${meta.count}곳`);
  if (new Set(rows.map(row => row.i)).size !== rows.length) fail(`${category}: 기관기호 중복`);
  if (category === 'daycare') careDaycare = rows;
}

/** SOFTM-CARE-CATEGORIES START 날짜:20260904 : 기관 수가 맞아도 특정 급여·치매전담 기관이 잘못 분류되는 회귀를 차단 */
if (Object.keys(manifest).length !== indexCategories.length || indexCategories.some(category => !manifest[category])) fail('안내 페이지와 데이터 카테고리 불일치');
if (categoryRows.facility.length !== 6481 || categoryRows['welfare-equipment'].length !== 1851) fail('요양시설 또는 복지용구 기준 기관 수 불일치');
if (categoryRows['welfare-equipment'].some(row => row.t.split(',').some(code => !['B06', 'C06'].includes(code)))) fail('복지용구에 다른 급여가 혼입되었습니다.');
for (const record of categoryRows.dementia) {
  for (const code of record.t.split(',')) {
    const parent = /^[HI]/.test(code) ? 'daycare' : 'facility';
    if (!categoryRows[parent].some(row => row.i === record.i && row.t.split(',').includes(code))) fail(`${record.i}: 치매전담 ${code}가 기본 ${parent}에서 누락되었습니다.`);
  }
}
if (!indexSource.includes('요양원·공동생활가정') || !indexSource.includes('치매전담형') || !indexSource.includes('요양병원(의료기관)')) fail('실제 급여 범위를 설명하는 카테고리 명칭 누락');
/** SOFTM-CARE-CATEGORIES END */

const daycareIds = new Set(daycare.map(row => row.i));
const careIds = new Set(careDaycare.map(row => row.i));
const missingInCare = [...daycareIds].filter(id => !careIds.has(id));
const missingInDaycare = [...careIds].filter(id => !daycareIds.has(id));
if (missingInCare.length || missingInDaycare.length) fail(`주야간보호 기관 불일치: 전국 요양 누락 ${missingInCare.length}, 전국 주간 누락 ${missingInDaycare.length}`);
const careDaycareById = new Map(careDaycare.map(row => [row.i, row]));
if (daycare.some(row => careDaycareById.get(row.i)?.a !== row.a)) fail('전국 주간·전국 요양 주야간보호 주소 불일치'); // SOFTM-GEOCODER-CONSISTENCY 날짜:20260902 : 같은 기관이 같은 SDK 좌표를 얻도록 원본 주소까지 비교
if (daycare.some(row => ['t', 'z', 's', 'rn', 'na', 'pt', 'ot', 'cw'].some(key => (careDaycareById.get(row.i)?.[key] ?? 0) !== row[key]))) fail('두 주야간보호 지도의 급여·정원·인력 불일치'); // SOFTM-CARE-CATEGORIES 날짜:20260904 : 같은 기관이라도 치매전담실 수치가 한쪽 지도에만 합산되는 오류를 방지

for (const file of ['nationwide-daycare-ad-config.js', 'nationwide-care-ad-config.js', 'partner-inquiry-config.js', 'partner-inquiry.js']) new vm.Script(read(file), { filename: file }); // SOFTM-PARTNER-CHECK 날짜:20260904 : 공용 문의 스크립트의 구문 오류가 두 지도를 함께 중단하지 않도록 검사
for (const file of ['naver-geocoder.js', 'nhis-static-data.js', 'services/vercel-api/api/directions.js']) { // SOFTM-NHIS-STATIC-CHECK 날짜:20260902 : 폐기한 공단 프록시 대신 공용 정적 데이터 모듈을 검사
  execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
}

console.log(`검사 완료: 전국 주간 ${daycare.length.toLocaleString()}곳 · 평가 ${Object.keys(evaluations).length.toLocaleString()}곳 · 전국 요양 ${Object.keys(manifest).length}개 유형 · 주야간보호 기관 차이 0곳`);
