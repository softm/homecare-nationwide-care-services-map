/** SOFTM-KEY START 날짜:20261121 : 모든 공개 화면에서 같은 정보·출처·만료를 표시하고 50곳씩 일괄 조회 */
import {FACT_KEYS,FACT_LABELS,SOURCE_LABELS,factState,factText,knownFact,allFresh} from './care-service-facts-model.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export const factsApiBase=()=>globalThis.CARE_INSTITUTION_API_BASE||'https://api.homecare.designboard.net';
export const dateFact=n=>n?new Date(n*1000).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):'미확인';
const queue=new Map();let scheduled=false;
async function flush(){const pending=[...queue];queue.clear();scheduled=false;for(let at=0;at<pending.length;at+=50){const chunk=pending.slice(at,at+50);let rows=null;try{const response=await fetch(`${factsApiBase()}/api/public/service-facts?ids=${chunk.map(([id])=>id).join(',')}`,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error();const body=await response.json();if(!Array.isArray(body.data))throw Error();rows=body.data;}catch{}for(const [id,resolvers] of chunk)for(const resolve of resolvers)resolve(rows===null?null:rows.find(r=>r.institutionId===id)||{institutionId:id,facts:{},pilot:false});}}
export function loadFacts(id){if(!/^\d{11}$/.test(String(id)))return Promise.resolve({facts:{},pilot:false});return new Promise(resolve=>{const key=String(id);queue.set(key,[...(queue.get(key)||[]),resolve]);if(!scheduled){scheduled=true;queueMicrotask(flush);}});}
export function itemHTML(key,fact){const state=knownFact(key,fact)?factState(fact):'unknown';return `<span class="sf-tag" data-state="${state}">${state==='fresh'?'7일 이내 확인':state==='stale'?'재확인 필요':'미확인'}</span><p>${esc(factText(key,fact))}</p>${fact?`<small>${esc(SOURCE_LABELS[fact.source]||'출처 미확인')} · 확인 ${dateFact(fact.confirmedAt)}<br>다음 확인 ${dateFact(fact.expiresAt)}</small>${fact.conditions?`<details><summary>적용 조건</summary><p>${esc(fact.conditions)}</p></details>`:''}`:''}`;}
export function factsHTML(data,{compact=false,actions=false}={}){
 if(!data)return '<p class="sf-empty">운영정보를 불러오지 못했습니다. 기존 공개자료를 확인하거나 기관에 전화해 주세요.</p>';
 if(!data.pilot)return '<p class="sf-empty">현재 이용 가능 여부·송영·비용은 기관에 확인해 주세요.</p>';
 const count=FACT_KEYS.filter(k=>knownFact(k,data.facts[k])&&factState(data.facts[k])==='fresh').length;
 const items=keys=>keys.map(k=>`<article class="sf-item"><strong>${FACT_LABELS[k]}</strong>${itemHTML(k,data.facts[k])}</article>`).join('');
 return `<section class="sf-panel ${compact?'sf-compact':''}"><div class="sf-heading"><h3>최근 확인한 이용정보</h3><span class="sf-tag">${count} / 5항목 최근 확인</span></div><div class="sf-items">${items(compact?FACT_KEYS.slice(0,2):FACT_KEYS)}</div>${compact?`<details><summary>송영·비용·돌봄 조건 더 보기</summary><div class="sf-items">${items(FACT_KEYS.slice(2))}</div></details>`:''}<p class="sf-source">확인 시점의 정보입니다. 최종 이용 여부는 원하는 요일·시간·돌봄 조건으로 상담해 주세요. 송영 지역에 포함되어도 자택 픽업은 별도 확인이 필요합니다.</p>${actions?`<a class="sf-action" href="care-record.html?type=daycare&id=${esc(data.institutionId)}">전화 전 질문·확인 결과 기록 →</a>`:''}</section>`;
}
export async function hydrateFacts(root=document){
 const hosts=[...(root.matches?.('[data-service-facts-id]')?[root]:[]),...root.querySelectorAll('[data-service-facts-id]')];
 await Promise.all(hosts.filter(h=>h.dataset.sfLoaded!==h.dataset.serviceFactsId).map(async h=>{const id=h.dataset.serviceFactsId;h.dataset.sfLoaded=id;if(h.dataset.serviceFactsType&&h.dataset.serviceFactsType!=='daycare'){h.hidden=true;return;}h.textContent='운영정보 확인 중…';const data=await loadFacts(id);if(!h.isConnected||h.dataset.serviceFactsId!==id)return;h._serviceFacts=data;h.dataset.sfRecent=String(allFresh(data?.facts));h.innerHTML=h.dataset.serviceFactsKey?`<div class="sf-compare-cell">${data?itemHTML(h.dataset.serviceFactsKey,data.facts?.[h.dataset.serviceFactsKey]):'운영정보 연결 필요'}</div>`:factsHTML(data,{compact:h.dataset.serviceFactsCompact==='true',actions:h.dataset.serviceFactsActions==='true'});h.dispatchEvent(new CustomEvent('care:facts-loaded',{bubbles:true}));}));
}
export async function listPilot(){const response=await fetch(`${factsApiBase()}/api/public/service-facts`,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('참여 기관 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');return (await response.json()).data;}
let visitor='';
export function pilotSource(){try{return ['institution','welfare','community'].includes(sessionStorage.getItem('carePilotSource'))?sessionStorage.getItem('carePilotSource'):'direct';}catch{return 'direct';}}
export function setPilotSource(value){try{sessionStorage.setItem('carePilotSource',['institution','welfare','community'].includes(value)?value:'direct');}catch{}}
export async function trackPilot(stage,institutionId='landing'){
 try{visitor=visitor||sessionStorage.getItem('carePilotVisitor')||crypto.randomUUID().replaceAll('-','');sessionStorage.setItem('carePilotVisitor',visitor);await fetch(`${factsApiBase()}/api/public/pilot-events`,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({stage,institutionId,source:pilotSource(),visitorId:visitor}),keepalive:true,signal:AbortSignal.timeout(5000)});}catch{}
}
if(typeof document!=='undefined'&&!globalThis.__careServiceFactsBound){
 globalThis.__careServiceFactsBound=true;
 if(!document.querySelector('link[href*="care-service-facts.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./care-service-facts.css',import.meta.url).href;css.dataset.serviceFactsStyle='';document.head.append(css);}
 const start=()=>{void hydrateFacts();new MutationObserver(records=>{for(const r of records)for(const node of r.addedNodes)if(node.nodeType===1)void hydrateFacts(node);}).observe(document.body,{childList:true,subtree:true});};
 // SOFTM-KEY 날짜:20261121 : 지도 담기도 동일한 익명 집계로 연결, 해제는 담기로 세지 않음
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){document.querySelectorAll('[data-service-facts-id]').forEach(h=>delete h.dataset.sfLoaded);void hydrateFacts();}});
 document.addEventListener('click',event=>{const b=event.target.closest('[data-care-basket][aria-pressed="false"]');if(b)void trackPilot('save',b.dataset.careBasket);},true);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
/** SOFTM-KEY END */
