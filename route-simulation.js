/** SOFTM-ROUTE-SIMULATION START 날짜:20260910 : 계산된 도로 경로를 거리 비례로 재생하고 재탐색 시 이전 주행을 제거 */
(function(root){
 'use strict';
 function trajectory(path){
  const lengths=[0];
  for(let i=1;i<path.length;i++){
   const [x,y]=path[i-1],[nx,ny]=path[i],r=Math.PI/180;
   const a=Math.sin((ny-y)*r/2)**2+Math.cos(y*r)*Math.cos(ny*r)*Math.sin((nx-x)*r/2)**2;
   lengths.push(lengths[i-1]+6371000*2*Math.asin(Math.min(1,Math.sqrt(a))));
  }
  const total=lengths.at(-1);
  return fraction=>{
   const target=Math.max(0,Math.min(1,fraction))*total;
   let low=1,high=path.length-1;
   while(low<high){const mid=(low+high)>>1;if(lengths[mid]<target)low=mid+1;else high=mid;}
   const span=lengths[low]-lengths[low-1],t=span?(target-lengths[low-1])/span:0;
   return [path[low-1][0]+(path[low][0]-path[low-1][0])*t,path[low-1][1]+(path[low][1]-path[low-1][1])*t];
  };
 }
 /** SOFTM-SIMULATION-ACTIVE START 날짜:20260910 : 방문 순서대로 경로상의 도착 지점을 잡고 해당 기관 마커만 강조 */
 function milestones(path,stops=[]){
  const lengths=[0],scale=Math.cos(path[0][1]*Math.PI/180);
  const metric=(a,b)=>Math.hypot((b[0]-a[0])*scale,b[1]-a[1]);
  for(let i=1;i<path.length;i++)lengths.push(lengths[i-1]+metric(path[i-1],path[i]));
  const total=lengths.at(-1);let previous=0;
  return stops.filter(stop=>Number.isFinite(stop.point?.lng)&&Number.isFinite(stop.point?.lat)).map((stop,index,valid)=>{
   let best=Infinity,fraction=previous;
   for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],dx=(b[0]-a[0])*scale,dy=b[1]-a[1],span=lengths[i]-lengths[i-1];
    if(!span||lengths[i]<previous*total)continue;
    const minimum=Math.max(0,(previous*total-lengths[i-1])/span);
    const t=Math.max(minimum,Math.min(1,((stop.point.lng-a[0])*scale*dx+(stop.point.lat-a[1])*dy)/(dx*dx+dy*dy)));
    const gap=metric([a[0]+(b[0]-a[0])*t,a[1]+dy*t],[stop.point.lng,stop.point.lat]);
    if(gap<best){best=gap;fraction=total?(lengths[i-1]+span*t)/total:0;}
   }
   if(index===valid.length-1)fraction=1;
   previous=fraction;return {...stop,fraction};
  });
 }
 function highlighter(getMarker){
  let current=null,icon=null,zIndex=0;
  return id=>{
   if(current){current.setIcon(icon);current.setZIndex(zIndex);current=null;}
   const next=id==null?null:getMarker(id);if(!next)return;
   icon=next.getIcon();zIndex=next.getZIndex();
   if(typeof icon?.content!=='string')return;
   current=next;next.setIcon({...icon,content:`<div class="care-simulation-active">${icon.content}</div>`});next.setZIndex(9000);
  };
 }
 /** SOFTM-SIMULATION-ACTIVE END */
 /** SOFTM-SIMULATION-CAMERA START 날짜:20260910 : 목적지가 함께 보일 때 시점을 고정하고 화면을 벗어나는 차량만 따라감 */
 function shouldFollow(bounds,point,stops=[]){
  const inside=p=>p&&p.lat>=bounds.south&&p.lat<=bounds.north&&p.lng>=bounds.west&&p.lng<=bounds.east;
  const points=stops.map(stop=>stop.point).filter(Boolean);
  if(points.length&&points.every(inside)&&inside(point))return false;
  const latMargin=(bounds.north-bounds.south)*.12,lngMargin=(bounds.east-bounds.west)*.12;
  return point.lat<bounds.south+latMargin||point.lat>bounds.north-latMargin||point.lng<bounds.west+lngMargin||point.lng>bounds.east-lngMargin;
 }
 /** SOFTM-SIMULATION-CAMERA END */
 function mount(host,getMap,getMarker=()=>null){
  const panel=document.createElement('section');panel.className='care-simulation';panel.hidden=true;panel.setAttribute('aria-label','모의주행');
  panel.innerHTML='<div class="care-simulation-heading"><strong>모의주행</strong><span>경로 미리보기</span><output>0%</output></div><div class="care-simulation-controls"><button type="button" data-play>시작</button><button type="button" data-restart>처음부터</button><label>속도 <select aria-label="모의주행 속도"><option value="300">천천히</option><option value="600" selected>보통</option><option value="1200">빠르게</option></select></label><button type="button" data-stop>종료</button></div><progress max="1" value="0" aria-label="모의주행 진행률"></progress>'; // SOFTM-SIMULATION-SPEED 날짜:20260911 : 기본 600배로 빠르게 미리 보고 큰 배속 숫자 대신 익숙한 속도 단계로 선택
  /** SOFTM-SIMULATION-ACTIVE START 날짜:20260910 : 도착 기관 이름과 강조 상태를 재생·초기화에 함께 연결 */
  const arrival=document.createElement('p');arrival.className='care-simulation-arrival';arrival.hidden=true;panel.append(arrival);
  const highlight=highlighter(getMarker);let stops=[],nextStop=0,holdUntil=0;
  function resetStops(){nextStop=0;holdUntil=0;highlight(null);arrival.hidden=true;arrival.textContent='';}
  /** SOFTM-SIMULATION-NEXT START 날짜:20260911 : 이동 전에 향하는 기관을 강조해 다음 목적지를 쉽게 확인 */
  function showNextDestination(){
   const stop=stops[nextStop];if(!stop)return;
   highlight(stop.id);arrival.textContent=`${nextStop+1}. ${stop.name} 이동 중`;arrival.hidden=false;
  }
  /** SOFTM-SIMULATION-NEXT END */
  /** SOFTM-SIMULATION-ACTIVE END */
  host.append(panel);
  const play=panel.querySelector('[data-play]'),output=panel.querySelector('output'),progress=panel.querySelector('progress'),speed=panel.querySelector('select');
  let route=null,pointAt,marker=null,frame=null,elapsed=0,last=0,cameraAt=0,playing=false,view=null;
  function paint(){const fraction=Math.min(1,elapsed/Math.max(1000,route.duration));output.value=`${Math.round(fraction*100)}%`;progress.value=fraction;const [lng,lat]=pointAt(fraction);marker?.setPosition(new root.naver.maps.LatLng(lat,lng));return fraction;}
  function pause(){playing=false;host.classList.remove('care-simulation-playing');cancelAnimationFrame(frame);frame=null;play.textContent=progress.value===1?'다시 재생':'계속';} // SOFTM-SIMULATION-BLINK 날짜:20260911 : 일시정지·완료·종료 시 목적지의 깜빡임도 즉시 멈춤
  function clear(restore=true){pause();resetStops();marker?.setMap(null);marker=null;if(restore&&view){const map=getMap();map.setCenter(view.center);map.setZoom(view.zoom);}view=null;elapsed=0;output.value='0%';progress.value=0;play.textContent='시작';}
  /** SOFTM-SIMULATION-CAMERA START 날짜:20260910 : 매 프레임 중심 이동 대신 가장자리 이탈 때만 부드럽게 이동 */
  function follow(){
   const map=getMap(),bounds=map.getBounds(),sw=bounds.getSW(),ne=bounds.getNE(),position=marker.getPosition();
   if(shouldFollow({south:sw.lat(),north:ne.lat(),west:sw.lng(),east:ne.lng()},{lat:position.lat(),lng:position.lng()},route.stops))map.panTo(position);
  }
  /** SOFTM-SIMULATION-CAMERA END */
  function tick(now){if(!playing||!route)return;if(now<holdUntil){last=now;frame=requestAnimationFrame(tick);return;}
   if(holdUntil){holdUntil=0;showNextDestination();} // SOFTM-SIMULATION-NEXT 날짜:20260911 : 도착 정차가 끝나면 다음 목적지로 강조를 전환
   elapsed+=Math.min(250,Math.max(0,now-last))*Number(speed.value);last=now;
   /** SOFTM-SIMULATION-ACTIVE START 날짜:20260910 : 고배속에서도 기관을 건너뛰지 않고 잠깐 정차해 활성 마커를 확인 */
   const stop=stops[nextStop];
   if(stop&&elapsed/Math.max(1000,route.duration)>=stop.fraction){elapsed=stop.fraction*Math.max(1000,route.duration);nextStop++;highlight(stop.id);arrival.textContent=`${nextStop}. ${stop.name} 도착`;arrival.hidden=false;holdUntil=now+650;}
   /** SOFTM-SIMULATION-ACTIVE END */
   const fraction=paint();if(now-cameraAt>1000){follow();cameraAt=now;}if(fraction>=1&&nextStop>=stops.length){pause();play.textContent='다시 재생';output.value='도착 · 100%';follow();return;}frame=requestAnimationFrame(tick);}
  /** SOFTM-SIMULATION-NEXT START 날짜:20260911 : 출발·재시작부터 다음 목적지를 강조하고 정차 중 재개는 도착 상태 유지 */
  function start(){const map=getMap();if(!route||!map)return;if(progress.value>=1){elapsed=0;resetStops();}if(!marker){view={center:map.getCenter(),zoom:map.getZoom()};marker=new root.naver.maps.Marker({map,position:map.getCenter(),zIndex:10000,icon:{content:'<div class="care-simulation-marker" aria-label="모의주행 차량">🚗</div>',anchor:new root.naver.maps.Point(20,20)}});}paint();follow();if(!holdUntil)showNextDestination();playing=true;host.classList.add('care-simulation-playing');play.textContent='일시정지';last=performance.now();frame=requestAnimationFrame(tick);} // SOFTM-SIMULATION-BLINK 날짜:20260911 : 출발·재개·처음부터의 공통 진입점에서 목적지 깜빡임을 켬
  /** SOFTM-SIMULATION-NEXT END */
  play.onclick=()=>playing?pause():start();
  panel.querySelector('[data-restart]').onclick=()=>{pause();elapsed=0;resetStops();start();};
  panel.querySelector('[data-stop]').onclick=()=>clear();
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)pause();});
  return {set(result){if(route===result)return;clear(false);route=result?.path?.length>=2?result:null;panel.hidden=!route;if(route){pointAt=trajectory(route.path);stops=milestones(route.path,route.stops);}else stops=[];},destroy(){clear();route=null;panel.remove();}};
 }
 root.CareRouteSimulation=Object.freeze({trajectory,milestones,highlighter,shouldFollow,mount});
})(typeof window==='undefined'?globalThis:window);
/** SOFTM-ROUTE-SIMULATION END */
