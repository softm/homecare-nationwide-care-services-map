/** SOFTM-HOMECARE-PILOT START 날짜:20261118 : 기관 시범운영 API가 동일한 검증·익명 집계 기준을 사용하도록 순수 함수를 분리 */

export const EVENT_TYPES = Object.freeze([
  "detail_view",
  "phone_click",
  "inquiry_click",
  "directions_click",
]);

export const ALLOWED_IMAGE_TYPES = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});

const DEFAULT_ALLOWED_ORIGINS = ["https://homecare.designboard.net", "https://softm.github.io"];
const INSTITUTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ValidationError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
    this.details = details;
  }
}

export function isAllowedOrigin(origin, configuredOrigins = DEFAULT_ALLOWED_ORIGINS, devAllowedOrigin = "") {
  if (!origin) return true;
  const allowed = Array.isArray(configuredOrigins)
    ? configuredOrigins
    : String(configuredOrigins || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (devAllowedOrigin) allowed.push(String(devAllowedOrigin).trim());
  return allowed.includes(origin);
}

export function assertInstitutionId(value) {
  const id = String(value || "").trim();
  if (!INSTITUTION_ID_PATTERN.test(id)) {
    throw new ValidationError("invalid_institution_id", "기관 식별자가 올바르지 않습니다.");
  }
  return id;
}

export function assertResourceId(value, label = "리소스") {
  const id = String(value || "").trim();
  if (!RESOURCE_ID_PATTERN.test(id)) {
    throw new ValidationError("invalid_resource_id", `${label} 식별자가 올바르지 않습니다.`);
  }
  return id;
}

function optionalString(value, field, maxLength) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new ValidationError("invalid_profile", `${field} 항목은 문자열이어야 합니다.`);
  }
  const normalized = value.trim();
  if (normalized.includes("\u0000") || normalized.length > maxLength) {
    throw new ValidationError(
      "invalid_profile",
      `${field} 항목은 ${maxLength}자 이내여야 합니다.`,
    );
  }
  return normalized;
}

function optionalInteger(value, field, minimum, maximum) {
  if (value === undefined || value === null || value === "") return null;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ValidationError(
      "invalid_profile",
      `${field} 항목은 ${minimum} 이상 ${maximum} 이하의 정수여야 합니다.`,
    );
  }
  return value;
}

function optionalUrl(value, field) {
  const normalized = optionalString(value, field, 500);
  if (!normalized) return "";
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new ValidationError("invalid_profile", `${field} 주소가 올바르지 않습니다.`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new ValidationError(
      "invalid_profile",
      `${field} 주소는 로그인정보가 없는 https 주소만 허용합니다.`,
    );
  }
  return parsed.toString();
}

export function validateProgram(program, index = 0) {
  if (!program || typeof program !== "object" || Array.isArray(program)) {
    throw new ValidationError("invalid_program", `${index + 1}번째 프로그램 정보가 올바르지 않습니다.`);
  }
  const title = optionalString(program.title, "프로그램명", 120);
  if (!title) {
    throw new ValidationError("invalid_program", `${index + 1}번째 프로그램명이 필요합니다.`);
  }
  return {
    id: program.id ? assertResourceId(program.id, "프로그램") : null,
    title,
    description: optionalString(program.description, "프로그램 설명", 500),
    schedule: optionalString(program.schedule, "프로그램 일정", 120),
    sortOrder: optionalInteger(program.sortOrder, "프로그램 정렬 순서", 0, 10000) ?? index,
    active: program.active !== false,
  };
}

export function validateProfilePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ValidationError("invalid_profile", "기관 운영정보가 올바르지 않습니다.");
  }
  if (payload.programs !== undefined && !Array.isArray(payload.programs)) {
    throw new ValidationError("invalid_program", "프로그램 목록은 배열이어야 합니다.");
  }
  const rawPrograms = payload.programs || [];
  if (rawPrograms.length > 10) {
    throw new ValidationError("invalid_program", "프로그램은 최대 10개까지 등록할 수 있습니다.");
  }

  const operatingHours = payload.operatingHours ?? {};
  if (typeof operatingHours !== "object" || operatingHours === null || Array.isArray(operatingHours)) {
    throw new ValidationError("invalid_profile", "운영시간 정보가 올바르지 않습니다.");
  }
  const operatingHoursJson = JSON.stringify(operatingHours);
  if (operatingHoursJson.length > 5000) {
    throw new ValidationError("invalid_profile", "운영시간 정보가 너무 깁니다.");
  }

  const email = optionalString(payload.email, "이메일", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("invalid_profile", "이메일 형식이 올바르지 않습니다.");
  }

  const displayName = optionalString(payload.displayName, "기관명", 120);
  const summary = optionalString(payload.summary, "기관 소개", 2000);
  const phone = optionalString(payload.phone, "전화번호", 40);
  const operatingHoursNote = optionalString(operatingHours.note, "운영시간", 200);
  const programs = rawPrograms.map(validateProgram);
  const website = optionalUrl(payload.website, "홈페이지");
  const address = optionalString(payload.address, "주소", 300);
  const transportation = optionalString(payload.transportation, "교통·송영 안내", 500);
  const capacity = optionalInteger(payload.capacity, "정원", 0, 100000);
  const availableSlots = optionalInteger(payload.availableSlots, "이용 가능 인원", 0, 100000);
  if (!displayName) {
    throw new ValidationError("invalid_profile", "공개할 기관명이 필요합니다.");
  }
  if (!summary && !operatingHoursNote && !phone && programs.length === 0) {
    throw new ValidationError("invalid_profile", "공개할 운영정보를 한 항목 이상 입력해 주세요.");
  }

  return {
    displayName,
    summary,
    phone,
    email,
    website,
    address,
    operatingHours,
    operatingHoursJson,
    transportation,
    capacity,
    availableSlots,
    programs,
  };
}

export function validatePhotoMetadata(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ValidationError("invalid_photo", "사진 정보가 올바르지 않습니다.");
  }
  return {
    caption: optionalString(payload.caption, "사진 설명", 500),
    altText: optionalString(payload.altText, "대체 텍스트", 300),
    sortOrder: optionalInteger(payload.sortOrder, "사진 정렬 순서", 0, 10000) ?? 0,
    isCover: payload.isCover === true || payload.isCover === "true",
    published: payload.published !== false && payload.published !== "false",
  };
}

export function detectImageType(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (
    view.length >= 8 &&
    view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4e && view[3] === 0x47 &&
    view[4] === 0x0d && view[5] === 0x0a && view[6] === 0x1a && view[7] === 0x0a
  ) {
    return { mime: "image/png", extension: "png" };
  }
  if (
    view.length >= 12 &&
    String.fromCharCode(...view.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...view.slice(8, 12)) === "WEBP"
  ) {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}

export function validatePhotoBytes(bytes, declaredMime, maxBytes = 5 * 1024 * 1024) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.byteLength === 0 || view.byteLength > maxBytes) {
    throw new ValidationError(
      "invalid_photo_size",
      `사진은 1바이트 이상 ${Math.floor(maxBytes / 1024 / 1024)}MB 이하여야 합니다.`,
    );
  }
  const detected = detectImageType(view);
  if (!detected || !ALLOWED_IMAGE_TYPES[detected.mime]) {
    throw new ValidationError("invalid_photo_type", "JPEG, PNG, WebP 사진만 등록할 수 있습니다.");
  }
  const normalizedMime = String(declaredMime || "").toLowerCase().split(";", 1)[0].trim();
  if (normalizedMime && normalizedMime !== detected.mime) {
    throw new ValidationError("photo_signature_mismatch", "사진 형식과 파일 내용이 일치하지 않습니다.");
  }
  return detected;
}

export function extractSessionUser(payload) {
  const candidates = [
    payload?.user,
    payload?.data?.user,
    payload?.session?.user,
    payload?.data,
    payload,
  ];
  const user = candidates.find(
    (candidate) => candidate && typeof candidate === "object" &&
      (candidate.id || candidate.sub || candidate.userId || candidate.uid),
  );
  const id = user?.id ?? user?.sub ?? user?.userId ?? user?.uid;
  const site = payload?.site ?? payload?.data?.site ?? user?.site;
  if (
    !id ||
    site !== "homecare" ||
    payload?.active === false ||
    payload?.authenticated === false
  ) return null;
  return {
    id: String(id),
    site,
    email: typeof user.email === "string" ? user.email : "",
    name: typeof user.name === "string" ? user.name : "",
  };
}

function parseUtcDate(value) {
  if (!DATE_PATTERN.test(value || "")) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return parsed;
}

export function toServiceDateString(value = new Date()) {
  const seoulOffsetMilliseconds = 9 * 60 * 60 * 1000;
  return new Date(new Date(value).getTime() + seoulOffsetMilliseconds).toISOString().slice(0, 10);
}

export function parseStatsRange(searchParams, now = new Date()) {
  const today = parseUtcDate(toServiceDateString(now));
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  if (fromRaw || toRaw) {
    if (!fromRaw || !toRaw) {
      throw new ValidationError("invalid_date_range", "직접 기간은 from과 to를 함께 입력해야 합니다.");
    }
    const from = parseUtcDate(fromRaw);
    const to = parseUtcDate(toRaw);
    if (!from || !to || from > to || to > today) {
      throw new ValidationError("invalid_date_range", "조회 기간이 올바르지 않습니다.");
    }
    const dayCount = Math.floor((to - from) / 86400000) + 1;
    if (dayCount > 366) {
      throw new ValidationError("invalid_date_range", "직접 조회 기간은 최대 366일입니다.");
    }
    return { from: fromRaw, to: toRaw, days: dayCount, preset: "custom" };
  }

  const days = Number(searchParams.get("days") || 30);
  if (![7, 30].includes(days)) {
    throw new ValidationError("invalid_date_range", "기본 조회 기간은 7일 또는 30일입니다.");
  }
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - days + 1);
  return { from: toServiceDateString(from), to: toServiceDateString(today), days, preset: `${days}d` };
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return bytesToHex(digest);
}

export async function createDailyVisitorHash({ secret, visitorId, day, institutionId, eventType }) {
  if (!secret || String(secret).length < 32) {
    throw new ValidationError("missing_event_secret", "EVENT_HASH_SECRET은 32자 이상이어야 합니다.");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const scopedValue = `${day}\n${assertInstitutionId(institutionId)}\n${eventType}\n${visitorId}`;
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(scopedValue));
  return bytesToHex(signature);
}

export function parseVisitorCookie(cookieHeader) {
  const match = String(cookieHeader || "").match(/(?:^|;\s*)hc_visit=([A-Za-z0-9_-]{20,80})(?:;|$)/);
  return match?.[1] || "";
}

export function validateVisitorId(value) {
  const visitorId = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(visitorId)) {
    throw new ValidationError("invalid_visitor_id", "익명 방문 식별자가 올바르지 않습니다.");
  }
  return visitorId;
}

export function buildVisitorCookie(visitorId, requestUrl) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `hc_visit=${visitorId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`;
}

export function expandDailyStats(rows, range) {
  const rowMap = new Map();
  for (const row of rows || []) {
    rowMap.set(`${row.day}:${row.event_type}`, Number(row.count) || 0);
  }
  const daily = [];
  const totals = Object.fromEntries(EVENT_TYPES.map((type) => [type, 0]));
  const cursor = parseUtcDate(range.from);
  const end = parseUtcDate(range.to);
  while (cursor <= end) {
    const day = toServiceDateString(cursor);
    const counts = {};
    for (const type of EVENT_TYPES) {
      counts[type] = rowMap.get(`${day}:${type}`) || 0;
      totals[type] += counts[type];
    }
    daily.push({ day, ...counts });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { range, totals, daily };
}

/** SOFTM-HOMECARE-PILOT END */
