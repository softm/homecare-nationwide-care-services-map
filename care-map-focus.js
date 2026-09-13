/** SOFTM-MAP-FOCUS START 날짜:20260914 : 한 번의 지도 탭으로 탐색 공간을 넓히고 기존 검색·목록을 오버레이에서 재사용 */
(function(root){
 'use strict';
 function isTap(start,end){return !!start&&start.id===end.id&&!start.multi&&!start.moved&&end.time-start.time<600&&Math.hypot(end.x-start.x,end.y-start.y)<10}
 function mount(config){
  const host=document.getElementById('naverMap'),card=host.closest('.map-card');let active=false,origin,pointer,moved;
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
  function leave(){if(!active)return;closePanel();active=false;controls.hidden=true;document.body.classList.remove('care-map-focus');card.inert=matchMedia('(max-width:1000px)').matches&&document.body.dataset.careWorkspace==='saved'&&document.body.dataset.careView!=='map';config.resize();root.scrollTo({top:origin.top,behavior:'instant'});document.getElementById('list').scrollTop=origin.list;origin.focus?.focus?.({preventScroll:true});}
  new MutationObserver(()=>{if(active&&card.inert)card.inert=false}).observe(card,{attributes:true,attributeFilter:['inert']});
  host.addEventListener('pointerdown',e=>{if(e.target.closest('button,a,input,.map-marker,.base-marker,.current-position-pin')){pointer=null;return}if(pointer){pointer.multi=true;return}pointer={id:e.pointerId,x:e.clientX,y:e.clientY,time:Date.now(),multi:!e.isPrimary};},{passive:true});
  host.addEventListener('pointermove',e=>{if(pointer&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>=10)pointer.moved=true},{passive:true});
  host.addEventListener('pointercancel',()=>pointer=null);
  host.addEventListener('pointerup',e=>{const start=pointer;pointer=null;if(isTap(start,{id:e.pointerId,x:e.clientX,y:e.clientY,time:Date.now()}))enter();},{passive:true});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active&&!dialog.open&&!config.overlayOpen()){e.preventDefault();e.stopImmediatePropagation();leave()}},true);
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
   else {config.results();panel('검색한 기관',document.getElementById('careSearchResults'))}
  });
  dialog.addEventListener('click',e=>{if(e.target.closest('.row')&&!e.target.closest('button,a,input,label')||e.target.closest('[data-saved-detail]'))closePanel()});
  const entry=document.createElement('button');entry.type='button';entry.className='care-focus-entry';entry.textContent='전체 지도';entry.setAttribute('aria-label','전체 지도 열기');entry.onclick=enter;card.querySelector('.map-head-actions').insertBefore(entry,card.querySelector('#shareBtn')); // SOFTM-MAP-SHARE-ORDER 날짜:20260914 : 키보드 이동도 전체 위치·전체 지도·공유의 화면 순서를 따르도록 배치
  return {enter,leave,active:()=>active};
 }
 root.CareMapFocus={mount,isTap};
})(globalThis);
/** SOFTM-MAP-FOCUS END */
