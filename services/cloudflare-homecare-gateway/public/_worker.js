/** SOFTM-MEMBER-DOMAIN START 날짜:20261121 : 동일 사이트의 HTTPS API에서 보안 쿠키를 그대로 전달하고 내부 인증 경계 유지 */
/** SOFTM-DOMAIN-MIGRATION START 날짜:20261124 : 새 API 도메인을 기본으로 받고 이전 기간에만 기존 호스트를 함께 허용 */
const HOSTS = new Set(['api.dolbomhannun.kr', 'api.homecare.designboard.net', 'softm-homecare-api.pages.dev']);
const ORIGINS = new Set(['https://dolbomhannun.kr', 'https://api.dolbomhannun.kr', 'https://homecare.designboard.net', 'https://api.homecare.designboard.net']);
/** SOFTM-DOMAIN-MIGRATION END */

/** SOFTM-SEO-DOMAIN-REDIRECT START 날짜:20261127 : 구도메인의 검색 신호와 기존 공유 경로를 새 공식 도메인으로 승계 */
const LEGACY_SITE_HOST = 'homecare.designboard.net';
const OFFICIAL_SITE_ORIGIN = 'https://dolbomhannun.kr';

function redirectLegacySite(url) {
  const target = new URL(url.pathname + url.search, OFFICIAL_SITE_ORIGIN);
  return new Response(null, {
    status: 301,
    headers: {
      'Location': target.href,
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
/** SOFTM-SEO-DOMAIN-REDIRECT END */

function unavailable(request, status, code) {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', 'Vary': 'Origin' });
  const origin = request.headers.get('Origin');
  if (ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
  return Response.json({ error: { code, message: status === 503 ? '회원 서비스에 일시적으로 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' : '요청한 주소를 찾지 못했습니다.' } }, { status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === LEGACY_SITE_HOST) return redirectLegacySite(url); // SOFTM-SEO-DOMAIN-REDIRECT 날짜:20261127 : 모든 구주소의 경로와 쿼리를 일대일 301로 유지
    if (!HOSTS.has(url.hostname)) return unavailable(request, 421, 'host_denied');
    if (url.pathname !== '/health' && !url.pathname.startsWith('/api/')) return unavailable(request, 404, 'not_found');
    if (!env.MEMBERS?.fetch) return unavailable(request, 503, 'service_unavailable');
    const headers = new Headers(request.headers);
    headers.delete('Authorization');
    headers.delete('Host');
    // account.internal은 기관 Worker 전용 Bearer 검증 경로이므로 공개 게이트웨이에서 사용하지 않습니다.
    const target = new URL(url.pathname + url.search, 'https://members-gateway.internal');
    try {
      const upstream = await env.MEMBERS.fetch(new Request(target, {
        method: request.method, headers, redirect: 'manual',
        ...(!['GET', 'HEAD'].includes(request.method) ? { body: request.body, duplex: 'half' } : {}),
      }));
      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.set('Cache-Control', 'no-store');
      responseHeaders.set('X-Content-Type-Options', 'nosniff');
      responseHeaders.set('Referrer-Policy', 'no-referrer');
      responseHeaders.set('X-Robots-Tag', 'noindex');
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch {
      // 요청 URL·쿠키·인증 콜백과 upstream 오류 원문을 로그나 응답에 넣지 않습니다.
      return unavailable(request, 503, 'service_unavailable');
    }
  },
};
/** SOFTM-MEMBER-DOMAIN END */
