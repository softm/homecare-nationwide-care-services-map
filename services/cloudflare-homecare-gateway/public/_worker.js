/** SOFTM-MEMBER-DOMAIN START 날짜:20261121 : 동일 사이트의 HTTPS API에서 보안 쿠키를 그대로 전달하고 내부 인증 경계 유지 */
/** SOFTM-DOMAIN-MIGRATION START 날짜:20261124 : 새 API 도메인을 기본으로 받고 이전 기간에만 기존 호스트를 함께 허용 */
const HOSTS = new Set(['api.dolbomhannun.kr', 'api.homecare.designboard.net', 'softm-homecare-api.pages.dev']);
const ORIGINS = new Set(['https://dolbomhannun.kr', 'https://api.dolbomhannun.kr', 'https://homecare.designboard.net', 'https://api.homecare.designboard.net']);
/** SOFTM-DOMAIN-MIGRATION END */

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
