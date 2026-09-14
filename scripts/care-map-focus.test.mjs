/** SOFTM-MAP-FOCUS START 날짜:20260914 : 기관 마커로 전체보기에 진입하고 지도 배경과 하단 목록으로 탐색하는 상태를 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../care-map-focus.js';
const mapHtml=readFileSync(new URL('../nationwide-care-services-map.html',import.meta.url),'utf8');
const daycareHtml=readFileSync(new URL('../nationwide-daycare-map.html',import.meta.url),'utf8'); // SOFTM-DETAIL-MAP-PERSIST 날짜:20260914 : 두 지도 팝업 닫기 동작을 같은 회귀검사로 확인
const focusCss=readFileSync(new URL('../care-map-focus.css',import.meta.url),'utf8');
test('지도 배경 클릭은 일반 화면에서 상태를 유지하고 전체보기에서만 닫는다',()=>{
 assert.equal(CareMapFocus.focusAction(false,false),null);
 assert.equal(CareMapFocus.focusAction(true,false),'leave');
 assert.equal(CareMapFocus.focusAction(false,true),null);
 assert.equal(CareMapFocus.focusAction(true,true),'leave');
});
test('짧은 단일 포인터만 지도 탭으로 인정한다',()=>{
 const start={id:1,x:100,y:100,time:1000,multi:false,moved:false};
 assert.equal(CareMapFocus.isTap(start,{id:1,x:104,y:105,time:1300,inside:true}),true);
 assert.equal(CareMapFocus.isTap({...start,moved:true},{id:1,x:104,y:105,time:1300,inside:true}),false);
 assert.equal(CareMapFocus.isTap({...start,multi:true},{id:1,x:104,y:105,time:1300,inside:true}),false);
 assert.equal(CareMapFocus.isTap(start,{id:2,x:104,y:105,time:1300,inside:true}),false);
 assert.equal(CareMapFocus.isTap(start,{id:1,x:115,y:100,time:1300,inside:true}),false);
 assert.equal(CareMapFocus.isTap(start,{id:1,x:104,y:105,time:1700,inside:true}),false);
 assert.equal(CareMapFocus.isTap(start,{id:1,x:104,y:105,time:1300,inside:false}),false);
});
test('지도 포인터를 전체보기가 직접 받고 SDK click은 상세 닫기만 담당한다',()=>{
 const focusSource=readFileSync(new URL('../care-map-focus.js',import.meta.url),'utf8');
 assert.match(focusSource,/document\.addEventListener\('pointerdown',[\s\S]+document\.addEventListener\('pointerup'/);
 assert.match(focusSource,/pointerup'[\s\S]+\)\)mapTap\(\)/);
 assert.match(focusSource,/document\.addEventListener\('click',[\s\S]+Date\.now\(\)-lastPointerEnd<700[\s\S]+mapTap\(\)/);
 assert.match(mapHtml,/Event\.addListener\(map,'click',\(\)=>closeDetail\(\)\)/);
 assert.doesNotMatch(mapHtml,/Event\.addListener\(map,'click',[\s\S]{0,160}mapTap/);
});
test('검색 결과와 경로의 기관 마커는 전체보기 진입 후 상세를 연다',()=>{
 assert.match(mapHtml,/Event\.addListener\(marker,'click',\(\)=>\{careMapFocus\?\.enter\(\);focusCenter\(c\.i\)\}\)/);
 assert.match(mapHtml,/Event\.addListener\(marker,'click',\(\)=>\{careMapFocus\?\.enter\(\);focusCenter\(row\.i\)\}\)/);
});
test('전체보기 목록은 하단 손잡이와 기관 카드만 표시한다',()=>{
 assert.match(focusCss,/care-focus-list \.results>:not\(\.care-sheet-handle\):not\(#list\)\{display:none!important\}/);
 assert.match(focusCss,/care-focus-list \.results #list\{flex:1!important/);
});
/** SOFTM-DETAIL-MAP-PERSIST START 날짜:20260914 : 팝업 닫기가 선택 전 기준점으로 지도를 되돌리는 회귀를 방지 */
test('기관 상세를 닫아도 두 지도의 현재 중심과 배율을 변경하지 않는다',()=>{
 const careClose=mapHtml.match(/function closeDetail\([\s\S]*?\n\}/)?.[0]||'';
 const daycareClose=daycareHtml.match(/^function closeMapPopup.*$/m)?.[0]||'';
 assert.match(careClose,/CareMapExperience\.finishDetail\(\)/);
 assert.match(daycareClose,/CareMapExperience\.finishDetail\(\)/);
 for(const source of [careClose,daycareClose])assert.doesNotMatch(source,/\.(?:setCenter|setZoom|fitBounds|panTo)\(/);
});
/** SOFTM-DETAIL-MAP-PERSIST END */
/** SOFTM-MAP-FOCUS END */
