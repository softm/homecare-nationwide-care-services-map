# 지도 화면영역 검색용 경계 자료

<!-- SOFTM-VIEWPORT-REGIONS START 날짜:20260904 : 원본·출처·재생성 방법을 보존해 지역 누락 수정의 근거와 갱신 경로를 유지 -->

- 원본: [vuski/admdongkor ver20260401](https://github.com/vuski/admdongkor/tree/7360288277dfd12d74e54b959c59bdd66f852e3a/ver20260401)의 `HangJeongDong_ver20260401.geojson`.
- 원본 커밋: `7360288277dfd12d74e54b959c59bdd66f852e3a`. 좌표계: WGS84(EPSG:4326).
- 법정동 관할 관계: 행정안전부 [2026.3.25 시행 행정기관 및 관할구역 변경내역](https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000052&nttId=124721)의 `jscode20260325.zip` 안 `KIKmix.20260325`. 내려받은 CP949 원문을 내용 변경 없이 `KIKmix.20260325.gz`로 보존한다. <!-- SOFTM-VIEWPORT-CANDIDATES 날짜:20260914 : 법정동 이름과 행정동 이름이 다른 지역도 공식 관할 관계로 안전하게 합산 -->
- 공단 기관자료의 2026-06 기준 지역명과 맞도록 2026-04 경계를 사용한다. 다운로드한 원본 내용은 변경하지 않고 gzip으로 보존한다.
- 재생성: 저장소 루트에서 `node scripts/build_region_bounds.mjs` 실행 → `region-bounds.js`.
- 행정동 좌표의 최솟값·최댓값을 시군구별로 합친 범위와, 같은 법정 읍면동을 관할하는 모든 행정동을 합친 범위를 함께 생성한다. 이전 시 단위 주소를 위해 일반구의 상위 시 범위도 유지하고 좌표 반올림은 바깥 방향으로 수행한다. <!-- SOFTM-VIEWPORT-CANDIDATES 날짜:20260914 : 좁은 지도에서 시군구 전체 주소 변환을 반복하지 않으면서 관할 행정동 일부를 빠뜨리지 않도록 공식 관계를 사용 -->
- 브라우저는 시군구 경계에 0.005도, 공식 관할 합산 경계에 0.001도 여유를 둔다. 기관 주소에서 법정 읍면동을 연결할 수 있을 때만 후보를 줄이고, 연결할 수 없는 주소는 시군구 후보로 보존한 뒤 실제 기관 좌표로 화면 포함 여부를 최종 확인한다. 경계는 기관 위치를 생성하거나 대체하지 않는다. <!-- SOFTM-VIEWPORT-CANDIDATES 날짜:20260914 : 후보 축소가 위치 미확인 기관 누락으로 이어지지 않도록 보수적으로 적용 -->
- 세종시·세종특별자치시, 인천 남구·미추홀구, 강원·전북 명칭과 시/구 사이 띄어쓰기를 정규화한다. 미등록 지역은 시도 범위로 넓혀 조회하며 조용히 제외하지 않는다.
- 검증: `node --test scripts/viewport-regions.test.mjs`. 기관 데이터의 모든 지역 연결, 좁은 화면의 읍면동 후보 축소, 미연결 주소 보존과 완료순 좌표 처리를 검사한다. <!-- SOFTM-VIEWPORT-RESOLVE 날짜:20260914 : 후보 수와 느린 단일 주소가 전체 조회를 지연시키는 회귀를 함께 차단 -->

본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor, https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다.

추가 가공: 돌봄한눈의 시도·시군구 최소 경계 사각형 산출, 행정안전부 관계에 따른 법정 읍면동 관할 범위 합산 및 gzip 보관. 원자료와 가공물의 출처 표시를 유지한다. <!-- SOFTM-VIEWPORT-CANDIDATES 날짜:20260914 : 추가한 공식 관계 자료와 생성 범위를 문서에 명시 -->

- [가공물 라이선스 CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- [원자료 공공누리 제1유형](https://www.kogl.or.kr/info/licenseType1.do)
- [배포자의 데이터 라이선스](https://github.com/vuski/admdongkor/blob/master/LICENSE-DATA)

<!-- SOFTM-VIEWPORT-REGIONS END -->
