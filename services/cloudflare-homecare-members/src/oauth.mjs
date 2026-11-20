import {challenge,from64,now,random,safeImage,safeText,error} from './crypto.mjs';

const PROVIDERS={
  google:{authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',profile:'https://openidconnect.googleapis.com/v1/userinfo',client:'GOOGLE_CLIENT_ID',secret:'GOOGLE_CLIENT_SECRET'},
  kakao:{authorize:'https://kauth.kakao.com/oauth/authorize',token:'https://kauth.kakao.com/oauth/token',profile:'https://kapi.kakao.com/v2/user/me',client:'KAKAO_CLIENT_ID',secret:'KAKAO_CLIENT_SECRET'},
  naver:{authorize:'https://nid.naver.com/oauth2.0/authorize',token:'https://nid.naver.com/oauth2.0/token',profile:'https://openapi.naver.com/v1/nid/me',client:'NAVER_CLIENT_ID',secret:'NAVER_CLIENT_SECRET'}
};
export function providerConfig(provider,env){
  const p=PROVIDERS[provider];if(!p)error('unsupported-provider',404);
  if(provider==='naver'&&env.NAVER_PUBLIC_ENABLED!=='true')error('provider-not-public',503);
  if(!env[p.client]||!env[p.secret])error('provider-not-configured',503);
  return {...p,clientId:env[p.client],clientSecret:env[p.secret]};
}
export function authorizeUrl(provider,env,{state,nonce,verifier,redirectUri}){
  const p=providerConfig(provider,env),u=new URL(p.authorize);
  u.searchParams.set('client_id',p.clientId);u.searchParams.set('response_type','code');
  u.searchParams.set('redirect_uri',redirectUri);u.searchParams.set('state',state);
  if(provider==='google'){u.searchParams.set('scope','openid profile');u.searchParams.set('nonce',nonce);u.searchParams.set('code_challenge_method','S256');}
  if(provider==='kakao'){/* Profile read uses optional user consent configured in Kakao app. */ }
  return u;
}
export async function authorizeUrlWithPkce(provider,env,args){
  const u=authorizeUrl(provider,env,args);
  if(provider==='google')u.searchParams.set('code_challenge',await challenge(args.verifier));
  return u;
}
async function fetchBounded(url,init={}){
  const res=await fetch(url,{...init,signal:AbortSignal.timeout(12000)});
  if(!res.ok)error('provider-unavailable',502);
  const len=Number(res.headers.get('content-length'))||0;if(len>32000)error('provider-response-too-large',502);
  const data=await res.text();if(data.length>32000)error('provider-response-too-large',502);
  try{return JSON.parse(data)}catch{error('invalid-provider-response',502)}
}
async function verifyGoogleIdToken(token,{audience,nonce}){
  if(typeof token!=='string'||token.length>12000)error('invalid-id-token',401);
  const parts=token.split('.');if(parts.length!==3)error('invalid-id-token',401);
  let head,claims;try{head=JSON.parse(new TextDecoder().decode(from64(parts[0])));claims=JSON.parse(new TextDecoder().decode(from64(parts[1])));}catch{error('invalid-id-token',401)}
  if(head.alg!=='RS256'||typeof head.kid!=='string'||!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)||claims.aud!==audience||claims.nonce!==nonce||!Number.isSafeInteger(claims.exp)||claims.exp<=now()||typeof claims.sub!=='string'||!claims.sub)error('invalid-id-token',401);
  const keys=await fetchBounded('https://www.googleapis.com/oauth2/v3/certs');
  const key=keys.keys?.find(k=>k.kid===head.kid&&k.kty==='RSA'&&(k.use===undefined||k.use==='sig')&&(!k.alg||k.alg==='RS256'));
  if(!key)error('invalid-id-token',401);
  const pub=await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const okay=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',pub,from64(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  if(!okay)error('invalid-id-token',401);
  return claims.sub;
}
export async function exchangeProfile(provider,env,{code,state,verifier,nonce,redirectUri}){
  const p=providerConfig(provider,env);
  const body=new URLSearchParams({grant_type:'authorization_code',client_id:p.clientId,client_secret:p.clientSecret,code,redirect_uri:redirectUri});
  if(provider==='google')body.set('code_verifier',verifier);
  if(provider==='naver')body.set('state',state);
  const token=await fetchBounded(p.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!token.access_token||typeof token.access_token!=='string')error('provider-token-failed',401);
  const profile=await fetchBounded(p.profile,{headers:{Authorization:'Bearer '+token.access_token}});
  let subject,name='',photo='';
  if(provider==='google'){
    subject=await verifyGoogleIdToken(token.id_token,{audience:p.clientId,nonce});
    if(profile.sub!==subject)error('provider-mismatch',401);
    name=profile.name;photo=profile.picture;
  }else if(provider==='kakao'){
    subject=profile.id?String(profile.id):'';
    name=profile.kakao_account?.profile?.nickname||profile.properties?.nickname;
    photo=profile.kakao_account?.profile?.profile_image_url||profile.properties?.profile_image;
    if(typeof photo==='string'&&photo.startsWith('http://')&&new URL(photo).hostname.endsWith('kakaocdn.net'))photo='https://'+photo.slice(7);
  }else{
    subject=profile.response?.id;name=profile.response?.nickname||profile.response?.name;photo=profile.response?.profile_image;
  }
  if(typeof subject!=='string'||!subject||subject.length>256)error('invalid-provider-id',401);
  return {subject,name:safeText(name),photo:safeImage(photo)};
}
