import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / 'scripts' / 'hira_coordinate_safety.py'
spec = importlib.util.spec_from_file_location('hira_coordinate_safety', SOURCE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class MatchingSafetyTests(unittest.TestCase):
    def test_city_collision_is_not_a_match(self):
        a = mod.row_key('행복의원', '서울특별시 중구 중앙로 12')
        b = mod.row_key('행복의원', '부산광역시 중구 중앙로 12')
        self.assertNotEqual(a, b)

    def test_city_and_gu_are_required_in_compound_city(self):
        a = mod.row_key('행복의원', '경기도 수원시 장안구 중앙로 12')
        b = mod.row_key('행복의원', '경기도 안양시 장안구 중앙로 12')
        self.assertNotEqual(a, b)

    def test_standard_and_short_province_normalize(self):
        a = mod.row_key(' 서울 병원 ', '서울특별시 종로구 세종대로 12')
        b = mod.row_key('서울병원', '서울 종로구 세종대로 12')
        self.assertEqual(a, b)

    def test_unknown_province_or_road_rejected(self):
        self.assertIsNone(mod.row_key('행복의원', '중구 중앙로 12'))
        self.assertIsNone(mod.row_key('행복의원', '서울 중구 주소없음'))

    def test_cities_without_gu_can_match(self):
        self.assertIsNotNone(mod.row_key('병원', '강원특별자치도 춘천시 중앙로 12'))
        self.assertIsNotNone(mod.row_key('병원', '세종특별자치시 도움3로 12'))

    def test_duplicate_source_keys_rejected_even_when_same_coords(self):
        key = mod.row_key('행복의원', '서울특별시 중구 중앙로 12')
        b = mod.row_key('다른의원', '서울특별시 중구 중앙로 15')
        filtered, rejected = mod.filter_unique_source_keys([
            (key, {'id': 1}), (key, {'id': 1}), (b, {'id': 2})
        ])
        self.assertEqual(filtered, [{'id': 2}])
        self.assertEqual(rejected, 2)

    def test_hira_origin_is_not_assumed_from_filename(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / 'HIRA-fake.csv'
            src.write_text('임의 파일', encoding='utf-8')
            digest = mod.sha256_file(src)
            with self.assertRaisesRegex(ValueError, 'canonical URLs'):
                mod.attest_official_source(src, digest, 'https://example.com/fake')
            with self.assertRaisesRegex(ValueError, 'mismatch'):
                mod.attest_official_source(src, '0' * 64, 'https://www.data.go.kr/data/15051059/fileData.do')
            self.assertEqual(mod.attest_official_source(src, digest, 'https://www.data.go.kr/data/15051059/fileData.do'), digest)

    def test_reviewed_plan_detects_stale_db_or_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'dryrun.jsonl'
            approved = [{'id': 1, 'name': '행복의원', 'new_latitude': 37.5}]
            path.write_text(''.join(json.dumps(x, ensure_ascii=False) + '\n' for x in approved), encoding='utf-8')
            digest = mod.sha256_file(path)
            self.assertTrue(mod.reviewed_plan_equals(path, digest, approved))
            self.assertFalse(mod.reviewed_plan_equals(path, digest, [{'id': 1, 'name': '행복의원', 'new_latitude': 37.6}]))
            self.assertFalse(mod.reviewed_plan_equals(path, 'f' * 64, approved))


if __name__ == '__main__':
    unittest.main()
