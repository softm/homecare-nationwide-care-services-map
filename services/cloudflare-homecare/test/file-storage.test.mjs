/** SOFTM-SUPABASE-STORAGE START 날짜:20261121 : 파일 저장소 변경 시 키 노출·공개 전환·삭제 실패 은폐를 회귀검사 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseStorage, fileStorage } from '../../homecare-storage/file-storage.mjs';

const config = {
  url: 'https://abcdefghijklmnopqrst.supabase.co', secret: 'sb_secret_test_only_not_a_live_key',
  bucket: 'homecare-photos', maxBytes: 5 * 1024 * 1024,
  types: ['image/jpeg', 'image/png', 'image/webp'], uploadsEnabled: true,
};
const privateBucket = { id: config.bucket, public: false, file_size_limit: config.maxBytes, allowed_mime_types: config.types };
const key = 'institutions/hira:test_1/photo-1.jpg';
const jpeg = new Uint8Array([255, 216, 255, 0]);
const options = { httpMetadata: { contentType: 'image/jpeg' }, customMetadata: { institutionId: 'hira:test_1', photoId: 'photo-1' } };

test('비공개 설정 확인 후 서버 키로 파일을 생성하고 인증 경로로 읽고 정확한 키만 삭제한다', async () => {
  const calls = [];
  const storage = createSupabaseStorage(config, async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith(`/bucket/${config.bucket}`)) return Response.json(privateBucket);
    if (init.method === 'POST') return Response.json({ Key: `${config.bucket}/${key}` });
    if (init.method === 'DELETE') return Response.json([{ name: key }]);
    return new Response(jpeg, { headers: { ETag: '"test-etag"' } });
  });
  await storage.put(key, jpeg, options);
  const object = await storage.get(key);
  assert.deepEqual(new Uint8Array(await new Response(object.body).arrayBuffer()), jpeg);
  assert.equal(object.httpEtag, '"test-etag"');
  await storage.delete(key);
  assert.equal(calls.length, 4);
  for (const { url, init } of calls) {
    assert.equal(init.headers.get('apikey'), config.secret);
    assert.equal(init.headers.get('authorization'), null);
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    assert.ok(!url.includes(config.secret));
  }
  assert.ok(calls[2].url.includes('/object/authenticated/homecare-photos/institutions/hira%3Atest_1/'));
  assert.equal(calls[1].init.headers.get('x-upsert'), 'false');
  assert.equal(calls[1].init.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(JSON.parse(atob(calls[1].init.headers.get('x-metadata'))), options.customMetadata);
  assert.deepEqual(JSON.parse(calls[3].init.body), { prefixes: [key] });
});

test('준비 완료를 명시하지 않으면 실제 업로드 요청을 보내지 않는다', async () => {
  let calls = 0;
  const storage = createSupabaseStorage({ ...config, uploadsEnabled: false }, async () => { calls++; });
  await assert.rejects(storage.put(key, jpeg, options), { code: 'uploads_paused', status: 503 });
  assert.equal(calls, 0);
});

test('공개 버킷·무제한 크기·허용하지 않은 형식 설정은 업로드 전에 차단한다', async () => {
  for (const override of [{ public: true }, { file_size_limit: null }, { file_size_limit: config.maxBytes + 1 }, { allowed_mime_types: null }, { allowed_mime_types: ['text/html'] }]) {
    let calls = 0;
    const storage = createSupabaseStorage(config, async () => { calls++; return Response.json({ ...privateBucket, ...override }); });
    await assert.rejects(storage.put(key, jpeg, options), { code: 'storage_configuration_required' });
    assert.equal(calls, 1);
  }
});

test('파일 경로 순회·다른 호스트·publishable 키를 거부하고 비밀값은 오류에 넣지 않는다', async () => {
  for (const override of [{ url: 'https://evil.example' }, { url: `${config.url}?token=x` }, { url: config.url.replace('https:', 'http:') }, { secret: 'sb_publishable_public_key_only' }, { bucket: '../other' }]) {
    assert.throws(() => createSupabaseStorage({ ...config, ...override }), error => error.code === 'storage_not_configured' && !error.message.includes(config.secret));
  }
  let calls = 0;
  const storage = createSupabaseStorage(config, async () => { calls++; });
  for (const path of ['', '../file', 'folder/../file', 'folder/%2e%2e/file', '/file', 'folder//file', 'file?token=1', 'folder\\file']) {
    await assert.rejects(storage.get(path), { code: 'storage_invalid_key' });
    await assert.rejects(storage.delete(path), { code: 'storage_invalid_key' });
  }
  assert.equal(calls, 0);
});

test('존재하지 않는 객체만 빈 값이며 없는 버킷·인증 실패·중지 응답은 장애로 전달한다', async () => {
  for (const [status, payload] of [[404, { code: 'NoSuchKey' }], [400, { statusCode: '404', message: 'Object not found' }]]) {
    const storage = createSupabaseStorage(config, async () => Response.json(payload, { status }));
    assert.equal(await storage.get(key), null);
  }
  for (const [status, payload] of [[404, { code: 'NoSuchBucket' }], [401, { code: 'InvalidJWT', message: config.secret }], [503, { message: 'paused' }]]) {
    const storage = createSupabaseStorage(config, async () => Response.json(payload, { status }));
    await assert.rejects(storage.get(key), error => error.code === 'storage_unavailable' && !JSON.stringify(error).includes(config.secret));
  }
});

test('삭제 실패·비정상 응답을 성공으로 처리하지 않고 이미 없는 파일 삭제는 완료한다', async () => {
  for (const response of [Response.json({ code: 'InternalError' }, { status: 500 }), Response.json({ error: 'bad response' }), new Response('gateway unavailable', { status: 503 })]) {
    const storage = createSupabaseStorage(config, async () => response);
    await assert.rejects(storage.delete(key), { code: 'storage_unavailable' });
  }
  await createSupabaseStorage(config, async () => Response.json([])).delete(key);
});

test('업스트림 예외·큰 오류 본문·리디렉션은 키나 오류 원문을 노출하지 않는다', async () => {
  for (const fetcher of [async () => { throw Error(config.secret); }, async () => new Response(config.secret.repeat(2000), { status: 500 }), async () => new Response(null, { status: 302, headers: { Location: 'https://evil.example' } })]) {
    const storage = createSupabaseStorage(config, fetcher);
    await assert.rejects(storage.get(key), error => error.code === 'storage_unavailable' && !error.message.includes(config.secret));
  }
});

test('업로드 크기·형식을 제한하고 충돌 시 덮어쓰지 않는다', async () => {
  let uploads = 0;
  const storage = createSupabaseStorage(config, async (url, init) => {
    if (init.method === 'POST') { uploads++; return Response.json({ code: 'KeyAlreadyExists' }, { status: 409 }); }
    return Response.json(privateBucket);
  });
  await assert.rejects(storage.put(key, new Uint8Array(config.maxBytes + 1), options), { code: 'invalid_file' });
  await assert.rejects(storage.put(key, jpeg, { httpMetadata: { contentType: 'text/html' } }), { code: 'invalid_file' });
  assert.equal(uploads, 0);
  await assert.rejects(storage.put(key, jpeg, options), { code: 'storage_conflict', status: 409 });
  assert.equal(uploads, 1);
});

test('선택한 Supabase 연결이 없으면 기존 R2 바인딩으로 자동 우회하지 않는다', () => {
  const legacy = { get() {}, put() {}, delete() {} };
  assert.equal(fileStorage({ PHOTOS: legacy }, 'PHOTOS'), legacy);
  assert.throws(() => fileStorage({ FILE_STORAGE_PROVIDER: 'supabase', PHOTOS: legacy }, 'PHOTOS'), { code: 'storage_not_configured' });
  assert.throws(() => fileStorage({ FILE_STORAGE_PROVIDER: 'unknown', PHOTOS: legacy }, 'PHOTOS'), { code: 'storage_not_configured' });
});
/** SOFTM-SUPABASE-STORAGE END */
