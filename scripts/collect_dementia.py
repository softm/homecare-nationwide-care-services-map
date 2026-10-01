#!/usr/bin/env python3
"""SOFTM-DEMENTIA-SOURCE START 날짜:20261001 : 공식 다운로드를 수집하며 실패하면 기존 원본을 유지한다."""
import csv, datetime, io, json, re, subprocess, tempfile
from pathlib import Path
from urllib.parse import urlencode
from build_dementia import ROOT, build, SOURCES

def fetch(url):
    return subprocess.check_output(['curl','--fail','--location','--silent','--show-error','--retry','2','--max-time','60',url])

def collect():
    header=json.loads(fetch('https://www.data.go.kr/download/columList.json?pk=15021138&ext=JSON'))
    query={'publicDataPk':'15021138','colNmList':header['tableVO']['colNmList'],'totalCount':header['totalCount'],'svcTableNm':header['tableVO']['svcTableNm'],'perPage':10000,'page':1}
    standard=json.loads(fetch('https://www.data.go.kr/download/standard.json?'+urlencode(query,doseq=True)))
    if len(standard)!=header['totalCount'] or len(standard)<200: raise ValueError('표준자료 전체 건수 불일치')
    page=fetch(SOURCES['nmc']['url']).decode()
    url=re.search(r'"contentUrl"\s*:\s*"(https://www.data.go.kr/cmm/cmm/fileDownload.do[^"\s]+)"',page)
    date=re.search(r'데이터 기준.*?(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일',page)
    if not url or not date: raise ValueError('NMC 공식 다운로드/기준일 확인 실패')
    raw=fetch(url[1]); nmc=None
    for enc in ['utf-8-sig','cp949']:
        try: nmc=raw.decode(enc); break
        except UnicodeDecodeError: pass
    if nmc is None or len(list(csv.DictReader(io.StringIO(nmc))))<200: raise ValueError('NMC 원본 불완전')
    meta={k:dict(v) for k,v in SOURCES.items()}
    meta['standard']['sourceDate']=max(r.get('REFERENCE_DATE','') for r in standard)
    meta['nmc']['sourceDate']='-'.join([date[1],date[2].zfill(2),date[3].zfill(2)])
    # 수집일만 변한 파일이 매일 커밋되지 않도록 원본 변경 때만 교체한다.
    source=ROOT/'source-data/dementia';source.mkdir(parents=True,exist_ok=True)
    files={'standard.json':json.dumps(standard,ensure_ascii=False,separators=(',',':'))+'\n','nmc.csv':nmc,'sources.json':json.dumps(meta,ensure_ascii=False,indent=2)+'\n'}
    with tempfile.TemporaryDirectory() as tmp:
        staged=Path(tmp);(staged/'source-data/dementia').mkdir(parents=True)
        for name,value in files.items(): (staged/'source-data/dementia'/name).write_text(value)
        if (source/'identity.json').exists(): (staged/'source-data/dementia/identity.json').write_bytes((source/'identity.json').read_bytes())
        build(staged)
        # 검증에 성공한 완전한 두 원본을 승격한다.
        for name,value in files.items(): (source/name).write_text(value)
    build()

if __name__=='__main__': collect()
# SOFTM-DEMENTIA-SOURCE END
