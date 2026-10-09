/** SOFTM-GOOGLE-ADS START 날짜:20261010 : AdSense Auto ads와 수동 슬롯을 승인된 publisher ID가 있을 때만 요청 */
(function (root) {
  'use strict';
  const config = root.GOOGLE_ADS_CONFIG || {};
  const publisherId = String(config.publisherId || '').trim();
  const validPublisher = /^ca-pub-\d{10,}$/.test(publisherId);

  function enabled() {
    return config.enabled !== false && validPublisher;
  }

  function loadScript() {
    if (!enabled()) return false;
    if (root.document.querySelector('script[data-google-adsense-loader="true"]')) return true;
    const script = root.document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.googleAdsenseLoader = 'true';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisherId)}`;
    root.document.head.appendChild(script);
    root.adsbygoogle = root.adsbygoogle || [];
    return true;
  }

  function renderDisplayAds(scope = root.document) {
    if (!loadScript() || config.display?.enabled === false) return 0;
    const nodes = [...scope.querySelectorAll('ins.adsbygoogle[data-ad-slot]:not([data-google-ad-requested])')];
    for (const node of nodes) {
      node.dataset.adClient = publisherId;
      node.dataset.googleAdRequested = 'true';
      try {
        (root.adsbygoogle = root.adsbygoogle || []).push({});
      } catch {
        node.dataset.googleAdRequested = 'error';
      }
    }
    return nodes.length;
  }

  if (config.autoAds?.enabled !== false) loadScript();
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => renderDisplayAds(), { once: true });
  else renderDisplayAds();

  root.GoogleAdsenseLoader = Object.freeze({ enabled, loadScript, renderDisplayAds });
})(typeof window === 'undefined' ? globalThis : window);
/** SOFTM-GOOGLE-ADS END */
