#!/usr/bin/env python3
"""기존 사진정보를 보존하면서 공단 사진 미수집 기관만 재개 가능한 방식으로 수집한다."""

# /** SOFTM-NHIS-MISSING-PHOTOS START 날짜:20260904 : 상세 완료 체크포인트와 기존 사진을 건드리지 않고 사진만 안전하게 채우기 위한 전용 실행기 */
import argparse
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
import fcntl
import json
from pathlib import Path
import signal
import threading
import time

import requests
import sync_nhis_static as sync

DATA = sync.DATA_ROOT
STOP = threading.Event()


def photo_path(institution_id):
    return DATA / "photos" / institution_id[:2] / f"{institution_id}.json"


def valid_photo(document, institution_id):
    return (isinstance(document, dict) and document.get("id") == institution_id
            and isinstance(document.get("photos"), list)
            and document.get("count") == len(document["photos"])
            and bool(document.get("checkedAt")))


def fetch_photo(institution, max_photos):
    code = sync.preferred_service(institution, "")
    if not code:
        return None, "급여종류 코드 없음", False
    for attempt in range(3):
        if STOP.is_set():
            return None, "수집 중지", False
        try:
            document = sync.collect_photos(institution, code, max_photos, "remote")
            if not valid_photo(document, institution["id"]):
                raise ValueError("사진 JSON 규격 불일치")
            STOP.wait(0.4)
            return document, None, False
        except requests.HTTPError as error:
            status = error.response.status_code if error.response is not None else 0
            if status in {403, 429}:
                STOP.set()
                return None, f"공단 사진 페이지 HTTP {status}: 수집 중지", True
            message = f"공단 사진 페이지 HTTP {status}"
        except (requests.RequestException, ValueError) as error:
            message = type(error).__name__
        if attempt < 2:
            STOP.wait(2 ** (attempt + 1))
    return None, message, False


def save_progress(state, failures):
    photo_ids = sorted(path.stem for path in (DATA / "photos").glob("*/*.json"))
    state.update(updatedAt=sync.now_iso(), photoManifestCount=len(photo_ids),
                 remaining=state["catalogCount"] - len(photo_ids))
    sync.write_json(DATA / "checkpoints" / "photos-missing.json", state)
    sync.write_json(DATA / "failures" / "photos.json", {
        "schemaVersion": 1, "generatedAt": state["updatedAt"], "items": list(failures.values())})
    manifest = sync.load_json(DATA / "manifest.json", {})
    manifest.update(photoIds=photo_ids, photoManifestCount=len(photo_ids),
                    updatedAt=state["updatedAt"], photoCollection=state.copy())
    sync.write_json(DATA / "manifest.json", manifest)
    print(json.dumps(state, ensure_ascii=False), flush=True)


def run(workers=3, max_photos=10, limit=0):
    catalog = sync.load_json(DATA / "catalog.json", {})["institutions"]
    missing = [item for item in catalog
               if not valid_photo(sync.load_json(photo_path(item["id"]), {}), item["id"])]
    targets = missing[:limit] if limit else missing
    target_ids = {item["id"] for item in missing}
    failures = {item["id"]: item for item in
                sync.load_json(DATA / "failures" / "photos.json", {}).get("items", [])
                if item["id"] in target_ids}
    state = {"schemaVersion": 1, "scope": ["photos"], "mode": "missing-only",
             "startedAt": sync.now_iso(), "catalogCount": len(catalog),
             "targets": len(targets), "preserved": len(catalog) - len(missing),
             "processed": 0, "success": 0, "failed": 0, "withPhotos": 0,
             "empty": 0, "photoUrls": 0, "workers": workers, "status": "running"}
    save_progress(state, failures)
    iterator = iter(targets)
    rate_limited = False
    with ThreadPoolExecutor(max_workers=workers) as executor:
        pending = {}

        def submit_next():
            item = next(iterator, None)
            if item is not None and not STOP.is_set():
                pending[executor.submit(fetch_photo, item, max_photos)] = item

        for _ in range(workers):
            submit_next()
        while pending:
            done, _ = wait(pending, timeout=1, return_when=FIRST_COMPLETED)
            for future in done:
                item = pending.pop(future)
                document, error, limited = future.result()
                rate_limited |= limited
                if error == "수집 중지":
                    continue
                state["processed"] += 1
                if document is not None:
                    sync.write_json(photo_path(item["id"]), document)
                    failures.pop(item["id"], None)
                    state["success"] += 1
                    state["withPhotos" if document["count"] else "empty"] += 1
                    state["photoUrls"] += document["count"]
                else:
                    state["failed"] += 1
                    failures[item["id"]] = {"id": item["id"], "scope": "photos", "message": error}
                state["lastId"] = item["id"]
                if state["processed"] % 25 == 0:
                    save_progress(state, failures)
                submit_next()
    state["status"] = ("rate-limited" if rate_limited else "stopped" if STOP.is_set()
                       else "partial" if failures or len(targets) < len(missing) else "complete")
    save_progress(state, failures)
    return 0 if state["status"] == "complete" else 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, choices=range(1, 4), default=3)
    parser.add_argument("--max-photos", type=int, choices=range(1, 31), default=10)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    if args.limit < 0:
        parser.error("--limit은 0 이상이어야 합니다.")
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: STOP.set())
    with (sync.ROOT / ".git" / "nhis-photos-collection.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.error("다른 사진 전용 수집기가 이미 실행 중입니다.")
        return run(args.workers, args.max_photos, args.limit)


if __name__ == "__main__":
    raise SystemExit(main())
# /** SOFTM-NHIS-MISSING-PHOTOS END */
