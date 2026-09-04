# /** SOFTM-DATA-UNIFIED START 날짜:20260904 : 지도 자료를 수집 JSON에서만 생성해 별도 엑셀 기준과 화면 정보가 갈라지지 않도록 통일 */
"""Build small, reproducible map indexes from the collected data directory."""
import gzip
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path

from care_categories import CATEGORY_CODES, DEMENTIA_CODES

ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = ROOT / "data"
OUT_DIR = DATA_ROOT / "care"
CATEGORIES = {
    "facility": ("요양원·공동생활가정", "nursing-home-map.html", ("입소시설",)),
    "daycare": ("주·야간보호", "daycare-map.html", ("주야간보호",)),
    "home-care": ("방문요양", "home-care-map.html", ("방문요양",)),
    "home-nursing": ("방문간호", "home-nursing-map.html", ("방문간호",)),
    "home-bath": ("방문목욕", "home-bath-map.html", ("방문목욕",)),
    "short-stay": ("단기보호", "short-stay-care-map.html", ("단기보호",)),
    "welfare-equipment": ("복지용구", "welfare-equipment-map.html", ("복지용구",)),
    "dementia": ("치매전담형", "dementia-care-map.html", ("입소시설", "주야간보호")),
    "nursing-hospital": ("요양병원(의료기관)", "nursing-hospital-map.html", ()),
}
STAFF_FIELDS = {"s": "socialWorker", "rn": "nurse", "na": "nursingAssistant", "pt": "physicalTherapist", "ot": "occupationalTherapist", "cw": "careWorker"}
PROVINCE_NAMES = {"서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시", "인천": "인천광역시", "광주": "광주광역시", "대전": "대전광역시", "울산": "울산광역시", "세종": "세종특별자치시", "경기": "경기도", "강원": "강원특별자치도", "충북": "충청북도", "충남": "충청남도", "전북": "전북특별자치도", "전남": "전라남도", "경북": "경상북도", "경남": "경상남도", "제주": "제주특별자치도", "강원도": "강원특별자치도", "전라북도": "전북특별자치도", "제주도": "제주특별자치도"}


def read_json(path):
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, value):
    payload = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    if path.suffix == ".gz":
        payload = gzip.compress(payload, mtime=0)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_bytes() != payload:
        path.write_bytes(payload)
    return hashlib.sha256(payload).hexdigest()[:16]


def split_region(region, address=""):
    parts = (region or address).split()
    if not parts:
        return "", ""
    province = PROVINCE_NAMES.get(parts[0], parts[0])
    if province == "세종특별자치시":
        return province, "세종시"
    city = parts[1] if len(parts) > 1 else ""
    if province not in {"서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시"} and city.endswith("시") and len(parts) > 2 and parts[2].endswith("구"):
        city += " " + parts[2]
    return province, city


def evaluation_for(evaluations, category):
    candidates = [row for row in evaluations if any(word in row.get("service", "") for word in CATEGORIES[category][2])]
    if not candidates:
        return None
    chosen = max(candidates, key=lambda row: row.get("date") or "")
    year = re.search(r"20\d{2}", chosen.get("evaluation", ""))
    return {**chosen, "year": int(year.group()) if year else None}


def build_record(institution, detail, evaluations, category):
    codes = DEMENTIA_CODES if category == "dementia" else CATEGORY_CODES[category]
    services = {row["code"]: row for row in institution.get("services", []) if row.get("code") in codes}
    if not services:
        return None
    basic = {**institution, **{key: value for key, value in detail.get("basic", {}).items() if value not in (None, "")}}
    # OpenAPI가 도로명 코드만 준 신규 기관도 이미 수집한 공단 원문 주소로 검색 가능하게 한다.
    pages = [value for code, value in detail.get("serviceDetails", {}).items() if code in services]
    pages.sort(key=lambda value: value.get("collectedAt", ""), reverse=True)
    addresses = [value.get("officialPage", {}).get("tabs", {}).get("11", {}).get("fields", {}).get("주소", "") for value in pages]
    address = next((value for value in addresses if re.match(r"^[가-힣]+(?:시|도)\s", value)), basic.get("address", ""))
    province, city = split_region(institution.get("region", ""), address)
    row = {"i": institution["id"], "n": basic.get("name", institution["name"]), "p": province, "c": city, "a": address,
           "d": basic.get("designationDate", ""), "t": ",".join(services), "tn": " · ".join(s.get("name", code) for code, s in services.items()),
           "z": 0, **{key: 0 for key in STAFF_FIELDS}}
    row["_regionCode"] = "|".join(str(basic.get("regionCodes", {}).get(key, "")) for key in ("province", "city"))
    row["_needsRegion"] = not institution.get("region")
    row["_roadCode"] = basic.get("roadNameCode", "")
    row["_buildingNumber"] = basic.get("buildingNumber", "")
    for code, service in services.items():
        sections = detail.get("serviceDetails", {}).get(code, {}).get("sections", {})
        capacity = (sections.get("capacity") or {}).get("capacity")
        row["z"] += capacity if capacity is not None else service.get("capacity") or 0
        staff = sections.get("staff") or {}
        for key, source in STAFF_FIELDS.items():
            row[key] += staff.get(source) or 0
        if not staff:
            row["staffMissing"] = True
    evaluation = evaluation_for(evaluations, category)
    if evaluation:
        row.update({"ev": evaluation, "g": evaluation.get("grade"), "es": evaluation.get("score"), "ey": evaluation["year"], "ed": evaluation.get("date"), "et": evaluation.get("service", "").split(".", 1)[-1]})
    return {key: value for key, value in row.items() if value not in (None, "")}


def build_records(data_root=DATA_ROOT):
    catalog = read_json(data_root / "nhis/catalog.json")
    evaluations = read_json(data_root / "nhis/evaluations.json")
    hospitals = read_json(data_root / "hira/nursing-hospitals.json")
    records = {category: [] for category in CATEGORIES}
    region_lookup, road_lookup = {}, {}
    for institution in catalog["institutions"]:
        key = institution["id"]
        path = data_root / "nhis/details" / key[:2] / (key + ".json.gz")
        detail = read_json(path) if path.exists() else {}
        basic = detail.get("basic", {})
        region_code = "|".join(str(basic.get("regionCodes", {}).get(field, "")) for field in ("province", "city"))
        if institution.get("region") and region_code != "|":
            region_lookup[region_code] = split_region(institution["region"])
        road = re.match(r"(.+(?:대로|로|길))\s+\d+(?:-\d+)?(?:\s|$)", institution.get("address", ""))
        if road and basic.get("roadNameCode"):
            road_lookup[basic["roadNameCode"]] = road[1]
        for category in CATEGORY_CODES.keys() | {"dementia"}:
            row = build_record(institution, detail, evaluations["institutions"].get(key, []), category)
            if row:
                records[category].append(row)
    for rows in records.values():
        for row in rows:
            # 지역명 변경·빈 도로명은 같은 수집 자료의 행정코드·도로명코드로 연결한다.
            if row.pop("_needsRegion") and row["_regionCode"] in region_lookup:
                row["p"], row["c"] = region_lookup[row["_regionCode"]]
            if not row.get("a"):
                road = road_lookup.get(row.get("_roadCode"))
                if road and row.get("_buildingNumber"):
                    row["a"] = f'{road} {row["_buildingNumber"]}'
                else:
                    row["a"], row["addressMissing"] = "주소 미확인", True
            for field in ("_regionCode", "_roadCode", "_buildingNumber"):
                row.pop(field, None)
    records["nursing-hospital"] = hospitals["institutions"]
    for rows in records.values():
        rows.sort(key=lambda row: (row.get("p", ""), row.get("c", ""), row["n"], row["i"]))
    return records, catalog["generatedAt"][:10], hospitals["sourceDate"]


def update_landing_counts(manifest):
    marker = f"<!-- SOFTM-DATA-UNIFIED 날짜:{datetime.now():%Y%m%d} : 안내의 기관 수와 기준일을 수집 자료 기반 지도와 일치 -->"
    for category, meta in manifest.items():
        path = ROOT / CATEGORIES[category][1]
        html = path.read_text(encoding="utf-8")
        first = re.search(r'<ul class="data-summary"[\s\S]*?<strong>([\d,]+)곳</strong>', html)
        if first:
            html = html.replace(first[1] + "곳", f'{meta["count"]:,}곳')
        html = re.sub(r'(공단 평가정보 <strong>)[\d,]+곳', lambda m: m[1] + f'{meta["evaluationCount"]:,}곳', html)
        if meta["source"] == "nhis":
            html = re.sub(r'시설현황 <time datetime="[^"]+">[^<]+</time> 기준', f'수집목록 <time datetime="{meta["sourceDate"]}">{meta["sourceDate"].replace("-", ".")}</time> 기준', html)
            html = re.sub(r'수집목록 <time datetime="[^"]+">[^<]+</time> 기준', f'수집목록 <time datetime="{meta["sourceDate"]}">{meta["sourceDate"].replace("-", ".")}</time> 기준', html)
        original = path.read_text(encoding="utf-8")
        if html != original:
            # 변경된 HTML 각 줄에만 주석을 붙여 자동 갱신 근거를 남긴다.
            old_lines = original.splitlines()
            html = "\n".join(line + (" " + marker if i < len(old_lines) and line != old_lines[i] and "SOFTM-DATA-UNIFIED" not in line else "") for i, line in enumerate(html.splitlines())) + "\n"
            path.write_text(html, encoding="utf-8")
    index_path = ROOT / "index.html"
    index = index_path.read_text(encoding="utf-8")
    for category, meta in manifest.items():
        index = re.sub(r'(data-category="' + re.escape(category) + r'"[\s\S]*?<span data-count>)[\d,]+곳', lambda match: match[1] + f'{meta["count"]:,}곳', index)
    if index != index_path.read_text(encoding="utf-8"):
        index_path.write_text(index, encoding="utf-8")
    daycare_path = ROOT / "nationwide-daycare-map.html"
    daycare = daycare_path.read_text(encoding="utf-8")
    updated = re.sub(r"(전국 주야간보호센터 )[\d,]+곳", lambda match: match[1] + f'{manifest["daycare"]["count"]:,}곳', daycare)
    if updated != daycare:
        daycare_path.write_text(updated, encoding="utf-8")


def main():
    records, nhis_date, hira_date = build_records()
    manifest = {}
    for category, rows in records.items():
        filename = f"{category}.json.gz"
        revision = write_json(OUT_DIR / filename, rows)
        source = "hira" if category == "nursing-hospital" else "nhis"
        manifest[category] = {"label": CATEGORIES[category][0], "source": source, "sourceDate": hira_date if source == "hira" else nhis_date,
                              "count": len(rows), "evaluationCount": sum(bool(row.get("g")) for row in rows), "file": filename, "revision": revision}
    write_json(OUT_DIR / "manifest.json", manifest)
    update_landing_counts(manifest)
    print(json.dumps({key: {"count": len(rows), "missingStaff": sum(bool(row.get("staffMissing")) for row in rows)} for key, rows in records.items()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
# /** SOFTM-DATA-UNIFIED END */
