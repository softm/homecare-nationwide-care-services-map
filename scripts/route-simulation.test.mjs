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
