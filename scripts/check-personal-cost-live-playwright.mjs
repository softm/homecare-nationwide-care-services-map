/** SOFTM-PERSONAL-COST START 날짜:20261121 : 운영 가입·등급 저장을 가상 계정 한 개로 검증하고 비밀값 출력 없이 즉시 삭제 */
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
assert.equal(process.env.ALLOW_LIVE_TEST_ACCOUNT,'1','가상 운영 계정 생성·삭제 검증을 명시적으로 활성화해야 합니다.');
const site='https://dolbomhannun.kr',apiOrigin='https://api.dolbomhannun.kr';
const out=process.env.AUDIT_OUTPUT;assert.ok(out,'검증 결과를 저장할 경로가 필요합니다.');await mkdir(out,{recursive:true});
const rows=JSON.parse(gunzipSync(await readFile(new URL('../data/care/daycare.json.gz',import.meta.url)))).filter(row=>String(row.t).split(',').includes('B03')).slice(0,3);
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},locale:'ko-KR',serviceWorkers:'block'}),page=await context.newPage();
page.setDefaultTimeout(20000);
const username=`qa-cost-${Date.now().toString(36)}`,password=randomBytes(30).toString('base64url');
const result={signup:false,optionalSetup:false,recipientSaved:false,reload:false,comparison:false,deleted:false};
let accountCreated=false;
try{
 await page.goto(site+'/care-account.html?view=signup&return=care-compare.html',{waitUntil:'domcontentloaded'});
 await page.locator('[name=username]').fill(username);await page.locator('[name=password]').fill(password);await page.locator('[name=terms]').check();
 const signupResponse=page.waitForResponse(r=>r.url()===apiOrigin+'/api/auth/signup'&&r.request().method()==='POST');
 await page.getByRole('button',{name:'계정 만들기',exact:true}).click();assert.equal((await signupResponse).status(),201);accountCreated=true;result.signup=true;
 const next=page.getByRole('link',{name:'보관했어요 · 계속하기'});await next.waitFor();assert.ok((await next.getAttribute('href')).includes('view=care-setup'));await next.click();
 await page.getByRole('link',{name:'지금은 건너뛰고 시작하기'}).waitFor();result.optionalSetup=true;
 const guardian=page.locator('#profileForm');await guardian.locator('[name=name]').fill('비용 기능 검증용 가상 보호자');await guardian.locator('[name=phone]').fill('01000000000');
 await guardian.locator('[name=province]').fill('서울특별시');await guardian.locator('[name=city]').fill('마포구');await guardian.getByRole('button').click();
 await page.waitForFunction(()=>document.querySelector('#careRecipient')?.textContent.includes('비용 기능 검증용 가상 보호자'));
 const form=page.locator('#careRecipientForm');await form.locator('[name=relationship]').selectOption('self');await form.locator('[name=grade]').selectOption('3');await form.locator('[name=burden]').selectOption('reduced60');await form.locator('[name=authority]').selectOption('self');await form.locator('[name=healthConsent]').check();
 const saved=page.waitForResponse(r=>r.url()===apiOrigin+'/api/me/care-recipient'&&r.request().method()==='PUT');
 await form.getByRole('button',{name:'대상자 정보 저장',exact:true}).click();assert.equal((await saved).status(),200);
 await page.waitForFunction(()=>document.querySelector('#careRecipientForm [role=status]')?.textContent.includes('저장했습니다'));result.recipientSaved=true;
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#careRecipientForm [name=grade]')?.value==='3');assert.equal(await page.locator('#careRecipientForm [name=burden]').inputValue(),'reduced60');result.reload=true;
 await page.evaluate(async rows=>{
  const {currentSession}=await import('./care-member-api.mjs');sessionStorage.setItem('careWorkspaceOwner',currentSession().user.id);
  sessionStorage.setItem('careCompare:v1:daycare',JSON.stringify(rows.map(r=>String(r.i))));sessionStorage.setItem('careCompareActive:v1:daycare',JSON.stringify(rows.map(r=>String(r.i))));
 },rows);
 await page.goto(site+'/care-compare.html?type=daycare',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('.care-compare-cost [name=grade]')?.value==='3');
 assert.equal(await page.locator('.care-compare-cost [name=burden]').inputValue(),'reduced60');
 assert.match(await page.locator('[data-cost-index="0"]').innerText(),/78,725원/);result.comparison=true;
 // 인증·복구코드·보호자 연락처가 없는 비교 화면만 남깁니다.
 await page.screenshot({path:out+'/live-comparison.png',fullPage:true});
}catch{
 // 브라우저 오류의 요청 URL·응답 본문·비밀번호 값을 로그로 출력하지 않습니다.
 result.failedStage=Object.entries(result).find(([key,value])=>key!=='deleted'&&!value)?.[0]||'verification';process.exitCode=1;
}finally{
 if(accountCreated){
  try{result.deleted=await page.evaluate(async()=>{const {api,refreshSession}=await import('./care-member-api.mjs');await refreshSession();await api('/api/me/account',{method:'DELETE',body:{confirm:'회원 탈퇴'}});return true;});}catch{result.deleted=false;process.exitCode=1;}
 }
 await context.close();await browser.close();await writeFile(out+'/live-account-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
/** SOFTM-PERSONAL-COST END */
