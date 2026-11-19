"""前端源码指纹，保证 API 审核结果对应当前 H5 产物。"""
from __future__ import annotations

import hashlib
from pathlib import Path

SKIP_NAMES = {"node_modules", ".git", "__MACOSX", ".DS_Store", "Thumbs.db"}


def h5_files(workspace: Path) -> list[Path]:
    root = workspace / "h5"
    if not (root / "index.html").is_file():
        raise ValueError("缺少 h5/index.html")
    files = []
    for path in sorted(root.rglob("*")):
        if any(part in SKIP_NAMES for part in path.relative_to(root).parts):
            continue
        if path.is_symlink():
            raise ValueError("H5 发布目录中的符号链接请改为实际资源文件")
        if path.is_file():
            files.append(path)
    return files


def h5_source_sha256(workspace: Path) -> str:
    digest = hashlib.sha256()
    for path in h5_files(workspace):
        digest.update(path.relative_to(workspace / "h5").as_posix().encode("utf-8") + b"\0")
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()
