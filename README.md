# 돌봄한눈 — 전국 주간 + 전국 요양 통합 소스

로컬 Codex에서 두 지도 프로젝트를 한 번에 이어서 작업할 수 있도록 프런트엔드, 공식 원본 데이터, 정적 공단 스냅샷, 데이터 생성 스크립트, 광고 설정과 길찾기 서버 코드를 한 폴더에 모았습니다.

## 프로젝트 구분

| 별칭 | 시작 파일 | 역할 |
|---|---|---|
| 전국 주간 | `nationwide-daycare-map.html` | 전국 주야간보호센터 전용 검색·비교 지도 |
| 전국 요양 | `nationwide-care-services-map.html` | 요양시설·주야간보호·방문요양·방문간호·방문목욕·단기보호·복지용구·치매전담형·요양병원 통합 지도 |
| 통합 시작 | `index.html` | 9개 기관 유형 선택 → 유형 안내 → 통합 지도 | <!-- SOFTM-INDEX-UNIFIED 날짜:20260904 : 실제 공통 진입 순서를 문서와 일치 -->

통합 시작 화면은 주야간보호를 포함한 9개 기관 유형 안내로 들어가는 링크와 `index-ad-config.js`의 전용 광고 설정을 사용합니다. 광고는 PC `728×90`, 모바일 `320×100` 상단 배너이며 전국 요양 광고 단위와 분리됩니다. <!-- SOFTM-INDEX-AD-UNIT 날짜:20260904 : 승인된 인덱스 광고의 화면별 집계를 요양 지도와 분리 -->

공개 서비스 브랜드는 `돌봄한눈`이며 검색 노출에는 보호자가 사용하는 `요양원`, `주야간보호센터`, `방문요양센터`, `요양병원` 용어를 우선 사용합니다. 검색엔진에는 유형별 정적 소개 페이지를 제출하고 `nationwide-care-services-map.html?type=...` 쿼리 주소는 실제 지도 도구로만 사용합니다. 주야간보호의 검색 대표 페이지는 `daycare-map.html` 안내이며, 실제 검색·비교는 다른 유형과 같은 `nationwide-care-services-map.html?type=daycare` 지도에서 실행합니다. <!-- SOFTM-SEO-LANDING 날짜:20260904 : 브랜드·검색 페이지·지도 도구의 역할이 다시 혼재되지 않도록 운영 기준을 기록 -->

9개 안내 화면의 광고는 지도 찾기·자료 요약 다음에 한 개씩 배치합니다. 발급할 광고 규격과 연결 절차는 [`docs/AD_SETUP.md`](docs/AD_SETUP.md)를 참고하세요. <!-- SOFTM-LANDING-ADS 날짜:20260904 : 2단계 전용 광고 발급과 주야간보호의 동일한 진입 흐름을 안내 -->

## 로컬 실행

브라우저에서 HTML 파일을 직접 열지 말고 HTTP 서버로 실행합니다.

```bash
npm run serve
```

그다음 다음 주소를 엽니다.

- `http://localhost:3000/`
- `http://localhost:3000/nationwide-daycare-map.html`
- `http://localhost:3000/nationwide-care-services-map.html?type=daycare`

네이버 지도 클라이언트 설정에서 로컬 주소가 허용되지 않으면 지도 인증 오류가 날 수 있습니다. 현재 Maps Application의 Web 서비스 URL에는 배포 Origin과 `http://localhost:3000`을 등록해야 합니다. 로컬 통합 검증은 `python3 -m http.server 3000`으로 실행하며, 등록하지 않은 `127.0.0.1`로 바꾸면 별도 Origin으로 판정됩니다.

## 디렉터리

```text
.
├── index.html
├── index-ad-config.js              # 인덱스 PC·모바일 전용 광고 단위
├── nationwide-daycare-map.html
├── nationwide-daycare-ad-config.js
├── nationwide-care-services-map.html
├── care-data.js                    # 두 지도의 공용 검색 자료 로더
├── data/care/                      # 수집 JSON에서 생성한 압축 검색 인덱스
├── data/hira/                      # 심평원 요양병원 JSON
├── nationwide-care-ad-config.js
├── source-data/                    # 공단·심평원 원본
├── data/nhis/                      # GitHub Pages가 제공하는 정적 공단 JSON
├── nhis-static-data.js             # 두 지도의 상세·사진 공용 로더
├── scripts/                        # 데이터 재생성·검증
├── services/vercel-api/            # Client Secret이 필요한 길찾기 전용 API
└── docs/reference-images/          # 최근 UI·광고 검수 참고 이미지
```

## 데이터 재생성

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm run build
npm run check
```

`build_nationwide_care_services.py`는 `data/nhis/catalog.json`·`evaluations.json`·기관별 상세와 `data/hira/nursing-hospitals.json`만 읽어 `data/care/*.json.gz`·`manifest.json`을 만듭니다. 두 지도는 `care-data.js`로 같은 검색 자료를 읽으며 상세·사진은 기존 기관별 JSON을 사용합니다. 검색 인덱스는 수만 개 상세 파일을 첫 화면에서 내려받지 않도록 만든 재생성 가능 자료이며 별도 원본이 아닙니다. 심평원 원본 교체 시에만 `python scripts/import_hira_hospitals.py`를 먼저 실행합니다. <!-- SOFTM-DATA-UNIFIED 날짜:20260904 : 수집 JSON을 지도 정보의 단일 입력으로 고정 -->

<!-- SOFTM-CARE-CATEGORIES START 날짜:20260904 : 재생성 시 기본 급여와 치매전담 포함 범위를 보존 -->
급여 분류는 `scripts/care_categories.py`를 생성기와 수집기가 공유합니다. 요양원·공동생활가정에는 시설 치매전담실과 치매전담형 공동생활가정을, 주·야간보호에는 치매전담실을 포함합니다. 복지용구(B06/C06)도 별도 안내·지도로 제공합니다. 치매전담형은 기본 유형에 포함된 기관의 모아보기이며 요양병원은 의료기관으로 구분합니다.

통합 데이터 생성 명령은 두 지도가 공용으로 읽는 자료와 유형 안내의 기관 수를 함께 갱신합니다. 두 지도의 주야간보호 기관기호·급여·정원·인력·평가는 항상 일치해야 하며 기관 수는 현재 수집 목록과 대조합니다. 기존 기관 데이터 JS와 별도 주간 평가 생성기는 제거했습니다. <!-- SOFTM-DATA-UNIFIED 날짜:20260904 : 과거 원본의 고정 개수와 별도 JS 재생성을 폐기 -->
<!-- SOFTM-CARE-CATEGORIES END -->

## 공단 정적 데이터

브라우저는 공단 상세 페이지나 공공데이터 API를 실시간 호출하지 않습니다. GitHub Actions가 공식 [기관 검색 API](https://www.data.go.kr/data/15059029/openapi.do), [시설별 상세조회 API](https://www.data.go.kr/data/15058856/openapi.do), [시설별 현황](https://www.data.go.kr/data/15124763/fileData.do), [평가 결과](https://www.data.go.kr/data/15104801/fileData.do)와 공단 공개 상세 페이지를 수집하고 `data/nhis`에 정규화합니다. 상세 페이지에서는 OpenAPI에 없는 기본정보(이메일·운영시간·보험·최종변경일), 인력 근속현황, CCTV현황을 보완하며 사진은 별도 JSON으로 수집합니다. 두 지도는 같은 기관별 상세·사진 JSON을 사용하며, 사진 탭을 열 때만 사진 매니페스트를 읽습니다. // SOFTM-NHIS-OFFICIAL-PAGE 날짜:20260903 : 공단 화면과 동일한 공개 항목을 Vercel 없이 정적 수집

자동·수동 수집 종류, 실행 주기, 명령, Run ID 확인과 전체 완료 판정은 [`docs/DATA_COLLECTION.md`](docs/DATA_COLLECTION.md)를 기준으로 운영합니다. <!-- SOFTM-NHIS-COLLECTION-DOC 날짜:20260903 : 실행 중복과 체크포인트 누락 없이 수집을 이어가도록 운영 절차를 단일 문서로 연결 -->

로컬 키는 `.env.local`의 `DATA_GO_KR_SERVICE_KEY`에만 저장합니다. 저장소에는 빈 예제만 있고, GitHub Actions에는 같은 이름의 Repository Secret을 등록합니다.

```bash
# 특정 기관 전체 강제 갱신
.venv/bin/python scripts/sync_nhis_static.py --mode institution --scope all --institution 24119001267 --type B03 --force

# 14개 샤드 중 하나 갱신
.venv/bin/python scripts/sync_nhis_static.py --mode rotation --scope details,photos --shard-count 14 --shard-index 0 --max-calls 8000

# 실패 기관 재처리
.venv/bin/python scripts/sync_nhis_static.py --mode retry --scope details,photos --max-calls 8000

# 전국 전체 갱신(14개 샤드별 체크포인트를 이어서 실행)
.venv/bin/python scripts/sync_nhis_static.py --mode full --scope all --shard-count 14 --shard-index 0 --max-calls 570
```

워크플로는 서울 시간 매일 03:23 증분 갱신(최대 900회), 매일 04:41 순환 갱신(최대 6,800회), 매월 1일 05:17 기준자료 점검(최대 300회)을 예약해 예약 실행 합계를 하루 8,000회 이하로 제한합니다. GitHub가 공개 저장소의 비활성 예약 실행을 중단했다면 Actions 화면에서 `Refresh NHIS static data`를 수동 실행하거나 워크플로를 다시 활성화합니다. 현재 29,153개 기관에는 기관·급여 조합이 43,581개이고 조합마다 상세 API를 최대 9회 호출하므로 이론상 최대치는 392,229회입니다. 8,000회/일을 전부 상세에 사용해도 최소 50일이며, 예약 순환 몫 6,800회/일 기준으로는 최소 58일입니다. 따라서 14개 샤드는 여러 순환에 걸쳐 체크포인트부터 재개됩니다. 사진 분류는 공단 전체 목록 응답에 개별 분류값이 없어 빈 값으로 보존하고, 원문 목록의 `전체` 조회 맥락만 별도 기록합니다.

## 서버 구분

프런트 호스팅, 공단 수집, 정적 데이터, 길찾기 서버의 전체 연결 표는 [`docs/INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md)를 참고합니다. <!-- SOFTM-INFRA-LINK 날짜:20260903 : 운영 구성 변경 시 확인할 단일 인수인계 문서로 연결 -->

| 위치 | 주요 API | 현재 프런트 연결 |
|---|---|---|
| `services/vercel-api` | directions | `daycare-directions-proxy.vercel.app` |

Vercel API를 별도 프로젝트로 옮길 때는 `services/vercel-api/README.md`와 `MIGRATION.md`를 따릅니다. 공단 상세·사진용 Vercel 함수와 ChatGPT Sites Worker는 정적 데이터 전환 후 제거했습니다. Client Secret이 필요한 `/api/directions`만 서버 호출로 유지합니다.

주소→좌표와 좌표→주소 변환은 두 지도에서 `naver-geocoder.js`를 공유하며, 네이버 Maps JavaScript SDK의 `geocoder` 서브모듈을 브라우저에서 사용합니다. 기존 기관별 `daycareCoord`·`careCoord` 캐시는 계속 호환됩니다.

## GitHub Pages

정적 파일은 저장소 루트 구조 그대로 게시할 수 있습니다. 새 프로젝트 저장소에서 Pages 주소가 `/nationwide-care-maps/`처럼 하위 경로가 되더라도 내부 데이터 파일은 상대경로라 동작합니다. 다만 `nationwide-care-services-map.html`의 canonical·OG URL은 실제 공개 주소로 변경해야 합니다.

현재 공식 공개 주소와 검색 대표 Origin은 `https://homecare.designboard.net`입니다. `CNAME`, 세 HTML의 canonical·OG·구조화 데이터, `robots.txt`, `sitemap.xml`, 네이버 Maps Web 서비스 URL과 Vercel `ALLOWED_ORIGINS`를 함께 맞춰야 합니다. <!-- SOFTM-SEO-DOMAIN 날짜:20260903 : 도메인 변경 때 검색 대표 주소와 브라우저 호출 허용 출처가 분리되지 않도록 확인 범위를 명시 -->

## 검색엔진 등록

<!-- SOFTM-SEO-REGIONAL START 날짜:20260904 : 기관 자료가 바뀔 때 검색 페이지와 사이트맵을 함께 갱신하도록 운영 명령을 기록 -->
주간보호센터·요양원·방문요양센터의 지역별 검색 페이지는 `regions/`에 실제 기관 목록을 담은 HTML로 배포합니다. 시도 페이지는 시군구별 기관 수와 목록 링크를, 시군구 페이지는 해당 지역 전체 기관의 주소·공개 평가연도와 지도 연결을 제공합니다.

기관 데이터를 재생성한 후에는 `npm run build`로 지역 페이지·유형별 탐색 링크·단일 사이트맵을 갱신하고 `npm run check`로 검증합니다. 생성된 지역 HTML은 직접 수정하지 않습니다. 공개 반영 확인은 `npm run check:search`로 수행하며, 검색엔진 접수·실제 노출·클릭은 아래 관리 도구에서 별도로 확인합니다.
<!-- SOFTM-SEO-REGIONAL END -->

<!-- SOFTM-SEARCH-REGISTRATION START 날짜:20260903 : 배포 후 소유권 확인과 사이트맵 제출 절차를 반복 가능하게 기록 -->

1. [Google Search Console](https://search.google.com/search-console/)에 `https://homecare.designboard.net/` URL 접두어 속성을 추가하고 소유권을 확인합니다.
2. `sitemap.xml`을 제출하고 URL 검사에서 홈·전국 주간·전국 요양 대표 페이지의 색인을 요청합니다.
3. [네이버 서치어드바이저](https://searchadvisor.naver.com/)에 `https://homecare.designboard.net`을 추가하고 소유권을 확인합니다.
4. 네이버 요청 메뉴에서 `robots.txt`를 검증한 뒤 `https://homecare.designboard.net/sitemap.xml`을 제출합니다.
5. 필요하면 [Bing Webmaster Tools](https://www.bing.com/webmasters/)에서 Google Search Console 속성을 가져옵니다.

소유권 확인용 HTML 파일이나 메타 태그는 각 관리 도구가 발급한 실제 값만 사용하며, 확인 후에도 임의로 삭제하지 않습니다.

<!-- SOFTM-SEARCH-REGISTRATION END -->

## 검사

```bash
npm run check
```

검사는 로컬 참조·구문, 수집 목록과 검색 인덱스의 기관 집합, 유형별 개수·중복·평가, 두 지도의 동일 입력, gzip 로딩·실패 처리, 공단 정적 스키마·필수 표본·사진 상한을 확인합니다. <!-- SOFTM-DATA-UNIFIED 날짜:20260904 : 과거 JS 대신 실제 수집 자료로 검증 -->
