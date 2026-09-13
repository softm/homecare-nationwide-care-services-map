/** SOFTM-REGION-ENTRY START 날짜:20260913 : 위치를 못 찾은 방문자가 전국 지도 대신 직접 정한 지역에서 탐색하도록 지원 */
(function(root){
 'use strict';
 const key='careRecentRegion:v1',maxAge=30*24*60*60*1000;
 let adapter,panel,waiting=false,manual=false,manualMode='viewport',restored='';
 function valid(record,rows,now=Date.now()){
  return record?.version===1&&['region','viewport'].includes(record.mode)&&Number.isFinite(record.savedAt)&&record.savedAt<=now&&now-record.savedAt<=maxAge
   &&Number.isFinite(record.lat)&&record.lat>=33&&record.lat<=39&&Number.isFinite(record.lng)&&record.lng>=124&&record.lng<=132
   &&Number.isInteger(record.zoom)&&record.zoom>=7&&record.zoom<=19&&(record.mode!=='viewport'||record.zoom>=11)
   &&typeof record.province==='string'&&typeof record.city==='string'&&!!record.city
   &&rows.some(row=>row.p===record.province&&row.c===record.city);
 }
 function read(rows,storage,now=Date.now()){
  try{const record=JSON.parse((storage||root.localStorage).getItem(key)||'null');return valid(record,rows,now)?record:null}catch{return null}
 }
 function save(record,rows,storage,now=Date.now()){
  const value={...record,version:1,savedAt:now};
  if(!valid(value,rows,now))return false;
  try{(storage||root.localStorage).setItem(key,JSON.stringify(value));return true}catch{return false}
 }
 function sync(){
  if(!panel)return;
  const province=panel.querySelector('[data-region-province]'),city=panel.querySelector('[data-region-city]');
  province.innerHTML=adapter.province.innerHTML;province.value=adapter.province.value;
  city.innerHTML=adapter.city.innerHTML;city.value=adapter.city.value;
  province.options[0].textContent='시도를 선택해 주세요';city.options[0].textContent='시군구를 선택해 주세요';
  city.disabled=!province.value;panel.querySelector('[data-region-search]').disabled=!province.value||!city.value;
 }
 function show(){waiting=true;restored='';manual=false;root.document.body.classList.add('care-region-pending');if(panel){panel.hidden=false;sync()}adapter?.onWaiting();}
 function hide(){waiting=false;root.document.body.classList.remove('care-region-pending');if(panel)panel.hidden=true;}
 function mount(config){
  adapter=config;panel=root.document.createElement('section');panel.className='care-region-entry';panel.hidden=true;
  panel.setAttribute('aria-label','찾을 지역 선택');
  panel.innerHTML='<div><h2>찾을 지역을 선택해 주세요</h2><p>현재 위치 없이도 원하는 지역의 기관을 찾을 수 있어요.</p><label>시도<select data-region-province aria-label="찾을 시도"></select></label><label>시군구<select data-region-city aria-label="찾을 시군구"></select></label><button type="button" data-region-search>이 지역 기관 찾기</button><p class="care-region-hint">기관명을 알고 있다면 검색창에 바로 입력해 주세요.</p><button type="button" class="care-region-retry" data-region-retry>현재 위치 다시 시도</button></div>';
  config.host.append(panel);
  panel.querySelector('[data-region-province]').onchange=e=>{config.cancel();config.province.value=e.target.value;config.updateCities();sync()};
  panel.querySelector('[data-region-city]').onchange=e=>{config.cancel();config.city.value=e.target.value;sync()};
  panel.querySelector('[data-region-search]').onclick=()=>config.search();
  panel.querySelector('[data-region-retry]').onclick=()=>config.retry();
 }
 root.CareRegionEntry={key,valid,read,save,mount,show,hide,sync,waiting:()=>waiting,markManual(mode='viewport'){manual=true;manualMode=mode;restored=''},manual:()=>manual,mode:()=>manualMode,
  automatic(){manual=false;restored=''},restoreLabel(label){restored=label;manual=false},label:()=>restored};
})(globalThis);
/** SOFTM-REGION-ENTRY END */
