# Local Codex 작업 지침

## 프로젝트 목적

이 저장소는 `전국 요양기관찾기`와 `전국 주간`의 공용 Vercel API입니다. 정적 지도 프런트엔드와 광고 코드는 포함하지 않습니다.

## 구조

- `api/directions.js`: 자동차 경로 계산
- `api/official-detail.js`: 국민건강보험공단 상세 페이지 구조화
- `api/official-image.js`: 공단 사진 프록시
- `vercel.json`: 함수 제한시간과 공통 보안 헤더
- `MIGRATION.md`: 새 Git·Vercel 프로젝트와 프런트 연결 순서

## 작업 원칙

- 실제 API Secret을 소스나 문서에 넣지 않는다.
- 주소 좌표 변환과 역주소 변환은 프런트의 네이버 Maps JavaScript SDK `geocoder` 서브모듈을 사용하고 Vercel API로 다시 만들지 않는다.
- 브라우저 호출 Origin을 추가할 때 모든 API의 `ALLOWED_ORIGINS`를 동일하게 유지한다.
- 외부 응답을 그대로 신뢰하지 말고 입력 검증, 시간 제한, 상태 코드를 유지한다.
- 공단 HTML 파싱 변경 시 기본정보와 사진 탭을 모두 회귀 확인한다.
- 사진 URL은 이전 Vercel 프로젝트에 고정하지 않는다. `PUBLIC_API_BASE_URL` 또는 Vercel 프로젝트 URL을 사용한다.
- 변경 후 반드시 `npm run check`를 실행한다.

## 로컬 Codex 첫 작업

1. `README.md`와 `MIGRATION.md`를 읽는다.
2. `.env.local` 존재 여부만 확인하고 값은 출력하지 않는다.
3. `npm run check`를 실행한다.
4. Vercel 연결이 필요하면 `.vercel/project.json`을 새 프로젝트 기준으로 생성한다.
5. 배포 후 프런트엔드 두 프로젝트의 기존 API 기준 주소를 새 주소로 교체하고 브라우저에서 전체 흐름을 검수한다.
