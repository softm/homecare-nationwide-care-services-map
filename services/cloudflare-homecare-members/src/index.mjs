/** SOFTM-MEMBERS START 날짜:20261120 : 돌봄한눈 전용 인증·회원 기록·기관 가입 API */
import { fail, now, random, id, sha, challenge, equal, password, username, hashPassword, verifyPassword, text, cookie, token, allowedOrigin, requireOrigin, jsonBody, sql, publicUser, profile, rateLimit, TERMS } from './security.mjs';
import { authorizeUrlWithPkce, exchangeProfile, providerConfig } from './oauth.mjs';
import { cleanWorkspace, shareSnapshot } from './workspace.mjs';
import { listRegistrations, saveRegistration, uploadDocument, submitRegistration, reviewRegistration, downloadDocument } from './registrations.mjs';

const AGE=7*24*3600;
const output=(data,status=200,headers={})=>Response.json({data},{status,headers});
const statementChanges=result=>Number(result?.meta?.changes||0);
async function newSession(env,userId) {
 const raw=random(),csrf=random();
 await sql(env.DB,'INSERT INTO sessions(token_hash,user_id,csrf,expires_at,authenticated_at) VALUES(?,?,?,?,?)',await sha(raw),userId,csrf,now()+AGE,now()).run();
 return {raw,csrf};
}
async function session(request,env,{complete=false,csrf=false}={}) {
 let raw=token(request,env);
 if(new URL(request.url).hostname==='account.internal') raw=request.headers.get('Authorization')?.replace(/^Bearer /i,'')||raw;
 if(!/^[\w-]{43}$/.test(raw))fail('authentication_required','로그인이 필요합니다.',401);
 const row=await sql(env.DB,'SELECT u.*,s.csrf,s.authenticated_at,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',await sha(raw),now()).first();
 if(!row)fail('authentication_required','로그인이 만료되었습니다. 다시 로그인해 주세요.',401);
 if(await sql(env.DB,'SELECT user_id FROM deletion_jobs WHERE user_id=?',row.id).first())fail('deletion_pending','자료 삭제를 처리하고 있습니다.',423);
 if(row.kind==='institution'&&row.onboarding==='pending'&&await sql(env.INSTITUTIONS_DB,"SELECT id FROM member_registrations WHERE user_id=? AND status IN('pending','approved') AND document_key IS NOT NULL LIMIT 1",row.id).first()){
  await sql(env.DB,"UPDATE users SET onboarding='complete',updated_at=? WHERE id=?",now(),row.id).run();row.onboarding='complete';
 }
 if(complete&&row.onboarding!=='complete')fail('onboarding_required','추가 회원정보를 완료해 주세요.',403);
 if(csrf&&!equal(request.headers.get('X-CSRF-Token'),row.csrf))fail('csrf_invalid','화면을 새로 열고 다시 시도해 주세요.',403);
 return row;
}
async function admin(request,env,mutate=false) {
 const user=await session(request,env,{complete:true,csrf:mutate});
 if(!await sql(env.DB,'SELECT user_id FROM administrators WHERE user_id=?',user.id).first())fail('forbidden','운영자 권한이 필요합니다.',403);
 if(mutate&&now()-user.authenticated_at>600)fail('reauth_required','심사를 처리하려면 다시 로그인해 주세요.',403);
 return user;
}
async function sessionResponse(env,user,status=200,oldToken='') {
 const s=await newSession(env,user.id);
 if(oldToken)await sql(env.DB,'DELETE FROM sessions WHERE token_hash=?',oldToken).run();
 return output({user:publicUser(user),csrf:s.csrf},status,{'Set-Cookie':cookie(env,s.raw,AGE)});
}
async function signup(request,env) {
 await rateLimit(request,env,'signup',8);
 const body=await jsonBody(request,10000),login=username(body.username);
 if(!['personal','institution'].includes(body.kind)||body.terms!==true)fail('terms_required','회원 유형과 필수 약관 동의를 확인해 주세요.');
 const hash=await hashPassword(body.password),recovery=random(),uid=id(),time=now();
 try { await env.DB.batch([
  sql(env.DB,'INSERT INTO users(id,username,kind,onboarding,terms_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',uid,login,body.kind,body.kind==='personal'?'complete':'pending',TERMS,time,time),
  sql(env.DB,'INSERT INTO credentials(user_id,password_hash,recovery_hash) VALUES(?,?,?)',uid,hash,await sha(recovery))
 ]); } catch(e) { if(String(e).includes('UNIQUE'))fail('username_taken','이미 사용 중인 아이디입니다.',409);throw e; }
 const user=await sql(env.DB,'SELECT * FROM users WHERE id=?',uid).first(),s=await newSession(env,uid);
 return output({user:publicUser(user),csrf:s.csrf,recoveryCode:recovery},201,{'Set-Cookie':cookie(env,s.raw,AGE)});
}
async function login(request,env) {
 await rateLimit(request,env,'login',20); const body=await jsonBody(request,10000);
 const login=username(body.username);
 await rateLimit(request,env,`login:${await sha(login)}`,8);
 const user=await sql(env.DB,'SELECT u.*,c.password_hash FROM users u JOIN credentials c ON c.user_id=u.id WHERE u.username=?',login).first();
 // 존재하지 않는 아이디에도 같은 비용을 적용해 계정 존재 여부를 응답 시간으로 노출하지 않습니다.
 const dummy='scrypt$16384$8$5$0123456789abcdef0123456789abcdef$'+'0'.repeat(128);
 if(!await verifyPassword(body.password,user?.password_hash||dummy)||!user)fail('login_failed','아이디 또는 비밀번호를 확인해 주세요.',401);
 return sessionResponse(env,user,200,token(request,env)?await sha(token(request,env)):'');
}
async function recovery(request,env) {
 await rateLimit(request,env,'recovery',6);const body=await jsonBody(request,10000);
 const user=await sql(env.DB,'SELECT u.id,c.recovery_hash FROM users u JOIN credentials c ON c.user_id=u.id WHERE u.username=?',username(body.username)).first();
 if(!user||!equal(await sha(String(body.recoveryCode||'')),user.recovery_hash))fail('recovery_failed','아이디와 복구코드를 확인해 주세요.',401);
 const next=random(),hash=await hashPassword(body.password);
 const result=await sql(env.DB,'UPDATE credentials SET password_hash=?,recovery_hash=? WHERE user_id=? AND recovery_hash=? RETURNING user_id',hash,await sha(next),user.id,user.recovery_hash).first();
 if(!result)fail('recovery_used','이미 사용된 복구코드입니다.',409);
 await sql(env.DB,'DELETE FROM sessions WHERE user_id=?',user.id).run();
 return output({recoveryCode:next},200,{'Set-Cookie':cookie(env)});
}
async function oauthStart(request,env) {
 await rateLimit(request,env,'oauth',15);const body=await jsonBody(request,10000);
 if(!/^[\w-]{43}$/.test(body.challenge))fail('invalid_proof','로그인 화면을 다시 열어 주세요.');
 if(body.kind&&body.kind!=='personal')fail('institution_password_only','기관회원은 아이디·비밀번호로 가입해 주세요.',403);
 const state=random(),verifier=random(),nonce=random(),provider=text(body.provider,10);
 const redirectUri=`${env.API_ORIGIN}/api/auth/oauth/${provider}/callback`;
 const url=await authorizeUrlWithPkce(provider,env,{state,nonce,verifier,redirectUri});
 await sql(env.DB,'INSERT INTO oauth_states(state_hash,provider,verifier,nonce,client_challenge,expires_at) VALUES(?,?,?,?,?,?)',await sha(state),provider,verifier,nonce,body.challenge,now()+600).run();
 return output({url:url.href});
}
async function oauthCallback(request,env,provider) {
 const url=new URL(request.url),state=url.searchParams.get('state')||'';
 const pending=await sql(env.DB,'DELETE FROM oauth_states WHERE state_hash=? AND provider=? AND expires_at>? RETURNING *',await sha(state),provider,now()).first();
 const destination=new URL('/auth-callback.html',env.WEB_ORIGIN);
 if(!pending||url.searchParams.has('error')||!url.searchParams.get('code')) {destination.hash='error=oauth_cancelled';return Response.redirect(destination,303);}
 try {
  const remote=await exchangeProfile(provider,env,{code:url.searchParams.get('code'),state,verifier:pending.verifier,nonce:pending.nonce,redirectUri:`${env.API_ORIGIN}/api/auth/oauth/${provider}/callback`});
  let identity=await sql(env.DB,'SELECT user_id FROM identities WHERE provider=? AND subject=?',provider,remote.subject).first();
  if(!identity){
   const uid=id();try { await env.DB.batch([
    sql(env.DB,"INSERT INTO users(id,kind,onboarding,name,created_at,updated_at) VALUES(?,'personal','pending',?,?,?)",uid,text(remote.name,80),now(),now()),
    sql(env.DB,'INSERT INTO identities(provider,subject,user_id) VALUES(?,?,?)',provider,remote.subject,uid)
   ]);identity={user_id:uid};}catch(e){identity=await sql(env.DB,'SELECT user_id FROM identities WHERE provider=? AND subject=?',provider,remote.subject).first();if(!identity)throw e;}
  }
  const user=await sql(env.DB,'SELECT * FROM users WHERE id=?',identity.user_id).first();
  if(user.kind!=='personal')fail('institution_password_only','기관회원은 아이디로 로그인해 주세요.',403);
  const code=random();await sql(env.DB,'INSERT INTO auth_codes(code_hash,user_id,client_challenge,expires_at) VALUES(?,?,?,?)',await sha(code),user.id,pending.client_challenge,now()+120).run();
  destination.hash=new URLSearchParams({code}).toString();
 }catch{destination.hash='error=oauth_failed';}
 return Response.redirect(destination,303);
}
async function oauthExchange(request,env) {
 await rateLimit(request,env,'exchange',20);const body=await jsonBody(request,10000);
 if(!/^[\w-]{43}$/.test(body.verifier))fail('invalid_proof','로그인을 시작한 화면에서 다시 시도해 주세요.',401);
 const row=await sql(env.DB,'DELETE FROM auth_codes WHERE code_hash=? AND client_challenge=? AND expires_at>? RETURNING user_id',await sha(String(body.code||'')),await challenge(body.verifier),now()).first();
 if(!row)fail('invalid_code','로그인 연결이 만료되었습니다. 다시 로그인해 주세요.',401);
 return sessionResponse(env,await sql(env.DB,'SELECT * FROM users WHERE id=?',row.user_id).first());
}
async function workspace(request,env,user) {
 if(request.method==='GET'){const row=await sql(env.DB,'SELECT * FROM workspaces WHERE user_id=?',user.id).first();return output({workspace:row?JSON.parse(row.payload):null,revision:row?.revision||0});}
 const expected=Number(request.headers.get('If-Match'));
 if(!request.headers.has('If-Match')||!Number.isSafeInteger(expected)||expected<0)fail('revision_required','저장본을 먼저 확인해 주세요.',428);
 const value=cleanWorkspace(await jsonBody(request)),payload=JSON.stringify(value);
 const row=expected===0?await sql(env.DB,'INSERT INTO workspaces(user_id,payload,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(user_id) DO NOTHING RETURNING revision',user.id,payload,now()).first():await sql(env.DB,'UPDATE workspaces SET payload=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=? RETURNING revision',payload,now(),user.id,expected).first();
 if(!row)fail('conflict','다른 기기에서 저장한 자료가 있습니다. 저장본을 확인해 주세요.',409);
 return output({revision:row.revision});
}
export async function completeDeletion(env,userId,accountDelete) {
 // R2 삭제 실패는 완료로 보고하지 않고 작업을 남겨 예약 실행에서 재시도합니다.
 const docs=await sql(env.INSTITUTIONS_DB,'SELECT document_key FROM member_registrations WHERE user_id=? AND document_key IS NOT NULL',userId).all();
 for(const row of docs.results)await env.DOCUMENTS.delete(row.document_key);
 const pending=await sql(env.INSTITUTIONS_DB,'SELECT r2_key FROM member_document_deletions WHERE user_id=?',userId).all();
 for(const row of pending.results)await env.DOCUMENTS.delete(row.r2_key);
 const tasks=[sql(env.INSTITUTIONS_DB,'DELETE FROM registration_events WHERE registration_id IN(SELECT id FROM member_registrations WHERE user_id=?) OR actor_id=?',userId,userId),sql(env.INSTITUTIONS_DB,'DELETE FROM member_registrations WHERE user_id=?',userId),sql(env.INSTITUTIONS_DB,'DELETE FROM member_document_deletions WHERE user_id=?',userId)];
 if(accountDelete)tasks.push(sql(env.INSTITUTIONS_DB,"UPDATE institution_memberships SET status='revoked',updated_at=datetime('now') WHERE user_id=?",userId));
 await env.INSTITUTIONS_DB.batch(tasks);
 await env.DB.batch([sql(env.DB,'DELETE FROM shares WHERE user_id=?',userId),sql(env.DB,'DELETE FROM workspaces WHERE user_id=?',userId),sql(env.DB,'DELETE FROM sessions WHERE user_id=?',userId),...(accountDelete?[sql(env.DB,'DELETE FROM users WHERE id=?',userId)]:[]),sql(env.DB,'DELETE FROM deletion_jobs WHERE user_id=?',userId)]);
}
async function requestDeletion(request,env,user,accountDelete) {
 const body=await jsonBody(request,10000);
 if(body.confirm!==(accountDelete?'회원 탈퇴':'내 보관소 삭제'))fail('confirmation_required','확인 문구를 정확히 입력해 주세요.');
 if(now()-user.authenticated_at>600)fail('reauth_required','삭제하려면 다시 로그인해 주세요.',403);
 await sql(env.DB,'INSERT INTO deletion_jobs(user_id,account_delete,created_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET account_delete=excluded.account_delete',user.id,Number(accountDelete),now()).run();
 await completeDeletion(env,user.id,accountDelete);
 return output({deleted:true},200,{'Set-Cookie':cookie(env)});
}
async function route(request,env) {
 const url=new URL(request.url),path=url.pathname,mutate=!['GET','HEAD','OPTIONS'].includes(request.method);
 if(path==='/health')return output({service:'homecare-members',status:'ok',billingEnabled:false});
 if(request.method==='OPTIONS')return new Response(null,{status:204});
 if(mutate)requireOrigin(request,env);
 const origin=request.headers.get('Origin');if(origin&&!allowedOrigin(origin,env))fail('origin_denied','허용되지 않은 출처입니다.',403);
 if(path==='/api/auth/providers'&&request.method==='GET')return output(['kakao','naver','google'].map(provider=>{try{providerConfig(provider,env);return {provider,enabled:true};}catch{return {provider,enabled:false};}}));
 if(path==='/api/auth/signup'&&request.method==='POST')return signup(request,env);
 if(path==='/api/auth/login'&&request.method==='POST')return login(request,env);
 if(path==='/api/auth/recover'&&request.method==='POST')return recovery(request,env);
 if(path==='/api/auth/oauth/start'&&request.method==='POST')return oauthStart(request,env);
 if(path==='/api/auth/oauth/exchange'&&request.method==='POST')return oauthExchange(request,env);
 let match;
 if(request.method==='GET'&&(match=path.match(/^\/api\/auth\/oauth\/(google|kakao|naver)\/callback$/)))return oauthCallback(request,env,match[1]);
 if(path==='/api/apps/homecare/session'&&request.method==='GET') {const user=await session(request,env,{complete:true});return output({user:{id:user.id,site:'homecare'},site:'homecare'});}
 if(path==='/api/auth/session'&&request.method==='GET') {const user=await session(request,env);return output({user:publicUser(user),csrf:user.csrf,isAdmin:Boolean(await sql(env.DB,'SELECT user_id FROM administrators WHERE user_id=?',user.id).first())});}
 if(path==='/api/auth/logout'&&request.method==='POST') {const user=await session(request,env,{csrf:true});await sql(env.DB,'DELETE FROM sessions WHERE token_hash=?',user.token_hash).run();return output({loggedOut:true},200,{'Set-Cookie':cookie(env)});}
 if(path==='/api/auth/complete'&&request.method==='POST') {const user=await session(request,env,{csrf:true}),body=await jsonBody(request,10000);if(user.kind!=='personal'||body.terms!==true)fail('invalid_onboarding','가입 정보를 확인해 주세요.');const p=profile(body);await sql(env.DB,"UPDATE users SET name=?,phone=?,province=?,city=?,onboarding='complete',terms_version=?,updated_at=? WHERE id=?",p.name,p.phone,p.province,p.city,TERMS,now(),user.id).run();return sessionResponse(env,await sql(env.DB,'SELECT * FROM users WHERE id=?',user.id).first(),200,user.token_hash);}
 if(path==='/api/auth/password'&&request.method==='POST') {const user=await session(request,env,{csrf:true}),body=await jsonBody(request,10000),c=await sql(env.DB,'SELECT * FROM credentials WHERE user_id=?',user.id).first();if(!c||!await verifyPassword(body.currentPassword,c.password_hash))fail('invalid_password','현재 비밀번호를 확인해 주세요.',401);const recoveryCode=random();await env.DB.batch([sql(env.DB,'UPDATE credentials SET password_hash=?,recovery_hash=? WHERE user_id=?',await hashPassword(body.password),await sha(recoveryCode),user.id),sql(env.DB,'DELETE FROM sessions WHERE user_id=?',user.id)]);const s=await newSession(env,user.id);return output({recoveryCode,csrf:s.csrf,user:publicUser(user)},200,{'Set-Cookie':cookie(env,s.raw,AGE)});}
 if(path==='/api/me/profile'&&request.method==='PATCH') {const user=await session(request,env,{complete:true,csrf:true}),body=await jsonBody(request,10000);if(!user.username)profile(body);await sql(env.DB,'UPDATE users SET name=?,phone=?,province=?,city=?,notifications=?,updated_at=? WHERE id=?',text(body.name,80),text(body.phone,30),text(body.province,30),text(body.city,40),body.notifications===false?0:1,now(),user.id).run();return output(publicUser(await sql(env.DB,'SELECT * FROM users WHERE id=?',user.id).first()));}
 if(path==='/api/me/workspace'&&['GET','PUT'].includes(request.method))return workspace(request,env,await session(request,env,{complete:true,csrf:mutate}));
 if(['/api/me/vault','/api/me/account'].includes(path)&&request.method==='DELETE')return requestDeletion(request,env,await session(request,env,{csrf:true}),path.endsWith('/account'));
 if(path==='/api/me/shares'&&request.method==='GET') {const user=await session(request,env,{complete:true});return output((await sql(env.DB,'SELECT id,expires_at,created_at,viewed_at FROM shares WHERE user_id=? ORDER BY created_at DESC',user.id).all()).results);}
 if(path==='/api/me/shares'&&request.method==='POST') {const user=await session(request,env,{complete:true,csrf:true}),body=await jsonBody(request),snapshot=shareSnapshot(body),secret=random(),sid=id();await sql(env.DB,'INSERT INTO shares(id,token_hash,user_id,payload,expires_at,created_at) VALUES(?,?,?,?,?,?)',sid,await sha(secret),user.id,JSON.stringify(snapshot),now()+AGE,now()).run();return output({id:sid,url:`${env.WEB_ORIGIN}/care-share.html#${secret}`,expiresAt:now()+AGE},201);}
 if((match=path.match(/^\/api\/me\/shares\/([\w-]+)$/))&&request.method==='DELETE') {const user=await session(request,env,{complete:true,csrf:true});await sql(env.DB,'DELETE FROM shares WHERE id=? AND user_id=?',match[1],user.id).run();return output({revoked:true});}
 if(path==='/api/shared'&&request.method==='POST') {await rateLimit(request,env,'share',60);const body=await jsonBody(request,10000),row=await sql(env.DB,'SELECT * FROM shares WHERE token_hash=? AND expires_at>?',await sha(String(body.token||'')),now()).first();if(!row)fail('share_expired','공유가 만료되었거나 중단되었습니다.',404);await sql(env.DB,'UPDATE shares SET viewed_at=? WHERE id=?',now(),row.id).run();return output({...JSON.parse(row.payload),expiresAt:row.expires_at});}
 if(path==='/api/registrations'&&['GET','POST'].includes(request.method)){const user=await session(request,env,{csrf:mutate});if(user.kind!=='institution')fail('institution_account_required','기관회원으로 로그인해 주세요.',403);return output(request.method==='GET'?await listRegistrations(env,user):await saveRegistration(env,user,await jsonBody(request,15000)));}
 if((match=path.match(/^\/api\/registrations\/([\w-]+)\/(document|submit)$/))) {const user=await session(request,env,{csrf:mutate});if(match[2]==='document'&&request.method==='POST')return output(await uploadDocument(request,env,user,match[1]));if(match[2]==='document'&&request.method==='GET')return downloadDocument(env,user,match[1]);if(match[2]==='submit'&&request.method==='POST')return output(await submitRegistration(env,user,match[1],await jsonBody(request,10000)));}
 if(path==='/api/admin/registrations'&&request.method==='GET')return output(await listRegistrations(env,await admin(request,env),true));
 if((match=path.match(/^\/api\/admin\/registrations\/([\w-]+)\/(document|review)$/))) {const user=await admin(request,env,mutate);if(match[2]==='document'&&request.method==='GET')return downloadDocument(env,user,match[1],true);if(match[2]==='review'&&request.method==='POST')return output(await reviewRegistration(env,user,match[1],await jsonBody(request,10000)));}
 if(path.startsWith('/api/institutions/')) {const user=await session(request,env,{complete:true,csrf:mutate});if(user.kind!=='institution')fail('institution_account_required','기관회원으로 로그인해 주세요.',403);if(path==='/api/institutions/claim')fail('registration_required','기관 가입 화면에서 증빙과 함께 신청해 주세요.',403);if(!env.INSTITUTIONS)fail('service_unavailable','기관 서비스에 연결하지 못했습니다.',503);const headers=new Headers(request.headers);headers.set('Authorization',`Bearer ${token(request,env)}`);headers.delete('Cookie');return env.INSTITUTIONS.fetch(new Request(`https://institution.internal${path}${url.search}`,{method:request.method,headers,body:mutate?request.body:undefined,duplex:'half'}));}
 fail('not_found','요청한 기능을 찾지 못했습니다.',404);
}
export async function handleRequest(request,env) {
 let response;try {response=await route(request,env);}catch(e){const constraint=String(e).includes('institution_already_managed');response=Response.json({error:{code:constraint?'institution_already_managed':e.code||'server_error',message:constraint?'이미 다른 담당자가 관리하는 기관입니다. 기존 권한을 확인해 주세요.':e.status?e.message:'요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'}},{status:constraint?409:e.status||500});}
 const headers=new Headers(response.headers),origin=request.headers.get('Origin');
 headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('Vary','Origin');
 if(origin&&allowedOrigin(origin,env)){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Credentials','true');headers.set('Access-Control-Allow-Headers','Content-Type, X-CSRF-Token, If-Match');headers.set('Access-Control-Allow-Methods','GET, POST, PUT, PATCH, DELETE, OPTIONS');}
 return new Response(response.body,{status:response.status,headers});
}
export async function handleScheduled(env) {
 await env.DB.batch([sql(env.DB,'DELETE FROM sessions WHERE expires_at<?',now()),sql(env.DB,'DELETE FROM oauth_states WHERE expires_at<?',now()),sql(env.DB,'DELETE FROM auth_codes WHERE expires_at<?',now()),sql(env.DB,'DELETE FROM shares WHERE expires_at<?',now()),sql(env.DB,'DELETE FROM rate_limits WHERE expires_at<?',now())]);
 for(const job of (await sql(env.DB,'SELECT * FROM deletion_jobs LIMIT 20').all()).results){try{await completeDeletion(env,job.user_id,Boolean(job.account_delete));}catch{ /* 다음 실행에서 재시도하며 개인정보를 로그에 남기지 않습니다. */ }}
 for(const job of (await sql(env.INSTITUTIONS_DB,'SELECT * FROM member_document_deletions LIMIT 50').all()).results){try{await env.DOCUMENTS.delete(job.r2_key);await sql(env.INSTITUTIONS_DB,'DELETE FROM member_document_deletions WHERE r2_key=?',job.r2_key).run();}catch{}}
}
export default {fetch:handleRequest,scheduled:(_controller,env,ctx)=>ctx.waitUntil(handleScheduled(env))};
/** SOFTM-MEMBERS END */
