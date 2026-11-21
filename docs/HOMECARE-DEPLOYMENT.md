# 돌봄한눈 운영 연결 기록

<!-- SOFTM-LIVE-D1 START 날짜:20261120 : 실제 외부 리소스 생성과 아직 완료되지 않은 운영 공개를 구분 -->

## 2026-11-21 기준 확인 결과

| 단계 | 실제 결과 | 남은 작업 |
|---|---|---|
| 배포 인증 | Wrangler OAuth 연결·계정 조회·D1 목록 조회 성공 | 승인된 범위에서만 사용 |
| 회원 D1 | `softm-homecare-members` 생성, 0001·0002 적용. 실제 가입·반복 로그인·탈퇴 및 가상 기관 API 시험 후 회원·관리자·세션·삭제 작업 0건 확인 | 운영 브라우저의 로그인·쿠키 검증 |
| 기관 D1 | `softm-homecare-pilot` 생성, 0001·0006 적용. 증빙 제출·승인·사진 API 시험 후 기관·신청·사진·삭제 대기열 0건 확인 | 운영 화면의 기관 담당자 동선 검증 |
| 파일 저장소 | Supabase Free·결제수단 없음·추가 과금 제한 활성화 확인. 증빙·사진 비공개 버킷 생성 및 가상 파일 왕복·익명 거부·삭제 통과 | 독립 백업·복원, 무료 총량 제한 보완. R2는 미활성 유지 |
| Worker | 두 Worker 배포, 양방향 바인딩·Supabase 서버 secret 연결. 가상 기관의 실제 파일 API 검사 18개 통과. 업로드 기본 비활성 | 공식 API 도메인·운영 브라우저 연결 |
| 회원 API 도메인 | `api.homecare.designboard.net` 미등록, Cloudflare 계정에 연결된 도메인 없음 | 현재 카페24 DNS를 고려한 연결 방식 결정 |
| 공개 웹 | GitHub Pages는 `main` 루트, 신규 회원 화면 미배포 | 회원 API HTTPS·쿠키 동작 검증 후 반영 |
| SNS·알림 | 실제 제공자 설정 미연결 | 제공자 앱 정보·콜백 등록, 발송 채널 준비 |

## 사용자 요청에 따른 보류와 검토

<!-- SOFTM-STORAGE-HOLD START 날짜:20261120 : 로그인 보류와 저장소 미선정 상태를 외부 리소스 준비와 구분 -->

- 사용자는 [기관 운영정보·사진 관리](https://homecare.designboard.net/institution-portal.html)의 로그인부터 동작하지 않는다고 보고했고, 이 문제를 우선 보류하도록 요청했다. 로그인 문제는 미해결이며 이번 저장소 비교에서 인증 코드를 수정하지 않는다.
- 보류 당시 운영 HTML은 HTTP 200이고 기존 공통 계정 로그인을 안내했다. 운영 JS는 `softm-hannun-account.softm.workers.dev`와 `softm-homecare-pilot.softm.workers.dev`를 참조했고 기관 API는 HTTP 404/1042였다. 이후 전용 회원·기관 Worker를 배포하고 실제 API를 검증했지만 기존 운영 웹의 로그인 원인을 해결했다고 간주하지 않는다.
- 사용자가 Supabase Free 가입·프로젝트 생성을 완료한 뒤 비공개 파일 저장소를 준비했다. [선택·검증 기록](HOMECARE-STORAGE-DECISION.md)과 [파일 연결부](../services/homecare-storage/README.md)를 따른다. R2 결제·운영 파일 이전·D1으로 파일 이동은 하지 않았다. <!-- SOFTM-SUPABASE-STORAGE 날짜:20261121 : 사용자 선택 이후 실제 진행 결과 반영 -->
- 저장소 선정의 최우선 조건은 키 유출·악용 시 자동 과금 방지다. 카드 없는 Free 조직/플랜과 초과 사용 제한 정책을 실제 계정에서도 확인하기 전에는 연결 완료로 표시하지 않는다. 공급자의 예산 알림과 실제 사용 차단을 구분한다. <!-- SOFTM-COST-GUARD 날짜:20261120 : 비용 차단을 확인하지 않은 유료 리소스 활성화 방지 -->
- 재개 시에는 저장소 결정과 별도로 실제 로그인 → 기관 권한 확인 → 사진 업로드·조회·삭제를 운영 환경에서 검증한다.

<!-- SOFTM-STORAGE-HOLD END -->

원격 DB는 기존 서비스 DB 여섯 개와 별도로 새로 만들었으며 기존 DB 데이터는 변경하지 않았다. APAC 위치 힌트로 생성했고 확인 요청의 실제 응답은 회원 DB `SIN`, 기관 DB `NRT`였다. 위치 힌트와 응답 위치를 한국 내 저장 보장으로 해석하지 않는다. 새 빈 DB에 초기 스키마를 적용했으며 기존 운영 DB를 마이그레이션할 때는 별도 백업·현재 스키마 확인이 필요하다.

2026-11-21 저장소 수정 후 `npm run check`와 회원 화면 셸 280개·기존 지도·정적 자료 정합성 검사를 통과했다. Supabase 연결에서는 Workers가 지원하지 않는 `redirect: error` 대신 `manual`을 사용하고 3xx를 직접 거부하도록 수정했다. 전역 fetch의 수신 객체도 보존하며 공급자 오류 원문을 출력하지 않는다. 실제 배포 API에서 가상 기관 가입·증빙 제출·심사 승인·사진 업로드/조회/삭제 및 접근 차단 18개 검사를 통과했다. 시험 자료는 삭제했고 두 Worker의 `FILE_UPLOADS_ENABLED=false` 복구를 원격 설정에서 확인했다. <!-- SOFTM-STORAGE-LIVE 날짜:20261121 : 로컬 검사와 실제 서버 검증을 구분 -->

## 리소스 연결

| 리소스 | 식별자·용도 |
|---|---|
| 회원 D1 | `a7670255-4de9-4a63-a8fc-445e6218fadd` → 회원 Worker `DB` |
| 기관 D1 | `b1068cbf-7f1e-4c28-99ea-8fb65da84b3c` → 기관 Worker `DB`, 회원 Worker `INSTITUTIONS_DB` |
| Supabase 프로젝트 | `feaouitfpiqjjqdxrtfx`, `dolbom-free`, `ap-southeast-2`(Sydney) |
| 비공개 증빙 | `homecare-documents` → 회원 Worker 파일 연결부 |
| 비공개 사진 | `homecare-photos` → 기관 Worker 파일 연결부 |

현재 코드는 D1에 회원·기관·상담·심사 상태와 파일 키를 저장하고 PDF·이미지 원본은 Supabase Storage에 분리한다. 두 버킷의 `public=false`, 파일 크기·MIME 제한을 원격 응답으로 확인했다. 증빙 다운로드는 신청자·심사 담당자만 허용하고, 기관 사진은 멤버십 또는 공개 게시 상태를 확인한다. 전용 Supabase 서버 키를 두 Worker의 secret으로 등록했고 기관 Worker의 `EVENT_HASH_SECRET`도 등록했다. 비밀값은 메모리에서만 전달하고 파일·명령 인자·로그·Git에 기록하지 않았다. `FILE_UPLOADS_ENABLED=false`이며 가상 기관 API 시험을 운영 웹 로그인·실제 회원 업로드 개방·백업 완료로 보고하지 않는다. <!-- SOFTM-SUPABASE-STORAGE 날짜:20261121 : 서버 연결 완료와 운영 공개를 분리 -->

검증 후 배포 버전(트래픽 100%):

- 회원 `ef932d25-89e5-4257-8126-888e69da3616`
- 기관 `2d336eb0-40f6-45b9-ae6b-d339d9befc19`

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
