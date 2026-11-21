/** SOFTM-PERSONAL-COST START 날짜:20261121 : 사용자 브라우저와 실제 회원자료를 건드리지 않고 계산·저장정보·로그아웃을 검증 */
import assert from 'node:assert/strict';
export async function verifyPersonalCost(page,{profile=false,type='daycare'}={}){
 const panel=page.locator('.care-compare-cost:visible').first();await panel.waitFor({timeout:15000});
 const grade=panel.locator('[name=grade]'),burden=panel.locator('[name=burden]'),cell=page.locator('[data-cost-index="0"]:visible').first();
 if(profile){await page.waitForFunction(()=>document.querySelector('.care-compare-cost [name=grade]')?.value==='3');assert.equal(await burden.inputValue(),'reduced60');assert.match(await cell.innerText(),/78,725원/);}
 else {assert.equal(await grade.inputValue(),'');assert.match(await cell.innerText(),/등급 입력 후 계산/);}
 await grade.selectOption('3');await burden.selectOption('general');
 if(type!=='daycare'){
  if(type==='facility'){assert.match(await cell.innerText(),/이용 조건 확인 필요/);await panel.locator('[name=facilityEligible]').check();assert.match(await cell.innerText(),/465,240원 ~ 489,240원/);}
  else {assert.match(await cell.innerText(),/188,166원/);await panel.locator('[name=minutes]').selectOption('120');assert.match(await cell.innerText(),/143,319원/);}
  await cell.locator('.care-cost-extra input').fill('100000');assert.match(await cell.innerText(),type==='facility'?/565,240원 ~ 589,240원/:/243,319원/);
  return {type,eligibility:type==='facility',minutes:type==='home-care',nonCovered:true};
 }
 await panel.locator('[name=quantity]').fill('22');
 assert.match(await cell.innerText(),/196,812원/);assert.match(await cell.innerText(),/비급여 미포함/);
 await cell.locator('.care-cost-extra input').fill('300000');assert.match(await cell.innerText(),/496,812원/);
 await cell.locator('.care-cost-extra input').fill('0');assert.match(await cell.innerText(),/월 비급여 0원 포함/);
 await cell.locator('.care-cost-extra input').fill('');assert.match(await cell.innerText(),/비급여 미포함/);
 await panel.locator('[name=quantity]').fill('0');assert.match(await cell.innerText(),/이용 조건 확인 필요/);await panel.locator('[name=quantity]').fill('22');
 await panel.locator('summary').click();await panel.locator('[name=exception]').check();assert.match(await cell.innerText(),/별도 계산/);await panel.locator('[name=exception]').uncheck();
 await grade.selectOption('cognitive');await burden.selectOption('exempt');await panel.locator('[name=quantity]').fill('31');assert.match(await cell.innerText(),/1,070,840원/);
 await grade.selectOption('3');await burden.selectOption('general');await panel.locator('[name=quantity]').fill('22');
 if(profile){await page.evaluate(()=>dispatchEvent(new CustomEvent('care:session',{detail:null})));assert.equal(await grade.inputValue(),'');assert.match(await cell.innerText(),/등급 입력 후 계산/);}
 return {manual:true,nonCovered:true,capOverflow:true,unsupported:true,profile,accountIsolation:profile};
}
/** SOFTM-PERSONAL-COST END */
