/** SOFTM-ASSET-VERSION START 날짜:20261121 : 이전 앱 캐시가 새 버전의 가입 스타일을 되돌리지 않으면서 오프라인 셸은 유지하는지 검사 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const origin='https://dolbomhannun.kr';
const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function worker({entries=[],offline=false}={}){
 const values=new Map(entries.map(([path,value])=>[origin+path,value]));
 const handlers=new Map(),requests=[];
 const key=value=>typeof value==='string'?value:value.url;
 const cache={
  async match(request,{ignoreSearch=false}={}){
   const target=key(request),found=[...values].find(([url])=>ignoreSearch?url.split('?')[0]===target.split('?')[0]:url===target);
   return found?new Response(found[1]):undefined;
  },
  async put(request,response){values.set(key(request),await response.text());}
 };
 const self={location:{href:origin+'/sw.js',origin},HOMECARE_MEMBER_REVISION:'test',HOMECARE_MEMBER_SHELL:[],addEventListener:(name,fn)=>handlers.set(name,fn)};
 vm.runInNewContext(source,{self,URL,importScripts(){},caches:{open:async()=>cache},fetch:async request=>{requests.push(key(request));if(offline)throw new Error('offline');return new Response('current asset');}});
 return {values,requests,async read(path){
  let response;const jobs=[];
  handlers.get('fetch')({request:{method:'GET',mode:'cors',url:origin+path},respondWith:value=>{response=value;},waitUntil:job=>jobs.push(job)});
  const result=response?await (await response).text():null;
  await Promise.all(jobs);return result;
 }};
}

test('새 CSS 버전은 이전 bare·버전 캐시를 재사용하지 않는다',async()=>{
 const w=worker({entries:[['/care-service.css','old layout'],['/care-service.css?v=old','old layout']]});
 assert.equal(await w.read('/care-service.css?v=layout-fix'),'current asset');
 assert.equal(w.values.get(origin+'/care-service.css?v=layout-fix'),'current asset');
});
test('같은 버전의 자산은 캐시에서 즉시 읽고 갱신한다',async()=>{
 const w=worker({entries:[['/care-service.css?v=layout-fix','cached fixed layout']]});
 assert.equal(await w.read('/care-service.css?v=layout-fix'),'cached fixed layout');
 assert.equal(w.values.get(origin+'/care-service.css?v=layout-fix'),'current asset');
});
test('오프라인에서는 미리 받은 bare 셸 자산으로 복원한다',async()=>{
 const w=worker({offline:true,entries:[['/care-service.css','offline shell']]});
 assert.equal(await w.read('/care-service.css?v=layout-fix'),'offline shell');
});
test('API와 회원 인증 응답은 자산 캐시로 가로채지 않는다',async()=>{
 const w=worker();
 assert.equal(await w.read('/api/auth/session'),null);
 assert.equal(await w.read('/auth-callback.html'),null);
 assert.deepEqual(w.requests,[]);
});
test('시작 화면은 외부 CSS보다 먼저 표시되고 본 화면 스타일 준비까지 유지된다',()=>{
 const startupStyle=index.indexOf('id="hannunStartupStyle"');assert.notEqual(startupStyle,-1);assert.ok(startupStyle<index.indexOf('<link'));
 assert.doesNotMatch(index,/<link[^>]+rel="stylesheet"/s);
 assert.match(index,/link\[data-hannun-style\]/);
 assert.match(index,/setTimeout\(\(\)=>f\(true\),8000\)/);
});
/** SOFTM-PWA-BRAND START 날짜:20261122 : 설치 앱 아이콘의 새 로고 규격·버전·안전 배경을 고정 */
test('설치 앱 매니페스트는 새 브랜드 아이콘과 흰 배경을 사용한다',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.background_color,'#ffffff');
 assert.equal(manifest.theme_color,'#087b5c');
 assert.deepEqual(manifest.icons.map(icon=>[icon.src,icon.sizes,icon.purpose]),[
  ['./site-icon-192.png?v=20261122-brand1','192x192','any'],
  ['./site-icon-512.png?v=20261122-brand1','512x512','any maskable']
 ]);
});
test('PWA와 Apple PNG 아이콘은 정확한 크기와 불투명 흰 모서리를 가진다',()=>{
 for(const [name,width,height] of [['site-icon-192.png',192,192],['site-icon-512.png',512,512],['apple-touch-icon.png',180,180]]){
  const png=readFileSync(new URL('../'+name,import.meta.url));
  assert.equal(png.toString('ascii',1,4),'PNG',name+' PNG 시그니처');
  assert.equal(png.readUInt32BE(16),width,name+' 너비');
  assert.equal(png.readUInt32BE(20),height,name+' 높이');
  assert.equal(png[25],2,name+' RGB 불투명 색상');
 }
});
test('파비콘은 다중 ICO와 새 브랜드 SVG를 함께 제공한다',()=>{
 const ico=readFileSync(new URL('../favicon.ico',import.meta.url));
 assert.equal(ico.readUInt16LE(0),0);assert.equal(ico.readUInt16LE(2),1);assert.ok(ico.readUInt16LE(4)>=6);
 const svg=readFileSync(new URL('../favicon.svg',import.meta.url),'utf8');
 assert.match(svg,/SOFTM-PWA-BRAND/);assert.match(svg,/#087b5c/);assert.match(svg,/#ff6957/);
});
/** SOFTM-PWA-BRAND END */
/** SOFTM-ASSET-VERSION END */
