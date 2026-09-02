# 전국 주간 + 전국 요양 통합 소스

로컬 Codex에서 두 지도 프로젝트를 한 번에 이어서 작업할 수 있도록 프런트엔드, 공식 원본 데이터, 데이터 생성 스크립트, 광고 설정과 서버 코드를 한 폴더에 모았습니다.

## 프로젝트 구분

| 별칭 | 시작 파일 | 역할 |
|---|---|---|
| 전국 주간 | `nationwide-daycare-map.html` | 전국 주야간보호센터 전용 검색·비교 지도 |
| 전국 요양 | `nationwide-care-services-map.html` | 요양시설·주야간보호·방문요양·방문간호·방문목욕·단기보호·치매전담·요양병원 통합 지도 |
| 통합 시작 | `index.html` | 두 지도 선택 화면 |

## 로컬 실행

브라우저에서 HTML 파일을 직접 열지 말고 HTTP 서버로 실행합니다.

```bash
npm run serve
```

그다음 다음 주소를 엽니다.

- `http://localhost:8000/`
- `http://localhost:8000/nationwide-daycare-map.html`
- `http://localhost:8000/nationwide-care-services-map.html?type=daycare`

네이버 지도 클라이언트 설정에서 로컬 주소가 허용되지 않으면 지도 인증 오류가 날 수 있습니다. 현재 서버 API의 CORS는 `http://localhost:3000`과 `http://127.0.0.1:3000`을 허용하므로 API까지 동일 조건으로 시험하려면 `python3 -m http.server 3000`을 사용하세요.

## 디렉터리

```text
.
├── index.html
├── nationwide-daycare-map.html
├── nationwide-daycare-data-*.js
├── nationwide-daycare-evaluations.js
├── nationwide-daycare-ad-config.js
├── nationwide-care-services-map.html
├── nationwide-care-manifest.js
├── nationwide-care-data/
├── nationwide-care-ad-config.js
├── source-data/                    # 공단·심평원 원본
├── scripts/                        # 데이터 재생성·검증
├── services/vercel-api/            # 지도·경로·공단 상세 Vercel API
├── services/daycare-nhis-detail-api/ # 공단 상세·사진 ChatGPT Sites Worker
└── docs/reference-images/          # 최근 UI·광고 검수 참고 이미지
```

## 데이터 재생성

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/build_nationwide_care_services.py
python scripts/build_daycare_evaluations.py
npm run check
```

`build_nationwide_care_services.py`는 `source-data`의 공단 XLSX·평가 CSV·심평원 CSV로 `nationwide-care-data`와 매니페스트를 다시 만듭니다.

## 서버 구분

| 위치 | 주요 API | 현재 프런트 연결 |
|---|---|---|
| `services/vercel-api` | directions, official-detail, official-image | `daycare-directions-proxy.vercel.app` |
| `services/daycare-nhis-detail-api` | nhis-detail, nhis-photo | `daycare-nhis-detail-api.softm.chatgpt.site` |

Vercel API를 별도 프로젝트로 옮길 때는 `services/vercel-api/README.md`와 `MIGRATION.md`를 따릅니다. Sites Worker는 해당 하위 폴더를 프로젝트 루트로 열어 작업합니다.

주소→좌표와 좌표→주소 변환은 두 지도에서 `naver-geocoder.js`를 공유하며, 네이버 Maps JavaScript SDK의 `geocoder` 서브모듈을 브라우저에서 사용합니다. 기존 기관별 `daycareCoord`·`careCoord` 캐시는 계속 호환됩니다.

## GitHub Pages

정적 파일은 저장소 루트 구조 그대로 게시할 수 있습니다. 새 프로젝트 저장소에서 Pages 주소가 `/nationwide-care-maps/`처럼 하위 경로가 되더라도 내부 데이터 파일은 상대경로라 동작합니다. 다만 `nationwide-care-services-map.html`의 canonical·OG URL은 실제 공개 주소로 변경해야 합니다.

## 검사

```bash
npm run check
```

검사는 HTML의 로컬 스크립트 누락, JavaScript 구문, 전국 주간 5,751곳, 전국 요양 유형별 매니페스트 개수와 중복 기관기호를 확인합니다.
