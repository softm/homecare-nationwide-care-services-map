/** SOFTM-SAVED-MARKER START 날짜:20261121 : 실제 비교함 조작과 Naver 마커 복원·배율 전환에서 담기 표시를 검증 */
import assert from 'node:assert/strict';

export async function verifySavedMarkers(page,{out,name,width}) {
 const waitMap=()=>page.waitForFunction(()=>typeof map!=='undefined'&&mapReady&&markers.size>0&&!document.body.classList.contains('care-map-loading'),{},{timeout:25000});
 const mobileList=page.locator('[data-mobile-focus=list]');
 const showList=async()=>{
  if(await mobileList.isVisible()&&await mobileList.getAttribute('aria-expanded')!=='true')await mobileList.click();
  const handle=page.locator('.care-sheet-handle');
  if(width<=1000&&await handle.isVisible()&&await page.locator('body').getAttribute('data-care-sheet')!=='list')await handle.press('Home');
 };
 const showMap=async()=>{
  const back=page.locator('.care-sheet-map-button');if(await back.isVisible())await back.click();
  if(await mobileList.isVisible()&&await mobileList.getAttribute('aria-expanded')==='true')await mobileList.click();
 };
 const savedTab=async()=>{const mobile=page.locator('[data-mobile-focus=saved]');await (await mobile.isVisible()?mobile:page.locator('#careSavedTab')).click();};
 const searchTab=async()=>{
  for(const selector of ['.care-focus-saved-close','.care-saved-search-return','#careSearchTab']){const back=page.locator(selector);if(await back.isVisible()){await back.click();return;}}
  assert.fail('담은 기관에서 지도 복귀 버튼 확인');
 };
 const marker=id=>page.locator(`#naverMap .care-named-marker[data-marker-id="${id}"]`);
 const badge=id=>marker(id).locator('.care-marker-saved');
 const button=id=>page.locator(`#list .care-basket-button[data-care-basket="${id}"]`);
 const zoom=async value=>{
  await page.evaluate(value=>map.setZoom(value),value);
  await page.waitForFunction(value=>document.querySelector('#naverMap').dataset.markerScale===(value<14?'dot':value<16?'pin':value<18?'name':'detail'),value);
  await waitMap();
 };
 const state=()=>page.evaluate(()=>({center:[map.getCenter().lat(),map.getCenter().lng()],zoom:map.getZoom(),selected:document.querySelector('#naverMap .care-mobile-active-marker [data-marker-id]')?.dataset.markerId||null}));
 const visible=async id=>{
  await page.waitForFunction(id=>{const e=document.querySelector(`#naverMap [data-marker-id="${id}"] .care-marker-saved`);return e&&!e.hidden&&getComputedStyle(e).display==='grid';},id);
  assert.equal(await badge(id).getAttribute('aria-label'),'담은 기관');
 };
 const hidden=async id=>{
  assert.equal(await badge(id).count(),1,'담기 해제 후에도 기관 마커 보존');
  assert.ok(await badge(id).evaluate(e=>e.hidden||getComputedStyle(e).display==='none'),'미담기·점 배율 배지 숨김');
 };
 const capture=async label=>{
  await showMap();await page.waitForTimeout(350);await page.locator('#naverMap').screenshot({path:`${out}/${name}-${width}-${label}.png`,animations:'disabled'});
 };

 await waitMap();await zoom(14);await showList();
 const ids=await page.evaluate(()=>[...document.querySelectorAll('#list .care-basket-button[data-care-basket]')].map(e=>e.dataset.careBasket).filter(id=>markers.get(id)?.getMap()&&map.getBounds().hasLatLng(markers.get(id).getPosition())).slice(0,2));
 assert.equal(ids.length,2,'목록과 지도에 함께 표시된 두 기관 준비');
 const [id,other]=ids;
 await hidden(id);await hidden(other);
 await button(id).scrollIntoViewIfNeeded();
 await page.evaluate(id=>selectMarkerOnly(id),id);
 await page.waitForTimeout(350);
 const before=await state(),score=await marker(id).locator('.map-marker>span').innerText();
 await button(id).click();await visible(id);await hidden(other);
 assert.equal(await button(id).getAttribute('aria-pressed'),'true');
 assert.deepEqual(await state(),before,'담기 때 지도 위치·배율·선택 기관 보존');
 assert.equal(await marker(id).locator('.map-marker>span').innerText(),score,'점수 내용 보존');

 // 이전 아이콘 HTML로 돌아가도 현재 담기 상태가 유지되어야 한다.
 await page.evaluate(other=>selectMarkerOnly(other),other);await visible(id);
 await page.evaluate(id=>selectMarkerOnly(id),id);await visible(id);
 const point=await page.evaluate(id=>{const p=markers.get(id).getPosition();return {lat:p.lat(),lng:p.lng()};},id);
 await showMap();
 await page.evaluate(point=>map.setCenter(new naver.maps.LatLng(point.lat,point.lng)),point);
 await capture('saved-pin');
 for(const level of [13,14,16,18,13,14]){
  await zoom(level);
  if(level<14){await hidden(id);assert.equal(await page.locator('#naverMap .care-marker-saved:visible').count(),0,'점 배율은 선택 기관도 담기 표시 없음');}
  else await visible(id);
  if(level===13)await capture('dot');
 }

 await showList();await button(id).click();await hidden(id);
 assert.equal(await button(id).getAttribute('aria-pressed'),'false','목록에서 해제');
 await button(id).click();await visible(id);
 await button(other).click();await visible(other);
 await savedTab();
 await page.locator(`#careSavedPanel [data-care-basket="${id}"]`).waitFor({state:'visible'});
 await zoom(14);await visible(id);await visible(other);
 await page.locator(`#careSavedPanel [data-care-basket="${id}"]`).click();
 await page.waitForFunction(id=>!CareMapExperience.contains(id),id);
 await searchTab();await waitMap();await hidden(id);await visible(other);
 await capture('restored');

 await page.reload({waitUntil:'domcontentloaded'});await waitMap();
 if(await page.locator('#welcomeAdDialog[open]').count())await page.locator('#welcomeAdClose').click();
 await savedTab();
 await page.waitForFunction(other=>CareMapExperience.isBasketMap()&&markers.get(other)?.getMap(),other);
 await zoom(14);await visible(other);
 assert.equal(await marker(id).count(),0,'새로고침 뒤 담은 지도에 해제한 기관 없음');
 const clear=page.locator('#careSavedPanel [data-basket-clear]');
 if(await clear.isVisible())await clear.click();
 else {await page.locator('.care-saved-more>summary').click();await page.locator('[data-saved-extra=clear]').click();}
 await searchTab();await waitMap();
 assert.equal(await page.locator('#naverMap .care-marker-saved:visible').count(),0,'전체 비우기 후 검색 지도에 오래된 배지 없음');
 return {saved:true,removed:true,scorePreserved:true,mapPreserved:true,selectionRestored:true,zoomLevels:[13,14,16,18],workspaceRestored:true,reloadRestored:true,cleared:true};
}
/** SOFTM-SAVED-MARKER END */
