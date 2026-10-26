# Softm Hannun Firebase API

돌봄한눈과 주유한눈에서 공통으로 사용하는 네이버 자동차 길찾기 API입니다. 브라우저에는 공개 Firebase 함수 URL만 전달하고, 네이버 API Secret은 Google Secret Manager에만 저장합니다.

## 운영 구성

- Firebase 프로젝트: `softm-hannun-api`
- 함수: `directions`
- 리전: `asia-northeast3`(서울)
- 런타임: Node.js 22
- 허용 Origin: `https://homecare.designboard.net`, `https://softm.github.io`, 로컬 개발 주소
- 상한: 최대 인스턴스 3개, 인스턴스당 동시 요청 30개, 호출당 15초
- Artifact Registry: 7일이 지난 함수 이미지를 자동 정리

## 비밀키와 배포

```bash
npx -y firebase-tools@latest functions:secrets:set NAVER_MAPS_API_SECRET --project softm-hannun-api
npm run check
npx -y firebase-tools@latest deploy --only functions:shared-api:directions --project softm-hannun-api
```

실제 비밀값은 소스·문서·로그에 기록하지 않습니다. `NAVER_MAPS_API_KEY_ID`는 기존 네이버 Maps 애플리케이션의 공개 식별자인 `etfcybk8vf`를 유지합니다.

운영 주소는 `https://asia-northeast3-softm-hannun-api.cloudfunctions.net/directions`입니다. 배포 뒤 저장소 루트에서 `node scripts/check-directions-readiness.mjs`를 실행해 공식 Origin의 CORS와 실제 경로 응답을 확인합니다. <!-- SOFTM-FIREBASE-DIRECTIONS 날짜:20261026 : 배포 성공과 실사용 응답 검증을 분리하지 않음 -->
