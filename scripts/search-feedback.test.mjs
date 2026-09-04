/** SOFTM-SEARCH-FEEDBACK START 날짜:20260904 : 실제 지도 조회 함수를 실행해 늦은 응답·대표 건수·위치 미확인 결과의 회귀를 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const daycareHtml = readFileSync(new URL('../nationwide-daycare-map.html', import.meta.url), 'utf8');
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
        console, Promise, Set, Map,
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
        function createCenterMarker(row,coord,label){const marker={centerId:row.i};mapMarkers.push(marker);return marker}
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
        Promise, Set, Map, externalRows: rows, $: element,
        report: result => reports.push(JSON.parse(JSON.stringify(result))),
        recordProgress: result => progress.push(result),
        externalGeocode: row => deferred.get(row.i) || Promise.resolve(row.coord || null),
    });
    vm.runInContext(`
        let refreshToken=0,resultCount=0,activeCareQuery=null,mapReady=true;
        let filtered=externalRows,areaRows=[],selected=new Set(),markers=new Map(),basePoint=null,skipIdleUntil=0;
        const PAGE_LIMIT=90,MAP_CANDIDATE_LIMIT=300;
        const advancedSearch={cancel(){},report};
        class LatLng {constructor(lat,lng){this.lat=()=>lat;this.lng=()=>lng}}
        class LatLngBounds {extend(){}hasLatLng(pos){return pos.lat()<50}}
        class Marker {constructor(options){this.options=options}}
        const window={naver:{maps:{LatLng,LatLngBounds,Marker,Event:{addListener(){}}}}};
        const map={getBounds:()=>new LatLngBounds(),getCenter:()=>new LatLng(10,10),fitBounds(){}};
        function clearMarkers(){markers.clear()}
        function cachedCoord(row){return row.coord}
        function hav(){return 0}function sortRows(){}function markerIcon(){}
        function geocode(row){return externalGeocode(row)}
        function showLoading(){}function hideLoading(){}function setStatus(){}function renderList(){updateStats()}
        const feedback={isCurrent:()=>true,progress:recordProgress};
    `, context);
    for (const name of ['beginCareQuery', 'publishCareResult', 'updateStats', 'showDataPreview', 'loadMarkers']) {
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
        snapshot: () => JSON.parse(vm.runInContext('JSON.stringify({count:resultCount,ids:areaRows.map(row=>row.i),markers:[...markers.keys()]})', context)),
    };
}

test('통합 지역조회: 351곳 전체 건수는 지도·목록 300곳 표시 제한과 분리된다', async () => {
    const harness = makeCareHarness(Array.from({ length: 351 }, (_, i) => center(String(i), i < 5 ? null : { lat: 10, lng: 10 })));
    const result = await harness.run('loadMarkers(filtered,{fit:true,query:beginCareQuery(feedback)})');
    assert.equal(result.count, 351);
    assert.equal(result.markerCount, 300);
    assert.equal(harness.snapshot().ids.length, 300);
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
    assert.equal(harness.elements.get('areaCount').textContent, '150곳');
});
/** SOFTM-SEARCH-FEEDBACK END */
