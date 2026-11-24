import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.mjs";

/** SOFTM-HOMECARE-PILOT START 날짜:20261118 : 서비스 바인딩 인증·신청 대기·명시 게시 경계를 API 수준에서 검증 */

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    this.db.calls.push({ kind: "bind", sql: this.sql, args });
    return this;
  }

  async first() {
    return this.db.resolve("first", this.sql, this.args);
  }

  async all() {
    return this.db.resolve("all", this.sql, this.args);
  }

  async run() {
    return this.db.resolve("run", this.sql, this.args);
  }
}

class FakeDB {
  constructor(resolver = () => null) {
    this.resolver = resolver;
    this.calls = [];
    this.batches = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  resolve(kind, sql, args) {
    const value = this.resolver(kind, sql, args);
    if (value !== undefined && value !== null) return value;
    if (kind === "all") return { results: [] };
    if (kind === "run") return { meta: { changes: 1 } };
    return null;
  }

  async batch(statements) {
    this.batches.push(statements.map((statement) => ({ sql: statement.sql, args: statement.args })));
    return statements.map(() => ({ meta: { changes: 1 } }));
  }
}

function makeEnv(db = new FakeDB(), accountPayload = { uid: "user-1", site: "homecare" }) {
  const accountRequests = [];
  return {
    env: {
      DB: db,
      PHOTOS: { get: async () => null, put: async () => {}, delete: async () => {} },
      ACCOUNT: {
        async fetch(request) {
          accountRequests.push(request);
          return Response.json(accountPayload);
        },
      },
      ALLOWED_ORIGINS: "https://dolbomhannun.kr,https://softm.github.io",
      DEV_ALLOWED_ORIGIN: "http://localhost:3000",
      EVENT_HASH_SECRET: "01234567890123456789012345678901",
    },
    accountRequests,
  };
}

function authHeaders(origin = "https://dolbomhannun.kr") {
  return { Origin: origin, Authorization: "Bearer test-token" };
}

test("허용 Origin의 상태 응답에 CORS와 결제 비활성 상태를 표시한다", async () => {
  const { env } = makeEnv();
  const response = await worker.fetch(new Request("https://dolbomhannun.kr/health", {
    headers: { Origin: "https://softm.github.io" },
  }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://softm.github.io");
  assert.equal((await response.json()).data.billingEnabled, false);
});

test("부분 일치 도메인은 CORS 이전에 거부한다", async () => {
  const { env } = makeEnv();
  const response = await worker.fetch(new Request("https://dolbomhannun.kr/health", {
    headers: { Origin: "https://dolbomhannun.kr.evil.example" },
  }), env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "origin_not_allowed");
});

test("CORS preflight는 콘텐츠 동시성 If-Match 헤더를 허용한다", async () => {
  const { env } = makeEnv();
  const response = await worker.fetch(new Request("https://dolbomhannun.kr/api/institutions/me", {
    method: "OPTIONS",
    headers: {
      Origin: "https://dolbomhannun.kr",
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "Authorization, Content-Type, If-Match",
    },
  }), env);
  assert.equal(response.status, 204);
  assert.match(response.headers.get("Access-Control-Allow-Headers") || "", /If-Match/);
});

test("계정 서비스 바인딩에 실제 Origin과 Bearer를 전달한다", async () => {
  const db = new FakeDB();
  const { env, accountRequests } = makeEnv(db);
  const response = await worker.fetch(new Request("https://dolbomhannun.kr/api/institutions/me", {
    headers: authHeaders(),
  }), env);
  assert.equal(response.status, 200);
  assert.equal(accountRequests.length, 1);
  assert.equal(accountRequests[0].url, "https://account.internal/api/apps/homecare/session");
  assert.equal(accountRequests[0].headers.get("Origin"), "https://dolbomhannun.kr");
  assert.equal(accountRequests[0].headers.get("Authorization"), "Bearer test-token");
  const body = await response.json();
  assert.deepEqual(body.data.institutions, []);
  assert.deepEqual(body.data.pendingClaims, []);
});

test("다른 site의 계정 세션은 기관 API 권한으로 사용하지 않는다", async () => {
  const { env } = makeEnv(new FakeDB(), { uid: "user-1", site: "another-site" });
  const response = await worker.fetch(new Request("https://dolbomhannun.kr/api/institutions/me", {
    headers: authHeaders(),
  }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "invalid_session");
});

test("일반 기관 신청은 pending으로만 저장하고 권한을 부여하지 않는다", async () => {
  const db = new FakeDB((kind, sql) => {
    if (kind === "first" && sql.includes("FROM institution_claims")) {
      return {
        id: "claim-1",
        institution_id: "24119001267",
        institution_name: "햇살요양원",
        status: "pending",
        contact_name: "담당자",
        contact_email: "owner@example.com",
        contact_phone: "02-123-4567",
        note: "시범 참여",
        revision: 1,
        created_at: "2026-11-18 00:00:00",
        updated_at: "2026-11-18 00:00:00",
      };
    }
    return null;
  });
  const { env } = makeEnv(db);
  const response = await worker.fetch(new Request("https://dolbomhannun.kr/api/institutions/claim", {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      institutionId: "24119001267",
      institutionName: "햇살요양원",
      contactName: "담당자",
      contactEmail: "owner@example.com",
      contactPhone: "02-123-4567",
      note: "시범 참여",
      truthful: true,
    }),
  }), env);
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.data.accessGranted, false);
  assert.equal(body.data.claim.status, "pending");
  assert.equal(body.data.claim.institutionName, "햇살요양원");
  assert.equal(body.data.claim.revision, 1);
  const batchSql = db.batches.flat().map((entry) => entry.sql).join("\n");
  assert.match(batchSql, /INSERT INTO institution_claims/);
  assert.match(batchSql, /revision = institution_claims\.revision \+ 1/);
  assert.match(batchSql, /WHERE institution_claims\.status <> 'approved'/);
  assert.doesNotMatch(batchSql, /institution_memberships/);
});

test("일반 기관 신청은 공단 기관기호 11자리만 허용한다", async () => {
  const db = new FakeDB();
  const { env } = makeEnv(db);
  const response = await worker.fetch(new Request("https://dolbomhannun.kr/api/institutions/claim", {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      institutionId: "arbitrary-id",
      institutionName: "임의 기관",
      contactName: "담당자",
      contactEmail: "owner@example.com",
      contactPhone: "02-123-4567",
      truthful: true,
    }),
  }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "invalid_institution_id");
  assert.equal(db.batches.length, 0);
});

test("프로필 저장은 게시 상태를 draft로 되돌린 뒤 명시 게시를 기다린다", async () => {
  const db = new FakeDB((kind, sql) => {
    if (kind === "first" && sql.includes("FROM institution_memberships")) {
      return {
        institution_id: "24119001267",
        user_id: "user-1",
        role: "owner",
        status: "approved",
        institution_status: "published",
      };
    }
    if (kind === "first" && sql.includes("FROM institutions i")) {
      return { id: "24119001267", name: "햇살요양원", status: "draft", content_revision: 2 };
    }
    if (kind === "all" && sql.includes("FROM institution_photos")) {
      return {
        results: [{
          id: "photo-1",
          content_type: "image/jpeg",
          size_bytes: 10,
          caption: "현관",
          alt_text: "기관 현관",
          sort_order: 0,
          is_cover: 1,
          is_published: 1,
          created_at: "2026-11-18 00:00:00",
          updated_at: "2026-11-18 00:00:00",
        }],
      };
    }
    if (kind === "all") return { results: [] };
    return null;
  });
  const { env } = makeEnv(db);
  const response = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/24119001267/profile",
    {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json", "If-Match": '"1"' },
      body: JSON.stringify({ displayName: "햇살요양원", summary: "운영 소개", programs: [] }),
    },
  ), env);
  assert.equal(response.status, 200);
  const batchSql = db.batches.flat().map((entry) => entry.sql).join("\n");
  assert.match(batchSql, /status = 'draft'/);
  assert.match(batchSql, /published_at = NULL/);
  assert.match(db.batches[0][0].sql, /content_revision = CASE WHEN content_revision = \?/);
  assert.doesNotMatch(batchSql, /SET name =/);
  const body = await response.json();
  assert.equal(body.data.contentRevision, 2);
  assert.equal(
    body.data.photos[0].previewPath,
    "/api/institutions/24119001267/photos/photo-1/content",
  );
});

test("콘텐츠 변경은 If-Match가 없거나 stale이면 409 content_conflict로 중단한다", async () => {
  const membership = {
    institution_id: "24119001267",
    user_id: "user-1",
    role: "owner",
    status: "approved",
    institution_status: "published",
  };
  const missingDb = new FakeDB((kind, sql) => (
    kind === "first" && sql.includes("FROM institution_memberships") ? membership : null
  ));
  const { env: missingEnv } = makeEnv(missingDb);
  const missing = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/24119001267/profile",
    {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "햇살요양원", summary: "운영 소개" }),
    },
  ), missingEnv);
  assert.equal(missing.status, 409);
  assert.equal((await missing.json()).error.code, "content_conflict");
  assert.equal(missingDb.batches.length, 0);

  const staleDb = new FakeDB((kind, sql) => (
    kind === "first" && sql.includes("FROM institution_memberships") ? membership : null
  ));
  staleDb.batch = async () => {
    throw new Error("CHECK constraint failed: content_revision_positive");
  };
  const { env: staleEnv } = makeEnv(staleDb);
  const stale = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/24119001267/profile",
    {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json", "If-Match": '"1"' },
      body: JSON.stringify({ displayName: "햇살요양원", summary: "충돌 내용" }),
    },
  ), staleEnv);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, "content_conflict");
});

test("운영 중지 기관의 승인된 담당자도 수정·재게시할 수 없다", async () => {
  const db = new FakeDB((kind, sql) => {
    if (kind === "first" && sql.includes("FROM institution_memberships")) {
      return {
        institution_id: "24119001267",
        user_id: "user-1",
        role: "owner",
        status: "approved",
        institution_status: "suspended",
      };
    }
    return null;
  });
  const { env } = makeEnv(db);
  const response = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/24119001267/profile",
    {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "중지된 기관", programs: [] }),
    },
  ), env);
  assert.equal(response.status, 423);
  assert.equal((await response.json()).error.code, "institution_suspended");
  assert.equal(db.batches.length, 0);
});

test("공개 행동은 익명 해시만 D1에 저장하고 일별 중복을 집계한다", async () => {
  const db = new FakeDB((kind, sql) => {
    if (kind === "first" && sql.includes("status = 'published'")) return { id: "24119001267" };
    if (kind === "run" && sql.includes("event_dedup")) return { meta: { changes: 1 } };
    if (kind === "run") return { meta: { changes: 1 } };
    return null;
  });
  const { env } = makeEnv(db);
  const response = await worker.fetch(new Request("https://dolbomhannun.kr/api/public/events", {
    method: "POST",
    headers: { Origin: "https://dolbomhannun.kr", "Content-Type": "application/json" },
    body: JSON.stringify({
      institutionId: "24119001267",
      type: "detail_view",
      visitorId: "abcdefghijklmnopqrstuvwx",
    }),
  }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Set-Cookie"), null);
  const dedupeBind = db.calls.find((call) => call.sql.includes("INSERT OR IGNORE INTO event_dedup"));
  assert.match(dedupeBind.args[3], /^[a-f0-9]{64}$/);
  assert.equal(dedupeBind.args.some((value) => String(value).includes("127.0.0.1")), false);
});

test("공개 행동 기록은 Origin 없는 서버 직접 호출을 거부한다", async () => {
  const { env } = makeEnv(new FakeDB());
  const response = await worker.fetch(new Request("https://dolbomhannun.kr/api/public/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      institutionId: "24119001267",
      type: "detail_view",
      visitorId: "abcdefghijklmnopqrstuvwx",
    }),
  }), env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "origin_required");
});

test("공개 기관 응답에는 인증 미리보기 경로를 노출하지 않는다", async () => {
  const db = new FakeDB((kind, sql) => {
    if (kind === "first" && sql.includes("FROM institutions i")) {
      return { id: "24119001267", name: "햇살요양원", status: "published" };
    }
    if (kind === "all" && sql.includes("FROM institution_photos")) {
      return {
        results: [{
          id: "photo-1",
          content_type: "image/jpeg",
          size_bytes: 2,
          caption: "",
          alt_text: "",
          sort_order: 0,
          is_cover: 1,
          is_published: 1,
          created_at: "2026-11-18 00:00:00",
          updated_at: "2026-11-18 00:00:00",
        }],
      };
    }
    if (kind === "all") return { results: [] };
    return null;
  });
  const { env } = makeEnv(db);
  const response = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/public/institutions/24119001267",
    { headers: { Origin: "https://dolbomhannun.kr" } },
  ), env);
  assert.equal(response.status, 200);
  const publicData = (await response.json()).data;
  const photo = publicData.photos[0];
  assert.equal(photo.url, "/api/public/institutions/24119001267/photos/photo-1");
  assert.equal("previewPath" in photo, false);
  assert.equal("contentRevision" in publicData, false);
});

test("draft 사진은 인증·멤버십 확인 뒤 no-store Blob으로 미리본다", async () => {
  const db = new FakeDB((kind, sql) => {
    if (kind === "first" && sql.includes("FROM institution_memberships")) {
      return {
        institution_id: "24119001267",
        user_id: "user-1",
        role: "owner",
        status: "approved",
        institution_status: "draft",
      };
    }
    if (kind === "first" && sql.includes("SELECT r2_key, content_type")) {
      return { r2_key: "institutions/24119001267/photo-1.jpg", content_type: "image/jpeg", size_bytes: 2 };
    }
    return null;
  });
  const { env } = makeEnv(db);
  env.PHOTOS.get = async () => ({ body: Uint8Array.from([0xff, 0xd8]), httpEtag: '"etag-1"' });
  const response = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/24119001267/photos/photo-1/content",
    { headers: authHeaders() },
  ), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Content-Type"), "image/jpeg");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0xff, 0xd8]);
});

test("사진 업로드는 환경값과 무관하게 요청 크기를 5 MiB 상한으로 조기 차단한다", async () => {
  const db = new FakeDB((kind, sql) => {
    if (kind === "first" && sql.includes("FROM institution_memberships")) {
      return {
        institution_id: "24119001267",
        user_id: "user-1",
        role: "owner",
        status: "approved",
        institution_status: "draft",
      };
    }
    return null;
  });
  const { env } = makeEnv(db);
  env.MAX_PHOTO_BYTES = String(100 * 1024 * 1024);
  const response = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/24119001267/photos",
    {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "multipart/form-data; boundary=test",
        "Content-Length": String(6 * 1024 * 1024),
        "If-Match": '"1"',
      },
      body: "--test--",
    },
  ), env);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "payload_too_large");
});

test("R2 사진 객체는 공개 캐시를 허용하지 않고 인증 응답에 previewPath를 준다", async () => {
  const db = new FakeDB((kind, sql, args) => {
    if (kind === "first" && sql.includes("FROM institution_memberships")) {
      return {
        institution_id: "24119001267",
        user_id: "user-1",
        role: "owner",
        status: "approved",
        institution_status: "draft",
      };
    }
    if (kind === "first" && sql.includes("COUNT(*) AS count")) return { count: 0 };
    if (kind === "first" && sql.includes("FROM institution_photos WHERE id")) {
      return {
        id: args[0],
        content_type: "image/jpeg",
        size_bytes: 3,
        caption: "기관 전경",
        alt_text: "기관 전경",
        sort_order: 0,
        is_cover: 1,
        is_published: 1,
        created_at: "2026-11-18 00:00:00",
        updated_at: "2026-11-18 00:00:00",
      };
    }
    return null;
  });
  const { env } = makeEnv(db);
  const puts = [];
  env.PHOTOS.put = async (...args) => puts.push(args);
  const form = new FormData();
  form.set("photo", new Blob([Uint8Array.from([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), "front.jpg");
  form.set("caption", "기관 전경");
  form.set("altText", "기관 전경");
  form.set("isCover", "true");
  const response = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/24119001267/photos",
    { method: "POST", headers: { ...authHeaders(), "If-Match": '"1"' }, body: form },
  ), env);
  assert.equal(response.status, 201);
  assert.equal(puts.length, 1);
  assert.equal(puts[0][2].httpMetadata.cacheControl, "private, no-store");
  const uploaded = (await response.json()).data;
  assert.match(uploaded.previewPath, /\/photos\/[^/]+\/content$/);
  assert.equal(uploaded.contentRevision, 2);
});

test("업로드 D1 실패 뒤 R2 정리도 실패하면 queue를 시도하고 원래 충돌을 보존한다", async () => {
  const db = new FakeDB((kind, sql) => {
    if (kind === "first" && sql.includes("FROM institution_memberships")) {
      return {
        institution_id: "24119001267",
        user_id: "user-1",
        role: "owner",
        status: "approved",
        institution_status: "draft",
      };
    }
    if (kind === "first" && sql.includes("COUNT(*) AS count")) return { count: 0 };
    if (kind === "run" && sql.includes("INSERT INTO r2_deletion_queue")) {
      throw new Error("D1 unavailable during orphan enqueue");
    }
    return null;
  });
  db.batch = async () => {
    throw new Error("CHECK constraint failed: content_revision_positive");
  };
  const { env } = makeEnv(db);
  let deleteAttempts = 0;
  env.PHOTOS.put = async () => {};
  env.PHOTOS.delete = async () => {
    deleteAttempts += 1;
    throw new Error("R2 delete unavailable");
  };
  const form = new FormData();
  form.set("photo", new Blob([Uint8Array.from([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), "orphan.jpg");
  const response = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/24119001267/photos",
    { method: "POST", headers: { ...authHeaders(), "If-Match": '"1"' }, body: form },
  ), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "content_conflict");
  assert.equal(deleteAttempts, 1);
  assert.equal(
    db.calls.some((call) => call.sql.includes("INSERT INTO r2_deletion_queue")),
    true,
  );
});

test("공개하기는 D1 트리거 합산 변경 건수를 허용하고 stale If-Match는 거부한다", async () => {
  const membership = {
    institution_id: "24119001267",
    user_id: "user-1",
    role: "owner",
    status: "approved",
    institution_status: "draft",
  };
  const db = new FakeDB((kind, sql) => {
    if (kind === "first" && sql.includes("FROM institution_memberships")) return membership;
    if (kind === "run" && sql.includes("SET status = 'published'")) return { meta: { changes: 2 } }; // SOFTM-D1-TRIGGER 날짜:20261121 : 운영 D1의 기관·확인일 두 행 갱신을 재현
    if (kind === "first" && sql.includes("FROM institutions i")) {
      return {
        id: "24119001267",
        name: "햇살요양원",
        status: "published",
        content_revision: 2,
      };
    }
    if (kind === "first" && sql.includes("FROM pilot_agreements")) {
      return {
        status: "accepted",
        agreement_version: "homecare-pilot-20261118-v1",
        free_pilot_confirmed: 1,
        no_payment_confirmed: 1,
        content_authority_confirmed: 1,
      };
    }
    return null;
  });
  const { env } = makeEnv(db);
  const published = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/24119001267/submit",
    { method: "POST", headers: { ...authHeaders(), "If-Match": '"1"' } },
  ), env);
  assert.equal(published.status, 200);
  assert.equal((await published.json()).data.contentRevision, 2);
  const publishSql = db.calls.find((call) => call.sql.includes("SET status = 'published'"))?.sql || "";
  assert.match(publishSql, /content_revision = content_revision \+ 1/);
  assert.match(publishSql, /content_revision = \?/);

  const staleDb = new FakeDB((kind, sql) => {
    if (kind === "first" && sql.includes("FROM institution_memberships")) return membership;
    if (kind === "run" && sql.includes("UPDATE institutions")) return { meta: { changes: 0 } };
    if (kind === "first" && sql.includes("SELECT i.status, i.content_revision")) {
      return { status: "draft", content_revision: 2, has_agreement: 1, has_profile: 1 };
    }
    return null;
  });
  const { env: staleEnv } = makeEnv(staleDb);
  const stale = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/24119001267/submit",
    { method: "POST", headers: { ...authHeaders(), "If-Match": '"1"' } },
  ), staleEnv);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, "content_conflict");
});

test("시범운영 동의는 frontend 버전과 세 가지 확인을 모두 요구한다", async () => {
  const db = new FakeDB((kind, sql) => {
    if (kind === "first" && sql.includes("FROM institution_memberships")) {
      return {
        institution_id: "24119001267",
        user_id: "user-1",
        role: "owner",
        status: "approved",
        institution_status: "draft",
      };
    }
    if (kind === "first" && sql.includes("FROM pilot_agreements")) {
      return {
        status: "accepted",
        agreement_version: "homecare-pilot-20261118-v1",
        free_pilot_confirmed: 1,
        no_payment_confirmed: 1,
        content_authority_confirmed: 1,
      };
    }
    return null;
  });
  const { env } = makeEnv(db);
  const invalid = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/24119001267/pilot-agreement",
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ accepted: true, version: "homecare-pilot-20261118-v1" }),
    },
  ), env);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, "pilot_confirmations_required");

  const valid = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/24119001267/pilot-agreement",
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        accepted: true,
        version: "homecare-pilot-20261118-v1",
        freePilot: true,
        noPayment: true,
        contentAuthority: true,
      }),
    },
  ), env);
  assert.equal(valid.status, 200);
  assert.deepEqual((await valid.json()).data.confirmations, {
    freePilot: true,
    noPayment: true,
    contentAuthority: true,
  });
});

test("협약 철회는 감사·비공개 트리거 합산에도 성공하고 수락 감사값을 보존한다", async () => {
  const db = new FakeDB((kind, sql) => {
    if (kind === "run" && sql.includes("UPDATE pilot_agreements")) return { meta: { changes: 3 } }; // SOFTM-D1-TRIGGER 날짜:20261121 : 협약·철회 감사·기관 비공개 갱신 합산을 재현
    if (kind === "first" && sql.includes("FROM institution_memberships")) {
      return {
        institution_id: "24119001267",
        user_id: "user-2",
        role: "owner",
        status: "approved",
        institution_status: "published",
      };
    }
    if (kind === "first" && sql.includes("FROM pilot_agreements")) {
      return {
        status: "withdrawn",
        agreement_version: "homecare-pilot-20261118-v1",
        accepted_by: "user-1",
        accepted_at: "2026-11-18 01:00:00",
        withdrawn_by: "user-2",
        withdrawn_at: "2026-11-18 02:00:00",
        contact_role: "센터장",
        notes: "최초 수락 메모",
        free_pilot_confirmed: 1,
        no_payment_confirmed: 1,
        content_authority_confirmed: 1,
      };
    }
    return null;
  });
  const { env } = makeEnv(db, { uid: "user-2", site: "homecare" });
  const response = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/24119001267/pilot-agreement",
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ accepted: false }),
    },
  ), env);
  assert.equal(response.status, 200);
  const data = (await response.json()).data;
  assert.equal(data.acceptedAt, "2026-11-18 01:00:00");
  assert.equal(data.withdrawnAt, "2026-11-18 02:00:00");
  assert.equal("acceptedBy" in data, false);
  assert.equal("withdrawnBy" in data, false);
  assert.deepEqual(data.confirmations, {
    freePilot: true,
    noPayment: true,
    contentAuthority: true,
  });
  const withdrawalSql = db.calls.find((call) => call.sql.includes("UPDATE pilot_agreements"))?.sql || "";
  assert.match(withdrawalSql, /withdrawn_by = \?/);
  assert.doesNotMatch(withdrawalSql, /accepted_by\s*=/);
  assert.doesNotMatch(withdrawalSql, /free_pilot_confirmed\s*=/);
  assert.doesNotMatch(withdrawalSql, /contact_role\s*=/);
});

test("수락 기록이 없는 협약 철회는 명시적인 409로 거부한다", async () => {
  const db = new FakeDB((kind, sql) => {
    if (kind === "first" && sql.includes("FROM institution_memberships")) {
      return {
        institution_id: "24119001267",
        user_id: "user-1",
        role: "owner",
        status: "approved",
        institution_status: "draft",
      };
    }
    if (kind === "run" && sql.includes("UPDATE pilot_agreements")) {
      return { meta: { changes: 0 } };
    }
    return null;
  });
  const { env } = makeEnv(db);
  const response = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/24119001267/pilot-agreement",
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ accepted: false }),
    },
  ), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "pilot_agreement_not_accepted");
});

test("사용한 초대 코드는 같은 사용자도 다시 사용할 수 없다", async () => {
  const db = new FakeDB((kind, sql) => {
    if (kind === "first" && sql.includes("FROM institution_invites")) {
      return {
        id: "invite-1",
        institution_id: "24119001267",
        role: "owner",
        expires_at: "2099-01-01T00:00:00.000Z",
        claimed_by: "user-1",
      };
    }
    return null;
  });
  const { env } = makeEnv(db);
  const response = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/claim",
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken: "abcdefghijklmnopqrstuvwxyz123456" }),
    },
  ), env);
  assert.equal(response.status, 410);
  assert.equal(db.batches.length, 0);
});

test("초대 권한 생성 후 한 번만 소비하며 기존 멤버십을 upsert하지 않는다", async () => {
  const db = new FakeDB((kind, sql) => {
    if (kind === "first" && sql.includes("FROM institution_invites")) {
      return {
        id: "invite-1",
        institution_id: "24119001267",
        role: "owner",
        expires_at: "2099-01-01T00:00:00.000Z",
        claimed_by: null,
      };
    }
    if (kind === "first" && sql.includes("FROM institution_memberships")) {
      return {
        institution_id: "24119001267",
        user_id: "user-1",
        role: "owner",
        status: "approved",
        institution_status: "draft",
      };
    }
    if (kind === "first" && sql.includes("FROM institutions i")) {
      return { id: "24119001267", name: "햇살요양원", status: "draft" };
    }
    if (kind === "all") return { results: [] };
    return null;
  });
  const { env } = makeEnv(db);
  const response = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/claim",
    {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken: "abcdefghijklmnopqrstuvwxyz123456" }),
    },
  ), env);
  assert.equal(response.status, 200);
  assert.match(db.batches[0][0].sql, /INSERT INTO institution_memberships/);
  assert.doesNotMatch(db.batches[0][0].sql, /ON CONFLICT/);
  assert.match(db.batches[0][1].sql, /UPDATE institution_invites/);
});

test("없는 프로그램 삭제는 revision을 올리거나 draft로 바꾸지 않는다", async () => {
  const db = new FakeDB((kind, sql) => {
    if (kind === "first" && sql.includes("FROM institution_memberships")) {
      return {
        institution_id: "24119001267",
        user_id: "user-1",
        role: "owner",
        status: "approved",
        institution_status: "published",
      };
    }
    return null;
  });
  const { env } = makeEnv(db);
  const response = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/24119001267/programs/missing-program",
    { method: "DELETE", headers: { ...authHeaders(), "If-Match": '"1"' } },
  ), env);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "program_not_found");
  assert.equal(db.batches.length, 0);
});

test("사진 삭제는 D1 삭제·draft·정리 대기열 뒤에 R2를 삭제한다", async () => {
  const order = [];
  const db = new FakeDB((kind, sql) => {
    if (kind === "first" && sql.includes("FROM institution_memberships")) {
      return {
        institution_id: "24119001267",
        user_id: "user-1",
        role: "owner",
        status: "approved",
        institution_status: "published",
      };
    }
    if (kind === "first" && sql.includes("SELECT r2_key FROM institution_photos")) {
      return { r2_key: "institutions/24119001267/photo-1.jpg" };
    }
    return null;
  });
  const originalBatch = db.batch.bind(db);
  db.batch = async (statements) => {
    order.push("d1");
    return originalBatch(statements);
  };
  const { env } = makeEnv(db);
  env.PHOTOS.delete = async () => order.push("r2");
  const response = await worker.fetch(new Request(
    "https://dolbomhannun.kr/api/institutions/24119001267/photos/photo-1",
    { method: "DELETE", headers: { ...authHeaders(), "If-Match": '"1"' } },
  ), env);
  assert.equal(response.status, 200);
  assert.deepEqual(order, ["d1", "r2"]);
  assert.equal((await response.json()).data.contentRevision, 2);
  const sql = db.batches[0].map((entry) => entry.sql).join("\n");
  assert.match(sql, /DELETE FROM institution_photos/);
  assert.match(sql, /status = 'draft'/);
  assert.match(sql, /INSERT INTO r2_deletion_queue/);
});

/** SOFTM-HOMECARE-PILOT END */
