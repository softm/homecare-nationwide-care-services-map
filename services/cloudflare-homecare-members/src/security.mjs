/** SOFTM-MEMBERS START 날짜:20261120 : 비밀번호·세션·복구코드를 단방향으로 저장하고 요청 출처를 제한 */
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
export const TERMS = 'homecare-20261120';
export const now = () => Math.floor(Date.now() / 1000);
export const random = () => randomBytes(32).toString('base64url');
export const id = () => crypto.randomUUID();
export function fail(code, message, status = 400) { const e = new Error(message); e.code = code; e.status = status; throw e; }
export const sha = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex');
export const challenge = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('base64url');
export function equal(a, b) { const x=Buffer.from(String(a||'')), y=Buffer.from(String(b||'')); return x.length===y.length && x.length>0 && timingSafeEqual(x,y); }
const derive = (password,salt) => new Promise((resolve,reject) => scrypt(password,salt,64,{N:16384,r:8,p:5,maxmem:32*1024*1024},(e,key)=>e?reject(e):resolve(key)));
export function password(value) { if(typeof value!=='string'||value.length<8||value.length>128) fail('invalid_password','비밀번호를 8~128자로 입력해 주세요.'); return value; } // SOFTM-PASSWORD-LENGTH 날짜:20261122 : 화면과 서버의 최소 8자 기준을 일치시키고 기존 해시·상한은 유지
export function username(value) { const v=String(value||'').trim().toLowerCase(); if(!/^[a-z0-9][a-z0-9_.-]{3,31}$/.test(v)) fail('invalid_username','아이디는 영문·숫자로 시작하는 4~32자의 영문·숫자·밑줄·점·하이픈으로 입력해 주세요.'); return v; }
export async function hashPassword(value) { const salt=randomBytes(16).toString('hex'); return `scrypt$16384$8$5$${salt}$${(await derive(password(value),salt)).toString('hex')}`; }
export async function verifyPassword(value,encoded) { if(typeof value!=='string'||value.length>128) return false; const parts=String(encoded||'').split('$'); if(parts.length!==6||parts.slice(0,4).join('$')!=='scrypt$16384$8$5')return false; return equal((await derive(value,parts[4])).toString('hex'),parts[5]); }
export function text(value,max=200) { return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max):''; }
export function cookieName(env) { return env.ENVIRONMENT==='test'||env.ENVIRONMENT==='development'?'hc_session':'__Host-hc_session'; }
export function cookie(env,value='',age=0) { return `${cookieName(env)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${env.ENVIRONMENT==='test'||env.ENVIRONMENT==='development'?'':'; Secure'}`; }
export function token(request,env) { const match=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${cookieName(env)}=`)); return match?.slice(cookieName(env).length+1)||''; }
/** SOFTM-DOMAIN-MIGRATION START 날짜:20261124 : 새 동일 사이트 API로 이전하는 동안 기존 세션의 안전한 로그아웃도 허용 */
export function allowedOrigin(origin,env) {
 const legacy=String(env.LEGACY_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean);
 return origin===env.WEB_ORIGIN||origin===env.API_ORIGIN||legacy.includes(origin)||(env.ENVIRONMENT!=='production'&&env.DEV_ORIGIN&&origin===env.DEV_ORIGIN);
}
/** SOFTM-DOMAIN-MIGRATION END */
export function requireOrigin(request,env) { if(!allowedOrigin(request.headers.get('Origin'),env)) fail('origin_denied','허용되지 않은 요청입니다.',403); }
export async function boundedBody(request,max) {
 if(Number(request.headers.get('Content-Length'))>max)fail('too_large','전송할 자료가 너무 큽니다.',413);
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();fail('too_large','전송할 자료가 너무 큽니다.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}return body;
}
export async function jsonBody(request,max=500000) { if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('json_required','JSON 요청이 필요합니다.',415); const body=new TextDecoder().decode(await boundedBody(request,max)); try { const value=JSON.parse(body); if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value; }catch{fail('invalid_json','요청 내용을 확인해 주세요.');} }
export const sql = (db,query,...args) => db.prepare(query).bind(...args);
export function publicUser(row) { return {id:row.id,username:row.username,kind:row.kind,onboarding:row.onboarding,name:row.name,phone:row.phone,province:row.province,city:row.city,notifications:Boolean(row.notifications)}; }
export function profile(input) { const p={name:text(input.name,80),phone:text(input.phone,30),province:text(input.province,30),city:text(input.city,40)}; if(!p.name||!/^0[0-9 -]{8,14}$/.test(p.phone)||!p.province||!p.city)fail('profile_required','이름·휴대폰·관심지역을 모두 입력해 주세요.');return p; }
export async function rateLimit(request,env,scope,limit=15) { const bucket=Math.floor(now()/900); const ip=request.headers.get('CF-Connecting-IP')||'local'; const key=await sha(`${scope}:${ip}:${bucket}`); const row=await sql(env.DB,'INSERT INTO rate_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits',key,now()+1800).first();if(row.hits>limit)fail('rate_limited','요청이 많습니다. 잠시 후 다시 시도해 주세요.',429); }
/** SOFTM-MEMBERS END */
