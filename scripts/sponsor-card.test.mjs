/** SOFTM-SPONSOR-TEST START 날짜:20260917 : 미계약·기간 밖·위험 링크 광고가 실제 판매 지면에 노출되지 않도록 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const sandbox = { URL };
vm.runInNewContext(fs.readFileSync(new URL('../sponsor-card.js', import.meta.url), 'utf8'), sandbox);
const active = sandbox.CareSponsor.activeCampaign;
const campaign = { id: 'test', approved: true, name: '검사용', title: '광고', description: '설명', url: 'https://example.com/', startsAt: '2026-10-01T00:00:00+09:00', endsAt: '2026-10-31T00:00:00+09:00' };
const now = Date.parse('2026-10-15T12:00:00+09:00');
test('계약 승인과 30일 시작·종료 경계를 함께 적용', () => {
  assert.equal(active(null, now), null);
  assert.equal(active({ ...campaign, approved: false }, now), null);
  assert.equal(active(campaign, Date.parse(campaign.startsAt) - 1), null);
  assert.ok(active(campaign, Date.parse(campaign.startsAt)));
  assert.ok(active(campaign, Date.parse(campaign.endsAt) - 1));
  assert.equal(active(campaign, Date.parse(campaign.endsAt)), null);
});
test('누락·잘못된 날짜·위험 링크를 차단', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'http://example.com', 'https://user:pass@example.com', '/local']) assert.equal(active({ ...campaign, url }, now), null);
  for (const edit of [{ title: '' }, { name: ' ' }, { startsAt: 'invalid' }, { endsAt: campaign.startsAt }]) assert.equal(active({ ...campaign, ...edit }, now), null);
  assert.equal(active(campaign, now).url, 'https://example.com/');
});
/** SOFTM-SPONSOR-TEST END */
