/** SOFTM-ASSET-VERSION START 날짜:20261121 : 이전 앱 캐시가 새 버전의 가입 스타일을 되돌리지 않으면서 오프라인 셸은 유지하는지 검사 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const origin='https://homecare.designboard.net';
const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
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
/** SOFTM-ASSET-VERSION END */
