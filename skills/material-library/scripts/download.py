#!/usr/bin/env python3
"""Download a materials_download result and produce an archive plus a redacted report."""
import argparse
import json
import re
import tempfile
import urllib.error
import urllib.request
import uuid
import zipfile
from pathlib import Path


def download(payload, output):
    output.mkdir(parents=True, exist_ok=False)
    archive = output / ("materials-" + uuid.uuid4().hex[:8] + ".zip")
    report = []
    names = set()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as bundle:
        for item in payload["items"]:
            name = str(item.get("name", "material"))
            if item.get("status") != "success" or not item.get("url"):
                report.append({"name": name, "status": "failed", "message": item.get("message", "未获取到下载地址")})
                continue
            try:
                if not re.match(r"^https?://", item["url"]):
                    raise ValueError("下载地址协议无效")
                parts = [re.sub(r'[<>:"\\|?*\x00-\x1f]', "_", p).strip(" .") or "material"
                         for p in name.replace("\\", "/").split("/") if p not in ("", ".", "..")]
                safe = "/".join(parts) or "material"
                original = safe
                suffix = 1
                while safe.casefold() in names:
                    path = Path(original)
                    safe = str(path.with_name(path.stem + " (" + str(suffix) + ")" + path.suffix))
                    suffix += 1
                with tempfile.TemporaryFile() as content:
                    size = 0
                    with urllib.request.urlopen(item["url"], timeout=60) as response:
                        if response.status != 200:
                            raise ValueError("下载服务未返回完整文件")
                        expected = response.headers.get("Content-Length")
                        while True:
                            chunk = response.read(1024 * 1024)
                            if not chunk:
                                break
                            size += len(chunk)
                            if size > 200 * 1024 * 1024:
                                raise ValueError("文件超过 200MB，请单独下载")
                            content.write(chunk)
                    if expected is not None and size != int(expected):
                        raise ValueError("下载字节数不完整")
                    if item.get("sizeBytes") is not None and size != item["sizeBytes"]:
                        raise ValueError("文件大小与素材列表不一致，请刷新后重试")
                    content.seek(0)
                    with bundle.open(safe, "w", force_zip64=True) as entry:
                        while chunk := content.read(1024 * 1024):
                            entry.write(chunk)
                names.add(safe.casefold())
                report.append({"name": name, "archiveName": safe, "status": "success", "bytes": size})
            except Exception as error:
                if isinstance(error, urllib.error.HTTPError):
                    error.close()
                # Exception strings may contain signed URLs; never put those in delivery reports.
                message = str(error) if isinstance(error, ValueError) else "文件下载失败，请重新获取地址或检查网络"
                report.append({"name": name, "status": "failed", "message": message})
    result = {"total": len(report), "downloadedCount": sum(i["status"] == "success" for i in report),
              "failureCount": sum(i["status"] == "failed" for i in report), "items": report}
    if result["downloadedCount"]:
        result["archive"] = str(archive.resolve())
    else:
        archive.unlink()
    report_file = output / "download-report.json"
    report_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return {**result, "report": str(report_file.resolve())}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="下载素材真实字节，生成 ZIP 和脱敏结果报告")
    parser.add_argument("payload", help="materials_download 返回结果 JSON 文件")
    parser.add_argument("output", help="本轮新的输出目录（不能已存在）")
    args = parser.parse_args()
    result = download(json.loads(Path(args.payload).read_text(encoding="utf-8")), Path(args.output))
    print(json.dumps(result, ensure_ascii=False))
