# /** SOFTM-DATA-UNIFIED START 날짜:20260904 : 공단 수집 대상이 아닌 요양병원도 data에 보관해 지도 생성의 입력 위치를 통일 */
import csv
import re

from build_nationwide_care_services import ROOT, split_region, write_json


def main():
    source = max((ROOT / "source-data").glob("hira-facilities-*.csv"))
    date = re.search(r"(\d{4})(\d{2})(\d{2})", source.name)
    rows = []
    with source.open(encoding="cp949", newline="") as handle:
        for item in csv.DictReader(handle):
            key = item.get("암호화된요양기호", "").strip()
            if item.get("요양종별", "").strip() != "요양병원" or not key.startswith("JD"):
                continue
            province, city = split_region(item.get("시도명", "") + " " + item.get("시군구명", ""))
            designated = re.sub(r"\D", "", item.get("개설일자", ""))
            rows.append({"i": key, "n": item["요양기관명"].strip(), "p": province, "c": city, "a": item.get("도로명주소", "").strip(),
                         "d": f"{designated[:4]}-{designated[4:6]}-{designated[6:8]}" if len(designated) >= 8 else "", "t": "HOSP", "tn": "요양병원",
                         "z": 0, "s": 0, "rn": 0, "na": 0, "pt": 0, "ot": 0, "cw": 0})
    write_json(ROOT / "data/hira/nursing-hospitals.json", {"source": "hira", "sourceDate": "-".join(date.groups()), "sourceFile": str(source.relative_to(ROOT)), "institutions": rows})
    print(f"요양병원 {len(rows):,}곳을 data/hira에 저장했습니다.")


if __name__ == "__main__":
    main()
# /** SOFTM-DATA-UNIFIED END */
