# 돌봄한눈 회원 API 도메인 연결

<!-- SOFTM-MEMBER-DOMAIN START 날짜:20261121 : 사이트와 같은 도메인 계열에서 보안 쿠키를 유지하는 무료 연결 경로 -->

기존 GitHub Pages 지도와 외부 권한 DNS를 유지한다. `api.dolbomhannun.kr`만 Cloudflare Pages의 `softm-homecare-api` 프로젝트로 연결하고 `MEMBERS` 서비스 바인딩으로 기존 회원 Worker를 호출한다. 가입·심사·D1·Supabase 저장 동작은 기존 Worker가 담당한다. 이 게이트웨이는 파일을 보관하거나 Supabase 키를 받지 않는다. 이전 `api.homecare.designboard.net`은 새 API 실사용 확인 전까지 호환 경로로만 유지한다. <!-- SOFTM-DOMAIN-MIGRATION 날짜:20261124 : 새 API 주소와 이전 호환 경로의 역할을 분리 -->

공개 요청의 `Authorization`은 제거하고 내부 전달 호스트는 `members-gateway.internal`로 고정한다. 기관 Worker 전용 `account.internal` Bearer 검증 경계를 공개하지 않는다. 쿠키·Origin·CSRF와 multipart 본문을 전달하며 `__Host-` 쿠키의 Secure·HttpOnly·SameSite 설정을 낮추지 않는다. 응답 캐시는 금지하고 토큰·헤더·URL·예외 원문을 로그로 남기지 않는다.

Node 22.13 이상과 회원 Worker에 설치한 고정 버전 Wrangler를 사용한다.

```sh
node ../cloudflare-homecare-members/node_modules/wrangler/bin/wrangler.js pages deploy public --project-name softm-homecare-api --branch main
```

새 프로젝트는 production branch `main`으로 만들고 Pages의 사용자 지정 도메인에 `api.dolbomhannun.kr`을 먼저 추가한다. 그 다음 권한 DNS에 `api` CNAME을 실제 생성된 Pages 주소로 연결한다. 전체 도메인의 네임서버와 기존 레코드는 바꾸지 않는다. DNS·인증서 활성화 및 공식 HTTPS 주소의 세션 쿠키 검증 후 웹을 공개한다. 실제 배포 상태는 [운영 연결 기록](../../docs/HOMECARE-DEPLOYMENT.md)을 따른다. <!-- SOFTM-DOMAIN-MIGRATION 날짜:20261124 : 새 루트 도메인의 API 연결 절차를 명시 -->

공식 기준: [외부 DNS 서브도메인](https://developers.cloudflare.com/pages/configuration/custom-domains/), [Pages 서비스 바인딩](https://developers.cloudflare.com/pages/functions/bindings/), [고급 Worker 모드](https://developers.cloudflare.com/pages/functions/advanced-mode/).
<!-- SOFTM-MEMBER-DOMAIN END -->
