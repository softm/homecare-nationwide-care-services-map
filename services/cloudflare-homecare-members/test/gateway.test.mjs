/** SOFTM-MEMBER-DOMAIN START 날짜:20261121 : 공개 API 경유 시 내부 Bearer 인증 우회·쿠키 손실·파일 변형·캐시 노출 방지 */
import test from 'node:test';
import assert from 'node:assert/strict';
import gateway from '../../cloudflare-homecare-gateway/public/_worker.js';
const base = 'https://api.homecare.designboard.net';
const origin = 'https://homecare.designboard.net';

test('API 이외 경로·다른 호스트·미설정 바인딩은 외부 요청 없이 거부한다', async () => {
  let calls = 0;
  const env = { MEMBERS: { async fetch() { calls++; return new Response('unexpected'); } } };
  assert.equal((await gateway.fetch(new Request(`${base}/private-config`), env)).status, 404);
  assert.equal((await gateway.fetch(new Request('https://unexpected.example/api/auth/session'), env)).status, 421);
  assert.equal((await gateway.fetch(new Request(`${base}/api/auth/session`), {})).status, 503);
  assert.equal(calls, 0);
});

test('공개 Bearer는 제거하고 쿠키·Origin·CSRF와 파일 바이트를 보존한다', async () => {
  const bytes = new Uint8Array([0, 1, 2, 255, 13, 10]);
  const cookie = '__Host-hc_session=test-fixture-only';
  const response = await gateway.fetch(new Request(`${base}/api/registrations/test/document`, {
    method: 'POST', body: bytes, headers: { Cookie: cookie, Authorization: 'Bearer synthetic-test', Origin: origin, 'X-CSRF-Token': 'test-csrf', 'Content-Type': 'multipart/form-data; boundary=fixture' },
  }), { MEMBERS: { async fetch(request) {
    assert.equal(new URL(request.url).hostname, 'members-gateway.internal');
    assert.equal(request.headers.get('Authorization'), null);
    assert.equal(request.headers.get('Cookie'), cookie);
    assert.equal(request.headers.get('Origin'), origin);
    assert.equal(request.headers.get('X-CSRF-Token'), 'test-csrf');
    assert.equal(request.redirect, 'manual');
    assert.deepEqual(new Uint8Array(await request.arrayBuffer()), bytes);
    return Response.json({ data: { saved: true } });
  } } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('가입 응답 쿠키·CORS와 비공개 다운로드 응답을 그대로 유지한다', async () => {
  const cookie = '__Host-hc_session=fixture; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800';
  const response = await gateway.fetch(new Request(`${base}/api/auth/signup`), { MEMBERS: { async fetch() {
    return new Response('fixture', { status: 201, headers: { 'Set-Cookie': cookie, 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="test.pdf"' } });
  } } });
  assert.equal(response.headers.get('Set-Cookie'), cookie);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), 'true');
  assert.equal(response.headers.get('Content-Type'), 'application/pdf');
  assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="test.pdf"');
  assert.equal(await response.text(), 'fixture');
});

test('OPTIONS·로그아웃·인증 리디렉션은 원래 상태로 전달한다', async () => {
  for (const method of ['OPTIONS', 'POST', 'GET']) {
    const status = method === 'GET' ? 303 : 204;
    const response = await gateway.fetch(new Request(`${base}/api/auth/logout`, { method, headers: { Origin: origin } }), { MEMBERS: { async fetch(request) {
      assert.equal(request.method, method);
      return new Response(null, { status, headers: { Location: `${origin}/care-account.html` } });
    } } });
    assert.equal(response.status, status);
  }
});

test('바인딩 장애 원문을 숨기고 허용 출처에만 오류 CORS를 반환한다', async () => {
  for (const requestOrigin of [origin, 'https://untrusted.example']) {
    const response = await gateway.fetch(new Request(`${base}/api/auth/session`, { headers: { Origin: requestOrigin } }), { MEMBERS: { async fetch() { throw Error('sensitive-test-error'); } } });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), requestOrigin === origin ? origin : null);
    assert.ok(!(await response.text()).includes('sensitive-test-error'));
  }
});
/** SOFTM-MEMBER-DOMAIN END */
