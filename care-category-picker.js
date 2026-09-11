/** SOFTM-TYPE-ENTRY START 날짜:20260911 : 돌봄 용어를 몰라도 생활 상황으로 유형을 고르고 명시적 선택만 재방문에 복원 */
(function(root){
 'use strict';
 const key='careCategory:v1';
 const categories=[
  ['daycare','낮 동안 돌봄받기','주·야간보호','낮이나 저녁에 기관을 이용해요','☀','blue'],
  ['home-care','집에서 돌봄받기','방문요양','집으로 방문하는 돌봄을 찾아요','⌂','green'],
  ['facility','시설에서 생활하기','요양원·공동생활가정','생활하며 돌봄받을 곳을 찾아요','▤','purple'],
  ['home-nursing','방문간호','방문간호','집에서 받는 간호','✚','green'],
  ['home-bath','방문목욕','방문목욕','집으로 찾아오는 목욕 지원','♧','blue'],
  ['short-stay','단기보호','단기보호','일정 기간 기관에서 돌봄','◷','purple'],
  ['welfare-equipment','복지용구','복지용구','일상생활 보조용품','◇','green'],
  ['dementia','치매전담형','특화기관 모아보기','치매전담 특화기관 모아보기','♡','purple'],
  ['nursing-hospital','요양병원','의료기관','입원 진료를 제공하는 의료기관','✚','blue']
 ];
 const valid=type=>categories.some(row=>row[0]===type);
 function resolve(value,storage){
  const url=new URL(value),explicit=url.searchParams.get('type');
  if(valid(explicit))return explicit;
  // 과거 유형 없는 공유·기관 링크는 기존 주야간보호 해석을 보존합니다.
  if(!explicit&&(url.searchParams.has('institution')||url.searchParams.has('basket')||new URLSearchParams(url.hash.slice(1)).has('basket')))return 'daycare';
  try{const saved=storage?.getItem(key);if(valid(saved))return saved;}catch{}
  return null;
 }
 function save(storage,type){if(valid(type))try{storage?.setItem(key,type);}catch{}}
 function destination(value,type,{center,zoom,filters={},advanced}={}){
  if(!valid(type))throw Error('지원하지 않는 돌봄 유형입니다.');
  const url=new URL(value);url.searchParams.set('type',type);url.hash='';
  for(const name of ['basket','institution'])url.searchParams.delete(name);
  for(const [name,val] of Object.entries(filters)){if(val)url.searchParams.set(name,val);else url.searchParams.delete(name);}
  if(center){url.searchParams.set('lat',center.lat);url.searchParams.set('lng',center.lng);url.searchParams.set('z',zoom);}
  if(!['facility','daycare','short-stay','dementia'].includes(type))url.searchParams.delete('cap');
  if(['nursing-hospital','welfare-equipment'].includes(type))url.searchParams.delete('staff');
  if(type==='nursing-hospital')for(const p of ['grades','scores','conf'])url.searchParams.delete(p);
  if(root.CareAdvancedSearch){const state=advanced||root.CareAdvancedSearch.readState?.(url.searchParams,type);if(state)root.CareAdvancedSearch.writeState(url.searchParams,root.CareAdvancedSearch.sanitize(state,type));}
  return url;
 }
 function mount({type,getMap,snapshot=()=>({}),resize=()=>{}}){
  let storage;try{storage=root.localStorage;}catch{}
  document.body.classList.add('care-type-enabled');document.body.classList.toggle('care-type-neutral',!type);
  const label=categories.find(row=>row[0]===type)?.[2]||'돌봄 유형 선택';
  const header=document.createElement('div');header.className='care-type-header';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='care-type-toggle';toggle.textContent=label+' ▾';toggle.setAttribute('aria-controls','careTypePanel');toggle.setAttribute('aria-expanded','false');header.append(toggle);document.body.append(header);
  const panel=document.createElement('section');panel.id='careTypePanel';panel.className='care-type-panel';panel.hidden=true;panel.setAttribute('aria-labelledby','careTypeTitle');
  panel.innerHTML='<header><div><span class="care-type-eyebrow">돌봄한눈 · 기관 찾기</span><h2 id="careTypeTitle" tabindex="-1">어떤 돌봄이 필요하세요?</h2></div><button type="button" data-close aria-label="유형 선택 닫기">×</button></header><p class="care-type-intro">필요한 돌봄을 고르면 지도에서 기관을 보여드려요.</p><div class="care-type-options"></div><button type="button" class="care-type-all" aria-expanded="false">전체 유형 보기 · 9개</button><details class="care-type-help"><summary>유형이 헷갈리나요?</summary><p>낮이나 저녁에 기관을 오가며 이용하려면 <b>주·야간보호</b>, 집에서 일상생활 도움을 받으려면 <b>방문요양</b>, 기관에서 생활하며 돌봄받으려면 <b>요양원·공동생활가정</b>을 살펴보세요.</p><p>일정 기간의 돌봄은 단기보호, 집에서 간호·목욕 지원은 방문간호·방문목욕입니다. 치매전담형은 특화기관 모아보기이며 요양병원은 입원 진료를 제공하는 의료기관입니다.</p></details><button type="button" class="care-type-expand" aria-expanded="false" aria-label="유형 선택 화면 높이 조절">확대 ↑</button>';
  document.querySelector('.results').append(panel);
  const list=panel.querySelector('.care-type-options');
  for(const [id,title,official,description,icon,color]of categories){
   const button=document.createElement('button');button.type='button';button.className='care-type-option '+color;button.dataset.type=id;button.hidden=list.children.length>=3;
   button.innerHTML=`<span class="care-type-icon" aria-hidden="true">${icon}</span><span><strong>${title}</strong><small>${official}</small><span>${description}</span></span><span aria-hidden="true">›</span>`;
   button.onclick=()=>{const map=getMap(),center=map?.getCenter();const url=destination(location.href,id,{...snapshot(),center:center?{lat:center.lat(),lng:center.lng()}:null,zoom:map?.getZoom()});save(storage,id);if(type)location.assign(url.href);else location.replace(url.href);};list.append(button);
  }
  const expandButton=panel.querySelector('.care-type-expand');panel.querySelector('header').insertBefore(expandButton,panel.querySelector('[data-close]'));
  let opener=toggle,previousInert=false,previousSaved=false;
  function open(){opener=document.activeElement===document.body?toggle:document.activeElement;previousSaved=document.body.dataset.careWorkspace==='saved';if(previousSaved)document.getElementById('careSearchTab')?.click();if(document.body.classList.contains('care-mobile-filters-open'))document.querySelector('.care-filter-panel-close')?.click();const mapCard=document.querySelector('.map-card');previousInert=mapCard.inert;mapCard.inert=false;panel.hidden=false;document.body.classList.add('care-type-open');toggle.setAttribute('aria-expanded','true');resize();panel.querySelector('h2').focus({preventScroll:true});}
  function close(){document.querySelector('.map-card').inert=previousInert;panel.hidden=true;document.body.classList.remove('care-type-open','care-type-expanded');expandButton.setAttribute('aria-expanded','false');expandButton.textContent='확대 ↑';toggle.setAttribute('aria-expanded','false');if(previousSaved)document.getElementById('careSavedTab')?.click();resize();(opener?.isConnected?opener:toggle).focus({preventScroll:true});}
  toggle.onclick=()=>panel.hidden?open():close();panel.querySelector('[data-close]').onclick=close;
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
  const all=panel.querySelector('.care-type-all');all.onclick=()=>{const expanded=all.getAttribute('aria-expanded')!=='true';all.setAttribute('aria-expanded',String(expanded));all.textContent=expanded?'주요 유형만 보기':'전체 유형 보기 · 9개';[...list.children].forEach((button,index)=>button.hidden=!expanded&&index>=3);};
  const expand=panel.querySelector('.care-type-expand');expand.onclick=()=>{const expanded=document.body.classList.toggle('care-type-expanded');expand.setAttribute('aria-expanded',String(expanded));expand.textContent=expanded?'축소 ↓':'확대 ↑';resize();};
  if(!type){document.querySelector('#list').innerHTML='<div class="empty">돌봄 유형을 고르면 기관이 표시됩니다.</div>';open();}
  return {open,close};
 }
 root.CareCategoryPicker=Object.freeze({categories,resolve,save,destination,mount});
})(typeof window==='undefined'?globalThis:window);
/** SOFTM-TYPE-ENTRY END */
