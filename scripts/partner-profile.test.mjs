/** SOFTM-PARTNER-PROFILE-TEST START 날짜:20260917 : 납품 자료의 스크립트 삽입과 미승인 공개를 차단 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from './build-partner-profile.mjs';
const data = { name: '<script>alert(1)</script>', intro: '소개', region: '지역', hours: '시간', contact: '연락처', url: 'https://example.com/', services: ['<img onerror=alert(1)>'], approved: true };
test('고객 입력을 이스케이프하고 광고주 제공 정보임을 표시', () => {
  const html = buildProfile(data);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img onerror'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('광고 · 업체 제공 정보'));
  assert.ok(html.includes('sponsored noopener noreferrer'));
});
test('미승인·위험 링크·잘못된 서비스 목록 차단', () => {
  for (const edit of [{approved:false}, {url:'javascript:alert(1)'}, {services:[]}, {contact:''}]) assert.throws(() => buildProfile({...data,...edit}));
  const sample = buildProfile({...data,approved:false,sample:true});
  assert.ok(sample.includes('가상 업체입니다'));
  assert.ok(!sample.includes('href="https://example.com/"'));
});
/** SOFTM-PARTNER-PROFILE-TEST END */
