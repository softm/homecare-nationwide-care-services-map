import assert from "node:assert/strict";
import test from "node:test";
import {
  ValidationError,
  buildVisitorCookie,
  createDailyVisitorHash,
  detectImageType,
  expandDailyStats,
  extractSessionUser,
  isAllowedOrigin,
  parseStatsRange,
  parseVisitorCookie,
  toServiceDateString,
  validatePhotoBytes,
  validateProfilePayload,
  validateVisitorId,
} from "../src/core.mjs";

/** SOFTM-HOMECARE-PILOT START 날짜:20261118 : 입력·파일·출처·익명 집계의 보안 경계를 회귀검사 */

test("운영 Origin과 명시한 로컬 Origin만 허용한다", () => {
  const origins = "https://homecare.designboard.net,https://softm.github.io";
  assert.equal(isAllowedOrigin("https://homecare.designboard.net", origins), true);
  assert.equal(isAllowedOrigin("https://softm.github.io", origins), true);
  assert.equal(isAllowedOrigin("http://localhost:3000", origins, "http://localhost:3000"), true);
  assert.equal(isAllowedOrigin("http://localhost:8787", origins, "http://localhost:3000"), false);
  assert.equal(isAllowedOrigin("https://homecare.designboard.net.evil.example", origins), false);
});

test("공통 계정 응답은 homecare site와 uid를 모두 확인한다", () => {
  assert.deepEqual(extractSessionUser({ uid: "user-1", site: "homecare" }), {
    id: "user-1",
    site: "homecare",
    email: "",
    name: "",
  });
  assert.equal(extractSessionUser({ uid: "user-1", site: "other" }), null);
  assert.equal(extractSessionUser({ uid: "user-1" }), null);
});

test("기관 프로필과 프로그램을 정규화한다", () => {
  const profile = validateProfilePayload({
    displayName: " 햇살요양원 ",
    summary: "소개",
    website: "https://example.com/path",
    capacity: 30,
    availableSlots: 2,
    operatingHours: { monday: "09:00-18:00" },
    programs: [{ title: "인지 활동", active: true }],
  });
  assert.equal(profile.displayName, "햇살요양원");
  assert.equal(profile.programs[0].title, "인지 활동");
  assert.equal(profile.operatingHoursJson, '{"monday":"09:00-18:00"}');
});

test("실행 가능한 URL 체계와 과도한 프로그램 입력을 거부한다", () => {
  assert.throws(
    () => validateProfilePayload({}),
    /기관명이 필요합니다/,
  );
  assert.throws(
    () => validateProfilePayload({ displayName: "햇살요양원" }),
    /운영정보를 한 항목 이상/,
  );
  assert.throws(
    () => validateProfilePayload({ website: "javascript:alert(1)" }),
    ValidationError,
  );
  assert.throws(
    () => validateProfilePayload({ programs: Array.from({ length: 11 }, () => ({ title: "활동" })) }),
    /최대 10개/,
  );
  assert.throws(
    () => validateProfilePayload({ website: "http://example.com" }),
    /https 주소만/,
  );
  assert.throws(
    () => validateProfilePayload({ website: "https://user:secret@example.com" }),
    /로그인정보가 없는/,
  );
});

test("JPEG PNG WebP는 실제 시그니처로 판별한다", () => {
  assert.equal(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00])).mime, "image/jpeg");
  assert.equal(
    detectImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).mime,
    "image/png",
  );
  assert.equal(
    detectImageType(Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])).mime,
    "image/webp",
  );
});

test("표시 MIME과 실제 파일 시그니처 불일치를 거부한다", () => {
  assert.throws(
    () => validatePhotoBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]), "image/png", 100),
    /일치하지 않습니다/,
  );
  assert.throws(
    () => validatePhotoBytes(new Uint8Array(101).fill(1), "image/jpeg", 100),
    /이하여야 합니다/,
  );
});

test("7일 30일과 최대 366일 직접 통계 기간을 계산한다", () => {
  const seven = parseStatsRange(new URLSearchParams("days=7"), new Date("2026-11-18T12:00:00Z"));
  assert.deepEqual(seven, { from: "2026-11-12", to: "2026-11-18", days: 7, preset: "7d" });
  const custom = parseStatsRange(
    new URLSearchParams("from=2026-11-01&to=2026-11-18"),
    new Date("2026-11-18T12:00:00Z"),
  );
  assert.equal(custom.days, 18);
  assert.throws(
    () => parseStatsRange(new URLSearchParams("days=14"), new Date("2026-11-18T12:00:00Z")),
    /7일 또는 30일/,
  );
});

test("일별 집계 기준일은 한국시간 자정에 바뀐다", () => {
  assert.equal(toServiceDateString(new Date("2026-11-17T14:59:59.999Z")), "2026-11-17");
  assert.equal(toServiceDateString(new Date("2026-11-17T15:00:00.000Z")), "2026-11-18");
  const range = parseStatsRange(
    new URLSearchParams("days=7"),
    new Date("2026-11-17T15:00:00.000Z"),
  );
  assert.deepEqual(range, { from: "2026-11-12", to: "2026-11-18", days: 7, preset: "7d" });
});

test("통계 응답은 빈 날짜와 네 가지 행동을 0으로 채운다", () => {
  const stats = expandDailyStats(
    [{ day: "2026-11-17", event_type: "detail_view", count: 3 }],
    { from: "2026-11-17", to: "2026-11-18", days: 2, preset: "custom" },
  );
  assert.equal(stats.daily.length, 2);
  assert.equal(stats.daily[0].detail_view, 3);
  assert.equal(stats.daily[1].detail_view, 0);
  assert.equal(stats.totals.phone_click, 0);
});

test("방문자 해시는 날짜·기관·행동마다 달라 원본 식별자를 저장할 필요가 없다", async () => {
  const base = {
    secret: "01234567890123456789012345678901",
    visitorId: "anonymous-browser-token-123456",
    day: "2026-11-18",
    institutionId: "24119001267",
    eventType: "detail_view",
  };
  const first = await createDailyVisitorHash(base);
  const repeated = await createDailyVisitorHash(base);
  const anotherDay = await createDailyVisitorHash({ ...base, day: "2026-11-19" });
  assert.equal(first, repeated);
  assert.notEqual(first, anotherDay);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first.includes(base.visitorId), false);
});

test("익명 방문 쿠키를 발급하고 다시 읽는다", () => {
  const cookie = buildVisitorCookie("abcdefghijklmnopqrstuvwx", "https://homecare.designboard.net/api");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.equal(parseVisitorCookie("foo=1; hc_visit=abcdefghijklmnopqrstuvwx; bar=2"), "abcdefghijklmnopqrstuvwx");
});

test("교차 Origin용 익명 방문 식별자는 base64url 20~80자만 허용한다", () => {
  assert.equal(validateVisitorId("abcdefghijklmnopqrstuvwx"), "abcdefghijklmnopqrstuvwx");
  assert.throws(() => validateVisitorId("short"), /올바르지 않습니다/);
  assert.throws(() => validateVisitorId("abcdefghijklmnopqrstuv!"), /올바르지 않습니다/);
});

/** SOFTM-HOMECARE-PILOT END */
