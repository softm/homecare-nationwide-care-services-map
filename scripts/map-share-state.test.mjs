/** SOFTM-SHARE-COMPACT START 날짜:20260905 : 긴 기존 주소·선택 집합·공유조건 보존과 SDK 이전 변환 순서를 회귀검사 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const script = readFileSync(new URL('../map-share-state.js', import.meta.url), 'utf8');
function load(extra = {}) {
    const context = vm.createContext({ URL, btoa, atob, ...extra });
    vm.runInContext(script, context);
    return context.CareMapShare;
}
const share = load();
const plain = value => JSON.parse(JSON.stringify(value));
const sampleIds = ["21126000140", "21162000375", "34111000504", "21129000175", "21138000006", "24136000891", "21150000169", "21123000120", "21153000216", "21159000283", "22826000633", "21141000161", "21153000229", "34157000030", "21135000397", "22817000200", "24141000150", "21156000274", "24129000005", "24129000007", "21135000013", "34115000600", "21138000149", "21123000102", "21174000293", "21126000131", "21138000165", "21120000139", "21130500233", "34121000038", "21144000011", "21141000013", "21130500232", "31132000303", "24117000395", "21138000221", "21144000151", "21123000318", "21144000097", "21162000291", "22817700474", "21120000012", "21156000120", "21138000023", "21147000184", "21156000009", "24113000039", "22871000131", "32820000386", "21168000177", "24121000233", "21156000211", "24131000217", "21144000015", "21141000044", "21153000133", "21162000245", "24127000042", "24129000008", "34111000553", "21171000017", "24115000840", "21147000060", "21150000192", "21135000017", "21135000033", "24121000220", "21150000567", "34128000847", "21174000250", "34128001019", "24113000588", "24111000778", "24136000813", "21144000108", "24117000421", "21111000066", "21114000075", "24146000621", "21165000009", "21135000128", "34163000179", "21154500202", "21156000253", "22824500389", "21144000024", "24139000426", "21138000437", "21168000103", "34111000431", "21121500243", "34163000088", "24119000052", "24113000327", "31132000338", "24136000735", "24125000165", "32820000371", "21129000197", "34113000463", "24127000942", "24129000006", "21117000016", "21168000073", "21129000101", "21123000108", "21130500186", "21126000387", "21174000163", "21123000265", "31123000235", "21159000030", "22824500404", "21159000245", "24128001461", "24127000009", "34128000755", "24119001035", "21162000118", "21144000152", "24157000328", "21168000204", "21141000072", "24113000267", "24163000438", "24111000700", "22823700625", "34117000237", "21141000248", "21165000134", "24127001027", "24127000022", "21138000080", "34128001072", "21135000581", "24115000879", "32811000104", "21130500379", "34148000431", "32817000385", "21168000126", "34119000931", "34119000149", "21150000303", "21120000120", "21168000267", "21129000023", "24117000004", "32824500287", "24119000007", "32820000174", "24117000499", "34128001113", "21121500235", "24157000334", "24148000568", "24117000413", "21111000034", "21168000102", "24157000431", "34148000337", "21150000004", "22826000548", "24128001123", "24157000333", "24131000172", "34115000561", "24125000029", "21144000179", "24111000036", "21130500075", "21111000085", "21162000286", "22811000136", "21165000099", "24111000498", "21171000427", "24111000692", "24145000170", "21141000185", "21154500265", "21147000399", "22824500255", "21117000055", "31138000366", "21129000044", "21171000120", "21120000032", "21154500179", "32820000635", "21114000061", "34128001121", "32826000080", "24128001352", "34111000678", "24113000676", "24115000808", "24115000784", "21114000036", "21135000336", "21154500223", "22823700569", "22824500420", "22818500265", "24111000773", "21174000373", "34163000275", "34141000172", "34127000469", "21138000150", "21168000206", "34111000516", "24113000647", "34115000458", "21117000158", "21129000102", "24113000041", "21150000404", "34128001165", "34128001092", "24157000274", "24146000865", "24131000163", "24136000880", "21150000181"];

test('225개 기관의 기존 공유 주소를 줄이고 같은 선택·조건·위치를 복원한다', () => {
    const url = new URL('https://homecare.designboard.net/nationwide-daycare-map.html');
    const values = { share: '1', p: '경기도', c: '광명시', sort: 'priority', conf: 'high', grades: 'A', sel: sampleIds.join(','), lat: '37.60108', lng: '126.64528', z: '10', map: '1', q: '한글 도로명 & 공백', af: '상세조건', unknown: '보존', empty: '' };
    for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
    url.hash = '#list';
    const compact = share.compactUrl(url.href);
    assert.ok(url.href.length > 3300);
    assert.ok(compact.href.length < 1200);
    assert.deepEqual(plain(share.decodeSelection(compact.searchParams.get('sel'))), [...sampleIds].sort());
    for (const [key, value] of Object.entries(values)) if (key !== 'sel') assert.equal(compact.searchParams.get(key), value);
    assert.equal(compact.hash, '#list');
    assert.equal(compact.pathname, url.pathname);
    assert.equal(share.compactUrl(compact.href).href, compact.href);
});

test('빈 선택·한 곳·32비트보다 큰 기관번호·중복을 정확하게 처리한다', () => {
    for (const ids of [[], ['99999999999'], ['00000000001', '21126000140', '99999999999', '21126000140'], sampleIds]) {
        assert.deepEqual(plain(share.decodeSelection(share.encodeSelection(ids))), [...new Set(ids)].sort());
    }
    assert.deepEqual(plain(share.decodeSelection('21126000140,21162000375')), ['21126000140', '21162000375']);
});

test('깨진 압축값이 부팅 오류나 잘못된 기관번호를 만들지 않는다', () => {
    for (const value of ['v1.!', 'v1.A', 'v1.gA', 'v1.' + btoa('\xff'.repeat(9)).replace(/\//g, '_')]) {
        assert.deepEqual(plain(share.decodeSelection(value)), []);
    }
});

test('지도 SDK 전에 같은 기록에서 주소만 짧게 바꾸며 기존 history.state를 유지한다', () => {
    const href = 'https://homecare.designboard.net/nationwide-daycare-map.html?share=1&sel=' + sampleIds.join('%2C');
    const state = { view: 'map' }, calls = [];
    load({ location: { href }, history: { state, replaceState: (...args) => calls.push(args) } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], state);
    assert.ok(calls[0][2].length < href.length);
    assert.deepEqual(plain(share.decodeSelection(new URL(calls[0][2]).searchParams.get('sel'))), [...sampleIds].sort());
});

test('공유가 아닌 일반 주소와 선택 목록이 없는 주소는 변경하지 않는다', () => {
    for (const href of ['https://homecare.designboard.net/nationwide-daycare-map.html', 'https://homecare.designboard.net/nationwide-daycare-map.html?share=1&lat=37.6&z=10', 'https://homecare.designboard.net/nationwide-daycare-map.html?sel=21126000140']) {
        assert.equal(share.compactUrl(href).href, href);
    }
});

test('전국 주간은 SDK 로드 전 변환기를 읽고 공유 생성과 복원에 함께 사용한다', () => {
    const html = readFileSync(new URL('../nationwide-daycare-map.html', import.meta.url), 'utf8');
    assert.ok(html.indexOf('src="map-share-state.js') < html.indexOf('function readSharedState'));
    assert.match(html, /selected:CareMapShare\.decodeSelection\(p\.get\('sel'\)\)/);
    assert.match(html, /put\('sel',CareMapShare\.encodeSelection\(selected\)\)/);
});
test('공유 지도 초기화는 한 번만 검색하며 먼저 시작한 사용자 검색을 덮지 않는다', async () => {
    const html = readFileSync(new URL('../nationwide-daycare-map.html', import.meta.url), 'utf8');
    const start = html.indexOf('function restoreSharedDaycareMap(');
    const fn = html.slice(start, html.indexOf('\n}', start) + 2);
    for (const mapSearch of [true, false]) {
        const calls = [], timers = [];
        let current = true;
        const query = { isCurrent: () => current };
        const context = vm.createContext({
            beginDaycareSearch: () => query, skipIdleUntil: 0,
            naver: { maps: { LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } } } },
            naverMap: { setCenter: point => calls.push(['center', point.lat, point.lng]), setZoom: zoom => calls.push(['zoom', zoom]) },
            setTimeout: callback => timers.push(callback),
            filtered: [{ i: 'one' }, { i: 'two' }], selected: new Set(['two']), MAP_LIMIT: 100,
            searchCurrentMap: async (...args) => { calls.push(['search', ...args]); return {}; },
            displayCenters: async (...args) => { calls.push(['display', ...args]); return {}; },
            finishDaycareSearch: (_query, outcome) => outcome,
            showToast: () => calls.push(['toast']),
        });
        vm.runInContext(fn, context);
        context.restoreSharedDaycareMap({ lat: 37.60108, lng: 126.64528, zoom: 10, mapSearch });
        assert.deepEqual(calls.slice(0, 2), [['center', 37.60108, 126.64528], ['zoom', 10]]);
        assert.equal(timers.length, 1);
        await timers.shift()();
        if (mapSearch) assert.deepEqual(calls.find(c => c[0] === 'search'), ['search', false, query, true]);
        else {
            assert.deepEqual(plain(calls.find(c => c[0] === 'display')[1]), [{ i: 'two' }]);
            assert.equal(calls.find(c => c[0] === 'display')[4], false, '공유된 중심과 배율을 fitBounds로 바꾸지 않음');
        }
        assert.equal(calls.filter(c => c[0] === 'search' || c[0] === 'display').length, 1);
        context.restoreSharedDaycareMap({ lat: 37.6, lng: 126.6, zoom: 10, mapSearch });
        current = false;
        const countBefore = calls.length;
        await timers.shift()();
        assert.equal(calls.length, countBefore, '사용자 조작 이후 초기 검색과 완료 알림을 실행하지 않음');
    }
});
/** SOFTM-SHARE-COMPACT END */
