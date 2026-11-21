/** SOFTM-PC-SELECTION-RESTORE START 날짜:20261010 : 상세 이후 재선택과 비동기 목록 확장의 선택 역전을 재현 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const experience=fs.readFileSync(new URL('../map-experience.js',import.meta.url),'utf8');
function fn(source,name){const start=source.indexOf(`function ${name}(`);let pos=source.indexOf('{',start),depth=1,end=pos+1;for(;depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}return source.slice(start,end);}
test('상세 복귀 예약과 이전 고정 기관을 새 마커 선택이 대체한다',()=>{
 const ctx=vm.createContext({detailOrigin:{},detailSelection:{id:'A',workspace:'search'},restoreGeneration:2,workspace:'search',selectionInteracted:false});
 vm.runInContext(fn(experience,'releaseDetailSelection')+';'+fn(experience,'cancelDetail')+';'+fn(experience,'selectMarker')+';selectMarker("B")',ctx);
 assert.equal(ctx.detailOrigin,null);assert.equal(ctx.restoreGeneration,3);assert.equal(ctx.detailSelection.id,'B');assert.equal(ctx.selectionInteracted,true);
});
test('상세를 닫은 상태에서는 B 첫 클릭은 선택만, 재클릭은 상세이며 실제 선택 변경도 반영한다',()=>{
 const calls=[],a={},b={};const ctx=vm.createContext({activeDetail:null,window:{innerWidth:1200},pcMarkerSelectedId:'A',mobileActiveMarker:a,markers:new Map([['A',a],['B',b]]),focusCenter:id=>calls.push('detail:'+id),selectMarkerOnly:id=>{calls.push('select:'+id);ctx.mobileActiveMarker=ctx.markers.get(id);}});
 vm.runInContext(fn(html,'handleMarkerClick')+';handleMarkerClick("B");handleMarkerClick("B")',ctx);
 assert.deepEqual(calls,['select:B','detail:B']);ctx.mobileActiveMarker=a;vm.runInContext('handleMarkerClick("B")',ctx);assert.equal(calls.at(-1),'select:B');
});
test('늦게 완료된 이전 목록 확장이 현재 선택을 스크롤하지 않는다',async()=>{
 let done;const calls=[];const ctx=vm.createContext({pcMarkerSelectedId:'A',areaRows:[{i:'A'}],markerSelectionRow:()=>null,renderList:()=>new Promise(resolve=>done=resolve),scrollMarkerSelectionToList:id=>calls.push(id)});
 vm.runInContext(fn(html,'ensureMarkerSelectionInList')+';ensureMarkerSelectionInList("A")',ctx);ctx.pcMarkerSelectedId='B';done();await Promise.resolve();assert.deepEqual(calls,[]);
});
/** SOFTM-PC-SELECTION-RESTORE END */

/** SOFTM-MARKER-DETAIL-SWITCH START 날짜:20261121 : 열린 상세 전환과 닫힌 상태의 기존 선택 동작·비동기 취소를 함께 검증 */
test('PC와 모바일에서 열린 상세는 다른 마커 클릭으로 즉시 교체한다',()=>{
 for(const width of [390,768,1440]){
  const calls=[],ctx=vm.createContext({window:{innerWidth:width},activeDetail:{i:'A'},$:()=>({hidden:false}),switchMarkerDetail:id=>calls.push('switch:'+id),focusCenter:()=>assert.fail('지연 이동 불가'),selectMarkerOnly:()=>assert.fail('상세를 닫는 선택 불가')});
  vm.runInContext(fn(html,'handleMarkerClick')+';handleMarkerClick("B");handleMarkerClick("C")',ctx);assert.deepEqual(calls,['switch:B','switch:C']);
 }
});
test('상세 교체는 이전 예약을 취소하고 현재 지도 위치·닫기 복귀 맥락을 유지한다',()=>{
 const calls=[],body={scrollTop:200},sheet={hidden:false},b={i:'B',n:'두 번째 기관'};
 const ctx=vm.createContext({DATA:[b],activeDetail:{i:'A'},pcMarkerSelectedId:'A',detailMoveTimer:11,markerBlinkTimer:12,clearTimeout:id=>calls.push('cancel:'+id),restoreBlinkedMarker:()=>calls.push('restore'),preserveCareSelectionResults:()=>calls.push('preserve'),CareMapExperience:{beginDetail:(showMap,id)=>{assert.equal(showMap,false);calls.push('begin:'+id);}},openDetail:c=>{ctx.activeDetail=c;calls.push('open:'+c.i);},focusMobileRow:(id,follow,allow)=>{assert.equal(follow,false);assert.equal(allow,true);calls.push('select:'+id);},CareDetailLayout:{scroller:()=>body,focus:()=>calls.push('focus')},$:id=>id==='detailSheet'?sheet:body,setStatus:()=>{},map:{panTo:()=>assert.fail('지도 이동 불가'),setZoom:()=>assert.fail('배율 변경 불가')}});
 vm.runInContext(fn(html,'switchMarkerDetail')+';switchMarkerDetail("B")',ctx);
 assert.deepEqual(calls,['cancel:11','cancel:12','restore','preserve','begin:B','open:B','select:B','focus']);assert.equal(ctx.activeDetail,b);assert.equal(ctx.pcMarkerSelectedId,'B');assert.equal(ctx.detailMoveTimer,null);assert.equal(ctx.markerBlinkTimer,null);assert.equal(body.scrollTop,0);
 body.scrollTop=180;vm.runInContext('switchMarkerDetail("B");switchMarkerDetail("missing")',ctx);assert.equal(calls.length,8);assert.equal(body.scrollTop,180,'같은 마커·없는 기관은 기존 상세 보존');
});
/** SOFTM-MARKER-DETAIL-SWITCH END */
