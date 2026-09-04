import csv
import glob
import json
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "source-data" / "nhis_longtermcare_evaluations_20260625.csv"
OUT_PATH = ROOT / "nationwide-daycare-evaluations.js"


def number(value):
    value = (value or "").strip()
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def normalize_id(value):
    return re.sub(r"\D", "", value or "")


facility_ids = set()
for path in glob.glob(str(ROOT / "nationwide-daycare-data-*.js")):
    text = Path(path).read_text(encoding="utf-8")
    match = re.search(r"\.concat\((\[.*\])\);", text, re.S)  # SOFTM-CARE-DATA 날짜:20260904 : 생성 근거 주석이 있어도 치매전담을 포함한 전체 기관에 평가를 연결
    if not match:
        raise RuntimeError(f"Cannot parse facility data: {path}")
    for item in json.loads(match.group(1)):
        facility_ids.add(item["i"])

latest = {}
daycare_rows = 0
with CSV_PATH.open("r", encoding="cp949", newline="") as handle:
    reader = csv.DictReader(handle)
    for row in reader:
        if "주야간보호" not in (row.get("급여종류") or ""):
            continue
        daycare_rows += 1
        institution_id = normalize_id(row.get("장기요양기관기호"))
        if institution_id not in facility_ids:
            continue
        date_text = (row.get("평가일자") or "").strip()
        date_key = datetime.strptime(date_text, "%Y-%m-%d") if date_text else datetime.min
        if institution_id in latest and latest[institution_id][0] >= date_key:
            continue
        year_match = re.search(r"(20\d{2})", row.get("평가구분") or "")
        latest[institution_id] = (
            date_key,
            {
                "grade": (row.get("평가등급") or "").strip() or None,
                "score": number(row.get("평가총점")),
                "year": int(year_match.group(1)) if year_match else None,
                "date": date_text or None,
                "operation": number(row.get("기관운영")),
                "safety": number(row.get("환경및안전")),
                "rights": number(row.get("수급자권리보장")),
                "process": number(row.get("급여제공과정")),
                "result": number(row.get("급여제공결과")),
            },
        )

evaluations = {key: value for key, (_, value) in sorted(latest.items())}
payload = json.dumps(evaluations, ensure_ascii=False, separators=(",", ":"))
OUT_PATH.write_text(
    "window.NATIONAL_DAYCARE_EVALUATIONS=" + payload + f"; // SOFTM-CARE-DATA 날짜:{datetime.now():%Y%m%d} : 치매전담실 포함 기관 집합의 공식 평가 연결\n",  # SOFTM-CARE-DATA 날짜:20260904 : 누락 기관을 포함한 평가 재생성 근거를 보존
    encoding="utf-8",
)

grade_counts = {}
for item in evaluations.values():
    grade_counts[item["grade"] or "없음"] = grade_counts.get(item["grade"] or "없음", 0) + 1

print(json.dumps({
    "facility_count": len(facility_ids),
    "daycare_evaluation_rows": daycare_rows,
    "matched_latest_evaluations": len(evaluations),
    "coverage_percent": round(len(evaluations) / len(facility_ids) * 100, 1),
    "grade_counts": grade_counts,
    "output_bytes": OUT_PATH.stat().st_size,
}, ensure_ascii=False, indent=2))
