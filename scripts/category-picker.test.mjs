/** SOFTM-TYPE-ENTRY START 날짜:20260911 : URL 우선순위·직접 선택 저장·유형 변경 조건·과거 공유 호환성을 검증 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
/** SOFTM-TYPE-MENU-TEXT START 날짜:20260911 : 상단 메뉴가 생활 상황 문구 대신 요청한 기관 카테고리명을 유지하는지 검증 */
test('상단 유형 메뉴는 주야간보호를 포함한 기관 카테고리명을 표시한다',()=>{
 assert.equal(api.menuLabel('daycare'),'주야간보호');
 assert.equal(api.menuLabel('home-care'),'방문요양');
 assert.equal(api.menuLabel('facility'),'요양원·공동생활가정');
 assert.equal(api.menuLabel('nursing-hospital'),'요양병원(의료기관)');
 assert.deepEqual(api.menuOrder.slice(0,3),['facility','daycare','home-care']);
 const css=readFileSync(new URL('../care-category-picker.css',import.meta.url),'utf8');
 assert.match(css,/\.care-type-menu\{[^}]*justify-content:flex-start/);
 assert.match(css,/\.care-type-menu-item\{[^}]*padding:8px 12px[^}]*font-size:14px/);
 assert.match(css,/@media\(max-width:1000px\)\{[^\n]*\.care-type-menu-item\{font-size:13px;min-height:0;padding:9px 12px\}/);
 const source=readFileSync(new URL('../care-category-picker.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/menu\.scrollLeft=/);
});
/** SOFTM-TYPE-MENU-TEXT END */
test('category changes retain region and map but clear incompatible constraints',()=>{
 const value='https://example.test/nationwide-care-services-map.html?type=daycare&p=서울&c=강남구&cap=30&staff=nurse&grades=A&scores=high&conf=high&institution=123&basket=v1.123#careSavedPanel';
 const url=api.destination(value,'nursing-hospital',{center:{lat:37.5,lng:127},zoom:14,filters:{q:'검색'}});
 assert.equal(url.searchParams.get('type'),'nursing-hospital');assert.equal(url.searchParams.get('p'),'서울');assert.equal(url.searchParams.get('c'),'강남구');assert.equal(url.searchParams.get('q'),'검색');assert.equal(url.searchParams.get('lat'),'37.5');assert.equal(url.searchParams.get('z'),'14');
 for(const key of ['cap','staff','grades','scores','conf','institution','basket'])assert.equal(url.searchParams.has(key),false);
 assert.equal(url.hash,'');assert.throws(()=>api.destination(value,'invalid'));
});
test('첫 유형 선택은 손대지 않은 전국 지도를 넘기지 않고 일반 진입은 현재 위치를 우선한다',()=>{
 const source=readFileSync(new URL('../nationwide-care-services-map.html',import.meta.url),'utf8');
 const picker=source.slice(source.indexOf('function mountCategoryPicker()'),source.indexOf('function bootUnselected()'));
 assert.match(picker,/getMap:\(\)=>!TYPE&&!neutralViewportChosen\?null:map/);
 const init=source.slice(source.indexOf('function initNaver()'),source.indexOf('/** SOFTM-TYPE-MAP END */'));
 const basket=init.indexOf('CareBasketShare.hasLink'),photo=init.indexOf('initialPhotoEntry'),shared=init.indexOf('hasSharedView&&'),region=init.indexOf("$('q').value.trim()"),current=init.indexOf('else void useCurrentLocation(true)');
 assert.ok(basket>=0&&basket<photo&&photo<shared&&shared<region&&region<current);
 assert.doesNotMatch(init,/else void refreshFromMap\(\)/);
});
/** SOFTM-TYPE-ENTRY END */
