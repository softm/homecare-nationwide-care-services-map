/** SOFTM-MAP-FOCUS START 날짜:20260914 : 기관 마커로 전체보기에 진입하고 지도 배경과 하단 목록으로 탐색하는 상태를 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../care-map-focus.js';
const mapHtml=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const focusCss=readFileSync(new URL('../care-map-focus.css',import.meta.url),'utf8');
const mobileFocusSource=readFileSync(new URL('../care-mobile-focus.js',import.meta.url),'utf8');
const mobileFocusCss=readFileSync(new URL('../care-mobile-focus.css',import.meta.url),'utf8');
/** SOFTM-MOBILE-FOCUS START 날짜:20261003 : 모바일 배경 탭 유지와 데스크톱 기존 복귀를 구분해 검증 */
test('모바일 지도 배경은 전체보기를 유지하고 데스크톱은 기존 복귀를 유지한다',()=>{
 assert.equal(CareMapFocus.focusAction(false,false),null);
 assert.equal(CareMapFocus.focusAction(true,false),'leave');
 assert.equal(CareMapFocus.focusAction(false,true),null);
 assert.equal(CareMapFocus.focusAction(true,true),null); // SOFTM-MOBILE-FOCUS 날짜:20261003 : 모바일 배경 탭으로 의도치 않게 전체보기가 끝나지 않도록 검증
});
/** SOFTM-MOBILE-FOCUS END */
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
test('검색 결과와 경로의 기관 마커는 PC 첫 클릭 선택과 두 번째 상세 열기를 분리한다',()=>{
 assert.match(mapHtml,/function handleMarkerClick\(id\)[\s\S]+window\.innerWidth<=1000[\s\S]+focusCenter\(id\)[\s\S]+pcMarkerSelectedId[\s\S]+selectMarkerOnly\(id\)/);
 assert.match(mapHtml,/Event\.addListener\(marker,'click',\(\)=>handleMarkerClick\(c\.i\)\)/);
 assert.match(mapHtml,/Event\.addListener\(marker,'click',\(\)=>handleMarkerClick\(row\.i\)\)/);
});
test('전체보기 목록은 하단 손잡이와 기관 카드만 표시한다',()=>{
 assert.match(focusCss,/care-focus-list \.results>:not\(\.care-sheet-handle\):not\(#list\)\{display:none!important\}/);
 assert.match(focusCss,/care-focus-list \.results #list\{flex:1!important/);
});
/** SOFTM-MOBILE-IMMERSIVE START 날짜:20261010 : 카카오맵처럼 모바일 전체 지도에서 주변 오버레이를 접는 토글 회귀검사 */
test('모바일 전체 지도 확장 토글은 주변 오버레이를 숨기고 축소 토글과 지도 조작부만 남긴다',()=>{
 assert.match(mobileFocusSource,/data-mobile-focus="fullscreen"/);
 assert.match(mapHtml,/function syncDetailOverlayChrome\(open\)[\s\S]+detailForcedImmersive[\s\S]+fullscreen\?\.click\(\)/);
 assert.match(mobileFocusSource,/function setImmersive\(active\)/);
 assert.match(mobileFocusSource,/care-mobile-map-immersive/);
 assert.match(mobileFocusCss,/care-mobile-map-immersive[\s\S]+\.care-mobile-focus-top/);
 assert.match(mobileFocusCss,/care-mobile-map-immersive[\s\S]+\.care-mobile-focus-dock/);
 assert.match(mobileFocusCss,/care-mobile-map-immersive[\s\S]+\.care-region-research/);
 assert.match(mobileFocusCss,/care-mobile-map-immersive\[data-care-mode="map"\] \.map-controls #locateBtn[\s\S]+display:grid!important/);
 assert.match(mobileFocusCss,/care-detail-active[\s\S]+\.care-mobile-focus-side \[data-mobile-focus="fullscreen"\][\s\S]+pointer-events:auto!important/);
 assert.match(mobileFocusCss,/care-detail-active[\s\S]+\.map-controls #locateBtn[\s\S]+display:grid!important/);
 assert.match(mobileFocusCss,/care-mobile-map-immersive[\s\S]+\.map-control/);
});
/** SOFTM-MOBILE-IMMERSIVE END */
/** SOFTM-MOBILE-CHIPS START 날짜:20261010 : 모바일 전체 지도 칩 문구·크기 축소 회귀검사 */
test('모바일 전체 지도 필터 칩은 짧은 문구와 작은 아이콘을 사용한다',()=>{
 assert.match(mapHtml,/care-mobile-focus\.css\?v=20261010-control-stay1/);
 assert.match(mapHtml,/care-mobile-focus\.js\?v=20261010-control-stay1/);
 assert.match(mobileFocusSource,/>필터<\/span>/);
 assert.match(mobileFocusSource,/`필터 · \$\{filterCount \|\| '설정됨'\}`/);
 assert.doesNotMatch(mobileFocusSource,/상세필터/);
 assert.match(mobileFocusCss,/care-mobile-focus-chips button \{ min-height:38px; padding:4px 10px 4px 5px/);
 assert.match(mobileFocusCss,/care-mobile-focus-chips svg \{ width:20px; height:20px; padding:5px/);
});
/** SOFTM-MOBILE-CHIPS END */
/** SOFTM-MOBILE-CONTROLS START 날짜:20261010 : 모바일 전체 지도 조작 아이콘 위치·순서 회귀검사 */
test('모바일 전체 지도는 지도변경 묶음을 오른쪽에 두고 확장 지도 왼쪽 조작에 내위치를 포함한다',()=>{
 assert.match(mobileFocusSource,/data-mobile-focus="layers"[\s\S]+data-mobile-focus="fullscreen"[\s\S]+data-mobile-focus="share"/);
 assert.match(mobileFocusCss,/\.care-mobile-focus-side \{ position:absolute; left:auto; right:max\(12px,env\(safe-area-inset-right\)\); top:calc\(138px \+ env\(safe-area-inset-top\)\); display:grid; gap:8px; \}/);
 assert.match(mobileFocusCss,/\.map-controls \{ top:calc\(126px \+ env\(safe-area-inset-top\)\)!important; left:max\(12px,env\(safe-area-inset-left\)\)!important; right:auto!important/);
 assert.match(mobileFocusCss,/max-height:760px[\s\S]+\.map-controls \{ top:calc\(126px \+ env\(safe-area-inset-top\)\)!important/);
 assert.match(mobileFocusCss,/max-height:760px[\s\S]+\.care-mobile-focus-side \{ top:calc\(130px \+ env\(safe-area-inset-top\)\); \}/);
 assert.match(mobileFocusCss,/care-mobile-map-immersive[\s\S]+\.care-mobile-focus-side \{[\s\S]+display:grid;[\s\S]+gap:8px/);
 assert.match(mobileFocusCss,/care-mobile-map-immersive[\s\S]+\.map-controls \{[\s\S]+top:calc\(126px \+ env\(safe-area-inset-top\)\)!important;[\s\S]+left:max\(12px,env\(safe-area-inset-left\)\)!important[\s\S]+bottom:auto!important/);
 assert.doesNotMatch(mobileFocusCss,/care-mobile-map-immersive[\s\S]+\.care-mobile-focus-side \{[\s\S]+top:calc\(14px \+ env\(safe-area-inset-top\)\)/);
 assert.doesNotMatch(mobileFocusCss,/care-mobile-map-immersive[\s\S]+\.map-control \{[\s\S]+border-radius:50%!important/);
 assert.match(mobileFocusCss,/care-mobile-map-immersive\[data-care-mode="map"\] \.map-controls #locateBtn[\s\S]+display:grid!important/);
});
/** SOFTM-MOBILE-CONTROLS END */
/** SOFTM-DETAIL-MAP-PERSIST START 날짜:20260914 : 팝업 닫기가 선택 전 기준점으로 지도를 되돌리는 회귀를 방지 */
test('기관 상세를 닫아도 현재 중심과 배율을 변경하지 않는다',()=>{
 const careClose=mapHtml.match(/function closeDetail\([\s\S]*?\n\}/)?.[0]||'';
 assert.match(careClose,/CareMapExperience\.finishDetail\(\)/);
 assert.doesNotMatch(careClose,/\.(?:setCenter|setZoom|fitBounds|panTo)\(/);
});
/** SOFTM-DETAIL-MAP-PERSIST END */
/** SOFTM-MAP-FOCUS END */

/** SOFTM-MARKER-PERSIST START 날짜:20260915 : 검색 목록의 레이아웃·사진 갱신과 복귀 스크롤이 명시 선택을 덮는 회귀를 방지 */
test('검색 목록은 직접 선택한 마커를 복귀 후 유지하고 사용자 입력 후 스크롤 선택을 재개한다', async () => {
 const {runInNewContext} = await import('node:vm');
 const source = readFileSync(new URL('../map-experience.js', import.meta.url), 'utf8');
 const selection = source.slice(source.indexOf('    let detailSelection = null;'), source.indexOf('    function beginDetail('));
 const start = source.indexOf('        const sync = () => {', source.indexOf('let active = null, frame = 0, scrollRequested = false'));
 const sync = source.slice(start, source.indexOf('        const schedule =', start));
 const focused = [], details = [], events = {};
 const rows = ['a','b','c'].map(id => ({dataset:{id},classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){}}));
 const context = {workspace:'search',frame:0,scrollRequested:false,active:null,media:{matches:false},isListMode:()=>false, // SOFTM-LIST-MODE 날짜:20260930 : 기존 지도 선택 유지 시나리오는 지도 모드로 검증
  list:{getBoundingClientRect:()=>({}),querySelectorAll:()=>rows,addEventListener:(name,fn)=>{events[name]=fn;}},
  pickSearchScrollRow:()=>rows[0], options:{mobileFocus:(...args)=>focused.push(args),scrollDetail:id=>details.push(id)}};
 runInNewContext(selection + sync + "bindSelectionIntent(list); detailSelection={id:'c',workspace:'search'}; sync();",context);
 context.scrollRequested=true;
 runInNewContext('sync()',context);
 assert.deepEqual(focused.at(-1),['c',false]); assert.equal(details.length,0);
 runInNewContext("detailSelection.id='off-page'; sync()",context);
 assert.equal(focused.length,2);
 events.wheel(); context.scrollRequested=true; runInNewContext('sync()',context);
 assert.deepEqual(focused.at(-1),['a',true]); assert.equal(details.at(-1),'a');
 /** SOFTM-LIST-MODE START 날짜:20260930 : 같은 스크롤 이벤트도 독립 목록에서는 지도와 상세 자동 선택을 실행하지 않음 */
 const focusedCount=focused.length,detailCount=details.length;
 context.isListMode=()=>true;context.scrollRequested=true;runInNewContext('sync()',context);
 assert.equal(focused.length,focusedCount);assert.equal(details.length,detailCount);assert.equal(context.scrollRequested,false);
 /** SOFTM-LIST-MODE END */
});
/** SOFTM-MARKER-PERSIST END */
