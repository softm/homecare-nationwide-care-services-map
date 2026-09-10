# /** SOFTM-PHOTO-INDEX START 날짜:20260910 : 사진 탐색에서 기관별 JSON 수만 개를 요청하지 않도록 재생성 가능한 요약을 제공 */
"""Build deterministic photo summaries from collected institution photos."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


# /** SOFTM-PHOTO-GZIP START 날짜:20260911 : 실행 운영체제에 따라 gzip 헤더가 달라져 검사와 배포 파일이 반복 변경되지 않도록 중립 헤더로 압축 */
def deterministic_gzip(content):
    output = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as archive:
        archive.write(content)
    return output.getvalue()
# /** SOFTM-PHOTO-GZIP END */


def summaries(root):
    care = json.loads((root / "data/care/manifest.json").read_text())
    cached, outputs, manifest = {}, {}, {}
    for kind, config in care.items():
        rows = json.loads(gzip.decompress((root / "data/care" / config["file"]).read_bytes()))
        result = {}
        if config["source"] == "nhis":
            for row in rows:
                identity = row["i"]
                if identity not in cached:
                    path = root / "data/nhis/photos" / identity[:2] / f"{identity}.json"
                    if not path.exists():
                        cached[identity] = {"count": None, "representative": None}
                    else:
                        data = json.loads(path.read_text())
                        photos = data.get("photos", [])
                        representative = next((p for p in photos if p.get("isRepresentative") is True), photos[0] if photos else None)
                        cached[identity] = {"count": len(photos), "checkedAt": data.get("checkedAt", data.get("collectedAt", "")),
                                            "representative": {k: representative.get(k, "") for k in ("title", "url", "thumbnailUrl", "date")} if representative else None}
                result[identity] = cached[identity]
        content = encode(result)
        filename = f"{kind}.json.gz"
        outputs[filename] = deterministic_gzip(content)
        manifest[kind] = {"file": filename, "revision": hashlib.sha256(content).hexdigest()[:16],
                          "count": len(result), "withPhotos": sum(bool(x["count"]) for x in result.values()), "source": config["source"]}
    outputs["manifest.json"] = encode(manifest) + b"\n"
    return outputs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    target = ROOT / "data/care-photos"
    outputs = summaries(ROOT)
    changed = [name for name, content in outputs.items() if not (target / name).exists() or (target / name).read_bytes() != content]
    if args.check:
        if changed:
            raise SystemExit("사진 인덱스 재생성 필요: " + ", ".join(changed))
    else:
        target.mkdir(parents=True, exist_ok=True)
        for name in changed:
            temporary = target / (name + ".tmp")
            temporary.write_bytes(outputs[name])
            temporary.replace(target / name)
    print(f"사진 인덱스 {'검사' if args.check else '생성'} 완료: {len(outputs) - 1}개 유형 · 변경 {len(changed)}개")


if __name__ == "__main__":
    main()
# /** SOFTM-PHOTO-INDEX END */
