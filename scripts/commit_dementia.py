#!/usr/bin/env python3
"""SOFTM-DEMENTIA-COMMIT 날짜:20261001 : 자동 갱신도 실제 부모 디렉터리별로 관련 자료만 커밋한다."""
import datetime, subprocess
from collections import defaultdict
from pathlib import Path
from zoneinfo import ZoneInfo

def run(*args): return subprocess.check_output(['git',*args],text=True).strip()
if run('diff','--cached','--name-only'): raise SystemExit('기존 스테이징 변경이 있어 중단합니다.')
names=run('ls-files','--modified','--others','--deleted','--exclude-standard','--','source-data/dementia','data/dementia').splitlines()
groups=defaultdict(list)
for name in sorted(set(names)):
    path=Path(name)
    if path.name=='.DS_Store' or path.exists() and path.stat().st_size>=31457280: continue
    groups[str(path.parent)].append(name)
date=datetime.datetime.now(ZoneInfo('Asia/Seoul')).strftime('%Y%m%d')
for parent,files in groups.items():
    subprocess.run(['git','add','--',*files],check=True)
    if run('diff','--cached','--name-only'):
        subprocess.run(['git','commit','-m',date+'_'+parent.replace('/','_')+'_치매공공데이터갱신'],check=True)
        committed=run('diff-tree','--no-commit-id','--name-only','-r','HEAD').splitlines()
        if {str(Path(name).parent) for name in committed}!={parent}: raise SystemExit('커밋 디렉터리 범위 불일치')
        for name in committed:
            if Path(name).name=='.DS_Store': raise SystemExit('제외 파일이 커밋되었습니다.')
            if Path(name).exists() and int(run('cat-file','-s','HEAD:'+name))>=31457280: raise SystemExit('용량 제한 초과 파일이 커밋되었습니다.')
if run('diff','--cached','--name-only'): raise SystemExit('커밋 후 잔여 스테이징 변경 확인 필요')
