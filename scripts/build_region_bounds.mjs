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
}

function orderedBounds(index) {
    return Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b, 'ko')).map(([key, box]) => [key,
    box.map((value, index) => (index < 2 ? Math.floor(value * 1e6) : Math.ceil(value * 1e6)) / 1e6)
]));
}

const orderedRegions = orderedBounds(regions), orderedNeighborhoods = orderedBounds(neighborhoods);
const result = { version: '20260401', source, relationSource, regions: orderedRegions, neighborhoods: orderedNeighborhoods };
const comment = '/** SOFTM-VIEWPORT-CANDIDATES START 날짜:20260914 : 행정동 경계와 행정안전부 관할 법정동 관계를 시군구·읍면동 후보 범위로 가공, 출처는 source-data/regions/README.md 참조 */\n';
fs.writeFileSync(path.join(root, 'region-bounds.js'), comment + 'window.NATIONAL_REGION_BOUNDS=' + JSON.stringify(result) + ';\n/** SOFTM-VIEWPORT-CANDIDATES END */\n');
console.log(`행정구역 범위 생성: ${geo.features.length}개 행정동 → ${Object.keys(orderedRegions).length}개 시도·시군구 · ${Object.keys(orderedNeighborhoods).length}개 법정 읍면동 범위`);
/** SOFTM-VIEWPORT-CANDIDATES END */
