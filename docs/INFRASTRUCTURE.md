# 전국 요양 통합 지도 인프라 구조

<!-- SOFTM-INFRA-DOC START 날짜:20260903 : 프런트·수집·서버의 책임을 혼동해 폐기한 실시간 API가 다시 생기지 않도록 실제 운영 경계를 표로 고정 -->

## 전체 구성

| 영역 | 실행 위치 | 구성 파일·서비스 | 역할 | 브라우저 호출 여부 | 인증정보 |
|---|---|---|---|---:|---|
| 통합 시작 화면 | GitHub Pages 또는 로컬 정적 서버 | `index.html` | 전국 요양 통합 지도 검색·비교 | 예 | 없음 | <!-- SOFTM-ROOT-MAP 날짜:20260925 : 루트와 실제 지도 화면을 같은 주소로 통일 -->
| 기관 유형 안내 | GitHub Pages 또는 로컬 정적 서버 | `daycare-map.html` 등 9개 안내, `seo-landing.css` | 유형별 소개 → 통합 지도의 해당 `type` 진입·광고 | 예 | 없음 | <!-- SOFTM-LANDING-ADS 날짜:20260904 : 모든 유형의 2단계 안내와 지도 역할을 구분 -->
| 전국 요양 지도 | GitHub Pages 또는 로컬 정적 서버 | `index.html` | 9개 기관 유형 검색·필터·비교·상세 | 예 | 네이버 Maps 공개 Key ID |
| 지도·주소 변환 | 사용자 브라우저 | 네이버 Maps JavaScript SDK, `naver-geocoder.js` | 지도 표시, 주소→좌표, 좌표→주소 | 네이버 SDK 직접 호출 | `ncpKeyId=etfcybk8vf`, Maps Application의 Web 서비스 URL 제한 |
| 지도 화면영역 판별 | GitHub Pages 정적 파일·사용자 브라우저 | `region-bounds.js`, `viewport-regions.js` | 화면과 겹치는 시군구를 모두 후보로 조회한 뒤 실제 기관 좌표로 판별 | 로컬 정적 자료, 역주소 표본 조회 없음 | 없음 | <!-- SOFTM-VIEWPORT-REGIONS 날짜:20260904 : 지도 화면의 검색 누락을 막는 경계 자료의 책임과 호출 경로를 명시 -->
| 기관 기본 데이터 | GitHub Pages 정적 파일 | `data/care/*.json.gz`, `data/care/manifest.json`, `care-data.js` | 지도 목록·마커·필터의 기본 자료 | 예, 상대경로 정적 파일 | 없음 |
| 공단 상세·사진 | GitHub Pages 정적 파일 | `data/nhis/details/**/*.json.gz`, 기타 `data/nhis/**/*.json`, `nhis-static-data.js` | 두 지도가 공유하는 기관 상세·평가·사진 매니페스트 | 예, 상대경로 정적 파일 | 브라우저 인증정보 없음 | <!-- SOFTM-NHIS-GZIP 날짜:20260903 : 상세 압축 파일과 그 외 JSON의 배포 형식을 구분 -->
| 기관 직접 제공 화면 | GitHub Pages 또는 로컬 정적 서버 | `institution-content.js`, `institution-content.css`, `institution-portal.html` | 승인된 기관의 운영정보·프로그램·사진 표시와 담당자 관리 화면 | 예 | 전용 회원의 HttpOnly 쿠키·CSRF, 회원 Worker의 기관 API 프록시 | <!-- SOFTM-INSTITUTION-PILOT 날짜:20261118 : 공단 정적 자료와 기관 직접 제공 작업본의 책임을 분리 -->
| 기관 시범운영 API | Cloudflare Workers + D1 + Supabase Storage | `services/cloudflare-homecare` · `softm-homecare-pilot` | 기관 신청·권한·작업본·명시 게시·사진·익명 일별 통계 | 예 | `ACCOUNT` 서비스 바인딩, `EVENT_HASH_SECRET` | <!-- SOFTM-INSTITUTION-PILOT 날짜:20261118 : 결제 기능 없는 기관용 쓰기 경로와 사진 저장소를 독립 운영 -->
| 전용 회원 인증 | Cloudflare Workers + D1 + 비공개 Supabase Storage | `services/cloudflare-homecare-members` | 아이디·SNS 가입, 기록·가족 공유, 기관 증빙·심사 | 브라우저는 쿠키, 기관 Worker는 내부 서비스 바인딩 | 전용 OAuth secrets · Supabase 서버 secret | <!-- SOFTM-INSTITUTION-PILOT 날짜:20261118 : 로그인과 기관 관리 권한 승인을 별도 계층으로 유지 -->
| 데이터 수집 현황 | GitHub Pages 정적 파일·GitHub 공개 API | `data-status.html`, `data-status.js`, 수집 매니페스트, Actions 최근 실행 API | 공개된 수집률·변경 경과·유형별 기준일과 실행 상태 표시 | 정적 JSON과 공개 Actions 상태 조회 | 인증정보 없음 | <!-- SOFTM-DATA-STATUS 날짜:20260910 : 비밀키 없이 공개 수집 결과와 진행 중 실행을 구분해 확인 -->
| 공단 데이터 수집 | GitHub Actions 또는 승인된 로컬 수집 환경 | `.github/workflows/refresh-nhis-static.yml`, `scripts/sync_nhis_static.py`, 로컬 사진 전용 `scripts/collect_missing_nhis_photos.py` | 공공데이터와 공단 공개 상세·사진 페이지를 배포 전 수집·정규화 | 브라우저 호출 아님 | OpenAPI는 `DATA_GO_KR_SERVICE_KEY`, 공개 사진 페이지는 키 불필요 | <!-- SOFTM-NHIS-MISSING-PHOTOS 날짜:20260904 : 로컬 사진 전용 실행 위치와 공개 페이지 인증 경계를 명시 -->
| 길찾기 서버 | Firebase Functions v2 | `services/firebase-api` | 네이버 Directions 15 자동차 경로 중계 | `POST /directions`만 호출 | Google Secret Manager의 `NAVER_MAPS_API_SECRET` |
| 광고 설정 | GitHub Pages 정적 파일 및 광고 사업자 | `category-landing-ad-config.js`, `category-landing-ads.js`, 두 지도 광고 설정 | 화면별 PC·모바일·목록 광고 슬롯 설정 | 예 | 광고 설정 파일의 공개 클라이언트 값만 사용 | <!-- SOFTM-INDEX-AD-UNIT 날짜:20260904 : 인덱스 승인 단위가 다른 지도 광고와 섞이지 않도록 인프라 경계를 명시 -->
| 광고·제휴 문의 | 사용자 브라우저→Web3Forms | `partner-inquiry-config.js`, `partner-inquiry.js`, `partner-inquiry.css` | 두 지도와 9개 안내의 공통 오버레이에서 이메일 문의 접수 | 제출할 때만 `POST https://api.web3forms.com/submit` | 수신 주소로 발급한 공개 Access Key | <!-- SOFTM-PARTNER-INFRA 날짜:20260904 : 제휴 메일 접수에 별도 런타임 서버가 필요하지 않도록 브라우저 호출을 명시 -->
| 로컬 정적 서버 | 개발자 PC | `npm run serve` → `python3 -m http.server 3000` | HTML을 `file://`이 아닌 HTTP Origin으로 검증 | `http://localhost:3000` | 없음 |
| 정합성 검사 | 로컬 또는 GitHub Actions | `npm run check` | HTML 의존성, JS·Python 구문, 기관 수·중복·정적 NHIS 스키마 검사 | 아니오 | fixture 검사에는 없음 |

## 요청 경로와 책임

| 기능 | 호출 주체 | 대상 | 처리 방식 | 유지 정책 |
|---|---|---|---|---|
| 지도 표시 | 브라우저 | `https://oapi.map.naver.com/openapi/v3/maps.js` | `ncpKeyId=etfcybk8vf&submodules=geocoder`로 SDK 1회 로드 | 두 지도의 Key ID와 서브모듈을 동일하게 유지 |
| 주소→좌표 | 브라우저 | `naver.maps.Service.geocode` | 공용 큐·중복 제거·캐시를 사용하는 클라이언트 SDK 호출 | `/api/geocode`를 다시 만들지 않음 |
| 좌표→주소 | 브라우저 | `naver.maps.Service.reverseGeocode` | 공용 캐시를 사용하는 클라이언트 SDK 호출 | `/api/reverse-geocode`를 다시 만들지 않음 |
| 기관 기본 목록 | 브라우저 | `data/care/manifest.json`, 유형별 `.json.gz` | 공용 `care-data.js`가 수집 JSON에서 생성한 검색 자료를 로드 | 생성물 직접 수정 금지 | <!-- SOFTM-DATA-UNIFIED 날짜:20260904 : 실제 지도 입력을 수집 데이터로 통일 -->
| 공단 상세 | 브라우저 | `data/nhis/details/{기관기호 앞 2자리}/{기관기호}.json.gz` | `nhis-static-data.js`가 필요한 기관 파일만 받아 gzip 해제 후 로드 | 실시간 공단 API 프록시 금지 | <!-- SOFTM-NHIS-GZIP 날짜:20260903 : 브라우저의 실제 압축 상세 요청 경로를 기록 -->
| 공단 사진 | 브라우저 | `data/nhis/photos/{기관기호 앞 2자리}/{기관기호}.json` | 사진 탭을 열 때 정적 사진 매니페스트 로드 | 원본 이미지는 공단 공개 URL 사용 가능 |
| 기관 직접 운영정보 | 브라우저→Cloudflare Worker | `GET /api/public/institutions/:id` | `published` 상태의 기관 확인 정보만 상세 화면에 별도 표시 | 공단 정적 상세를 덮어쓰거나 검색순위에 반영하지 않음 | <!-- SOFTM-INSTITUTION-PILOT 날짜:20261118 : 기관 입력과 공식 공개자료를 화면·데이터 양쪽에서 분리 -->
| 기관 관리 | 담당자 브라우저→전용 회원 Worker→기관 Worker | `/connect`, `/api/institutions/*` | 아이디 쿠키·CSRF 인증 후 승인된 전용 UID↔기관 멤버십을 다시 확인 | 로그인만으로 수정권한을 부여하지 않고 일반 신청은 `pending` 유지 | <!-- SOFTM-INSTITUTION-PILOT 날짜:20261118 : 기관 사칭과 클라이언트 UID 신뢰를 방지 -->
| 기관 사진 | 담당자 브라우저→Worker→Supabase | `/api/institutions/:id/photos`, 공개 사진 API | JPEG·PNG·WebP 실제 시그니처·5 MiB·10장 상한 검증 후 저장 | 공개 기관·공개 사진일 때만 스트리밍, SVG 불허 |
| 기관 이용 현황 | 브라우저→Worker→D1 | `POST /api/public/events`, `GET /api/institutions/:id/stats` | 세션 난수를 날짜·기관·행동별 HMAC으로 변환해 중복 제거 후 합계 제공 | IP·User-Agent·bearer·난수 원문을 D1에 저장하지 않음 |
| 수집 현황 | 브라우저 | `data/nhis/manifest.json`, `changes.json`, `checkpoints/*.json`, `data/care/manifest.json` | 공개된 수집률·최근 변경·유형별 기준일·샤드 완료 경과 표시 | 원본 수집 파일이나 비밀키는 읽지 않음 | <!-- SOFTM-DATA-STATUS 날짜:20260910 : 화면에 공개할 운영 지표와 비공개 수집 자격정보의 경계를 고정 -->
| 최근 Actions 실행 | 브라우저→GitHub 공개 API | `api.github.com/repos/softm/homecare-nationwide-care-services-map/actions/workflows/refresh-nhis-static.yml/runs` | 최근 8회와 진행 중 상태 표시, 실행 중일 때만 90초 후 재확인 | 인증 없이 공개 저장소의 실행 메타정보만 조회 | <!-- SOFTM-DATA-STATUS 날짜:20260910 : 정적 매니페스트 반영 전에도 현재 실행 여부를 확인 -->
| 자동차 길찾기 | 브라우저→Firebase | `https://asia-northeast3-softm-hannun-api.cloudfunctions.net/directions` | 서울 리전 함수가 Secret을 붙여 네이버 Directions 15 호출 | 돌봄한눈·주유한눈 공용 런타임 API |
| 공단 원천 수집 | GitHub Actions→공공데이터 | 기관검색·시설상세 API, 시설현황·평가 파일 | Python 수집기가 재시도·호출 예산·샤드 체크포인트를 적용 | 키를 HTML·JSON·로그에 기록하지 않음 |
| 공단 화면 보완 수집 | GitHub Actions→공단 공개 상세 페이지 | 기본정보(11)·인력/근속(14)·CCTV(19) 탭 | 공개 표의 항목·셀 구조를 상세 JSON에 병합 | 브라우저 실시간 호출 금지 |
| 공단 사진 수집 | GitHub Actions→공단 공개 페이지 | `longtermcare.or.kr` 상세·썸네일 | 공개 페이지에서 사진 키와 메타데이터만 정규화 | 페이지 구조 변경 시 파서와 화면을 함께 검사 |

2단계 안내의 배너 위치와 카카오 AdFit 신규 단위 발급은 [`AD_SETUP.md`](AD_SETUP.md)를 따릅니다. <!-- SOFTM-LANDING-ADS 날짜:20260904 : 새 안내 광고를 기존 지도 단위와 구분해 운영 -->

## 광고·제휴 문의 설정

<!-- SOFTM-PARTNER-SETUP START 날짜:20260904 : 광고 슬롯 복구와 실제 메일 수신 활성화 절차를 함께 인수인계 -->

- 기본 hybrid 모드에서 통합 지도는 6번째 기관 뒤에 기존 전용 카카오 목록 광고를 표시한다. 12번째부터 6개 간격으로 제휴 문의 카드를 표시한다. <!-- SOFTM-DAYCARE-REDIRECT 날짜:20260924 : 전용 지도 제거 뒤 광고 순서를 통합 지도 하나로 고정 -->
- `partner-inquiry-config.js`의 `accessKey`에 수신 이메일로 발급한 Web3Forms 공개 Access Key를 설정한다. 현재 수신 안내 주소는 `softm@nate.com`이며, 실제 수신처는 Access Key에 연결된 이메일로 결정된다. 수신처를 바꿀 때 키와 `recipientEmail`을 함께 변경한다.
- 공개 폼 키 발급 및 클라이언트 사용 근거: [Web3Forms 시작 안내](https://docs.web3forms.com/getting-started), [클라이언트 호출과 공개 키 안내](https://docs.web3forms.com/getting-started/troubleshooting). 서버 Secret은 이 파일에 넣지 않는다.
- 키가 비어 있으면 접수 준비 안내와 직접 이메일 링크를 제공하고 API를 호출하지 않는다. 키를 등록한 다음 브라우저 제출과 수신 메일함 확인까지 진행해야 실제 수신 연결이 완료된다.
- 문의 내용은 제출 시에만 Web3Forms로 전송하며 로컬 저장소에 저장하지 않는다. 성공 응답을 확인한 뒤에만 폼을 비우고, 실패·시간 초과 시에는 입력을 유지한다.
- 새 파일은 저장소 루트에서 정적으로 제공한다. 별도 빌드·설치 단계는 없으며 `npm run check` 후 `npm run serve`로 검증한다.

<!-- SOFTM-PARTNER-SETUP END -->

## 공단 데이터 파이프라인

| 단계 | 입력 | 처리 | 출력 | 비고 |
|---:|---|---|---|---|
| 1 | 공공데이터 시설별 현황·평가 원문 | 최신 파일 확인 및 원본 보존 | `source-data/nhis-longtermcare-*.xlsx`, `source-data/nhis_longtermcare_evaluations_*.csv` | 원본을 덮어쓰거나 수동 가공하지 않음 |
| 2 | 시설별 현황 XLSX + 기관 검색 API | 기관·급여 조합 병합과 변경 감지 | `data/nhis/catalog.json`, `data/nhis/changes.json` | 기관 기본 목록의 수집 기준 |
| 3 | 시설별 상세조회 API 최대 9개 operation + 공단 상세 11·14·19 탭 | 기관기호·급여코드별 상세와 화면 고유 기본·근속·CCTV 정규화·gzip 압축 | `data/nhis/details/NN/{id}.json.gz` | 성공한 기존 섹션은 병합 보존 | <!-- SOFTM-NHIS-GZIP 날짜:20260903 : 수집기가 상세를 압축 파일로 직접 저장하는 단계 명시 -->
| 4 | 평가 CSV | 기관기호별 평가 정규화 | `data/nhis/evaluations.json` | 상세 화면의 평가 자료 |
| 5 | 공단 공개 사진 페이지 | 기관별 사진 키·URL·메타데이터 정규화 | `data/nhis/photos/NN/{id}.json` | 기본 상한 10장 |
| 6 | 수집 결과 | 성공 ID, 실패, 샤드 진행상태 기록 | `manifest.json`, `failures/*.json`, `checkpoints/*.json` | 중단된 순환 수집을 이어서 실행 |
| 7 | 전체 생성물 | `npm run check` | 검증 성공 후 Actions bot 커밋·푸시 | `data/nhis`, `source-data` 변경만 자동 반영 |

## 자동 수집 일정

실행 명령, 수동 모드, 상태·완료 판정과 체크포인트 운영의 상세 기준은 [`DATA_COLLECTION.md`](DATA_COLLECTION.md)를 따른다. <!-- SOFTM-NHIS-COLLECTION-DOC 날짜:20260903 : 수집 운영 명령의 중복 문서화를 줄이고 최신 기준으로 연결 -->

| 서울 시간 | GitHub cron(UTC) | 모드 | 범위 | 최대 호출 수 | 목적 |
|---|---|---|---|---:|---|
| 매일 03:23 | `23 18 * * *` | `incremental` | 전체 | 900 | 변경 기관 중심 증분 수집 |
| 매일 04:41 | `41 19 * * *` | `rotation` | 상세·사진 | 6,800 | 14개 샤드 순환 갱신 |
| 매월 1일 05:17 | `17 20 * * *` | `incremental` | 카탈로그·평가 | 300 | 기준 원본과 평가 점검 |
| 수동 실행 | `workflow_dispatch` | incremental/institution/rotation/full/retry | 선택 가능 | 기본 8,000 | 특정 기관, 실패 재처리, 전체 수집 |

예약 실행은 `nhis-static-refresh` concurrency group으로 직렬화하며 진행 중 실행을 취소하지 않는다. 전체 상세 수집은 하루에 끝나는 작업이 아니므로 샤드 체크포인트를 다음 실행에서 이어간다.

## 환경변수와 공개 설정

| 이름 | 저장 위치 | 공개 가능 여부 | 사용처 | 삭제 조건 |
|---|---|---:|---|---|
| `DATA_GO_KR_SERVICE_KEY` | 로컬 루트 `.env.local`, GitHub Actions Repository Secret | 아니오 | `scripts/sync_nhis_static.py` | 공공데이터 수집을 완전히 폐기할 때만 |
| `NAVER_MAPS_API_KEY_ID` | Firebase 함수 소스의 공개 식별자 | 예 | `/directions` | Maps Application 교체 시 |
| `NAVER_MAPS_API_SECRET` | Google Secret Manager | 아니오 | `/directions` | Directions 서버 폐기 시 |
| `ncpKeyId=etfcybk8vf` | 두 지도 HTML | 예 | Maps JavaScript SDK 및 geocoder 서브모듈 | Maps Application 교체 시 두 지도·검증기를 함께 변경 |
| `NHIS_MAX_PHOTOS_PER_INSTITUTION` | GitHub Actions job env | 예 | 기관별 사진 수 상한 | 수집 정책 변경 시 |
| `NHIS_PHOTO_MODE` | GitHub Actions job env | 예 | 공개 사진을 원격 URL 방식으로 기록 | 사진 저장 정책 변경 시 |
| `EVENT_HASH_SECRET` | Cloudflare Worker Secret | 아니오 | 기관 이용 행동의 일별 HMAC 중복 제거 | 기관 시범운영 통계를 폐기하고 잔여 해시를 파기할 때 | <!-- SOFTM-INSTITUTION-PILOT 날짜:20261118 : 익명 난수 원문 대신 비가역 일별 해시만 저장 -->
| `ALLOWED_ORIGINS` | `services/cloudflare-homecare/wrangler.jsonc` | 예 | 기관 Worker의 정확한 CORS Origin 목록 | 공식 공개 Origin 변경 시 공통 계정 허용 목록과 함께 변경 |
| `DEV_ALLOWED_ORIGIN` | 커밋하지 않는 `.dev.vars` | 예 | 로컬 기관 화면의 단일 허용 Origin | 운영 배포 변수에는 넣지 않음 |

네이버 Maps Application의 Web 서비스 URL에는 최소 `https://homecare.designboard.net`, 레거시 `https://softm.github.io`, `http://localhost:3000`을 등록한다. `http://127.0.0.1:3000`은 별도 Origin이므로 이 주소로 브라우저 검증하려면 별도로 등록해야 한다. Firebase Directions 함수의 CORS 허용 Origin도 같은 공개·로컬 주소를 포함한다. <!-- SOFTM-FIREBASE-DIRECTIONS 날짜:20261026 : 공식 공개 도메인과 공용 함수 호출 출처를 동기화 -->

## 로컬 실행 표

| 목적 | 위치 | 명령 | 주소·결과 |
|---|---|---|---|
| 정적 프런트 실행 | 저장소 루트 | `npm run serve` | `http://localhost:3000/` |
| 전체 검사 | 저장소 루트 | `npm run check` | 두 지도 데이터 정합성과 NHIS 정적 스키마 검사 |
| 지도용 데이터 재생성 | 저장소 루트의 Python 가상환경 | `python scripts/build_nationwide_care_services.py` | `data/nhis`·`data/hira`에서 `data/care` 검색 자료와 안내 수치 생성 |
| NHIS 특정 기관 수집 | 저장소 루트의 Python 가상환경 | `python scripts/sync_nhis_static.py --mode institution ...` | `data/nhis`의 해당 기관 자료 갱신 |
| Firebase API 검사 | `services/firebase-api` | `npm run check` | 진입점·핵심 핸들러 구문 및 요청 회귀검사 |
| Firebase 배포 | 저장소 루트 | `npx -y firebase-tools@latest deploy --only functions:shared-api:directions --project softm-hannun-api` | 서울 리전 Node.js 22 함수 갱신 |
| 기관 API 검사 | `services/cloudflare-homecare` | `npm test` | 인증·권한·입력·사진·게시·익명 집계 회귀검사 |
| 기관 API 로컬 DB | `services/cloudflare-homecare` | `npm run db:migrate:local` | D1 로컬 마이그레이션 적용 |

## 변경 시 지켜야 할 경계

| 변경 대상 | 함께 확인할 항목 |
|---|---|
| 프런트 공개 Origin | `CNAME`, 네이버 Web 서비스 URL, Firebase `ALLOWED_ORIGINS`, canonical·OG·구조화 데이터, `robots.txt`, `sitemap.xml` | <!-- SOFTM-FIREBASE-DIRECTIONS 날짜:20261026 : 도메인 변경 시 공용 함수와 검색 설정을 함께 점검 -->
| 네이버 Maps Key ID | 지도 HTML의 SDK URL, `services/firebase-api/directions-core.js`, `scripts/validate-project.mjs` |
| Directions 배포 주소 | 지도 HTML의 `DIRECTIONS_PROXY`, Firebase CORS, `/directions` 회귀검사 |
| 공단 정적 스키마 | 수집기, `nhis-static-data.js`, 두 지도 상세 UI, `validate_nhis_static.py` |
| 기관 원본 데이터 | 수집기·검색 인덱스 생성기, JSON 매니페스트, 통합 지도 `daycare` 기관기호 |
| 사진 페이지 구조 | 사진 파서, 정적 사진 JSON, 두 지도의 사진 탭 |
| 자동 수집 일정·예산 | 세 cron 합계, 일일 API 한도, 샤드 체크포인트 지속성, `DATA_COLLECTION.md` 동기화 | <!-- SOFTM-NHIS-COLLECTION-DOC 날짜:20260903 : 워크플로 변경 시 운영 문서가 누락되지 않도록 점검 범위를 고정 -->
| 기관 API 공개 주소 | `institution-content.js`, `institution-portal.mjs`, Worker `workers_dev` 또는 route, 공통 계정 homecare Origin, CORS 허용 목록 |
| 기관 프로필·사진 스키마 | 담당자 폼, 공개 렌더러, Worker 검증·D1 migration, `privacy.html`, 기관 API 테스트 |
| 기관 게시 상태 | 모든 쓰기 작업의 `draft` 전환, 협약 철회, `/submit`, 공개 API의 `published` 필터 |

<!-- SOFTM-INFRA-DOC END -->

<!-- SOFTM-DATA-UNIFIED START 날짜:20260904 : 수집 데이터 갱신이 목록·검색·비교에 반영되는 단일 경로를 명시 -->
## 수집 자료와 지도 검색 연결

`data/nhis/catalog.json` + `evaluations.json` + `details/**/*.json.gz` → `scripts/build_nationwide_care_services.py` → `data/care/manifest.json` + 유형별 압축 JSON → `care-data.js` → 두 지도.

요양병원은 `scripts/import_hira_hospitals.py`가 심평원 원본을 `data/hira/nursing-hospitals.json`으로 가져온 뒤 같은 생성 경로에 참여합니다. 공단 평가와 혼합하지 않습니다. 기존 기관 데이터 JS는 사용·배포·재생성하지 않습니다. 기관명·주소는 수집 상세와 공단 원문 주소를, 정원·인력은 해당 급여의 상세를 사용합니다. 없는 인력은 일부 미확인으로 표시합니다. 기존 좌표 캐시·상세·사진·광고 경로는 유지합니다.
<!-- SOFTM-DATA-UNIFIED END -->

<!-- SOFTM-ADVANCED-SEARCH START 날짜:20260904 : 검색 조건 확인과 일반 이용자의 외부 호출 경계를 유지 -->
공단 상세검색은 `scripts/collect_nhis_search.py`가 공개 검색 결과를 수집하여 `source-data/nhis-search/YYYYMMDD/`에 원문을 보존하고 `data/nhis/search-index.json.gz`로 압축합니다. 두 지도는 `advanced-search.js`에서 이 파일만 읽어 설립주체와 서비스 조건을 판정합니다. 브라우저의 공단 실시간 요청이나 Vercel 검색 프록시는 추가하지 않습니다. 상세검색 확인일은 기본 목록 기준일과 별도로 표시합니다.
<!-- SOFTM-ADVANCED-SEARCH END -->

<!-- SOFTM-DATA-REGIONS 날짜:20260904 : 수집 후 지역 검색 페이지에 이전 기관 자료가 남지 않도록 생성 순서를 함께 기록 -->
지도·지역 검색 자료 전체 갱신은 `npm run build`로 실행합니다. 수집 JSON → `data/care` → 지역별 기관 목록 → 유형 안내·사이트맵 순서이며, 정기 수집도 같은 명령으로 갱신한 생성물을 함께 반영합니다.

<!-- SOFTM-MEMBERS START 날짜:20261120 : 승인된 전용 회원 구조와 운영 연결의 남은 전제조건 기록 -->
## 전용 회원·상담 작업공간

현재 지도 화면과 검색 데이터는 정적 HTML/CSS/JS 구조 그대로다. `care-shell.mjs`가 지도 찾기·맞춤 찾기·담은 기관·상담 기록을 연결한다. 회원 정책과 로컬 검증/운영 연결 순서는 [HOMECARE-MEMBERS.md](HOMECARE-MEMBERS.md), [회원 Worker README](../services/cloudflare-homecare-members/README.md)를 따른다.

기관 DB `0006_member_registration.sql`은 기존 기관 D1에 적용한다. 회원 D1은 별도이며 Supabase 증빙 버킷은 기관 사진 버킷과 분리한다. 기관 Worker `ACCOUNT`와 회원 Worker `INSTITUTIONS` 서비스 바인딩을 함께 배포해야 한다. 기존 공통 계정은 `?legacyAccount=1`에서 이전 보관소를 명시적으로 복원하는 경우에만 연결한다.

저장소 설정의 D1 ID는 2026-11-20 생성·마이그레이션한 실제 전용 DB다. [운영 연결 기록](HOMECARE-DEPLOYMENT.md)에 인증·DB·Supabase·Worker·도메인·SNS별 상태를 구분한다. DB 준비와 로컬 번들 검사를 실제 Worker 배포·SNS 제공자 설정·운영 App Link 검증으로 간주하지 않는다. `api.homecare.designboard.net` DNS와 인증 자원이 준비되기 전에 웹의 회원 화면을 운영 메인에 배포하지 않는다. <!-- SOFTM-LIVE-D1 날짜:20261120 : 운영 DB 준비 결과와 서비스 공개 전제조건을 구분 -->
<!-- SOFTM-MEMBERS END -->

<!-- SOFTM-GUARDIAN START 날짜:20261120 : 보호자·대상자 정보의 서버 경계와 운영 적용 순서 -->
### 보호자 연락·대상자 조건

회원 D1에 `services/cloudflare-homecare-members/migrations/0002_care_recipient.sql`을 0001 다음으로 적용한다. 대상자 원문과 동의는 `care_recipients`, 보호자 연락처는 `users`에서 관리한다. `/api/me/care-recipient`는 본인 일반회원 쿠키·CSRF·revision을 검증하고 기관 Worker로 대상자 원문을 전달하지 않는다. 응답은 `Cache-Control: no-store`이며 정적 셸에 API 응답을 포함하지 않는다. 대상자 정보 삭제·보관소 삭제·탈퇴는 동의 기록도 삭제한다.

공개 조건 매칭과 상담 질문은 기존 분석 엔진을 유지한다. 상담 회신 대상 표시는 계정 소유자 이름·휴대폰이며 실제 문자·이메일 전송 경로는 미연결이다. 운영 D1에 0002를 적용하고 회원 Worker를 배포했다. 실제 웹 공개와 브라우저 검증 결과는 운영 연결 기록을 따른다. <!-- SOFTM-MEMBER-LIVE 날짜:20261121 : 이미 적용한 D1과 서버 상태를 최신화 -->
<!-- SOFTM-GUARDIAN END -->

<!-- SOFTM-SUPABASE-STORAGE START 날짜:20261121 : 실제 파일 저장소·서버 배포와 웹 검증 상태를 구분 -->
기관 파일은 담당자가 웹 회원가입·기관 관리 화면에서 올린다. 운영 구성은 `services/homecare-storage/file-storage.mjs`를 통해 Supabase private 버킷에 연결한다. 2026-11-21 Free·카드 없음·추가 과금 제한과 파일 왕복·익명 거부·삭제를 확인했다. 두 Worker secret·배포를 완료하고 사용자 지시로 `FILE_UPLOADS_ENABLED=true`를 적용했다. D1은 파일 키·권한·메타데이터만 보관한다. [운영 상태](HOMECARE-DEPLOYMENT.md), [저장소 구성·남은 작업](../services/homecare-storage/README.md)을 따른다.

회원 API는 `api.homecare.designboard.net` → Cloudflare Pages `softm-homecare-api` → `MEMBERS` 서비스 바인딩 → `softm-homecare-members`로 연결한다. 카페24 DNS에는 이 서브도메인의 CNAME만 추가하며 기존 GitHub Pages 지도와 전체 네임서버는 유지한다. 게이트웨이에 저장소 비밀키나 DB를 추가하지 않는다. 공개 Bearer 헤더를 제거하고 기존 Secure·HttpOnly·SameSite=Lax 쿠키·Origin·CSRF 검증을 유지한다.
<!-- SOFTM-SUPABASE-STORAGE END -->
