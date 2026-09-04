/** SOFTM-DATA-UNIFIED START 날짜:20260904 : 압축·캐시·누락 처리와 두 지도의 공용 입력을 회귀검사 */
import fs from 'node:fs';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../care-data.js', import.meta.url), 'utf8');
function loader(fetch) {
    const context = vm.createContext({ window: {}, document: { baseURI: 'https://example.test/sub/map.html' }, fetch, URL, Blob, Response, TextDecoder, DecompressionStream, Uint8Array });
    vm.runInContext(source, context);
    return context.window.CareData;
}
const metadata = { daycare: { file: 'daycare.json.gz', revision: 'abc', count: 1 } };
for (const compressed of [true, false]) {
    test(`수집 JSON 읽기: ${compressed ? 'gzip 파일' : '서버가 압축 해제한 응답'}`, async () => {
        const requests = [];
        const api = loader(async url => {
            requests.push(String(url));
            const value = String(url).includes('manifest.json') ? metadata : [{ i: '1', n: '기관', cw: 3, ev: { grade: 'A' } }];
            const body = JSON.stringify(value);
            return new Response(compressed ? gzipSync(body) : body);
        });
        const [a, b] = await Promise.all([api.category('daycare'), api.category('daycare')]);
        assert.equal(a, b);
        assert.equal(a[0].cw, 3);
        assert.equal(requests.length, 2);
        assert.ok(requests[1].includes('/sub/data/care/daycare.json.gz?v=abc'));
    });
}
test('로드 실패 후 재시도 가능하며 실패를 빈 목록으로 표시하지 않음', async () => {
    let failed = true;
    const api = loader(async url => String(url).includes('manifest.json') ? new Response(JSON.stringify(metadata)) : failed ? new Response('', { status: 404 }) : new Response('[{"i":"1"}]'));
    await assert.rejects(api.category('daycare'), /404/);
    failed = false;
    assert.equal((await api.category('daycare')).length, 1);
});
test('배포 중 개수 불일치는 명시적으로 오류 처리', async () => {
    const api = loader(async url => new Response(JSON.stringify(String(url).includes('manifest.json') ? metadata : [])));
    await assert.rejects(api.category('daycare'), /갱신 중/);
});
/** SOFTM-DATA-UNIFIED END */
