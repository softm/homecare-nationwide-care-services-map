/** SOFTM-GOOGLE-ADS-TEST START 날짜:20261010 : AdSense 승인 ID 전에는 외부 요청을 만들지 않고 실제 ID에서만 로더를 붙이는지 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../google-ads.js', import.meta.url), 'utf8');

function harness(config) {
  const scripts = [];
  const document = {
    readyState: 'complete',
    head: { appendChild(node) { scripts.push(node); } },
    createElement(tag) { return { tag, dataset: {}, set async(value) { this._async = value; }, set crossOrigin(value) { this._crossOrigin = value; } }; },
    querySelector(selector) { return selector === 'script[data-google-adsense-loader="true"]' ? scripts.find(node => node.dataset.googleAdsenseLoader === 'true') || null : null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  const context = { window: null, document, GOOGLE_ADS_CONFIG: config };
  context.window = context;
  vm.runInNewContext(source, context);
  return { context, scripts };
}

test('publisher ID가 없으면 AdSense 스크립트를 요청하지 않는다', () => {
  const { context, scripts } = harness({ enabled: true, publisherId: '', autoAds: { enabled: true } });
  assert.equal(context.GoogleAdsenseLoader.enabled(), false);
  assert.equal(scripts.length, 0);
});

test('승인 형식의 publisher ID에서만 AdSense 스크립트를 한 번 로드한다', () => {
  const { context, scripts } = harness({ enabled: true, publisherId: 'ca-pub-1234567890123456', autoAds: { enabled: true } });
  assert.equal(context.GoogleAdsenseLoader.enabled(), true);
  assert.equal(scripts.length, 1);
  assert.match(scripts[0].src, /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-1234567890123456/);
  assert.equal(context.GoogleAdsenseLoader.loadScript(), true);
  assert.equal(scripts.length, 1);
});
/** SOFTM-GOOGLE-ADS-TEST END */
