/** SOFTM-GEOCODER-SDK START 날짜:20260902 : 두 지도가 서버 프록시 없이 같은 SDK 주소 변환·캐시·요청 제한을 사용하도록 공통화 */
(function initNaverGeocoder(global) {
    const MAX_CONCURRENT_REQUESTS = 4;
    const SERVICE_READY_TIMEOUT_MS = 3000;
    const SERVICE_READY_POLL_MS = 100;
    const ADDRESS_CACHE_PREFIX = 'naverGeocoder:v1:address:';
    const REVERSE_CACHE_PREFIX = 'naverGeocoder:v1:reverse:';
    const addressMemoryCache = new Map();
    const reverseMemoryCache = new Map();
    const addressTasks = new Map();
    const queryTasks = new Map();
    const reverseTasks = new Map();
    const requestQueue = [];
    const reportedErrors = new Set();
    let activeRequests = 0;
    let errorHandler = null;

    function normalizeAddressKey(value) {
        return String(value || '')
            .normalize('NFKC')
            .replace(/[()[\]{}]/g, ' ')
            .replace(/[,·]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function simplifyAddress(value) {
        const clean = String(value || '')
            .normalize('NFKC')
            .replace(/\([^)]*\)/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const road = clean.match(/^(.+?(?:대로|로|길)\s*\d+(?:-\d+)?)(?:\s|$)/);
        if (road) return road[1].trim();
        return clean.replace(/\s+(?:지하\s*)?\d+(?:층|호)(?:\s.*)?$/u, '').trim();
    }

    function validCoord(value) {
        return value && Number.isFinite(value.lat) && Number.isFinite(value.lng)
            && value.lat >= -90 && value.lat <= 90 && value.lng >= -180 && value.lng <= 180;
    }

    function storageRead(storageKey, memoryCache, validator) {
        if (memoryCache.has(storageKey)) return memoryCache.get(storageKey);
        try {
            const value = JSON.parse(global.localStorage.getItem(storageKey) || 'null');
            if (validator(value)) {
                memoryCache.set(storageKey, value);
                return value;
            }
        } catch {}
        return null;
    }

    function storageWrite(storageKey, value, memoryCache) {
        memoryCache.set(storageKey, value);
        try {
            global.localStorage.setItem(storageKey, JSON.stringify(value));
        } catch {}
    }

    function runQueue() {
        while (activeRequests < MAX_CONCURRENT_REQUESTS && requestQueue.length) {
            const item = requestQueue.shift();
            activeRequests += 1;
            Promise.resolve()
                .then(item.task)
                .then(item.resolve, item.reject)
                .finally(() => {
                    activeRequests -= 1;
                    runQueue();
                });
        }
    }

    function enqueue(task) {
        return new Promise((resolve, reject) => {
            requestQueue.push({ task, resolve, reject });
            runQueue();
        });
    }

    function reportError(key, message, error) {
        if (!reportedErrors.has(key)) {
            reportedErrors.add(key);
            console.error(`[네이버 Maps geocoder] ${message}`, error || '');
            if (typeof errorHandler === 'function') errorHandler(message);
        }
    }

    async function serviceFor(operation) {
        const startedAt = Date.now();
        while (Date.now() - startedAt <= SERVICE_READY_TIMEOUT_MS) {
            const service = global.naver?.maps?.Service;
            if (service && typeof service[operation] === 'function') return service;
            await new Promise(resolve => setTimeout(resolve, SERVICE_READY_POLL_MS));
        }
        reportError(`missing-${operation}`, '네이버 지도 주소 변환 모듈을 불러오지 못했습니다. 해당 위치만 제외하고 계속합니다.');
        return null;
    }

    function requestGeocode(query) {
        const queryKey = normalizeAddressKey(query);
        if (queryTasks.has(queryKey)) return queryTasks.get(queryKey);
        const task = enqueue(async () => {
            const service = await serviceFor('geocode');
            if (!service) {
                return null;
            }
            return new Promise(resolve => {
                try {
                    service.geocode({ query }, (status, response) => {
                        if (status !== service.Status.OK) {
                            reportError(`geocode-status-${status}`, `주소 좌표 변환에 실패했습니다. (상태: ${status})`);
                            resolve(null);
                            return;
                        }
                        const item = (response?.v2?.addresses || [])[0];
                        const value = item ? { lat: Number(item.y), lng: Number(item.x) } : null;
                        resolve(validCoord(value) ? value : null);
                    });
                } catch (error) {
                    reportError('geocode-exception', '주소 좌표 변환 실행 중 오류가 발생했습니다.', error);
                    resolve(null);
                }
            });
        }).finally(() => queryTasks.delete(queryKey));
        queryTasks.set(queryKey, task);
        return task;
    }

    async function geocodeAddress(address) {
        const addressKey = normalizeAddressKey(address);
        if (!addressKey) return null;
        const storageKey = ADDRESS_CACHE_PREFIX + addressKey;
        const cached = storageRead(storageKey, addressMemoryCache, validCoord);
        if (cached) return cached;
        if (addressTasks.has(addressKey)) return addressTasks.get(addressKey);
        const task = (async () => {
            const queries = [...new Set([String(address || '').trim(), simplifyAddress(address)].filter(Boolean))].slice(0, 2);
            for (const query of queries) {
                const value = await requestGeocode(query);
                if (!validCoord(value)) continue;
                storageWrite(storageKey, value, addressMemoryCache);
                const simplifiedKey = normalizeAddressKey(query);
                if (simplifiedKey) storageWrite(ADDRESS_CACHE_PREFIX + simplifiedKey, value, addressMemoryCache);
                return value;
            }
            return null;
        })().finally(() => addressTasks.delete(addressKey));
        addressTasks.set(addressKey, task);
        return task;
    }

    /** SOFTM-ORIGIN-SEARCH START 날짜:20260905 : 출발지 주소는 첫 결과를 임의 선택하지 않고 사용자가 후보를 확인 */
    async function searchAddresses(query) {
        const text = String(query || '').trim();
        if (!text) return [];
        return enqueue(async () => {
            const service = await serviceFor('geocode');
            if (!service) throw new Error('주소 검색을 준비하지 못했습니다. 잠시 후 다시 검색해 주세요.');
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('주소 검색이 지연되고 있습니다. 다시 검색해 주세요.')), 10000);
                try {
                    service.geocode({ query: text }, (status, response) => {
                        clearTimeout(timer);
                        if (status !== service.Status.OK) { reject(new Error('주소 검색에 실패했습니다. 도로명과 건물번호를 확인해 주세요.')); return; }
                        const seen = new Set();
                        const candidates = (response?.v2?.addresses || []).map(item => ({ label: item.roadAddress || item.jibunAddress || '', point: { lat: Number(item.y), lng: Number(item.x) } })).filter(item => {
                            const key = `${item.label}:${item.point.lat}:${item.point.lng}`;
                            if (!item.label || !validCoord(item.point) || seen.has(key)) return false;
                            seen.add(key); return true;
                        });
                        resolve(candidates);
                    });
                } catch (error) { clearTimeout(timer); reject(error); }
            });
        });
    }
    /** SOFTM-ORIGIN-SEARCH END */

    function areaName(region, key) {
        return String(region?.[key]?.name || '').trim();
    }

    function landNumber(land) {
        const first = String(land?.number1 || '').trim();
        const second = String(land?.number2 || '').trim();
        return first ? first + (second ? `-${second}` : '') : '';
    }

    function compactRegion(region) {
        return {
            area1: { name: areaName(region, 'area1') },
            area2: { name: areaName(region, 'area2') },
            area3: { name: areaName(region, 'area3') },
            area4: { name: areaName(region, 'area4') }
        };
    }

    function compactLand(land) {
        return {
            type: String(land?.type || ''),
            name: String(land?.name || '').trim(),
            number1: String(land?.number1 || '').trim(),
            number2: String(land?.number2 || '').trim(),
            addition0: {
                type: String(land?.addition0?.type || ''),
                value: String(land?.addition0?.value || '').trim()
            }
        };
    }

    function joinAddress(parts) {
        return parts.map(value => String(value || '').trim()).filter(Boolean).join(' ');
    }

    function buildReverseResult(results) {
        const road = results.find(item => item?.name === 'roadaddr');
        const jibun = results.find(item => item?.name === 'addr');
        const primary = road || jibun || results[0];
        if (!primary?.region) return null;
        const region = primary.region;
        const area1 = areaName(region, 'area1');
        const area2 = areaName(region, 'area2');
        const area3 = areaName(region, 'area3');
        const area4 = areaName(region, 'area4');
        const separateWard = /(?:시|군)$/u.test(area2) && /구$/u.test(area3);
        const city = separateWard ? `${area2} ${area3}` : (area2 || area3);
        const neighborhood = separateWard ? area4 : area3;
        const roadRegion = road?.region || region;
        const roadAddress = road ? joinAddress([
            areaName(roadRegion, 'area1'),
            separateWard ? `${areaName(roadRegion, 'area2')} ${areaName(roadRegion, 'area3')}` : areaName(roadRegion, 'area2'),
            road.land?.name,
            landNumber(road.land)
        ]) : '';
        const jibunRegion = jibun?.region || region;
        const jibunAddress = jibun ? joinAddress([
            areaName(jibunRegion, 'area1'),
            areaName(jibunRegion, 'area2'),
            areaName(jibunRegion, 'area3'),
            areaName(jibunRegion, 'area4'),
            jibun.land?.name,
            landNumber(jibun.land)
        ]) : '';
        const fullAddress = roadAddress || jibunAddress || joinAddress([area1, area2, area3, area4]);
        return {
            province: area1,
            city,
            district: neighborhood,
            neighborhood,
            roadAddress,
            jibunAddress,
            address: fullAddress,
            fullAddress,
            region: compactRegion(region),
            land: compactLand(primary.land)
        };
    }

    function validReverseResult(value) {
        return value && typeof value.province === 'string' && typeof value.city === 'string'
            && Boolean(value.province || value.city || value.address);
    }

    async function reverseGeocode(lat, lng) {
        const latitude = Number(lat);
        const longitude = Number(lng);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
            || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw new Error('역주소 변환 좌표가 올바르지 않습니다.');
        }
        const cacheKey = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
        const storageKey = REVERSE_CACHE_PREFIX + cacheKey;
        const cached = storageRead(storageKey, reverseMemoryCache, validReverseResult);
        if (cached) return cached;
        if (reverseTasks.has(cacheKey)) return reverseTasks.get(cacheKey);
        const task = enqueue(async () => {
            const service = await serviceFor('reverseGeocode');
            if (!service) {
                throw new Error('네이버 지도 주소 변환 모듈이 준비되지 않았습니다.');
            }
            const coords = new global.naver.maps.LatLng(latitude, longitude);
            const orders = [service.OrderType.ROAD_ADDR, service.OrderType.ADDR].join(',');
            return new Promise((resolve, reject) => {
                try {
                    service.reverseGeocode({ coords, orders }, (status, response) => {
                        if (status !== service.Status.OK) {
                            reportError(`reverse-status-${status}`, `역주소 변환에 실패했습니다. (상태: ${status})`);
                            reject(new Error('현재 지도 행정구역 조회에 실패했습니다.'));
                            return;
                        }
                        const value = buildReverseResult(response?.v2?.results || []);
                        if (!validReverseResult(value)) {
                            reject(new Error('현재 지도 위치의 주소를 찾지 못했습니다.'));
                            return;
                        }
                        storageWrite(storageKey, value, reverseMemoryCache);
                        resolve(value);
                    });
                } catch (error) {
                    reportError('reverse-exception', '역주소 변환 실행 중 오류가 발생했습니다.', error);
                    reject(new Error('현재 지도 행정구역 조회 중 오류가 발생했습니다.'));
                }
            });
        }).finally(() => reverseTasks.delete(cacheKey));
        reverseTasks.set(cacheKey, task);
        return task;
    }

    function setErrorHandler(handler) {
        errorHandler = typeof handler === 'function' ? handler : null;
    }

    global.NaverGeocoder = {
        searchAddresses, // SOFTM-ORIGIN-SEARCH 날짜:20260905 : 기관 좌표 캐시와 별도로 출발지 주소 후보 제공
        geocodeAddress,
        reverseGeocode,
        normalizeAddressKey,
        simplifyAddress,
        setErrorHandler
    };
    global.geocodeAddress = geocodeAddress;
    global.reverseGeocode = reverseGeocode;
})(window);
/** SOFTM-GEOCODER-SDK END */
