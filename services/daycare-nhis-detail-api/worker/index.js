const NHIS_ORIGIN = "https://www.longtermcare.or.kr";
const DETAIL_PATH = "/npbs/r/a/201/selectLtcoSrchDetail.web";
const PHOTO_PATH = "/npbs/attachfile/sendFileThumbnailTop.web";
const CACHE_SECONDS = 1800;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": status === 200 ? `public, max-age=${CACHE_SECONDS}` : "no-store",
    ...CORS,
    ...extra,
  },
});

function decodeHtml(value = "") {
  const named = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    middot: "·", bull: "•", ndash: "–", mdash: "—",
  };
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

function cleanText(value = "") {
  return decodeHtml(value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTables(html = "") {
  const tables = [];
  for (const tableMatch of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const body = tableMatch[1];
    const caption = cleanText((body.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i) || [])[1] || "");
    const rows = [];
    for (const rowMatch of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [];
      for (const cellMatch of rowMatch[1].matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
        const attrs = cellMatch[2] || "";
        const text = cleanText(cellMatch[3]);
        if (!text && !/<img|input/i.test(cellMatch[3])) continue;
        cells.push({
          type: cellMatch[1].toLowerCase(),
          text,
          colspan: Number((attrs.match(/colspan=["']?(\d+)/i) || [])[1] || 1),
          rowspan: Number((attrs.match(/rowspan=["']?(\d+)/i) || [])[1] || 1),
        });
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push({ caption, rows });
  }
  return tables;
}

function extractPairs(tables) {
  const pairs = [];
  for (const table of tables) {
    for (const row of table.rows) {
      for (let i = 0; i < row.length; i += 1) {
        if (row[i].type !== "th") continue;
        const valueCell = row.slice(i + 1).find((cell) => cell.type === "td");
        if (!valueCell || !row[i].text) continue;
        pairs.push({ label: row[i].text.replace(/\s+/g, " "), value: valueCell.text });
      }
    }
  }
  return pairs;
}

const findPair = (pairs, words) => {
  const wordList = Array.isArray(words) ? words : [words];
  const row = pairs.find((item) => wordList.some((word) => item.label.replace(/\s/g, "").includes(word.replace(/\s/g, ""))));
  return row?.value || "";
};

function pickTable(tables, words, fallback = 0) {
  const wordList = Array.isArray(words) ? words : [words];
  return tables.find((table) => wordList.some((word) => table.caption.replace(/\s/g, "").includes(word.replace(/\s/g, "")))) || tables[fallback] || { caption: "", rows: [] };
}

function compactRows(table, limit = 30) {
  return table.rows.slice(0, limit).map((row) => row.map((cell) => cell.text).filter(Boolean)).filter((row) => row.length);
}

function headerValueItems(table) {
  const rows = compactRows(table);
  if (rows.length < 2) return [];
  const headerIndex = rows.findIndex((row, index) => index < Math.min(3, rows.length - 1) && row.length >= rows[index + 1].length * 0.65);
  const headers = rows[Math.max(0, headerIndex)];
  const values = rows.slice(Math.max(0, headerIndex) + 1).find((row) => row.length >= Math.min(2, headers.length)) || [];
  return headers.map((label, index) => ({ label, value: values[index] || "" })).filter((item) => item.label && item.value !== "");
}

function lastChanged(html = "") {
  const match = cleanText(html).match(/최종\s*변경일\s*[:：]?\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})/);
  return match?.[1] || "";
}

function parseBasic(html) {
  const tables = extractTables(html);
  const pairs = extractPairs(tables);
  const homepage = findPair(pairs, ["홈페이지", "누리집"]);
  return {
    name: findPair(pairs, ["기관명", "장기요양기관명"]),
    address: findPair(pairs, ["주소", "소재지"]),
    phone: findPair(pairs, ["전화번호", "전화"]),
    email: findPair(pairs, ["이메일", "전자우편"]),
    service: findPair(pairs, ["급여종류", "제공서비스", "시설종류"]),
    homepage: (homepage.match(/https?:\/\/[^\s]+/i) || [homepage])[0] || "",
    designationDate: findPair(pairs, ["지정일자", "설치일자", "지정(설치)일"]),
    hours: findPair(pairs, ["운영시간", "영업시간"]),
    parking: findPair(pairs, ["주차시설", "주차"]),
    transit: findPair(pairs, ["교통편", "대중교통", "오시는길"]),
    insurance: findPair(pairs, ["배상책임보험", "책임보험"]),
    items: pairs.slice(0, 40),
    updatedAt: lastChanged(html),
  };
}

function parseCapacity(html) {
  const tables = extractTables(html);
  const table = pickTable(tables, ["정원", "현원"]);
  const rows = compactRows(table, 8);
  const dataRow = [...rows].reverse().find((row) => row.some((value) => /주야간|재가|보호/.test(value))) || rows.at(-1) || [];
  const values = dataRow.map((value) => (String(value).match(/\d[\d,]*/) || [""])[0]).filter(Boolean).map((value) => Number(value.replace(/,/g, "")));
  const [capacity = 0, male = 0, female = 0, available = 0, waiting = 0] = values;
  const current = male + female;
  return {
    capacity: capacity ? `${capacity}명` : "", current: current ? `${current}명` : "",
    male: male ? `${male}명` : "", female: female ? `${female}명` : "",
    available: available ? `${available}명` : "0명", waiting: waiting ? `${waiting}명` : "",
    items: [], rows, updatedAt: lastChanged(html),
  };
}

function parseStaff(html) {
  const tables = extractTables(html);
  const staffTable = pickTable(tables, ["인력현황", "종사자"]);
  const retentionTable = pickTable(tables, ["근속", "종사기간"], 1);
  const rows = compactRows(staffTable, 8);
  const values = rows.map((row) => row.map((value) => (String(value).match(/^\s*(\d[\d,]*)\s*(?:명)?\s*$/) || [])[1]).filter(Boolean).map((value) => Number(value.replace(/,/g, ""))))
    .sort((a, b) => b.length - a.length)[0] || [];
  const labels = ["총 종사자", "시설장", "사무국장", "사회복지사", "의사(전임)", "의사(계약)", "간호사", "간호조무사", "치위생사", "요양보호사", "물리치료사 1급", "물리치료사 2급", "물리치료사 유예", "작업치료사", "사무원", "영양사", "조리원", "위생원", "관리인", "보조원", "기타"];
  const summary = labels.map((label, index) => ({ label, value: values[index] ? `${values[index]}명` : "" })).filter((item) => item.value);
  return { summary: summary.slice(0, 24), rows: compactRows(staffTable, 7), retentionRows: compactRows(retentionTable, 12), updatedAt: lastChanged(html) };
}

function parseFacilities(html) {
  const tables = extractTables(html);
  const all = tables.flatMap(headerValueItems);
  const nonZero = all.filter(({ value }) => {
    const normalized = value.replace(/[\s,]/g, "");
    return normalized && !/^0(?:개|실|대|명|㎡|m²)?$/i.test(normalized) && normalized !== "N";
  });
  return { items: nonZero.slice(0, 30), rows: compactRows(pickTable(tables, ["시설현황", "시설"]), 8), updatedAt: lastChanged(html) };
}

function parseCosts(html) {
  const tables = extractTables(html);
  const rows = tables.flatMap((table) => compactRows(table, 30));
  const useful = rows.filter((row) => row.some((value) => /식사|간식|상급|이미용|기타|합계|월\s*비용/.test(value)));
  const total = cleanText(html).match(/(?:월\s*)?(?:비급여\s*)?(?:비용\s*)?(?:총액|합계)\s*[:：]?\s*([\d,]+\s*원?)/)?.[1] || "";
  return { rows: (useful.length ? useful : rows).slice(0, 16), total, updatedAt: lastChanged(html) };
}

function parsePrograms(html) {
  const tables = extractTables(html);
  const table = pickTable(tables, ["프로그램운영", "프로그램"]);
  const rows = compactRows(table, 40);
  const dataRows = rows.filter((row, index) => index > 0 && row.length >= 2 && !/프로그램명|구분/.test(row.join(" ")));
  return {
    rows: dataRows.slice(0, 20).map((row) => ({ category: row[0] || "", name: row[1] || row[0] || "", target: row[2] || "", schedule: row[3] || "", place: row[4] || "" })),
    updatedAt: lastChanged(html),
  };
}

function parsePhotos(html) {
  const photos = [];
  for (const match of html.matchAll(/<li\b[^>]*>([\s\S]*?sendFileThumbnailTop\.web\?keyValue=([A-Za-z0-9_-]+)[\s\S]*?)<\/li>/gi)) {
    const block = match[1];
    const key = match[2];
    const allText = cleanText(block);
    const date = (allText.match(/\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}/) || [""])[0];
    const titleCandidates = [...block.matchAll(/<(?:strong|span|p|a)\b[^>]*>([\s\S]*?)<\/(?:strong|span|p|a)>/gi)]
      .map((item) => cleanText(item[1])).filter((item) => item && !/^\d{4}[.\/-]/.test(item) && !/상세|보기/.test(item));
    photos.push({ key, title: titleCandidates.at(-1) || allText.replace(date, "").trim() || "기관 사진", date });
    if (photos.length >= 18) break;
  }
  if (!photos.length) {
    for (const img of html.matchAll(/<img\b[^>]*src=["'][^"']*sendFileThumbnailTop\.web\?keyValue=([A-Za-z0-9_-]+)[^"']*["'][^>]*>/gi)) {
      photos.push({ key: img[1], title: "기관 사진", date: "" });
      if (photos.length >= 18) break;
    }
  }
  return { rows: photos, updatedAt: lastChanged(html) };
}

function parseCctv(html) {
  const table = pickTable(extractTables(html), ["CCTV현황", "CCTV"]);
  const rows = compactRows(table, 8);
  const numeric = rows.flatMap((row) => row).map((value) => Number((value.match(/\d+/) || [])[0])).filter(Number.isFinite);
  return { total: numeric.length ? Math.max(...numeric) : 0, rows, updatedAt: lastChanged(html) };
}

async function fetchTab(id, type, tab) {
  const url = new URL(DETAIL_PATH, NHIS_ORIGIN);
  url.searchParams.set("ltcAdminSym", id);
  url.searchParams.set("adminPttnCd", type);
  url.searchParams.set("aTab", tab);
  if (tab === "16") url.searchParams.set("searchType", type);
  const costBody = new URLSearchParams({ ltcAdminSym: id, adminPttnCd: type, aTab: tab, searchType: type });
  const headers = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "ko-KR,ko;q=0.9",
    ...(tab === "16" ? { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" } : {}),
    "user-agent": "Mozilla/5.0 (compatible; NationwideDaycareMap/1.0; public-data-detail-view)",
  };
  let response = await fetch(url, {
    method: tab === "16" ? "POST" : "GET",
    body: tab === "16" ? costBody : undefined,
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`NHIS ${tab}: ${response.status}`);
  let html = await response.text();
  if (tab === "16" && !/(?:식사|간식)[\s\S]{0,600}\d[\d,]+/.test(cleanText(html))) {
    const { "content-type": omitted, ...getHeaders } = headers;
    void omitted;
    response = await fetch(url, { method: "GET", headers: getHeaders, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (response.ok) html = await response.text();
  }
  if (!html.includes("기관 상세정보") && !html.includes("selectLtcoSrchDetail")) throw new Error(`NHIS ${tab}: unexpected response`);
  return html;
}

async function detailResponse(request, id, type) {
  const tabs = ["11", "13", "14", "15", "16", "17", "18", "19"];
  const settled = await Promise.allSettled(tabs.map((tab) => fetchTab(id, type, tab)));
  const pages = {};
  const partial = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") pages[tabs[index]] = result.value;
    else partial.push(tabs[index]);
  });
  if (!pages["11"]) return json({ ok: false, error: "공단 기본정보를 불러오지 못했습니다.", partial }, 502);

  const sourceUrl = new URL(DETAIL_PATH, NHIS_ORIGIN);
  sourceUrl.searchParams.set("ltcAdminSym", id);
  sourceUrl.searchParams.set("adminPttnCd", type);
  sourceUrl.searchParams.set("aTab", "11");
  const payload = {
    ok: true, id, type, fetchedAt: new Date().toISOString(), sourceUrl: sourceUrl.toString(), partial,
    basic: parseBasic(pages["11"]),
    capacity: pages["13"] ? parseCapacity(pages["13"]) : null,
    staff: pages["14"] ? parseStaff(pages["14"]) : null,
    facilities: pages["15"] ? parseFacilities(pages["15"]) : null,
    costs: pages["16"] ? parseCosts(pages["16"]) : null,
    programs: pages["17"] ? parsePrograms(pages["17"]) : null,
    photos: pages["18"] ? parsePhotos(pages["18"]) : null,
    cctv: pages["19"] ? parseCctv(pages["19"]) : null,
  };
  return json(payload, 200, { "x-data-source": "nhis-longtermcare-public" });
}

async function photoResponse(key) {
  const url = new URL(PHOTO_PATH, NHIS_ORIGIN);
  url.searchParams.set("keyValue", key);
  const response = await fetch(url, {
    headers: { accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8", referer: `${NHIS_ORIGIN}/`, "user-agent": "Mozilla/5.0 (compatible; NationwideDaycareMap/1.0)" },
    redirect: "follow", signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return json({ ok: false, error: "사진을 불러오지 못했습니다." }, 502);
  const headers = new Headers(CORS);
  headers.set("content-type", response.headers.get("content-type") || "image/jpeg");
  headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
  return new Response(response.body, { status: 200, headers });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") return json({ ok: true, service: "daycare-nhis-detail", source: "국민건강보험공단 장기요양보험 공개정보" }, 200, { "cache-control": "no-store" });
    if (url.pathname === "/api/nhis-photo") {
      const key = (url.searchParams.get("key") || "").trim();
      if (!/^[A-Za-z0-9_-]{6,40}$/.test(key)) return json({ ok: false, error: "잘못된 사진 식별자입니다." }, 400);
      return photoResponse(key);
    }
    if (url.pathname === "/api/nhis-detail") {
      const id = (url.searchParams.get("id") || "").trim();
      const type = (url.searchParams.get("type") || "").trim().toUpperCase();
      if (!/^\d{11}$/.test(id) || !/^[A-Z]\d{2}$/.test(type)) return json({ ok: false, error: "기관기호 또는 급여종류가 올바르지 않습니다." }, 400);
      return detailResponse(request, id, type);
    }
    return json({ ok: false, error: "Not found" }, 404);
  },
};
