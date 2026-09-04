/** SOFTM-DIRECTIONS-READINESS START 날짜:20260905 : 실제 공개 Origin의 CORS·경로 응답을 함께 확인해 코드와 배포 불일치를 탐지 */
const endpoint = process.argv[2] || 'https://daycare-directions-proxy.vercel.app/api/directions';
const origin = 'https://homecare.designboard.net';
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 15000);
try {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: { lat: 37.48145, lng: 126.84805 }, goal: { lat: 37.4979, lng: 127.0276 }, waypoints: [], option: 'traoptimal' }),
        signal: controller.signal
    });
    const allowOrigin = response.headers.get('access-control-allow-origin');
    const version = response.headers.get('x-care-directions-version') || '미확인';
    const data = await response.json().catch(() => ({}));
    if (allowOrigin !== origin) throw new Error(`공식 Origin 허용 헤더 누락 (HTTP ${response.status})`);
    if (!response.ok || data.error) throw new Error(data.error || `길찾기 서버 HTTP ${response.status}`);
    if (!Array.isArray(data.path) || data.path.length < 2 || !Number.isFinite(data.summary?.distance) || !Number.isFinite(data.summary?.duration)) throw new Error('길찾기 응답 형식이 올바르지 않습니다.');
    console.log(JSON.stringify({ endpoint, origin, status: response.status, version, distance: data.summary.distance, duration: data.summary.duration }));
} catch (error) {
    const reason = error?.name === 'AbortError' ? '길찾기 서버 응답 시간 초과' : error.message;
    console.error(`길찾기 공개 상태 검사 실패: ${reason}`);
    process.exitCode = 1;
} finally {
    clearTimeout(timer);
}
/** SOFTM-DIRECTIONS-READINESS END */
