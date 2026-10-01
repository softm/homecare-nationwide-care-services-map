import gzip, importlib.util, json, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from build_dementia import normalize,reconcile,province,coord,compatible

def row(name='서울특별시종로구치매안심센터',source='nmc',date='2026-01-28',address='서울특별시 종로구 율곡로 1',location=None,type='center'):
    return dict(name=name,source=source,sourceDate=date,address=address,province='서울특별시',city='종로구',type=type,location=location,phone='02-123-4567',website='',programs='',operator='',facilities='',opened='')

class ReconciliationTests(unittest.TestCase):
    def test_province_names_do_not_merge_north_south(self):
        self.assertEqual(province('경상남도'),'경상남도');self.assertEqual(province('충청남도'),'충청남도');self.assertEqual(province('경남'),'경상남도');self.assertEqual(province('강원도'),'강원특별자치도')
    def test_two_sources_merge_and_keep_provenance(self):
        data,conflicts=reconcile([row(),row(name='종로구 치매안심센터',source='standard')],{})
        self.assertEqual(len(data),1);self.assertEqual(len(data[0]['sources']),2)
    def test_branch_is_not_main_center(self):
        self.assertFalse(compatible(row(),row(name='종로구치매안심센터 분소',type='branch')))
    def test_new_address_does_not_inherit_old_coordinates(self):
        data,_=reconcile([row(location={'lat':37.5,'lng':127}),row(source='standard',date='2026-09-01',address='서울특별시 종로구 율곡로 200')],{})
        self.assertIsNone(data[0]['location']);self.assertIn('address',data[0]['conflicts'])
    def test_id_persists_when_new_source_added(self):
        registry={};first,_=reconcile([row()],registry);second,_=reconcile([row(),row(name='종로구치매안심센터',source='standard')],registry)
        self.assertEqual(first[0]['id'],second[0]['id'])
    def test_same_phone_and_nearby_coordinates_handles_name_change(self):
        a=row(location={'lat':37.5,'lng':127})
        b=row(name='종로구보건소치매센터',source='standard',address='서울특별시 종로구 율곡로 1 (보건소)',location={'lat':37.5005,'lng':127})
        self.assertTrue(compatible(a,b))
        b['location']={'lat':35,'lng':128};self.assertFalse(compatible(a,b))
    def test_conflicting_type_keeps_both_sources(self):
        a=row(location={'lat':37.5,'lng':127})
        b=row(source='standard',date='2026-09-01',type='regional',location={'lat':37.5,'lng':127})
        data,_=reconcile([a,b],{})
        self.assertEqual(len(data),1);self.assertEqual(data[0]['type'],'center');self.assertIn('type',data[0]['conflicts'])
    def test_invalid_coordinates_remain_missing(self):
        self.assertIsNone(coord('',''));self.assertIsNone(coord('0','0'));self.assertIsNone(coord('127','37'))
    def test_complete_real_dataset_provenance(self):
        manifest=json.loads((ROOT/'data/dementia/manifest.json').read_text());rows=json.loads(gzip.decompress((ROOT/'data/dementia/centers.json.gz').read_bytes()))
        self.assertEqual(len(rows),manifest['count']);self.assertEqual(len({r['id'] for r in rows}),len(rows))
        sources=[]
        for r in rows:
            detail=json.loads((ROOT/'data/dementia/details'/f"{r['id']}.json").read_text());sources.extend(s['key'] for s in detail['sources'])
            self.assertTrue(r['province']);self.assertTrue(r['address'])  # 새 행정구역 명칭은 원자료 그대로 허용
        for key,count in manifest['sourceCounts'].items():self.assertEqual(sources.count(key),count)

if __name__=='__main__':unittest.main()
