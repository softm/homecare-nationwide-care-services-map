# 치매안심 공개 데이터 MASTER

돌봄한눈은 공개 데이터의 유일한 MASTER입니다. 별도 dementia-care-map 저장소는 전체 공개 JSON을 자신의 배포 산출물로 복사합니다. 이 사이트의 기존 지도·데이터 규격은 유지합니다.

- 수집: `python3 scripts/collect_dementia.py`
- 원본에서 재생성: `python3 scripts/build_dementia.py`
- 검증: `python3 -m unittest discover -s tests -p test_dementia.py`
- 공식 원본과 ID 대응표: `source-data/dementia/`
- 공개 결과: `data/dementia/manifest.json`, `centers.json.gz`, `details/{id}.json`
- 출처 차이 보고서: `source-data/dementia/comparison.json`

수집은 전국치매센터표준데이터(15021138)의 전체 다운로드 JSON과 국립중앙의료원 치매안심센터 정보(15138421)의 최신 공개 CSV를 사용합니다. 공식 다운로드 경로·총 건수·기준일을 매번 확인하고 실패 시 이전 원본을 유지합니다. API 서비스키는 필요하지 않습니다.

지역과 정규화된 이름 또는 동일 주소·전화번호 또는 동일 전화번호와 250m 이내 좌표가 일치하는 자료를 보수적으로 통합합니다. 본소와 분소는 분리하고, 영구 ID 대응표는 삭제하지 않습니다. 주소가 변경되면 옛 좌표를 새 주소에 붙이지 않습니다. 원문 이름·출처·기준일·차이 여부를 보존하며 프로그램은 원문을 표시합니다.

`refresh-dementia.yml`은 화요일 06:31 KST 또는 수동 실행에 갱신·검증하고 부모 디렉터리별로 커밋합니다. 치매안심은 매일 07:17 KST에 MASTER의 한 커밋에서 전체 공개 데이터를 복사해 GitHub Pages에 배포합니다. 실패하면 이전 공개 사이트를 유지합니다. 코드·원본은 로컬 구현 후 사용자 요청에 따라 별도로 원격 반영해야 합니다.

전체 메뉴의 가까운 치매안심센터 버튼은 현재 지도 중심 또는 선택 지역을 dementia.designboard.net에 전달합니다. 계정·검색어·개인 주소는 별도로 전달하지 않습니다.

공식 두 자료의 센터 유형이 다르지만 명칭·전화·위치가 일치하면 통합하고 유형 차이를 기록합니다. 광역치매센터 명칭이 아닌 NMC 치매안심센터는 NMC의 본소 유형으로 표시합니다. 좌표가 출처 간 1km 이상 다르면 위치 차이도 기록합니다. 행정구역 명칭은 고정된 옛 시도 목록에 강제로 맞추지 않습니다.
