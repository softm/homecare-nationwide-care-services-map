#!/usr/bin/env python3
"""공단 공개 검색 결과를 정적 상세검색 인덱스로 보존한다."""
# /** SOFTM-ADVANCED-SEARCH START 날짜:20260904 : 상세검색을 기관명 추정이나 실시간 외부 호출 없이 공식 검색 결과에 연결 */
import argparse
import gzip
import json
import re
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
URL = 'https://www.longtermcare.or.kr/npbs/r/a/201/selectXLtcoSrch.web'
FORM_URL = 'https://www.longtermcare.or.kr/npbs/r/a/201/selectLtcoSrch.web'
FEATURES = {
    'dementia-facility': {'ltcAdminKindChoiceYn1': 'Y', 'ltcAdminPttnChoiceYn11': 'Y'},
    'dementia-home': {'ltcAdminKindChoiceYn1': 'Y', 'ltcAdminPttnChoiceYn12': 'Y'},
    'dementia-daycare': {'ltcAdminKindChoiceYn1': 'Y', 'ltcAdminPttnChoiceYn13': 'Y'},
    'cognitive-home': {'ltcAdminKindChoiceYn2': 'Y', 'ltcAdminPttnChoiceYn21': 'Y'},
    'cognitive-daycare': {'ltcAdminKindChoiceYn2': 'Y', 'ltcAdminPttnChoiceYn23': 'Y'},
    'first-nursing': {'ltcAdminPttnChoiceYn22': 'Y'},
    'respite-home': {'ltcAdminKindChoiceYn7': 'Y', 'ltcAdminPttnChoiceYn71': 'Y'},
    'respite-short': {'ltcAdminKindChoiceYn7': 'Y', 'ltcAdminPttnChoiceYn72': 'Y'},
    'integrated-daycare': {'ltcAdminKindChoiceYn8': 'Y', 'unityOahAdminPttnCd': '01'},
    'integrated-home': {'ltcAdminKindChoiceYn8': 'Y', 'unityOahAdminPttnCd': '02'},
    'short-pilot': {'ltcAdminKindChoiceYn10': 'Y'},
    'green': {'ltcAdminKindChoiceYn3': 'Y'},
    'panel': {'ltcAdminKindChoiceYn6': 'Y'},
}
QUERIES = {**FEATURES, **{f'owner-{i}': {'searchAdminFdatType': str(i)} for i in range(1, 6)}}


class SearchParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.inputs = {}

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'input' and values.get('id'):
            self.inputs[values['id']] = values.get('value', '')


def parse_result(text, params):
    parser = SearchParser()
    parser.feed(text)
    values = parser.inputs
    if 'adminList' not in values or not values.get('totCntMap', '').isdigit():
        raise ValueError('공단 결과 구조 확인 실패: 검색 인덱스를 갱신하지 않습니다.')
    for key, value in params.items():
        if values.get(key) != value:
            raise ValueError(f'검색 조건 응답 불일치: {key}')
    rows = []
    for item in filter(None, values['adminList'].split(';')):
        match = re.fullmatch(r'(\d+):(\d{11}):([A-Z]\d{2})', item)
        if not match:
            raise ValueError('공단 기관 목록 형식 변경')
        rows.append([match[2], match[3]])
    total = int(values['totCntMap'])
    if len(rows) != total or len({tuple(row) for row in rows}) != total:
        raise ValueError(f'공단 검색 결과 누락/중복: {len(rows)}/{total}')
    return rows


def collect_one(source, feature, province):
    params = {'siDoCd': province, **QUERIES[feature]}
    path = source / f'{feature}-{province}.json'
    if path.exists():
        snapshot = json.loads(path.read_text())
        if snapshot['params'] == params and len(snapshot['rows']) == snapshot['total']:
            return feature, snapshot['rows']
    url = URL + '?' + urlencode(params)
    for attempt in range(3):
        try:
            result = subprocess.run(['curl', '-fsSL', '--max-time', '60', url], check=True, capture_output=True)
            text = result.stdout.decode('utf-8')
            rows = parse_result(text, params)
            snapshot = {'url': url, 'params': params, 'retrievedAt': datetime.now(ZoneInfo('Asia/Seoul')).isoformat(),
                        'total': len(rows), 'rows': rows}
            path.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + '\n')
            # 공단 원문도 보존해 검색 조건과 전체 기관목록을 재검증할 수 있게 한다.
            path.with_suffix('.html.gz').write_bytes(gzip.compress(result.stdout, mtime=0))
            time.sleep(0.4)
            return feature, rows
        except (subprocess.CalledProcessError, ValueError) as error:
            if attempt == 2:
                raise RuntimeError(f'{feature}/{province}: {error}') from error
            time.sleep(2 * (attempt + 1))


def search_provinces(source):
    text = gzip.decompress((source / 'search-form.html.gz').read_bytes()).decode()
    select = re.search(r'<select\s+id="si_do_cd"[^>]*>(.*?)</select>', text, re.S)
    if not select:
        raise ValueError('공단 시도 선택 목록을 확인할 수 없습니다.')
    codes = re.findall(r'<option\s+value="(\d{2})"', select[1])
    if len(set(codes)) < 16:
        raise ValueError('공단 시도 선택 목록이 불완전합니다.')
    return codes


def build_index(source):
    features = list(FEATURES)
    records = {}
    totals = {}
    for feature in QUERIES:
        ids = set()
        for province in search_provinces(source):
            path = source / f'{feature}-{province}.json'
            snapshot = json.loads(path.read_text())
            expected = {'siDoCd': province, **QUERIES[feature]}
            raw_rows = parse_result(gzip.decompress(path.with_suffix('.html.gz').read_bytes()).decode(), expected)
            if snapshot['params'] != expected or snapshot['rows'] != raw_rows or snapshot['total'] != len(raw_rows):
                raise ValueError(f'수집 원문과 인덱스 불일치: {path.name}')
            ids.update(row[0] for row in raw_rows)
        totals[feature] = len(ids)
        for identity in ids:
            row = records.setdefault(identity, [0, 0])
            if feature.startswith('owner-'):
                owner = int(feature.rsplit('-', 1)[1])
                if row[0] and row[0] != owner:
                    raise ValueError(f'설립주체 중복 분류: {identity}')
                row[0] = owner
            else:
                row[1] |= 1 << features.index(feature)
    return {'schemaVersion': 1, 'sourceDate': source.name, 'sourceUrl': URL, 'provinces': search_provinces(source), 'features': features,
            'totals': totals, 'records': dict(sorted(records.items()))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', default=datetime.now(ZoneInfo('Asia/Seoul')).strftime('%Y%m%d'))
    parser.add_argument('--build-only', action='store_true')
    parser.add_argument('--workers', type=int, choices=(1, 2, 3), default=2)
    args = parser.parse_args()
    if not re.fullmatch(r'\d{8}', args.date):
        parser.error('--date 형식은 YYYYMMDD입니다.')
    source = ROOT / 'source-data' / 'nhis-search' / args.date
    source.mkdir(parents=True, exist_ok=True)
    if not args.build_only:
        form = source / 'search-form.html.gz'
        if not form.exists():
            result = subprocess.run(['curl', '-fsSL', '--max-time', '60', FORM_URL], check=True, capture_output=True)
            form.write_bytes(gzip.compress(result.stdout, mtime=0))
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            tasks = [pool.submit(collect_one, source, feature, province) for feature in QUERIES for province in search_provinces(source)]
            for count, task in enumerate(as_completed(tasks), 1):
                feature, rows = task.result()
                print(f'{count}/{len(tasks)} {feature}: {len(rows)}개 급여기록', flush=True)
    index = build_index(source)
    output = ROOT / 'data' / 'nhis' / 'search-index.json.gz'
    payload = gzip.compress(json.dumps(index, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
    temporary = output.with_suffix('.tmp')
    temporary.write_bytes(payload)
    temporary.replace(output)
    print(json.dumps({'institutions': len(index['records']), **index['totals']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
# /** SOFTM-ADVANCED-SEARCH END */
