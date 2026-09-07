/** SOFTM-INDEXNOW START 날짜:20260907 : 배포된 변경 URL만 네이버에 통지하고 키 미배포·타 도메인·대량 오제출을 차단 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const INDEXNOW_ORIGIN = 'https://homecare.designboard.net';
export const INDEXNOW_ENDPOINT = 'https://searchadvisor.naver.com/indexnow';
export const INDEXNOW_KEY = '91a7b2a3636189e640caa808f522e865';
export const INDEXNOW_KEY_LOCATION = `${INDEXNOW_ORIGIN}/${INDEXNOW_KEY}.txt`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function normalizeIndexNowUrls(values) {
  if (!values.length) throw new Error('변경한 URL을 --url /경로 형식으로 하나 이상 지정하세요.');
  const urls = [];
  for (const value of values) {
    const url = new URL(value, `${INDEXNOW_ORIGIN}/`);
    if (url.origin !== INDEXNOW_ORIGIN) throw new Error(`다른 도메인은 제출할 수 없습니다: ${value}`);
    url.hash = '';
    if (!urls.includes(url.href)) urls.push(url.href);
  }
  if (urls.length > 100) throw new Error('한 번에 100개 이하의 실제 변경 URL만 제출하세요.');
  return urls;
}

export function indexNowPayload(urlList) {
  return {
    host: new URL(INDEXNOW_ORIGIN).hostname,
    key: INDEXNOW_KEY,
    keyLocation: INDEXNOW_KEY_LOCATION,
    urlList,
  };
}

function parseArguments(argv) {
  const values = [];
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--dry-run') { dryRun = true; continue; }
    if (argv[index] !== '--url' || !argv[index + 1]) throw new Error(`지원하지 않는 인수입니다: ${argv[index]}`);
    values.push(argv[index + 1]);
    index += 1;
  }
  return { urls: normalizeIndexNowUrls(values), dryRun };
}

export async function submitIndexNow(urls, { fetchImpl = fetch } = {}) {
  const localKey = fs.readFileSync(path.join(ROOT, `${INDEXNOW_KEY}.txt`), 'utf8').trim();
  if (localKey !== INDEXNOW_KEY) throw new Error('로컬 IndexNow 키 파일 내용이 설정과 다릅니다.');
  const keyResponse = await fetchImpl(INDEXNOW_KEY_LOCATION, { headers: { accept: 'text/plain' } });
  if (!keyResponse.ok || (await keyResponse.text()).trim() !== INDEXNOW_KEY) {
    throw new Error('IndexNow 키가 공개 사이트에 아직 배포되지 않았습니다. 배포 확인 후 다시 실행하세요.');
  }
  const response = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(indexNowPayload(urls)),
  });
  if (![200, 202].includes(response.status)) throw new Error(`IndexNow 요청 실패: HTTP ${response.status}`);
  return response.status;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { urls, dryRun } = parseArguments(process.argv.slice(2));
    if (dryRun) console.log(JSON.stringify(indexNowPayload(urls), null, 2));
    else console.log(`IndexNow 요청 완료: HTTP ${await submitIndexNow(urls)} · ${urls.length}개 URL`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
/** SOFTM-INDEXNOW END */
