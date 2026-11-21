# 돌봄한눈 파일 저장소

<!-- SOFTM-SUPABASE-STORAGE START 날짜:20261121 : 기관 담당자 업로드와 운영용 백업을 구분하고 연결 준비 범위를 기록 -->

기관 담당자가 사이트에서 기관회원 가입 후 사업자등록증을 제출하고, 승인된 기관의 담당자가 사진을 등록·관리한다. 서비스 운영자가 파일을 대신 올리거나 회원에게 Supabase 가입을 요구하지 않는다. 기존 Workers에서 세션·신청 소유권·기관 멤버십·게시 상태를 검사하며 회원·기관 데이터와 파일 연결 정보는 D1에 유지한다.

## 실제 준비 상태

- 프로젝트 `feaouitfpiqjjqdxrtfx`, 조직 `dolbom-free`, 지역 `ap-southeast-2`(Sydney).
- 2026-11-21 조직 Billing에서 `Free Plan`, `No payment methods`, `Spend cap is enabled`를 확인했다. R2 가입·결제수단 추가·유료 변경은 하지 않았다.
- `homecare-documents`: private, 10,485,760바이트, PDF/JPEG/PNG.
- `homecare-photos`: private, 5,242,880바이트, JPEG/PNG/WebP.
- 두 버킷에 공개 읽기·쓰기를 허용하는 정책은 추가하지 않았다. 서버 secret은 RLS를 우회하므로 요청자의 권한 검사는 기존 Worker가 담당한다. 키의 권한을 특정 버킷으로 제한했다고 설명하지 않는다.
- `verify-storage.mjs`로 실제 버킷에 가상 PNG·PDF 업로드, SHA-256 일치, 익명 public/authenticated 경로 거부, 삭제 후 조회 불가를 확인했다. 시험 파일은 모두 삭제했다. 비밀키는 검증 프로세스 메모리에서만 사용했으며 파일·명령 인자·로그·Git에 기록하지 않았다.
- 전용 서버 키를 회원·기관 Worker의 `SUPABASE_SECRET_KEY`로 등록하고 양방향 서비스 바인딩과 함께 실제 배포했다. 기관 통계용 `EVENT_HASH_SECRET`도 등록했다. 비밀값은 메모리에서 전달했으며 파일·명령 인자·도구 결과·Git에 기록하지 않았다.
- `verify-member-upload.mjs`로 실제 배포 API의 기관 가입 → 증빙 제출 → 승인 → 사진 업로드·조회·삭제 18개 검사를 통과했다. 증빙 체크섬·no-store, 다른 회원의 증빙 접근 거부, 승인 전 권한 없음, 일반회원의 심사 접근 거부, 사진 체크섬·미공개 사진 익명 접근 거부도 확인했다. 시험 계정·관리자·신청·사진·삭제 대기열은 모두 0건으로 정리했다.
- 사용자가 보류했던 운영 로그인·API 연결·실제 업로드를 재개했다. 두 Worker 업로드를 활성화하고 Pages 게이트웨이·카페24 CNAME을 구성했다. 공식 HTTPS·운영 브라우저 검사 결과는 [운영 연결 기록](../../docs/HOMECARE-DEPLOYMENT.md)을 따른다. 위 API 시험만으로 브라우저 검증을 대신하지 않으며 독립 자동 백업·복원은 아직 구현하지 않았다.
- 실제 운영 사이트의 기관 가입·PDF 제출·사용자 admin의 심사 승인·사진 업로드/미리보기/공개/삭제와 비공개 접근 제한을 Aside 및 별도 headless 브라우저에서 확인했다. 가상 기관·회원·파일 연결 자료와 삭제 대기열은 0건으로 정리하고 실제 admin만 유지했다. <!-- SOFTM-LIVE-UI 날짜:20261121 : API 검사와 실제 화면 검증을 구분하고 정리 결과 기록 -->
- 검증: `npm run check` 통과, 회원 셸 280개 및 기존 지도·정적 검사 통과. Workers에서 지원하지 않는 `redirect: error`를 `manual`과 3xx 거부로 고쳤고 전역 fetch 수신 객체를 보존했다. 저장소 관련 12개 검사에는 런타임 호환·외부 리디렉션 거부·다른 회원 접근 차단·삭제 장애 재시도를 포함한다.

## 서버 연결

`file-storage.mjs`가 기존 `put/get/delete` 동작을 Supabase Storage REST API로 변환한다. `FILE_STORAGE_PROVIDER=supabase`일 때만 사용하며 연결 실패를 R2로 우회하지 않는다. 기존 D1의 `r2_key`, `r2_deletion_queue`는 적용된 스키마와 삭제 대기열을 보존하기 위해 유지한 이름이다. 실제 파일 본문은 D1에 저장하지 않는다.

각 Worker 설정에는 프로젝트 URL과 해당 버킷 이름만 둔다. `SUPABASE_SECRET_KEY`는 Worker secret에 등록되어 있다. `sb_secret_…` 서버 키만 허용하며 브라우저의 publishable 키와 세션 토큰을 대신 사용하지 않는다. 키는 HTTP `apikey` 헤더에만 넣고, 공식 프로젝트 HTTPS 주소만 허용하며 다른 주소로 리디렉션하지 않는다. Workers가 지원하는 `manual` 모드에서 3xx 응답을 직접 거부한다. upstream 오류 본문은 사용자 응답이나 로그에 전달하지 않는다.

현재 두 운영 설정은 사용자 지시에 따라 `FILE_UPLOADS_ENABLED=true`다. 필요하면 이 스위치로 새 업로드를 중단할 수 있으며 이미 보관한 파일의 권한 있는 조회·삭제·정리 작업은 계속 제공한다. 로컬 개발에 운영 비밀키를 복사하지 않는다. 자동 테스트는 외부 연결 없이 주입한 저장소와 SQLite로 검증한다. 검증 도구가 운영 업로드 설정을 임의로 비활성화하지 않도록 실행 전 현재 상태를 확인한다.

업로드는 비공개 버킷·크기·MIME 제한을 다시 확인하고 UUID 경로에 새 파일만 생성한다. 같은 경로를 자동 덮어쓰지 않는다. 공급자의 부재 응답 중 객체 없음만 `null`로 처리하며 버킷 부재·인증 오류·서비스 일시중지는 오류로 전달한다. 삭제 성공 응답을 확인하기 전에는 기존 D1 삭제 대기열을 지우지 않는다. 네트워크 단절로 업로드 결과가 불확실한 경우에는 비공개 고아 파일 점검도 필요하다.

## 운영 확인과 후속 보완

1. 완료된 Worker·secret·양방향 바인딩과 공식 API 게이트웨이를 유지한다. 유료 전환은 하지 않는다.
2. 실제 사이트의 기관 담당자 가입 → 증빙 제출 → 운영자 심사 → 기관 사진 등록·공개·삭제 검증을 완료했다. 사용자가 직접 가입한 지정 admin만 연결했으며 이후에도 공개 가입으로 운영자 권한을 부여하지 않는다.
3. 무료 한도를 고려한 사진 축소, 전체 저장량·요청량 제한과 사용량 확인을 보완한다. 현재 장당 제한만으로 총량 제한이 구현됐다고 간주하지 않는다.
4. 운영용 독립 백업의 위치·실행 환경·보관 기간을 정하고 테스트 파일 복원을 검증한다. 이는 기관 담당자에게 추가 업로드를 요구하는 기능이 아니다. 아직 자동 백업을 구현하지 않았다.
5. 개인정보 안내에는 Supabase와 실제 저장 지역인 호주 시드니, 증빙 열람 권한·사진 게시·삭제 범위를 반영했다. 저장 제공자·지역·처리 흐름이 바뀌면 함께 갱신한다.

공식 기준: [API 키](https://supabase.com/docs/guides/api/api-keys), [비공개 버킷](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Storage 오류](https://supabase.com/docs/guides/storage/debugging/error-codes), [무료 플랜·초과 정책](https://supabase.com/docs/guides/platform/billing-faq). 플랜 상태와 무료 조건은 연결 시점의 확인 결과이며 향후 정책이나 서비스 존속을 보장하지 않는다.

## 실제 API 검증 도구

`verify-member-upload.mjs`는 운영 키를 인자로 받지 않는다. `base`, `origin`, `publicBase`와 시험 계정에만 권한을 부여하는 `grantTestReviewer`, 시험 기관만 정리하는 `removeTestInstitution` 콜백을 명시적으로 주입한다. 무작위 비밀번호·세션 쿠키·CSRF는 프로세스 메모리에서만 사용하며 진행 출력은 검사명·성공 여부와 실패 시 제한된 상태/오류 코드뿐이다. 실행자는 시험 데이터 정리와 기존 업로드 스위치 복구를 확인해야 하며 일반 회원을 관리자에 등록하는 데 사용하지 않는다. 이 외부 검증은 `npm run check`에서 자동 실행하지 않는다.

Workers 런타임 기준: [Request의 redirect 지원 범위](https://developers.cloudflare.com/workers/runtime-apis/request/), [잘못된 this 수신 객체 오류](https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors).

<!-- SOFTM-SUPABASE-STORAGE END -->
