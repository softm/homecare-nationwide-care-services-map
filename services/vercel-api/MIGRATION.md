# 분리 배포 인수인계

## 1. 새 Git 저장소 생성

권장 저장소 이름은 `nationwide-care-services-api`입니다.

```bash
git init
git add .
git commit -m "Initial Vercel API extraction"
git branch -M main
git remote add origin <새 Git 저장소 URL>
git push -u origin main
```

## 2. 새 Vercel 프로젝트 연결

Vercel에서 새 Git 저장소를 가져오거나 로컬에서 `npx vercel link`를 실행합니다. Framework Preset은 `Other`로 두고 별도의 Build Command나 Output Directory를 설정하지 않습니다.

프로덕션 환경변수는 다음 두 개를 등록합니다.

- `NAVER_MAPS_API_KEY_ID`
- `NAVER_MAPS_API_SECRET`

## 3. API 동작 확인

배포 주소가 `https://nationwide-care-services-api.vercel.app`이라고 가정한 예시입니다.

```bash
curl -i -X POST 'https://nationwide-care-services-api.vercel.app/api/directions' \
  -H 'Origin: https://homecare.designboard.net' \
  -H 'Content-Type: application/json' \
  --data '{"start":{"lat":37.48145,"lng":126.84805},"goal":{"lat":37.4782,"lng":126.8644},"waypoints":[],"option":"traoptimal"}'
```

`directions`는 네이버 Directions API 권한이 켜져 있어야 합니다. 주소 좌표 변환은 프런트의 네이버 Maps JavaScript SDK `geocoder` 서브모듈로, 공단 상세·사진은 루트의 정적 JSON으로 검증합니다. // SOFTM-DIRECTIONS-MIGRATION 날짜:20260902 : 배포 대상 서버를 경로 계산 한 종류로 제한

## 4. 지도 프런트 주소 교체

`전국 요양기관찾기`와 `전국 주간`의 프런트 파일에서 다음 기존 API 기준 주소를 새 프로덕션 주소로 바꿉니다.

```text
https://daycare-directions-proxy.vercel.app
```

연결 대상:

- `/api/directions`

## 5. 완료 조건

- 새 Vercel 프로젝트의 directions API가 응답함
- 공식 공개 Origin `https://homecare.designboard.net`에서 CORS 오류가 없음 <!-- SOFTM-SEO-DOMAIN 날짜:20260903 : 배포 검증 대상이 실제 사용자 접속 도메인과 일치하도록 명시 -->
- 두 지도에서 Maps JavaScript SDK 주소 검색과 행정구역 자동 검색이 동작함
- 경로 찾기가 동작함
- 정적 공단 상세 기본정보와 원본 사진이 열림
- 이전 `daycare-directions-proxy.vercel.app`의 geocode·reverse-geocode 호출이 브라우저 Network 탭에서 발생하지 않음
