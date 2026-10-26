# Firebase 공용 길찾기 규칙

- 이 디렉터리는 돌봄한눈과 주유한눈이 공유하는 네이버 자동차 길찾기 함수만 담당한다.
- 런타임은 Firebase Functions v2 Node.js 22, 리전은 `asia-northeast3`, 코드베이스는 `shared-api`를 유지한다.
- `NAVER_MAPS_API_SECRET`은 Google Secret Manager에서 함수에 바인딩하고 소스·문서·로그·로컬 예제에 실제 값을 기록하지 않는다.
- 허용 Origin은 `https://homecare.designboard.net`, `https://softm.github.io`, 명시된 로컬 개발 주소로 제한한다.
- 주소 변환·역주소 변환은 브라우저의 네이버 Maps JavaScript SDK가 담당하며 이 함수에 추가하지 않는다.
- 응답 계약 `{summary, path, section}`을 바꿀 때는 돌봄한눈과 주유한눈을 함께 수정하고 회귀검사한다.
- 배포 전 `npm run check`, 배포 후 루트의 `node scripts/check-directions-readiness.mjs`를 실행한다.

<!-- SOFTM-FIREBASE-DIRECTIONS 날짜:20261026 : 공용 함수의 범위·비밀값·배포 검증 기준을 고정 -->
