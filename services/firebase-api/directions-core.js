/** SOFTM-FIREBASE-DIRECTIONS START 날짜:20261026 : 공용 길찾기에서 비밀키 보호와 호출량 상한을 함께 유지 */
export const ALLOWED_ORIGINS = new Set([
  "https://homecare.designboard.net",
  "https://softm.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

export const NAVER_MAPS_API_KEY_ID = "etfcybk8vf";

const ALLOWED_OPTIONS = new Set([
  "trafast",
  "tracomfort",
  "traoptimal",
  "traavoidtoll",
  "traavoidcaronly",
]);
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const MAX_BODY_BYTES = 16_384;
const UPSTREAM_TIMEOUT_MS = 9_000;
const buckets = new Map();

function setResponseHeaders(req, res) {
  const origin = req.headers?.origin || "";
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Care-Directions-Version", "20261026-1");
}

function validPoint(point) {
  return point
    && Number.isFinite(point.lat)
    && Number.isFinite(point.lng)
    && point.lat >= 32
    && point.lat <= 40
    && point.lng >= 123
    && point.lng <= 133;
}

function coordinate(point) {
  return `${point.lng.toFixed(7)},${point.lat.toFixed(7)}`;
}

function requestKey(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "");
  return forwarded.split(",")[0].trim() || String(req.ip || "unknown");
}

function rateLimited(req, now) {
  if (buckets.size > 5_000) {
    for (const [key, value] of buckets) {
      if (now - value.startedAt >= WINDOW_MS) buckets.delete(key);
    }
  }
  const key = requestKey(req);
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    buckets.set(key, {startedAt: now, count: 1});
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS;
}

function bodyTooLarge(req) {
  const declared = Number(req.headers?.["content-length"] || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return true;
  try {
    return Buffer.byteLength(JSON.stringify(req.body || {}), "utf8") > MAX_BODY_BYTES;
  } catch {
    return true;
  }
}

export function resetRateLimitsForTest() {
  buckets.clear();
}

export function createDirectionsHandler({
  fetchImpl = globalThis.fetch,
  getApiSecret,
  now = Date.now,
  createTimeoutSignal = () => AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");
  if (typeof getApiSecret !== "function") throw new TypeError("API secret provider is required");

  return async function directionsHandler(req, res) {
    setResponseHeaders(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const origin = req.headers?.origin || "";
    if (!ALLOWED_ORIGINS.has(origin)) {
      return res.status(403).json({error: "허용되지 않은 호출 출처입니다."});
    }
    if (req.method !== "POST") {
      return res.status(405).json({error: "POST 요청만 지원합니다."});
    }
    if (bodyTooLarge(req)) {
      return res.status(413).json({error: "요청 데이터가 너무 큽니다."});
    }
    if (rateLimited(req, now())) {
      return res.status(429).json({error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요."});
    }

    const apiSecret = getApiSecret();
    if (!apiSecret) {
      return res.status(503).json({error: "Directions API 비밀키가 아직 설정되지 않았습니다."});
    }

    const {start, goal, waypoints = [], option = "traoptimal"} = req.body || {};
    if (!validPoint(start) || !validPoint(goal)) {
      return res.status(400).json({error: "출발지 또는 도착지 좌표가 올바르지 않습니다."});
    }
    if (!Array.isArray(waypoints) || waypoints.length > 15 || !waypoints.every(validPoint)) {
      return res.status(400).json({error: "경유지는 올바른 좌표로 최대 15곳까지 지정할 수 있습니다."});
    }

    const routeOption = ALLOWED_OPTIONS.has(option) ? option : "traoptimal";
    const params = new URLSearchParams({
      start: coordinate(start),
      goal: coordinate(goal),
      option: routeOption,
      lang: "ko",
    });
    if (waypoints.length) params.set("waypoints", waypoints.map(coordinate).join("|"));

    try {
      const upstream = await fetchImpl(
        `https://maps.apigw.ntruss.com/map-direction-15/v1/driving?${params}`,
        {
          headers: {
            "x-ncp-apigw-api-key-id": NAVER_MAPS_API_KEY_ID,
            "x-ncp-apigw-api-key": apiSecret,
          },
          signal: createTimeoutSignal(),
        },
      );
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok || data.code !== 0) {
        return res.status(upstream.status || 502).json({
          error: data.message || "네이버 Directions API 호출에 실패했습니다.",
          code: data.code,
        });
      }
      const route = data.route?.[routeOption]?.[0];
      if (!route) return res.status(502).json({error: "도로경로 결과가 없습니다."});
      return res.status(200).json({
        summary: route.summary,
        path: route.path,
        section: route.section || [],
      });
    } catch {
      return res.status(502).json({error: "Directions API 연결 중 오류가 발생했습니다."});
    }
  };
}
/** SOFTM-FIREBASE-DIRECTIONS END */
