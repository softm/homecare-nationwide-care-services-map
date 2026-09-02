/** SOFTM-NHIS-STATIC START 날짜:20260902 : 두 지도가 같은 정적 공단 상세·사진 JSON과 요청 중복 제거 캐시를 공유 */
(function(){
 'use strict';
 const BASE=new URL('data/nhis/',document.baseURI),memory=new Map(),tasks=new Map();
 function institutionId(value){const id=String(value||'').replace(/\D/g,'');if(!/^\d{11}$/.test(id))throw new Error('기관기호 형식이 올바르지 않습니다.');return id}
 async function fetchJson(path,label){
  if(memory.has(path))return memory.get(path);
  if(tasks.has(path))return tasks.get(path);
  const task=fetch(new URL(path,BASE),{headers:{accept:'application/json'},cache:'no-cache'}).then(async response=>{ // SOFTM-NHIS-REVALIDATE 날짜:20260903 : Actions가 갱신한 동일 경로 JSON을 브라우저가 조건부 재검증
   if(response.status===404)throw new Error(`${label}가 아직 정적 데이터에 수집되지 않았습니다.`);
   if(!response.ok)throw new Error(`${label}을 불러오지 못했습니다. (상태: ${response.status})`);
   const data=await response.json();memory.set(path,data);return data
  }).catch(error=>{memory.delete(path);throw error}).finally(()=>tasks.delete(path));
  tasks.set(path,task);return task
 }
 function serviceDetail(document,serviceCode=''){
  const details=document?.serviceDetails||{},code=String(serviceCode||'').split(',')[0].toUpperCase();
  return details[code]||details[Object.keys(details)[0]]||null
 }
 window.NhisStaticData=Object.freeze({
  baseUrl:BASE.href,
  detail(id,serviceCode=''){const key=institutionId(id);return fetchJson(`details/${key.slice(0,2)}/${key}.json`,'공단 상세정보').then(document=>({document,detail:serviceDetail(document,serviceCode)}))},
  photos(id){const key=institutionId(id);return fetchJson(`photos/${key.slice(0,2)}/${key}.json`,'공단 등록사진')},
  manifest(){return fetchJson('manifest.json','공단 데이터 수집 현황')},
  clear(){memory.clear();tasks.clear()}
 })
})();
/** SOFTM-NHIS-STATIC END */
