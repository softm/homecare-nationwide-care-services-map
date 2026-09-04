/** SOFTM-SHARE-COMPACT START 날짜:20260905 : 선택 기관 번호를 짧게 보존해 긴 공유 주소가 지도 인증 요청을 깨뜨리지 않도록 처리 */
(function (root) {
    'use strict';
    const prefix = 'v1.';

    function encodeSelection(ids) {
        const numbers = [...new Set([...ids].filter(id => /^\d{11}$/.test(String(id))).map(Number))].sort((a, b) => a - b);
        const bytes = [];
        let previous = 0;
        for (const number of numbers) {
            let delta = number - previous;
            previous = number;
            while (delta >= 128) {
                bytes.push((delta % 128) + 128);
                delta = Math.floor(delta / 128);
            }
            bytes.push(delta);
        }
        return prefix + btoa(bytes.map(byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function decodeSelection(value) {
        if (!value) return [];
        if (!value.startsWith(prefix)) return [...new Set(value.split(',').filter(id => /^\d{11}$/.test(id)))];
        const payload = value.slice(prefix.length);
        if (!/^[\w-]*$/.test(payload) || payload.length > 80000) return [];
        try {
            const bytes = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
            const ids = [];
            let previous = 0, delta = 0, multiplier = 1;
            for (let index = 0; index < bytes.length; index++) {
                const byte = bytes.charCodeAt(index);
                delta += (byte % 128) * multiplier;
                if (delta + previous > 99999999999 || multiplier > 128 ** 5) return [];
                if (byte >= 128) {
                    multiplier *= 128;
                    continue;
                }
                if (ids.length && delta === 0) return [];
                previous += delta;
                ids.push(String(previous).padStart(11, '0'));
                delta = 0;
                multiplier = 1;
            }
            return multiplier === 1 ? ids : [];
        } catch { return []; }
    }

    function compactUrl(value) {
        const url = new URL(value);
        const selection = url.searchParams.get('sel');
        if (url.searchParams.get('share') !== '1' || !selection || selection.startsWith(prefix)) return url;
        const ids = decodeSelection(selection);
        if (ids.length) url.searchParams.set('sel', encodeSelection(ids));
        return url;
    }

    root.CareMapShare = { encodeSelection, decodeSelection, compactUrl };
    if (root.location && root.history) {
        const compact = compactUrl(root.location.href);
        if (compact.href !== root.location.href) root.history.replaceState(root.history.state, '', compact.href);
    }
})(globalThis);
/** SOFTM-SHARE-COMPACT END */
