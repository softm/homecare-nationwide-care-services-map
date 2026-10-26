/** SOFTM-FIREBASE-TEST START 날짜:20261026 : 기존 프록시 계약과 보안 경계를 배포 전에 고정 */
import assert from "node:assert/strict";
import {beforeEach, test} from "node:test";
import {createDirectionsHandler, resetRateLimitsForTest} from "../directions-core.js";

class FakeResponse {
  constructor() {
    this.headers = new Map();
    this.statusCode = 200;
    this.body = null;
    this.ended = false;
  }

  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), value);
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  json(value) {
    this.body = value;
    return this;
  }

  end() {
    this.ended = true;
    return this;
  }
}

function request(overrides = {}) {
  return {
    method: "POST",
    headers: {origin: "https://softm.github.io", "x-forwarded-for": "203.0.113.10"},
    ip: "203.0.113.10",
    body: {
      start: {lat: 37.48145, lng: 126.84805},
      goal: {lat: 37.4782, lng: 126.8644},
      waypoints: [],
      option: "traoptimal",
    },
    ...overrides,
  };
}

beforeEach(() => resetRateLimitsForTest());

test("허용 Origin의 preflight와 보안 헤더를 반환한다", async () => {
  const handler = createDirectionsHandler({fetchImpl: async () => assert.fail("upstream called"), getApiSecret: () => "secret"});
  const res = new FakeResponse();
  await handler(request({method: "OPTIONS", body: null}), res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://softm.github.io");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("허용되지 않은 Origin은 상류 호출 전에 거부한다", async () => {
  const handler = createDirectionsHandler({fetchImpl: async () => assert.fail("upstream called"), getApiSecret: () => "secret"});
  const res = new FakeResponse();
  await handler(request({headers: {origin: "https://example.com"}}), res);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /허용되지 않은/);
});

test("좌표와 경유지 입력을 검증한다", async () => {
  const handler = createDirectionsHandler({fetchImpl: async () => assert.fail("upstream called"), getApiSecret: () => "secret"});
  const res = new FakeResponse();
  await handler(request({body: {start: {lat: 0, lng: 0}, goal: {lat: 37.5, lng: 127}}}), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /좌표/);
});

test("기존 summary/path/section 응답 계약을 유지한다", async () => {
  const upstreamRoute = {
    summary: {distance: 1933, duration: 605927, tollFare: 0},
    path: [[126.84805, 37.48145], [126.8644, 37.4782]],
    section: [{distance: 1933}],
  };
  let requestedUrl = "";
  const handler = createDirectionsHandler({
    getApiSecret: () => "secret",
    createTimeoutSignal: () => undefined,
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      assert.equal(options.headers["x-ncp-apigw-api-key"], "secret");
      return {
        ok: true,
        status: 200,
        json: async () => ({code: 0, route: {traoptimal: [upstreamRoute]}}),
      };
    },
  });
  const res = new FakeResponse();
  await handler(request(), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, upstreamRoute);
  assert.match(requestedUrl, /option=traoptimal/);
  assert.match(requestedUrl, /start=126\.8480500%2C37\.4814500/);
});

test("비밀키 누락과 과도한 연속 요청을 명확히 구분한다", async () => {
  const missingSecret = createDirectionsHandler({fetchImpl: async () => assert.fail("upstream called"), getApiSecret: () => ""});
  const unavailable = new FakeResponse();
  await missingSecret(request(), unavailable);
  assert.equal(unavailable.statusCode, 503);

  resetRateLimitsForTest();
  const rateHandler = createDirectionsHandler({
    now: () => 1_000,
    getApiSecret: () => "secret",
    createTimeoutSignal: () => undefined,
    fetchImpl: async () => ({ok: true, status: 200, json: async () => ({code: 0, route: {traoptimal: [{summary: {}, path: [], section: []}]}})}),
  });
  for (let index = 0; index < 30; index += 1) await rateHandler(request(), new FakeResponse());
  const limited = new FakeResponse();
  await rateHandler(request(), limited);
  assert.equal(limited.statusCode, 429);
});
/** SOFTM-FIREBASE-TEST END */
