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
