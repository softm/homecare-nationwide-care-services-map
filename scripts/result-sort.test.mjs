/** SOFTM-RESULT-SORT START 날짜:20260909 : 중심점 거리·검색 관련도·좌표 누락의 정렬 결과를 검사 */
import test from 'node:test';import assert from 'node:assert/strict';import '../result-sort.js';
const {compare,distance}=globalThis.CareResultSort;
const near={i:'1',n:'가까운센터',a:'서울',point:{lat:37,lng:127}},far={i:'2',n:'행복센터',a:'서울',point:{lat:38,lng:127}},unknown={i:'3',n:'위치없음'};
const options={mode:'distance',point:{lat:37,lng:127},query:'행복센터',coord:r=>r.point};
test('중심점을 변경하면 가까운 기관 순서가 바뀐다',()=>{assert.ok(compare(near,far,options)<0);assert.ok(compare(near,far,{...options,point:far.point})>0);});
test('정확도순은 먼 기관이라도 기관명 완전 일치를 우선한다',()=>assert.ok(compare(near,far,{...options,mode:'accuracy'})>0));
test('좌표가 없는 기관은 뒤에 유지하고 같은 거리는 이름으로 안정 정렬한다',()=>{assert.ok(compare(near,unknown,options)<0);assert.ok(compare(unknown,{i:'4',n:'하늘'},options)<0);});
test('잘못된 좌표는 거리를 계산하지 않는다',()=>{assert.equal(distance(null,near.point),Infinity);assert.equal(distance({lat:NaN,lng:127},near.point),Infinity);assert.equal(distance(near.point,near.point),0);});
/** SOFTM-RESULT-SORT END */
