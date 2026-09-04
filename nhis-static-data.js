/** SOFTM-NHIS-STATIC START 날짜:20260903 : 두 지도가 같은 정적 공단 상세·사진 JSON과 수집목록 기반 요청 제어를 공유 */
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
 /** SOFTM-NHIS-GZIP START 날짜:20260903 : GitHub Pages 용량을 줄인 기관별 gzip 상세를 서버의 Content-Encoding 처리 여부와 무관하게 안전하게 해제 */
 async function fetchGzipJson(path,label){
  if(memory.has(path))return memory.get(path);
  if(tasks.has(path))return tasks.get(path);
  const task=fetch(new URL(path,BASE),{headers:{accept:'application/gzip,application/json'},cache:'no-cache'}).then(async response=>{
   if(response.status===404)throw new Error(`${label}가 아직 정적 데이터에 수집되지 않았습니다.`);
   if(!response.ok)throw new Error(`${label}을 불러오지 못했습니다. (상태: ${response.status})`);
   const bytes=new Uint8Array(await response.arrayBuffer());
   let text;
   if(bytes[0]===0x1f&&bytes[1]===0x8b){
    if(typeof DecompressionStream!=='function')throw new Error(`${label} 압축 해제를 지원하지 않는 브라우저입니다. 브라우저를 최신 버전으로 업데이트해 주세요.`);
    const decompressed=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    text=await new Response(decompressed).text()
   }else text=new TextDecoder().decode(bytes);
   const data=JSON.parse(text);memory.set(path,data);return data
  }).catch(error=>{memory.delete(path);throw error}).finally(()=>tasks.delete(path));
  tasks.set(path,task);return task
 }
 /** SOFTM-NHIS-GZIP END */
 function serviceDetail(document,serviceCode=''){
  const details=document?.serviceDetails||{},code=String(serviceCode||'').split(',')[0].toUpperCase();
  return code?(details[code]||null):(details[Object.keys(details)[0]]||null)
 }
 async function collected(kind,key,label){const manifest=await fetchJson('manifest.json','공단 데이터 수집 현황');const ids=manifest?.[`${kind}Ids`];if(Array.isArray(ids)&&!ids.includes(key))throw new Error(`${label}가 아직 정적 데이터에 수집되지 않았습니다.`)}
 window.NhisStaticData=Object.freeze({
  baseUrl:BASE.href,
  detail(id,serviceCode=''){const key=institutionId(id);return collected('detail',key,'공단 상세정보').then(()=>fetchGzipJson(`details/${key.slice(0,2)}/${key}.json.gz`,'공단 상세정보')).then(document=>({document,detail:serviceDetail(document,serviceCode)}))}, // SOFTM-NHIS-GZIP 날짜:20260903 : 상세 팝업이 기관별 압축 파일만 요청하도록 경로 전환
  photos(id){const key=institutionId(id);return collected('photo',key,'공단 등록사진').then(()=>fetchJson(`photos/${key.slice(0,2)}/${key}.json`,'공단 등록사진'))},
  manifest(){return fetchJson('manifest.json','공단 데이터 수집 현황')},
  clear(){memory.clear();tasks.clear()}
 })
})();
/** SOFTM-NHIS-STATIC END */
