importScripts('member-shell.js'); // SOFTM-MEMBERS 날짜:20261120 : 빌드가 생성한 정적 화면 의존성만 선캐시
const CACHE_NAME='hannun-pwa-shell-20261120-members1-'+self.HOMECARE_MEMBER_REVISION; // SOFTM-GUIDED-PWA 날짜:20261120 : 맞춤 비교 화면과 안전한 탐색 캐시 정책을 이전 셸과 구분해 즉시 갱신
const ROOT='./';
const isRuntimeData=url=>url.pathname.includes('/data/')||url.pathname.includes('/api/')||url.pathname.includes('/auth/')||url.pathname.endsWith('/auth-callback.html')||/\.(?:json|csv|gz|zip)(?:$|\?)/i.test(url.href);
const sameOriginStatic=value=>{try{const url=new URL(value,self.location.href);return url.origin===self.location.origin&&!isRuntimeData(url);}catch{return false;}};

self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll([ROOT,...self.HOMECARE_MEMBER_SHELL])).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('hannun-pwa-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{
 if(event.data?.type!=='PRECACHE_URLS'||!Array.isArray(event.data.urls))return;
 const urls=[...new Set(event.data.urls)].filter(sameOriginStatic).slice(0,300);
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>Promise.allSettled(urls.map(url=>cache.add(url)))));
});
self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 const url=new URL(request.url);if(url.origin!==self.location.origin||isRuntimeData(url))return;
 /** SOFTM-GUIDED-PWA START 날짜:20261119 : 한 번 방문한 맞춤 비교 단계의 화면 구조를 오프라인에서도 같은 주소로 복원 */
 if(request.mode==='navigate'){
  const pageKey=`${url.origin}${url.pathname}`;
  event.respondWith(fetch(request).then(response=>{if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(pageKey,response.clone()));return response;}).catch(()=>caches.match(pageKey).then(hit=>hit||caches.match(ROOT))));return; // SOFTM-NAV-CACHE-PRIVACY 날짜:20261120 : 주소·검색·좌표 쿼리를 캐시 키에 남기지 않고 같은 화면 셸만 경로별로 보관
 }
 /** SOFTM-GUIDED-PWA END */
 /** SOFTM-ASSET-VERSION START 날짜:20261121 : 새 CSS·모듈 버전을 이전 캐시로 바꾸지 않고 오프라인에서는 준비된 셸을 계속 사용 */
 event.respondWith(caches.open(CACHE_NAME).then(async cache=>{
  const bareKey=`${url.origin}${url.pathname}`,versioned=url.searchParams.has('v');
  const cached=await cache.match(request,{ignoreSearch:!versioned});
  const refresh=fetch(request).then(async response=>{if(response.ok)await cache.put(versioned?request:bareKey,response.clone()).catch(()=>{});return response;});
  if(cached){event.waitUntil(refresh.catch(()=>{}));return cached;}
  return refresh.catch(async error=>{const fallback=await cache.match(bareKey);if(fallback)return fallback;throw error;});
 }));
 /** SOFTM-ASSET-VERSION END */
});
