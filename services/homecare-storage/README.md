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
- Worker secret 등록, Worker 배포, 사이트의 실제 회원 업로드, 독립 백업·복원은 **미완료**다. 로그인 문제도 사용자 요청으로 보류 중이다.
- 검증: `npm run check` Node 626개 실패 0·기존 Python/정적 검사·회원 셸 280개 통과, 회원·기관 Worker `deploy --dry-run` 모두 통과. 저장소 관련 신규 10개에는 다른 회원의 증빙 접근 차단과 삭제 장애 후 재시도를 포함한다. 이 결과를 운영 로그인·전체 회원 동선 검증으로 대체하지 않는다.

## 서버 연결

`file-storage.mjs`가 기존 `put/get/delete` 동작을 Supabase Storage REST API로 변환한다. `FILE_STORAGE_PROVIDER=supabase`일 때만 사용하며 연결 실패를 R2로 우회하지 않는다. 기존 D1의 `r2_key`, `r2_deletion_queue`는 적용된 스키마와 삭제 대기열을 보존하기 위해 유지한 이름이다. 실제 파일 본문은 D1에 저장하지 않는다.

각 Worker 설정에는 프로젝트 URL과 해당 버킷 이름만 둔다. `SUPABASE_SECRET_KEY`는 운영 시 Worker secret으로 등록한다. `sb_secret_…` 서버 키만 허용하며 브라우저의 publishable 키와 세션 토큰을 대신 사용하지 않는다. 키는 HTTP `apikey` 헤더에만 넣고, 공식 프로젝트 HTTPS 주소만 허용하며 다른 주소로 리디렉션하지 않는다. upstream 오류 본문은 사용자 응답에 전달하지 않는다.

현재 두 운영 설정은 `FILE_UPLOADS_ENABLED=false`다. 아직 준비 중인 서비스가 실제 회원 파일을 수집하지 않도록 업로드만 차단하며, 이미 보관한 파일의 권한 있는 조회·삭제·정리 작업은 이 스위치와 분리한다. 로컬 `wrangler dev`도 이 기본값을 따른다. 자동 테스트는 외부 연결 없이 주입한 저장소와 SQLite로 검증한다. 검증 코드의 명시적인 가상 파일 시험은 실제 회원 업로드 개방을 뜻하지 않는다.

업로드는 비공개 버킷·크기·MIME 제한을 다시 확인하고 UUID 경로에 새 파일만 생성한다. 같은 경로를 자동 덮어쓰지 않는다. 공급자의 부재 응답 중 객체 없음만 `null`로 처리하며 버킷 부재·인증 오류·서비스 일시중지는 오류로 전달한다. 삭제 성공 응답을 확인하기 전에는 기존 D1 삭제 대기열을 지우지 않는다. 네트워크 단절로 업로드 결과가 불확실한 경우에는 비공개 고아 파일 점검도 필요하다.

## 운영 개방 전

1. 전용 Worker secret, 양방향 서비스 바인딩과 공식 HTTPS API 연결을 준비한다. 유료 전환은 하지 않는다.
2. 보류 중인 로그인 작업을 재개할 때 기관 담당자 가입 → 증빙 제출 → 운영자 심사 → 기관 사진 등록·공개·삭제를 실제 사이트에서 검증한다.
3. 무료 한도를 고려한 사진 축소, 전체 저장량·요청량 제한과 사용량 확인을 보완한다. 현재 장당 제한만으로 총량 제한이 구현됐다고 간주하지 않는다.
4. 운영용 독립 백업의 위치·실행 환경·보관 기간을 정하고 테스트 파일 복원을 검증한다. 이는 기관 담당자에게 추가 업로드를 요구하는 기능이 아니다. 아직 자동 백업을 구현하지 않았다.
5. 해외 저장 지역과 실제 처리 흐름을 개인정보 안내에 반영하고 운영 개방 조건 확인 후 업로드를 활성화한다.

공식 기준: [API 키](https://supabase.com/docs/guides/api/api-keys), [비공개 버킷](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Storage 오류](https://supabase.com/docs/guides/storage/debugging/error-codes), [무료 플랜·초과 정책](https://supabase.com/docs/guides/platform/billing-faq). 플랜 상태와 무료 조건은 연결 시점의 확인 결과이며 향후 정책이나 서비스 존속을 보장하지 않는다.

<!-- SOFTM-SUPABASE-STORAGE END -->
