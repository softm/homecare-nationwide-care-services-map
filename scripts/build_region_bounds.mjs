/** SOFTM-VIEWPORT-CANDIDATES START 날짜:20260914 : 행정동 경계와 공식 법정동 관할 관계로 누락 없는 지도 후보 범위를 재생성 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = 'source-data/regions/HangJeongDong_ver20260401.geojson.gz';
const relationSource = 'source-data/regions/KIKmix.20260325.gz';
const geo = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, source))));
const relationBytes = zlib.gunzipSync(fs.readFileSync(path.join(root, relationSource)));
const regions = {};
const neighborhoods = {};
const outlineEdges = new Map();
const legalNamesByAdminCode = new Map();
const decoder = new TextDecoder('euc-kr');

/** SOFTM-VIEWPORT-CANDIDATES START 날짜:20260914 : 행정동과 관할 법정동의 공식 관계만 경계 축소에 사용 */
for (const rawLine of relationBytes.toString('latin1').split(/\r?\n/).slice(1)) {
    const line = Buffer.from(rawLine, 'latin1'), adminCode = line.subarray(0, 10).toString('ascii');
    const legalName = decoder.decode(line.subarray(115, 146)).trim();
    if (!/^\d{10}$/.test(adminCode) || !/(?:읍|면|동|가)$/u.test(legalName)) continue;
    if (!legalNamesByAdminCode.has(adminCode)) legalNamesByAdminCode.set(adminCode, new Set());
    legalNamesByAdminCode.get(adminCode).add(legalName.replace(/\s+/g, ''));
}
/** SOFTM-VIEWPORT-CANDIDATES END */

function extend(index, key, lng, lat) {
    const box = index[key] ||= [Infinity, Infinity, -Infinity, -Infinity];
    box[0] = Math.min(box[0], lng);
    box[1] = Math.min(box[1], lat);
    box[2] = Math.max(box[2], lng);
    box[3] = Math.max(box[3], lat);
}

function visit(coordinates, regionKeys, neighborhoodKeys) {
    if (typeof coordinates[0] === 'number') {
        const [lng, lat] = coordinates;
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error('경계 좌표 오류');
        regionKeys.forEach(key => extend(regions, key, lng, lat));
        neighborhoodKeys.forEach(key => extend(neighborhoods, key, lng, lat));
    } else coordinates.forEach(points => visit(points, regionKeys, neighborhoodKeys));
}

/** SOFTM-REGION-OUTLINE START 날짜:20261128 : 행정동 공통 변을 제거해 시도·시군구의 실제 외곽선만 생성 */
const pointKey = point => `${Number(point[0]).toFixed(7)},${Number(point[1]).toFixed(7)}`;
function addOutlineRing(ring, regionKeys) {
    for (let index = 1; index < ring.length; index++) {
        const from = ring[index - 1], to = ring[index], fromKey = pointKey(from), toKey = pointKey(to);
        if (fromKey === toKey) continue;
        const edgeKey = fromKey < toKey ? `${fromKey}|${toKey}` : `${toKey}|${fromKey}`;
        for (const regionKey of regionKeys) {
            if (!outlineEdges.has(regionKey)) outlineEdges.set(regionKey, new Map());
            const edges = outlineEdges.get(regionKey), edge = edges.get(edgeKey);
            if (edge) edge.count += 1;
            else edges.set(edgeKey, { from: [Number(from[0]), Number(from[1])], to: [Number(to[0]), Number(to[1])], fromKey, toKey, count: 1 });
        }
    }
}
function visitOutlineRings(coordinates, regionKeys) {
    if (Array.isArray(coordinates?.[0]) && typeof coordinates[0][0] === 'number') addOutlineRing(coordinates, regionKeys);
    else coordinates.forEach(points => visitOutlineRings(points, regionKeys));
}
function pointSegmentDistanceSquared(point, start, end) {
    const dx = end[0] - start[0], dy = end[1] - start[1];
    if (!dx && !dy) return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
    const ratio = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
    return (point[0] - (start[0] + ratio * dx)) ** 2 + (point[1] - (start[1] + ratio * dy)) ** 2;
}
function simplifyPath(points, toleranceSquared = 1.6e-7) {
    if (points.length <= 4) return points;
    const keep = new Uint8Array(points.length); keep[0] = 1; keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [start, end] = stack.pop(); let farthest = -1, distance = toleranceSquared;
        for (let index = start + 1; index < end; index++) {
            const candidate = pointSegmentDistanceSquared(points[index], points[start], points[end]);
            if (candidate > distance) { distance = candidate; farthest = index; }
        }
        if (farthest > 0) { keep[farthest] = 1; stack.push([start, farthest], [farthest, end]); }
    }
    return points.filter((_, index) => keep[index]);
}
function buildOutlinePaths(edges) {
    const boundary = [...edges.values()].filter(edge => edge.count % 2 === 1), adjacency = new Map();
    boundary.forEach((edge, index) => {
        for (const key of [edge.fromKey, edge.toKey]) { if (!adjacency.has(key)) adjacency.set(key, []); adjacency.get(key).push(index); }
    });
    const visited = new Uint8Array(boundary.length), paths = [];
    for (let first = 0; first < boundary.length; first++) {
        if (visited[first]) continue;
        const startEdge = boundary[first], startKey = startEdge.fromKey, points = [startEdge.from];
        let edgeIndex = first, currentKey = startEdge.fromKey;
        for (let guard = 0; guard <= boundary.length; guard++) {
            const edge = boundary[edgeIndex]; visited[edgeIndex] = 1;
            const nextKey = edge.fromKey === currentKey ? edge.toKey : edge.fromKey;
            points.push(edge.fromKey === currentKey ? edge.to : edge.from); currentKey = nextKey;
            if (currentKey === startKey) break;
            const nextEdge = (adjacency.get(currentKey) || []).find(index => !visited[index]);
            if (nextEdge === undefined) break;
            edgeIndex = nextEdge;
        }
        if (points.length >= 4 && currentKey === startKey) {
            const simplified = simplifyPath(points).map(([lng, lat]) => [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]);
            if (simplified.length >= 4) paths.push(simplified);
        }
    }
    return paths;
}
/** SOFTM-REGION-OUTLINE END */

for (const feature of geo.features) {
    const province = feature.properties.sidonm;
    const city = feature.properties.sggnm.replace(/\s+/g, '');
    if (!province || !city) throw new Error('경계 지역명 누락');
    const keys = [`${province}|${city}`, `${province}|`];
    const parent = city.match(/^(.+?시).+구$/)?.[1];
    if (parent) keys.push(`${province}|${parent}`);
    const adminCode = String(feature.properties.adm_cd2 || ''), legalNames = legalNamesByAdminCode.get(adminCode);
    if (!legalNames?.size) throw new Error(`행정동 관할 법정동 연결 누락: ${adminCode}`);
    const neighborhoodKeys = [];
    for (const legalName of legalNames) {
        neighborhoodKeys.push(`${province}|${city}|${legalName}`);
        if (parent) neighborhoodKeys.push(`${province}|${parent}|${legalName}`);
    }
    visit(feature.geometry.coordinates, keys, neighborhoodKeys);
    visitOutlineRings(feature.geometry.coordinates, keys);
}

function orderedBounds(index) {
    return Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b, 'ko')).map(([key, box]) => [key,
    box.map((value, index) => (index < 2 ? Math.floor(value * 1e6) : Math.ceil(value * 1e6)) / 1e6)
]));
}

const orderedRegions = orderedBounds(regions), orderedNeighborhoods = orderedBounds(neighborhoods);
const orderedOutlines = Object.fromEntries([...outlineEdges].sort(([a], [b]) => a.localeCompare(b, 'ko')).map(([key, edges]) => [key, buildOutlinePaths(edges)]));
const result = { version: '20260401', source, relationSource, regions: orderedRegions, neighborhoods: orderedNeighborhoods };
const comment = '/** SOFTM-VIEWPORT-CANDIDATES START 날짜:20260914 : 행정동 경계와 행정안전부 관할 법정동 관계를 시군구·읍면동 후보 범위로 가공, 출처는 source-data/regions/README.md 참조 */\n';
fs.writeFileSync(path.join(root, 'region-bounds.js'), comment + 'window.NATIONAL_REGION_BOUNDS=' + JSON.stringify(result) + ';\n/** SOFTM-VIEWPORT-CANDIDATES END */\n');
const outlineComment = '/** SOFTM-REGION-OUTLINE START 날짜:20261128 : 지역 조건 조회 때만 지연 로드하는 실제 시도·시군구 외곽선 */\n';
fs.writeFileSync(path.join(root, 'region-outlines.js'), outlineComment + 'window.NATIONAL_REGION_OUTLINES=' + JSON.stringify({ version: '20260401', source, outlines: orderedOutlines }) + ';\n/** SOFTM-REGION-OUTLINE END */\n');
console.log(`행정구역 범위 생성: ${geo.features.length}개 행정동 → ${Object.keys(orderedRegions).length}개 시도·시군구 · ${Object.keys(orderedNeighborhoods).length}개 법정 읍면동 범위 · ${Object.values(orderedOutlines).reduce((sum, paths) => sum + paths.length, 0)}개 외곽선`);
/** SOFTM-VIEWPORT-CANDIDATES END */
