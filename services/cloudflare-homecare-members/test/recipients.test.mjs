/** SOFTM-GUARDIAN START 날짜:20261120 : 별도 동의·소유권·연락처 위조·공유 제외·삭제를 실제 DB와 API로 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {environment,client,pendingRegistration} from './helpers.mjs';
import {CARE_CONSENT_VERSION} from '../../../care-recipient-model.mjs';
const path='/api/me/care-recipient';
const profile={relationship:'parent',sex:'female',mobility:'wheelchair',careNeeds:['dementia','rehabilitation'],grade:'3',burden:'reduced60',authority:'subject-consent',healthConsent:true};
const guardian={name:'시험 보호자',phone:'010-1234-5678',province:'경기도',city:'부천시'};
const put=(c,body=profile,revision=0)=>c.call(path,{method:'PUT',body,headers:{'If-Match':String(revision)}});
async function ready(env,username='guardian-one'){const c=client(env);await c.signup('personal',username);await c.call('/api/me/profile',{method:'PATCH',body:guardian});return c;}
test('간편가입은 유지하고 대상자 저장 전 보호자 연락처·권한·별도 동의를 확인한다',async()=>{
 const env=environment(),c=client(env),signup=await c.signup();assert.equal(signup.body.data.user.onboarding,'complete');
 assert.equal((await c.call(path)).body.data.profile,null);assert.equal((await put(c)).body.error.code,'guardian_required');
 await c.call('/api/me/profile',{method:'PATCH',body:guardian});
 for(const changes of [{healthConsent:false},{healthConsent:'true'},{authority:'family'},{relationship:'self'},{sex:'invalid'},{careNeeds:['unknown']}])assert.equal((await put(c,{...profile,...changes})).status,400);
 const saved=await put(c);assert.equal(saved.status,200);assert.equal(saved.body.data.consentVersion,CARE_CONSENT_VERSION);assert.ok(saved.body.data.consentAt>0);
 assert.equal(saved.headers.get('Cache-Control'),'no-store');assert.equal(env.DB.db.prepare('SELECT count(*) n FROM care_recipients').get().n,1);
});
test('연락 대상과 대상자 소유권은 로그인 계정으로 고정하고 본문의 다른 연락처를 무시한다',async()=>{
 const env=environment(),a=await ready(env),b=await ready(env,'guardian-two'),uid=(await a.call('/api/auth/session')).body.data.user.id;
 const saved=await put(a,{...profile,userId:'another-id',guardianPhone:'010-9999-0000',patientPhone:'010-8888-0000',contactRecipient:'patient',name:'저장하면 안 되는 대상자 이름'});
 assert.equal(saved.status,200);assert.equal(saved.body.data.contactRecipient,'account-holder');assert.deepEqual(saved.body.data.guardian,{userId:uid,name:guardian.name,phone:guardian.phone});
 assert.equal((await b.call(path+'?userId='+uid)).body.data.profile,null);assert.equal((await b.call(path,{method:'DELETE',headers:{'If-Match':'1'}})).status,409);
 assert.equal(JSON.stringify(saved.body.data.profile).includes('010-'),false);assert.equal('name' in saved.body.data.profile,false);
 const changed={...guardian,name:'보호자 변경',phone:'010-5555-6666'};await a.call('/api/me/profile',{method:'PATCH',body:changed});
 assert.equal((await a.call(path)).body.data.guardian.phone,changed.phone);
 assert.equal((await a.call('/api/me/profile',{method:'PATCH',body:{...changed,phone:''}})).status,400);
 assert.throws(()=>env.DB.db.prepare("UPDATE users SET name='' WHERE id=?").run(uid),/guardian_contact_required/);
});
test('대상자 저장은 CSRF·가입 완료·일반회원·일치하는 버전을 요구한다',async()=>{
 const env=environment(),c=await ready(env),pending=client(env),institution=client(env);await pending.signup('personal','pending-user');await institution.signup('institution','institution-user');await pendingRegistration(institution);
 assert.equal((await institution.call(path)).status,403);
 const uid=(await pending.call('/api/auth/session')).body.data.user.id;env.DB.db.prepare("UPDATE users SET onboarding='pending',username=NULL WHERE id=?").run(uid);assert.equal((await pending.call(path)).status,403);
 const request=new Request(env.API_ORIGIN+path,{method:'PUT',headers:{Origin:env.WEB_ORIGIN,Cookie:c.cookie,'Content-Type':'application/json','If-Match':'0'},body:JSON.stringify(profile)});
 assert.equal((await worker.fetch(request,env)).status,403);assert.equal((await c.call(path,{method:'PUT',body:profile})).status,428);
 assert.equal((await put(c)).status,200);assert.equal((await put(c,{...profile,sex:'male'})).status,409);
 assert.equal((await put(c,{...profile,sex:'male'},1)).body.data.revision,2);assert.equal((await c.call(path,{method:'DELETE',headers:{'If-Match':'1'}})).status,409);
 assert.equal((await c.call(path)).body.data.profile.sex,'male');
});
test('대상자 원문·보호자 연락처를 일반 보관소와 가족 공유에 복제하지 않는다',async()=>{
 const env=environment(),c=await ready(env);await put(c);
 const record={type:'daycare',institutionId:'24215000294',name:'시험 기관',questions:[],checklist:[],careRecipient:profile,guardian};
 const value={v:1,baskets:{},activeCompare:{},consultations:[record],careRecipient:profile,guardian};
 assert.equal((await c.call('/api/me/workspace',{method:'PUT',body:value,headers:{'If-Match':'0'}})).status,200);
 const workspace=(await c.call('/api/me/workspace')).body.data.workspace;assert.equal('careRecipient' in workspace,false);assert.equal('guardian' in workspace,false);assert.equal('careRecipient' in workspace.consultations[0],false);
 const share=await c.call('/api/me/shares',{method:'POST',body:{records:[record],careRecipient:profile,guardian}});
 const publicValue=(await client(env).call('/api/shared',{method:'POST',body:{token:new URL(share.body.data.url).hash.slice(1)}})).body;
 for(const privateValue of ['wheelchair','rehabilitation',guardian.phone,guardian.name])assert.equal(JSON.stringify(publicValue).includes(privateValue),false);
});
test('대상자 삭제·보관소 삭제·탈퇴에서 대상자와 동의 기록을 실제 삭제한다',async()=>{
 for(const action of ['recipient','vault','account']){
  const env=environment(),c=await ready(env);await put(c);
  const result=action==='recipient'?await c.call(path,{method:'DELETE',headers:{'If-Match':'1'}}):await c.call('/api/me/'+action,{method:'DELETE',body:{confirm:action==='vault'?'내 보관소 삭제':'회원 탈퇴'}});
  assert.equal(result.status,200);assert.equal(env.DB.db.prepare('SELECT count(*) n FROM care_recipients').get().n,0);
  if(action==='recipient')assert.equal((await c.call(path)).body.data.profile,null);
  assert.equal(env.DB.db.prepare('SELECT count(*) n FROM users').get().n,action==='account'?0:1);
 }
});
/** SOFTM-GUARDIAN END */

/** SOFTM-PERSONAL-COST START 날짜:20261121 : 비용 조건의 실제 D1 왕복·미확인 전환·동의·소유권 검증 */
test('저장한 장기요양등급과 감경 조건을 소유자만 읽고 미확인으로 되돌릴 수 있다',async()=>{
 const env=environment(),a=await ready(env),b=await ready(env,'cost-guardian-two');
 for(const body of [{...profile,grade:'A'},{...profile,burden:'12'},{...profile,healthConsent:false}])assert.equal((await put(a,body)).status,400);
 assert.equal((await put(a)).status,200);
 let saved=(await a.call(path)).body.data;assert.equal(saved.profile.grade,'3');assert.equal(saved.profile.burden,'reduced60');assert.equal(saved.consentVersion,CARE_CONSENT_VERSION);
 assert.equal((await b.call(path)).body.data.profile,null);
 assert.equal((await put(a,{...profile,grade:'',burden:''},saved.revision)).status,200);
 saved=(await a.call(path)).body.data;assert.equal(saved.profile.grade,'');assert.equal(saved.profile.burden,'');
});
/** SOFTM-PERSONAL-COST END */
