/** SOFTM-MARKER-INSIGHTS START 날짜:20260930 : 확대 단계와 실제 정보 카드의 충돌을 함께 검사해 선택 기관부터 근거를 점진적으로 공개 */
(function(root) {
    const classes = ['care-label-visible','care-label-measure','care-label-context','care-label-insight'];
    const overlaps = (a,b) => a.left < b.right+6 && a.right+6 > b.left && a.top < b.bottom+6 && a.bottom+6 > b.top;
    const inside = (rect,bounds) => rect.width > 0 && rect.height > 0 && rect.left >= bounds.left+8 && rect.right <= bounds.right-8 && rect.top >= bounds.top+8 && rect.bottom <= bounds.bottom-8;
    const detailLevel = zoom => zoom >= 18 ? 2 : zoom >= 16 ? 1 : 0;
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
    function mount(host, map) {
        let timer;
        function layout() {
            const bounds = host.getBoundingClientRect();
            const labels = [...host.querySelectorAll('.marker-name')];
            labels.forEach(label=>label.classList.remove(...classes));
            if (!bounds.width || !bounds.height) return;
            const compact = host.classList.contains('care-compact-markers');
            const level = detailLevel(map.getZoom());
            if (compact && level === 0) return;
            const intersects = rect => rect.width && rect.height && rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom;
            const pins = [...host.querySelectorAll('.map-marker')].map(node=>node.getBoundingClientRect()).filter(intersects);
            const controls = [...host.parentElement.querySelectorAll('.map-controls,.care-region-research,.care-map-focus-list')].map(node=>node.getBoundingClientRect()).filter(intersects);
            const occupied = [...controls];
            const candidates = labels.map(label=>({label,selected:!!label.closest('.care-mobile-active-marker'),rects:[]}))
                .filter(item=>(item.selected || !compact) && intersects(item.label.parentElement.getBoundingClientRect()));
            // 이름·평가·상세 현황의 실측을 단계별로 묶어 불필요한 반복 레이아웃을 줄입니다.
            for (let step=0;step<=level;step++) {
                candidates.forEach(item=>setLevel(item.label,step,true));
                candidates.forEach(item=>item.rects.push(item.label.getBoundingClientRect()));
            }
            candidates.forEach(item=>item.label.classList.remove(...classes));
            const distance = item => Math.hypot(item.rects[0].left+item.rects[0].width/2-bounds.left-bounds.width/2,item.rects[0].bottom-bounds.top-bounds.height/2);
            candidates.sort((a,b)=>Number(b.selected)-Number(a.selected) || distance(a)-distance(b));
            let remaining = Math.max(1,Math.min(40,Math.floor(bounds.width*bounds.height/18000)));
            for (const item of candidates) {
                if (!item.selected && !remaining) continue;
                const fitted = fitLevel(item.rects,bounds,[...pins,...occupied]);
                if (fitted >= 0) {
                    setLevel(item.label,fitted);
                    occupied.push(item.rects[fitted]);
                    if (!item.selected) remaining--;
                } else if (item.selected) {
                    // 기존 선택 이름은 보존하되 주변 이름이 그 영역을 침범하지 않게 합니다.
                    occupied.push(item.label.getBoundingClientRect());
                }
            }
        }
        const schedule = () => { clearTimeout(timer); timer=setTimeout(layout,100); };
        new MutationObserver(records=>{
            if(records.some(record=>!record.target.closest?.('.marker-name'))) schedule();
        }).observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
        new ResizeObserver(schedule).observe(host);
        root.naver.maps.Event.addListener(map,'idle',schedule);
        schedule();
    }
    root.CareMarkerLabels = {mount,detailLevel,fitLevel};
})(globalThis);
/** SOFTM-MARKER-INSIGHTS END */
