/** SOFTM-REGION-ENTRY START 날짜:20260913 : 공통 최근 지역의 유효기간·잘못된 값·권한 저장소·기록 의도를 검사 */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../care-region-entry.js';
const api=globalThis.CareRegionEntry,rows=[{p:'서울특별시',c:'중랑구'}],now=1800000000000;
const record={version:1,mode:'viewport',province:'서울특별시',city:'중랑구',lat:37.6,lng:127.08,zoom:13,savedAt:now};
function memory(){let value=null;return {getItem:()=>value,setItem:(_,v)=>value=v}}
test('30일 이내의 지역은 유형과 무관하게 같은 키로 복원한다',()=>{
 const storage=memory();assert.equal(api.save(record,rows,storage,now),true);
 assert.deepEqual(api.read(rows,storage,now+29*86400000),record);
 assert.equal(api.read(rows,storage,now+31*86400000),null);
});
test('전국 화면·잘못된 좌표·미등록 지역·미래 시각을 복원하지 않는다',()=>{
 for(const patch of [{zoom:7},{lat:0},{lng:Infinity},{city:''},{city:'없는구'},{savedAt:now+1},{version:2},{zoom:11.5}])assert.equal(api.valid({...record,...patch},rows,now),false);
 assert.equal(api.valid({...record,mode:'region',zoom:10},rows,now),true);
});
test('손상된 기록과 저장소 차단은 예외 대신 지역 선택으로 이어진다',()=>{
 assert.equal(api.read(rows,{getItem:()=>'{broken'},now),null);
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
 assert.equal(api.read(rows,blocked,now),null);assert.equal(api.save(record,rows,blocked,now),false);
});
test('직접 지역 선택·지도 이동과 GPS·최근 기록 복원을 구분한다',()=>{
 api.markManual('region');assert.equal(api.manual(),true);assert.equal(api.mode(),'region');
 api.markManual();assert.equal(api.mode(),'viewport');
 api.automatic();assert.equal(api.manual(),false);
 api.restoreLabel('최근 탐색 지역 · 서울특별시 중랑구');assert.equal(api.manual(),false);assert.match(api.label(),/최근 탐색 지역/);
});
/** SOFTM-REGION-ENTRY END */

/** SOFTM-DEFAULT-MAP START 날짜:20260914 : 기본 지도의 중심·배율·안내·취소 처리를 실제 함수로 검증 */
test('기본 지도는 PC 줌 14·모바일 줌 13과 기본 위치 표기를 유지하고 직접 탐색으로 저장하지 않는다', async()=>{
 const {readFileSync}=await import('node:fs'),vm=await import('node:vm');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const start=html.indexOf('async function showCareDefaultMap('),source=html.slice(start,html.indexOf('\n}',start)+2);
 const nodes=new Map(),calls=[];
 const context={areaLocationRequest:0,CareRegionEntry:{hide(){},restoreLabel(label){calls.push(label)},label:()=> '기본 위치 · 서울시청'},
 $:id=>{if(!nodes.has(id))nodes.set(id,{value:'이전지역'});return nodes.get(id)},updateCities(){},skipIdleUntil:0,initialLocationViewport:null,
 window:{innerWidth:1440,naver:{maps:{LatLng:class{constructor(lat,lng){this.lat=lat;this.lng=lng}}}}},
 map:{setCenter(p){calls.push(p)},setZoom(z){calls.push(z)}},setBase(p,label,pan){calls.push({label,pan})},careViewportKey:()=> '서울시청',updateAreaLocation(){},setStatus(...args){calls.push(args)},refreshFromMap:async()=>({count:10})};
 vm.createContext(context);vm.runInContext(source,context);
 assert.equal((await context.showCareDefaultMap({current:()=>true})).count,10);
 assert.ok(calls.includes(14));assert.ok(calls.some(v=>v?.lat===37.5663&&v?.lng===126.9779)); // SOFTM-DEFAULT-MAP 날짜:20260914 : PC 500m 수준의 기본 배율을 회귀검사
 assert.match(calls.at(-1)[1],/현재 위치를 확인하지 못했습니다/);
 assert.equal(nodes.get('province').value,'');assert.equal(nodes.get('city').value,'');
 calls.length=0;context.window.innerWidth=390;assert.equal((await context.showCareDefaultMap({current:()=>true})).count,10);assert.ok(calls.includes(13)); // SOFTM-DEFAULT-MAP 날짜:20260914 : 모바일은 기존 화면 범위를 유지하는지 함께 검증
 const count=calls.length;assert.equal((await context.showCareDefaultMap({current:()=>false})).cancelled,true);assert.equal(calls.length,count);
});
/** SOFTM-DEFAULT-MAP END */
