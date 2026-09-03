# 전국 주간·전국 요양 인프라 구조

<!-- SOFTM-INFRA-DOC START 날짜:20260903 : 프런트·수집·서버의 책임을 혼동해 폐기한 실시간 API가 다시 생기지 않도록 실제 운영 경계를 표로 고정 -->

## 전체 구성

| 영역 | 실행 위치 | 구성 파일·서비스 | 역할 | 브라우저 호출 여부 | 인증정보 |
|---|---|---|---|---:|---|
| 통합 시작 화면 | GitHub Pages 또는 로컬 정적 서버 | `index.html` | 전국 주간·전국 요양 및 요양 8개 카테고리 진입 | 예 | 없음 |
| 전국 주간 지도 | GitHub Pages 또는 로컬 정적 서버 | `nationwide-daycare-map.html` | 주야간보호 5,751곳 검색·필터·비교·상세 | 예 | 네이버 Maps 공개 Key ID |
| 전국 요양 지도 | GitHub Pages 또는 로컬 정적 서버 | `nationwide-care-services-map.html` | 8개 기관 유형 검색·필터·비교·상세 | 예 | 네이버 Maps 공개 Key ID |
| 지도·주소 변환 | 사용자 브라우저 | 네이버 Maps JavaScript SDK, `naver-geocoder.js` | 지도 표시, 주소→좌표, 좌표→주소 | 네이버 SDK 직접 호출 | `ncpKeyId=etfcybk8vf`, Maps Application의 Web 서비스 URL 제한 |
| 기관 기본 데이터 | GitHub Pages 정적 파일 | `nationwide-daycare-data-*.js`, `nationwide-care-data/*.js`, 각 매니페스트 | 지도 목록·마커·필터의 기본 자료 | 예, 상대경로 정적 파일 | 없음 |
| 공단 상세·사진 | GitHub Pages 정적 파일 | `data/nhis/**/*.json`, `nhis-static-data.js` | 두 지도가 공유하는 기관 상세·평가·사진 매니페스트 | 예, 상대경로 정적 JSON | 브라우저 인증정보 없음 |
| 공단 데이터 수집 | GitHub Actions 또는 승인된 로컬 수집 환경 | `.github/workflows/refresh-nhis-static.yml`, `scripts/sync_nhis_static.py` | 공공데이터와 공단 공개 사진 페이지를 배포 전 수집·정규화 | 브라우저 호출 아님 | `DATA_GO_KR_SERVICE_KEY` |
| 길찾기 서버 | Vercel Functions | `services/vercel-api/api/directions.js` | 네이버 Directions 15 자동차 경로 중계 | `POST /api/directions`만 호출 | `NAVER_MAPS_API_KEY_ID`, `NAVER_MAPS_API_SECRET` |
| 광고 설정 | GitHub Pages 정적 파일 및 광고 사업자 | `index-ad-config.js`, `nationwide-daycare-ad-config.js`, `nationwide-care-ad-config.js` | 화면별 PC·모바일·목록 광고 슬롯 설정 | 예 | 광고 설정 파일의 공개 클라이언트 값만 사용 | <!-- SOFTM-INDEX-AD-UNIT 날짜:20260903 : 인덱스 승인 단위가 다른 지도 광고와 섞이지 않도록 인프라 경계를 명시 -->
| 로컬 정적 서버 | 개발자 PC | `npm run serve` → `python3 -m http.server 3000` | HTML을 `file://`이 아닌 HTTP Origin으로 검증 | `http://localhost:3000` | 없음 |
| 정합성 검사 | 로컬 또는 GitHub Actions | `npm run check` | HTML 의존성, JS·Python 구문, 기관 수·중복·정적 NHIS 스키마 검사 | 아니오 | fixture 검사에는 없음 |

## 요청 경로와 책임

| 기능 | 호출 주체 | 대상 | 처리 방식 | 유지 정책 |
|---|---|---|---|---|
| 지도 표시 | 브라우저 | `https://oapi.map.naver.com/openapi/v3/maps.js` | `ncpKeyId=etfcybk8vf&submodules=geocoder`로 SDK 1회 로드 | 두 지도의 Key ID와 서브모듈을 동일하게 유지 |
| 주소→좌표 | 브라우저 | `naver.maps.Service.geocode` | 공용 큐·중복 제거·캐시를 사용하는 클라이언트 SDK 호출 | `/api/geocode`를 다시 만들지 않음 |
| 좌표→주소 | 브라우저 | `naver.maps.Service.reverseGeocode` | 공용 캐시를 사용하는 클라이언트 SDK 호출 | `/api/reverse-geocode`를 다시 만들지 않음 |
| 기관 기본 목록 | 브라우저 | 저장소의 생성 JS | HTML이 유형별 정적 데이터와 매니페스트를 로드 | 생성물 직접 수정 금지 |
| 공단 상세 | 브라우저 | `data/nhis/details/{기관기호 앞 2자리}/{기관기호}.json` | `nhis-static-data.js`가 수집 매니페스트 확인 후 로드 | 실시간 공단 API 프록시 금지 |
| 공단 사진 | 브라우저 | `data/nhis/photos/{기관기호 앞 2자리}/{기관기호}.json` | 사진 탭을 열 때 정적 사진 매니페스트 로드 | 원본 이미지는 공단 공개 URL 사용 가능 |
| 자동차 길찾기 | 브라우저→Vercel | `https://daycare-directions-proxy.vercel.app/api/directions` | Vercel이 Secret을 붙여 네이버 Directions 15 호출 | 유일하게 유지하는 런타임 서버 API |
| 공단 원천 수집 | GitHub Actions→공공데이터 | 기관검색·시설상세 API, 시설현황·평가 파일 | Python 수집기가 재시도·호출 예산·샤드 체크포인트를 적용 | 키를 HTML·JSON·로그에 기록하지 않음 |
| 공단 사진 수집 | GitHub Actions→공단 공개 페이지 | `longtermcare.or.kr` 상세·썸네일 | 공개 페이지에서 사진 키와 메타데이터만 정규화 | 페이지 구조 변경 시 파서와 화면을 함께 검사 |

## 공단 데이터 파이프라인

| 단계 | 입력 | 처리 | 출력 | 비고 |
|---:|---|---|---|---|
| 1 | 공공데이터 시설별 현황·평가 원문 | 최신 파일 확인 및 원본 보존 | `source-data/nhis-longtermcare-*.xlsx`, `source-data/nhis_longtermcare_evaluations_*.csv` | 원본을 덮어쓰거나 수동 가공하지 않음 |
| 2 | 시설별 현황 XLSX + 기관 검색 API | 기관·급여 조합 병합과 변경 감지 | `data/nhis/catalog.json`, `data/nhis/changes.json` | 기관 기본 목록의 수집 기준 |
| 3 | 시설별 상세조회 API 최대 9개 operation | 기관기호·급여코드별 상세 정규화 | `data/nhis/details/NN/{id}.json` | 성공한 기존 섹션은 병합 보존 |
| 4 | 평가 CSV | 기관기호별 평가 정규화 | `data/nhis/evaluations.json` | 상세 화면의 평가 자료 |
| 5 | 공단 공개 사진 페이지 | 기관별 사진 키·URL·메타데이터 정규화 | `data/nhis/photos/NN/{id}.json` | 기본 상한 10장 |
| 6 | 수집 결과 | 성공 ID, 실패, 샤드 진행상태 기록 | `manifest.json`, `failures/*.json`, `checkpoints/*.json` | 중단된 순환 수집을 이어서 실행 |
| 7 | 전체 생성물 | `npm run check` | 검증 성공 후 Actions bot 커밋·푸시 | `data/nhis`, `source-data` 변경만 자동 반영 |

## 자동 수집 일정

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
| 지도용 데이터 재생성 | 저장소 루트의 Python 가상환경 | `python scripts/build_nationwide_care_services.py` | `nationwide-care-data/*.js`, 매니페스트 생성 |
| 주간 평가 재생성 | 저장소 루트의 Python 가상환경 | `python scripts/build_daycare_evaluations.py` | `nationwide-daycare-evaluations.js` 생성 |
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
| 기관 원본 데이터 | 두 빌드 스크립트, 생성 매니페스트, 전국 주간과 전국 요양 daycare 기관기호 차이 0 |
| 사진 페이지 구조 | 사진 파서, 정적 사진 JSON, 두 지도의 사진 탭 |
| 자동 수집 일정·예산 | 세 cron 합계, 일일 API 한도, 샤드 체크포인트 지속성 |

<!-- SOFTM-INFRA-DOC END -->
