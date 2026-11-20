/** SOFTM-MEMBERS START 날짜:20261120 : 지도·맞춤·담기·상담에 같은 메뉴와 계정 진입점 제공 */
import { refreshSession, currentSession, api } from './care-member-api.mjs';
import { snapshot, applySnapshot, mergeSnapshots, switchOwner } from './care-workspace.mjs';
import { escapeHtml as esc } from './care-photos-common.js';
const paths={map:'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zm6-3v15m6-12v15',match:'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',saved:'M6 3h12v18l-6-4-6 4V3z',records:'M7 4H4v17h16V4h-3M8 2h8v5H8V2zm0 10h8m-8 4h6'};
export const icon=key=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[key]||paths.map}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export function notice(message,error=false){const el=document.getElementById('hcStatus');if(el){el.textContent=message;el.dataset.error=String(error);}}
export async function task(button,fn){if(button)button.disabled=true;try{return await fn();}catch(e){notice(e.message,true);return null;}finally{if(button)button.disabled=false;}}
export function finishLoading(){document.getElementById('hcStartup')?.remove();}
function renderShell(){
 document.body.classList.add('hc-integrated');
 const map=location.pathname.endsWith('/index.html')||location.pathname.endsWith('/'),file=location.pathname.split('/').pop();
 const selected=map?'map':file==='care-analysis.html'?'match':['care-saved.html','care-compare.html','care-facility.html'].includes(file)?'saved':'records';
 const type=new URLSearchParams(location.search).get('type')||'daycare';
 const nav=document.createElement('nav');nav.className='hc-nav';nav.setAttribute('aria-label','주요 서비스');
 nav.innerHTML=[['map',`index.html?type=${encodeURIComponent(type)}`,'지도 찾기'],['match',`care-analysis.html?type=${encodeURIComponent(type)}`,'맞춤 찾기'],['saved','care-saved.html','담은 기관'],['records','care-records.html','상담 기록']].map(([key,url,label])=>`<a href="${url}" ${selected===key&&!file?.includes('account')&&!file?.includes('institution')?'aria-current="page"':''}>${icon(key)}<span>${label}</span></a>`).join('');
 document.body.append(nav);
 if(map){const account=document.createElement('a');account.className='hc-account-link hc-map-account';account.href='care-account.html';account.dataset.hcAccount='';account.textContent='로그인';document.body.append(account);}
 else {const header=document.createElement('header');header.className='hc-header';header.innerHTML=`<a class="hc-brand" href="index.html"><span class="hc-mark"><svg viewBox="0 0 24 24"><path d="M12 20S3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 11-9 11Z"/><path d="M6 11h3l2-4 2 8 2-4h3"/></svg></span>돌봄한눈</a><a class="hc-account-link" data-hc-account href="care-account.html">로그인</a>`;document.body.prepend(header);}
 if(document.body.classList.contains('hc-page')){const footer=document.createElement('footer');footer.className='hc-footer';footer.innerHTML='<span>가족의 선택에 필요한 근거, 돌봄한눈</span><a href="service-guide.html">이용 안내</a><a href="about.html">자료 출처</a><a href="privacy.html">개인정보처리방침</a><a href="institution-signup.html">기관회원</a>';document.body.append(footer);}
}
globalThis.addEventListener?.('care:session',event=>{const data=event.detail;switchOwner(data?.user?.id||null);document.querySelectorAll('[data-hc-account]').forEach(a=>{a.textContent=data?.user?'내 정보':'로그인';});});
export async function storageDialog(){
 const session=currentSession();if(!session?.user){location.href='care-account.html?return=care-records.html';return;}
 if(session.user.onboarding!=='complete'){location.href=session.user.kind==='institution'?'institution-signup.html':'care-account.html?view=complete';return;}
 const remote=await api('/api/me/workspace'),local=snapshot(),dialog=document.createElement('dialog');dialog.className='hc-dialog';
 const count=w=>(w?.consultations?.length||0)+'건의 상담 · '+Object.values(w?.baskets||{}).reduce((a,b)=>a+b.length,0)+'곳의 담은 기관';
 dialog.innerHTML=`<h2>내 보관소</h2><p>이 기기: ${esc(count(local))}<br>서버 저장본: ${remote.workspace?esc(count(remote.workspace)):'아직 없음'}</p><p class="hc-muted">합쳐 저장하면 같은 기관의 상담 내용은 현재 기기의 기록을 사용합니다. 불러오기는 현재 기기 기록을 서버 저장본으로 바꿉니다.</p><p role="status"></p><div class="hc-actions"><button data-storage="merge">현재 기록 합쳐 저장</button>${remote.workspace?'<button data-storage="load" class="secondary">이 기기에 불러오기</button>':''}<button data-storage="close" class="quiet">닫기</button></div>`;
 document.body.append(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove());
 dialog.onclick=async event=>{const button=event.target.closest('[data-storage]');if(!button)return;if(button.dataset.storage==='close'){dialog.close();return;}button.disabled=true;const status=dialog.querySelector('[role=status]');try{if(button.dataset.storage==='load'){if(!confirm('이 기기의 기록을 서버 저장본으로 바꿀까요?'))return;applySnapshot(remote.workspace);status.textContent='서버 저장본을 불러왔습니다.';}else {const merged=mergeSnapshots(remote.workspace,local);const saved=await api('/api/me/workspace',{method:'PUT',headers:{'If-Match':String(remote.revision)},body:merged});remote.revision=saved.revision;remote.workspace=merged;applySnapshot(merged);status.textContent='계정에 저장했습니다. 다른 기기에서도 불러올 수 있습니다.';}globalThis.dispatchEvent(new CustomEvent('care:records-loaded'));}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};
}
if(typeof document!=='undefined'){
 if(!document.querySelector('.hc-nav'))renderShell();
 refreshSession().catch(()=>{});
 document.addEventListener('click',event=>{const button=event.target.closest('[data-storage-open]');if(button)void task(button,storageDialog);});
 if(new URLSearchParams(location.search).get('workspace')==='saved'){
  let opened=false;
  const open=()=>{const button=document.getElementById('careSavedTab');if(opened||!button||!document.body.dataset.careWorkspace)return;opened=true;observer.disconnect();requestAnimationFrame(()=>button.click());};
  const observer=new MutationObserver(open);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-care-workspace']});open();setTimeout(()=>observer.disconnect(),20000);
 }
}
/** SOFTM-MEMBERS END */
