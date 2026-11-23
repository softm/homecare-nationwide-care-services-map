# 돌봄 수요·공급 지도 자료와 산식

<!-- SOFTM-CARE-GAP-DOC START 날짜:20261123 : 공개 지도 재생성에 필요한 출처·행정구역 보정·해석 한계를 기록 -->

공개 화면은 `care-gap-map.html`, 배포 자료는 `data/care-gap/regions.json`, 생성기는 `scripts/build-care-gap-map.mjs`다. 지도는 기관 부족을 확정하지 않고 추가 확인 우선순위를 비교한다.

## 자료 기준

- 65세 이상 인구: 행정안전부 주민등록 인구통계, 2026-10-31 기준. 원문 화면은 `https://jumin.mois.go.kr/etcStatOldAge.do`다.
- 장기요양 인정자: 국민건강보험공단 노인장기요양보험 등급판정 현황, 2026-08-31 기준. 2026-09 이후 공개 파일이 시도 단위로 바뀌기 전 마지막 최신 시군구 자료를 사용한다. 원문은 `https://www.data.go.kr/data/3051421/fileData.do`다.
- 기관: `data/care/manifest.json`과 유형별 압축자료, 2026-09-30 기준. 기관기호를 지역·유형별로 중복 제거한다.
- 행정경계: `admdongkor`의 `ver20261001/HangJeongDong_ver20261001.geojson`, 2026-10-01 기준.

공단이 1~4명을 `*`로 비식별한 셀은 최소 1명·최대 4명 범위를 보존한다. 화면 색상과 합계의 대표값에만 중간값 2.5명을 사용한다.

## 산식과 표시

- 고령인구 비율 = 65세 이상 주민등록인구 ÷ 전체 주민등록인구
- 장기요양 인정 비율 = 65세 이상 장기요양 1~5등급·인지지원등급 인정자 ÷ 65세 이상 주민등록인구
- 공급 압력 = 위 인정자 수 ÷ 선택 유형 기관 수
- 열지도 5단계는 전국 230개 비교 지역의 상대 순위다. 선택 유형 기관이 0곳이고 인정자가 있으면 가장 높은 단계다.

기관 수만으로 정원, 현재 빈자리, 실제 서비스 권역, 대기기간, 교통 접근성을 알 수 없다. 붉은 지역을 확정 부족 지역이나 신규 입지 적합 지역으로 단정하지 않는다.

## 행정구역 보정

- 광주광역시와 전라남도는 2026년 통합 행정구역인 `전남광주통합특별시`로 결합한다.
- 공단 기관 목록의 `당진군`은 현재 `당진시`로 연결한다.
- 2026년 인천 구 개편 전 주소는 법정동을 기준으로 검단구·서해구·영종구·제물포구에 배분한다. 기관 지도 이동은 공단의 이전 주소 범위로 열릴 수 있음을 화면에 알린다.

## 재생성

공식 CSV와 최신 경계 파일을 저장소 밖에서 받은 뒤 아래처럼 생성한다. 원본 파일명은 내려받은 실제 경로로 바꾼다.

```sh
node scripts/build-care-gap-map.mjs \
  --population-csv /path/to/mois-old-age.csv \
  --recognition-csv /path/to/nhis-ltc-recognition.csv \
  --boundary-geojson /path/to/HangJeongDong_ver20261001.geojson
node scripts/build-care-gap-map.mjs --check
node --test scripts/care-gap-map.test.mjs
```

자료 기준일이나 행정구역이 바뀌면 생성기 상수, 이 문서, 화면 설명, 자동검사를 한 작업에서 갱신한다.

<!-- SOFTM-CARE-GAP-DOC END -->
