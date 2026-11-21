/** SOFTM-LAYOUT-AUDIT START 날짜:20261121 : 사용자 Chrome과 실제 회원자료를 건드리지 않고 Playwright로 모든 화면 유형을 점검 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import {verifyPersonalCost} from './check-personal-cost-playwright.mjs'; // SOFTM-PERSONAL-COST 날짜:20261121 : 공통 비용 조작과 계정 전환 검사
import {verifyMarkerDetail} from './check-marker-detail-playwright.mjs'; // SOFTM-MARKER-DETAIL-SWITCH 날짜:20261121 : 실제 마커 연속 클릭으로 상세 전환 검사
import {verifyAnalysisBulk} from './check-analysis-bulk-playwright.mjs'; // SOFTM-BULK-CANDIDATES 날짜:20261122 : 일괄 담기·바로 비교를 실제 클릭과 상태 보존으로 검증
import {verifyDetailSpecialties} from './check-detail-specialties-playwright.mjs'; // SOFTM-DETAIL-SPECIALTIES 날짜:20261121 : 실제 공단 특화자료를 상세 기본 노출과 연결해 검사
import { verifySavedMarkers } from './check-saved-markers-playwright.mjs'; // SOFTM-SAVED-MARKER 날짜:20261121 : 공용 숨김 브라우저·쓰기 차단 조건에서 마커 담기 상태도 검증
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const mode=process.env.AUDIT_MODE||'checkout';
assert.ok(['live','checkout'].includes(mode),'AUDIT_MODE must be live or checkout');
const out=resolve(process.env.AUDIT_OUTPUT||resolve(tmpdir(),`homecare-ui-${Date.now()}`),process.env.AUDIT_LABEL||mode);
const site=process.env.AUDIT_SITE||'https://homecare.designboard.net';
const rows=JSON.parse(gunzipSync(await readFile(root+'/data/care/daycare.json.gz'))).slice(0,3);
const costRows=Object.fromEntries(['facility','home-care'].map(type=>[type,JSON.parse(gunzipSync(readFileSync(root+'/data/care/'+type+'.json.gz'))).find(row=>String(row.t).split(',').includes(type==='facility'?'A03':'B01'))])); // SOFTM-PERSONAL-COST 날짜:20261121 : 공식 일반 급여가 있는 시설·방문요양 입력 확인
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
 {name:'care-setup',url:'care-account.html?view=care-setup&return=care-compare.html',user:'personal'}, // SOFTM-PERSONAL-COST 날짜:20261121 : 가입 후 건너뛰기 가능한 등급 입력 화면
 ...['facility','home-care'].map(type=>({name:`cost-${type}`,url:`care-facility.html?type=${type}&id=${costRows[type].i}`,costType:type})),
 {name:'cost-profile',url:'care-compare.html',seed:true,user:'personal',recipient:true},
 {name:'comparison',url:'care-compare.html',seed:true},
 {name:'facility',url:`care-facility.html?type=daycare&id=${rows[0].i}`},
 {name:'records-empty',url:'care-records.html'},
 {name:'records-filled',url:'care-records.html',seed:true,user:'personal'},
 {name:'record-detail',url:`care-record.html?key=${encodeURIComponent(record.key)}`,seed:true,user:'personal'},
 {name:'share-dialog',url:`care-record.html?key=${encodeURIComponent(record.key)}`,seed:true,user:'personal',action:'share-dialog'},
 {name:'share-management',url:'care-share.html?manage=1',seed:true,user:'personal'},
 {name:'shared-record',url:'care-share.html#layout-fixture',seed:true,user:'personal'},
 {name:'analysis',url:'care-analysis.html'},
 {name:'analysis-choices',url:'care-analysis.html',action:'condition-choices'}, // SOFTM-ANALYSIS-GUIDE 날짜:20261121 : 실제 유형 카드·조건 펼침·키보드·재방문 상태를 검증
 {name:'analysis-no-conditions',url:'care-analysis.html',action:'no-conditions'}, // SOFTM-EMPTY-CONDITIONS 날짜:20261121 : 빈 조건 확인과 취소·키보드 복귀를 실제 조작으로 검증
 {name:'analysis-bulk',url:'care-analysis.html',action:'bulk-candidates',bulkFixtures:true}, // SOFTM-BULK-CANDIDATES 날짜:20261122 : 최신 정보 필터 가상 응답과 공개 검색 결과로 0·1·2·다수 후보 검증
 ...['candidates','compare','prepare'].map(action=>({name:`analysis-${action}`,url:'care-analysis.html',action:`analysis-${action}`})),
 ...['facility','home-care','home-nursing','home-bath','short-stay','welfare-equipment','dementia','nursing-hospital'].map(type=>({name:`analysis-candidates-${type}`,url:'care-analysis.html',action:'analysis-candidates',type})), // SOFTM-CANDIDATE-FACTS 날짜:20261121 : 유형마다 다른 정원·인력·비용·병원 지표를 실제 화면에서 확인
 {name:'analysis-candidates-conditions',url:'care-analysis.html',action:'analysis-candidates',preferences:['evaluation-ab','photos']}, // SOFTM-CANDIDATE-FACTS 날짜:20261121 : 선택 조건의 확인·다름·미확인 표기와 펼친 질문을 확인
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
 ...['daycare','facility','nursing-hospital'].map(type=>({name:`map-detail-switch-${type}`,url:`index.html?type=${type}&lat=37.5663&lng=126.9018&z=14`,action:'map-detail-switch'})),
 ...['daycare','facility','nursing-hospital'].map(type=>({name:`map-saved-markers-${type}`,url:`index.html?type=${type}&lat=37.5663&lng=126.9018&z=14`,action:'map-saved-markers'})), // SOFTM-SAVED-MARKER 날짜:20261121 : 공단 시설·재가·병원을 같은 공개 지도 위치와 담기 시나리오로 검증
 ...['menu','types','filter','advanced','match-1','match-2','match-3','saved','compare','detail','list','full'].map(action=>({name:`map-${action}`,url:'index.html?type=daycare',action:`map-${action}`,seed:['saved','compare'].includes(action)})),
 ...['facility','home-nursing','welfare-equipment','nursing-hospital'].map(type=>({name:`map-detail-${type}`,url:`index.html?type=${type}`,action:'map-detail'})), // SOFTM-DETAIL-ESSENTIALS 날짜:20261121 : 유형별 실제 상세에서 핵심 정보·접힌 질문과 출처를 검증
 /** SOFTM-DETAIL-SPECIALTIES START 날짜:20261121 : 실제 특화 2·4개와 미등재·자료 실패·병원 사례를 검증 */
 {name:'map-specialties-two',url:'index.html?type=daycare&institution=21141000342',institution:'21141000342',action:'map-detail',specialties:['치매전담형 장기요양기관','인지활동형 프로그램 제공기관']},
 {name:'map-specialties-multiple',url:'index.html?type=daycare&institution=21168000177',institution:'21168000177',action:'map-detail',specialties:['치매전담형 장기요양기관','인지활동형 프로그램 제공기관','통합재가서비스','주야간보호기관 내 단기보호 시범사업']},
 {name:'map-specialties-none',url:'index.html?type=daycare&institution=21144000257',institution:'21144000257',action:'map-detail',specialties:[]},
 {name:'map-specialties-unavailable',url:'index.html?type=daycare&institution=21141000342',institution:'21141000342',action:'map-detail',specialties:[],featureError:true},
 {name:'map-specialties-hospital',url:'index.html?type=nursing-hospital',action:'map-detail',specialties:[]},
 /** SOFTM-DETAIL-SPECIALTIES END */
 {name:'installation-guide',url:'care-account.html',action:'install'},
];
let selected=cases.filter(c=>!process.env.AUDIT_FILTER||new RegExp(process.env.AUDIT_FILTER).test(c.name));
const widths=(process.env.AUDIT_WIDTHS||'320,390,768,1024,1440').split(',').map(Number);
const mime={'.html':'text/html;charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.gz':'application/gzip','.webmanifest':'application/manifest+json'};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
async function run(c,width){
 const context=await browser.newContext({viewport:{width,height:width<600?844:960},locale:'ko-KR',serviceWorkers:'block',geolocation:c.type==='short-stay'?{latitude:37.536,longitude:127.067}:{latitude:37.5663,longitude:126.9018},permissions:['geolocation'],reducedMotion:'reduce'}); // SOFTM-CANDIDATE-FACTS 날짜:20261121 : 단기보호는 공개 기관이 있는 광진구에서 실제 카드 검증
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
   if(u.pathname==='/api/me/care-recipient')return send({profile:c.recipient?{relationship:'parent',sex:'female',mobility:'unspecified',careNeeds:[],grade:'3',burden:'reduced60',authority:'subject-consent'}:null,revision:c.recipient?1:0,guardian:{userId:'layout-user',name:'화면 검증용 보호자',phone:'01000000000'}});
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
  if(c.featureError&&u.origin===site&&u.pathname==='/data/nhis/search-index.json.gz')return route.fulfill({status:503,body:'Specialty data unavailable for UI verification'}); // SOFTM-DETAIL-SPECIALTIES 날짜:20261121 : 특화자료 실패도 기존 기관 상세는 정상 열림
  if(mode==='checkout'&&u.origin===site){
   const path=resolve(root,decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname).slice(1));
   if(!path.startsWith(root+'/'))return route.abort();
   try{if((await stat(path)).isFile())return route.fulfill({path,contentType:mime[extname(path)]||'application/octet-stream'});}catch{}
   return route.fulfill({status:404,body:'Missing local resource'});
  }
  return route.continue();
 });
 const result={name:c.name,width,mode,fixture:Boolean(c.user||c.seed||c.featureError||c.bulkFixtures),url:c.url.split('#')[0]}; // SOFTM-BULK-CANDIDATES 날짜:20261122 : 최신 이용정보 필터의 가상 응답도 검증 기록에서 구분
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
  if(c.action==='map-detail-switch')result.markerDetail=await verifyMarkerDetail(page,{out,name:c.name,width}); // SOFTM-MARKER-DETAIL-SWITCH 날짜:20261121 : 별도 숨김 브라우저에서 즉시 교체와 지도 유지 검증
  if(c.action==='delete-dialog')await page.locator('[data-delete=account]').click();
  if(c.action==='storage-dialog')await page.locator('[data-storage-open]').first().click();
  if(c.action==='edit-registration')await page.locator('[data-edit]').click();
  if(c.action==='photos')await page.locator('#photosTab').click();
  if(c.action==='stats')await page.locator('#statsTab').click();
  if(c.action==='share-dialog')await page.locator('#shareRecord').click();
  if(c.action==='install')await page.locator('.hannun-pwa-install').click();
  /** SOFTM-ANALYSIS-GUIDE START 날짜:20261121 : 실제 사용자 조작으로 선택과 다음 단계 안내가 연결되는지 확인 */
  if(c.name.startsWith('analysis')){
   assert.equal(await page.locator('#analysisTypeChoices input[type=radio]').count(),9,'9개 돌봄 유형 표시');
   assert.equal(await page.locator('.analysis-preferences').getAttribute('open'),'','조건 기본 펼침');
   assert.ok((await page.locator('.hc-brand-icon').getAttribute('src')).endsWith('dolbom-hannun-icon-20261007.png'),'지도와 같은 대표 아이콘');
   await page.locator('.analysis-recipient-button').first().click({trial:true});
  }
  if(c.action==='condition-choices'){
   await page.locator('[name=careTypeChoice][value=facility]').check();
   assert.equal(await page.locator('#analysisType').inputValue(),'facility');
   await page.locator('.analysis-preferences>summary').click();
   await page.locator('[name=careTypeChoice][value=home-nursing]').check();
   assert.ok(await page.locator('.analysis-preferences').evaluate(e=>e.open),'유형 변경 시 조건 펼침');
   await page.locator('[name=careTypeChoice][value=nursing-hospital]').check();
   assert.equal(await page.locator('#analysisCriteria input').count(),0,'의료기관에 돌봄기관 조건 미적용');
   assert.match(await page.locator('#analysisPreferencesHelp').innerText(),/요양병원/);
   await page.locator('[name=careTypeChoice]:checked').press('ArrowRight');
   assert.equal(await page.locator('#analysisType').inputValue(),'daycare','키보드 유형 선택');
   const choice=page.locator('#analysisCriteria input').first();await choice.check();
   const label=await choice.locator('..').innerText();
   assert.ok((await page.locator('#analysisSummaryCriteria').innerText()).includes(label),'선택 조건 요약 연결');
   await page.reload({waitUntil:'domcontentloaded'});await page.locator('#analysisTypeChoices input:checked').waitFor();
   assert.equal(await page.locator('#analysisCriteria input:checked').count(),1,'재방문 조건 복원');
   assert.equal(await page.locator('#analysisPreferenceCount').innerText(),'1개 선택','복원한 선택 개수');
  }
  /** SOFTM-ANALYSIS-GUIDE END */
  if(c.action?.startsWith('map-')){
   if(c.action==='map-saved-markers')result.savedMarkers=await verifySavedMarkers(page,{out,name:c.name,width}); // SOFTM-SAVED-MARKER 날짜:20261121 : 담기·해제·복원·배율에 따른 실제 표시와 기존 선택 보존 확인
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
    /** SOFTM-DETAIL-SPECIALTIES START 날짜:20261121 : 기관 공유 링크는 실제 자동 상세를 기다리고 일반 진입은 목록에서 열기 */
    if(!c.institution){
     const list=page.locator('[data-mobile-focus=list]');
     if(await list.isVisible())await list.click();
     await page.locator('#list [data-saved-detail]').first().click();
    }
    /** SOFTM-DETAIL-SPECIALTIES END */
    await page.locator('#detailSheet').waitFor({state:'visible',timeout:15000});
    /** SOFTM-DETAIL-ESSENTIALS START 날짜:20261121 : 상담 질문을 마우스·키보드로 펼쳐도 실제 정보와 상세 조작을 유지 */
    const review=page.locator('#detailDecision'),questions=review.locator('.care-review-questions'),questionToggle=questions.locator('summary');
    await page.waitForFunction(()=>getComputedStyle(document.getElementById('detailSheet')).visibility!=='hidden');
    if(c.specialties)result.specialties=await verifyDetailSpecialties(page,{expected:c.specialties,out,name:c.name,width}); // SOFTM-DETAIL-SPECIALTIES 날짜:20261121 : 펼치기 전 전체 특화 노출과 이용 안내 확인
    assert.equal(await questions.evaluate(e=>e.open),false,'상담 질문 기본 접힘');
    assert.doesNotMatch(await review.innerText(),/확인된 강점|3가지|미확인 항목 없음/,'중복·빈 상태 문구 제거');
    assert.ok(await review.locator('.care-review-source').isVisible(),'자료 출처·기준일 유지');
    await questionToggle.click();assert.equal(await questions.evaluate(e=>e.open),true,'상담 질문 펼침');
    const questionCount=await questions.locator('li').count();assert.ok(questionCount>=3);
    assert.match(await questionToggle.innerText(),new RegExp(`${questionCount}개 항목`),'실제 항목 수 표시');
    for(const item of await questions.locator('li').all())assert.ok(await item.isVisible(),'유형별 상담 질문 유지');
    assert.ok(await questions.locator('.care-review-note').isVisible(),'자료 해석 안내 유지');
    await questions.screenshot({path:`${out}/${c.name}-${width}-questions.png`,animations:'disabled'});
    await questionToggle.focus();await page.keyboard.press('Enter');assert.equal(await questions.evaluate(e=>e.open),false,'키보드로 질문 접기');
    await review.screenshot({path:`${out}/${c.name}-${width}-summary.png`,animations:'disabled'});
    /** SOFTM-DETAIL-ESSENTIALS END */
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
  /** SOFTM-EMPTY-CONDITIONS START 날짜:20261121 : 검색 전 확인에서 취소하거나 반복해서 열어도 입력과 단계가 유지되는지 확인 */
  if(c.action==='no-conditions'){
   const address=page.locator('#analysisAddress'),dialog=page.locator('#analysisNoConditions'),run=page.locator('#analysisRun');
   assert.equal(await dialog.locator('[value=search]').textContent(),'찾기'); // SOFTM-SEARCH-LABEL 날짜:20261122 : 요청한 찾기 버튼 문구 확인
   await page.waitForFunction(()=>document.querySelector('#analysisAddress').value.length>0,{},{timeout:20000});
   const value=await address.inputValue();
   await page.locator('.analysis-preferences>summary').click();
   await run.click();await dialog.waitFor({state:'visible'});
   assert.equal(await page.locator('body').getAttribute('data-analysis-step'),'conditions','확인 전 단계 유지');
   assert.ok(await page.locator('#analysisResults').isHidden(),'확인 전 검색 미실행');
   assert.equal(await page.evaluate(()=>document.activeElement?.value),'edit','조건 선택 버튼 기본 초점');
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
   await page.waitForFunction(()=>document.querySelector('.analysis-preferences').open&&document.activeElement===document.querySelector('#analysisCriteria input'));
   assert.ok(await page.locator('.analysis-preferences').evaluate(e=>e.open),'Esc 뒤 조건 펼침');
   assert.ok(await page.evaluate(()=>document.activeElement===document.querySelector('#analysisCriteria input')),'Esc 뒤 조건 초점');
   assert.ok(await page.locator('#analysisResults').isHidden(),'Esc 뒤 검색 미실행');
   await run.click();await dialog.waitFor({state:'visible'});
   await dialog.locator('[value=edit]').click();await dialog.waitFor({state:'hidden'});
   await page.waitForFunction(()=>document.activeElement===document.querySelector('#analysisCriteria input'));
   assert.equal(await address.inputValue(),value,'조건 선택 복귀 시 주소 보존');
   assert.ok(await page.locator('#analysisResults').isHidden(),'조건 선택 복귀 시 검색 미실행');
   await address.focus();await address.press('Enter');await dialog.waitFor({state:'visible'});
   assert.equal(await page.locator('#analysisCriteria input:checked').count(),0,'임의 조건 선택 없음');
   await dialog.locator('[value=search]').click({trial:true});
   await dialog.screenshot({path:out+`/${c.name}-${width}-dialog.png`,animations:'disabled'});
  }
  /** SOFTM-EMPTY-CONDITIONS END */
  if(c.action==='bulk-candidates')result.bulk=await verifyAnalysisBulk(page,{out,width}); // SOFTM-BULK-CANDIDATES 날짜:20261122 : 입력 화면 검사 뒤 회원·기관 자료 쓰기 없이 일괄 동작 검사
  if(c.action?.startsWith('analysis-')){
   await page.locator('#analysisAddress').waitFor();
   await page.waitForFunction(()=>document.querySelector('#analysisAddress').value.length>0,{},{timeout:20000});
   if(c.type)await page.locator(`[name=careTypeChoice][value="${c.type}"]`).check(); // SOFTM-CANDIDATE-FACTS 날짜:20261121 : 실제 라디오 선택과 검색 결과를 연결
   for(const criterion of c.preferences||[])await page.locator(`#analysisCriteria input[value="${criterion}"]`).check(); // SOFTM-CANDIDATE-FACTS 날짜:20261121 : 조건을 실제로 선택한 뒤 후보 표시를 검증
   await page.locator('#analysisRun').click();
   /** SOFTM-EMPTY-CONDITIONS START 날짜:20261121 : 빈 조건은 명시적인 진행 선택 뒤 검색하고 조건 선택·의료기관 검색은 바로 진행 */
   const confirmation=page.locator('#analysisNoConditions');
   if(!c.preferences?.length&&c.type!=='nursing-hospital'){
    await confirmation.waitFor({state:'visible'});
    assert.ok(await page.locator('#analysisResults').isHidden(),'찾기 선택 전 검색 미실행'); // SOFTM-SEARCH-LABEL 날짜:20261122 : 변경된 실행 문구로 검증 안내 일치
    await confirmation.locator('[value=search]').click();
   }else assert.ok(await confirmation.isHidden(),'선택한 조건 또는 조건 없는 유형은 바로 검색');
   /** SOFTM-EMPTY-CONDITIONS END */
   await page.locator('[data-analysis-save]').first().waitFor({timeout:45000});
   /** SOFTM-CANDIDATE-FACTS START 날짜:20261121 : 공용 목록 값과 실제 표시·글자 크기·질문 펼침·담기 해제가 일치하는지 확인 */
   const card=page.locator('.analysis-card').first();
   result.candidateFacts=await page.evaluate(async type=>{
    const cards=[...document.querySelectorAll('.analysis-card')], rows=await CareData.category(type);
    return cards.slice(0,3).map(card=>{
     const row=rows.find(row=>String(row.i)===card.dataset.institutionId),expected=CareDecisionSummary.summary(row,type).cells;
     const cells=[...card.querySelectorAll('.analysis-key-facts>div')].map(cell=>({label:cell.querySelector('dt').textContent,value:cell.querySelector('dd').textContent,detail:cell.querySelector('small').textContent}));
     const cost=CareCostPreview.build(type,row);
     return {id:row.i,cells,expected,cost:cost?.amount||null,costText:card.querySelector('.analysis-candidate-cost').textContent,headingSize:parseFloat(getComputedStyle(card.querySelector('h3')).fontSize),valueSize:parseFloat(getComputedStyle(card.querySelector('dd')).fontSize),addressSize:parseFloat(getComputedStyle(card.querySelector('.analysis-card-address')).fontSize)};
    });
   },c.type||'daycare');
   for(const card of result.candidateFacts){
    assert.equal(card.cells[0].label,'기준지 거리');
    for(const expected of card.expected){const actual=card.cells.find(cell=>cell.label===expected.label);assert.equal(actual?.value,expected.value,expected.label+' 공용 목록 수치');if(expected.detail)assert.equal(actual.detail,expected.detail);}
    assert.ok(card.headingSize>=22&&card.valueSize>=24&&card.addressSize>=16,'이름·지표·주소 최소 가독성');
    if(card.cost){assert.ok(card.costText.includes(card.cost),'목록과 같은 비용 계산');assert.match(card.costText,/공통 조건 예시/);assert.match(card.costText,/비급여 별도/);}
    else assert.match(card.costText,/기관 확인 필요/);
    if(c.type==='nursing-hospital')assert.ok(!card.cells.some(cell=>/공단 평가|정원|요양보호사/.test(cell.label)),'병원에 장기요양 지표 미적용');
   }
   const questions=card.locator('.analysis-card-questions');
   await questions.locator('summary').click();assert.ok(await questions.evaluate(e=>e.open),'질문 펼침');assert.ok(await questions.locator('li').count()>0);
   await questions.locator('summary').click();assert.ok(!await questions.evaluate(e=>e.open),'질문 접기');
   const save=card.locator('[data-analysis-save]');
   await save.click();assert.equal(await save.getAttribute('aria-pressed'),'true');assert.ok(await card.evaluate(e=>e.classList.contains('is-saved')),'담은 카드 구분');
   await save.click();assert.equal(await save.getAttribute('aria-pressed'),'false');assert.ok(!await card.evaluate(e=>e.classList.contains('is-saved')),'담기 해제');
   if(c.preferences){assert.equal(await card.locator('.analysis-condition-matches li').count(),c.preferences.length,'선택 조건별 상태');await questions.locator('summary').click();}
   await card.screenshot({path:out+`/${c.name}-${width}-card.png`,animations:'disabled',style:'#analysisCompareTray,.hc-header,.hc-nav{visibility:hidden}'});
   /** SOFTM-CANDIDATE-FACTS END */
   if(c.action!=='analysis-candidates'){
    const buttons=page.locator('[data-analysis-save]');
    await buttons.nth(0).click();await buttons.nth(1).click();
    await page.locator('#analysisCompareTray [data-analysis-go=compare]').click();
    if(c.action==='analysis-prepare')await page.locator('[data-analysis-panel=compare] [data-analysis-go=prepare]').click();
   }
  }
  await page.waitForTimeout(150);
  // SOFTM-PERSONAL-COST 날짜:20261121 : 네 진입점에서 같은 비용 입력과 금액 갱신 확인
  if(['comparison','facility','cost-profile','analysis-compare','map-compare'].includes(c.name)||c.costType)result.personalCost=await verifyPersonalCost(page,{profile:!!c.recipient,type:c.costType||'daycare'});
  if(c.name==='care-setup'){await page.locator('#careRecipient [name=grade]').waitFor();assert.equal(await page.locator('#careRecipient [name=grade]').inputValue(),'');await page.getByRole('link',{name:'지금은 건너뛰고 시작하기'}).click({trial:true});}
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
