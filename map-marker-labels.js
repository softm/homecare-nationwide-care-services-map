/** SOFTM-MARKER-LABELS START 날짜:20260930 : 실제 화면의 이름표·핀 충돌과 가장자리 잘림을 검사해 읽을 공간이 있는 기관만 이름을 표시 */
(function(root) {
    function mount(host, map) {
        let timer;
        const overlaps = (a,b) => a.left < b.right+6 && a.right+6 > b.left && a.top < b.bottom+6 && a.bottom+6 > b.top;
        function layout() {
            const bounds = host.getBoundingClientRect();
            const labels = [...host.querySelectorAll('.marker-name')];
            labels.forEach(label => label.classList.remove('care-label-visible','care-label-measure'));
            if (map.getZoom() < 15 || host.classList.contains('care-compact-markers') || !bounds.width || !bounds.height) return;
            const inside = rect => rect.width && rect.left >= bounds.left+8 && rect.right <= bounds.right-8 && rect.top >= bounds.top+8 && rect.bottom <= bounds.bottom-8;
            const pins = [...host.querySelectorAll('.map-marker')].map(node=>node.getBoundingClientRect()).filter(inside);
            const occupied = labels.filter(label=>label.closest('.care-mobile-active-marker')).map(label=>label.getBoundingClientRect()).filter(rect=>rect.width);
            const candidates = labels.filter(label=>!label.closest('.care-mobile-active-marker') && inside(label.parentElement.getBoundingClientRect()));
            candidates.forEach(label=>label.classList.add('care-label-measure'));
            const measured = candidates.map(label=>({label,rect:label.getBoundingClientRect()}));
            measured.sort((a,b)=>Math.hypot(a.rect.x-bounds.x-bounds.width/2,a.rect.y-bounds.y-bounds.height/2)-Math.hypot(b.rect.x-bounds.x-bounds.width/2,b.rect.y-bounds.y-bounds.height/2));
            let remaining = Math.max(1,Math.min(40,Math.floor(bounds.width*bounds.height/18000)));
            for (const {label,rect} of measured) {
                label.classList.remove('care-label-measure');
                if (!remaining || !inside(rect) || [...pins,...occupied].some(other=>overlaps(rect,other))) continue;
                label.classList.add('care-label-visible'); occupied.push(rect); remaining--;
            }
        }
        const schedule = () => { clearTimeout(timer); timer=setTimeout(layout,100); };
        new MutationObserver(records=>{
            if(records.some(record=>!record.target.classList?.contains('marker-name'))) schedule();
        }).observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
        new ResizeObserver(schedule).observe(host);
        root.naver.maps.Event.addListener(map,'idle',schedule);
        schedule();
    }
    root.CareMarkerLabels = {mount};
})(window);
/** SOFTM-MARKER-LABELS END */
