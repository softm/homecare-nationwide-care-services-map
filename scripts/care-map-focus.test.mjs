/** SOFTM-MAP-FOCUS START 날짜:20260914 : 지도 SDK가 확정한 배경 클릭으로 전체보기를 열고 다시 닫는 상태를 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../care-map-focus.js';
const mapHtml=readFileSync(new URL('../nationwide-care-services-map.html',import.meta.url),'utf8');
test('지도 배경 클릭은 일반 화면에서 전체보기를 열고 전체보기에서는 닫는다',()=>{
 assert.equal(CareMapFocus.focusAction(false,false),'enter');
 assert.equal(CareMapFocus.focusAction(true,false),'leave');
 assert.equal(CareMapFocus.focusAction(false,true),null);
 assert.equal(CareMapFocus.focusAction(true,true),null);
});
test('네이버 지도 배경 클릭을 전체보기 전환에 연결한다',()=>{
 assert.match(mapHtml,/Event\.addListener\(map,'click',\(\)=>\{const hadDetail=!!activeDetail;closeDetail\(\);if\(!hadDetail\)careMapFocus\?\.mapTap\(\)\}\)/);
});
/** SOFTM-MAP-FOCUS END */
