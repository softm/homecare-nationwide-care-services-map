/** SOFTM-PERSONAL-COST START 날짜:20261121 : 비교 예상액의 독립 계산·미확인·비급여·부적격 경계 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {estimate} from '../care-comparison-cost.mjs';
const state={grade:'3',burden:'general',quantity:22,daycareBand:'8-10',minutes:180,facilityEligible:true,extras:{}};
const row={i:'test',t:'B03'};
test('등급·감경 미확인은 일반 3등급으로 대신 계산하지 않는다',()=>{
 assert.equal(estimate('daycare',row,{...state,grade:''}).low,undefined);
 assert.equal(estimate('daycare',row,{...state,burden:''}).low,undefined);
 assert.equal(estimate('daycare',row,{...state,quantity:0}).low,undefined);
});
test('공식 수가를 이용 일수와 감경 비율에 적용하고 비급여 미확인을 별도 표시한다',()=>{
 for(const [burden,percent] of [['general',15],['reduced40',9],['reduced60',6],['exempt',0]]){
  const value=estimate('daycare',row,{...state,burden});assert.equal(value.low,Math.round(59640*22*percent/100));assert.equal(value.high,value.low);assert.equal(value.hasExtra,false);assert.match(value.note,/비급여 미포함/);
 }
});
test('시설의 실제 배치 미확인은 범위로, 공동생활가정은 별도 수가로 계산한다',()=>{
 const facility=estimate('facility',{i:'f',t:'A03'},{...state,quantity:30});assert.equal(facility.low,77540*30*.2);assert.equal(facility.high,81540*30*.2);
 assert.equal(estimate('facility',{i:'g',t:'A04'},{...state,quantity:30}).low,63800*30*.2);
 assert.equal(estimate('facility',{i:'f',t:'A03'},{...state,facilityEligible:false}).low,undefined);
});
test('비급여 확인액만 합산하며 0원 확인과 미입력, 음수·소수는 구분한다',()=>{
 assert.equal(estimate('daycare',row,{...state,extras:{test:'300000'}}).low,196812+300000);
 assert.equal(estimate('daycare',row,{...state,extras:{test:'0'}}).hasExtra,true);
 for(const extra of ['-1','0.1','100000001','NaN'])assert.equal(estimate('daycare',row,{...state,extras:{test:extra}}).low,undefined);
});
test('면제여도 재가 월 한도 초과분은 전액 부담한다',()=>{
 const value=estimate('daycare',row,{...state,grade:'cognitive',quantity:31,burden:'exempt'});
 assert.equal(value.low,56360*31-676320);assert.match(value.note,/한도 초과 전액부담/);
});
test('병원·특례·확인되지 않은 급여코드·인지지원 방문요양을 일반 수가로 계산하지 않는다',()=>{
 for(const [type,t,changes] of [['nursing-hospital','',{}],['daycare','H01',{}],['facility','A03,A04',{}],['home-care','B01',{grade:'cognitive'}],['daycare','B03',{exception:true}]])assert.equal(estimate(type,{i:'x',t},{...state,...changes}).low,undefined);
});
/** SOFTM-PERSONAL-COST END */
