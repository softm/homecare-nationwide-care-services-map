/** SOFTM-SEAMLESS-JOURNEY START 날짜:20261119 : 세 화면의 브랜드 문구·4단계 순서·접근 가능한 연결이 서로 달라지지 않도록 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const serviceGuide = read('service-guide.html');
const about = read('about.html');
const picker = read('care-category-picker.js');
const index = read('index.html');
const careCost = read('care-cost.html');
const costStyles = read('care-cost.css');
const styles = read('care-seamless-journey.css');
const sitemap = read('sitemap.xml');
const stages = [
  ['돌봄 방식 정하기', '집·센터·시설 중 부모님 상황에 맞는 유형 선택'],
  ['가까운 기관 찾기', '현재 위치 또는 지역을 기준으로 후보 확인'],
  ['공개정보 비교하기', '평가·정원·인력·사진·특화서비스 비교'],
  ['비용·동선·상담 준비', '예상 부담액·담은 기관 비교·길찾기·상담 질문 확인']
];

function assertJourney(source, label) {
  const journey = source.match(/<ol class="care-seamless-journey[^"]*">([\s\S]*?)<\/ol>/);
  assert.ok(journey, `${label}: 4단계 순서 목록이 없습니다.`);
  const journeyMarkup = journey[1];
  let cursor = -1;
  for (const [title, description] of stages) {
    const titlePosition = journeyMarkup.indexOf(title);
    assert.ok(titlePosition > cursor, `${label}: ${title} 단계 순서가 다릅니다.`);
    assert.ok(journeyMarkup.includes(description), `${label}: ${title} 설명이 다릅니다.`);
    cursor = titlePosition;
  }
}

test('서비스 안내와 소개가 같은 원스톱 심리스 4단계를 제공한다', () => {
  assert.match(serviceGuide, /id="seamless-journey"/);
  assert.match(serviceGuide, /부모님 돌봄, 찾기부터 비교·비용·상담 준비까지/);
  assert.match(about, /일관된 기준 · 신뢰할 수 있는 돌봄 정보/);
  assertJourney(serviceGuide, '서비스 안내');
  assertJourney(about, '서비스 소개');
  assert.equal((serviceGuide.match(/class="care-seamless-icon" aria-hidden="true"/g) || []).length, 4);
  assert.equal((about.match(/class="care-seamless-icon" aria-hidden="true"/g) || []).length, 4);
});

test('브랜드 컨셉과 핵심가치는 일관성·신뢰성·투명성·실용성으로 정리한다', () => {
  const principles = about.match(/<section class="care-brand-principles"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(principles, /브랜드 컨셉/);
  assert.match(principles, /처음부터 끝까지, 같은 기준으로 이어지는 돌봄 정보/);
  assert.match(principles, /신뢰성\(정확성\)/);
  assert.match(principles, /투명성/);
  assert.match(principles, /실용성/);
  assert.doesNotMatch(principles, />중립성</);
  assert.equal((principles.match(/<li>/g) || []).length, 3);
  assert.match(serviceGuide, /공개자료를 일관된 기준으로 연결/);
});

test('지도 첫 진입은 위저드 없이 유형 선택 후 지도·목록으로 바로 연결한다', () => {
  assert.match(picker, /돌봄 유형을 먼저 선택해 주세요/);
  assert.match(picker, /선택하면 가까운 기관을 찾는 지도·목록으로 바로 이동합니다/);
  assert.doesNotMatch(picker, /원스톱 심리스 · 1\/4|aria-current="step"|4단계 요약/);
  assert.match(picker, /href="service-guide\.html#seamless-journey"/);
  assert.match(index, /care-seamless-journey\.css\?v=20261120-map1/);
  assert.match(sitemap, /<loc>https:\/\/homecare\.designboard\.net\/service-guide\.html<\/loc><lastmod>2026-11-20<\/lastmod>/);
  assert.ok(existsSync(new URL('../service-guide.html', import.meta.url)));
});

test('인포그래픽은 반응형 카드·세로 타임라인과 44px 링크를 유지한다', () => {
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.care-seamless-journey--cards \{[\s\S]*?grid-template-columns: 1fr/);
  assert.match(styles, /\.care-seamless-entry-link \{[\s\S]*?min-height: 44px/);
  assert.doesNotMatch(styles, /animation:/);
});

test('첫 후속 인포그래픽은 질문·핵심 유형·CTA·출처와 주의사항을 모두 제공한다', () => {
  const topic = serviceGuide.match(/<section class="care-topic-infographic"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(topic, /id="care-type-guide"/);
  assert.match(topic, /우리 부모님은 어디에서 돌봄받는 게 편할까요/);
  assert.equal((topic.match(/<li>/g) || []).length, 4);
  for (const text of ['방문요양·방문간호·방문목욕', '주·야간보호센터', '요양원·공동생활가정', '요양병원·단기보호·치매전담형']) assert.match(topic, new RegExp(text));
  assert.match(topic, /href="index\.html">유형 선택하고 기관 찾기/);
  assert.match(topic, /국민건강보험공단 공개 분류/);
  assert.match(topic, /건강보험심사평가원 공개자료/);
  assert.match(topic, /실제 이용 가능 여부와 적합성.*최종 확인/);
  assert.match(styles, /\.care-type-paths \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.care-type-paths \{ grid-template-columns: 1fr; \}/);
});

test('지도 검색·기관 목록에 같은 판단 인포그래픽을 제공한다', () => { // SOFTM-DETAIL-ESSENTIALS 날짜:20261121 : 상세는 사용자 요청에 따라 중복 상태 카드 없이 핵심 정보만 제공
  const listStyles = read('care-list-view.css');
  assert.match(index, /class="care-search-infographic"/);
  for (const text of ['위치', '생활권 안 후보 찾기', '공개정보', '평가·정원·인력 비교', '기관 확인', '빈자리·비용·운영 상담']) assert.match(index, new RegExp(text));
  assert.match(index, /function careListEvidenceHtml\(c\)[\s\S]*?if\(!globalThis\.CareDecisionSummary\)return ''/);
  assert.match(listStyles, /\.care-list-evidence \{ display:block/);
  assert.match(styles, /\.care-search-infographic ol \{[^}]*grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/);
});

test('두 번째 후속 인포그래픽은 평가·정원·인력을 단정 없이 읽도록 안내한다', () => {
  const topic = about.match(/<section class="care-topic-infographic care-evidence-infographic"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(topic, /id="evidence-guide"/);
  assert.match(topic, /평가가 높고 정원이 크면 더 좋은 기관일까요/);
  assert.equal((topic.match(/<li>/g) || []).length, 4);
  for (const text of ['평가는 연도부터 확인', '정원은 빈자리가 아닙니다', '인력은 기준일의 공개 현황', '미평가·미확인은 낮은 점수가 아닙니다']) assert.match(topic, new RegExp(text));
  assert.match(topic, /href="index\.html">기관 공개정보 비교하기/);
  assert.match(topic, /국민건강보험공단/);
  assert.match(topic, /건강보험심사평가원/);
  assert.match(topic, /기관과 공식 출처에서 최종 확인/);
  assert.match(styles, /\.care-evidence-points \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?\.care-evidence-points \{ grid-template-columns: 1fr; \}/);
  assert.match(sitemap, /<loc>https:\/\/homecare\.designboard\.net\/about\.html<\/loc><lastmod>2026-11-20<\/lastmod>/);
});

test('세 번째 후속 인포그래픽은 등급부터 실제 부담액 확인까지 비용 요소를 안내한다', () => {
  const topic = careCost.match(/<section class="cost-infographic"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(topic, /id="cost-grade-guide"/);
  assert.match(topic, /장기요양등급만 알면 실제 월 비용도 알 수 있을까요/);
  assert.equal((topic.match(/<li>/g) || []).length, 4);
  for (const text of ['등급과 급여 선택', '본인부담 유형 확인', '초과분·비급여 더하기', '기관에 최종 확인']) assert.match(topic, new RegExp(text));
  assert.match(topic, /한도 안 급여의 본인부담/);
  assert.match(topic, /월 한도 초과분/);
  assert.match(topic, /선택한 비급여/);
  assert.match(topic, /href="#cost-calculator">내 조건으로 예상 비용 계산하기/);
  assert.match(topic, /2026년 보건복지부/);
  assert.match(topic, /국민건강보험공단과 이용 기관에서 최종 확인/);
  assert.match(careCost, /id="cost-calculator" data-care-cost-page/);
  assert.match(costStyles, /\.cost-infographic-steps \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(costStyles, /@media \(max-width: 600px\)[\s\S]*?\.cost-infographic-steps \{ grid-template-columns: 1fr; \}/);
  assert.match(costStyles, /\.cost-infographic-action a \{[^}]*min-height: 46px/);
  assert.match(sitemap, /<loc>https:\/\/homecare\.designboard\.net\/care-cost\.html<\/loc><lastmod>2026-11-20<\/lastmod>/);
});

test('공식 서비스 구분·자료 출처와 기존 핵심 행동을 보존한다', () => {
  assert.match(about, /정부 공식 서비스나 상담기관이 아닙니다/);
  assert.match(about, /국민건강보험공단 자료/);
  assert.match(about, /건강보험심사평가원 자료/);
  assert.match(about, /자료 기준일과 실제 현황은 다를 수 있습니다/);
  assert.match(about, /최신 정보를 최종 확인해 주세요/);
  assert.match(serviceGuide, /href="#categories">돌봄 유형부터 고르기/);
  assert.match(serviceGuide, /href="#cost-guide">예상 비용 알아보기/);
});
/** SOFTM-SEAMLESS-JOURNEY END */
