# /** SOFTM-ADVANCED-SEARCH START 날짜:20260904 : 공단 결과 누락과 조건 무시 응답이 정상 검색 자료로 배포되지 않도록 검사 */
import unittest
import gzip
import json
from collect_nhis_search import ROOT, build_index, parse_result


class SearchResultTests(unittest.TestCase):
    def result(self, rows, total='2', condition='Y'):
        return f'<input id="siDoCd" value="11"><input id="ltcAdminKindChoiceYn8" value="{condition}"><input id="adminList" value="{rows}"><input id="totCntMap" value="{total}">'

    def test_full_list_not_only_visible_first_page(self):
        rows = parse_result(self.result('1:21168000177:B03;2:31135000092:C05;'), {'siDoCd': '11', 'ltcAdminKindChoiceYn8': 'Y'})
        self.assertEqual(rows, [['21168000177', 'B03'], ['31135000092', 'C05']])

    def test_missing_and_duplicate_rows_are_rejected(self):
        for text in [self.result('1:21168000177:B03;'), self.result('1:21168000177:B03;2:21168000177:B03;')]:
            with self.assertRaises(ValueError):
                parse_result(text, {'siDoCd': '11'})

    def test_ignored_conditions_and_error_pages_are_rejected(self):
        for text in [self.result('', '0', ''), 'refreshedException']:
            with self.assertRaises(ValueError):
                parse_result(text, {'siDoCd': '11', 'ltcAdminKindChoiceYn8': 'Y'})

    def test_verified_zero_is_valid(self):
        self.assertEqual(parse_result(self.result('', '0'), {'siDoCd': '11', 'ltcAdminKindChoiceYn8': 'Y'}), [])

    def test_published_index_matches_every_original_result(self):
        index = json.loads(gzip.decompress((ROOT / 'data/nhis/search-index.json.gz').read_bytes()))
        original = build_index(ROOT / 'source-data/nhis-search' / index['sourceDate'])
        self.assertEqual(index, original)


if __name__ == '__main__':
    unittest.main()
# /** SOFTM-ADVANCED-SEARCH END */
