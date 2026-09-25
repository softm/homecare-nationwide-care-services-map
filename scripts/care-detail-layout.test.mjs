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

/** SOFTM-INSTITUTION-SHARE START 날짜:20260914 : 공유가 사용자 위치·검색조건을 유출하지 않고 기관을 정확히 지정하는지 확인 */
test('기관 공유 링크는 공개 도메인의 유형과 기관기호만 포함한다',()=>{
 const layout=context.window.CareDetailLayout;
 const url=new URL(layout.institutionUrl({i:'A&12',n:'기관'},'home-care'));
 assert.equal(url.origin,'https://homecare.designboard.net');
 assert.equal(url.pathname,'/index.html');
 assert.deepEqual([...url.searchParams.keys()],['type','institution']);
 assert.equal(url.searchParams.get('institution'),'A&12');
 assert.equal(url.searchParams.get('type'),'home-care');
 const html=layout.shareButton({i:'1',n:'"><img src=x>',a:'"주소'},'daycare');
 assert.ok(!html.includes('<img'));assert.match(html,/data-share-name="&quot;&gt;&lt;img/);
});
/** SOFTM-INSTITUTION-SHARE END */

/** SOFTM-INSTITUTION-SHARE-FALLBACK START 날짜:20260914 : 공유 취소를 실패로 처리하거나 복사 실패를 성공으로 알리는 회귀 방지 */
test('기관 공유는 기본 공유창 취소를 존중하고 실패 시 링크 복사를 시도한다',async()=>{
 for(const mode of ['copy','native-fail','cancel','copy-fail']){
  let click,copied='';const label={textContent:'공유'};
  const button={disabled:false,isConnected:true,dataset:{shareName:'기관',shareAddress:'공개 주소',institutionShare:'https://homecare.designboard.net/?institution=1'},querySelector:()=>label};
  const navigator={clipboard:{writeText:async value=>{if(mode==='copy-fail')throw Error();copied=value;}}};
  if(mode==='native-fail'||mode==='cancel')navigator.share=async()=>{const error=Error();error.name=mode==='cancel'?'AbortError':'NotAllowedError';throw error;};
  const sandbox={window:{},navigator,URLSearchParams,setTimeout(){},document:{addEventListener:(_name,fn)=>{click=fn;}}};
  vm.runInNewContext(readFileSync(new URL('../care-detail-layout.js',import.meta.url),'utf8'),sandbox);
  await click({target:{closest:()=>button},preventDefault(){},stopPropagation(){}});
  assert.equal(button.disabled,false);
  assert.equal(copied,mode==='cancel'||mode==='copy-fail'?'':button.dataset.institutionShare);
  assert.equal(label.textContent,mode==='cancel'?'공유':mode==='copy-fail'?'재시도':'복사됨');
 }
});
/** SOFTM-INSTITUTION-SHARE-FALLBACK END */

/** SOFTM-POPUP-SHARE START 날짜:20260916 : 지도 공유가 열린 팝업을 우선하고 닫힌 팝업은 조회 공유를 유지하는지 검사 */
test('팝업 상태의 지도 공유는 기관 URL만 전달하고 일반 지도 공유는 가로채지 않는다',async()=>{
 const listeners=[];let payload,stopped=false;
 const label={textContent:'공유'};
 const button={disabled:false,isConnected:true,dataset:{shareName:'기관',shareAddress:'주소',institutionShare:'https://homecare.designboard.net/?type=facility&institution=14119001002'},querySelector:()=>label,getClientRects:()=>[{}]};
 const sandbox={window:{},URLSearchParams,setTimeout(){},getComputedStyle:()=>({visibility:'visible'}),navigator:{share:async data=>{payload=data}},document:{addEventListener:(name,fn,capture)=>listeners.push({fn,capture}),querySelectorAll:()=>[button]}};
 vm.runInNewContext(readFileSync(new URL('../care-detail-layout.js',import.meta.url),'utf8'),sandbox);
 const handler=listeners.find(item=>item.capture).fn;
 handler({target:{closest:()=>true},preventDefault(){},stopImmediatePropagation(){stopped=true}});
 await Promise.resolve();await Promise.resolve();
 assert.equal(stopped,true);assert.equal(payload.url,button.dataset.institutionShare);assert.equal('text' in payload,false);
 stopped=false;button.getClientRects=()=>[];
 handler({target:{closest:()=>true},preventDefault(){},stopImmediatePropagation(){stopped=true}});
 assert.equal(stopped,false);
});
/** SOFTM-POPUP-SHARE END */
