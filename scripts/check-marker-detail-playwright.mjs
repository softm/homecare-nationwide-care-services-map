/** SOFTM-MARKER-DETAIL-SWITCH START 날짜:20261121 : 실제 지도 마커 클릭으로 즉시 상세 전환·지도 유지·닫힌 상태 선택 규칙을 검증 */
import assert from 'node:assert/strict';
export async function verifyMarkerDetail(page,{width,out,name}){
 const sheet=page.locator('#detailSheet');
 const waitMap=()=>page.waitForFunction(()=>mapReady&&markers.size>1&&!document.body.classList.contains('care-map-loading'),{},{timeout:35000});
 const visibleMarkers=()=>page.evaluate(()=>[...document.querySelectorAll('#naverMap .care-named-marker[data-marker-id]')].flatMap(node=>{
  for(const part of node.querySelectorAll('.map-marker,.marker-name')){
   const rect=part.getBoundingClientRect();
   for(const fraction of [.5,.25,.75]){
    const x=rect.left+rect.width*fraction,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y);
    if(rect.width&&rect.height&&x>8&&x<innerWidth-8&&y>8&&y<innerHeight-8&&node.contains(hit))return [{id:node.dataset.markerId,name:DATA.find(row=>String(row.i)===node.dataset.markerId)?.n,x,y}];
   }
  }
  return [];
 }));
 // 좁은 화면에서 다음 기관이 팝업 밖에 없으면 시험 준비로 지도만 이동한다.
 // 그 뒤 실제 클릭 전후를 비교하므로 클릭 자체가 지도를 움직이는 회귀는 허용하지 않는다.
 const pointFor=async({id,except}={})=>{
  const matches=p=>(!id||p.id===id)&&(!except||p.id!==except);
  let point=(await visibleMarkers()).find(matches);if(point)return point;
  const target=await page.evaluate(({id,except})=>[...markers].find(([key,marker])=>marker.getMap()&&(!id||String(key)===id)&&(!except||String(key)!==except))?.[0],{id,except});
  assert.ok(target,'지도에 클릭할 기관이 존재');
  await page.evaluate(target=>{const marker=markers.get(target);map.setCenter(activeDetail?focusMapCenter(marker):marker.getPosition());},target);
  for(let attempt=0;attempt<20;attempt++){
   await page.waitForTimeout(100);point=(await visibleMarkers()).find(p=>p.id===target);if(point)return point;
  }
  assert.fail('시험 지도 위치에서 실제 마커 또는 이름표 클릭 가능');
 };
 const click=async point=>{
  // 닫기·첫 선택 뒤의 지도 도구 및 이름표 배치가 끝난 좌표를 다시 확인한다.
  await page.waitForTimeout(350);
  const stable=await pointFor({id:point.id});await page.mouse.click(stable.x,stable.y);
 };
 const viewport=()=>page.evaluate(()=>({lat:map.getCenter().lat(),lng:map.getCenter().lng(),zoom:map.getZoom()}));
 const current=()=>page.evaluate(()=>({id:activeDetail?.i,name:document.getElementById('detailName').textContent,visible:!document.getElementById('detailSheet').hidden&&getComputedStyle(document.getElementById('detailSheet')).visibility!=='hidden',selected:document.querySelector('#naverMap .care-mobile-active-marker [data-marker-id]')?.dataset.markerId,tab:document.querySelector('[data-detail-view][aria-selected=true]')?.dataset.detailView,scroll:CareDetailLayout.scroller(document.getElementById('detailBody')).scrollTop}));
 await waitMap();
 const list=page.locator('[data-mobile-focus=list]');if(await list.isVisible()&&await list.getAttribute('aria-expanded')==='true')await list.click();
 const first=await pointFor();await click(first);
 if(width>1000){assert.ok(await sheet.isHidden(),'닫힌 PC 상세에서 첫 클릭은 선택');await click(await pointFor({id:first.id}));}
 await sheet.waitFor({state:'visible'});await page.waitForFunction(()=>getComputedStyle(document.getElementById('detailSheet')).visibility!=='hidden'&&!detailMoveTimer&&!markerBlinkTimer);
 await page.waitForTimeout(350);
 const switchOnce=async()=>{
  const before=await current(),next=await pointFor({except:before.id});
  const mapBefore=await viewport();await click(next);
  const after=await current();assert.equal(after.id,next.id,'한 번 클릭으로 즉시 기관 교체');assert.equal(after.visible,true,'교체 후 상세 계속 표시');assert.equal(after.selected,next.id,'활성 마커와 상세 일치');assert.equal(after.name,next.name,'상세 제목도 선택 기관과 일치');
  assert.deepEqual(await viewport(),mapBefore,'교체할 때 지도 중심·배율 보존');assert.equal(after.scroll,0,'새 기관은 내용 처음부터');
  await page.waitForTimeout(550);assert.equal((await current()).id,next.id,'이전 이동·상세 응답으로 기관이 되돌아가지 않음');
  return next;
 };
 const next=await switchOnce();
 // 같은 마커 재클릭은 이미 보던 탭·본문을 초기화하지 않습니다.
 const official=page.locator('[data-detail-view=official]');if(await official.count()){await official.click();await page.locator('#officialPanel .official-loading').waitFor({state:'hidden'});}
 await page.evaluate(()=>CareDetailLayout.scroller(document.getElementById('detailBody')).scrollTop=120);
 const samePoint=await pointFor({id:next.id}),sameBefore=await current();await click(samePoint);
 assert.deepEqual(await current(),sameBefore,'동일 마커 재클릭은 상세 상태 유지');
 await switchOnce();await switchOnce();
 await page.screenshot({path:`${out}/${name}-${width}-switched.png`,fullPage:true,animations:'disabled'});
 const lastId=(await current()).id,mapBeforeClose=await viewport();await page.locator('#detailClose').click();await sheet.waitFor({state:'hidden'});await page.waitForTimeout(350);assert.deepEqual(await viewport(),mapBeforeClose,'닫아도 지도 위치 유지');
 const other=await pointFor({except:lastId});await click(other);
 if(width>1000){assert.ok(await sheet.isHidden(),'상세 종료 후 다른 마커는 기존 첫 클릭 선택');await click(await pointFor({id:other.id}));}
 await sheet.waitFor({state:'visible'});
 return {singleClick:true,repeatedSwitch:true,sameMarkerPreserved:true,viewportPreserved:true,closedBehavior:true};
}
/** SOFTM-MARKER-DETAIL-SWITCH END */
