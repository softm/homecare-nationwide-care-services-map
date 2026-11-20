/** SOFTM-SUPABASE-STORAGE START 날짜:20261121 : 새 저장소의 증빙 소유권과 실패 후 실제 삭제 재시도를 API에서 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleScheduled } from '../src/index.mjs';
import { environment, client, pendingRegistration } from './helpers.mjs';

test('Supabase 증빙은 다른 회원이 읽지 못하고 삭제 장애 후 재시도한다', async t => {
  const env = environment();
  Object.assign(env, {
    FILE_STORAGE_PROVIDER: 'supabase', FILE_UPLOADS_ENABLED: 'true',
    SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_test_only_not_a_live_key', SUPABASE_DOCUMENTS_BUCKET: 'homecare-documents',
  });
  const objects = new Map();
  let calls = 0, deleteFails = true;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++;
    const path = new URL(url).pathname;
    if (path.includes('/bucket/')) return Response.json({ id: env.SUPABASE_DOCUMENTS_BUCKET, public: false, file_size_limit: 10 * 1024 * 1024, allowed_mime_types: ['application/pdf', 'image/jpeg', 'image/png'] });
    if (init.method === 'POST') {
      const key = decodeURIComponent(path.split('/object/homecare-documents/')[1]);
      objects.set(key, init.body);
      return Response.json({ Key: `homecare-documents/${key}` });
    }
    if (init.method === 'DELETE') {
      if (deleteFails) return Response.json({ message: 'temporary storage failure' }, { status: 503 });
      for (const key of JSON.parse(init.body).prefixes) objects.delete(key);
      return Response.json([]);
    }
    const key = decodeURIComponent(path.split('/object/authenticated/homecare-documents/')[1]);
    return objects.has(key) ? new Response(objects.get(key)) : Response.json({ code: 'NoSuchKey' }, { status: 404 });
  });
  const owner = client(env), other = client(env);
  await owner.signup('institution', 'owner');
  await other.signup('institution', 'other');
  const submitted = await pendingRegistration(owner);
  assert.equal(submitted.status, 200);
  const rid = submitted.body.data.id;
  const callsBefore = calls;
  assert.equal((await other.call(`/api/registrations/${rid}/document`)).status, 404);
  assert.equal(calls, callsBefore);
  assert.equal(objects.size, 1);
  assert.equal((await owner.call('/api/me/account', { method: 'DELETE', body: { confirm: '회원 탈퇴' } })).status, 503);
  assert.equal(env.DB.db.prepare('SELECT count(*) n FROM deletion_jobs').get().n, 1);
  assert.equal(objects.size, 1);
  deleteFails = false;
  await handleScheduled(env);
  assert.equal(objects.size, 0);
  assert.equal(env.DB.db.prepare('SELECT count(*) n FROM deletion_jobs').get().n, 0);
  assert.equal(env.DB.db.prepare("SELECT count(*) n FROM users WHERE username='owner'").get().n, 0);
});
/** SOFTM-SUPABASE-STORAGE END */
