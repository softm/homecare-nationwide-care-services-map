import {
  EVENT_TYPES,
  ValidationError,
  assertInstitutionId,
  assertResourceId,
  buildVisitorCookie,
  createDailyVisitorHash,
  expandDailyStats,
  extractSessionUser,
  isAllowedOrigin,
  parseStatsRange,
  parseVisitorCookie,
  sha256Hex,
  toServiceDateString,
  validatePhotoBytes,
  validatePhotoMetadata,
  validateProfilePayload,
  validateProgram,
  validateVisitorId,
} from "./core.mjs";
import { fileStorage, StorageError } from '../../homecare-storage/file-storage.mjs'; // SOFTM-SUPABASE-STORAGE 날짜:20261121 : 공개·기관 권한 검사를 유지한 채 파일 제공자만 분리

/** SOFTM-HOMECARE-PILOT START 날짜:20261118 : 기관 직접 정보관리·사진·조회 통계를 무료 시범운영 범위로 제공 */

const PILOT_AGREEMENT_VERSION = "homecare-pilot-20261118-v1";
const DEFAULT_ALLOWED_ORIGINS = "https://homecare.designboard.net,https://softm.github.io";
const MANAGE_ROLES = ["owner", "editor"];
const HARD_MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const HARD_MAX_PHOTOS_PER_INSTITUTION = 10;
const MAX_MULTIPART_OVERHEAD_BYTES = 512 * 1024;

class HttpError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function success(data, status = 200, headers = undefined) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function empty(status = 204, headers = undefined) {
  return new Response(null, { status, headers });
}

function failure(error) {
  if (error instanceof ValidationError) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
      }),
      { status: 400, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }
  if (error instanceof HttpError || error instanceof StorageError) { // SOFTM-SUPABASE-STORAGE 날짜:20261121 : 비밀값 없는 저장소 오류와 준비 상태를 전달
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
      }),
      { status: error.status, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }
  const internalCode = String(error?.message || "");
  if (internalCode.includes("institution_suspended")) {
    return failure(new HttpError(423, "institution_suspended", "운영 중지된 기관은 정보를 변경하거나 게시할 수 없습니다."));
  }
  if (internalCode.includes("photo_limit_reached")) {
    return failure(new HttpError(409, "photo_limit_reached", "기관당 사진은 최대 10개까지 등록할 수 있습니다."));
  }
  if (internalCode.includes("program_limit_reached")) {
    return failure(new HttpError(409, "program_limit_reached", "프로그램은 최대 10개까지 등록할 수 있습니다."));
  }
  if (internalCode.includes("claim_limit_reached")) {
    return failure(new HttpError(429, "claim_limit_reached", "승인 대기 중인 기관 신청은 계정당 최대 5건입니다."));
  }
  if (
    internalCode.includes("content_revision_positive") ||
    internalCode.includes("content_revision >= 1")
  ) {
    return failure(new HttpError(409, "content_conflict", "다른 담당자가 먼저 내용을 변경했습니다. 최신 정보를 다시 불러와 주세요."));
  }
  return new Response(
    JSON.stringify({ ok: false, error: { code: "internal_error", message: "요청을 처리하지 못했습니다." } }),
    { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}

function applyResponseHeaders(response, request, env) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("Origin");
  if (origin && isAllowedOrigin(
    origin,
    env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS,
    env.DEV_ALLOWED_ORIGIN || "",
  )) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    const vary = headers.get("Vary");
    if (!vary || !vary.split(",").map((value) => value.trim()).includes("Origin")) {
      headers.set("Vary", vary ? `${vary}, Origin` : "Origin");
    }
  }
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (new URL(request.url).pathname.startsWith("/api/") && !headers.has("Cache-Control")) {
    headers.set("Cache-Control", "no-store");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function corsPreflight(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || !isAllowedOrigin(
    origin,
    env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS,
    env.DEV_ALLOWED_ORIGIN || "",
  )) {
    throw new HttpError(403, "origin_not_allowed", "허용되지 않은 요청 출처입니다.");
  }
  return empty(204, {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, If-Match",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
}

async function readJson(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "json_required", "JSON 요청만 허용합니다.");
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "invalid_json", "JSON 형식이 올바르지 않습니다.");
  }
}

function resultRows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function affectedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function requireContentRevision(request) {
  const raw = String(request.headers.get("If-Match") || "").trim();
  const match = raw.match(/^(?:"([1-9]\d*)"|([1-9]\d*))$/);
  const revision = Number(match?.[1] || match?.[2] || 0);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new HttpError(409, "content_conflict", "최신 contentRevision으로 다시 시도해 주세요.");
  }
  return revision;
}

function bumpContentRevisionStatement(env, institutionId, expectedRevision) {
  return env.DB.prepare(
    `UPDATE institutions
        SET content_revision = CASE WHEN content_revision = ? THEN content_revision + 1 ELSE 0 END,
            status = 'draft', published_at = NULL, updated_at = datetime('now')
      WHERE id = ? AND status <> 'suspended'`,
  ).bind(expectedRevision, institutionId);
}

function normalizeAccountApi(value) {
  const base = String(value || "").replace(/\/+$/, "");
  if (!base) return "";
  return base.endsWith("/api/apps/homecare/session")
    ? base
    : `${base}/api/apps/homecare/session`;
}

async function authenticate(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    throw new HttpError(401, "authentication_required", "로그인이 필요합니다.");
  }

  const origin = request.headers.get("Origin") || new URL(request.url).origin;
  if (!isAllowedOrigin(origin, env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS, env.DEV_ALLOWED_ORIGIN || "")) {
    throw new HttpError(403, "origin_not_allowed", "허용되지 않은 요청 출처입니다.");
  }
  const headers = new Headers({ Authorization: authorization, Origin: origin, Accept: "application/json" });
  let response;
  try {
    if (env.ACCOUNT && typeof env.ACCOUNT.fetch === "function") {
      response = await env.ACCOUNT.fetch(
        new Request("https://account.internal/api/apps/homecare/session", { method: "GET", headers }),
      );
    } else {
      const endpoint = normalizeAccountApi(env.ACCOUNT_API);
      if (!endpoint) {
        throw new HttpError(503, "account_service_unavailable", "계정 서비스가 연결되지 않았습니다.");
      }
      response = await fetch(endpoint, { method: "GET", headers, signal: AbortSignal.timeout(5000) });
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, "account_service_unavailable", "계정 서비스에 연결하지 못했습니다.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new HttpError(401, "invalid_session", "로그인 세션이 유효하지 않습니다.");
  }
  if (!response.ok) {
    throw new HttpError(503, "account_service_unavailable", "계정 서비스가 응답하지 않습니다.");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new HttpError(503, "invalid_account_response", "계정 서비스 응답을 확인하지 못했습니다.");
  }
  const user = extractSessionUser(payload);
  if (!user) {
    throw new HttpError(401, "invalid_session", "로그인 세션이 유효하지 않습니다.");
  }
  return user;
}

async function requireMembership(env, userId, institutionId, allowedRoles = null) {
  const id = assertInstitutionId(institutionId);
  const membership = await env.DB.prepare(
    `SELECT m.institution_id, m.user_id, m.role, m.status, m.approved_at,
            i.status AS institution_status
       FROM institution_memberships m
       JOIN institutions i ON i.id = m.institution_id
      WHERE m.institution_id = ? AND m.user_id = ? AND m.status = 'approved'
      LIMIT 1`,
  ).bind(id, userId).first();
  if (!membership) {
    throw new HttpError(403, "institution_access_denied", "이 기관을 관리할 권한이 없습니다.");
  }
  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new HttpError(403, "institution_role_denied", "이 작업을 수행할 권한이 없습니다.");
  }
  if (allowedRoles && membership.institution_status === "suspended") {
    throw new HttpError(423, "institution_suspended", "운영 중지된 기관은 정보를 변경하거나 게시할 수 없습니다.");
  }
  return membership;
}

function parseJsonColumn(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapProgram(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    schedule: row.schedule || "",
    sortOrder: Number(row.sort_order) || 0,
    active: Boolean(row.is_active),
  };
}

function mapPhoto(row, institutionId, includePreview = false) {
  const photo = {
    id: row.id,
    url: `/api/public/institutions/${encodeURIComponent(institutionId)}/photos/${encodeURIComponent(row.id)}`,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    caption: row.caption || "",
    altText: row.alt_text || "",
    sortOrder: Number(row.sort_order) || 0,
    isCover: Boolean(row.is_cover),
    published: Boolean(row.is_published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includePreview) {
    photo.previewPath = `/api/institutions/${encodeURIComponent(institutionId)}/photos/${encodeURIComponent(row.id)}/content`;
  }
  return photo;
}

function mapAgreement(row) {
  if (!row) {
    return {
      status: "not_accepted",
      version: PILOT_AGREEMENT_VERSION,
      acceptedAt: null,
      withdrawnAt: null,
      contactRole: "",
      notes: "",
      billingCommitment: false,
      confirmations: { freePilot: false, noPayment: false, contentAuthority: false },
    };
  }
  return {
    status: row.status,
    version: row.agreement_version,
    acceptedAt: row.accepted_at || null,
    withdrawnAt: row.withdrawn_at || null,
    contactRole: row.contact_role || "",
    notes: row.notes || "",
    billingCommitment: false,
    confirmations: {
      freePilot: Boolean(row.free_pilot_confirmed),
      noPayment: Boolean(row.no_payment_confirmed),
      contentAuthority: Boolean(row.content_authority_confirmed),
    },
  };
}

function mapInstitution(row, programs, photos, agreement = null, includePreview = false) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    ...(includePreview ? { contentRevision: Number(row.content_revision) } : {}),
    publishedAt: row.published_at || null,
    profile: {
      displayName: row.display_name || row.name,
      summary: row.summary || "",
      phone: row.phone || "",
      email: row.email || "",
      website: row.website || "",
      address: row.address || "",
      operatingHours: parseJsonColumn(row.operating_hours_json, {}),
      transportation: row.transportation || "",
      capacity: row.capacity === null || row.capacity === undefined ? null : Number(row.capacity),
      availableSlots: row.available_slots === null || row.available_slots === undefined
        ? null
        : Number(row.available_slots),
      confirmedAt: row.confirmed_at || null,
      updatedAt: row.profile_updated_at || null,
    },
    programs: programs.map(mapProgram),
    photos: photos.map((photo) => mapPhoto(photo, row.id, includePreview)),
    ...(agreement ? { pilotAgreement: mapAgreement(agreement) } : {}),
  };
}

const INSTITUTION_SELECT = `
  SELECT i.id, i.name, i.status, i.content_revision, i.published_at,
         p.display_name, p.summary, p.phone, p.email, p.website, p.address,
         p.operating_hours_json, p.transportation, p.capacity, p.available_slots,
         p.confirmed_at, p.updated_at AS profile_updated_at
    FROM institutions i
    LEFT JOIN institution_profiles p ON p.institution_id = i.id`;

async function loadInstitution(env, institutionId, { publicOnly = false, includeAgreement = false } = {}) {
  const id = assertInstitutionId(institutionId);
  const condition = publicOnly ? " AND i.status = 'published'" : "";
  const row = await env.DB.prepare(`${INSTITUTION_SELECT} WHERE i.id = ?${condition} LIMIT 1`).bind(id).first();
  if (!row) {
    throw new HttpError(404, "institution_not_found", "기관 정보를 찾을 수 없습니다.");
  }
  const programResult = await env.DB.prepare(
    `SELECT id, title, description, schedule, sort_order, is_active
       FROM institution_programs
      WHERE institution_id = ?${publicOnly ? " AND is_active = 1" : ""}
      ORDER BY sort_order ASC, created_at ASC`,
  ).bind(id).all();
  const photoResult = await env.DB.prepare(
    `SELECT id, content_type, size_bytes, caption, alt_text, sort_order,
            is_cover, is_published, created_at, updated_at
       FROM institution_photos
      WHERE institution_id = ?${publicOnly ? " AND is_published = 1" : ""}
      ORDER BY is_cover DESC, sort_order ASC, created_at ASC`,
  ).bind(id).all();
  const agreement = includeAgreement
    ? await env.DB.prepare(
      `SELECT status, agreement_version, accepted_by, accepted_at, withdrawn_by, withdrawn_at, contact_role, notes,
              free_pilot_confirmed, no_payment_confirmed, content_authority_confirmed
         FROM pilot_agreements WHERE institution_id = ? LIMIT 1`,
    ).bind(id).first()
    : null;
  return mapInstitution(row, resultRows(programResult), resultRows(photoResult), agreement, !publicOnly);
}

async function getPublicInstitution(env, institutionId) {
  return success(await loadInstitution(env, institutionId, { publicOnly: true }));
}

async function servePublicPhoto(env, institutionId, photoId) {
  const id = assertInstitutionId(institutionId);
  const normalizedPhotoId = assertResourceId(photoId, "사진");
  const row = await env.DB.prepare(
    `SELECT p.r2_key, p.content_type, p.size_bytes, p.updated_at
       FROM institution_photos p
       JOIN institutions i ON i.id = p.institution_id
      WHERE p.id = ? AND p.institution_id = ? AND p.is_published = 1 AND i.status = 'published'
      LIMIT 1`,
  ).bind(normalizedPhotoId, id).first();
  if (!row) throw new HttpError(404, "photo_not_found", "사진을 찾을 수 없습니다.");
  const object = await fileStorage(env, 'PHOTOS').get(row.r2_key); // SOFTM-SUPABASE-STORAGE 날짜:20261121 : 기관·사진 게시 상태 확인 뒤 파일 조회
  if (!object) throw new HttpError(404, "photo_not_found", "사진 파일을 찾을 수 없습니다.");
  const headers = new Headers({
    "Content-Type": row.content_type,
    "Cache-Control": "no-store",
    "Content-Length": String(row.size_bytes),
  });
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { status: 200, headers });
}

async function servePrivatePhoto(request, env, institutionId, photoId) {
  const user = await authenticate(request, env);
  const id = assertInstitutionId(institutionId);
  const normalizedPhotoId = assertResourceId(photoId, "사진");
  await requireMembership(env, user.id, id);
  const row = await env.DB.prepare(
    `SELECT r2_key, content_type, size_bytes
       FROM institution_photos
      WHERE id = ? AND institution_id = ?
      LIMIT 1`,
  ).bind(normalizedPhotoId, id).first();
  if (!row) throw new HttpError(404, "photo_not_found", "사진을 찾을 수 없습니다.");
  const object = await fileStorage(env, 'PHOTOS').get(row.r2_key); // SOFTM-SUPABASE-STORAGE 날짜:20261121 : 기관 멤버십 확인 뒤 비공개 미리보기
  if (!object) throw new HttpError(404, "photo_not_found", "사진 파일을 찾을 수 없습니다.");
  const headers = new Headers({
    "Content-Type": row.content_type,
    "Content-Length": String(row.size_bytes),
    "Cache-Control": "private, no-store",
    "Content-Disposition": "inline",
  });
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { status: 200, headers });
}

async function recordPublicEvent(request, env) {
  if (!request.headers.get("Origin")) {
    throw new HttpError(403, "origin_required", "이용 행동 기록에는 허용된 서비스 Origin이 필요합니다.");
  }
  const payload = await readJson(request);
  const institutionId = assertInstitutionId(payload.institutionId);
  const eventType = String(payload.type || "");
  if (!EVENT_TYPES.includes(eventType)) {
    throw new ValidationError("invalid_event_type", "집계할 수 없는 이용 행동입니다.");
  }
  const institution = await env.DB.prepare(
    "SELECT id FROM institutions WHERE id = ? AND status = 'published' LIMIT 1",
  ).bind(institutionId).first();
  if (!institution) throw new HttpError(404, "institution_not_found", "기관 정보를 찾을 수 없습니다.");

  const suppliedVisitorId = payload.visitorId === undefined ? "" : validateVisitorId(payload.visitorId);
  let visitorId = suppliedVisitorId || parseVisitorCookie(request.headers.get("Cookie"));
  const createdVisitor = !suppliedVisitorId && !visitorId;
  if (!visitorId) visitorId = crypto.randomUUID().replaceAll("-", "");
  const day = toServiceDateString();
  const visitorHash = await createDailyVisitorHash({
    secret: env.EVENT_HASH_SECRET,
    visitorId,
    day,
    institutionId,
    eventType,
  });
  const dedupeResult = await env.DB.prepare(
    `INSERT OR IGNORE INTO event_dedup
       (day, institution_id, event_type, visitor_hash, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
  ).bind(day, institutionId, eventType, visitorHash).run();
  const counted = affectedRows(dedupeResult) > 0;
  const headers = createdVisitor ? { "Set-Cookie": buildVisitorCookie(visitorId, request.url) } : undefined;
  return success({ counted }, 200, headers);
}

async function listMyInstitutions(request, env) {
  const user = await authenticate(request, env);
  const result = await env.DB.prepare(
    `SELECT m.institution_id, m.role, m.approved_at
       FROM institution_memberships m
      WHERE m.user_id = ? AND m.status = 'approved'
      ORDER BY m.approved_at ASC`,
  ).bind(user.id).all();
  const institutions = [];
  for (const membership of resultRows(result)) {
    const institution = await loadInstitution(env, membership.institution_id, { includeAgreement: true });
    institutions.push({ ...institution, membership: { role: membership.role, approvedAt: membership.approved_at } });
  }
  const claimResult = await env.DB.prepare(
    `SELECT c.id, c.institution_id, c.institution_name, c.status,
            c.contact_name, c.contact_email, c.contact_phone, c.note, c.revision,
            c.created_at, c.updated_at
       FROM institution_claims c
       JOIN institutions i ON i.id = c.institution_id
      WHERE c.user_id = ? AND c.status = 'pending'
      ORDER BY c.created_at ASC`,
  ).bind(user.id).all();
  const pendingClaims = resultRows(claimResult).map((claim) => ({
    id: claim.id,
    institutionId: claim.institution_id,
    institutionName: claim.institution_name,
    status: claim.status,
    contactName: claim.contact_name,
    contactEmail: claim.contact_email,
    contactPhone: claim.contact_phone,
    note: claim.note || "",
    revision: Number(claim.revision),
    createdAt: claim.created_at,
    updatedAt: claim.updated_at,
  }));
  return success({ user: { id: user.id, email: user.email, name: user.name }, institutions, pendingClaims });
}

async function claimInstitution(request, env) {
  const user = await authenticate(request, env);
  const payload = await readJson(request);
  const inviteToken = typeof payload.inviteToken === "string" ? payload.inviteToken.trim() : "";
  if (!inviteToken) {
    const institutionId = String(payload.institutionId || "").trim();
    if (!/^\d{11}$/.test(institutionId)) {
      throw new ValidationError("invalid_institution_id", "공개 모집 신청에는 공단 기관기호 11자리가 필요합니다.");
    }
    const institutionName = agreementString(payload.institutionName, "기관명", 120);
    const contactName = agreementString(payload.contactName, "담당자명", 80);
    const contactEmail = agreementString(payload.contactEmail, "담당자 이메일", 254).toLowerCase();
    const contactPhone = agreementString(payload.contactPhone, "담당자 전화번호", 40);
    const note = agreementString(payload.note, "신청 메모", 500);
    if (!institutionName || !contactName || !contactEmail || !contactPhone || payload.truthful !== true) {
      throw new ValidationError(
        "invalid_claim",
        "기관명·담당자 연락처와 사실 확인 동의가 필요합니다.",
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      throw new ValidationError("invalid_claim", "담당자 이메일 형식이 올바르지 않습니다.");
    }
    const claimId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO institutions (id, name, status, created_at, updated_at)
         VALUES (?, ?, 'draft', datetime('now'), datetime('now'))
         ON CONFLICT(id) DO NOTHING`,
      ).bind(institutionId, institutionId),
      env.DB.prepare(
        `INSERT INTO institution_claims
           (id, institution_id, user_id, institution_name, contact_name, contact_email, contact_phone,
            note, truthful, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', datetime('now'), datetime('now'))
         ON CONFLICT(institution_id, user_id)
         DO UPDATE SET institution_name = excluded.institution_name,
                       contact_name = excluded.contact_name, contact_email = excluded.contact_email,
                       contact_phone = excluded.contact_phone, note = excluded.note, truthful = 1,
                       status = 'pending', revision = institution_claims.revision + 1,
                       approved_role = NULL, reviewed_by = NULL, reviewed_at = NULL,
                       updated_at = datetime('now')
         WHERE institution_claims.status <> 'approved'`,
      ).bind(
        claimId,
        institutionId,
        user.id,
        institutionName,
        contactName,
        contactEmail,
        contactPhone,
        note,
      ),
    ]);
    const claim = await env.DB.prepare(
      `SELECT id, institution_id, institution_name, status, contact_name, contact_email, contact_phone, revision,
              note, created_at, updated_at
         FROM institution_claims
        WHERE institution_id = ? AND user_id = ? LIMIT 1`,
    ).bind(institutionId, user.id).first();
    return success({
      claim: {
        id: claim.id,
        institutionId: claim.institution_id,
        institutionName: claim.institution_name,
        status: claim.status,
        contactName: claim.contact_name,
        contactEmail: claim.contact_email,
        contactPhone: claim.contact_phone,
        note: claim.note || "",
        revision: Number(claim.revision),
        createdAt: claim.created_at,
        updatedAt: claim.updated_at,
      },
      accessGranted: false,
    }, 202);
  }
  if (inviteToken.length < 32 || inviteToken.length > 200) {
    throw new ValidationError("invalid_invite", "초대 코드가 올바르지 않습니다.");
  }
  const tokenHash = await sha256Hex(inviteToken);
  const invite = await env.DB.prepare(
    `SELECT id, institution_id, role, expires_at, claimed_by
       FROM institution_invites
      WHERE token_hash = ? LIMIT 1`,
  ).bind(tokenHash).first();
  if (!invite || new Date(invite.expires_at).valueOf() <= Date.now()) {
    throw new HttpError(410, "invite_unavailable", "초대 코드가 만료되었거나 사용할 수 없습니다.");
  }
  if (invite.claimed_by) {
    throw new HttpError(410, "invite_unavailable", "이미 사용한 초대 코드입니다.");
  }

  const statements = [
    env.DB.prepare(
      `INSERT INTO institution_memberships
         (institution_id, user_id, role, status, approved_at, created_at, updated_at)
       SELECT institution_id, ?, role, 'approved', datetime('now'), datetime('now'), datetime('now')
         FROM institution_invites
        WHERE id = ? AND claimed_by IS NULL AND claimed_at IS NULL
          AND julianday(expires_at) > julianday('now')`,
    ).bind(user.id, invite.id),
    env.DB.prepare(
      `UPDATE institution_invites
          SET claimed_by = ?, claimed_at = datetime('now')
        WHERE id = ? AND claimed_by IS NULL AND claimed_at IS NULL
          AND julianday(expires_at) > julianday('now')
          AND EXISTS (
              SELECT 1 FROM institution_memberships m
               WHERE m.institution_id = institution_invites.institution_id
                 AND m.user_id = ? AND m.status = 'approved'
          )`,
    ).bind(user.id, invite.id, user.id),
  ];
  let claimResults;
  try {
    claimResults = await env.DB.batch(statements);
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE")) {
      throw new HttpError(409, "membership_exists", "기존 기관 권한이 있어 이 초대 코드를 사용할 수 없습니다.");
    }
    throw error;
  }
  if (affectedRows(claimResults[0]) !== 1 || affectedRows(claimResults[1]) !== 1) {
    throw new HttpError(410, "invite_unavailable", "이미 사용했거나 만료된 초대 코드입니다.");
  }
  await requireMembership(env, user.id, invite.institution_id);
  const institution = await loadInstitution(env, invite.institution_id, { includeAgreement: true });
  return success({ institution }, 200);
}

async function replaceProfile(request, env, institutionId) {
  const user = await authenticate(request, env);
  const id = assertInstitutionId(institutionId);
  await requireMembership(env, user.id, id, MANAGE_ROLES);
  const expectedRevision = requireContentRevision(request);
  const profile = validateProfilePayload(await readJson(request));
  if (profile.availableSlots !== null && profile.capacity !== null && profile.availableSlots > profile.capacity) {
    throw new ValidationError("invalid_profile", "이용 가능 인원은 정원을 초과할 수 없습니다.");
  }
  const programs = profile.programs.map((program) => ({ ...program, id: program.id || crypto.randomUUID() }));
  const statements = [
    bumpContentRevisionStatement(env, id, expectedRevision),
    env.DB.prepare(
      `INSERT INTO institution_profiles
         (institution_id, display_name, summary, phone, email, website, address,
          operating_hours_json, transportation, capacity, available_slots, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(institution_id)
       DO UPDATE SET display_name = excluded.display_name, summary = excluded.summary,
                     phone = excluded.phone, email = excluded.email, website = excluded.website,
                     address = excluded.address, operating_hours_json = excluded.operating_hours_json,
                     transportation = excluded.transportation, capacity = excluded.capacity,
                     available_slots = excluded.available_slots, updated_at = datetime('now')`,
    ).bind(
      id,
      profile.displayName,
      profile.summary,
      profile.phone,
      profile.email,
      profile.website,
      profile.address,
      profile.operatingHoursJson,
      profile.transportation,
      profile.capacity,
      profile.availableSlots,
    ),
    env.DB.prepare("DELETE FROM institution_programs WHERE institution_id = ?").bind(id),
    ...programs.map((program) => env.DB.prepare(
      `INSERT INTO institution_programs
         (id, institution_id, title, description, schedule, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    ).bind(
      program.id,
      id,
      program.title,
      program.description,
      program.schedule,
      program.sortOrder,
      program.active ? 1 : 0,
    )),
  ];
  await env.DB.batch(statements);
  return success(await loadInstitution(env, id, { includeAgreement: true }));
}

async function createProgram(request, env, institutionId) {
  const user = await authenticate(request, env);
  const id = assertInstitutionId(institutionId);
  await requireMembership(env, user.id, id, MANAGE_ROLES);
  const expectedRevision = requireContentRevision(request);
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM institution_programs WHERE institution_id = ?",
  ).bind(id).first();
  if (Number(countRow?.count || 0) >= 10) {
    throw new HttpError(409, "program_limit_reached", "프로그램은 최대 10개까지 등록할 수 있습니다.");
  }
  const program = validateProgram(await readJson(request));
  const programId = program.id || crypto.randomUUID();
  await env.DB.batch([
    bumpContentRevisionStatement(env, id, expectedRevision),
    env.DB.prepare(
      `INSERT INTO institution_programs
         (id, institution_id, title, description, schedule, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    ).bind(
      programId,
      id,
      program.title,
      program.description,
      program.schedule,
      program.sortOrder,
      program.active ? 1 : 0,
    ),
  ]);
  return success({ ...program, id: programId, contentRevision: expectedRevision + 1 }, 201);
}

async function updateProgram(request, env, institutionId, programId) {
  const user = await authenticate(request, env);
  const id = assertInstitutionId(institutionId);
  const normalizedProgramId = assertResourceId(programId, "프로그램");
  await requireMembership(env, user.id, id, MANAGE_ROLES);
  const expectedRevision = requireContentRevision(request);
  const current = await env.DB.prepare(
    `SELECT id, title, description, schedule, sort_order, is_active
       FROM institution_programs WHERE id = ? AND institution_id = ? LIMIT 1`,
  ).bind(normalizedProgramId, id).first();
  if (!current) throw new HttpError(404, "program_not_found", "프로그램을 찾을 수 없습니다.");
  const patch = await readJson(request);
  const program = validateProgram({
    id: normalizedProgramId,
    title: patch.title ?? current.title,
    description: patch.description ?? current.description,
    schedule: patch.schedule ?? current.schedule,
    sortOrder: patch.sortOrder ?? Number(current.sort_order),
    active: patch.active ?? Boolean(current.is_active),
  });
  await env.DB.batch([
    bumpContentRevisionStatement(env, id, expectedRevision),
    env.DB.prepare(
      `UPDATE institution_programs
          SET title = ?, description = ?, schedule = ?, sort_order = ?, is_active = ?, updated_at = datetime('now')
        WHERE id = ? AND institution_id = ?`,
    ).bind(
      program.title,
      program.description,
      program.schedule,
      program.sortOrder,
      program.active ? 1 : 0,
      normalizedProgramId,
      id,
    ),
  ]);
  return success({ ...program, contentRevision: expectedRevision + 1 });
}

async function deleteProgram(request, env, institutionId, programId) {
  const user = await authenticate(request, env);
  const id = assertInstitutionId(institutionId);
  const normalizedProgramId = assertResourceId(programId, "프로그램");
  await requireMembership(env, user.id, id, MANAGE_ROLES);
  const expectedRevision = requireContentRevision(request);
  const current = await env.DB.prepare(
    "SELECT id FROM institution_programs WHERE id = ? AND institution_id = ? LIMIT 1",
  ).bind(normalizedProgramId, id).first();
  if (!current) throw new HttpError(404, "program_not_found", "프로그램을 찾을 수 없습니다.");
  const results = await env.DB.batch([
    bumpContentRevisionStatement(env, id, expectedRevision),
    env.DB.prepare("DELETE FROM institution_programs WHERE id = ? AND institution_id = ?")
      .bind(normalizedProgramId, id),
  ]);
  if (affectedRows(results[1]) === 0) {
    throw new HttpError(404, "program_not_found", "프로그램을 찾을 수 없습니다.");
  }
  return success({ deleted: true, contentRevision: expectedRevision + 1 });
}

async function cleanupUncommittedPhoto(env, r2Key) {
  try {
    await fileStorage(env, 'PHOTOS').delete(r2Key); // SOFTM-SUPABASE-STORAGE 날짜:20261121 : DB 반영 실패의 파일 보상 삭제 유지
    return;
  } catch {
    // R2 삭제가 실패하면 private orphan을 예약 정리 대상으로 남긴다.
  }
  try {
    await env.DB.prepare(
      `INSERT INTO r2_deletion_queue (r2_key, attempts, last_attempt_at, created_at)
       VALUES (?, 1, datetime('now'), datetime('now'))
       ON CONFLICT(r2_key)
       DO UPDATE SET attempts = r2_deletion_queue.attempts + 1,
                     last_attempt_at = datetime('now')`,
    ).bind(r2Key).run();
  } catch {
    // 원래 D1 오류를 보존한다. 이 경우 운영 reconcile 절차로 private orphan을 찾는다.
  }
}

async function uploadPhoto(request, env, institutionId) {
  const user = await authenticate(request, env);
  const id = assertInstitutionId(institutionId);
  await requireMembership(env, user.id, id, MANAGE_ROLES);
  const expectedRevision = requireContentRevision(request);
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new HttpError(415, "multipart_required", "사진은 multipart/form-data로 전송해야 합니다.");
  }
  const configuredMaxBytes = Number(env.MAX_PHOTO_BYTES || HARD_MAX_PHOTO_BYTES);
  const maxBytes = Number.isFinite(configuredMaxBytes) && configuredMaxBytes > 0
    ? Math.min(Math.floor(configuredMaxBytes), HARD_MAX_PHOTO_BYTES)
    : HARD_MAX_PHOTO_BYTES;
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (
    Number.isFinite(declaredLength) && declaredLength > 0 &&
    declaredLength > maxBytes + MAX_MULTIPART_OVERHEAD_BYTES
  ) {
    throw new HttpError(413, "payload_too_large", "사진 업로드 요청 크기가 허용 범위를 초과했습니다.");
  }
  const formData = await request.formData();
  const file = formData.get("photo") || formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new ValidationError("photo_required", "등록할 사진 파일이 필요합니다.");
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxBytes) {
    throw new ValidationError(
      "invalid_photo_size",
      `사진은 1바이트 이상 ${Math.floor(maxBytes / 1024 / 1024)}MB 이하여야 합니다.`,
    );
  }
  const configuredMaxCount = Number(env.MAX_PHOTOS_PER_INSTITUTION || HARD_MAX_PHOTOS_PER_INSTITUTION);
  const maxCount = Number.isFinite(configuredMaxCount) && configuredMaxCount > 0
    ? Math.min(Math.floor(configuredMaxCount), HARD_MAX_PHOTOS_PER_INSTITUTION)
    : HARD_MAX_PHOTOS_PER_INSTITUTION;
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM institution_photos WHERE institution_id = ?",
  ).bind(id).first();
  if (Number(countRow?.count || 0) >= maxCount) {
    throw new HttpError(409, "photo_limit_reached", `기관당 사진은 최대 ${maxCount}개까지 등록할 수 있습니다.`);
  }
  const bytes = await file.arrayBuffer();
  const detected = validatePhotoBytes(bytes, file.type, maxBytes);
  const metadata = validatePhotoMetadata({
    caption: formData.get("caption") ?? "",
    altText: formData.get("altText") ?? "",
    sortOrder: formData.get("sortOrder") === null ? undefined : Number(formData.get("sortOrder")),
    isCover: formData.get("isCover"),
    published: formData.get("published"),
  });
  const photoId = crypto.randomUUID();
  const r2Key = `institutions/${id}/${photoId}.${detected.extension}`;
  await fileStorage(env, 'PHOTOS').put(r2Key, bytes, { // SOFTM-SUPABASE-STORAGE 날짜:20261121 : 비공개·크기·준비 상태 검증 후 저장
    httpMetadata: { contentType: detected.mime, cacheControl: "private, no-store" },
    customMetadata: { institutionId: id, photoId },
  });
  try {
    const statements = [bumpContentRevisionStatement(env, id, expectedRevision)];
    if (metadata.isCover) {
      statements.push(
        env.DB.prepare("UPDATE institution_photos SET is_cover = 0, updated_at = datetime('now') WHERE institution_id = ?")
          .bind(id),
      );
    }
    statements.push(env.DB.prepare(
      `INSERT INTO institution_photos
         (id, institution_id, r2_key, content_type, size_bytes, caption, alt_text,
          sort_order, is_cover, is_published, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    ).bind(
      photoId,
      id,
      r2Key,
      detected.mime,
      bytes.byteLength,
      metadata.caption,
      metadata.altText,
      metadata.sortOrder,
      metadata.isCover ? 1 : 0,
      metadata.published ? 1 : 0,
    ));
    await env.DB.batch(statements);
  } catch (error) {
    await cleanupUncommittedPhoto(env, r2Key);
    throw error;
  }
  const row = await env.DB.prepare(
    `SELECT id, content_type, size_bytes, caption, alt_text, sort_order,
            is_cover, is_published, created_at, updated_at
       FROM institution_photos WHERE id = ? AND institution_id = ? LIMIT 1`,
  ).bind(photoId, id).first();
  return success({ ...mapPhoto(row, id, true), contentRevision: expectedRevision + 1 }, 201);
}

async function updatePhoto(request, env, institutionId, photoId) {
  const user = await authenticate(request, env);
  const id = assertInstitutionId(institutionId);
  const normalizedPhotoId = assertResourceId(photoId, "사진");
  await requireMembership(env, user.id, id, MANAGE_ROLES);
  const expectedRevision = requireContentRevision(request);
  const current = await env.DB.prepare(
    `SELECT id, content_type, size_bytes, caption, alt_text, sort_order,
            is_cover, is_published, created_at, updated_at
       FROM institution_photos WHERE id = ? AND institution_id = ? LIMIT 1`,
  ).bind(normalizedPhotoId, id).first();
  if (!current) throw new HttpError(404, "photo_not_found", "사진을 찾을 수 없습니다.");
  const patch = await readJson(request);
  const metadata = validatePhotoMetadata({
    caption: patch.caption ?? current.caption,
    altText: patch.altText ?? current.alt_text,
    sortOrder: patch.sortOrder ?? Number(current.sort_order),
    isCover: patch.isCover ?? Boolean(current.is_cover),
    published: patch.published ?? Boolean(current.is_published),
  });
  const statements = [bumpContentRevisionStatement(env, id, expectedRevision)];
  if (metadata.isCover) {
    statements.push(
      env.DB.prepare(
        "UPDATE institution_photos SET is_cover = 0, updated_at = datetime('now') WHERE institution_id = ? AND id <> ?",
      ).bind(id, normalizedPhotoId),
    );
  }
  statements.push(env.DB.prepare(
    `UPDATE institution_photos
        SET caption = ?, alt_text = ?, sort_order = ?, is_cover = ?, is_published = ?, updated_at = datetime('now')
      WHERE id = ? AND institution_id = ?`,
  ).bind(
    metadata.caption,
    metadata.altText,
    metadata.sortOrder,
    metadata.isCover ? 1 : 0,
    metadata.published ? 1 : 0,
    normalizedPhotoId,
    id,
  ));
  await env.DB.batch(statements);
  const updated = await env.DB.prepare(
    `SELECT id, content_type, size_bytes, caption, alt_text, sort_order,
            is_cover, is_published, created_at, updated_at
       FROM institution_photos WHERE id = ? AND institution_id = ? LIMIT 1`,
  ).bind(normalizedPhotoId, id).first();
  return success({ ...mapPhoto(updated, id, true), contentRevision: expectedRevision + 1 });
}

async function deletePhoto(request, env, institutionId, photoId) {
  const user = await authenticate(request, env);
  const id = assertInstitutionId(institutionId);
  const normalizedPhotoId = assertResourceId(photoId, "사진");
  await requireMembership(env, user.id, id, MANAGE_ROLES);
  const expectedRevision = requireContentRevision(request);
  const row = await env.DB.prepare(
    "SELECT r2_key FROM institution_photos WHERE id = ? AND institution_id = ? LIMIT 1",
  ).bind(normalizedPhotoId, id).first();
  if (!row) throw new HttpError(404, "photo_not_found", "사진을 찾을 수 없습니다.");
  const results = await env.DB.batch([
    bumpContentRevisionStatement(env, id, expectedRevision),
    env.DB.prepare("DELETE FROM institution_photos WHERE id = ? AND institution_id = ?")
      .bind(normalizedPhotoId, id),
    env.DB.prepare(
      `INSERT INTO r2_deletion_queue (r2_key, attempts, created_at)
       VALUES (?, 0, datetime('now'))
       ON CONFLICT(r2_key) DO NOTHING`,
    ).bind(row.r2_key),
  ]);
  if (affectedRows(results[1]) === 0) {
    throw new HttpError(404, "photo_not_found", "사진을 찾을 수 없습니다.");
  }
  try {
    await fileStorage(env, 'PHOTOS').delete(row.r2_key); // SOFTM-SUPABASE-STORAGE 날짜:20261121 : 삭제 실패를 기존 대기열로 재시도
    await env.DB.prepare("DELETE FROM r2_deletion_queue WHERE r2_key = ?").bind(row.r2_key).run();
  } catch {
    try {
      await env.DB.prepare(
        `UPDATE r2_deletion_queue
            SET attempts = attempts + 1, last_attempt_at = datetime('now')
          WHERE r2_key = ?`,
      ).bind(row.r2_key).run();
    } catch {
      // 삭제 본문은 D1에서 이미 비공개 처리되므로 원래 오류를 덮지 않는다.
    }
    return success({ deleted: true, storageCleanupPending: true, contentRevision: expectedRevision + 1 }, 202);
  }
  return success({ deleted: true, contentRevision: expectedRevision + 1 });
}

async function submitInstitution(request, env, institutionId) {
  const user = await authenticate(request, env);
  const id = assertInstitutionId(institutionId);
  await requireMembership(env, user.id, id, MANAGE_ROLES);
  const expectedRevision = requireContentRevision(request);
  const publishResult = await env.DB.prepare(
    `UPDATE institutions
        SET status = 'published', content_revision = content_revision + 1,
            published_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND status <> 'suspended' AND content_revision = ?
        AND EXISTS (
            SELECT 1 FROM pilot_agreements a
             WHERE a.institution_id = institutions.id AND a.status = 'accepted'
               AND a.agreement_version = ?
               AND a.free_pilot_confirmed = 1 AND a.no_payment_confirmed = 1
               AND a.content_authority_confirmed = 1
        )
        AND EXISTS (
            SELECT 1 FROM institution_profiles p
             WHERE p.institution_id = institutions.id
               AND trim(p.display_name) <> ''
               AND (
                   trim(p.summary) <> '' OR trim(p.phone) <> '' OR
                   trim(COALESCE(
                       CASE WHEN json_valid(p.operating_hours_json)
                            THEN json_extract(p.operating_hours_json, '$.note') ELSE '' END,
                       ''
                   )) <> '' OR
                   EXISTS (
                       SELECT 1 FROM institution_programs ip
                        WHERE ip.institution_id = institutions.id
                   )
               )
        )`,
  ).bind(id, expectedRevision, PILOT_AGREEMENT_VERSION).run();
  if (affectedRows(publishResult) !== 1) {
    const state = await env.DB.prepare(
      `SELECT i.status, i.content_revision,
              EXISTS(
                  SELECT 1 FROM pilot_agreements a
                   WHERE a.institution_id = i.id AND a.status = 'accepted'
                     AND a.agreement_version = ?
                     AND a.free_pilot_confirmed = 1 AND a.no_payment_confirmed = 1
                     AND a.content_authority_confirmed = 1
              ) AS has_agreement,
              EXISTS(
                  SELECT 1 FROM institution_profiles p
                   WHERE p.institution_id = i.id
                     AND trim(p.display_name) <> ''
                     AND (
                         trim(p.summary) <> '' OR trim(p.phone) <> '' OR
                         trim(COALESCE(
                             CASE WHEN json_valid(p.operating_hours_json)
                                  THEN json_extract(p.operating_hours_json, '$.note') ELSE '' END,
                             ''
                         )) <> '' OR
                         EXISTS (
                             SELECT 1 FROM institution_programs ip
                              WHERE ip.institution_id = i.id
                         )
                     )
              ) AS has_profile
         FROM institutions i WHERE i.id = ? LIMIT 1`,
    ).bind(PILOT_AGREEMENT_VERSION, id).first();
    if (Number(state?.content_revision) !== expectedRevision) {
      throw new HttpError(409, "content_conflict", "다른 담당자가 먼저 내용을 변경했습니다. 최신 정보를 다시 불러와 주세요.");
    }
    if (state?.status === "suspended") {
      throw new HttpError(423, "institution_suspended", "운영 중지된 기관은 정보를 변경하거나 게시할 수 없습니다.");
    }
    if (!state?.has_agreement) {
      throw new HttpError(409, "pilot_agreement_required", "시범운영 협약 동의 후 게시할 수 있습니다.");
    }
    if (!state?.has_profile) {
      throw new HttpError(409, "profile_required", "기관 운영정보를 먼저 등록해 주세요.");
    }
    throw new HttpError(409, "publish_conflict", "기관 상태가 변경되어 게시하지 못했습니다. 다시 확인해 주세요.");
  }
  return success(await loadInstitution(env, id, { includeAgreement: true }));
}

async function getStats(request, env, institutionId, url) {
  const user = await authenticate(request, env);
  const id = assertInstitutionId(institutionId);
  await requireMembership(env, user.id, id);
  const range = parseStatsRange(url.searchParams);
  const result = await env.DB.prepare(
    `SELECT day, event_type, event_count AS count
       FROM institution_event_daily
      WHERE institution_id = ? AND day >= ? AND day <= ?
      ORDER BY day ASC, event_type ASC`,
  ).bind(id, range.from, range.to).all();
  return success(expandDailyStats(resultRows(result), range));
}

function agreementString(value, field, maxLength) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new ValidationError("invalid_agreement", `${field} 항목이 올바르지 않습니다.`);
  const normalized = value.trim();
  if (normalized.length > maxLength || normalized.includes("\u0000")) {
    throw new ValidationError("invalid_agreement", `${field} 항목은 ${maxLength}자 이내여야 합니다.`);
  }
  return normalized;
}

async function getPilotAgreement(request, env, institutionId) {
  const user = await authenticate(request, env);
  const id = assertInstitutionId(institutionId);
  await requireMembership(env, user.id, id);
  const row = await env.DB.prepare(
    `SELECT status, agreement_version, accepted_by, accepted_at, withdrawn_by, withdrawn_at, contact_role, notes,
            free_pilot_confirmed, no_payment_confirmed, content_authority_confirmed
       FROM pilot_agreements WHERE institution_id = ? LIMIT 1`,
  ).bind(id).first();
  return success(mapAgreement(row));
}

async function savePilotAgreement(request, env, institutionId) {
  const user = await authenticate(request, env);
  const id = assertInstitutionId(institutionId);
  await requireMembership(env, user.id, id, MANAGE_ROLES);
  const payload = await readJson(request);
  if (typeof payload.accepted !== "boolean") {
    throw new ValidationError("invalid_agreement", "accepted 항목은 true 또는 false여야 합니다.");
  }
  const contactRole = agreementString(payload.contactRole, "담당자 역할", 120);
  const notes = agreementString(payload.notes, "협약 메모", 1000);
  const agreementVersion = payload.agreementVersion ?? payload.version;
  if (
    payload.accepted &&
    (
      agreementVersion !== PILOT_AGREEMENT_VERSION ||
      payload.freePilot !== true ||
      payload.noPayment !== true ||
      payload.contentAuthority !== true
    )
  ) {
    throw new ValidationError(
      "pilot_confirmations_required",
      "현재 시범운영 협약과 무료 운영·비결제·콘텐츠 권한 항목에 모두 동의해야 합니다.",
    );
  }
  if (payload.accepted) {
    await env.DB.prepare(
      `INSERT INTO pilot_agreements
         (institution_id, status, agreement_version, accepted_by, accepted_at,
          withdrawn_by, withdrawn_at, contact_role, notes, free_pilot_confirmed,
          no_payment_confirmed, content_authority_confirmed, no_billing_commitment,
          created_at, updated_at)
       VALUES (?, 'accepted', ?, ?, datetime('now'), NULL, NULL, ?, ?, 1, 1, 1, 1,
               datetime('now'), datetime('now'))
       ON CONFLICT(institution_id) DO UPDATE SET
          status = 'accepted', agreement_version = excluded.agreement_version,
          accepted_by = excluded.accepted_by, accepted_at = excluded.accepted_at,
          withdrawn_by = NULL, withdrawn_at = NULL,
          contact_role = excluded.contact_role, notes = excluded.notes,
          free_pilot_confirmed = 1, no_payment_confirmed = 1,
          content_authority_confirmed = 1, no_billing_commitment = 1,
          updated_at = datetime('now')`,
    ).bind(id, PILOT_AGREEMENT_VERSION, user.id, contactRole, notes).run();
  } else {
    const withdrawal = await env.DB.prepare(
      `UPDATE pilot_agreements
          SET status = 'withdrawn', withdrawn_by = ?, withdrawn_at = datetime('now'),
              updated_at = datetime('now')
        WHERE institution_id = ? AND status = 'accepted'`,
    ).bind(user.id, id).run();
    if (affectedRows(withdrawal) !== 1) {
      throw new HttpError(409, "pilot_agreement_not_accepted", "동의한 시범운영 협약이 없어 철회할 수 없습니다.");
    }
  }
  const agreement = await env.DB.prepare(
    `SELECT status, agreement_version, accepted_by, accepted_at, withdrawn_by, withdrawn_at, contact_role, notes,
            free_pilot_confirmed, no_payment_confirmed, content_authority_confirmed
       FROM pilot_agreements WHERE institution_id = ? LIMIT 1`,
  ).bind(id).first();
  return success(mapAgreement(agreement));
}

async function routeRequest(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && !isAllowedOrigin(
    origin,
    env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS,
    env.DEV_ALLOWED_ORIGIN || "",
  )) {
    throw new HttpError(403, "origin_not_allowed", "허용되지 않은 요청 출처입니다.");
  }
  if (request.method === "OPTIONS") return corsPreflight(request, env);
  if (request.method === "GET" && url.pathname === "/health") {
    return success({ service: "homecare-pilot", status: "ok", billingEnabled: false });
  }

  let match;
  if (
    request.method === "GET" &&
    (match = url.pathname.match(/^\/api\/public\/institutions\/([^/]+)\/photos\/([^/]+)$/))
  ) {
    return servePublicPhoto(env, decodeURIComponent(match[1]), decodeURIComponent(match[2]));
  }
  if (
    request.method === "GET" &&
    (match = url.pathname.match(/^\/api\/institutions\/([^/]+)\/photos\/([^/]+)\/content$/))
  ) {
    return servePrivatePhoto(
      request,
      env,
      decodeURIComponent(match[1]),
      decodeURIComponent(match[2]),
    );
  }
  if (
    request.method === "GET" &&
    (match = url.pathname.match(/^\/api\/public\/institutions\/([^/]+)$/))
  ) {
    return getPublicInstitution(env, decodeURIComponent(match[1]));
  }
  if (request.method === "POST" && url.pathname === "/api/public/events") {
    return recordPublicEvent(request, env);
  }
  if (request.method === "GET" && url.pathname === "/api/institutions/me") {
    return listMyInstitutions(request, env);
  }
  if (request.method === "POST" && url.pathname === "/api/institutions/claim") {
    return claimInstitution(request, env);
  }

  if (
    request.method === "PUT" &&
    (match = url.pathname.match(/^\/api\/institutions\/([^/]+)\/profile$/))
  ) {
    return replaceProfile(request, env, decodeURIComponent(match[1]));
  }
  if (
    request.method === "POST" &&
    (match = url.pathname.match(/^\/api\/institutions\/([^/]+)\/programs$/))
  ) {
    return createProgram(request, env, decodeURIComponent(match[1]));
  }
  if (
    ["PATCH", "DELETE"].includes(request.method) &&
    (match = url.pathname.match(/^\/api\/institutions\/([^/]+)\/programs\/([^/]+)$/))
  ) {
    const [institutionId, programId] = [decodeURIComponent(match[1]), decodeURIComponent(match[2])];
    return request.method === "PATCH"
      ? updateProgram(request, env, institutionId, programId)
      : deleteProgram(request, env, institutionId, programId);
  }
  if (
    request.method === "POST" &&
    (match = url.pathname.match(/^\/api\/institutions\/([^/]+)\/photos$/))
  ) {
    return uploadPhoto(request, env, decodeURIComponent(match[1]));
  }
  if (
    ["PATCH", "DELETE"].includes(request.method) &&
    (match = url.pathname.match(/^\/api\/institutions\/([^/]+)\/photos\/([^/]+)$/))
  ) {
    const [institutionId, photoId] = [decodeURIComponent(match[1]), decodeURIComponent(match[2])];
    return request.method === "PATCH"
      ? updatePhoto(request, env, institutionId, photoId)
      : deletePhoto(request, env, institutionId, photoId);
  }
  if (
    request.method === "POST" &&
    (match = url.pathname.match(/^\/api\/institutions\/([^/]+)\/submit$/))
  ) {
    return submitInstitution(request, env, decodeURIComponent(match[1]));
  }
  if (
    request.method === "GET" &&
    (match = url.pathname.match(/^\/api\/institutions\/([^/]+)\/stats$/))
  ) {
    return getStats(request, env, decodeURIComponent(match[1]), url);
  }
  if (
    ["GET", "POST"].includes(request.method) &&
    (match = url.pathname.match(/^\/api\/institutions\/([^/]+)\/pilot-agreement$/))
  ) {
    const institutionId = decodeURIComponent(match[1]);
    return request.method === "GET"
      ? getPilotAgreement(request, env, institutionId)
      : savePilotAgreement(request, env, institutionId);
  }

  throw new HttpError(404, "route_not_found", "요청한 API를 찾을 수 없습니다.");
}

export async function handleRequest(request, env) {
  let response;
  try {
    response = await routeRequest(request, env);
  } catch (error) {
    response = failure(error);
  }
  return applyResponseHeaders(response, request, env);
}

export async function handleScheduled(env) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM event_dedup WHERE day < date('now', '+9 hours', '-8 days')"),
    env.DB.prepare(
      "DELETE FROM institution_invites WHERE claimed_at IS NULL AND julianday(expires_at) < julianday('now', '-30 days')",
    ),
  ]);
  const pending = await env.DB.prepare(
    `SELECT r2_key FROM r2_deletion_queue
      ORDER BY created_at ASC
      LIMIT 50`,
  ).all();
  for (const item of resultRows(pending)) {
    try {
      await fileStorage(env, 'PHOTOS').delete(item.r2_key); // SOFTM-SUPABASE-STORAGE 날짜:20261121 : 공급자와 무관하게 실제 삭제 성공 후 대기열 제거
      await env.DB.prepare("DELETE FROM r2_deletion_queue WHERE r2_key = ?").bind(item.r2_key).run();
    } catch {
      await env.DB.prepare(
        `UPDATE r2_deletion_queue
            SET attempts = attempts + 1, last_attempt_at = datetime('now')
          WHERE r2_key = ?`,
      ).bind(item.r2_key).run();
    }
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
  scheduled(_controller, env, context) {
    context.waitUntil(handleScheduled(env));
  },
};

/** SOFTM-HOMECARE-PILOT END */
