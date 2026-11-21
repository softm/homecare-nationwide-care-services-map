/** SOFTM-PASSWORD-LENGTH START 날짜:20261122 : 최소 길이 변경으로 신규 가입·복구·기존 계정 로그인이 서로 다른 기준을 쓰지 않도록 API 경계 검사 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {environment,client} from './helpers.mjs';

for(const kind of ['personal','institution'])test(`${kind} 가입은 7자를 거부하고 8자 가입·로그인을 허용한다`,async()=>{
 const env=environment(),c=client(env);
 const body={kind,username:'eight-user',terms:true};
 const short=await c.call('/api/auth/signup',{method:'POST',body:{...body,password:'Abc1234'}});
 assert.equal(short.status,400);assert.equal(short.body.error.code,'invalid_password');
 assert.equal(env.DB.db.prepare('SELECT count(*) AS n FROM users').get().n,0);
 const joined=await c.call('/api/auth/signup',{method:'POST',body:{...body,password:'Abc12345'}});
 assert.equal(joined.status,201);assert.equal(joined.body.data.user.onboarding,kind==='personal'?'complete':'pending');
 await c.call('/api/auth/logout',{method:'POST',body:{}});
 assert.equal((await c.call('/api/auth/login',{method:'POST',body:{username:body.username,password:'Abc12345'}})).status,200);
});

test('기존 긴 비밀번호에서 8자로 변경·복구할 수 있고 짧은 입력은 복구코드를 소비하지 않는다',async()=>{
 const env=environment(),c=client(env);await c.signup();
 const change=value=>c.call('/api/auth/password',{method:'POST',body:{currentPassword:'long-password-for-test',password:value}});
 assert.equal((await change('Abc1234')).status,400);
 const changed=await change('Abc12345');assert.equal(changed.status,200);
 const code=changed.body.data.recoveryCode;
 assert.equal((await c.call('/api/auth/recover',{method:'POST',body:{username:'tester',recoveryCode:code,password:'Def1234'}})).status,400);
 assert.equal((await c.call('/api/auth/session')).status,200);
 const recovered=await c.call('/api/auth/recover',{method:'POST',body:{username:'tester',recoveryCode:code,password:'Def12345'}});
 assert.equal(recovered.status,200);assert.equal((await c.call('/api/auth/session')).status,401);
 assert.equal((await c.call('/api/auth/login',{method:'POST',body:{username:'tester',password:'Abc12345'}})).status,401);
 assert.equal((await c.call('/api/auth/login',{method:'POST',body:{username:'tester',password:'Def12345'}})).status,200);
});

test('비밀번호 최대 128자 기준과 기존 긴 비밀번호 로그인을 유지한다',async()=>{
 const env=environment(),c=client(env),body={kind:'personal',username:'long-user',terms:true};
 assert.equal((await c.call('/api/auth/signup',{method:'POST',body:{...body,password:'x'.repeat(129)}})).status,400);
 assert.equal((await c.call('/api/auth/signup',{method:'POST',body:{...body,password:'x'.repeat(128)}})).status,201);
 await c.call('/api/auth/logout',{method:'POST',body:{}});
 assert.equal((await c.call('/api/auth/login',{method:'POST',body:{username:body.username,password:'x'.repeat(128)}})).status,200);
});
/** SOFTM-PASSWORD-LENGTH END */
