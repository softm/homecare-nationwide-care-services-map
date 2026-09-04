# 지도 화면영역 검색용 경계 자료

<!-- SOFTM-VIEWPORT-REGIONS START 날짜:20260904 : 원본·출처·재생성 방법을 보존해 지역 누락 수정의 근거와 갱신 경로를 유지 -->

- 원본: [vuski/admdongkor ver20260401](https://github.com/vuski/admdongkor/tree/7360288277dfd12d74e54b959c59bdd66f852e3a/ver20260401)의 `HangJeongDong_ver20260401.geojson`.
- 원본 커밋: `7360288277dfd12d74e54b959c59bdd66f852e3a`. 좌표계: WGS84(EPSG:4326).
- 공단 기관자료의 2026-06 기준 지역명과 맞도록 2026-04 경계를 사용한다. 다운로드한 원본 내용은 변경하지 않고 gzip으로 보존한다.
- 재생성: 저장소 루트에서 `node scripts/build_region_bounds.mjs` 실행 → `region-bounds.js`.
- 행정동 좌표의 최솟값·최댓값을 시군구별로 합친 직사각형 범위다. 이전 시 단위 주소를 위해 일반구의 상위 시 범위도 함께 생성한다. 좌표 반올림은 바깥 방향으로 수행한다.
- 브라우저는 경계 오차를 위한 0.005도 여유를 두어 후보를 넓게 고르고, 실제 기관 좌표가 화면 안에 있는지 최종 확인한다. 경계는 기관 위치를 생성하거나 대체하지 않는다.
- 세종시·세종특별자치시, 인천 남구·미추홀구, 강원·전북 명칭과 시/구 사이 띄어쓰기를 정규화한다. 미등록 지역은 시도 범위로 넓혀 조회하며 조용히 제외하지 않는다.
- 검증: `node --test scripts/viewport-regions.test.mjs`. 기관 데이터의 모든 지역이 인덱스에 직접 연결되는지도 검사한다.

본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor, https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다.

추가 가공: 돌봄한눈의 시도·시군구 최소 경계 사각형 산출 및 gzip 보관. 원자료와 가공물의 출처 표시를 유지한다.

- [가공물 라이선스 CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- [원자료 공공누리 제1유형](https://www.kogl.or.kr/info/licenseType1.do)
- [배포자의 데이터 라이선스](https://github.com/vuski/admdongkor/blob/master/LICENSE-DATA)

<!-- SOFTM-VIEWPORT-REGIONS END -->
