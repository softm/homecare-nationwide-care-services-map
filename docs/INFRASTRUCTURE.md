# 전국 주간·전국 요양 인프라 구조

<!-- SOFTM-INFRA-DOC START 날짜:20260903 : 프런트·수집·서버의 책임을 혼동해 폐기한 실시간 API가 다시 생기지 않도록 실제 운영 경계를 표로 고정 -->

## 전체 구성

| 영역 | 실행 위치 | 구성 파일·서비스 | 역할 | 브라우저 호출 여부 | 인증정보 |
|---|---|---|---|---:|---|
| 통합 시작 화면 | GitHub Pages 또는 로컬 정적 서버 | `index.html` | 9개 유형을 한 번씩 선택 → 유형 안내 → 통합 지도 진입 | 예 | 없음 | <!-- SOFTM-INDEX-UNIFIED 날짜:20260904 : 주야간보호도 같은 시작 흐름으로 연결 -->
| 기관 유형 안내 | GitHub Pages 또는 로컬 정적 서버 | `daycare-map.html` 등 9개 안내, `seo-landing.css` | 유형별 소개 → 통합 지도의 해당 `type` 진입·광고 | 예 | 없음 | <!-- SOFTM-LANDING-ADS 날짜:20260904 : 모든 유형의 2단계 안내와 지도 역할을 구분 -->
| 전국 주간 지도 | GitHub Pages 또는 로컬 정적 서버 | `nationwide-daycare-map.html` | 주야간보호 5,757곳 검색·필터·비교·상세 | 예 | 네이버 Maps 공개 Key ID |
| 전국 요양 지도 | GitHub Pages 또는 로컬 정적 서버 | `nationwide-care-services-map.html` | 9개 기관 유형 검색·필터·비교·상세 | 예 | 네이버 Maps 공개 Key ID |
| 지도·주소 변환 | 사용자 브라우저 | 네이버 Maps JavaScript SDK, `naver-geocoder.js` | 지도 표시, 주소→좌표, 좌표→주소 | 네이버 SDK 직접 호출 | `ncpKeyId=etfcybk8vf`, Maps Application의 Web 서비스 URL 제한 |
| 지도 화면영역 판별 | GitHub Pages 정적 파일·사용자 브라우저 | `region-bounds.js`, `viewport-regions.js` | 화면과 겹치는 시군구를 모두 후보로 조회한 뒤 실제 기관 좌표로 판별 | 로컬 정적 자료, 역주소 표본 조회 없음 | 없음 | <!-- SOFTM-VIEWPORT-REGIONS 날짜:20260904 : 지도 화면의 검색 누락을 막는 경계 자료의 책임과 호출 경로를 명시 -->
| 기관 기본 데이터 | GitHub Pages 정적 파일 | `data/care/*.json.gz`, `data/care/manifest.json`, `care-data.js` | 지도 목록·마커·필터의 기본 자료 | 예, 상대경로 정적 파일 | 없음 |
| 공단 상세·사진 | GitHub Pages 정적 파일 | `data/nhis/details/**/*.json.gz`, 기타 `data/nhis/**/*.json`, `nhis-static-data.js` | 두 지도가 공유하는 기관 상세·평가·사진 매니페스트 | 예, 상대경로 정적 파일 | 브라우저 인증정보 없음 | <!-- SOFTM-NHIS-GZIP 날짜:20260903 : 상세 압축 파일과 그 외 JSON의 배포 형식을 구분 -->
| 공단 데이터 수집 | GitHub Actions 또는 승인된 로컬 수집 환경 | `.github/workflows/refresh-nhis-static.yml`, `scripts/sync_nhis_static.py` | 공공데이터와 공단 공개 상세·사진 페이지를 배포 전 수집·정규화 | 브라우저 호출 아님 | `DATA_GO_KR_SERVICE_KEY` |
| 길찾기 서버 | Vercel Functions | `services/vercel-api/api/directions.js` | 네이버 Directions 15 자동차 경로 중계 | `POST /api/directions`만 호출 | `NAVER_MAPS_API_KEY_ID`, `NAVER_MAPS_API_SECRET` |
| 광고 설정 | GitHub Pages 정적 파일 및 광고 사업자 | `index-ad-config.js`, `category-landing-ad-config.js`, `category-landing-ads.js`, 두 지도 광고 설정 | 화면별 PC·모바일·목록 광고 슬롯 설정 | 예 | 광고 설정 파일의 공개 클라이언트 값만 사용 | <!-- SOFTM-INDEX-AD-UNIT 날짜:20260904 : 인덱스 승인 단위가 다른 지도 광고와 섞이지 않도록 인프라 경계를 명시 -->
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
| 자동차 길찾기 | 브라우저→Vercel | `https://daycare-directions-proxy.vercel.app/api/directions` | Vercel이 Secret을 붙여 네이버 Directions 15 호출 | 유일하게 유지하는 런타임 서버 API |
| 공단 원천 수집 | GitHub Actions→공공데이터 | 기관검색·시설상세 API, 시설현황·평가 파일 | Python 수집기가 재시도·호출 예산·샤드 체크포인트를 적용 | 키를 HTML·JSON·로그에 기록하지 않음 |
| 공단 화면 보완 수집 | GitHub Actions→공단 공개 상세 페이지 | 기본정보(11)·인력/근속(14)·CCTV(19) 탭 | 공개 표의 항목·셀 구조를 상세 JSON에 병합 | 브라우저 실시간 호출 금지 |
| 공단 사진 수집 | GitHub Actions→공단 공개 페이지 | `longtermcare.or.kr` 상세·썸네일 | 공개 페이지에서 사진 키와 메타데이터만 정규화 | 페이지 구조 변경 시 파서와 화면을 함께 검사 |

2단계 안내의 배너 위치와 카카오 AdFit 신규 단위 발급은 [`AD_SETUP.md`](AD_SETUP.md)를 따릅니다. <!-- SOFTM-LANDING-ADS 날짜:20260904 : 새 안내 광고를 기존 지도 단위와 구분해 운영 -->

## 광고·제휴 문의 설정

<!-- SOFTM-PARTNER-SETUP START 날짜:20260904 : 광고 슬롯 복구와 실제 메일 수신 활성화 절차를 함께 인수인계 -->

- 기본 hybrid 모드에서 두 지도 모두 6번째 기관 뒤에 기존 전용 카카오 목록 광고를 표시한다. 12번째부터 6개 간격으로 제휴 문의 카드를 표시한다. 전국 주간은 페이지마다 이 순서를 적용한다.
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
| `NAVER_MAPS_API_KEY_ID` | Vercel 환경변수 | ID 자체는 클라이언트 식별자이나 서버 설정으로 관리 | `/api/directions` | Directions 서버 폐기 시 |
| `NAVER_MAPS_API_SECRET` | Vercel 환경변수 | 아니오 | `/api/directions` | Directions 서버 폐기 시 |
| `ncpKeyId=etfcybk8vf` | 두 지도 HTML | 예 | Maps JavaScript SDK 및 geocoder 서브모듈 | Maps Application 교체 시 두 지도·검증기를 함께 변경 |
| `NHIS_MAX_PHOTOS_PER_INSTITUTION` | GitHub Actions job env | 예 | 기관별 사진 수 상한 | 수집 정책 변경 시 |
| `NHIS_PHOTO_MODE` | GitHub Actions job env | 예 | 공개 사진을 원격 URL 방식으로 기록 | 사진 저장 정책 변경 시 |

네이버 Maps Application의 Web 서비스 URL에는 최소 `https://homecare.designboard.net`, 레거시 `https://softm.github.io`, `http://localhost:3000`을 등록한다. `http://127.0.0.1:3000`은 별도 Origin이므로 이 주소로 브라우저 검증하려면 별도로 등록해야 한다. Vercel Directions 함수의 CORS 허용 Origin도 같은 공개·로컬 주소를 포함한다. <!-- SOFTM-SEO-DOMAIN 날짜:20260903 : 공식 공개 도메인에서 지도와 길찾기가 모두 허용되도록 Origin 기준을 동기화 -->

## 로컬 실행 표

| 목적 | 위치 | 명령 | 주소·결과 |
|---|---|---|---|
| 정적 프런트 실행 | 저장소 루트 | `npm run serve` | `http://localhost:3000/` |
| 전체 검사 | 저장소 루트 | `npm run check` | 두 지도 데이터 정합성과 NHIS 정적 스키마 검사 |
| 지도용 데이터 재생성 | 저장소 루트의 Python 가상환경 | `python scripts/build_nationwide_care_services.py` | `data/nhis`·`data/hira`에서 `data/care` 검색 자료와 안내 수치 생성 |
| NHIS 특정 기관 수집 | 저장소 루트의 Python 가상환경 | `python scripts/sync_nhis_static.py --mode institution ...` | `data/nhis`의 해당 기관 자료 갱신 |
| Vercel API 검사 | `services/vercel-api` | `npm run check` | `api/directions.js` 구문 검사 |
| Vercel 로컬 개발 | `services/vercel-api` | `npm run dev` | Vercel CLI 개발 서버; 정적 서버와 포트 충돌 시 다른 포트 사용 |

## 변경 시 지켜야 할 경계

| 변경 대상 | 함께 확인할 항목 |
|---|---|
| 프런트 공개 Origin | `CNAME`, 네이버 Web 서비스 URL, Vercel `ALLOWED_ORIGINS`, canonical·OG·구조화 데이터, `robots.txt`, `sitemap.xml` | <!-- SOFTM-SEO-DOMAIN 날짜:20260903 : 도메인 변경 시 검색엔진 제출 정보까지 함께 점검 -->
| 네이버 Maps Key ID | 두 HTML의 SDK URL, `services/vercel-api` 환경변수, `scripts/validate-project.mjs` |
| Directions 배포 주소 | 두 HTML의 `DIRECTIONS_PROXY`, Vercel CORS, `/api/directions` 회귀검사 |
| 공단 정적 스키마 | 수집기, `nhis-static-data.js`, 두 지도 상세 UI, `validate_nhis_static.py` |
| 기관 원본 데이터 | 수집기·검색 인덱스 생성기, JSON 매니페스트, 전국 주간과 전국 요양 daycare 기관기호 차이 0 |
| 사진 페이지 구조 | 사진 파서, 정적 사진 JSON, 두 지도의 사진 탭 |
| 자동 수집 일정·예산 | 세 cron 합계, 일일 API 한도, 샤드 체크포인트 지속성, `DATA_COLLECTION.md` 동기화 | <!-- SOFTM-NHIS-COLLECTION-DOC 날짜:20260903 : 워크플로 변경 시 운영 문서가 누락되지 않도록 점검 범위를 고정 -->

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
