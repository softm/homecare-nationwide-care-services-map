/** SOFTM-CARE-MATCH START 날짜:20260910 : 중요 조건의 삼상태 판정·전체 집계·기존 필터 전달을 독립 사례로 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../advanced-search.js';
import { criteriaFor, assess, analyzeMatch, renderConditions, renderMatchComparison } from '../care-insights.js';
import { readPreferences, relevantPreferences, effectiveFilters, destinationUrl, compactHighlights, selectedCriteriaFor, compactScopeLabel, compactSelectedCriteria } from '../care-match.js';
const context = { type: 'daycare', sourceDate: '2026-09-08', featureDate: '2026-09-04', preferences: ['evaluation-ab', 'nurse', 'rehab', 'feature:cognitive'] };
const criterion = id => criteriaFor('daycare').find(item => item.id === id);
const a = { i:'1',n:'가센터',g:'A',ey:2023,t:'B03',rn:1,pt:0,ot:0 };
const b = { i:'2',n:'나센터',g:'C',ey:2024,t:'B03',rn:0,pt:null,ot:0 };
test('9개 유형에서 병원은 조건 없음, 복지용구는 인력 제외, 특화 조건은 공용 유형 규칙을 따른다',()=>{
 const types=['facility','daycare','home-care','home-nursing','home-bath','short-stay','welfare-equipment','dementia','nursing-hospital'];
 for(const type of types)for(const c of criteriaFor(type).filter(c=>c.kind==='feature'))assert(c.keys.every(key=>CareAdvancedSearch.groupsFor(type).some(group=>group.options.some(option=>option[0]===key))));
 assert.deepEqual(criteriaFor('nursing-hospital'),[]);assert.equal(criteriaFor('welfare-equipment').some(c=>c.kind==='staff'),false);
});
test('공단 A·B, C~E와 미확인을 구분하고 평가연도를 근거로 표시한다',()=>{
 assert.equal(assess(a,criterion('evaluation-ab'),context).status,'confirmed');
 assert.equal(assess(b,criterion('evaluation-ab'),context).status,'different');
 assert.equal(assess({...a,g:'N'},criterion('evaluation-ab'),context).status,'unknown');
 assert.match(assess(a,criterion('evaluation-ab'),context).evidence,/2023년/);
});
test('인력의 명시적 0과 누락·복수급여를 구분하고 재활 인력 OR는 확인된 양수를 우선한다',()=>{
 assert.equal(assess(b,criterion('nurse'),context).status,'different');
 for(const row of [{...a,rn:null},{...a,staffMissing:true},{...a,t:'B03,H31'}])assert.equal(assess(row,criterion('nurse'),context).status,'unknown');
 assert.equal(assess({...b,pt:1},criterion('rehab'),context).status,'confirmed');
 assert.equal(assess(b,criterion('rehab'),context).status,'unknown');
});
test('특화 확인은 공용 비트 판정을 재사용하고 목록 미등재·로딩 실패는 미확인이다',()=>{
 const index={features:['cognitive-daycare'],records:{1:[1,1],2:[1,0]}},hasFeature=CareAdvancedSearch.createMatcher(index,'daycare').hasFeature;
 assert.equal(assess(a,criterion('feature:cognitive'),{...context,hasFeature}).status,'confirmed');
 assert.equal(assess(b,criterion('feature:cognitive'),{...context,hasFeature}).status,'unknown');
 assert.match(assess(a,criterion('feature:cognitive'),{...context,featureError:true}).evidence,/불러오지 못해/);
});
test('전체 145곳을 페이지 제한 없이 집계하고 기관은 제외하거나 순서를 변경하지 않는다',()=>{
 const rows=Array.from({length:145},(_,i)=>({...(i%2?a:b),i:String(i)}));const ids=rows.map(row=>row.i);
 const report=analyzeMatch(rows,context);assert.equal(report.total,145);assert.deepEqual(report.cards.map(card=>card.id),ids);
 for(const item of report.counts)assert.equal(item.confirmed+item.different+item.unknown,145);
 assert.deepEqual(rows.map(row=>row.i),ids);
});
test('기관별 처음 3개와 펼침, 상담 질문·공통점·차이를 표시하고 HTML을 이스케이프한다',()=>{
 const conditions=analyzeMatch([a],context).cards[0].conditions;
 const html=renderConditions(conditions);assert.match(html,/나머지 조건 1개/);
 assert.match(renderMatchComparison([{...a,n:'<img src=x>'}],context),/&lt;img/);
 assert.match(renderMatchComparison([a,b],context),/이 조건으로 상담할 질문/);
});
test('검색 목록에는 확인된 특화서비스만 최대 2개와 나머지 수를 표시한다',()=>{
 const conditions=[
  {id:'evaluation-ab',status:'different',label:'공단 평가 A·B등급'},
  {id:'nurse',status:'confirmed',label:'간호사 등록'},
  {id:'feature:dementia',status:'unknown',label:'치매전담 장기요양기관'},
  {id:'feature:cognitive',status:'confirmed',label:'인지활동형 프로그램 제공기관'},
  {id:'feature:respite',status:'confirmed',label:'가족휴가제 제공기관'},
  {id:'feature:integrated',status:'confirmed',label:'통합재가서비스 제공기관'}
 ];
 const compact=compactHighlights(conditions);
 assert.deepEqual(compact.items.map(item=>item.id),['feature:cognitive','feature:respite']);
 assert.equal(compact.remaining,1);
 assert.deepEqual(compactHighlights(conditions.filter(item=>item.status!=='confirmed')),{items:[],remaining:0});
});
test('설정 패널의 선택 조건은 질문 순서를 유지하고 지원하지 않는 값은 제외한다',()=>{
 const selected=selectedCriteriaFor('daycare',['feature:cognitive','unknown','evaluation-ab']);
 assert.deepEqual(selected.map(item=>item.id),['evaluation-ab','feature:cognitive']);
});
test('조건 패널은 복수 지도 지역과 중요 조건을 짧게 요약한다',()=>{
 assert.equal(compactScopeLabel('지도 영역 · 경기도 부천시 · 서울특별시 구로구'),'현재 지도 영역');
 assert.equal(compactScopeLabel('경기도 광명시'),'경기도 광명시');
 const compact=compactSelectedCriteria([{id:'a'},{id:'b'},{id:'c'}]);
 assert.deepEqual(compact,{items:[{id:'a'}],remaining:2});
});
test('손상된 세션은 초기화하고 유형에서 지원하지 않는 조건은 알림용으로 분리한다',()=>{
 assert.equal(readPreferences({getItem:()=>'{broken'}).active,false);
 const saved=readPreferences({getItem:()=>JSON.stringify({active:true,preferences:['nurse','nurse','feature:cognitive']})});
 assert.deepEqual(relevantPreferences(saved,'welfare-equipment'),{preferences:[],omitted:['nurse','feature:cognitive']});
 assert.deepEqual(saved.preferences,['nurse','feature:cognitive']);
});
test('서비스·지역 전환은 기존 검색어·평가·특화 조건을 전달하고 정렬 중심점을 URL로 덮지 않는다',()=>{
 const filters={q:'행복',grades:['A'],scores:['high'],confidences:['high'],capacity:'21-40',staff:'nurse',advanced:{owner:'3',features:['integrated-daycare']}};
 const url=destinationUrl({type:'home-care',province:'경기도',city:'광명시'},filters,'https://example.com/nationwide-daycare-map.html');
 assert.equal(url.searchParams.get('q'),'행복');assert.equal(url.searchParams.get('grades'),'A');assert.equal(url.searchParams.get('owner'),'3');assert.equal(url.searchParams.get('features'),'integrated-daycare');assert.equal(url.searchParams.get('sort'),null);
 assert.equal(effectiveFilters(filters,'nursing-hospital').grades.length,0);assert.equal(effectiveFilters(filters,'nursing-hospital').staff,'');
});
/** SOFTM-CARE-MATCH END */
