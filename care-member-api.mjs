/** SOFTM-MEMBERS START 날짜:20261120 : 브라우저에는 인증 토큰을 저장하지 않고 전용 계정 쿠키와 CSRF로 통신 */
export const API_BASE=typeof location!=='undefined'&&['localhost','127.0.0.1'].includes(location.hostname)?`${location.protocol}//${location.hostname}:8788`:'https://api.homecare.designboard.net';
let auth=null,sessionRevision=0,pendingSession=null;
export const currentSession=()=>auth;
export async function api(path,{method='GET',body,headers={},blob=false}={}) {
 const h=new Headers(headers); if(body&&!(body instanceof FormData)){h.set('Content-Type','application/json');body=JSON.stringify(body);}
 if(method!=='GET'&&auth?.csrf)h.set('X-CSRF-Token',auth.csrf);
 let response;try{response=await fetch(`${API_BASE}${path}`,{method,headers:h,body,credentials:'include',cache:'no-store',signal:AbortSignal.timeout(25000)});}catch{throw new Error('회원 서비스에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');}
 if(blob&&response.ok)return response.blob();
 const result=await response.json().catch(()=>({}));
 if(!response.ok){const e=new Error(result.error?.message||'요청을 처리하지 못했습니다.');e.status=response.status;e.code=result.error?.code;throw e;}
 return result.data;
}
export function acceptSession(value) {sessionRevision++;auth=value;globalThis.dispatchEvent?.(new CustomEvent('care:session',{detail:auth}));return value;}
export function refreshSession() {
 if(pendingSession)return pendingSession;
 const revision=sessionRevision;
 pendingSession=(async()=>{try{const value=await api('/api/auth/session');return revision===sessionRevision?acceptSession(value):auth;}catch(e){if(e.status===401)return revision===sessionRevision?acceptSession(null):auth;throw e;}finally{pendingSession=null;}})();
 return pendingSession;
}
export async function login(body){return acceptSession(await api('/api/auth/login',{method:'POST',body}));}
export async function signup(body){const value=await api('/api/auth/signup',{method:'POST',body});acceptSession(value);return value;}
export async function logout(){await api('/api/auth/logout',{method:'POST',body:{}});acceptSession(null);}
export async function startSocial(provider,returnTo='care-account.html') {
 const bytes=crypto.getRandomValues(new Uint8Array(32));const encode=b=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const verifier=encode(bytes),challenge=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
 sessionStorage.setItem('careOAuthProof',JSON.stringify({verifier,returnTo,time:Date.now()}));
 const result=await api('/api/auth/oauth/start',{method:'POST',body:{provider,kind:'personal',challenge}});
 location.assign(result.url);
}
export async function finishSocial(){
 const params=new URLSearchParams(location.hash.slice(1)),proof=JSON.parse(sessionStorage.getItem('careOAuthProof')||'null');
 history.replaceState(null,'',location.pathname);
 if(params.has('error'))throw new Error('SNS 로그인을 완료하지 못했습니다. 로그인 화면에서 다시 시작해 주세요.');
 if(!proof||Date.now()-proof.time>12*60*1000)throw new Error('로그인을 시작한 기기와 화면에서 다시 시도해 주세요.');
 const result=await api('/api/auth/oauth/exchange',{method:'POST',body:{code:params.get('code'),verifier:proof.verifier}});
 sessionStorage.removeItem('careOAuthProof');acceptSession(result);
 return result.user.onboarding==='complete'?safeReturn(proof.returnTo):`care-account.html?view=complete&return=${encodeURIComponent(safeReturn(proof.returnTo))}`; // SOFTM-RECIPIENT-RETURN 날짜:20261121 : SNS 추가 정보 완료 후에도 사용자가 시작한 대상자 입력으로 복귀
}
export function safeReturn(value){try{const url=new URL(value||'care-account.html',location.href);return url.origin===location.origin&&/\/(?:index|care-[\w-]+|institution-[\w-]+)\.html$/.test(url.pathname)?url.pathname+url.search+(url.pathname.endsWith('/care-account.html')&&url.hash==='#careRecipient'?'#careRecipient':''):'care-account.html';}catch{return 'care-account.html';}} // SOFTM-RECIPIENT-RETURN 날짜:20261121 : 로그인 뒤 명시적인 대상자 입력 위치만 보존하며 외부 주소와 기타 해시는 계속 차단
export async function saveBlob(blob,name){
 if(typeof globalThis.hannunSaveFile==='function'){
  if(blob.size>10*1024*1024)throw new Error('10MB 이하 파일을 저장할 수 있습니다.');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('파일을 읽지 못했습니다.'));reader.readAsDataURL(blob);});
  if(!globalThis.hannunSaveFile({name,type:blob.type.split(';')[0],base64:data}))throw new Error('파일 저장을 취소했거나 완료하지 못했습니다.');
  return;
 }
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function download(path,name){await saveBlob(await api(path,{blob:true}),name);}
/** SOFTM-MEMBERS END */
