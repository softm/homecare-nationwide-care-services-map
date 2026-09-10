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
 function mount(host,getMap){
  const panel=document.createElement('section');panel.className='care-simulation';panel.hidden=true;panel.setAttribute('aria-label','모의주행');
  panel.innerHTML='<div class="care-simulation-heading"><strong>모의주행</strong><span>경로 미리보기</span><output>0%</output></div><div class="care-simulation-controls"><button type="button" data-play>시작</button><button type="button" data-restart>처음부터</button><label>속도 <select aria-label="모의주행 속도"><option value="30">30배</option><option value="60" selected>60배</option><option value="120">120배</option><option value="300">300배</option><option value="600">600배</option><option value="1200">1,200배</option></select></label><button type="button" data-stop>종료</button></div><progress max="1" value="0" aria-label="모의주행 진행률"></progress>'; // SOFTM-SIMULATION-SPEED 날짜:20260910 : 긴 경로를 빠르게 확인하도록 최대 1200배 재생 제공
  host.append(panel);
  const play=panel.querySelector('[data-play]'),output=panel.querySelector('output'),progress=panel.querySelector('progress'),speed=panel.querySelector('select');
  let route=null,pointAt,marker=null,frame=null,elapsed=0,last=0,cameraAt=0,playing=false,view=null;
  function paint(){const fraction=Math.min(1,elapsed/Math.max(1000,route.duration));output.value=`${Math.round(fraction*100)}%`;progress.value=fraction;const [lng,lat]=pointAt(fraction);marker?.setPosition(new root.naver.maps.LatLng(lat,lng));return fraction;}
  function pause(){playing=false;cancelAnimationFrame(frame);frame=null;play.textContent=progress.value===1?'다시 재생':'계속';}
  function clear(restore=true){pause();marker?.setMap(null);marker=null;if(restore&&view){const map=getMap();map.setCenter(view.center);map.setZoom(view.zoom);}view=null;elapsed=0;output.value='0%';progress.value=0;play.textContent='시작';}
  function tick(now){if(!playing||!route)return;elapsed+=Math.min(250,Math.max(0,now-last))*Number(speed.value);last=now;const fraction=paint();if(now-cameraAt>250){getMap().setCenter(marker.getPosition());cameraAt=now;}if(fraction>=1){pause();play.textContent='다시 재생';output.value='도착 · 100%';getMap().setCenter(marker.getPosition());return;}frame=requestAnimationFrame(tick);}
  function start(){const map=getMap();if(!route||!map)return;if(progress.value>=1)elapsed=0;if(!marker){view={center:map.getCenter(),zoom:map.getZoom()};marker=new root.naver.maps.Marker({map,position:map.getCenter(),zIndex:10000,icon:{content:'<div class="care-simulation-marker" aria-label="모의주행 차량">🚗</div>',anchor:new root.naver.maps.Point(20,20)}});map.setZoom(Math.max(15,map.getZoom()));}paint();map.setCenter(marker.getPosition());playing=true;play.textContent='일시정지';last=performance.now();frame=requestAnimationFrame(tick);}
  play.onclick=()=>playing?pause():start();
  panel.querySelector('[data-restart]').onclick=()=>{pause();elapsed=0;start();};
  panel.querySelector('[data-stop]').onclick=()=>clear();
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)pause();});
  return {set(result){if(route===result)return;clear(false);route=result?.path?.length>=2?result:null;panel.hidden=!route;if(route)pointAt=trajectory(route.path);},destroy(){clear();route=null;panel.remove();}};
 }
 root.CareRouteSimulation=Object.freeze({trajectory,mount});
})(typeof window==='undefined'?globalThis:window);
/** SOFTM-ROUTE-SIMULATION END */
