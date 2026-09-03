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
- 목록 광고는 전국 요양에서 6개마다 슬롯을 만들고 각 슬롯을 독립적으로 바인딩한다.
- 통합 `index.html`은 전국 요양 8개 `type` 카테고리 직행 링크를 표시하고, 기존 요양 광고 설정의 PC 728×90·모바일 320×100 상단 배너를 공유한다. <!-- SOFTM-INDEX-ENTRY 날짜:20260903 : 첫 화면의 광고 규격과 카테고리 진입 경로가 서로 어긋나지 않도록 운영 기준을 고정 -->

## 데이터 원칙

- 원본은 `source-data`에 보존한다.
- 생성된 `nationwide-care-data/*.js`, `nationwide-care-manifest.js`, `nationwide-daycare-evaluations.js`를 직접 임의 수정하지 않는다.
- 데이터를 재생성하면 `npm run check`로 개수·중복·참조 누락을 확인한다.
- 전국 주간과 전국 요양 `daycare`의 기관기호 집합 차이는 0이어야 한다.
- 공단 상세·사진은 `data/nhis`의 정적 JSON을 단일 기준으로 사용하고 두 지도가 `nhis-static-data.js`를 공유한다. // SOFTM-NHIS-POLICY 날짜:20260902 : 실시간 공단 크롤링 서버가 다시 생기지 않도록 정적 배포 구조를 고정
- 시설별 상세조회 JSON이 아직 없는 기관은 오류 화면 대신 공단 시설별 현황·평가의 주소·정원·인력·평가 요약을 표시하고, JSON 수집 후 같은 화면에서 상세 항목으로 자동 전환한다. // SOFTM-NHIS-FALLBACK 날짜:20260903 : 장기 순환 수집 기간에도 두 지도의 공단 정보를 중단 없이 제공
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

## 완료 전 검사

- `npm run check`
- 데스크톱과 모바일에서 두 지도 로딩
- 필터 즉시 반영과 지도 이동 자동 검색
- 목록 선택 → 마커 강조 → 팝업 → 닫기 후 복귀
- 비교표 정렬·엑셀 저장
- 공단 기본정보·상세정보·사진
- PC·모바일·목록 광고 슬롯

ZIP을 다시 만들 때 파일명 앞에 `YYYYMMDD_`를 붙인다.
