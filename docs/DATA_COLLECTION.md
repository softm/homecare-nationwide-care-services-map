# 공단 데이터 수집 운영 가이드

<!-- SOFTM-NHIS-COLLECTION-DOC START 날짜:20260903 : GitHub Actions 수집 종류·주기·호출·완료 판정을 한 문서에서 확인하고 변경 시 함께 갱신 -->

## 수집 구조

```text
GitHub Actions
  → 공공데이터 API·원본 파일·공단 공개 사진 페이지 수집
  → scripts/sync_nhis_static.py 정규화
  → data/nhis 및 source-data 저장
  → npm run check
  → github-actions[bot] 커밋·푸시
  → GitHub Pages에서 두 지도에 제공
```

공단 상세·사진 수집에 Vercel을 사용하지 않는다. 브라우저도 공공데이터 API를 직접 호출하지 않으며, 두 지도는 GitHub Pages의 정적 JSON을 읽는다.

## 워크플로

| 항목 | 값 |
|---|---|
| 워크플로 이름 | `Refresh NHIS static data` |
| 실행 제목 | 수동 실행은 mode·scope·기관·shard, 자동 실행은 주기·범위를 표시 |
| 파일 | `.github/workflows/refresh-nhis-static.yml` |
| 실행 환경 | GitHub-hosted `ubuntu-latest` |
| 수집기 | `scripts/sync_nhis_static.py` |
| 필수 Secret | `DATA_GO_KR_SERVICE_KEY` |
| 동시 실행 | `nhis-static-refresh` 그룹에서 한 번에 하나 |
| 실행 제한시간 | 350분 |
| 자동 커밋 범위 | `data/nhis`, `source-data` |

Actions 목록의 `WORKFLOW` 열은 공통 워크플로 이름을 표시하고 `TITLE` 열은 실행별 목적을 표시한다. `run-name`은 새 실행부터 적용되며 이미 시작된 실행 제목은 바뀌지 않는다. <!-- SOFTM-NHIS-RUN-NAME 날짜:20260903 : 같은 워크플로의 여러 실행을 제목으로 구분하는 방법을 기록 -->

| 실행 예 | Actions `TITLE` 표시 |
|---|---|
| 사진 제외 전체 수동 수집 | `NHIS 수동 · mode=full · scope=catalog,details,evaluations · 기관=전체 · shard=14` |
| 특정 기관 사진 수동 수집 | `NHIS 수동 · mode=institution · scope=photos · 기관=24119001267 · shard=14` |
| 매일 증분 자동 수집 | `NHIS 자동 · 매일 증분 · scope=all` |
| 매일 순환 자동 수집 | `NHIS 자동 · 매일 순환 · scope=details,photos` |
| 월간 원본 자동 수집 | `NHIS 자동 · 월간 원본 · scope=catalog,evaluations` |

## 수집 데이터와 저장 위치

| 범위 | 수집·생성 내용 | 외부 출처 | 저장 위치 |
|---|---|---|---|
| `catalog` | 기관명, 주소, 전화, 지역, 지정일, 급여종류, 정원 | 기관 검색 API·시설별 현황 XLSX | `data/nhis/catalog.json`, `changes.json` |
| `details` | 일반현황, 정원, 인력, 시설, 비급여, 프로그램, 협약, 복지용구, 기타 | 시설별 상세조회 API | `data/nhis/details/NN/{기관기호}.json` |
| `evaluations` | 평가등급·총점·영역별 평가 | 평가 결과 CSV | `data/nhis/evaluations.json` |
| `photos` | 사진 키, 제목, 날짜, 공단 원본 URL | 공단 공개 사진 페이지 | `data/nhis/photos/NN/{기관기호}.json` |
| 실행상태 | 수집 ID, 실패, 샤드 체크포인트, 최근 결과 | 수집기 자체 생성 | `manifest.json`, `failures/*.json`, `checkpoints/*.json` |
| 원본 | 시설별 현황·평가 원본 | 공공데이터포털 파일 | `source-data/` |

사진 JSON은 사진 메타데이터와 공단 원본 URL을 저장하며 이미지 파일 자체는 저장하지 않는다.

## 자동 실행 주기

| 한국 시간 | 주기 | 모드 | 범위 | 최대 API 호출 | 목적 |
|---|---|---|---|---:|---|
| 03:23 | 매일 | `incremental` | `all` | 900 | 변경 기관 증분 수집 |
| 04:41 | 매일 | `rotation` | `details,photos` | 6,800 | 14개 샤드의 상세·사진 순환 갱신 |
| 05:17 | 매월 1일 | `incremental` | `catalog,evaluations` | 300 | 최신 시설·평가 원본 점검 |

예약 실행은 별도 명령이 필요 없다. GitHub가 비활성 저장소의 예약 실행을 중단한 경우 Actions 화면에서 워크플로를 다시 활성화한다.

## 수동 실행 모드

| 모드 | 대상 | 사용 시점 | 체크포인트 |
|---|---|---|---|
| `institution` | 지정 기관기호 | 특정 기관 즉시 확인·재수집 | 사용 안 함 |
| `incremental` | 변경 감지 기관 | 변경분만 수집 | 사용 안 함 |
| `rotation` | 당일 선택된 샤드 | 예약 순환 수집 | 이어받음 |
| `full` | 14개 전체 샤드 | 전체 재수집 | 이어받음 |
| `retry` | 실패 목록의 기관 | 오류 기관 재처리 | 사용 안 함 |

`full`과 `rotation`은 `force=false`일 때 기존 체크포인트 다음부터 이어진다. `force=true`는 체크포인트를 무시하고 처음부터 다시 시작하므로 전체 장기 수집에는 사용하지 않는다.

## 주요 실행 명령

모든 명령은 저장소 루트에서 실행한다.

### 사진 제외 전체 수집

```bash
gh workflow run refresh-nhis-static.yml \
  --repo softm/homecare-nationwide-care-services-map \
  -f mode=full \
  -f scope=catalog,details,evaluations \
  -f shard_count=14 \
  -f force=false
```

### 상세·평가·사진 포함 전체 수집

```bash
gh workflow run refresh-nhis-static.yml \
  --repo softm/homecare-nationwide-care-services-map \
  -f mode=full \
  -f scope=all \
  -f shard_count=14 \
  -f force=false
```

### 특정 기관 상세 수집

```bash
gh workflow run refresh-nhis-static.yml \
  --repo softm/homecare-nationwide-care-services-map \
  -f mode=institution \
  -f scope=details \
  -f institution_id=24119001267 \
  -f service_type=B03 \
  -f force=true
```

### 특정 기관 사진 수집

```bash
gh workflow run refresh-nhis-static.yml \
  --repo softm/homecare-nationwide-care-services-map \
  -f mode=institution \
  -f scope=photos \
  -f institution_id=24119001267 \
  -f service_type=B03 \
  -f force=true
```

### 실패 기관 상세 재처리

```bash
gh workflow run refresh-nhis-static.yml \
  --repo softm/homecare-nationwide-care-services-map \
  -f mode=retry \
  -f scope=details
```

## 실행 확인

최근 실행 목록을 확인한다.

```bash
gh run list \
  --repo softm/homecare-nationwide-care-services-map \
  --workflow refresh-nhis-static.yml
```

특정 실행의 상태를 확인한다. `RUN_ID`는 `gh run list`의 `ID` 열에 표시되는 실행별 고유 번호다.

```bash
gh run view RUN_ID \
  --repo softm/homecare-nationwide-care-services-map
```

완료될 때까지 기다리고 실패 시 오류 종료코드를 받는다.

```bash
gh run watch RUN_ID \
  --repo softm/homecare-nationwide-care-services-map \
  --exit-status
```

GitHub 화면에서는 `Actions` → `Refresh NHIS static data` → 해당 실행을 연다. 노란 원은 실행 중, 초록 체크는 성공, 빨간 X는 실패 또는 취소를 뜻한다.

## 전체 수집 완료 판정

초록 체크는 해당 실행 회차가 성공했다는 뜻이며 전국 전체 수집 완료를 뜻하지 않을 수 있다. 전체 완료는 원격 `main`의 `data/nhis/manifest.json`에서 판단한다.

| 필드 | 완료 기준 |
|---|---|
| `completedShards` | `0`부터 `13`까지 14개가 모두 존재 |
| `detailCount` | 상세 수집 대상 기관 수에 도달 |
| `failureCount` | 최근 회차 실패 원인을 점검하고 필요한 경우 `retry` 실행 |
| `lastRun.scope` | 요청한 범위와 일치 |
| `lastRun.photoSuccess` | 사진 제외 실행이면 `0` |

원격 매니페스트는 로컬 pull 없이 다음 명령으로 확인할 수 있다.

```bash
gh api \
  -H 'Accept: application/vnd.github.raw+json' \
  'repos/softm/homecare-nationwide-care-services-map/contents/data/nhis/manifest.json?ref=main' \
  | jq '{catalogCount,detailCount,photoManifestCount,evaluationCount,completedShards,lastRun,updatedAt}'
```

## 장기 전체 수집 운영 규칙

1. 전체 실행은 한 회차만 호출한다.
2. 해당 실행이 초록 체크로 끝나고 `github-actions[bot]` 커밋이 `main`에 반영될 때까지 기다린다.
3. 다음 회차는 반드시 그 이후에 호출한다.
4. 실행 중 다음 회차를 미리 예약하면 새 실행이 이전 커밋 SHA에서 시작해 체크포인트를 이어받지 못할 수 있다.
5. 같은 날 여러 전체 실행을 호출하면 워크플로별 8,000회 제한과 별개로 일일 누적 호출량이 증가하므로 운영 호출 예산을 확인한다.
6. 사진 제외 수집은 항상 `scope=catalog,details,evaluations`인지 확인한다.

## 문서 갱신 규칙

다음 항목을 변경하면 이 문서와 `docs/INFRASTRUCTURE.md`, `README.md`, `AGENTS.md`를 함께 검토한다.

- `.github/workflows/refresh-nhis-static.yml`의 cron, mode, scope, 호출 한도, Secret, 실행 단계
- `scripts/sync_nhis_static.py`의 수집 범위, 스키마, 출력 경로, 체크포인트 방식
- `data/nhis/manifest.json`의 완료 판정 필드
- GitHub 저장소명이나 기본 브랜치
- 사진 저장 정책 또는 공단 원본 URL 사용 방식

<!-- SOFTM-NHIS-COLLECTION-DOC END -->
