#!/usr/bin/env python3
"""정적 공단 데이터의 스키마와 필수 표본을 검증한다."""

# /** SOFTM-NHIS-VALIDATE START 날짜:20260903 : 불완전한 수집물이 배포되어 상세 팝업을 깨뜨리지 않도록 사전 검증 */
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "nhis"
ID_PATTERN = re.compile(r"^\d{11}$")


def read(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as error:
        raise AssertionError(f"JSON을 읽을 수 없습니다: {path.relative_to(ROOT)} ({error})") from error


def main():
    manifest = read(DATA / "manifest.json")
    catalog = read(DATA / "catalog.json")
    assert manifest.get("schemaVersion") == 1, "manifest schemaVersion이 1이 아닙니다."
    assert manifest.get("detailProfile") == "official-page-tabs-11-14-19-v1", "공단 화면 보완 상세 규격이 아닙니다." # SOFTM-NHIS-OFFICIAL-PAGE 날짜:20260903 : 예전 상세 규격의 배포를 차단
    assert isinstance(manifest.get("completedShards"), list), "manifest completedShards가 없습니다."
    assert all(isinstance(manifest.get(key), int) for key in ("updatedCount", "unchangedCount", "failureCount")), "manifest 처리 건수 필드가 없습니다."
    detail_ids = sorted(path.stem for path in (DATA / "details").glob("*/*.json"))
    photo_ids = sorted(path.stem for path in (DATA / "photos").glob("*/*.json"))
    assert manifest.get("detailIds") == detail_ids and manifest.get("detailCount") == len(detail_ids), "manifest 상세 수집목록이 실제 파일과 다릅니다."
    assert manifest.get("photoIds") == photo_ids and manifest.get("photoManifestCount") == len(photo_ids), "manifest 사진 수집목록이 실제 파일과 다릅니다."
    institutions = catalog.get("institutions", [])
    assert catalog.get("count") == len(institutions), "catalog count와 실제 행 수가 다릅니다."
    assert len(institutions) >= 29_000, "시설현황 기관 수가 비정상적으로 적습니다."
    ids = []
    categories = set()
    for item in institutions:
        institution_id = item.get("id")
        assert isinstance(institution_id, str) and ID_PATTERN.fullmatch(institution_id), f"잘못된 기관기호: {institution_id!r}"
        ids.append(institution_id)
        assert item.get("name") and isinstance(item.get("services"), list), f"필수 기관 필드 누락: {institution_id}"
        categories.update(service.get("category") for service in item["services"])
    assert len(ids) == len(set(ids)), "catalog에 기관기호 중복이 있습니다."
    required_categories = {"facility", "daycare", "home-care", "home-nursing", "home-bath", "short-stay"}
    assert required_categories.issubset(categories), f"급여종류 누락: {sorted(required_categories - categories)}"

    required = next((item for item in institutions if item["id"] == "24119001267"), None)
    assert required and required["name"] == "효명노인주야간보호센터", "필수 검증기관 이름 또는 기관기호가 다릅니다."
    detail = read(DATA / "details" / "24" / "24119001267.json")
    assert detail.get("institutionId") == "24119001267" and detail.get("institutionTypeCode") == "B03", "통합 상세 스키마 식별자가 없습니다."
    assert detail.get("sources", {}).get("detail") == "data-go-kr:15058856", "통합 상세 출처가 없습니다."
    service = detail.get("serviceDetails", {}).get("B03", {})
    assert service.get("sections", {}).get("general", {}).get("phone") == "02-2039-1508", "필수 검증기관 전화번호가 다릅니다."
    assert {"general", "capacity", "staff", "programs"}.issubset(service.get("availableSections", [])), "필수 상세 섹션이 없습니다."

    # /** SOFTM-NHIS-OFFICIAL-PAGE START 날짜:20260903 : 공단 화면 고유 항목과 근속·CCTV 탭이 실제 정적 JSON에 보존되는지 고정 검증 */
    official_detail = read(DATA / "details" / "24" / "24121000299.json")
    official_service = official_detail.get("serviceDetails", {}).get("B03", {})
    official_tabs = official_service.get("officialPage", {}).get("tabs", {})
    assert {"11", "14", "19"}.issubset(official_tabs), "공단 화면 기본·인력·CCTV 탭 스냅샷이 없습니다."
    official_fields = official_tabs["11"].get("fields", {})
    assert official_fields.get("이메일주소") == "kimsnur@nate.com", "공단 화면 이메일 항목이 다릅니다."
    assert official_fields.get("전문인배상책임보험") == "Y" and official_fields.get("손해배상책임보험") == "Y", "공단 화면 보험 항목이 다릅니다."
    assert official_tabs["11"].get("lastModifiedDate") == "2026-08-20", "공단 화면 최종변경일이 다릅니다."
    assert any(table.get("caption") == "근속현황" for table in official_tabs["14"].get("tables", [])), "근속현황 표가 없습니다."
    assert any(table.get("caption") == "CCTV현황" for table in official_tabs["19"].get("tables", [])), "CCTV현황 표가 없습니다."
    # /** SOFTM-NHIS-OFFICIAL-PAGE END */

    photo_files = list((DATA / "photos").glob("*/*.json"))
    photo_counts = []
    for path in photo_files:
        payload = read(path)
        assert payload.get("id") == path.stem and ID_PATTERN.fullmatch(path.stem), f"사진 기관기호 경로 불일치: {path}"
        photos = payload.get("photos", [])
        assert payload.get("count") == len(photos) and len(photos) <= 10, f"사진 count/기본 상한 오류: {path.stem}"
        for photo in photos:
            assert photo.get("thumbnailUrl", "").startswith("https://www.longtermcare.or.kr/npbs/attachfile/"), f"허용되지 않은 사진 URL: {path.stem}"
            assert set(("key", "title", "date", "category", "categoryContext", "thumbnailUrl", "detailUrl", "page")).issubset(photo), f"사진 메타데이터 누락: {path.stem}"
        photo_counts.append(len(photos))
    assert photo_counts and max(photo_counts) >= 10, "사진 다수 표본이 없습니다."
    assert 0 in photo_counts, "사진 없음 표본이 없습니다."

    forbidden = ["/api/official-detail", "/api/nhis-detail", "/api/nhis-photo", "/api/official-image"]
    for filename in ("nationwide-daycare-map.html", "nationwide-care-services-map.html", "nhis-static-data.js"):
        text = (ROOT / filename).read_text(encoding="utf-8")
        for value in forbidden:
            assert value not in text, f"{filename}에 제거 대상 브라우저 호출이 남았습니다: {value}"
    care = (ROOT / "nationwide-care-services-map.html").read_text(encoding="utf-8")
    daycare = (ROOT / "nationwide-daycare-map.html").read_text(encoding="utf-8")
    assert "/api/directions" in care and "/api/directions" in daycare, "유지해야 할 directions 호출이 누락됐습니다."
    print(f"공단 정적 데이터 검사 완료: catalog {len(institutions):,}곳 · 상세 {manifest.get('detailCount', 0):,}곳 · 사진 매니페스트 {len(photo_files):,}곳")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as error:
        print(f"검사 실패: {error}", file=sys.stderr)
        sys.exit(1)
# /** SOFTM-NHIS-VALIDATE END */
