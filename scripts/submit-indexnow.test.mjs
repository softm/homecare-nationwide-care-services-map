/** SOFTM-INDEXNOW-TEST START 날짜:20260907 : 변경 URL 제한과 공개 키 확인 없이 검색엔진에 요청되는 회귀를 방지 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  INDEXNOW_KEY_LOCATION,
  indexNowPayload,
  normalizeIndexNowUrls,
  submitIndexNow,
} from './submit-indexnow.mjs';

test('같은 공개 도메인의 변경 URL만 정규화하고 중복·fragment를 제거한다', () => {
  assert.deepEqual(normalizeIndexNowUrls(['/', '/about.html#source', 'https://homecare.designboard.net/about.html']), [
    'https://homecare.designboard.net/',
    'https://homecare.designboard.net/about.html',
  ]);
  assert.throws(() => normalizeIndexNowUrls(['https://example.com/']), /다른 도메인/);
  assert.throws(() => normalizeIndexNowUrls([]), /하나 이상/);
});

test('네이버 규격의 host·공개 키·URL 목록을 만든다', () => {
  assert.deepEqual(indexNowPayload(['https://homecare.designboard.net/']), {
    host: 'homecare.designboard.net',
    key: INDEXNOW_KEY,
    keyLocation: INDEXNOW_KEY_LOCATION,
    urlList: ['https://homecare.designboard.net/'],
  });
});

test('공개 키 확인 후에만 네이버 IndexNow로 요청한다', async () => {
  const calls = [];
  const status = await submitIndexNow(['https://homecare.designboard.net/'], {
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url === INDEXNOW_KEY_LOCATION) return new Response(`${INDEXNOW_KEY}\n`, { status: 200 });
      if (url === INDEXNOW_ENDPOINT) return new Response('', { status: 202 });
      return new Response('', { status: 404 });
    },
  });
  assert.equal(status, 202);
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[1].options.body).urlList[0], 'https://homecare.designboard.net/');
});

test('키가 아직 배포되지 않았으면 제출을 중단한다', async () => {
  let postCalled = false;
  await assert.rejects(() => submitIndexNow(['https://homecare.designboard.net/'], {
    fetchImpl: async (url) => {
      if (url === INDEXNOW_KEY_LOCATION) return new Response('old-key', { status: 200 });
      postCalled = true;
      return new Response('', { status: 200 });
    },
  }), /아직 배포되지 않았습니다/);
  assert.equal(postCalled, false);
});
/** SOFTM-INDEXNOW-TEST END */
