/** SOFTM-TYPE-ENTRY START 날짜:20260911 : URL 우선순위·직접 선택 저장·유형 변경 조건·과거 공유 호환성을 검증 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../care-category-picker.js';
const api=globalThis.CareCategoryPicker;
test('explicit links beat saved choice without modifying it',()=>{
 const storage={getItem:()=> 'facility',setItem(){throw Error('must not save')}};
 assert.equal(api.resolve('https://example.test/?type=daycare',storage),'daycare');
 assert.equal(api.resolve('https://example.test/',storage),'facility');
 assert.equal(api.resolve('https://example.test/',{getItem:()=> 'invalid'}),null);
 assert.equal(api.resolve('https://example.test/',{getItem(){throw Error('blocked')}}),null);
 assert.equal(api.resolve('https://example.test/?institution=123',storage),'daycare');
});
test('only supported explicit selections are remembered',()=>{
 const calls=[];const storage={setItem:(...args)=>calls.push(args)};
 api.save(storage,'home-care');api.save(storage,'invalid');
 assert.deepEqual(calls,[['careCategory:v1','home-care']]);
 assert.doesNotThrow(()=>api.save({setItem(){throw Error('blocked')}},'daycare'));
});
test('category changes retain region and map but clear incompatible constraints',()=>{
 const value='https://example.test/nationwide-care-services-map.html?type=daycare&p=서울&c=강남구&cap=30&staff=nurse&grades=A&scores=high&conf=high&institution=123&basket=v1.123#careSavedPanel';
 const url=api.destination(value,'nursing-hospital',{center:{lat:37.5,lng:127},zoom:14,filters:{q:'검색'}});
 assert.equal(url.searchParams.get('type'),'nursing-hospital');assert.equal(url.searchParams.get('p'),'서울');assert.equal(url.searchParams.get('c'),'강남구');assert.equal(url.searchParams.get('q'),'검색');assert.equal(url.searchParams.get('lat'),'37.5');assert.equal(url.searchParams.get('z'),'14');
 for(const key of ['cap','staff','grades','scores','conf','institution','basket'])assert.equal(url.searchParams.has(key),false);
 assert.equal(url.hash,'');assert.throws(()=>api.destination(value,'invalid'));
});
/** SOFTM-TYPE-ENTRY END */
