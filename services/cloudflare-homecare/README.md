# 돌봄한눈 기관 시범운영 API

<!-- SOFTM-HOMECARE-PILOT START 날짜:20261118 : 무료 시범운영 백엔드의 인증·게시·통계 운영 경계를 문서화 -->

기관 담당자가 운영정보·프로그램·사진을 직접 관리하고 기관 페이지의 조회·전화·문의·길찾기 현황을 확인하는 Cloudflare Worker입니다. 이 서비스는 **결제 약정이 없는 무료 시범운영**만 지원하며 결제·구독·과금 API를 포함하지 않습니다.

## 구성

- Cloudflare Worker JavaScript 모듈
- D1: 기관, 승인된 담당자 권한, 신청, 프로그램, 사진 메타데이터, 시범운영 협약, 일별 통계
- Supabase Storage: 비공개 `homecare-photos`에 JPEG·PNG·WebP 파일 저장
- Cloudflare service binding `ACCOUNT`: 전용 회원 Worker `softm-homecare-members`의 `/api/apps/homecare/session` <!-- SOFTM-LIVE-D1 날짜:20261120 : 현재 전용 회원 인증 바인딩과 운영 문서를 일치 -->
- 익명 일별 집계: 브라우저 난수 쿠키를 날짜·기관·행동 범위의 HMAC으로 변환해 중복 제거

IP 주소, User-Agent, Bearer 토큰과 익명 쿠키 원문은 D1에 저장하지 않습니다. 일별 중복 제거 해시는 날짜가 바뀌면 연결할 수 없으며 예약 작업이 8일이 지난 해시를 삭제합니다. 집계 숫자는 유지됩니다.

Supabase 버킷은 `public=false`를 유지하고 익명 접근 정책을 추가하지 않습니다. 사진은 D1 공개 상태 또는 인증된 멤버십을 확인하는 이 Worker를 통해서만 제공합니다.

## 게시 흐름

1. 담당자가 1회 초대를 사용하거나 기관 운영 신청을 제출합니다.
2. 초대는 즉시 승인된 권한을 만들고, 일반 신청은 `pending`으로만 저장합니다.
3. 운영자가 일반 신청을 별도 검토·승인해야 `institution_memberships.status=approved` 권한이 생깁니다.
4. 담당자가 운영정보·프로그램·사진을 임시 저장합니다. 변경할 때마다 기관 직접 등록 영역은 `draft`로 돌아갑니다.
5. 시범운영 협약에 동의하고 `POST /submit`을 호출해야만 다시 공개됩니다.
6. 협약을 철회하면 즉시 `draft`로 전환됩니다.

따라서 이미 공개한 기관도 수정 중인 작업본을 공개 API가 자동 노출하지 않습니다.

## 로컬 준비

```bash
cd services/cloudflare-homecare
cp .dev.vars.example .dev.vars
npm install
npm run db:migrate:local
npm run dev
```

`wrangler.jsonc`의 D1 `database_id`는 2026-11-20 새로 만든 전용 기관 DB를 가리킵니다. 2026-11-21 `https://softm-homecare-pilot.softm.workers.dev`에 배포하고 회원 Worker와 양방향 서비스 바인딩·Supabase 저장소를 검증했습니다. 운영 웹 공개와 남은 작업은 [운영 연결 기록](../../docs/HOMECARE-DEPLOYMENT.md)을 따릅니다. <!-- SOFTM-LIVE-D1 날짜:20261121 : 실제 Worker 배포와 아직 미공개인 회원 화면을 구분 -->

기관 Worker 단독 `npm run dev`는 API 단위개발용입니다. 로그인·증빙 심사·기관 관리의 로컬 전체 흐름은 [회원 Worker README](../cloudflare-homecare-members/README.md)의 두 Worker 실행 절차를 사용합니다. 운영 검증은 실제 D1·Supabase·secret·양방향 서비스 바인딩과 HTTPS 회원 API를 연결한 뒤 별도로 수행합니다. <!-- SOFTM-LIVE-D1 날짜:20261120 : 전용 회원 프록시를 사용하는 현재 로컬·운영 실행 절차 반영 -->

운영 비밀값은 Wrangler secret으로만 등록합니다.

```bash
npx wrangler secret put EVENT_HASH_SECRET
```

`EVENT_HASH_SECRET`은 32자 이상의 무작위 값이어야 합니다. 운영 인증은 `ACCOUNT` service binding을 우선 사용합니다. `ACCOUNT_API`는 service binding을 사용할 수 없는 로컬 테스트에서만 `/api/apps/homecare/session` 호출의 대체 기준 URL로 사용할 수 있습니다.

허용 Origin은 정확히 다음과 같습니다.

- `https://homecare.designboard.net`
- `https://softm.github.io`
- `http://localhost:3000` — 운영 `wrangler.jsonc`에는 없고 로컬 `.dev.vars`의 `DEV_ALLOWED_ORIGIN`에만 명시한 개발 주소

호스트명 부분 일치, 임의 localhost 포트와 `127.0.0.1`은 허용하지 않습니다.

## D1 설정

마이그레이션은 `migrations/0001_initial.sql`, 현재 전체 스키마는 `schema.sql`에 있습니다.

```bash
npx wrangler d1 migrations apply DB --local
npx wrangler d1 migrations apply DB --remote
```

원격 마이그레이션과 배포는 실제 리소스 식별자·라우트·비밀값을 확인한 뒤 별도로 실행합니다.

<!-- SOFTM-SUPABASE-STORAGE START 날짜:20261121 : 무료 저장소 준비 결과와 담당자 업로드 개방 조건을 분리 -->
이미 생성한 전용 D1을 재사용합니다. Supabase `homecare-photos`의 비공개·5MiB·JPEG/PNG/WebP 제한과 가상 파일 업로드·다운로드·익명 거부·삭제는 확인했습니다. 연결부·계정 상태는 [파일 저장소 문서](../homecare-storage/README.md)를 따릅니다.

`SUPABASE_SECRET_KEY`와 `EVENT_HASH_SECRET`을 Worker secret으로 등록했습니다. 배포된 API에서 가상 기관 승인 후 사진 업로드·체크섬·비공개 상태·삭제를 검증했고 시험 계정·파일·삭제 대기열은 모두 정리했습니다. 사용자의 운영 재개 지시에 따라 `FILE_UPLOADS_ENABLED=true`를 배포했습니다. 공식 웹·HTTPS·가입·업로드 검증 결과는 [운영 연결 기록](../../docs/HOMECARE-DEPLOYMENT.md)에 별도로 남깁니다. 운영 키를 로컬 파일에 복사하지 않습니다. 회원·기관 데이터는 D1에 남습니다. D1의 기존 `r2_key`, `r2_deletion_queue` 이름은 스키마 호환을 위해 유지합니다. R2 구독이나 버킷을 생성하지 않습니다. 독립 자동 백업은 아직 구현하지 않았습니다.
<!-- SOFTM-SUPABASE-STORAGE END -->

## 공통 응답

성공:

```json
{
  "ok": true,
  "data": {}
}
```

실패:

```json
{
  "ok": false,
  "error": {
    "code": "invalid_profile",
    "message": "기관 운영정보가 올바르지 않습니다."
  }
}
```

인증 API는 아래 헤더를 사용합니다.

```http
Authorization: Bearer <account-token>
Origin: https://homecare.designboard.net
```

계정 서비스의 정상 응답은 `{ "uid": "...", "site": "homecare" }`여야 합니다. `site`가 다르거나 빠진 세션은 거부합니다.

인증된 기관 응답에는 1 이상의 `contentRevision`이 포함됩니다. 프로필·프로그램·사진의 모든 생성·수정·삭제와 공개하기 요청은 마지막으로 읽은 값을 표준 조건 헤더로 보내야 합니다.

```http
If-Match: "7"
```

성공하면 같은 응답 `data.contentRevision`에 증가한 값이 옵니다. 프로필·공개하기는 기존 기관 객체, 사진과 프로그램은 기존 객체, 삭제는 `{ "deleted": true, "contentRevision": 8 }` 구조를 유지합니다. 헤더가 없거나 형식이 틀렸거나 다른 담당자가 먼저 저장한 경우 `409 content_conflict`이며, 클라이언트는 최신 기관을 다시 읽은 뒤 사용자가 재검토하도록 합니다. 공개 API에는 내부 revision을 노출하지 않습니다.

## 공개 API

### 기관 직접 등록 정보 조회

`GET /api/public/institutions/:id`

`published` 기관의 프로필, 활성 프로그램, 공개 사진만 반환합니다.

```json
{
  "ok": true,
  "data": {
    "id": "24119001267",
    "name": "햇살요양원",
    "status": "published",
    "publishedAt": "2026-11-18 09:00:00",
    "profile": {
      "displayName": "햇살요양원",
      "summary": "기관 소개",
      "phone": "02-000-0000",
      "email": "care@example.com",
      "website": "https://example.com/",
      "address": "서울특별시 ...",
      "operatingHours": { "weekday": "09:00-18:00" },
      "transportation": "송영 상담 가능",
      "capacity": 30,
      "availableSlots": 2,
      "confirmedAt": "2026-11-18 09:00:00",
      "updatedAt": "2026-11-18 09:00:00"
    },
    "programs": [],
    "photos": []
  }
}
```

`draft` 또는 `suspended` 기관 직접 등록 정보는 `404`로 응답합니다. 기존 공단 정적 정보는 이 Worker가 변경하지 않습니다.

### 공개 사진

`GET /api/public/institutions/:id/photos/:photoId`

기관과 사진이 모두 공개 상태일 때만 파일 객체를 스트리밍합니다.
프로필과 사진 응답은 철회·삭제를 즉시 반영하도록 `Cache-Control: no-store`를 사용합니다.

### 이용 행동 기록

`POST /api/public/events`

```json
{
  "institutionId": "24119001267",
  "type": "detail_view",
  "visitorId": "oHk3tZQ8mN2vL5sR7xC9pW4a"
}
```

지원 행동은 `detail_view`, `phone_click`, `inquiry_click`, `directions_click`입니다. `visitorId`는 선택 항목이지만 교차 Origin 호출에서는 브라우저 세션에 생성한 20~80자의 base64url 난수를 전달해야 안정적으로 중복을 제거할 수 있습니다. 서버는 이 원문을 저장하지 않고 HMAC 입력으로만 사용합니다. 값이 없으면 HttpOnly 쿠키를 보조 수단으로 발급합니다. 같은 익명 브라우저의 같은 날짜·기관·행동은 한 번만 집계하며 `{ "counted": false }`로 중복 여부를 알립니다.

일별 경계는 한국시간 `Asia/Seoul` 자정입니다. `POST /api/public/events`는 허용 목록의 `Origin`을 필수로 요구합니다. 임의 `visitorId`를 계속 바꾸는 자동 요청은 HMAC 중복 제거만으로 차단할 수 없으므로 운영 배포 시 이 경로에 Cloudflare WAF와 Rate Limiting 규칙을 반드시 적용합니다. 시작값은 IP별 1분 60회 초과 시 10분 차단으로 두고 실제 정상 트래픽을 확인해 조정합니다. 이 값은 익명 브라우저 단위의 참고 집계이며 고유 이용자 수가 아니고, 문의·입소·매출 성과를 보장하지 않습니다.

## 기관 담당자 API

### 내 기관과 신청 상태

`GET /api/institutions/me`

```json
{
  "ok": true,
  "data": {
    "user": { "id": "user-id", "email": "", "name": "" },
    "institutions": [],
    "pendingClaims": []
  }
}
```

`institutions`에는 승인된 멤버십만 들어갑니다. `pendingClaims`는 권한이 아니며 기관 수정 API를 사용할 수 없습니다. 각 pending 신청에는 운영자가 검토 뒤 원자 승인할 때 사용하는 `revision`이 포함됩니다.

### 기관 연결

`POST /api/institutions/claim`

1회 초대 즉시 승인:

```json
{ "inviteToken": "기관에 전달한 1회 초대 코드" }
```

공개 모집을 통한 승인 대기 신청:

```json
{
  "institutionId": "24119001267",
  "institutionName": "햇살요양원",
  "contactName": "홍길동",
  "contactEmail": "owner@example.com",
  "contactPhone": "02-000-0000",
  "note": "시범운영 참여 신청",
  "truthful": true
}
```

일반 신청의 기관기호는 공단 형식의 숫자 11자리만 허용합니다. 계정당 승인 대기 신청은 최대 5건이며, 운영 환경에서는 `/api/institutions/claim`에도 IP별 1시간 5회 수준의 WAF/Rate Limiting을 시작값으로 적용합니다. 일반 신청은 `202 Accepted`, `accessGranted: false`, `status: pending`을 반환합니다.

신청자가 쓴 기관명은 신청 행에 별도로 보관되고 승인 전 canonical 기관명을 선점하지 않습니다. 운영자는 승인 전에 공식 기관 카탈로그의 기관기호·기관명과 담당자 연락처를 대조해야 하며, 승인 trigger가 검토한 기관명을 canonical 이름으로 반영합니다.

### 운영정보와 프로그램 전체 저장

`PUT /api/institutions/:id/profile`

공개 기관명과 함께 기관 소개·운영시간·대표 전화·프로그램 중 한 항목 이상이 있어야 저장·게시할 수 있습니다. 담당자가 입력하는 `displayName`은 공개 표시명이며, 검토된 canonical `institutions.name`은 덮어쓰지 않습니다.

`programs`는 이 요청의 배열로 전체 교체되며 기관당 최대 10개입니다.

```json
{
  "displayName": "햇살요양원",
  "summary": "기관 소개",
  "phone": "02-000-0000",
  "email": "care@example.com",
  "website": "https://example.com",
  "address": "서울특별시 ...",
  "operatingHours": { "weekday": "09:00-18:00" },
  "transportation": "송영 상담 가능",
  "capacity": 30,
  "availableSlots": 2,
  "programs": [
    {
      "title": "인지 활동",
      "description": "주 3회",
      "schedule": "월·수·금",
      "sortOrder": 0,
      "active": true
    }
  ]
}
```

개별 프로그램 CRUD도 제공합니다.

- `POST /api/institutions/:id/programs`
- `PATCH /api/institutions/:id/programs/:programId`
- `DELETE /api/institutions/:id/programs/:programId`

### 사진 관리

`POST /api/institutions/:id/photos`는 `multipart/form-data`를 받습니다.

- 파일 필드: `photo` 또는 `file`
- 메타데이터: `caption`, `altText`, `sortOrder`, `isCover`, `published`
- 기관당 최대 10장
- 파일당 최대 5 MiB
- JPEG, PNG, WebP만 허용
- 요청 MIME뿐 아니라 실제 파일 시그니처도 검사
- SVG는 스크립트 위험 때문에 허용하지 않음

메타데이터 수정과 삭제:

- `PATCH /api/institutions/:id/photos/:photoId`
- `DELETE /api/institutions/:id/photos/:photoId`

모든 프로필·프로그램·사진 변경은 기관 상태를 `draft`로 되돌립니다.

인증 응답의 각 사진에는 `previewPath`가 포함됩니다. 이 경로는 `<img src>`에 직접 넣거나 토큰을 쿼리에 붙이지 않습니다. 아래처럼 Bearer 헤더로 가져온 Blob을 일시적인 object URL로 변환해 미리봅니다.

```js
const response = await fetch(photo.previewPath, {
  headers: { Authorization: `Bearer ${token}` },
});
const objectUrl = URL.createObjectURL(await response.blob());
```

미리보기 API는 `GET /api/institutions/:id/photos/:photoId/content`이며 승인된 멤버십을 확인하고 `Cache-Control: private, no-store`로 응답합니다.

사진 삭제는 D1의 사진 행 삭제·기관 `draft` 전환·파일 삭제 대기열 기록을 한 batch에서 먼저 처리합니다. 이후 파일 삭제에 실패하면 `202`와 `storageCleanupPending: true`를 반환하고, 예약 작업이 `r2_deletion_queue`를 50건씩 재시도합니다. 따라서 파일 객체가 잠시 남더라도 공개·인증 사진 경로에서는 즉시 조회되지 않습니다.

업로드는 파일 저장소 저장 뒤 D1 메타데이터를 기록합니다. D1 기록이 실패하면 파일 객체를 즉시 삭제하며, 그 삭제도 실패하면 원래 D1 오류를 유지한 채 `r2_deletion_queue` 등록을 시도합니다. D1까지 사용할 수 없어 queue 등록도 실패한 경우 객체는 private orphan으로 남을 수 있습니다. 운영자는 정기적으로 private 버킷의 `institutions/` 키 목록을 `institution_photos.r2_key`와 `r2_deletion_queue.r2_key`의 합집합과 비교하고, 어느 쪽에도 없는 키를 queue에 넣거나 확인 후 삭제합니다. 이 점검 중에도 버킷을 공개로 바꾸거나 익명 정책을 추가하지 않습니다.

### 시범운영 협약

- `GET /api/institutions/:id/pilot-agreement`
- `POST /api/institutions/:id/pilot-agreement`

동의:

```json
{
  "accepted": true,
  "version": "homecare-pilot-20261118-v1",
  "freePilot": true,
  "noPayment": true,
  "contentAuthority": true,
  "contactRole": "센터장",
  "notes": "무료 시범운영 참여"
}
```

동의할 때는 현재 버전과 무료 시범운영·결제 없음·기관 콘텐츠 등록 권한을 모두 명시적으로 확인해야 합니다. 철회는 `accepted: false`를 보내며, 기존 수락의 버전·확인 항목·담당 역할·메모·수락자·수락시각을 훼손하지 않고 철회자와 철회시각을 별도로 감사 저장합니다. 수락 기록이 없으면 `409 pilot_agreement_not_accepted`입니다. 응답에는 opaque 계정 UID를 노출하지 않고 `acceptedAt`·`withdrawnAt`만 제공합니다. D1 trigger는 철회와 같은 문장 안에서 기관을 `draft`로 전환합니다. 모든 응답은 `billingCommitment: false`이며 D1도 `no_billing_commitment=1`만 허용합니다.

`pilot_agreements`는 최신 상태 행이고, D1 trigger가 같은 상태 변경 문장 안에서 `pilot_agreement_events`에 수락·철회·재수락·차기 버전 변경 스냅샷을 추가합니다. 스냅샷에는 버전, 행위 유형, 감사용 계정 UID, 시각, 당시 역할·메모·세 가지 확인·비결제 확인이 들어갑니다. 이벤트 UPDATE는 항상 금지하고, 기관이 존재하는 동안의 직접 DELETE도 금지합니다. 다만 개인정보 삭제 요청으로 기관 자체를 삭제할 때는 `ON DELETE CASCADE`가 이력도 함께 지울 수 있도록 DELETE trigger가 부모 기관의 부재를 확인해 허용합니다. 협약 이력과 감사용 UID는 일반 기관 API로 제공하지 않습니다.

### 공개하기

`POST /api/institutions/:id/submit`

승인된 `owner` 또는 `editor`, 등록한 프로필, 현재 동의한 시범운영 협약이 모두 있어야 합니다. `If-Match`도 원자적으로 확인하므로 내용을 읽은 뒤 다른 담당자가 저장했다면 끼어든 공개를 거부합니다. MVP에서는 별도 검수 대기 없이 즉시 `published`가 되며 `confirmedAt`과 `contentRevision`을 갱신합니다.

### 조회 현황

`GET /api/institutions/:id/stats?days=7`

`days=7`, `days=30` 또는 최대 366일의 `from=YYYY-MM-DD&to=YYYY-MM-DD`를 지원합니다.

```json
{
  "ok": true,
  "data": {
    "range": { "from": "2026-11-12", "to": "2026-11-18", "days": 7, "preset": "7d" },
    "totals": {
      "detail_view": 12,
      "phone_click": 3,
      "inquiry_click": 1,
      "directions_click": 2
    },
    "daily": []
  }
}
```

## 초대와 신청 승인

1회 초대를 생성합니다. 출력되는 원문 토큰은 D1에 저장하지 않고 담당자에게 한 번만 전달합니다.

```bash
npm run invite -- \
  --institution 24119001267 \
  --name "햇살요양원" \
  --role owner \
  --expires-days 14
```

일반 신청을 검토한 뒤 승인 SQL을 생성합니다.

```bash
npm run claim:approve -- \
  --claim <claim-id> \
  --reviewer <operator-user-id> \
  --role owner \
  --expected-revision <검토한-revision>
```

먼저 D1에서 신청의 연락처·메모·`revision`을 함께 조회해 검토하고, 그 revision을 명령에 그대로 넣습니다. 스크립트는 조건부 `UPDATE ... RETURNING` 한 문장만 생성합니다. D1 trigger가 같은 문장 안에서 새 멤버십을 plain `INSERT`하므로 승인과 권한 생성 사이에 중간 상태가 없습니다. 검토 뒤 신청이 다시 저장되어 revision이 달라졌거나 이미 처리된 신청이면 반환 행이 없으며, 기존 `approved`·`revoked` 멤버십과 충돌하면 문장 전체가 롤백됩니다. 따라서 승인 재실행으로 철회 권한을 복구할 수 없습니다. 승인 전에는 `institution_memberships`를 직접 추가하지 않습니다.

## 검사

```bash
npm test
```

검사는 JavaScript 구문, 정확한 Origin 허용, `uid`·`site` 계정 검증, HTTPS 기관 URL, 프로필·프로그램 입력, 이미지 시그니처·크기, 인증 사진 Blob, 한국시간 일자·7일·30일·직접 기간, 익명 HMAC, 일반 신청의 무권한 `pending` 상태, 초대 1회성, revoked 비복구, 협약 수락 감사 보존과 append-only 이력·기관 삭제 cascade, `contentRevision` 원자 충돌, suspended 차단, 수정·삭제·철회 후 `draft`, D1/파일 삭제·orphan 정리 순서와 일별 행동 집계를 확인합니다. `schema.sql`과 fresh `0001_initial.sql`의 DDL도 실제 SQLite에서 비교합니다.

<!-- SOFTM-HOMECARE-PILOT END -->
