/** SOFTM-ROUTE-SIMULATION START 날짜:20260910 : 좌표 개수가 아닌 거리 기준으로 재생하고 경로 끝을 벗어나지 않는지 검사 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../route-simulation.js';
test('uneven path segments interpolate by distance',()=>{
 const at=globalThis.CareRouteSimulation.trajectory([[126,37],[126.01,37],[126.04,37]]);
 assert.ok(Math.abs(at(.5)[0]-126.02)<.000001);
 assert.deepEqual(at(-1),[126,37]);assert.deepEqual(at(2),[126.04,37]);
});
test('duplicate coordinates remain finite',()=>{
 const at=globalThis.CareRouteSimulation.trajectory([[126,37],[126,37],[126.01,37]]);
 for(const value of [0,.5,1])assert.ok(at(value).every(Number.isFinite));
 assert.deepEqual(globalThis.CareRouteSimulation.trajectory([[126,37],[126,37]])(1),[126,37]);
});
/** SOFTM-ROUTE-SIMULATION END */

/** SOFTM-SIMULATION-ACTIVE START 날짜:20260910 : 중간 경유지·동일 좌표·마지막 도착과 강조 해제를 검증 */
test('stop milestones preserve order and final destination',()=>{
 const stops=globalThis.CareRouteSimulation.milestones([[126,37],[126.01,37],[126.04,37]], [{id:'a',point:{lng:126.01,lat:37}},{id:'b',point:{lng:126.01,lat:37}},{id:'c',point:{lng:126.04,lat:37}}]);
 assert.ok(Math.abs(stops[0].fraction-.25)<.00001);
 assert.equal(stops[0].fraction,stops[1].fraction);assert.equal(stops[2].fraction,1);
});
test('only one institution marker is highlighted and reset restores icons',()=>{
 const marker=()=>({icon:{content:'기관'},z:4,getIcon(){return this.icon},setIcon(i){this.icon=i},getZIndex(){return this.z},setZIndex(z){this.z=z}});
 const a=marker(),b=marker(),select=globalThis.CareRouteSimulation.highlighter(id=>({a,b})[id]);
 select('a');assert.match(a.icon.content,/care-simulation-active/);select('b');assert.equal(a.icon.content,'기관');assert.equal(a.z,4);assert.match(b.icon.content,/care-simulation-active/);select(null);assert.equal(b.icon.content,'기관');assert.equal(b.z,4);
});
/** SOFTM-SIMULATION-ACTIVE END */

/** SOFTM-SIMULATION-CAMERA START 날짜:20260910 : 모든 목적지가 보이면 가장자리에서도 고정하고 화면 이탈 때만 이동 */
test('camera stays fixed when all destinations and vehicle are visible',()=>{
 const bounds={south:37,north:38,west:126,east:127};
 const stops=[{point:{lat:37.01,lng:126.01}},{point:{lat:37.99,lng:126.99}}];
 assert.equal(globalThis.CareRouteSimulation.shouldFollow(bounds,{lat:37.01,lng:126.01},stops),false);
 assert.equal(globalThis.CareRouteSimulation.shouldFollow(bounds,{lat:38.1,lng:126.9},stops),true);
 assert.equal(globalThis.CareRouteSimulation.shouldFollow(bounds,{lat:37.5,lng:126.5},[{point:{lat:39,lng:126.5}}]),false);
 assert.equal(globalThis.CareRouteSimulation.shouldFollow(bounds,{lat:37.95,lng:126.5},[{point:{lat:39,lng:126.5}}]),true);
});
/** SOFTM-SIMULATION-CAMERA END */
