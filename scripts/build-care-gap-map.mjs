/** SOFTM-CARE-GAP-DATA START 날짜:20261123 : 공식 고령인구·장기요양 인정자와 현재 기관 목록을 같은 시군구 단위로 결합 */
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'data/care-gap/regions.json');
const fallbackBoundaryPath = path.join(root, 'source-data/regions/HangJeongDong_ver20260401.geojson.gz');
const manifestPath = path.join(root, 'data/care/manifest.json');
const GENERATED_AT = '2026-11-23';
const POPULATION_DATE = '2026-10-31';
const RECOGNITION_DATE = '2026-08-31';
const INSTITUTION_DATE = '2026-09-30';
const COMBINED_PROVINCE = '전남광주통합특별시';
const GWANGJU_REGIONS = new Set(['동구', '서구', '남구', '북구', '광산구']);
const GEOMDAN_LEGAL_DONGS = new Set(['금곡동', '당하동', '대곡동', '마전동', '백석동', '불로동', '시천동', '오류동', '왕길동', '원당동']);
const YEONGJONG_LEGAL_DONGS = new Set(['중산동', '운남동', '운서동', '운북동', '남북동', '덕교동', '을왕동', '무의동']);
const CARE_TYPES = [
    ['facility', '요양원·공동생활가정'],
    ['daycare', '주·야간보호'],
    ['home-care', '방문요양'],
    ['home-nursing', '방문간호'],
    ['home-bath', '방문목욕'],
    ['short-stay', '단기보호'],
    ['welfare-equipment', '복지용구'],
    ['dementia', '치매전담형']
];
const ALL_TYPES = CARE_TYPES.filter(([type]) => type !== 'dementia').map(([type]) => type);
const RECOGNITION_FIELDS = ['1등급', '2등급', '3등급', '4등급', '5등급', '인지지원등급'];

function args(argv = process.argv.slice(2)) {
    const result = { check: false };
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--check') result.check = true;
        else if (value === '--population-csv') result.population = argv[++index];
        else if (value === '--recognition-csv') result.recognition = argv[++index];
        else if (value === '--boundary-geojson') result.boundary = argv[++index];
        else throw new Error(`알 수 없는 인수: ${value}`);
    }
    return result;
}

export function parseCsv(source) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (quoted) {
            if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
            else if (char === '"') quoted = false;
            else field += char;
        } else if (char === '"') quoted = true;
        else if (char === ',') { row.push(field); field = ''; }
        else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
        else field += char;
    }
    if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
    const header = rows.shift()?.map(value => value.replace(/^\uFEFF/, '').trim()) || [];
    return rows.filter(values => values.some(Boolean)).map(values => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
}

function decodeCsv(buffer) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { return new TextDecoder('euc-kr').decode(buffer); }
}

function number(value) {
    const parsed = Number(String(value ?? '').replaceAll(',', '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value) {
    return String(value ?? '').replaceAll(/\s+/g, '').trim();
}

function province(value) {
    const current = String(value ?? '').trim();
    return ['광주광역시', '전라남도', COMBINED_PROVINCE].includes(current) ? COMBINED_PROVINCE : current;
}

function regionName(value, provinceName) {
    const current = String(value ?? '').trim();
    if (current === '_' && provinceName === '세종특별자치시') return '세종시';
    return current === '당진군' ? '당진시' : current;
}

function regionKey(provinceName, currentRegion) {
    return `${provinceName}|${currentRegion}`;
}

function emptyRecognition() {
    return { estimate: 0, min: 0, max: 0, suppressed: 0 };
}

function addRecognition(target, row) {
    for (const field of RECOGNITION_FIELDS) {
        const value = String(row[field] ?? '').trim();
        if (value === '*') {
            target.estimate += 2.5;
            target.min += 1;
            target.max += 4;
            target.suppressed += 1;
        } else {
            const parsed = number(value);
            target.estimate += parsed;
            target.min += parsed;
            target.max += parsed;
        }
    }
}

function sourceMapProvince(provinceName, currentRegion) {
    if (provinceName !== COMBINED_PROVINCE) return provinceName;
    return GWANGJU_REGIONS.has(currentRegion) ? '광주광역시' : '전라남도';
}

function addressDong(address) {
    const parenthetical = String(address ?? '').match(/\(([^()]*)\)\s*$/)?.[1]?.split(',')[0]?.trim();
    return parenthetical || String(address ?? '').match(/([가-힣]+(?:읍|면|동|가))(?=\s|,|\)|$)/)?.[1] || '';
}

function institutionRegionCandidate(row) {
    const provinceName = province(row.p);
    let currentRegion = String(row.c ?? '').trim();
    if (provinceName !== '인천광역시') return { provinceName, currentRegion };
    if (currentRegion === '남구') currentRegion = '미추홀구';
    else if (currentRegion === '동구') currentRegion = '제물포구';
    else if (currentRegion === '중구') currentRegion = YEONGJONG_LEGAL_DONGS.has(addressDong(row.a)) ? '영종구' : '제물포구';
    else if (currentRegion === '서구') currentRegion = GEOMDAN_LEGAL_DONGS.has(addressDong(row.a)) ? '검단구' : '서해구';
    return { provinceName, currentRegion };
}

function recognitionRegions(rows) {
    const regions = new Map();
    for (const row of rows) {
        const provinceName = province(row['시도']);
        const currentRegion = regionName(row['시군구'], provinceName);
        if (!provinceName || !currentRegion) continue;
        const key = regionKey(provinceName, currentRegion);
        if (!regions.has(key)) regions.set(key, {
            id: key,
            province: provinceName,
            region: currentRegion,
            mapProvince: sourceMapProvince(provinceName, currentRegion),
            recognition: emptyRecognition(),
            recognitionAllAges: emptyRecognition(),
            population: 0,
            elderly: 0,
            institutions: Object.fromEntries([['all', new Set()], ...CARE_TYPES.map(([type]) => [type, new Set()])]),
            polygons: [],
            centroidParts: []
        });
        const target = regions.get(key);
        addRecognition(target.recognitionAllAges, row);
        if (row['연령구분'] !== '65세미만') addRecognition(target.recognition, row);
    }
    return regions;
}

function resolveRegion(regions, provinceName, candidate) {
    const records = [...regions.values()].filter(row => row.province === provinceName);
    if (provinceName === '세종특별자치시') return records.find(row => row.region === '세종시') || null;
    const compact = normalize(candidate);
    const exact = records.find(row => normalize(row.region) === compact);
    if (exact) return exact;
    return records
        .filter(row => compact.startsWith(normalize(row.region)))
        .sort((left, right) => normalize(right.region).length - normalize(left.region).length)[0] || null;
}

function attachPopulation(regions, rows) {
    const provinceNames = [...new Set([...regions.values()].map(row => row.province))].sort((a, b) => b.length - a.length);
    for (const row of rows) {
        const label = String(row['행정구역'] ?? '').replace(/\s*\(\d+\)\s*$/, '').trim();
        const provinceName = provinceNames.find(value => label === value || label.startsWith(`${value} `));
        if (!provinceName) continue;
        const remainder = label.slice(provinceName.length).trim();
        const currentRegion = provinceName === '세종특별자치시' && !remainder ? '세종시' : remainder;
        const target = resolveRegion(regions, provinceName, currentRegion);
        if (!target || normalize(target.region) !== normalize(currentRegion)) continue;
        target.population = number(row[`${POPULATION_DATE.slice(0, 4)}년${Number(POPULATION_DATE.slice(5, 7))}월_전체`]);
        target.elderly = number(row[`${POPULATION_DATE.slice(0, 4)}년${Number(POPULATION_DATE.slice(5, 7))}월_65세이상전체`]);
    }
}

async function attachInstitutions(regions, manifest) {
    let unmatched = 0;
    for (const [type] of CARE_TYPES) {
        const compressed = await readFile(path.join(root, 'data/care', manifest[type].file));
        const rows = JSON.parse(gunzipSync(compressed).toString('utf8'));
        for (const row of rows) {
            const candidate = institutionRegionCandidate(row);
            const target = resolveRegion(regions, candidate.provinceName, candidate.currentRegion);
            if (!target) { unmatched += 1; continue; }
            target.institutions[type].add(String(row.i));
            if (ALL_TYPES.includes(type)) target.institutions.all.add(String(row.i));
        }
    }
    return unmatched;
}

function perpendicularDistance(point, start, end) {
    const dx = end[0] - start[0], dy = end[1] - start[1];
    if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
    return Math.abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / Math.hypot(dx, dy);
}

function simplifyOpen(points, tolerance) {
    if (points.length <= 2) return points;
    let maxDistance = 0, split = 0;
    for (let index = 1; index < points.length - 1; index += 1) {
        const distance = perpendicularDistance(points[index], points[0], points.at(-1));
        if (distance > maxDistance) { maxDistance = distance; split = index; }
    }
    if (maxDistance <= tolerance) return [points[0], points.at(-1)];
    return [...simplifyOpen(points.slice(0, split + 1), tolerance).slice(0, -1), ...simplifyOpen(points.slice(split), tolerance)];
}

export function simplifyRing(ring, tolerance = 0.00065) {
    if (!Array.isArray(ring) || ring.length < 4) return null;
    const compact = ring.map(([lng, lat]) => [Number(lng.toFixed(5)), Number(lat.toFixed(5))]);
    if (compact[0][0] === compact.at(-1)[0] && compact[0][1] === compact.at(-1)[1]) compact.pop();
    const simplified = simplifyOpen([...compact, compact[0]], tolerance);
    if (simplified.length < 4) return null;
    const first = simplified[0], last = simplified.at(-1);
    if (first[0] !== last[0] || first[1] !== last[1]) simplified.push([...first]);
    return simplified.length >= 4 ? simplified : null;
}

function polygonCentroid(ring) {
    let twiceArea = 0, x = 0, y = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
        const [x1, y1] = ring[index], [x2, y2] = ring[index + 1];
        const cross = x1 * y2 - x2 * y1;
        twiceArea += cross;
        x += (x1 + x2) * cross;
        y += (y1 + y2) * cross;
    }
    if (Math.abs(twiceArea) < 1e-12) return null;
    return { area: Math.abs(twiceArea / 2), lng: x / (3 * twiceArea), lat: y / (3 * twiceArea) };
}

async function attachBoundaries(regions, selectedPath) {
    const buffer = await readFile(selectedPath);
    const geojson = JSON.parse(selectedPath.endsWith('.gz') ? gunzipSync(buffer).toString('utf8') : buffer.toString('utf8'));
    let unmatched = 0;
    for (const feature of geojson.features) {
        const properties = feature.properties || {};
        const target = resolveRegion(regions, province(properties.sidonm), properties.sggnm);
        if (!target) { unmatched += 1; continue; }
        const polygons = feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry?.coordinates];
        for (const polygon of polygons) {
            if (!Array.isArray(polygon)) continue;
            const rings = polygon.map(ring => simplifyRing(ring)).filter(Boolean);
            if (!rings.length) continue;
            target.polygons.push(rings);
            const centroid = polygonCentroid(rings[0]);
            if (centroid) target.centroidParts.push(centroid);
        }
    }
    return unmatched;
}

function round(value, digits = 1) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function centroid(parts) {
    const area = parts.reduce((sum, part) => sum + part.area, 0);
    if (!area) return [127.8, 36.35];
    return [
        round(parts.reduce((sum, part) => sum + part.lng * part.area, 0) / area, 5),
        round(parts.reduce((sum, part) => sum + part.lat * part.area, 0) / area, 5)
    ];
}

function feature(record) {
    const recognition = Math.round(record.recognition.estimate);
    const counts = Object.fromEntries(Object.entries(record.institutions).map(([type, values]) => [type, values.size]));
    return {
        type: 'Feature',
        properties: {
            id: record.id,
            province: record.province,
            region: record.region,
            label: `${record.province} ${record.region}`,
            mapProvince: record.mapProvince,
            mapLegacyCity: record.province === '인천광역시' ? ({ 검단구: '서구', 서해구: '서구', 영종구: '중구' }[record.region] || '') : '',
            population: record.population,
            elderly: record.elderly,
            elderlyRate: record.population ? round(record.elderly / record.population * 100, 1) : 0,
            recognized: recognition,
            recognizedMin: record.recognition.min,
            recognizedMax: record.recognition.max,
            recognizedRate: record.elderly ? round(recognition / record.elderly * 100, 1) : 0,
            recognizedRateMin: record.elderly ? round(record.recognition.min / record.elderly * 100, 1) : 0,
            recognizedRateMax: record.elderly ? round(record.recognition.max / record.elderly * 100, 1) : 0,
            suppressedCells: record.recognition.suppressed,
            recognizedAllAges: Math.round(record.recognitionAllAges.estimate),
            centroid: centroid(record.centroidParts),
            counts
        },
        geometry: { type: 'MultiPolygon', coordinates: record.polygons }
    };
}

function validate(collection) {
    const failures = [];
    if (collection.type !== 'FeatureCollection') failures.push('GeoJSON 유형');
    if (collection.features.length < 225) failures.push(`지역 수 ${collection.features.length}`);
    const ids = new Set();
    for (const item of collection.features) {
        const p = item.properties;
        if (!p?.id || ids.has(p.id)) failures.push(`중복 또는 빈 지역 ${p?.id}`); else ids.add(p.id);
        if (!p.population || !p.elderly || !p.recognized) failures.push(`${p?.id}: 인구·인정자 누락`);
        if (!item.geometry?.coordinates?.length) failures.push(`${p?.id}: 경계 누락`);
        if (!Number.isFinite(p?.counts?.all)) failures.push(`${p?.id}: 기관 집계 누락`);
    }
    if (failures.length) throw new Error(`돌봄 공백 지도 데이터 검증 실패\n${failures.slice(0, 30).join('\n')}`);
    return collection;
}

async function build(options) {
    if (!options.population || !options.recognition) throw new Error('--population-csv와 --recognition-csv가 필요합니다.');
    const [populationBuffer, recognitionBuffer, manifest] = await Promise.all([
        readFile(path.resolve(options.population)), readFile(path.resolve(options.recognition)),
        readFile(manifestPath, 'utf8').then(JSON.parse)
    ]);
    const regions = recognitionRegions(parseCsv(decodeCsv(recognitionBuffer)));
    attachPopulation(regions, parseCsv(decodeCsv(populationBuffer)));
    const institutionUnmatched = await attachInstitutions(regions, manifest);
    const selectedBoundary = path.resolve(options.boundary || fallbackBoundaryPath);
    const boundaryUnmatched = await attachBoundaries(regions, selectedBoundary);
    const features = [...regions.values()].map(feature).sort((a, b) => a.properties.label.localeCompare(b.properties.label, 'ko'));
    const collection = validate({
        type: 'FeatureCollection',
        meta: {
            generatedAt: GENERATED_AT,
            populationDate: POPULATION_DATE,
            recognitionDate: RECOGNITION_DATE,
            institutionDate: INSTITUTION_DATE,
            boundaryDate: options.boundary ? '2026-10-01' : '2026-04-01',
            recognitionDefinition: '65세 이상 장기요양 1~5등급·인지지원등급 인정자',
            suppressionMethod: '공단 비식별값 *는 1~4명 범위를 보존하고 지도 색상에는 중간값 2.5명을 사용',
            institutionDefinition: '공단 장기요양기관 목록의 기관기호를 급여 유형별·지역별로 중복 제거',
            types: Object.fromEntries([['all', '전체 장기요양기관'], ...CARE_TYPES]),
            coreTypes: ALL_TYPES,
            sources: [
                { label: '행정안전부 주민등록 인구통계', date: POPULATION_DATE, url: 'https://jumin.mois.go.kr/etcStatOldAge.do' },
                { label: '국민건강보험공단 노인장기요양보험 등급판정 현황', date: RECOGNITION_DATE, url: 'https://www.data.go.kr/data/3051421/fileData.do' },
                { label: '대한민국 행정동 경계(admdongkor)', date: options.boundary ? '2026-10-01' : '2026-04-01', url: 'https://github.com/vuski/admdongkor' },
                { label: '돌봄한눈 국민건강보험공단 장기요양기관 수집 목록', date: INSTITUTION_DATE, url: 'https://homecare.designboard.net/data-status.html' }
            ],
            diagnostics: { institutionUnmatched, boundaryUnmatched }
        },
        features
    });
    const json = `${JSON.stringify(collection)}\n`;
    collection.meta.revision = createHash('sha256').update(json).digest('hex').slice(0, 16);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(collection)}\n`);
    return collection;
}

async function main() {
    const options = args();
    if (options.check) {
        const collection = validate(JSON.parse(await readFile(outputPath, 'utf8')));
        console.log(`돌봄 공백 지도 데이터 확인: ${collection.features.length}개 지역 · ${collection.meta.revision}`);
        return;
    }
    const collection = await build(options);
    console.log(`돌봄 공백 지도 데이터 생성: ${collection.features.length}개 지역 · ${collection.meta.revision}`);
    console.log(`기관 지역 미연결 ${collection.meta.diagnostics.institutionUnmatched}건 · 경계 미연결 ${collection.meta.diagnostics.boundaryUnmatched}건`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
/** SOFTM-CARE-GAP-DATA END */
