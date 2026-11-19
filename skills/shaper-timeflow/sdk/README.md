# Shaper Timeflow SDK

本目录是随技能安装包发布的 SDK 产物，版本 `0.0.1`。可以直接从本目录引入，
不需要访问仓库或内部构建目录。嵌入产物的权威说明见
[MANIFEST.json](MANIFEST.json)，完整性校验见 [SHA256SUMS](SHA256SUMS)。

## TypeScript / JavaScript

包名是 `@hupu/shaper-timeflow-protocol-sdk`，支持 Node.js 18+、ESM 与 CommonJS，
运行时依赖为空。

从当前技能目录安装本地包：

```bash
pnpm add file:/path/to/skills/shaper-timeflow/sdk/typescript
```

```ts
import { ProtocolClient, FetchTransport } from "@hupu/shaper-timeflow-protocol-sdk";
```

包根公开入口；不要直接引用 `dist/esm` 或 `dist/cjs` 内部文件。testkit 的公开
子路径是 `@hupu/shaper-timeflow-protocol-sdk/testkit`。

## Java

三套产物都是普通 Maven JAR，Java 包名沿用
`com.hupu.shaper.timeflow.*`，不依赖服务端应用或持久化框架代码。

| 产物 | Maven 坐标 | 文件 |
|---|---|---|
| 协议 SDK | `com.hupu.shaper:shaper-timeflow-protocol-sdk:0.0.1` | `java/shaper-timeflow-protocol-sdk-0.0.1.jar` |
| 规则 SDK | `com.hupu.shaper:shaper-timeflow-rule-sdk:0.0.1` | `rule-sdk/shaper-timeflow-rule-sdk-0.0.1.jar` |
| Testkit | `com.hupu.shaper:shaper-timeflow-testkit:0.0.1` | `testkit/shaper-timeflow-testkit-0.0.1.jar` |

未发布到远端 Maven 仓库前，可先安装到本地仓库：

```bash
mvn install:install-file \
  -Dfile=/path/to/skills/shaper-timeflow/sdk/java/shaper-timeflow-protocol-sdk-0.0.1.jar \
  -DgroupId=com.hupu.shaper \
  -DartifactId=shaper-timeflow-protocol-sdk \
  -Dversion=0.0.1 \
  -Dpackaging=jar
```

其他两个 JAR 使用相同参数，只替换文件名与 artifactId。协议 SDK 的 Jackson
依赖由 Maven 工程正常解析；这里的 JAR 不是 fat JAR。

安装后的 Skill 不包含同步或自检脚本。
