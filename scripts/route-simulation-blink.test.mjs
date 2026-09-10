/** SOFTM-SIMULATION-BLINK START 날짜:20260911 : 실제 재생 조작으로 목적지 강조·일시정지·완료·경로 해제를 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function harness() {
 const classes=()=>{const values=new Set();return {add:value=>values.add(value),remove:value=>values.delete(value),contains:value=>values.has(value)};};
 const element=()=>({classList:classes(),hidden:false,textContent:'',value:0,setAttribute(){},append(){},remove(){}});
 const controls=Object.fromEntries(['[data-play]','[data-restart]','[data-stop]','output','progress','select'].map(key=>[key,element()]));
 controls.select.value='60';
 const panel={...element(),querySelector:key=>controls[key]},host=element(),events={},frames=new Map();
 let now=0,frameId=0;
 class LatLng {constructor(lat,lng){this.latitude=lat;this.longitude=lng;}lat(){return this.latitude;}lng(){return this.longitude;}}
 class Marker {
  constructor(options){Object.assign(this,options);}
  getIcon(){return this.icon;}setIcon(icon){this.icon=icon;}
  getZIndex(){return this.zIndex;}setZIndex(value){this.zIndex=value;}
  getPosition(){return this.position;}setPosition(value){this.position=value;}setMap(value){this.map=value;}
 }
 const map={getCenter:()=>new LatLng(37,126),getZoom:()=>14,setCenter(){},setZoom(){},panTo(){},getBounds:()=>({getSW:()=>new LatLng(36,125),getNE:()=>new LatLng(38,128)})};
 const a=new Marker({icon:{content:'기관 A'},zIndex:3}),b=new Marker({icon:{content:'기관 B'},zIndex:4});
 const context={document:{hidden:false,createElement:tag=>tag==='section'?panel:element(),addEventListener:(type,callback)=>{events[type]=callback;}},
  naver:{maps:{LatLng,Marker,Point:class {}}},performance:{now:()=>now},
  requestAnimationFrame:callback=>{frames.set(++frameId,callback);return frameId;},cancelAnimationFrame:id=>frames.delete(id)};
 vm.runInNewContext(fs.readFileSync(new URL('../route-simulation.js',import.meta.url),'utf8'),context);
 const simulation=context.CareRouteSimulation.mount(host,()=>map,id=>({a,b})[id]);
 const route={duration:1000,path:[[126,37],[126.01,37],[126.02,37]],stops:[{id:'a',name:'기관 A',point:{lat:37,lng:126.01}},{id:'b',name:'기관 B',point:{lat:37,lng:126.02}}]};
 simulation.set(route);
 return {host,controls,a,b,simulation,context,events,route,tick(ms){now+=ms;const [id,callback]=frames.entries().next().value||[];if(callback){frames.delete(id);callback(now);}}};
}
test('재생·일시정지·재개는 같은 목적지의 깜빡임만 켜고 끈다',()=>{
 const h=harness();assert.equal(h.host.classList.contains('care-simulation-playing'),false);
 h.controls['[data-play]'].onclick();assert.equal(h.host.classList.contains('care-simulation-playing'),true);assert.match(h.a.icon.content,/care-simulation-active/);assert.equal(h.b.icon.content,'기관 B');
 h.controls['[data-play]'].onclick();assert.equal(h.host.classList.contains('care-simulation-playing'),false);assert.match(h.a.icon.content,/care-simulation-active/);
 h.controls['[data-play]'].onclick();assert.equal(h.host.classList.contains('care-simulation-playing'),true);
 h.context.document.hidden=true;h.events.visibilitychange();assert.equal(h.host.classList.contains('care-simulation-playing'),false);
});
test('도착 후 다음 기관으로 강조를 넘기고 완료·종료에서는 깜빡임을 남기지 않는다',()=>{
 const h=harness();h.controls['[data-play]'].onclick();h.tick(10);h.tick(650);
 assert.equal(h.a.icon.content,'기관 A');assert.match(h.b.icon.content,/care-simulation-active/);
 assert.equal(h.host.classList.contains('care-simulation-playing'),false);assert.equal(h.controls.output.value,'도착 · 100%');
 h.controls['[data-restart]'].onclick();assert.equal(h.host.classList.contains('care-simulation-playing'),true);assert.match(h.a.icon.content,/care-simulation-active/);
 h.controls['[data-stop]'].onclick();assert.equal(h.host.classList.contains('care-simulation-playing'),false);assert.equal(h.a.icon.content,'기관 A');assert.equal(h.b.icon.content,'기관 B');
});
test('새 경로·화면 해제는 재생 상태와 기존 기관 강조를 함께 정리한다',()=>{
 const h=harness();h.controls['[data-play]'].onclick();h.simulation.set({...h.route});
 assert.equal(h.host.classList.contains('care-simulation-playing'),false);assert.equal(h.a.icon.content,'기관 A');
 h.controls['[data-play]'].onclick();h.simulation.destroy();
 assert.equal(h.host.classList.contains('care-simulation-playing'),false);assert.equal(h.a.icon.content,'기관 A');
});
/** SOFTM-SIMULATION-BLINK END */
