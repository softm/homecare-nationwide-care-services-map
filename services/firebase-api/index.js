/** SOFTM-FIREBASE-ENTRY START 날짜:20261026 : 서울 리전의 공용 함수만 네이버 비밀키에 접근하도록 제한 */
import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";
import {createDirectionsHandler} from "./directions-core.js";

const naverMapsApiSecret = defineSecret("NAVER_MAPS_API_SECRET");

export const directions = onRequest(
  {
    region: "asia-northeast3",
    cors: false,
    secrets: [naverMapsApiSecret],
    timeoutSeconds: 15,
    memory: "256MiB",
    minInstances: 0,
    maxInstances: 3,
    concurrency: 30,
  },
  createDirectionsHandler({getApiSecret: () => naverMapsApiSecret.value()}),
);
/** SOFTM-FIREBASE-ENTRY END */
