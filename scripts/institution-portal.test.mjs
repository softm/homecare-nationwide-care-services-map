/** SOFTM-INSTITUTION-PORTAL-TEST START 날짜:20261118 : 무료 시범운영 포털의 입력·사진·보안·API 계약을 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    ACCOUNT_API_BASE,
    INSTITUTION_API_BASE,
    MAX_PHOTO_BYTES,
    MAX_PHOTOS,
    PILOT_AGREEMENT_VERSION,
    contentIfMatch,
    contentRevision,
    createAccountClient,
    hasCurrentPilotAgreement,
    institutionAccess,
    isContentConflict,
    photoUploadFailurePlan,
    validateAgreement,
    validateClaim,
    validatePhotoFiles,
    validateProfile,
} from '../institution-portal.mjs';

test('기관 권한과 운영 상태에 따라 수정 가능 범위를 제한한다', () => {
    assert.deepEqual(institutionAccess('owner', 'draft'), { canManage: true, canEdit: true });
    assert.deepEqual(institutionAccess('editor', 'published'), { canManage: true, canEdit: true });
    assert.deepEqual(institutionAccess('viewer', 'published'), { canManage: false, canEdit: false });
    assert.deepEqual(institutionAccess('owner', 'suspended'), { canManage: true, canEdit: false });
});

test('기관 콘텐츠 revision을 If-Match 강한 비교값으로 전달하고 충돌을 구분한다', async () => {
    assert.equal(contentRevision({ contentRevision: 7 }), 7);
    assert.equal(contentRevision({ contentRevision: 0 }), null);
    assert.equal(contentRevision({ contentRevision: -1 }), null);
    assert.equal(contentRevision({}), null);
    assert.equal(contentIfMatch(7), '"7"');
    assert.throws(() => contentIfMatch(null), /서버 최신 내용/);
    assert.equal(isContentConflict({ status: 409, code: 'content_conflict' }), true);
    assert.equal(isContentConflict({ status: 409, code: 'photo_limit_reached' }), false);
    assert.equal(isContentConflict({ status: 412, code: 'content_conflict' }), false);
    assert.deepEqual(photoUploadFailurePlan(2, { status: 409, code: 'content_conflict' }), { conflict: true, completed: true, refreshPhotoManager: false });
    assert.deepEqual(photoUploadFailurePlan(2, { status: 500, code: 'upload_failed' }), { conflict: false, completed: true, refreshPhotoManager: true });

    const source = await readFile(new URL('../institution-portal.mjs', import.meta.url), 'utf8');
    const html = await readFile(new URL('../institution-portal.html', import.meta.url), 'utf8');
    assert.match(source, /'If-Match': contentIfMatch\(state\.contentRevision\)/);
    assert.match(source, /updateContentRevision\(data\)/);
    assert.match(source, /handleContentConflict\(error/);
    assert.match(source, /reloadWorkspaceButton'\)\.focus/);
    assert.match(source, /event\.persisted && state\.institution && !state\.conflict/);
    assert.doesNotMatch(source, /expectedRevision/);
    assert.match(html, /id="revisionConflict"/);
    assert.match(html, /서버 최신 내용 새로 불러오기/);
});

test('기관 연결 신청은 담당자 확인 동의를 포함한다', () => {
    const claim = validateClaim({
        institutionId: '12345678901', institutionName: '테스트 기관', contactName: '담당자',
        contactEmail: 'manager@example.org', contactPhone: '02-1234-5678', note: '운영 담당', truthful: true,
    });
    assert.equal(claim.truthful, true);
    assert.equal(claim.contactEmail, 'manager@example.org');
    assert.throws(() => validateClaim({ ...claim, truthful: false }), /동의/);
});

test('운영정보를 backend profile 계약으로 제한한다', () => {
    const profile = validateProfile({
        displayName: '테스트 기관', summary: '기관 소개', phone: '02-1234-5678', email: 'care@example.org',
        website: 'https://example.org', address: '서울시 테스트구', operatingHours: '평일 09:00~18:00',
        transportation: '1번 출구', capacity: '30', availableSlots: '4',
        programs: [{ id: '', title: '인지활동', description: '소그룹 활동', schedule: '매주 월요일' }],
    });
    assert.deepEqual(Object.keys(profile).sort(), ['address', 'availableSlots', 'capacity', 'displayName', 'email', 'operatingHours', 'phone', 'programs', 'summary', 'transportation', 'website']);
    assert.deepEqual(profile.operatingHours, { note: '평일 09:00~18:00' });
    assert.equal(validateProfile({ ...profile, address: '가'.repeat(301) }).address.length, 300);
    assert.deepEqual(profile.programs[0], { id: '', title: '인지활동', description: '소그룹 활동', schedule: '매주 월요일', sortOrder: 0, active: true });
    assert.throws(() => validateProfile({ ...profile, website: 'http://example.org' }), /HTTPS/);
    assert.throws(() => validateProfile({ ...profile, availableSlots: 31 }), /정원을 초과/);
});

test('사진은 10장·파일당 5MB·허용 이미지 형식으로 제한한다', () => {
    assert.equal(MAX_PHOTOS, 10);
    assert.equal(MAX_PHOTO_BYTES, 5 * 1024 * 1024);
    const valid = { type: 'image/webp', size: MAX_PHOTO_BYTES };
    assert.equal(validatePhotoFiles([valid], 9).length, 1);
    assert.throws(() => validatePhotoFiles([valid, valid], 9), /최대 10장/);
    assert.throws(() => validatePhotoFiles([{ type: 'image/gif', size: 100 }], 0), /JPG·PNG·WebP/);
    assert.throws(() => validatePhotoFiles([{ type: 'image/jpeg', size: MAX_PHOTO_BYTES + 1 }], 0), /5MB/);
});

test('무료 시범운영 협약과 고정 API·세션 보안 구성을 유지한다', async () => {
    const agreement = validateAgreement({ freePilot: true, noPayment: true, contentAuthority: true });
    assert.equal(PILOT_AGREEMENT_VERSION, 'homecare-pilot-20261118-v1');
    assert.deepEqual(agreement, { version: PILOT_AGREEMENT_VERSION, freePilot: true, noPayment: true, contentAuthority: true, accepted: true });
    assert.equal(hasCurrentPilotAgreement({ status: 'accepted', version: PILOT_AGREEMENT_VERSION, confirmations: { freePilot: true, noPayment: true, contentAuthority: true } }), true);
    assert.equal(hasCurrentPilotAgreement({ status: 'accepted', version: 'old', confirmations: { freePilot: true, noPayment: true, contentAuthority: true } }), false);
    assert.equal(hasCurrentPilotAgreement({ status: 'accepted', version: PILOT_AGREEMENT_VERSION, confirmations: { freePilot: true, noPayment: false, contentAuthority: true } }), false);
    assert.throws(() => validateAgreement({ freePilot: true, noPayment: false, contentAuthority: true }), /결제 약정 없음/);
    assert.equal(INSTITUTION_API_BASE, 'https://softm-homecare-pilot.softm.workers.dev');
    assert.equal(ACCOUNT_API_BASE, 'https://softm-hannun-account.softm.workers.dev');

    const source = await readFile(new URL('../institution-portal.mjs', import.meta.url), 'utf8');
    const html = await readFile(new URL('../institution-portal.html', import.meta.url), 'utf8');
    assert.match(source, /sessionStorage/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /[?&](?:institutionApi|accountApi)=|searchParams\.get\(['"](?:institutionApi|accountApi)/);
    assert.match(source, /\/api\/institutions\/\$\{state\.institution\.id\}\/pilot-agreement/);
    assert.match(source, /altText/);
    assert.match(source, /isCover/);
    assert.match(source, /published/);
    assert.match(source, /photo\?\.previewPath/);
    assert.match(source, /client\.fetchBlob\(photo\.previewPath\)/);
    assert.match(source, /URL\.createObjectURL/);
    assert.match(source, /URL\.revokeObjectURL/);
    assert.match(html, /이용료·결제수단·자동결제·자동갱신 약정이 없습니다/);
    assert.match(html, /파일당 5MB 이하, 최대 10장/);
    assert.match(html, /고유 이용자 수가 아니며 이용 성과를 의미하거나 보장하지 않습니다/);
});

test('보호 사진은 Bearer fetch로만 받고 쿼리 토큰 경로를 거부한다', async () => {
    const originalStorage = globalThis.sessionStorage;
    const originalFetch = globalThis.fetch;
    const token = 'T'.repeat(43);
    const saved = JSON.stringify({ token, uid: 'test-user', expiresAt: Date.now() + 60_000 });
    let seen;
    globalThis.sessionStorage = { getItem: () => saved, setItem() {}, removeItem() {} };
    globalThis.fetch = async (input, init) => {
        seen = { url: String(input), init };
        return new Response(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), { status: 200, headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '3' } });
    };
    try {
        const client = createAccountClient();
        const blob = await client.fetchBlob('/api/institutions/12345678901/photos/photo-id/content');
        assert.equal(blob.type, 'image/jpeg');
        assert.equal(seen.url, 'https://softm-homecare-pilot.softm.workers.dev/api/institutions/12345678901/photos/photo-id/content');
        assert.equal(seen.init.headers.Authorization, `Bearer ${token}`);
        assert.equal(seen.init.credentials, 'omit');
        await client.request('/api/institutions/12345678901/profile', { method: 'PUT', headers: { 'If-Match': '"7"' }, body: { displayName: '테스트 기관' } });
        assert.equal(seen.url, 'https://softm-homecare-pilot.softm.workers.dev/api/institutions/12345678901/profile');
        assert.equal(seen.init.headers['If-Match'], '"7"');
        assert.equal(seen.init.headers.Authorization, `Bearer ${token}`);
        await assert.rejects(() => client.fetchBlob('/api/institutions/12345678901/photos/photo-id/content?token=secret'), /잘못된 사진 미리보기 경로/);
        await assert.rejects(() => client.fetchBlob('/api/institutions/../../photos/photo-id/content'), /잘못된 사진 미리보기 경로/);
        await assert.rejects(() => client.request('https://attacker.example/api/institutions/me'), /잘못된 기관 API 경로/);
    } finally {
        if (originalStorage === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = originalStorage;
        globalThis.fetch = originalFetch;
    }
});
/** SOFTM-INSTITUTION-PORTAL-TEST END */
