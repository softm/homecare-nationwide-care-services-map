# /** SOFTM-CARE-CATEGORIES START 날짜:20260904 : 치매전담 기관과 복지용구가 기본 급여 분류에서 누락되지 않도록 생성·수집 기준을 공유 */
DEMENTIA_FACILITY_CODES = {f"{prefix}{room}" for prefix in ("G", "M") for room in range(31, 100) if room % 10} | {"S41"}
DEMENTIA_DAYCARE_CODES = {f"{prefix}{room}" for prefix in ("H", "I") for room in range(31, 100) if room % 10}
DEMENTIA_CODES = DEMENTIA_FACILITY_CODES | DEMENTIA_DAYCARE_CODES

CATEGORY_CODES = {
    "facility": {"A01", "A02", "A03", "A04", "A05"} | DEMENTIA_FACILITY_CODES,
    "daycare": {"B03", "C03"} | DEMENTIA_DAYCARE_CODES,
    "home-care": {"B01", "C01"},
    "home-nursing": {"B05", "C05"},
    "home-bath": {"B02", "C02"},
    "short-stay": {"B04", "C04"},
    "welfare-equipment": {"B06", "C06"},
}


def category_for(code):
    return next((category for category, codes in CATEGORY_CODES.items() if code in codes), "other")


def is_dementia(code):
    return code in DEMENTIA_CODES
# /** SOFTM-CARE-CATEGORIES END */
