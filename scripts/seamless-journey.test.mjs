/** SOFTM-SEAMLESS-JOURNEY START 날짜:20261119 : 세 화면의 브랜드 문구·4단계 순서·접근 가능한 연결이 서로 달라지지 않도록 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const serviceGuide = read('service-guide.html');
const about = read('about.html');
const picker = read('care-category-picker.js');
const index = read('index.html');
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
  assert.match(index, /care-seamless-journey\.css\?v=20261119-3/);
  assert.match(sitemap, /<loc>https:\/\/homecare\.designboard\.net\/service-guide\.html<\/loc><lastmod>2026-11-19<\/lastmod>/);
  assert.ok(existsSync(new URL('../service-guide.html', import.meta.url)));
});

test('인포그래픽은 반응형 카드·세로 타임라인과 44px 링크를 유지한다', () => {
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.care-seamless-journey--cards \{[\s\S]*?grid-template-columns: 1fr/);
  assert.match(styles, /\.care-seamless-entry-link \{[\s\S]*?min-height: 44px/);
  assert.doesNotMatch(styles, /animation:/);
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
