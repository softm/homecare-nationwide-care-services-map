# /** SOFTM-DATA-UNIFIED START 날짜:20260904 : 수집 자료의 새 기관·급여·평가·인력이 지도 인덱스에서 빠지거나 다른 급여로 섞이는 회귀를 방지 */
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from build_nationwide_care_services import ROOT, CATEGORY_CODES, DEMENTIA_CODES, build_record, read_json, update_facility_head_count, update_index_counts, write_json


class CareDataTest(unittest.TestCase):
    # /** SOFTM-DATA-GZIP START 날짜:20260910 : 로컬과 Actions의 같은 지도 데이터가 gzip 헤더 차이만으로 변경되지 않도록 검사 */
    def test_gzip_output_uses_the_same_unix_header(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "sample.json.gz"
            first_revision = write_json(path, [{"기관": "돌봄한눈"}])
            first_payload = path.read_bytes()
            second_revision = write_json(path, [{"기관": "돌봄한눈"}])
            self.assertEqual(first_payload[9], 3)
            self.assertEqual(first_payload, path.read_bytes())
            self.assertEqual(first_revision, second_revision)
    # /** SOFTM-DATA-GZIP END */

    # /** SOFTM-HOME-COUNT-TEST START 날짜:20260907 : 치매 CSS 선택자가 요양원 카드 수를 덮는 실제 회귀와 잘못된 카드 구조를 생성 전에 차단 */
    def test_home_counts_are_updated_inside_each_category_card(self):
        html = '''<meta name="dcterms.modified" content="2026-09-04">
<style>.category-link[data-category="dementia"]{color:red}</style>
<a class="category-link" data-category="facility" href="nursing-home-map.html"><span data-count>423곳</span></a>
<a class="category-link" data-category="dementia" href="dementia-care-map.html"><span data-count>423곳</span></a>
<a class="category-link" data-category="daycare" href="daycare-map.html"><span data-count>5,000곳</span></a>'''
        updated = update_index_counts(html, {"facility": {"count": 6573}, "dementia": {"count": 423}})
        self.assertIn('data-category="facility" href="nursing-home-map.html"><span data-count>6,573곳</span>', updated)
        self.assertIn('data-category="dementia" href="dementia-care-map.html"><span data-count>423곳</span>', updated)
        self.assertIn('data-category="daycare" href="daycare-map.html"><span data-count>5,000곳</span>', updated)
        self.assertIn('.category-link[data-category="dementia"]{color:red}', updated)
        self.assertIn('<meta name="dcterms.modified" content="2026-', updated)

    def test_home_count_update_rejects_missing_or_ambiguous_cards(self):
        card = '<meta name="dcterms.modified" content="2026-09-04"><a class="category-link" data-category="facility"><span data-count>1곳</span></a>'
        with self.assertRaisesRegex(ValueError, '카드가 0개'):
            update_index_counts('<style>[data-category="facility"]{}</style>', {"facility": {"count": 6573}})
        with self.assertRaisesRegex(ValueError, '카드가 2개'):
            update_index_counts(card + card, {"facility": {"count": 6573}})
        with self.assertRaisesRegex(ValueError, '기관 수가 2개'):
            update_index_counts(card.replace('</a>', '<span data-count>2곳</span></a>'), {"facility": {"count": 6573}})

    def test_facility_search_metadata_uses_the_manifest_count(self):
        html = '''<!-- /** SOFTM-SEO-FACILITY-INTENT START 날짜:20260907 : 테스트 */ -->
<title>전국 요양원 100곳 찾기·비교</title><meta name="description" content="전국 요양원 100곳"><meta name="dcterms.modified" content="2026-09-04"><meta property="og:title" content="전국 요양원 100곳"><meta name="twitter:description" content="전국 요양원 100곳"><script type="application/ld+json">{"description":"전국 요양원 100곳"}</script>
<!-- /** SOFTM-SEO-FACILITY-INTENT END */ --><p>서울 요양원 25곳</p>'''
        updated = update_facility_head_count(html, 6573)
        head = updated.split('<!-- /** SOFTM-SEO-FACILITY-INTENT END */ -->')[0]
        self.assertEqual(head.count('6,573곳'), 5)
        self.assertNotIn('100곳', head)
        self.assertIn('<p>서울 요양원 25곳</p>', updated)
        self.assertRegex(updated, r'dcterms\.modified" content="\d{4}-\d{2}-\d{2}')
    # /** SOFTM-HOME-COUNT-TEST END */

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
