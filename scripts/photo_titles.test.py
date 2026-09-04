# /** SOFTM-PHOTO-FULL-TITLE START 날짜:20260904 : 게시글 제목 추출과 기존 사진 메타데이터 보존을 검증 */
import unittest
from unittest.mock import Mock
import sync_nhis_static as sync


class PhotoTitleTests(unittest.TestCase):
    def test_full_title_keeps_parentheses_and_entities(self):
        parser = sync.PhotoTitleParser()
        parser.feed('<span class="other">메뉴</span><span class="tbl_tit f_l">즐거운 <b>체조</b> &amp; 음악 (20220401)</span><p>작성자</p>')
        self.assertEqual(sync.clean("".join(parser.parts)), "즐거운 체조 & 음악 (20220401)")

    def test_resolution_preserves_photo_source_and_date(self):
        photo = {"title": "즐거운 체조 ...", "alt": "즐거운 체조 ...", "detailUrl": "https://example.test/detail", "url": "photo.jpg", "key": "ST123", "date": "2022-04-13"}
        session = Mock()
        session.get.return_value.text = '<span class="tbl_tit">즐거운 체조시간(20220401)</span>'
        sync.fill_photo_title(session, photo)
        self.assertEqual(photo["title"], "즐거운 체조시간(20220401)")
        self.assertEqual(photo["alt"], photo["title"])
        self.assertEqual((photo["url"], photo["key"], photo["date"]), ("photo.jpg", "ST123", "2022-04-13"))
        self.assertFalse(sync.needs_photo_title(photo))

    def test_line_break_does_not_stop_title_capture(self):
        parser = sync.PhotoTitleParser()
        parser.feed('<span class="tbl_tit">첫째 줄<br/>둘째 줄</span>')
        self.assertEqual(sync.clean("".join(parser.parts)), "첫째 줄 둘째 줄")

    def test_complete_and_original_ellipsis_titles_are_not_refetched(self):
        self.assertFalse(sync.needs_photo_title({"title": "사진 제목 전체"}))
        self.assertFalse(sync.needs_photo_title({"title": "기관이 붙인 제목...", "titleSource": "detail"}))
        self.assertTrue(sync.needs_photo_title({"title": "잘린 제목 ..."}))

    def test_missing_title_does_not_erase_existing_metadata(self):
        session = Mock()
        session.get.return_value.text = '<h1>찾을 수 없는 게시글</h1>'
        photo = {"title": "기존 제목 ...", "detailUrl": "https://example.test/detail"}
        with self.assertRaises(ValueError):
            sync.fill_photo_title(session, photo)
        self.assertEqual(photo["title"], "기존 제목 ...")
        self.assertNotIn("titleSource", photo)


if __name__ == "__main__":
    unittest.main()
# /** SOFTM-PHOTO-FULL-TITLE END */
