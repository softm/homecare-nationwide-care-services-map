# 공단 상세 API XML fixture

공공데이터 키가 없는 로컬·CI 구문 검증에서 `24119001267`(효명노인주야간보호센터, B03)의 정규화 결과를 재현하는 최소 응답입니다. 실제 키나 인증 URL은 포함하지 않습니다.

```bash
env -u DATA_GO_KR_SERVICE_KEY python3 scripts/sync_nhis_static.py \
  --mode fixture --scope details --institution 24119001267 --type B03 --force
```

<!-- SOFTM-NHIS-FIXTURE 날짜:20260902 : 인증정보 없이도 공단 XML 파서 회귀검사를 수행할 수 있도록 고정 응답을 보존 -->
