# nationwide-care-services-api

`전국 요양기관찾기`와 `전국 주간` 지도에서 공통으로 사용하는 길찾기 전용 Vercel 서버리스 API입니다. 네이버 Client Secret을 브라우저에 노출할 수 없어서 이 기능만 서버에 유지합니다.

## 제공 API

| 경로 | 방식 | 역할 |
|---|---|---|
| `/api/directions` | POST | 네이버 자동차 경로 계산 |

주소 좌표 변환과 역주소 변환은 지도 프런트의 네이버 Maps JavaScript SDK `geocoder` 서브모듈에서 처리합니다. 공단 상세·사진은 루트 프로젝트의 `data/nhis` 정적 JSON과 공단 원본 사진 URL을 사용합니다. // SOFTM-DIRECTIONS-ONLY 날짜:20260902 : 비밀키가 필요한 경로 계산 외 서버 프록시를 두지 않음

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
npm run deploy
```

Vercel 프로젝트 이름은 Git 저장소와 동일한 `nationwide-care-services-api`를 권장합니다.

## 환경변수

| 변수 | 필수 | 설명 |
|---|---:|---|
| `NAVER_MAPS_API_KEY_ID` | 예 | 네이버 Directions API Key ID |
| `NAVER_MAPS_API_SECRET` | 예 | 네이버 Directions API Secret |

비밀값은 Git에 커밋하지 마세요. `.env.local`과 `.vercel`은 `.gitignore`에 포함돼 있습니다.

## CORS

현재 다음 Origin을 허용합니다.

- `https://softm.github.io`
- `http://localhost:3000`
- `http://127.0.0.1:3000`

프런트 도메인이 바뀌면 각 `api/*.js` 파일의 `ALLOWED_ORIGINS`를 함께 수정해야 합니다.

## 프런트 연결

별도 저장소로 배포한 다음 지도 HTML의 길찾기 기준 주소만 새 Vercel 주소로 교체합니다.

```text
https://daycare-directions-proxy.vercel.app
→ https://nationwide-care-services-api.vercel.app
```

교체 대상은 directions API뿐입니다. 주소 좌표 변환은 프런트의 네이버 Maps JavaScript SDK가 담당하고, 공단 데이터는 정적 JSON으로 배포합니다.

자세한 인수인계 순서는 [MIGRATION.md](./MIGRATION.md)를 참고하세요.
