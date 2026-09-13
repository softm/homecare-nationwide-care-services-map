/** SOFTM-MAP-FOCUS START 날짜:20260914 : 지도 진입 탭을 드래그·긴 누름·다중 터치와 구분 */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../care-map-focus.js';
test('짧은 단일 탭만 전체 지도 진입으로 인정한다',()=>{
 const start={id:1,x:100,y:100,time:0,multi:false},end={id:1,x:103,y:102,time:200};
 assert.equal(CareMapFocus.isTap(start,end),true);
 for(const change of [{x:140},{time:900},{id:2}])assert.equal(CareMapFocus.isTap(start,{...end,...change}),false);
 assert.equal(CareMapFocus.isTap({...start,multi:true},end),false);assert.equal(CareMapFocus.isTap(null,end),false);assert.equal(CareMapFocus.isTap({...start,moved:true},end),false);
});
/** SOFTM-MAP-FOCUS END */
