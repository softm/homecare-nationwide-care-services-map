# 주야간보호센터 공단 상세 API

국민건강보험공단 장기요양보험의 공개 기관 상세정보를 기관기호와 급여종류로 조회해 지도 팝업용 JSON으로 정리합니다. 기관을 열 때만 조회하고 일정 시간 캐시하며, 사진은 허용된 공단 썸네일 식별자만 중계합니다.

Edit `worker/index.js`. Use the Sites checkpoint when a coherent milestone is ready to inspect or share; the remote builder then runs the checked-in build and validation scripts. Do not run them as a normal pre-checkpoint step.

The build copies only `worker/index.js` and `.openai/hosting.json`. Do not add standalone asset files. Embed any essential raster bytes in `worker/index.js` and serve or reference them as a data URL.

For targeted diagnosis after a remote build failure, the same commands are available in the Sites Linux environment:

```sh
bash scripts/build.sh
node scripts/validate-artifact.mjs
```

The deterministic build produces:

```text
dist/
├── .openai/
│   └── hosting.json
└── server/
    └── index.js
```

`dist/server/index.js` is an ES module with a default export containing `fetch(request, env, ctx)`. Edit `worker/index.js`, not the generated file under `dist/`.
