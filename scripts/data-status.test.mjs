/** SOFTM-DATA-STATUS-TEST START 날짜:20260910 : 수집률·월간 생략·경과 표 계산이 실제 수집 상태를 왜곡하지 않도록 검사 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCollectionRows, formatDuration, formatKoreanDate, normalizeWorkflowRun, percentOf } from '../data-status.js';

test('기관 상세와 사진 수집률은 기관목록을 기준으로 계산한다', () => {
  assert.equal(percentOf(31_033, 31_033), 100);
  assert.equal(percentOf(15_517, 31_033), 50);
  assert.equal(percentOf(38_432, 38_434), 99.9);
  assert.equal(percentOf(1, 0), null);
  const rows = buildCollectionRows({
    catalogCount: 31_033,
    detailCount: 31_033,
    photoManifestCount: 31_033,
    evaluationCount: 21_216,
    photoCollection: { remaining: 0 }
  }, { facility: {}, daycare: {} }, { targets: 100, resolved: 98, remaining: 2 });
  assert.equal(rows.find(row => row.label === '기관 상세').rate, 100);
  assert.equal(rows.find(row => row.label === '사진 정보').status, '수집 완료');
  assert.equal(rows.find(row => row.label === '기관 평가').rate, null);
  assert.equal(rows.find(row => row.label === '사진 제목 보완').status, '2건 확인 필요');
});

test('월간 예약은 매월 1일이 아니면 성공 실행과 구분한다', () => {
  const skipped = normalizeWorkflowRun({
    display_title: 'NHIS 자동 · 월간 원본 · scope=catalog,evaluations',
    status: 'completed',
    conclusion: 'success',
    event: 'schedule',
    run_started_at: '2026-09-08T20:17:00Z',
    updated_at: '2026-09-08T20:18:00Z'
  });
  assert.equal(skipped.status, '수집일 아님');
  const collected = normalizeWorkflowRun({
    display_title: 'NHIS 자동 · 월간 원본 · scope=catalog,evaluations',
    status: 'completed',
    conclusion: 'success',
    event: 'schedule',
    run_started_at: '2026-09-30T20:17:00Z',
    updated_at: '2026-09-30T20:20:00Z'
  });
  assert.equal(collected.status, '성공');
});

test('진행 중 실행과 한국시간·소요시간을 표시한다', () => {
  const run = normalizeWorkflowRun({
    display_title: 'NHIS 수동 · mode=full',
    status: 'in_progress',
    event: 'workflow_dispatch',
    run_started_at: '2026-09-09T15:00:00Z'
  }, new Date('2026-09-09T16:02:05Z').getTime());
  assert.equal(run.status, '실행 중');
  assert.equal(run.trigger, '수동');
  assert.equal(run.active, true);
  assert.equal(run.duration, '1시간 2분');
  assert.equal(formatDuration('2026-09-09T15:00:00Z', '2026-09-09T15:00:45Z'), '45초');
  assert.equal(formatKoreanDate('2026-09-09T15:00:00Z'), '2026.09.10 00:00');
});
/** SOFTM-DATA-STATUS-TEST END */
