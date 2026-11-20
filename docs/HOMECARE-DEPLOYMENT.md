# 돌봄한눈 운영 연결 기록

<!-- SOFTM-LIVE-D1 START 날짜:20261120 : 실제 외부 리소스 생성과 아직 완료되지 않은 운영 공개를 구분 -->

## 2026-11-20 확인 결과

| 단계 | 실제 결과 | 남은 작업 |
|---|---|---|
| 배포 인증 | Wrangler OAuth 연결·계정 조회·D1 목록 조회 성공 | 승인된 범위에서만 사용 |
| 회원 D1 | `softm-homecare-members` 생성, 0001·0002 적용, 회원·대상자 0건 조회 | Worker 연결 후 가입·저장·삭제 검증 |
| 기관 D1 | `softm-homecare-pilot` 생성, 0001·0006 적용, 기관·신청 0건 조회 | Worker 연결 후 증빙·권한·게시 검증 |
| R2 | 가입 조건 확인 후 결제수단 입력 단계 | 사용자 결제수단 등록·활성화, 버킷 생성·비공개 확인 |
| Worker | 회원·기관 설정과 `deploy --dry-run` 번들 통과 | R2·양방향 바인딩·secret 연결 후 실제 배포 |
| 회원 API 도메인 | `api.homecare.designboard.net` 미등록, Cloudflare 계정에 연결된 도메인 없음 | 현재 카페24 DNS를 고려한 연결 방식 결정 |
| 공개 웹 | GitHub Pages는 `main` 루트, 신규 회원 화면 미배포 | 회원 API HTTPS·쿠키 동작 검증 후 반영 |
| SNS·알림 | 실제 제공자 설정 미연결 | 제공자 앱 정보·콜백 등록, 발송 채널 준비 |

원격 DB는 기존 서비스 DB 여섯 개와 별도로 새로 만들었으며 기존 DB 데이터는 변경하지 않았다. APAC 위치 힌트로 생성했고 확인 요청의 실제 응답은 회원 DB `SIN`, 기관 DB `NRT`였다. 위치 힌트와 응답 위치를 한국 내 저장 보장으로 해석하지 않는다. 새 빈 DB에 초기 스키마를 적용했으며 기존 운영 DB를 마이그레이션할 때는 별도 백업·현재 스키마 확인이 필요하다.

설정 반영 후 `npm run check` 통과: Node 검사 616개, Python 검사 11개, 회원 화면 셸 280개와 기존 지도·정적 자료 정합성 검사. 회원·기관 Worker의 별도 `deploy --dry-run`도 통과했다. 실제 API 호출·가입 검증은 Worker 배포 후 수행해야 한다.

## 리소스 연결

| 리소스 | 식별자·용도 |
|---|---|
| 회원 D1 | `a7670255-4de9-4a63-a8fc-445e6218fadd` → 회원 Worker `DB` |
| 기관 D1 | `b1068cbf-7f1e-4c28-99ea-8fb65da84b3c` → 기관 Worker `DB`, 회원 Worker `INSTITUTIONS_DB` |
| 증빙 R2 예정 이름 | `softm-homecare-private-documents` → 회원 Worker `DOCUMENTS` |
| 사진 R2 예정 이름 | `softm-homecare-pilot-photos` → 기관 Worker `PHOTOS` |

D1에는 회원·기관·상담·심사 상태와 파일 키를 저장하고 PDF·이미지 원본은 R2에 분리한다. 두 R2 버킷 모두 `r2.dev` 공개 URL과 Custom Domain 공개 접근을 끄고 Worker에서 권한·게시 상태를 확인한다. 증빙 다운로드는 신청자·심사 담당자만 허용한다.

## 이 PC의 Wrangler 인증

기존 macOS Preferences의 Wrangler 폴더가 관리자 소유여서 인증 저장에 실패했다. 소유권을 변경하지 않고 사용자 설정 경로로 다시 인증했다. 이후 명령은 다음 환경변수를 함께 지정한다.

```sh
XDG_CONFIG_HOME="$HOME/.config" WRANGLER_SEND_METRICS=false wrangler whoami
```

인증 토큰 파일은 저장소 밖 사용자 설정에 있으며 Git·로그·문서에 원문을 넣지 않는다. CLI가 이번 작업에서 쓰지 않는 추가 scope의 누락을 경고해도 그것만으로 전체 권한을 다시 부여하지 않는다.

## 공개 전 확인

- 기존 계정은 Workers Free이며 D1은 신규 두 개를 포함해 여덟 개다. 실제 가입·로그인의 scrypt 연산이 운영 CPU 한도에서 성공하는지 확인한다. 강도를 낮추거나 요금제를 자동 변경하지 않는다.
- `designboard.net`의 권한 DNS는 카페24다. 전체 도메인의 네임서버를 임의 이전하거나 `workers.dev`에 CNAME만 추가해 HTTPS·쿠키 문제가 해결됐다고 간주하지 않는다.
- 기관 통계용 `EVENT_HASH_SECRET`은 새 무작위 값을 secret으로 등록한다. 실제 SNS 제공자 키가 없으면 SNS 연결 완료로 표시하지 않는다.
- 기존 Worker가 없는 첫 배포에서는 양방향 서비스 바인딩의 대상 생성 순서를 정하고, 준비 중인 API는 정상 응답이나 인증 성공을 가장하지 않는다.
- 코드 푸시, DB 적용, Worker 배포, 실제 웹 공개와 Android 배포는 각각 따로 확인한다.

<!-- SOFTM-LIVE-D1 END -->
