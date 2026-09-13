/** SOFTM-MAP-FOCUS START 날짜:20260914 : 지도 DOM의 짧은 포인터 입력으로 전체보기를 열고 다시 닫는 상태를 검증 */
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
/** SOFTM-MAP-FOCUS END */
