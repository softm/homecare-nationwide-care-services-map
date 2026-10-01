#!/usr/bin/env python3
"""SOFTM-DEMENTIA START 날짜:20261001 : 두 공식 원본을 MASTER에서만 정규화한다."""
import argparse, csv, gzip, hashlib, io, json, math, re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'standard': {'name': '전국치매센터표준데이터', 'url': 'https://www.data.go.kr/data/15021138/standard.do'},
    'nmc': {'name': '국립중앙의료원 치매안심센터 정보', 'url': 'https://www.data.go.kr/data/15138421/fileData.do'},
}
PROVINCES = {'서울':'서울특별시','부산':'부산광역시','대구':'대구광역시','인천':'인천광역시','광주':'광주광역시','대전':'대전광역시','울산':'울산광역시','세종':'세종특별자치시','경기':'경기도','강원':'강원특별자치도','충북':'충청북도','충남':'충청남도','전북':'전북특별자치도','전남':'전라남도','경북':'경상북도','경남':'경상남도','제주':'제주특별자치도'}

def clean(value):
    return re.sub(r'\s+', ' ', str(value or '')).strip()

def province(value):
    value = clean(value)
    for short, full in PROVINCES.items():
        if value == short or value == full: return full
    return {'강원도':'강원특별자치도','전라북도':'전북특별자치도','제주도':'제주특별자치도'}.get(value,value)

def token(value):
    return re.sub(r'[^가-힣a-zA-Z0-9]', '', clean(value)).lower()

def coord(lat, lng):
    try:
        lat, lng = float(lat), float(lng)
        return {'lat':lat,'lng':lng} if 33 <= lat <= 39.5 and 124 <= lng <= 132 else None
    except (ValueError, TypeError): return None

def name_key(row):
    name = token(row['name'])
    for prefix in [row['province'], *[k for k,v in PROVINCES.items() if v == row['province']]]:
        if name.startswith(prefix): name = name[len(prefix):]
    return name

def kind(name, raw):
    if '광역' in raw or '광역치매' in name: return 'regional'
    if '주간보호' in name or '주야간보호' in name: return 'other'
    if any(x in name for x in ['분소','분관','보건지소','보건진료소']): return 'branch'
    if '치매안심센터' in raw or '치매안심센터' in name or '치매지원센터' in name: return 'center'
    return 'other'

def normalize(raw, source, date):
    nmc = source == 'nmc'
    name = clean(raw.get('치매안심센터명') if nmc else raw.get('CNTER_NM'))
    address = clean(' '.join([raw.get('주소1',''),raw.get('주소2','')]) if nmc else raw.get('RDNMADR') or raw.get('LNMADR'))
    parts = address.split()
    p = province(raw.get('시도') if nmc else parts[0] if parts else '')
    city = parts[1] if len(parts)>1 and p != '세종특별자치시' else ''
    if len(parts)>2 and city.endswith('시') and parts[2].endswith('구'): city += ' '+parts[2]
    url = clean(raw.get('홈페이지')) if nmc else ''
    if url and not url.startswith(('http://','https://')): url='https://'+url
    return {'name':name, 'type':kind(name, '치매안심센터' if nmc else clean(raw.get('CNTER_SE'))),
        'province':p, 'city':city, 'address':address,
        'location':coord(raw.get('위도') if nmc else raw.get('LATITUDE'),raw.get('경도') if nmc else raw.get('LONGITUDE')),
        'phone':clean(raw.get('전화번호') if nmc else raw.get('OPER_PHONE_NUMBER') or raw.get('PHONE_NUMBER')),
        'website':url, 'programs':clean(raw.get('IMBCLTY_INTRCN')),
        'operator':clean(raw.get('OPER_INSTITUTION_NM')), 'facilities':clean(raw.get('ETC_FCLTY')),
        'opened':clean(raw.get('개소일') if nmc else raw.get('FOND_YM')),
        'source':source, 'sourceDate':date if nmc else clean(raw.get('REFERENCE_DATE'))}

def compatible(a,b):
    if a['type'] != b['type']:
        x,y=a['location'],b['location']
        # 두 필수 출처가 같은 연락처·위치·명칭을 가리킬 때 유형 오류를 비교 대상으로 보존한다.
        return bool({a['type'],b['type']}=={'center','regional'} and a['source']!=b['source'] and name_key(a)==name_key(b) and a['phone'] and token(a['phone'])==token(b['phone']) and x and y and math.hypot((x['lat']-y['lat'])*111.2,(x['lng']-y['lng'])*88.8)<=0.25)
    # 본소·분소·분관은 이름과 주소가 정확히 같지 않으면 합치지 않는다.
    if a['type'] == 'branch': return a['province']==b['province'] and name_key(a)==name_key(b) and token(a['address'])==token(b['address'])
    if a['province']==b['province'] and name_key(a)==name_key(b): return True
    same_phone=bool(a['phone'] and re.sub(r'\D','',a['phone'])==re.sub(r'\D','',b['phone']))
    if same_phone and token(a['address'])==token(b['address']): return True
    # 명칭·행정구역 변경도 전화번호와 250m 이내 좌표가 함께 확인될 때만 연결한다.
    x,y=a['location'],b['location']
    if same_phone and x and y:
        km=math.hypot((x['lat']-y['lat'])*111.2,(x['lng']-y['lng'])*88.8)
        return km<=0.25
    return False

def reconcile(rows, registry):
    groups=[]
    for row in sorted(rows,key=lambda r:(r['source']!='nmc',r['province'],r['name'])):
        matches=[g for g in groups if any(compatible(row,x) for x in g)]
        if len(matches)==1: matches[0].append(row)
        else: groups.append([row])
    centers=[]; conflicts=[]; used=set()
    for group in groups:
        # 최신 기준일을 우선하고 같은 날은 NMC 연락처를 기준으로 한다.
        ordered=sorted(group,key=lambda r:(r['sourceDate'],r['source']=='nmc'),reverse=True)
        keys=[r['source']+'|'+r['province']+'|'+name_key(r)+'|'+(token(r['address']) if r['type']=='branch' else r['city']) for r in group]
        old={registry[k] for k in keys if k in registry}
        if len(old)>1: raise ValueError('ID 병합 확인 필요: '+str(old))
        id=next(iter(old)) if old else 'dc-'+hashlib.sha256(sorted(keys)[0].encode()).hexdigest()[:12]
        if id in used: raise ValueError('모호한 중복 ID: '+id)
        used.add(id)
        for key in keys: registry[key]=id
        item={'id':id}
        for key in ['name','type','province','city','address','phone','website','programs','operator','facilities','opened']:
            item[key]=next((r[key] for r in ordered if r[key]),'')
        if len({r['type'] for r in group})>1:
            nmc=next((r for r in group if r['source']=='nmc'),None)
            if nmc and '광역치매' not in nmc['name']: item['type']=nmc['type']
        item['fieldSources']={key:{'key':next(r for r in ordered if r[key])['source'],'date':next(r for r in ordered if r[key])['sourceDate']} for key in ['address','phone','website','programs'] if any(r[key] for r in ordered)}
        # 주소가 바뀐 경우 옛 주소의 좌표를 최신 주소에 붙이지 않는다.
        address_row=next((r for r in ordered if r['address']),ordered[0])
        item['location']=address_row['location']
        if not item['location']:
            item['location']=next((r['location'] for r in ordered if token(r['address'])==token(item['address']) and r['location']),None)
        item['aliases']=sorted(set(r['name'] for r in group))
        item['sourceDate']=ordered[0]['sourceDate']
        item['sources']=[dict(SOURCES[r['source']],key=r['source'],date=r['sourceDate'],nameInSource=r['name']) for r in ordered]
        item['conflicts']=[key for key in ['address','phone','type'] if len({token(r[key]) for r in group if r[key]})>1]
        locations=[r['location'] for r in group if r['location']]
        if any(math.hypot((a['lat']-b['lat'])*111.2,(a['lng']-b['lng'])*88.8)>1 for a in locations for b in locations): item['conflicts'].append('location')
        if item['conflicts']: conflicts.append({'id':id,'fields':item['conflicts'],'records':group})
        item['programTags']=[label for label,words in [('검사·상담',['검진','검사','상담']),('가족지원',['가족','보호자']),('예방·쉼터',['예방','쉼터'])] if any(w in item['programs'] for w in words)]
        centers.append(item)
    return sorted(centers,key=lambda r:(r['province'],r['city'],r['name'])),conflicts

def write_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    raw=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()
    path.write_bytes(gzip.compress(raw,mtime=0) if path.suffix=='.gz' else raw+b'\n')

def build(root=ROOT):
    source=root/'source-data/dementia'; out=root/'data/dementia'
    standard=json.loads((source/'standard.json').read_text())
    meta=json.loads((source/'sources.json').read_text())
    nmc=list(csv.DictReader(io.StringIO((source/'nmc.csv').read_text(encoding='utf-8-sig'))))
    if len(standard)<200 or len(nmc)<200: raise ValueError('전국 원본이 불완전합니다. 이전 데이터를 유지하세요.')
    registry_path=source/'identity.json'
    registry=json.loads(registry_path.read_text()) if registry_path.exists() else {}
    rows=[normalize(r,'standard','') for r in standard]+[normalize(r,'nmc',meta['nmc']['sourceDate']) for r in nmc]
    if any(not r['name'] or not r['address'] for r in rows): raise ValueError('필수 이름/주소 누락')
    centers,conflicts=reconcile(rows,registry)
    index=[{k:r[k] for k in ['id','name','type','province','city','address','location','aliases','sourceDate','programTags']} for r in centers]
    write_json(out/'centers.json.gz',index)
    for r in centers: write_json(out/'details'/f"{r['id']}.json",r)
    for old in (out/'details').glob('*.json'):
        if old.stem not in {r['id'] for r in centers}: old.unlink()
    revision=hashlib.sha256((out/'centers.json.gz').read_bytes()).hexdigest()
    write_json(out/'manifest.json',{'schemaVersion':1,'count':len(centers),'file':'centers.json.gz','revision':revision,
        'types':dict(Counter(r['type'] for r in centers)),'withoutCoordinates':sum(not r['location'] for r in centers),
        'sourceCounts':{'standard':len(standard),'nmc':len(nmc)},'sources':meta,'conflictCount':len(conflicts)})
    write_json(source/'comparison.json',{'mergedCount':len(rows)-len(centers),'singleSourceCenters':[{'id':r['id'],'name':r['name'],'source':r['sources'][0]['key']} for r in centers if len({s['key'] for s in r['sources']})==1],'conflicts':conflicts})
    write_json(registry_path,registry)
    print(f'치매센터 {len(centers)}곳 · 표준 {len(standard)}건 + NMC {len(nmc)}건 · 차이 {len(conflicts)}곳')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=ROOT)
    build(parser.parse_args().root)
# SOFTM-DEMENTIA END
