# 돌봄한눈 전용 회원 서비스

기존 정적 웹을 유지하고 아이디·SNS 계정, 회원 기록, 비공개 기관 증빙과 운영자 심사를 Workers/D1와 Supabase Storage에서 처리한다. `../cloudflare-homecare`의 기관 운영정보 API와 승인된 멤버십을 재사용한다. 다른 한눈서비스의 공통 계정은 변경하지 않는다.

## 로컬 검증

Node 22.13 이상에서 이 디렉토리의 `npm install`, `npm test`를 실행한다. API 테스트는 실제 SQLite 제약과 트랜잭션을 사용한다. `npm run db:local`로 두 DB를 마이그레이션한 뒤 `npm run dev`로 두 Worker를 함께 실행한다. 기관 Worker의 무시된 로컬 파일 `../cloudflare-homecare/.dev.vars`에는 `DEV_ALLOWED_ORIGIN="http://127.0.0.1:3000"`을 설정한다. 정적 웹은 저장소 루트에서 `python3 -m http.server 3000 --bind 127.0.0.1`로 실행한다. 회원 화면은 `http://127.0.0.1:3000/care-account.html`, API는 `http://127.0.0.1:8788`이다.

로컬 Worker에는 `ENVIRONMENT=development`, `WEB_ORIGIN=http://127.0.0.1:3000`, `API_ORIGIN=http://127.0.0.1:8788`, `DEV_ORIGIN=http://127.0.0.1:3000`을 지정한다. 기관 Worker에는 동일한 `DEV_ALLOWED_ORIGIN`을 지정하고 두 Worker를 함께 실행한다. HTTP 개발 쿠키는 이 모드에만 사용한다. 운영 기본값은 `__Host-` HttpOnly·Secure 쿠키다.

## 운영 연결

1. 기존 Cloudflare 계정의 실제 D1/Supabase와 Worker 상태를 확인한다. 2026-11-20 전용 회원·기관 D1을 새로 생성해 실제 ID를 구성했으며, 단계별 현황은 [운영 연결 기록](../../docs/HOMECARE-DEPLOYMENT.md)을 따른다. DB 생성은 Worker 배포 완료를 의미하지 않는다. <!-- SOFTM-LIVE-D1 날짜:20261120 : 실제 생성된 DB와 아직 연결되지 않은 서비스를 구분 -->
2. 기존 전용 D1을 재사용하고 Supabase의 비공개 `homecare-documents`를 사용한다. 버킷과 `SUPABASE_SECRET_KEY` 연결·실제 Worker 배포 및 가상 기관 API 시험을 완료했다. `INSTITUTIONS_DB`는 기관 Worker의 DB와 같은 리소스다. `npm run deploy`의 preflight는 예시 ID를 거부하지만 실제 저장소 권한·DNS·SNS 연결까지 검증하지 않는다. <!-- SOFTM-LIVE-D1 날짜:20261121 : 서버 연결 완료와 운영 화면 검증을 구분 -->
3. 회원 DB에 `migrations/0001_members.sql`과 `0002_care_recipient.sql`을 순서대로, 기관 DB에 기존 마이그레이션과 `0006_member_registration.sql`을 적용한다. 원격 적용 전 백업과 현재 스키마를 확인한다.
4. `api.dolbomhannun.kr`은 [Pages 게이트웨이](../cloudflare-homecare-gateway/README.md)의 `MEMBERS` 서비스 바인딩으로 전용 Worker에 연결한다. 기존 GitHub Pages 웹과 전체 네임서버는 유지한다. 기관 Worker의 `ACCOUNT` 바인딩은 `softm-homecare-members`, 회원 Worker의 `INSTITUTIONS` 바인딩은 `softm-homecare-pilot`이다. 이전 API 주소는 새 주소 검증 전까지 한시 허용한다. <!-- SOFTM-DOMAIN-MIGRATION 날짜:20261124 : 외부 DNS를 유지하는 새 API 연결 경로 기록 -->
5. 각 제공자에 `https://api.dolbomhannun.kr/api/auth/oauth/{google|kakao|naver}/callback`을 등록한다. 이전 콜백은 제공자 전환 완료 전까지 삭제하지 않는다. `GOOGLE_CLIENT_ID/SECRET`, `KAKAO_CLIENT_ID/SECRET`, `NAVER_CLIENT_ID/SECRET`을 Wrangler secrets로 설정한다. 네이버 공개 검수 완료 후 `NAVER_PUBLIC_ENABLED=true`로 바꾼다. 비밀키는 파일·Git·로그에 넣지 않는다. <!-- SOFTM-DOMAIN-MIGRATION 날짜:20261124 : SNS 콜백도 새 API 주소로 전환하되 기존 로그인을 갑자기 끊지 않음 -->
6. 운영자도 일반 가입 후 본인 확인을 거쳐 D1 `administrators`에 해당 전용 계정의 UUID를 등록한다. 공개 가입 화면으로 운영자 권한을 받을 수 없다. 승인 작업은 최근 10분 내 인증이 필요하다.
7. 기존 기관 담당자는 새 기관회원 가입 후 운영자가 기존 권한과 증빙을 대조한다. 이메일 일치만으로 UID를 합치지 않는다. 이미 소유자가 있는 기관은 자동 승인되지 않으며 기존 소유권 이전을 별도 기록·트랜잭션으로 처리한다. 기존 공통 보관소는 `?legacyAccount=1`에서 명시적으로 복원한다.

<!-- SOFTM-SUPABASE-STORAGE START 날짜:20261121 : 운영 연결과 가상 시험을 구분하고 기관 담당자 제출 흐름을 유지 -->
기관 담당자가 가입 화면에서 사업자등록증을 직접 제출하고, 승인 후 기관 관리 화면에서 사진을 등록합니다. [파일 연결부](../homecare-storage/README.md)가 기존 소유권 검사와 삭제 재시도를 유지합니다. Worker secret·배포·실제 API의 가상 가입→승인→파일 등록·삭제 18개 검사는 완료했습니다. 사용자의 운영 재개 지시에 따라 `FILE_UPLOADS_ENABLED=true`를 배포했으며, 공식 HTTPS·운영 브라우저 검증은 [운영 연결 기록](../../docs/HOMECARE-DEPLOYMENT.md)에 별도로 남깁니다. 로컬 개발에 운영 키를 복사하지 않으며 자동 테스트는 저장소를 주입합니다. 독립 자동 백업은 아직 구현하지 않았습니다.
<!-- SOFTM-SUPABASE-STORAGE END -->

## 저장과 권한

- 일반 아이디 가입은 추가 개인정보 없이 완료된다. SNS 계정은 이름·휴대폰·시도·시군구와 약관이 필수다. 휴대폰 입력은 본인인증이 아니다.
- 기관 계정은 SNS를 사용하지 않는다. 증빙 제출로 가입을 마치고 승인된 기관에만 운영정보 수정 권한을 받는다. 승인과 멤버십 부여, 심사 이력은 같은 기관 D1의 트리거로 원자 처리한다.
- 증빙은 PDF/JPG/PNG, 최대 10MiB이며 Supabase 공개 URL을 만들지 않는다. 기관 공개사진 버킷과 별개다. 심사·파일 변경은 revision으로 충돌을 검사한다.
- 개인 작업공간은 `If-Match` revision이 일치해야 저장된다. 첫 연결에서 기기/서버 자료를 자동 덮어쓰지 않는다. 상담 공유는 선택한 질문·확인 상태만 기본 포함하며 답변/메모는 명시 선택, 주소/연락처는 제외한다.
- 비밀번호는 salt를 붙인 scrypt(N=16384,r=8,p=5), 세션·복구·공유 코드는 SHA-256 해시만 DB에 남긴다. 로그인 쿠키 원문은 JavaScript 저장소에 넣지 않는다. 운영 Workers의 CPU·동시 로그인 자원 한도에서 해시 비용을 검증하고 강도를 낮추지 않는다.
- 삭제 작업은 파일 저장소 실패를 숨기지 않고 재시도 큐에 남긴다. 삭제 중인 계정은 다른 쓰기에서 차단한다. 기관 공공자료/공식 운영자료와 개인 기록은 구분한다. 탈퇴는 멤버십을 해제하며 기관 공개자료를 임의 삭제하지 않는다.

## Android

`auth-callback.html#code=…` App Link는 일회용 코드와 시작 화면의 PKCE proof를 함께 검증한다. 인증을 시작한 WebView가 사라졌으면 안전하게 재로그인을 안내한다. 현재 `.well-known/assetlinks.json`은 확인한 공통 로컬 Release 인증서를 포함한다. 실제 Play 앱 서명 인증서가 다르면 Play Console에서 확인한 인증서를 추가하고 운영 도메인에서 재검증해야 한다. 업로드 키를 Play 앱 서명 키로 단정하지 않는다.

웹 UI, API 테스트, Workers 번들, 실제 Cloudflare 배포, 실계정 SNS 로그인, 서명된 Android Release 설치 검증은 별도로 기록한다.

인증된 증빙과 상담 CSV는 Android 시스템 문서 저장창으로 전달하고, 인쇄는 시스템 인쇄창을 사용한다. 파일 내용·로그인 쿠키를 외부 다운로드 URL에 전달하지 않는다. 최대 10MiB이며 선택 취소는 저장 완료로 표시하지 않는다. 새 웹 코드와 앱 버전을 함께 배포한 뒤 실제 문서 공급자에서 첨부·저장·취소를 추가 확인한다.

<!-- SOFTM-GUARDIAN START 날짜:20261120 : 별도 대상자 동의와 보호자 연락처 API 운영 기준 -->
## 돌봄 대상자

회원 DB 마이그레이션 0002를 적용한 뒤 새 Worker를 배포한다. 이미 0001을 사용하는 로컬/운영 DB에도 0002가 필요하다. `GET/PUT/DELETE /api/me/care-recipient`는 일반회원 자신의 한 명 대상자만 관리하며 PUT/DELETE에 CSRF·If-Match가 필요하다. 관계·성별·이동·필요 돌봄·동의 권한은 허용 값만 저장하고, 동의 버전/시각은 서버에서 기록한다. PUT 전에 계정 이름·휴대폰 저장이 필요하다. 연락처는 계정에서만 읽으며 대상자 전화번호·임의 수신자 필드는 저장하지 않는다.

`care_recipients`는 일반 작업공간·공유와 분리한다. 대상자 삭제·보관소 삭제·탈퇴에 동의 기록 삭제가 포함된다. 문의·회신 대상 표시는 있지만 실제 SMS/이메일 발송은 미연결이다. 별도 동의·다른 회원/기관 접근 차단·연락처 위조·revision 충돌·공유 제외·삭제는 `test/recipients.test.mjs`에서 검증한다.
<!-- SOFTM-GUARDIAN END -->
