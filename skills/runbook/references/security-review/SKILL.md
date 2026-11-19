---
name: code-package-security-review
description: 调用后台 ZIP 自动校验 API，使用正式上传相同的自动审核逻辑提前检查 H5 发布产物，原样保存结果并继续交付。用于 runbook 发布前预检；不在技能中维护另一套安全判定。
---

# 后台 ZIP 自动审核

当前后台正式上传完成后同步调用 `validateSourcePackage()`。本技能通过独立预检接口调用同一个函数，不修改草稿、提审或发布状态。

## 固定执行入口

在包含 h5/ 的技能工作区运行：

```bash
python3 skills/runbook/scripts/review-h5.py
```

脚本将当前 h5/（包括 CSS/JS/图片等静态依赖）打为 ZIP，匿名调用后台，无需绑定应用、登录或 Token；不上传 game/、credentials.json 或服务端密钥。依赖标准 Python，无需安装审查 SDK。下载技能包已配置后台地址；其他工作区可通过 `--api-base <后台地址>` 指定。

- `activity/security-review.json`：后台 `security_review_json_v1` 的 data 原样结果。
- `activity/security-review-api.json`：API 响应及当前源码指纹，用于门禁校对。
- `activity/security-review-source.zip`：本次审核的原始 ZIP，与后台 SHA-256 一致。
- 调用失败：写 `activity/security-review-api-error.json`，退出码 1；没有新的有效审核证据。
- 有阻断项：保存后台结果，退出码 2。
- 可继续提交：退出码 0。

## API

`POST /api/v1/code-packages/validate`，公开匿名接口，无需 Cookie、Authorization 或 `X-Shaper-Token`，不检查账号权限。两种输入：

1. 本地 ZIP：multipart，字段 `file`，文件名以 .zip 结尾。
2. 已有远程 ZIP：JSON `{ "sourceUrl": "https://.../h5.zip", "sha256": "<可选的原始 ZIP SHA-256>" }`。后台仅下载允许的 HTTPS 产物域名，不跟随重定向；其他来源可直接上传文件。服务端通过 CODE_PACKAGE_VALIDATION_REMOTE_HOSTS 配置精确产物域名。

返回 `code_package_validation_v1`：success、validatorVersion、requestId、packageSha256、submissionAllowed、data。HTTP 200 表示校验已执行，是否继续以 submissionAllowed 为准。

## 判定交接

- `blocked` / submissionAllowed=false：依据后台 findings 的文件、行号、原因整改，回 implement，再调用同一 API。
- `passed`：确认本阶段并继续。
- `needs_review` / submissionAllowed=true：与后台上传规则一致，可继续提交人工审核；保留原判定及复核项，不改成 passed，不宣称人工审核已通过。
- HTTP 错误、下载失败、超时：这是调用失败；修复调用条件后重试。不能改写成代码 blocked，也不能通过本地模型判断或 scanner 输出绕过 API。

Room 的 Colyseus/WebSocket、域名、HTTP SDK 等均由同一后台校验规则判定。技能不另行要求开发者申请“实时传输例外”。若后台明确拒绝，按真实 findings 修复或由平台调整后台规则；技能不能自行放行。

源码变更后重新审核；门禁对比当前 H5 指纹、审核 ZIP SHA-256 与 API 原始结果。旧包缺少调用脚本时重新下载或同步新版技能。

此接口覆盖正式上传的自动代码校验；正式上传仍会重跑，源包结构、预览构建与人工发布审核仍走原有后台流程。单次预检成功不表示已发布或多人验收完成。
