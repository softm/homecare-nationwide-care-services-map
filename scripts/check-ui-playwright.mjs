/** SOFTM-LAYOUT-AUDIT START 날짜:20261121 : 사용자 Chrome과 실제 회원자료를 건드리지 않고 Playwright로 모든 화면 유형을 점검 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const mode=process.env.AUDIT_MODE||'checkout';
assert.ok(['live','checkout'].includes(mode),'AUDIT_MODE must be live or checkout');
const out=resolve(process.env.AUDIT_OUTPUT||resolve(tmpdir(),`homecare-ui-${Date.now()}`),process.env.AUDIT_LABEL||mode);
const site=process.env.AUDIT_SITE||'https://homecare.designboard.net';
const rows=JSON.parse(gunzipSync(await readFile(root+'/data/care/daycare.json.gz'))).slice(0,3);
const record={key:`daycare:${rows[0].i}`,type:'daycare',institutionId:rows[0].i,name:rows[0].n,address:rows[0].a,phone:'',status:'scheduled',visitAt:'2026-11-25T14:00',updatedAt:1795212000000,questions:[{id:'q:1',text:'현재 이용 가능한 자리와 대기기간은 어떻게 되나요?',answer:'화면 검증용 예시 답변입니다.',checked:true},{id:'q:2',text:'추가 비용과 식사비는 얼마인가요?',answer:'',checked:false}],notes:'화면 검증용 예시 메모',checklist:[{id:'space',text:'생활공간·이동 동선 확인',checked:false},{id:'staff',text:'담당 인력과 응급 대응 확인',checked:true}]};
const registration={id:'layout-registration',institution_type:'daycare',institution_name:'화면 검증용 주간보호센터',institution_id:'manual:layout-institution',source:'manual',address:'화면 검증용 주소 · 실제 기관 아님',business_number:'0000000000',representative:'검증용 대표자',contact_name:'검증용 담당자',contact_phone:'01000000000',contact_email:'layout@example.invalid',status:'pending',revision:1,hasDocument:true,document_name:'화면 검증용.pdf',review_reason:''};
const agreement={status:'accepted',version:'homecare-pilot-20261118-v1',confirmations:{freePilot:true,noPayment:true,contentAuthority:true}};
const institution={id:'manual:layout-institution',name:'화면 검증용 주간보호센터',status:'draft',contentRevision:1,profile:{displayName:'화면 검증용 주간보호센터',summary:'직접 등록한 운영 정보와 사진을 확인하는 검증용 자료입니다.',phone:'01000000000',email:'layout@example.invalid',website:'',address:'화면 검증용 주소 · 실제 기관 아님',operatingHours:{note:'평일 09:00–18:00'},transportation:'기관에 문의해 주세요.',capacity:30,availableSlots:2},programs:[{id:'p1',title:'인지 활동',schedule:'주 3회',description:'화면 검증용 프로그램',active:true}],photos:[{id:'photo-layout',altText:'화면 검증용 사진',caption:'검증용 이미지',isCover:true,published:true,previewPath:'/api/institutions/manual%3Alayout-institution/photos/photo-layout/content'}],pilotAgreement:agreement};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=','base64');
const cases=[
 {name:'signup-personal',url:'care-account.html?view=signup'},
 {name:'signup-institution',url:'care-account.html?view=signup&kind=institution'},
 {name:'login',url:'care-account.html'},
 {name:'password-recovery',url:'care-account.html?view=recover'},
 {name:'my-account',url:'care-account.html',user:'personal'},
 {name:'my-institution-account',url:'care-account.html',user:'institution'},
 {name:'social-completion',url:'care-account.html?view=complete',user:'social'},
 {name:'account-delete-dialog',url:'care-account.html',user:'personal',action:'delete-dialog'},
 {name:'account-storage-dialog',url:'care-account.html',user:'personal',action:'storage-dialog'},
 {name:'institution-join-anonymous',url:'institution-signup.html'},
 {name:'institution-join-form',url:'institution-signup.html',user:'institution-pending'},
 {name:'institution-join-pending',url:'institution-signup.html',user:'institution-pending',registration:'pending'},
 {name:'institution-join-approved',url:'institution-signup.html',user:'institution',registration:'approved'},
 {name:'institution-join-correction',url:'institution-signup.html',user:'institution-pending',registration:'needs_info',action:'edit-registration'},
 {name:'institution-review',url:'institution-review.html',user:'admin'},
 {name:'institution-review-unauthorized',url:'institution-review.html'},
 {name:'institution-portal-anonymous',url:'institution-portal.html'},
 {name:'institution-agreement',url:'institution-portal.html',user:'institution',agreement:false},
 {name:'institution-profile',url:'institution-portal.html',user:'institution'},
 {name:'institution-photos',url:'institution-portal.html',user:'institution',action:'photos'},
 {name:'institution-statistics',url:'institution-portal.html',user:'institution',action:'stats'},
 {name:'saved-empty',url:'care-saved.html'},
 {name:'saved-filled',url:'care-saved.html',seed:true},
 {name:'comparison',url:'care-compare.html',seed:true},
 {name:'facility',url:`care-facility.html?type=daycare&id=${rows[0].i}`},
 {name:'records-empty',url:'care-records.html'},
 {name:'records-filled',url:'care-records.html',seed:true,user:'personal'},
 {name:'record-detail',url:`care-record.html?key=${encodeURIComponent(record.key)}`,seed:true,user:'personal'},
 {name:'share-dialog',url:`care-record.html?key=${encodeURIComponent(record.key)}`,seed:true,user:'personal',action:'share-dialog'},
 {name:'share-management',url:'care-share.html?manage=1',seed:true,user:'personal'},
 {name:'shared-record',url:'care-share.html#layout-fixture',seed:true,user:'personal'},
 {name:'analysis',url:'care-analysis.html'},
 ...['candidates','compare','prepare'].map(action=>({name:`analysis-${action}`,url:'care-analysis.html',action:`analysis-${action}`})),
 ...['service-guide','about','care-cost','care-photos','data-status','privacy','terms','advertise','partner-profile-sample'].map(name=>({name,url:name+'.html'})),
 ...['daycare','nursing-home','nursing-hospital','home-care','home-nursing','home-bath','short-stay-care','welfare-equipment','dementia-care'].map(name=>({name:name+'-landing',url:name+'-map.html'})),
 {name:'auth-callback-error',url:'auth-callback.html'},
 {name:'legacy-map-redirect',url:'nationwide-care-services-map.html'},
 {name:'legacy-daycare-redirect',url:'nationwide-daycare-map.html'},
 {name:'legacy-gwangmyeong',url:'gwangmyeong-daycare-center-map.html'},
 {name:'region-province',url:'regions/gyeonggi-daycare.html'},
 {name:'region-city',url:'regions/seoul-마포구-daycare.html'},
 {name:'map-picker',url:'index.html'},
 {name:'map-daycare',url:'index.html?type=daycare'},
 {name:'map-facility',url:'index.html?type=facility'},
 {name:'map-hospital',url:'index.html?type=nursing-hospital'},
 ...['menu','types','filter','advanced','match-1','match-2','match-3','saved','compare','detail','list','full'].map(action=>({name:`map-${action}`,url:'index.html?type=daycare',action:`map-${action}`,seed:['saved','compare'].includes(action)})),
 {name:'installation-guide',url:'care-account.html',action:'install'},
];
let selected=cases.filter(c=>!process.env.AUDIT_FILTER||new RegExp(process.env.AUDIT_FILTER).test(c.name));
const widths=(process.env.AUDIT_WIDTHS||'320,390,768,1024,1440').split(',').map(Number);
const mime={'.html':'text/html;charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.gz':'application/gzip','.webmanifest':'application/manifest+json'};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
async function run(c,width){
 const context=await browser.newContext({viewport:{width,height:width<600?844:960},locale:'ko-KR',serviceWorkers:'block',geolocation:{latitude:37.5663,longitude:126.9018},permissions:['geolocation'],reducedMotion:'reduce'});
 const page=await context.newPage();page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(String(e.message).slice(0,240)));
 await context.addInitScript(({seed,rows,record,user})=>{
  localStorage.setItem('hannun-pwa-install-dismissed','1');
  if(seed){sessionStorage.setItem('careCompare:v1:daycare',JSON.stringify(rows.map(r=>String(r.i))));sessionStorage.setItem('careCompareActive:v1:daycare',JSON.stringify(rows.map(r=>String(r.i))));sessionStorage.setItem('careMemberRecords:v1',JSON.stringify([record]));}
  if(user)sessionStorage.setItem('careWorkspaceOwner','layout-user');
 },{seed:c.seed,rows,record,user:c.user});
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.hostname==='api.homecare.designboard.net'){
   // 가상 응답은 레이아웃 전용이며 실제 서버 가입·심사·쓰기 요청을 만들지 않는다.
   const headers={'Access-Control-Allow-Origin':site,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type,X-CSRF-Token,If-Match','Content-Type':'application/json'};
   const send=(data,status=200)=>route.fulfill({status,headers,body:JSON.stringify(status>=400?{error:{code:'layout_denied',message:'화면 검증용 로그인 안내'}}:{data})});
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(!c.user)return send(null,401);
   const inst=c.user.startsWith('institution');
   if(u.pathname==='/api/auth/session')return send({user:{id:'layout-user',username:c.user==='social'?null:'layout_user',kind:inst?'institution':'personal',onboarding:['institution-pending','social'].includes(c.user)?'pending':'complete',name:'화면 검증용 회원',phone:'01000000000',province:'서울특별시',city:'마포구',notifications:true},csrf:'layout-only-not-a-token',isAdmin:c.user==='admin'});
   if(u.pathname==='/api/me/care-recipient')return send({profile:null,revision:0,guardian:{userId:'layout-user',name:'화면 검증용 보호자',phone:'01000000000'}});
   if(u.pathname==='/api/me/workspace')return send({workspace:null,revision:0});
   if(u.pathname==='/api/registrations')return send(c.registration?[{...registration,status:c.registration}]:[]);
   if(u.pathname==='/api/admin/registrations')return send([registration]);
   if(u.pathname==='/api/me/shares')return send([{id:'layout-share',created_at:1795212000,expires_at:1795816800,viewed_at:null}]);
   if(u.pathname==='/api/shared')return send({title:'가족 공유 화면 검증',expiresAt:1795816800,records:[record]});
   const item={...institution,pilotAgreement:c.agreement===false?{...agreement,status:'not_accepted'}:agreement};
   if(u.pathname==='/api/institutions/me')return send({institutions:[{...item,role:'owner',membership:{role:'owner',status:'approved'}}],pendingClaims:[]});
   if(u.pathname.endsWith('/content'))return route.fulfill({status:200,contentType:'image/png',body:png});
   if(u.pathname.endsWith('/stats'))return send({range:{from:'2026-11-01',to:'2026-11-21'},totals:{detail_view:12,phone_click:3,inquiry_click:2,directions_click:4},daily:[]});
   if(u.pathname.startsWith('/api/institutions/'))return send(item);
   return send(null,404);
  }
  if(!['GET','HEAD','OPTIONS'].includes(req.method()))return route.abort();
  if(mode==='checkout'&&u.origin===site){
   const path=resolve(root,decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname).slice(1));
   if(!path.startsWith(root+'/'))return route.abort();
   try{if((await stat(path)).isFile())return route.fulfill({path,contentType:mime[extname(path)]||'application/octet-stream'});}catch{}
   return route.fulfill({status:404,body:'Missing local resource'});
  }
  return route.continue();
 });
 const result={name:c.name,width,mode,fixture:Boolean(c.user||c.seed),url:c.url.split('#')[0]};
 try{
  const response=await page.goto(site+'/'+c.url,{waitUntil:'domcontentloaded',timeout:30000});result.http=response?.status();
  await page.locator('#hcStartup,#hannunStartup').waitFor({state:'detached',timeout:18000}).catch(()=>{});
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(c.name.startsWith('map-')?4500:500);
  if(await page.locator('#welcomeAdDialog[open]').count())await page.locator('#welcomeAdClose').click();
  if(c.name.startsWith('signup-')){
   const initial=c.name==='signup-institution'?'institution':'personal';
   assert.equal(await page.locator('[name=kind]:checked').inputValue(),initial);
   await page.locator('label.hc-member-choice').filter({has:page.locator('[value=institution]')}).click();
   assert.equal(await page.locator('[name=kind]:checked').inputValue(),'institution','기관회원 카드 클릭');
   await page.locator('[name=kind][value=institution]').press('ArrowLeft');
   assert.equal(await page.locator('[name=kind]:checked').inputValue(),'personal','키보드로 일반회원 선택');
   await page.locator(`[name=kind][value=${initial}]`).check();
  }
  if(c.action==='delete-dialog')await page.locator('[data-delete=account]').click();
  if(c.action==='storage-dialog')await page.locator('[data-storage-open]').first().click();
  if(c.action==='edit-registration')await page.locator('[data-edit]').click();
  if(c.action==='photos')await page.locator('#photosTab').click();
  if(c.action==='stats')await page.locator('#statsTab').click();
  if(c.action==='share-dialog')await page.locator('#shareRecord').click();
  if(c.action==='install')await page.locator('.hannun-pwa-install').click();
  if(c.action?.startsWith('map-')){
   const more=page.locator('[data-mobile-focus=more]');
   const openMenu=async()=>{if(await more.isVisible())await more.click();else await page.locator('.care-menu-trigger').click();};
   if(c.action==='map-menu')await openMenu();
   if(c.action==='map-types'){
    const mobile=page.locator('[data-mobile-focus=type]');
    await (await mobile.isVisible()?mobile:page.locator('.care-type-toggle')).click();
   }
   if(['map-filter','map-advanced'].includes(c.action)){
    const mobile=page.locator('[data-mobile-focus=filter]');
    await (await mobile.isVisible()?mobile:page.locator('.care-mobile-filter-toggle')).click();
    if(c.action==='map-advanced'){
     await page.locator('.care-extra-filters>summary').click();
     const choice=page.locator('.advanced-option input').first();
     await choice.check();assert.equal(await choice.isChecked(),true,'상세조건 선택');
    }
   }
   if(c.action.startsWith('map-match-')){
    await openMenu();await page.locator('[data-menu-target=".care-match-start"]').click();
    if(c.action!=='map-match-1')await page.locator('[data-match-next]').click();
    if(c.action==='map-match-3'){
     await page.locator('#careMatchProvince').selectOption({label:'서울특별시'});
     await page.locator('[data-match-next]').click();
    }
   }
   if(['map-saved','map-compare'].includes(c.action)){
    const mobile=page.locator('[data-mobile-focus=saved]');
    await (await mobile.isVisible()?mobile:page.locator('#careSavedTab')).click();
    if(c.action==='map-compare')await page.locator('#careSavedPanel [data-basket-open]').click();
   }
   if(c.action==='map-detail'){
    const list=page.locator('[data-mobile-focus=list]');
    if(await list.isVisible())await list.click();
    await page.locator('#list [data-saved-detail]').first().click();
    await page.locator('#detailSheet').waitFor({state:'visible',timeout:15000});
    await page.locator('#detailSheet .care-detail-toolbar button').last().click({trial:true});
    for(const button of await page.locator('#detailSheet .care-detail-footer button').all())if(await button.isVisible()&&await button.isEnabled())await button.click({trial:true});
   }
   if(c.action==='map-list'){
    if(await page.locator('[data-mobile-focus=search]').isVisible()){await page.locator('[data-mobile-focus=search]').click();await page.locator('[data-mobile-focus=exit]').click();}
    await page.locator('.care-mode-toggle [data-care-mode-choice=list]').click();
   }
   if(c.action==='map-full'){
    const mobile=page.locator('[data-mobile-focus=fullscreen]');
    await (await mobile.isVisible()?mobile:page.locator('.care-focus-entry')).click();
   }
  }
  if(c.action?.startsWith('analysis-')){
   await page.locator('#analysisAddress').waitFor();
   await page.waitForFunction(()=>document.querySelector('#analysisAddress').value.length>0,{},{timeout:20000});
   await page.locator('#analysisRun').click();
   await page.locator('[data-analysis-save]').first().waitFor({timeout:45000});
   if(c.action!=='analysis-candidates'){
    const buttons=page.locator('[data-analysis-save]');
    await buttons.nth(0).click();await buttons.nth(1).click();
    await page.locator('#analysisCompareTray [data-analysis-go=compare]').click();
    if(c.action==='analysis-prepare')await page.locator('[data-analysis-panel=compare] [data-analysis-go=prepare]').click();
   }
  }
  await page.waitForTimeout(150);
  await page.evaluate(()=>{document.activeElement?.blur();scrollTo({top:0,behavior:'instant'});});
  result.metrics=await page.evaluate(()=>{
   const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&e.checkVisibility({checkVisibilityCSS:true,checkOpacity:true});};
   const name=e=>e.id?'#'+e.id:e.tagName.toLowerCase()+'.'+String(e.className).split(' ').slice(0,2).join('.');
   const over=[...document.querySelectorAll('main *,form *,header *,nav *,footer *')].filter(visible).filter(e=>{let a=e.parentElement;while(a){if(['auto','scroll','hidden','clip'].includes(getComputedStyle(a).overflowX))return false;a=a.parentElement;}const r=e.getBoundingClientRect();return r.right>innerWidth+2||r.left< -2;}).slice(0,14).map(e=>({el:name(e),width:Math.round(e.getBoundingClientRect().width),right:Math.round(e.getBoundingClientRect().right)}));
   const checks=[...document.querySelectorAll('input[type=checkbox],input[type=radio]')].filter(visible).map(e=>{const r=e.getBoundingClientRect();return {type:e.type,name:e.name,width:Math.round(r.width),height:Math.round(r.height)};});
   const nav=document.querySelector('.hc-nav'),brand=document.querySelector('.hc-brand,.stitch-brand'),account=document.querySelector('.hc-account-link');
   const overlap=(a,b)=>{if(!a||!b||!visible(a)||!visible(b))return false;const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return Math.min(x.right,y.right)-Math.max(x.left,y.left)>2&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>2;};
   const modal=[...document.querySelectorAll('dialog[open],#compareLayer:not([hidden]),.detail-sheet:not([hidden])')].find(visible);
   const blockedControls=modal?[]:[...document.querySelectorAll('.hc-nav a,.hc-account-link,#careSavedPanel [data-basket-open],#careSavedPanel [data-route-edit],.care-filter-panel-close')].filter(visible).filter(e=>{
    const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    if(x<0||x>innerWidth||y<0||y>innerHeight||e.disabled)return false;
    const hit=document.elementFromPoint(x,y);return hit&&!e.contains(hit);
   }).map(name);
   const install=document.querySelector('body.hc-page .hannun-pwa-install,body.analysis-page .hannun-pwa-install');
   return {scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,overflow:over,choices:checks,heading:document.querySelector('h1')?.textContent?.trim(),navigationOverlap:overlap(nav,brand)||overlap(nav,account)||overlap(nav,document.querySelector('.care-type-header')),blockedControls,installationInFlow:!install||getComputedStyle(install).position==='static',bodyTextLength:document.body.innerText.length,brokenImages:[...document.images].filter(e=>visible(e)&&e.complete&&e.naturalWidth===0).length};
  });
  result.errors=errors;
  result.issues=[];
  if(result.http!==200)result.issues.push('http');
  if(result.metrics.scrollWidth>width+2)result.issues.push('page-overflow');
  if(result.metrics.choices.some(c=>c.width>28||c.height>28))result.issues.push('oversized-choice');
  if(result.metrics.navigationOverlap)result.issues.push('navigation-overlap');
  if(result.metrics.blockedControls.length)result.issues.push('blocked-control');
  if(!result.metrics.installationInFlow)result.issues.push('floating-form-installation');
  if(errors.length)result.issues.push('page-error');
  if(result.metrics.bodyTextLength<60)result.issues.push('empty-page');
  if(result.metrics.brokenImages)result.issues.push('broken-image');
  if([390,1440].includes(width)||result.issues.length||process.env.AUDIT_SCREENSHOTS==='all'){result.screenshot=`${c.name}-${width}.png`;await page.screenshot({path:out+'/'+result.screenshot,fullPage:true,animations:'disabled',timeout:15000});}
 }catch(e){result.issues=['audit-error'];result.error=String(e.message).slice(0,1600);result.screenshot=`${c.name}-${width}-error.png`;await page.screenshot({path:out+'/'+result.screenshot,fullPage:true,timeout:15000}).catch(()=>{});}
 results.push(result);
 console.log(JSON.stringify({name:c.name,width,issues:result.issues,...(result.error?{error:result.error}:{})}));
 await context.close();
 await writeFile(out+'/report.json',JSON.stringify(results,null,2));
}
try{for(const width of widths)for(let i=0;i<selected.length;i+=2)await Promise.all(selected.slice(i,i+2).map(c=>run(c,width)));}
finally{await browser.close();}
console.log(JSON.stringify({report:out+'/report.json',cases:results.length,issues:results.filter(r=>r.issues.length).length}));
process.exitCode=results.some(r=>r.issues.length)?1:0;
/** SOFTM-LAYOUT-AUDIT END */
