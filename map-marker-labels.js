/** SOFTM-MARKER-INSIGHTS START 날짜:20260930 : 확대 단계와 실제 정보 카드의 충돌을 함께 검사해 선택 기관부터 근거를 점진적으로 공개 */
(function(root) {
    const classes = ['care-label-visible','care-label-measure','care-label-context','care-label-insight'];
    const overlaps = (a,b) => a.left < b.right+6 && a.right+6 > b.left && a.top < b.bottom+6 && a.bottom+6 > b.top;
    const inside = (rect,bounds) => rect.width > 0 && rect.height > 0 && rect.left >= bounds.left+8 && rect.right <= bounds.right-8 && rect.top >= bounds.top+8 && rect.bottom <= bounds.bottom-8;
    const detailLevel = zoom => zoom >= 18 ? 2 : zoom >= 16 ? 1 : 0;
    const markerScale = zoom => zoom < 14 ? 'dot' : zoom < 16 ? 'pin' : zoom < 18 ? 'name' : 'detail'; // SOFTM-MARKER-SCALE 날짜:20261005 : 위치점·핀의 크기 단계와 상세 현황 단계를 구분하며 이름은 모든 배율에서 배치
    /** SOFTM-LABEL-DENSITY START 날짜:20261005 : 이름을 일괄 숨기는 대신 지도 배율·화면 넓이로 표시 밀도만 조절 */
    function labelBudget(zoom, width, height) {
        const area = Math.max(0, width) * Math.max(0, height);
        if (!area) return 0;
        const spacing = zoom < 12 ? 50000 : zoom < 14 ? 35000 : zoom < 16 ? 24000 : 16000;
        const limit = zoom < 12 ? 6 : zoom < 14 ? 12 : zoom < 16 ? 24 : 40;
        return Math.max(1, Math.min(limit, Math.floor(area / spacing)));
    }
    /** SOFTM-LABEL-DENSITY END */
    function fitLevel(rects, bounds, obstacles) {
        for (let level=rects.length-1;level>=0;level--) {
            if (inside(rects[level],bounds) && !obstacles.some(other=>overlaps(rects[level],other))) return level;
        }
        return -1;
    }
    function setLevel(label,level,measure=false) {
        label.classList.remove(...classes);
        label.classList.add(measure ? 'care-label-measure' : 'care-label-visible');
        if (level >= 1) label.classList.add('care-label-context');
        if (level >= 2) label.classList.add('care-label-insight');
    }
    /** SOFTM-LABEL-PRIORITY START 날짜:20261007 : 입력 순서와 지도 중심에 영향받지 않는 표시 우선순위 */
    function compareLabels(a,b,retained) {
        return Number(b.selected)-Number(a.selected) || Number(retained.has(b.key))-Number(retained.has(a.key)) || a.key.localeCompare(b.key);
    }
    /** SOFTM-LABEL-PRIORITY END */
    function mount(host, map) {
        /** SOFTM-LABEL-STABLE START 날짜:20261007 : 같은 배율에서 재검색 순서나 중심의 작은 이동 때문에 이름이 교체되지 않도록 유지 */
        let timer;
        const retained = new Map();
        /** SOFTM-LABEL-STABLE END */
        function layout() {
            const zoom = map.getZoom();
            host.dataset.markerScale = markerScale(zoom); // SOFTM-MARKER-SCALE 날짜:20261005 : 실제 확대 배율로 마커 모양과 이름표 표시를 함께 갱신
            const bounds = host.getBoundingClientRect();
            const labels = [...host.querySelectorAll('.marker-name')];
            /** SOFTM-MARKER-PLACEMENT START 날짜:20260930 : 선택·배율 변경 뒤 이전 이동량이 다음 충돌 실측에 남지 않도록 초기화 */
            labels.forEach(label=>{
                label.classList.remove(...classes);
                label.style.removeProperty('translate');
            });
            /** SOFTM-MARKER-PLACEMENT END */
            if (!bounds.width || !bounds.height) return;
            const level = detailLevel(zoom); // SOFTM-MARKER-SCALE 날짜:20261007 : 16부터 평가 요약, 18부터 상세 현황을 여유 공간에서 추가
            const intersects = rect => rect.width && rect.height && rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom;
            const pins = [...host.querySelectorAll('.map-marker')].map(node=>node.getBoundingClientRect()).filter(intersects);
            const controls = [...host.parentElement.querySelectorAll('.map-controls,.care-region-research,.care-focus-controls button,.care-location-state'), ...root.document.querySelectorAll('.care-mobile-focus:not([hidden]) .care-mobile-focus-top,.care-mobile-focus:not([hidden]) .care-mobile-focus-side,.care-mobile-focus:not([hidden]) .care-mobile-focus-dock,body.care-mobile-focus-active .results')].map(node=>node.getBoundingClientRect()).filter(intersects); // SOFTM-MARKER-SCALE 날짜:20261005 : 지도 밖 레이어로 이동한 검색·메뉴·목록도 기관명 충돌 검사에 포함
            const occupied = new Map(); // SOFTM-MARKER-PLACEMENT 날짜:20260930 : 다른 기관 이름을 먼저 확보한 뒤 정보 확장 때 자신의 영역만 교체
            const candidates = labels.map(label=>({label,key:label.parentElement.dataset.markerId || label.textContent,selected:!!label.closest('.care-mobile-active-marker'),rects:[]}))
                .filter(item=>intersects(item.label.parentElement.getBoundingClientRect())); // SOFTM-LABEL-DENSITY 날짜:20261005 : 모든 배율에서 미선택 기관명도 배치 후보에 포함
            /** SOFTM-MARKER-PLACEMENT START 날짜:20260930 : 이름만 이동하고 핀의 실제 위치·선택 확대는 보존 */
            candidates.forEach(item=>{
                const parent = item.label.parentElement;
                const parentRect = parent.getBoundingClientRect();
                item.pin = parent.querySelector('.map-marker').getBoundingClientRect();
                const nearby = pins.filter(other=>overlaps(item.pin,other));
                const left = Math.min(item.pin.left,...nearby.map(rect=>rect.left));
                const top = Math.min(item.pin.top,...nearby.map(rect=>rect.top));
                const right = Math.max(item.pin.right,...nearby.map(rect=>rect.right));
                const bottom = Math.max(item.pin.bottom,...nearby.map(rect=>rect.bottom));
                item.pin = {left,top,right,bottom,width:right-left,height:bottom-top};
                item.scaleX = parentRect.width / parent.offsetWidth || 1;
                item.scaleY = parentRect.height / parent.offsetHeight || 1;
            });
            /** SOFTM-MARKER-PLACEMENT END */
            // 이름·평가·상세 현황의 실측을 단계별로 묶어 불필요한 반복 레이아웃을 줄입니다.
            for (let step=0;step<=level;step++) {
                candidates.forEach(item=>setLevel(item.label,step,true));
                candidates.forEach(item=>item.rects.push(item.label.getBoundingClientRect()));
            }
            candidates.forEach(item=>item.label.classList.remove(...classes));
            /** SOFTM-LABEL-STABLE START 날짜:20261007 : 선택·기존 표시·기관기호 순서를 고정해 중앙 거리와 DOM 순서에 따른 교체를 방지 */
            candidates.sort((a,b)=>compareLabels(a,b,retained));
            /** SOFTM-LABEL-STABLE END */
            let remaining = labelBudget(zoom,bounds.width,bounds.height); // SOFTM-LABEL-DENSITY 날짜:20261005 : 축소에서도 이름을 남기고 확대할수록 더 많은 기관명을 배치
            /** SOFTM-MARKER-PLACEMENT START 날짜:20260930 : 위쪽이 막히면 옆·아래를 찾고 모든 기관 이름을 예약한 뒤 남는 공간에 평가·현황을 확장 */
            const obstacles = item => [...pins,...controls,...[...occupied].filter(([other])=>other!==item).map(([,rect])=>rect)];
            for (const item of candidates) {
                /** SOFTM-SELECTED-ANCHOR START 날짜:20261007 : 선택 이름은 최초 CSS 위치에 고정하고 주변 이름만 회피시켜 지연 재배치 점프를 방지 */
                if (item.selected) {
                    setLevel(item.label, 0);
                    occupied.set(item, item.rects[0]);
                    retained.set(item.key, 'top');
                    continue;
                }
                /** SOFTM-SELECTED-ANCHOR END */
                if (!remaining) continue;
                item.placement = root.CareMarkerPlacement.fit(item.rects.slice(0,1),item.pin,bounds,obstacles(item),retained.get(item.key));
                if (item.placement) {
                    occupied.set(item,item.placement.rect);
                    if (!item.selected) remaining--;
                } else if (item.selected) {
                    occupied.set(item,item.label.getBoundingClientRect());
                }
            }
            for (const item of candidates) {
                if (!item.placement) continue;
                item.placement = root.CareMarkerPlacement.fit(item.rects,item.pin,bounds,obstacles(item),item.placement.side) || item.placement;
                const {level: fitted,rect,dx,dy} = item.placement;
                occupied.set(item,rect);
                setLevel(item.label,fitted);
                retained.set(item.key,item.placement.side); // SOFTM-LABEL-STABLE 날짜:20261007 : 재배치에서도 이름의 이전 방향을 우선 사용
                item.label.style.translate = `${dx/item.scaleX}px ${dy/item.scaleY}px`;
            }
            /** SOFTM-MARKER-PLACEMENT END */
            for (const key of retained.keys()) if (!candidates.some(item=>item.key===key && (item.selected || item.placement))) retained.delete(key); // SOFTM-LABEL-STABLE 날짜:20261007 : 화면을 벗어난 기관은 보관하지 않아 메모리와 우선순위 누적을 방지
        }
        const schedule = () => { clearTimeout(timer); timer=setTimeout(layout,100); };
        new MutationObserver(records=>{
            if(records.some(record=>!record.target.closest?.('.marker-name'))) schedule();
        }).observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
        new ResizeObserver(schedule).observe(host);
        root.naver.maps.Event.addListener(map,'zoom_changed',schedule); // SOFTM-MARKER-SCALE 날짜:20261005 : 재검색 완료를 기다리지 않고 배율 변경을 표시
        root.naver.maps.Event.addListener(map,'idle',schedule);
        schedule();
    }
    root.CareMarkerLabels = {mount,detailLevel,fitLevel,markerScale,labelBudget,compareLabels};
})(globalThis);
/** SOFTM-MARKER-INSIGHTS END */
