/** SOFTM-UPLOAD-FLOW START 날짜:20261121 : 실제 API를 거치는 증빙·사진 검증에서 비밀번호·쿠키·키를 출력하지 않음 */
import { randomBytes, createHash } from 'node:crypto';

const checksum = bytes => createHash('sha256').update(bytes).digest('hex');
const samplePhoto = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
const sampleDocument = Buffer.from('%PDF-1.4\n% Synthetic integration fixture - not a business certificate\n%%EOF\n');

export async function verifyMemberUploads({ base, origin, publicBase, grantTestReviewer, removeTestInstitution, progress = () => {} }) {
  const checks = [], clients = [], prefix = `verify_${Date.now().toString(36)}`;
  let institutionId = '', photoId = '', revision = 0, cleanupFailed = false;
  function check(name, passed, response) {
    checks.push({ name, passed: Boolean(passed) });
    progress({ name, passed: Boolean(passed), ...(!passed && response ? {
      status: response.status,
      code: /^[a-z_]{1,64}$/.test(response.code || '') ? response.code : 'unexpected_response',
    } : {}) });
    if (!passed) throw new Error(`verification_failed:${name}`);
  }
  function client() {
    let cookie = '', csrf = '';
    const account = { userId: '', async call(path, { method = 'GET', body, headers = {}, binary = false } = {}) {
      const h = new Headers({ Origin: origin, ...headers });
      if (cookie) h.set('Cookie', cookie);
      if (csrf) h.set('X-CSRF-Token', csrf);
      if (body && !(body instanceof FormData)) { h.set('Content-Type', 'application/json'); body = JSON.stringify(body); }
      const response = await fetch(`${base}${path}`, { method, headers: h, body, redirect: 'error', signal: AbortSignal.timeout(30000) });
      const setCookie = response.headers.get('Set-Cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const data = binary && response.ok ? Buffer.from(await response.arrayBuffer()) : await response.json().catch(() => null);
      if (data?.data?.csrf) csrf = data.data.csrf;
      return { status: response.status, data: binary ? data : data?.data, code: binary ? null : data?.error?.code, headers: response.headers };
    } };
    clients.push(account);
    return account;
  }
  const owner = client(), reviewer = client(), outsider = client();
  async function signup(account, kind, suffix) {
    const result = await account.call('/api/auth/signup', { method: 'POST', body: { username: `${prefix}_${suffix}`, password: randomBytes(24).toString('base64url'), kind, terms: true } });
    account.userId = result.data?.user?.id || '';
    check(`signup_${suffix}`, result.status === 201 && account.userId, result);
  }
  try {
    await signup(owner, 'institution', 'owner');
    const registration = await owner.call('/api/registrations', { method: 'POST', body: {
      source: 'manual', institutionType: 'daycare', institutionName: '파일 연결 검증용 가상 기관',
      address: '가상 주소 — 실제 기관 아님', businessNumber: '0000000000', representative: '시험 대표',
      contactName: '시험 담당자', contactPhone: '010-0000-0000', contactEmail: 'verification@example.invalid',
    } });
    institutionId = registration.data?.institution_id || '';
    const rid = registration.data?.id;
    check('save_institution_registration', registration.status === 200 && institutionId.startsWith('manual:'));
    const form = new FormData();
    form.append('document', new Blob([sampleDocument], { type: 'application/pdf' }), 'synthetic-certificate.pdf');
    const uploaded = await owner.call(`/api/registrations/${rid}/document`, { method: 'POST', body: form });
    check('upload_private_document', uploaded.status === 200 && uploaded.data?.hasDocument, uploaded);
    const downloaded = await owner.call(`/api/registrations/${rid}/document`, { binary: true });
    check('document_checksum', downloaded.status === 200 && checksum(downloaded.data) === checksum(sampleDocument));
    check('document_no_store', downloaded.headers.get('Cache-Control') === 'no-store');
    await signup(outsider, 'institution', 'other');
    check('other_member_document_denied', (await outsider.call(`/api/registrations/${rid}/document`)).status === 404);
    const submitted = await owner.call(`/api/registrations/${rid}/submit`, { method: 'POST', body: { consent: true, revision: uploaded.data.revision } });
    check('submit_institution_for_review', submitted.status === 200 && submitted.data?.status === 'pending');
    const waiting = await owner.call('/api/institutions/me');
    check('membership_not_granted_before_review', waiting.status === 200 && waiting.data?.institutions?.length === 0);
    await signup(reviewer, 'personal', 'reviewer');
    check('ordinary_member_review_denied', (await reviewer.call('/api/admin/registrations')).status === 403);
    await grantTestReviewer(reviewer.userId);
    const approved = await reviewer.call(`/api/admin/registrations/${rid}/review`, { method: 'POST', body: { status: 'approved', reason: '가상 파일 연결 시험; 실제 기관 심사 아님', revision: submitted.data.revision } });
    check('review_grants_membership', approved.status === 200 && approved.data?.status === 'approved');
    const mine = await owner.call('/api/institutions/me');
    const institution = mine.data?.institutions?.find(row => row.id === institutionId || row.institutionId === institutionId);
    check('approved_institution_visible', mine.status === 200 && institution);
    revision = institution.contentRevision;
    const photoForm = new FormData();
    photoForm.append('photo', new Blob([samplePhoto], { type: 'image/png' }), 'synthetic-photo.png');
    photoForm.append('altText', '파일 연결 시험용 이미지');
    const photo = await owner.call(`/api/institutions/${encodeURIComponent(institutionId)}/photos`, { method: 'POST', body: photoForm, headers: { 'If-Match': String(revision) } });
    photoId = photo.data?.id || '';
    check('upload_institution_photo', photo.status === 201 && photoId);
    revision = photo.data.contentRevision;
    const preview = await owner.call(`/api/institutions/${encodeURIComponent(institutionId)}/photos/${photoId}/content`, { binary: true });
    check('photo_checksum', preview.status === 200 && checksum(preview.data) === checksum(samplePhoto));
    const publicPhoto = await fetch(`${publicBase}/api/public/institutions/${encodeURIComponent(institutionId)}/photos/${photoId}`, { redirect: 'error', signal: AbortSignal.timeout(20000) });
    check('draft_photo_not_public', publicPhoto.status === 404);
    await publicPhoto.body?.cancel();
    const removed = await owner.call(`/api/institutions/${encodeURIComponent(institutionId)}/photos/${photoId}`, { method: 'DELETE', headers: { 'If-Match': String(revision) } });
    check('delete_photo_storage_confirmed', removed.status === 200 && !removed.data?.storageCleanupPending);
    photoId = '';
    check('deleted_photo_unavailable', (await owner.call(`/api/institutions/${encodeURIComponent(institutionId)}/photos/${photo.data.id}/content`)).status === 404);
  } finally {
    if (photoId) {
      try {
        const removed = await owner.call(`/api/institutions/${encodeURIComponent(institutionId)}/photos/${photoId}`, { method: 'DELETE', headers: { 'If-Match': String(revision) } });
        if (removed.status !== 200) cleanupFailed = true;
      } catch { cleanupFailed = true; }
    }
    for (const account of clients) if (account.userId) {
      try { if ((await account.call('/api/me/account', { method: 'DELETE', body: { confirm: '회원 탈퇴' } })).status !== 200) cleanupFailed = true; }
      catch { cleanupFailed = true; }
    }
    if (institutionId) {
      try { await removeTestInstitution(institutionId, clients.map(c => c.userId).filter(Boolean)); }
      catch { cleanupFailed = true; }
    }
    progress({ name: 'test_data_removed', passed: !cleanupFailed });
    if (cleanupFailed) throw new Error('verification_cleanup_required');
  }
  return { passed: checks.length, cleanupComplete: true };
}
/** SOFTM-UPLOAD-FLOW END */
