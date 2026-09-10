/** SOFTM-PHOTO-TEST START 날짜:20260910 : 사진 분류·기관기호 연결·수집 누락과 기존 담기 호환을 회귀검사 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { classify, filterRows, mapUrl, photoUrl, readJson } from '../care-photos-common.js';
import { visibleMarkerIds, saveScope, readScope, scopedRows } from '../care-photo-scope.js';

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
    for(const filename of ['care-photos.html','nationwide-care-services-map.html','nationwide-daycare-map.html']){
        const html=fs.readFileSync(filename,'utf8');
        for(const [,src] of html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))(?:[?#][^"]*)?"/g)) if(!src.startsWith('http')) assert.ok(fs.existsSync(src),src);
        for(const [,attrs,code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) if(!attrs.includes('src=')&&!attrs.includes('json')) new vm.Script(code);
    }
});
test('사진의 기관기호는 현재 유형에서 검증하고 이름이 같은 다른 기관을 선택하지 않음', () => {
    const html=fs.readFileSync('nationwide-care-services-map.html','utf8');
    const code=html.split('/** SOFTM-PHOTO-SELECT START')[1].split('*/')[1].split('/** SOFTM-PHOTO-SELECT END')[0];
    const fields={province:{value:''},city:{value:''},q:{value:''}}, messages=[];
    const context=vm.createContext({params:new URLSearchParams('institution=2'),DATA:[{i:'1',n:'같은센터',p:'서울',c:'강남'},{i:'2',n:'같은센터',p:'경기',c:'광명'}],$:id=>fields[id],updateCities(){},toast:message=>messages.push(message)});
    vm.runInContext(code,context);vm.runInContext('preparePhotoInstitution()',context);
    assert.equal(vm.runInContext('initialPhotoEntry.i',context),'2');assert.equal(fields.city.value,'광명');
    context.params=new URLSearchParams('institution=999');vm.runInContext('preparePhotoInstitution()',context);
    assert.equal(vm.runInContext('initialPhotoEntry',context),null);assert.equal(messages.length,1);
});
test('지도 초기 선택은 사용자가 새 조회를 시작하면 늦은 응답으로 상세를 열지 않음', async () => {
    const html=fs.readFileSync('nationwide-care-services-map.html','utf8');
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
    const token=saveScope(storage,{type:'daycare',ids:['2','2'],source:'nationwide-daycare-map.html?share=1'},'test-token');
    const scope=readScope(storage,token); assert.deepEqual(scope.ids,['2']);
    const rows=[{i:'1',n:'같은기관'},{i:'2',n:'같은기관'}];
    assert.deepEqual(scopedRows(rows,scope),[rows[1]]);
    assert.deepEqual(scopedRows(rows,{ids:[]}),[]);
    assert.deepEqual(scopedRows(rows,readScope(storage,'missing')),[]);
    assert.equal(readScope(null,token),null);
    assert.throws(()=>saveScope(null,{type:'daycare',ids:[],source:'nationwide-daycare-map.html'},'test-token'));
});
test('범위 재전달은 이전 사진 페이지의 집합을 덮어쓰지 않으며 외부 복귀 URL을 거부', () => {
    const data=new Map(), storage={setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)};
    saveScope(storage,{type:'daycare',ids:['1'],source:'nationwide-care-services-map.html'},'first');
    saveScope(storage,{type:'daycare',ids:['2'],source:'nationwide-care-services-map.html'},'second');
    assert.deepEqual(readScope(storage,'first').ids,['1']);assert.deepEqual(readScope(storage,'second').ids,['2']);
    saveScope(storage,{type:'daycare',ids:['1'],source:'https://other.example/'},'bad');assert.equal(readScope(storage,'bad'),null);
});
/** SOFTM-PHOTO-TEST END */
