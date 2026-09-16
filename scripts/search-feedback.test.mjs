/** SOFTM-SEARCH-FEEDBACK START 날짜:20260904 : 실제 지도 조회 함수를 실행해 늦은 응답·대표 건수·위치 미확인 결과의 회귀를 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const daycareHtml = readFileSync(new URL('../nationwide-daycare-map.html', import.meta.url), 'utf8');
const viewportContext = vm.createContext({ window: {}, setTimeout }); // SOFTM-QUERY-YIELD 날짜:20260916 : 입력 처리 양보를 실제 타이머로 검증
vm.runInContext(readFileSync(new URL('../viewport-regions.js', import.meta.url), 'utf8'), viewportContext);
const mapViewportSearch = viewportContext.window.MapViewportSearch; // SOFTM-VIEWPORT-RESOLVE 날짜:20260914 : 실제 완료순 처리기를 두 지도 조회 회귀검사에서 함께 실행
function daycareFunction(name) {
    let start = daycareHtml.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `${name} 함수 존재`);
    if (daycareHtml.slice(start - 6, start) === 'async ') start -= 6;
    const firstLineEnd = daycareHtml.indexOf('\n', start);
    const end = daycareHtml.slice(start, firstLineEnd).endsWith('}') ? firstLineEnd : daycareHtml.indexOf('\n}', start) + 2;
    return daycareHtml.slice(start, end);
}

function makeDaycareHarness(rows = []) {
    const reports = [], toasts = [], progress = [], deferred = new Map(), timers = new Map();
    let nextTimer = 0, cancelledFeedback = 0;
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) elements.set(id, { value: '', textContent: '', hidden: true, style: {}, classList: { toggle() {} } });
        return elements.get(id);
    }
    const context = vm.createContext({
        console, Promise, Set, Map, MapViewportSearch: mapViewportSearch,
        $: element,
        setTimeout: callback => { const id = ++nextTimer; timers.set(id, callback); return id; },
        clearTimeout: () => {},
        report: outcome => reports.push(JSON.parse(JSON.stringify(outcome))),
        cancelFeedback: () => { cancelledFeedback++; },
        externalRows: rows,
        externalGeocode: row => deferred.has(row.i) ? deferred.get(row.i).promise : Promise.resolve(row.coord || null),
        externalProgress: (...args) => progress.push(args),
        externalToast: (...args) => toasts.push(args),
    });
    vm.runInContext(`
        let daycareMatchPending=false;const CareMapExperience={refreshMatch(){},exitBasketMap(){}}; // SOFTM-CARE-MATCH 날짜:20260910 : 조회 순서 검증에서 설명 상태 연결을 제공
        let advancedSearch=null,daycareSearchGeneration=0,activeDaycareSearch=null,mapProgressGeneration=0;
        let mapRequest=0,mapReady=true,mapTimer=null,boundsTimer=null,dragSearchTimer=null,progressHideTimer=null;
        let DATA=externalRows,filtered=[],selected=new Set(),mapSearchIds=null,routeOrder=[],mapMarkers=[],basePoint=null;
        let page=1,skipIdleUntil=0;const PAGE=30,MAP_LIMIT=100;
        class LatLng {constructor(lat,lng){this.latitude=lat;this.longitude=lng}}
        class LatLngBounds {extend(){} hasLatLng(point){return point.latitude>=0&&point.latitude<=50&&point.longitude>=0&&point.longitude<=50}}
        const naver={maps:{LatLng,LatLngBounds}},naverMap={getBounds:()=>new LatLngBounds(),fitBounds(){}};
        function matchesActiveNonSpatialFilters(row){return row.matches!==false}
        function sortFiltered(){} function render(){} function updateSearchScope(){} function clearRouteLine(){}
        function clearCenterMarkers(){mapMarkers=[]}
        function createCenterMarker(row,coord,label){const marker={centerId:row.i,setMap(){}};mapMarkers.push(marker);return marker} // SOFTM-SHARE-RESTORE 날짜:20260905 : 복원 중 해제된 기관 마커 제거도 실제 조회 함수로 검사
        function drawRouteOrderMarkers(){} function openCenter(){} function closeMapPopup(){}
        function listRank(){return 1} function geocodeCenter(row){return externalGeocode(row)}
        function viewportCandidates(){return{regions:[{city:'테스트시'}],candidates:DATA.filter(matchesActiveNonSpatialFilters)}}
        function coordFor(row){return row.coord} function hav(){return 0}
        function setMapStatus(message){$('mapStatus').textContent=message}
        function showToast(...args){externalToast(...args)}
    `, context);
    for (const name of ['beginDaycareSearch', 'daycareSearchOutcome', 'finishDaycareSearch', 'apply', 'refreshDaycareAdvanced', 'displayCenters', 'searchCurrentMap', 'showMapProgress', 'hideMapProgress']) {
        vm.runInContext(daycareFunction(name), context);
    }
    vm.runInContext(`advancedSearch={cancel:cancelFeedback,report};function scheduleMapUpdate(){};const feedback={isCurrent:()=>true,progress:state=>externalProgress(state)};`, context);
    return {
        context, reports, toasts, progress, timers, elements,
        run: script => vm.runInContext(script, context),
        cancelledFeedback: () => cancelledFeedback,
        defer(id) {
            let resolve;
            const promise = new Promise(done => { resolve = done; });
            deferred.set(id, { promise });
            return resolve;
        },
        snapshot() { return JSON.parse(vm.runInContext(`JSON.stringify({count:filtered.length,ids:filtered.map(row=>row.i),markers:mapMarkers.map(marker=>marker.centerId),mapIds:mapSearchIds?[...mapSearchIds]:null,status:$('mapStatus').textContent})`, context)); },
    };
}
const center = (i, coord = { lat: 10, lng: 10 }) => ({ i, p: '테스트도', c: '테스트시', coord });

// SOFTM-SEARCH-FEEDBACK 날짜:20260904 : 페이지와 지도 처리 상한이 검색 대표 건수를 줄이지 않도록 검증
test('주간 상세조회: 125곳 전체 결과와 100곳 지도 처리를 구분한다', async () => {
    const harness = makeDaycareHarness(Array.from({ length: 125 }, (_, i) => center(String(i))));
    const outcome = await harness.run('refreshDaycareAdvanced(feedback)');
    assert.equal(outcome.count, 125);
    assert.equal(outcome.markerCount, 100);
    assert.equal(outcome.partial, false);
    assert.equal(harness.snapshot().count, 125);
    assert.equal(harness.reports.at(-1).count, 125);
    assert.equal(harness.progress.at(-1)[0].current, 100);
    assert.equal(harness.toasts.length, 0, '상세조회에는 기존 지도 완료 토스트가 중복되지 않음');
});

test('주간 지도영역: 좌표 미확인 후보는 목록에 남고 실제 화면 밖 기관은 제외된다', async () => {
    const harness = makeDaycareHarness([center('inside'), center('outside', { lat: 80, lng: 80 }), center('unknown', null)]);
    const outcome = await harness.run('searchCurrentMap(false,beginDaycareSearch(feedback))');
    assert.equal(outcome.count, 2);
    assert.equal(outcome.markerCount, 1);
    assert.equal(outcome.unresolved, 1);
    assert.equal(outcome.partial, true);
    assert.deepEqual(harness.snapshot().ids, ['inside', 'unknown']);
    assert.match(harness.snapshot().status, /위치 미확인 1곳 포함/);
    assert.equal(harness.toasts.length, 0);
});

test('주간 지도영역: 취소된 이전 좌표 응답이 최신 목록·마커·영역·완료 알림을 덮지 않는다', async () => {
    const harness = makeDaycareHarness([center('old')]);
    const resolveOld = harness.defer('old');
    const previous = harness.run('searchCurrentMap(false,beginDaycareSearch(feedback))');
    harness.run(`DATA=[{i:'latest',p:'테스트도',c:'테스트시',coord:{lat:10,lng:10}}]`);
    await harness.run('searchCurrentMap(false,beginDaycareSearch(feedback))');
    const completed = harness.snapshot();
    resolveOld({ lat: 10, lng: 10 });
    const outcome = await previous;
    assert.equal(outcome.cancelled, true);
    assert.deepEqual(harness.snapshot(), completed);
    assert.deepEqual(completed.ids, ['latest']);
    assert.deepEqual(completed.mapIds, ['latest']);
    assert.deepEqual(completed.markers, ['latest']);
    assert.equal(harness.reports.length, 1);
});

test('주간 기본필터: 지연 중인 상세조회 취소 뒤 최신 목록이 유지된다', async () => {
    const harness = makeDaycareHarness([center('old')]);
    const resolveOld = harness.defer('old');
    const previous = harness.run('refreshDaycareAdvanced(feedback)');
    harness.run(`DATA=[{i:'new-filter',p:'테스트도',c:'테스트시',coord:{lat:10,lng:10}}];apply(true)`);
    resolveOld({ lat: 10, lng: 10 });
    assert.equal((await previous).cancelled, true);
    assert.deepEqual(harness.snapshot().ids, ['new-filter']);
    assert.deepEqual(harness.snapshot().markers, []);
    assert.equal(harness.cancelledFeedback(), 1);
    assert.equal(harness.reports.at(-1).count, 1);
});

test('주간 상세조회: 실제 0건과 위치 미확인 1건을 구분한다', async () => {
    const empty = makeDaycareHarness([]);
    const zero = await empty.run('refreshDaycareAdvanced(feedback)');
    assert.equal(zero.count, 0);
    assert.equal(zero.unresolved, 0);
    const missing = makeDaycareHarness([center('unknown', null)]);
    const partial = await missing.run('refreshDaycareAdvanced(feedback)');
    assert.equal(partial.count, 1);
    assert.equal(partial.markerCount, 0);
    assert.equal(partial.unresolved, 1);
    assert.equal(partial.partial, true);
});

test('주간 지도 미준비: 목록 조회 결과를 지도 완료로 보고하지 않는다', async () => {
    const harness = makeDaycareHarness([center('one')]);
    harness.run('mapReady=false');
    const outcome = await harness.run('refreshDaycareAdvanced(feedback)');
    assert.equal(outcome.count, 1);
    assert.equal(outcome.markerCount, 0);
    assert.equal(outcome.mapReady, false);
});

test('주간 진행 표시: 이전 종료 타이머가 새로운 진행바를 숨기지 않는다', () => {
    const harness = makeDaycareHarness();
    harness.run("showMapProgress('첫 조회');hideMapProgress(650)");
    const previousTimer = [...harness.timers.values()].at(-1);
    harness.run("beginDaycareSearch();showMapProgress('새 조회')");
    previousTimer();
    assert.equal(harness.elements.get('mapProgress').hidden, false);
    assert.equal(harness.elements.get('mapProgressText').textContent, '새 조회');
});
const careHtml = readFileSync(new URL('../nationwide-care-services-map.html', import.meta.url), 'utf8');
function makeCareHarness(rows) {
    const reports = [], progress = [], elements = new Map(), deferred = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { textContent: '', value: '', checked: false });
        return elements.get(id);
    };
    const context = vm.createContext({
        Promise, Set, Map, MapViewportSearch: mapViewportSearch, externalRows: rows, $: element,
        report: result => reports.push(JSON.parse(JSON.stringify(result))),
        recordProgress: result => progress.push(result),
        externalGeocode: row => deferred.get(row.i) || Promise.resolve(row.coord || null),
    });
    vm.runInContext(`
        let careMatchRows=[],careMatchScope='',careMatchPending=false,careMatchError=false;const CareMapExperience={refreshMatch(){},exitBasketMap(){}}; // SOFTM-CARE-MATCH 날짜:20260910 : 실제 전체 후보·조회 경쟁 검증에 설명 상태를 연결
        let careListVersion=0,refreshToken=0,resultCount=0,activeCareQuery=null,mapReady=true,careUnresolvedCount=0; // SOFTM-COMPACT-STATUS 날짜:20260914 : 목록의 위치 미확인 집계 상태를 실제 조회와 일치
        function requestAnimationFrame(){}function updateCareResultSummary(){} // SOFTM-COMPACT-STATUS 날짜:20260914 : 데이터 경합 검사는 브라우저의 요약 렌더링 예약과 분리
        let filtered=externalRows,areaRows=[],selected=new Set(),markers=new Map(),basePoint=null,skipIdleUntil=0;
        const PAGE_LIMIT=90,MAP_CANDIDATE_LIMIT=300;
        const advancedSearch={cancel(){},report};
        class LatLng {constructor(lat,lng){this.lat=()=>lat;this.lng=()=>lng}}
        class LatLngBounds {extend(){}hasLatLng(pos){return pos.lat()<50}}
        class Marker {constructor(options){this.options=options;this.updates=0}setIcon(icon){this.updates++;this.options.icon=icon}getIcon(){return this.options.icon}getMap(){return this.options.map}setMap(map){this.options.map=map}} // SOFTM-MARKER-DIFF 날짜:20260917 : 객체 재사용과 아이콘 변경 횟수를 실제 API 계약으로 검증
        const window={naver:{maps:{LatLng,LatLngBounds,Marker,Event:{addListener(){}}}}};
        const map={getBounds:()=>new LatLngBounds(),getCenter:()=>new LatLng(10,10),fitBounds(){}};
        let markerBlinkTimer=null,detailMoveTimer=null,routeLine=null,routeOrder=[],mobileActiveMarker=null,mobileActiveIcon=null;function clearTimeout(){}function restoreBlinkedMarker(){}function closeDetail(){} function clearMarkers(){markers.clear()} // SOFTM-MARKER-DIFF 날짜:20260917 : 실제 차등 제거 함수의 상태와 취소 계약을 제공
        function cachedCoord(row){return row.coord}
        function hav(){return 0}function sortRows(){}function markerIcon(row,rank){return {content:row.i+":"+rank}}
        function geocode(row){return externalGeocode(row)}
        function updateAreaLocation(){} // SOFTM-LOCATION-ROW 날짜:20260909 : 조회 건수 검사는 비동기 주소 표시를 모의 처리
        function showLoading(){}function hideLoading(){}function setStatus(){}function renderList(){updateStats()}
        const feedback={isCurrent:()=>true,progress:recordProgress};
    `, context);
    for (const name of ['beginCareQuery', 'publishCareResult', 'updateStats', 'showDataPreview', 'clearQueryMarkers', 'loadMarkers']) {
        let start = careHtml.indexOf(`function ${name}(`);
        if (careHtml.slice(start - 6, start) === 'async ') start -= 6;
        const lineEnd = careHtml.indexOf('\n', start);
        const end = careHtml.slice(start, lineEnd).endsWith('}') ? lineEnd : careHtml.indexOf('\n}', start) + 2;
        vm.runInContext(careHtml.slice(start, end), context);
    }
    return {
        reports, progress, elements,
        run: script => vm.runInContext(script, context),
        defer(id) {
            let resolve;
            deferred.set(id, new Promise(done => { resolve = done; }));
            return resolve;
        },
        snapshot: () => JSON.parse(vm.runInContext('JSON.stringify({count:resultCount,insightCount:careMatchRows.length,ids:areaRows.map(row=>row.i),markers:[...markers.keys()]})', context)), // SOFTM-CARE-MATCH 날짜:20260910 : 페이지 제한 전 설명 집계 수를 검증에 노출
    };
}

test('통합 지역조회: 351곳 전체 건수는 지도·목록 300곳 표시 제한과 분리된다', async () => {
    const harness = makeCareHarness(Array.from({ length: 351 }, (_, i) => center(String(i), i < 5 ? null : { lat: 10, lng: 10 })));
    const result = await harness.run('loadMarkers(filtered,{fit:true,query:beginCareQuery(feedback)})');
    assert.equal(result.count, 351);
    assert.equal(result.markerCount, 300);
    assert.equal(harness.snapshot().ids.length, 300);
    assert.equal(harness.snapshot().insightCount, 351); // SOFTM-CARE-MATCH 날짜:20260910 : 설명 집계는 표시 제한 전 전체 후보를 사용
    assert.ok(harness.snapshot().markers.every(id => harness.snapshot().ids.includes(id)), '중심순으로 고른 모든 마커가 목록·체크 집합에도 포함됨');
    assert.equal(harness.elements.get('areaCount').textContent, '351곳');
    assert.equal(harness.reports.at(-1).count, 351);
    assert.equal(harness.progress.findLast(item => item.total)?.current, 300);
});

test('통합 지도조회: 위치 미확인은 목록에 포함하고 화면 밖 위치는 제외한다', async () => {
    const harness = makeCareHarness([center('inside'), center('outside', { lat: 80, lng: 80 }), center('unknown', null)]);
    const result = await harness.run('loadMarkers(filtered,{query:beginCareQuery(feedback)})');
    assert.equal(result.count, 2);
    assert.equal(result.markerCount, 1);
    assert.equal(result.unresolved, 1);
    assert.equal(result.partial, true);
    assert.deepEqual(harness.snapshot().ids, ['inside', 'unknown']);
});

test('통합 연속조회: 마지막 완료 뒤 도착한 이전 응답은 목록·건수·마커를 바꾸지 않는다', async () => {
    const harness = makeCareHarness([center('old')]);
    const resolveOld = harness.defer('old');
    const previous = harness.run('loadMarkers(filtered,{query:beginCareQuery(feedback)})');
    await harness.run("loadMarkers([{i:'latest',coord:{lat:10,lng:10}}],{query:beginCareQuery(feedback)})");
    const completed = harness.snapshot();
    resolveOld({ lat: 10, lng: 10 });
    assert.equal((await previous).cancelled, true);
    assert.deepEqual(harness.snapshot(), completed);
    assert.deepEqual(completed.markers, ['latest']);
    assert.equal(harness.reports.length, 1);
});

test('통합 지도 미준비: 미리보기 90곳과 전체 필터 결과 150곳을 구분한다', async () => {
    const harness = makeCareHarness(Array.from({ length: 150 }, (_, i) => center(String(i))));
    harness.run('mapReady=false');
    const result = await harness.run('loadMarkers(filtered,{query:beginCareQuery(feedback)})');
    assert.equal(result.count, 150);
    assert.equal(result.markerCount, 0);
    assert.equal(result.mapReady, false);
    assert.equal(harness.snapshot().ids.length, 90);
    assert.equal(harness.snapshot().insightCount, 150); // SOFTM-CARE-MATCH 날짜:20260910 : 지도 미준비 상태에서도 전체 후보로 설명
    assert.equal(harness.elements.get('areaCount').textContent, '150곳');
});
/** SOFTM-SEARCH-FEEDBACK END */

/** SOFTM-SHARE-RESTORE START 날짜:20260905 : 공유자가 고른 일부 기관·빈 선택을 초기 검색이 전체 선택으로 덮지 않도록 검증 */
test('주간 공유 복원: 전체 결과와 위치 미확인은 유지하고 선택한 마커만 표시한다', async () => {
    const harness = makeDaycareHarness([center('one'), center('two'), center('unknown', null)]);
    harness.run("selected=new Set(['one','unknown'])");
    const outcome = await harness.run('searchCurrentMap(false,null,true)');
    assert.equal(outcome.count, 3);
    assert.equal(outcome.unresolved, 1);
    assert.equal(outcome.markerCount, 1);
    assert.deepEqual(harness.snapshot().markers, ['one']);
    assert.deepEqual(JSON.parse(harness.run('JSON.stringify([...selected])')), ['one', 'unknown']);
    assert.match(harness.elements.get('routeNote').textContent, /공유된 지도 표시 선택/);
    await harness.run('searchCurrentMap(false)');
    assert.deepEqual(harness.snapshot().markers, ['one', 'two'], '이후 직접 검색은 기존 전체 선택 동작을 유지');
    assert.equal(harness.run('selected.size'), 3);
});

test('주간 공유 복원: 모두 해제한 공유 선택은 결과를 숨기지 않고 마커만 비운다', async () => {
    const harness = makeDaycareHarness([center('one'), center('two')]);
    const outcome = await harness.run('searchCurrentMap(false,null,true)');
    assert.equal(outcome.count, 2);
    assert.equal(outcome.markerCount, 0);
    assert.equal(harness.run('selected.size'), 0);
    assert.deepEqual(harness.snapshot().markers, []);
});
/** SOFTM-SHARE-RESTORE END */

/** SOFTM-MARKER-PROGRESS START 날짜:20260913 : 느린 후속 좌표가 앞선 기관 표시를 막지 않고 취소된 응답도 추가되지 않는지 검사 */
test('통합 지도는 후속 좌표 대기 중에도 앞선 마커를 표시하고 새 검색 이후 이전 마커를 추가하지 않는다', async () => {
 const rows=Array.from({length:9},(_,i)=>center(String(i)));
 const harness=makeCareHarness(rows),resolve=harness.defer('8');
 const pending=harness.run('loadMarkers(filtered,{query:beginCareQuery(feedback)})');
 await new Promise(done=>setImmediate(done));
 assert.equal(harness.snapshot().markers.length,8);
 assert.equal(harness.reports.length,0);
 harness.run('beginCareQuery();clearMarkers()');
 resolve({lat:10,lng:10});
 assert.equal((await pending).cancelled,true);
 assert.equal(harness.snapshot().markers.length,0);
});
/** SOFTM-MARKER-PROGRESS END */

/** SOFTM-LOCATION-PREVIEW START 날짜:20260913 : 권한 거절과 초기 idle이 전국 조회를 유발하지 않고 지도 이동은 자동 조회를 재개하는지 검증 */
test('통합 초기 위치 거절은 모달·전국 좌표 조회 없이 완료하고 지도 이동 후 검색을 재개한다', async () => {
 const button={disabled:false,setAttribute(){},removeAttribute(){}};
 const context=vm.createContext({Promise,Date,Set,Map,$:()=>button});
 vm.runInContext(`
 let mapReady=true,initialLocationViewport=null,refreshTimer=null,skipIdleUntil=0,careViewportResearch=null,careSelectionViewport=false; // SOFTM-SELECTION-VIEWPORT 날짜:20260915 : 내부 이동 보존 상태를 조회 테스트에도 반영
 let viewport='national',searches=0,previews=0,notices=0,scheduled=0;
 const CareMapExperience={isBasketMap:()=>false};
 const CareLocation={hideNotice(){},request:async()=>{throw new Error('denied')},showNotice(){notices++},info:()=>({title:'denied'})};
 function careViewportKey(){return viewport}
 function beginCareQuery(){return{current:()=>true}}
 function hideLoading(){}function showLoading(){}function setStatus(){}function clearTimeout(){}
 function setTimeout(){scheduled++}function applyFilters(){return[]}
 function restoreCareRecentRegion(){previews++}function refreshFromMap(){searches++} // SOFTM-REGION-ENTRY 날짜:20260913 : 권한 실패가 전국 미리보기 대신 최근 지역 복원기로 이어지는지 확인
 `,context);
 for(const name of ['useCurrentLocation','scheduleRefresh']){
  let start=careHtml.indexOf(`function ${name}(`);
  if(careHtml.slice(start-6,start)==='async ')start-=6;
  const lineEnd=careHtml.indexOf('\n',start);
  const end=careHtml.slice(start,lineEnd).endsWith('}')?lineEnd:careHtml.indexOf('\n}',start)+2;
  vm.runInContext(careHtml.slice(start,end),context);
 }
 await vm.runInContext('useCurrentLocation(true)',context);
 vm.runInContext('scheduleRefresh()',context);
 assert.equal(vm.runInContext('searches+notices+scheduled',context),0);
 assert.equal(vm.runInContext('previews',context),1);
 assert.equal(button.disabled,false);
 /** SOFTM-SELECTION-VIEWPORT START 날짜:20260915 : 내부 이동 뒤 idle은 막고 사용자 탐색 해제 뒤에는 다시 조회 */
 vm.runInContext("viewport='local';careSelectionViewport=true;scheduleRefresh()",context);
 assert.equal(vm.runInContext('scheduled',context),0);
 vm.runInContext("careSelectionViewport=false;scheduleRefresh()",context);
 /** SOFTM-SELECTION-VIEWPORT END */
 assert.equal(vm.runInContext('scheduled',context),1);
});
/** SOFTM-LOCATION-PREVIEW END */

/** SOFTM-MARKER-DIFF START 날짜:20260917 : 수천 개 기관 조건 축소·확장에서 공통 마커 객체와 불변 아이콘을 재사용하는지 검증 */
test('넓은 지도 필터 변경은 공통 마커를 재생성하지 않고 제외·추가 기관만 반영', async () => {
 const rows=Array.from({length:1200},(_,i)=>({i:String(i),coord:{lat:10,lng:10}}));
 const h=makeCareHarness(rows);
 await h.run('loadMarkers(filtered,{query:beginCareQuery(feedback)})');
 h.run('globalThis.original=new Map(markers);globalThis.initialUpdates=markers.get("0").updates');
 await h.run('loadMarkers(filtered.slice(0,600),{query:beginCareQuery(feedback)})');
 assert.equal(h.run('markers.size'),600);
 assert.equal(h.run('[...markers].every(([id,m])=>original.get(id)===m)'),true);
 assert.equal(h.run('markers.get("0").updates===initialUpdates'),true);
 assert.equal(h.run('original.get("900").getMap()'),null);
 await h.run('loadMarkers(filtered,{query:beginCareQuery(feedback)})');
 assert.equal(h.run('markers.size'),1200);
 assert.equal(h.run('markers.get("0")===original.get("0")'),true);
 assert.equal(h.run('markers.get("900")===original.get("900")'),false);
});
/** SOFTM-MARKER-DIFF END */
