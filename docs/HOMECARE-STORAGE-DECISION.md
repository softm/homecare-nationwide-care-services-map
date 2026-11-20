# 돌봄한눈 파일 저장소 선택 검토

<!-- SOFTM-STORAGE-CHOICE START 날짜:20261120 : 공급자 선택 전 무료 조건과 실제 파일 사용량을 비교하고 미결정을 기록 -->

확인일: 2026-11-20. 상태: 문서 비교 완료, 사용자 선택·실제 계정 조건 확인 전. 신규 계정·저장소·구독·파일 이전 없음.

## 현재 요구와 구현

- 사용자는 카드·결제수단 연결을 원하지 않는다. 기관 관리 로그인 문제는 별도 보류 상태다.
- 키 유출·악용으로 인한 자동 과금 방지가 최우선이다. 저장소 용량이나 기존 코드 유지의 이점만으로 유료 사용량 청구 서비스를 권하지 않는다. 개인의 과거 계정·청구 내역은 이 공개 저장소에 기록하지 않는다.
- 회원·기관·상담 정보와 파일 메타데이터는 기존 D1에 유지한다. PDF·이미지 원본을 D1에 넣지 않는다.
- 파일 용도는 기관 가입의 사업자등록증과 기관 관리의 시설 사진 두 가지다. 기존 공단 공개사진 수집·표시와는 별도다.
- 현재 코드 한도는 증빙 PDF/JPEG/PNG 10MiB, 사진 JPEG/PNG/WebP 장당 5MiB·기관당 10장이다. 사진을 500KB 등으로 자동 축소하는 처리는 현재 업로드 경로에 없다.
- 현재 회원 Worker의 `DOCUMENTS`, 기관 Worker의 `PHOTOS`는 R2 `put/get/delete`를 호출한다. 다른 저장소를 쓰려면 이 연결부와 오류·삭제 재시도·검증 코드를 수정해야 한다. 선택만으로 동작하는 상태가 되지는 않는다.

## 비교

| 항목 | Cloudflare R2 Standard | Supabase Free Storage | Appwrite Cloud Free Storage |
|---|---|---|---|
| 결제수단 | 구독 활성화에 필요 | 카드 없이 시작 가능 | 카드 없이 시작 가능 |
| 포함 저장량 | 10GB-month/월 | 파일 1GB | 2GB, 다른 프로젝트 리소스와 합산 주의 |
| 포함 전송·요청 | 외부 전송료 없음, Class A 100만·Class B 1,000만 요청/월 | 일반 egress 5GB + cached egress 5GB/월, 별도 항목 | bandwidth 5GB/월 |
| 비공개 파일 | 가능, 현재 권한 검사 경로 구현 | private bucket 가능 | bucket/file 권한으로 가능 |
| 무료 초과 | 사용량 요금 부과 | 지속 초과 시 서비스 제한 | 프로젝트 정지·콘솔 읽기 전용 |
| 미사용 조건 | 여기서 비교한 1주 프로젝트 일시중지 조건 없음 | 1주 미사용 시 프로젝트 일시중지 | 1주 미사용 시 프로젝트 일시중지 |
| 현재 코드 연결 | 기존 R2 바인딩 사용 | 파일 저장 연결부 교체 필요 | 파일 저장 연결부 교체 필요, Free는 프로젝트당 bucket 1개 |
| 유료로 확장할 경우 | 사용량 기준 과금 | Pro 월 $25부터 | Pro 월 $25부터 |

R2의 무료량·단가·요청 분류는 [공식 요금표](https://developers.cloudflare.com/r2/pricing/), 결제 조건은 [시작 안내](https://developers.cloudflare.com/r2/get-started/)와 [결제 프로필](https://developers.cloudflare.com/billing/get-started/create-billing-profile/)을 확인했다. 무료 사용량은 요금 청구 방식이며 자동 비용 상한으로 간주하지 않는다. Worker 등 별도 서비스 비용까지 무료라는 뜻도 아니다.

Supabase의 용량·전송량·미사용 조건·확장 요금은 [공식 요금표](https://supabase.com/pricing), 초과 시 제한은 [Billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)를 확인했다. 카드 없는 시작은 [공식 안내의 양쪽 서비스 카드 불필요 문구](https://supabase.com/blog/observability-for-every-supabase-project-with-grafana-cloud), 비공개 파일은 [Storage Buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)를 확인했다. 일반 전송과 캐시 전송은 임의로 합쳐 10GB를 항상 쓸 수 있다고 계산하지 않는다.

Appwrite의 한도·초과 제한은 [공식 요금표](https://appwrite.io/pricing), 무료 bucket 1개와 일시중지는 [공식 Free 비교표](https://appwrite.io/changelog/entry/2026-04-07), 저장량 합산은 [2026-10-22 변경 안내](https://appwrite.io/changelog/entry/2026-10-22-1)를 확인했다. 카드 없는 시작은 [공식 블로그 검색 결과](https://appwrite.io/blog/post/how-open-source-developers-use-appwrite)에 안내되지만, 직접 열면 홈페이지로 이동하므로 실제 가입 시 현재 조건을 다시 확인한다. 비공개 접근은 [Storage permissions](https://appwrite.io/docs/products/storage/permissions)를 따른다.

## 우리 서비스에 적용한 계산

다음은 실제 사용량이나 확보 기관 수가 아닌 계산 예시다. 업로드 교체 중 중복 파일·삭제 재시도·백업 용량은 제외했다.

- 현재 허용 최대: 기관당 사진 10장 × 5MiB + 증빙 10MiB = 60MiB. 20개 기관이면 1,200MiB(약 1.17GiB)여서 Supabase 파일 1GB 한도를 넘는다.
- 향후 사진을 평균 0.5MB로 압축하고 증빙이 평균 2MB라고 가정하면 기관당 약 7MB, 50개 기관은 약 350MB다. 이 압축은 아직 구현하지 않았다.
- 캐시 재사용 없이 0.5MB 사진 10장을 1,000번 모두 내려받으면 약 5GB다. 무료 저장소는 저장 용량보다 사진 열람 전송량이 먼저 제한에 닿을 수 있다.

## 판단 제안 — 확정 아님

- 현재의 카드 미등록·자동 과금 방지 조건을 지키는 소규모 시범운영은 별도 Free 조직의 Supabase Storage를 우선 검토한다. 플랜과 과금은 조직 기준이므로 기존 유료 조직에 프로젝트만 추가하는 방식은 이 제안에 포함하지 않는다. 비공개 증빙과 사진을 분리하고 기존 Workers·D1·전용 회원 체계를 유지할 수 있다. 파일 저장만 별도 API로 연결하며 관리자 secret은 Worker에만 둔다.
- Supabase를 선택하면 사진 축소·업로드 총량 제한, 전송량 확인, 일시중지 복구 방식이 필요하다. 무료 한도로 기관 수나 무중단 운영을 보장하지 않는다.
- Appwrite도 대안이지만 Free bucket 1개와 5GB 전송량 때문에 현재 두 종류의 파일 분리 설계에서 Supabase보다 우선할 근거는 약하다. 2GB 저장량만으로 선택하지 않는다.
- 현재 조건에서는 R2 활성화를 권하지 않는다. 기존 코드 활용과 전송량의 이점은 있지만, 무료 한도 초과 과금이 있고 확인한 공식 지출 제한의 지원 범위에 R2가 없다. 과거의 운영 편의에 근거한 R2 조건부 권고보다 이번 비용 차단 조건을 우선한다.
- 저장소 선택은 로그인 문제 해결·API 도메인 연결·실운영 배포를 완료시키지 않는다. 사용자가 보류한 로그인 작업은 별도로 재개 요청을 받은 뒤 진행한다.

## 자동 과금 방지 기준

<!-- SOFTM-COST-GUARD START 날짜:20261120 : 키 보호와 사업자 차원의 비용 차단을 별도로 확인 -->

Cloudflare의 [지출 제한 문서](https://developers.cloudflare.com/billing/manage/spend-management/)는 Workers·Durable Objects를 지원 대상으로 명시하고 R2를 Workers 한도에서 제외한다. 또한 사용량 집계·차단 지연 등 때문에 해당 한도도 최종 청구액의 절대 상한을 보장하지 않는다고 설명한다. [예산 알림](https://developers.cloudflare.com/billing/manage/budget-alerts/)은 이메일 통지이며 사용을 중단하지 않는다. 따라서 R2에 알림이나 Worker 호출 제한을 붙였다는 이유로 과금 차단 완료라고 보고하지 않는다.

Supabase는 [Free 한도 초과 시 제한 정책](https://supabase.com/docs/guides/platform/billing-faq#quotas-and-spend-caps)과 [egress 요금표](https://supabase.com/docs/guides/platform/manage-your-usage/egress)에서 무료 플랜과 유료 초과 요금을 구분한다. 가입·연결 단계에서는 별도 조직이 실제 Free인지, 결제수단·유료 부가 기능·외부 마켓플레이스 청구 연결이 없는지 확인한다. 과거 유료 플랜의 미청구액까지 Free 전환으로 없어지는 것으로 해석하지 않는다.

구현 시 적용할 조건이며 아직 운영 검증한 결과가 아니다:

- 관리 secret과 플랫폼 관리 토큰은 분리하고, 관리 secret은 Worker secret에만 둔다. 브라우저에는 배포하지 않으며 저장소·로그·오류 응답에도 남기지 않는다.
- 사업자등록증은 신청자·심사 담당자 권한을 서버에서 확인하고, 사진은 기관 소유권·게시 상태를 확인한다. CORS만으로 권한을 검증하지 않는다.
- 계정별 업로드 수·크기·요청 횟수와 전체 저장량을 제한한다. 한도 초과나 저장소 실패를 성공으로 표시하거나 유료 저장소로 자동 우회하지 않는다.
- 앱 내부 제한은 유출된 저장소 키를 이용한 직접 호출을 막지 못하므로 공급자 플랜의 과금 제한을 대체하지 않는다. 무료 플랜도 데이터 유출·삭제·서비스 중단까지 예방하는 것은 아니며 키 폐기·권한 점검은 별도다.
- 제한 테스트·키 노출 검사·실제 플랜 확인 없이 비용 차단이나 보안 검증 완료를 주장하지 않는다.

<!-- SOFTM-COST-GUARD END -->

<!-- SOFTM-STORAGE-CHOICE END -->
