/** SOFTM-RESULT-SORT START 날짜:20260909 : 검색 관련도와 거리 기준을 분리하고 목록만 정렬해 탐색 위치를 보존 */
(function(root){
 'use strict';
 let config, origin='map', currentPoint=null;
 const normalize=value=>String(value||'').toLocaleLowerCase('ko').replace(/\s+/g,'');
 function relevance(row,query){
  const q=normalize(query),name=normalize(row.n),address=normalize(row.a);
  if(!q)return 0;
  if(name===q)return 4;
  if(name.startsWith(q))return 3;
  if(name.includes(q))return 2;
  if(address.includes(q))return 1;
  return 0;
 }
 function distance(a,b){
  if(!a||!b||![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite))return Infinity;
  const r=x=>x*Math.PI/180,v=Math.sin(r(b.lat-a.lat)/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(r(b.lng-a.lng)/2)**2;
  return 12742*Math.asin(Math.sqrt(Math.min(1,v)));
 }
 function compare(a,b,{mode,query,point,coord}){
  return (mode==='accuracy'?relevance(b,query)-relevance(a,query):0)||distance(point,coord(a))-distance(point,coord(b))||a.n.localeCompare(b.n,'ko')||String(a.i).localeCompare(String(b.i));
 }
 function sort(rows){
  if(!config||!['accuracy','distance'].includes(config.select.value))return false;
  const point=origin==='current'?currentPoint:config.center();
  for(const row of rows){const value=distance(point,config.coord(row));row._distance=Number.isFinite(value)?value:undefined;}
  rows.sort((a,b)=>compare(a,b,{mode:config.select.value,query:document.getElementById('q').value,point,coord:config.coord}));return true;
 }
 function mount(options){
  config=options;const select=options.select;
  const accuracy=document.createElement('option');accuracy.value='accuracy';accuracy.textContent='정확도순';select.prepend(accuracy);
  if(select.value==='priority')select.value='accuracy';
  const distanceOption=select.querySelector('[value="distance"]');if(distanceOption)distanceOption.textContent='거리순';
  select.hidden=true;
  const trigger=document.createElement('button');trigger.type='button';trigger.className='care-sort-trigger';select.after(trigger);
  const dialog=document.createElement('dialog');dialog.className='care-sort-dialog';dialog.setAttribute('aria-labelledby','careSortTitle');
  dialog.innerHTML='<button type="button" class="care-sort-close" aria-label="정렬 닫기">×</button><h2 id="careSortTitle">정렬 옵션</h2><div class="care-sort-body"><fieldset><legend>중심점</legend><label><input type="radio" name="careSortOrigin" value="map">지도중심</label><label><input type="radio" name="careSortOrigin" value="current">내위치중심</label></fieldset><fieldset class="care-sort-modes"><legend>정렬 기준</legend></fieldset><p class="care-sort-help">정확도순은 기관명·주소의 검색어 일치도를 우선합니다. 같은 정확도는 가까운 순으로, 위치 미확인 기관은 뒤에 표시합니다.</p><p role="status" class="care-sort-status"></p></div><div class="care-sort-footer"><button type="button" class="care-sort-apply">적용</button></div>';
  // SOFTM-SORT-FIXED-ACTION 날짜:20260909 : 옵션만 스크롤하고 적용 동작은 하단에 고정
  const modes=dialog.querySelector('.care-sort-modes');
  for(const option of [...select.options].sort((a,b)=>{const rank=value=>value==='accuracy'?0:value==='distance'?1:2;return rank(a.value)-rank(b.value);})){const label=document.createElement('label'),radio=document.createElement('input');radio.type='radio';radio.name='careSortMode';radio.value=option.value;label.append(radio,document.createTextNode(option.textContent));modes.append(label);}
  document.body.append(dialog);let generation=0;
  const apply=dialog.querySelector('.care-sort-apply'),status=dialog.querySelector('.care-sort-status');
  const refresh=()=>{trigger.textContent='정렬 · '+select.selectedOptions[0].textContent+' ⌄';trigger.setAttribute('aria-label','정렬 옵션: '+select.selectedOptions[0].textContent);};
  trigger.onclick=()=>{dialog.querySelector(`[name="careSortOrigin"][value="${origin}"]`).checked=true;dialog.querySelector(`[name="careSortMode"][value="${select.value}"]`).checked=true;status.textContent='';dialog.showModal();};
  function close(){generation++;apply.disabled=false;dialog.close();}
  apply.onclick=async()=>{
   const token=++generation,nextOrigin=dialog.querySelector('[name="careSortOrigin"]:checked').value,mode=dialog.querySelector('[name="careSortMode"]:checked').value;
   apply.disabled=true;status.textContent=nextOrigin==='current'?'현재 위치 확인 중…':'';
   try{
    const point=nextOrigin==='current'?await root.CareLocation.request({isCurrent:()=>generation===token&&dialog.open}):options.center();
    if(generation!==token||!dialog.open)return;
    if(!point)throw new Error('지도가 준비된 뒤 다시 적용해 주세요.');
    currentPoint=nextOrigin==='current'?point:null;origin=nextOrigin;select.value=mode;options.apply();document.getElementById('list').scrollTop=0;refresh();close();
   }catch(error){if(generation===token&&dialog.open){status.textContent=error.reason?root.CareLocation.info(error).message+' '+(error.reason==='denied'?root.CareLocation.permissionHelp:''):error.message;apply.disabled=false;}}
  };
  dialog.querySelector('.care-sort-close').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
  dialog.addEventListener('close',()=>{generation++;apply.disabled=false;trigger.focus({preventScroll:true});});
  select.addEventListener('change',refresh);refresh();
 }
 root.CareResultSort=Object.freeze({mount,sort,compare,relevance,distance});
})(typeof window==='undefined'?globalThis:window);
/** SOFTM-RESULT-SORT END */
