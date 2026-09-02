# nationwide-care-services-api

`전국 요양기관찾기`와 `전국 주간` 지도에서 공통으로 사용하는 Vercel 서버리스 API입니다. 지도 프런트엔드와 분리해 별도 Git 저장소와 Vercel 프로젝트로 운영하도록 구성했습니다.

## 제공 API

| 경로 | 방식 | 역할 |
|---|---|---|
| `/api/directions` | POST | 네이버 자동차 경로 계산 |
| `/api/official-detail` | GET, POST | 국민건강보험공단 기관 상세 HTML을 구조화 |
| `/api/official-image` | GET | 공단 기관 사진을 안전하게 프록시 |

주소 좌표 변환과 역주소 변환은 서버 API가 아니라 지도 프런트의 네이버 Maps JavaScript SDK `geocoder` 서브모듈에서 처리합니다.

## 로컬 실행

1. `.env.example`을 `.env.local`로 복사하고 실제 값을 입력합니다.
2. Vercel CLI에 로그인합니다.
3. 개발 서버를 실행합니다.

```bash
cp .env.example .env.local
npx vercel login
npm run dev
```

기본 개발 주소는 `http://localhost:3000`입니다. 지도 API 요청은 허용된 Origin에서만 처리됩니다.

## 검사와 배포

```bash
npm run check
npx vercel link
npx vercel env add NAVER_MAPS_API_KEY_ID production
npx vercel env add NAVER_MAPS_API_SECRET production
npx vercel env add PUBLIC_API_BASE_URL production
npm run deploy
```

Vercel 프로젝트 이름은 Git 저장소와 동일한 `nationwide-care-services-api`를 권장합니다. 배포 후 `PUBLIC_API_BASE_URL`은 실제 프로덕션 주소로 설정하고 한 번 더 배포합니다.

## 환경변수

| 변수 | 필수 | 설명 |
|---|---:|---|
| `NAVER_MAPS_API_KEY_ID` | 예 | 네이버 Directions API Key ID |
| `NAVER_MAPS_API_SECRET` | 예 | 네이버 Directions API Secret |
| `PUBLIC_API_BASE_URL` | 권장 | 사진 프록시 절대 URL을 만들 새 API 프로덕션 주소 |

비밀값은 Git에 커밋하지 마세요. `.env.local`과 `.vercel`은 `.gitignore`에 포함돼 있습니다.

## CORS

현재 다음 Origin을 허용합니다.

- `https://softm.github.io`
- `http://localhost:3000`
- `http://127.0.0.1:3000`

프런트 도메인이 바뀌면 각 `api/*.js` 파일의 `ALLOWED_ORIGINS`를 함께 수정해야 합니다.

## 프런트 연결

별도 저장소로 배포한 다음 지도 HTML에 남아 있는 기존 주소를 새 Vercel 주소로 교체합니다.

```text
https://daycare-directions-proxy.vercel.app
→ https://nationwide-care-services-api.vercel.app
```

교체 대상은 directions와 official-detail API입니다. 주소 좌표 변환은 프런트의 네이버 Maps JavaScript SDK가 담당하며, 사진 상세에 별도로 사용하는 `daycare-nhis-detail-api.softm.chatgpt.site`는 이 저장소에 포함되지 않습니다.

자세한 인수인계 순서는 [MIGRATION.md](./MIGRATION.md)를 참고하세요.
