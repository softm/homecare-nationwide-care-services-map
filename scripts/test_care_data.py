# /** SOFTM-DATA-UNIFIED START 날짜:20260904 : 수집 자료의 새 기관·급여·평가·인력이 지도 인덱스에서 빠지거나 다른 급여로 섞이는 회귀를 방지 */
import unittest

from build_nationwide_care_services import ROOT, CATEGORY_CODES, DEMENTIA_CODES, build_record, read_json


class CareDataTest(unittest.TestCase):
    def test_collected_catalog_membership(self):
        catalog = read_json(ROOT / "data/nhis/catalog.json")["institutions"]
        for category, codes in {**CATEGORY_CODES, "dementia": DEMENTIA_CODES}.items():
            expected = {row["id"] for row in catalog if any(service["code"] in codes for service in row["services"])}
            actual = read_json(ROOT / f"data/care/{category}.json.gz")
            self.assertEqual(expected, {row["i"] for row in actual}, category)

    def test_collected_detail_and_service_boundaries(self):
        institution = {"id": "21111000008", "name": "수집 목록 이름", "address": "경기도 광명시 오리로 1", "services": [
            {"code": "B03", "name": "주야간보호", "capacity": 20}, {"code": "H31", "name": "치매전담실", "capacity": 5}, {"code": "B01", "name": "방문요양", "capacity": 0}]}
        detail = {"basic": {"name": "수집 상세 이름", "address": "경기도 부천시 소사구 경인로 1"}, "serviceDetails": {
            "B03": {"sections": {"capacity": {"capacity": 30}, "staff": {"careWorker": 4}}},
            "H31": {"sections": {"capacity": {"capacity": 7}, "staff": {"careWorker": 2}}},
            "B01": {"sections": {"staff": {"careWorker": 100}}}}}
        evaluations = [{"service": "주야간보호", "date": "2023-01-01", "evaluation": "2023년 평가", "grade": "B", "score": 80},
                       {"service": "주야간보호", "date": "2024-01-01", "evaluation": "2024년 평가", "grade": "A", "score": 92},
                       {"service": "방문요양", "date": "2025-01-01", "grade": "E", "score": 30}]
        row = build_record(institution, detail, evaluations, "daycare")
        self.assertEqual((row["n"], row["c"], row["z"], row["cw"], row["g"], row["es"], row["ey"]), ("수집 상세 이름", "부천시 소사구", 37, 6, "A", 92, 2024))
        special = build_record(institution, detail, evaluations, "dementia")
        self.assertEqual((special["t"], special["z"], special["cw"]), ("H31", 7, 2))
        detail["serviceDetails"]["H31"]["sections"]["staff"] = None
        self.assertTrue(build_record(institution, detail, evaluations, "daycare")["staffMissing"])

    def test_current_detail_reaches_search(self):
        key = "21111000008"
        detail = read_json(ROOT / f"data/nhis/details/{key[:2]}/{key}.json.gz")
        row = next(row for row in read_json(ROOT / "data/care/daycare.json.gz") if row["i"] == key)
        self.assertEqual(row["cw"], detail["serviceDetails"]["B03"]["sections"]["staff"]["careWorker"])
        self.assertEqual(row["z"], detail["serviceDetails"]["B03"]["sections"]["capacity"]["capacity"])

    def test_hospital_source_is_separate(self):
        source = read_json(ROOT / "data/hira/nursing-hospitals.json")
        rows = read_json(ROOT / "data/care/nursing-hospital.json.gz")
        self.assertEqual({row["i"] for row in source["institutions"]}, {row["i"] for row in rows})
        self.assertTrue(all(row["t"] == "HOSP" and "g" not in row for row in rows))


if __name__ == "__main__":
    unittest.main()
# /** SOFTM-DATA-UNIFIED END */
