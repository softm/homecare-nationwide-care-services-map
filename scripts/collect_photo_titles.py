#!/usr/bin/env python3
"""기존 사진·수집 상태를 유지하며 잘린 사진 제목만 공단 게시글에서 보완한다."""

# /** SOFTM-PHOTO-FULL-TITLE START 날짜:20260904 : 전체 사진 재수집 없이 제목만 재개·검증 가능한 방식으로 보완 */
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import fcntl
import json
from pathlib import Path
import signal
import threading
import time

import requests
import sync_nhis_static as sync

STOP = threading.Event()
LOCAL = threading.local()


def update_titles(path, backup):
    original = path.read_bytes()
    document = json.loads(original)
    session = getattr(LOCAL, "session", None)
    if session is None:
        session = LOCAL.session = requests.Session()
        session.headers.update({"User-Agent": "NationwideCareStaticCollector/1.0", "Accept-Language": "ko-KR"})
    changed = 0
    failures = []
    for photo in document["photos"]:
        if STOP.is_set() or not sync.needs_photo_title(photo):
            continue
        for attempt in range(3):
            try:
                sync.fill_photo_title(session, photo)
                changed += 1
                break
            except (requests.RequestException, ValueError, KeyError) as error:
                status = getattr(getattr(error, "response", None), "status_code", None)
                if status in {403, 429}:
                    STOP.set()
                if attempt == 2 or STOP.is_set():
                    failures.append({"id": document["id"], "key": photo.get("key"), "error": type(error).__name__, "status": status})
                    break
                STOP.wait(attempt + 1)
    if changed:
        if path.read_bytes() != original:
            return 0, [{"id": document["id"], "error": "다른 작업이 사진 파일을 변경하여 덮어쓰지 않았습니다."}]
        snapshot = backup / path.relative_to(sync.ROOT)
        snapshot.parent.mkdir(parents=True, exist_ok=True)
        if not snapshot.exists():
            snapshot.write_bytes(original)
        sync.write_json(path, document)
    return changed, failures


def run(workers, backup):
    targets = []
    total = 0
    for path in sorted((sync.DATA_ROOT / "photos").glob("*/*.json")):
        count = sum(sync.needs_photo_title(photo) for photo in json.loads(path.read_text())["photos"])
        if count:
            targets.append(path)
            total += count
    state = {"scope": "photo-titles", "startedAt": sync.now_iso(), "institutions": len(targets), "targets": total, "processed": 0, "resolved": 0, "workers": workers, "failures": []}
    checkpoint = sync.DATA_ROOT / "checkpoints" / "photo-titles.json"

    def save(status):
        state.update(status=status, updatedAt=sync.now_iso(), remaining=total - state["resolved"])
        sync.write_json(checkpoint, state)
        print(json.dumps({key: value for key, value in state.items() if key != "failures"}, ensure_ascii=False), flush=True)

    save("running")
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(update_titles, path, backup): path for path in targets}
        last_log = time.monotonic()
        for future in as_completed(futures):
            resolved, failures = future.result()
            state["processed"] += 1
            state["resolved"] += resolved
            state["failures"].extend(failures)
            if time.monotonic() - last_log >= 10:
                save("running")
                last_log = time.monotonic()
    save("stopped" if STOP.is_set() else "partial" if total != state["resolved"] or state["failures"] else "complete")
    return 0 if state["status"] == "complete" else 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, choices=range(1, 4), default=3)
    parser.add_argument("--backup", required=True, type=Path)
    args = parser.parse_args()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: STOP.set())
    with (sync.ROOT / ".git" / "nhis-photos-collection.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.error("다른 사진 수집기가 실행 중입니다.")
        return run(args.workers, args.backup)


if __name__ == "__main__":
    raise SystemExit(main())
# /** SOFTM-PHOTO-FULL-TITLE END */
