# 공통
- 중요한 구현 정책, 반복 지침, 프로젝트 운영 규칙은 작업 후 핵심만 정리해 `AGENTS.md`에 누적 기록합니다.
- 코드를 수정,추가한 경우 한줄 변경은 코드 끝에 한줄 주석으로 수정한 내용 (설명 + 날짜)과 함께 표시 (prefix : SOFTM-"키워드"), 여러줄일 경우 블럭주석으로 시작과 끝영역을 표시하고 주석처리한다.
- 코드 수정/추가 시에는 `SOFTM 주석 규칙`을 우선 적용합니다.
- 수정한 경우 검증 후 변경사항을 커밋하고 git에 푸시한다.
- 설명은 한글로 해줘
- "커밋해줘","커밋" 명령시 : Git Commit message Rule : "codex_" + versionCode + "_" + "수정내용" + "_날짜시분초"
- 코드 수정후, 빌드 -> 설치

## SOFTM 주석 규칙
- 코드를 수정하거나 추가한 경우 변경 지점에 `SOFTM-키워드` 형식의 주석을 남깁니다.
- 한 줄 변경은 해당 코드 끝에 한 줄 주석으로 남깁니다.
  - 형식: `// SOFTM-키워드 날짜:YYYYMMDD : 변경 내용`
- 여러 줄 로직을 추가하거나 수정하는 경우 반드시 블럭 주석으로 시작/끝 영역을 표시합니다.
  - 시작: `/** SOFTM-키워드 START 날짜:YYYYMMDD : 변경 내용 */`
  - 종료: `/** SOFTM-키워드 END */`
- 키워드는 변경 목적을 짧게 표현합니다. 예: `SOFTM-NOTI-RECENT`, `SOFTM-OVERLAY`, `SOFTM-ANR`
- 주석 내용은 한글로 작성하고, 무엇을 바꿨는지보다 왜 변경했는지를 중심으로 짧게 남깁니다.
- 기존 SOFTM 주석을 수정할 때도 현재 작업 날짜로 갱신하고, 지난 날짜를 복사해 재사용하지 않습니다.

## 코딩 스타일과 네이밍 규칙
- Java/Kotlin은 4칸 들여쓰기, 클래스는 UpperCamelCase, 멤버는 lowerCamelCase, 상수는 ALL_CAPS를 사용합니다.
- 리소스 파일명과 ID는 snake_case를 유지합니다.
- 자동 포매터가 설정되어 있지 않으므로 Android Studio 기본 서식을 적용하고 기존 `*Util` 패턴을 따릅니다.

# 로컬 Codex 인수인계 지침

## 명칭

- `전국 주간`: `nationwide-daycare-map.html` 기반 전국 주야간보호센터 프로젝트
- `전국 요양`: `nationwide-care-services-map.html` 기반 전국 노인돌봄·요양기관 통합 프로젝트

두 프로젝트를 혼동하지 않는다. 전국 요양의 `type=daycare` 데이터는 전국 주간과 같은 5,751개 기관기호를 사용한다.

## 작업 시작

1. `README.md`를 읽는다.
2. `npm run check`를 실행해 현재 묶음의 기준 상태를 확인한다.
3. 변경할 프로젝트의 HTML, 광고 설정, 데이터 매니페스트만 우선 읽는다.
4. 서버 변경은 `services/vercel-api/api/directions.js`와 정적 `data/nhis` 중 실제 호출 경로를 먼저 확인한다.

## 중요한 동작 기준

- 필터 버튼은 클릭 즉시 목록과 마커에 적용한다.
- 일반 지도 드래그·확대 종료 후 현재 화면영역을 자동 검색한다.
- 목록에서 기관을 선택해 팝업 위치를 맞추는 내부 지도 이동은 자동 재검색을 발생시키지 않는다.
- 선택 기관 마커는 강조 애니메이션 후 상세 팝업을 표시한다.
- 팝업을 닫으면 선택 전 지도 중심과 배율로 복귀한다.
- 공단 상세는 기본정보·상세정보 탭 구조를 유지한다.
- 모바일 상세·비교표는 화면 밖으로 잘리지 않아야 한다.
- 비교표는 컬럼 정렬과 엑셀 다운로드를 유지한다.
- 두 지도 목록 광고는 기본 hybrid 모드에서 6번째 기관 뒤에 기존 카카오 목록 광고를 유지하고, 12번째부터 6개 간격으로 제휴 문의를 표시한다. 첫 광고 단위를 반복 슬롯에 재사용하거나 제휴 카드로 대체하지 않는다. <!-- SOFTM-LIST-AD-RESTORE 날짜:20260904 : 기존 광고 수익 슬롯과 제휴 모집 위치가 다시 뒤바뀌지 않도록 고정 -->
- 제휴 문의는 `partner-inquiry.js`의 공통 오버레이에서 Web3Forms로 전송한다. `partner-inquiry-config.js`의 공개 Access Key는 수신 이메일로 발급한 값을 사용하며 빈 값이면 미연결 안내를 표시한다. 실제 전송 성공 응답 전에는 접수 완료로 표시하지 않는다. <!-- SOFTM-PARTNER-FORM 날짜:20260904 : 두 지도에서 수신처와 실패 처리 정책을 일치 -->
- 제휴 문의는 성공 응답 후 팝업을 자동으로 닫고 화면 중앙에 큰 `접수되었습니다.` 토스트를 4.5초 표시한다. 실패하면 문의창과 입력 내용을 유지한다. <!-- SOFTM-PARTNER-SUCCESS 날짜:20260904 : 접수 결과를 놓치거나 중복으로 제출하지 않도록 완료 동작을 고정 -->
- 통합 `index.html`은 전국 요양 8개 `type` 카테고리 직행 링크를 표시하고, `index-ad-config.js`의 인덱스 전용 PC 728×90·모바일 320×100 상단 배너를 사용한다. 전국 요양 광고 단위를 재사용하지 않는다. <!-- SOFTM-INDEX-AD-UNIT 날짜:20260903 : 화면별 광고 승인과 집계가 서로 섞이지 않도록 설정 경계를 고정 -->
- 검색 대표 Origin은 `https://homecare.designboard.net`이며 canonical·OG·구조화 데이터·`robots.txt`·`sitemap.xml`과 Vercel CORS 허용 Origin을 함께 유지한다. 검색엔진 등록에는 루트의 단일 `sitemap.xml`만 제출한다. <!-- SOFTM-SEO-DOMAIN 날짜:20260903 : 검색 신호와 공개 서비스 호출 출처가 예전 GitHub 주소로 갈라지지 않도록 운영 기준을 고정 -->
- 공개 사이트 브랜드는 `돌봄한눈`으로 통일하고 유형별 정적 검색 대표 페이지와 `nationwide-care-services-map.html?type=...` 지도 도구를 분리한다. 주야간보호 검색 대표는 `nationwide-daycare-map.html`이며 지도 도구 쿼리 URL을 사이트맵에 다시 넣지 않는다. <!-- SOFTM-SEO-LANDING 날짜:20260903 : 브랜드 신호와 동일 데이터 페이지의 검색 순위가 분산되지 않도록 색인 경계를 고정 -->
- `nationwide-care-services-map.html`의 robots 메타는 사용자 요청에 따라 `index,follow`로 유지하고 `noindex`를 다시 추가하지 않는다. 기존 canonical·사이트맵 대표 페이지 연결은 유지한다. <!-- SOFTM-SEO-INDEX 날짜:20260904 : 지도 주소의 검색 등록을 코드에서 차단하지 않도록 사용자 변경 지시를 기록 -->
- 검색 유입 작업은 `docs/SEARCH_OPERATIONS.md`에 따라 배포·등록 요청·실제 브랜드 검색 노출·검색 클릭을 구분해서 확인한다. `scripts/check-search-readiness.mjs` 통과만으로 검색 유입 목표를 완료 처리하지 않는다. <!-- SOFTM-SEARCH-OPERATIONS 날짜:20260904 : 사용자가 요구한 실제 방문 유입을 로컬 설정 성공으로 대체하지 않도록 검증 기준을 고정 -->

## 데이터 원칙

- 원본은 `source-data`에 보존한다.
- 생성된 `nationwide-care-data/*.js`, `nationwide-care-manifest.js`, `nationwide-daycare-evaluations.js`를 직접 임의 수정하지 않는다.
- 데이터를 재생성하면 `npm run check`로 개수·중복·참조 누락을 확인한다.
- 전국 주간과 전국 요양 `daycare`의 기관기호 집합 차이는 0이어야 한다.
- 공단 상세·사진은 `data/nhis`의 정적 JSON을 단일 기준으로 사용하고 두 지도가 `nhis-static-data.js`를 공유한다. // SOFTM-NHIS-POLICY 날짜:20260902 : 실시간 공단 크롤링 서버가 다시 생기지 않도록 정적 배포 구조를 고정
- 시설별 상세조회 JSON이 아직 없는 기관은 오류 화면 대신 공단 시설별 현황·평가의 주소·정원·인력·평가 요약을 표시하고, JSON 수집 후 같은 화면에서 상세 항목으로 자동 전환한다. // SOFTM-NHIS-FALLBACK 날짜:20260903 : 장기 순환 수집 기간에도 두 지도의 공단 정보를 중단 없이 제공
- `details` 수집은 시설별 상세조회 OpenAPI와 공단 공개 상세 페이지의 기본정보(11)·인력/근속(14)·CCTV(19)를 결합한다. 화면 고유 항목도 `data/nhis/details`에 정적으로 저장하고 브라우저 실시간 크롤링으로 되돌리지 않는다. // SOFTM-NHIS-OFFICIAL-PAGE 날짜:20260903 : 공단 원문 링크와 같은 공개 정보 범위를 Vercel 없이 유지
- 상세 수집 규격을 바꾸면 `DETAIL_PROFILE`도 변경해 완료된 예전 샤드 체크포인트가 새 필드 수집을 건너뛰지 않게 한다. // SOFTM-NHIS-OFFICIAL-PAGE 날짜:20260903 : 장기 전체수집의 규격 전환 누락을 방지
- 기관별 공단 상세는 `data/nhis/details/NN/{기관기호}.json.gz`로 직접 저장하고 비압축 상세 JSON은 배포하지 않는다. `nhis-static-data.js`, 매니페스트, 검증기의 확장자를 함께 유지한다. // SOFTM-NHIS-GZIP 날짜:20260903 : 전체 상세가 GitHub Pages 용량 한도를 넘지 않도록 압축 배포 규격을 고정
- 공공데이터 서비스키는 로컬 `.env.local`과 GitHub Actions Secret `DATA_GO_KR_SERVICE_KEY`에만 두며 HTML·정적 JSON·로그에 넣지 않는다.

## 서버 원칙

- API Secret이나 토큰을 코드·문서·Git에 기록하지 않는다.
- 주소 좌표 변환과 역주소 변환은 `naver-geocoder.js`의 네이버 Maps JavaScript SDK `geocoder` 서브모듈을 사용하며 `/api/geocode`·`/api/reverse-geocode` 서버 프록시를 다시 추가하지 않는다.
- 전국 주간·전국 요양 SDK는 신규 통합 Maps Application Key ID `etfcybk8vf`를 `ncpKeyId`로 사용한다. 기존 `p4sjps53pa`는 구형 Web Dynamic Map Client ID이므로 두 전국 지도에 다시 사용하지 않는다.
- 두 지도는 `naverGeocoder:v1:*` 주소 캐시와 기존 `daycareCoord`·`careCoord` 기관 좌표 캐시 호환성을 유지한다.
- Vercel API의 허용 Origin을 바꾸면 모든 핸들러를 동일하게 수정한다.
- 공단 공개 사진 페이지 구조가 바뀌면 `scripts/sync_nhis_static.py`의 사진 매니페스트 파서와 직접 이미지 표시를 함께 회귀검사한다.
- 공단 상세·사진은 브라우저 실시간 API를 만들지 않고 GitHub Actions에서 정적 JSON으로 수집한다. Client Secret이 필요한 길찾기만 Vercel 서버에 유지한다.
- 프런트 API 주소를 변경할 때 전국 주간과 전국 요양을 모두 검색해 교체한다.

## 인프라 구조

<!-- SOFTM-INFRA-MEMORY START 날짜:20260903 : 서버와 정적 데이터의 책임 경계를 이후 작업에서도 일관되게 적용 -->

- 상세 구성표와 데이터 흐름은 `docs/INFRASTRUCTURE.md`를 단일 인수인계 문서로 사용하고 인프라 변경 시 코드와 함께 갱신한다.
- 공개 화면은 GitHub Pages 정적 호스팅, 로컬 화면은 저장소 루트의 `npm run serve`(`http://localhost:3000`)로 실행한다.
- 브라우저의 서비스 외부 호출은 네이버 Maps JavaScript SDK, Vercel `/api/directions`, 사용자가 제휴 문의를 제출할 때의 Web3Forms `https://api.web3forms.com/submit`을 사용한다. 주소 변환은 SDK, 공단 상세·사진은 정적 JSON이 담당하고 광고는 기존 카카오 AdFit을 유지한다. <!-- SOFTM-PARTNER-INFRA 날짜:20260904 : 승인된 문의 메일 전송 경로를 기존 정적 서비스 구조에 반영 -->
- 공단 수집은 GitHub Actions의 `refresh-nhis-static.yml`과 `scripts/sync_nhis_static.py`가 담당하며 결과를 `source-data`와 `data/nhis`에 커밋한다.
- 공단 수집 종류·주기·명령·완료 판정은 `docs/DATA_COLLECTION.md`를 기준으로 하며 워크플로, 수집 범위, 호출 한도, 체크포인트 방식이 바뀌면 같은 작업에서 문서를 갱신한다. <!-- SOFTM-NHIS-COLLECTION-DOC 날짜:20260903 : 실행 방식 변경 후 오래된 명령이 남지 않도록 문서 동기화를 필수화 -->
- 전체 수집의 다음 회차는 이전 Actions 실행과 `github-actions[bot]` 커밋이 완료된 뒤 호출한다. 실행 중 미리 큐에 넣으면 이전 SHA를 사용해 체크포인트를 이어받지 못할 수 있다. <!-- SOFTM-NHIS-RUN-SEQUENCE 날짜:20260903 : 동일 구간 중복 수집과 push 충돌을 방지 -->
- 비밀값은 공공데이터 `DATA_GO_KR_SERVICE_KEY`와 Vercel의 `NAVER_MAPS_API_SECRET`이며 HTML·정적 JSON·로그·문서에 실제 값을 남기지 않는다.
- 정적 서버와 Vercel 로컬 개발 서버는 기본 포트가 겹칠 수 있으므로 동시에 검증할 때 한쪽 포트를 명시적으로 변경한다.

<!-- SOFTM-INFRA-MEMORY END -->

## 완료 전 검사

- `npm run check`
- 데스크톱과 모바일에서 두 지도 로딩
- 필터 즉시 반영과 지도 이동 자동 검색
- 목록 선택 → 마커 강조 → 팝업 → 닫기 후 복귀
- 비교표 정렬·엑셀 저장
- 공단 기본정보·상세정보·사진
- PC·모바일·목록 광고 슬롯

ZIP을 다시 만들 때 파일명 앞에 `YYYYMMDD_`를 붙인다.
