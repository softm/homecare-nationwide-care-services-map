/** SOFTM-DATA-STATUS START 날짜:20260910 : 배포 매니페스트와 공개 Actions 상태를 결합해 수집 경과를 자동 갱신 */
const GITHUB_RUNS_URL = 'https://api.github.com/repos/softm/homecare-nationwide-care-services-map/actions/workflows/refresh-nhis-static.yml/runs?per_page=8';
const SHARD_COUNT = 14;
const AUTO_REFRESH_MS = 90_000;
const CATEGORY_ORDER = ['facility', 'daycare', 'home-care', 'home-nursing', 'home-bath', 'short-stay', 'welfare-equipment', 'dementia', 'nursing-hospital'];

const numberFormatter = new Intl.NumberFormat('ko-KR');
const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

export function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? numberFormatter.format(number) : '—';
}

export function percentOf(value, total) {
  const current = Number(value);
  const maximum = Number(total);
  if (!Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0) return null;
  const rounded = Math.min(100, Math.round((current / maximum) * 1000) / 10);
  return current < maximum && rounded === 100 ? 99.9 : rounded; // SOFTM-DATA-STATUS 날짜:20260910 : 미완료 건이 남은 상태를 완료율 100%로 오인하지 않게 함
}

export function formatKoreanDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatDuration(startValue, endValue = Date.now()) {
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—';
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours) return `${hours}시간 ${minutes}분`;
  if (minutes) return `${minutes}분 ${rest}초`;
  return `${rest}초`;
}

function koreanDay(value) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', day: 'numeric' }).formatToParts(new Date(value));
  return Number(parts.find(part => part.type === 'day')?.value);
}

export function normalizeWorkflowRun(run, now = Date.now()) {
  const title = String(run?.display_title || run?.name || '이름 없는 실행');
  const startedAt = run?.run_started_at || run?.created_at;
  const monthlyCheckOnly = title.includes('월간 원본') && koreanDay(startedAt) !== 1;
  let status = '확인 필요';
  let tone = 'neutral';
  if (run?.status === 'queued' || run?.status === 'waiting' || run?.status === 'requested') {
    status = '대기 중';
    tone = 'running';
  } else if (run?.status === 'in_progress' || run?.status === 'pending') {
    status = '실행 중';
    tone = 'running';
  } else if (monthlyCheckOnly && run?.conclusion === 'success') {
    status = '수집일 아님';
    tone = 'neutral';
  } else if (run?.conclusion === 'success') {
    status = '성공';
    tone = 'good';
  } else if (run?.conclusion === 'cancelled' || run?.conclusion === 'skipped') {
    status = run.conclusion === 'cancelled' ? '취소' : '건너뜀';
    tone = 'warn';
  } else if (run?.status === 'completed') {
    status = '실패';
    tone = 'error';
  }
  const active = ['queued', 'waiting', 'requested', 'in_progress', 'pending'].includes(run?.status);
  return {
    id: run?.id,
    number: run?.run_number,
    title: title.replace(/^NHIS\s*/, ''),
    trigger: run?.event === 'workflow_dispatch' ? '수동' : run?.event === 'schedule' ? '자동' : String(run?.event || '—'),
    status,
    tone,
    active,
    startedAt,
    duration: formatDuration(startedAt, active ? now : run?.updated_at),
    url: run?.html_url || ''
  };
}

export function buildCollectionRows(manifest, careManifest, photoTitles) {
  const catalog = Number(manifest?.catalogCount) || 0;
  const details = Number(manifest?.detailCount) || 0;
  const photos = Number(manifest?.photoManifestCount) || 0;
  const evaluations = Number(manifest?.evaluationCount) || 0;
  const categories = Object.keys(careManifest || {}).length;
  const categoryDates = Object.values(careManifest || {}).map(item => item?.sourceDate).filter(Boolean).sort();
  const titleTargets = Number(photoTitles?.targets) || 0;
  const titleResolved = Number(photoTitles?.resolved) || 0;
  return [
    { label: '기관 목록', current: catalog, total: catalog, rate: catalog ? 100 : null, status: catalog ? '수집 완료' : '자료 없음', tone: catalog ? 'good' : 'error', updatedAt: manifest?.updatedAt },
    { label: '기관 상세', current: details, total: catalog, rate: percentOf(details, catalog), status: details >= catalog && catalog ? '수집 완료' : '수집 중', tone: details >= catalog && catalog ? 'good' : 'running', updatedAt: manifest?.updatedAt },
    { label: '기관 평가', current: evaluations, totalLabel: '공개 평가 연결 수', rate: null, status: '자료 연결', tone: 'good', updatedAt: manifest?.updatedAt },
    { label: '사진 정보', current: photos, total: catalog, rate: percentOf(photos, catalog), status: Number(manifest?.photoCollection?.remaining) === 0 ? '수집 완료' : '수집 중', tone: Number(manifest?.photoCollection?.remaining) === 0 ? 'good' : 'running', updatedAt: manifest?.photoCollection?.updatedAt || manifest?.updatedAt },
    { label: '사진 제목 보완', current: titleResolved, total: titleTargets, rate: percentOf(titleResolved, titleTargets), status: Number(photoTitles?.remaining) === 0 ? '보완 완료' : `${formatNumber(photoTitles?.remaining)}건 확인 필요`, tone: Number(photoTitles?.remaining) === 0 ? 'good' : 'warn', updatedAt: photoTitles?.updatedAt },
    { label: '지도 검색 자료', current: categories, total: 9, rate: percentOf(categories, 9), status: categories === 9 ? '생성 완료' : '확인 필요', tone: categories === 9 ? 'good' : 'warn', updatedAt: categoryDates.at(-1) }
  ];
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function appendCell(row, value, { heading = false, className = '' } = {}) {
  const cell = createElement(heading ? 'th' : 'td', className, value);
  if (heading) cell.scope = 'row';
  row.append(cell);
  return cell;
}

function badge(label, tone = 'neutral') {
  return createElement('span', `status-badge is-${tone}`, label);
}

function appendProgressCell(row, rate, label) {
  const cell = appendCell(row, '', { className: 'progress-cell number-cell' });
  if (rate === null) {
    cell.textContent = '해당 없음';
    return;
  }
  const progress = document.createElement('progress');
  progress.max = 100;
  progress.value = rate;
  progress.setAttribute('aria-label', `${label} ${rate}%`);
  cell.append(progress, document.createTextNode(`${rate.toFixed(1)}%`));
}

function replaceRows(body, rows) {
  body.replaceChildren(...rows);
}

function errorRow(columns, message) {
  const row = createElement('tr', 'loading-row');
  const cell = appendCell(row, message);
  cell.colSpan = columns;
  return row;
}

function renderCollectionRows(manifest, careManifest, photoTitles) {
  const rows = buildCollectionRows(manifest, careManifest, photoTitles).map(item => {
    const row = document.createElement('tr');
    appendCell(row, item.label, { heading: true });
    appendCell(row, formatNumber(item.current), { className: 'number-cell' });
    appendCell(row, item.totalLabel || formatNumber(item.total), { className: item.totalLabel ? '' : 'number-cell' });
    appendProgressCell(row, item.rate, item.label);
    appendCell(row, '').append(badge(item.status, item.tone));
    appendCell(row, formatKoreanDate(item.updatedAt), { className: 'number-cell' });
    return row;
  });
  replaceRows(document.getElementById('collectionRows'), rows);
}

function scopeLabel(scope) {
  const labels = { catalog: '기관목록', details: '상세', evaluations: '평가', photos: '사진', all: '전체' };
  return (Array.isArray(scope) ? scope : String(scope || '').split(',')).filter(Boolean).map(item => labels[item] || item).join('·') || '—';
}

function modeLabel(mode) {
  return ({ incremental: '증분', rotation: '순환', full: '전체', institution: '지정 기관', retry: '실패 재처리', 'missing-only': '미수집분' })[mode] || mode || '—';
}

function renderPublishedRunRows(manifest, changes, photoTitles) {
  const lastRun = manifest?.lastRun || {};
  const photo = manifest?.photoCollection || {};
  const changeAdded = Array.isArray(changes?.added) ? changes.added.length : 0;
  const changeChanged = Array.isArray(changes?.changed) ? changes.changed.length : 0;
  const changeRemoved = Array.isArray(changes?.removed) ? changes.removed.length : 0;
  const definitions = [
    ['최근 정적 갱신', `${modeLabel(lastRun.mode)} · ${scopeLabel(lastRun.scope)}`, lastRun.targets, lastRun.processed, `${formatNumber(lastRun.updated)}건 갱신`, `${formatNumber(lastRun.failures)}건 실패`, manifest?.updatedAt],
    ['기관목록 비교', '이전 목록과 최신 API 비교', manifest?.catalogCount, '비교 완료', `신규 ${formatNumber(changeAdded)} · 변경 ${formatNumber(changeChanged)}`, `API 최신 조회 미포함 ${formatNumber(changeRemoved)}`, changes?.generatedAt],
    ['사진정보 전체', modeLabel(photo.mode), photo.targets, photo.processed, `${formatNumber(photo.success)}곳 처리`, `${formatNumber(photo.failed)}곳 실패 · ${formatNumber(photo.remaining)}곳 남음`, photo.updatedAt],
    ['사진 제목 보완', '줄임표 제목 원문 확인', photoTitles?.targets, photoTitles?.processed, `${formatNumber(photoTitles?.resolved)}건 보완`, `${formatNumber(photoTitles?.remaining)}건 확인 필요`, photoTitles?.updatedAt]
  ];
  const rows = definitions.map(definition => {
    const row = document.createElement('tr');
    definition.forEach((value, index) => appendCell(row, index === 6 ? formatKoreanDate(value) : typeof value === 'number' ? formatNumber(value) : value, { heading: index === 0, className: index >= 2 && index !== 5 ? 'number-cell' : '' }));
    return row;
  });
  replaceRows(document.getElementById('publishedRunRows'), rows);
}

function renderCategories(careManifest) {
  const rows = CATEGORY_ORDER.filter(key => careManifest?.[key]).map(key => {
    const item = careManifest[key];
    const row = document.createElement('tr');
    appendCell(row, item.label, { heading: true });
    appendCell(row, item.source === 'hira' ? '건강보험심사평가원' : '국민건강보험공단');
    appendCell(row, formatNumber(item.count), { className: 'number-cell' });
    appendCell(row, item.source === 'hira' ? '해당 없음' : formatNumber(item.evaluationCount), { className: 'number-cell' });
    appendCell(row, item.sourceDate || '—', { className: 'number-cell' });
    appendCell(row, '').append(badge('반영 완료', 'good'));
    return row;
  });
  replaceRows(document.getElementById('categoryRows'), rows.length ? rows : [errorRow(6, '유형별 자료가 없습니다.')]);
}

function renderShards(shards) {
  const available = shards.filter(Boolean).sort((a, b) => Number(a?.shard?.index) - Number(b?.shard?.index));
  const rows = available.map(item => {
    const row = document.createElement('tr');
    appendCell(row, `${Number(item.shard.index) + 1} / ${item.shard.count}`, { heading: true, className: 'number-cell' });
    appendCell(row, '').append(badge(item.completed ? '완료' : '진행 중', item.completed ? 'good' : 'running'));
    appendCell(row, formatNumber(item.processed), { className: 'number-cell' });
    appendCell(row, formatNumber(item.apiCalls), { className: 'number-cell' });
    appendCell(row, formatKoreanDate(item.updatedAt), { className: 'number-cell' });
    return row;
  });
  replaceRows(document.getElementById('shardRows'), rows.length ? rows : [errorRow(5, '샤드 체크포인트를 확인할 수 없습니다.')]);
  const completed = available.filter(item => item.completed).length;
  const processed = available.reduce((sum, item) => sum + (Number(item.processed) || 0), 0);
  document.getElementById('shardSummary').textContent = `${completed}/${SHARD_COUNT}개 완료 · 누적 처리 ${formatNumber(processed)}곳`;
}

function renderWorkflowRuns(payload) {
  const normalized = (payload?.workflow_runs || []).map(run => normalizeWorkflowRun(run));
  const rows = normalized.map(item => {
    const row = document.createElement('tr');
    appendCell(row, item.title, { heading: true });
    appendCell(row, item.trigger);
    appendCell(row, '').append(badge(item.status, item.tone));
    appendCell(row, formatKoreanDate(item.startedAt), { className: 'number-cell' });
    appendCell(row, item.duration, { className: 'number-cell' });
    const linkCell = appendCell(row, '');
    const link = createElement('a', 'run-link', item.number ? `#${item.number}` : String(item.id || '보기'));
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    linkCell.append(link);
    return row;
  });
  replaceRows(document.getElementById('workflowRows'), rows.length ? rows : [errorRow(6, '최근 실행 기록이 없습니다.')]);
  return normalized.some(item => item.active);
}

async function fetchJson(url) {
  const separator = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${separator}status=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    referrerPolicy: url.startsWith('https://api.github.com') ? 'no-referrer' : 'strict-origin-when-cross-origin'
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

async function loadPublishedStatus() {
  const shardRequests = Array.from({ length: SHARD_COUNT }, (_, index) => fetchJson(`data/nhis/checkpoints/full-${String(index).padStart(2, '0')}.json`).catch(() => null));
  const [manifest, changes, careManifest, photoTitles, shards] = await Promise.all([
    fetchJson('data/nhis/manifest.json'),
    fetchJson('data/nhis/changes.json'),
    fetchJson('data/care/manifest.json'),
    fetchJson('data/nhis/checkpoints/photo-titles.json'),
    Promise.all(shardRequests)
  ]);
  renderCollectionRows(manifest, careManifest, photoTitles);
  renderPublishedRunRows(manifest, changes, photoTitles);
  renderCategories(careManifest);
  renderShards(shards);
  const state = document.querySelector('.publish-state');
  state.classList.remove('is-error');
  state.classList.add('is-ready');
  document.getElementById('publishStateLabel').textContent = '공개 자료 정상';
  document.getElementById('publishedAt').textContent = `최근 데이터 반영 ${formatKoreanDate(manifest.updatedAt)} · 기관목록 ${formatNumber(manifest.catalogCount)}곳`;
}

let workflowTimer = 0;
async function loadWorkflowRuns() {
  window.clearTimeout(workflowTimer);
  try {
    const active = renderWorkflowRuns(await fetchJson(GITHUB_RUNS_URL));
    document.getElementById('workflowNote').textContent = active
      ? '실행 중인 작업이 있어 90초 뒤 자동으로 다시 확인합니다.'
      : '최근 실행 8건을 표시합니다. 월간 원본 갱신은 매월 1일에만 실제 수집합니다.';
    if (active) workflowTimer = window.setTimeout(() => {
      if (!document.hidden) loadWorkflowRuns();
    }, AUTO_REFRESH_MS);
  } catch (error) {
    console.error('[돌봄한눈 데이터 현황] GitHub Actions 상태를 불러오지 못했습니다.', error);
    replaceRows(document.getElementById('workflowRows'), [errorRow(6, '최근 실행을 불러오지 못했습니다. Actions에서 확인해 주세요.')]);
    document.getElementById('workflowNote').textContent = '배포된 수집 자료 현황은 위 표에서 계속 확인할 수 있습니다.';
  }
}

let refreshing = false;
async function refreshAll() {
  if (refreshing) return;
  refreshing = true;
  const button = document.getElementById('refreshStatus');
  button.disabled = true;
  button.textContent = '확인 중…';
  const published = loadPublishedStatus().catch(error => {
    console.error('[돌봄한눈 데이터 현황] 배포된 수집 자료를 불러오지 못했습니다.', error);
    const state = document.querySelector('.publish-state');
    state.classList.remove('is-ready');
    state.classList.add('is-error');
    document.getElementById('publishStateLabel').textContent = '자료 확인 실패';
    document.getElementById('publishedAt').textContent = '잠시 후 최신 상태 확인을 다시 눌러 주세요.';
  });
  await Promise.allSettled([published, loadWorkflowRuns()]);
  button.disabled = false;
  button.textContent = '최신 상태 확인';
  refreshing = false;
}

if (typeof document !== 'undefined') {
  document.getElementById('refreshStatus')?.addEventListener('click', refreshAll);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !workflowTimer) loadWorkflowRuns();
  });
  refreshAll();
}
/** SOFTM-DATA-STATUS END */
