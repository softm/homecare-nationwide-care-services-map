/** SOFTM-INSTITUTION-CONTENT-TEST START 날짜:20261118 : 공개 기관 응답 정규화와 허용된 익명 집계 계약을 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEventPayload, normalizePublicProfile, safeHttpsUrl } from '../institution-content.js';

const institutionId = '12345678901';

test('공개 응답 envelope를 기관 직접 제공 표시 모델로 정규화한다', () => {
    const photos = Array.from({ length: 12 }, (_, index) => ({
        id: `photo-${index}`,
        url: `/api/public/institutions/${institutionId}/photos/photo-${index}`,
        altText: `공간 ${index}`,
        isCover: index === 4,
        published: index !== 2,
        sortOrder: index,
    }));
    photos[1].url = 'http://unsafe.example/photo.jpg';
    const profile = normalizePublicProfile({
        ok: true,
        data: {
            id: institutionId,
            name: '공개 기관명',
            status: 'published',
            publishedAt: '2026-11-18T01:00:00.000Z',
            profile: {
                displayName: '기관 확인 이름',
                summary: '기관이 직접 확인한 소개',
                operatingHours: { note: '평일 09:00~18:00' },
                phone: '02-1234-5678',
                website: 'https://example.org/info',
                address: '서울시 테스트구',
                transportation: '지하철 1번 출구',
                capacity: 30,
                availableSlots: 4,
                confirmedAt: '2026-11-18T02:00:00.000Z',
            },
            programs: [
                { id: 'b', title: '두 번째', sortOrder: 2, active: true },
                { id: 'hidden', title: '비공개', sortOrder: 0, active: false },
                { id: 'a', title: '첫 번째', sortOrder: 1, active: true },
            ],
            photos,
        },
    }, institutionId);

    assert.equal(profile.institutionName, '기관 확인 이름');
    assert.equal(profile.hours, '평일 09:00~18:00');
    assert.equal(profile.confirmedAt, '2026-11-18T02:00:00.000Z');
    assert.deepEqual(profile.programs.map(item => item.title), ['첫 번째', '두 번째']);
    assert.equal(profile.photos.length, 10);
    assert.equal(profile.photos[0].id, 'photo-4');
    assert.match(profile.photos[0].url, /^https:\/\/softm-homecare-pilot\.softm\.workers\.dev\/api\//);
    assert.ok(profile.photos.every(photo => photo.id !== 'photo-1' && photo.id !== 'photo-2'));
});

test('초안·기관 불일치·안전하지 않은 외부 주소를 공개하지 않는다', () => {
    const base = { id: institutionId, status: 'draft', profile: {}, programs: [], photos: [] };
    assert.equal(normalizePublicProfile({ ok: true, data: base }, institutionId), null);
    assert.equal(normalizePublicProfile({ ok: true, data: { ...base, status: 'published' } }, '99999999999'), null);
    assert.equal(safeHttpsUrl('http://example.org'), '');
    assert.equal(safeHttpsUrl('https://user:secret@example.org'), '');
    assert.equal(safeHttpsUrl('https://example.org/path'), 'https://example.org/path');
});

test('미입력 인원은 0명으로 만들지 않고 D1 시각은 UTC로 해석한다', () => {
    const profile = normalizePublicProfile({ ok: true, data: {
        id: institutionId, status: 'published', publishedAt: '2026-11-18 01:02:03',
        profile: { displayName: '테스트 기관', capacity: null, availableSlots: null }, programs: [], photos: [],
    } }, institutionId);
    assert.equal(profile.capacity, null);
    assert.equal(profile.availableSlots, null);
    assert.equal(profile.confirmedAt, '2026-11-18T01:02:03.000Z');
});

test('공개 이벤트는 허용 종류와 세션 익명 식별자만 전송한다', () => {
    const first = createEventPayload('detail_view', institutionId);
    const second = createEventPayload('phone_click', institutionId);
    assert.deepEqual(Object.keys(first).sort(), ['institutionId', 'type', 'visitorId']);
    assert.equal(first.institutionId, institutionId);
    assert.equal(first.visitorId, second.visitorId);
    assert.match(first.visitorId, /^[A-Za-z0-9_-]{20,80}$/);
    assert.equal(createEventPayload('photo_view', institutionId), null);
    assert.equal(createEventPayload('directions_click', 'bad-id'), null);
});

test('cross-origin 집계는 쿠키·sendBeacon 없이 keepalive fetch만 사용한다', async () => {
    const source = await readFile(new URL('../institution-content.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /sendBeacon/);
    assert.match(source, /credentials: 'omit'/);
    assert.match(source, /keepalive: true/);
    assert.match(source, /inflightProfiles/);
    assert.doesNotMatch(source, /memory\.set|expiresAt|300000|60000/);
});
/** SOFTM-INSTITUTION-CONTENT-TEST END */
