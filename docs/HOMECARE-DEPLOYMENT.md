# 돌봄한눈 운영 연결 기록

<!-- SOFTM-LIVE-D1 START 날짜:20261121 : 서버·DNS·운영 웹과 브라우저 검증 결과를 구분 -->

## 2026-11-21 기준 확인 결과

| 단계 | 실제 결과 | 남은 작업 |
|---|---|---|
| 배포 인증 | Wrangler OAuth 연결·계정 조회·D1 목록 조회 성공 | 승인된 범위에서만 사용 |
| 회원 D1 | `softm-homecare-members` 생성, 0001·0002 적용. 운영 Aside에서 기관/일반회원 가입·새로고침 후 세션 유지·로그아웃 확인 | 최종 시험 계정 정리 |
| 기관 D1 | `softm-homecare-pilot` 생성, 0001·0006 적용. 실제 사이트에서 기관정보·PDF 증빙 제출 후 심사 대기 확인 | 운영자 심사·승인 후 사진 관리의 브라우저 검증 |
| 파일 저장소 | Supabase Free·결제수단 없음·추가 과금 제한 활성화 확인. 증빙·사진 비공개 버킷 생성 및 가상 파일 왕복·익명 거부·삭제 통과 | 독립 백업·복원, 무료 총량 제한 보완. R2는 미활성 유지 |
| Worker | 두 Worker 배포, 양방향 바인딩·Supabase 서버 secret 연결. 가상 기관의 실제 파일 API 검사 18개 통과. 사용자 요청으로 업로드 활성화 | 승인 후 사진 관리의 운영 브라우저 검증 |
| 회원 API 도메인 | Pages 게이트웨이·회원 서비스 바인딩·카페24 CNAME·인증서 active. 공식 `/health` HTTPS 200 확인 | 연결 유지 |
| 공개 웹 | GitHub Pages `main`의 `43e52c560` 배포 완료, 실제 신규 회원 화면·공식 API 연결 확인 | 최종 심사·사진 관리 검증 |
| SNS·알림 | 실제 제공자 설정 미연결 | 제공자 앱 정보·콜백 등록, 발송 채널 준비 |
| 기관 심사 운영자 | 사용자가 아이디 `admin` 지정 | 사용자가 직접 가입한 전용 계정 UUID 확인 후 권한 연결 |

## 운영 재개와 기존 구조 유지

<!-- SOFTM-STORAGE-HOLD START 날짜:20261121 : 사용자의 재개 지시와 실제 배포 범위를 구분 -->

- 사용자는 보류했던 로그인·API 주소 연결을 재개하고 실제 사이트에서 기관회원 가입·사업자등록증·사진 업로드가 가능하도록 요청했다. 기존 정적 지도와 Workers/D1 구조를 유지하며 전용 회원 API로 연결한다.
- 보류 당시 운영 HTML은 HTTP 200이고 기존 공통 계정 로그인을 안내했다. 운영 JS는 `softm-hannun-account.softm.workers.dev`와 `softm-homecare-pilot.softm.workers.dev`를 참조했고 기관 API는 HTTP 404/1042였다. 이후 전용 회원·기관 Worker를 배포하고 실제 API를 검증했지만 기존 운영 웹의 로그인 원인을 해결했다고 간주하지 않는다.
- 사용자가 Supabase Free 가입·프로젝트 생성을 완료한 뒤 비공개 파일 저장소를 준비했다. [선택·검증 기록](HOMECARE-STORAGE-DECISION.md)과 [파일 연결부](../services/homecare-storage/README.md)를 따른다. R2 결제·운영 파일 이전·D1으로 파일 이동은 하지 않았다. <!-- SOFTM-SUPABASE-STORAGE 날짜:20261121 : 사용자 선택 이후 실제 진행 결과 반영 -->
- 저장소 선정의 최우선 조건은 키 유출·악용 시 자동 과금 방지다. 카드 없는 Free 조직/플랜과 초과 사용 제한 정책을 실제 계정에서도 확인하기 전에는 연결 완료로 표시하지 않는다. 공급자의 예산 알림과 실제 사용 차단을 구분한다. <!-- SOFTM-COST-GUARD 날짜:20261120 : 비용 차단을 확인하지 않은 유료 리소스 활성화 방지 -->
- 실제 로그인 → 기관 가입·증빙 제출 → 승인 전 권한 제한 → 운영자 심사 → 사진 업로드·조회·삭제를 공식 사이트의 브라우저에서 검증한다. API 시험만으로 이 항목을 통과 처리하지 않는다.

<!-- SOFTM-STORAGE-HOLD END -->

원격 DB는 기존 서비스 DB 여섯 개와 별도로 새로 만들었으며 기존 DB 데이터는 변경하지 않았다. APAC 위치 힌트로 생성했고 확인 요청의 실제 응답은 회원 DB `SIN`, 기관 DB `NRT`였다. 위치 힌트와 응답 위치를 한국 내 저장 보장으로 해석하지 않는다. 새 빈 DB에 초기 스키마를 적용했으며 기존 운영 DB를 마이그레이션할 때는 별도 백업·현재 스키마 확인이 필요하다.

2026-11-21 저장소 수정 후 실제 배포 API에서 가상 기관 가입·증빙 제출·심사 승인·사진 업로드/조회/삭제 및 접근 차단 18개 검사를 통과하고 시험 자료를 삭제했다. 이후 운영 재개 지시로 두 Worker의 `FILE_UPLOADS_ENABLED=true`를 배포했다. 게이트웨이는 공개 Bearer 제거·내부 인증 호스트 분리·쿠키/파일 전달·오류 비밀값 숨김을 검사한다. 운영 main의 최신 공개 자료 갱신을 병합한 뒤 `npm run check` 633개와 회원 화면 셸 280개, Python·기존 지도·정적 자료 정합성 검사를 통과했다. <!-- SOFTM-STORAGE-LIVE 날짜:20261121 : 운영 재개 이후 실제 설정과 검사 결과 기록 -->

## 리소스 연결

| 리소스 | 식별자·용도 |
|---|---|
| 회원 D1 | `a7670255-4de9-4a63-a8fc-445e6218fadd` → 회원 Worker `DB` |
| 기관 D1 | `b1068cbf-7f1e-4c28-99ea-8fb65da84b3c` → 기관 Worker `DB`, 회원 Worker `INSTITUTIONS_DB` |
| Supabase 프로젝트 | `feaouitfpiqjjqdxrtfx`, `dolbom-free`, `ap-southeast-2`(Sydney) |
| 비공개 증빙 | `homecare-documents` → 회원 Worker 파일 연결부 |
| 비공개 사진 | `homecare-photos` → 기관 Worker 파일 연결부 |
| API 게이트웨이 | Pages `softm-homecare-api`, `MEMBERS` → `softm-homecare-members` |
| 카페24 DNS | `api.homecare.designboard.net CNAME softm-homecare-api.pages.dev` |

현재 코드는 D1에 회원·기관·상담·심사 상태와 파일 키를 저장하고 PDF·이미지 원본은 Supabase Storage에 분리한다. 두 버킷의 `public=false`, 파일 크기·MIME 제한을 원격 응답으로 확인했다. 증빙 다운로드는 신청자·심사 담당자만 허용하고, 기관 사진은 멤버십 또는 공개 게시 상태를 확인한다. 전용 Supabase 서버 키를 두 Worker의 secret으로 등록했고 기관 Worker의 `EVENT_HASH_SECRET`도 등록했다. 비밀값은 메모리에서만 전달하고 파일·명령 인자·로그·Git에 기록하지 않았다. 두 Worker는 `FILE_UPLOADS_ENABLED=true`이며 버전별 미리보기 주소는 비활성화했다. 독립 자동 백업·복원은 미구현이다. <!-- SOFTM-SUPABASE-STORAGE 날짜:20261121 : 실제 운영 스위치와 남은 백업을 구분 -->

검증 후 배포 버전(트래픽 100%):

- 회원 `687c2eec-fc62-40cb-ac6a-562088f09b86`
- 기관 `10926c7d-2315-4558-900b-79d3fda06f1f`
- Pages `7685f176-8cd5-4ef2-9e35-8338dcab6f66`

Pages 기본 주소와 공식 `https://api.homecare.designboard.net/health`에서 HTTP 200과 `homecare-members` 응답을 확인했다. 도메인·소유 확인·인증서 상태는 모두 active다. 최초에는 카페24 보조 DNS 일부가 NXDOMAIN을 반환했으나 모든 권한 DNS 전파를 확인하고 공개 DNS 캐시 갱신·인증서 재검증 후 정상 연결됐다. `Secure` 또는 `SameSite` 쿠키를 약화하거나 전체 네임서버를 변경하는 우회는 사용하지 않았다.

## 운영 브라우저 검사

Aside의 백그라운드 작업 탭에서 확인했으며 사용 중인 Chrome 창을 검증 대상으로 사용하지 않는다. 회원 화면은 `https://homecare.designboard.net/care-account.html`, 기관 가입은 `institution-signup.html`이다. 비밀번호·복구코드·쿠키·CSRF는 도구 결과·파일·Git에 남기지 않는다.

- 실제 기관회원 가입 → 복구코드 안내 → 기관정보 입력 → 가상 PDF 제출 → 심사 대기 표시 성공.
- 페이지 새로고침 뒤 세션 조회 200, JavaScript에서 로그인 쿠키 읽기 불가, 로그아웃 성공.
- 업로드한 증빙의 원본 바이트 일치·응답 `no-store`, 승인 전 기관 권한 0곳 확인.
- 별도 일반회원이 다른 신청자의 증빙을 요청하면 404, 심사 목록을 요청하면 403.
- 기존 지도에서 서울 마포구 검색 결과 20곳과 네이버 지도 표시 확인. PC 1280px·모바일 390px에서 가로 넘침 없음.
- PWA 캐시에 API 응답·인증 콜백 문서가 저장되지 않은 것을 확인.

사용자가 지정한 `admin` 계정의 직접 가입·권한 연결 후 심사 승인과 기관 사진의 업로드·미리보기·삭제를 마저 검증한다. 시험 계정에 임의로 운영자 권한을 부여하지 않는다. 현재 가상 신청·일반 시험 계정은 후속 검증을 위해 유지 중이며 최종 정리 결과를 별도로 기록한다.

## 이 PC의 Wrangler 인증

기존 macOS Preferences의 Wrangler 폴더가 관리자 소유여서 인증 저장에 실패했다. 소유권을 변경하지 않고 사용자 설정 경로로 다시 인증했다. 이후 명령은 다음 환경변수를 함께 지정한다.

```sh
XDG_CONFIG_HOME="$HOME/.config" WRANGLER_SEND_METRICS=false WRANGLER_WRITE_LOGS=false wrangler whoami
```

Node 22.13 이상을 사용한다. 이 PC의 기본 Node 20은 설치된 Wrangler를 실행하지 못하므로 검증에는 기존 Node 24.13을 명시했다. 인증 토큰 파일은 저장소 밖 사용자 설정에 있으며 Git·로그·문서에 원문을 넣지 않는다. `WRANGLER_WRITE_LOGS=false`로 진단 파일 저장을 끄고 민감한 브라우저 결과는 필요한 상태만 추출한다. CLI가 이번 작업에서 쓰지 않는 추가 scope의 누락을 경고해도 그것만으로 전체 권한을 다시 부여하지 않는다.

## 공개 전 확인

- 기존 계정은 Workers Free이며 D1은 신규 두 개를 포함해 여덟 개다. 실제 가입·로그인 3회 반복·탈퇴는 성공했다. 이를 동시 이용량 부하 검증으로 대신하지 않으며 scrypt 강도를 낮추거나 요금제를 자동 변경하지 않는다.
- `designboard.net`의 권한 DNS는 카페24다. 전체 도메인의 네임서버를 임의 이전하거나 `workers.dev`에 CNAME만 추가해 HTTPS·쿠키 문제가 해결됐다고 간주하지 않는다.
- 기관 통계용 `EVENT_HASH_SECRET`은 새 무작위 값으로 등록했다. 실제 SNS 제공자 키가 없으면 SNS 연결 완료로 표시하지 않는다.
- 최초 배포는 기관 Worker 대상 생성 → 회원 Worker 생성 → 양방향 서비스 바인딩 반영 순서로 완료했다. 기존 바인딩을 다음 배포에서도 유지한다.
- 코드 푸시, DB 적용, Worker 배포, 실제 웹 공개와 Android 배포는 각각 따로 확인한다.

<!-- SOFTM-LIVE-D1 END -->
