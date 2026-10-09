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
test('A 상세 후 B 첫 클릭은 선택만, 재클릭은 상세이며 실제 선택 변경도 반영한다',()=>{
 const calls=[],a={},b={};const ctx=vm.createContext({window:{innerWidth:1200},pcMarkerSelectedId:'A',mobileActiveMarker:a,markers:new Map([['A',a],['B',b]]),focusCenter:id=>calls.push('detail:'+id),selectMarkerOnly:id=>{calls.push('select:'+id);ctx.mobileActiveMarker=ctx.markers.get(id);}});
 vm.runInContext(fn(html,'handleMarkerClick')+';handleMarkerClick("B");handleMarkerClick("B")',ctx);
 assert.deepEqual(calls,['select:B','detail:B']);ctx.mobileActiveMarker=a;vm.runInContext('handleMarkerClick("B")',ctx);assert.equal(calls.at(-1),'select:B');
});
test('늦게 완료된 이전 목록 확장이 현재 선택을 스크롤하지 않는다',async()=>{
 let done;const calls=[];const ctx=vm.createContext({pcMarkerSelectedId:'A',areaRows:[{i:'A'}],markerSelectionRow:()=>null,renderList:()=>new Promise(resolve=>done=resolve),scrollMarkerSelectionToList:id=>calls.push(id)});
 vm.runInContext(fn(html,'ensureMarkerSelectionInList')+';ensureMarkerSelectionInList("A")',ctx);ctx.pcMarkerSelectedId='B';done();await Promise.resolve();assert.deepEqual(calls,[]);
});
/** SOFTM-PC-SELECTION-RESTORE END */
