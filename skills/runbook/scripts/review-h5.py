#!/usr/bin/env python3
"""打包当前 H5，调用正式后台同一自动校验 API，并原样保存结果。"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import uuid
import zipfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from domain.security_review import h5_files, h5_source_sha256

API_BASE = 'https://shaper.hupu.com'


def save_json(path: Path, data: dict) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--activity-dir", default="activity")
    parser.add_argument("--api-base", default=API_BASE, help="后台 API 地址；无需绑定应用或提供凭证")
    args = parser.parse_args()
    workspace = Path.cwd()
    adir = Path(args.activity_dir).resolve()
    adir.mkdir(parents=True, exist_ok=True)
    evidence = adir / "security-review-api.json"
    # 失败时旧结论仍保留供排障，但不再作为这次 API 调用成功的证据。
    evidence.unlink(missing_ok=True)
    try:
        api_url = urlsplit(args.api_base)
        if api_url.scheme not in {"http", "https"} or not api_url.hostname or api_url.username is not None or api_url.password is not None or api_url.query or api_url.fragment:
            raise ValueError("请通过 --api-base 指定有效的后台 HTTP(S) 地址，无需登录或 Token")
        source_hash = h5_source_sha256(workspace)
        archive_path = adir / "security-review-source.zip"
        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in h5_files(workspace):
                archive.write(path, path.relative_to(workspace / "h5").as_posix())
        if archive_path.stat().st_size > 50 * 1024 * 1024:
            raise ValueError("ZIP 大小超过 50 MiB")
        content = archive_path.read_bytes()
        archive_hash = hashlib.sha256(content).hexdigest()
        boundary = "shaper-review-" + uuid.uuid4().hex
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="h5.zip"\r\n'
                'Content-Type: application/zip\r\n\r\n').encode() + content + f"\r\n--{boundary}--\r\n".encode()
        request = Request(args.api_base.rstrip("/") + "/api/v1/code-packages/validate", data=body, method="POST",
                          headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        with urlopen(request, timeout=60) as response:
            result = json.load(response)
        if not isinstance(result, dict) or result.get("schemaVersion") != "code_package_validation_v1" or result.get("success") is not True:
            raise ValueError("后台校验返回协议无效")
        data = result.get("data")
        if not isinstance(data, dict) or data.get("schemaVersion") != "security_review_json_v1" or data.get("decision") not in {"passed", "needs_review", "blocked"}:
            raise ValueError("后台校验结果协议无效")
        if result.get("packageSha256") != archive_hash or data.get("package", {}).get("archiveSha256") != archive_hash:
            raise ValueError("后台校验的 ZIP 与本次上传源码不一致")
        if result.get("submissionAllowed") is not (data["decision"] != "blocked"):
            raise ValueError("后台校验放行标识与判定不一致")
        if h5_source_sha256(workspace) != source_hash:
            raise ValueError("审核过程中 H5 已变化，请重新调用校验")
        save_json(adir / "security-review.json", data)
        save_json(evidence, {"sourceSha256": source_hash, "api": result})
        (adir / "security-review-api-error.json").unlink(missing_ok=True)
        print(json.dumps({"decision": data["decision"], "submissionAllowed": result["submissionAllowed"],
                          "summary": data.get("summary"), "requestId": result.get("requestId"),
                          "result": str(adir / "security-review.json")}, ensure_ascii=False))
        return 0 if result["submissionAllowed"] else 2
    except HTTPError as error:
        try:
            payload = json.load(error)
            message = str(payload.get("message") or "后台校验请求失败")
            request_id = payload.get("requestId")
        except (ValueError, OSError, AttributeError):
            message, request_id = "后台校验请求失败", None
        failure = {"status": "unavailable", "httpStatus": error.code, "message": message, "requestId": request_id}
    except (OSError, ValueError, URLError, AttributeError) as error:
        # 只输出调用失败摘要，不输出请求对象或 ZIP 内容。
        failure = {"status": "unavailable", "message": str(error) if isinstance(error, ValueError) else "后台校验不可达或读取失败，请修复连接后重试同一命令"}
    save_json(adir / "security-review-api-error.json", failure)
    print(json.dumps(failure, ensure_ascii=False), file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
