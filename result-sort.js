/** SOFTM-RESULT-SORT START 날짜:20260909 : 검색 관련도와 거리 기준을 분리하고 목록만 정렬해 탐색 위치를 보존 */
(function(root){
 'use strict';
 let config, origin='map', currentPoint=null;
 const centerModes=new Set(['accuracy','distance']); // SOFTM-SORT-ORIGIN 날짜:20260910 : 실제 거리 계산에 기준 위치를 쓰는 정렬만 구분하기 위한 목록
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
 /** SOFTM-DEFAULT-SCORE START 날짜:20260910 : 두 지도의 공단 평가점수 정렬을 통일하고 미확인 점수를 마지막에 표시 */
 function score(row){const value=row.es??row.ev?.score;return typeof value==='number'&&Number.isFinite(value)?value:-Infinity;}
 /** SOFTM-DEFAULT-SCORE END */
 function usesCenter(mode){return centerModes.has(mode);}
 function sort(rows){
  if(config?.select.value==='rating'){rows.sort((a,b)=>score(b)-score(a)||a.n.localeCompare(b.n,'ko'));return true;} // SOFTM-DEFAULT-SCORE 날짜:20260910 : 평가점수는 좌표 유무와 관계없이 높은 순으로 정렬
  if(!config||!['accuracy','distance'].includes(config.select.value))return false;
  const point=origin==='current'?currentPoint:config.center();
  for(const row of rows){const value=distance(point,config.coord(row));row._distance=Number.isFinite(value)?value:undefined;}
  rows.sort((a,b)=>compare(a,b,{mode:config.select.value,query:document.getElementById('q').value,point,coord:config.coord}));return true;
 }
 /** SOFTM-SORT-PERSIST START 날짜:20260910 : 카테고리별 페이지 이동에도 적용한 정렬과 거리 중심점을 같은 탭에서 이어서 사용 */
 function createPreference(storage){
  const key='careResultSort:v1';
  return {
   read(modes,explicit,fallback='rating'){
    let saved;try{saved=JSON.parse(storage?.getItem(key)||'null');}catch{}
    if(modes.includes(explicit))return {mode:explicit,origin:'map',point:null};
    if(!saved||!modes.includes(saved.mode))return {mode:fallback,origin:'map',point:null};
    const p=saved.point,valid=p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
    return {mode:saved.mode,origin:saved.origin==='current'&&valid?'current':'map',point:saved.origin==='current'&&valid?{lat:p.lat,lng:p.lng}:null};
   },
   write(value){try{storage?.setItem(key,JSON.stringify(value));}catch{}}
  };
 }
 /** SOFTM-SORT-PERSIST END */
 function mount(options){
  config=options;const select=options.select;
  const accuracy=document.createElement('option');accuracy.value='accuracy';accuracy.textContent='정확도순';select.prepend(accuracy);
  if(select.value==='priority')select.value='accuracy';
  /** SOFTM-SORT-PERSIST START 날짜:20260910 : 공유 정렬값을 우선하고 없으면 마지막으로 적용한 조건을 첫 목록 렌더 전에 복원 */
  let storage;try{storage=root.sessionStorage;}catch{}
  const preference=createPreference(storage),modesAvailable=[...select.options].map(option=>option.value);
  const explicit=new URLSearchParams(root.location.search).get('sort');
  const restored=preference.read(modesAvailable,explicit,select.value);
  select.value=restored.mode;origin=restored.origin;currentPoint=restored.point;
  const savePreference=()=>preference.write({mode:select.value,origin,point:origin==='current'?currentPoint:null});
  if(modesAvailable.includes(explicit))savePreference();
  /** SOFTM-SORT-PERSIST END */
  const distanceOption=select.querySelector('[value="distance"]');if(distanceOption)distanceOption.textContent='거리순';
  select.hidden=true;
  const trigger=document.createElement('button');trigger.type='button';trigger.className='care-sort-trigger';select.after(trigger);
  const dialog=document.createElement('dialog');dialog.className='care-sort-dialog';dialog.setAttribute('aria-labelledby','careSortTitle');
  /** SOFTM-SORT-ORIGIN START 날짜:20260910 : 기준 위치가 쓰이는 정렬과 두 중심점의 차이를 화면에서 바로 이해하도록 안내 */
  dialog.innerHTML='<button type="button" class="care-sort-close" aria-label="정렬 닫기">×</button><h2 id="careSortTitle">정렬 옵션</h2><div class="care-sort-body"><fieldset class="care-sort-origins"><legend>거리 기준 위치</legend><label><input type="radio" name="careSortOrigin" value="map">지도 중심</label><label><input type="radio" name="careSortOrigin" value="current">내 위치</label><p class="care-sort-origin-help"></p></fieldset><fieldset class="care-sort-modes"><legend>정렬 기준</legend></fieldset><p class="care-sort-help"></p><p role="status" class="care-sort-status"></p></div><div class="care-sort-footer"><button type="button" class="care-sort-apply">적용</button></div>';
  /** SOFTM-SORT-ORIGIN END */
  // SOFTM-SORT-FIXED-ACTION 날짜:20260909 : 옵션만 스크롤하고 적용 동작은 하단에 고정
  const modes=dialog.querySelector('.care-sort-modes');
  for(const option of [...select.options].sort((a,b)=>{const rank=value=>value==='accuracy'?0:value==='distance'?1:2;return rank(a.value)-rank(b.value);})){const label=document.createElement('label'),radio=document.createElement('input');radio.type='radio';radio.name='careSortMode';radio.value=option.value;label.append(radio,document.createTextNode(option.textContent));modes.append(label);}
  document.body.append(dialog);let generation=0;
  const apply=dialog.querySelector('.care-sort-apply'),status=dialog.querySelector('.care-sort-status'),origins=dialog.querySelector('.care-sort-origins'),originHelp=dialog.querySelector('.care-sort-origin-help'),sortHelp=dialog.querySelector('.care-sort-help');
  /** SOFTM-SORT-ORIGIN START 날짜:20260910 : 선택한 중심점이 실제 적용되는 조건과 현재 기준을 정렬 버튼에 표시 */
  const originName=()=>origin==='current'?'내 위치':'지도 중심';
  function refreshDialog(){
   const mode=dialog.querySelector('[name="careSortMode"]:checked')?.value||select.value,active=usesCenter(mode),nextOrigin=dialog.querySelector('[name="careSortOrigin"]:checked')?.value||origin;
   origins.disabled=!active;origins.classList.toggle('is-disabled',!active);
   originHelp.textContent=active?(nextOrigin==='current'?'기기에서 확인한 내 위치를 고정 기준으로 사용합니다. 지도를 움직여도 바뀌지 않습니다.':'현재 지도 가운데를 기준으로 사용합니다. 지도를 이동해 다시 조회하면 기준도 함께 이동합니다.'):'정확도순과 거리순에서만 거리 기준 위치를 사용합니다.';
   sortHelp.textContent=mode==='accuracy'?'기관명·주소의 검색어 일치도를 먼저 보고, 같은 정확도는 선택한 기준 위치에서 가까운 순으로 표시합니다.':mode==='distance'?'선택한 기준 위치에서 가까운 기관부터 표시하며 위치 미확인 기관은 뒤에 둡니다.':'선택한 정렬 기준은 거리 기준 위치를 사용하지 않습니다.';
  }
  const refresh=()=>{const label=select.selectedOptions[0].textContent,suffix=usesCenter(select.value)?' · '+originName():'';trigger.textContent='정렬 · '+label+suffix+' ⌄';trigger.setAttribute('aria-label','정렬 옵션: '+label+suffix);};
  trigger.onclick=()=>{dialog.querySelector(`[name="careSortOrigin"][value="${origin}"]`).checked=true;dialog.querySelector(`[name="careSortMode"][value="${select.value}"]`).checked=true;status.textContent='';refreshDialog();dialog.showModal();};
  dialog.querySelectorAll('[name="careSortMode"],[name="careSortOrigin"]').forEach(radio=>radio.addEventListener('change',refreshDialog));
  /** SOFTM-SORT-ORIGIN END */
  function close(){generation++;apply.disabled=false;dialog.close();}
  apply.onclick=async()=>{
   const token=++generation,nextOrigin=dialog.querySelector('[name="careSortOrigin"]:checked').value,mode=dialog.querySelector('[name="careSortMode"]:checked').value,needsCenter=usesCenter(mode);
   apply.disabled=true;status.textContent=needsCenter&&nextOrigin==='current'?'현재 위치 확인 중…':'';
   try{
    const point=!needsCenter?null:nextOrigin==='current'?await root.CareLocation.request({isCurrent:()=>generation===token&&dialog.open}):options.center();
    if(generation!==token||!dialog.open)return;
    if(needsCenter&&!point)throw new Error('지도가 준비된 뒤 다시 적용해 주세요.');
    if(needsCenter){currentPoint=nextOrigin==='current'?point:null;origin=nextOrigin;}
    select.value=mode;options.apply();document.getElementById('list').scrollTop=0;savePreference();refresh();close(); // SOFTM-SORT-PERSIST 날짜:20260910 : 적용 성공 후에만 저장해 취소·위치 실패가 다음 카테고리 조건을 바꾸지 않도록 유지
   }catch(error){if(generation===token&&dialog.open){status.textContent=error.reason?root.CareLocation.info(error).message+' '+(error.reason==='denied'?root.CareLocation.permissionHelp:''):error.message;apply.disabled=false;}}
  };
  dialog.querySelector('.care-sort-close').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
  dialog.addEventListener('close',()=>{generation++;apply.disabled=false;trigger.focus({preventScroll:true});});
  select.addEventListener('change',refresh);refresh();
 }
 root.CareResultSort=Object.freeze({mount,sort,compare,relevance,distance,createPreference,usesCenter}); // SOFTM-SORT-ORIGIN 날짜:20260910 : 중심점 사용 범위를 회귀검사할 수 있도록 공유
})(typeof window==='undefined'?globalThis:window);
/** SOFTM-RESULT-SORT END */
