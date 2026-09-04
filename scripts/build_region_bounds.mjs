/** SOFTM-VIEWPORT-REGIONS START 날짜:20260904 : 표본 지점 사이의 시군구도 검색하도록 보존한 경계 원본에서 범위 인덱스를 재생성 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = 'source-data/regions/HangJeongDong_ver20260401.geojson.gz';
const geo = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, source))));
const regions = {};

function extend(key, lng, lat) {
    const box = regions[key] ||= [Infinity, Infinity, -Infinity, -Infinity];
    box[0] = Math.min(box[0], lng);
    box[1] = Math.min(box[1], lat);
    box[2] = Math.max(box[2], lng);
    box[3] = Math.max(box[3], lat);
}

function visit(coordinates, keys) {
    if (typeof coordinates[0] === 'number') {
        const [lng, lat] = coordinates;
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error('경계 좌표 오류');
        keys.forEach(key => extend(key, lng, lat));
    } else coordinates.forEach(points => visit(points, keys));
}

for (const feature of geo.features) {
    const province = feature.properties.sidonm;
    const city = feature.properties.sggnm.replace(/\s+/g, '');
    if (!province || !city) throw new Error('경계 지역명 누락');
    const keys = [`${province}|${city}`, `${province}|`];
    const parent = city.match(/^(.+?시).+구$/)?.[1];
    if (parent) keys.push(`${province}|${parent}`);
    visit(feature.geometry.coordinates, keys);
}

const ordered = Object.fromEntries(Object.entries(regions).sort(([a], [b]) => a.localeCompare(b, 'ko')).map(([key, box]) => [key,
    box.map((value, index) => (index < 2 ? Math.floor(value * 1e6) : Math.ceil(value * 1e6)) / 1e6)
]));
const result = { version: '20260401', source, regions: ordered };
const comment = '/** SOFTM-VIEWPORT-REGIONS START 날짜:20260904 : SGIS·vuski/admdongkor 경계를 시군구 범위로 가공, 출처·라이선스는 source-data/regions/README.md 참조 */\n';
fs.writeFileSync(path.join(root, 'region-bounds.js'), comment + 'window.NATIONAL_REGION_BOUNDS=' + JSON.stringify(result) + ';\n/** SOFTM-VIEWPORT-REGIONS END */\n');
console.log(`행정구역 범위 생성: ${geo.features.length}개 행정동 → ${Object.keys(ordered).length}개 시도·시군구 범위`);
/** SOFTM-VIEWPORT-REGIONS END */
