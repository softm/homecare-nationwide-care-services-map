/** SOFTM-ROOT-MAP START 날짜:20260911 : 루트·명시적 index 진입과 검색·공유 상태 전달을 실제 진입 스크립트로 검증 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../index-map-entry.js', import.meta.url), 'utf8');
for (const address of ['https://homecare.designboard.net/', 'https://homecare.designboard.net/index.html?type=home-care&lat=37.48&lng=126.85&z=14#careSavedPanel', 'http://localhost:3000/?type=daycare']) {
    test(`root opens map preserving state: ${address}`, () => {
        const current = new URL(address); let replaced;
        runInNewContext(source, { URL, window: { location: { href: current.href, search: current.search, hash: current.hash, replace(value) { replaced = new URL(value); } } } });
        assert.equal(replaced.origin, current.origin);
        assert.equal(replaced.pathname, '/nationwide-care-services-map.html');
        assert.equal(replaced.search, current.search);
        assert.equal(replaced.hash, current.hash);
    });
}
/** SOFTM-ROOT-MAP END */
