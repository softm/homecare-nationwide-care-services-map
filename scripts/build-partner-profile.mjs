/** SOFTM-PARTNER-PROFILE START 날짜:20260917 : 방문자 규모와 무관하게 납품할 수 있는 광고주 승인 소개 페이지를 안전하게 생성 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function buildProfile(data) {
  for (const field of ['name', 'intro', 'region', 'hours', 'contact', 'url']) {
    if (typeof data[field] !== 'string' || !data[field].trim() || data[field].length > 2000) throw new Error(`필수 항목 또는 길이 확인: ${field}`);
  }
  const url = new URL(data.url);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('연결 주소는 로그인 정보가 없는 HTTPS 주소여야 합니다.');
  if (!Array.isArray(data.services) || !data.services.length || data.services.length > 8 || data.services.some(s => typeof s !== 'string' || !s.trim() || s.length > 300)) throw new Error('서비스를 1~8개 입력하세요.');
  if (data.sample !== true && data.approved !== true) throw new Error('실제 소개 페이지는 광고주의 소재 승인이 필요합니다.');
  const sample = data.sample === true;
  return `<!doctype html>
<!-- SOFTM-PARTNER-PROFILE START 날짜:20260917 : 광고주 제공 내용을 공단 평가와 구분한 독립 소개 자료 -->
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,follow"><title>${escape(data.name)} · 서비스 소개</title>
<style>body{margin:0;background:#f4f7fb;color:#1b3049;font:17px/1.8 system-ui,sans-serif;word-break:keep-all;overflow-wrap:anywhere}*{box-sizing:border-box}main{max-width:850px;margin:auto;padding:40px 24px}header{padding:40px 32px;background:#173b64;color:white;border-radius:16px}header small{display:block;font-size:14px}h1{font-size:38px;line-height:1.3;margin:18px 0}section{background:white;padding:28px 32px;margin-top:20px;border:1px solid #d9e2ee;border-radius:16px}h2{font-size:24px;margin:0 0 12px}dt{font-size:14px;color:#536b84}dd{margin:0 0 16px}a{display:inline-block;padding:12px 20px;border-radius:8px;background:#175cb5;color:white}footer{font-size:14px;margin-top:24px;color:#536b84}.sample{background:#fff1ce;color:#604500;padding:16px;border-radius:8px;margin-bottom:20px}@media(max-width:600px){main{padding:20px 16px}header,section{padding:24px}h1{font-size:30px}}@media print{body{background:white}main{padding:0}header{background:white;color:#173b64;border:1px solid #d9e2ee}section{break-inside:avoid}a{background:white;color:#175cb5}a:after{content:' (' attr(href) ')';font-size:12px}}</style></head>
<body><main>${sample ? '<p class="sample">제작 견본 · 가상 업체입니다. 실제 기관·계약·이용 가능 서비스를 의미하지 않습니다.</p>' : ''}<header><small>${sample ? '제작 견본' : '광고 · 업체 제공 정보'}</small><h1>${escape(data.name)}</h1><p>${escape(data.intro)}</p></header><section><h2>제공 서비스</h2><ul>${data.services.map(service => `<li>${escape(service)}</li>`).join('')}</ul></section><section><h2>이용 안내</h2><dl><dt>서비스 지역</dt><dd>${escape(data.region)}</dd><dt>운영 시간</dt><dd>${escape(data.hours)}</dd><dt>연락처</dt><dd>${escape(data.contact)}</dd></dl>${sample ? '<p>실제 납품본에는 사업자의 확인된 홈페이지 연결 버튼이 들어갑니다.</p>' : `<a href="${escape(url.href)}" rel="sponsored noopener noreferrer" target="_blank">서비스 문의하기</a>`}</section><footer>돌봄한눈 소개 자료 제작 · ${sample ? '가상 내용으로 만든 구성 예시' : '광고주가 제공하고 승인한 정보'}입니다. 공단·심평원의 공식 평가 또는 추천이 아닙니다. 실제 서비스 조건은 해당 사업자에게 확인하세요.</footer></main></body></html>
<!-- SOFTM-PARTNER-PROFILE END -->\n`;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('사용법: node scripts/build-partner-profile.mjs 입력.json 출력.html');
  const html = buildProfile(JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.writeFileSync(output, html, { flag: 'wx' });
  console.log(`소개 페이지 생성 완료: ${output}`);
}
/** SOFTM-PARTNER-PROFILE END */
