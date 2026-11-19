#!/usr/bin/env python3
"""Create a real file manifest or stream exactly one approved material upload ticket."""
import argparse
import hashlib
import http.client
import json
import mimetypes
import shutil
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlsplit


def manifest(paths, mode):
    files, local = [], []
    for raw in paths:
        path = Path(raw).resolve(strict=True)
        if not path.is_file():
            raise ValueError("请传入文件路径，动画目录先展开成文件清单")
        digest = hashlib.sha256()
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
        local.append(str(path))
        files.append({"name": path.name, "size": path.stat().st_size, "sha256": digest.hexdigest(),
                      "mime": mimetypes.guess_type(path.name)[0] or "application/octet-stream"})
    if mode == "spine":
        import os
        root = Path(os.path.commonpath([str(Path(p).parent) for p in local]))
        for item, path in zip(files, local):
            item["name"] = root.name + "/" + Path(path).relative_to(root).as_posix()
    return {"mode": mode, "files": files, "localPaths": local}


def send(manifest_data, ticket):
    if ticket.get("status") != "pending" or not ticket.get("acceptedFiles"):
        raise ValueError("仅发送 pending 且有 acceptedFiles 的上传票据")
    url = urlsplit(ticket["uploadUrl"])
    if url.scheme not in ("http", "https") or url.username or url.password:
        raise ValueError("上传地址无效")
    boundary = "material-" + uuid.uuid4().hex
    field = ticket["multipartField"]
    if field not in ("file", "files"):
        raise ValueError("上传字段无效")
    with tempfile.TemporaryFile() as form:
        for item in ticket["acceptedFiles"]:
            index = item["index"]
            expected = manifest_data["files"][index]
            if any(item[key] != expected[key] for key in ("name", "size", "sha256")):
                raise ValueError("票据与本地清单不一致")
            name = item["name"].replace("\\", "\\\\").replace('"', '\\"')
            mime = item.get("mime") or "application/octet-stream"
            if any(c in name + mime for c in "\r\n\x00"):
                raise ValueError("文件名或 MIME 无效")
            form.write((f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{name}"\r\n'
                        f'Content-Type: {mime}\r\n\r\n').encode("utf-8"))
            with Path(manifest_data["localPaths"][index]).open("rb") as source:
                shutil.copyfileobj(source, form)
            form.write(b"\r\n")
        form.write(f"--{boundary}--\r\n".encode())
        length = form.tell()
        form.seek(0)
        connection_type = http.client.HTTPSConnection if url.scheme == "https" else http.client.HTTPConnection
        connection = connection_type(url.hostname, url.port, timeout=240)
        try:
            connection.request("POST", url.path + ("?" + url.query if url.query else ""), body=form,
                               headers={"Content-Type": "multipart/form-data; boundary=" + boundary,
                                        "Content-Length": str(length)})
            response = connection.getresponse()
            data = response.read()
            # Do not follow redirects or repeat a mutation after transport failure.
            if not 200 <= response.status < 300:
                return {"status": "unknown", "message": "上传响应异常，请用 materials_upload_status 查询，不要重复上传"}
            return json.loads(data)
        except (OSError, ValueError, http.client.HTTPException):
            return {"status": "unknown", "message": "上传结果未确认，请用 materials_upload_status 查询，不要重复上传"}
        finally:
            connection.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("manifest")
    prepare.add_argument("--mode", choices=["files", "spine", "spine-zip"], default="files")
    prepare.add_argument("paths", nargs="+")
    upload = commands.add_parser("send")
    upload.add_argument("manifest")
    upload.add_argument("ticket")
    args = parser.parse_args()
    if args.command == "manifest":
        result = manifest(args.paths, args.mode)
    else:
        result = send(json.loads(Path(args.manifest).read_text(encoding="utf-8")),
                      json.loads(Path(args.ticket).read_text(encoding="utf-8")))
    print(json.dumps(result, ensure_ascii=False))
