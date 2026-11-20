export const PROOF=/^[A-Za-z0-9_-]{43}$/;
export const ITEM_ID=/^[A-Za-z0-9_-]{1,80}$/;
export const CONSENT_VERSION='2026-11-11';
const encoder=new TextEncoder();
export function now(){return Math.floor(Date.now()/1000);}
export function random(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return base64url(bytes);}
export function base64url(bytes){let str='';for(const b of bytes)str+=String.fromCharCode(b);return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function from64(s){const str=s.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(str),c=>c.charCodeAt(0));}
export async function sha256(value){const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function challenge(value){return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));}
export function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
export function cookies(request){const out={};for(const part of (request.headers.get('cookie')||'').split(';')){const p=part.trim(),idx=p.indexOf('=');if(idx>0)out[p.slice(0,idx)]=p.slice(idx+1);}return out;}
export function cookie(name,value,maxAge){return `__Host-sh_${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;}
export function error(code,status=400){const ex=new Error(code);ex.status=status;throw ex;}
export function json(body,status=200,headers={}){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
export function safeImage(value){if(typeof value!=='string'||value.length>2048)return '';try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function safeText(value){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,100):'';}
export function sameOrigin(request){const origin=request.headers.get('Origin');if(origin!==new URL(request.url).origin)error('invalid-origin',403);}
export async function readJSON(request,max=200000){if((Number(request.headers.get('Content-Length'))||0)>max)error('payload-too-large',413);if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))error('json-required',415);const data=await request.text();if(data.length>max)error('payload-too-large',413);try{return JSON.parse(data);}catch{error('invalid-json');}}
