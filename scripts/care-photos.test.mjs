/** SOFTM-PHOTO-TEST START 날짜:20260910 : 사진 분류·기관기호 연결·수집 누락과 기존 담기 호환을 회귀검사 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { classify, filterRows, mapUrl, photoUrl, readJson } from '../care-photos-common.js';
import { captureScope, visibleMarkerIds, saveScope, readScope, scopedRows } from '../care-photo-scope.js'; // SOFTM-PHOTO-SEARCH-SCOPE-TEST 날짜:20260930 : 지도 없이 확정된 전체 검색 결과를 사진으로 전달하는 공개 동작을 검사

test('제목 분류는 명시한 공간만 분류하고 미상·행사 사진을 기타로 유지', () => {
    for (const [title, group] of [['생활실','생활공간'],['생활실 화장실','위생'],['시설 전경','외관'],['정원','외관'],['인지 프로그램','프로그램/재활'],['물리치료실','프로그램/재활'],['식당','식사'],['생신잔치','기타'],['','기타']]) assert.equal(classify(title), group);
});
test('사진이 있는 기관에 지역·기관명 조건을 함께 적용하며 빈 자료와 미수집을 구분', () => {
    const rows = [{i:'1',n:'같은센터',p:'서울',c:'강남'},{i:'2',n:'같은센터',p:'경기',c:'광명'},{i:'3',n:'빈센터',p:'경기',c:'광명'},{i:'4',n:'미수집',p:'경기',c:'광명'}];
    const summaries = {'1':{count:1},'2':{count:2},'3':{count:0},'4':{count:null}};
    assert.deepEqual(filterRows(rows, summaries, {p:'경기',c:'광명',q:'같은'}).map(row=>row.i), ['2']);
    assert.deepEqual(filterRows(rows, summaries).map(row=>row.i), ['1','2']);
    assert.equal(filterRows(rows, summaries, {q:'없는기관'}).length, 0);
});
test('동일 명칭 기관도 기관기호와 유형으로 정확하게 지도에 연결', () => {
    const query = new URL(mapUrl('daycare',{i:'21234',n:'같은 & 센터',p:'서울',c:'강남'}),'https://example.test/').searchParams;
    assert.equal(query.get('institution'),'21234'); assert.equal(query.get('q'),'같은 & 센터'); assert.equal(query.get('type'),'daycare');
});
test('사진 주소는 공단 HTTPS만 허용', () => {
    assert.equal(photoUrl({url:'javascript:alert(1)'}),'');
    assert.equal(photoUrl({url:'https://evil.test/a.jpg'}),'');
    assert.equal(photoUrl({url:'https://www.longtermcare.or.kr/npbs/image?k=1'}),'https://www.longtermcare.or.kr/npbs/image?k=1');
});
test('사진 요약은 모든 현재 기관과 연결되며 표본 원본 개수와 대표사진이 일치', () => {
    const manifest = JSON.parse(fs.readFileSync('data/care-photos/manifest.json'));
    const care = JSON.parse(fs.readFileSync('data/care/manifest.json'));
    for (const [type, config] of Object.entries(manifest)) {
        const summaries = JSON.parse(gunzipSync(fs.readFileSync(`data/care-photos/${config.file}`)));
        const rows = JSON.parse(gunzipSync(fs.readFileSync(`data/care/${care[type].file}`)));
        assert.equal(Object.keys(summaries).length, config.count);
        if(type==='nursing-hospital'){assert.equal(config.count,0);continue;}
        assert.deepEqual(Object.keys(summaries).sort(),rows.map(row=>row.i).sort());
        assert.equal(Object.values(summaries).filter(item=>item.count>0).length,config.withPhotos);
        for (const [id, summary] of Object.entries(summaries).filter((_,i)=>i%199===0)) {
            const path=`data/nhis/photos/${id.slice(0,2)}/${id}.json`;
            if(!fs.existsSync(path)){assert.equal(summary.count,null);continue;}
            const source=JSON.parse(fs.readFileSync(path));assert.equal(summary.count,source.photos.length);
            const representative=source.photos.find(photo=>photo.isRepresentative===true)||source.photos[0];
            assert.equal(summary.representative?.title,representative?.title);
        }
    }
});
test('기존 비교함과 같은 키·순서를 사용하고 필터 변경이 저장 순서를 바꾸지 않음', () => {
    const context=vm.createContext({});vm.runInContext(fs.readFileSync('map-experience.js','utf8'),context);
    const entries=new Map([['careCompare:v1:daycare','["2","1"]']]);
    const storage={getItem:key=>entries.get(key),setItem:(key,value)=>entries.set(key,value)};
    const create=context.CareMapExperience.createBasket;
    const photoBasket=create(storage,'daycare');photoBasket.toggle('3');
    assert.equal(JSON.stringify(create(storage,'daycare').ids()),'["2","1","3"]');
    photoBasket.toggle('1');assert.equal(entries.get('careCompare:v1:daycare'),'["2","3"]');
    assert.equal(JSON.stringify(create(storage,'facility').ids()),'[]');
});
test('요약 요청 실패를 빈 성공으로 처리하지 않으며 다음 요청으로 복구', async () => {
    const previous=globalThis.fetch;
    try {
        globalThis.fetch=async()=>new Response('missing',{status:404});
        await assert.rejects(readJson('test'),/404/);
        globalThis.fetch=async()=>new Response('{"ok":true}');
        assert.deepEqual(await readJson('test'),{ok:true});
    } finally {globalThis.fetch=previous;}
});
test('새 페이지의 로컬 정적 의존성과 스크립트 문법을 확인', () => {
    for(const filename of ['care-photos.html','index.html']){
        const html=fs.readFileSync(filename,'utf8');
        for(const [,src] of html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))(?:[?#][^"]*)?"/g)) if(!src.startsWith('http')) assert.ok(fs.existsSync(src),src);
        for(const [,attrs,code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) if(!attrs.includes('src=')&&!attrs.includes('json')) new vm.Script(code);
    }
});
test('사진의 기관기호는 현재 유형에서 검증하고 이름이 같은 다른 기관을 선택하지 않음', () => {
    const html=fs.readFileSync('index.html','utf8');
    const code=html.split('/** SOFTM-PHOTO-SELECT START')[1].split('*/')[1].split('/** SOFTM-PHOTO-SELECT END')[0];
    const fields={province:{value:''},city:{value:''},q:{value:''}}, messages=[];
    const context=vm.createContext({params:new URLSearchParams('institution=2'),DATA:[{i:'1',n:'같은센터',p:'서울',c:'강남'},{i:'2',n:'같은센터',p:'경기',c:'광명'}],$:id=>fields[id],updateCities(){},toast:message=>messages.push(message)});
    vm.runInContext(code,context);vm.runInContext('preparePhotoInstitution()',context);
    assert.equal(vm.runInContext('initialPhotoEntry.i',context),'2');assert.equal(fields.city.value,'광명');
    context.params=new URLSearchParams('institution=999');vm.runInContext('preparePhotoInstitution()',context);
    assert.equal(vm.runInContext('initialPhotoEntry',context),null);assert.equal(messages.length,1);
});
test('지도 초기 선택은 사용자가 새 조회를 시작하면 늦은 응답으로 상세를 열지 않음', async () => {
    const html=fs.readFileSync('index.html','utf8');
    const code=html.split('/** SOFTM-PHOTO-SELECT START')[1].split('*/')[1].split('/** SOFTM-PHOTO-SELECT END')[0];
    let current=true, finish, focused=0;
    const context=vm.createContext({beginCareQuery:()=>({current:()=>current}),clearTimeout(){},refreshTimer:null,skipIdleUntil:0,loadMarkers:()=>new Promise(resolve=>finish=resolve),focusCenter:()=>focused++,Date});
    vm.runInContext(code,context);vm.runInContext("initialPhotoEntry={i:'1'}",context);
    const task=vm.runInContext('openInitialPhotoInstitution()',context);current=false;finish({});await task;
    assert.equal(focused,0);
});
test('현재 화면 안에서 지도에 연결된 마커만 사진 기본 범위로 사용', () => {
    const map={getBounds:()=>({hasLatLng:point=>point.inside})};
    const marker=(shown,inside)=>({getMap:()=>shown?map:null,getPosition:()=>({inside})});
    const entries=[['1',marker(true,true)],['2',marker(false,true)],['3',marker(true,false)],['1',marker(true,true)]];
    assert.deepEqual(visibleMarkerIds(map,entries),['1']);
    assert.deepEqual(visibleMarkerIds(null,entries),[]);
});
test('지도 범위를 세션으로 전달하며 빈 집합과 손실된 범위를 전국으로 대체하지 않음', () => {
    const data=new Map(), storage={setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)};
    const token=saveScope(storage,{type:'daycare',ids:['2','2'],source:'index.html?share=1'},'test-token');
    const scope=readScope(storage,token); assert.deepEqual(scope.ids,['2']);
    const rows=[{i:'1',n:'같은기관'},{i:'2',n:'같은기관'}];
    assert.deepEqual(scopedRows(rows,scope),[rows[1]]);
    assert.deepEqual(scopedRows(rows,{ids:[]}),[]);
    assert.deepEqual(scopedRows(rows,readScope(storage,'missing')),[]);
    assert.equal(readScope(null,token),null);
    assert.throws(()=>saveScope(null,{type:'daycare',ids:[],source:'index.html'},'test-token'));
});
test('범위 재전달은 이전 사진 페이지의 집합을 덮어쓰지 않으며 외부 복귀 URL을 거부', () => {
    const data=new Map(), storage={setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)};
    saveScope(storage,{type:'daycare',ids:['1'],source:'index.html'},'first');
    saveScope(storage,{type:'daycare',ids:['2'],source:'index.html'},'second');
    assert.deepEqual(readScope(storage,'first').ids,['1']);assert.deepEqual(readScope(storage,'second').ids,['2']);
    saveScope(storage,{type:'daycare',ids:['1'],source:'https://other.example/'},'bad');assert.equal(readScope(storage,'bad'),null);
});
/** SOFTM-PHOTO-SEARCH-SCOPE-TEST START 날짜:20260930 : 지도 선행 조건 제거로 목록 전체 범위·새로고침 복원·검색 복귀 조건이 손실되는 회귀를 방지 */
test('확정된 목록 검색은 좌표 없이 90곳을 넘는 전체 고유 기관을 사진 범위로 전달한다', () => {
    const rows = Array.from({ length: 151 }, (_, i) => ({ i: String(i + 1), n: '같은센터' }));
    rows.push({ i: 1, n: '중복 등록' });
    const source = 'https://homecare.designboard.net/index.html?type=daycare&mode=list&p=%EA%B2%BD%EA%B8%B0&c=%EA%B4%91%EB%AA%85&q=%EC%84%BC%ED%84%B0&grade=A&adv_services=dementia&institution=2';
    const snapshot = captureScope({ type: 'daycare', kind: 'search', ready: true, rows, source });
    assert.equal(snapshot.type, 'daycare');
    assert.equal(snapshot.kind, 'search');
    assert.deepEqual(snapshot.ids, rows.slice(0, 151).map(row => row.i));
    assert.ok(snapshot.source.startsWith('index.html?'));
    const before = new URL(source).searchParams;
    const after = new URL(snapshot.source, 'https://homecare.designboard.net/').searchParams;
    for (const [key, value] of before) if (key !== 'institution') assert.equal(after.get(key), value, `${key} 검색 조건이 유지되어야 한다`);
    assert.equal(after.has('institution'), false);
    rows.splice(0);
    assert.equal(snapshot.ids.length, 151, '다음 검색이 원래 사진 페이지의 전달 집합을 바꾸지 않는다');
});

test('확정된 지도는 표시 마커만 보존하고 현재 중심·배율로 복귀하며 기관 자동선택을 제거한다', () => {
    const map = {
        getBounds: () => ({ hasLatLng: point => point.inside }),
        getCenter: () => ({ lat: () => 37.478, lng: () => 126.865 }),
        getZoom: () => 14
    };
    const marker = (shown, inside) => ({ getMap: () => shown ? map : null, getPosition: () => ({ inside }) });
    const snapshot = captureScope({
        type: 'facility', kind: 'map', ready: true, map,
        entries: [['1', marker(true, true)], ['2', marker(false, true)], ['3', marker(true, false)], ['1', marker(true, true)]],
        rows: [{ i: '1' }, { i: '2' }, { i: '3' }, { i: '4' }],
        source: 'https://homecare.designboard.net/index.html?type=facility&mode=map&q=%EC%84%BC%ED%84%B0&lat=1&lng=2&z=3&institution=2'
    });
    assert.equal(snapshot.kind, 'map');
    assert.deepEqual(snapshot.ids, ['1']);
    const query = new URL(snapshot.source, 'https://homecare.designboard.net/').searchParams;
    assert.equal(query.get('mode'), 'map');
    assert.equal(query.get('q'), '센터');
    assert.equal(Number(query.get('lat')), 37.478);
    assert.equal(Number(query.get('lng')), 126.865);
    assert.equal(Number(query.get('z')), 14);
    assert.equal(query.has('institution'), false);
});

test('지도 생성 전에도 확정된 검색 결과를 전달하되 조회 대기와 유형 미확정은 전달하지 않는다', () => {
    const current = {
        type: 'daycare', kind: 'map', ready: true, rows: [{ i: 'no-coordinate' }, { i: '2' }],
        source: 'https://homecare.designboard.net/index.html?type=daycare&mode=list&adv_owner=private'
    };
    const snapshot = captureScope(current);
    assert.equal(snapshot.kind, 'search');
    assert.deepEqual(snapshot.ids, ['no-coordinate', '2']);
    assert.equal(new URL(snapshot.source, 'https://homecare.designboard.net/').searchParams.get('adv_owner'), 'private');
    assert.equal(captureScope({ ...current, ready: false }), null);
    assert.equal(captureScope({ ...current, type: '' }), null);
    assert.equal(captureScope({ ...current, type: undefined }), null);
});

test('검색 사진 범위는 새로고침 뒤 종류·전체 집합·복귀 조건을 복원하고 빈 검색을 손실된 범위와 구분한다', () => {
    const data = new Map();
    const storage = { setItem: (key, value) => data.set(key, value), getItem: key => data.get(key) };
    const rows = [{ i: '1', n: '사진 있음' }, { i: '2', n: '사진 없음' }];
    const current = {
        type: 'daycare', kind: 'search', ready: true, rows,
        source: 'https://homecare.designboard.net/index.html?type=daycare&mode=list&grade=A&institution=1'
    };
    const snapshot = captureScope(current);
    saveScope(storage, snapshot, 'search-reload');
    const reloaded = readScope({ getItem: key => data.get(key) }, 'search-reload');
    assert.equal(reloaded.kind, 'search');
    assert.equal(reloaded.type, 'daycare');
    assert.deepEqual(reloaded.ids, ['1', '2']);
    assert.equal(reloaded.source, snapshot.source);
    assert.deepEqual(scopedRows([...rows, { i: '3', n: '다른검색' }], reloaded), rows);
    const empty = captureScope({ ...current, rows: [] });
    assert.ok(empty);
    assert.deepEqual(empty.ids, []);
    saveScope(storage, empty, 'empty-search');
    const restoredEmpty = readScope(storage, 'empty-search');
    assert.equal(restoredEmpty.kind, 'search');
    assert.deepEqual(restoredEmpty.ids, []);
    assert.deepEqual(scopedRows(rows, restoredEmpty), []);
    assert.equal(readScope(storage, 'missing-search'), null);
});

test('루트 홈페이지에서 연 사진도 검색 조건을 유지한 index.html 복귀 주소로 저장하고 복원한다', () => {
    const data = new Map();
    const storage = { setItem: (key, value) => data.set(key, value), getItem: key => data.get(key) };
    const snapshot = captureScope({
        type: 'facility', kind: 'search', ready: true, rows: [{ i: 'root-1' }],
        source: 'https://homecare.designboard.net/?type=facility&mode=list&q=%EA%B4%91%EB%AA%85&adv_owner=private&institution=root-1'
    });
    assert.ok(snapshot.source.startsWith('index.html?'));
    saveScope(storage, snapshot, 'root-search');
    const restored = readScope(storage, 'root-search');
    assert.ok(restored, '루트에서 생성한 범위가 복귀 주소 검증을 통과해야 한다');
    assert.equal(restored.kind, 'search');
    assert.deepEqual(restored.ids, ['root-1']);
    const target = new URL(restored.source, 'https://homecare.designboard.net/');
    assert.equal(target.pathname, '/index.html');
    assert.equal(target.searchParams.get('type'), 'facility');
    assert.equal(target.searchParams.get('mode'), 'list');
    assert.equal(target.searchParams.get('q'), '광명');
    assert.equal(target.searchParams.get('adv_owner'), 'private');
    assert.equal(target.searchParams.has('institution'), false);
});

test('기존 v1 지도 사진 범위는 호환하고 잘못된 종류나 외부 복귀 주소는 재사용하지 않는다', () => {
    const base = { version: 1, type: 'daycare', ids: ['1', '1'], source: 'index.html?type=daycare&mode=map' };
    const data = new Map([['carePhotoScope:v1:legacy', JSON.stringify(base)]]);
    const storage = { setItem: (key, value) => data.set(key, value), getItem: key => data.get(key) };
    assert.equal(readScope(storage, 'legacy').kind, 'map');
    assert.deepEqual(readScope(storage, 'legacy').ids, ['1']);
    for (const kind of ['search', 'map']) {
        saveScope(storage, { ...base, kind }, kind);
        assert.equal(readScope(storage, kind).kind, kind);
    }
    for (const kind of ['all', '', null, 1, {}, []]) {
        data.set('carePhotoScope:v1:invalid-kind', JSON.stringify({ ...base, kind }));
        assert.equal(readScope(storage, 'invalid-kind'), null);
    }
    for (const source of ['https://other.example/index.html', '//other.example/index.html', 'javascript:alert(1)', '../index.html']) {
        data.set('carePhotoScope:v1:external', JSON.stringify({ ...base, kind: 'search', source }));
        assert.equal(readScope(storage, 'external'), null);
    }
});
/** SOFTM-PHOTO-SEARCH-SCOPE-TEST END */
/** SOFTM-PHOTO-TEST END */

/** SOFTM-PHOTO-GALLERY START 날짜:20260911 : 대량 사진의 요청 제한·순서·취소·재시도를 회귀검사 */
const { createGallery } = await import('../care-photo-gallery.js');
test('갤러리는 동시 3곳·회당 6곳만 읽고 응답 순서와 관계없이 기관 순서를 유지', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ i: String(i) }));
    let active = 0, peak = 0, calls = 0;
    const gallery = createGallery(rows, async id => {
        calls++; peak = Math.max(peak, ++active);
        await new Promise(resolve => setTimeout(resolve, id === '0' ? 20 : 1)); active--;
        return { photos: Array.from({ length: 20 }, (_, j) => ({ title: `${id}-${j}` })) };
    });
    const first = gallery.next(); assert.equal(first, gallery.next());
    let state = await first;
    assert.equal(calls, 6); assert.equal(peak, 3); assert.equal(state.items.length, 60);
    assert.deepEqual(state.items.map(x => x.photo.title).slice(0, 21), [...Array.from({ length: 20 }, (_, j) => `0-${j}`), '1-0']);
    state = await gallery.next(); assert.equal(calls, 6); assert.equal(state.items.length, 120);
    assert.equal(new Set(state.items.map(x => x.key)).size, 120);
});
test('빈 사진·실패한 요청을 구분하고 재시도는 실패한 기관만 복구', async () => {
    let fail = true; const calls = [];
    const gallery = createGallery([{ i: 'empty' }, { i: 'bad' }, { i: 'ok' }], async id => {
        calls.push(id); if (id === 'bad' && fail) throw new Error('503');
        return { photos: id === 'empty' ? [] : [{ title: id }] };
    });
    let state = await gallery.next(); assert.equal(state.empty, 1); assert.equal(state.failures.length, 1); assert.equal(state.more, false);
    fail = false; state = await gallery.next({ retry: true });
    assert.deepEqual(calls, ['empty', 'bad', 'ok', 'bad']); assert.equal(state.failures.length, 0);
    assert.deepEqual(state.items.map(x => x.row.i), ['ok', 'bad']);
});
test('검색을 바꿔 취소하면 오래된 사진을 추가하거나 나머지 기관 요청을 시작하지 않음', async () => {
    let release; let calls = 0;
    const gallery = createGallery(Array.from({ length: 10 }, (_, i) => ({ i: String(i) })), async () => {
        calls++; await new Promise(resolve => { release = resolve; }); return { photos: [{}] };
    }, { concurrency: 1 });
    const pending = gallery.next(); gallery.cancel(); release();
    const state = await pending; assert.equal(calls, 1); assert.equal(state.items.length, 0);
});
/** SOFTM-PHOTO-GALLERY END */
