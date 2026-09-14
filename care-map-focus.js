/** SOFTM-MAP-FOCUS START 날짜:20260914 : 기관 마커 선택으로 탐색 공간을 넓히고 지도 배경 탭으로 기존 화면에 복귀 */
(function(root){
 'use strict';
 function isTap(start,end){return !!start&&start.id===end.id&&!start.multi&&!start.moved&&end.inside&&end.time-start.time<600&&Math.hypot(end.x-start.x,end.y-start.y)<10} // SOFTM-MAP-FOCUS-TOGGLE 날짜:20260914 : 지도 이동과 장누름을 전체보기 전환으로 오인하지 않도록 짧은 단일 포인터만 인정
 function focusAction(active){return active?'leave':null} // SOFTM-MAP-FOCUS-TOGGLE 날짜:20260914 : 지도 배경은 전체보기 복귀에만 사용하고 일반 화면의 빈 지도 탭으로 전체보기를 열지 않음
 function mount(config){
  const host=document.getElementById('naverMap'),card=host.closest('.map-card');let active=false,origin,pointer,lastPointerEnd=0,moved;
  const icons={back:'<path d="m15 5-7 7 7 7"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',layers:'<path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5"/>',saved:'<path d="M6 3h12v18l-6-4-6 4Z"/>',list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>'};
  const button=(action,label,icon)=>`<button type="button" data-focus="${action}" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[icon]}</svg><span>${label}</span></button>`;
  const controls=document.createElement('div');controls.className='care-focus-controls';controls.hidden=true;
  controls.innerHTML=`<div class="care-focus-top">${button('exit','전체 지도 닫기','back')}${button('search','지역·기관 검색','search')}</div><div class="care-focus-side">${button('layers','위성지도 보기','layers')}${button('saved','담은 기관','saved')}</div><div class="care-focus-bottom">${button('list','목록 보기','list')}</div>`;
  card.querySelector('.map-wrap').append(controls);
  const dialog=document.createElement('dialog');dialog.className='care-focus-dialog';dialog.innerHTML='<header><h2></h2><button type="button" aria-label="지도 도구 닫기">×</button></header><div class="care-focus-content"></div>';document.body.append(dialog);
  function closePanel(){if(moved){moved.placeholder.replaceWith(moved.node);if(moved.node.classList.contains('care-focus-search'))moved.node.hidden=true;moved=null}if(dialog.open)dialog.close();}
  dialog.querySelector('header button').onclick=closePanel;dialog.addEventListener('cancel',e=>{e.preventDefault();closePanel()});
  function panel(title,node){closePanel();dialog.querySelector('h2').textContent=title;const placeholder=document.createComment('지도 도구 복귀 위치');node.before(placeholder);moved={node,placeholder};dialog.querySelector('.care-focus-content').append(node);dialog.showModal();}
  function enter(){if(active||!config.ready())return;origin={top:root.scrollY,list:document.getElementById('list').scrollTop,focus:document.activeElement};active=true;card.inert=false;document.body.classList.add('care-map-focus');controls.hidden=false;config.resize();controls.querySelector('button').focus({preventScroll:true});}
  function leave(){if(!active)return;closePanel();active=false;controls.hidden=true;document.body.classList.remove('care-map-focus','care-focus-list');card.inert=matchMedia('(max-width:1000px)').matches&&document.body.dataset.careWorkspace==='saved'&&document.body.dataset.careView!=='map';config.resize();root.scrollTo({top:origin.top,behavior:'instant'});document.getElementById('list').scrollTop=origin.list;origin.focus?.focus?.({preventScroll:true});}
  new MutationObserver(()=>{if(active&&card.inert)card.inert=false}).observe(card,{attributes:true,attributeFilter:['inert']});
  function mapTap(){if(focusAction(active)==='leave')leave()}
  /** SOFTM-MAP-FOCUS-TOGGLE START 날짜:20260914 : SDK 레이어가 click을 누락해도 전체보기의 지도 배경을 짧게 누르면 기존 화면으로 복귀 */
  const excluded=target=>target instanceof Element&&!!target.closest('button,a,input,select,textarea,[role="button"],.map-marker,.marker-pin,.base-marker,.current-position-pin,.care-origin-marker');
  document.addEventListener('pointerdown',e=>{if(!host.contains(e.target)||excluded(e.target)){pointer=null;return}if(pointer){pointer.multi=true;return}pointer={id:e.pointerId,x:e.clientX,y:e.clientY,time:Date.now(),multi:e.isPrimary===false,moved:false};},true);
  document.addEventListener('pointermove',e=>{if(pointer&&e.pointerId===pointer.id&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>=10)pointer.moved=true},{passive:true,capture:true});
  document.addEventListener('pointercancel',e=>{if(pointer&&e.pointerId===pointer.id){pointer=null;lastPointerEnd=Date.now()}},true);
  document.addEventListener('pointerup',e=>{const start=pointer;pointer=null;if(!start)return;lastPointerEnd=Date.now();if(isTap(start,{id:e.pointerId,x:e.clientX,y:e.clientY,time:lastPointerEnd,inside:host.contains(e.target)&&!excluded(e.target)}))mapTap()},{passive:true,capture:true}); // SOFTM-MAP-FOCUS-TOGGLE 날짜:20260914 : 시작 입력 없는 pointerup이 뒤이은 정상 click을 막지 않도록 실제 제스처만 종료 시각을 기록
  document.addEventListener('click',e=>{if(Date.now()-lastPointerEnd<700||!host.contains(e.target)||excluded(e.target))return;mapTap()},true); // SOFTM-MAP-FOCUS-TOGGLE 날짜:20260914 : 포인터 이벤트가 없는 보조기술·합성 클릭도 지원하되 실제 탭과 드래그 뒤 click의 중복 전환을 차단
  /** SOFTM-MAP-FOCUS-TOGGLE END */
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active&&!dialog.open&&!config.overlayOpen()){e.preventDefault();e.stopImmediatePropagation();if(document.body.classList.contains('care-focus-list'))document.body.classList.remove('care-focus-list');else leave()}},true);
  const search=document.createElement('form');search.className='care-focus-search';search.hidden=true;
  search.innerHTML='<label>지역·기관명<input aria-label="전체 지도 검색어" placeholder="기관명 또는 주소"></label><label>시도<select aria-label="전체 지도 시도"></select></label><label>시군구<select aria-label="전체 지도 시군구"></select></label><button type="submit">조회</button>';
  document.body.append(search);
  const selects=search.querySelectorAll('select');
  function syncCities(){selects[1].replaceChildren(...config.cities(selects[0].value).map(value=>new Option(value||'전체 시군구',value)))}
  selects[0].onchange=syncCities;
  search.onsubmit=e=>{e.preventDefault();config.search(search.querySelector('input').value,selects[0].value,selects[1].value);closePanel();};
  controls.addEventListener('click',e=>{const b=e.target.closest('[data-focus]');if(!b)return;
   if(b.dataset.focus==='exit')leave();
   else if(b.dataset.focus==='search'){search.hidden=false;selects[0].innerHTML=document.getElementById('province').innerHTML;selects[0].value=document.getElementById('province').value;syncCities();selects[1].value=document.getElementById('city').value;search.querySelector('input').value=document.getElementById('q').value;panel('지역·기관 검색',search)}
   else if(b.dataset.focus==='layers'){const satellite=config.layers();b.setAttribute('aria-pressed',String(satellite));b.setAttribute('aria-label',satellite?'일반지도 보기':'위성지도 보기');b.title=b.getAttribute('aria-label');b.querySelector('span').textContent=b.title;}
   else if(b.dataset.focus==='saved'){config.saved();panel('담은 기관',document.getElementById('careSavedPanel'))}
   else {closePanel();config.results();document.body.classList.add('care-focus-list');} // SOFTM-FOCUS-LIST 날짜:20260914 : 목록 보기를 반복해도 전체보기와 상단 숨김을 유지하며 하단 목록만 표시
  });
  dialog.addEventListener('click',e=>{if(e.target.closest('.row')&&!e.target.closest('button,a,input,label')||e.target.closest('[data-saved-detail]'))closePanel()});
  const entry=document.createElement('button');entry.type='button';entry.className='care-focus-entry';entry.textContent='전체 지도';entry.setAttribute('aria-label','전체 지도 열기');entry.onclick=enter;card.querySelector('.map-head-actions').insertBefore(entry,card.querySelector('#shareBtn')); // SOFTM-MAP-SHARE-ORDER 날짜:20260914 : 키보드 이동도 전체 위치·전체 지도·공유의 화면 순서를 따르도록 배치
  return {enter,leave,active:()=>active}; // SOFTM-MAP-FOCUS-TOGGLE 날짜:20260914 : 전체보기 상태를 외부 기능과 회귀검사에서 확인
 }
 root.CareMapFocus={mount,isTap,focusAction}; // SOFTM-MAP-FOCUS-TOGGLE 날짜:20260914 : 짧은 탭과 열기·닫기 상태 판정을 회귀검사에서 직접 확인
})(globalThis);
/** SOFTM-MAP-FOCUS END */
