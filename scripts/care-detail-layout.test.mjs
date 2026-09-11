/** SOFTM-DETAIL-LAYOUT START 날짜:20260911 : 내비 목적지 좌표와 입력 이스케이프를 검증해 잘못된 기관 연결을 방지 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context={window:{},document:{addEventListener(){}},navigator:{userAgent:'desktop'},URLSearchParams};
vm.runInNewContext(readFileSync(new URL('../care-detail-layout.js',import.meta.url),'utf8'),context);
const {links,address}=context.window.CareDetailLayout;
const c={n:'센터 & 분원',a:'서울시 테스트로 3'},point={lat:37.5,lng:127.1};
test('모바일 내비는 목적지 좌표와 이름을 전달한다',()=>{
 const ios=new URL(links(c,point,'iPhone').href);
 assert.equal(ios.protocol,'nmap:');assert.equal(ios.hostname,'navigation');assert.equal(ios.searchParams.get('dlat'),'37.5');assert.equal(ios.searchParams.get('dlng'),'127.1');assert.equal(ios.searchParams.get('dname'),c.n);
 const android=links(c,point,'Android').href;
 assert.match(android,/^intent:\/\/navigation/);assert.match(android,/package=com.nhn.android.nmap/);assert.match(android,/S.browser_fallback_url=/);
});
test('좌표 없음 또는 잘못된 좌표는 내비 좌표를 추정하지 않는다',()=>{
 for(const value of [null,{lat:0,lng:0},{lat:NaN,lng:127}]){
  const route=links(c,value,'Android');assert.match(route.href,/^https:\/\/map.naver.com\/p\/search\//);assert.equal(route.label,'주소로 지도 검색');
 }
});
test('PC 길안내도 이름 검색 대신 목적지 좌표를 지정한다',()=>{assert.match(links(c,point,'desktop').href,/,37.5,127.1$/)});
test('주소와 기관명에 HTML이 있어도 실행되는 마크업을 만들지 않는다',()=>{
 const html=address({n:'<img src=x onerror=alert(1)>',a:'"><script>alert(1)</script>'},point);
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.match(html,/data-care-address="&quot;&gt;&lt;script&gt;/);
});
/** SOFTM-DETAIL-LAYOUT END */

/** SOFTM-MAP-LINK START 날짜:20260911 : 주소·명칭 결합 재발과 좌표 없는 기관의 연결 오류를 방지 */
test('외부 지도는 주소만 검색하고 카카오는 확인 좌표를 바로 연다',()=>{
 const result=context.window.CareDetailLayout.externalMaps(c,point);
 assert.equal(decodeURIComponent(new URL(result.naver).pathname),'/p/search/'+c.a);
 assert.equal(decodeURIComponent(new URL(result.kakao).pathname),'/link/map/'+c.n+',37.5,127.1');
});
test('좌표 미확인은 주소, 주소 누락은 기관명 하나만 검색한다',()=>{
 for(const p of [null,{lat:NaN,lng:127},{lat:0,lng:0}]){
  const result=context.window.CareDetailLayout.externalMaps(c,p);
  assert.equal(decodeURIComponent(new URL(result.kakao).pathname),'/link/search/'+c.a);
 }
 const result=context.window.CareDetailLayout.externalMaps({n:'센터 & 분원',a:'  '},null);
 assert.equal(decodeURIComponent(new URL(result.naver).pathname),'/p/search/센터 & 분원');
 assert.equal(decodeURIComponent(new URL(result.kakao).pathname),'/link/search/센터 & 분원');
});
/** SOFTM-MAP-LINK END */
